# Plan 13 implementation results

## Iteration 1 — contract alignment and exact capture records

**Starting revision:** `4adc79f4d22319801ed383760b7fab14d09a632d` on
`feat/plan13-evidence-nonfunctional`. The execution worktree had no dirty
files before this iteration. The reviewed plan, analysis, glossary and
principles input edits were already in the starting commit. The main
`/ramify` checkout was not changed.

The [contract appendix](contract-appendix.md) fixes owner operations,
exposures, exact document and passage identity, immutable byte storage,
catalog order, selection append recovery, assessment and candidate binding,
deviation origins, event order and old-run reads. Exactly two untagged harness
children now own the new domain schemas: `plan-evidence` and `nonfunctional`.
The harness owns composition records and a `run-policy/4` default of three
non-functional rounds. Earlier `run-policy/3` records and single-plan
references remain readable; absent non-functional evidence projects
`unavailable`. The web's exhaustive role display map was extended for the
three recorded roles. Completion wording in the harness principles,
CheckFinding principles, acceptance architecture and glossary now separates
automated completion from revision-bound merge readiness.

**Baseline before edits:** `npm run worktree:prepare` completed. From
`ramify-agent/`, `npm run type-check`, `npm run build:web` and
`npm run check:self` passed. The self-check covered 10 owners and 471 files,
with 0 errors, 0 warnings and 287 analysis limits. The existing full
`ramify-agent/audit/ramify-agent-suite.request.json` audit ran in the clean
worktree on the starting commit: run
`88cb2514-2fdf-49ce-bf2e-cd64fefd665f`, source tree
`b7c344292c09dce5d621d9738099dfa2a198cd08`, overall **pass**, all five
checks passed in 217.137 seconds. Its machine report is
`/tmp/plan13-coordination/baseline-audit.json` and published audited run ref is
`refs/audited/runs/2026-09-25T12-30-30Z-4adc79f4d`.

**Focused iteration evidence:** Five Vitest files passed, 56 tests total:
exact multi-document manifest and passage fixtures, changed hash and invalid
passage rejection, stable catalog ID checks, assessment coverage and candidate
tree identity, an old single-plan record and terminal event replay, run policy
and protocol regressions. `npm run type-check` and `npm run build:web` passed.
The exact focused command, run from `ramify-agent/`, was:

```sh
npx vitest run subs/harness/subs/plan-evidence/src/tests/contracts.test.ts subs/harness/subs/nonfunctional/src/tests/contracts.test.ts subs/harness/src/tests/plan-evidence-compatibility.test.ts subs/harness/src/tests/run-policy.test.ts subs/harness/src/tests/protocol-contract.test.ts
```

`npm run check:self` passed across 12 owners and 478 source files, with 0
errors, 0 warnings, 0 denied accesses and 297 analysis limits. The increase
in owner count is the two new children. The harness's generated foreign API
view was refreshed with `node_modules/.bin/ramify materialize --view api --from subs/harness --root .` (revision 1, two targets, 744 entries).
The complete suite was run only by
the baseline audit before source edits; no post-edit full audit is claimed.

**Handoff to iteration 2:** Use
`plan-evidence/src/interfaces/contracts.ts` for captured document, passage and
catalog validation, `runLayout.documentManifest` and
`runLayout.documentBytes` for the immutable files, and the appendix's
byte-file effect and recovery order. Extend `run/inputs.ts` and plan discovery
without changing the old root-plan read path. Record the actual principles
scan in the same manifest's `principlesScan`. New cross-module imports require
a refreshed generated API view. Catalog extraction and incorporation
acceptance are iteration 3 consumers; the added records/events are schemas
only until those paths are implemented. PE01 and PE14 have schema/replay
evidence here; filesystem discovery, semantic judgment, live candidate
binding, browser behavior and final merge readiness remain unverified until
their assigned iterations. No CheckFinding was opened in this iteration.

## Iteration 2 — capture plan and principles evidence

**Starting revision:** `47f3dd66` (iteration 1 handoff). The independent
non-functional pure-provider commit `dd0bc2df` landed while this iteration
was in progress; it does not implement iteration 2 behavior. The execution
worktree was clean at the handoff, and `/ramify` was not changed.

The `plan-evidence` child now discovers the root plan, local text in its plan
directory, linked local text and project-owned `*.principles.md` files. It
resolves relative paths, including in-project `..` and symlinks, once by
canonical path; rejects project escapes and invalid UTF-8; records missing
links with byte offsets; and reports unreadable principles as partial scan
coverage. Independent nested project roots are excluded from that scan.
Markdown inline, reference-style and HTML links are supported. Discovery
does not decide whether linked text is binding.

