import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Original CV files. Stored OUTSIDE the public /uploads folder: they are only served through an authenticated
 * endpoint (recruiters). One file per candidate, named after the profile id, the media type is kept in the database.
 */
const CV_DIR = join(process.env.PRIVATE_DIR ?? join(process.cwd(), "private"), "cv");

function cvPath(candidateId: string) {
  // Ids come from the database (cuid); refuse anything that could leave the folder.
  if (!/^[a-z0-9]+$/i.test(candidateId)) throw new Error("Identifiant invalide.");
  return join(CV_DIR, candidateId);
}

export async function saveCvFile(candidateId: string, buffer: Buffer) {
  await mkdir(CV_DIR, { recursive: true });
  await writeFile(cvPath(candidateId), buffer);
}

export function hasCvFile(candidateId: string) {
  return existsSync(cvPath(candidateId));
}

export async function readCvFile(candidateId: string) {
  return readFile(cvPath(candidateId));
}

export async function deleteCvFile(candidateId: string) {
  await rm(cvPath(candidateId), { force: true });
}
