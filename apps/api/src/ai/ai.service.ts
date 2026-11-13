import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingsService } from "./embeddings.service";
import { ParsingService, ParsedDocument } from "./parsing.service";
import { LLM_PROVIDER, LlmProvider } from "./providers/types";
import { BULLET_TIPS, SUMMARY_TIPS, VERB_STARTERS, analyzeBullets, localSummaries } from "./cv-assist";
import { auditCvDocument } from "./cv-ats";
import { parseCvProfile } from "./cv-profile";
import { deleteCvFile, saveCvFile } from "../candidates/cv-storage";
import {
  blendScores,
  extractSkillsFromText,
  scoreCvAgainstJob,
} from "./matching";
import { companyIdOf } from "../recruiters/company-scope";

@Injectable()
export class AiService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EmbeddingsService) private embeddings: EmbeddingsService,
    @Inject(ParsingService) private parsing: ParsingService,
    @Inject(LLM_PROVIDER) private llm: LlmProvider,
  ) {}

  status() {
    return {
      embeddings: {
        provider: this.embeddings.providerName,
        model: this.embeddings.activeModel,
      },
      llm: { provider: this.llm.name, model: this.llm.model },
      vectorSearch: "pgvector (cosine, HNSW)",
    };
  }

  /** Parses an uploaded CV file, then runs the same pipeline as pasted text. */
  async ingestCvFile(
    candidateId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const parsed = await this.parsing.extract(file);
    const result = await this.applyCv(candidateId, parsed.text, {
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      pageCount: parsed.pageCount,
    });
    if (file.buffer?.length) await saveCvFile(candidateId, file.buffer);
    return { ...result, document: this.documentSummary(parsed) };
  }

  async parseCvText(candidateId: string, cvText: string, fileName?: string) {
    // The text replaces the CV: an older original file would no longer match it.
    await deleteCvFile(candidateId).catch(() => undefined);
    return this.applyCv(candidateId, cvText, {
      fileName: fileName ?? "cv-colle.txt",
      mimeType: "text/plain",
      pageCount: null,
    });
  }

  private async applyCv(
    candidateId: string,
    cvText: string,
    meta: { fileName: string; mimeType: string; pageCount: number | null },
  ) {
    const existing = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!existing) throw new NotFoundException("Profil candidat introuvable.");

    const parsed = parseCvProfile(cvText, existing.user);
    await this.prisma.candidateProfile.update({
      where: { id: candidateId },
      data: {
        cvText,
        cvFileName: meta.fileName,
        cvMimeType: meta.mimeType,
        cvPageCount: meta.pageCount,
        skills: parsed.skills.length ? { set: parsed.skills } : undefined,
        experienceYears: parsed.experienceYears || undefined,
        headline: parsed.headline || undefined,
        bio: parsed.bio || undefined,
        location: parsed.location || undefined,
      },
    });

    if (parsed.experiences.length) {
      await this.prisma.candidateExperience.deleteMany({ where: { candidateId } });
      await this.prisma.candidateExperience.createMany({
        data: parsed.experiences.map((item) => ({ ...item, candidateId })),
      });
    }
    if (parsed.educations.length) {
      await this.prisma.candidateEducation.deleteMany({ where: { candidateId } });
      await this.prisma.candidateEducation.createMany({
        data: parsed.educations.map((item) => ({ ...item, candidateId })),
      });
    }

    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: { experiences: true, educations: true },
    });
    if (!profile) throw new NotFoundException("Profil candidat introuvable.");

    const indexed = await this.embeddings.indexCandidate(
      profile.id,
      this.embeddings.profileText({
        ...profile,
        experienceLines: profile.experiences.map((item) => `${item.title} chez ${item.company}. ${item.description ?? ""}`),
        educationLines: profile.educations.map((item) => `${item.degree ?? ""} ${item.field ?? ""} — ${item.school}`),
      }),
    );
    await this.rebuildSkillGaps(profile.id, profile.skills);

    return {
      profile: {
        id: profile.id,
        headline: profile.headline,
        location: profile.location,
        skills: profile.skills,
        experienceYears: profile.experienceYears,
        cvFileName: profile.cvFileName,
        cvMimeType: profile.cvMimeType,
        cvPageCount: profile.cvPageCount,
        experiences: profile.experiences.length,
        educations: profile.educations.length,
      },
      extracted: {
        skills: parsed.skills,
        experienceYears: parsed.experienceYears,
        characters: cvText.length,
      },
      embedding: { indexed, model: this.embeddings.activeModel },
    };
  }

  async cvAts(candidateId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      select: {
        headline: true,
        location: true,
        skills: true,
        cvText: true,
        cvFileName: true,
        cvMimeType: true,
        cvPageCount: true,
      },
    });
    if (!profile) throw new NotFoundException("Profil candidat introuvable.");
    const audit = auditCvDocument({
      cvText: profile.cvText ?? "",
      fileName: profile.cvFileName,
      mimeType: profile.cvMimeType,
      pageCount: profile.cvPageCount,
      headline: profile.headline,
      location: profile.location,
      skills: profile.skills,
    });
    return {
      fileName: profile.cvFileName,
      ...audit,
    };
  }

  /** Full ATS report: current CV dossier + hybrid score against every published job. */
  async cvReport(candidateId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: { skillGaps: true },
    });
    if (!profile) throw new NotFoundException("Profil candidat introuvable.");

    const jobs = await this.prisma.job.findMany({
      where: { status: "PUBLISHED", company: { verifiedAt: { not: null } } },
      include: { company: { select: { name: true, logoUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const semanticHits = await this.embeddings.jobsForCandidate(candidateId, 40);
    const semanticById = new Map(semanticHits.map((hit) => [hit.id, hit]));

    const matches = jobs
      .map((job) => {
        const keyword = scoreCvAgainstJob(profile, job);
        const semantic = semanticById.get(job.id);
        const blended = blendScores(keyword, semantic?.score ?? null);
        return {
          job: {
            id: job.id,
            title: job.title,
            location: job.location,
            remote: job.remote,
            requiredSkills: job.requiredSkills,
            company: job.company.name,
          },
          ...blended,
          matchedKeywords: keyword.matchedKeywords,
          missingKeywords: keyword.missingKeywords,
          coverage: keyword.coverage,
          similarity: semantic ? Number(semantic.similarity.toFixed(4)) : null,
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = matches[0]?.score ?? null;
    const avg = matches.length
      ? Math.round(matches.reduce((sum, item) => sum + item.score, 0) / matches.length)
      : null;

    const applied = await this.prisma.application.findMany({
      where: { candidateId },
      select: { jobId: true, stage: true, id: true },
    });
    const appliedByJob = Object.fromEntries(applied.map((row) => [row.jobId, row]));

    return {
      dossier: {
        headline: profile.headline,
        location: profile.location,
        experienceYears: profile.experienceYears,
        skills: profile.skills,
        cvFileName: profile.cvFileName,
        cvMimeType: profile.cvMimeType,
        cvPageCount: profile.cvPageCount,
        cvPreview: (profile.cvText ?? "").slice(0, 500),
        cvCharacters: profile.cvText?.length ?? 0,
        embedded: Boolean(profile.embeddingUpdatedAt),
        embeddingModel: profile.embeddingModel,
        embeddingUpdatedAt: profile.embeddingUpdatedAt,
      },
      stats: {
        jobsScanned: matches.length,
        bestScore: best,
        averageScore: avg,
        skillGaps: profile.skillGaps.length,
        readyCount: matches.filter((item) => item.score >= 70).length,
        gapCount: matches.filter((item) => item.score < 50).length,
      },
      appliedByJob,
      matches: matches.map((item) => ({
        ...item,
        applied: Boolean(appliedByJob[item.job.id]),
        applicationStage: appliedByJob[item.job.id]?.stage ?? null,
      })),
    };
  }

  /**
   * Stores the CV written in the Studio as the candidate's CV document (what recruiters and the ATS
   * audit read). Unlike parseCvText it never touches the structured experiences or education.
   */
  async publishCvDocument(candidateId: string, text: string) {
    const body = typeof text === "string" ? text.trim() : "";
    if (body.length < 80) throw new BadRequestException("Le CV est trop court pour être publié.");
    if (body.length > 30000) throw new BadRequestException("Le CV est trop long.");

    const profile = await this.prisma.candidateProfile.update({
      where: { id: candidateId },
      data: {
        cvText: body,
        cvFileName: "cv-humaniq.pdf",
        cvMimeType: "application/pdf",
        cvPageCount: Math.max(1, Math.ceil(body.length / 3200)),
      },
      include: { experiences: true, educations: true },
    });
    const indexed = await this.embeddings.indexCandidate(
      profile.id,
      this.embeddings.profileText({
        ...profile,
        experienceLines: profile.experiences.map((item) => `${item.title} chez ${item.company}. ${item.description ?? ""}`),
        educationLines: profile.educations.map((item) => `${item.degree ?? ""} ${item.field ?? ""} — ${item.school}`),
      }),
    );
    return { published: true, characters: body.length, pages: profile.cvPageCount, embedding: { indexed } };
  }

  /** Writing help in the CV Studio: summary variants, or a line-by-line review of experience bullets. */
  async assistCv(
    candidateId: string,
    input: {
      kind?: string;
      headline?: string;
      years?: number;
      skills?: string[];
      lastRole?: { title?: string; company?: string } | null;
      targetTitle?: string;
      text?: string;
      role?: { title?: string; company?: string } | null;
    },
  ) {
    const generatedBy = { provider: this.llm.name, model: this.llm.model };

    if (input.kind === "summary") {
      const profile = await this.prisma.candidateProfile.findUnique({
        where: { id: candidateId },
        include: { experiences: { orderBy: { startDate: "desc" }, take: 1 } },
      });
      const facts = {
        headline: input.headline ?? profile?.headline ?? "",
        years: input.years ?? profile?.experienceYears ?? 0,
        skills: input.skills ?? profile?.skills ?? [],
        lastRole: input.lastRole ?? (profile?.experiences[0] ? { title: profile.experiences[0].title, company: profile.experiences[0].company } : null),
        targetTitle: input.targetTitle,
      };
      let suggestions = localSummaries(facts);

      if (this.llm.name !== "local") {
        try {
          const raw = await this.llm.complete({
            system:
              'Tu écris des résumés de CV en français. Tu n\'inventes JAMAIS un fait, un chiffre, une techno ou un employeur absents des données. Réponds UNIQUEMENT en JSON {"suggestions":["",""]}.',
            prompt: [
              `TITRE: ${facts.headline}`,
              `ANNEES: ${facts.years}`,
              `COMPETENCES: ${facts.skills.join(", ")}`,
              `DERNIER_POSTE: ${facts.lastRole?.title ?? "-"} ${facts.lastRole?.company ? `chez ${facts.lastRole.company}` : ""}`,
              `POSTE_VISE: ${facts.targetTitle ?? "-"}`,
              "2 variantes de 40 à 70 mots, sans première personne, sans adjectifs creux.",
            ].join("\n"),
            maxTokens: 500,
          });
          const parsed = extractJsonObject(raw);
          if (Array.isArray(parsed?.suggestions) && parsed.suggestions.length) {
            suggestions = parsed.suggestions.map((item: unknown) => String(item)).slice(0, 3);
          }
        } catch {
          // keep the local suggestions
        }
      }
      return { kind: "summary", suggestions, tips: SUMMARY_TIPS, generatedBy };
    }

    if (input.kind === "bullets") {
      const lines = analyzeBullets(String(input.text ?? ""));
      return {
        kind: "bullets",
        lines,
        verbs: VERB_STARTERS,
        tips: BULLET_TIPS,
        generatedBy: { provider: "local", model: "rules-v1" },
      };
    }

    throw new BadRequestException("Type d'aide inconnu.");
  }

  /** Honest CV rewrite hints for a target job — never invents experience. */
  async rewriteForJob(candidateId: string, jobId: string) {
    const match = await this.matchJob(candidateId, jobId);
    const profile = await this.prisma.candidateProfile.findUnique({ where: { id: candidateId } });
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true, requiredSkills: true, company: { select: { name: true } } },
    });
    if (!profile || !job) throw new NotFoundException("Profil ou offre introuvable.");

    const local = this.localRewrite(job.title, match.matchedKeywords, match.missingKeywords, profile.skills);

    if (this.llm.name === "local") {
      return { ...local, generatedBy: { provider: this.llm.name, model: this.llm.model }, match };
    }

    const raw = await this.llm.complete({
      system:
        "Tu es un coach CV ATS. Tu n'inventes JAMAIS une techno absente du profil. Réponds UNIQUEMENT en JSON {\"headline\":\"\",\"bullets\":[\"\"],\"warning\":\"\"}.",
      prompt: [
        `OFFRE: ${job.title} (${job.company.name})`,
        `PROFIL: ${(profile.cvText ?? "").slice(0, 2500)}`,
        `SKILLS: ${profile.skills.join(", ")}`,
        `MANQUE: ${match.missingKeywords.join(", ") || "aucun"}`,
        `PRESENTS: ${match.matchedKeywords.join(", ") || "aucun"}`,
        "3 à 5 puces CV en français, style réalisations (verbe + contexte + résultat). headline: une ligne de profil.",
        "Si un mot-clé manquant n'apparaît pas dans le CV, dis-le dans warning et propose une formulation conditionnelle.",
      ].join("\n"),
      maxTokens: 700,
    });

    const parsed = extractJsonObject(raw);
    if (!parsed?.bullets || !Array.isArray(parsed.bullets)) {
      return { ...local, generatedBy: { provider: this.llm.name, model: this.llm.model }, match };
    }
    return {
      headline: String(parsed.headline ?? local.headline),
      bullets: parsed.bullets.map((item: unknown) => String(item)).slice(0, 6),
      warning: String(parsed.warning ?? ""),
      generatedBy: { provider: this.llm.name, model: this.llm.model },
      match,
    };
  }

  private localRewrite(title: string, matched: string[], missing: string[], skills: string[]) {
    const bullets = [
      matched.length
        ? `Mettez en tête une puce qui cite ${matched.slice(0, 3).join(", ")} avec un résultat chiffré.`
        : `Ouvrez le CV par une ligne de profil alignée sur « ${title} ».`,
      ...missing.map(
        (keyword) =>
          `Si vous avez déjà utilisé ${keyword}, ajoutez : « Conçu / opéré … avec ${keyword} (impact mesurable). » Ne l'inventez pas.`,
      ),
      skills.length
        ? `Regroupez vos compétences en une ligne ATS : ${skills.slice(0, 8).join(" · ")}.`
        : "Ajoutez une section Compétences en mots-clés bruts lisibles par un parseur.",
      "Placez les mots-clés du poste dans le tiers supérieur (titre, résumé, première puce) — les parseurs ATS les pondèrent plus.",
    ].slice(0, 6);
    return {
      headline: matched.length
        ? `${matched.slice(0, 3).join(" / ")} — profil orienté ${title}`
        : `Profil à recentrer sur ${title}`,
      bullets,
      warning: missing.length
        ? `Mots-clés absents du CV : ${missing.join(", ")}. Ne les ajoutez que s'ils correspondent à une expérience réelle.`
        : "",
    };
  }

  /** Hybrid score: pgvector cosine similarity blended with literal keyword coverage. */
  async matchJob(candidateId: string, jobId: string) {
    const [profile, job] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { id: candidateId } }),
      this.prisma.job.findUnique({ where: { id: jobId } }),
    ]);
    if (!profile || !job) throw new NotFoundException("Profil ou offre introuvable.");

    const keyword = scoreCvAgainstJob(profile, job);
    const semantic = await this.embeddings.similarity(candidateId, jobId);
    const blended = blendScores(keyword, semantic?.score ?? null);

    return {
      ...blended,
      matchedKeywords: keyword.matchedKeywords,
      missingKeywords: keyword.missingKeywords,
      coverage: keyword.coverage,
      similarity: semantic?.similarity ?? null,
      model: semantic?.model ?? null,
      method: semantic ? "hybrid" : "keyword-only",
    };
  }

  async recommendJobs(candidateId: string, limit = 10) {
    const hits = await this.embeddings.jobsForCandidate(candidateId, limit);
    if (!hits.length) return [];

    const [jobs, profile] = await Promise.all([
      this.prisma.job.findMany({
        where: { id: { in: hits.map((hit) => hit.id) }, status: "PUBLISHED", company: { verifiedAt: { not: null } } },
        include: { company: { select: { name: true, logoUrl: true } } },
      }),
      this.prisma.candidateProfile.findUnique({ where: { id: candidateId } }),
    ]);
    const byId = new Map(jobs.map((job) => [job.id, job]));

    return hits
      .map((hit) => {
        const job = byId.get(hit.id);
        if (!job) return null;
        // Same hybrid score as matchJob(), so lists and detail views agree.
        const blended = profile ? blendScores(scoreCvAgainstJob(profile, job), hit.score) : null;
        return {
          score: blended?.score ?? hit.score,
          semanticScore: hit.score,
          similarity: Number(hit.similarity.toFixed(4)),
          job: {
            id: job.id,
            title: job.title,
            location: job.location,
            remote: job.remote,
            requiredSkills: job.requiredSkills,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            currency: job.currency,
            company: job.company.name,
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async rankCandidatesForJob(jobId: string, recruiterId: string, limit = 10) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, companyId: await companyIdOf(this.prisma, recruiterId) },
    });
    if (!job) throw new NotFoundException("Offre inaccessible.");

    const hits = await this.embeddings.candidatesForJob(jobId, limit);
    if (!hits.length) return { job: { id: job.id, title: job.title }, talents: [] };

    const profiles = await this.prisma.candidateProfile.findMany({
      where: { id: { in: hits.map((hit) => hit.id) } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));

    const talents = hits
      .map((hit) => {
        const profile = byId.get(hit.id);
        if (!profile) return null;
        const keyword = scoreCvAgainstJob(profile, job);
        const blended = blendScores(keyword, hit.score);
        return {
          id: profile.id,
          displayName: profile.anonymousVisible
            ? `${profile.user.firstName[0]}. ${profile.user.lastName[0]}.`
            : `${profile.user.firstName} ${profile.user.lastName}`,
          anonymous: profile.anonymousVisible,
          headline: profile.headline,
          location: profile.location,
          experienceYears: profile.experienceYears,
          skills: profile.skills,
          salaryMin: profile.salaryMin,
          salaryMax: profile.salaryMax,
          ...blended,
          missingKeywords: keyword.missingKeywords,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.score - a.score);

    return { job: { id: job.id, title: job.title }, talents };
  }

  /** Natural-language feedback on a candidate's fit, written by the LLM when configured. */
  async jobFeedback(candidateId: string, jobId: string) {
    const match = await this.matchJob(candidateId, jobId);
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true, description: true, requiredSkills: true },
    });
    if (!job) throw new NotFoundException("Offre introuvable.");

    const prompt = [
      `TITLE: ${job.title}`,
      `SCORE: ${match.score}`,
      `SEMANTIC: ${match.semanticScore ?? "-"}`,
      `KEYWORD: ${match.keywordScore}`,
      `MATCHED: ${match.matchedKeywords.join(", ") || "-"}`,
      `MISSING: ${match.missingKeywords.join(", ") || "-"}`,
      `REQUIRED: ${job.requiredSkills.join(", ")}`,
      "",
      "Rédige un feedback de candidature en français, en 3 courts paragraphes :",
      "1) le verdict d'adéquation, 2) les points forts, 3) les actions concrètes pour combler les écarts.",
      "Reste factuel, n'invente aucune expérience non listée, et vouvoie le candidat.",
    ].join("\n");

    const feedback = await this.llm.complete({
      system:
        "Tu es un conseiller carrière spécialisé en recrutement tech. Tu es honnête, concret et bienveillant. Tu ne surestimes jamais un profil.",
      prompt,
      maxTokens: 700,
    });

    return {
      feedback,
      match,
      generatedBy: { provider: this.llm.name, model: this.llm.model },
    };
  }

  listSalaryBenchmarks() {
    return this.prisma.salaryBenchmark.findMany({
      orderBy: [{ location: "asc" }, { role: "asc" }],
      select: { role: true, tech: true, location: true, p25: true, p50: true, p75: true, currency: true },
    });
  }

  async salaryBenchmark(role: string, tech: string, location: string) {
    const exact = await this.prisma.salaryBenchmark.findFirst({
      where: {
        role: { contains: role, mode: "insensitive" },
        tech: { contains: tech, mode: "insensitive" },
        location: { contains: location, mode: "insensitive" },
      },
    });
    if (exact) return exact;
    return this.prisma.salaryBenchmark.findFirst({
      where: { role: { contains: role, mode: "insensitive" } },
    });
  }

  async skillGapForOffer(candidateId: string, description: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      select: { skills: true, cvText: true },
    });
    if (!profile) throw new NotFoundException("Profil candidat introuvable.");

    const required = extractSkillsFromText(description);
    const owned = new Set(
      extractSkillsFromText(`${profile.cvText ?? ""}\n${profile.skills.join("\n")}`).map((skill) => skill.toLowerCase()),
    );
    for (const skill of profile.skills) owned.add(skill.toLowerCase());

    const items = required.map((skill) => {
      const present = owned.has(skill.toLowerCase());
      return { skill, present, currentLevel: present ? 100 : 0 };
    });
    const covered = items.filter((item) => item.present).length;

    return {
      required: items.length,
      covered,
      items,
    };
  }

  private documentSummary(parsed: ParsedDocument) {
    return {
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      pageCount: parsed.pageCount,
      characters: parsed.characters,
      preview: parsed.text.slice(0, 400),
    };
  }

  private async rebuildSkillGaps(candidateId: string, skills: string[]) {
    const market = ["TypeScript", "React", "PostgreSQL", "Docker", "System Design", "Kubernetes"];
    await this.prisma.skillGap.deleteMany({ where: { candidateId } });
    const rows = market.map((skill) => {
      const has = skills.some((s) => s.toLowerCase() === skill.toLowerCase());
      return {
        candidateId,
        skill,
        currentLevel: has ? 70 : 28,
        marketLevel: 80,
        recommendedTraining: has
          ? `Approfondir ${skill} via un projet de production.`
          : `Formation recommandée : ${skill} — parcours 4 semaines.`,
      };
    });
    await this.prisma.skillGap.createMany({ data: rows });
  }

  async draftJob(recruiterId: string, input: { context?: string; brief: string }) {
    const recruiter = await this.prisma.recruiterProfile.findUnique({
      where: { id: recruiterId },
      include: { company: true },
    });
    if (!recruiter) throw new NotFoundException("Profil recruteur introuvable.");

    const company = recruiter.company.name;
    const raw = await this.llm.complete({
      system:
        "Tu rédiges une offre d'emploi en français. Réponds uniquement avec un objet JSON, sans texte autour.",
      prompt: [
        `COMPANY: ${company}`,
        `RECRUITER_LOCATION: ${recruiter.location ?? ""}`,
        `CONTEXT: ${(input.context ?? "").trim() || "-"}`,
        `BRIEF: ${input.brief.trim()}`,
        'Clés JSON: title, description, location, contractType (CDI, CDD, Stage ou Freelance), remote (booléen), skills (tableau de 3 à 6 chaînes), currency ("TND"), salaryMin (nombre ou null, brut mensuel en dinars), salaryMax (nombre ou null).',
        "Si le texte ne donne pas de salaire, mets null. N'invente pas de chiffres.",
        "description : deux paragraphes minimum, à partir du contexte et du besoin fournis.",
      ].join("\n"),
      maxTokens: 900,
    });

    const parsed = extractJsonObject(raw);
    const fromModel = parsed ? normalizeJobDraft(parsed) : null;
    if (fromModel) return { ...fromModel, source: "model" as const };
    return {
      ...buildJobDraft(company, recruiter.location, input.context ?? "", input.brief),
      source: "draft" as const,
    };
  }
}

