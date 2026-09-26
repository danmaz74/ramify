# Plan 14: the element catalog and one package creator for every prompt

**Date:** 2026-09-26, rewritten the same day to adhere to the
[plan context catalog principles](../../architecture/plan-context-catalog.principles.md).
**Status:** proposed; this document is a plan, not implementation or
acceptance evidence. **Source inspected:** ramify-agent `0109c84c`. The
trial it draws on is `20260926T052417Z-21d928` on harness `c4af2a4e` and
target `d61f7c099`; its relevant durable records are copied into the
[example evidence](evidence/self-explaining-denials-scope.json), and the
[run analysis](../../analysis/2026-09-26-self-explaining-denials-run-analysis.md)
records what happened.

## Outcome

One catalog of elements, extracted once from the captured plan and
principles documents and frozen at analysis acceptance, is the bounded view
every agent works from. One package creator renders any set of element IDs
into the same text for any consumer. Every prompt that carries plan or
principle material receives a package made by that creator and nothing
else; no agent quotes a passage into a submission, computes an offset,
names a heading for the harness to resolve, or reads a source document to
complete a reading.

```text
captured documents
  -> intake turn (plan documents)             -> non-functional, recommendation elements; incorporation
  -> extraction turn per principles document  -> fixed-requirement, recommendation elements
  -> initial architect (plan documents)       -> functional elements; entries cite them
  -> checker turn per source document         -> corrected elements; findings shown at the review stop
  -> analysis accepted, person's review       -> IDs final, catalog frozen

frozen catalog + element IDs + deviation IDs -> package creator -> package text, hash
  (the IDs and the hash live on the record that cites the package; nothing stores the package)

local architect orientation -> selector fork (non-functional + recommendations) -> work-item package
assignment cites a subset                                           -> assignment package
  -> engineer, contract engineer, scope reviewer, code reviewer
all non-functional elements                                         -> assessment package
  -> non-functional coordinator; repair engineer gets the cited subset
work-item package + deviations                                      -> unresolved global fork
```

## Why this plan is needed

The trial ended with three of four scope reviews `not-verified (unavailable)`
because an assignment named a sentence as a heading and the scope path
resolved headings before it appended the assignment's already selected
source. The same run submitted an empty non-functional catalog for a plan
with a Constraints section, so the non-functional phase had nothing to
assess and the two constraints the final gate broke were never cataloged.
The [run analysis](../../analysis/2026-09-26-self-explaining-denials-run-analysis.md)
and the principles document record why: exactness was demanded of a
semantic act, and the validators shaped what the agents submitted.

An inventory of the harness at `0109c84c` shows the structural cause. Plan
and principle text reaches prompts by six independent routes:

| Route | Where | What it does |
| --- | --- | --- |
| `assembleContextPackage` | `src/context-selection/selection.ts:19` | The one shared renderer, for the selector's package and the assignment subset |
| `scopeRequirements` with `resolvePlanReference` | `src/run/service.ts:975-996`, `subs/plan-evidence/src/references.ts:20` | Resolves assignment `requirementRefs` as headings or line ranges; throws at `service.ts:984` before appending the assignment source |
| `deviationText` | `src/deviations/records.ts:184` | Renders every plan deviation in full into the local brief, the unresolved fork and the scope review |
| `JSON.stringify(catalog)` | `src/context-selection/prompts.ts:17`, `src/nonfunctional/prompts.ts:5-41`, `service.ts:3250` | Dumps the raw catalog into the selector and three non-functional prompts; the investigation prompt at `service.ts:3280` carries IDs with no text |
| `orientationMessage` | `src/reviews/message.ts:97` | Embeds whole principles documents from the candidate for design orientation |
| `refs()` and the unresolved fork's labels | `src/work/session.ts:577`, `service.ts:5256` | Print an anchor or a root-plan line excerpt with no text and the document ignored |

