# Iteration 10 results: breaking work and gate integrity

**Date:** 2026-09-21. **Status:** complete. The [brief](iteration10.md) is
satisfied: a local architect isolates a required break into `breaking`
iterations whose checkpoint is the whole project, an engineer that finds a
break reports it and returns to its architect without widening its writes,
and the gate names every guarded change and never passes one no record
authorized. The session was interrupted once by the parent process exiting;
the work on disk was re-inspected and completed, and nothing below rests on
work from before the interruption that was not re-run afterwards.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four passed and
matched [iteration 9's](iteration9-results.md) exit.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  75 passed (75)
                                  Tests  554 passed (554)
=== npm run build:web ===    ✓ 280 modules transformed.   ✓ built in 425ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 190 source files, 13 resources, 2769 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 1927 allowed, 0 denied, 842 external
```

## 2. The architect view

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:22d8e8e6-2de4-47cc-938b-9d77b9df8990:1` | `rev/1:a74e1b79-45f8-4f33-975b-d41fb93c4859:1` |
| Input identity | `input/1:de746057dacf4de4333f4e2232debc97104330ca4a265a784aecbecb87390771` | `input/1:2f2b0fc395edbe8c25a4a2d1748376a1e4c7e8d0d457f5e5dd70554eefb1d66d` |
| Modules | 7 | 7 |
| Dependencies | measured | measured |

The before column is `.ramify-architect/_meta.json` as this iteration found
it. The after view was materialized with `ramify materialize --view
architect` after every change and before the claims below; it reports
`dependencies`, `testReferences` and `metrics` all `measured`. The module
tree is unchanged: no module was declared or removed and no `module.ramify`
was edited. Every change is the harness's own source, its prompts, its
README and its tests.

## 3. What was delivered

### The `breaking` kind and the broad scope

`assignableKindSchema` gains `breaking`, and in the same step the
architect's scope body gains the explicitly broad base `{ modules,
rationale }` beside the ordinary `{ module, includedChildren }`. Each has a
producer in a run (section 6). The rules beside the schema:

- only a `breaking` assignment may state the broad base;
- its rationale may not be blank — the schema accepts any string so the rule
  can say what is missing, which is the named rule-break;
- every module it names is in the refreshed view;
- a `breaking` assignment needs an outline whose `breakingChanges` records
  the guarantee. The initial work-item analysis is the detection point, so
  the kind cannot be a claim without a plan.

The broad form is optional: a `breaking` iteration may keep an ordinary
scope, as the compatible-preparation stage of K7 does. A broad base names
existing modules only; nothing is bootstrapped through it.

### The `breaking-iteration` checkpoint at every boundary

`checkpointOf('breaking')` and `testPolicyOf` already derived
`breaking-iteration` and `all-project`, but `iterationGate` always resolved
the assignment's own selection, which for `all-project` is empty and would
have been `empty-selection`. A breaking gate now runs the project's own
tests, the type check and a complete Ramify check, and beside them a probe:
the modules of the assignment's base, resolved anew from the tree as an
owned selection (`scopeProbePolicyOf`). The probe is what attributes a
failure to the iteration's own scope (`in-scope`, repaired) or outside it
(`outside-assignment`, back to the architect). The engineer's
`run_scope_tests` tool resolves the same probe policy, with the suites its
evidence requires, instead of an empty all-project selection. Nothing waives
the gate: a crash, a budget return or a scope report still closes the
iteration without acceptance, exactly as before.

### `break-discovered`

`unsuitableReasonSchema` gains `break-discovered`. The iteration closes
`unsuitable` with the report as a finding, no gate runs, and the work item's
local architect receives it at its next turn and revises the outline and the
remaining iterations. The engineer switches nothing and widens nothing. The
rule the schema cannot hold: an engineer already working a `breaking`
iteration has no break to discover and is refused at `reason`.

### Guarded-change authorization

- **What is guarded.** The assignment captures the hashes of the
  configuration and manifests, as before, and now also every contract
  artifact in force — each registered contract's interface, conformance and
  fake files. A file the project does not have is not guarded.
- **Who authorizes.** A local architect's `assign` may carry
  `authorizations: [{ path, rationale }]`. The rules: each path is one the
  harness guards, and a non-empty list arrives with an outline revision on
  the same submission. The harness writes `authorizations: [{ path,
  rationale, by }]` on the assignment, where `by` is the `RecordRef` of that
  outline revision. It stands for that one iteration. An authorized path is
  also admitted to the resolved write scope, because the authorization is
  the permission to change that file through the guarded tools. A contract
  iteration — a sub-session or a direct revision — carries the authorization
  for the contract artifacts in force, by the `ContractRecord` that
  established each, because rewriting the agreement is what it is for.
- **At the gate.** Both the iteration gate and the contract gate pass the
  assignment's authorizations to `runGate`, which already compared the
  captured set and set `authorizedBy`. An unauthorized change, including a
  deletion recorded as `after: null`, makes the cause `guarded-change`, the
  verdict never `passed`, and `next` `return-to-local-architect`. The
  iteration closes `unsuitable` with one finding per unauthorized path, so
  the architect can name the path in the revision it records.

There is no sealed-file mechanism and no judgment of a test's quality: what
is compared is the guarded set, and what authorizes is a committed record.

### Prompts

The local architect's procedure gains "Breaking work" (compatible additions
by default, staging, the `breaking` kind, the broad scope and its
rationale, answering `break-discovered`) and "Guarded files" (what is
compared, how a revision authorizes, what it may never authorize). The
engineer's procedure gains the `break-discovered` reason and what the gate
guards. No `submissionKinds` changed: the new values are a kind and a
reason, not union members.

### The fixture plan

`fixtures/collection-review/plans/reviewer-identity/plan.md` is new, in the
style of the two existing plans: it asks that a review outcome carry a
structured reviewer — identifier, display name, role — in place of a plain
field, through both protocol surfaces and the review panel, as a required
break across four owners with every intermediate state compiling and
passing, and with the old representation gone rather than deprecated.
Nothing else under `fixtures/` was changed.

## 4. Exit evidence

All four run from `ramify-agent/` after every change.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

 Test Files  76 passed (76)
      Tests  568 passed (568)
   Duration  187.60s (transform 6.73s, setup 0ms, import 23.61s, tests 1576.71s, environment 2.49s)
EXIT: 0

=== npm run build:web ===

✓ 280 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.27 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DIDBJLm_.js   402.20 kB │ gzip: 121.78 kB
✓ built in 288ms
EXIT: 0

=== npm run check:self ===

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 191 source files, 13 resources, 2808 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 1957 allowed, 0 denied, 851 external
EXIT: 0
```

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| The `reviewer-identity` run: three accepted iterations, each with a passing all-project gate, and a final state where no consumer still uses the old representation | `breaking-work.test.ts`, K7. See section 5 for exactly what "green" means here |
| A deleted guarded file recorded as `after: null` and not passing as an absent file | `breaking-work.test.ts`, "a deleted guarded file is recorded as after: null and does not pass as an absent file" |
| A `break-discovered` return that revises the outline without widening the engineer's scope | `breaking-work.test.ts`, "break-discovered returns to the local architect, which restages, and the engineer widened nothing" |
| An explicitly broad breaking scope accepted with its rationale, and one rejected for lacking one | Accepted: K7's two broad iterations and `local-architect-submission.test.ts`. Rejected: `breaking-work.test.ts`, "a broad scope with no rationale is returned with its path, and the corrected one is accepted", and the unit case beside it |
| The four commands | Above |

