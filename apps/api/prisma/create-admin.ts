/**
 * Creates (or resets the password of) the platform administrator, without any demo data.
 *
 *   ADMIN_EMAIL=admin@votre-domaine.com ADMIN_PASSWORD='un mot de passe de 12+ caractères' npm run admin:create
 *
 * Optional: ADMIN_FIRST_NAME, ADMIN_LAST_NAME. Safe to run against a production database: it only touches this one account.
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment
}

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL est obligatoire (adresse valide).");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD est obligatoire (12 caractères minimum).");

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== "ADMIN") throw new Error(`${email} existe déjà avec un autre rôle : choisissez une autre adresse.`);

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() } });
    console.log(`Mot de passe de l'administrateur ${email} mis à jour.`);
    return;
  }
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "ADMIN",
      firstName: process.env.ADMIN_FIRST_NAME?.trim() || "Admin",
      lastName: process.env.ADMIN_LAST_NAME?.trim() || "HumanIQ",
      gdprConsentAt: new Date(),
      emailVerifiedAt: new Date(),
      messageEmails: false,
    },
  });
  console.log(`Administrateur ${email} créé.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
