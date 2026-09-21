# Iteration 5 results: initial analysis and work-item coordination

**Date:** 2026-09-20. **Status:** complete. The [brief](iteration5.md) is
satisfied: the mapping job is converted into the run's initial analysis and
the map, its protocol, its command and its web pages are removed; an accepted
analysis commits entry assignments, hypotheses, the registry and the
work-item frontier in one transition; each work item's local architect runs
as one continuing session, requests completion with an outline, and the
`work-item` gate is the only thing that closes it; and the capability
progress projection derives the rest.

A run over the `collection-review` fixture whose two entry capabilities are
already satisfied completes: two work items, two outlines recorded as
`single-iteration`, two passing work-item gates, one passing final gate. That
is this iteration's exit evidence and it is executable.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches [iteration 4's](iteration4-results.md) exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  57 passed (57)
                                  Tests  427 passed (427)
=== npm run build:web ===    ✓ 287 modules transformed.   ✓ built in 305ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 146 source files, 6 resources, 1777 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 1085 allowed, 0 denied, 692 external
```

## 2. The architect view this iteration worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:484e9434-865d-438a-b32c-b64057e1472e:1` | `rev/1:7acddce6-d1ba-45a6-9b64-36d2838b0ac3:1` |
| Input identity | `input/1:d4ac0c40c1f9dbf183f24fcc51545ddd4f25046dce0d29439fc75673c8a931e8` | `input/1:31d2a9b81ebe8cd8abf0a41eeb28e9c3c12305d8265418454b48cc04aaff2988` |
| Modules, records | 7, 724 | 7, 660 |
| Dependencies, test references, metrics | measured | measured |
| Cut | 187 | 156 |

The before column is the view that was on disk when this iteration started,
read from `.ramify-architect/_meta.json` before anything was changed; its
record count is iteration 4's recorded figure, quoted rather than observed.
The after view was materialized from a stopped daemon, before any claim below
about the module tree, and its dependency facts are measured. Its cut is 156,
so an absent detail in it is not evidence that behavior is absent.

### The module tree is unchanged, and one dependency fact is gone

The seven modules of iteration 4 are the seven modules now; this iteration
declares none and removes none.

| Module | `uses` | `usedBy` |
| --- | --- | --- |
| `ramify-agent` | `harness` | — |
| `ramify-agent/harness` | `evidence`, `ledger`, `agent` | `ramify-agent`, `web` |
| `ramify-agent/harness/evidence` | — | `harness` |
| `ramify-agent/harness/ledger` | — | `harness` |
| `ramify-agent/harness/agent` | — | `harness`, `agent/pi` |
| `ramify-agent/harness/agent/pi` | `agent` | — |
| `ramify-agent/web` | `harness` | — |

`harness` no longer uses `agent/pi`. `http/server.ts` chose the agent
implementation for `serve --agent pi|fake`, and the server no longer starts a
run, so nothing in `harness` names pi any more. The caller of
`RunService.open` chooses the implementation; `pi` is reached again when the
Run page's protocol lets a client start a run.

The exposures changed: `harness` loses the two statements for
`interfaces/map.ts` and `interfaces/protocol/maps.ts` and gains one for
`interfaces/protocol/evidence.ts`; the root's descendant channel is rewritten
to match. `harness/evidence`, `harness/ledger` and `harness/agent` are
untouched.

## 3. What was removed

The conversion happened in the brief's order, so the project passed at each
step. Everything below is gone from the tree.

