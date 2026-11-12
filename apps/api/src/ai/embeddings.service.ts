import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
  calibrationForModel,
  cosineToScore,
  toPgVector,
} from "./providers/types";

export type SemanticHit = {
  id: string;
  similarity: number;
  score: number;
};

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private provider: EmbeddingProvider,
  ) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
      // HNSW with cosine ops matches the `<=>` operator used in every query below.
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS job_embedding_hnsw ON "Job" USING hnsw (embedding vector_cosine_ops)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS candidate_embedding_hnsw ON "CandidateProfile" USING hnsw (embedding vector_cosine_ops)`,
      );
      this.logger.log(`pgvector ready — embeddings via ${this.provider.name}/${this.provider.model}`);
    } catch (error) {
      this.logger.error(
        `pgvector setup failed, semantic search disabled: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  get activeModel() {
    return this.provider.model;
  }

  get providerName() {
    return this.provider.name;
  }

  async embedOne(text: string) {
    const result = await this.provider.embed([text]);
    return { vector: result.vectors[0], model: result.model };
  }

  /** Flat text used to build a job vector. Skills are repeated by design: they carry the most signal. */
  jobText(job: {
    title: string;
    description: string;
    location: string;
    contractType: string;
    requiredSkills: string[];
  }) {
    const skills = job.requiredSkills.join(", ");
    return [
      `Intitulé: ${job.title}`,
      `Compétences requises: ${skills}`,
      `Lieu: ${job.location} — Contrat: ${job.contractType}`,
      `Description: ${job.description}`,
      `Mots-clés: ${skills}`,
    ].join("\n");
  }

  profileText(profile: {
    headline?: string | null;
    bio?: string | null;
    location?: string | null;
    experienceYears: number;
    skills: string[];
    cvText?: string | null;
    experienceLines?: string[];
    educationLines?: string[];
  }) {
    const skills = profile.skills.join(", ");
    return [
      `Titre: ${profile.headline ?? ""}`,
      `Compétences: ${skills}`,
      `Expérience: ${profile.experienceYears} ans — Lieu: ${profile.location ?? ""}`,
      `Résumé: ${profile.bio ?? ""}`,
      `Parcours: ${(profile.experienceLines ?? []).join(" | ")}`,
      `Formation: ${(profile.educationLines ?? []).join(" | ")}`,
      `CV: ${(profile.cvText ?? "").slice(0, 8000)}`,
      `Mots-clés: ${skills}`,
    ].join("\n");
  }

  async indexJob(jobId: string, text: string) {
    try {
      const { vector, model } = await this.embedOne(text);
      await this.prisma.$executeRaw`
        UPDATE "Job"
        SET embedding = ${toPgVector(vector)}::vector,
            "embeddingModel" = ${model},
            "embeddingUpdatedAt" = NOW()
        WHERE id = ${jobId}
      `;
      return true;
    } catch (error) {
      this.logger.warn(
        `Job ${jobId} not indexed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  async indexCandidate(candidateId: string, text: string) {
    try {
      const { vector, model } = await this.embedOne(text);
      await this.prisma.$executeRaw`
        UPDATE "CandidateProfile"
        SET embedding = ${toPgVector(vector)}::vector,
            "embeddingModel" = ${model},
            "embeddingUpdatedAt" = NOW()
        WHERE id = ${candidateId}
      `;
      return true;
    } catch (error) {
      this.logger.warn(
        `Candidate ${candidateId} not indexed: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return false;
    }
  }

  /**
   * Cosine similarity between a stored candidate vector and a stored job vector.
   * Returns null when either side is missing or the two were produced by
   * different models, since cross-model distances are meaningless.
   */
  async similarity(candidateId: string, jobId: string) {
    const rows = await this.prisma.$queryRaw<{ similarity: number; model: string }[]>`
      SELECT 1 - (c.embedding <=> j.embedding) AS similarity,
             c."embeddingModel" AS model
      FROM "CandidateProfile" c
      JOIN "Job" j ON j.id = ${jobId}
      WHERE c.id = ${candidateId}
        AND c.embedding IS NOT NULL
        AND j.embedding IS NOT NULL
        AND c."embeddingModel" = j."embeddingModel"
    `;
    const row = rows[0];
    if (!row) return null;
    const similarity = Number(row.similarity);
    return {
      similarity,
      score: cosineToScore(similarity, calibrationForModel(row.model)),
      model: row.model,
    };
  }

  /** Published jobs ranked by semantic distance to a candidate's vector. */
  async jobsForCandidate(candidateId: string, limit = 10): Promise<SemanticHit[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; similarity: number; model: string }[]
    >`
      SELECT j.id,
             1 - (j.embedding <=> c.embedding) AS similarity,
             j."embeddingModel" AS model
      FROM "Job" j
      CROSS JOIN "CandidateProfile" c
      WHERE c.id = ${candidateId}
        AND c.embedding IS NOT NULL
        AND j.embedding IS NOT NULL
        AND j."embeddingModel" = c."embeddingModel"
        AND j.status = 'PUBLISHED'
      ORDER BY j.embedding <=> c.embedding
      LIMIT ${limit}
    `;
    return rows.map(this.toHit);
  }

  /** Opted-in candidates ranked by semantic distance to a job's vector. */
  async candidatesForJob(jobId: string, limit = 10): Promise<SemanticHit[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; similarity: number; model: string }[]
    >`
      SELECT c.id,
             1 - (c.embedding <=> j.embedding) AS similarity,
             c."embeddingModel" AS model
      FROM "CandidateProfile" c
      CROSS JOIN "Job" j
      WHERE j.id = ${jobId}
        AND j.embedding IS NOT NULL
        AND c.embedding IS NOT NULL
        AND c."embeddingModel" = j."embeddingModel"
        AND c."reverseRecruiting" = true
      ORDER BY c.embedding <=> j.embedding
      LIMIT ${limit}
    `;
    return rows.map(this.toHit);
  }

  /** Free-text semantic search over published jobs. */
  async searchJobs(query: string, limit = 20): Promise<SemanticHit[]> {
    const { vector, model } = await this.embedOne(query);
    const rows = await this.prisma.$queryRaw<
      { id: string; similarity: number; model: string }[]
    >`
      SELECT j.id,
             1 - (j.embedding <=> ${toPgVector(vector)}::vector) AS similarity,
             j."embeddingModel" AS model
      FROM "Job" j
      WHERE j.embedding IS NOT NULL
        AND j."embeddingModel" = ${model}
        AND j.status = 'PUBLISHED'
      ORDER BY j.embedding <=> ${toPgVector(vector)}::vector
      LIMIT ${limit}
    `;
    return rows.map(this.toHit);
  }

  /** Coverage report so admins can spot rows needing a reindex after a model change. */
  async coverage() {
    const rows = await this.prisma.$queryRaw<
      { entity: string; total: bigint; embedded: bigint; current: bigint }[]
    >`
      SELECT 'jobs' AS entity,
             COUNT(*) AS total,
             COUNT(embedding) AS embedded,
             COUNT(*) FILTER (WHERE "embeddingModel" = ${this.provider.model}) AS current
      FROM "Job"
      UNION ALL
      SELECT 'candidates' AS entity,
             COUNT(*) AS total,
             COUNT(embedding) AS embedded,
             COUNT(*) FILTER (WHERE "embeddingModel" = ${this.provider.model}) AS current
      FROM "CandidateProfile"
    `;
    return {
      provider: this.provider.name,
      model: this.provider.model,
      dimensions: this.provider.dimensions,
      entities: rows.map((row) => ({
        entity: row.entity,
        total: Number(row.total),
        embedded: Number(row.embedded),
        currentModel: Number(row.current),
      })),
    };
  }

  /** Re-embeds everything that is missing a vector or was built by another model. */
  async reindexAll() {
    const jobs = await this.prisma.job.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        contractType: true,
        requiredSkills: true,
      },
    });
    let jobsIndexed = 0;
    for (const job of jobs) {
      if (await this.indexJob(job.id, this.jobText(job))) jobsIndexed++;
    }

    const candidates = await this.prisma.candidateProfile.findMany({
      select: {
        id: true,
        headline: true,
        bio: true,
        location: true,
        experienceYears: true,
        skills: true,
        cvText: true,
      },
    });
    let candidatesIndexed = 0;
    for (const candidate of candidates) {
      if (await this.indexCandidate(candidate.id, this.profileText(candidate))) {
        candidatesIndexed++;
      }
    }

    return { jobsIndexed, candidatesIndexed, model: this.provider.model };
  }

  private toHit = (row: { id: string; similarity: number; model: string }): SemanticHit => {
    const similarity = Number(row.similarity);
    return {
      id: row.id,
      similarity,
      score: cosineToScore(similarity, calibrationForModel(row.model)),
    };
  };
}