Each new run stores exact bytes in `input/plan.md` and immutable companion
files, with `input/documents.json` binding their paths, sizes and SHA-256
hashes. The input manifest points to that file. Atomic exclusive writes are
verified before `job.json` and `job-started` publish the run. Recovery refuses
an incomplete prefix and reconstructs a missing manifest event only after
all recorded bytes verify. Plan documents have `revision.dirty: null` because
the implementation-source Git status excludes `plans/`; their byte hashes
are authoritative. The appendix now states this publication order.

The shared passage resolver retains exact whitespace and reports unknown
documents, invalid ranges and changed bytes explicitly. Analysis reference
validation uses the captured document set, and scope review reads its cited
passages through the same resolver; old root-only references still read as
`doc-001`. The run revalidates the captured corpus before analysis acceptance,
approval, scope review and both sides of the final gate. A companion changed
during the gate cannot lead to `job-completed`.

The scenarios child can extract an explicit ordered document selection with
one run-wide `ps-NN` sequence. Extracted scenarios and accepted origins carry
document identity; citation matching requires that identity, so equal headings
and line ranges in different files do not satisfy each other. Legacy records
without a document still mean the root. Scenario content hashes retain their
source-text meaning. Iteration 3 will accept the architect's incorporation
judgment before supplying the selected documents to this extraction path.

**Verification:** 16 focused Vitest files passed, 196 tests. The cases cover
cycles and duplicate references, reference-style and parenthesized links,
missing files, invalid text, in-project and escaping symlinks, nested project
principles, exact passages, equal scenario ranges in two documents, approval
refusal after a companion edit, mutation during the final gate, and both
startup recovery prefixes. `npm run type-check`, `npm run build:web`, and
`npm run check:self` passed. The self-check covered 12 owners and 486 source
files with 0 errors, 0 warnings, 0 denied accesses and 297 analysis limits.
The focused command, run from `ramify-agent/`, was:

```sh
npx vitest run subs/harness/subs/plan-evidence/src/tests subs/harness/subs/scenarios/src/tests subs/harness/src/tests/analysis-scenarios.test.ts subs/harness/src/tests/analysis-submission.test.ts subs/harness/src/tests/review-stop.test.ts subs/harness/src/tests/plan-deviations.test.ts subs/harness/src/tests/plan-evidence-compatibility.test.ts
```

The baseline full suite was already run by audit; no new full-suite audit is
claimed for this intermediate commit.

**Handoff to iteration 3:** Use the fixed manifest and byte reader in
`run/document-inputs.ts`, `resolvePlanReference` for citations, and
`extractDocumentScenarios` only after accepted incorporation selects the
binding scenario documents. Missing links remain `unjudged` until the
architect's required/unclear/advisory judgment is accepted. The initial
architect still receives the root plan briefing; focused access to all
captured sources and the catalog judgment are iteration 3 work. Later
assignment authority must add every captured plan path to protected files;
the current `deniedFiles` service path protects scenario files but does not
yet include this manifest's plan set. No semantic classification or binding
force was inferred by capture. No CheckFinding was opened.

## Iteration 3 — fixed catalog, incorporation and analysis review

**Starting provider revision:** `9eb4d46fe572998a380831474b4efd94ec6ec7ab`.
The worktree was clean at release. Parallel preparation commits added later
pure context-selection, candidate-tree and readiness code; iteration 3 did
not edit those files.

The initial architect now receives a compact index of captured plan and
principle files, immutable read paths, missing-link locations and scenario
candidates. It reads focused source passages and submits a judgment for every
plan document and missing reference. Only incorporated documents feed the
existing scenario form rules. Required missing text rejects analysis before
acceptance; unclear gaps remain nonblocking and the review shows the exact
referring excerpt, source path and byte range.

The submission has an explicit catalog, including an explicit empty array.
It contains near-verbatim passage references, separate classification,
stated or inferred conditions and uncertainty, with no agent-assigned IDs.
`plan-evidence` sorts by captured document and byte order, verifies every
quote against immutable bytes and assigns separate `nfr-001` and `adv-001`
sequences. The harness stages immutable content-addressed catalog and
incorporation files, then the one `analysis-accepted` event binds their paths
and hashes beside the functional records and counts. Rejection commits none
of these. Old runs without accepted evidence project `unavailable`; an
accepted empty catalog projects `available` with zero items.

The existing analysis review now shows NFR passages, conditions, uncertainty,
source hash and byte range. Advice and incorporation decisions are in a
separate expandable section; advice has no review or satisfaction count.
The browser witness uses an actual disk-backed harness analysis projection
rendered through `PlanAndEntries` in Chromium. It passed 11 checks at desktop
and mobile sizes, including NFR, unclear-source, separate-advice and
empty-versus-unavailable states. This is a component-browser witness, not a
live HTTP or agent-model acceptance run; the browser artifacts were refreshed
while this iteration's source revision was dirty and should be rerun after
the final integration revision.

