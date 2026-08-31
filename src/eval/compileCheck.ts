import ts from "typescript";
import type { GenerationResult, CheckResult } from "../types.js";

/**
 * Compile check: does the generated spec actually parse and transpile?
 *
 * This uses the TypeScript compiler's transpileModule to catch syntax errors
 * cheaply, without needing @playwright/test types installed. A test that does
 * not compile is worthless, and the model does sometimes emit code that looks
 * plausible but is malformed.
 *
 * To upgrade this to a full type-check (recommended once you have
 * @playwright/test installed), write specCode to a temp file and run
 * `tsc --noEmit` against it instead. The syntax check here is the runnable MVP.
 */
export function compileCheck(result: GenerationResult): CheckResult {
  const output = ts.transpileModule(result.specCode, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });

  const diagnostics = output.diagnostics ?? [];
  const errors = diagnostics.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n")
  );

  const passed = errors.length === 0;
  return {
    name: "compile",
    passed,
    score: passed ? 1 : 0,
    details: passed
      ? ["Generated spec transpiles without syntax errors."]
      : [`Syntax errors: ${errors.length}`, ...errors.slice(0, 5)],
  };
}
