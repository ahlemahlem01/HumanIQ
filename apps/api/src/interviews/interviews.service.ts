import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InterviewKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LLM_PROVIDER, LlmProvider } from "../ai/providers/types";
import { interviewPlan } from "../assessments/bank";
import { heuristicScore, llmQuestions, llmScore, summarize } from "./interview-engine";
import { companyIdOf } from "../recruiters/company-scope";

@Injectable()
export class InterviewsService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(LLM_PROVIDER) private llm: LlmProvider,
  ) {}

  async list(candidateId: string) {
    const rows = await this.prisma.interviewSession.findMany({
      where: { candidateId },
      include: {
        job: { select: { title: true, location: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      overallScore: row.overallScore,
      currentIndex: row.currentIndex,
      summary: row.summary,
      createdAt: row.createdAt,
      job: row.job,
    }));
  }

  async get(id: string, candidateId?: string, recruiterId?: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id },
      include: {
        job: { select: { id: true, title: true, requiredSkills: true } },
        turns: { orderBy: { index: "asc" } },
        candidate: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!session) throw new NotFoundException("Entretien introuvable.");
    if (candidateId && session.candidateId !== candidateId) {
      throw new ForbiddenException("Cet entretien ne vous appartient pas.");
    }
    if (recruiterId) {
      const job = session.jobId
        ? await this.prisma.job.findFirst({
            where: { id: session.jobId, companyId: await companyIdOf(this.prisma, recruiterId) },
          })
        : null;
      if (!job) throw new ForbiddenException("Entretien inaccessible.");
    }
    return this.present(session);
  }

  async start(
    candidateId: string,
    input: { jobId?: string; applicationId?: string; kind?: InterviewKind },
  ) {
    const profile = await this.prisma.candidateProfile.findUnique({ where: { id: candidateId } });
    if (!profile) throw new NotFoundException("Profil introuvable.");

    let job = input.jobId
      ? await this.prisma.job.findUnique({ where: { id: input.jobId } })
      : null;
    let applicationId = input.applicationId ?? null;

    if (applicationId) {
      const application = await this.prisma.application.findFirst({
        where: { id: applicationId, candidateId },
        include: { job: true },
      });
      if (!application) throw new ForbiddenException("Candidature inaccessible.");
      job = application.job;
      applicationId = application.id;
    }

    const skills = job?.requiredSkills?.length ? job.requiredSkills : profile.skills;
    const senior = /\b(senior|lead|principal|staff)\b/i.test(job?.title ?? profile.headline ?? "");
    let plan = interviewPlan(skills, senior);
    if (this.llm.name !== "local") {
      const generated = await llmQuestions(this.llm, {
        title: job?.title ?? profile.headline ?? "Entretien général",
        skills,
        seniority: senior ? "senior" : "confirmé",
      });
      if (generated?.every((item) => item.question.length > 20)) plan = generated;
    }

    const session = await this.prisma.interviewSession.create({
      data: {
        candidateId,
        jobId: job?.id,
        applicationId,
        kind: input.kind ?? (applicationId ? "SCREENING" : "PRACTICE"),
        turns: {
          create: plan.map((item, index) => ({
            index,
            competency: item.competency,
            question: item.question,
            expectedSignals: item.expectedSignals,
          })),
        },
      },
      include: {
        job: { select: { id: true, title: true, requiredSkills: true } },
        turns: { orderBy: { index: "asc" } },
        candidate: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    return this.present(session);
  }

  async invite(applicationId: string, recruiterId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });
    if (!application || application.job.companyId !== (await companyIdOf(this.prisma, recruiterId))) {
      throw new ForbiddenException("Candidature inaccessible.");
    }
    // One screening interview per application: re-inviting returns the existing session.
    const existing = await this.prisma.interviewSession.findFirst({
      where: { applicationId, kind: "SCREENING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) return this.get(existing.id, undefined, recruiterId);

    return this.start(application.candidateId, {
      applicationId,
      jobId: application.jobId,
      kind: "SCREENING",
    });
  }

  async answer(sessionId: string, candidateId: string, text: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { turns: { orderBy: { index: "asc" } } },
    });
    if (!session || session.candidateId !== candidateId) {
      throw new ForbiddenException("Entretien inaccessible.");
    }
    if (session.status !== "IN_PROGRESS") {
      throw new BadRequestException("Cet entretien est déjà clos.");
    }
    const turn = session.turns[session.currentIndex];
    if (!turn) throw new BadRequestException("Plus de questions.");
    if (text.trim().length < 20) {
      throw new BadRequestException("Développez un peu : 20 caractères minimum.");
    }

    let evaluation = heuristicScore(text, turn.expectedSignals);
    if (this.llm.name !== "local") {
      const llm = await llmScore(this.llm, turn.question, text, turn.competency);
      if (llm?.feedback) evaluation = llm;
    }

    await this.prisma.interviewTurn.update({
      where: { id: turn.id },
      data: {
        answer: text.trim(),
        score: evaluation.score,
        feedback: evaluation.feedback,
        answeredAt: new Date(),
      },
    });

    const nextIndex = session.currentIndex + 1;
    const done = nextIndex >= session.turns.length;
    let overallScore: number | undefined;
    let summary: string | undefined;

    if (done) {
      const scores = session.turns.map((item, i) =>
        i === session.currentIndex ? evaluation.score : (item.score ?? 0),
      );
      overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      summary = summarize(
        scores,
        session.turns.map((item) => item.competency),
      );
      if (session.applicationId) {
        await this.prisma.assessment.create({
          data: {
            applicationId: session.applicationId,
            type: "INTERVIEW",
            title: "Entretien IA",
            score: overallScore,
            status: "COMPLETED",
            completedAt: new Date(),
            payload: { sessionId, summary },
          },
        });
      }
    }

    const updated = await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        currentIndex: nextIndex,
        status: done ? "COMPLETED" : "IN_PROGRESS",
        overallScore,
        summary,
      },
      include: {
        job: { select: { id: true, title: true, requiredSkills: true } },
        turns: { orderBy: { index: "asc" } },
        candidate: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    return this.present(updated);
  }

  private present(session: {
    id: string;
    kind: string;
    status: string;
    currentIndex: number;
    overallScore: number | null;
    summary: string | null;
    job: { id: true; title: true; requiredSkills: true } | { id: string; title: string; requiredSkills: string[] } | null;
    turns: {
      id: string;
      index: number;
      competency: string;
      question: string;
      answer: string | null;
      score: number | null;
      feedback: string | null;
    }[];
    candidate?: { user: { firstName: string; lastName: string } };
  }) {
    const current = session.turns[session.currentIndex] ?? null;
    return {
      id: session.id,
      kind: session.kind,
      status: session.status,
      currentIndex: session.currentIndex,
      total: session.turns.length,
      overallScore: session.overallScore,
      summary: session.summary,
      job: session.job,
      candidate: session.candidate
        ? `${session.candidate.user.firstName} ${session.candidate.user.lastName}`
        : undefined,
      history: session.turns
        .filter((turn) => turn.answer)
        .map((turn) => ({
          index: turn.index,
          competency: turn.competency,
          question: turn.question,
          answer: turn.answer,
          score: turn.score,
          feedback: turn.feedback,
        })),
      current:
        session.status === "IN_PROGRESS" && current
          ? { index: current.index, competency: current.competency, question: current.question }
          : null,
    };
  }
}
