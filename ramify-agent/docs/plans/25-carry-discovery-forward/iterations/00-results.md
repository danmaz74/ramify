# Iteration 0 results: block and occurrence foundation

**Status:** implemented and focused checks passed. **Date:** 2026-10-09.
**Source commit:** `5306bf94b49846b38d99817d05236a46568902e0`.
**Branch:** `feat/plan25-carry-discovery-forward`.
**Worktree:** `/home/app/ramify-plan25-carry-discovery-forward`.

## Base and recorded baseline

The clean implementation base was `4b00d4aee563a3ac83b82be19b0eb52d9f3ce0fb`,
which adopted the consolidated plan on `01c67abc4ecbb8929b001b65ce20612fa95493a8`.
The latter contains Plans 23/24 and the intervening pinned review-diff delivery
change, descending from the plan's inspected `90940442`. The dirty `/ramify`
planning checkout was preserved. No merge, push or publication was performed.

From the clean worktree root, the configured baseline command was:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

It returned reused full evidence for source `01c67abc`, because the adoption
commit changed only ignored planning documents. This was a recorded **failure**,
not a newly executed passing baseline. The request was
`56f65837-f346-4464-a05e-a2769cc01b36`, returned run ID
`d38d25ec-a927-4835-8eb6-f36669c5d0dc`, report commit
`f502aa3995b8ec57bf1c591c2a4e8303b2c79158`, and run reference
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-09T14-50-29Z-01c67abc4`.
The underlying execution IDs were request
`20fa4a0d-4ef5-4422-a794-6aa555ee0b0c` and run
`0720b98b-2cb7-44c2-8cdd-9f310d1417cd`; coverage recorded 313 expected files,
313 executed, none missing. Original full output is retained at
`/home/app/ramify-plan25-evidence/iteration00-baseline-audit.log`, with a bounded
summary in `iteration00-baseline-summary.json` beside it.

Two inherited review-diff verification defects were reconciled: the task-prompt
assertion still expected “read each patch” after procedures began accepting
complete supplied patches, and the review-diff test's `engineers` helper declared
mutable arrays while returning readonly `Turn` values (TS4104, lines 31–33).
The correction updates that expectation and return type, preserving the committed
review-diff behavior. No baseline failure is labeled passed by audit; final
integrated qualification remains iteration 5's responsibility.

## Delivered behavior and case evidence

| Case | Implemented witness |
| --- | --- |
| B01 | Clean base, configured baseline request, reused evidence, coverage and inherited failures recorded above. |
| D01 | Ordered annotated set/remove replay, latest-set selection, explicit withdrawals, duplicate desired-key rejection and unchanged actual provenance. Unannotated prose establishes no block. |
| D02 | A → B → A emits final A although an earlier matching input remains physically inherited; the next unchanged resolution emits nothing. |
| D03 | One explicit withdrawal, no repeat removal when unavailable, one canonical set on reintroduction and no repeat unchanged set. Other available families remain intact. |
| D04 | Independently authored `/1` and `/2` manifests/intents preserve original input text, hashes and provenance. Strict version/nested-shape checks reject unknown fields and invalid effects. Existing captured `/1` restart/restore paths pass. |
| D05 | A1 → B2 → A3 has matching A content hashes and distinct occurrence identities, emits A3 after B2 and preserves ordered fork updates. Frozen independent digests verify the identity calculation; immutable conflicts and unknown ancestry keep their existing failure handling. |

The source introduces no new cross-module implementation dependency or exposure.
Production task and operation writers still use `/1`; live occurrence creation
still awaits iteration 1. Historical evidence and retained input bytes were not
rewritten.

## Checks

Commands ran from `ramify-agent/` unless identified as root commands. All ordinary
tests use the configured guard; no native exemption was added.

| Command / selection | Outcome and retained output |
| --- | --- |
| `npm run test:quick -- subs/harness/src/tests/plan25-blocks.test.ts subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/plan23-observation-integration.test.ts subs/harness/src/tests/review-diff-delivery.test.ts` | Passed: 4 files, 121 tests; `iteration00-focused-tests.log`. |
| `npm run test:quick -- subs/harness/src/tests/plan23-session-store.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts subs/harness/src/tests/plan23-fork-workflows.test.ts` | Passed: 3 files, 53 tests; `iteration00-session-regressions.log`. |
| `npm run test:quick -- subs/harness/src/tests/plan25-blocks.test.ts` after final independent fixture assertions | Passed: 1 file, 17 tests; `iteration00-block-fixtures-final.log`. |
| `npm run type-check` | Passed across project, web, scripts and browser-acceptance compiler scopes; `iteration00-typecheck.log`, with the committed source rechecked in `iteration00-typecheck-source-commit.log`. |
| `npm run check:self` | Passed: 12 owners, 694 source files, 50 resources, 13,516 accesses; 0 errors/warnings, 328 nonblocking analysis limits; `iteration00-check-self.log`. |
| Root `git diff --check` and source diff review | Passed; changes remain within the iteration foundation and the two inherited verification corrections. |

All listed logs are under `/home/app/ramify-plan25-evidence/`. The configured
process guard retained nine per-file executions for these focused runs, with zero
allowed launches and zero refused attempts; the exact cwd/file/time receipts are
copied to `iteration00-process-guard.json`. Tests did not execute Git, candidate
producers, Ramify, audit or external processes. The configured baseline audit is
separate native audit evidence.

## Successor interfaces and limits

- `prompts/blocks.ts`: `renderBlockSet` and `renderBlockRemoval` define invariant
  LF framing with no extra terminator. `effectiveBlocks` replays the actual
  ordered history; `resolveBlockAdditions` compares latest exact rendered bytes
  and requires explicit `withdraw` keys. It does not infer withdrawals from
  omitted desired inputs. Pinned role/tool physical framing remains with their
  existing task construction rules.
- `prompts/delivered-manifest.ts`: `DeliveredInput.block` and manifest entry
  metadata carry logical `{ key, effect }`. `buildDeliveredManifest` accepts an
  explicit `schema: 'ramify-agent.delivered-inputs/2'`; its default remains `/1`
  and rejects annotated inputs under that legacy schema. Both forms hash the
  actual ordered physical entries and actual current message.
- `prompts/briefings.ts`: `BriefingRevision.revision` denotes occurrence identity;
  optional `contentHash` retains structured section content identity.
  `createBriefingOccurrence({ previous, operationId, sections })` derives identity
  from predecessor, durable operation identity and canonical section bodies;
  equal selected-point content reuses the previous occurrence. Capture the
  returned occurrence in the immutable intent and reuse it on retry.
  `buildBriefingDelivery` remains the sole ordered update selector.
- `run/session-operations.ts`: `readHarnessOperationIntent` validates retained
  `/1` and `/2` shapes without altering originals. Packet lookup and operation
  restart use it. Iteration 1 must adopt the new writer and wire task/append
  occurrence creation; it must not regenerate legacy retries.
- `interfaces/protocol/runs.ts`: `deliveredManifestViewSchema` is the strict
  discriminated reader used by invocation efficiency and metrics projection.
  No separate web manifest parser was found; web receives this protocol.

No integrated runtime deduplication, discovery transport or NFR comparison is
claimed here. The source checks establish this foundation and compatibility;
the final full nested audit and combined workflow remain later plan gates.
