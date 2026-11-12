import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blendScores,
  extractSkillsFromText,
  inferExperienceYears,
  KEYWORD_WEIGHT,
  scoreCvAgainstJob,
  SEMANTIC_WEIGHT,
} from "../src/ai/matching";

const job = { title: "Développeur fullstack", description: "", location: "Paris", requiredSkills: ["TypeScript", "React", "NestJS"] };
const noSkillsJob = { ...job, requiredSkills: [] as string[] };
const profile = (overrides: Partial<Parameters<typeof scoreCvAgainstJob>[0]> = {}) => ({
  skills: [] as string[],
  cvText: "",
  experienceYears: 0,
  location: null,
  ...overrides,
});

describe("scoreCvAgainstJob", () => {
  it("gives the maximum (capped at 99) to a full match with enough experience in the right city", () => {
    const result = scoreCvAgainstJob(profile({ skills: ["TypeScript", "React", "NestJS"], experienceYears: 4, location: "Paris, France" }), job);
    assert.equal(result.score, 99);
    assert.deepEqual(result.missingKeywords, []);
    assert.equal(result.coverage, 1);
  });

  it("never goes below the floor of 8", () => {
    assert.equal(scoreCvAgainstJob(profile(), job).score, 8);
  });

  it("reports matched and missing keywords, and scores partial coverage proportionally", () => {
    const result = scoreCvAgainstJob(profile({ skills: ["TypeScript"] }), job);
    assert.deepEqual(result.matchedKeywords, ["TypeScript"]);
    assert.deepEqual(result.missingKeywords, ["React", "NestJS"]);
    assert.equal(result.score, 25); // 1/3 of 75 points, no seniority, no location
  });

  it("matches skills written differently on a CV (aliases, case, accents)", () => {
    const result = scoreCvAgainstJob(
      profile({ cvText: "Stack nextjs, déploiement sur k8s, accessibilite RGAA" }),
      { ...job, requiredSkills: ["Next.js", "Kubernetes", "Accessibilité"] },
    );
    assert.deepEqual(result.missingKeywords, []);
    assert.equal(scoreCvAgainstJob(profile({ skills: ["typescript"] }), job).matchedKeywords[0], "TypeScript");
  });

  it("counts a duplicated or padded required skill only once", () => {
    const result = scoreCvAgainstJob(profile({ skills: ["React"] }), { ...job, requiredSkills: ["React", " React ", ""] });
    assert.equal(result.coverage, 1);
    assert.deepEqual(result.matchedKeywords, ["React"]);
  });

  it("does not credit a short skill that only appears inside another word", () => {
    const goJob = { ...job, requiredSkills: ["Go", "Java", "UI"] };
    const result = scoreCvAgainstJob(profile({ cvText: "Good experience in JavaScript, building apps" }), goJob);
    assert.deepEqual(result.matchedKeywords, []);
    assert.deepEqual(result.missingKeywords, ["Go", "Java", "UI"]);
  });

  it("still finds those short skills when they are really there", () => {
    const result = scoreCvAgainstJob(profile({ cvText: "Backend en Go et Java, maquettes UI." }), { ...job, requiredSkills: ["Go", "Java", "UI"] });
    assert.deepEqual(result.missingKeywords, []);
  });

  it("uses a neutral coverage when the job lists no required skills", () => {
    assert.equal(scoreCvAgainstJob(profile({ experienceYears: 4 }), noSkillsJob).score, 47); // 0.4*75 + full seniority 17
  });

  it("expects more experience for senior roles", () => {
    const senior = { ...noSkillsJob, title: "Senior Software Engineer" };
    assert.equal(scoreCvAgainstJob(profile({ experienceYears: 4 }), senior).score, 40); // 30 + (4/7)*17
    assert.equal(scoreCvAgainstJob(profile({ experienceYears: 7 }), senior).score, 47);
  });

  it("adds 8 points when the candidate's city appears in the job location", () => {
    const without = scoreCvAgainstJob(profile({ location: "Tunis" }), noSkillsJob).score;
    const withBonus = scoreCvAgainstJob(profile({ location: "Paris, France" }), { ...noSkillsJob, location: "Paris - Remote" }).score;
    assert.equal(withBonus - without, 8);
  });
});

describe("blendScores", () => {
  const keyword = { score: 50, matchedKeywords: [], missingKeywords: [], coverage: 0.5 };

  it("weights the semantic score 60% and the keyword score 40%", () => {
    assert.equal(SEMANTIC_WEIGHT + KEYWORD_WEIGHT, 1);
    assert.deepEqual(blendScores(keyword, 80), { score: 68, semanticScore: 80, keywordScore: 50 });
  });

  it("falls back to the keyword score when there is no vector", () => {
    assert.deepEqual(blendScores(keyword, null), { score: 50, semanticScore: null, keywordScore: 50 });
  });
});

describe("extractSkillsFromText", () => {
  it("finds skills by whole word, not by substring", () => {
    const skills = extractSkillsFromText("Développeur JavaScript senior, good level");
    assert.ok(skills.includes("JavaScript"));
    assert.ok(!skills.includes("Java"));
    assert.ok(!skills.includes("Go"));
  });

  it("recognises aliases and ignores accents", () => {
    const skills = extractSkillsFromText("NodeJS, Postgres, k8s et accessibilite");
    for (const expected of ["Node.js", "PostgreSQL", "Kubernetes", "Accessibilité"]) assert.ok(skills.includes(expected), expected);
  });
});

describe("inferExperienceYears", () => {
  it("reads French and English phrasings", () => {
    assert.equal(inferExperienceYears("Plus de 5 ans d'expérience en développement"), 5);
    assert.equal(inferExperienceYears("8 years of experience"), 8);
    assert.equal(inferExperienceYears("Expérience de 3 ans"), 3);
  });

  it("returns 0 when nothing is stated or the number is absurd", () => {
    assert.equal(inferExperienceYears("Développeur motivé"), 0);
    assert.equal(inferExperienceYears("99 ans d'expérience"), 0);
  });
});
