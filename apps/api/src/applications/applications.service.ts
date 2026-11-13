import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStage, AssessmentType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingsService } from "../ai/embeddings.service";
import { blendScores, scoreCvAgainstJob } from "../ai/matching";
import { companyIdOf } from "../recruiters/company-scope";
import { MessagesService } from "../messages/messages.service";

const STAGES: ApplicationStage[] = [
  "SOURCING",
  "PRESELECTION",
  "INTERVIEW",
  "TEST",
  "OFFER",
  "HIRED",
  "REJECTED",
];

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EmbeddingsService) private embeddings: EmbeddingsService,
    @Inject(MessagesService) private messages: MessagesService,
  ) {}

  async apply(candidateId: string, jobId: string, coverNote?: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { company: { select: { verifiedAt: true } } } });
    if (!job || job.status !== "PUBLISHED" || !job.company.verifiedAt) throw new NotFoundException("Offre indisponible.");
    const profile = await this.prisma.candidateProfile.findUnique({ where: { id: candidateId } });
    if (!profile) throw new NotFoundException("Profil candidat introuvable.");

    const keyword = scoreCvAgainstJob(profile, job);
    const semantic = await this.embeddings.similarity(candidateId, jobId);
    const blended = blendScores(keyword, semantic?.score ?? null);

    const count = await this.prisma.application.count({
      where: { jobId, stage: "SOURCING" },
    });

    try {
      return await this.prisma.application.create({
        data: {
          jobId,
          candidateId,
          coverNote,
          stage: "SOURCING",
          kanbanOrder: count,
          atsScore: blended.score,
          semanticScore: blended.semanticScore,
          keywordScore: blended.keywordScore,
          keywordSuggestions: keyword.missingKeywords,
        },
        include: { job: { include: { company: true } } },
      });
    } catch {
      throw new ConflictException("Vous avez déjà postulé à cette offre.");
    }
  }

  async shortlist(recruiterId: string, jobId: string, candidateId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const job = await this.prisma.job.findFirst({ where: { id: jobId, companyId, status: "PUBLISHED" } });
    if (!job) throw new ForbiddenException("Offre inaccessible.");
    const profile = await this.prisma.candidateProfile.findFirst({
      where: { id: candidateId, reverseRecruiting: true },
    });
    if (!profile) throw new NotFoundException("Ce profil n'est pas ouvert aux approches.");
    try {
      const application = await this.apply(candidateId, jobId, "Ajouté depuis le vivier.");
      return { created: true, applicationId: application.id };
    } catch (error) {
      if (error instanceof ConflictException) return { created: false, applicationId: null };
      throw error;
    }
  }

  mine(candidateId: string) {
    return this.prisma.application.findMany({
      where: { candidateId },
      include: { job: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async stats(recruiterId: string, days: number) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const since = new Date(todayStart - (days - 1) * day);
    const previousSince = new Date(since.getTime() - days * day);

    const [jobs, rows] = await Promise.all([
      this.prisma.job.findMany({
        where: { companyId },
        select: { id: true, title: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.application.findMany({
        where: { job: { companyId }, createdAt: { gte: previousSince } },
        select: { jobId: true, stage: true, atsScore: true, createdAt: true },
      }),
    ]);

    const current = rows.filter((row) => row.createdAt >= since);
    const previousTotal = rows.length - current.length;

    const flow: ApplicationStage[] = STAGES.filter((stage) => stage !== "REJECTED");
    const funnel = flow.map((stage, index) => ({
      stage,
      current: current.filter((row) => row.stage === stage).length,
      reached: current.filter((row) => flow.indexOf(row.stage) >= index).length,
    }));

    const perDayMap = new Map<string, number>();
    for (let offset = 0; offset < days; offset += 1) {
      perDayMap.set(new Date(since.getTime() + offset * day).toISOString().slice(0, 10), 0);
    }
    for (const row of current) {
      const key = row.createdAt.toISOString().slice(0, 10);
      perDayMap.set(key, (perDayMap.get(key) ?? 0) + 1);
    }

    const scored = current.filter((row) => row.atsScore != null);
    const average = (values: (number | null)[]) => {
      const list = values.filter((value): value is number => value != null);
      return list.length ? Math.round(list.reduce((total, value) => total + value, 0) / list.length) : null;
    };

    return {
      days,
      total: current.length,
      previousTotal,
      hired: current.filter((row) => row.stage === "HIRED").length,
      rejected: current.filter((row) => row.stage === "REJECTED").length,
      activeJobs: jobs.filter((job) => job.status === "PUBLISHED").length,
      avgScore: average(scored.map((row) => row.atsScore)),
      funnel,
      perDay: Array.from(perDayMap, ([date, count]) => ({ date, count })),
      byJob: jobs.map((job) => {
        const own = current.filter((row) => row.jobId === job.id);
        return {
          jobId: job.id,
          title: job.title,
          status: job.status,
          applications: own.length,
          avgScore: average(own.map((row) => row.atsScore)),
        };
      }),
    };
  }

  async pipeline(jobId: string, recruiterId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId },
      include: { company: true },
    });
    if (!job) throw new ForbiddenException("Pipeline inaccessible.");

    const applications = await this.prisma.application.findMany({
      where: { jobId },
      include: {
        candidate: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
        assessments: { select: { id: true, type: true, title: true, score: true, status: true, completedAt: true } },
        interviews: {
          where: { kind: "SCREENING" },
          select: { id: true, status: true, overallScore: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { kanbanOrder: "asc" },
    });

    const columns = STAGES.map((stage) => ({
      stage,
      items: applications.filter((a) => a.stage === stage),
    }));

    return { job, columns };
  }

  async move(
    applicationId: string,
    recruiterId: string,
    stage: ApplicationStage,
    kanbanOrder: number,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });
    if (!application || application.job.companyId !== (await companyIdOf(this.prisma, recruiterId))) {
      throw new ForbiddenException("Candidature inaccessible.");
    }
    return this.prisma.application.update({
      where: { id: applicationId },
      data: { stage, kanbanOrder },
    });
  }

  /**
   * Hires a candidate: the application moves to HIRED, the job is closed, every other open application is
   * rejected, and each candidate gets a message in the in-app inbox (from the recruiter who hired).
   */
  async hire(applicationId: string, recruiterId: string, userId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: { include: { company: true } }, candidate: { include: { user: true } } },
    });
    if (!application || application.job.companyId !== companyId) {
      throw new ForbiddenException("Candidature inaccessible.");
    }
    const job = application.job;
    const others = await this.prisma.application.findMany({
      where: { jobId: job.id, id: { not: applicationId }, stage: { notIn: ["HIRED", "REJECTED"] } },
      include: { candidate: { include: { user: true } } },
    });

    await this.prisma.$transaction([
      this.prisma.application.update({ where: { id: applicationId }, data: { stage: "HIRED", kanbanOrder: 0 } }),
      this.prisma.job.update({ where: { id: job.id }, data: { status: "CLOSED" } }),
      ...(others.length
        ? [this.prisma.application.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { stage: "REJECTED" } })]
        : []),
    ]);

    const company = job.company.name;
    const send = (candidateId: string, _firstName: string | null, body: string) =>
      this.messages.postFromRecruiter(userId, companyId, candidateId, job.id, body);

    const hiredName = application.candidate.user.firstName ?? "";
    await send(
      application.candidateId,
      hiredName,
      `Bonjour ${hiredName},

Bonne nouvelle : ${company} a le plaisir de vous confier le poste « ${job.title} ». Nous reviendrons vers vous très prochainement pour les prochaines étapes.

Félicitations et à bientôt !`,
    );
    for (const other of others) {
      const name = other.candidate.user.firstName ?? "";
      await send(
        other.candidateId,
        name,
        `Bonjour ${name},

Merci pour l'intérêt que vous avez porté au poste « ${job.title} » chez ${company}. Après étude des candidatures, nous avons retenu un autre profil et l'offre est désormais clôturée. Nous gardons votre dossier en mémoire et vous souhaitons plein succès dans vos recherches.`,
      );
    }
    return { hired: applicationId, rejected: others.length, jobStatus: "CLOSED" };
  }

  private async ownedApplication(applicationId: string, recruiterId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, job: { select: { companyId: true } } },
    });
    if (!application || application.job.companyId !== companyId) {
      throw new ForbiddenException("Candidature inaccessible.");
    }
    return application;
  }

  async listNotes(applicationId: string, recruiterId: string) {
    await this.ownedApplication(applicationId, recruiterId);
    const rows = await this.prisma.applicationNote.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: { id: row.author.id, name: `${row.author.firstName} ${row.author.lastName}` },
    }));
  }

  async addNote(applicationId: string, recruiterId: string, userId: string, body: string) {
    if (typeof body !== "string" || !body.trim() || body.length > 2000) {
      throw new BadRequestException("La note doit faire entre 1 et 2000 caractères.");
    }
    await this.ownedApplication(applicationId, recruiterId);
    const row = await this.prisma.applicationNote.create({
      data: { applicationId, authorId: userId, body: body.trim() },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: { id: row.author.id, name: `${row.author.firstName} ${row.author.lastName}` },
    };
  }

  async addAssessment(
    applicationId: string,
    recruiterId: string,
    data: { type: AssessmentType; title: string; score?: number },
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });
    if (!application || application.job.companyId !== (await companyIdOf(this.prisma, recruiterId))) {
      throw new ForbiddenException("Candidature inaccessible.");
    }
    return this.prisma.assessment.create({
      data: {
        applicationId,
        type: data.type,
        title: data.title,
        score: data.score,
        completedAt: data.score != null ? new Date() : null,
      },
    });
  }
}