Assignment `requirementRefs` are never validated when the local architect
submits them (`src/work/assignment.ts:193`, `src/work/submission.ts:178`);
the scope review is the first reader, and it is the one that cannot fail
softly. The local architect's continued brief appends the entire work-item
package on every turn (`service.ts:4560`), and twice on the first turn
because `appendContext` at `service.ts:4225` already put it into the
session; scope reviewers and reconciliation forks inherit every copy. That
repetition, about 24 KB per turn in the trial, is what exhausted the
architect's context, not the selection itself, which ran once in 54 seconds.

## What binds this plan

The [plan context catalog principles](../../architecture/plan-context-catalog.principles.md)
decide the catalog's purpose, its four kinds of element, the granularity of
an element, the fidelity it promises, what stays exact, how a package is
selected and when, and what a consumer may rely on. This plan implements
them and adds nothing they exclude.

Plan 13's contracts for the catalog, document incorporation, one-time
selection, selection limits and assignment delivery are superseded for new
runs. Its capture of documents, its non-functional assessment loop, its
candidate finalization, repair authority, bounded rounds, exhaustion and
merge readiness stand, and receive their inputs from the package creator.
Functional scenario parsing, the final Cucumber gate, candidate audit and
CheckFinding authority are unchanged. An element's presence in the catalog
or in a package never verifies that its requirement was satisfied.

## Contract to implement

### 1. The catalog

`harness/plan-evidence` owns the element and catalog contracts. An element
record holds:

| Field | Meaning |
| --- | --- |
| `id` | Assigned by the harness when it accepts the submission that introduces the element: `fr-NNN` functional requirement, `nfr-NNN` non-functional requirement of the plan, `fix-NNN` fixed requirement from a principles document, `rec-NNN` recommendation; numbered in acceptance order within each kind and final at analysis acceptance |
| `kind` | One of the four kinds of the principles document |
| `document` | The captured document ID the element was read from |
| `text` | The requirement as its source states it, as close to the source wording as the extracting agent found practical, of whatever length one requirement needs |
| `conditions` | Each with `text` and `source: stated | inferred` |
| `uncertainty` | The extracting agent's, free text, may be empty |
| `locator` | Optional, written for a person, never resolved |

There is no byte offset, no span, no per-element hash and no flag that
distinguishes an exact quote from a near-verbatim one. The harness checks
shape, that `document` names a captured document, and that a functional
element comes from a plan document and a fixed requirement from a
principles document. It does not compare `text` with the captured bytes and
has no size bound on an element.

The catalog is frozen when the analysis is accepted, and its hash, a byte
fact the harness computes over the accepted records, identifies it for the
run. A missing element discovered later is a gap recorded through the
existing unresolved and deviation authority; no element is added inside a
run.

Document incorporation keeps its judgment, which captured plan documents
supply binding scenarios and with what uncertainty, and loses its governing
passages: they reached no prompt and were the first rejection of the trial.

### 2. Extraction and acceptance

The initial analysis becomes bounded turns, each a fresh session with the
smallest input that serves it:

- **Intake.** One turn reads the captured plan documents and submits the
  plan's non-functional and recommendation elements, the incorporation
  judgment and the missing-reference judgments. It has no architect view
  and no skill.
- **Principle extraction.** One turn per captured principles document
  reads that document and the plan's goal, and submits the fixed
  requirements and recommendations of that document that bear on this
  plan. Nothing else of the document is extracted, so the catalog stays
  small and no cross-run state exists. This is the choice the principles
  document leaves open; see the decisions at the end.
- **Initial architect.** It reads the captured plan and its accompanying
  documents in full, as today, with the plan scenarios and the architect
  view, and nothing rendered from the catalog. Its submission carries the
  functional elements it read from the plan documents together with its
  entries, hypotheses and scenarios, except that `requirementRefs` and
  `acceptanceRefs` cite those functional elements, and scenario form rule 6
  reads "every acceptance element of an entry is cited by one of its
  scenarios". The architect is the functional reading: the elements work
  is organized around are the ones it cut, so no second reader's cuts can
  disagree with its entries. The manifest and the byte-offset rules leave
  its brief.