**Verification:** six focused Vitest files passed, 92 tests, covering exact
catalog IDs, required and unclear missing references, incomplete and
duplicate incorporation, companion scenario incorporation, rejected source
quotes, review projection and prior review-stop behavior. A separate
crash-prefix test passed: staging evidence before the accepted event leaves
an interrupted run with no accepted analysis on recovery, and a fresh run
can accept changed evidence without colliding with the orphaned file.
`npm run type-check`, `npm run build:web` and `npm run check:self` passed; the
self-check covered 12 owners and 497 source files with 0 errors, 0 warnings,
0 denied accesses and 298 analysis limits. The exact focused commands were:

```sh
npx vitest run subs/harness/subs/plan-evidence/src/tests/contracts.test.ts subs/harness/src/tests/analysis-plan-evidence.test.ts subs/harness/src/tests/analysis-scenarios.test.ts subs/harness/src/tests/analysis-submission.test.ts subs/harness/src/tests/review-stop.test.ts subs/web/src/tests/run-page.test.tsx --maxWorkers=2 --testTimeout=15000
npx vitest run subs/harness/src/tests/run-recovery.test.ts -t 'crash after immutable analysis evidence' --maxWorkers=1 --testTimeout=15000
npx tsx scripts/browser-acceptance/plan13-review.ts
```

A broader seven-file command that included the entire recovery suite was
stopped after 90 seconds without a result; no full post-edit suite pass is
claimed. The later plan audit remains the executable whole-run gate.

**Handoff to iteration 4:** `analysis/evidence.ts:readAcceptedEvidence` reads
the authoritative accepted event and verifies both immutable files and the
captured corpus. Use its explicit available/unavailable result for the
one-time selector; do not infer an empty catalog from an absent record.
`runLayout.catalogVersion` and `incorporationVersion` are the immutable paths.
The accepted catalog is fixed; assignment delivery may cite its IDs but may
not add or reclassify items. The current harness recovery policy interrupts
an in-flight run after a crash; this iteration did not add same-run resume.
No CheckFinding was opened.

## Iteration 4 — work-item orientation and source selection

**Starting revision:** `1fd20542` after the iteration 3 handoff. The local
architect now makes a dedicated, assignment-free orientation submission for
each new work item. Its full briefing and accepted orientation are stored as
an immutable, hashed packet. A foreground, read-only context-selector fork
receives that packet, the verified accepted catalog and immutable principle
index. The harness validates examined, selected and unavailable IDs and exact
passages, then writes content-addressed selection and package files before
recording their paths and hashes. A principle is cited by captured `doc-NNN`
ID with its exact passage. Missing or invalid output exhausts the captured
retry bound and fails before assignment. Source changes before selection,
during selection or before delivery refuse the package.

The selected package is appended to the parent with a deterministic key.
Recovery replays a pending append by the same key and records its actual
outcome without rerunning selection. Every organizing invocation also receives
the exact recorded package in its prompt, including a fresh invocation when
the parent session is lost. A prompt-bound event names the invocation,
destination session and package hash separately from the append outcome.
Old runs without accepted evidence retain their earlier path.

**Verification:** Five focused Vitest files passed, 52 tests. New runtime
cases cover a selected NFR and advice retaining exact captured passages,
one orientation and selection, invalid selector output failing within the
retry bound, source mutation during selection, and a lost parent session
receiving the same package in a fresh prompt. The composition recovery table
passes the pending append and all other 28 boundary rows. `npm run type-check`,
`npm run build:web` and `npm run check:self` passed; self-check reported 0
errors, 0 warnings, 0 denied accesses and 298 analysis limits. The focused
command was:

```sh
npx vitest run subs/harness/src/tests/context-selection-runtime.test.ts subs/harness/src/tests/context-selection-submissions.test.ts subs/harness/src/tests/context-selection.test.ts subs/harness/src/tests/composition-recovery.test.ts subs/harness/src/tests/placement.test.ts --maxWorkers=1 --testTimeout=10000
```

The full post-edit audit remains iteration 9's gate. Recovery of a committed
pending append is exercised; a process interruption before the orientation
or selector phase still interrupts the ordinary run and is not claimed as a
same-run resume. This iteration does not claim live assignment citation or
engineer/contract delivery; those are iteration 5 consumers of the recorded
selection.

## Iteration 5 — assignment source delivery and review binding

