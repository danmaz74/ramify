# Plan 13 contract appendix

This appendix fixes the v1 record and transition contracts for Plan 13. The
schemas live with their owners. It specifies later implementation; the presence
of a schema does not claim that a producer or consumer is already wired.

## Ownership and imports

| Owner | Public operations and contracts received by parent | Dependencies it must not take |
| --- | --- | --- |
| `harness/plan-evidence` | `documentManifestSchema`, `capturedDocumentSchema`, `passageReferenceSchema`, `catalogSchema`, `verifyDocumentBytes`, `resolvePassage`, `validateCatalog` | Run service, ledger, agent, Git, HTTP, scenarios |
| `harness/nonfunctional` | `candidateSchema`, `assessmentSchema`, `assessmentCoverage`, `roundSchema`, `assessedCandidateMatches` | Filesystem, agent, Git, ledger, HTTP, scheduler |
| Harness `analysis/` | `incorporationSchema`; composes captured source, catalog and scenario form | No replacement functional catalog |
| Harness `context-selection/` | `contextSelectionSchema`, `assignmentContextSchema`; validates one selection and assembles its exact continuation package | No new child or independent writer |
| Harness `run/` | `preparedCandidateSchema`, `deviationOriginSchema`, `nonfunctionalDeviationSchema`, `mergeReadinessSchema`; commits effects and projects standing | No semantic satisfaction inference |

The two child `module.ramify` files expose their interface files to the parent.
The harness imports these exports directly from the children; all referenced
types in those signatures are defined in those same owner files or standard
libraries. The children import no harness symbol. The harness's existing public
protocol remains the browser-safe exposure path when iteration 8 publishes
catalog, assessment and readiness views. The web must receive those types
through `harness/src/interfaces/protocol/`, then the root's existing
`expose-sub` channel, never by importing child source. The child schemas import
only `zod` and, for byte verification, Node crypto. The latter is not exposed
to the browser. The harness remains the sole durable-state writer.

## Document identity, storage and old reads

`job.json.manifest.planHash` and `input/plan.md` remain the root-plan identity
and bytes for every run. A new run also sets `manifest.documentManifest` to the
path and SHA-256 of `input/documents.json`. That file is a
`ramify-agent.document-manifest/1` record: first `doc-001` at
`plans/<plan-id>/plan.md`, then each canonical captured local text path once in
deterministic discovery order. `documents[]` records `id`, project-relative
`path`, `kind`, SHA-256, byte count, run-relative `storedAt`, and captured
source revision (`commit` and `dirty`). Plan files are excluded from the
implementation-source Git status, so their revision has `commit: null` and
`dirty: null` (unknown): their exact SHA-256, not HEAD, is their identity.
Principle files retain the implementation-source status. For the root, `storedAt` may refer to
`input/plan.md`; companion and principle bytes use immutable
`input/documents/doc-NNN.bin`. A document link records discovery only; the
architect's incorporation judgment controls binding scenarios. The same
manifest includes captured `kind: principle` documents and `principlesScan`:
`complete`, `partial` with explicit unreadable candidates, or `empty` when
none were discovered. Unreadable candidates are gaps, not rules.

The discovery adapter resolves relative links against their referring file,
canonicalizes each target, follows each canonical file once, and rejects
paths or symlinks whose resolved target escapes the project root. A valid
relative link may contain `..` on its way to another in-project file; stored
project-relative paths contain no `..` segments. The adapter records missing
references with the referring document and exact
source offsets. It excludes generated/dependency directories and independent
nested projects from the principles scan. A missing reference's `judgment` is
`unjudged` until initial analysis supplies `required`, `unclear` or `advisory`;
only `required` prevents analysis acceptance. The captured plan and principles
sets have no arbitrary corpus-size cutoff.

The ledger has an 8 MiB line bound, so document bytes and assembled packages
are never event bodies. During start, the harness writes each immutable byte
file through the existing flushed temporary-file and exclusive-link helper,
verifies byte count and SHA-256, then writes the manifest and `job.json`.
Before `job.json` and `job-started`, an interrupted start has only orphaned
prepublication files, not an accepted run. An existing target must match the
expected bytes; a changed or partial set is refused. The completed manifest
may be large; it remains a separate immutable file whose ledger event carries
only its path, hash and count. On recovery, the harness verifies every file
and reconstructs a missing manifest event only when `job-started` and all
matching files exist. Catalogs and context packages later use the same
verified immutable-file pattern before their authoritative ledger reference.
No document bytes depend on fitting in one transaction.

