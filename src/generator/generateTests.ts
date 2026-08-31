import Anthropic from "@anthropic-ai/sdk";
import type { CriteriaDocument, GenerationResult } from "../types.js";

// Model is set via env so switching versions is a config change, not a code change.
const MODEL = process.env.TESTGEN_MODEL ?? "claude-sonnet-5";

const SYSTEM_PROMPT = `You are a senior QA automation engineer. You write Playwright tests in TypeScript using @playwright/test.

Rules:
- Use only locators that exist in the provided page registry. Never invent selectors.
- Prefer role-based and test-id locators (getByRole, getByTestId) over brittle CSS where the registry allows it.
- Every acceptance criterion must be covered by at least one test.
- Each test must assert a real, observable outcome. Do not write tests that pass trivially.

Return ONLY a JSON object, no prose, no markdown fences, matching exactly:
{
  "specFileName": "string ending in .spec.ts",
  "specCode": "string: the full Playwright spec file",
  "tests": [ { "title": "string", "coversCriteria": ["AC-1", ...] } ]
}`;

/**
 * Build the user prompt from the criteria document and the page registry.
 * The registry is passed verbatim so the model knows which locators are valid.
 */
function buildUserPrompt(doc: CriteriaDocument, pageRegistry: string[]): string {
  const criteriaLines = doc.criteria
    .map((c) => `${c.id}: ${c.text}`)
    .join("\n");
  return [
    `Feature: ${doc.feature}`,
    ``,
    `Acceptance criteria:`,
    criteriaLines,
    ``,
    `Valid locators (page registry). Use ONLY these:`,
    pageRegistry.map((l) => `- ${l}`).join("\n"),
  ].join("\n");
}

/** Strip accidental markdown fences if the model adds them despite instructions. */
function stripFences(text: string): string {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

/**
 * Generate a Playwright spec from acceptance criteria.
 * Reads ANTHROPIC_API_KEY from the environment.
 */
export async function generateTests(
  doc: CriteriaDocument,
  pageRegistry: string[]
): Promise<GenerationResult> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096, // always set explicitly
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(doc, pageRegistry) }],
  });

  // Log usage so token spend is trackable per run.
  if (message.usage) {
    console.error(
      `[usage] in=${message.usage.input_tokens} out=${message.usage.output_tokens} model=${MODEL}`
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Model returned no text content");
  }

  let parsed: GenerationResult;
  try {
    parsed = JSON.parse(stripFences(textBlock.text)) as GenerationResult;
  } catch (err) {
    throw new Error(
      `Failed to parse model output as JSON. Raw output:\n${textBlock.text}`
    );
  }

  return parsed;
}
