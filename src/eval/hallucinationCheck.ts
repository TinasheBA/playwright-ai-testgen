import type { GenerationResult, CheckResult } from "../types.js";

/**
 * Hallucination check: does the generated code reference locators that do not
 * exist in the page registry?
 *
 * We inspect the actual generated code rather than trusting the model's own
 * report of which locators it used. Anything the code references that is not a
 * known-valid locator is a hallucination, and would fail the moment the test
 * ran against the real application. Catching it here, before it reaches the
 * suite, is the whole point.
 *
 * Both the registry entries and the generated code are reduced to canonical
 * keys (e.g. "testid:save-client", "role:button:Bind Policy") so the registry
 * can be written as normal, readable Playwright locators.
 */

/** Extract canonical locator keys from any text (registry entry or spec code). */
export function extractLocatorKeys(text: string): string[] {
  const keys = new Set<string>();

  const testId = /getByTestId\(\s*['"`]([^'"`]+)['"`]/g;
  const label = /getByLabel\(\s*['"`]([^'"`]+)['"`]/g;
  const placeholder = /getByPlaceholder\(\s*['"`]([^'"`]+)['"`]/g;
  const css = /\.locator\(\s*['"`]([^'"`]+)['"`]/g;
  // Role locators carry identity in the accessible name, not the role alone.
  const roleWithName =
    /getByRole\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{[^}]*?name:\s*['"`]([^'"`]+)['"`]/g;

  let m: RegExpExecArray | null;
  while ((m = testId.exec(text)) !== null) keys.add(`testid:${m[1]}`);
  while ((m = label.exec(text)) !== null) keys.add(`label:${m[1]}`);
  while ((m = placeholder.exec(text)) !== null) keys.add(`placeholder:${m[1]}`);
  while ((m = css.exec(text)) !== null) keys.add(`css:${m[1]}`);
  while ((m = roleWithName.exec(text)) !== null)
    keys.add(`role:${m[1]}:${m[2]}`);

  return [...keys];
}

export function hallucinationCheck(
  result: GenerationResult,
  pageRegistry: string[]
): CheckResult {
  // Build the set of allowed keys from the registry.
  const allowed = new Set<string>();
  for (const entry of pageRegistry) {
    for (const key of extractLocatorKeys(entry)) allowed.add(key);
  }

  const used = extractLocatorKeys(result.specCode);
  const hallucinated = used.filter((key) => !allowed.has(key));
  const score = used.length === 0 ? 1 : 1 - hallucinated.length / used.length;

  const details: string[] = [
    `Locators referenced: ${used.length}. In registry: ${
      used.length - hallucinated.length
    }.`,
  ];
  if (hallucinated.length > 0) {
    details.push(`Hallucinated (not in registry): ${hallucinated.join(", ")}`);
  }

  return {
    name: "hallucination",
    passed: hallucinated.length === 0,
    score,
    details,
  };
}
