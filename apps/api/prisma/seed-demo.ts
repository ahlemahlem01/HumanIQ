/**
 * Demo data for the recruiter dashboard: fictional candidates and applications
 * spread over the last ~55 days, on the published jobs of recruteur@atlas.tech.
 *
 * Additive and idempotent. It only creates or updates the demo candidates (@demo.humaniq.test).
 *   npm run seed:demo           add the demo data (skips candidates that already exist)
 *   npm run seed:demo:remove    delete only the demo candidates (and their applications)
 */
import { ApplicationStage, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DOMAIN = "demo.humaniq.test";
const DAY = 24 * 60 * 60 * 1000;

// Deterministic pseudo-random so every run produces the same shape.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE: [string, string, string, string, string[]][] = [
  ["Yasmine", "Trabelsi", "Développeuse fullstack", "Tunis", ["TypeScript", "React", "NestJS"]],
  ["Mehdi", "Ben Salah", "Ingénieur backend", "Ariana", ["NestJS", "PostgreSQL", "Docker"]],
  ["Sarra", "Gharbi", "Ingénieure DevOps", "Sfax", ["Docker", "Kubernetes", "AWS"]],
  ["Anis", "Jebali", "Développeur React", "Tunis", ["React", "TypeScript", "Next.js"]],
  ["Ines", "Ferchichi", "Data engineer", "Sousse", ["Python", "SQL", "PostgreSQL"]],
  ["Walid", "Mejri", "Développeur Node.js", "Nabeul", ["Node.js", "TypeScript", "MongoDB"]],
  ["Hiba", "Cherif", "Product designer", "Tunis", ["Figma", "Design System", "Accessibilité"]],
  ["Omar", "Dridi", "Ingénieur logiciel", "Paris", ["TypeScript", "NestJS", "pgvector"]],
  ["Lina", "Bouazizi", "Développeuse frontend", "Lyon", ["React", "CSS", "TypeScript"]],
  ["Karim", "Hamdi", "Tech lead", "Paris", ["TypeScript", "React", "PostgreSQL", "Docker"]],
  ["Nour", "Sassi", "Ingénieure IA", "Tunis", ["Python", "PyTorch", "pgvector"]],
  ["Amine", "Zouari", "Développeur fullstack", "Bizerte", ["React", "NestJS", "PostgreSQL"]],
  ["Emna", "Kefi", "UX designer", "Tunis", ["Figma", "Recherche utilisateur", "Design System"]],
  ["Slim", "Oueslati", "Ingénieur cloud", "Paris", ["AWS", "Terraform", "Docker"]],
  ["Rim", "Chaouch", "Développeuse mobile", "Ariana", ["Flutter", "Dart", "TypeScript"]],
  ["Fares", "Mansour", "Développeur backend", "Monastir", ["NestJS", "TypeScript", "Redis"]],
  ["Salma", "Belhadj", "Data analyst", "Tunis", ["SQL", "Python", "Power BI"]],
  ["Hatem", "Riahi", "Ingénieur QA", "Sfax", ["Cypress", "TypeScript", "CI/CD"]],
  ["Dorra", "Naceur", "Développeuse React", "Paris", ["React", "Next.js", "Accessibilité"]],
  ["Zied", "Ayari", "Architecte logiciel", "Lyon", ["Microservices", "NestJS", "Kubernetes"]],
  ["Mariem", "Louati", "Product designer", "Tunis", ["Figma", "Accessibilité", "Prototypage"]],
  ["Bilel", "Karray", "Développeur fullstack", "Gabès", ["TypeScript", "React", "Docker"]],
  ["Aya", "Messaoudi", "Ingénieure data", "Ariana", ["Python", "SQL", "Airflow"]],
  ["Houssem", "Tlili", "Développeur Node.js", "Tunis", ["Node.js", "NestJS", "PostgreSQL"]],
  ["Chaima", "Abid", "Cheffe de projet digital", "Tunis", ["Scrum", "Jira", "Figma"]],
  ["Marouane", "Sellami", "Ingénieur DevOps", "Paris", ["Kubernetes", "Terraform", "AWS"]],
];

