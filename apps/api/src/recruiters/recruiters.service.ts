import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { companyIdOf } from "./company-scope";

const AVATAR_DIR = join(process.cwd(), "uploads", "avatars");
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

@Injectable()
export class RecruitersService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(AuthService) private auth: AuthService,
  ) {}

  async team(recruiterId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const [company, members] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, seats: true } }),
      this.prisma.recruiterProfile.findMany({
        where: { companyId },
        orderBy: { user: { createdAt: "asc" } },
        select: {
          id: true,
          title: true,
          avatarImage: true,
          user: { select: { firstName: true, lastName: true, email: true, passwordResetTokenHash: true } },
        },
      }),
    ]);
    return {
      company: { name: company?.name ?? "", seats: company?.seats ?? 0 },
      members: members.map((member) => ({
        id: member.id,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        email: member.user.email,
        title: member.title,
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
  company: { select: { name: true, description: true, website: true, verifiedAt: true } },
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

function clean(value: string | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
