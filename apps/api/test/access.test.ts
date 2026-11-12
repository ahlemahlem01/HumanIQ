/**
 * Integration tests: authentication, roles and isolation between companies.
 *
 * They talk HTTP to a running API seeded with the demo data (`npm run seed`), by default http://localhost:4100/api
 * (override with API_URL). When the API is not reachable they are skipped, so `npm test` still passes anywhere.
 * Nothing is written: every request either reads, or is refused before any change.
 */
import assert from "node:assert/strict";
import { before, describe, it, type TestContext } from "node:test";

const API = (process.env.API_URL ?? "http://localhost:4100/api").replace(/\/$/, "");
const ATLAS = { email: "recruteur@atlas.tech", password: "Demo1234!" };
// Second company's recruiter, needed for the isolation tests. Its password is not stored in the repository:
// export ESPRIT_PASSWORD=... (see the seed) to run them; without it they are skipped.
const ESPRIT = { email: "ahlem.alaya@esprit.tn", password: process.env.ESPRIT_PASSWORD ?? "" };
const CANDIDATE = { email: "candidat@mail.com", password: "Demo1234!" };

type Reply = { status: number; body: any };

async function call(path: string, options: { method?: string; token?: string; body?: unknown } = {}): Promise<Reply> {
  const response = await fetch(API + path, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const tokens: { atlas?: string; esprit?: string; candidate?: string } = {};
let atlasJobId = "";
let atlasApplicationId = "";
let espritJobIds: string[] = [];
let atlasJobIds: string[] = [];
let up = false;

/** Skips the calling test when the API is down or the demo data is missing. */
function needsApi(t: TestContext) {
  if (!up) {
    t.skip("API injoignable ou données de démo absentes");
    return false;
  }
  return true;
}

before(async () => {
  try {
    if (!ESPRIT.password) return;
    const [atlas, esprit, candidate] = await Promise.all([
      call("/auth/login", { method: "POST", body: ATLAS }),
      call("/auth/login", { method: "POST", body: ESPRIT }),
      call("/auth/login", { method: "POST", body: CANDIDATE }),
    ]);
    if (![atlas, esprit, candidate].every((reply) => reply.status === 201 && reply.body?.token)) return;
    tokens.atlas = atlas.body.token;
    tokens.esprit = esprit.body.token;
    tokens.candidate = candidate.body.token;

    const atlasJobs = (await call("/jobs/mine", { token: tokens.atlas })).body as { id: string; status: string }[];
    const espritJobs = (await call("/jobs/mine", { token: tokens.esprit })).body as { id: string }[];
    atlasJobIds = atlasJobs.map((job) => job.id);
    espritJobIds = espritJobs.map((job) => job.id);

    for (const job of atlasJobs) {
      const pipeline = await call(`/applications/pipeline/${job.id}`, { token: tokens.atlas });
      const card = pipeline.body?.columns?.flatMap((column: { items: { id: string }[] }) => column.items)?.[0];
      if (card) {
        atlasJobId = job.id;
        atlasApplicationId = card.id;
        break;
      }
    }
    up = Boolean(atlasJobId && atlasApplicationId && espritJobIds.length);
  } catch {
    up = false;
  }
});

describe("authentication", () => {
  it("logs a recruiter in and never exposes the password hash", async (t) => {
    if (!needsApi(t)) return;
    const reply = await call("/auth/login", { method: "POST", body: ATLAS });
    assert.equal(reply.status, 201);
    assert.equal(reply.body.user.role, "RECRUITER");
    assert.ok(!JSON.stringify(reply.body).includes("passwordHash"));
  });

  it("refuses a wrong password and an unknown account with the same answer", async (t) => {
    if (!needsApi(t)) return;
    const wrong = await call("/auth/login", { method: "POST", body: { ...ATLAS, password: "pas-le-bon" } });
    const unknown = await call("/auth/login", { method: "POST", body: { email: "personne@nulle-part.test", password: "Demo1234!" } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message, "le message ne doit pas révéler si l'e-mail existe");
  });

  it("requires a valid token on /auth/me", async (t) => {
    if (!needsApi(t)) return;
    assert.equal((await call("/auth/me")).status, 401);
    assert.equal((await call("/auth/me", { token: "abc.def.ghi" })).status, 401);
    const me = await call("/auth/me", { token: tokens.atlas });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, ATLAS.email);
  });
});

describe("roles", () => {
  it("keeps recruiter endpoints closed to anonymous users and candidates", async (t) => {
    if (!needsApi(t)) return;
    assert.equal((await call("/sourcing/imports")).status, 401);
    assert.equal((await call("/sourcing/imports", { token: tokens.candidate })).status, 403);
    assert.equal((await call("/jobs/mine", { token: tokens.candidate })).status, 403);
    assert.equal((await call(`/applications/pipeline/${atlasJobId}`, { token: tokens.candidate })).status, 403);
  });

  it("lets a recruiter use them", async (t) => {
    if (!needsApi(t)) return;
    const reply = await call("/sourcing/imports", { token: tokens.atlas });
    assert.equal(reply.status, 200);
    assert.ok(Array.isArray(reply.body));
  });

  it("keeps admin endpoints closed to recruiters and candidates", async (t) => {
    if (!needsApi(t)) return;
    assert.equal((await call("/admin/jobs", { token: tokens.atlas })).status, 403);
    assert.equal((await call("/admin/jobs", { token: tokens.candidate })).status, 403);
    assert.equal((await call("/admin/jobs")).status, 401);
  });
});

describe("isolation between companies", () => {
  it("only lists a company's own jobs", async (t) => {
    if (!needsApi(t)) return;
    assert.ok(atlasJobIds.length > 0 && espritJobIds.length > 0);
    assert.deepEqual(atlasJobIds.filter((id) => espritJobIds.includes(id)), []);
  });

  it("refuses to open another company's pipeline", async (t) => {
    if (!needsApi(t)) return;
    assert.equal((await call(`/applications/pipeline/${atlasJobId}`, { token: tokens.esprit })).status, 403);
    assert.equal((await call(`/applications/pipeline/${atlasJobId}`, { token: tokens.atlas })).status, 200);
  });

  it("refuses to read or move another company's applications", async (t) => {
    if (!needsApi(t)) return;
    assert.equal((await call(`/applications/${atlasApplicationId}/notes`, { token: tokens.esprit })).status, 403);
    const move = await call(`/applications/${atlasApplicationId}/move`, { method: "PATCH", token: tokens.esprit, body: { stage: "SOURCING" } });
    assert.equal(move.status, 403);
  });

  it("refuses to import a profile into another company's job", async (t) => {
    if (!needsApi(t)) return;
    const reply = await call("/sourcing/linkedin", {
      method: "POST",
      token: tokens.esprit,
      body: { jobId: atlasJobId, fullName: "Test Isolation", rawText: "Test Isolation\nIngénieur\nProfil de test pour vérifier l'isolation." },
    });
    assert.equal(reply.status, 403);
    assert.equal(reply.body.message, "Offre inaccessible.");
  });
});