- **Checker.** One turn per source document, once every element of that
  document exists, given the document, its elements and, for a plan
  document, the entries that cite them. It corrects the catalog directly
  where the reading is unfaithful: it adds an omitted requirement, rewrites
  an element made stronger or weaker than its source, and splits or merges
  elements whose cuts separate a rule from its conditions or fuse
  unrelated requirements, re-citing the entries that named an element it
  split or merged. It changes nothing else. Each correction is recorded as
  a finding with its reason, and the findings are shown at the review stop
  beside the corrected catalog; the person decides whether to accept.

Within one submission an element is named by a submission-local key. The
harness assigns the ID when it accepts the submission and rewrites that
submission's citations to it. A checker correction keeps the ID of an
element it rewrites, gives a new ID to one it adds, and for a split or
merge retires the old IDs and issues new ones; the correction carries the
re-citations, and an entry left citing a retired or unknown ID is rejected
with its path. IDs are final at analysis acceptance.

The person's review stop shows the catalog by kind, the checker findings
and the accepted analysis. Approval freezes the catalog, and the harness
writes `analysis/catalog.json`.

### 3. The package creator

`createPackage` is one pure function in `harness/plan-evidence`:

```text
createPackage({ catalog, elements: ID[], deviations: ID[] })
  -> { text, hash, bytes }
  |  { unavailable: { missing: ID[] } }
```

- It renders the requested elements grouped by kind, in catalog order
  within a kind, each with its ID, its kind, its source document path, its
  full text, its conditions labelled stated or inferred, and its
  uncertainty. Recommendations are rendered last under their own heading
  with a fixed sentence stating that they are not requirements and that a
  departure is reported, not justified.
- It renders the named plan deviations after the elements, each naming
  the element it amends and the amended text, under the deviation's own
  authority.
- It never shortens, summarises, reorders across kinds, or reads a
  document. A missing element or deviation ID makes the whole result
  unavailable with the IDs named; a package is never delivered partial.
- `hash` is the SHA-256 of `text`, and the header of `text` names the
  catalog hash, the element IDs and the deviation IDs, so the hash covers
  exactly what a consumer received.

There is no package store. The record that cites a package, the work-item
selection, the assignment or the review request, holds the element IDs, the
deviation IDs and the hash. Every later delivery, including a session
reconstruction, renders again from the frozen catalog and those IDs and
receives the same bytes. The deviation IDs are pinned when the record is
written, so a deviation recorded later never changes a package already
delivered; it reaches a running session as a separate append. What an agent
actually received is already kept twice: pi's session file holds the
appended package and replays it to resumed and forked sessions, and the
harness transcript records prompt bodies and appended briefs in a content
store named by the same SHA-256, so the recorded hash is checkable against
it. The transcript stays raw output and is never read for recovery.

### 4. Selection

Selection follows the principles document's rules exactly:

- After the local architect's orientation turn yields its session point,
  a read-only fork of that session receives the package of every
  non-functional, fixed and recommendation element, rendered by the
  creator, and submits the IDs it selects with a reason, conditions and
  uncertainty each. It may read a captured document to settle a doubt;
  its submission carries no passage, locator or range. Validation is that
  every ID exists. A lost fork point starts a fresh selector from the
  recorded orientation and marks the selection degraded, as today.
- The work-item package is the entry's functional elements plus the
  selected IDs, rendered once, recorded on the selection as its element
  and deviation IDs and hash, and appended to the local architect's
  session once. The continued brief names the package by hash and never
  repeats its body; the double delivery of the first turn ends.
- A global placement decision that adds an owner to the work item runs the
  selection again from the current session point. The new package
  supersedes the old for later assignments; earlier assignments keep
  theirs.
- An assignment cites a subset of the work-item package's IDs in
  `citedElements`. The local architect's submission is rejected at
  submission time, with the path, when an ID is not in the work-item
  package. `requirementRefs` leave the assignment. The assignment record
  holds its cited element IDs, its deviation IDs and the package hash
  before `iteration-assigned` is committed, so no later reader can fail to
  render it. A contract iteration inherits its requester's assignment
  package by record.

### 5. Delivery: every consumer, one creator

