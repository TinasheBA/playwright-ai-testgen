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

/**
 * Validate parsed model output before anything downstream reads it.
 *
 * `JSON.parse(...) as GenerationResult` is a cast, not a check: it tells the
 * compiler what to assume and tells the runtime nothing. A response missing
 * `tests` then crashes on `result.tests.length` with a TypeError, and a
 * `coversCriteria` that came back as a string instead of an array iterates
 * character by character and reports zero coverage without saying why. Both are
 * the model failing to follow the schema, which is a normal thing for a model to
 * do and should read as a clear error rather than a stack trace.
 *
 * Hand-written rather than pulled from a schema library, because this is the only
 * boundary in the project and the shape is four fields deep.
 */
export function validateGenerationResult(raw: unknown): GenerationResult {
  const problems: string[] = [];
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    problems.push("expected a JSON object at the top level");
  }
  if (typeof obj.specFileName !== "string" || obj.specFileName.trim() === "") {
    problems.push("specFileName must be a non-empty string");
  }
  if (typeof obj.specCode !== "string" || obj.specCode.trim() === "") {
    problems.push("specCode must be a non-empty string");
  }
  if (!Array.isArray(obj.tests)) {
    problems.push("tests must be an array");
  } else {
    obj.tests.forEach((test, i) => {
      const entry = (typeof test === "object" && test !== null ? test : {}) as Record<string, unknown>;
      if (typeof entry.title !== "string" || entry.title.trim() === "") {
        problems.push(`tests[${i}].title must be a non-empty string`);
      }
      if (!Array.isArray(entry.coversCriteria)) {
        problems.push(`tests[${i}].coversCriteria must be an array of criterion ids`);
      } else if (!entry.coversCriteria.every((id) => typeof id === "string")) {
        problems.push(`tests[${i}].coversCriteria must contain only strings`);
      }
    });
  }

  if (problems.length > 0) {
    throw new Error(`Model output did not match the required schema:\n  - ${problems.join("\n  - ")}`);
  }
  return raw as GenerationResult;
}