const CONTRACTS = ["CDI", "CDD", "Stage", "Freelance"] as const;
const CITIES = ["Ariana", "Tunis", "La Marsa", "Le Bardo", "Sousse", "Sfax", "Monastir", "Nabeul", "Paris", "Lyon"];
const EXTRA_SKILLS = ["Shopify", "Flutter", "Dart", "Swift", "Kotlin", "Excel", "Power BI", "WordPress", "Figma"];
const FILLER = new Set([
  "talentueux", "talentueuse", "ponctuel", "ponctuelle", "motivé", "motivée", "motive",
  "sérieux", "serieux", "dynamique", "polyvalent", "polyvalente", "préciser", "preciser",
]);

type JobDraft = {
  title: string;
  description: string;
  location: string;
  contractType: (typeof CONTRACTS)[number];
  remote: boolean;
  skills: string[];
  currency: "TND";
  salaryMin: number | null;
  salaryMax: number | null;
};

function normalizeJobDraft(raw: Record<string, unknown>): JobDraft | null {
  const title = text(raw.title);
  const description = text(raw.description);
  const location = text(raw.location);
  if (title.length < 3 || description.length < 20 || location.length < 2) return null;
  const contract = CONTRACTS.find((item) => item.toLowerCase() === text(raw.contractType).toLowerCase()) ?? "CDI";
  const skills = Array.isArray(raw.skills)
    ? raw.skills.map((item) => text(item)).filter((item) => item.length > 1).slice(0, 8)
    : [];
  return {
    title: title.slice(0, 120),
    description,
    location: location.slice(0, 80),
    contractType: contract,
    remote: raw.remote === true || raw.remote === "true",
    skills: skills.filter((skill) => skill.toLowerCase() !== "à préciser" && !FILLER.has(skill.toLowerCase())),
    currency: "TND",
    salaryMin: money(raw.salaryMin),
    salaryMax: money(raw.salaryMax),
  };
}

