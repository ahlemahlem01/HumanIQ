import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { LocalEmbeddingProvider } from "../src/ai/providers/local-embedding.provider";
import { OpenAIEmbeddingProvider } from "../src/ai/providers/openai-embedding.provider";
import { toPgVector } from "../src/ai/providers/types";

const prisma = new PrismaClient();

const espritOffers = [
  {
    title: "Développeur fullstack",
    slug: "esprit-developpeur-fullstack",
    description:
      "Vous construisez les outils internes de l'école : portail étudiant, suivi des stages et espace recruteur. Stack TypeScript, React et NestJS, avec une équipe de cinq personnes à Ariana.",
    location: "Ariana",
    remote: true,
    contractType: "CDI",
    salaryMin: 26400,
    salaryMax: 42000,
    currency: "TND",
    requiredSkills: ["TypeScript", "React", "NestJS"],
  },
  {
    title: "Ingénieur data",
    slug: "esprit-ingenieur-data",
    description:
      "Vous préparez les données des candidatures et des alumni, puis des tableaux de bord pour les responsables de filière. Python, SQL et PostgreSQL au quotidien.",
    location: "Tunis",
    remote: false,
    contractType: "CDI",
    salaryMin: 30000,
    salaryMax: 48000,
    currency: "TND",
    requiredSkills: ["Python", "SQL", "PostgreSQL"],
  },
  {
    title: "Designer produit",
    slug: "esprit-designer-produit",
    description:
      "Vous dessinez les parcours candidats et étudiants, du design system jusqu'aux écrans de candidature. Figma, accessibilité et revues avec les équipes pédagogiques.",
    location: "Ariana",
    remote: true,
    contractType: "CDI",
    salaryMin: 21600,
    salaryMax: 33600,
    currency: "TND",
    requiredSkills: ["Figma", "Design System", "Accessibilité"],
  },
  {
    title: "Chargé de recrutement campus",
    slug: "esprit-charge-recrutement",
    description:
      "Vous organisez les forums entreprises, qualifiez les profils étudiants et suivez les offres de stage et de premier emploi avec les partenaires.",
    location: "Ariana",
    remote: false,
    contractType: "CDI",
    salaryMin: 16800,
    salaryMax: 24000,
    currency: "TND",
    requiredSkills: ["Recrutement", "Communication"],
  },
  {
    title: "Stage PFE développement mobile",
    slug: "esprit-stage-mobile",
    description:
      "Stage de fin d'études pour livrer une application mobile de suivi des candidatures. Flutter, revues de code hebdomadaires et démonstration en fin de semestre.",
    location: "Ariana",
    remote: false,
    contractType: "Stage",
    salaryMin: 8400,
    salaryMax: 10800,
    currency: "TND",
    requiredSkills: ["Flutter", "Dart"],
  },
];

const openaiKey = process.env.OPENAI_API_KEY?.trim();
const embedder = openaiKey
  ? new OpenAIEmbeddingProvider(openaiKey)
  : new LocalEmbeddingProvider();

