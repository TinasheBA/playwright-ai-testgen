import { describe, it, expect } from "vitest";
import { coverageCheck } from "../coverageCheck.js";
import { hallucinationCheck } from "../hallucinationCheck.js";
import { compileCheck } from "../compileCheck.js";
import type { CriteriaDocument, GenerationResult } from "../../types.js";

const doc: CriteriaDocument = {
  feature: "test",
  criteria: [
    { id: "AC-1", text: "one" },
    { id: "AC-2", text: "two" },
  ],
};

const registry = ["getByTestId('client-name')", "getByTestId('save-client')"];

describe("coverageCheck", () => {
  it("passes when all criteria are covered", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      specCode: "",
      tests: [
        { title: "t1", coversCriteria: ["AC-1"] },
        { title: "t2", coversCriteria: ["AC-2"] },
      ],
    };
    const r = coverageCheck(doc, result);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it("flags an uncovered criterion", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      specCode: "",
      tests: [{ title: "t1", coversCriteria: ["AC-1"] }],
    };
    const r = coverageCheck(doc, result);
    expect(r.passed).toBe(false);
    expect(r.details.join(" ")).toContain("AC-2");
  });
});

describe("hallucinationCheck", () => {
  it("passes when all locators are in the registry", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      specCode: `await page.getByTestId('client-name').fill('x');
                 await page.getByTestId('save-client').click();`,
      tests: [],
    };
    const r = hallucinationCheck(result, registry);
    expect(r.passed).toBe(true);
  });

  it("flags a locator not in the registry", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      specCode: `await page.getByTestId('does-not-exist').click();`,
      tests: [],
    };
    const r = hallucinationCheck(result, registry);
    expect(r.passed).toBe(false);
    expect(r.details.join(" ")).toContain("does-not-exist");
  });
});

describe("compileCheck", () => {
  it("passes on valid TypeScript", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      specCode: `const x: number = 1; console.log(x);`,
      tests: [],
    };
    expect(compileCheck(result).passed).toBe(true);
  });

  it("fails on a syntax error", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      specCode: `const x: number = ;`,
      tests: [],
    };
    expect(compileCheck(result).passed).toBe(false);
  });
});
