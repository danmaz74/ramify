# Plan 13: plan evidence, context selection and non-functional work

**Date:** 2026-09-25. **Status:** implemented through iteration 9 in the isolated
`feat/plan13-evidence-nonfunctional` worktree. See [implementation results](results.md)
and the revision-bound final audit published in the delivery commit's Git audit note.
**Design starting source:** `d3cd73f1b14ff575dd16159242e2e52d7f6d0f34`.
The [analysis](../../analysis/2026-09-25-plan-requirements-and-context-selection.md)
provides the initial design. The decisions below supersede its broader catalog
and completion language. Execution started from reviewed-input commit
`4adc79f4d22319801ed383760b7fab14d09a632d`; the separate planning checkout
and its original uncommitted changes remain unchanged.

## Outcome and boundary

```text
root plan plus accompanying local text -> captured plan evidence
target project's *.principles.md files -> captured principles evidence
initial architect -> near-verbatim non-functional requirements and advice
local architect orientation -> one read-only selection fork per work item
selected passages -> architect, engineer and contract-session context
ordinary capability/scenario work -> existing functional acceptance path
one non-functional coordinator -> assess, investigate, repair, reassess (at most 3 rounds)
passing final gate -> completed run, with any non-functional deviations visible
user review of deviation CheckFindings -> merge readiness for that candidate
```

This plan adds **no functional requirement catalog, capability assessment,
scenario mapping, or functional repair role**. Entry capabilities, their plan
references, their scenarios and the final Cucumber gate remain the functional
path. The non-functional coordinator never inspects capability progress to
decide satisfaction and never starts a functional correction. An advisory item
can influence an architect's choice, but has no satisfaction gate.

The new catalog holds only non-functional requirements and advisory items. Its
extraction is as close to the original wording as possible; interpretation,
classification and inferred applicability are separate fields. Its accepted
version is fixed for the run. Agents can read captured sources later but cannot
add a missed catalog item during that run. The catalog is available on the
analysis page; non-functional requirements, with their evidence, appear in the
existing initial-analysis review. Advisory evidence remains inspectable and is
not part of that review.

## Existing contracts and prerequisites

