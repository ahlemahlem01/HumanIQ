import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { BadRequestException, ForbiddenException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { resolveTxt } from "dns/promises";
import { companyIdOf } from "./company-scope";

const AVATAR_DIR = join(process.cwd(), "uploads", "avatars");
const LOGO_DIR = join(process.cwd(), "uploads", "logos");
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

@Injectable()
export class RecruitersService {
  /** Identity, domain and members are managed by the owner of the company only. */
  private async assertOwner(recruiterId: string) {
    const row = await this.prisma.recruiterProfile.findUnique({ where: { id: recruiterId }, select: { memberRole: true } });
    if (row?.memberRole !== "OWNER") throw new ForbiddenException("Réservé au responsable de l'entreprise.");
  }

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(AuthService) private auth: AuthService,
  ) {}

  async team(recruiterId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const mine = await this.prisma.recruiterProfile.findUnique({ where: { id: recruiterId }, select: { memberRole: true } });
    const [company, members] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, seats: true } }),
      this.prisma.recruiterProfile.findMany({
        where: { companyId, memberStatus: "ACTIVE" },
        orderBy: { user: { createdAt: "asc" } },
        select: {
          id: true,
          memberRole: true,
          title: true,
          avatarImage: true,
          user: { select: { firstName: true, lastName: true, email: true, passwordResetTokenHash: true } },
        },
      }),
    ]);
    return {
      company: { name: company?.name ?? "", seats: company?.seats ?? 0 },
      isOwner: mine?.memberRole === "OWNER",
      members: members.map((member) => ({
        id: member.id,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        email: member.user.email,
        title: member.title,
        role: member.memberRole,
        avatarImage: member.avatarImage,
        me: member.id === recruiterId,
        // A pending invitation still holds a reset token that has not been used yet.
        pending: Boolean(member.user.passwordResetTokenHash),
      })),
    };
  }

  async invite(
    recruiterId: string,
    inviterUserId: string,
    input: { email?: string; firstName?: string; lastName?: string; title?: string },
  ) {
    await this.assertOwner(recruiterId);
    const email = String(input.email ?? "").trim().toLowerCase();
    const firstName = String(input.firstName ?? "").trim();
    const lastName = String(input.lastName ?? "").trim();
    const title = String(input.title ?? "").trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("Adresse e-mail invalide.");
    if (!firstName || !lastName) throw new BadRequestException("Prénom et nom requis.");

    const companyId = await companyIdOf(this.prisma, recruiterId);
    const [company, count, inviter] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, seats: true } }),
      this.prisma.recruiterProfile.count({ where: { companyId } }),
      this.prisma.user.findUnique({ where: { id: inviterUserId }, select: { firstName: true, lastName: true } }),
    ]);
    if (count >= company.seats) {
      throw new BadRequestException(`Tous les sièges sont utilisés (${count} sur ${company.seats}).`);
    }
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException("Un compte existe déjà avec cette adresse.");
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        role: "RECRUITER",
        // Nobody knows this password: the teammate sets their own from the invitation link.
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
        recruiter: { create: { companyId, title: title || null } },
      },
      select: { id: true, email: true, firstName: true, lastName: true, recruiter: { select: { id: true, title: true } } },
    });
    await this.prisma.auditLog.create({
      data: { actorId: inviterUserId, action: "TEAM_INVITE", entity: "User", entityId: user.id },
    });

    const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}` : "Un collègue";
    const delivery = await this.auth.sendTeamInvite(user, company.name, inviterName);
    return {
      member: {
        id: user.recruiter?.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        title: user.recruiter?.title ?? null,
        avatarImage: null,
        me: false,
        pending: true,
      },
      ...delivery,
    };
  }


  async getMe(recruiterId: string) {
    const row = await this.prisma.recruiterProfile.findUnique({
      where: { id: recruiterId },
      select: profileSelect,
    });
    if (!row) throw new NotFoundException("Profil introuvable.");
    return row;
  }

  /**
   * Any member of the team can edit the company card. Renaming a verified company puts it back "en attente":
   * otherwise a verified company could be renamed after a well-known brand to impersonate it.
   */
  async updateCompany(recruiterId: string, data: { name?: string; description?: string; website?: string }) {
    await this.assertOwner(recruiterId);
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const current = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, website: true, verifiedAt: true, domain: true, domainVerifiedAt: true } });

    let website: string | null | undefined = clean(data.website);
    if (website) {
      const withScheme = /^https?:\/\//i.test(website) ? website : `https://${website}`;
      try {
        const url = new URL(withScheme);
        if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) throw new Error("invalid");
        website = url.toString();
      } catch {
        throw new BadRequestException("Adresse du site invalide (exemple : https://www.exemple.com).");
      }
    }

    const name = data.name === undefined ? undefined : data.name.trim();
    if (name !== undefined && name.length < 2) throw new BadRequestException("Le nom de l'entreprise est trop court.");
    const renamed = name !== undefined && name !== current.name;
    const rewebbed = website !== undefined && (website ?? null) !== (current.website ?? null);
    // A company whose domain is proven by DNS keeps its validation when only the logo or a website on that
    // domain changes. A new name always goes back to review: nothing can prove a name is not someone else's.
    const hostOnDomain = (value: string | null | undefined) => {
      if (!value || !current.domain) return false;
      try {
        const host = new URL(value).hostname.replace(/^www\./, "");
        return host === current.domain || host.endsWith(`.${current.domain}`);
      } catch {
        return false;
      }
    };
    const identityChanged = renamed || (rewebbed && !(current.domainVerifiedAt && hostOnDomain(website)));

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(name !== undefined ? { name } : {}),
        description: clean(data.description),
        website,
        ...(identityChanged ? { verifiedAt: null } : {}),
      },
    });
    if (identityChanged) await this.recordIdentityChange(recruiterId, companyId, renamed ? "name" : "website", Boolean(current.verifiedAt));
    return this.getMe(recruiterId);
  }

  /** The real file type is checked from the first bytes: the media type sent by the browser is not trusted. */
  private imageKind(buffer: Buffer): ".jpg" | ".png" | ".webp" | null {
    if (buffer.length > 12 && buffer[0] === 0xff && buffer[1] === 0xd8) return ".jpg";
    if (buffer.length > 12 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
    if (buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return ".webp";
    return null;
  }

  async setCompanyLogo(recruiterId: string, file?: { buffer: Buffer; size: number }) {
    await this.assertOwner(recruiterId);
    const ext = file?.buffer?.length ? this.imageKind(file.buffer) : null;
    if (!file || !ext) throw new BadRequestException("Choisissez une image JPG, PNG ou WebP.");
    if (file.size > 2 * 1024 * 1024) throw new BadRequestException("Le logo doit faire moins de 2 Mo.");
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const current = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { logoUrl: true } });
    await mkdir(LOGO_DIR, { recursive: true });
    // A new name each time, so browsers do not keep showing the previous logo.
    const name = `${companyId}-${Date.now().toString(36)}${ext}`;
    await writeFile(join(LOGO_DIR, name), file.buffer);
    const state = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { verifiedAt: true, domainVerifiedAt: true } });
    const wasVerified = Boolean(state.verifiedAt);
    const wasProven = Boolean(state.domainVerifiedAt);
    await this.prisma.company.update({ where: { id: companyId }, data: { logoUrl: `/uploads/logos/${name}`, ...(wasProven ? {} : { verifiedAt: null }) } });
    await this.recordIdentityChange(recruiterId, companyId, "logo", wasVerified);
    await this.dropLogoFile(current.logoUrl);
    return this.getMe(recruiterId);
  }

  async removeCompanyLogo(recruiterId: string) {
    await this.assertOwner(recruiterId);
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const current = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { logoUrl: true } });
    await this.prisma.company.update({ where: { id: companyId }, data: { logoUrl: null } });
    await this.dropLogoFile(current.logoUrl);
    return this.getMe(recruiterId);
  }

  /** Join requests: people from the company's e-mail domain waiting for the owner's decision. */
  async joinRequests(recruiterId: string) {
    await this.assertOwner(recruiterId);
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const rows = await this.prisma.recruiterProfile.findMany({
      where: { companyId, memberStatus: "PENDING" },
      orderBy: { user: { createdAt: "asc" } },
      select: { id: true, user: { select: { firstName: true, lastName: true, email: true, createdAt: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: `${row.user.firstName} ${row.user.lastName}`,
      email: row.user.email,
      requestedAt: row.user.createdAt,
    }));
  }

  async decideJoin(recruiterId: string, memberId: string, accept: boolean) {
    await this.assertOwner(recruiterId);
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const member = await this.prisma.recruiterProfile.findFirst({
      where: { id: memberId, companyId, memberStatus: "PENDING" },
      select: { id: true, userId: true },
    });
    if (!member) throw new NotFoundException("Demande introuvable.");
    if (accept) {
      const [company, count] = await Promise.all([
        this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { seats: true } }),
        this.prisma.recruiterProfile.count({ where: { companyId, memberStatus: "ACTIVE" } }),
      ]);
      if (count >= company.seats) throw new BadRequestException(`Tous les sièges sont utilisés (${count} sur ${company.seats}).`);
      await this.prisma.recruiterProfile.update({ where: { id: member.id }, data: { memberStatus: "ACTIVE" } });
    } else {
      // Refused: the account is removed (it never had access to anything).
      await this.prisma.user.delete({ where: { id: member.userId } });
    }
    const recruiter = await this.prisma.recruiterProfile.findUnique({ where: { id: recruiterId }, select: { userId: true } });
    await this.prisma.auditLog.create({
      data: { actorId: recruiter?.userId, action: accept ? "JOIN_ACCEPTED" : "JOIN_REFUSED", entity: "RecruiterProfile", entityId: memberId },
    });
    return { ok: true };
  }

  /** Domain ownership: the owner publishes a secret in DNS; we read it and validate the company automatically. */
  async companyVerification(recruiterId: string) {
    await this.assertOwner(recruiterId);
    const companyId = await companyIdOf(this.prisma, recruiterId);
    return this.verificationState(companyId);
  }

  private async verificationState(companyId: string) {
    let company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { domain: true, domainToken: true, domainVerifiedAt: true, verifiedAt: true },
    });
    // A company created at sign-up already has its domain: its secret is created the first time it is needed.
    if (company.domain && !company.domainToken) {
      const domainToken = `humaniq-${randomBytes(18).toString("hex")}`;
      await this.prisma.company.update({ where: { id: companyId }, data: { domainToken } });
      company = { ...company, domainToken };
    }
    return {
      domain: company.domain,
      domainVerifiedAt: company.domainVerifiedAt,
      verifiedAt: company.verifiedAt,
      record: company.domain && company.domainToken ? { type: "TXT", host: `_humaniq-verify.${company.domain}`, value: company.domainToken } : null,
    };
  }

  async setCompanyDomain(recruiterId: string, input: string) {
    await this.assertOwner(recruiterId);
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const domain = String(input ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) throw new BadRequestException("Nom de domaine invalide (exemple : exemple.com).");
    if (FREE_MAIL.has(domain)) throw new BadRequestException("Utilisez le domaine de votre entreprise, pas celui d'une messagerie gratuite.");
    const taken = await this.prisma.company.findFirst({ where: { domain, id: { not: companyId } }, select: { id: true } });
    if (taken) throw new ConflictException("Ce domaine appartient déjà à une autre entreprise. Demandez l'accès à son responsable.");
    await this.prisma.company.update({
      where: { id: companyId },
      data: { domain, domainToken: `humaniq-${randomBytes(18).toString("hex")}`, domainVerifiedAt: null },
    });
    return this.verificationState(companyId);
  }

  async checkCompanyDomain(recruiterId: string) {
    await this.assertOwner(recruiterId);
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { domain: true, domainToken: true } });
    if (!company.domain || !company.domainToken) throw new BadRequestException("Indiquez d'abord le domaine de l'entreprise.");
    let values: string[] = [];
    try {
      values = (await resolveTxt(`_humaniq-verify.${company.domain}`)).map((chunks) => chunks.join(""));
    } catch {
      // not published (yet) or DNS error: reported below
    }
    if (!values.includes(company.domainToken)) {
      throw new BadRequestException("Enregistrement introuvable. Vérifiez la valeur saisie ; la propagation DNS peut prendre quelques minutes.");
    }
    const now = new Date();
    await this.prisma.company.update({ where: { id: companyId }, data: { domainVerifiedAt: now, verifiedAt: now } });
    const recruiter = await this.prisma.recruiterProfile.findUnique({ where: { id: recruiterId }, select: { userId: true } });
    await this.prisma.auditLog.create({ data: { actorId: recruiter?.userId, action: "COMPANY_DOMAIN_VERIFIED", entity: "Company", entityId: companyId } });
    return this.verificationState(companyId);
  }

  /** Name, website and logo are what makes a company look legitimate: changing them requires a new validation. */
  private async recordIdentityChange(recruiterId: string, companyId: string, field: "name" | "website" | "logo", wasVerified: boolean) {
    const recruiter = await this.prisma.recruiterProfile.findUnique({ where: { id: recruiterId }, select: { userId: true } });
    await this.prisma.auditLog.create({
      data: {
        actorId: recruiter?.userId,
        action: "COMPANY_IDENTITY_CHANGED",
        entity: "Company",
        entityId: companyId,
        metadata: { field, wasVerified },
      },
    });
  }

  private async dropLogoFile(logoUrl: string | null) {
    const name = logoUrl?.startsWith("/uploads/logos/") ? logoUrl.slice("/uploads/logos/".length) : null;
    if (name && /^[\w.-]+$/.test(name)) await unlink(join(LOGO_DIR, name)).catch(() => undefined);
  }

  async updateMe(
    recruiterId: string,
    data: { title?: string; bio?: string; location?: string; phone?: string },
  ) {
    await this.getMe(recruiterId);
    await this.prisma.recruiterProfile.update({
      where: { id: recruiterId },
      data: {
        title: clean(data.title),
        bio: clean(data.bio),
        location: clean(data.location),
        phone: clean(data.phone),
      },
    });
    return this.getMe(recruiterId);
  }

  async setAvatar(recruiterId: string, file?: { buffer: Buffer; mimetype: string; size: number }) {
    const ext = file ? IMAGE_TYPES[file.mimetype] : undefined;
    if (!file?.buffer?.length || !ext) {
      throw new BadRequestException("Choisissez une image JPG, PNG ou WebP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("L'image doit faire moins de 5 Mo.");
    }
    const current = await this.prisma.recruiterProfile.findUnique({
      where: { id: recruiterId },
      select: { avatarImage: true },
    });
    if (!current) throw new NotFoundException("Profil introuvable.");
    await mkdir(AVATAR_DIR, { recursive: true });
    const name = `${recruiterId}${ext}`;
    await writeFile(join(AVATAR_DIR, name), file.buffer);
    if (current.avatarImage && current.avatarImage !== name) {
      await unlink(join(AVATAR_DIR, current.avatarImage)).catch(() => undefined);
    }
    return this.prisma.recruiterProfile.update({
      where: { id: recruiterId },
      data: { avatarImage: name },
      select: { avatarImage: true },
    });
  }
}

const profileSelect = {
  id: true,
  title: true,
  bio: true,
  location: true,
  phone: true,
  avatarImage: true,
  memberRole: true,
  memberStatus: true,
  company: { select: { name: true, description: true, website: true, logoUrl: true, verifiedAt: true, domain: true, domainVerifiedAt: true } },
  user: { select: { firstName: true, lastName: true, email: true } },
  jobs: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      title: true,
      status: true,
      location: true,
      contractType: true,
      remote: true,
      _count: { select: { applications: true } },
    },
  },
};

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr", "msn.com",
  "yahoo.com", "yahoo.fr", "ymail.com", "icloud.com", "me.com", "aol.com", "gmx.com", "gmx.fr", "mail.com", "proton.me",
  "protonmail.com", "orange.fr", "free.fr", "laposte.net", "wanadoo.fr", "sfr.fr", "yandex.com", "zoho.com",
]);

function clean(value: string | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
