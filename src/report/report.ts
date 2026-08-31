import type { EvalReport } from "../types.js";

/** Render the eval report as a readable console summary. */
export function renderReport(report: EvalReport): string {
  const lines: string[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  lines.push("");
  lines.push(`Feature:      ${report.feature}`);
  lines.push(`Tests:        ${report.testCount}`);
  lines.push(`Overall:      ${pct(report.overallScore)}`);
  lines.push("");

  for (const check of report.checks) {
    const mark = check.passed ? "PASS" : "FAIL";
    lines.push(`[${mark}] ${check.name} (${pct(check.score)})`);
    for (const detail of check.details) {
      lines.push(`       ${detail}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
