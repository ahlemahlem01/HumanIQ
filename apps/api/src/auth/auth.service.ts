import { BadRequestException, ConflictException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { exposeFallbackLinks } from "../config/security";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto, RegisterDto } from "./dto";
import { MailService } from "./mail.service";

const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(MailService) private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new ConflictException("Un compte existe déjà avec cet e-mail.");
    if (dto.role === Role.RECRUITER && !dto.companyName) {
      throw new ConflictException("Le nom de l'entreprise est requis pour un recruteur.");
    }

    if (dto.role === Role.RECRUITER && !allowsFreeMailRecruiters() && isFreeMailDomain(dto.email)) {
      throw new BadRequestException("Utilisez votre adresse e-mail professionnelle (les adresses gratuites type Gmail ou Hotmail ne sont pas acceptées pour un compte recruteur).");
    }

    // The e-mail domain identifies the company. A second person from the same domain does not create a duplicate
    // company: they ask to join it, and its owner decides.
    const domain = dto.role === Role.RECRUITER ? companyDomainOf(dto.email) : null;
    const existingCompany = domain ? await this.prisma.company.findUnique({ where: { domain }, select: { id: true } }) : null;

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        gdprConsentAt: dto.gdprConsent ? new Date() : null,
        candidate:
          dto.role === Role.CANDIDATE
            ? { create: { anonymousVisible: true } }
            : undefined,
        recruiter:
          dto.role === Role.RECRUITER
            ? existingCompany
              ? { create: { title: "Recruteur", memberRole: "MEMBER", memberStatus: "PENDING", company: { connect: { id: existingCompany.id } } } }
              : {
                  create: {
                    title: "Recruteur",
                    memberRole: "OWNER",
                    company: {
                      create: {
                        name: dto.companyName!,
                        slug: slugify(dto.companyName!),
                        plan: "STARTER",
                        subscriptionStatus: "trialing",
                        domain: domain ?? undefined,
                      },
                    },
                  },
                }
            : undefined,
      },
      include: { candidate: true, recruiter: { include: { company: true } } },
    });

    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: "REGISTER", entity: "User", entityId: user.id },
    });

    const verification = await this.issueVerification(user.id, user.email, user.firstName);
    return { verificationRequired: true as const, email: user.email, ...verification };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyTokenHash: hashToken(token),
        emailVerifyExpiresAt: { gt: new Date() },
        anonymizedAt: null,
      },
      include: { candidate: true, recruiter: { include: { company: true } } },
    });
    if (!user) throw new BadRequestException("Lien expiré ou invalide. Demandez un nouvel e-mail.");
    const confirmed = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyExpiresAt: null,
      },
      include: { candidate: true, recruiter: { include: { company: true } } },
    });
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: "EMAIL_VERIFIED", entity: "User", entityId: user.id },
    });
    return this.issue(confirmed);
  }

  async resendVerification(email: string) {
    const message = "Si un compte non confirmé correspond à cet e-mail, un nouveau lien vient d'être envoyé.";
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.anonymizedAt || user.emailVerifiedAt || !user.emailVerifyTokenHash) {
      return { message, delivered: true };
    }
    const verification = await this.issueVerification(user.id, user.email, user.firstName);
    // A failed send in production answers like a success: the response must not tell strangers which addresses exist.
    if (!exposeFallbackLinks()) return { message, delivered: true };
    return { message, ...verification };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { candidate: true, recruiter: { include: { company: true } } },
    });
    if (!user || user.anonymizedAt) throw new UnauthorizedException("Identifiants invalides.");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Identifiants invalides.");
    if (user.emailVerifyTokenHash && !user.emailVerifiedAt) {
      throw new UnauthorizedException("Confirmez votre adresse e-mail avant de vous connecter.");
    }
    return this.issue(user);
  }

  private async issueVerification(userId: string, email: string, firstName: string) {
    const token = randomBytes(32).toString("hex");
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyTokenHash: hashToken(token),
        emailVerifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
    const verifyUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3100"}/verifier?token=${token}`;
    try {
      await this.mail.sendEmailVerification(email, firstName, verifyUrl);
      return { delivered: true };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "envoi impossible";
      this.logger.error(`Verification e-mail failed: ${detail}`);
      // Never expose the link in production: it would let anyone confirm an address that is not theirs.
      if (!exposeFallbackLinks()) return { delivered: false, detail: "L'e-mail de confirmation n'a pas pu être envoyé. Réessayez dans quelques minutes." };
      return { delivered: false, verifyPath: `/verifier?token=${token}`, detail };
    }
  }

  /** Sends a teammate a link to choose their own password (reuses the reset-token flow). */
  async sendTeamInvite(user: { id: string; email: string; firstName: string }, companyName: string, inviterName: string) {
    const token = randomBytes(32).toString("hex");
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    const resetPath = `/reinitialiser?token=${token}`;
    try {
      await this.mail.sendTeamInvite(
        user.email,
        user.firstName,
        companyName,
        inviterName,
        `${process.env.FRONTEND_URL ?? "http://localhost:3100"}${resetPath}`,
      );
      return { delivered: true as const };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "envoi impossible";
      if (!exposeFallbackLinks()) return { delivered: false as const, detail: "L'invitation n'a pas pu être envoyée par e-mail. Réessayez dans quelques minutes." };
      return { delivered: false as const, resetPath, detail };
    }
  }

  async forgotPassword(email: string) {
    const message = "Si un compte correspond à cet e-mail, un message vient d'être envoyé. Il est valable 30 minutes.";
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Same answer whether or not the address has an account, so this endpoint cannot be used to look addresses up.
    if (!user || user.anonymizedAt) return { message, delivered: true };

    const token = randomBytes(32).toString("hex");
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    const resetUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3100"}/reinitialiser?token=${token}`;
    try {
      await this.mail.sendPasswordReset(user.email, resetUrl);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "envoi impossible";
      // Production answers exactly like the normal case (no hint, no link): otherwise this endpoint would reveal
      // which addresses have an account, and hand the reset link to whoever asked.
      this.logger.error(`Password reset e-mail failed: ${detail}`);
      if (!exposeFallbackLinks()) return { message, delivered: true };
      return {
        message: `L'e-mail n'a pas pu partir : ${detail}`,
        delivered: false,
        resetPath: `/reinitialiser?token=${token}`,
      };
    }
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: "PASSWORD_RESET_REQUEST", entity: "User", entityId: user.id },
    });
    return { message, delivered: true };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: { gt: new Date() },
        anonymizedAt: null,
      },
    });
    if (!user) throw new BadRequestException("Lien expiré ou invalide. Demandez-en un nouveau.");

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: "PASSWORD_RESET", entity: "User", entityId: user.id },
    });
    return { ok: true };
  }

  serialize(user: {
    id: string;
    email: string;
    role: Role;
    firstName: string;
    lastName: string;
    gdprConsentAt: Date | null;
    candidate: unknown;
    recruiter: unknown;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      gdprConsentAt: user.gdprConsentAt,
      candidate: user.candidate,
      recruiter: user.recruiter,
    };
  }

  private issue(user: Parameters<AuthService["serialize"]>[0]) {
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, user: this.serialize(user) };
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr", "msn.com",
  "yahoo.com", "yahoo.fr", "ymail.com", "icloud.com", "me.com", "aol.com", "gmx.com", "gmx.fr", "mail.com", "proton.me",
  "protonmail.com", "orange.fr", "free.fr", "laposte.net", "wanadoo.fr", "sfr.fr", "yandex.com", "zoho.com",
]);

/** "marie@acme.com" -> "acme.com". Null for free-mail domains: they identify nobody. */
function companyDomainOf(email: string) {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return domain && !FREE_MAIL_DOMAINS.has(domain) ? domain : null;
}

function isFreeMailDomain(email: string) {
  return FREE_MAIL_DOMAINS.has(email.toLowerCase().split("@")[1] ?? "");
}

/** Development escape hatch (ALLOW_FREE_EMAIL_RECRUITERS=true) so tests can use personal mailboxes. Never set in production. */
function allowsFreeMailRecruiters() {
  return process.env.ALLOW_FREE_EMAIL_RECRUITERS === "true" && process.env.NODE_ENV !== "production";
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 6)
  );
}