async function main() {
  await prisma.postLike.deleteMany();
  await prisma.postComment.deleteMany();
  await prisma.postSave.deleteMany();
  await prisma.postRepost.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.post.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.candidateExperience.deleteMany();
  await prisma.candidateEducation.deleteMany();
  await prisma.profileView.deleteMany();
  await prisma.candidateProject.deleteMany();
  await prisma.application.deleteMany();
  await prisma.skillGap.deleteMany();
  await prisma.job.deleteMany();
  await prisma.recruiterProfile.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.company.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.salaryBenchmark.deleteMany();

  const password = await bcrypt.hash("Demo1234!", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@nextgen.hr",
      messageEmails: false,
      passwordHash: password,
      role: "ADMIN",
      firstName: "Ines",
      lastName: "Khelifi",
      gdprConsentAt: new Date(),
    },
  });

  const company = await prisma.company.create({
    data: {
      name: "Atlas Labs",
      slug: "atlas-labs",
      description: "Produit data & IA pour l'industrie.",
      website: "https://atlas-labs.example",
      plan: "GROWTH",
      subscriptionStatus: "active",
      seats: 12,
    },
  });

  const recruiter = await prisma.user.create({
    data: {
      email: "recruteur@atlas.tech",
      messageEmails: false,
      passwordHash: password,
      role: "RECRUITER",
      firstName: "Karim",
      lastName: "Ben Ali",
      gdprConsentAt: new Date(),
      recruiter: {
        create: { companyId: company.id, title: "Talent Lead" },
      },
    },
    include: { recruiter: true },
  });

  const candidate = await prisma.user.create({
    data: {
      email: "candidat@mail.com",
      messageEmails: false,
      passwordHash: password,
      role: "CANDIDATE",
      firstName: "Leila",
      lastName: "Mansouri",
      gdprConsentAt: new Date(),
      candidate: {
        create: {
          headline: "Ingénieure fullstack TypeScript",
          bio: "5 ans à construire des produits B2B. Passionnée par le matching sémantique et l'UX métier.",
          location: "Paris",
          experienceYears: 5,
          skills: ["TypeScript", "React", "NestJS", "PostgreSQL", "Docker"],
          salaryMin: 55000,
          salaryMax: 70000,
          reverseRecruiting: true,
          anonymousVisible: true,
          cvText:
            "Leila Mansouri, 5 ans d'expérience. TypeScript, React, Next.js, NestJS, PostgreSQL, Docker. Lead technique sur un ATS interne. Paris / remote.",
          cvFileName: "cv-leila.pdf",
          experiences: {
            create: [
              {
                title: "Lead technique",
                company: "Studio interne",
                location: "Paris",
                startDate: new Date("2022-03-01"),
                current: true,
                description: "ATS interne, pipeline de candidatures et APIs TypeScript.",
              },
              {
                title: "Développeuse fullstack",
                company: "Northwind",
                location: "Lyon",
                startDate: new Date("2019-06-01"),
                endDate: new Date("2022-02-01"),
                description: "Produits B2B React et NestJS.",
              },
            ],
          },
          educations: {
            create: [
              {
                school: "Université Paris Cité",
                degree: "Master",
                field: "Informatique",
                startDate: new Date("2017-09-01"),
                endDate: new Date("2019-06-01"),
              },
            ],
          },
        },
      },
    },
    include: { candidate: true },
  });

  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      recruiterId: recruiter.recruiter!.id,
      title: "Senior Software Engineer — Plateforme Talent",
      slug: "senior-software-engineer-talent",
      description:
        "Vous concevez le moteur de matching IA, le pipeline Kanban collaboratif et les APIs temps réel de notre ATS. Stack : TypeScript, NestJS, PostgreSQL, pgvector, React.",
      location: "Paris",
      remote: true,
      contractType: "CDI",
      salaryMin: 60000,
      salaryMax: 80000,
      requiredSkills: ["TypeScript", "NestJS", "PostgreSQL", "React", "Docker"],
      status: "PUBLISHED",
    },
  });

  await prisma.job.create({
    data: {
      companyId: company.id,
      recruiterId: recruiter.recruiter!.id,
      title: "Product Designer HR Tech",
      slug: "product-designer-hr-tech",
      description:
        "Design system, accessibilité WCAG 2.1, parcours candidat et cockpit recruteur. Collaboration étroite avec l'équipe IA.",
      location: "Tunis",
      remote: true,
      contractType: "CDI",
      salaryMin: 30000,
      salaryMax: 48000,
      currency: "TND",
      requiredSkills: ["Figma", "Product", "Accessibilité", "Design System"],
      status: "PUBLISHED",
    },
  });

  const espritPassword = await bcrypt.hash("boss@1234", 10);
  const esprit = await prisma.company.create({
    data: {
      name: "ESPRIT",
      slug: "esprit",
      description: "École supérieure privée d'ingénierie et de technologie.",
      plan: "STARTER",
      subscriptionStatus: "active",
    },
  });
  const ahlem = await prisma.user.create({
    data: {
      email: "ahlem.alaya@esprit.tn",
      messageEmails: false,
      passwordHash: espritPassword,
      role: "RECRUITER",
      firstName: "Ahlem",
      lastName: "Alaya",
      gdprConsentAt: new Date(),
      emailVerifiedAt: new Date(),
      recruiter: { create: { companyId: esprit.id, title: "Recruteuse" } },
    },
    include: { recruiter: true },
  });
  for (const offer of espritOffers) {
    await prisma.job.create({
      data: {
        ...offer,
        companyId: esprit.id,
        recruiterId: ahlem.recruiter!.id,
        status: "PUBLISHED",
      },
    });
  }

  await prisma.application.create({
    data: {
      jobId: job.id,
      candidateId: candidate.candidate!.id,
      stage: "PRESELECTION",
      kanbanOrder: 0,
      atsScore: 86,
      semanticScore: 88,
      keywordScore: 84,
      keywordSuggestions: ["Kubernetes"],
      coverNote: "J'ai déjà construit un ATS interne — ravie d'en faire un produit.",
      assessments: {
        create: {
          type: "CULTURE",
          title: "Fit culturel Atlas",
          score: 82,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      },
    },
  });

  await prisma.skillGap.createMany({
    data: [
      {
        candidateId: candidate.candidate!.id,
        skill: "Kubernetes",
        currentLevel: 32,
        marketLevel: 78,
        recommendedTraining: "CKA crash course + lab cluster k3d (3 semaines).",
      },
      {
        candidateId: candidate.candidate!.id,
        skill: "System Design",
        currentLevel: 55,
        marketLevel: 80,
        recommendedTraining: "Atelier architecture événementielle — 2 projets guidés.",
      },
    ],
  });

  await prisma.salaryBenchmark.createMany({
    data: [
      { role: "Software Engineer", tech: "TypeScript", location: "Paris", p25: 48000, p50: 62000, p75: 78000, currency: "EUR" },
      { role: "Product Designer", tech: "Figma", location: "Paris", p25: 40000, p50: 52000, p75: 65000, currency: "EUR" },
      { role: "Software Engineer", tech: "TypeScript", location: "Tunis", p25: 24000, p50: 42000, p75: 72000, currency: "TND" },
      { role: "Product Designer", tech: "Figma", location: "Tunis", p25: 21600, p50: 36000, p75: 60000, currency: "TND" },
    ],
  });

  await prisma.auditLog.create({
    data: { actorId: admin.id, action: "SEED", entity: "Platform", metadata: { env: "dev" } },
  });

  await seedFeed(password, candidate.id);

  await embedEverything();

  console.log("Seed OK — comptes démo (mot de passe Demo1234!)");
  console.log("  admin@nextgen.hr");
  console.log("  recruteur@atlas.tech");
  console.log("  candidat@mail.com");
}

