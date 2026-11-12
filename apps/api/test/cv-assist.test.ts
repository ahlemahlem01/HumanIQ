import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeBullets, localSummaries } from "../src/ai/cv-assist";

describe("localSummaries", () => {
  const input = {
    headline: "Ingénieure logiciel fullstack",
    years: 2,
    skills: ["TypeScript", "React", "NestJS"],
    lastRole: { title: "Développeuse", company: "Acme" },
  };

  it("only restates the facts it was given", () => {
    const [first] = localSummaries(input);
    assert.ok(first.includes("2 ans d'expérience"));
    assert.ok(first.includes("TypeScript, React, NestJS"));
    assert.ok(first.includes("Développeuse chez Acme"));
  });

  it("uses the singular for one year and omits years when unknown", () => {
    assert.ok(localSummaries({ ...input, years: 1 })[0].includes("1 an d'expérience"));
    assert.ok(!localSummaries({ ...input, years: 0 })[0].includes("d'expérience."));
  });

  it("proposes at most three different variants, one aimed at the target job", () => {
    const variants = localSummaries({ ...input, targetTitle: "Data Engineer" });
    assert.ok(variants.length <= 3);
    assert.equal(new Set(variants).size, variants.length);
    assert.ok(variants.some((value) => value.includes("poste de Data Engineer")));
  });

  it("returns nothing rather than inventing text from an empty profile", () => {
    assert.deepEqual(localSummaries({}), []);
  });
});

describe("analyzeBullets", () => {
  const codes = (text: string) => analyzeBullets(text)[0].issues.map((issue) => issue.code);

  it("flags first person, and suggests a mechanical clean-up without adding facts", () => {
    const [line] = analyzeBullets("J'ai développé une API qui réduit le build de 40 %");
    assert.ok(line.issues.some((issue) => issue.code === "first-person"));
    assert.equal(line.suggestion, "Développé une API qui réduit le build de 40 %");
  });

  it("flags a missing verb, missing number, final period and short text", () => {
    const found = codes("Responsable du build.");
    for (const code of ["trailing-period", "no-verb", "no-number", "too-short"]) assert.ok(found.includes(code), code);
  });

  it("accepts a strong line without remarks", () => {
    assert.deepEqual(codes("Conçu un pipeline CI qui réduit de 40 % le temps de build"), []);
  });

  it("strips bullet characters and ignores blank lines", () => {
    const lines = analyzeBullets("• Conçu un pipeline CI en 2 semaines\n\n- Piloté une migration de 3 services");
    assert.equal(lines.length, 2);
    assert.ok(lines.every((line) => !/^[•-]/.test(line.text)));
  });

  it("looks at 12 lines at most", () => {
    assert.equal(analyzeBullets(Array.from({ length: 30 }, (_, i) => `Conçu la fonctionnalité numéro ${i}`).join("\n")).length, 12);
  });
});
