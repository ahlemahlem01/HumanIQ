import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeCvText, hydrateFromRawText, linkedinHandle, splitName } from "../src/sourcing/linkedin-parse";

describe("linkedinHandle", () => {
  it("takes the handle from a LinkedIn URL and ignores query and case", () => {
    assert.equal(linkedinHandle("https://www.linkedin.com/in/Jean-Dupont/?utm_source=share"), "jean-dupont");
  });

  it("builds a slug from the name when there is no LinkedIn URL", () => {
    assert.equal(linkedinHandle(undefined, "Zoé Léger"), "zoe-leger");
    assert.equal(linkedinHandle("https://example.com/profil", "Zoé Léger"), "zoe-leger");
  });

  it("falls back to a neutral value", () => {
    assert.equal(linkedinHandle(), "profil");
    assert.equal(linkedinHandle(undefined, "   "), "profil");
  });

  it("only keeps characters that are safe in an e-mail address", () => {
    assert.match(linkedinHandle("https://www.linkedin.com/in/a.b_c%20d"), /^[a-z0-9-]+$/);
  });
});

describe("splitName", () => {
  it("splits first and last name", () => {
    assert.deepEqual(splitName("Jean Dupont"), { firstName: "Jean", lastName: "Dupont" });
    assert.deepEqual(splitName("Marie Anne de la Tour"), { firstName: "Marie", lastName: "Anne de la Tour" });
  });

  it("copes with a single word or nothing", () => {
    assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "LinkedIn" });
    assert.deepEqual(splitName("   "), { firstName: "Profil", lastName: "LinkedIn" });
  });
});

describe("composeCvText", () => {
  it("joins the non-empty parts into a readable CV text", () => {
    const text = composeCvText({
      jobId: "j",
      fullName: "Jean Dupont",
      headline: "Dev",
      about: "",
      experience: ["Dev · Acme · 2020"],
      skills: ["React", "NestJS"],
    });
    assert.ok(text.startsWith("Jean Dupont"));
    assert.ok(text.includes("Expérience\nDev · Acme · 2020"));
    assert.ok(text.includes("Compétences : React, NestJS"));
    assert.ok(!text.includes("\n\n\n"));
  });

  it("is empty when nothing was provided", () => {
    assert.equal(composeCvText({ jobId: "j" }), "");
  });
});

describe("hydrateFromRawText", () => {
  it("reads name, headline and city from pasted text", () => {
    const result = hydrateFromRawText({ jobId: "j", rawText: "Jean Dupont\nIngénieur data\nTunis, Tunisie\nÀ propos…" });
    assert.equal(result.fullName, "Jean Dupont");
    assert.equal(result.headline, "Ingénieur data");
    assert.equal(result.location, "Tunis, Tunisie");
  });

  it("never overrides fields that were already provided", () => {
    const result = hydrateFromRawText({ jobId: "j", fullName: "Alice", headline: "CTO", rawText: "Bob\nDev" });
    assert.equal(result.fullName, "Alice");
    assert.equal(result.headline, "CTO");
  });

  it("returns the input untouched without raw text", () => {
    const input = { jobId: "j", fullName: "Alice" };
    assert.deepEqual(hydrateFromRawText(input), input);
  });
});