// Funnel-shaped stage weights.
const STAGE_WEIGHTS: [ApplicationStage, number][] = [
  ["SOURCING", 0.28],
  ["PRESELECTION", 0.27],
  ["INTERVIEW", 0.16],
  ["TEST", 0.1],
  ["OFFER", 0.07],
  ["HIRED", 0.05],
  ["REJECTED", 0.07],
];

function pickStage(roll: number): ApplicationStage {
  let total = 0;
  for (const [stage, weight] of STAGE_WEIGHTS) {
    total += weight;
    if (roll <= total) return stage;
  }
  return "SOURCING";
}

async function remove() {
  const result = await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  console.log(`Removed ${result.count} demo candidates (their applications cascade).`);
}

async function add() {
  const recruiter = await prisma.user.findUnique({
    where: { email: "recruteur@atlas.tech" },
    include: { recruiter: { include: { jobs: { where: { status: "PUBLISHED" } } } } },
  });
  const jobs = recruiter?.recruiter?.jobs ?? [];
  if (!jobs.length) {
    throw new Error("No published job found for recruteur@atlas.tech. Seed the base data first.");
  }

  const random = rng(20261111);
  const passwordHash = await bcrypt.hash("Demo1234!", 10);
  const now = Date.now();
  let created = 0;
  let applications = 0;

  for (const [index, [first, last, headline, location, skills]] of PEOPLE.entries()) {
    const email = `${first}.${last}@${DOMAIN}`.toLowerCase().replace(/\s+/g, "");
    // Two thirds of the demo candidates are open to recruiters (they appear in the vivier),
    // and every fourth one hides their name.
    const open = index % 3 !== 2;
    const anonymous = index % 4 === 0;
    const salaryMin = 26000 + (index % 7) * 6000;
    const profileExtras = {
      reverseRecruiting: open,
      anonymousVisible: anonymous,
      salaryMin,
      salaryMax: salaryMin + 12000,
      currency: "EUR",
      bio: `${headline} basé(e) à ${location}. Compétences : ${skills.join(", ")}.`,
    };

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, candidate: { select: { id: true } } },
    });
    if (existing) {
      if (existing.candidate) {
        await prisma.candidateProfile.update({ where: { id: existing.candidate.id }, data: profileExtras });
      }
      continue;
    }

    const user = await prisma.user.create({
      data: {
        email,
        messageEmails: false,
        passwordHash,
        role: "CANDIDATE",
        firstName: first,
        lastName: last,
        gdprConsentAt: new Date(now),
        emailVerifiedAt: new Date(now),
        candidate: {
          create: {
            headline,
            location,
            experienceYears: 1 + Math.floor(random() * 9),
            skills,
            ...profileExtras,
          },
        },
      },
      include: { candidate: true },
    });
    created += 1;

    // ~75% of applications land in the last 30 days (weighted to recent), the rest in the 30 before.
    const recent = random() < 0.75;
    const ageDays = recent ? Math.floor(Math.pow(random(), 1.4) * 30) : 30 + Math.floor(random() * 25);
    const createdAt = new Date(now - ageDays * DAY - Math.floor(random() * 10) * 60 * 60 * 1000);

    const job = jobs[index % jobs.length];
    const keywordScore = 25 + Math.floor(random() * 65);
    const semanticScore = Math.max(5, Math.min(98, keywordScore + Math.floor(random() * 30) - 12));
    const atsScore = Math.round(semanticScore * 0.6 + keywordScore * 0.4);
    const missing = job.requiredSkills.filter((skill) => !skills.includes(skill)).slice(0, 3);

    try {
      await prisma.application.create({
        data: {
          jobId: job.id,
          candidateId: user.candidate!.id,
          stage: pickStage(random()),
          kanbanOrder: index,
          atsScore,
          semanticScore,
          keywordScore,
          keywordSuggestions: missing,
          coverNote: "Candidature de démonstration.",
          createdAt,
        },
      });
      applications += 1;
    } catch {
      // unique (job, candidate): nothing to do
    }
  }

  console.log(`Created ${created} demo candidates and ${applications} applications.`);
  console.log(`Remove them any time with: npm run seed:demo:remove`);
}

async function main() {
  if (process.argv.includes("--remove")) await remove();
  else await add();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