| Removed | What replaced it |
| --- | --- |
| `src/mapping/` — `architect.ts`, `procedure.ts`, `validate.ts`, `demo-script.ts`, `architect-prompt.md`, `feature-mapping.md` | `src/analysis/` and the `initial-architect/1` prompt package. `sha256`, `planChanges`, `sourceState` and `EvidenceUnavailableError` moved into `run/inputs.ts`, which was already the run's evidence seam |
| `src/maps/revisions.ts` | Nothing: a plan has no saved map revisions |
| `src/interfaces/map.ts` | `src/interfaces/protocol/evidence.ts` holds `modulePathSchema`, `sha256Schema`, `citationSchema`, `viewIdentitySchema`, `inputManifestSchema` and `isWithin`. The map's own sections, its approval record and `validateMapSubmission` are gone |
| `src/interfaces/protocol/maps.ts` | The module-tree query moved to `evidence.ts`; the revision queries are gone |
| `src/jobs/service.ts`, `jobs/log.ts`, `jobs/snapshot.ts` | Nothing. `jobs/records.ts` keeps what a job directory is; `jobs/commit.ts`, `commands.ts`, `mutex.ts` and `activity.ts` are unchanged and serve the run |
| `start-mapping` and `approve-map`, the `Command` union, `POST /api/v1/commands` | `start-run`, executed through `RunService.execute`. The command endpoint arrives with the Run page's protocol |
| The `map-validated` and `map-approved` events, `jobEventSchema`, `jobSnapshotSchema`, `eventPageSchema`, `failureReasonSchema` | The run's own log and its projection |
| `mappingStateSchema` and the `mapping` field of every plan entry | Nothing: the plan list and the plan page show plans |
| `GET /plans/:planId/jobs`, `/jobs/:jobId`, `/jobs/:jobId/events`, `/maps`, `/maps/:revision`, and their paths | Nothing yet |
| Web `map-view.tsx`, `map-document.tsx`, `mapping.ts`, `progress.tsx` | Nothing until the Run page. `module-tree.tsx` stays, with the presentation types it needs defined in the web module |
| The `map` route and the Map tab | `#/` and `#/plans/<id>` |
| Tests: `approval`, `jobs`, `mapping`, `recovery`, `map-contract`, `validate`, `jobs-http`, `helpers/jobs.ts`, `helpers/procedures.ts`; web `map-view`, `progress` | `work-items`, `local-architect-submission`, `progress`, `compaction`, `helpers/analysis.ts`, and the extensions listed in section 8 |

`crashLock` and `deadPid` moved from `tests/helpers/jobs.ts` into
`tests/helpers/runs.ts`, which is where the run's tests already were.

**A mapping job directory Plan 1 left on disk is not a run and is not
listed.** `RunService.open` passes over a `job.json` whose `kind` is not
`implementation`: it is not loaded, not listed, not recovered and not a
warning. `run-recovery.test.ts` writes one of Plan 1's records beside a run
and asserts all five.

## 4. What was delivered

### The initial analysis

One `initial-architect` invocation over the captured plan, the refreshed
architect view and the module-architect skill. The API-view tool is not
offered to it: requester availability is the local architect's to verify, and
the tool moved with that responsibility.

Its submission commits, in one `analysis-accepted` event: `EntryAssignments`,
every `Hypothesis` at revision 1, one `RegistryEntry` per entry capability
with `origin: 'entry'` and `decision: null`, and one `WorkItem` per entry
capability. `analysis/accept.ts` derives all of it as a pure function of the
submission, the view identity and the invocation, so a repeat after a crash
derives the same records with the same IDs.

`analysis/submission.ts` holds the schema and every rule beyond it:

- a capability slug and a hypothesis ID each unique in the run;
- an owner the refreshed view has, or a `ModuleProposal` whose parent it has,
  whose directory is a non-conflicting direct child under that parent's
  `subs/`, and whose name agrees with the owner and the declaration;
- a directory no module of the view occupies, and one definition per proposed
  directory: several capabilities may reference one proposal, and two
  definitions of one directory are an error;
- every `PlanRef` inside the captured plan: a heading it has, or a line range
  it holds;
- a citation whose module the view has and whose named symbol is an exported
  original that module owns.

Without a view the rules that need one are not applied, and the run records
that rather than accepting a claim it did not check.

**A hypothesis never creates work.** It has no reference to a work item, and
nothing references it but a decision and a local architect's input. Revision
1 is never rewritten. `change` offers `reuse`, `extend`, `create` and
`create-by-extraction`; `refactor` is not offered, because no decision
outcome could confirm it. See deviation 4.

### The work-item frontier

One work item per entry capability, always. Its module is the entry's owner
and its goal the entry's description; the run takes them in the order the
analysis committed them.

`work-item-started` opens the item. `hypotheses-delivered` then records which
hypothesis revisions it received — each as `{ id, revision, hash }`, where
the hash is the hash of the materialized record file — selected by the
modules a hypothesis involves and the consumers it anticipates, by module and
by capability, and not only by the owner it suggests. A superseded hypothesis
is not delivered. Delivery happens once per item, at that coordination point.

### The local architect

