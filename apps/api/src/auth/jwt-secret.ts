/**
 * Secret used to sign and verify login tokens.
 * In production it must come from JWT_SECRET: a missing or default value would let anyone forge a token.
 * In development the fallback "dev" keeps `npm run start:dev` working without any setup.
 */
export function jwtSecret(value: string | undefined = process.env.JWT_SECRET): string {
  if (value && value !== "dev") return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET est obligatoire en production (valeur longue et aléatoire).");
  }
  return "dev";
}