| Consumer | Package | Replaces |
| --- | --- | --- |
| Intake, principle extraction, checker | None; they read captured documents | The initial architect's document index and byte-offset rules |
| Initial architect | None; it reads the captured plan and accompanying documents in full and submits the functional elements it cites | `planRefSchema` line references, the manifest and the byte-offset rules in its brief |
| Context selector fork | All non-functional, fixed and recommendation elements | `JSON.stringify(catalog)` and the principle index at `src/context-selection/prompts.ts:10-20` |
| Local architect | The work-item package, once, then by hash | The per-turn append at `service.ts:4560`, the session append at `:4225`, and `refs()` in `src/work/session.ts:240-243` |
| Global fork, placement | None; it inherits the initial session, which holds the plan as today | Nothing |
| Global fork, unresolved request | The work-item package | The line-numbered plan and bare anchor labels at `src/architecture/session.ts:101-134`, `service.ts:5256` |
| Engineer | The assignment package, once per session | `sourceEvidence` at `service.ts:6180` and its repetition on each continued attempt at `:6111-6130` |
| Contract engineer | The requester's assignment package | `service.ts:6788` and `takeContract`'s re-delivery at `:6602-6615` |
| Scope reviewer | The assignment package plus deviations | `scopeRequirements` at `service.ts:975-996`, `planExcerpts` at `src/reviews/inputs.ts:37`, and the throw at `:984` |
| Code reviewer | The assignment package | Nothing today; the trial's code reviews grounded one concern on a stale draft plan because they had no plan input |
| Reconciliation fork | None new; it forks the local architect, whose session now holds the package once | The inherited per-turn copies |
| Non-functional coordinator, assessment and action | All non-functional and fixed elements | `coordinatorAssessmentPrompt`, `coordinatorActionPrompt` and the appended catalog JSON at `service.ts:3250` |
| Non-functional investigation | The elements the coordinator names | The ID-only prompt at `service.ts:3280` |
| Non-functional repair engineer | The elements the coordinator cites | `repairPrompt` at `src/nonfunctional/prompts.ts:41` |
| Design reviewer and its orientation | Unchanged; candidate guidance is not plan evidence | Nothing |
| Failure analyst, single-session engineer | Unchanged; they carry no plan material today | Nothing |

Deviations cite element IDs and carry replacement text; the unresolved
fork's `deviation` submission and `deviationErrors` at
`src/architecture/submission.ts:278` change accordingly, and
`recordDeviation` stops quoting root-plan lines. A reconciliation conflict
cites an element ID in place of `document: 'plan'`.

### 6. Removed

- Byte offsets, spans, `resolvePassage`'s quote carriage, the exact versus
  near-verbatim distinction, and `passageReferenceSchema` where it cited
  agent text.
- `resolvePlanReference`, `headingAnchor`, `anchorOf` and `planExcerpts` on
  every agent-facing path; heading resolution remains only if a projection
  wants it for display, and nothing depends on it.
- `assembleContextPackage`, `assignmentDelivery` and `validateAssignmentContext`,
  replaced by the creator and the IDs on the citing records.
- The stored package text and its comparison against a rebuild in
  `src/context-selection/recorded.ts:39-41`; determinism is a unit test
  of the creator, not a second copy on disk.
- The selector's `passage` field, `examined` list and `unavailable` list;
  the catalog is its input, so omission is judgment, not coverage.
- Incorporation's `governing` passages.
- The per-turn package append and the first-turn double delivery.
- Reads of old-run records that used the replaced schemas. This harness is
  pre-release; a run's records are read by the harness commit that wrote
  them, and the trial's records stay analysable in their worktree. No
  legacy adapter is written.

### 7. Records and events

| Record | Written | Read |
| --- | --- | --- |
| `analysis/catalog.json`, the frozen catalog with IDs | `analyse`, at acceptance | Every package rendering; projections |
| `analysis/checks/<document>.json`, checker findings and corrections per source document | The checker turn | The review stop projection |
| `work/<wi>/selection.json`, selected IDs with judgments, and the package's element IDs, deviation IDs and hash; superseded by a re-selection | The selector fork | Work-item package rendering; recovery |
| `assignments/<iteration>.json` with `citedElements`, deviation IDs and package hash | `assignIteration`, before `iteration-assigned` | Engineer, contract, scope and code review; recovery |
| Review request `source: { elements, deviations, hash }` | `requestReviews` | `runReviewAttempt` |

