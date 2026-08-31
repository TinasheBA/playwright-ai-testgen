/**
 * Dry-run: validates the full eval pipeline without calling the Anthropic API.
 *
 * Usage:
 *   npx tsx src/dry-run.ts <mock-result.json> [criteria.json] [page-registry.json]
 *
 * The mock result is what the API *would* return. Everything downstream of the
 * API call — eval checks, report rendering, exit code — runs for real.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { evaluate } from "./eval/evaluate.js";
import { renderReport } from "./report/report.js";
import type { CriteriaDocument, GenerationResult } from "./types.js";

const DEFAULT_CRITERIA = "examples/criteria/policy-lifecycle.json";
const DEFAULT_REGISTRY = "examples/page-registry.json";

async function main() {
  const [mockPath, criteriaPath = DEFAULT_CRITERIA, registryPath = DEFAULT_REGISTRY] =
    process.argv.slice(2);

  if (!mockPath) {
    console.error("Usage: npx tsx src/dry-run.ts <mock-result.json> [criteria.json] [page-registry.json]");
    process.exit(1);
  }

  const doc = JSON.parse(await readFile(criteriaPath, "utf8")) as CriteriaDocument;
  const pageRegistry = JSON.parse(await readFile(registryPath, "utf8")) as string[];
  const result = JSON.parse(await readFile(mockPath, "utf8")) as GenerationResult;

  console.error(`[dry-run] Feature: "${doc.feature}"`);
  console.error(`[dry-run] Mock tests: ${result.tests.length}`);
  console.error(`[dry-run] Registry entries: ${pageRegistry.length}`);
  console.error("");

  // Run the real eval pipeline — no API call, no mocking of eval logic.
  const report = evaluate(doc, result, pageRegistry);

  // Write the report to disk just like the real pipeline does.
  const outDir = "out/dry-run";
  await mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, "eval-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(renderReport(report));
  console.error(`Report written to ${reportPath}`);

  const anyFailed = report.checks.some((c) => !c.passed);
  console.error(`Exit code: ${anyFailed ? "1 (checks failed)" : "0 (all passed)"}`);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
