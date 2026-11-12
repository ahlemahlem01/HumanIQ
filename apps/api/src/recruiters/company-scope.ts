import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Recruiters work as a team: jobs, pipelines, tests and interviews belong to the
 * company, not to the single recruiter who created them. Services resolve the
 * caller's company once and scope every query with it.
 */
export async function companyIdOf(prisma: PrismaService, recruiterId: string): Promise<string> {
  const row = await prisma.recruiterProfile.findUnique({ where: { id: recruiterId }, select: { companyId: true } });
  if (!row) throw new ForbiddenException("Profil recruteur introuvable.");
  return row.companyId;
}