**Starting revision:** `4bf4ecb5` after iteration 4 and its context probe hardening.
The preparatory pure delivery and briefing commits were `aba2be80` and
`58cbddad`. The local architect now submits explicit selected evidence IDs
for each new assignment. The harness validates that each ID was selected,
records the assignment-specific citation and full selection package hash in
`assignmentContext` in the same transaction as the assignment, and retains
optional fields so earlier persisted assignments remain readable. An
engineer-requested contract iteration inherits its requesting assignment's
citation and package binding; it does not select again.

Every fresh or continued engineer and contract briefing reconstructs its
assignment-cited passage subset from the accepted catalog and captured bytes.
The full work-item selection stays the authority; the derived delivery hash
identifies the subset. The brief labels source path, revision, exact quote,
classification, stated/inferred conditions and uncertainty without changing
the architect's approach. A changed source, altered package, absent citation
record or stale assignment is refused before the implementation invocation.
The coordinator's complete catalog is unaffected by whether an assignment
cites an NFR or advice.

Scope review requests now bind the full selection hash and derived cited
briefing hash along with exact plan-reference inputs. The plan-reference
resolver reads the captured multi-document source; the former single-file
parser remains only for earlier runs without a document manifest. If input
capture fails at request creation, the request records `inputsUnavailable`
and its attempt settles as not verified; it is never treated as a review of
an empty requirement set. On attempt start, all input hashes are checked
again. Old review requests remain readable with the optional fields absent.

**Verification:** Ten focused Vitest files passed, 72 tests. The new harness
witnesses show a completed run with one selected NFR, uncited advice retained
in the catalog, an atomically recorded assignment context, and identical
quoted NFR/classification/condition in fresh and continued engineer prompts
(actual start modes `fresh`, `continue`). A contract-needed iteration inherits
the cited ID and its fresh contract prompt carries the same quote. A separate
harness run changes the captured plan after selection and refuses assignment
before an engineer starts. The pure contract briefing test checks that a
failed-gate continuation retains the source section; the live contract
repair/session continuation was not exercised in this iteration.
Existing local-architect and review suites were updated for the orientation
session, exact multi-document reference, bound assignment-source input and
recorded package inheritance. The exact aggregate command was:

```sh
npx vitest run src/tests/iteration-source-delivery.test.ts src/tests/assignment-source-evidence.test.ts src/tests/context-selection-delivery.test.ts src/tests/context-selection-runtime.test.ts src/tests/local-architect-submission.test.ts src/tests/review-questions.test.ts src/tests/review-attempts.test.ts src/tests/review-stop.test.ts src/tests/contract-scheduling.test.ts src/tests/iteration-gate.test.ts
```

`npm run build:web` passed. `npm run check:self` passed over 12 owners,
514 source files and 41 resources with 0 errors, 0 warnings, 0 denied
accesses and 298 analysis limits. `npm run type-check` passed after the
concurrent iteration 8 CheckFinding UI branch restored its new union handling.
The full post-edit suite and final browser audit remain the later plan gate.

**Handoff to iteration 6:** The accepted catalog is complete independent of
assignment citations. `assignmentSource` in the harness reads the event-bound
selection, verifies accepted bytes and assignmentContext, and returns a
separate derived delivery hash. The scope review request records both source
hashes and explicit unavailability. Coordinator assessment must enumerate
all NFR IDs from the accepted catalog, including those no assignment cited;
assignment delivery does not discharge or assess one.

## Iteration 6 — candidate-bound non-functional assessment

**Starting revision:** `0e7cd044` after iteration 5. The harness now enters
non-functional assessment after ordinary work and review settlement, including
the zero-entry path. It re-renders scenarios after writer settlement and uses
an isolated Git index to record the exact eventual whole-repository tree as a
prepared candidate. The accepted catalog is read from immutable, hash-checked
evidence. A nonempty catalog starts a read-only coordinator with the complete
NFR set; validation requires exactly one result per fixed NFR ID and checks a
fresh tree preview after the invocation. An empty catalog commits an explicit
`results: []` assessment with the truthful `harness:empty-catalog` provenance.

Each candidate, assessment and satisfied round is co-committed with its event.
The replay helper authenticates event-to-record IDs, full candidate fields,
coverage, transition order and closed outcomes, preserving valid incomplete
prefixes separately from malformed ones. Before the final gate, inside its
commit effect, and after audit, the harness compares the live tree with the
assessed tree. It reads the audited commit tree, records
`candidate-bound-to-gate` only for an exact match, and refuses completion if
source changes during final verification. The existing gate verdict remains
authoritative. This iteration records unresolved assessments but ends those
runs not verified; iteration 7 supplies investigations, repair and bounded
reassessment rather than treating an unresolved result as satisfied.

**Verification:** The aggregate focused command passed 8 files and 39 tests:

