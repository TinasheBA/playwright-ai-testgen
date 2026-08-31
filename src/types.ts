// Shared types used across the generator and the eval harness.

/** A single acceptance criterion fed into the generator. */
export interface AcceptanceCriterion {
  id: string; // e.g. "AC-1"
  text: string; // the human-readable criterion
}

/** The input document: a feature and its acceptance criteria. */
export interface CriteriaDocument {
  feature: string;
  criteria: AcceptanceCriterion[];
}

/** One generated test, as reported by the model. */
export interface GeneratedTest {
  title: string;
  coversCriteria: string[]; // criterion ids this test claims to cover
}

/** The full generator output: the spec code plus a manifest of tests. */
export interface GenerationResult {
  specFileName: string;
  specCode: string;
  tests: GeneratedTest[];
}

/** Result of a single eval check. */
export interface CheckResult {
  name: string;
  passed: boolean;
  score: number; // 0..1
  details: string[];
}

/** The full eval report. */
export interface EvalReport {
  feature: string;
  generatedAt: string;
  testCount: number;
  checks: CheckResult[];
  overallScore: number; // 0..1, mean of check scores
}
