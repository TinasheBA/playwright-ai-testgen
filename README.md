# playwright-ai-testgen

[![CI](https://github.com/TinasheBA/playwright-ai-testgen/actions/workflows/ci.yml/badge.svg)](https://github.com/TinasheBA/playwright-ai-testgen/actions/workflows/ci.yml)

Generate Playwright tests from acceptance criteria with an LLM, then automatically check the output before it ever reaches your suite.

The generating part is easy. Any wrapper around an API can do it. The part that matters, and the part this project is really about, is the **eval harness** that scores what the model produced: did it cover every acceptance criterion, did it invent a locator that doesn't exist, does the code even compile. An AI-written test that passes for the wrong reason is worse than no test at all, so the harness treats model output as something to verify, not trust.

## Quick start

```bash
git clone https://github.com/TinasheBA/playwright-ai-testgen.git
cd playwright-ai-testgen
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run demo           # runs against the bundled insurance example
```

Requires **Node 20+** and an [Anthropic API key](https://console.anthropic.com/).

## What it does

Feed it a feature's acceptance criteria and a registry of valid page locators. It calls the Anthropic API to write a Playwright spec in TypeScript, then runs three checks against the result:

| Check | What it catches |
|-------|----------------|
| **compile** | Does the generated spec transpile without syntax errors? |
| **coverage** | Does a real test block, with a real assertion, exist for every acceptance criterion? |
| **hallucination** | Does the code reference any locator that isn't in the registry? |

Every check reads the **actual generated code**, never the model's own report of what it did. That is the whole design, and getting it wrong is easy: the coverage check used to read the `coversCriteria` field from the model's manifest, which meant the check advertised as catching a skipped requirement was built on the model's claim not to have skipped it. It now links a requirement to code through the criterion id in the test title, and requires that block to assert something. The manifest is still read, but only to report where the model's account disagrees with its output.

## The check that had to be rewritten

Here is the generation that beat the old harness. Every criterion claimed in the manifest, every test titled correctly, the spec transpiles, and no locators referenced so nothing looks invented:

```ts
test.describe('Short-term insurance policy lifecycle', () => {
  test('AC-1: broker creates a new client and it is persisted', async ({ page }) => {
    // TODO
  });
  // ...five more, same shape
});
```

Six tests, full coverage, no hallucinations, not one assertion. Three green checks over a file that protects nothing. It now reads:

```
Overall:      67%

[PASS] compile (100%)
       Generated spec transpiles without syntax errors.
[FAIL] coverage (0%)
       Covered 0 of 6 criteria (0%), verified against 6 test block(s) in the generated code.
       Named by a test block that asserts nothing, so not counted: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
       Manifest claims these are covered but the code does not bear it out: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
[PASS] hallucination (100%)
       No locators referenced at all, so nothing here was verified.
```

That generation is committed as `examples/mock-hollow.json`, and CI requires it to fail. A gate with no test proving it rejects something is a gate you are trusting on faith.

## Why the hallucination check matters

Here is a real run against a short-term insurance policy lifecycle. The model reported six tests covering all six criteria, and the code compiled cleanly. It still slipped in a locator that doesn't exist:

```
Feature:      Short-term insurance policy lifecycle (broker portal)
Tests:        6
Overall:      98%

[PASS] compile (100%)
       Generated spec transpiles without syntax errors.
[PASS] coverage (100%)
       Covered 6 of 6 criteria (100%).
[FAIL] hallucination (94%)
       Locators referenced: 16. In registry: 15.
       Hallucinated (not in registry): testid:confirm-reinsurance
```

Coverage and compile both pass. On their own they would have waved this through. The one bad locator on the reinsurance test would have failed the moment it hit the real application, and it would have looked like an application defect, not a generation defect. The harness catches it in about a second, before it costs anyone a debugging session.

## How it works

```
criteria.json ──┐
                ├──▶ generator (Anthropic API) ──▶ spec.ts + manifest
page-registry ──┘                                        │
                                                         ▼
                                              ┌─────────────────────┐
                                              │    eval harness     │
                                              │                     │
                                              │  ┌───────────────┐  │
                                              │  │ compile check  │  │
                                              │  ├───────────────┤  │
                                              │  │ coverage check │  │
                                              │  ├───────────────┤  │
                                              │  │ hallucination  │  │
                                              │  │    check       │  │
                                              │  └───────────────┘  │
                                              └──────────┬──────────┘
                                                         ▼
                                                   eval-report.json
                                                   (exit 1 if any FAIL)
```

## Input format

**Criteria** (`examples/criteria/policy-lifecycle.json`):

```json
{
  "feature": "Short-term insurance policy lifecycle (broker portal)",
  "criteria": [
    { "id": "AC-1", "text": "A broker can create a new client, and the client is persisted." }
  ]
}
```

**Page registry** (`examples/page-registry.json`) — a list of the locators that actually exist on the page. The generator is instructed to use only these, and the hallucination check holds it to that:

```json
["getByTestId('client-name')", "getByRole('button', { name: 'Bind Policy' })"]
```

## Custom usage

Point it at your own files:

```bash
npx tsx src/index.ts path/to/criteria.json path/to/page-registry.json out/
```

The generated spec and a full `eval-report.json` land in the output folder. The process exits non-zero if any check fails, so it can gate a CI pipeline.

## Dry-run (no API key needed)

You can validate the eval pipeline without calling the Anthropic API by feeding it a mock generation result:

```bash
npm run dry-run:good     # passes all 3 checks
npm run dry-run:bad      # fails coverage (a missing criterion) + hallucination
npm run dry-run:hollow   # fails coverage (correct titles, no assertions)
```

CI runs all three and asserts the exit code of each, including that the two bad ones
actually fail. The bad-mock step used to end in `|| true`, which meant the step proving
the harness rejects bad output passed whether it rejected anything or not.

The dry-run reads a mock JSON file (what the API *would* return) and runs the full eval pipeline — compile check, coverage check, hallucination check, report rendering, and exit code. This is what CI uses to prove the pipeline works on every push.

## Project structure

```
src/
  generator/generateTests.ts    Anthropic API call, returns spec + coverage manifest
  eval/compileCheck.ts          TypeScript transpile check
  eval/coverageCheck.ts         criteria coverage
  eval/hallucinationCheck.ts    locator verification against the registry
  eval/evaluate.ts              runs the checks, assembles the report
  eval/__tests__/               vitest unit tests for all checks
  report/report.ts              console summary
  index.ts                      CLI entry point (calls API)
  dry-run.ts                    CLI entry point (no API, uses mock JSON)
examples/
  criteria/                     sample acceptance criteria
  page-registry.json            sample locator registry
  mock-good.json                mock result that passes all checks
  mock-bad.json                 mock result that fails coverage + hallucination
  mock-hollow.json              correct titles, zero assertions; must fail coverage
```

The model name is read from `TESTGEN_MODEL` (default `claude-sonnet-5`), so switching model versions is a config change rather than a code edit.

## Known limits

Worth reading before you trust a score.

The coverage check counts *an* assertion, not a good one. A test asserting `expect(true).toBe(true)` clears the bar. Telling a meaningful assertion from a trivial one needs a graded eval, which is the next thing below.

The hallucination check ignores two things rather than guessing at them. A role locator with no accessible name (`getByRole('checkbox')`) carries no identity to check against a registry. A locator built from a regex (`getByText(/save/i)`) is a pattern, and matching patterns against a registry of literals is a different job.

The compile check is a transpile pass, so it catches syntax errors and not type errors. A call to a method that does not exist on `Locator` gets through.

## What I'd add next

- **Full type-check** — swap the compile check from a transpile pass to `tsc --noEmit` once `@playwright/test` is installed, so type errors are caught too.
- **Meaningful assertion check** — LLM-graded evaluation: does each test assert on real behaviour, or does it pass trivially? That is the harder half of the problem.
- **Duplicate-test detector** — models like to generate near-identical tests for adjacent criteria.

## Why I built this

I write Playwright automation for short-term insurance software and use AI daily to draft it. AI is good at a fast first draft and at suggesting cases I hadn't considered. It is poor at knowing which of them matter, and at recognising when a test passes for the wrong reason. That judgement has to live somewhere. This project is my attempt to put some of it in code.

## License

[MIT](LICENSE)
