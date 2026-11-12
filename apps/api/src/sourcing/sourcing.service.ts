import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { EmbeddingsService } from "../ai/embeddings.service";
import { blendScores, scoreCvAgainstJob } from "../ai/matching";
import {
  composeCvText,
  hydrateFromRawText,
  linkedinHandle,
  splitName,
  type LinkedInImportInput,
} from "./linkedin-parse";
import { companyIdOf } from "../recruiters/company-scope";

@Injectable()
export class SourcingService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(AiService) private ai: AiService,
    @Inject(EmbeddingsService) private embeddings: EmbeddingsService,
  ) {}

  async importLinkedIn(
    recruiter: { id: string; userId: string },
    payload: LinkedInImportInput,
  ) {
    const input = hydrateFromRawText(payload);
    const job = await this.prisma.job.findFirst({
      where: { id: input.jobId, companyId: await companyIdOf(this.prisma, recruiter.id) },
    });
    if (!job) throw new ForbiddenException("Offre inaccessible.");
    if (job.status !== "PUBLISHED") throw new NotFoundException("Offre non publiée.");

    const fullName = input.fullName?.trim();
    const cvText = composeCvText(input);
    if (!fullName || cvText.length < 20) {
      throw new NotFoundException("Profil LinkedIn trop incomplet pour l'import.");
    }

    const handle = linkedinHandle(input.linkedinUrl, fullName);
    const email = `sourced.${handle}@import.nextgen.hr`;
    const { firstName, lastName } = splitName(fullName);
    const source = /linkedin\.com|\/demo\/linkedin/i.test(input.linkedinUrl ?? "") ? "LINKEDIN" : "PASTE";

    let profile = input.linkedinUrl
      ? await this.prisma.candidateProfile.findFirst({ where: { linkedinUrl: input.linkedinUrl } })
      : await this.prisma.candidateProfile.findFirst({
          where: { user: { email } },
        });

    if (!profile) {
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          role: "CANDIDATE",
          firstName,
          lastName,
          candidate: {
            create: {
              headline: input.headline?.slice(0, 180) ?? null,
              location: input.location?.slice(0, 120) ?? null,
              bio: input.about?.slice(0, 2000) ?? null,
              linkedinUrl: input.linkedinUrl || null,
              source,
              sourcedAt: new Date(),
              reverseRecruiting: false,
              anonymousVisible: false,
            },
          },
        },
        include: { candidate: true },
      });
      profile = user.candidate!;
    } else {
      await this.prisma.user.update({
        where: { id: profile.userId },
        data: { firstName, lastName },
      });
      profile = await this.prisma.candidateProfile.update({
        where: { id: profile.id },
        data: {
          headline: input.headline?.slice(0, 180) ?? profile.headline,
          location: input.location?.slice(0, 120) ?? profile.location,
          bio: input.about?.slice(0, 2000) ?? profile.bio,
          linkedinUrl: input.linkedinUrl || profile.linkedinUrl,
          source,
          sourcedAt: new Date(),
        },
      });
    }

    await this.ai.parseCvText(profile.id, cvText, `${handle}.linkedin.txt`);

    const scored = await this.prisma.candidateProfile.findUnique({ where: { id: profile.id } });
    if (!scored) throw new NotFoundException("Profil introuvable après import.");

    const keyword = scoreCvAgainstJob(scored, job);
    const semantic = await this.embeddings.similarity(scored.id, job.id);
    const blended = blendScores(keyword, semantic?.score ?? null);
    const count = await this.prisma.application.count({ where: { jobId: job.id, stage: "SOURCING" } });

    let application;
    try {
      application = await this.prisma.application.create({
        data: {
          jobId: job.id,
          candidateId: scored.id,
          stage: "SOURCING",
          kanbanOrder: count,
          coverNote: source === "LINKEDIN" ? `Importé depuis LinkedIn (${handle})` : "Importé depuis un texte de profil",
          atsScore: blended.score,
          semanticScore: blended.semanticScore,
          keywordScore: blended.keywordScore,
          keywordSuggestions: keyword.missingKeywords,
        },
        include: {
          job: { select: { id: true, title: true } },
          candidate: {
            select: {
              id: true,
              headline: true,
              location: true,
              skills: true,
              linkedinUrl: true,
              source: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });
    } catch {
      throw new ConflictException("Ce profil est déjà dans le pipeline de cette offre.");
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: recruiter.userId,
        action: "LINKEDIN_IMPORT",
        entity: "Application",
        entityId: application.id,
        metadata: { jobId: job.id, handle, source, score: blended.score },
      },
    });

    return { ...application, score: blended };
  }

  async recent(recruiterId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    return this.prisma.application.findMany({
      where: {
        job: { companyId },
        candidate: { source: { in: ["LINKEDIN", "PASTE"] } },
      },
      include: {
        job: { select: { id: true, title: true } },
        candidate: {
          select: {
            headline: true,
            location: true,
            skills: true,
            linkedinUrl: true,
            source: true,
            sourcedAt: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }
}
