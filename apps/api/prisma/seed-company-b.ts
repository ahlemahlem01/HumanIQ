/**
 * Second fictional company, used to test isolation between companies by hand.
 *   npm run seed:company-b           create (or reset the password of) the recruiter below
 *   npm run seed:company-b -- --remove
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { demoPassword } from "./seed-env";

const prisma = new PrismaClient();
const EMAIL = "recruteur.b@demo.humaniq.test";

async function main() {
  if (process.argv.includes("--remove")) {
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, include: { recruiter: true } });
    if (user?.recruiter) await prisma.company.delete({ where: { id: user.recruiter.companyId } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    console.log("Entreprise B supprimée.");
    return;
  }
  const passwordHash = await bcrypt.hash(demoPassword(), 10);
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, emailVerifiedAt: new Date() } });
    console.log("Compte existant : mot de passe réinitialisé.");
    return;
  }
  await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash,
      role: "RECRUITER",
      firstName: "Recruteur",
      lastName: "Entreprise B",
      gdprConsentAt: new Date(),
      emailVerifiedAt: new Date(),
      messageEmails: false,
      recruiter: {
        create: {
          title: "Recruteur",
          company: { create: { name: "Entreprise B", slug: "entreprise-b-test", verifiedAt: new Date(), plan: "STARTER", subscriptionStatus: "trialing" } },
        },
      },
    },
  });
  console.log("Compte créé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
