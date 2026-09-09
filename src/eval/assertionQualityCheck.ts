import type { CriteriaDocument, GenerationResult, CheckResult } from "../types.js";
import { findTestBlocks } from "./coverageCheck.js";
import { extractLocatorKeys } from "./hallucinationCheck.js";

/**
 * Assertion quality check: is each test verifying its own criterion, or just
 * verifying that the page rendered?
 *
 * Coverage already refuses to count a test block with no assertion in it, so
 * presence is handled. This check is about what the assertion is worth. Two
 * failure shapes get past every other check in this harness:
 *
 *   1. Every assertion in a test is existence-only. `toBeVisible()` on an error
 *      box proves an error appeared, not that it was the right error. A
 *      criterion that states an outcome is not verified by proving that some
 *      element rendered.
 *   2. Two tests covering different criteria assert the identical thing. At
 *      most one of them can be verifying its own criterion, and usually
 *      neither is: the model wrote one real test and copied it.
 *
 * Shape 2 gates the check, because it is a contradiction rather than a matter
 * of degree: the same assertion cannot be the evidence for two different
 * requirements. Shape 1 is reported as weak without failing, because a
 * criterion genuinely about whether something is shown is legitimately
 * verified by `toBeVisible()`, and failing on it would train people to ignore
 * the check.
 *
 * Criteria are read from test titles, not from the manifest, for the same
 * reason coverage reads the code: the manifest is the model's account of its
 * own work, and the work is the evidence.
 *
 * ponytail: static heuristic. It cannot tell whether an assertion is *correct*
 * for its criterion, only whether it is distinct and more than existence. A
 * test asserting the wrong error message with `toContainText` passes this. That
 * needs an LLM-graded pass, which needs an API key and therefore cannot run in
 * CI or in the dry-run, so it belongs behind a flag rather than here.
 */

/** Matchers that prove something rendered, not that it is right. */
const EXISTENCE_ONLY = new Set([
  "toBeVisible",
  "toBeAttached",
  "toBeInViewport",
  "toBeHidden",
  "toBeEnabled",
]);

/** `expect(<target>)` followed by an optional `.not` and the matcher name. */
const ASSERTION = /expect\(([\s\S]*?)\)\s*\.\s*((?:not\s*\.\s*)?[A-Za-z]+)/g;

interface Assessed {
  title: string;
  criteria: string[];
  /** One entry per assertion: `matcher@locator-keys`. */
  signature: string[];
  /** Assertions that prove more than "it rendered". */
  meaningful: string[];
}

function assess(specCode: string, required: string[]): Assessed[] {
  return findTestBlocks(specCode).map((block) => {
    const signature: string[] = [];
    const meaningful: string[] = [];

    for (const [, target, rawMatcher] of block.body.matchAll(ASSERTION)) {
      const matcher = rawMatcher.replace(/\s+/g, "");
      const keys = extractLocatorKeys(target).sort().join(",") || "?";
      const entry = `${matcher}@${keys}`;
      signature.push(entry);
      if (!EXISTENCE_ONLY.has(matcher.replace(/^not\./, ""))) {
        meaningful.push(entry);
      }
    }

    return {
      title: block.title,
      criteria: required.filter((id) => block.title.includes(id)),
      signature,
      meaningful,
    };
  });
}

export function assertionQualityCheck(
  doc: CriteriaDocument,
  result: GenerationResult
): CheckResult {
  const required = doc.criteria.map((c) => c.id);
  const assessed = assess(result.specCode, required);

  if (assessed.length === 0) {
    return {
      name: "assertion-quality",
      passed: true,
      score: 1,
      details: ["No test blocks to assess."],
    };
  }

  // Same assertions, different criteria. Blocks with no assertion are coverage's
  // problem, not this check's, so they are skipped rather than matched on empty.
  const indistinguishable = new Set<number>();
  const pairs: string[] = [];
  for (let i = 0; i < assessed.length; i++) {
    for (let j = i + 1; j < assessed.length; j++) {
      const a = assessed[i];
      const b = assessed[j];
      if (a.signature.length === 0 || b.signature.length === 0) continue;
      if (a.signature.join("|") !== b.signature.join("|")) continue;
      const sameCriteria =
        a.criteria.length === b.criteria.length &&
        a.criteria.every((id) => b.criteria.includes(id));
      if (sameCriteria) continue;
      indistinguishable.add(i).add(j);
      pairs.push(`"${a.title}" and "${b.title}"`);
    }
  }

  const weak = assessed.filter(
    (t) => t.signature.length > 0 && t.meaningful.length === 0
  );

  // Blocks with no assertion are coverage's finding, so they are not scored
  // here. Counting them as sound would report a spec full of empty tests as
  // 100% on this check.
  const asserting = assessed.filter((t) => t.signature.length > 0);
  if (asserting.length === 0) {
    return {
      name: "assertion-quality",
      passed: true,
      score: 1,
      details: ["No assertions to assess. The coverage check reports why."],
    };
  }

  const sound = asserting.length - indistinguishable.size;
  const score = sound / asserting.length;

  const details: string[] = [
    `${sound} of ${asserting.length} tests assert something of their own (${Math.round(
      score * 100
    )}%).`,
  ];
  if (pairs.length > 0) {
    details.push(
      `Identical assertions for different criteria: ${pairs.join("; ")}`
    );
  }
  if (weak.length > 0) {
    details.push(
      `Existence-only assertions, so the criterion is not really verified: ${weak
        .map((t) => `"${t.title}"`)
        .join(", ")}`
    );
  }

  return {
    name: "assertion-quality",
    passed: indistinguishable.size === 0,
    score,
    details,
  };
}