/** Builds pgvector embeddings for every seeded job and candidate. */
async function embedEverything() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      contractType: true,
      requiredSkills: true,
    },
  });
  const jobTexts = jobs.map((job) =>
    [
      `Intitulé: ${job.title}`,
      `Compétences requises: ${job.requiredSkills.join(", ")}`,
      `Lieu: ${job.location} — Contrat: ${job.contractType}`,
      `Description: ${job.description}`,
      `Mots-clés: ${job.requiredSkills.join(", ")}`,
    ].join("\n"),
  );
  const jobVectors = await embedder.embed(jobTexts);
  for (const [index, job] of jobs.entries()) {
    await prisma.$executeRaw`
      UPDATE "Job"
      SET embedding = ${toPgVector(jobVectors.vectors[index])}::vector,
          "embeddingModel" = ${jobVectors.model},
          "embeddingUpdatedAt" = NOW()
      WHERE id = ${job.id}
    `;
  }

  const candidates = await prisma.candidateProfile.findMany({
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
  const candidateTexts = candidates.map((profile) =>
    [
      `Titre: ${profile.headline ?? ""}`,
      `Compétences: ${profile.skills.join(", ")}`,
      `Expérience: ${profile.experienceYears} ans — Lieu: ${profile.location ?? ""}`,
      `Résumé: ${profile.bio ?? ""}`,
      `CV: ${(profile.cvText ?? "").slice(0, 8000)}`,
      `Mots-clés: ${profile.skills.join(", ")}`,
    ].join("\n"),
  );
  const candidateVectors = await embedder.embed(candidateTexts);
  for (const [index, profile] of candidates.entries()) {
    await prisma.$executeRaw`
      UPDATE "CandidateProfile"
      SET embedding = ${toPgVector(candidateVectors.vectors[index])}::vector,
          "embeddingModel" = ${candidateVectors.model},
          "embeddingUpdatedAt" = NOW()
      WHERE id = ${profile.id}
    `;
  }

  console.log(
    `Embeddings: ${jobs.length} offres + ${candidates.length} profils via ${jobVectors.model}`,
  );
}

async function seedFeed(password: string, candidateId: string) {
  const mehdi = await prisma.user.create({
    data: {
      email: "mehdi.trabelsi@mail.com",
      messageEmails: false,
      passwordHash: password,
      role: "CANDIDATE",
      firstName: "Mehdi",
      lastName: "Trabelsi",
      gdprConsentAt: new Date(),
      candidate: { create: { headline: "Ingénieur frontend", location: "Tunis", skills: ["React", "TypeScript"] } },
    },
  });
  const sara = await prisma.user.create({
    data: {
      email: "sara.jouini@mail.com",
      messageEmails: false,
      passwordHash: password,
      role: "CANDIDATE",
      firstName: "Sara",
      lastName: "Jouini",
      gdprConsentAt: new Date(),
      candidate: { create: { headline: "Product designer", location: "Paris", skills: ["Figma"] } },
    },
  });
  const nadia = await prisma.user.create({
    data: {
      email: "nadia.cherif@mail.com",
      messageEmails: false,
      passwordHash: password,
      role: "CANDIDATE",
      firstName: "Nadia",
      lastName: "Cherif",
      gdprConsentAt: new Date(),
      candidate: { create: { headline: "Staff engineer", location: "Lyon", skills: ["TypeScript", "NestJS", "PostgreSQL"] } },
    },
  });
  const atlas = await prisma.user.findUnique({ where: { email: "recruteur@atlas.tech" } });
  if (!atlas) return;

  await prisma.follow.createMany({
    data: [
      { followerId: candidateId, followingId: mehdi.id },
      { followerId: candidateId, followingId: sara.id },
    ],
  });
  await prisma.post.createMany({
    data: [
      { authorId: mehdi.id, body: "Je viens de sortir un design system en React. Le plus dur : garder les composants assez simples pour qu'une équipe de cinq personnes les adopte.", createdAt: new Date(Date.now() - 2 * 3600_000) },
      { authorId: sara.id, body: "Retour d'un entretien produit : on m'a demandé de défendre un parcours candidat en 20 minutes. J'ai montré trois écrans, pas une charte.", createdAt: new Date(Date.now() - 5 * 3600_000) },
      { authorId: mehdi.id, body: "À Tunis, les équipes qui livrent bien sont celles qui écrivent les décisions. Pas celles qui ajoutent un outil de plus.", createdAt: new Date(Date.now() - 26 * 3600_000) },
      { authorId: nadia.id, body: "TypeScript strict sur une API NestJS : le gain n'est pas le typage, c'est d'arrêter de découvrir les champs manquants en production.", createdAt: new Date(Date.now() - 8 * 3600_000) },
      { authorId: nadia.id, body: "PostgreSQL + une file simple bat un cluster « au cas où » tant que vous n'avez pas le trafic. J'en reparle avec un schéma concret cette semaine.", createdAt: new Date(Date.now() - 30 * 3600_000) },
      { authorId: atlas.id, kind: "AD", body: "Atlas Labs ouvre deux postes produit à Paris et à Tunis. Profils TypeScript et design système.", createdAt: new Date(Date.now() - 3 * 3600_000) },
      { authorId: atlas.id, kind: "AD", body: "Préparez votre CV avant de postuler : les offres Atlas lisent d'abord le titre, les dates et les compétences.", createdAt: new Date(Date.now() - 20 * 3600_000) },
    ],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
