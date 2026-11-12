import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { sanitizeCvSettings } from "../src/candidates/cv-settings";

type Settings = {
  template: string;
  accent: string;
  contact: Record<string, string>;
  languages: { name: string; level: string }[];
  certifications: { name: string; issuer: string; year: string }[];
  hiddenSections: string[];
  targetJobId: string;
};
const clean = (input: unknown) => sanitizeCvSettings(input) as unknown as Settings;

describe("sanitizeCvSettings", () => {
  it("leaves the column alone when nothing was sent, clears it on null", () => {
    assert.equal(sanitizeCvSettings(undefined), undefined);
    assert.equal(sanitizeCvSettings(null), Prisma.DbNull);
  });

  it("ignores anything that is not a plain object", () => {
    assert.equal(sanitizeCvSettings([]), undefined);
    assert.equal(sanitizeCvSettings("modern"), undefined);
    assert.equal(sanitizeCvSettings(42), undefined);
  });

  it("falls back to safe defaults for an unknown template or a bad colour", () => {
    const result = clean({ template: "fancy", accent: "red; background:url(x)" });
    assert.equal(result.template, "classic");
    assert.equal(result.accent, "#1a3585");
  });

  it("keeps valid choices", () => {
    const result = clean({ template: "compact", accent: "#0f766e" });
    assert.equal(result.template, "compact");
    assert.equal(result.accent, "#0f766e");
  });

  it("drops unknown keys, so nothing unexpected is stored", () => {
    const result = clean({ template: "modern", isAdmin: true, __proto__: { polluted: 1 }, contact: { email: "a@b.c", evil: "x" } }) as unknown as Record<string, unknown>;
    assert.equal("isAdmin" in result, false);
    assert.deepEqual(Object.keys(result.contact as object).sort(), ["displayName", "email", "github", "phone", "website"]);
  });

  it("truncates long text and ignores non-strings", () => {
    const result = clean({ contact: { displayName: "x".repeat(500), phone: 123456 } });
    assert.equal(result.contact.displayName.length, 80);
    assert.equal(result.contact.phone, "");
  });

  it("caps and filters languages and certifications", () => {
    const languages = Array.from({ length: 20 }, (_, i) => ({ name: `Langue ${i}`, level: "B2" }));
    const result = clean({ languages: [...languages, { name: "", level: "C1" }], certifications: [{ name: "" }, { name: "AWS SAA", year: "2024" }, null] });
    assert.equal(result.languages.length, 8);
    assert.deepEqual(result.certifications, [{ name: "AWS SAA", issuer: "", year: "2024" }]);
  });

  it("only accepts known sections to hide, without duplicates", () => {
    const result = clean({ hiddenSections: ["projects", "projects", "password", 3, "skills"] });
    assert.deepEqual(result.hiddenSections, ["projects", "skills"]);
  });
});
