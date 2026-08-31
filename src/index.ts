import "dotenv/config"; // loads ANTHROPIC_API_KEY from .env if present
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateTests } from "./generator/generateTests.js";
import { evaluate } from "./eval/evaluate.js";
import { renderReport } from "./report/report.js";
import type { CriteriaDocument } from "./types.js";

/**
 * Usage:
 *   tsx src/index.ts <criteria.json> <page-registry.json> [outDir]
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */
async function main() {
  const [criteriaPath, registryPath, outDir = "out"] = process.argv.slice(2);

  if (!criteriaPath || !registryPath) {
    console.error(
      "Usage: tsx src/index.ts <criteria.json> <page-registry.json> [outDir]"
    );
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. See .env.example.");
    process.exit(1);
  }

  const doc = JSON.parse(
    await readFile(criteriaPath, "utf8")
  ) as CriteriaDocument;
  const pageRegistry = JSON.parse(
    await readFile(registryPath, "utf8")
  ) as string[];

  console.error(`Generating tests for "${doc.feature}"...`);
  const result = await generateTests(doc, pageRegistry);

  // Write the generated spec and the eval report to disk.
  await mkdir(outDir, { recursive: true });
  const specPath = path.join(outDir, result.specFileName);
  await writeFile(specPath, result.specCode, "utf8");

  const report = evaluate(doc, result, pageRegistry);
  await writeFile(
    path.join(outDir, "eval-report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log(renderReport(report));
  console.error(`Spec written to ${specPath}`);

  // Non-zero exit if any check failed, so this can gate CI.
  const anyFailed = report.checks.some((c) => !c.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
