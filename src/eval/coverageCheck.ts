import type { CriteriaDocument, GenerationResult, CheckResult } from "../types.js";

/**
 * Coverage check: did the generated suite cover every acceptance criterion?
 *
 * The manifest is a claim, not evidence. A model that skips a criterion and
 * reports it as covered anyway defeats a check that only reads `coversCriteria`,
 * and so does a model that emits six correctly titled tests with empty bodies.
 * Both score full marks against the manifest alone, and both are worthless.
 *
 * So coverage is decided by the generated code and nothing else. A criterion
 * counts as covered when the code contains a test block whose title carries that
 * criterion's id and whose body contains at least one assertion. The generator
 * prompt requires the id prefix for exactly this reason: it is the link between a
 * requirement and the code that supposedly protects it, and asking the model to
 * state it in the title is cheaper and far more reliable than inferring it.
 *
 * The manifest is still read, but only to report where the model's account of its
 * own work disagrees with the work. That disagreement is useful signal and it
 * never decides the score.
 *
 * This is deliberately shallow. It cannot tell a meaningful assertion from a
 * trivial one, which needs a graded eval and is the next thing to build. What it
 * does do is make the check read the artefact instead of the report about it.
 */

/** Strip comments so an `expect` mentioned in prose doesn't count as an assertion. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

export type TestBlock = { title: string; body: string; asserts: boolean };

/**
 * Test blocks found in the generated code, in source order.
 *
 * Split on each test opening rather than parsed properly: a real parse would mean
 * carrying a TypeScript AST walk to learn something a split already tells us.
 * `test.only`, `test.skip`, `test.fixme` and `test.fail` count as test blocks.
 * `test.describe` and the hooks do not, because a describe wrapper is not a test
 * and counting it inflates the block total.
 */
export function findTestBlocks(specCode: string): TestBlock[] {
  const code = stripComments(specCode);
  const opening = /\btest(?:\.(?:only|skip|fixme|fail))?\s*\(\s*['"`]([^'"`]+)['"`]/g;

  const starts: { title: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = opening.exec(code)) !== null) {
    starts.push({ title: match[1], index: match.index });
  }

  return starts.map((start, i) => {
    const body = code.slice(start.index, starts[i + 1]?.index ?? code.length);
    return { title: start.title, body, asserts: /\bexpect\s*\(/.test(body) };
  });
}

export function coverageCheck(doc: CriteriaDocument, result: GenerationResult): CheckResult {
  const required = doc.criteria.map((c) => c.id);
  const blocks = findTestBlocks(result.specCode);

  const blocksFor = (id: string) => blocks.filter((b) => b.title.includes(id));

  const covered = required.filter((id) => blocksFor(id).some((b) => b.asserts));
  const hollow = required.filter(
    (id) => !covered.includes(id) && blocksFor(id).length > 0
  );
  const absent = required.filter((id) => blocksFor(id).length === 0);

  // Where the model's own account disagrees with its output. Reported, not scored.
  const claimed = new Set(
    result.tests.flatMap((t) => t.coversCriteria).filter((id) => required.includes(id))
  );
  const claimedButNotInCode = [...claimed].filter((id) => !covered.includes(id));

  const score = required.length === 0 ? 1 : covered.length / required.length;
  const details: string[] = [
    `Covered ${covered.length} of ${required.length} criteria (${Math.round(score * 100)}%), ` +
      `verified against ${blocks.length} test block(s) in the generated code.`,
  ];
  if (absent.length > 0) {
    details.push(`No test block names these criteria: ${absent.join(", ")}`);
  }
  if (hollow.length > 0) {
    details.push(
      `Named by a test block that asserts nothing, so not counted: ${hollow.join(", ")}`
    );
  }
  if (claimedButNotInCode.length > 0) {
    details.push(
      `Manifest claims these are covered but the code does not bear it out: ${claimedButNotInCode.join(", ")}`
    );
  }

  return { name: "coverage", passed: covered.length === required.length, score, details };
}