function buildJobDraft(company: string, recruiterLocation: string | null, context: string, brief: string): JobDraft {
  const source = `${context}\n${brief}`;
  const lowered = source.toLowerCase();
  const catalog = extractSkillsFromText(source);
  const extras = EXTRA_SKILLS.filter((skill) => new RegExp(`(^|[^a-z0-9])${skill.toLowerCase()}([^a-z0-9]|$)`, "i").test(lowered));
  const skills = [...new Set([...catalog, ...extras])].slice(0, 6);
  const city = CITIES.find((name) => lowered.includes(name.toLowerCase())) ?? (recruiterLocation?.trim() || "Tunis");
  const contractType = /freelance|independant|indépendant/.test(lowered)
    ? "Freelance"
    : /stage|\bpfe\b|alternance/.test(lowered)
      ? "Stage"
      : /\bcdd\b/.test(lowered)
        ? "CDD"
        : "CDI";
  const remote = /teletravail|télétravail|remote|hybride|distanciel/.test(lowered);
  const title = guessTitle(brief, company);
  const kept = skills.filter((skill) => !FILLER.has(skill.toLowerCase()));
  const team = context.trim();
  const mission = brief.trim();
  const contractLabel = { CDI: "en CDI", CDD: "en CDD", Stage: "en stage", Freelance: "en freelance" }[contractType];
  const place = city ? ` à ${city}` : "";
  const way = remote ? ", avec du télétravail" : "";
  const profile = kept.length
    ? `Vous maîtrisez ${kept.join(", ")}.`
    : "Vous apportez une pratique concrète du métier annoncé.";
  return {
    title,
    description: [
      `${company} recherche ${withArticle(title)} ${title} ${contractLabel}${place}${way}.`,
      "",
      ...(team ? [team, ""] : []),
      "Mission",
      writtenMission(mission, title, company, kept),
      "",
      "Profil",
      profile,
      "Vous travaillez en autonomie, vous écrivez clairement, et vous tenez les délais convenus.",
    ].join("\n"),
    location: city,
    contractType,
    remote,
    skills: kept.length ? kept : [title.split(" ")[0]],
    currency: "TND",
    salaryMin: null,
    salaryMax: null,
  };
}