```sh
npx vitest run subs/harness/subs/evidence/src/tests/candidate-tree.test.ts subs/harness/src/tests/helpers/preview-git.test.ts subs/harness/src/tests/nonfunctional-phase.test.ts subs/harness/src/tests/nonfunctional-submissions.test.ts subs/harness/src/tests/nonfunctional-run.test.ts subs/harness/src/tests/plan13-composed-functional.test.ts subs/harness/src/tests/run.test.ts subs/harness/src/tests/review-lifecycle.test.ts
```

The real-Git witness covers an empty catalog and exact audited commit tree;
another mutates source during the final gate and confirms completion is
refused. A scripted composition covers two NFRs when only one was selected
for functional work and confirms the coordinator assesses both. The Git
provider witness covers untracked files, deletions, nested working directories
and preservation of the user's index. `npm run type-check`,
`npm run build:web` and `npm run check:self` passed; self-check reported
12 owners, 518 source files, 42 resources, 0 errors, 0 warnings and 299
analysis limits. The full post-edit suite and audit remain the later plan gate.

**Handoff to iteration 7:** The current unresolved-result terminal path is an
interim refusal, not exhaustion of three permitted rounds. Recovery still
interrupts runs rather than continuing this phase. Iteration 7 must add
durable phase and repair-assignment markers, same-run phase continuation,
sequential investigation, project-wide guarded repair from a module `src/`
working directory, complete reassessment after repair, and bounded deviation
creation. It must also protect every captured source document in engineer
guards and retain final tree revalidation after slow audit.

## Iteration 7 — bounded repairs and same-run phase recovery

**Starting revision:** `77727d8a` after iteration 6. A durable phase marker
opts in only runs whose ordinary work and reviews have settled. The coordinator
can make sequential read-only investigations, with each investigation covering
at least one previously uninvestigated unresolved NFR. It may authorize one
repair assignment in a round. The assignment is committed before its child
starts and names the assessed candidate, target NFRs, and starting module.
The repair engineer starts in that module's actual existing `src/` directory,
has project-wide source scope, and remains subject to the write guard. Every
captured plan, companion, linked document and principles file joins the
guard's denied set alongside tracked feature files and project configuration.
After a settled repair, scenario rendering and a fresh Git preview prepare a
new candidate, and the coordinator reassesses the entire fixed NFR catalog.
Round replay checks assignment authority, target coverage, candidate binding
and the three-round bound; a third unresolved round closes exhausted. The
iteration 8 CheckFinding transaction is integrated at the exhausted close and
before the final gate as a coordinated follow-on change.

Recovery continues only a phase-marked run. Before external effects or agent
work, it authenticates the fixed catalog and captured documents, prompt
package hashes, the round bound, ordinary-work settlement, and every prior
writer's unique confirmed release. It resumes a committed repair assignment
without creating another, reconciles a durable accepted child result before
`nonfunctional-repair-committed`, and reads a committed reassessment rather
than repeating it. An uncertain writer fails closed. Final-gate restart uses
the recorded attempt and candidate binding; a pending keyed commit is replayed
once. A source tree change during downtime, assessment, or final verification
refuses the candidate, including after round three.

**Verification:** These focused commands passed:

```sh
npx vitest run subs/harness/src/tests/nonfunctional-phase.test.ts subs/harness/src/tests/nonfunctional-submissions.test.ts subs/harness/src/tests/plan13-composed-functional.test.ts subs/harness/src/tests/run.test.ts subs/harness/src/tests/plan-deviations.test.ts
npx vitest run subs/harness/src/tests/nonfunctional-repair.test.ts subs/harness/src/tests/nonfunctional-recovery.test.ts
npx vitest run subs/harness/src/tests/nonfunctional-recovery.test.ts -t 'a final gate resumes'
npx vitest run subs/harness/src/tests/nonfunctional-recovery.test.ts -t 'refuses downtime drift'
npx vitest run subs/harness/src/tests/plan-evidence-required-runtime.test.ts
npx vitest run subs/harness/src/tests/nonfunctional-recovery.test.ts -t 'round three exhausts'
npx tsc --noEmit --pretty false
npm run build:web
npm run check:self
```

The real-Git repair witness starts with two NFRs, investigates the undetermined
one before a targeted repair, writes two modules from the selected module's
`src/`, denies an attempted plan write, and reassesses both NFRs on the
post-repair candidate. Its second action prompt names the actual accepted
investigation submission. A full-RunService test rejects a required missing
companion before analysis acceptance. The recovery witness covers phase start,
candidate preparation, assessment, repair assignment, accepted child result, repair
commit, reassessment, three final-gate checkpoints, an unconfirmed writer,
and an assigned repair whose tree changes during downtime: one run resumes
where safe and otherwise fails closed. The round-three witness uses real Git
and an audit worktree, then changes source during final verification and
observes `inputs-changed` with no completion. The current self-check completed
12 owners, 523 source files and 43 resources,
with 0 errors, 0 warnings and 299 analysis limits. The full post-edit suite
and audit remain the plan's later gate.


