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
}
