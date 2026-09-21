# Iteration 11 results: protocol, web MVP and KPI projections

**Date:** 2026-09-21. **Status:** complete. The [brief](iteration11.md) is
satisfied: the harness exposes the run through `interfaces/protocol/runs.ts`,
serves the run commands and every query of the
[main plan's protocol](../main-plan.md#protocol) as projections that never
write, and the web client has a Run page where a person starts, stops and
reviews a run. The KPIs are computed as `Metric[]` under `kpi/1`, from what
the earlier iterations captured, and nothing unavailable reads as zero.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four passed and
matched [iteration 10's](iteration10-results.md) exit.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  76 passed (76)
                                  Tests  568 passed (568)
=== npm run build:web ===    ✓ 280 modules transformed.   ✓ built in 185ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 191 source files, 13 resources, 2808 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 1957 allowed, 0 denied, 851 external
```

## 2. The architect view

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:a74e1b79-45f8-4f33-975b-d41fb93c4859:1` | `rev/1:a351a699-8f65-4588-b413-14182c0fc9a0:1` |
| Input identity | `input/1:2f2b0fc395edbe8c25a4a2d1748376a1e4c7e8d0d457f5e5dd70554eefb1d66d` | `input/1:0a0d3510ef11eaf28f2d512183bff651b1d020255c9b70a47dd79fc4795e87b4` |
| Modules | 7 | 7 |
| Dependencies | measured | measured |

The after view was materialized with `ramify materialize --view architect
--view api --from subs/web --root .` after every change and after the exit
gate; `_meta.json` reports `dependencies`, `testReferences` and `metrics` all
`measured`, detail cut 307. No module was declared or removed. The harness's
`module.ramify` gains its one planned statement, and the root re-exposes the
names of `runs.ts` to its descendants by explicit named selection.

## 3. What was delivered

### The protocol, `interfaces/protocol/runs.ts`

Exposed to the parent with the `browser` tag
(`expose-src * from "interfaces/protocol/runs.ts" tagged [browser] to parent`)
and re-exposed by the root, name by name. Beside what iteration 4 put there,
it holds `RunSnapshot` with its notices, the run list, `RunEventPage` and the
projected event, the analysis, decision, work-item, gate and metric
responses, `CapabilityProgress`, `Metric`, the evaluation evidence and the
limits of each list. `errors.ts` gains `unsupported-version` (HTTP 422) and
an optional `evidence` list on every error; `paths.ts` gains the command
endpoint and the run paths.

| Route | Answer | Limit |
| --- | --- | --- |
| `POST /api/v1/commands` | `202 { receipt }` for `start-run` and `stop-job` | body 64 KiB |
| `GET /plans/:id/runs` | runs newest first, the agent runs start with, and run directories not served with why | 200 |
| `GET /plans/:id/runs/:run` | `RunSnapshot` | — |
| `GET /plans/:id/runs/:run/events?after=n` | the snapshot, projected events, `cursor`, `more` | 500 |
| `GET /plans/:id/runs/:run/analysis` | the captured plan, entries with owners, hypotheses with standing, revision and first forecast | 500 each |
| `GET /plans/:id/runs/:run/decisions` | the decision list | 500 |
| `GET /plans/:id/runs/:run/work-items` and `/:wi` | summaries; outlines, iterations, gates, requirements, placement requests | 200 |
| `GET /plans/:id/runs/:run/capabilities` | `CapabilityProgress[]` | 500 |
| `GET /plans/:id/runs/:run/gates/:ga` | one attempt, tails bounded at 8 KiB, no command environment | tail 8 KiB |
| `GET /plans/:id/runs/:run/metrics` | `Metric[]`, `kpi/1`, `scope-size/1`, the baseline and the evaluation evidence | — |

Plan 1's retry, cursor and reconnect behavior is kept: an identical retry
returns the original receipt, a reused ID with other content is `conflict`,
a stale expected version is `stale-version` with the current version, the
event page is read after a cursor and a client that reconnects asks again
from its cursor. Every response is validated against its schema by the
server before it is sent and by the client when it arrives. The web client
sends a command again with the same ID when the harness does not answer.

### Projections, `src/projections/`

Every query reads what `RunService.committed` hands out (the run's record,
its directory and the complete lines of its log with the record bodies) and
the run's own files, read and never written. The event page projects each
event to its transition name, a sentence, its references and its time; it
is not the internal event union and carries no record body. A record the
log committed at a version this harness does not read, and a run directory
whose `job.json` declares one, is `unsupported-version` with the path and the
declared schema as evidence, never `not-found` and never an absent record.

- **Notices.** Module notices first, each saying which placement decision
  proposed the module or that none did; then every dependency cycle, with
  its members, the work item that closed it and whether the re-plan resolved
  it. They stay after the run ends.
- **The decision list** is read from the records that hold each choice:
  `PlacementDecision`, each `IterationAssignment`'s scope, rationale and
  authorizations, each `WorkItemOutline` revision and its breaking changes,
  and each `ContractRecord` revision. There is no second copy of a choice.
  Hypotheses are shown at their current revision and standing beside their
  revision-1 forecast, and each links to the decisions that revised it.
- **Progress** replaces iteration 5's internal `progress/capabilities.ts`
  with the public shape. `completed` needs current verification evidence; a
  provider wait stays `working` with its reason; a fake-backed pass is
  `working`; verified reuse is `completed` when a consumer that uses it has
  passed its gate; `evidence-reopened` returns a completed capability to
  `working`; a superseded hypothesis leaves the list.
- **Evaluation evidence**, deferred to this iteration by iterations 7 and 8,
  is in the metrics answer: iteration 7's `guardingReport` per invocation and
  over the whole run with its sentence unchanged, every path outside a write
  scope (`outsideScope`), hook checks, reads outside the scope, coverage gaps,
  line events and tokens by category. Placement requests are in the
  work-item detail, each with the decision that answered it.

### KPI projections, `src/kpi/metrics.ts`

The plan's list, each with unit, state, value, numerator, denominator, known
subtotal, coverage, evidence and a note: `scope-bytes-per-changed-line`,
`scope-size-ratio`, `reduction-factor`, `session-count`,
`session-weighted-total`, `adaptation-session-share`,
`adaptation-usage-share.<category>`, `compactions.<role>`,
`budget-return-rate.<role>`, `repeated-budget-returns`,
`gate-attempts-per-accepted-iteration`, `blocked-write-attempts`,
`observation-coverage` with one metric per gap kind, and
`usage-tokens.<category>`. The rules:

- only a `measured` metric has a value; the schema refuses any other;
- a missing observation is `unavailable` with its known subtotal and
  coverage, and a subtotal is `null`, not zero, when nothing was known;
- a zero denominator is `not-applicable`;
- a whole-run ratio over partial line counts, as after the unguarded shell,
  is `partial`: the covered numerator, denominator and sessions are shown;
- `blocked-write-attempts` is `partial` while an unguarded tool mutated, with
  the guarding sentence as its note;
- input, cache-read, cache-write and output tokens stay separate, and no
  usage is converted to a price;
- `Settlement.groupsKilled` is not a metric: it is zero by construction, so
  presenting it would claim a measurement that was not made.

`B` is recomputed from the frozen baseline's measurement snapshot with the
same recipe the run used; in the run tests it is `unavailable`, with the stub
`ramify`'s reason.

### The web Run page

`#/plans/<id>/runs/<run>`, beside the Plans and Plan pages. The Plan page
lists the plan's runs and has Start, which sends `start-run` with the agent
the harness reports and opens the Run page. The Run page has seven areas,
list and detail only: overview (notices first, then state, phase, current
work, waits, counts, failure with evidence and the event feed, and Stop),
plan and entries, hypotheses and decisions side by side, work items, checks
(gate attempts from the event feed, each with commands, selections and its
bounded tail), progress (todo, working on, completed, forecasts marked) and
measurements (the guarding sentence, the paths outside a write scope, the
metrics and a table of sessions). A connection line, apart from the run's
state, says what version was last read and that closing the page does not
affect the run. Nothing is editable.

### Serving a run

`startServer` now opens the run service (which recovers runs a previous
harness left), serves the queries and the command endpoint, and takes an
agent: `pi`, `fake` (the scripted fake with an analysis that assigns no entry
capability, so a run exercises the lifecycle, readiness and the final gate)
or an implementation a test supplies. `src/main.ts` passes `--agent` and
`--model` through, so `npm run serve -- --project <root> --agent pi` can start
a run from the browser.

## 4. Exit evidence

All four run from `ramify-agent/` after every change.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

 Test Files  81 passed (81)
      Tests  614 passed (614)
   Duration  184.50s (transform 10.58s, setup 0ms, import 39.32s, tests 1675.61s, environment 5.31s)
EXIT: 0

=== npm run build:web ===

dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-DRK0AxDk.css    9.37 kB │ gzip:   2.41 kB
dist/web/assets/index-Caq_oq_X.js   445.65 kB │ gzip: 132.81 kB
✓ built in 365ms
EXIT: 0

=== npm run check:self ===

Execution: completed; check: passed; coverage: complete
Completed scope: 7 owners, 209 source files, 13 resources, 3209 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 2307 allowed, 0 denied, 902 external
EXIT: 0
```

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| Every query answered from a Node client with the web assets absent | `run-protocol.test.ts`: every query over `fetch` and the protocol schemas, `assetsDirectory` pointing at nothing |
| The same answers rendered in a browser | Section 5 |
| An event page at the 500-item limit with `cursor` and `more` | `run-projections.test.ts`, "at most 500 events a page…" (1200 events: 500, 500, 200, and the cursor past the end) |
| A gate detail whose output tail is bounded at 8 KiB | `run-protocol.test.ts`: the final gate's tests print 20 000 bytes, the client receives exactly 8192 ending in the last line, and no environment; `run-projections.test.ts` bounds a longer, multi-byte tail at a character boundary |
| An identical retried `start-run` returning its original receipt through HTTP, a conflicting reuse and a stale expected version | `run-protocol.test.ts`, "an identical retry returns its receipt; a conflicting reuse and a stale version are refused" |
| Every query against a completed run leaves the run log's last sequence unchanged | `projections-pure.test.ts` |
| The web requester API view shows `web` imports only the harness's exposed `src/interfaces/` files; 0 denied accesses | `subs/web/src/.ramify/` (revision `rev/1:a351a699-…:1`) lists exactly seven external files, all `subs/harness/src/interfaces/protocol/*.ts`; its `_meta.json` reports `coverage: 12, truncated: 1`, so the listing is the view's, not a claim beyond it. Every web import from the harness is one of those seven files. `check:self`: 0 denied |
| The four commands | Above |

## 5. The Run page in a real browser

Done, with Playwright's Chromium against the built client, served by
`startServer` on a disposable fixture copy with the scripted fake paced at
five seconds a turn, `treeInputs`, the protocol test's policy and the stub
`ramify`. What was seen:

1. The Plan page listed no run and "Runs start on the scripted agent".
   Start opened `#/plans/review-notes/runs/20260921T062317Z-d353f3`, which
   showed `running`, phase `analysis`, the initial architect's session, the
   first two events and "None so far" under Notices.
2. The page was closed (navigated to `about:blank`) while the run was in its
   analysis. The run went on and ended `job-completed` at sequence 46 with no
   page open. The run directory's files were hashed:
   `e90c0c11…b9f`.
3. The page was opened again. It showed `completed`, version 46, and under
   Notices first "Module created:
   collection-review/workspace/reviews/notes/drafts … No placement decision
   proposed it.", then the state (2 of 2 work items, 7 invocations, 6 gate
   attempts) and all 46 events in order.
4. Measurements showed the guarding sentence ("Guarded: edit, write. Not
   guarded: shell. A count of blocked calls is not evidence …"), the path the
   shell wrote outside the scope, `blocked-write-attempts` `partial`, every
   size ratio `unavailable` (the stub's baseline reason), token usage
   `unavailable` (the fake reports none), and the sessions table. Checks
   showed `ga-0006` with its 20 000-byte output file and the last 8 KiB,
   ending "all passed". Hypotheses and decisions showed the tentative
   hypothesis beside the scope and plan decisions.
5. After all that browsing the run directory hashed to the same
   `e90c0c11…b9f`, and the log still ended at sequence 46: closing and
   reopening the page changed no event and no state.

Two things the browser showed were corrected before the exit gate: an
unavailable metric displayed "known subtotal 0" where nothing was known (the
subtotal is now `null` then), and "1 hypotheses" in an event sentence.

## 6. Acceptance cases owned

| # | Case | The tests that prove it |
| --- | --- | --- |
| C1 | A run completes with no web client; a reconnecting client reads the same state and events | `run-protocol.test.ts`, C1: the run is driven by the service with no server, the test watches `events.jsonl` for the terminal event and nothing else; a client attached afterwards reads the snapshot and every event page, which match the log line for line, resumes from a mid-run cursor without a gap, and after two restarts of the harness every answer of every query is the same byte for byte |
| M2 | Todo, working on and completed handle provider waits, verified reuse, reopened evidence and superseded hypotheses | `progress.test.ts`, "M2": a provider wait stays `working` with "Waiting for provider ob-ct-001 (rq-001)", a fake-backed pass stays `working`, verification completes it; verified reuse is `completed` with the consumer's gate; `evidence-reopened` returns the completed provider capability to `working` with its follow-up; a superseded hypothesis leaves the list without becoming `completed` |
| M3 | The UI can disconnect and reconnect without affecting the run | Section 5, in a real browser against a scripted-fake run; `run-page.test.tsx`, "a lost connection is shown apart from the run's state"; C1 above for the protocol side |
| M4 | KPI projections retain their numerators, denominators, revision and coverage; unavailable data is not reported as zero | `kpi-metrics.test.ts`: a missing size component reports `unavailable` with its known subtotal (10 000) and coverage (1 of 2); `sum(w_e) = 0` reports `not-applicable`; plus partial line counts, an unavailable baseline, unreported usage and an unreadable observation log. Over a real run, `run-protocol.test.ts` asserts no size metric is measured or zero |

## 7. Guards owned

| Guard | Test |
| --- | --- |
| A projection never writes, and no query appends an event | `projections-pure.test.ts`: every query in-process and over HTTP, twice, with every cursor and with unknown IDs, against a completed run; afterwards the log's last sequence, every byte of every file beneath the run and `git status` of the project are unchanged. A second test is a tripwire over the projection source for any writing primitive |
| The JSON rule for the `start-run` payload | `run-protocol.test.ts`: a payload with an unknown agent and an extra field is refused `invalid-request` with every error and its path, nothing is created, and the corrected command with the same ID is accepted. A client command is not an agent communication, so the rule's rejection observation and bound do not apply to it |
| An unsupported record version surfaces as `unsupported-version` with evidence | `run-protocol.test.ts` (a `job.json` declaring `ramify-agent.job/3`: 422 with the path and the declared schema on every query of the run, and listed under `unserved`; a run that does not exist is `not-found`) and `run-projections.test.ts` (a work-item body declaring `/2` inside the log) |

## 8. Every union value has a producer and a test

`union-values.test.ts` gains "the run protocol a client reads" (7 tests):
every error code with its status; every notice kind; every metric state, with
the refusal of a value on anything but `measured`; the work-item, capability
and standing states; every event reference kind produced by the projection
of real event data; every run-log event type projected; and every decision
kind produced from a record that holds it.

| Union | Producer in a run | Without one |
| --- | --- | --- |
| `RunNotice.kind` | `module-created` (C1), `dependency-cycle` (iteration 9's runs) | `module-removed`: nothing a run assigns deletes a declaration yet, as iteration 6 recorded |
| `DecisionView.kind` | `scope`, `plan-revision` (C1); `placement`, `contract`, `breaking` (iterations 8 to 10's runs, read by this projection) | — |
| `MetricState` | all four over the protocol run and the constructed inputs | — |
| `ErrorCode` | `unsupported-version` gains its producer here | — |

## 9. The tests this iteration added

81 files, 614 tests, up from 76 and 568.

| File | Tests | What it covers |
| --- | ---: | --- |
| `run-protocol.test.ts` (new) | 5 | C1, every query over HTTP, the command rules, the payload rule, `unsupported-version` |
| `projections-pure.test.ts` (new) | 2 | The guard |
| `run-projections.test.ts` (new) | 6 | Event page limit and cursor, the gate tail, notices order and resolution, waits, an unsupported record in the log |
| `kpi-metrics.test.ts` (new) | 10 | M4 and the metric rules |
| `progress.test.ts` | 8 (rewritten) | M2, and M1 over a real run through the new projection |
| `union-values.test.ts` | +7 | Section 8 |
| `protocol-contract.test.ts` | changed | The run paths |
| `subs/web/src/tests/run-page.test.tsx` (new) | 8 | Notices first, notices after the end, Stop, the connection line, hypotheses beside decisions, progress, a gate tail, an unavailable metric |
| `plan-page.test.tsx`, `client.test.ts` | +2, +3 | Start, no agent and an unserved run; command retry, error evidence, the event path |

## 10. Deviations from the brief, with reasons

1. **Scope.** Beyond the brief's files, this iteration also changed:
   `interfaces/protocol/errors.ts` and `paths.ts` (the error code and the
   routes live there); `run/service.ts`, three read-only accessors
   (`committed`, `committedRuns`, `agentName`) and nothing that writes; the
   removal of `progress/capabilities.ts`, whose internal shape the public
   `CapabilityProgress` replaces, so there is one progress model; `src/main.ts`,
   which now passes `--agent` and `--model` to `startServer`; the harness and
   web READMEs; and the tests in section 9.
2. **`Metric` has three fields the proposal does not name**: `measurementPolicy`
   (the brief's "travels with the metric"), `subtotal` (M4's "known
   subtotal") and `note`, which carries the guarding sentence and why a
   metric is not measured.
3. **`RunSnapshot` carries more than the proposal's five fields**: version,
   stop requested, times, waits, the six counts, the writer and, in
   `current`, the invocation and request. They are all projections of the log.
4. **The event page carries the snapshot**, as Plan 1's did, so a polling
   client reads state and events in one answer.
5. **There is no separate evaluation query.** The evaluation evidence the
   completion gate names (`outsideScope`, what was guarded) is in the
   metrics answer beside the metrics it qualifies; placement requests are in
   the work-item detail. The plan's query table is kept as it is.
6. **The Checks area lists gate attempts from the event feed** (the
   `gate-attempted` and `readiness-passed` events and their gate references)
   and reads each attempt through the gate query; there is no gate list query.
7. **The run list names run directories the harness does not serve**, with
   `unsupported-version` or `unreadable`, so a run whose record this harness
   cannot read is never absent from the list.
8. **The module tree component is not drawn on the Run page.** List and
   detail was the brief's presentation; `module-tree.tsx` stays as iteration
   5 left it.

## 11. The resume question

Considered and kept out. The brief does not direct a resume command. A run
without a terminal event is `interrupted` on load, `job-interrupted` is
terminal, and SM10 gives recovery no duty to resume. A resume would need a
new event, a new protocol command and a rule for the invocations the
interruption closed, none of which the plan has; the protocol offers
`start-run` and `stop-job` and nothing else, and a new run of the same plan
starts from the dirty tree an interrupted engineer left.

## 12. What iteration 12 must know

- **The run command path is back.** `POST /api/v1/commands` takes
  `{ commandId, expectedVersion: 0, type: 'start-run', payload: { planId,
  agent: 'pi' } }` and answers `202 { receipt }`; the run's ID is
  `receipt.jobId`. Progress is `GET /api/v1/plans/:id/runs/:run/events?after=n`,
  whose page is `{ run, events, cursor, more }`; read again from `cursor`
  until `run.state` is not `running` and `more` is false.
- **`scripts/real-session.ts` still posts `start-mapping`.** The endpoint now
  refuses it with `invalid-request`. It is outside this brief's scope and was
  left as it is; repointing it means the command above, the new event page
  and a new success criterion (the run `completed`, not a map saved). Its
  startup detection ("pi runs …" / "pi cannot …") still matches
  `src/main.ts`'s output.
- **`serve --agent pi [--model <provider/model>]` now starts runs.** The
  server opens the run service with `architectRunInputs` and a private
  Ramify daemon of its own, which `close` stops. Its policy is the hardcoded
  default: the target project's own `npm test`, `npm run type-check` and a
  complete `ramify check`. A bare fixture copy has no `node_modules`, and
  iteration 10 found `@modelcontextprotocol/sdk` installed nowhere in this
  checkout, so readiness on a disposable copy needs the fixture's
  dependencies installed first.
- **Close the server before removing a disposable copy**, so its daemon
  stops before the project it analysed is gone (the `getwd` hazard).
- **The metrics read what the run captured.** With pi, usage and context
  observations exist, so token metrics can be `measured`; with a real
  `ramify measure`, `B` and the size ratios can be. Any shell use makes the
  per-line ratio `partial`, by design.
- **`src/cli.ts` needs no change**: its `--agent` and `--model` are now used.
- Unchanged: do not let a resident daemon analyse a temporary project;
  `ramify stop` is not a CLI command; nested-package discovery still walks to
  depth 5; `subs/harness/src/.ramify/` is still stale and unread by
  `check:self`.

## 13. Not done, with the reason

- **No pi session was run.** This iteration is not one of the three
  permitted to touch pi.
- **`scripts/real-session.ts` was not repointed.** Section 12.
- **`module-removed` has no producer in a run.** Section 8.
- **The fixture's own toolchain did not run**, as in iteration 10: the run
  tests' project commands are real spawned commands that stand in for it.
