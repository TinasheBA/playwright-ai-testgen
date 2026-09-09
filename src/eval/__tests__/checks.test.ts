import { describe, it, expect } from "vitest";
import { coverageCheck, findTestBlocks } from "../coverageCheck.js";
import { hallucinationCheck, extractLocatorKeys } from "../hallucinationCheck.js";
import { compileCheck } from "../compileCheck.js";
import { assertionQualityCheck } from "../assertionQualityCheck.js";
import { validateGenerationResult } from "../../types.js";
import type { CriteriaDocument, GenerationResult } from "../../types.js";

const doc: CriteriaDocument = {
  feature: "test",
  criteria: [
    { id: "AC-1", text: "one" },
    { id: "AC-2", text: "two" },
  ],
};

const registry = ["getByTestId('client-name')", "getByTestId('save-client')"];

// A manifest on its own is not evidence of coverage, so every fixture here
// carries generated code whose test blocks match the manifest titles and assert
// something. See "the empty-spec loophole" below for what happens without that.
const SPEC_CODE = `
  test('AC-1: creates a client', async ({ page }) => {
    await expect(page.getByTestId('client-name')).toBeVisible();
  });
  test('AC-2: saves a client', async ({ page }) => {
    await expect(page.getByTestId('save-client')).toBeEnabled();
  });
`;