One continuing session per work item. The first turn is `fresh`; every turn
after it continues the point the last one reached, so the architect that
receives a failing gate is the one that wrote the outline. Compaction is
allowed by the role's context policy and is recorded where it happens.

It receives the goal, its requirement and acceptance references with their
excerpts, its module's onboarding — the first top-level prose paragraph of
its README, with no fallback to another owner's prose — its module's API view
or the reason there is none, the hypotheses it was delivered with their
rationales, and the registry.

Two submission members:

- `request-completion` commits a `WorkItemOutline` through `outline-revised`
  and then runs the `work-item` gate. Requesting completion with no iteration
  is a legitimate outcome: the goal is already satisfied by existing
  behavior, which is verified reuse, and the outline records why.
- `unresolved` ends the run with `unresolvable-requirement`, carrying the
  conflict and its evidence.

A failing gate returns to the same session with what the gate found; the
architect may revise its outline, which is the next revision. Exhaustion of
`repairRoundsPerWorkItemGate` fails the run with `repair-exhausted`, naming
the cause of the *first* failing attempt and that attempt's ID, not the last
one's.

`work-item-completed` requires a passing `work-item` gate and is the only
thing that closes a work item. `job-completed` names the count of closed
items beside the passing `final` gate.

### Progress

`progress/capabilities.ts` is the internal `CapabilityProgress` projection:
`todo` for an expected or confirmed need with no work started, `working` once
work started, `completed` only with the passing gate that is its current
verification evidence. A capability only a hypothesis forecasts is
`tentative`; a superseded hypothesis leaves the list without becoming
`completed`. It is a pure function of the log and the records the log
committed and appends nothing. Its public shape arrives in iteration 11.

### The records read back from the log

`work/committed.ts` reads the hypotheses, the registry, the work items and
the outlines from the replayed log rather than from the files, validating
each body again as it comes back. The log is the authority and each file is a
materialized copy, so a run that has just recovered and one that never
crashed answer the same thing.

### The web, the server and the trial

`createApp` serves the project, its module tree and its plans; `startServer`
takes the project lock and serves them, and starts no run. The client shows
plans: `#/` and `#/plans/<id>`. `module-tree.tsx` is kept with its
presentation types defined in the web module, for the Run page to draw on.

`scripts/live-trial.ts` is pointed at the initial analysis of a run: its
header, its instructions and its verification now name that session. Its
`prepare` and `verify` are unchanged in substance, because a run reads the
project and writes only beneath `plans/<plan-id>/.harness/` until an engineer
is assigned, and the initial analysis writes nothing at all.

## 5. Exit evidence

All four run from `ramify-agent/` after every change, with the architect view
already refreshed.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm run test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  52 passed (52)
      Tests  385 passed (385)
   Duration  39.40s (transform 3.28s, setup 0ms, import 14.81s, tests 232.20s, environment 3.49s)

EXIT: 0

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 280 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.27 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DIDBJLm_.js   402.20 kB │ gzip: 121.78 kB
✓ built in 253ms

EXIT: 0

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 135 source files, 6 resources, 1565 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 952 allowed, 0 denied, 613 external

