# Capability-plan cooperation: first Pi trial

**Date:** 2026-09-27. **Base:** `5a1934aa844c5ab95013653f15c7aeb422690b13`.
**Scope:** a local experiment for the [capability-plan cooperation hypothesis](../../../architecture/capability-plan-cooperation.hypothesis.md); the hypothesis document exists in the working checkout that initiated this trial. This branch is an isolated candidate, not a delivered feature.

## Method

Four persistent Pi roles, all using `openai-codex/gpt-6-sol:medium`, worked through a shared revisable plan: CLI engineer (A), CLI architect (A), Analysis architect (B), and Analysis engineer (B). A temporary driver called the existing Pi adapter for each turn. The two engineers had module-scoped write access; the architects used read-only tools. The coordinator copied only two cross-owner compatibility edits into the candidate: the reference-harness evaluator call and the root `RelatedRole` exposure. No production harness cooperation workflow was added.

The archived [plan](./2026-09-27-capability-plan-cooperation-trial.plan.md) records the original need, 23 review revisions, implementation discoveries, corrections and open gates. The complete per-turn prompts, submissions, result JSON, transcripts, and previous plan snapshots remain in `/tmp/ramify-capability-cooperation-20260927/`; the local driver is `run-turn.mts` there. The repository branch preserves the exact source candidate and the final plan, while the temporary directory carries the granular conversation evidence.

## Observed result

The agents agreed to let Analysis own denial facts and proposal evidence while CLI relays them through a common human block in full and changed forms. The final CLI tests use the **real Analysis provider** in batch and retained runs:

| Case | Independent expected result | Observed result |
| --- | --- | --- |
| No reaching same-file statement | No one-edit proposal; received names `none` | Denied, `proposal: null`, matching full/changed block |
| Same-file `value` statement reaches importer | Proposal names the actual statement and `privateValue`; adding it in one line allows import | Denied before edit, then allowed with exit 0 after the real edit; full/changed block includes identical proposal line |
| Missing two relays | One added relay cannot allow import; no one-edit proposal | Denied, `proposal: null` before and after one relay edit |

The CLI architect accepted **only this bounded three-simple-case observation** at plan revision 22. The provider and CLI tests passed 87/87 and 26/26 respectively. `npm run type-check`, `npm run build`, `npm run check:self` with complete coverage, and `git diff --check` passed on the candidate after the last engineer turn. A prepared full reference run **before** the proposal-stage changes had 377 passes and 13 failures out of 390 tests. One `signature-inferred` failure was reproduced on the unchanged original checkout; the other 12 remain unattributed. The full reference suite has not been rerun on the final candidate.

## What cooperation changed

The first provider and consumer tests were green while asserting `proposal: null` for a fixture that already had `expose-src value from "interfaces/api.ts" to descendants`. The CLI engineer recognized that adding `privateValue` to that very statement is a one-edit repair. The architects split the scenario into a genuine no-statement negative, a same-file positive and a two-hop negative, and sent the proposal question back to Analysis. This is concrete evidence that a consumer review of a real provider result caught an incorrect test oracle and reopened the shared design.

The Analysis architect also rejected general acceptance after finding virtual insertion that bypasses parser syntax for reserved or quoted names, a 64-candidate attempt limit that irrelevant statements can exhaust, and incomplete support for generalized missing-hop wording and retained candidate-site changes. Those defects are still present in this experiment branch. The provisional optional diagnostic fields also do not satisfy the original plan's universal JSON contract. Five denial codes, related-role coverage, not-checked wording, reference rendering, bounds and exit policy remain open. The first trial does not establish production readiness or that this workflow outperforms the existing approach.

## Cost and reading the evidence

There were 23 Pi turns: 5 CLI engineer, 9 CLI architect, 6 Analysis architect and 3 Analysis engineer. Summed Pi result usage is 576,584 input tokens, 78,562 output tokens and 13,832,192 cache-read tokens; summed agent elapsed time is 47.6 minutes. These are **summed per-turn figures**, not wall-clock time or a controlled comparison. The agent effort was substantial for three cases. The many review loops caught real defects, but a simpler workflow may obtain the same result at lower cost; this experiment cannot decide that question.

The trial candidate is deliberately retained on its own branch for inspection. Merge or product adoption requires a separate decision after the open semantic defects and full acceptance gates are handled.
