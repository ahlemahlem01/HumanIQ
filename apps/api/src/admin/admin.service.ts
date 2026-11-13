import { deleteCvFile } from "../candidates/cv-storage";
import { Inject, Injectable } from "@nestjs/common";
import { JobStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async overview() {
    const [users, jobs, applications, companies] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.job.count(),
      this.prisma.application.count(),
      this.prisma.company.findMany({
        select: { id: true, name: true, plan: true, subscriptionStatus: true, seats: true },
      }),
    ]);
    const byRole = await this.prisma.user.groupBy({ by: ["role"], _count: true });
    return { users, jobs, applications, companies, byRole };
  }

  jobs() {
    return this.prisma.job.findMany({
      include: { company: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  moderate(jobId: string, status: JobStatus, note?: string) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status, moderationNote: note },
    });
  }

  async gdprExport(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        candidate: { include: { applications: true, skillGaps: true } },
        recruiter: { include: { company: true, jobs: true } },
      },
    });
  }

  async gdprAnonymize(userId: string) {
    const stamp = Date.now();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { candidate: true },
    });
    if (!user) return null;
    if (user.candidate) await deleteCvFile(user.candidate.id).catch(() => undefined);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        email: `anonymized-${stamp}@deleted.local`,
        firstName: "Anonyme",
        lastName: "RGPD",
        anonymizedAt: new Date(),
        passwordHash: "revoked",
        candidate: user.candidate
          ? {
              update: {
                cvText: null,
                bio: null,
                reverseRecruiting: false,
                headline: "Profil anonymisé",
              },
            }
          : undefined,
      },
    });
  }

  async companies() {
    const rows = await this.prisma.company.findMany({
      orderBy: [{ verifiedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      include: {
        recruiters: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        _count: { select: { jobs: true } },
      },
    });
    return rows.map((company) => ({
      id: company.id,
      name: company.name,
      website: company.website,
      logoUrl: company.logoUrl,
      domain: company.domain,
      domainVerifiedAt: company.domainVerifiedAt,
      description: company.description,
      createdAt: company.createdAt,
      verifiedAt: company.verifiedAt,
      jobs: company._count.jobs,
      members: company.recruiters.map((member) => ({
        name: `${member.user.firstName} ${member.user.lastName}`,
        email: member.user.email,
      })),
    }));
  }

  async setCompanyVerified(companyId: string, verified: boolean) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: { verifiedAt: verified ? new Date() : null },
      select: { id: true, name: true, verifiedAt: true },
    });
    await this.prisma.auditLog.create({
      data: { action: verified ? "COMPANY_VERIFIED" : "COMPANY_UNVERIFIED", entity: "Company", entityId: companyId },
    });
    return company;
  }
}
