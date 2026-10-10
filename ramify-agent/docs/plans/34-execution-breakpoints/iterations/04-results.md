# Iteration 4 results: qualification and retained real failure

[Iteration](04-qualification.md) · [Acceptance](../acceptance.md) ·
[Real-work assessment](../../../analysis/2026-10-10-execution-breakpoints-real-work.md)

The controls are implemented and the ordinary/native qualification witnesses
pass. **B18 remains incomplete: the bounded authenticated real exercise failed
readiness before its first engineer pause and delivered no useful target change.**
This handoff does not claim complete acceptance of Plan 34. Coordinator review
is pending; final configured audit is pending as described below.

Work used branch `feat/plan34-breakpoints-implementation` in
`/home/app/ramify-plan34-breakpoints-implementation`, following accepted iteration 3
receipt `5261c98b21427cf0988028ab36b95d4aa4a8e271`. Continuation workers restored
logical iteration 4 after foreground/chat handoffs; they did not start another
implementation iteration. The dirty main checkout and unrelated worktrees,
processes and experiments were preserved. Nothing was merged or pushed.

## Delivered qualification and corrections

Source `71bb1ff265be71d4433c17ffcc67ef419398bce6` adds the combined workflow,
two registered native witnesses, README/specification and dogfooding guidance.
The combined ordinary workflow performs two explanatory returns, explicit
resume, a failed ordinary gate, a new repair occurrence, accepted gates,
reviewers and architect completion. No ordinary process guard is bypassed.

The native host/client witness runs the actual hosting implementation in a
separate kernel process and actual root CLI clients over HTTP. It verifies
client termination after admission, identical retry without another effect,
finite timeout, stop, the host remaining alive, explicit resume from another
actual CLI client, a killed actual host after that release and interruption on
restart without redispatch. The resumed engineer is deliberately admitted and
blocked before the crash; this path claims release/lifetime, not a successful
ordinary submission. Git/audit/provider replies are
transparent scripted boundaries. It does not prove remote provider behavior.

The installed Pi witness uses the actual adapter, serializer and session engine
with scripted provider responses and no remote spend. A new adapter restores
the latest retained logical point, continuing two explanatory turns into an
ordinary submission. It asserts native history, exact caller bytes, shared
logical identity, a normal out-of-scope write refusal, and actual rejected then
accepted judge verdicts. It is a Pi port witness; ordinary harness tests prove
full packet composition separately. It does not itself deliver useful work.
Both exact files and reasons are registered in `src/tests/test-boundaries.json`.

The authenticated run exposed a durable accepted-entry schema omission.
Correction `811c2e6a` reuses the scenarios owner's optional
`nonBehavioralAcceptance` schema for durable entry assignments; the nearest
catalog extraction regression failed before the fix and passed afterward,
including preservation of legacy absence. No validation authority was weakened.

Existing complete union inventories were corrected in `e8f97ea1` to include
new debugger events/values. Qualification review then corrected held-terminal
resume in `07b787363c424416c6b136e4393b45139a1505e8`: an already held terminal
failure can be consumed once even when tools are unconfirmed, while the writer
barrier still prohibits another exchange, successor writer or gate. Its B08
regression checks exact resume retry, one engineer invocation, terminal failure
and zero successor gates. `674f12f51c81acc847a834a86edb77bc8d485f1a` leaves
`settlementConfirmed` absent when unknown rather than claiming true from an
undefined preflight/legacy value; explicit true/false remain actual evidence.

The configured source 674 audit exposed one further stale exact command-union
witness: six old command names omitted approved `debug-message` and
`debug-resume`. A focused reproduction failed with precisely that difference.
Commit `092b456335d01e018777844d5b37c07eb44c65ff` updates the explicit
inventory to eight commands and retains every negative parse assertion; it
changes no runtime authority, command schema, test selection or check policy.

## Verification and audit provenance

