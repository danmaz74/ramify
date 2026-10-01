# Iteration 9 results: contract delegation and provider obligations

**Date:** 2026-09-21. **Status:** complete. The [brief](iteration9.md) is
satisfied in full: an engineer that needs behavior outside its scope gets a
contract sub-session, the harness registers one provider obligation, the
provider work item satisfies it, only verification against the real provider
closes the delegation, a provider that cannot meet the agreement says so
through its own submission union, and a contract revision reschedules the
current evidence without resetting the work that completed.

The iteration was delivered in two parts, in two sessions, at the seam the
brief itself names. The [iterations README](README.md#sizing) permits the
split and requires it to be recorded; this note is that record.

| Part | What it delivered | Sections |
| --- | --- | --- |
| 1 | Everything before the brief's `### Contract revisions`: the need, the sub-session, registration, fake naming, scheduling, verification. Acceptance cases P1, P2, P5, K4 and X1b. | 1–12 |
| 2 | The brief's `### Contract revisions` section and the `provider-cannot-conform` path that triggers one. Acceptance cases P3 and P4. | 13–23 |

---

# Part 1

## 1. Baseline at the start of part 1

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches [iteration 8's](iteration8-results.md) exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  70 passed (70)
                                  Tests  513 passed (513)
=== npm run build:web ===    ✓ 280 modules transformed.   ✓ built in 213ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 175 source files, 10 resources, 2455 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 1643 allowed, 0 denied, 812 external
```

## 2. The architect view part 1 worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:57e2278e-a20d-4394-9a74-90998bd2a14c:1` | `rev/1:d47fa871-dc5d-4dca-8596-d4e0cbb2ab4e:1` |
| Input identity | `input/1:81914eb8f4239217fae1f3d49c388b1998f268c2d2dfcbef39227b95c1c26089` | `input/1:c3cccf2a50ec9404d475188b50a2f6775c96dc5153b6f5979857520a80e10d89` |
| Modules | 7 | 7 |
| Dependencies | measured | measured |

The before column is the view that was on disk when this part started, read
from `.ramify-architect/_meta.json` before anything was changed. The after
view was materialized before any claim below about the module tree.
`ramify stop` is not a command of the installed CLI, so the daemon was not
stopped before that materialization; the view reports `dependencies:
measured`, `testReferences: measured` and `metrics: measured`, so nothing
below rests on a view that lost them.

### The module tree is unchanged

Seven modules, as before. This part declares none and removes none, and no
`module.ramify` was changed. `subs/harness/src/contracts/` is the harness's
own source, and it crosses no boundary that was not already crossed.

## 3. What part 1 delivered

### The need, and the sub-session it starts

`EngineerSubmission` gains `contract-needed`. The need is written as
behavior — use cases, inputs, outputs, side effects, constraints and the
executable evidence that already exists — and the schema has no field for an
interface: naming the design would decide for the other side, which is what a
contract iteration exists to prevent. A need that names neither an output nor
a side effect is refused by the rule the schema cannot hold.

The engineer's turn ends there. No nested live session is started, the
iteration closes `partial` with what it did, and the harness answers with a
contract iteration of the same work item: its own identifier, its own scope,
its own gate and its own result, committed through `contract-requested` with
`requestedBy` naming the engineer's iteration. A caller that dies discovers
the outcome from those records and needs no reply from a session it never
held.

The owner comes from the registry and from nothing an engineer said. A
capability the registry does not place, or places with the consumer itself,
is a placement question and goes back to that work item's own architect,
which is the role that may ask the global architect. That is deviation 1.

### The sub-session's scope

An engineer invocation with the contract skill, not another persona: the same
tools, the same guard and the same post-write hook as an ordinary engineer,
with a package of its own whose `submissionKinds` are `established` and
`incomplete`. Its scope is read and write on the requesting consumer, and the
directories of the contract, its conformance suite and its fake under the
provider, plus the `module.ramify` of every module on the path between the
two sides. It is given directories and not files because the files it will
write do not exist yet and their names are the agreement's to choose; that is
deviation 3. The caller's writes are suspended for the whole of it, because
the run holds one writer at a time and the requesting engineer's invocation
is already closed.

### What a passing gate registers

Only `established` followed by a passing contract gate registers.
`contract-registered` commits the `ContractRecord`, one `ProviderObligation`
keyed `ob-<contract-id>` at the contract's revision, one `ConsumerRequirement`
per consumer and the provider work item, in one transaction. Every
identifier, every hash and the revision are derived from committed state and
from the files the gate passed over, so a repeat derives the same records;
`registrationNeeded` is the key `(obligation, revision)` and
`(requirement, revision)` that makes a registration already in the log not
appended again. An `access-only` agreement commits the contract alone: no
obligation, no requirement and no provider work item. `incomplete` commits
nothing at all.

A second consumer of an agreement already in force attaches to it: its own
requirement and its binding, reusing the current provider work item and the
current conformance. Nothing of the contract or the obligation is written
again.

### Fake naming

The contract gate verifies the
[fake-naming rule](../../../harness.spec.md#fakes-are-explicitly-named)
itself, over the source and never over the submission: what generated
architectural evidence will show is the source. A declared fake file whose
name lacks `.fake`, an export of a `.fake` file whose name lacks `Fake`, and
a re-export that drops the designation are each a violation, and any of them
fails the attempt. The cause is `in-scope`, because it is the engineer's to
repair, and nothing is committed.

`GateAttempt` gained an optional `rules` array for this; that is deviation 4.

### Scheduling

Depth-first, and read again on every round because a delegation creates work
items while the run is running. The deepest open work item runs first; a
consumer that has done what it can against its fakes submits
`yield-for-providers` with the requirements it waits for, and comes back only
once every provider of those requirements has conformed at the current
contract revision — before any independent entry work item. It resumes while
the requirements are still open: waiting for its own verification would wait
for itself.

A cycle is a cycle of capabilities. The graph is checked when a requirement
is committed, and a chain that runs back through a module is an ordinary
chain: change 1 in A needing change 2 in B needing change 3 in A is three
capabilities and three work items, and a new provider obligation starts a
work item of its own even in a module that already has one yielded. A
capability that transitively depends on itself appends
`dependency-cycle-detected`, returns once to the local architect of the work
item whose registration closed it, and is a notice the person sees whether or
not the re-plan resolved it. The same cycle again fails the run with
`dependency-cycle`.

### What closes a delegation

The provider's gate runs the agreed conformance suite against the real
implementation, and `provider-conformed` records it once per obligation
revision. A provider work item owes its obligation at every iteration of it,
including a verification of its own requirements, so the suite runs against
the real implementation before the item can complete; that is deviation 5.

`requirement-verified` is the only event that closes a delegation, and a
passing gate is not enough for it: no location the requirement named as a
fake injection may still reach the fake, by an import of one of its files or
by one of its exported names. A work item that asks for completion with an
open requirement, or with an obligation it has not conformed to, is refused
and told why; the final gate waits for every latest requirement revision.

### The projection

`RunSnapshot.notices` is no longer empty: it carries every module a commit
added or removed and every detected cycle, with the sequence and time of the
event that established it. A cycle notice is resolved when the work item that
closed it went on to complete and the same cycle was not detected again; it
is never removed either way. `counts.openRequirements` is the requirements
committed less those verified.

## 4. Exit evidence at the end of part 1

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

 Test Files  74 passed (74)
      Tests  541 passed (541)
   Duration  154.98s (transform 5.45s, setup 0ms, import 21.10s, tests 1253.08s, environment 2.64s)

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 280 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.27 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DIDBJLm_.js   402.20 kB │ gzip: 121.78 kB
✓ built in 284ms

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 188 source files, 13 resources, 2695 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 1858 allowed, 0 denied, 837 external
```

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| The `review-notes` fixture run end to end: one delegation, one obligation, one provider work item, one verification | `contract-delegation.test.ts`, "the delegation runs end to end and only the real provider closes it" |
| A restart after `contract-registered` recovers with exactly one obligation and one requirement, and the caller discovers the finished sub-session from the records | `run-recovery.test.ts`, "a restart after contract-registered recovers one obligation and one requirement, and the caller reads the outcome from them" |
| The evidence obligations of an assignment are visible before execution, and an engineer cannot remove one or weaken the contract to obtain a pass | `contract-delegation-integration.test.ts`, "K4: …": the provider's assignment carries the obligation reference, its suite and `against: 'real'`, and its gate's `extraSuites` require that suite. The suite is resolved anew at the gate from the tree, so an engineer that deleted it would make the attempt `required-suite-missing`, which is never a pass |
| A cycle and a shared obligation each reaching their recorded outcome through validated submissions | `contract-scheduling.test.ts`, three tests |
| `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self` | Above |

The two remaining items of the brief's exit evidence — the contract revision
after `evidence-reopened`, and a revision while items are unfinished — belong
to part 2, as does a provider engineer's `revision-needed`.

## 5. Acceptance cases part 1 owns

| # | Case | The tests that prove it |
| --- | --- | --- |
| P1 | One consumer delegates, resumes after provider conformance and verifies against the real provider | `contract-delegation.test.ts`, "the delegation runs end to end and only the real provider closes it". On the `review-notes` fixture: `work-item-yielded`, `provider-conformed`, `work-item-resumed`, `requirement-verified` in that order; the provider work item is started between the yield and the resumption; the requirement is still open when the consumer resumes; the consumer's source no longer reaches the fake when `requirement-verified` is appended |
| P2 | Fake files, exports and re-exports remain unmistakable, and architectural evidence does not present them as production behavior | `requirement-verification.test.ts`, "a file without .fake, an export without Fake and a re-export that drops it each fail the gate": every command of the attempt passed and the verdict is still `failed`, with cause `in-scope`, the three violations named and nothing committed. Beside it, `requirement-architect-view.test.ts`, "the architect view of the accepted state shows the fake under its fake name": a real `ramify materialize --view architect` over the accepted state, where every name the view records for the fake's file carries `Fake` and the real provider is there under its own behavior-oriented name. The rule itself is in `contract-submission.test.ts`, "it rejects a file without .fake, an export without Fake, and a re-export that drops the designation" |
| P5 | Shared obligations and at least one cycle reach a deterministic outcome | `contract-scheduling.test.ts`. "a second consumer attaches its own requirement and reuses the current provider work": one contract, one obligation, one `provider-conformed`, two requirements, two verifications, three work items. "change 1 in A needing change 2 in B needing change 3 in A completes 3, 2, 1 with no notice": three capabilities, three work items, two of them in module A, completion in the order wi-003, wi-002, wi-001, no `dependency-cycle-detected` and no notice. "the cycle returns to the local architect once, is a notice, and the same cycle again fails the run": two detections of the same normalized cycle, the first followed immediately by a local-architect invocation, the run failing `dependency-cycle`, and both notices in `RunSnapshot.notices` |
| K4 | Fake and real-provider conformance obligations are both enforced | `contract-delegation-integration.test.ts`, "K4: the contract gate runs the suite against the fake and the provider gate runs it against the real provider": the contract gate's selection requires the suite and runs it while the fake is its only subject; the provider's assignment carries the obligation with `against: 'real'` and its gate runs the same file with the real provider among the subjects; the verification assignment carries the requirement and the same suite again. The output tails show which subjects each attempt ran |
| X1b | A contract sub-session threshold returns incomplete and registers nothing | `contract-delegation.test.ts`, "no contract and no obligation are committed, and its caller accounts for the partial work": `contract-requested` with no `contract-registered`, one work item and no provider item, no open requirement, and the sub-session's own result `partial` naming what is unfinished, which the requesting work item's architect receives |

P3 and P4 are part 2's; section 17 records them.

## 6. Guards part 1 owns

| Guard | Test |
| --- | --- |
| A requirement whose fake is still injected is not verified | `requirement-verification.test.ts`, "a passing verification that left the fake in place closes nothing, and completion is refused until it is gone", and the unit case beside it |

In the run: the first verification iteration passes its gate and is accepted,
and no `requirement-verified` follows it; the work item's completion is
refused; the second verification replaces the fake and `requirement-verified`
is appended once, naming that iteration. The check reads the consumer's
source: an import of one of the fake's files and a use of one of its exported
names are both injections, and the fake named in a comment is not.

The cross-cutting JSON rule for `ContractSubmission`, `contract-needed` and
`yield-for-providers` is in `contract-submission.test.ts`: a schema violation
returns every error with its path and changes nothing, a corrected submission
is accepted, and each member has its own rule tests beyond the schema.

## 7. Every union value has a producer and a test, after part 1

`union-values.test.ts` gained four cases.

| Union | Values written and read back | Values with no producer in a run yet |
| --- | --- | --- |
| `RunEvent['type']` | All thirty-five, the seven this part adds included | — |
| `ContractSubmission.kind` | Both, each with a producer: `established` and `incomplete` | — |
| `ContractRecord.mode` | Both. `fake-backed` has producers in a run | `access-only` has none yet; the rules that judge it are tested directly |
| `ContractRecord.authority.kind` | All three. `provider` has producers in a run | `consumer` and `independent` have none yet |
| `ProviderObligation.evidence.against` | `real`, with producers in a run | — |
| `IterationAssignment.evidenceObligations[].against` | Both are representable. `real` has producers in a run | `fake` has none: the contract gate requires the suite against the fake through the selection it resolves at the gate, because the suite does not exist when the assignment is made |
| `IterationKind` | All six are representable; `contract` and `verification` gain producers here | `breaking` and `integration` still have none |
| `Checkpoint` | `contract` gains a producer here | `breaking-iteration` still has none |
| `WriteScope.extra[].kind` | Both: `file` from an architect's own extra location, `directory` from a contract scope | — |
| `WriteScope.extra[].purpose` | `contract`, `conformance`, `fake` and `exposure-declaration` gain producers here | `consumer` has none: the consumer is the contract scope's base, not an extra location |
| `GateRuleRecord.outcome` | Both, each with a producer: `passed` at an accepted contract gate, `failed` at a refused one | — |
| `RunNotice.kind` | `dependency-cycle` and `module-created` have producers | `module-removed` has none |
| `EngineerSubmission.kind` | All four; `contract-needed` gains its producer here | — |
| `LocalArchitectSubmission.kind` | All five; `yield-for-providers` gains its producer here | — |
| `WorkItem.origin` | `entry` and `obligation` have producers | `verification` has none: a consumer's verification is an iteration of the consumer's own work item, and a verification-origin item is created only by a contract revision, which is part 2 |

## 8. The tests part 1 added

74 files, 541 tests, up from 70 and 513. Four test files are new; two
existing files were extended, and one helper was added.

| File | Tests | What it covers |
| --- | ---: | --- |
| `contract-delegation-integration.test.ts` | 1 | K4's real selected-test-command boundary |
| `contract-delegation.test.ts` | 2 | P1 end to end and X1b against scripted external boundaries |
| `contract-scheduling.test.ts` | 3 | P5: a shared obligation, an A–B–A chain over three capabilities, and a cycle |
| `contract-submission.test.ts` | 12 | The cross-cutting JSON rule for the three new submissions, the fake-naming rule, the registration key, the capability graph and the depth-first order |
| `requirement-verification.test.ts` | 3 | The guard this iteration owns, and P2 at the gate |
| `requirement-architect-view.test.ts` | 1 | P2 in the architect view against real Ramify |
| `run-recovery.test.ts` | 24 → 27 | Three delegation boundaries |
| `union-values.test.ts` | 26 → 29 | Section 7 |
| `helpers/contracts.ts` | — | One seam as a test writes it: the files a contract sub-session produces, what the provider adds, and the consumer before and after verification |

### The recovery table, extended

Iteration 8's twenty-four rows stand. Three are added.

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `contract-requested` | Re-materializes the contract assignment from the line that committed it, with its `requestedBy` | No second sub-session, no registration |
| `contract-registered` | Re-materializes the contract, the obligation, the requirement and the provider work item | One of each; the caller's own iteration had already closed, so the outcome is in the records and not in a reply |
| `work-item-yielded` | Leaves the yield standing | No resumption, and the provider work item is not started |

## 9. Part 1's deviations from the brief, with reasons

1. **An unplaced capability escalates to the local architect, not to the
   global architect directly.** The brief says the harness resolves the owner
   from the registry, "asking the global architect first when the placement is
   shared or uncertain". A `PlacementRequest` is a validated agent submission
   with its own rules, and the harness cannot author one. Where the registry
   places the capability with another owner the harness commits the contract
   assignment itself, as the brief says; where it does not, the need returns
   to the requesting work item's architect as a finding, and that architect
   makes the request through iteration 8's path and then assigns again.
   Decision 5 holds either way: the outcome is in the records.
2. **The write scope was widened beyond the brief's five locations.** The
   brief names `src/contracts/`, `src/work/`, `src/checks/`, `src/prompts/`
   and the fixture plan. Also changed:
   - `src/run/log.ts`: the seven run-log events the brief establishes are
     defined there, with the rest of the run's event schema.
   - `src/run/service.ts`: every run-log write goes through
     `RunService.write` and every invocation through
     `RunService.runInvocation`, so the chain has to be driven there.
   - `src/run/records.ts`: `GateAttempt.rules` and the gate rule's schema.
   - `src/run/gates.ts`: `runCheckpoint` passes the rules through.
   - `src/run/snapshot.ts`: `RunSnapshot.notices` and `openRequirements`.
   - `src/guard/` was not touched; `src/work/scope.ts` was, for the directory
     extra of deviation 3.
   - `subs/harness/README.md`: the responsibilities it describes changed.
   The fixture plan `fixtures/collection-review/plans/review-notes/` is used
   and was not edited; neither was anything else under `fixtures/`.
3. **`WriteScope.extra` gained an optional `kind`.** A contract sub-session
   is given the directories of the contract, its conformance suite and its
   fake, because those files do not exist when the assignment is made and
   their names are the agreement's to choose. An architect's own extra
   location is still one file, which is the default, and the architect's
   submission body is unchanged.
4. **`GateAttempt` gained an optional `rules` array.** The fake-naming rule is
   verified by the harness over the tree, not by a command it spawns, and a
   gate attempt had nowhere to record such a finding. A failed rule fails the
   attempt the way an unauthorized guarded change does, with cause `in-scope`
   because it is the engineer's to repair. Absent for every checkpoint that
   verifies no rule.
5. **A provider work item owes its obligation at every iteration, and cannot
   complete without conforming.** The brief says the provider's gate runs the
   agreed suite against the real provider. Deriving the evidence only for
   non-verification iterations let a provider item that had also delegated
   complete without ever running the suite against its own real
   implementation, which the A–B–A chain found. Completion is now refused
   while the obligation is unconformed, with the reason delivered to the
   architect.
6. **A refused completion is bounded.** `request-completion` with an open
   requirement or an unconformed obligation returns to the same architect.
   Repeating it past `repairRoundsPerWorkItemGate` fails the run with
   `unresolvable-requirement` and the evidence still owed, rather than
   looping.
7. **`RunSnapshot.notices` carries module notices as well as cycles.** The
   brief asks only for the cycle. The module notices were already in the log
   and the proposal defines both arms of the projection, so the projection
   was written once rather than twice.
8. **A `ContractRecord.decision` may be null.** The proposal types it
   `DecisionId`. An entry capability's registry entry carries no decision,
   because the initial analysis placed it and nobody decided anything, and
   the field records that rather than naming a decision that was never taken.

## 10. The measured size of the owners part 1 changed

From `ramify measure`, after the change.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `ramify-agent/harness`, after iteration 8 | 63 | 538,872 | 49 | 531,935 |
| `ramify-agent/harness`, now | 71 | 649,367 | 54 | 627,131 |
| `ramify-agent/harness/evidence`, now | 6 | 47,604 | 7 | 27,676 |
| `ramify-agent/harness/agent`, now | 2 | 32,276 | 4 | 28,063 |
| `ramify-agent/harness/agent/pi`, now | 1 | 28,656 | 8 | 69,278 |
| `ramify-agent/harness/ledger`, now | 5 | 25,487 | 12 | 47,887 |
| `ramify-agent` (root), now | 2 | 4,576 | 1 | 1,694 |
| `ramify-agent/web`, now | 10 | 19,159 | 5 | 10,430 |

`harness` grew by the eight files of `src/contracts/`, by three resources —
the contract engineer's system prompt, its procedure and the contract
skill — and by four test files and one test helper.

## 11. What part 2 started from

- **The seam is the brief's own.** Everything before "### Contract revisions"
  is here. Part 2 implements that section and the `provider-cannot-conform`
  path that triggers one, with acceptance cases P3 and P4.
- **What part 2 starts from.** `ContractRecord`, `ProviderObligation` and
  `ConsumerRequirement` are revisioned records already: their schemas carry
  `revision`, their layouts are `<id>/<rev>.json`, and `committedRecords`
  reads each at its highest committed revision. `registerContract` takes the
  revision as an input and `registrationNeeded` already keys on
  `(obligation, revision)` and `(requirement, revision)`. What is missing is
  the `evidence-reopened` transaction, the explicit scheduling bindings, the
  follow-up work items with `follows`, the supersession of unfinished
  assignments, and the `revision-needed` and `evidence-reopened` run-log
  events.
- **`unsuitableReasonSchema` is still `['scope']`.** `provider-cannot-conform`
  was deliberately not added, because a union value with no producer is not
  offered. Part 2 adds it with its producer, the rule that only a
  real-provider assignment may use it, and the `revision-needed` it records.
- **Scheduling bindings are implicit.** A provider work item's
  `origin.obligation` names the obligation revision it is bound to, and a
  requirement's `workItem` names the consumer item. Part 2 needs explicit
  bindings, because a revision may bind an obligation revision to a work item
  that already exists.
- **Every scheduling decision is a projection.** `scheduleStateOf` reads the
  log and the committed records; `nextWorkItem`, `openRequirements` and
  `conformedFor` are pure functions over it. Nothing caches, and a run just
  recovered answers the same thing.
- **The contract gate resolves its own selection.** The assignment's frozen
  policy is augmented at the gate with the conformance suites the submission
  names, because the suite does not exist when the assignment is made. Every
  other gate uses the assignment's policy unchanged.
- **Counters are read from committed records.** Contracts from
  `contract-registered`, requirements from the committed records, conformance
  from `provider-conformed`, verification from `requirement-verified`, cycle
  detections from `dependency-cycle-detected`.
- **Iterations of one work item are counted over two events.**
  `assignedCount` counts `iteration-assigned` and `contract-requested`
  together. Anything that commits an assignment must go through it, or two
  assignments will derive the same identifier.
- **Do not let a resident Ramify daemon analyse a temporary project.**
  Unchanged from iterations 4 and 6 to 8. The delegation tests use the
  declared module tree, which needs no daemon; only P2's architect-view test
  starts and disposes one of its own.
- **`ramify stop` is not a command of the installed CLI.** Read
  `_meta.json` for `dependencies: measured` instead, as iteration 8 did.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale**, as iterations 1 to 8 recorded. `npm run check:self` does not
  read them.
- **`scripts/real-session.ts` still has no command to send** and
  `src/cli.ts` still parses `--agent` and `--model`. Outside this brief's
  scope and left alone.

## 12. What part 1 did not do, with the reason

The first two entries below were part 1's statement of what remained.
**Part 2 delivers both**; sections 13 to 21 record it, and section 21 is the
iteration's own list of what is not done.

- **Contract revisions and follow-up work are not implemented.** The brief's
  last section, its acceptance case P3, the `evidence-reopened` transaction,
  the supersession of unfinished assignments and the follow-up items with
  `follows` are part 2's. Nothing here pretends to them: no
  `evidence-reopened` event exists, and no code path fills a second revision.
- **`provider-cannot-conform` and `revision-needed` are not implemented**,
  for the same reason. Acceptance case P4 is part 2's. The reason is not
  offered to any engineer, so no run can produce it.
- **`access-only` has no producer in a run.** Its rules are judged by the
  same validator as every other submission and are tested directly; what has
  no producer is a run that ends in one. The value is named in section 7
  rather than claimed as covered.
- **No pi session with a real provider was run.** This iteration is not one of
  the three the iterations README permits to touch pi. Whether a real model
  writes a contract submission this union accepts belongs to iteration 12's
  live trial; nothing here depends on a model.
- **A run is not resumed in place.** As iterations 5 to 8 recorded, a run
  without a terminal event is `interrupted` on load. The delegation recovery
  rows prove what recovery does — re-materialize, duplicate nothing, call no
  agent — not that the run continues by itself.
- **The contract sub-session does not fork or continue another session.**
  It is started fresh and continued across its own repair rounds.
  `InvocationOutcome.session.ref` is where a later session would name it.

---

# Part 2

**Date:** 2026-09-21. It delivers the brief's `### Contract revisions`
section, the `provider-cannot-conform` path that triggers one, and
acceptance cases P3 and P4. Nothing of part 1 was rebuilt.

## 13. Baseline at the start of part 2

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches part 1's exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  74 passed (74)
                                  Tests  541 passed (541)
=== npm run build:web ===    ✓ 280 modules transformed.   ✓ built in 228ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 188 source files, 13 resources, 2695 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 1858 allowed, 0 denied, 837 external
```

## 14. The architect view part 2 worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:d47fa871-dc5d-4dca-8596-d4e0cbb2ab4e:1` | `rev/1:22d8e8e6-2de4-47cc-938b-9d77b9df8990:1` |
| Input identity | `input/1:c3cccf2a50ec9404d475188b50a2f6775c96dc5153b6f5979857520a80e10d89` | `input/1:de746057dacf4de4333f4e2232debc97104330ca4a265a784aecbecb87390771` |
| Modules | 7 | 7 |
| Dependencies | measured | measured |

The before column is part 1's after: the view that was on disk when this part
started. The after view was materialized with
`ramify materialize --view architect` before any claim below about the module
tree. `ramify stop` is not a command of the installed CLI, so the daemon was
not stopped before that materialization; the view reports
`dependencies: measured`, `testReferences: measured` and `metrics: measured`,
so nothing below rests on a view that lost them.

### The module tree is unchanged

Seven modules, as before. This part declares none and removes none, and no
`module.ramify` was changed. The one source file it adds,
`subs/harness/src/contracts/revision.ts`, is the harness's own, and it
crosses no boundary that was not already crossed.

## 15. What part 2 delivered

### The provider's report

`unsuitableReasonSchema` gains `provider-cannot-conform`, with its producer
and its rule in one step, which is what the cross-cutting requirement asks
for. The rule the schema cannot hold is that only an engineer whose
assignment owes a real-provider obligation may use it: the harness derives
that obligation from the assignment's `evidenceObligations` and passes it to
the validator, and any other engineer is refused with the error at
`reason`. A contract engineer cannot use it at all, because its own
submission union has no `unsuitable` member.

When the report is accepted, the writer has already settled with the
invocation, the iteration closes as `unsuitable`, and `revision-needed`
records the obligation the harness derived, the iteration that reported it
and the consumer work item it returns to. The report is deduplicated per
obligation revision, and it is delivered once: it reaches the consumer's
local architect at that architect's next turn, even while that consumer is
yielded, because what blocks the run is the agreement and not the work.

The provider's turn ends there. The report is bounded: a second report at the
same obligation revision means the agreement was not revised and the provider
cannot proceed, and the run fails with `unresolvable-requirement` and the
evidence rather than asking the same question again.

### The revision a consumer architect assigns

`assignableKindSchema` gains `contract`, and the assignment body gains
`revisesContract`, which names the agreement and nothing else: the harness
fills the revision number, captures the write scope and derives the gate. The
rules beside the schema are that a `contract` assignment names an agreement,
that no other kind names one, and that the agreement is one this work item
consumes — which the harness reads from the requirements bound to it, not
from what the architect said.

The accepted assignment is committed through `contract-requested`, as a
sub-session is, with `requestedBy` null and `revises` naming the agreement.
It licenses the same contract engineer with the same equipment; what differs
is its first message, which carries the agreement in force, what it names,
the rationale the architect gave and the provider's report where there was
one. The agreement in force stays in force until that iteration's gate
passes, and the engineer cannot choose or write the revision number.

### One transaction reopens the evidence

`evidence-reopened` replaces `contract-registered` for a revision. It commits
the contract, the obligation and a new revision of **every** attached
requirement, together with the scheduling binding from each to the work item
responsible for it, the follow-up work items, and the results that close
unfinished assignments as `superseded` — in one ledger transaction.

Each binding follows from what the log already holds:

- The work item that has **not** finished keeps its identity and is bound
  again. It receives the current evidence at its next coordination point,
  because every assignment derives its evidence from the binding.
- The work item that had **completed** stays completed and gets a follow-up
  whose `follows` names it: an obligation-origin provider item, or a
  verification-origin consumer item. This is where `WorkItem.origin`'s
  `verification` arm gains its producer, as part 1 said it would. The
  follow-up copies the prior item's requirement and acceptance references and
  is started for the item that asked for the revision.
- An assignment of a reused item that never closed is bound to the previous
  revision and cannot be accepted for this one, so it closes as `superseded`.

Requirement identities and their original `workItem` links stay stable; what
moves is the binding. Prior records stay historical, and only the latest
requirement revision can satisfy completion.

### The binding, not the record's own field, says whose work it is

Everything that read `requirement.workItem` or `item.origin.obligation` now
reads the binding first:

- `openRequirementsOf` answers the requirements bound to a work item, so a
  follow-up owes the requirement its predecessor held.
- `obligationOwedBy` answers the obligation revision bound to a provider
  item, so a reused provider owes the revision it is now bound to and a
  completed one that was rebound elsewhere owes nothing more.
- Work-item completion is refused on the same reading, which is what
  "work-item completion checks the current bindings" means.

Registrations before a revision record their bindings too: a
`contract-registered` binds its obligation to the provider work item it
started and each of its requirements to the consumer work item whose
iteration established them, which its own `iteration` field names.

### Scheduling

Three rules were added to the depth-first projection, all of them projections
over the log:

- A consumer a provider's report reached answers before anything else, even
  while it is yielded. It is not resuming: no provider conformed.
- A verification work item waits for the provider of the requirement it
  exists for, so provider work precedes consumer verification, including
  when every item of the previous revision had completed.
- A reopening's bindings are read through `bindingKey`, so the scheduler
  reaches the same answer after a restart as before one.

### The projection

`RunSnapshot.counts.openRequirements` is no longer a count of committed
requirements less verifications: it is each requirement at its latest
committed revision that no `requirement-verified` closed **at that
revision**. A revision reopens what a previous verification closed, and the
arithmetic that subtracted one count from another could not say so.

## 16. Exit evidence for the iteration

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

 Test Files  75 passed (75)
      Tests  554 passed (554)
   Duration  217.62s (transform 5.67s, setup 0ms, import 21.78s, tests 1483.61s, environment 2.58s)

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 280 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.27 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DIDBJLm_.js   402.20 kB │ gzip: 121.78 kB
✓ built in 234ms

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 190 source files, 13 resources, 2769 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 1927 allowed, 0 denied, 842 external
```

### The brief's remaining exit evidence, item by item

Part 1's table covered the first four items. These are the three it left.

| Item | Where it is proved |
| --- | --- |
| A provider engineer's `revision-needed` reaching its recorded outcome through validated submissions | `contract-revision.test.ts`, "revision-needed reaches the waiting consumer once, and the agreement stands until the revision registers", and its bound beside it |
| Complete revision 1 with two consumers, revise the contract, restart after `evidence-reopened`, and complete revision 2 with one provider follow-up and two consumer follow-ups. Earlier items stay completed; stale evidence cannot satisfy revision 2 and replay creates no duplicate work | `contract-revision-scripted.test.ts`, "two consumers complete revision 1, a third revises it, and the follow-ups finish the run"; the restart is `run-recovery.test.ts`, "a restart after evidence-reopened recovers one revision of each record with the same bindings", and the repeated registration is `contract-submission.test.ts`, "a reopening carries the same key, so a repeat of it appends nothing" |
| Revise while provider and consumer items are unfinished: supersede their old assignments, reuse those items with current evidence, and finish the run | `contract-revision.test.ts`, the P4 run reuses both unfinished items and finishes; the supersession itself is `contract-revision.test.ts`, "an unfinished item is reused and its open assignment closes as superseded; a completed one is followed". Deviation 4 says why no uninterrupted run produces a superseded assignment |

## 17. Acceptance cases part 2 owns

| # | Case | The tests that prove it |
| --- | --- | --- |
| P3 | A contract revision reschedules current evidence without resetting completed work | `contract-revision-scripted.test.ts`, "two consumers complete revision 1, a third revises it, and the follow-ups finish the run". Within one active run: `rq-001@1` and `rq-002@1` verified and `wi-001`, `wi-002` and `wi-004` completed; a third consumer then revises `ct-001`, and one `evidence-reopened` commits `ct-001@2`, `ob-ct-001@2` and `rq-001@2`, `rq-002@2`, `rq-003@2` with the four bindings `ob-ct-001@2 → wi-005`, `rq-001@2 → wi-006`, `rq-002@2 → wi-007` and `rq-003@2 → wi-003`. The three that had completed are followed (`wi-005` follows `wi-004`, `wi-006` follows `wi-001`, `wi-007` follows `wi-002`) and the one that had not keeps its identity. Earlier completions remain historical: each of the three completed exactly once, before the reopening, and `contracts/ct-001/1.json` is still revision 1 with its own `establishedBy`. Old evidence cannot satisfy revision 2: the verifications are `rq-001@1`, `rq-002@1`, `rq-003@2`, `rq-001@2`, `rq-002@2`, and the run did not complete on the first two. The provider follow-up completes before either consumer follow-up starts. Nothing is duplicated: one reopening, seven work items, one obligation revision per contract revision. The second case — a revision while items are unfinished, with their old assignments superseded — is the P4 run in `contract-revision.test.ts`, whose reopening reuses both items and creates no follow-up, and the unit case "an unfinished item is reused and its open assignment closes as superseded; a completed one is followed" |
| P4 | An ordinary provider engineer reports inability to conform through its own submission union | `contract-revision.test.ts`, "revision-needed reaches the waiting consumer once, and the agreement stands until the revision registers". A real-provider engineer submits `unsuitable`/`provider-cannot-conform`; its iteration closes `unsuitable` first, one `revision-needed` follows naming `ob-ct-001@1`, `wi-002.i01` and `wi-001`, and the next invocation is that consumer's local architect, which was yielded. It answers with a `contract` assignment whose `contract-requested` carries `revises: ct-001` and no `requestedBy`. The old contract stays unchanged until registration: no `contract-registered` names revision 2, `contracts/ct-001/1.json` is still what the first gate established, and revision 2 appears only in the reopening. The reused provider's next assignment owes `ob-ct-001@2` and its suite, not the revision it could not meet. The same reason from an unrelated engineer is refused with the error at `reason` (`engineer-submission.test.ts`), and a contract engineer has no `unsuitable` member at all (`contract-submission.test.ts`) |

With part 1's P1, P2, P5, K4 and X1b, every acceptance case the brief lists
for iteration 9 is delivered.

## 18. Guards and the cross-cutting requirements

- **Every agent communication is validated JSON.** The two submission changes
  this part makes — the `provider-cannot-conform` reason and the
  `revisesContract` assignment — each have their strict schema, their rules
  beside it, and tests that a violation changes nothing and returns every
  error with its path.
- **Every union value has a producer and a test.** `union-values.test.ts`
  gained two cases and now covers all thirty-seven run-log event types.
- **Measurements are captured when the observation happens.** Unchanged.
- **Records are immutable files committed by an event.** A revision writes
  `<id>/<rev>.json` beside the revision before it and rewrites nothing. A
  `superseded` result is written only for an assignment that has no result,
  because a result already committed is history.
- **The project passes and the fixture is unchanged** outside the temporary
  copies the tests make.

### Union values after this part

| Union | Values with a producer in a run now | Values with no producer in a run yet |
| --- | --- | --- |
| `RunEvent['type']` | All thirty-seven, the two this part adds included | — |
| `EngineerSubmission.unsuitable.reason` | Both: `scope`, and `provider-cannot-conform` from P4 | `break-discovered`, `obligation-change` and `unplaced-need` are not offered |
| `assignableKindSchema` | `ordinary`, `verification` and `contract` | `repair` has none yet |
| `WorkItem.origin` | All three: `verification` gains its producer in P3's consumer follow-ups | — |
| `IterationResult.outcome` | `accepted`, `partial`, `unsuitable` and `exhausted` | `superseded` has a producer in the reopening transaction, exercised directly; no uninterrupted run leaves an assignment unfinished for it to close (deviation 4) |
| `IterationKind` | `ordinary`, `contract` and `verification` | `breaking`, `repair` and `integration` still have none |

## 19. The tests part 2 added

75 files, 554 tests, up from 74 and 541. One test file is new; four existing
files were extended, and two helpers grew.

| File | Tests | What it covers |
| --- | ---: | --- |
| `contract-revision-scripted.test.ts` | 1 | P3 end to end |
| `contract-revision.test.ts` | 4 | P4 with its bound, and the reopening derived directly |
| `union-values.test.ts` | 29 → 31 | The two new events and every kind a local architect may assign |
| `contract-submission.test.ts` | 12 → 15 | The revision assignment's rules, the contract engineer's union, and the reopening's registration key |
| `engineer-submission.test.ts` | 9 → 10 | Only a real-provider assignment may report it cannot conform |
| `run-recovery.test.ts` | 27 → 29 | The two delegation boundaries this part adds |
| `helpers/contracts.ts` | — | A seam now carries the limit it agrees and whether it states trimming, so a revision is the same seam with a different behavior |
| `helpers/iterations.ts` | — | `byWork`, a script that answers each turn by the work item the prompt names, so a test of seven work items says what each does without predicting the scheduler's order |

### The recovery table, extended

Part 1's twenty-seven rows stand. Two are added.

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `revision-needed` | Leaves the report standing, with the provider's iteration closed as `unsuitable` before it | No revision: no `evidence-reopened`, and no second revision of the contract |
| `evidence-reopened` | Re-materializes the contract, the obligation and the requirement at their new revisions, with the revision before them still there | One reopening, the same two bindings, the same work item identifiers, and no follow-up where both items were unfinished |

## 20. Part 2's deviations from the brief, with reasons

Part 1's eight deviations stand. These are part 2's.

1. **The harness derives a contract revision's write scope, not the
   architect.** The brief says the architect assigns kind `contract` with
   `revisesContract` and its rationale in `approach`. A contract iteration
   needs the directories of the contract, its conformance suite and its fake
   under the provider, and the declarations on the path between the two
   sides; an architect's submitted scope names none of them, and the
   provider is the agreement's, not the architect's. The harness therefore
   captures the same scope it captures for a sub-session, from the agreement
   the assignment names, and keeps the architect's rationale in it. The
   architect's submission is unchanged, and the guard sees one scope kind for
   both contract iterations.
2. **An architect may revise only an agreement its work item consumes.** The
   brief does not say who may revise what. Without a rule any architect could
   revise any agreement, and the harness has no way to judge the result. The
   rule is read from committed state — the requirements bound to this work
   item — and not from the submission. Both paths the brief describes satisfy
   it: a consumer that a `revision-needed` reached holds the requirement, and
   a consumer that found the agreement insufficient attached to it first.
3. **A second report at the same obligation revision fails the run.** The
   brief says the report is "bounded by the work item's limits" but the
   report is deduplicated per obligation revision, so a second one appends
   nothing and would leave the scheduler returning to the same provider
   forever. The run therefore fails with `unresolvable-requirement`, the
   obligation and the report as evidence.
4. **`superseded` has a producer in the transaction, not in an uninterrupted
   run.** The brief supersedes "any other unfinished assignment bound to the
   previous revision" after writer settlement. In this harness every
   invocation, gate and iteration is serialized, and the only assignment
   without a result when a reopening is prepared is the one that established
   the revision, which is excluded. The transaction implements the rule and
   is tested directly with an unfinished assignment; no run in this part
   produces one, and none pretends to. A run interrupted by a crash can leave
   one, but such a run is not resumed in place.
5. **`RunSnapshot.counts.openRequirements` was rewritten.** The brief does not
   mention it. The count was committed requirements less verifications, which
   a revision makes wrong in both directions: it reopens what a verification
   closed, and it commits a requirement that is not a new one. It is now each
   requirement at its latest revision that nothing verified there.
6. **The write scope was widened beyond the brief's five locations**, as part
   1 recorded and for the same reasons. Also changed here: `src/run/log.ts`
   (the two events the brief establishes), `src/run/service.ts` (every
   run-log write and every invocation go through it), `src/run/snapshot.ts`
   (deviation 5), and `subs/harness/README.md` (the responsibilities it
   describes changed). The fixture plan `fixtures/collection-review/plans/`
   `review-notes/` is used and was not edited; neither was anything else
   under `fixtures/`.

## 21. Not done in this iteration, with the reason

- **No pi session with a real provider was run.** This iteration is not one
  of the three the iterations README permits to touch pi. Whether a real
  model writes a revision assignment this union accepts belongs to iteration
  12's live trial; nothing here depends on a model.
- **A run is not resumed in place.** As iterations 5 to 9 part 1 recorded, a
  run without a terminal event is `interrupted` on load. The two recovery
  rows prove what recovery does — re-materialize, duplicate nothing, call no
  agent — not that the run continues by itself. P3's completion after the
  reopening is therefore proved in one uninterrupted run, and the restart is
  proved at the boundary.
- **`access-only` still has no producer in a run**, and neither do
  `break-discovered`, `obligation-change`, `unplaced-need`, the `repair` and
  `breaking` iteration kinds, or the `breaking-iteration` checkpoint. They
  belong to iteration 10 and later, and a value with no producer is not
  offered.
- **A revision of an `access-only` agreement is representable and untested.**
  The transaction handles an agreement with no obligation — it binds the
  requirements alone — but no run establishes an access-only agreement yet,
  so nothing revises one.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale**, as iterations 1 to 9 part 1 recorded. `npm run check:self`
  does not read them.
- **`scripts/real-session.ts` still has no command to send** and
  `src/cli.ts` still parses `--agent` and `--model`. Outside this brief's
  scope and left alone.

## 22. The measured size of the owners, after the iteration

From `ramify measure`, over the refreshed view.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `ramify-agent` | 2 | 4,576 | 1 | 1,694 |
| `ramify-agent/harness`, after part 1 | 71 | 649,367 | 54 | 627,131 |
| `ramify-agent/harness`, now | 72 | 692,859 | 55 | 675,500 |
| `ramify-agent/harness/agent` | 2 | 32,276 | 4 | 28,063 |
| `ramify-agent/harness/agent/pi` | 1 | 28,656 | 8 | 69,278 |
| `ramify-agent/harness/evidence` | 6 | 47,604 | 7 | 27,676 |
| `ramify-agent/harness/ledger` | 5 | 25,487 | 12 | 47,887 |
| `ramify-agent/web` | 10 | 19,159 | 5 | 10,430 |

`harness` grew by `contracts/revision.ts` and by one test file; the rest is
the revision path through `run/service.ts` and the two procedures that
describe it.

## 23. What iteration 10 must know

- **Iteration 9 is complete.** Every section of the brief, every acceptance
  case it owns, and every item of its exit evidence is delivered. Section 21
  is the whole iteration's list of what is not done, and nothing in it
  belongs to iteration 9.
- **A scheduling binding, not a record field, says whose work a subject is.**
  Anything that asks which work item owes an obligation or a requirement goes
  through `bindingsOf`, `obligationOwedBy` or `openRequirementsOf`. Reading
  `requirement.workItem` or `item.origin.obligation` directly is right only
  for the identity that never moves.
- **`evidence-reopened` is the general reopening event.** Its data names a
  cause, so a later iteration that reopens evidence for a reason other than a
  contract revision extends this transaction rather than adding an event
  beside it.
- **`assignableKindSchema` now has four members**, and `breaking` is still
  not one. Iteration 10 adds it with the `breaking-iteration` checkpoint,
  the broad scope arm of `WriteScope.base` and the `break-discovered` reason,
  each with its producer.
- **A contract iteration's scope is the harness's.** Both paths that make one
  — a sub-session and a direct revision — use `contractScope`, which is the
  one place that decides what a contract iteration may write.
- **`byWork` is how a test of many work items is written.** It answers each
  turn by the work item the prompt names, so a test states what each work
  item does without predicting the scheduler's order. The order is then
  asserted, which is the point.
- **Do not let a resident Ramify daemon analyse a temporary project.**
  Unchanged from iterations 4 to 9. The revision tests use the declared
  module tree and need no daemon.
- **`ramify stop` is not a command of the installed CLI.** Read
  `_meta.json` for `dependencies: measured` instead.
