import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { JobStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SearchService } from "../search/search.module";
import { EmbeddingsService } from "../ai/embeddings.service";
import { companyIdOf } from "../recruiters/company-scope";

@Injectable()
export class JobsService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(SearchService) private search: SearchService,
    @Inject(EmbeddingsService) private embeddings: EmbeddingsService,
  ) {}

  async listPublic(query?: string, location?: string) {
    const locationFilter = location
      ? { location: { contains: location, mode: "insensitive" as const } }
      : {};

    if (query?.trim()) {
      try {
        const semantic = await this.embeddings.searchJobs(query.trim(), 40);
        if (semantic.length) {
          const jobs = await this.prisma.job.findMany({
            where: {
              status: JobStatus.PUBLISHED,
              id: { in: semantic.map((hit) => hit.id) },
              ...locationFilter,
            },
            include: publicJobInclude,
          });
          const byId = new Map(jobs.map((job) => [job.id, job]));
          const ranked = semantic
            .map((hit) => byId.get(hit.id))
            .filter((job): job is NonNullable<typeof job> => Boolean(job));
          if (ranked.length) return ranked;
        }
      } catch {
        // Meilisearch / Postgres fallback below.
      }
    }

    const hits = query ? await this.search.searchJobs(query) : null;
    const where: Prisma.JobWhereInput = {
      status: JobStatus.PUBLISHED,
      ...locationFilter,
      ...(hits ? { id: { in: hits.map((h) => h.id) } } : {}),
      ...(!hits && query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { requiredSkills: { hasSome: query.split(/\s+/).filter(Boolean) } },
            ],
          }
        : {}),
    };

    return this.prisma.job.findMany({
      where,
      include: publicJobInclude,
      orderBy: { createdAt: "desc" },
      take: 40,
    });
  }

  async getPublic(idOrSlug: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        status: JobStatus.PUBLISHED,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: { company: true },
    });
    if (!job) throw new NotFoundException("Offre introuvable.");
    return job;
  }

  async listMine(recruiterId: string) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    return this.prisma.job.findMany({
      where: { companyId },
      include: { _count: { select: { applications: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async update(
    recruiterId: string,
    id: string,
    data: {
      title?: string;
      description?: string;
      location?: string;
      remote?: boolean;
      contractType?: string;
      salaryMin?: number | null;
      salaryMax?: number | null;
      currency?: string;
      requiredSkills?: string[];
      status?: JobStatus;
    },
  ) {
    const companyId = await companyIdOf(this.prisma, recruiterId);
    const existing = await this.prisma.job.findFirst({ where: { id, companyId } });
    if (!existing) throw new ForbiddenException("Offre inaccessible.");

    // Explicit allow-list: never trust the request body to name the columns it writes.
    const patch: Prisma.JobUpdateInput = {};
    if (data.title !== undefined) patch.title = String(data.title).trim();
    if (data.description !== undefined) patch.description = String(data.description).trim();
    if (data.location !== undefined) patch.location = String(data.location).trim();
    if (data.remote !== undefined) patch.remote = Boolean(data.remote);
    if (data.contractType !== undefined) patch.contractType = String(data.contractType);
    if (data.currency !== undefined) patch.currency = String(data.currency);
    if (data.salaryMin !== undefined) patch.salaryMin = data.salaryMin === null ? null : Number(data.salaryMin);
    if (data.salaryMax !== undefined) patch.salaryMax = data.salaryMax === null ? null : Number(data.salaryMax);
    if (data.requiredSkills !== undefined) {
      if (!Array.isArray(data.requiredSkills) || data.requiredSkills.some((skill) => typeof skill !== "string")) {
        throw new BadRequestException("Compétences invalides.");
      }
      patch.requiredSkills = data.requiredSkills.map((skill) => skill.trim()).filter(Boolean);
    }
    if (data.status !== undefined) {
      if (!Object.values(JobStatus).includes(data.status)) throw new BadRequestException("Statut invalide.");
      patch.status = data.status;
    }
    if (patch.title === "" || patch.description === "" || patch.location === "") {
      throw new BadRequestException("Titre, description et lieu ne peuvent pas être vides.");
    }

    const job = await this.prisma.job.update({
      where: { id },
      data: patch,
      include: { company: true, _count: { select: { applications: true } } },
    });
    await this.search.indexJob({
      id: job.id,
      title: job.title,
      description: job.description,
      location: job.location,
      remote: job.remote,
      contractType: job.contractType,
      requiredSkills: job.requiredSkills,
      status: job.status,
      companyName: job.company.name,
    });
    if (data.title || data.description || data.requiredSkills) {
      await this.embeddings.indexJob(job.id, this.embeddings.jobText(job));
    }
    return job;
  }

  async create(
    recruiter: { id: string; companyId: string },
    data: {
      title: string;
      description: string;
      location: string;
      remote?: boolean;
      contractType?: string;
      salaryMin?: number;
      salaryMax?: number;
      currency?: string;
      requiredSkills: string[];
      status?: JobStatus;
    },
  ) {
    const job = await this.prisma.job.create({
      data: {
        ...data,
        slug: slugify(data.title),
        recruiterId: recruiter.id,
        companyId: recruiter.companyId,
        status: data.status ?? JobStatus.PUBLISHED,
      },
      include: { company: true },
    });
    await this.search.indexJob({
      id: job.id,
      title: job.title,
      description: job.description,
      location: job.location,
      remote: job.remote,
      contractType: job.contractType,
      requiredSkills: job.requiredSkills,
      status: job.status,
      companyName: job.company.name,
    });
    await this.embeddings.indexJob(job.id, this.embeddings.jobText(job));
    return job;
  }
}

const publicJobInclude = {
  company: { select: { name: true, slug: true, plan: true } },
  recruiter: { select: { title: true, user: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.JobInclude;

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 6)
  );
}