The original clean baseline full audit is in [iteration 1's receipt](01-results.md):
source `f60a12de799b146228ed7b5f31184109fafb8102`, complete 328/328 coverage,
all six checks pass, 2956 tests pass, one existing skipped file and two existing
skipped tests. It is prerequisite evidence, not qualification of final source.

Focused ordinary qualification and native witness commands were run from
`ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/execution-breakpoints-workflow.test.ts subs/harness/src/tests/execution-breakpoints-conversation.test.ts src/tests/debug-client.test.ts
npm run test:boundaries -- subs/harness/src/tests/execution-breakpoints-process.boundary.test.ts subs/harness/subs/agent/subs/pi/src/tests/execution-breakpoints-native.boundary.test.ts
npm run type-check
npm run check:self
```

All passed: ordinary 3 files and 24 tests; native 2 files and 2 tests; the four declared
TypeScript configurations. Module checking completed 13 owners, 759 source files
and 65 resources with zero errors/warnings, **partial coverage and 352 analysis
limits**. Retained outputs use the owned prefix
`/tmp/plan34-breakpoints-implementation-04-`, including `focused.txt`,
`native-final.txt`, `types.txt` and `check-self.txt`. Final resumed focused
conversation/workflow/client 3 files and 24 tests and the unchanged type/module checks
also passed under source 674, with `/tmp/plan34-04-resumed-*` receipts.

The installed full nested audit of exact source 674 failed, with complete
configured coverage 336/336, discovery complete, no missing/unavailable/skipped
projects, 3000 passed tests, two failed tests and two existing skipped tests.
The complete failure ledger contains the stale command-union witness and the
web live-timeline test below. Other configured checks passed. Retain
`/tmp/plan34-04-final-audit.json`, report
`a5d2450b93e20bff4a8f72b1b025ce7e414aa3dd`, run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T20-08-50Z-674f12f51`.
The interrupted earlier empty audit and superseded source 07 audit are retained
separately; neither is final qualification.

After the narrow command witness correction, the affected ordinary group passed
**5 files and 45 tests**, no failures/skips:

```sh
npm run test:quick -- subs/harness/src/tests/run-commands.test.ts subs/harness/src/tests/execution-breakpoints-conversation.test.ts subs/harness/src/tests/execution-breakpoints-workflow.test.ts src/tests/debug-client.test.ts subs/web/src/tests/session-timeline.test.tsx
```

Its exact receipt is `/tmp/plan34-04-final-focused.log`. The explicit native CLI resume addition also passed its exact focused file,
1 file and 1 test, at 21:06:15 UTC, in `/tmp/plan34-04-native-resume.log`:

```sh
npm run test:boundaries -- subs/harness/src/tests/execution-breakpoints-process.boundary.test.ts
```

No additional direct whole suite was run. A now-superseded installed audit request against clean committed
candidate 092b4563 is retained at `/tmp/plan34-04-qualified-audit.json`, with
`/tmp/plan34-04-qualified-audit-process.json` and `.stderr`, using:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The configured Cucumber profile's zero selected scenarios is profile health,
not behavioral acceptance. Existing skips remain skips. Static partial coverage,
configured execution, native claims and semantic useful-work assessment remain
separate.

## Known flaky test

- `subs/web/src/tests/session-timeline.test.tsx`, “a live session's timeline
  grows as the run's version moves”, 2026-10-10, source 674 `agent-tests` full
  configured gate. Preserve the failed output in report a5d2450b
  `reports/audit/agent-tests.txt` and `/tmp/plan34-04-final-audit.json`.
  It passed alone three successive times with
  `npm run test:quick -- subs/web/src/tests/session-timeline.test.tsx -t 'a live session'`.
  Receipts: `/tmp/plan34-04-session-timeline-alone-1.log`, `-2.log`, `-3.log`.
  Under the local testing guide this occurrence counts as passed after the
  isolated checks; the original configured audit remains recorded failed.
  No web implementation, timeout, retry, skip or quarantine was changed.

## Acceptance review

| Cases | Final evidence and boundary | Assessment |
| --- | --- | --- |
| B01 | Prepared normal/contract/NFR shared runner; repair/capability occurrence and no repeated internal fallback: `execution-breakpoints.test.ts`, `execution-breakpoints-capability.test.ts`, `nonfunctional-repair.test.ts` | Ordinary witnesses pass |
| B02 | Active reader/review/gate settlement; no new admission, writer or lock while parked: lifecycle/conversation, review scheduling and queue tests | Ordinary witnesses pass |
| B03 | Controlled caller-pause union, suspended review expiry/overflow and exchange/run bounds: lifecycle/conversation, review queue, run bounds | Ordinary witnesses pass |
| B04 | Stop during pausing, parked or exchanging; confirmed resource settlement and no held release: lifecycle/conversation | Ordinary witnesses pass; native stop complements |
| B05 | Effective fresh/continued preview, full inherited blocks/tools/scope/source and no invocation allocation: conversation and HTTP | Ordinary witnesses pass |
| B06 | Ordinary task then exact caller bytes before immutable admission; ordinary authority retained: conversation/session-operation packet assertions | Ordinary witnesses pass; Pi serializer complements |
| B07 | Two pending replies, latest point and both briefing/provider ancestry, resumed ordinary handling: conversation/workflow | Ordinary witnesses pass; installed Pi history complements |
| B08 | Normal scope refusal, truthful terminal/unconfirmed receipt, held failure resume once without another model/writer/gate: conversation | Ordinary witnesses pass; installed Pi guard complements |
| B09 | Held accepted completion/partial/capability and single consumption: conversation/capability | Ordinary witnesses pass |
| B10 | Actual final rejection, explicit continuity loss/fresh fallback with current text; unchanged ordinary fallback: conversation and ordinary session regressions | Ordinary witnesses pass; installed Pi judge complements |
| B11 | Durable reservation, identical retries before new revision checks, changed payload/stale/concurrent/double resume refusal: conversation/HTTP/client | Ordinary witnesses pass; native retry complements |
| B12 | Canonical attached project/plan, serve-owned model, no fixture/server ownership, refusal and legacy path: client/CLI | Ordinary witnesses pass; actual separate clients complement |
| B13 | Historical reached state versus current, paginated cursor drain, finite waits, actual verdict and stdout/stderr/exit semantics: client/HTTP | Ordinary witnesses pass; native timeout complements |
| B14 | Before-pause, paused, exchanging and after-release startup interruption before replay/reconciliation/restore; ordinary recovery intact: lifecycle/capability/conversation/run-recovery | Ordinary witnesses pass; kernel crash/restart complements |
| B15 | No selector, old records and projections, closed ordinary outcomes and recovery: legacy schema/union/session/recovery tests and configured suite | Ordinary witnesses pass; configured audit result reported separately |
| B16 | Explanatory chat, explicit resume, failed gate, distinct repair pause, reviews and architect completion: combined workflow | Guarded combined witness passes |
| B17 | Two exact registered native files described above | Native process and installed-Pi witnesses pass with scripted external answers |
| B18 | Authenticated bounded useful parser plan: dated note and target run/readiness audit | Incomplete; no engineer pause or useful candidate |

## Real work and outstanding requirement

The real target is `/home/app/ramify-plan34-real-project-option/ramify-agent`,
plan `serve-project-option`, prepared baseline
`065bd824d7327126cb22a5bfe451583457a4afd9`, explicit model
`openai-codex/gpt-5.6-sol`. Final detached run
`20261010T194909Z-7bc6cb` performed 7 invocations and failed readiness at
20:20:12 UTC. Its target audit report 002f5cb8 contains exactly the same stale
command inventory failure; readiness correctly refused the red check before
engineer dispatch. No explanatory interventions, resumed implementation,
useful candidate or project verification of the requested change exists.

Aggregate supported attempts consumed 29 of 48 harness invocations. The original
60-minute deadline 20:22:26 UTC / 22:22:26 Europe/Rome expired; no new model calls,
renewed bounds, target edits or weakened checks followed. Coordinator verified
owned host PID1964655's exact argv/cwd, gracefully closed it and confirmed exit
in `/tmp/plan34-04-host-cleanup.json`. All actual target/session/native usage
and unsuccessful audit evidence remains retained; monetary cost is unavailable.
The [dated assessment](../../../analysis/2026-10-10-execution-breakpoints-real-work.md)
records failures, corrective harness work, provenance and semantic outcome.

Completing B18 requires a separately authorized bounded real exercise after
qualifying its baseline. Scripted successes, final harness audit health and a
responsible assessment that no work was delivered cannot satisfy its
useful-work objective. Plan 34 must remain partially accepted until that evidence
exists. Plan 31/model/principles were not changed. No merge or push was performed.