EXIT: 0
```

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| A run over the `collection-review` fixture whose two entry capabilities are already satisfied: two work items, two outlines recorded as `single-iteration`, two passing work-item gates, one passing final gate, completed | `work-items.test.ts`, "two entry capabilities become two work items…": the twenty-four events in order, the two work items with their origins and goals, both outlines at revision 1 with `decomposition.kind: 'single-iteration'`, the three gate attempts (`work-item`, `work-item`, `final`) all passing, and `job-completed` naming two work items |
| An initial submission naming an absent owner without a valid proposal is rejected with its path; a valid proposal with an existing parent is accepted | `analysis-submission.test.ts`, "an owner that is not in the view…" (`entries.0.owner`) and "a valid proposal with an existing parent is accepted" |
| A conflicting directory or nonexistent parent is rejected before work starts | `analysis-submission.test.ts`, "a proposed module must be a direct child under its parent's `subs/`" (`entries.0.proposed.parent`), "the owner, the directory and the declaration name must agree", and "a directory a module already occupies, and two entries that define one directory differently" |
| A duplicate capability slug is rejected; three rejections end the invocation as `invalid-submission` | `analysis-submission.test.ts`, "a duplicate capability slug is refused" and "a duplicate capability slug is rejected, and three of them end the invocation": the run fails `invalid-submission`, there is no `analysis-accepted`, and no work item is started |
| A work-item gate failure returns to the local architect and exhausts deterministically, with the original cause preserved | `work-items.test.ts`, "returns to the same local architect…": four failing `work-item` attempts (the original and three repair rounds), four outline revisions each from its own invocation of one continuing session, `repair-exhausted` naming the first cause and its gate, no commit, no completion, no final gate |
| The delivered hypothesis revisions for each work item, and a test that a hypothesis appears in no work record | `work-items.test.ts`, "a work item receives the hypothesis revisions that involve it…" and "the delivered hash is the hash of the materialized record file"; and "hypotheses create no work, and a hypothesis appears in no work record" |

## 6. Acceptance cases owned

| # | Case | The tests that prove it |
| --- | --- | --- |
| G1 | Initial analysis produces executable entry assignments and separate deeper hypotheses; hypotheses create no work | `subs/harness/src/tests/work-items.test.ts`. A submission with two entries and four hypotheses commits both in one `analysis-accepted` event (`entries: 2, hypotheses: 4, registry: 2, workItems: 2`); the frontier holds exactly one work item per entry capability and no `wi-003`; no registry entry exists for any forecast capability; and every work item and every `work-item-completed` event is searched for each of the four hypothesis IDs and holds none. An outline's `hypothesesSeen` is the record of what was delivered, and outside that field no hypothesis appears |
| X2 | Initial, global and local compaction is observed and recorded when it happens | `subs/harness/src/tests/compaction.test.ts`. A scripted compaction during the initial analysis and another during a local architect session yield `compaction` observations with their trigger, their success and the sizes where the implementation reports them, `null` where it does not; a `context` observation of `null` tokens after one is recorded as it arrived, because unknown is never room. Global compaction belongs to iteration 8's fork, which does not exist yet: the policy row for `global-fork` forbids it and is asserted here |
| M1 | Hypothesis, decision, work and progress records remain visibly distinct | `subs/harness/src/tests/progress.test.ts`. Over a real run: `hypotheses/`, `registry/`, `work-items/` and `analysis/` are distinct directories with only their own kind in each; the committed `Hypothesis` has no `workItem` key, mentions no work-item ID, and the schema refuses one added to it; and the progress projection, run twice over the same inputs, answers the same thing and leaves every file beneath the run, its size and its modification time exactly as it found them. Progress has no directory because it is never recorded. Placement decisions arrive in iteration 8 and get their own directory then |

## 7. Guards owned

The cross-cutting JSON validation rule applies to `InitialAnalysisSubmission`
and to both local architect members added here.

| Submission | Schema-break test | Rule-break test |
| --- | --- | --- |
| `InitialAnalysisSubmission` | `analysis-submission.test.ts`, "rejects an input whose shape is wrong, with a path for every error" and "rejects an unknown field, and a slug that is not kebab-case" | The seven rule tests of "the rules the schema cannot hold", and in a run "a duplicate capability slug is rejected, and three of them end the invocation" |
| `LocalArchitectSubmission` | `local-architect-submission.test.ts`, "rejects an unknown kind, an unknown field and a missing outline" and, in a run, "a broken schema returns every error to the same session, and a corrected input is accepted" | "a staged decomposition names at least two stages…", "a stage depends only on an earlier stage", "reuse names a module of the view, and agrees with where the registry places the capability", "a breaking change names consumers and citations the view has", and in a run "a rule the schema cannot hold is answered the same way, and the bound ends the invocation" |

Each asserts that nothing changed, that every error carries its path, that a
corrected input is accepted, and that the bound ends the invocation as
`invalid-submission`. Neither schema has a field for an ID the harness
already knows: both are asserted over `z.toJSONSchema` output.

## 8. Every union value has a producer and a test

`union-values.test.ts` gained four cases for the unions this iteration
establishes.

| Union | Values written and read back | Values with no producer in a run yet |
| --- | --- | --- |
| `RunEvent.type` | All nineteen, the four new ones included | `writer-acquired` and `writer-released` still have no producer until an engineer writes |
| `Hypothesis.change` | All four | `extend`, `create` and `create-by-extraction` are produced by an analysis; a decision confirms one from iteration 8 |
| `Hypothesis.standing` | All three | Only `tentative` has a producer: `confirmed` and `superseded` are a decision's, in iteration 8 |
| `Hypothesis.confidence` | All three | — |
| `Hypothesis.cause` | Both arms | The `decision` arm has no producer until iteration 8 |
| `RegistryEntry.origin` | All three | Only `entry` has a producer; the two decision origins arrive with iterations 8 and 6 |
| `WorkItem.origin` | All three arms | Only `{ entry }` has a producer; `obligation` and `verification` arrive with iteration 9 |
| `WorkItemOutline.decomposition.kind` | Both | Both are produced; `staged` has no *consumer* until iteration 6 assigns a stage |
| `WorkItemOutline.stages[].approach` | Both | `breaking` is consumed from iteration 10 |
| `LocalArchitectSubmission.kind` | Both members this package offers | `assign`, `request-placement` and `yield-for-providers` are not offered to the role, so no run can produce them; they arrive with iterations 6, 8 and 9 |
| `RunFailureReason` | `unresolvable-requirement` and `repair-exhausted` gain producers here | `inputs-changed`, `dependency-cycle` and `limit-exceeded` still belong to later state machines |
| `Role` | All five, each with its context policy | `initial-architect` and `local-architect` are invoked here |

## 9. The tests

52 files, 385 tests. Four test files and one helper are new; three existing
files were extended.

| File | Tests | What it covers |
| --- | ---: | --- |
| `work-items.test.ts` | 6 | The exit-evidence run; G1; hypothesis delivery and its hashes; a failing gate that returns and exhausts; `unresolved` |
| `local-architect-submission.test.ts` | 10 | Rule 10 for both members, on their own and in a run |
| `progress.test.ts` | 5 | M1 and the four states of the projection |
| `compaction.test.ts` | 3 | X2, and that compaction is port policy rather than prompt text |
| `analysis-submission.test.ts` | 13 → 19 | The five new rules, and the duplicate slug that ends an invocation |
| `union-values.test.ts` | 12 → 16 | Section 8 |
| `run-recovery.test.ts` | 10 → 14 | Four new rows of the recovery table, and the mapping directory that is not a run |
| `protocol-contract.test.ts` | rewritten, 17 | The evidence vocabulary and what is left of the job protocol |

`subs/harness/src/tests/helpers/analysis.ts` builds the two submissions a
test writes. Nothing there simulates a transition: each one goes through the
same judge, the same schema and the same rules an agent's would.

### The recovery table, extended

Iteration 4's ten rows stand. Four are added, each one test of
`run-recovery.test.ts`, frozen at the boundary through the `afterWrite` hook,
with the lock replaced by one a gone process holds.

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `work-item-started` | Loads the run and appends `job-interrupted` | No second start, and nothing delivered |
| `hypotheses-delivered`, with the work item's and the hypothesis's files removed | Rewrites both from the log, then interrupts | Nothing is delivered a second time |
| `outline-revised`, with the outline removed | Rewrites revision 1 from the log, then interrupts | No revision 2 |
| `work-item-completed` | Appends the interruption only | The item stays completed and is not started again |

## 10. The measured size of the owners this iteration changed

From `ramify measure`, with the daemon stopped.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `harness`, after iteration 4 | 45 | 345,891 | 33 | 269,270 |
| `harness`, now | 44 | 308,056 | 29 | 249,237 |
| `web`, now | 10 | 19,159 | 5 | 10,430 |
| `ramify-agent` (root), now | 2 | 4,576 | 1 | 1,694 |

`harness` is smaller than it was: this iteration removed more than it added.
`evidence`, `ledger`, `agent` and `agent/pi` are unchanged in size; no file
of theirs was touched.

## 11. Deviations from the brief, with reasons

1. **`citationSchema` in `interfaces/protocol/evidence.ts` is the analysis's
   citation, not Plan 1's.** The brief says to move `citationSchema` there.
   Plan 1's was `{ kind, path, line }`, a claim about a file of the project;
   the analysis, the hypotheses and the outlines cite a module of a view,
   optionally a file and a symbol in it. Both could not stay without two
   citation types in one file. The map's died with the map, and the one
   citation in `evidence.ts` is the one every record here uses, which is what
   the brief's "a module or a symbol an architect cites must exist in the
   view it cites" requires.
2. **The module-tree query moved to `evidence.ts` with them.** The brief
   removes `interfaces/protocol/maps.ts` and keeps `module-tree.tsx`. The
   module tree is not a map query — it is `GET /api/v1/project/modules` over
   the architect view — so it moved to the file that holds the rest of the
   evidence vocabulary rather than dying with the map.
3. **`module-tree.tsx`'s `TouchedModule` and `Weight` are now the web
   module's own.** They were the map's, and the component that stays needs
   them. They are a presentation choice of that page, not a record of the
   harness, so they are declared where the component is; iteration 11 feeds
   them from the run's projections.
4. **`request-completion` carries the outline.** The proposal's member is
   `{ kind, summary }` and the outline arrives with `assign`. This iteration
   offers no `assign`, and the brief requires `request-completion` to commit
   an outline with its decomposition and rationale, so the member carries an
   `OutlineBody`. It omits `hypothesesSeen`, which the harness fills from
   what it delivered, as rule 9 requires. That is a revision of the
   [proposal](../core-records.proposal.md#agent-submissions) and is recorded
   as one, beside the brief's own revision of `Hypothesis.change`.
5. **`outline-revised` commits every outline revision, revision 1
   included.** The proposal's event list gives `outline-revised` the outline
   and `iteration-assigned` the assignment. With no `assign` there is no
   other event that could commit revision 1, and one event for every revision
   keeps recovery one loop. A revision-1 outline has an empty
   `revisionReason`, as its record says.
6. **The write scope was widened to `subs/harness/src/run/` and the package
   root's `README.md` and `src/main.ts`.** The brief's scope omits `run/`,
   but its "Established" list requires four new run-log events, which live in
   `run/log.ts`, and a driver that takes work items, which lives in
   `run/service.ts`; `run/analysis.ts` moved into `analysis/`, `run/inputs.ts`
   absorbed the helpers `mapping/procedure.ts` held, `run/records.ts` was
   repointed at `evidence.ts`, and `run/snapshot.ts` now counts work items
   instead of answering zero. `src/main.ts` calls `startServer`, whose
   options changed. `README.md` at the package root is the root module's
   README, whose responsibility changed. Nothing else outside the brief's
   scope was touched.
7. **The new records live with the phase that creates them, not in
   `run/records.ts`.** `Hypothesis` and `RegistryEntry` are in
   `analysis/records.ts`; `WorkItem` and `WorkItemOutline` are in
   `work/records.ts`; each file carries its own layout paths and schema
   descriptors. Iteration 4 put its records in `run/records.ts` because
   persisting them is the run's concern, which is still true of the layout;
   putting these there instead would have widened the one file the brief
   leaves out of scope, and keeping each record beside the phase that derives
   it is what made `analysis/accept.ts` a pure function.
8. **`work/committed.ts` takes a structural line type, not the ledger's
   `LedgerEntry`.** `harness/ledger` does not expose `LedgerEntry`, and
   widening a child's exposure for a reader that only wants the record bodies
   would have been the wrong change. The reader states what it needs
   structurally, which is also what makes it a projection over the log and
   nothing more.
9. **The exhaustion bound is the original attempt plus
   `repairRoundsPerWorkItemGate` repairs, so four gate attempts at the
   default of three.** "Three failed repairs of the same iteration is
   evidence about the assignment" reads as three repairs after the first
   attempt, not three attempts in all.
10. **`unresolved` fails the run with `unresolvable-requirement`.** The
    vocabulary has no reason of its own for it, and this is the one that says
    what happened: the request has no provider that can satisfy it as stated.
    It also gives that union value its first producer.
11. **`ramify materialize` is called for a work item's API view even where
    the run has no architect view.** `apiViewsOf` answers the reason instead
    and the prompt says so, rather than claiming the module may import
    nothing. Run tests get the stub `ramify`, so their local architects are
    told the view could not be materialized, which is the honest message.

## 12. What the next iteration must know

- **Every run-log write still goes through `RunService.write`,** which
  serializes on `run.mutex` and builds the event inside the lock. Two
  concurrent appends disagreed on the sequence before it existed, and a log
  whose sequences disagree does not load. The work phase adds four
  transitions and every one of them goes through it.
- **One invocation goes through one path.** `RunService.runInvocation` builds
  the `Invocation`, commits it before `startSession`, runs the session with
  the judge, records the observations, settles, and closes the invocation. An
  iteration that adds a role supplies a package, a prompt, a schema and its
  rules, and gets the rest — including rule 10's steps 3 to 6, the context
  and compaction observations and the coverage gaps — for nothing. It returns
  the session's `ref`, which is how a continuing session continues.
- **A local architect is a continuing session, one per work item.** Each turn
  is its own `Invocation` with its own ID and an incremented `attempt`, and
  every turn after the first starts with `{ mode: 'continue', ref }`. The
  scripted fake ends a session when a submission is accepted, which is what
  makes each turn a new session start from the same history.
- **`runCheckpoint` still refuses any selection that is not `all-project`.**
  The `work-item` checkpoint is `all-project`, so it runs; `iteration` and
  `contract` still need iteration 6's resolver.
- **Iteration 6 must still settle whether a run is ever resumed in place.**
  Iteration 4 left it open and this iteration did not settle it: a run is
  `interrupted` on load and never resumed. With work items the question has
  more weight — an interrupted run leaves closed work items closed, which its
  successor would have to honour rather than repeat.
- **Nested-package discovery still walks to depth 5, not the plan's 4.**
  Iteration 4 flagged it and it did not fall in this iteration's scope. It is
  still flagged, and the constant still says so where it is defined.
- **The commands endpoint is gone and iteration 11 must put one back.**
  `POST /api/v1/commands` and the `Command` union went with `start-mapping`
  and `approve-map`. `interfaces/protocol/runs.ts` holds `start-run` and is
  still not exposed to the parent. Iteration 11 adds the endpoint, the run's
  queries, its projected events and the Run page.
- **`scripts/real-session.ts` has no command to send.** It posted
  `start-mapping` to `/api/v1/commands`, which no longer exists. It is
  outside this brief's write scope, so it was left as it is; it type-checks
  and it is not run by any test. Whoever restores the command endpoint, in
  iteration 11, should point it at a run — or iteration 12 should replace it
  with the live trial that supersedes it.
- **`src/cli.ts` still parses `--agent` and `--model`,** which `startServer`
  no longer takes. `src/main.ts` prints that the flag is accepted and not
  used yet. `src/cli.ts` and its test are outside the brief's scope and were
  left alone; the flag becomes real again when a client can start a run.
- **Do not let a run test make a resident Ramify daemon analyse a temporary
  project.** Iteration 4's warning holds unchanged, and the work phase makes
  it sharper: a local architect asks for an API view of its own module, so a
  run test with a real `ramify` would materialize inside the temporary copy.
  `helpers/runs.ts` still gives run tests a `ramify` that answers its version
  and nothing else, and their local architects are told the view could not be
  materialized.
- **A test that polls a log being appended to must tolerate a torn last
  line.** `run-recovery.test.ts` read a partial line under full-suite
  parallelism and failed once; its reader now stops at the first line that
  does not parse, which is what the ledger does on load.
- **Stop the daemon before the materialization an iteration reports.** The
  wait-limit behavior still costs a view its dependency facts.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale**, as iterations 1 to 4 recorded. `npm run check:self` does not
  read them.

## 13. Not done, with the reason

- **No pi session was run.** This iteration is not one of the three the
  iterations README permits to touch pi, and its tests use the scripted fake
  throughout. Whether a real provider accepts the `LocalArchitectSubmission`
  union discriminated on `kind` is still open, beside iteration 3's question
  about the analysis schema; iteration 12's live trial settles both.
- **No iteration is assigned and no engineer runs.** The brief excludes them:
  no engineer, no write tools, no global fork, no contract. A work item this
  iteration closes is one whose goal existing behavior already satisfies. A
  `staged` outline is accepted and recorded, and nothing consumes its stages
  until iteration 6.
- **The run has no HTTP surface, and the web shows plans only.** As the brief
  says: between iteration 5 and iteration 11 the web shows plans. A run is
  driven by `RunService.execute` and watched through the file system.
- **Global compaction has no producer.** X2 names initial, global and local
  compaction. The global fork arrives in iteration 8; its context policy
  forbids compaction and that row is asserted here, so the case is complete
  for the two roles that exist and the third is named rather than claimed.
- **`PlacementDecision` has no directory yet.** M1 asks that hypothesis,
  decision, work and progress records stay visibly distinct. Three of the
  four exist; `decisions/` arrives with iteration 8, and the test asserts the
  three that do.
