# Iteration 8 results: global architect decisions

**Date:** 2026-09-21. **Status:** complete. The [brief](iteration8.md) is
satisfied: the run's initial analysis session is its long-lived architect
context, each placement request refreshes the architect view and forks that
context once, the fork decides, its decision commits with its registry and
hypothesis revisions in one transition, its brief is appended to the parent
without a model call, and every interruption of that chain recovers exactly
once.

Two sequential forks on the `revision-diff` fixture run with no comparison
baseline and no diff: the first creates a capability and confirms the
hypothesis that forecast it, the second inherits its brief and reuses the
registered entry rather than naming a second slug. Between the decision and
the append no session is started, and the brief reaches a model only when the
next fork inherits it.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches [iteration 7's](iteration7-results.md) exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  67 passed (67)
                                  Tests  484 passed (484)
=== npm run build:web ===    ✓ 280 modules transformed.   ✓ built in 242ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 166 source files, 8 resources, 2244 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 1448 allowed, 0 denied, 796 external
```

## 2. The architect view this iteration worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:6053072d-b9d6-42a5-a1cc-511af1d275ce:1` | `rev/1:57e2278e-a20d-4394-9a74-90998bd2a14c:1` |
| Input identity | `input/1:e5e47d2864b4a5723dc7662b9880d6d9fc8302e17753279e9ccc38362653dfd0` | `input/1:81914eb8f4239217fae1f3d49c388b1998f268c2d2dfcbef39227b95c1c26089` |
| Modules | 7 | 7 |
| Records | 836 | 904 |
| Dependencies | measured | measured |
| Cut | 195 | 221 |

The before column is the view that was on disk when this iteration started,
read from `.ramify-architect/_meta.json` before anything was changed. The
after view was materialized before any claim below about the module tree:
7 modules, 904 records, dependencies and metrics measured. `_meta.json`
records no coverage limits and no unknown shapes.

`ramify stop` is not a command of the installed CLI, so the daemon was not
stopped before the materialization, as iteration 7's note asks. What that
note guards against is a stalled daemon costing the view its dependency
facts; this view reports `dependencies: measured`, `testReferences: measured`
and `metrics: measured`, so nothing below rests on a view that lost them.

### The module tree is unchanged

Seven modules, as before; this iteration declares none and removes none, and
no `module.ramify` was changed. Nothing new crosses a boundary:
`src/architecture/` is the harness's own source, and the two children it
reads from — `evidence` for the view and the agent port for the fork — are
exposures that already existed.

## 3. What was delivered

### The long-lived parent

The initial analysis session becomes the run's architect context and is never
invoked for a decision. It is not a record: `architecture/context.ts`
projects its generation, the point its history has reached, the briefs it
holds and the decisions not appended yet, from the run log and the committed
invocation outcomes. A run just recovered and one that never crashed answer
the same thing.

The parent has no per-invocation context policy, which is this plan's
resolution of the proposal's `Record<Role, ...>` gap: `global-fork` has one,
and any reorientation happens under a fork and is recorded against it.

### One request at a time

`placement-requested` commits the `PlacementRequest`. The harness then
requires the writer settled — implementation writes are paused and the tools
of the last invocation have already settled — refreshes the architect view,
and records its revision and input identity with the request in
`view-refreshed`. That event licenses exactly one fork, started from the
parent's latest point.

The fork is given the request, the refreshed view's identity, the registry
and the decision log. It is not given the view's contents: it reads what it
needs itself, and the request explains intent and local discoveries rather
than reproducing the view. No comparison baseline is retained and no diff is
used, which is the plan's non-goal kept: each fork checks current facts and
states what it could not establish in `decision.evidence.gaps`.

### The decision

`ForkSubmission.decision` commits, in one `decision-accepted` event, the
`PlacementDecision`, the `RegistryEntry` revisions it creates and the
`Hypothesis` revisions it makes. `architecture/accept.ts` derives all of them
from the submission and the committed records, so a repeat after a crash
derives the same records with the same identifiers and the same hashes.

The rules beyond the schema are in `architecture/submission.ts` and are
shared by the fork and by a local architect that decides for itself:

| Rule | What it refuses |
| --- | --- |
| Owner in the view, or one a proposal creates | An owner the refreshed view does not have with no valid proposal behind it |
| `create` and `extract` propose; `reuse` and `extend` do not | A `reuse` that introduces an absent owner, and a `reuse` of one no accepted proposal created |
| A proposal's parent exists, its directory is a free direct child under that parent's `subs/` | A nonexistent parent, a directory another module or another proposal already has, a grandchild directory |
| The decision and its registry entry carry the same proposal | An authority to create that the record would not carry |
| `revises` wherever a registered capability is placed elsewhere | A silent contradiction |
| `external` owns nothing and registers nothing | An external capability with an owner module |
| Hypothesis revisions and consumer links name records this run committed | A revision of a forecast nothing made, a consumer of a work item nothing created |

`ForkSubmission.partial` records findings and gaps. It is never appended and
is never a decision: it consumes one retry of `forkRetriesPerRequest`, and
exhaustion returns an unresolved outcome to the local architect. The parent
is never invoked to supply the choice the fork could not make.

### The brief

The brief of an accepted decision is appended to the parent through the
ledger's external effect: the intent is `decision-accepted` with every record
it commits, the effect is `appendContext` keyed by the `DecisionId`, and the
completion is `brief-appended` with what the append did. Appending is
storage: no session is started for it, and the brief reaches a model when the
next fork inherits it.

A parent that can no longer be read answers `session-lost`; the completion is
then `global-context-rebuilt`, which raises the generation and clears what
was pending. The next fork is started fresh and oriented from the hypotheses,
the registry and the decisions, and becomes the context itself.

### Delivery

`decision-delivered` returns the accepted decision to the requesting local
architect before it plans anything further. A decision whose `revises` names
another work item reaches that work item too, with the consequence stated for
it. Hypothesis revisions reach every work item a hypothesis involves at that
item's next coordination point, through `hypotheses-delivered`, before its
next `iteration-assigned`. Nothing about delivery starts an invocation and
nothing rewrites an active assignment.

### Local authority

`LocalArchitectSubmission` gains `request-placement`, and `assign` gains
`localDecisions`. A choice that refines the architect's own subtree is
committed with the assignment, with `authority: 'local'` and `request: null`,
and is discoverable from the registry with `origin: 'local-decision'`.
Nothing is appended to the architect context for it, and a later fork finds
the capability in the registry it is given. A departure about shared
responsibility becomes a focused request with its counterevidence, which is
what the local architect's procedure now says in as many words.

## 4. Exit evidence

All four run from `ramify-agent/` after every change, with the architect view
already refreshed.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  70 passed (70)
      Tests  513 passed (513)
   Duration  139.80s (transform 4.25s, setup 0ms, import 19.29s, tests 928.62s, environment 3.14s)

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 280 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.27 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DIDBJLm_.js   402.20 kB │ gzip: 121.78 kB
✓ built in 226ms

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 175 source files, 10 resources, 2455 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 1643 allowed, 0 denied, 812 external
```

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| The crash table, after `placement-requested` | `run-recovery.test.ts`, "a crash after placement-requested leaves the request, and no fork and no decision" |
| …after `invocation-ended`, a fork interrupted mid-investigation | `run-recovery.test.ts`, "a fork interrupted mid-investigation leaves no decision, and its invocation is closed without an agent call": the fork's session is live when the harness stops, and recovery closes it `failed`/`session-lost` with no second fork |
| …after `decision-accepted` | `run-recovery.test.ts`, "a crash between an accepted decision and the parent append appends the brief once": the decision file is re-materialized, the effect is performed under the decision's identifier, one `brief-appended` with `outcome: 'appended'` |
| …after `brief-appended` | `run-recovery.test.ts`, "a crash after brief-appended delivers the decision once and starts nothing" |
| …after parent loss | `placement.test.ts`, "the generation rises, the pending brief is cleared, and the next fork is oriented from the records" |
| A decision whose `revises` names the affected work, whose consequences reach the relevant local architects | `placement.test.ts`, "it names what it affects, and the consequence reaches that work item before its own turn": `previousOwner` records where the capability was, and wi-002's own prompt carries the consequence and the decision it replaces |
| A fork interrupted mid-investigation produces one decision, not two | The `invocation-ended` row above, with the limitation in section 12: a run is not resumed in place, so the repeat is the next run's |
| A view identity that changes during an investigation | `placement.test.ts`, "the evidence is revalidated, the investigation repeats, and one decision is made, not two" |
| A global `create` decision proposing a new owner, then a passing bootstrap assignment | `module-creation.test.ts`, "a create decision and its registry proposal lead to a bootstrap assignment that passes its gate" |
| Absent parents, conflicting directories and absent owners without accepted proposals rejected | `fork-submission.test.ts`, three tests in "the rules the fork schema cannot hold" |
| `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self` | Above |

## 5. Acceptance cases owned

| # | Case | The tests that prove it |
| --- | --- | --- |
| G2 | Two sequential placement forks run without a diff baseline; the first revises a hypothesis and registers a capability, the second inherits its brief and reuses the entry | `placement.test.ts`, "the first creates a capability and revises its hypothesis; the second inherits its brief and reuses the entry". On the `revision-diff` fixture: the chain runs twice in order, `gd-002` has `outcome: 'reuse'` and names `field-diff@2` rather than a new slug, the hypothesis is at revision 2 with `confirmedBy: 'gd-001'` while revision 1 stands, and each decision's `evidence.view` is the identity its own `view-refreshed` recorded — nothing compares the two |
| G3 | Appending a parent brief causes zero model calls and reaches the next fork's input | The same test. The scripted agent's session count is captured at `decision-accepted` and at `brief-appended` and is equal at both, no `invocation-started` lies between the two events, the first fork's inherited context does not hold the brief and the second fork's does, with the decision's own references around the fork's text |
| G4 | A crash between an accepted decision and the parent append recovers exactly once | `run-recovery.test.ts`, "G4: a crash after the append and before its completion answers already-present, and one brief exists", beside the row that crashes before the append. The append is keyed by the `DecisionId`, the port answers `already-present` on the repeat, and exactly one `brief-appended` exists |
| G5 | A local architect uses an external-owner hypothesis as evidence, makes routine local refinements without a global call, and escalates real counterevidence | `local-authority.test.ts`. Three work items over one hypothesis: the first commits `ld-wi-001-01` with its assignment and makes no request, the second escalates with `stance: 'departs'` and its counterevidence, the third neither decides nor escalates. The local decision has `authority: 'local'`, `request: null` and no brief, and `brief-appended` names only `gd-001` |
| G6 | A later fork finds a locally registered unimplemented capability without a parent brief | The same test: the fork's prompt carries `field-order` with its owner and `revision 1, local-decision`, its inherited context mentions `field-order` nowhere, and its decision reuses that entry at revision 2 |
| G7 | A relevant hypothesis revision reaches affected local architects before dependent work is assigned | The same test: for each work item the hypothesis involves, a `hypotheses-delivered` carrying revision 2 follows `decision-accepted` and precedes that item's next `iteration-assigned`. The already-assigned item's outline still names revision 1, so delivery rewrote nothing |
| G10 | Global placement can authorize a new owner without claiming it already exists | `module-creation.test.ts`, "a create decision and its registry proposal lead to a bootstrap assignment that passes its gate": `decision-accepted` precedes `iteration-assigned`, the decision and the registry carry the same proposal, the assignment's bootstrap authority is that proposal's directory, the iteration is accepted with the module in the refreshed view, and the `module-created` notice names `gd-001`. The rejections are in `fork-submission.test.ts` |
| X1c | A decision fork threshold returns partial findings and no accepted decision | `placement.test.ts`, "it consumes its retries, nothing is appended, and the local architect is told": three `fork-returned-partial` with retries 1, 2, 3, no `decision-accepted`, no `brief-appended`, no invocation of any role but the three, and the local architect's next prompt carries the request, its findings and its gaps |

## 6. Guards owned

The cross-cutting JSON rule for both `ForkSubmission` members and for
`request-placement`.

| Subject | Schema-break test | Rule-break test |
| --- | --- | --- |
| `ForkSubmission` | `fork-submission.test.ts`, "a schema violation returns every error with its path, and a corrected submission is accepted": an unknown kind, an unknown key, a missing `brief` and a wrongly typed `findings`, each with its path, each changing nothing, and both members accepted once corrected | `fork-submission.test.ts`, "an owner absent from the refreshed view, with no valid proposal, is refused" — the named case — with five further rule tests beside it. In a run: `placement.test.ts`, "the errors reach the same fork, a corrected submission is accepted, and nothing changed meanwhile", where the rejection is answered to the same session with `"path": "decision.proposed"`, is a `rejection` observation with its errors and not its input, and the corrected decision is accepted |
| The bound | `placement.test.ts`, "the bound ends the fork as an invalid submission, and the run fails with it": the invocation ends `invalid-submission`, the run fails with `invalid-submission`, no decision, no brief and no delivery exist, and the request itself stands |
| `request-placement` | `fork-submission.test.ts`, "a schema violation returns every error with its path, and a corrected request is accepted" | `fork-submission.test.ts`, "a request names a registered capability, a known hypothesis and its own local decisions" |

## 7. Every union value has a producer and a test

`union-values.test.ts` gained three cases.

| Union | Values written and read back | Values with no producer in a run yet |
| --- | --- | --- |
| `PlacementDecision.outcome` | All five, each with both authorities. `reuse`, `create` and `extract` have producers in a run here | `extend` and `external` have none yet; both are offered to the role |
| `PlacementDecision.authority` | Both, each with a producer: `global` from a fork, `local` from an assignment | — |
| `PlacementRequest.hypotheses[].stance` | All three. `supports` and `departs` have producers in a run | `contradicts` has none yet |
| `ForkSubmission.kind` | Both, each with a producer: a decision and a partial return | — |
| `RegistryEntry.origin` | All three now have producers: `entry` from the analysis, `global-decision` from a fork, `local-decision` from an assignment | — |
| `Hypothesis.standing` | All three now have producers: `tentative` at revision 1, `confirmed` and `superseded` from a decision | — |
| `Hypothesis.cause` | Both arms now have producers: the initial analysis and one decision | — |
| `Hypothesis.change` | Unchanged from iteration 5 | `create-by-extraction` still has no producer; the decision outcome that pairs with it, `extract`, now has one |
| `ModuleNotice.decision` | Both: `null` for an entry proposal, a `RecordRef` for a decision's | — |
| `brief-appended.outcome` | Both, each with a producer: `appended` and, after a crash, `already-present` | — |
| `LocalArchitectSubmission.kind` | All four; `request-placement` gains its producer here | — |
| `SessionMode` | All three now have producers: `fresh`, `continued` and `fork`, with a fork that degraded to fresh recorded as such | — |

## 8. The tests

70 files, 513 tests. Three test files are new; four existing files were
extended.

| File | Tests | What it covers |
| --- | ---: | --- |
| `placement.test.ts` | 8 | The chain end to end on `revision-diff`: G2 and G3, X1c, revalidation after a view change, what a fork's invocation records, parent loss, rule 10 in a run, and a decision that replaces an earlier one |
| `fork-submission.test.ts` | 11 | Rule 10 for both fork members and for `request-placement`, and every rule the schemas cannot hold |
| `local-authority.test.ts` | 1 | G5, G6 and G7 in one run of three work items over one hypothesis |
| `run-recovery.test.ts` | 19 → 24 | Five new rows of the recovery table |
| `union-values.test.ts` | 23 → 26 | Section 7 |
| `module-creation.test.ts` | 2 → 3 | G10 |
| `analysis-submission.test.ts`, `local-architect-submission.test.ts` | unchanged | The manifest now offers four roles, and the local architect four members |

### The recovery table, extended

Iteration 7's nineteen rows stand. Five are added.

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `placement-requested` | Re-materializes the request from the line that committed it | No second request, no fork |
| A fork's own invocation, mid-investigation | Closes it `failed`/`session-lost` with no agent call | No second fork, no decision |
| `decision-accepted`, the brief not appended | Re-materializes the decision and performs the append under its identifier | One `brief-appended`, one `decision-delivered` |
| The append made, its completion not written | Performs the append again; the key answers `already-present` | One brief in the parent, one `brief-appended` |
| `brief-appended` | Appends `decision-delivered` | One delivery, and no agent call |

## 9. Deviations from the brief, with reasons

1. **The write scope was widened beyond the brief's three locations.** The
   brief names `src/architecture/`, `src/work/` and `src/prompts/`. Also
   changed:
   - `src/run/log.ts`: the seven run-log events the brief establishes are
     defined there, with the rest of the run's event schema.
   - `src/run/service.ts`: the chain has to be driven, and every run-log
     write goes through `RunService.write`, every invocation through
     `RunService.runInvocation` and every external effect through the
     ledger. No other module may write the log.
   - `src/run/records.ts`: `InvocationOutcome.session`, deviation 3, and the
     `ModuleProposal` type the placement rules read.
   - `src/work/committed.ts`: the reader answers with the requests, the
     decisions and the invocation outcomes the log holds, which the context
     projection and the placement rules are built from.
   - `subs/harness/README.md`: the responsibilities it describes changed.
2. **`localDecisions` carries a decision and its registry entries, not a
   bare `DecisionBody`.** The proposal's `assign` member has
   `localDecisions: DecisionBody[]`. A `DecisionBody` has no field a
   `RegistryEntry.behavior` could come from, and G6 requires a local
   decision to register a capability a later fork can find. Each entry is
   therefore `{ decision, registry }`, the same pair a fork submits, judged
   by the same rules.
3. **`InvocationOutcome` gained an optional `session`.** The `Invocation`
   record is committed before `startSession`, so it cannot hold the mode
   that was actual or the point the history reached. The outcome records
   both, which is what makes a fork that silently became a fresh session
   visible and what lets the parent context's session be recovered from
   committed state. It is absent for an invocation whose session never ran.
4. **A superseded hypothesis is delivered.** Iteration 5's `hypothesesFor`
   dropped one, so an architect told to expect a capability elsewhere would
   have seen the forecast disappear with no explanation. Relevance now
   selects by module and consumer alone, and the standing travels with the
   revision; a superseded hypothesis still forecasts nothing and still
   becomes no work.
5. **A rebuilt parent is the next fork's own session.** The architecture
   rebuilds the context "as part of the next requested architect
   invocation", and that is what the harness does: the next fork is started
   fresh with the orientation, and becomes the context. Its own
   investigation transcript is therefore in the parent from then on, which
   the design otherwise keeps out. No model call is made for the rebuild,
   which is what the plan requires, and a session started only to be
   appended to would cost one.
6. **`forkRetriesPerRequest` counts retries, so three forks run before
   exhaustion.** With the policy's value of 2, a partial return is followed
   by retry 1 and retry 2; the third partial exceeds the bound and returns
   the unresolved outcome. X1c's brief describes "one retry within
   `forkRetriesPerRequest`", which is the shape of the retry, not a total of
   two forks.
7. **`ModuleNotice.decision` is now filled.** Iteration 6 left it null
   because no decision existed. A module created at a directory an accepted
   registry entry proposes now carries the reference of the decision that
   proposed it, read from the registry rather than from what an agent said.
8. **Three events carry a field the proposal's table does not list.**
   `iteration-assigned` gains `decisions`, the local decisions it commits;
   `brief-appended` gains `outcome`, which is how `already-present` after a
   crash is distinguished from a first append; `global-context-rebuilt`
   gains `reason`. `view-refreshed` carries the attempt and the reason a
   refresh could not be made.
9. **A view identity is recorded with a coverage limit that says the limits
   are unknown.** The refreshed index carries a revision and an input
   identity but no coverage limits; those are in the view's own metadata.
   Where that metadata cannot be read, or describes another input, the
   identity records one limit saying so, rather than reporting none.

## 10. The measured size of the owners this iteration changed

From `ramify measure`.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `ramify-agent/harness`, after iteration 7 | 58 | 456,001 | 45 | 450,154 |
| `ramify-agent/harness`, now | 63 | 538,872 | 49 | 531,935 |
| `ramify-agent/harness/evidence`, now | 6 | 47,604 | 7 | 27,676 |
| `ramify-agent/harness/agent`, now | 2 | 32,276 | 4 | 28,063 |
| `ramify-agent/harness/agent/pi`, now | 1 | 28,656 | 8 | 69,278 |
| `ramify-agent/harness/ledger`, now | 5 | 25,487 | 12 | 47,887 |
| `ramify-agent` (root), now | 2 | 4,576 | 1 | 1,694 |
| `ramify-agent/web`, now | 10 | 19,159 | 5 | 10,430 |

`harness` grew by the five files of `src/architecture/`, by four test files
and by two resources: the global fork's two prompt files.

## 11. What the next iteration must know

- **The architect context is a projection, never a record.**
  `globalContextOf` reads the run log and the committed invocation outcomes.
  Do not cache it: a decision's own append reads it again, and that is what
  makes recovery answer the same thing.
- **The parent append is an external effect, and the second one this plan
  has.** Its key is `brief:<DecisionId>`. Anything else that must happen
  once outside the log belongs in the same shape: intent, perform,
  completion. `completeEffects` now knows two event types and warns about
  any other.
- **A fork is an invocation like any other.** `RunService.runInvocation`
  builds it, commits it before `startSession` and closes it; what a fork
  adds is `start: { mode: 'fork', from }` and the work reference
  `{ workItem, request }`. A role that forks records the requested mode on
  the invocation and the actual one on the outcome.
- **`InvocationOutcome.session.ref` is how a later session names an earlier
  one.** Iteration 9's contract sub-sessions, if they continue or fork
  anything, read it from there rather than from memory.
- **Counters are still read from committed records.** Placement requests
  from `placement-requested`, fork retries from `fork-returned-partial`,
  revalidations from the difference between those and `view-refreshed`, and
  local decisions from the committed decisions of the work item.
- **A decision reaches a work item two ways.** It was made for that item, or
  its `revises.affected` names it. Anything that must reach an architect
  that did not ask for it goes through the second.
- **The registry is where an unimplemented capability is found.** A fork is
  given it, a local architect is given it, and a locally decided capability
  is in it with `origin: 'local-decision'`. Nothing needs a brief to find
  one.
- **Do not let a resident Ramify daemon analyse a temporary project.**
  Unchanged from iterations 4, 6 and 7: run tests get a `ramify` that
  answers its version and nothing else, and a test that needs the real view
  starts and disposes its own daemon. The placement tests use the declared
  module tree, which needs no daemon at all; only G10 needs one.
- **`ramify stop` is not a command of the installed CLI.** Iteration 7's
  note to stop the daemon before a materialization cannot be followed as
  written; read `_meta.json` for `dependencies: measured` instead.
- **`scripts/real-session.ts` still has no command to send** and
  `src/cli.ts` still parses `--agent` and `--model`, as iterations 5 to 7
  recorded. Outside this brief's scope and left alone.
- **Nested-package discovery still walks to depth 5, not the plan's 4.**
  Unchanged and still flagged where the constant is defined.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale**, as iterations 1 to 7 recorded. `npm run check:self` does
  not read them.

## 12. Not done, with the reason

- **No pi session with a real provider was run.** This iteration is not one
  of the three the iterations README permits to touch pi. Whether a real
  provider accepts the fork submission's union, and whether pi's own fork
  and `appendContext` behave as the scripted fake does, belongs to iteration
  0's port contract and iteration 12's live trial; nothing here depends on a
  model.
- **A run is not resumed in place, so an interrupted fork is repeated by the
  next run, not by recovery.** SM3's "the invocation is interrupted and a
  new fork starts" is within-run behavior that iteration 5 settled against:
  a run without a terminal event is `interrupted` on load. What is proved is
  what recovery does: the fork's invocation is closed without an agent call,
  no decision exists, and nothing is duplicated. The request and its
  recorded view identity are on disk for whoever starts the run again.
- **`maxPlacementRequests` is enforced and has no test.** Exceeding it fails
  the run with `limit-exceeded` and the counter as evidence, on the same
  path as the other whole-run bounds; a test would run 33 forks. It is named
  here rather than claimed as covered.
- **No projection of requests or decisions is exposed to a client.** The
  records are on disk and the tests read them. Iteration 11 owns the
  protocol and decides what a client receives, including whether the
  decision list of the plan's decision 8 is one query or several.
- **A fork holds no writer and observes no mutation.** It reads and decides;
  `writer`, `guarded` and `equip` are not set for it, so it has no `edit`,
  no `write` and no shell. That is the plan's rule that a fork has no
  source-write authority, and it is why nothing here touches iteration 7's
  guard.
- **The architect-view diff is not used and no baseline is retained.** It is
  an explicit non-goal of the plan, and the forks run sequentially by
  design, not as a limitation to be worked around later.