## Iteration 8 — deviations and merge readiness

The harness records each unresolved NFR after the final exhausted round as an
exact-source deviation and run-owned CheckFinding in one ledger transaction.
The record names the actual assessment, coordinator invocation, candidate,
original passage and source hash, plus the proposed alternative or uncertainty.
It creates no work item or contract request. Recovery verifies an existing
record before skipping it. Both normal execution and phase resumption use the
same transaction path before the final gate.

Passing gates permit completion pending user review. The versioned harness
projection derives merge readiness from the closed assessment phase, accepted
catalog, final candidate/audit binding and current user decisions. The web
renders that verdict and exact source passage. Acceptance changes review
standing without rewriting the gate; revocation returns the deviation to
pending review, and rejection retains a follow-up reason. An optional separate
audit-overall record must agree when present; the durable gate attempt itself
must carry its passing verdict, audited commit and audit evidence.

**Verification:** `nonfunctional-deviation-runtime.test.ts` passed all three
real-Git cases at the default three-round limit: pending/accept/retry/revoke/stale
revision, rejection with a fresh service/ledger rebuild, and a failed final test
gate that remains failed after acceptance. `nonfunctional-submissions.test.ts`
passed eight tests after the action prompt gained the current assessment,
permitted next step and actual investigation report paths. The composed
functional trial queries readiness from the real harness projection; its root
and companion document contribute two NFRs while the engineer cites one. The
empty-catalog runtime witness also reports ready after a real audit-worktree
execution binds the exact assessed tree.

The Chromium readiness witness passed 14 checks over five actual run-query
projections: pending, accepted, rejected, gate-failed and source-unavailable.
It opened the actual CheckFinding history and displayed its complete source
quote/path. This is a component-browser witness using real ledger projections,
not a live HTTP or model run. The initial artifact was generated while source
was dirty; iteration 9 reruns it from the committed implementation. Main and
browser TypeScript checks passed. Commands include:

```sh
npx vitest run subs/harness/src/tests/nonfunctional-deviation-runtime.test.ts --maxWorkers=1
npx vitest run subs/harness/src/tests/nonfunctional-submissions.test.ts --maxWorkers=1
npx tsx scripts/browser-acceptance/plan13-readiness.ts
npm run type-check
```

**Regression corrections:** older scripted Git fixtures now declare exact final
candidate previews and audit-tree answers; they continue to reject unstated
operations. The composed review fixture gives a queued attempt a smaller budget
than its settlement window and explicitly observes concurrent readers. A
revisited work item keeps its immutable context selection but opens a fresh
architect session when the orientation session has finished. The existing
contract-revision composition reproduces and verifies that correction without
reselection. The five-file composition/recovery group passed 54 tests, the
contract/gate/integration group passed 16, and the earlier recovery suite passed
32. These focused results do not replace the final whole-suite audit.

## Iteration 9 — composed acceptance and delivery

Implemented in the isolated `feat/plan13-evidence-nonfunctional` worktree at
`/tmp/ramify-plan13-evidence-nonfunctional`, coordinated through Sol subagents.
The main checkout's HEAD, status and captured planning inputs were verified
unchanged. The implementation adds only the two planned child owners:
`plan-evidence` owns captured source identity and exact passages;
`nonfunctional` owns pure assessment and round rules. Context selection stays
in the harness, and the existing harness remains the only durable writer.
The four scoped refactors are shared passage resolution, document-qualified
scenario identity, explicit deviation origins and exact candidate preparation.
No new scheduler, generic workflow layer or separate persistence service was
introduced.

### Composed trials and measured limits

The functional trial uses a root plan plus a companion, two NFRs and one
advisory item. Its engineer cites one NFR; the coordinator assesses both,
including the uncited companion NFR. The ledger completes one round, binds
its final passing gate to the assessed candidate and projects `ready`.
[`functional-composition.json`](evidence/functional-composition.json) records
captured document/catalog/selection/assignment hashes and candidate identity.
The runner supplied implementation revision `a9a66dc1` and `dirty=false`; the
process-guarded test does not independently verify Git status. All six recorded
file hashes remained stable. Its agent, Git and checks are scripted, so the
recorded all-`a` tree is fixture data.

