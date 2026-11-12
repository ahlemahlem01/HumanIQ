import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { cultureQuestionnaire, qcmForSkills, scoreMcq, type McqQuestion } from "./bank";
import { codeChallengesForSkills, stripHidden, type CodeChallenge } from "./code-challenges";
import { judgeChallenge } from "./code-runner";
import { companyIdOf } from "../recruiters/company-scope";

type CodePayload = { kind: "code"; language: "javascript"; challenges: CodeChallenge[] };

/** Challenges are plain data (strings, numbers, arrays), so they are valid JSON for the payload column. */
const codePayload = (challenges: CodeChallenge[]) =>
  ({ kind: "code", language: "javascript", challenges }) as unknown as Prisma.InputJsonValue;

@Injectable()
export class AssessmentsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async assignBundle(applicationId: string, recruiterId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true, assessments: true },
    });
    if (!application || application.job.companyId !== companyId) {
      throw new ForbiddenException("Candidature inaccessible.");
    }

    const created = [];
    const hasQcm = application.assessments.some((item) => item.type === "QCM" && item.status !== "COMPLETED");
    const hasCulture = application.assessments.some((item) => item.type === "CULTURE" && item.status !== "COMPLETED");
    const openCode = application.assessments.find((item) => item.type === "CODE" && item.status !== "COMPLETED");

    if (!hasQcm) {
      created.push(
        await this.createMcq(application.id, "QCM", "QCM technique", qcmForSkills(application.job.requiredSkills)),
      );
    }
    if (!hasCulture) {
      created.push(await this.createMcq(application.id, "CULTURE", "Fit culturel", cultureQuestionnaire()));
    }

    const challenges = codeChallengesForSkills(application.job.requiredSkills);
    if (!openCode) {
      created.push(await this.createCode(application.id, challenges));
    } else if (!isCodePayload(openCode.payload)) {
      created.push(
        await this.prisma.assessment.update({
          where: { id: openCode.id },
          data: {
            title: "Test de code interactif",
            payload: codePayload(challenges),
          },
        }),
      );
    }
    return { assigned: created.length, assessments: created };
  }

  async mine(candidateId: string) {
    const rows = await this.prisma.assessment.findMany({
      where: { application: { candidateId } },
      include: { application: { include: { job: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.present(row, { hideAnswers: row.status !== "COMPLETED" }));
  }

  async getForCandidate(id: string, candidateId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: { application: true },
    });
    if (!assessment || assessment.application.candidateId !== candidateId) {
      throw new ForbiddenException("Test inaccessible.");
    }
    return this.present(assessment, { hideAnswers: assessment.status !== "COMPLETED" });
  }

  async runPublic(id: string, candidateId: string, challengeId: string, source: string) {
    const assessment = await this.loadOwned(id, candidateId);
    const challenge = this.challengeOf(assessment, challengeId);
    const judged = judgeChallenge(challenge, source, { includeHidden: false });
    return {
      challengeId,
      passed: judged.passed,
      total: judged.total,
      results: judged.results,
    };
  }

  async submit(id: string, candidateId: string, body: { answers?: number[]; code?: Record<string, string> }) {
    const assessment = await this.loadOwned(id, candidateId);
    if (assessment.status === "COMPLETED") {
      throw new BadRequestException("Ce test est déjà rendu.");
    }

    if (isCodePayload(assessment.payload)) {
      return this.submitCode(assessment, body.code ?? {});
    }

    const questions = (assessment.payload as { questions?: McqQuestion[] } | null)?.questions;
    if (!questions?.length) throw new NotFoundException("Questionnaire vide.");
    const answers = body.answers ?? [];
    if (answers.length !== questions.length) {
      throw new BadRequestException(`Attendu ${questions.length} réponses.`);
    }
    const result = scoreMcq(questions, answers);
    const updated = await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        answers,
        score: result.score,
        status: "COMPLETED",
        completedAt: new Date(),
      },
      include: { application: { include: { job: { select: { title: true } } } } },
    });
    return { ...this.present(updated, { hideAnswers: false }), ...result };
  }

  private async submitCode(
    assessment: { id: string; payload: unknown },
    sources: Record<string, string>,
  ) {
    const payload = assessment.payload as CodePayload;
    const reports = payload.challenges.map((challenge) => {
      const source = sources[challenge.id] ?? "";
      if (!source.trim()) {
        return {
          challengeId: challenge.id,
          passed: 0,
          total: challenge.publicTests.length + challenge.hiddenTests.length,
          results: [{ id: "empty", ok: false, public: true, error: "Aucune solution soumise." }],
        };
      }
      const judged = judgeChallenge(challenge, source, { includeHidden: true });
      return { challengeId: challenge.id, ...judged };
    });
    const passed = reports.reduce((sum, item) => sum + item.passed, 0);
    const total = reports.reduce((sum, item) => sum + item.total, 0);
    const score = Math.round((passed / Math.max(total, 1)) * 100);

    const updated = await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        answers: { sources, reports },
        score,
        status: "COMPLETED",
        completedAt: new Date(),
      },
      include: { application: { include: { job: { select: { title: true } } } } },
    });
    return { ...this.present(updated, { hideAnswers: false }), passed, total };
  }

  private async loadOwned(id: string, candidateId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: { application: true },
    });
    if (!assessment || assessment.application.candidateId !== candidateId) {
      throw new ForbiddenException("Test inaccessible.");
    }
    return assessment;
  }

  private challengeOf(assessment: { payload: unknown }, challengeId: string) {
    if (!isCodePayload(assessment.payload)) throw new BadRequestException("Ce test n'est pas un exercice de code.");
    const challenge = assessment.payload.challenges.find((item) => item.id === challengeId);
    if (!challenge) throw new NotFoundException("Exercice introuvable.");
    return challenge;
  }

  private createMcq(applicationId: string, type: "QCM" | "CULTURE", title: string, questions: McqQuestion[]) {
    return this.prisma.assessment.create({
      data: {
        applicationId,
        type,
        title,
        status: "ASSIGNED",
        payload: { questions: questions.map(({ correctIndex, ...rest }) => ({ ...rest, correctIndex })) },
      },
    });
  }

  private createCode(applicationId: string, challenges: CodeChallenge[]) {
    return this.prisma.assessment.create({
      data: {
        applicationId,
        type: "CODE",
        title: "Test de code interactif",
        status: "ASSIGNED",
        payload: codePayload(challenges),
      },
    });
  }

  private present(
    assessment: {
      id: string;
      type: string;
      title: string;
      score: number | null;
      status: string;
      payload: unknown;
      answers: unknown;
      completedAt: Date | null;
      application?: { job?: { title?: string } } & Record<string, unknown>;
    },
    opts: { hideAnswers: boolean },
  ) {
    if (isCodePayload(assessment.payload)) {
      const answers = assessment.answers as { sources?: Record<string, string>; reports?: unknown } | null;
      return {
        id: assessment.id,
        type: assessment.type,
        title: assessment.title,
        score: assessment.score,
        status: assessment.status,
        jobTitle: assessment.application?.job?.title,
        completedAt: assessment.completedAt,
        kind: "code" as const,
        language: "javascript",
        challenges: assessment.payload.challenges.map((challenge) => ({
          ...stripHidden(challenge),
          source: opts.hideAnswers ? challenge.starter : (answers?.sources?.[challenge.id] ?? challenge.starter),
        })),
        reports: opts.hideAnswers ? undefined : answers?.reports,
        questions: [],
      };
    }

    const payload = assessment.payload as { questions?: McqQuestion[] } | null;
    const questions = (payload?.questions ?? []).map((question) => ({
      id: question.id,
      competency: question.competency,
      prompt: question.prompt,
      choices: question.choices,
      ...(opts.hideAnswers ? {} : { correctIndex: question.correctIndex }),
    }));
    return {
      id: assessment.id,
      type: assessment.type,
      title: assessment.title,
      score: assessment.score,
      status: assessment.status,
      jobTitle: assessment.application?.job?.title,
      completedAt: assessment.completedAt,
      kind: "mcq" as const,
      questions,
      answers: opts.hideAnswers ? undefined : assessment.answers,
    };
  }
}

function isCodePayload(payload: unknown): payload is CodePayload {
  return Boolean(payload && typeof payload === "object" && (payload as CodePayload).kind === "code");
}
