import type {
  CriteriaDocument,
  GenerationResult,
  EvalReport,
} from "../types.js";
import { coverageCheck } from "./coverageCheck.js";
import { hallucinationCheck } from "./hallucinationCheck.js";
import { compileCheck } from "./compileCheck.js";

/**
 * Run every eval check against a generation result and assemble a report.
 * Add new checks here as you build them (e.g. an LLM-graded "meaningful
 * assertion" check, or a duplicate-test detector).
 */
export function evaluate(
  doc: CriteriaDocument,
  result: GenerationResult,
  pageRegistry: string[]
): EvalReport {
  const checks = [
    compileCheck(result),
    coverageCheck(doc, result),
    hallucinationCheck(result, pageRegistry),
  ];

  const overallScore =
    checks.reduce((sum, c) => sum + c.score, 0) / checks.length;

  return {
    feature: doc.feature,
    generatedAt: new Date().toISOString(),
    testCount: result.tests.length,
    checks,
    overallScore,
  };
}