The NFR-only structural trial uses real Git. It starts with two unresolved
NFRs, investigates the undetermined one, authorizes one repair targeting that
NFR, edits two modules and reassesses both NFRs on the changed candidate. A
protected plan write is refused. It closes one round after two assessments.
The real ledger preserves investigation, assignment, repair, candidate,
assessment and final-gate ordering. Check outcomes are supplied by the direct
check adapter; this trial does not claim an actual project build.

The exhausted trial uses real Git and three closed rounds/assessments for one
NFR, followed by a passing gate and one pending deviation. Accepting that
revision yields `ready`; revoking it returns to pending; rejection survives a
fresh ledger rebuild. A failed project test gate stays failed after acceptance.
Its browser fixture records the exact catalog, candidate, tree, gate and
current decision. The reported 87 ms performance observation is scripted data,
not a benchmark measurement.

| Measurement | Value and denominator |
| --- | --- |
| Functional catalog | 2 NFRs, 1 advisory item, 2 captured documents |
| Functional assessment coverage | 2 of 2 NFRs; advice excluded |
| Functional human semantic review | 0 of 2 NFRs; unattended scripted run |
| Functional selection | 1 of 2 NFRs cited; uncited NFR still assessed; no relevance-recall judgment |
| Functional quoted package | 982 UTF-8 bytes; selected quote 46 bytes |
| Functional run | 1 round, 1 assessment, 0 repair batches, 0 pending decisions |
| Functional elapsed time | 451 ms for the scripted run, 60 ledger events; model tokens unavailable |
| Structural trial | 2 of 2 NFRs assessed twice, 1 investigation, 1 repair batch, 1 closed round |
| Exhausted trial | 1 of 1 NFR assessed in each of 3 rounds; 1 pending decision before user commands |
| Live selector fixture | 3 of 3 supplied passages selected; 1 NFR, 1 advice, 1 principle; no observed omission in that fixture |
| Live context package | 2,396 UTF-8 bytes; 1 of 1 requested exact quotes matched |
| Live context model usage | 8,756 reported tokens across 5 usage records, including cache reads |
| Live pre-work phases | 33,520 ms = 6,798 ms orientation + 26,722 ms selector; excludes harness setup |
| Live ordinary engineer | 39,015 ms, 17,613 reported tokens, 10 tool starts/finishes, 1 shell process |
| Live repair engineer | 20,768 ms, 17,236 reported tokens, 10 tool starts/finishes, 1 shell process |

No matched baseline was run for model efficiency, and these fixtures do not
establish general extraction quality, relevance recall or runtime performance.
Unavailable model usage for scripted trials is not counted as zero.

### Actual model, process and browser boundaries

The committed [context witness](evidence/real-context-witness.json) executed
actual `openai-codex/gpt-6-sol` fresh, fork and continued sessions. A keyed
append returned `appended`, then `already-present`, and the continuation
returned the exact requirement quote/classification. All six implementation
hashes from clean revision `4bf4ecb5` were compared with the integrated source
and still matched; [comparison](evidence/context-source-applicability.json).

The [module-local witness](evidence/real-module-local-witness.json) ran on clean
revision `a9a66dc1` with all seven recorded file hashes unchanged. Both actual
`openai-codex/gpt-6-sol` sessions started fresh and submitted. Actual shell
`pwd`, built-in read and write began under the chosen module's `src/`.
The ordinary session's cross-module write was denied and absent; the repair
session's was allowed and exact. Both denied writes to captured plan,
principle, scenario, configuration and outside-project paths, whose original
bytes stayed unchanged. The probe exercises pi and engineer equipment; its
Ramify hook deliberately reports unavailable. It does not establish a full
model-driven RunService or project gate.

Browser results are actual Chromium renders of real disk-backed harness
projections through the production web components. They are component-browser
witnesses, not a live HTTP workflow. The analysis review covers desktop/mobile
presentation, exact quote/classification, missing-reference notice and
empty/unavailable distinctions. The readiness witness covers pending,
accepted, rejected, failed-gate and unavailable-source states, with the actual
CheckFinding history. Its persisted fixture SHA-256 binds the screenshots
and assertions to the supplied projections.

### Acceptance case map

Paths below are relative to `subs/harness/`; browser artifacts are in this
plan's `evidence/` directory. The earlier iteration sections describe the
specific positive and negative controls.