function writtenMission(brief: string, title: string, company: string, skills: string[]) {
  const words = brief
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => !FILLER.has(word.toLowerCase().replace(/[.,;:]+$/g, "")));
  const cleaned = words.join(" ");
  if (cleaned.length > 140) return cleaned;
  const focus = `${title} ${skills.join(" ")}`;
  if (/shopify/i.test(focus)) {
    return "Vous faites évoluer la boutique Shopify : thèmes, pages et corrections demandées par l'équipe. Vous partez d'un besoin précis, vous livrez un résultat utilisable, et vous expliquez ce qui a changé.";
  }
  if (/flutter|react|développeur|developpeur/i.test(focus)) {
    return `Vous développez et faites évoluer le produit avec ${company}. Vous partez d'un besoin, vous livrez, et vous laissez le code dans un état clair.`;
  }
  const named = skills.length ? skills.join(", ") : title;
  return `Vous prenez en main les sujets liés à ${named} pour ${company}. À partir du besoin, vous proposez, vous livrez, et vous laissez une trace claire de ce qui a changé.`;
}

function withArticle(title: string) {
  return /e$/i.test(title.split(" ")[0] ?? "") && !/développeur|developpeur|ingénieur|ingenieur/i.test(title) ? "une" : "un";
}

function guessTitle(brief: string, company: string) {
  const cleaned = brief.replace(/\s+/g, " ").trim();
  if (/d[ée]veloppeur|developpeur/i.test(cleaned) && /shopify/i.test(cleaned)) return "Développeur Shopify";
  if (/shopify/i.test(cleaned)) return "Spécialiste Shopify";
  const role = cleaned.match(
    /\b((?:développeuse|développeur|developpeur|ingénieure|ingénieur|ingenieur|designer|chargée|chargé|stagiaire)(?:\s+[A-Za-zÀ-ÿ.+#]{2,}){0,3})/i,
  );
  if (role) {
    const parts = trimTail(role[1])
      .split(/\s+/)
      .filter((word) => !FILLER.has(word.toLowerCase()))
      .slice(0, 3)
      .map(polishWord);
    if (parts.length) return parts.join(" ");
  }
  const lead = cleaned.match(/(?:cherch\w*|recrut\w*|besoin d['’]un(?:e)?|poste de)\s+(?:un|une|le|la|des)?\s*([^.,]{3,60})/i);
  if (lead) {
    const title = trimTail(lead[1]);
    if (title.length >= 3) return capitalize(title);
  }
  const first = cleaned.split(/[.!?]/)[0]?.trim() ?? "";
  if (first.length >= 8 && first.length <= 80) return capitalize(first);
  return `Nouveau poste chez ${company}`;
}

function trimTail(value: string) {
  return value.replace(/\s+(?:pour|en|de|du|des|d'|à|a)\b.*$/i, "").trim();
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function polishWord(word: string) {
  const known: Record<string, string> = {
    developpeur: "Développeur",
    développeur: "Développeur",
    developpeuse: "Développeuse",
    développeuse: "Développeuse",
    ingenieur: "Ingénieur",
    ingénieur: "Ingénieur",
    shopify: "Shopify",
    flutter: "Flutter",
    react: "React",
  };
  return known[word.toLowerCase()] ?? capitalize(word);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount);
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
