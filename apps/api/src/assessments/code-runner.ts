import { createContext, Script } from "node:vm";
import type { CodeCase, CodeChallenge } from "./code-challenges";

const BANNED =
  /\b(process|require|globalThis|Function|eval|WebAssembly|fetch|XMLHttpRequest|Worker|child_process|fs)\b/;

export type CaseResult = {
  id: string;
  ok: boolean;
  public: boolean;
  error?: string;
};

export function judgeChallenge(challenge: CodeChallenge, source: string, opts: { includeHidden: boolean }) {
  const tests = [
    ...challenge.publicTests.map((item) => ({ ...item, public: true })),
    ...(opts.includeHidden ? challenge.hiddenTests.map((item) => ({ ...item, public: false })) : []),
  ];
  if (BANNED.test(source)) {
    return failAll(tests, "API interdite dans le sandbox.");
  }

  const sandbox = createContext(
    {
      Math,
      JSON,
      Array,
      Object,
      Map,
      Set,
      Number,
      String,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Infinity,
      NaN,
      console: { log() {}, warn() {}, error() {} },
      __fn: null as unknown,
      __args: [] as unknown[],
      __out: undefined as unknown,
    },
    { codeGeneration: { strings: false, wasm: false } },
  );

  try {
    new Script(
      `"use strict";\n${source}\n;if (typeof ${challenge.functionName} !== "function") { throw new Error("Définissez la fonction ${challenge.functionName}."); }\nthis.__fn = ${challenge.functionName};`,
      { filename: "challenge.js" },
    ).runInContext(sandbox, { timeout: 1200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compilation impossible.";
    return failAll(tests, message.slice(0, 180));
  }

  const invoke = new Script(`this.__out = this.__fn.apply(null, this.__args);`, { filename: "invoke.js" });
  const results: CaseResult[] = tests.map((item) => {
    try {
      sandbox.__args = item.args;
      sandbox.__out = undefined;
      invoke.runInContext(sandbox, { timeout: 400 });
      if (same(sandbox.__out, item.expected)) return { id: item.id, ok: true, public: item.public };
      return {
        id: item.id,
        ok: false,
        public: item.public,
        error: item.public ? `Obtenu ${stringify(sandbox.__out)}` : "Échec d'un test caché",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur d'exécution";
      return { id: item.id, ok: false, public: item.public, error: message.slice(0, 180) };
    }
  });
  const passed = results.filter((item) => item.ok).length;
  return { passed, total: results.length, results };
}

function failAll(tests: (CodeCase & { public: boolean })[], error: string) {
  return {
    passed: 0,
    total: tests.length,
    results: tests.map((item) => ({ id: item.id, ok: false, public: item.public, error })),
  };
}

function same(a: unknown, b: unknown) {
  return stringify(a) === stringify(b);
}

function stringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
