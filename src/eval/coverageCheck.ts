import type {
  CriteriaDocument,
  GenerationResult,
  CheckResult,
} from "../types.js";

/**
 * Coverage check: did the generated suite cover every acceptance criterion?
 *
 * We take the union of coversCriteria across all generated tests and compare
 * it against the criteria in the input document. Any criterion with no test
 * is a gap. This is the check that catches the model quietly skipping a
 * requirement while reporting success.
 */
export function coverageCheck(
  doc: CriteriaDocument,
  result: GenerationResult
): CheckResult {
  const required = new Set(doc.criteria.map((c) => c.id));
  const covered = new Set<string>();

  for (const test of result.tests) {
    for (const id of test.coversCriteria) {
      if (required.has(id)) covered.add(id);
    }
  }

  const missing = [...required].filter((id) => !covered.has(id));
  const score = required.size === 0 ? 1 : covered.size / required.size;

  const details: string[] = [
    `Covered ${covered.size} of ${required.size} criteria (${Math.round(
      score * 100
    )}%).`,
  ];
  if (missing.length > 0) {
    details.push(`Uncovered criteria: ${missing.join(", ")}`);
  }

  return {
    name: "coverage",
    passed: missing.length === 0,
    score,
    details,
  };
}