An old `job.json` without `documentManifest` is a single-file run:
`input/plan.md` is its implicit `doc-001` and its existing `planHash` is the
source hash. An old plan reference without `document` resolves to that root.
No old record or ledger line is rewritten. Non-functional coverage for such a
run is `unavailable`, even if its gate and run completed. New plan references
name a captured document plus anchor or line range. Architect excerpts use
`passageReferenceSchema` (`document`, near-verbatim `quote`, optional `locator`).
The harness verifies that the named captured document remains available, then
carries the architect's wording unchanged. It does not compare an excerpt to
source bytes. Unknown or unavailable documents return `unavailable` with a
reason. Legacy byte-offset fields in older stored excerpts are ignored on read.

## Accepted analysis and selection

The architect submits a `ramify-agent.document-incorporation/1` judgment for
captured documents: `scenarios` true or false, source passages supporting that
choice, and uncertainty. Only true documents feed the existing `scenarios`
parser. Existing entry capabilities, `requirementRefs`, `acceptanceRefs`,
scenario records and final Cucumber gate stay the functional path. The
architect separately submits near-verbatim `non-functional-requirement` and
`advice` passages with stated and inferred conditions distinguished.
The accepted event names immutable content-addressed files under
`analysis/catalog/` and `analysis/incorporation/`, with their hashes; a
partial pre-event write cannot bind a retry to stale content. The catalog
is fixed when that event commits.
Its IDs are `nfr-001` and `adv-001` separately, assigned in the architect's
submission order within each class; duplicate or skipped IDs fail on read.
Excerpt wording and classification are the initial architect's judgments, never
graded by source matching, a keyword or a filename. A rejected analysis
commits none of the catalog, incorporation or functional records. The single
`analysis-accepted` transaction commits all three; its optional catalog counts
preserve old event reads. Required missing documents stop before this event;
unclear missing references remain visible in the existing analysis review.

For each work item, `work-orientation-recorded` fixes the local architect's
invocation, session point if present, and exact orientation packet hash before
the first organizing step. One read-only selector fork receives that packet
and the accepted catalog/index, and records one
`contextSelectionSchema` record. A missing point permits a fresh selector with
the same packet and `degraded: true`. A valid selection records the examined
set, selected IDs, principle excerpts, reasons, conditions, uncertainty and
unavailable passages. Failure or invalid output consumes the captured retry
bound and leaves selection unavailable; omission never waives an NFR. The
continuation package carries the initial architect's catalog excerpts unchanged
and the selector's principle excerpts.
The `context-selection-recorded` event fixes its hash and forbids rerunning
selection for that work item. Its selection and package paths are immutable,
content-addressed files. The event hashes and accepted catalog are verified
before a recorded package is read. `examined` and `unavailable` name catalog
`nfr-NNN`/`adv-NNN` IDs or captured principle `doc-NNN` IDs. A selected
principle uses its `doc-NNN` ID and a near-verbatim excerpt attributed to that
captured principle document; multiple distinct excerpts from one document may be
selected. The principle index names the immutable stored path and byte hash.
Selector scope judgments and conditions remain separate from source text.

Delivery uses a deterministic `appendKey` derived from run, work item,
selection and destination session. `context-package-appended` records the
destination session/ref, actual outcome (`appended`, `already-present`,
`session-lost`, `failed`, `no-session`) and reason. Recovery retries an unknown
append by that key. If the session is lost, a fresh organizing prompt carries
the exact recorded package. `context-package-prompt-bound` identifies that
invocation, destination session and package hash; it records prompt delivery,
not an append outcome. Selector output is never regenerated. The architect
cites selected IDs per assignment;
`assignmentContextSchema` binds that citation to the package hash. Engineer
and contract sessions, including fresh continuations, receive the original
source passages labeled as requirement, suggestion or architect choice.

## Assessment, preparation and final gate

The harness invokes the non-functional coordinator after `takeWorkItems` and
review settlement and before `finalGate`, including when the accepted analysis
has `entries: []`. No capability progress is read to decide an NFR result.
The fixed catalog is complete input to every assessment. The coordinator may
invoke a read-only investigation child under its own role and record its
invocation in `nonfunctional-investigated`; there is no separate investigator
role. An explicit repair task alone starts the
`nonfunctional-repair-engineer` role in the chosen module's real `src/`.
That role's guarded assignment permits project-wide source edits but no
protected plan/scenario or outside-project writes.

Before each assessment, the harness settles writers and performs every
source-mutating preparation, including `rerenderScenarios`. It computes a
Git tree OID of the exact working content using an isolated temporary index
that includes relevant untracked source files, without changing the user's
index. `candidateSchema.tree` is that Git OID (40 or 64 hex according to the
repository); `head` is context only. `candidate-prepared` commits the
`preparedCandidateSchema` record and rendering hash. Assessment results name
that candidate, inspected scope, evidence and uncertainty for every `nfr`
exactly once; missing, duplicate or stale-candidate results are invalid. A
temporal invariant without observed intermediate evidence is `undetermined`.
When the fixed catalog contains no NFRs, the coordinator records an explicit
empty assessment (`results: []`) for the prepared candidate. Only that
candidate-bound empty coverage plus a passing final gate can yield `ready`;
mere absence of records is `unavailable`.

