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
 *
 * Two things this does not catch, both worth knowing before you trust the score.
 * A role locator with no accessible name (`getByRole('checkbox')`) carries no
 * identity to check, so it is ignored rather than guessed at. And a locator
 * built from a regex (`getByText(/save/i)`) is not extracted, because matching a
 * pattern against a registry of literals is a different job than this one.
 */

/**
 * Getters that take a single string and identify an element by that string.
 * One pattern rather than one per getter, so adding a getter is adding a name.
 */
const SINGLE_STRING_GETTER =
  /getBy(TestId|Label|Placeholder|Text|Title|AltText)\(\s*['"`]([^'"`]+)['"`]/g;

/** Role locators carry identity in the accessible name, not the role alone. */
const ROLE_WITH_NAME =
  /getByRole\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{[^}]*?name:\s*['"`]([^'"`]+)['"`]/g;

/** Leading dot optional: registry entries are bare, generated code chains off `page`. */
const CSS_SELECTOR = /\.?locator\(\s*['"`]([^'"`]+)['"`]/g;

/** Strip comments so a locator named in prose is not counted as used. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Extract canonical locator keys from any text (registry entry or spec code). */
export function extractLocatorKeys(text: string): string[] {
  const source = stripComments(text);
  const keys = new Set<string>();

  for (const [, kind, value] of source.matchAll(SINGLE_STRING_GETTER)) {
    keys.add(`${kind.toLowerCase()}:${value}`);
  }
  for (const [, role, name] of source.matchAll(ROLE_WITH_NAME)) {
    keys.add(`role:${role}:${name}`);
  }
  for (const [, selector] of source.matchAll(CSS_SELECTOR)) {
    keys.add(`css:${selector}`);
  }

  return [...keys];
}

export function hallucinationCheck(
  result: GenerationResult,
  pageRegistry: string[]
): CheckResult {
  const allowed = new Set(pageRegistry.flatMap((entry) => extractLocatorKeys(entry)));
  const used = extractLocatorKeys(result.specCode);
  const hallucinated = used.filter((key) => !allowed.has(key));
  const score = used.length === 0 ? 1 : 1 - hallucinated.length / used.length;

  const details: string[] = [
    `Locators referenced: ${used.length}. In registry: ${used.length - hallucinated.length}.`,
  ];
  if (hallucinated.length > 0) {
    details.push(`Hallucinated (not in registry): ${hallucinated.join(", ")}`);
  }
  if (used.length === 0) {
    // Scoring 1 for "referenced nothing" is only defensible because the coverage
    // check refuses a spec whose test blocks contain no assertions. Say so in the
    // report rather than presenting a clean sweep with no evidence behind it.
    details.push("No locators referenced at all, so nothing here was verified.");
  }

  return {
    name: "hallucination",
    passed: hallucinated.length === 0,
    score,
    details,
  };
}
