/**
 * Passwords used by the seed scripts, read from the environment (apps/api/.env) instead of being written in code.
 *
 *   SEED_DEMO_PASSWORD  password of the fictional demo accounts (default "Demo1234!", local use only)
 *   ESPRIT_PASSWORD     password of the ESPRIT recruiter account; when missing, a random one is generated and
 *                       printed once at the end of the seed
 */
import { randomBytes } from "crypto";

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment
}

const production = process.env.NODE_ENV === "production";

/** seed.ts deletes every table before refilling it. Refuse to do that on a production database by mistake. */
export function assertSafeToWipe() {
  if (production && process.env.SEED_ALLOW_WIPE !== "yes") {
    throw new Error("Refus : `seed` efface toute la base. En production, utilisez `npm run admin:create` (ou SEED_ALLOW_WIPE=yes en connaissance de cause).");
  }
}

export function demoPassword() {
  const value = process.env.SEED_DEMO_PASSWORD;
  if (value) return value;
  if (production) throw new Error("SEED_DEMO_PASSWORD est obligatoire en production.");
  return "Demo1234!";
}

export function espritPassword(): { value: string; generated: boolean } {
  const value = process.env.ESPRIT_PASSWORD;
  if (value) return { value, generated: false };
  return { value: randomBytes(12).toString("base64url"), generated: true };
}
