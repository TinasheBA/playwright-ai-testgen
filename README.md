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
| **coverage** | Is every acceptance criterion covered by at least one test? |
| **hallucination** | Does the code reference any locator that isn't in the registry? |

The hallucination check inspects the **actual generated code** rather than trusting the model's own report of what it used. That's the one that earns its place.

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
npm run dry-run:good   # should pass all 3 checks
npm run dry-run:bad    # should fail coverage + hallucination
```

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
```

The model name is read from `TESTGEN_MODEL` (default `claude-sonnet-5`), so switching model versions is a config change rather than a code edit.

## What I'd add next

- **Full type-check** — swap the compile check from a transpile pass to `tsc --noEmit` once `@playwright/test` is installed, so type errors are caught too.
- **Meaningful assertion check** — LLM-graded evaluation: does each test assert on real behaviour, or does it pass trivially? That is the harder half of the problem.
- **Duplicate-test detector** — models like to generate near-identical tests for adjacent criteria.

## Why I built this

I write Playwright automation for short-term insurance software and use AI daily to draft it. AI is good at a fast first draft and at suggesting cases I hadn't considered. It is poor at knowing which of them matter, and at recognising when a test passes for the wrong reason. That judgement has to live somewhere. This project is my attempt to put some of it in code.

## License

[MIT](LICENSE)