## 5. Was every accepted boundary green?

**Yes, for what this environment can run, and here is exactly what ran.**
In the K7 run all three accepted iterations are `breaking` iterations, each
closed by exactly one `breaking-iteration` gate attempt whose verdict is
`passed`, with cause null, no guarded change, and all four commands
`passed`: the project's tests, the type check, the complete Ramify check,
and the probe. There was no failed boundary to report.

What those commands are matters, and the claim does not reach further:

- **The probe really ran the break's code.** It is the project's runner over
  the test files of the iteration's own modules, resolved from the tree as it
  stood, run by the test runner that imports each file and fails on a thrown
  assertion (`installMiniRunner`). At the two broad boundaries it ran all four
  owners' tests. It is not the real Vitest.
- **The project's own suite, type check and Ramify check were real spawned
  commands that exit 0** (`testPolicy`), as in every run test of this
  project. They stand in for the fixture's toolchain, which cannot run here:
  the fixture has no `node_modules`, and one of its dependencies,
  `@modelcontextprotocol/sdk`, is installed nowhere in this checkout, so
  neither Vitest nor `tsc` can be run over the fixture's own source. A real
  complete Ramify check over a temporary project is also excluded, because a
  resident daemon must not analyse one.
- **The break runs through four owners the test adds to the fixture copy**,
  beneath `workspace/reviews/attribution`, which mirror the plan's four: the
  module that defines the outcome, the surface adapters above it, and a
  connected and a pure view. They are plain TypeScript so the runner can
  execute them. The fixture's own `reviews/core`, `reviews` and review views
  were not the ones changed, for the same reason. The plan the run reads is
  the real `reviewer-identity` plan.

