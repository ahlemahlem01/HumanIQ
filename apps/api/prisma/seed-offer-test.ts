/**
 * Adds 10 fictional candidates (@demo.humaniq.test) who apply to ONE job, to test the recruiter pipeline.
 *   npm run seed:offer -- jkoomer01@gmail.com            latest job of that recruiter
 *   npm run seed:offer -- jkoomer01@gmail.com --remove   remove these 10 candidates again
 */
import { ApplicationStage, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { demoPassword } from "./seed-env";

const prisma = new PrismaClient();
const DOMAIN = "demo.humaniq.test";
const DAY = 24 * 60 * 60 * 1000;

const PEOPLE: [string, string, string, string, number, string[], ApplicationStage][] = [
  ["Yassine", "Mrad", "Développeur Full-Stack", "Tunis", 4, ["React", "TypeScript", "Node.js", "PostgreSQL", "Git", "API REST"], "INTERVIEW"],
  ["Meriem", "Bouslama", "Développeuse React", "Tunis", 3, ["React", "TypeScript", "Node.js", "Git"], "PRESELECTION"],
  ["Oussama", "Gharsallah", "Développeur Node.js", "Ariana", 5, ["Node.js", "PostgreSQL", "API REST", "Docker", "Git"], "PRESELECTION"],
  ["Ranim", "Khelifi", "Ingénieure full-stack", "Sousse", 2, ["React", "Node.js", "TypeScript", "PostgreSQL"], "SOURCING"],
  ["Skander", "Baccouche", "Développeur frontend", "Tunis", 2, ["React", "TypeScript", "CSS", "Git"], "SOURCING"],
  ["Nadia", "Hammami", "Développeuse backend", "Sfax", 6, ["Node.js", "PostgreSQL", "API REST", "Redis"], "TEST"],
  ["Firas", "Jlassi", "Développeur PHP", "Nabeul", 4, ["PHP", "Laravel", "MySQL", "Git"], "SOURCING"],
  ["Cyrine", "Mabrouk", "Développeuse junior", "Tunis", 1, ["JavaScript", "React", "Git"], "SOURCING"],
  ["Haythem", "Dhouib", "Tech lead full-stack", "Tunis", 8, ["React", "TypeScript", "Node.js", "PostgreSQL", "Git", "API REST", "Docker"], "OFFER"],
  ["Lamia", "Snoussi", "Data analyst", "Monastir", 3, ["Python", "SQL", "Power BI"], "REJECTED"],
];

async function main() {
  const email = process.argv[2];
  if (!email || email.startsWith("--")) throw new Error("Usage: npm run seed:offer -- <recruiter email> [--remove]");

  if (process.argv.includes("--remove")) {
    const emails = PEOPLE.map(([f, l]) => `${f}.${l}@${DOMAIN}`.toLowerCase());
    const r = await prisma.user.deleteMany({ where: { email: { in: emails } } });
    console.log(`Removed ${r.count} candidates.`);
    return;
  }

  const recruiter = await prisma.user.findUnique({
    where: { email },
    include: { recruiter: { include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  const job = recruiter?.recruiter?.jobs[0];
  if (!job) throw new Error(`Aucune offre trouvée pour ${email}. Publiez-en une d'abord.`);
  console.log(`Offre ciblée : « ${job.title} » (${job.status})`);

  const passwordHash = await bcrypt.hash(demoPassword(), 10);
  const now = Date.now();
  const required = job.requiredSkills.map((s) => s.toLowerCase());
  let added = 0;

  for (const [index, [first, last, headline, location, years, skills, stage]] of PEOPLE.entries()) {
    const mail = `${first}.${last}@${DOMAIN}`.toLowerCase();
    if (await prisma.user.findUnique({ where: { email: mail } })) continue;
    const user = await prisma.user.create({
      data: {
        email: mail,
        passwordHash,
        role: "CANDIDATE",
        firstName: first,
        lastName: last,
        messageEmails: false,
        gdprConsentAt: new Date(now),
        emailVerifiedAt: new Date(now),
        candidate: {
          create: {
            headline,
            location,
            experienceYears: years,
            skills,
            reverseRecruiting: true,
            bio: `${headline} à ${location}. Compétences : ${skills.join(", ")}.`,
          },
        },
      },
      include: { candidate: true },
    });
    const have = new Set(skills.map((s) => s.toLowerCase()));
    const hits = required.filter((s) => have.has(s)).length;
    const keywordScore = required.length ? Math.round((hits / required.length) * 100) : 0;
    const semanticScore = Math.max(5, Math.min(97, keywordScore + ((index * 7) % 15) - 6));
    await prisma.application.create({
      data: {
        jobId: job.id,
        candidateId: user.candidate!.id,
        stage,
        kanbanOrder: index,
        keywordScore,
        semanticScore,
        atsScore: Math.round(semanticScore * 0.6 + keywordScore * 0.4),
        keywordSuggestions: job.requiredSkills.filter((s) => !have.has(s.toLowerCase())).slice(0, 3),
        coverNote: "Candidature de test.",
        createdAt: new Date(now - (index % 6) * DAY),
      },
    });
    added += 1;
  }
  console.log(`${added} candidats ajoutés avec leur candidature.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