describe("coverageCheck", () => {
  it("passes when all criteria are covered", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      specCode: SPEC_CODE,
      tests: [
        { title: "AC-1: creates a client", coversCriteria: ["AC-1"] },
        { title: "AC-2: saves a client", coversCriteria: ["AC-2"] },
      ],
    };
    const r = coverageCheck(doc, result);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it("flags an uncovered criterion", () => {
    const result: GenerationResult = {
      specFileName: "x.spec.ts",
      // The code only has an AC-1 test; AC-2 is unclaimed and unwritten.
      specCode: `test('AC-1: creates a client', async () => { await expect(x).toBeVisible(); });`,
      tests: [{ title: "AC-1: creates a client", coversCriteria: ["AC-1"] }],
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

// --- the loophole these checks exist to close --------------------------------

describe("the empty-spec loophole", () => {
  /**
   * Before the coverage check read the generated code, this generation scored a
   * clean sweep: the manifest claimed every criterion, the titles were right, the
   * spec transpiled, and it referenced no locators so nothing looked invented.
   * Six tests, full coverage, no hallucinations, and not one assertion.
   */
  const emptyBodies: GenerationResult = {
    specFileName: "x.spec.ts",
    specCode: `import { test } from '@playwright/test';
test('AC-1: creates a client', async ({ page }) => {});
test('AC-2: saves a client', async ({ page }) => {});`,
    tests: [
      { title: "AC-1: creates a client", coversCriteria: ["AC-1"] },
      { title: "AC-2: saves a client", coversCriteria: ["AC-2"] },
    ],
  };

  it("still compiles, which is why compile alone proves little", () => {
    expect(compileCheck(emptyBodies).passed).toBe(true);
  });

  it("is rejected by coverage, because no test block asserts anything", () => {
    const r = coverageCheck(doc, emptyBodies);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.details.join(" ")).toContain("asserts nothing");
  });

  it("says so when a spec references no locators at all", () => {
    const r = hallucinationCheck(emptyBodies, registry);
    expect(r.details.join(" ")).toContain("nothing here was verified");
  });
});

describe("coverageCheck against the generated code", () => {
  it("reports a criterion the manifest claims but the code never names", () => {
    const r = coverageCheck(doc, {
      specFileName: "x.spec.ts",
      specCode: `test('AC-1: creates a client', async () => { await expect(a).toBeVisible(); });`,
      tests: [
        { title: "AC-1: creates a client", coversCriteria: ["AC-1"] },
        { title: "AC-2: saves a client", coversCriteria: ["AC-2"] },
      ],
    });
    expect(r.passed).toBe(false);
    expect(r.details.join(" ")).toContain("No test block names these criteria: AC-2");
    expect(r.details.join(" ")).toContain("the code does not bear it out: AC-2");
  });

  it("covers a criterion the code proves even when the manifest forgot to claim it", () => {
    const r = coverageCheck(doc, {
      specFileName: "x.spec.ts",
      specCode: `
        test('AC-1: creates a client', async () => { await expect(a).toBeVisible(); });
        test('AC-2: saves a client', async () => { await expect(b).toHaveText('x'); });`,
      tests: [{ title: "AC-1: creates a client", coversCriteria: ["AC-1"] }],
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it("ignores criterion ids the input document never asked for", () => {
    const r = coverageCheck(doc, {
      specFileName: "x.spec.ts",
      specCode: `test('AC-1: creates a client', async () => { await expect(a).toBeVisible(); });`,
      tests: [{ title: "AC-1: creates a client", coversCriteria: ["AC-1", "AC-99"] }],
    });
    expect(r.score).toBe(0.5);
    expect(r.details.join(" ")).toContain("AC-2");
  });

  it("finds test blocks behind modifiers, but not describe wrappers or hooks", () => {
    const blocks = findTestBlocks(
      `test.describe('a suite', () => {
         test.beforeEach(async () => { await expect(setup).toBeTruthy(); });
         test.only('AC-1: x', async () => { await expect(x).toBeVisible(); });
         test.skip('AC-2: y', async () => {});
       });`
    );
    expect(blocks.map((b) => [b.title, b.asserts])).toEqual([
      ["AC-1: x", true],
      ["AC-2: y", false],
    ]);
  });

  it("does not count an expect that only appears in a comment", () => {
    const blocks = findTestBlocks(`test('AC-1: a', async () => {
      // await expect(x).toBeVisible();
    });`);
    expect(blocks[0].asserts).toBe(false);
  });
});

describe("extractLocatorKeys", () => {
  it("extracts the single-string getters", () => {
    expect(
      extractLocatorKeys(
        `getByTestId('a'); getByLabel('b'); getByPlaceholder('c');
         getByText('d'); getByTitle('e'); getByAltText('f');`
      ).sort()
    ).toEqual(["alttext:f", "label:b", "placeholder:c", "testid:a", "text:d", "title:e"]);
  });

  it("keys a role locator by role and accessible name", () => {
    expect(extractLocatorKeys(`getByRole('button', { name: 'Bind Policy' })`)).toEqual([
      "role:button:Bind Policy",
    ]);
  });

  it("ignores locators mentioned in comments", () => {
    expect(extractLocatorKeys(`// getByTestId('ghost')\ngetByTestId('real');`)).toEqual([
      "testid:real",
    ]);
  });

  it("catches a hallucinated getByText, which used not to be extracted at all", () => {
    const r = hallucinationCheck(
      {
        specFileName: "x.spec.ts",
        specCode: `await page.getByText('Approve claim').click();`,
        tests: [],
      },
      registry
    );
    expect(r.passed).toBe(false);
    expect(r.details.join(" ")).toContain("text:Approve claim");
  });
});

describe("validateGenerationResult", () => {
  const valid = { specFileName: "x.spec.ts", specCode: "test('a', () => {});", tests: [] };

  it("accepts a well-formed result", () => {
    expect(validateGenerationResult(valid).specFileName).toBe("x.spec.ts");
  });

  it("rejects a missing tests array instead of crashing downstream", () => {
    const { tests, ...noTests } = valid;
    expect(() => validateGenerationResult(noTests)).toThrow(/tests must be an array/);
  });

  it("rejects coversCriteria that came back as a string", () => {
    expect(() =>
      validateGenerationResult({ ...valid, tests: [{ title: "a", coversCriteria: "AC-1" }] })
    ).toThrow(/coversCriteria must be an array/);
  });

  it("rejects an empty specCode", () => {
    expect(() => validateGenerationResult({ ...valid, specCode: "  " })).toThrow(
      /specCode must be a non-empty string/
    );
  });

  it("reports every problem at once rather than the first", () => {
    try {
      validateGenerationResult({});
      throw new Error("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("specFileName");
      expect(message).toContain("specCode");
      expect(message).toContain("tests");
    }
  });
});

describe("assertionQualityCheck", () => {
  const spec = (...bodies: string[]) =>
    `import { test, expect } from '@playwright/test';\n` +
    bodies
      .map(
        (body, i) =>
          `test('AC-${i + 1}: thing ${i + 1}', async ({ page }) => {${body}});`
      )
      .join("\n");

  const gen = (specCode: string): GenerationResult => ({
    specFileName: "x.spec.ts",
    specCode,
    tests: [],
  });

  it("passes when each test asserts something of its own", () => {
    const r = assertionQualityCheck(
      doc,
      gen(
        spec(
          `await expect(page.getByTestId('client-name')).toHaveValue('x');`,
          `await expect(page.getByTestId('save-client')).toHaveText('Saved');`
        )
      )
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it("fails two tests covering different criteria that assert the identical thing", () => {
    const same = `await expect(page.getByTestId('save-client')).toHaveText('Saved');`;
    const r = assertionQualityCheck(doc, gen(spec(same, same)));
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.details.join(" ")).toContain("Identical assertions");
  });

  it("does not compare tests that assert nothing, which coverage already reports", () => {
    const r = assertionQualityCheck(doc, gen(spec(`// TODO`, `// TODO`)));
    expect(r.passed).toBe(true);
    expect(r.details.join(" ")).not.toContain("Identical assertions");
  });

  it("reports an existence-only assertion as weak without failing", () => {
    const r = assertionQualityCheck(
      doc,
      gen(
        spec(
          `await expect(page.getByTestId('client-name')).toBeVisible();`,
          `await expect(page.getByTestId('save-client')).toHaveText('Saved');`
        )
      )
    );
    expect(r.passed).toBe(true);
    expect(r.details.join(" ")).toContain("Existence-only");
  });

  it("counts a distinguishing assertion alongside an existence-only one", () => {
    const r = assertionQualityCheck(
      doc,
      gen(
        spec(
          `await expect(page.getByTestId('client-name')).toHaveValue('x');
           await expect(page.getByTestId('client-name')).toBeVisible();`,
          `await expect(page.getByTestId('save-client')).toHaveText('Saved');`
        )
      )
    );
    expect(r.passed).toBe(true);
    expect(r.details.join(" ")).not.toContain("Existence-only");
  });
});