| Cases | Executed owner/consumer witnesses |
| --- | --- |
| PE01, PE04 | `subs/plan-evidence/src/tests/discovery.test.ts`: exact bytes/hash, linked documents/cycles, missing paths and project-principle boundaries |
| PE02 | `src/tests/plan-evidence-required-runtime.test.ts`, `src/tests/analysis-plan-evidence.test.ts` and analysis browser: required rejection and unclear review notice |
| PE03, PE16 | `subs/scenarios/src/tests/extraction.test.ts`, `subs/scenarios/src/tests/form.test.ts`: incorporation, document-qualified references and global scenario IDs |
| PE05 | `subs/plan-evidence/src/tests/contracts.test.ts`, `src/tests/analysis-plan-evidence.test.ts` and browser: force, conditions and separate advice |
| PE06 | `src/tests/plan13-composed-functional.test.ts`, `src/tests/acceptance-trial.test.ts`, `src/tests/scenario-states.test.ts`: existing functional state and full final gate |
| PE07 | `src/tests/context-selection-runtime.test.ts` plus actual Sol fork/append/continue artifact: one selection and durable redelivery |
| PE08 | `src/tests/context-selection-delivery.test.ts`, `src/tests/iteration-source-delivery.test.ts`: exact fresh, continued and contract briefs; stale inputs refused |
| PE09 | `subs/nonfunctional/src/tests/rounds.test.ts`, `src/tests/nonfunctional-run.test.ts`, `src/tests/nonfunctional-repair.test.ts`: complete assessment and reassessment |
| PE10 | `src/tests/nonfunctional-repair.test.ts` plus actual Sol module-local tool witness: cross-module repair authority and protected inputs |
| PE11 | `subs/nonfunctional/src/tests/rounds.test.ts`, `src/tests/nonfunctional-deviation-runtime.test.ts`: three-round exhaustion and one source-bound finding |
| PE12, PE13 | `src/tests/merge-readiness.test.ts`, `src/tests/nonfunctional-deviation-runtime.test.ts`, existing CheckFinding command tests and readiness browser: current decisions, pending/rejected standing and gate priority |
| PE14 | `src/tests/plan-evidence-compatibility.test.ts` and merge-readiness tests: earlier records readable with unavailable NFR coverage |
| PE15 | `src/tests/context-selection-runtime.test.ts`, `src/tests/nonfunctional-recovery.test.ts`, `src/tests/run-git.integration.test.ts`: keyed delivery, crash boundaries, exact final candidate and durable replay |
| PE17 | `subs/plan-evidence/src/tests/contracts.test.ts`, `subs/plan-evidence/src/tests/references.test.ts`, assignment/analysis consumers and `src/tests/plan-evidence-review-unavailable.test.ts`: exact whitespace and explicit unavailable review input |
| PE18 | `src/tests/nonfunctional-recovery.test.ts`, `src/tests/nonfunctional-run.test.ts`: real Git/audit, post-preparation tree identity, round-three late drift and exhausted-recovery readiness |
| PE19 | `src/tests/nonfunctional-deviation.test.ts`, `src/tests/nonfunctional-deviation-runtime.test.ts`, `src/tests/plan-deviations.test.ts`: coordinator provenance and legacy decision behavior |

### Regression audit and remaining boundaries

The baseline audit passed at reviewed-input commit `4adc79f4`: 200 agent test
files passed and 2 skipped; 1,667 tests passed and 7 skipped. The first
integrated audit at `a9a66dc1` passed patch integrity, type checks, structural
checks, web production build and the parent daemon case, but failed the agent
suite: 43 files failed, 183 passed and 2 skipped; 90 tests failed, 1,685 passed
and 18 skipped. Its immutable report is
`refs/audited/runs/2026-09-25T15-25-39Z-a9a66dc10`, run
`20e88d17-1d8a-4416-9388-8284f7d2ed2f`. The failure result is retained.

The regression migrations declare the new candidate previews and audited-tree
answers per scenario, update exact event/session expectations for orientation
and selection, and bind custom scripted initial agents to captured evidence.
Fixtures still reject unstated operations. The affected focused groups are
rerun before the final audit. Final-commit audit completion is recorded in the
handoff and in the revision-bound Git audit note; it is not inferred from
focused tests or structural checks.

The final request is `audit/plan13-plan-evidence.request.json`. From the
worktree root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit \
  --request ramify-agent/audit/plan13-plan-evidence.request.json --cwd . --json
git notes --ref=audit show HEAD
```

The request covers patch integrity, all agent tests with four workers, all
agent TypeScript scopes, the agent structural check, the parent daemon test
and the web build. Live model and browser witnesses remain separate. Structural
analysis currently reports 299 coverage limits, not complete static proof.
A target module's API-view refresh exceeded available memory during discovery;
no absence claim was based on that incomplete view.

Semantic extraction and satisfaction are agent judgments; the harness verifies
identity, complete IDs, finite transitions and gate evidence. Neither a single
model probe nor a scripted satisfaction judgment establishes semantic quality.
The repair write guard retains the existing shell limitation; revision/tree
fences reject changed captured inputs or a changed final candidate. This work
adds no OS sandbox or automatic merge. A merge consumer must honor readiness
for the exact published candidate.
