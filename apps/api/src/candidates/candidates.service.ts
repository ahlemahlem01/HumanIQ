import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingsService } from "../ai/embeddings.service";
import { SearchService, type TalentDoc } from "../search/search.module";
import { sanitizeCvSettings } from "./cv-settings";
import { hasCvFile, readCvFile } from "./cv-storage";

const COVER_DIR = join(process.cwd(), "uploads", "covers");
const AVATAR_DIR = join(process.cwd(), "uploads", "avatars");
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

type ExperienceInput = {
  title: string;
  company: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current?: boolean;
  description?: string;
};

type EducationInput = {
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

type ProjectInput = {
  name: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

@Injectable()
export class CandidatesService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EmbeddingsService) private embeddings: EmbeddingsService,
    @Inject(SearchService) private search: SearchService,
  ) {}

  getMe(candidateId: string) {
    return this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        skillGaps: true,
        experiences: { orderBy: { startDate: "desc" } },
        educations: { orderBy: { startDate: "desc" } },
        projects: { orderBy: { createdAt: "desc" } },
        applications: { include: { job: true } },
      },
    });
  }

  async updateMe(
    candidateId: string,
    data: {
      headline?: string;
      bio?: string;
      location?: string;
      experienceYears?: number;
      skills?: string[];
      salaryMin?: number;
      salaryMax?: number;
      reverseRecruiting?: boolean;
      anonymousVisible?: boolean;
      linkedinUrl?: string;
      cvSettings?: unknown;
    },
  ) {
    const profile = await this.prisma.candidateProfile.update({
      where: { id: candidateId },
      data: {
        headline: data.headline,
        bio: data.bio,
        location: data.location,
        experienceYears: data.experienceYears,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        reverseRecruiting: data.reverseRecruiting,
        anonymousVisible: data.anonymousVisible,
        linkedinUrl: data.linkedinUrl === "" ? null : data.linkedinUrl,
        skills: data.skills ? { set: data.skills } : undefined,
        cvSettings: sanitizeCvSettings(data.cvSettings),
      },
    });

    const affectsVector =
      data.headline !== undefined ||
      data.bio !== undefined ||
      data.location !== undefined ||
      data.experienceYears !== undefined ||
      data.skills !== undefined;
    if (affectsVector) await this.refreshEmbedding(candidateId);
    else await this.syncTalent(candidateId);

    return profile;
  }

  setCover(candidateId: string, file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.saveImage(candidateId, file, COVER_DIR, "coverImage");
  }

  setAvatar(candidateId: string, file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.saveImage(candidateId, file, AVATAR_DIR, "avatarImage");
  }

  private async saveImage(
    candidateId: string,
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    dir: string,
    field: "coverImage" | "avatarImage",
  ) {
    const ext = file ? IMAGE_TYPES[file.mimetype] : undefined;
    if (!file?.buffer?.length || !ext) {
      throw new BadRequestException("Choisissez une image JPG, PNG ou WebP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException("L'image doit faire moins de 5 Mo.");
    }
    await mkdir(dir, { recursive: true });
    const current = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      select: { coverImage: true, avatarImage: true },
    });
    if (!current) throw new NotFoundException("Profil introuvable.");
    const name = `${candidateId}${ext}`;
    await writeFile(join(dir, name), file.buffer);
    const previous = current[field];
    if (previous && previous !== name) {
      await unlink(join(dir, previous)).catch(() => undefined);
    }
    return this.prisma.candidateProfile.update({
      where: { id: candidateId },
      data: { [field]: name },
      select: { [field]: true },
    });
  }

  addExperience(candidateId: string, data: ExperienceInput) {
    return this.saveExperience(candidateId, data);
  }

  async updateExperience(candidateId: string, id: string, data: ExperienceInput) {
    await this.ownExperience(candidateId, id);
    return this.saveExperience(candidateId, data, id);
  }

  async removeExperience(candidateId: string, id: string) {
    const removed = await this.prisma.candidateExperience.deleteMany({ where: { id, candidateId } });
    if (!removed.count) throw new NotFoundException("Expérience introuvable.");
    await this.refreshEmbedding(candidateId);
    return { ok: true };
  }

  addEducation(candidateId: string, data: EducationInput) {
    return this.saveEducation(candidateId, data);
  }

  async updateEducation(candidateId: string, id: string, data: EducationInput) {
    await this.ownEducation(candidateId, id);
    return this.saveEducation(candidateId, data, id);
  }

  async removeEducation(candidateId: string, id: string) {
    const removed = await this.prisma.candidateEducation.deleteMany({ where: { id, candidateId } });
    if (!removed.count) throw new NotFoundException("Formation introuvable.");
    await this.refreshEmbedding(candidateId);
    return { ok: true };
  }

  addProject(candidateId: string, data: ProjectInput) {
    return this.saveProject(candidateId, data);
  }

  async updateProject(candidateId: string, id: string, data: ProjectInput) {
    await this.ownProject(candidateId, id);
    return this.saveProject(candidateId, data, id);
  }

  async removeProject(candidateId: string, id: string) {
    const removed = await this.prisma.candidateProject.deleteMany({ where: { id, candidateId } });
    if (!removed.count) throw new NotFoundException("Projet introuvable.");
    return { ok: true };
  }

  private async saveExperience(candidateId: string, data: ExperienceInput, id?: string) {
    const payload = {
      title: data.title,
      company: data.company,
      location: data.location || null,
      startDate: new Date(data.startDate),
      endDate: data.current || !data.endDate ? null : new Date(data.endDate),
      current: Boolean(data.current),
      description: data.description || null,
    };
    const row = id
      ? await this.prisma.candidateExperience.update({ where: { id }, data: payload })
      : await this.prisma.candidateExperience.create({ data: { ...payload, candidateId } });
    await this.refreshEmbedding(candidateId);
    return row;
  }

  private async saveEducation(candidateId: string, data: EducationInput, id?: string) {
    const payload = {
      school: data.school,
      degree: data.degree || null,
      field: data.field || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      description: data.description || null,
    };
    const row = id
      ? await this.prisma.candidateEducation.update({ where: { id }, data: payload })
      : await this.prisma.candidateEducation.create({ data: { ...payload, candidateId } });
    await this.refreshEmbedding(candidateId);
    return row;
  }

  private async ownExperience(candidateId: string, id: string) {
    const row = await this.prisma.candidateExperience.findFirst({ where: { id, candidateId } });
    if (!row) throw new NotFoundException("Expérience introuvable.");
  }

  private async ownEducation(candidateId: string, id: string) {
    const row = await this.prisma.candidateEducation.findFirst({ where: { id, candidateId } });
    if (!row) throw new NotFoundException("Formation introuvable.");
  }

  private async saveProject(candidateId: string, data: ProjectInput, id?: string) {
    const payload = {
      name: data.name,
      url: data.url || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      description: data.description || null,
    };
    return id
      ? this.prisma.candidateProject.update({ where: { id }, data: payload })
      : this.prisma.candidateProject.create({ data: { ...payload, candidateId } });
  }

  private async ownProject(candidateId: string, id: string) {
    const row = await this.prisma.candidateProject.findFirst({ where: { id, candidateId } });
    if (!row) throw new NotFoundException("Projet introuvable.");
  }

  private async refreshEmbedding(candidateId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: { experiences: true, educations: true },
    });
    if (!profile) return;
    await this.embeddings.indexCandidate(
      profile.id,
      this.embeddings.profileText({
        ...profile,
        experienceLines: profile.experiences.map(
          (item) => `${item.title} chez ${item.company}. ${item.description ?? ""}`,
        ),
        educationLines: profile.educations.map(
          (item) => `${item.degree ?? ""} ${item.field ?? ""} — ${item.school}`,
        ),
      }),
    );
    await this.syncTalent(candidateId);
  }

  private talentDoc(row: {
    id: string;
    headline: string | null;
    bio: string | null;
    location: string | null;
    experienceYears: number;
    skills: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string;
    anonymousVisible: boolean;
    user: { firstName: string; lastName: string };
    experiences?: { title: string; company: string }[];
  }): TalentDoc {
    const full = `${row.user.firstName} ${row.user.lastName}`;
    return {
      id: row.id,
      headline: row.headline ?? "",
      location: row.location ?? "",
      experienceYears: row.experienceYears,
      skills: row.skills,
      bio: row.bio ?? "",
      background: (row.experiences ?? []).map((item) => `${item.title} ${item.company}`).join(" · "),
      searchName: row.anonymousVisible ? "" : full,
      displayName: row.anonymousVisible ? `${row.user.firstName[0]}. ${row.user.lastName[0]}.` : full,
      anonymous: row.anonymousVisible,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      currency: row.currency,
    };
  }

  /** Keeps the search index in step with the profile: only open profiles are searchable. */
  async syncTalent(candidateId: string) {
    try {
      const row = await this.prisma.candidateProfile.findUnique({
        where: { id: candidateId },
        include: { user: { select: { firstName: true, lastName: true } }, experiences: { select: { title: true, company: true } } },
      });
      if (!row || !row.reverseRecruiting) {
        await this.search.removeTalent(candidateId);
        return;
      }
      await this.search.indexTalent(this.talentDoc(row));
    } catch {
      // Search is an accelerator: a failed sync must never break a profile save.
    }
  }

  private talentsIndexed = false;

  /** Rebuilds the whole talent index from PostgreSQL (after bulk imports or seeding). */
  async rebuildTalentIndex() {
    await this.reindexTalents();
    return { indexed: this.talentsIndexed };
  }

  private async reindexTalents() {
    const rows = await this.prisma.candidateProfile.findMany({
      where: { reverseRecruiting: true },
      include: { user: { select: { firstName: true, lastName: true } }, experiences: { select: { title: true, company: true } } },
    });
    const ok = await this.search.replaceTalents(rows.map((row) => this.talentDoc(row)));
    this.talentsIndexed = ok;
  }

  async searchTalents(input: {
    q?: string;
    skills?: string[];
    location?: string;
    minYears?: number;
    maxYears?: number;
    limit?: number;
    offset?: number;
  }) {
    const q = String(input.q ?? "").trim().slice(0, 200);
    const skills = (input.skills ?? []).map((skill) => String(skill).trim()).filter(Boolean).slice(0, 8);
    const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 50);
    const offset = Math.max(Number(input.offset) || 0, 0);
    const started = Date.now();

    if (!this.talentsIndexed) await this.reindexTalents().catch(() => undefined);
    const result = this.talentsIndexed
      ? await this.search
          .searchTalents(q, { ...input, skills, limit, offset })
          .catch(() => null)
      : null;

    if (result) {
      const facet = (name: string) =>
        Object.entries((result.facetDistribution?.[name] ?? {}) as Record<string, number>)
          .filter(([value]) => value)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      return {
        source: "meilisearch" as const,
        total: result.estimatedTotalHits ?? result.hits.length,
        tookMs: result.processingTimeMs,
        hits: result.hits.map((hit) => {
          const doc = hit as unknown as TalentDoc & { _formatted?: { headline?: string; skills?: string[] } };
          return {
            id: doc.id,
            displayName: doc.displayName,
            anonymous: doc.anonymous,
            headline: doc.headline,
            location: doc.location,
            experienceYears: doc.experienceYears,
            skills: doc.skills,
            salaryMin: doc.salaryMin,
            salaryMax: doc.salaryMax,
            currency: doc.currency,
            highlight: { headline: doc._formatted?.headline ?? doc.headline, skills: doc._formatted?.skills ?? doc.skills },
          };
        }),
        facets: { skills: facet("skills"), location: facet("location") },
      };
    }

    // Fallback: Meilisearch is unavailable, filter the open profiles in PostgreSQL.
    const rows = await this.prisma.candidateProfile.findMany({
      where: { reverseRecruiting: true },
      include: { user: { select: { firstName: true, lastName: true } }, experiences: { select: { title: true, company: true } } },
    });
    const needle = q.toLowerCase();
    const docs = rows
      .map((row) => this.talentDoc(row))
      .filter((doc) => {
        if (skills.some((skill) => !doc.skills.includes(skill))) return false;
        if (input.location && doc.location !== input.location) return false;
        if (input.minYears != null && doc.experienceYears < input.minYears) return false;
        if (input.maxYears != null && doc.experienceYears > input.maxYears) return false;
        if (!needle) return true;
        return `${doc.headline} ${doc.skills.join(" ")} ${doc.searchName} ${doc.location} ${doc.bio} ${doc.background}`
          .toLowerCase()
          .includes(needle);
      });
    const count = (values: string[]) => {
      const map = new Map<string, number>();
      for (const value of values) if (value) map.set(value, (map.get(value) ?? 0) + 1);
      return Array.from(map, ([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    };
    return {
      source: "postgres" as const,
      total: docs.length,
      tookMs: Date.now() - started,
      hits: docs.slice(offset, offset + limit).map((doc) => ({
        id: doc.id,
        displayName: doc.displayName,
        anonymous: doc.anonymous,
        headline: doc.headline,
        location: doc.location,
        experienceYears: doc.experienceYears,
        skills: doc.skills,
        salaryMin: doc.salaryMin,
        salaryMax: doc.salaryMax,
        currency: doc.currency,
        highlight: { headline: doc.headline, skills: doc.skills },
      })),
      facets: { skills: count(docs.flatMap((doc) => doc.skills)), location: count(docs.map((doc) => doc.location)) },
    };
  }

  async viewsFor(candidateId: string) {
    const rows = await this.prisma.profileView.findMany({
      where: { candidateId },
      orderBy: { viewedAt: "desc" },
      include: {
        viewer: {
          select: {
            firstName: true,
            lastName: true,
            recruiter: { select: { title: true, company: { select: { name: true } } } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: `${row.viewer.firstName} ${row.viewer.lastName}`,
      title: row.viewer.recruiter?.title ?? null,
      company: row.viewer.recruiter?.company.name ?? null,
      viewedAt: row.viewedAt,
      count: row.count,
    }));
  }

  /**
   * Who may open a candidate's profile:
   * - the candidate applied to (or was imported into) a job of the recruiter's company: the company's own data,
   *   fully visible even before the company is verified;
   * - the candidate opted in to the talent pool and the recruiter's company is verified;
   * - an admin.
   */
  private async profileAccess(candidateId: string, viewerId: string) {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true, recruiter: { select: { companyId: true, company: { select: { verifiedAt: true } } } } },
    });
    const isAdmin = viewer?.role === "ADMIN";
    const companyId = viewer?.recruiter?.companyId;
    const applications = companyId
      ? await this.prisma.application.findMany({
          where: { candidateId, job: { companyId } },
          orderBy: { createdAt: "desc" },
          select: { id: true, stage: true, job: { select: { id: true, title: true } } },
        })
      : [];
    const own = isAdmin || applications.length > 0;
    if (!own) {
      const open = await this.prisma.candidateProfile.findFirst({
        where: { id: candidateId, reverseRecruiting: true, user: { anonymizedAt: null } },
        select: { id: true },
      });
      if (!open) throw new NotFoundException("Profil introuvable.");
      if (!viewer?.recruiter?.company.verifiedAt) {
        throw new ForbiddenException(
          "Votre entreprise est en cours de vérification. L'accès aux données des candidats sera ouvert dès sa validation.",
        );
      }
    }
    return { own, applications };
  }

  async openForRecruiter(candidateId: string, viewerId: string) {
    const { own, applications } = await this.profileAccess(candidateId, viewerId);
    const row = await this.prisma.candidateProfile.findFirst({
      where: { id: candidateId, user: { anonymizedAt: null } },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        experiences: { orderBy: { startDate: "desc" } },
        educations: { orderBy: { startDate: "desc" } },
      },
    });
    if (!row) throw new NotFoundException("Profil introuvable.");

    await this.prisma.profileView.upsert({
      where: { candidateId_viewerId: { candidateId, viewerId } },
      create: { candidateId, viewerId },
      update: { count: { increment: 1 }, viewedAt: new Date() },
    });
    const anonymous = row.anonymousVisible && !own;
    const imported = row.source === "LINKEDIN" || row.source === "PASTE";
    return {
      id: row.id,
      headline: row.headline,
      bio: row.bio,
      location: row.location,
      experienceYears: row.experienceYears,
      skills: row.skills,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      currency: row.currency,
      anonymous,
      displayName: anonymous ? `${row.user.firstName[0]}. ${row.user.lastName[0]}.` : `${row.user.firstName} ${row.user.lastName}`,
      source: row.source,
      own,
      // Everything below is only for the company's own candidates, never for anonymous pool profiles.
      linkedinUrl: own ? row.linkedinUrl : null,
      email: own && !imported ? row.user.email : null,
      applications: own ? applications : [],
      cv: own ? { hasFile: hasCvFile(row.id), fileName: row.cvFileName, text: row.cvText } : null,
      experiences: own
        ? row.experiences.map((item) => ({ id: item.id, title: item.title, company: item.company, current: item.current, description: item.description }))
        : [],
      educations: own ? row.educations.map((item) => ({ id: item.id, school: item.school, degree: item.degree, field: item.field })) : [],
    };
  }

  /** Original CV file, for the company's own candidates (same rule as the profile page). */
  async profileCvFile(candidateId: string, viewerId: string) {
    const { own } = await this.profileAccess(candidateId, viewerId);
    if (!own) throw new ForbiddenException("Le CV n'est pas accessible pour ce profil.");
    return this.cvFile(candidateId, viewerId);
  }

  async library() {
    const rows = await this.prisma.candidateProfile.findMany({
      where: {
        user: { anonymizedAt: null, role: "CANDIDATE" },
        OR: [{ cvFileName: { not: null } }, { NOT: { cvText: null } }],
      },
      include: { user: { select: { firstName: true, lastName: true, email: true, createdAt: true } } },
      orderBy: { user: { createdAt: "desc" } },
    });
    return rows
      .filter((row) => Boolean(row.cvFileName) || Boolean(row.cvText?.trim()))
      .map((row) => ({
        id: row.id,
        name: `${row.user.firstName} ${row.user.lastName}`,
        email: row.user.email,
        headline: row.headline,
        location: row.location,
        experienceYears: row.experienceYears,
        skills: row.skills,
        fileName: row.cvFileName,
        preview: (row.cvText ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      }));
  }

  /** Original CV file of a candidate, for recruiters. */
  async cvFile(candidateId: string, viewerId: string) {
    const row = await this.prisma.candidateProfile.findFirst({
      where: { id: candidateId, user: { anonymizedAt: null, role: "CANDIDATE" } },
      select: { id: true, cvFileName: true, cvMimeType: true },
    });
    if (!row || !hasCvFile(row.id)) throw new NotFoundException("Aucun fichier de CV déposé.");
    await this.prisma.profileView.upsert({
      where: { candidateId_viewerId: { candidateId, viewerId } },
      create: { candidateId, viewerId },
      update: { count: { increment: 1 }, viewedAt: new Date() },
    });
    return {
      buffer: await readCvFile(row.id),
      fileName: row.cvFileName ?? "cv",
      mimeType: row.cvMimeType ?? "application/octet-stream",
    };
  }

  async libraryOne(candidateId: string, viewerId: string) {
    const row = await this.prisma.candidateProfile.findFirst({
      where: {
        id: candidateId,
        user: { anonymizedAt: null, role: "CANDIDATE" },
        OR: [{ cvFileName: { not: null } }, { NOT: { cvText: null } }],
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        experiences: { orderBy: { startDate: "desc" } },
        educations: { orderBy: { startDate: "desc" } },
      },
    });
    if (!row || (!row.cvFileName && !row.cvText?.trim())) throw new NotFoundException("CV introuvable.");
    await this.prisma.profileView.upsert({
      where: { candidateId_viewerId: { candidateId, viewerId } },
      create: { candidateId, viewerId },
      update: { count: { increment: 1 }, viewedAt: new Date() },
    });
    return {
      id: row.id,
      name: `${row.user.firstName} ${row.user.lastName}`,
      email: row.user.email,
      headline: row.headline,
      bio: row.bio,
      location: row.location,
      experienceYears: row.experienceYears,
      skills: row.skills,
      fileName: row.cvFileName,
      hasFile: hasCvFile(row.id),
      cvText: row.cvText,
      experiences: row.experiences.map((item) => ({
        id: item.id,
        title: item.title,
        company: item.company,
        location: item.location,
        current: item.current,
        description: item.description,
      })),
      educations: row.educations.map((item) => ({
        id: item.id,
        school: item.school,
        degree: item.degree,
        field: item.field,
      })),
    };
  }

  async reversePool() {
    const rows = await this.prisma.candidateProfile.findMany({
      where: { reverseRecruiting: true },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      headline: row.headline,
      location: row.location,
      experienceYears: row.experienceYears,
      skills: row.skills,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      currency: row.currency,
      displayName: row.anonymousVisible
        ? `${row.user.firstName[0]}. ${row.user.lastName[0]}.`
        : `${row.user.firstName} ${row.user.lastName}`,
      anonymous: row.anonymousVisible,
    }));
  }
}