**The boundary is not green by default.** A negative control proves it: a
breaking iteration that changes the outcome and adapts no consumer fails its
`breaking-iteration` gate, `in-scope`, with the consumers' own tests failing
in the probe and nothing committed; only the repaired, adapted state is
accepted (`breaking-work.test.ts`, "a break that leaves a consumer
unadapted fails the whole-project gate…").

The three stages were: stage 0, compatible preparation in the defining
module only (the structured reviewer beside the plain field, a narrow
scope); stage 1, the break and every consumer adaptation in one explicitly
broad iteration; stage 2, the removal, also broad. The final state was read
from the tree: no file of the four owners contains `reviewedBy`.

The main plan's open risk — that breaking-change isolation may not keep
every boundary green — did not occur in this run. Whether it holds on the
real fixture toolchain and with a real model is iteration 12's live trial.

## 6. Acceptance cases owned

| # | Case | The tests that prove it |
| --- | --- | --- |
| K6 | An attempt to narrow test discovery or disable a required suite is rejected unless an accepted requirement or contract revision authorizes it | `breaking-work.test.ts`, "an unauthorized edit of the test-runner configuration is guarded-change, and the same edit under a recorded revision passes": the engineer narrows `vitest.config.ts`'s discovery; the guarded `write` is denied (outside scope) and the shell's unguarded write reaches it; the gate's every command passed and the verdict is still not `passed`, cause `guarded-change`, `authorizedBy: null`, nothing committed, iteration `unsuitable`, and the finding names the path. The architect records outline revision 2 authorizing that path; the next change to the same file, now made through the guarded `write`, passes with `authorizedBy` naming `wi-001@2`. Deleting the file is the second test (`after: null`). The contract-artifact half — a conformance suite deleted or rewritten outside a contract iteration — rests on the same comparison: the artifacts are in the guarded set, and the contract iteration's own authorized changes are exercised by the P3/P4 runs of `contract-revision.test.ts`, whose revision gate passes only because its authorizations name them |
| K7 | A breaking feature is isolated into coherent iterations and all project tests pass at every accepted boundary | `breaking-work.test.ts`, K7, with the negative control beside it. Section 5 states what "all project tests" was in this environment |

## 7. Guards owned

The cross-cutting JSON rule for the `breaking` kind, the broad scope form and
the `break-discovered` reason:

- a violation returns every error with its path to the same session and
  changes nothing, and a corrected submission is accepted — the named
  rule-break, a broad scope with a blank rationale, run end to end in
  `breaking-work.test.ts`;
- the rules are tested directly in `local-architect-submission.test.ts`
  ("breaking assignments, the broad scope and authorizations", five cases)
  and `engineer-submission.test.ts` ("break-discovered", two cases);
- the bound ending the invocation as `invalid-submission` is the same path
  those files already prove for their other rules; no new member was added.

## 8. Every union value has a producer and a test

| Union | Now with a producer in a run | Still without one |
| --- | --- | --- |
| `assignableKindSchema` | `ordinary`, `breaking`, `verification`, `contract` | `repair` |
| `IterationKind` | `ordinary`, `breaking`, `contract`, `verification` | `repair`, `integration` |
| `Checkpoint` | all six; `breaking-iteration` gains its producer here | — |
| `WriteScope.base` | both arms; the broad arm gains its producer here | — |
| `EngineerSubmission.unsuitable.reason` | `scope`, `break-discovered`, `provider-cannot-conform` | `obligation-change`, `unplaced-need` are not offered |
| `GateCause` | `guarded-change` gains its producer here | unchanged otherwise |
| `GateAttempt.guardedChanges[].authorizedBy` | null (K6 first gate) and a record (K6 second gate; the contract revision gate) | — |
| `guardedChanges[].after` | a hash and `null` | — |

`union-values.test.ts` was updated for the new kind, reason, broad base,
authorization and checkpoint. `RunEvent['type']` is unchanged: this
iteration adds no event, and a later reason to reopen evidence still extends
`evidence-reopened`.

## 9. The tests this iteration added

76 files, 568 tests, up from 75 and 554.

| File | Tests | What it covers |
| --- | ---: | --- |
| `breaking-work.test.ts` (new) | 6 | K7, its negative control, the broad-scope rule-break in a run, K6 twice, and `break-discovered` |
| `local-architect-submission.test.ts` | +5 | The broad scope, the `breaking` kind and authorization rules |
| `engineer-submission.test.ts` | +2 | `break-discovered` and its rule |
| `run-recovery.test.ts` | +1 | The recovery row below |
| `union-values.test.ts` | 31 (changed) | Section 8 |
| `plans.test.ts`, `http.test.ts` | changed | The fixture now has three plans |

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `iteration-assigned` of a `breaking` assignment | Rewrites the assignment byte for byte from the log: the broad base with its rationale, the guarded hashes it was captured with, and the authorization with the outline revision that recorded it | No second assignment, no second capture, no gate |

## 10. Deviations from the brief, with reasons

1. **The authorizing record for a guarded change is the architect's outline
   revision.** The brief says an unauthorized change returns to the local
   architect "for a recorded revision", and K6 speaks of "a recorded
   obligation revision". No existing record names a configuration file, and
   adding a path list to `ProviderObligation` or `ConsumerRequirement` would
   change iteration 9's records for one case. The outline revision is the
   recorded revision the brief describes; it must arrive with the
   authorization, and each authorization names a path the harness guards.
   For contract artifacts the authorizing record is the `ContractRecord`.
2. **An authorization admits its path to the write scope.** Without it an
   authorized change to a root file could be made only through the
   unguarded shell. It is one file, recorded on the assignment beside the
   authorization that justifies it.
3. **A contract sub-session cannot report `break-discovered`.** The brief
   says a contract sub-session that discovers a break submits it too, but
   iteration 9 gave that sub-session a union of `established` and
   `incomplete` with no `unsuitable` member, and the interface this brief
   establishes is `EngineerSubmission.unsuitable`. A contract sub-session
   that cannot establish the agreement already returns `incomplete` to the
   requesting architect, which registers nothing.
4. **The fixture's `ReviewOutcome` has no plain reviewer field today.** The
   brief describes the break as a structured reviewer "in place of a plain
   field". The plan states the request that way; K7's four test-owned
   owners start with that plain field, and on the real fixture a compatible
   first stage would introduce it. Section 5 says why the run's owners are
   test-owned.
5. **Scope.** Beyond the brief's `work/`, `checks/`, `prompts/` and the plan,
   this iteration also changed `run/service.ts` (every assignment, gate and
   invocation goes through it), `subs/harness/README.md` (the
   responsibilities it describes changed), and the tests named in section 9.
   `checks/` itself needed no change: `runGate` already compared the guarded
   set and wrote `authorizedBy`; what was missing was its callers passing
   authorizations and the all-project resolution.
6. **The breaking engineer's own test tool resolves the probe policy**, not
   the empty all-project selection its gate records. The tool is a diagnosis
   and never a verdict, so this changes no gate.

## 11. What iteration 11 must know

- **Iteration 10 is complete.** No acceptance case is left for a later
  iteration.
- **An assignment now carries `authorizations`**, and every gate of an
  assignment passes them. A new gate call site must pass them, or a
  contract iteration's own rewrite of its artifacts becomes `guarded-change`
  — which is what the contract revision tests caught during this iteration.
- **The guarded set includes the contract artifacts in force**, so a
  projection of guarded changes should expect paths under provider modules,
  not only root configuration.
- **A breaking gate's last command is the probe.** Its `selection` is the
  base's modules; its absence means the base's modules had no test files.
- **Do not let a resident Ramify daemon analyse a temporary project**, and
  `ramify stop` is not a CLI command — unchanged.
- **`break-discovered` has no run-log event of its own.** It is a finding on
  an `unsuitable` result, read from the result record.

## 12. Not done, with the reason

- **The fixture's own toolchain did not run.** Section 5.
- **No pi session was run.** This iteration is not one of the three permitted
  to touch pi.
- **A run is not resumed in place**, as iterations 5 to 9 recorded; the
  recovery row proves re-materialization, not continuation.
- **No general migration state machine** for breaking changes, as the plan's
  non-goal states.