The captured `run-policy/4` adds `nonfunctionalRoundsPerPlan: 3` and context
for selector, coordinator and repair engineer. Earlier policy versions remain
readable with absent fields and cannot be silently upgraded into a Plan 13
run. One round assesses one prepared candidate, may investigate uncertainty,
may perform at most one sequential repair batch, then must prepare and assess
the resulting tree again before closing. No edit can remain unassessed. The
round counter is derived from committed `nonfunctional-round-closed` records
and is never reset by crash recovery. After three rounds, every unsatisfied or
undetermined NFR becomes a deviation; a missing matching assessment after
bounded recovery yields `unavailable` readiness, including at round three.

The final gate must use the prepared candidate. Its current commit effect
calls `rerenderScenarios` immediately before `commitForGate`; iteration 6 must
move that mutation into preparation and make the commit effect verify the
current working tree still equals the assessment tree. The gate audits a
commit whose `git rev-parse <commit>^{tree}` equals the assessed tree. The
`candidate-bound-to-gate` event records candidate, assessment, gate, commit
and tree only after that equality and the gate's audit evidence are verified.
A changed tree refuses finalization and either restarts preparation and a
fresh assessment within captured bounds or ends not verified with readiness
`unavailable`; it never publishes an earlier assessment against a new tree.
A failed required gate or Cucumber scenario follows the existing failure path
and cannot be waived by any assessment or CheckFinding decision.

## Deviations and merge readiness

The existing work-item deviation has origin `work-item-conflict`, naming its
actual unresolved request, work item and architect invocation. New NFR-only
deviations have origin `nonfunctional-assessment`, naming NFR, assessment,
assessed candidate and actual coordinator invocation; they invent no request
or work item. The record retains the initial architect's excerpt, evidence and
limits, proposed alternative or explicit uncertainty, and CheckFinding ID.
Old deviation records without an origin read as work-item conflicts at the
boundary; old decisions remain authoritative for those findings.

`mergeReadinessSchema` is a derived projection over one candidate, final gate,
complete assessment and current user decisions. `ready` requires a completed
run, passing final gate on the exact assessment tree, and every cataloged NFR either
`satisfied` there or changed by an accepted user decision for that candidate.
An unanswered deviation yields `pending-review`; rejection yields `rejected`;
a failed gate yields `gate-failed`; absent, stale or interrupted evidence yields
`unavailable`. A completed run can therefore wait for user review. Existing
post-terminal `check-findings-recorded` user-command events revise that review
standing, never the recorded final gate verdict. This is a revision-bound
signal for a later merge consumer; the harness adds no merge command.

## Worked recovery stream

The event order below gives one NFR-only run with one repair. IDs are examples
of the deterministic counters; each cited record is committed with its event.

1. `job-started`; immutable document byte effects finish; `document-manifest-committed` cites `input/documents.json` and its hash.
2. `analysis-accepted` commits the empty functional entries, the fixed catalog (`nfr-001`) and incorporation. `review-requested` and `analysis-approved` occur if the run chose a review stop.
3. Readiness and scenario materialization pass. `takeWorkItems` returns success with zero items. The coordinator path still runs.
4. Writer settlement and scenario rendering produce tree `T1`; `candidate-prepared` commits `cand-001`. `nonfunctional-assessed` commits `nfa-001` for `T1`, with `nfr-001: undetermined`.
5. `nonfunctional-investigated` names the coordinator's child invocation and `nfa-001`. One repair task and its guarded engineer invocation commit `nonfunctional-repair-committed` for round 1.
6. Rendering and settlement produce tree `T2`; `candidate-prepared` commits `cand-002`; `nonfunctional-assessed` commits `nfa-002`, covering `nfr-001` on `T2`. `nonfunctional-round-closed` commits round 1 with `satisfied`.
7. If the process dies after the repair but before `nfa-002`, replay sees no round closure and no matching assessment; it reconstructs the prepared tree, reuses or creates a bounded coordinator invocation, and never regards `nfa-001` as covering `T2`.
8. The final commit effect verifies the working tree is `T2`, commits it, and audits commit `C2` whose tree is `T2`. `candidate-bound-to-gate` binds `cand-002`, `nfa-002`, gate and `C2`; a passing final gate permits `job-completed`. If the tree differs, no binding or completion is committed; bounded recovery prepares and assesses again.

The focused iteration 1 tests prove multi-document schema acceptance, captured
document hash rejection, stable catalog numbering, and old single-file
record/event replay with unavailable coverage. Discovery, agent judgment,
source preparation, audit binding and browser presentation are executed in
their assigned later iterations.