| Existing behavior | Consequence for this plan |
| --- | --- |
| [`plans/discover.ts`](../../../subs/harness/src/plans/discover.ts) and [`run/inputs.ts`](../../../subs/harness/src/run/inputs.ts) read and hash only `plans/<id>/plan.md`. | Capture a document set without losing the existing root-plan path or old-run reads. |
| [`InitialAnalysisSubmission`](../../../subs/harness/src/analysis/submission.ts) records entries, hypotheses and scenarios. Its form rules require a scenario for every entry and preserve plan scenarios. | Extend the submission with only non-functional and advisory extraction. Keep entry and scenario rules; extend their source references to the captured document set. |
| [`run/service.ts`](../../../subs/harness/src/run/service.ts) already has a single ledger writer, session points, fork and append recovery, audited gates, plan deviations and post-terminal user decisions on deviation CheckFindings. | Compose with these paths. Do not create another run store, agent scheduler or gate engine. |
| [`run/policy.ts`](../../../subs/harness/src/run/policy.ts) captures finite invocation, iteration and run bounds. | Add one captured non-functional round limit, default 3, while retaining the existing absolute bounds. |
| The [module-local directory spike](../../spikes/module-local-cwd/README.md) tested module `src/` starts on isolated branches; those changes were not adopted. | Repair-session directory, tools and prompt paths need their own implementation and witness. |
| The [CheckFinding architecture](../../architecture/check-findings.md#plan-deviations) lets a run complete with deviations for later user review. The current protocol accepts deviation commands after the run ends. | Reuse that review path, link each non-functional deviation to its catalog item and assessed candidate, and expose merge readiness separately from run completion. |

The [harness principles](../../harness.principles.md), [CheckFinding
principles](../../check-findings.principles.md), [acceptance architecture](../../architecture/acceptance-scenarios.md),
and [glossary](../../glossary.md) govern their respective meanings. Iteration 1
aligns their completion language with this plan: a run can complete pending
user review; it is eligible to merge only after the user settles its
non-functional deviations. A CheckFinding cannot turn a failed required gate
or scenario into a pass. There is no merge command in the current harness;
the plan publishes revision-bound merge readiness for the eventual merge
consumer and never labels a pending run merge-ready.

## Architecture and focused refactors

Add only two children beneath `subs/harness/subs/`: `plan-evidence` and
`nonfunctional`. Both have ordinary untagged module headers, owner-local
`src/tests/`, and contracts beside the behavior whose meaning they govern.
Keep context selection in `harness/src/context-selection/` initially. The
harness composes these responsibilities and remains the only durable-state
writer. Agent judgments supply meaning; deterministic validation does not
claim to prove semantic extraction, applicability or satisfaction.

| Owner | Responsibility and boundary | Independent verification |
| --- | --- | --- |
| New `harness/plan-evidence` | Document discovery policy, manifests, document identity, exact passage resolution, catalog validation and stable numbering. Keep filesystem reads behind a narrow read-only adapter; return captured values and gaps to the harness for persistence. Capture does not decide incorporation or binding force. | Pure document fixtures for passages, IDs and catalog rules; temporary filesystem cases for discovery, encoding, cycles and escapes. |
| Existing harness, `src/context-selection/` | Pure selection validation, assignment-reference validation and reproducible package assembly from resolved passages. Local workflow code owns orientation, selector invocation and delivery. | In-memory cases for omitted or unavailable passages, classifications and identical continuation packages. |
| New `harness/nonfunctional` | Pure assessment validation and round-state transitions: complete NFR coverage, candidate identity, investigation before speculative repair, reassessment and exhaustion. Returns proposed transitions; has no filesystem, agent, Git, ledger, HTTP or scheduler dependencies. | Table-driven transitions over explicit catalog IDs, candidate identities, results and counters. |
| Existing harness application code | Agent execution, assignment authority, writer settlement, candidate preparation, durable effects and recovery. Derives merge readiness with a pure function over gate evidence, assessment coverage and current user decisions. | Scripted-agent integration through the real ledger, focused recovery and readiness tests. |
| Existing children and web | `scenarios` owns Gherkin and functional acceptance; `check-findings` owns dispositions; `evidence`, `agent`, `audit` and `ledger` retain their existing responsibilities. Web displays harness projections and forwards commands. | Extend owner tests where contracts change; retain focused real-boundary and browser witnesses. |

Children receive narrow values, never `RunService`, a complete run record or
live session implementations. Provider contracts stay with their owner;
consumer-defined ports stay with their consumer. The harness translates
composition inputs or re-exposes the required contracts and signature
companions to descendants. Public browser-safe projections remain in harness
`src/interfaces/protocol/`. Iteration 1 records exact exposures before imports
are introduced; there is no generic shared-types module.

Perform these four refactors with their consuming features, rather than as a
separate harness rewrite:

1. **Passage handling, iterations 2–3 and 5.** Consolidate validation and
   retrieval now spread across analysis, review excerpts and deviations in
   `plan-evidence`. Resolve a document plus passage without trimming its source
   wording or silently omitting failures. Adapt legacy root-plan references at
   the read boundary; do not rewrite old records.
2. **Scenario provenance, iterations 2–3.** Extend `scenarios` to preserve
   document identity in extraction and citation matching, and assign unique
   scenario IDs across the incorporated set. Keep parsing there. Equal line
   ranges or headings in different documents cannot match each other.
3. **Deviation origin, iteration 8.** Add explicit variants for a work-item
   conflict and a non-functional assessment. The latter names the NFR,
   assessment, candidate and actual coordinator invocation, without inventing
   an unresolved request or work item. Reuse the CheckFinding conversion where
   semantics match; preserve old deviation reads and decisions.
4. **Candidate preparation, iterations 6–7.** Separate source-mutating
   preparation, including scenario rendering, from audit execution enough to
   assess a stable tree and require the final gate to audit that same tree.
   Keep the commit effect, writer ownership and recovery in the harness.

Reuse the agent port's fork/append and working-directory contracts and the
engineer equipment's separate working directory and guarded write scope.
When selection delivery needs the reconciliation append mechanics, extract
only the shared append operation; keep each workflow's ledger events,
fallback policy and recovery explicit. No generic workflow engine or broad
`RunService` split is required.

Keeping all new rules in harness folders avoids exposure costs, but passage
provenance and assessment progression each hide a coherent body of rules that
can be tested without run execution. Those two children justify their cost.
Selection assembly is small enough to stay in a harness folder; a third
child is deferred unless implementation demonstrates a stronger boundary.

## Contracts fixed before implementation

| Contract | Decision |
| --- | --- |
| Captured plan evidence | `plan.md` remains the root. Capture local text documents in its plan directory and local text documents referenced by the captured set, following each canonical file once. A link by itself is not incorporation or binding force. Store exact bytes, project-relative path and SHA-256 for each file, plus missing-reference records; reject path escape and symlink escape. A source reference always names a captured document and passage. No author-maintained manifest or arbitrary corpus-size cutoff is required. |
| Missing references | An initial architect judges a missing document from the available surrounding plan text. A document identified there as required stops analysis acceptance before implementation. An unclear reference is **not** a requirement; it is highlighted with its source location at the existing analysis review and does not block. A merely advisory missing reference is a recorded gap. Missing text is never interpreted as if it had been read. |
| Principles evidence | For v1, inspect project-owned `*.principles.md` files under the target root, excluding generated/dependency directories and nested independent project roots. A nested directory with its own root `module.ramify` and `package.json` outside the target's `subs/` module tree is an independent project; for example, a toolkit run excludes `ramify-agent/`. Capture exact text, path and revision; record unreadable candidates explicitly. The selector judges governing scope and status from the text. A matching filename alone does not establish applicability. Empty coverage is reported as empty, not as a discovered rule. |
| Catalog | Initial analysis submits near-verbatim passages with captured source references and a separate classification of `non-functional requirement` or `advice`. The harness assigns stable run-local IDs (`nfr-001`, `adv-001`, ... in document and passage order), verifies spans and exact quoted text, and stores stated versus inferred conditions distinctly. An uncertain reading retains the original passage and its uncertainty; no keyword or filename heuristic promotes advice to a requirement. The accepted catalog is immutable for the run. |
| Functional path | Initial-analysis entries, `requirementRefs`, `acceptanceRefs`, scenario records and their gates remain the only functional representation. Multi-document references extend those existing fields. Neither the catalog nor coordinator duplicates an entry capability or constructs a functional requirement-to-scenario map. |
| Document incorporation | Initial analysis records the architect's judgment of which captured documents supply binding plan scenarios, with the governing source passages and uncertainty. The harness validates these references and composes the selected documents with the existing scenario parser and form rules. Capture alone never incorporates a document. The accepted decision is fixed with the analysis; an example remains distinguishable from incorporated text. |
| One-time selection | Before a local architect first organizes a work item, it makes an orientation submission and yields a durable session point. One read-only fork sees that orientation and the complete applicable catalog/index, then identifies plausibly relevant passages. The harness validates references, retrieves captured source text, assembles one package, records it and appends it to the parent. A lost append is retried by key or delivered from the record to a reconstructed session; selection is not rerun. A new work item gets its own first selection. |
| Selection limits | A selector's omitted item is not a waiver. It records the examined set, selected IDs, reasons, conditions, uncertainty and unavailable source passages. A missing fork point may start a fresh selector with the recorded orientation packet and is marked degraded; a failed or invalid selector result within the captured retry bound leaves selection unavailable and prevents that work item from silently proceeding as fully briefed. No selection refresh occurs after later scope or approach changes. |
| Assignment delivery | The local architect cites selected IDs on each assignment. The harness delivers the original, qualified passages to engineer and contract sessions, including fresh continuations, while labeling source requirements, source suggestions and architect choices separately. The recorded selection and assignment references are review inputs; brief summaries alone never replace mandatory source wording. |
| Non-functional assessment | After ordinary functional work, or immediately for a plan with no entry capability, one coordinator receives the **complete** non-functional catalog regardless of work-item selection. For every `nfr` it records `satisfied`, `not satisfied` or `undetermined`, the candidate commit/tree, inspected scope, evidence, and remaining uncertainty. A dirty tree needs its own content identity; HEAD alone does not name it. Only an assessment of the exact final-gate tree can count toward merge readiness. The coordinator may request sequential investigations or repairs. Satisfied items need no repair. An undetermined item prompts investigation before speculative edits. |
| Candidate finalization | Settle writers and complete source-mutating preparation, including scenario rendering, before identifying the tree for assessment. Repeat preparation after each repair before reassessment. The final gate audits a commit with exactly that assessed tree; record the binding between assessment identity and audited commit. A changed tree invalidates prior results and refuses finalization. Recovery stays within captured bounds and never resets the three-round counter; if no matching assessment is obtained within those bounds, end as not verified with readiness `unavailable`, including after round three. |
| Repair authority | Only a task explicitly created by the non-functional coordinator may open a project-wide repair engineer session. Its chosen starting module supplies the actual `src/` working directory and local context; the session may edit other modules within the project. The guard still denies protected plan/scenario files, paths outside the project and writes lacking the repair assignment. Ordinary functional and contract engineers keep their current scopes. The coordinator and its children use the existing session, ledger, writer and execution bounds. |
| Bounded loop | The captured policy allows at most **three** assessment and repair rounds for the plan. A round assesses the current candidate, may make at most one sequential repair batch, and reassesses every `nfr` after that batch before the round closes. No edit may remain without an assessment of its resulting candidate. A result from an earlier commit cannot satisfy the new candidate without fresh assessment. A temporal invariant needs its intermediate evidence, otherwise its final result is undetermined. The existing final project and Cucumber gates run on the resulting candidate. Their failure follows the existing gate outcome and cannot be waived through non-functional assessment. |
| Exhaustion and review | A not-satisfied or undetermined `nfr` at the bound creates a run-owned plan-deviation CheckFinding with original passage, assessed candidate, evidence/limits, proposed alternative or explicit uncertainty, and user decision request. It remains distinct from a satisfied result. A passing final gate may end the automated run as **completed pending user review**. The user can accept a revised obligation or reject it for a follow-up run. A rejected or unanswered deviation leaves this candidate not merge-ready. |
| Merge readiness | A derived, revision-bound status reports `ready`, `pending-review`, `rejected`, `gate-failed` or `unavailable`, naming the candidate and relevant CheckFindings. `ready` requires a completed run, a passing final gate on that candidate, and every `nfr` either satisfied on that candidate or changed by an accepted user decision. No CheckFinding decision changes a gate verdict. The status is an authorization signal for a later merge consumer; this plan does not claim to block manual Git merges. |

The first implementation iteration writes exact Zod schemas, record paths,
ledger events, policy version changes and a worked recovery stream into a
contract appendix beside this plan before consumers depend on them. Stable
semantic decisions above govern that appendix. Older runs without this
catalog report non-functional coverage as **unavailable**, never as all
satisfied. Their root-plan references remain readable without rewriting
history.

## Iteration order

Each iteration ends with a source commit and a `results.md` handoff stating
its starting revision, changed contracts, focused checks, limits and next
consumer. Contract producers precede their consumers. The first iteration
records the actual starting revision and dirty-file inventory, preserves
unrelated edits, and checks the current baseline. Refresh generated Ramify
views before cross-module imports; the views are search evidence, not source.
Prepare the execution worktree from its root with `npm run worktree:prepare`.
From `ramify-agent/`, run `npm run type-check`, `npm run build:web` and
`npm run check:self` before implementation, recording any baseline failures.
Run a baseline complete suite only through the existing ramify-audit request
`ramify-agent/audit/ramify-agent-suite.request.json` from the repository root.
Iteration 9 records `ramify-agent/audit/plan13-plan-evidence.request.json`
beside it for the final implementation commit. A focused pass, the Ramify
self-check and an audit are
distinct evidence.

### 1. Contract alignment and exact capture records

**Owner:** `plan-evidence` and `nonfunctional` for their domain contracts;
harness for composition and protocol; documentation owners.
Write the appendix's source-manifest, passage-reference, catalog, selection,
incorporation, assessment and merge-readiness contracts and their event order.
Record the ownership table's exact public operations, module exposures,
signature companions and forbidden dependencies. Define deviation-origin
variants, candidate preparation and mismatch recovery before consumers use
them. Keep domain schemas with their owners and composition records in the
harness. Update the
principles, acceptance architecture and glossary only where their existing
completion or vocabulary rules require alignment. Keep functional scenario
records independent. Define old-run reads and the rule that user decisions
after terminal completion revise review standing, never the recorded final
gate.

**Exit:** schema and replay tests accept a multi-document manifest, reject a
changed hash or invalid passage, retain an old single-file run, and derive
`unavailable` for its non-functional coverage. Document links and
`npm run type-check` pass. No runtime capability is claimed by the appendix.

### 2. Capture plan and principles evidence

**Owner:** `plan-evidence`, existing `scenarios`, and harness `plans/` and
`run/inputs` composition. Capture every discovered local text document once with exact bytes,
canonical path and hash. Record missing local references without guessing
their meaning. Scope the principles scan to project-owned files.
Extend the existing plan-reference and Gherkin paths so incorporated scenario
documents can supply scenarios while a linked example does not become binding
solely because it is linked. Keep `input/plan.md` for root-plan compatibility;
the manifest identifies every captured companion.
Consolidate passage resolution for analysis and later review/deviation
consumers here. Extend scenario extraction with document provenance and
deterministic numbering across documents; incorporation acceptance is wired
in iteration 3.

**Exit:** nested companion documents, relative links, cycles, duplicate
references, missing files, invalid text, symlink escape, changed companion
bytes, nested independent projects and multi-file Gherkin each have a focused
case. A run whose required companion is unavailable stops before accepted
analysis; an unclear link is visible at review and nonblocking. A changed
companion is detected before later publication or approval. Pure cases retain
exact whitespace and report unresolved passages explicitly. Two documents
with identical headings and line ranges neither collide in scenario IDs nor
satisfy each other's citations. Acceptance-dependent cases complete in
iteration 3.

### 3. Extract and present the fixed catalog

**Owner:** `plan-evidence` catalog validation; harness initial analysis and
projections; web analysis page.
Give the initial architect all captured plan evidence through focused reading
and extend its submission with near-verbatim `nfr` and `adv` passages,
classifications, conditions and uncertainty. Validate exact quoted spans and
stable IDs without using keyword classification. Include non-functional
requirements and their evidence in the existing review; make advisory evidence
available separately. Accept the catalog once with the analysis; no mid-run
addition or re-extraction endpoint exists.
Accept the source-grounded incorporation judgment with the analysis and pass
only incorporated scenario documents into the existing functional form rules.

**Exit:** a mandatory implementation constraint remains an `nfr`, a tentative
technology suggestion remains `adv`, and an architect's later adoption is a
separate approach decision. Review shows all `nfr` passages and missing
reference warnings but does not require disposition of advice. A rejected or
malformed extraction changes no run record. A browser witness verifies the
review presentation.

### 4. Orient and select context once per work item

**Owner:** harness `src/context-selection/`, local workflow and existing
agent/session/ledger composition.
Add an orientation turn before a local architect's first assignment. Use one
read-only fork over the captured catalog and principles index. Persist the
selection's inspected and selected references and the assembled source
passages, then append the package to the parent context by durable key. Record
actual fork or degraded fresh start and source coverage. Existing session
reconstruction supplies the same recorded package; it never invokes a second
selector for that work item.
Implement pure selection validation and package construction before wiring
the fork. Reuse the existing append contract and extract only the shared
append operation from reconciliation delivery when needed; workflow records
and recovery remain owned by their callers.

**Exit:** a scripted run proves the selector sees the oriented local context,
not merely a module name; a later change of approach does not rerun it; a new
work item selects once for itself. Crash before selection commit retries
selection; crash after commit and before append replays only the append. Lost
parent session reconstructs from the recorded package. Invalid, partial and
unavailable selection remain visible and do not claim complete delivery.

### 5. Deliver passages to implementation and reviews

**Owner:** harness context selection, work assignments, engineer/contract
prompts and review inputs; `plan-evidence` passage resolution.
Carry selected evidence IDs through assignment creation. Render exact
source passages with their force, path, revision, stated/inferred conditions
and uncertainty in engineer and contract-session briefs. Preserve selected
input hashes in review requests and make the package available after session
restart. Do not recast advice as an instruction in the `approach` field.
Replace review-specific single-document excerpt parsing with the shared
resolver; preserve explicit failures instead of silently dropping a passage.

**Exit:** a fresh engineer, a continued engineer and a contract session see
the same relevant quoted passage and its classification. A non-selected `nfr`
is still present in the coordinator's complete list. A changed source or
stale assignment is refused rather than delivered as current.

### 6. Non-functional assessment and coordinator records

**Owner:** `nonfunctional` assessment and transition rules; harness candidate
preparation, run composition and prompt package.
Start one coordinator only after ordinary work has finished, including the
zero-entry case. Add a flat, ledger-backed result set keyed by `nfr` ID and
candidate revision. The coordinator assesses each `nfr`, may request one
sequential investigation at a time and records evidence and uncertainty.
The harness validates complete ID coverage and source/candidate identity but
does not claim to validate semantic satisfaction. Neither the coordinator's
prompt nor its accepted submissions mention capability progress or scenario
coverage as assessment tasks.
Build pure assessment validation and transition tests before coordinator
wiring. Prepare and identify the candidate after writer settlement and
scenario rendering; bind accepted assessment results to that identity.

**Exit:** all-satisfied, partly-unsatisfied, undetermined and no-`nfr` cases
produce distinct records. Missing, duplicate and stale results are rejected;
an older candidate never passes as the current one. A structural requirement
is assessed against current source or adequate Ramify evidence, and a
temporal requirement without intermediate evidence remains undetermined.
Preparation that changes the tree invalidates an earlier assessment. Pure
tests require neither a run service nor an agent, Git or filesystem.

### 7. Non-functional repair sessions and the three-round loop

**Owner:** `nonfunctional` round transitions; harness assignment authority,
engineer equipment, write scope, session lifecycle and run policy.
Add a repair-only assignment kind with a starting module, actual
module-`src/` tool working directory and project-wide write scope. Adapt paths
and prompts using the module-local spike as evidence, without importing its
unmerged code by assumption. Use sequential child sessions through the
existing writer. At most three coordinator rounds may investigate, make one
repair batch and reassess the complete `nfr` list; retain existing invocation and run
ceilings. A final gate failure is handled by existing gate logic, not by a
functional task from this coordinator.
Reuse existing working-directory and guarded-scope inputs. After every repair,
prepare the candidate before reassessment; require the audited final tree to
match it. Identity mismatch follows the finalization contract without an
extra repair round or an unbounded reassessment loop.

**Exit:** a repair changes two modules and passes its guard and checks; an
ordinary engineer making the same outside-scope edit is refused. `pwd`, file
tools and shell start under the chosen module's `src/`; project-relative
machine fields still resolve from the project root. A crash after assignment,
after child result and after reassessment resumes without duplicate work.
Round three stops even when results remain unsatisfied or undetermined.
Pure transition tests cover every permitted next action and refusal; a real
Git witness proves assessment-to-audit tree identity and rejects late changes,
including after the third round.

### 8. Exhaustion, CheckFindings and merge-readiness projection

**Owner:** harness deviation records, CheckFinding composition, readiness
derivation, run projections and public protocol; web run page.
Link each exhausted `nfr` to a run-owned deviation
CheckFinding grounded in plan evidence and the assessed candidate. Keep the
original requirement, alternative and accepted user revision distinguishable.
Complete an automated run with passing gates while deviations await review;
show that state prominently. Derive merge readiness from the final gate,
current candidate, result set and post-terminal user decisions. Surface the
reason and exact source passage in the run page. A rejected decision directs a
follow-up run rather than reopening the completed run's implementation.
Introduce explicit deviation-origin variants and adapt legacy records on
read. Reuse existing CheckFinding disposition behavior. Keep readiness a pure
harness composition function over trusted inputs; web does not derive its
own verdict.

**Exit:** pending and rejected deviations never report `ready`; accepting a
revision changes only review standing and derived merge readiness, not the
final gate record. An unchanged satisfied `nfr` needs no CheckFinding. A
failed required scenario or project gate remains failed even if the user
accepts a non-functional deviation. Post-terminal answer, stale revision,
retry and projection rebuild have focused tests and a browser witness.
An NFR-only run creates a deviation with its actual coordinator provenance
and no fabricated work item or unresolved request. Old work-item deviations
remain readable and retain their decision behavior.

### 9. Composition and acceptance

**Owner:** full harness integration. Run scripted multi-file plans covering an
ordinary functional plan with `nfr` and advice, an `nfr`-only structural plan,
and an exhausted plan with a pending user decision. Include one real agent
fork/append and actual module-local tool-start witness, with exact model and
session start modes recorded. Compare source and candidate revisions at each
publication boundary. Inspect whether the final candidate's project and full
Cucumber gates ran after the last repair.

**Final gate:** focused tests for the affected owners; `npm run type-check`,
`npm run build:web` and `npm run check:self` from `ramify-agent/`; the full
suite only through `ramify-agent/audit/plan13-plan-evidence.request.json` on
the final commit.
Record process, browser, model and audit evidence separately in `results.md`.
Measure catalog counts and reviewed `nfr` coverage, selection omissions found
in the trial, quoted-context size, tokens, pre-work latency, round count and
unresolved decisions with denominators and revisions. No efficiency or recall
claim follows from a single unmatched run.

## Acceptance matrix

Pure tests exercise owner rules without run execution. Filesystem cases use
temporary directories. Scripted integration uses the real domain owners and
ledger with the existing scripted agent; it does not replace domain behavior
with generic success fakes. Real Git/audit, agent and browser witnesses prove
their respective boundaries and are recorded separately. Scripted judgments
prove handling of the supplied classifications, not semantic extraction quality.

| Case | Observable result | Test owner and level | Iteration |
| --- | --- | --- | --- |
| PE01 | Root and companion text are captured by path, exact bytes and hash; cycles do not duplicate them | `plan-evidence`: pure and filesystem | 1–2 |
| PE02 | Required missing companion stops before accepted analysis; unclear missing reference is highlighted at review without becoming a requirement | `plan-evidence`: gap fixtures; harness: scripted acceptance; web: browser | 2–3 |
| PE03 | A recorded incorporation judgment selects binding scenario documents; a linked example does not become binding | `scenarios`: pure; harness: scripted acceptance | 2–3 |
| PE04 | Only target-project `*.principles.md` files are inspected; nested independent project documents do not enter its index | `plan-evidence`: filesystem | 2 |
| PE05 | Near-verbatim `nfr` and advice keep their source force; only `nfr` is in review and satisfaction accounting | `plan-evidence`: pure; harness: scripted acceptance; web: browser | 3 |
| PE06 | Entry capabilities and scenarios retain their existing records and final gate, with no duplicate functional catalog or coordinator action | `scenarios`: pure regression; harness: scripted integration | 3, 6, 9 |
| PE07 | One local orientation and one selection occur per work item; reconstruction redelivers without reselection | Harness: scripted recovery; agent: real fork/append witness in iteration 9 | 4, 9 |
| PE08 | Selection and briefs retain original passages, conditions, uncertainty and revision; advice never silently becomes an approach instruction | Harness context selection: pure; harness: scripted delivery | 4–5 |
| PE09 | The coordinator assesses every `nfr` on one candidate and reassesses every `nfr` after repairs; stale or missing results do not count | `nonfunctional`: pure transitions; harness: scripted integration | 6–7 |
| PE10 | Only non-functional repair engineers may edit across modules, starting in the selected module's actual `src/` | Harness authority: pure and filesystem; equipment/agent: actual tool-start witness | 7, 9 |
| PE11 | Three rounds end the loop; unsatisfied or undetermined items retain evidence and create user-visible CheckFindings | `nonfunctional`: pure transitions; harness: scripted exhaustion | 7–8 |
| PE12 | Passing gates permit run completion pending user review; pending or rejected deviations prevent merge readiness | Harness readiness: pure; harness: scripted integration; web: browser | 8–9 |
| PE13 | User acceptance of a revised `nfr` is revision-bound and cannot waive a failed required gate or scenario | Harness readiness/commands and existing CheckFindings: focused rule and integration tests | 8–9 |
| PE14 | Old single-plan runs remain readable and show non-functional coverage as unavailable | `plan-evidence`: legacy reference fixtures; harness: replay and projection | 1, 8 |
| PE15 | Crash recovery, stale commands and final-candidate audit preserve exactly one durable result and truthful review status | Harness: real-ledger recovery; real Git/audit witness | 4, 6–9 |
| PE16 | Identical headings and line ranges in different documents cannot satisfy each other's citations; extracted scenario IDs are unique across the set | `scenarios`: pure | 2–3 |
| PE17 | Passage resolution retains exact whitespace and reports unavailable references explicitly for analysis, assignments and reviews | `plan-evidence`: pure; harness consumers: focused integration | 2–3, 5 |
| PE18 | Candidate preparation precedes assessment; a different audited tree cannot finalize the run, including at round three; exhausted recovery leaves readiness unavailable | `nonfunctional`: pure identity/round rules; harness: real Git/audit witness | 6–7, 9 |
| PE19 | NFR-only deviations name the actual assessment and coordinator without an invented work item; legacy deviation decisions retain their behavior | Harness deviation adapter: pure; commands/projections: integration | 8 |

## Handoff and explicit limits

`results.md` is created during implementation, not as planning evidence. The
contract appendix from iteration 1 is reviewed before other iterations use
its new records. The implementation handoff names the captured input revision,
run-policy version, fixtures, executed cases, unresolved CheckFindings and any
source coverage limit.

This plan does not promise complete semantic extraction, refresh a work item's
relevance selection, add requirements to a run after accepted analysis,
parallelize selectors or repairs, infer a requirement graph, or automate Git
merge. A future merge consumer must honor the published readiness status for
the exact candidate; manual merging remains outside the harness's control.
