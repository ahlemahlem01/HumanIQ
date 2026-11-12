import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { jwtSecret } from "../src/auth/jwt-secret";

const previous = process.env.NODE_ENV;
afterEach(() => {
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
});

describe("jwtSecret", () => {
  it("returns the configured secret", () => {
    process.env.NODE_ENV = "production";
    assert.equal(jwtSecret("une-longue-valeur-aleatoire"), "une-longue-valeur-aleatoire");
  });

  it("keeps a development fallback so the API starts without setup", () => {
    process.env.NODE_ENV = "development";
    assert.equal(jwtSecret(undefined), "dev");
  });

  it("refuses to start in production without a real secret", () => {
    process.env.NODE_ENV = "production";
    assert.throws(() => jwtSecret(undefined), /JWT_SECRET/);
    assert.throws(() => jwtSecret(""), /JWT_SECRET/);
    assert.throws(() => jwtSecret("dev"), /JWT_SECRET/);
  });
});