Events: `catalog-extracted { document, elements }` per extraction turn and
for the initial architect's functional elements, `catalog-checked
{ document, findings, corrections }`, `analysis-accepted` extended with the
catalog hash, `work-selection-recorded { workItem, elements, deviations,
hash, supersedes? }`. The `context-package-*` events and
`assignment-context` records retire. No event records a package; the
transcript already holds what each session received.

## Failure cases the design must prevent

| Problem | Required behavior |
| --- | --- |
| An agent names a sentence as a heading, or any locator | Locators are display text; nothing resolves them; no submission carries one that the harness reads |
| One bad reference disables a review's whole input set | An assignment with an unknown ID is rejected at submission with its path; a review request carries the element and deviation IDs its package renders from, written before the request |
| An empty catalog for a plan with constraints | The checker adds the omitted elements and records the omission as a finding; the review stop shows it; the person decides |
| A long requirement cut into fragments, or five bullets fused into one | The checker splits or merges them and re-cites the entries; extraction guidance states the granularity rule of the principles document with its worked cases |
| A deviation recorded after a package was delivered changes what a reconstructed session receives | The citing record pins the deviation IDs; a later deviation reaches the session as a separate append |
| A recommendation read as a requirement | Rendered last, under its own heading, with the fixed sentence; never delivered to the assessment scope |
| The package repeated on every continued turn | The brief names the package by hash; the body is appended once per session and once per reconstruction |
| A partial or summarised package delivered as complete | A missing ID makes the result unavailable; the creator has no truncation path |
| A consumer completing a reading from the source | Engineers, reviewers and the coordinator receive no captured document paths in their briefs; the selector may read, and its output is IDs; the initial architect reads the plan because it is the functional reading, not a consumer |
| Two elements of one document conflated | Each is one ID; a package may hold any subset |

## Implementation order and evidence

Tests use scripted agents and fixtures only; no test calls a model. Each
iteration runs `npm run type-check`, the changed owners' focused tests and
`npm run check:self` from `ramify-agent/`. The full suite runs only through
ramify-audit, once on the baseline before iteration 1 and once on the final
implementation commit.

| Iteration | Change | Exit evidence |
| --- | --- | --- |
| 1. Catalog and creator | `plan-evidence`: element and catalog schemas, submission-local keys and ID assignment, `createPackage`; contract appendix written from the real schemas | Pure fixtures: four kinds rendered in order, recommendations last with the fixed sentence, a 1,400-character element rendered whole, the same element and deviation IDs give the same bytes, a missing ID is unavailable with its IDs named, only the named deviations are rendered and after the elements |
| 2. Extraction and acceptance | Intake, principle extraction and checker roles with prompts and schemas; initial architect reads the plan documents and submits functional elements; entries and scenario rule 6 cite them; checker corrections with ID retirement and re-citation; incorporation without passages; review stop projection shows kinds, findings and corrections; catalog frozen at acceptance | Scripted run: a plan with a Constraints section and two principles documents yields the expected element kinds; a scripted checker adds an omitted constraint and splits a cited functional element, the entry's citations follow, and both findings reach the review projection; an entry citing an unknown key is rejected with its path; `analysis-accepted` carries the catalog hash |
| 3. Selection and delivery | Selector fork over the element package; work-item package once, by hash afterwards; re-selection on an owner-adding placement; `citedElements` validated at submission; element, deviation IDs and hash on the assignment before `iteration-assigned`; engineer, contract, scope and code review, unresolved fork, and the three non-functional prompts render from the citing record; deviations and reconciliation conflicts cite elements; old routes and the stored package text deleted | Scripted run through the real ledger: byte-identical package text in the local architect's session, the engineer's brief, the contract session, the scope and code review messages, and after a session reconstruction rendered from the record alone; a deviation recorded after an assignment leaves that assignment's package unchanged; the trial's sentence-as-heading assignment cannot be submitted; a scope review runs with the package alone; the coordinator receives every `nfr-` and `fix-` element and no `rec-`; a placement decision adding an owner records a superseding selection |
| 4. Composition | Projections and web pages for the catalog and checker findings, and a package view rendered on demand from a citing record; run fixture; final audit | The scripted run exercises every consumer in the delivery table; `npm run check:self` and focused tests pass; the ramify-audit run on the final commit passes. A real Pi trial on a toolkit plan is reported separately and never inferred from scripted tests |

The harness stays the only durable writer. `plan-evidence` owns element,
catalog and package meaning; the harness owns extraction scheduling,
selection, recording, delivery and recovery. The contract appendix is
written in iteration 1; this plan does not claim its schemas already exist.
Token and byte measurements of the extraction turns, the packages and the
local architect's context are taken on the real trial, sampling only what
that one run produces.

## Acceptance matrix

| Case | Required observable result | Iteration |
| --- | --- | --- |
| EP01 | The catalog holds the four kinds with IDs, source document, text, conditions and uncertainty, and nothing byte-exact | 1–2 |
| EP02 | A whole-section element renders as one element, and five constraint bullets as five | 1–2 |
| EP03 | The same element and deviation IDs render to the same bytes for every consumer and after reconstruction, from the citing record and no stored package | 1, 3 |
| EP04 | No submission field carries a heading, line range, offset or passage for the harness to resolve | 2–3 |
| EP05 | An unknown element ID in an entry, an assignment or a deviation is rejected at submission with its path | 2–3 |
| EP06 | The checker corrects the catalog before IDs are final, every entry citation still resolves afterwards, and its findings are shown at the review stop without blocking acceptance | 2 |
| EP07 | The selector fork receives the non-functional, fixed and recommendation elements and answers with IDs; the work-item package is appended once and named by hash afterwards | 3 |
| EP08 | An owner-adding placement decision produces a superseding selection; earlier assignments keep their package | 3 |
| EP09 | Engineer, contract engineer, scope reviewer and code reviewer receive the identical assignment package | 3 |
| EP10 | The coordinator receives every non-functional and fixed element and no recommendation; investigation and repair receive the cited subset with text | 3 |
| EP11 | Recommendations render last under their own heading with the fixed sentence | 1, 3 |
| EP12 | A missing element makes a package unavailable and never partial | 1, 3 |
| EP13 | The initial architect's brief carries the plan documents and nothing rendered from the catalog, and its submission carries the functional elements its entries cite | 2 |
| EP14 | A deviation recorded after a package was delivered leaves that package's bytes unchanged and reaches the session as a separate append | 3 |

## Decisions to confirm before coding

1. **Principle extraction is guided by the plan's goal**, one document per
   turn, with no cross-run cache. The principles document leaves this open;
   the plan assumes it because it needs no new state and its cost can be
   measured on the first real run. The alternative, extracting every rule
   once per document hash and caching across runs, is deferred until that
   measurement exists.
2. **The checker runs once per source document and corrects directly**,
   plan and principles alike; its corrections are shown as findings at the
   review stop. Decided 2026-09-26. Skipping it for principles documents by
   policy is a possible saving if the trial shows their extractions
   faithful. The principles document says faithfulness is judged by one
   agent; a correcting checker is a stronger reading of that sentence and
   may deserve one clarifying clause there.
3. **The code reviewer receives the assignment package.** It is not in the
   principles document's list; the trial's code reviews show the need.
4. **Deviations and reconciliation conflicts cite element IDs.** This moves
   two more agent submissions off root-plan line numbers.
5. **Old runs are not read by the new harness.** The trial's records stay
   readable in their worktree by the commit that wrote them.
6. **Advice becomes recommendation**, with `rec-` IDs, as the principles
   document names it.
7. **No package store.** The citing record holds the element IDs, the
   deviation IDs and the hash; pi's session file and the harness transcript
   already keep the delivered bytes. Decided 2026-09-26.
8. **The initial architect reads the plan and its accompanying documents,
   not the catalog**, and submits the functional elements its entries cite.
   Decided 2026-09-26. The plan's non-functional and recommendation
   elements stay with the intake turn, because the trial showed the
   architect submitting an empty non-functional catalog when asked for
   both.
