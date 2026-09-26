# Plan 14 contract appendix

This appendix fixes the contracts [Plan 14](main-plan.md) built: the element
catalog and package creator of iteration 1, the extraction and acceptance of
iteration 2, the selection and delivery of iteration 3 and the projections of
iteration 4. The catalog schemas live in
`subs/harness/subs/plan-evidence/src/interfaces/catalog.ts`, which the child
exposes to the harness; the harness owns everything else named here. The
[implementation record](main-plan.md#implementation-record) lists where they
depart from the plan's text.

## Ownership

| Owner | Public contracts received by the harness | Dependencies it must not take |
| --- | --- | --- |
| `harness/plan-evidence` | `elementCatalogSchema`, `catalogElementSchema`, `submittedElementSchema`, `catalogDocumentSchema`, `elementConditionSchema`, `elementIdSchema`, `planDeviationIdSchema`, `packageDeviationSchema`, `elementRewriteSchema`, `packageCitationSchema`, `openElementCatalog`, `acceptElements`, `reviseCatalog`, `resolveCitations`, `serializeElementCatalog`, `elementCatalogHash`, `createPackage`, `contextNotice`, `recommendationNotice`, `deviationNotice` | Run service, ledger, agent, filesystem, Git, HTTP, scenarios, deviation records |

The file imports only `zod`, Node crypto and the `DocumentManifest` type of
its sibling contracts file. The harness remains the only durable writer.
Plan 13's `catalogSchema`, `passageReferenceSchema`, `resolvePassage` and
`resolvePlanReference` are removed.

## Element and catalog

An element has `id`, `kind`, `document`, `text`, `conditions` (each `text`
and `source: stated | inferred`), `uncertainty` (may be empty) and an
optional `locator`. The schema is strict, so a byte offset, span, hash or
exactness flag is rejected, and `text` has no size bound.

| Kind | ID | Captured document kind |
| --- | --- | --- |
| `functional` | `fr-NNN` | plan |
| `non-functional` | `nfr-NNN` | plan |
| `fixed` | `fix-NNN` | principle |
| `recommendation` | `rec-NNN` | plan or principle |
| `context` | `ctx-NNN` | plan |

The `non-functional` row follows the principles document: a non-functional
requirement of the plan comes from the plan's own constraints. Context
explains the situation a plan starts from; the reasoning of a principles
document is not context.

A `ramify-agent.element-catalog/1` record holds `manifestHash`, the captured
`documents` (`id`, `path`, `kind`), the `elements` in catalog order and the
`retired` IDs. The schema rejects a duplicate ID, a retired ID that is still
active, an element naming an uncaptured document and an element whose kind
its document cannot supply. `openElementCatalog` starts the empty catalog
from the manifest; the documents' paths are copied so a package can name
them without the manifest.

## Submission keys, IDs and citations

`submittedElementSchema` is an element body with a submission-local `key`
in place of `id`; a key shaped like an element ID is rejected, so a citation
is never ambiguous. `acceptElements(catalog, submitted)` parses each
submitted element itself and rejects a schema violation, a duplicate key or a
bad document with the submitted element's path (`<index>.key`,
`<index>.document`); otherwise it appends the elements in submission order,
numbering each kind past the highest issued or retired ID of that kind, and
returns the new catalog with the key-to-ID map. A retired ID is never issued
again.

`resolveCitations(citations, { keys?, elements }, path)` rewrites a
submission's keys through the map and accepts any ID in `elements`; any
other citation, including a retired ID, is an error at `<path>.<index>`. A
checker's re-citations use it; the initial architect's citations are checked
against its own keys and kinds, and an assignment's `citedElements` against
its work-item package.

`reviseCatalog(catalog, { rewrite, retire, add })` corrects a catalog before
it is frozen: a rewrite keeps an element's ID, kind and document, a retired
ID leaves the elements and joins `retired`, and added elements are numbered
past it. Errors carry `rewrite.<i>`, `retire.<i>` and `add.<i>` paths.

`serializeElementCatalog` writes sorted-key JSON with one trailing newline;
these are the bytes of the frozen catalog file. `elementCatalogHash` is the
SHA-256 of those bytes.

## Package creator

```text
createPackage({ catalog, planDeviations, elements, deviations })
  -> { text, hash, bytes } | { unavailable: { missing } }
```

`planDeviations` is every plan deviation of the run, in recorded order, as
`packageDeviationSchema` views: `id` (`pd-NNN`), `amends` (element IDs,
never context),
`authority` and the amended `text`. The harness derives them from its own
deviation records; this child never reads those records.

- The header names the catalog hash and the rendered element and deviation
  IDs. Elements follow grouped by kind (context, functional,
  non-functional of the plan, fixed, recommendation), in catalog order within a kind, each with
  its ID, kind, source document path, whole text quoted line by line, its
  conditions labelled `stated` or `inferred` and its uncertainty. The
  locator is never rendered.
- Context comes first under its own heading, after the fixed
  `contextNotice`. Recommendations come last under their own heading, after
  the fixed `recommendationNotice`. The named deviations follow all elements in
  recorded order, after `deviationNotice`, each with the elements it amends,
  its authority and its quoted text.
- The request's order and repetitions do not change the bytes. An unknown or
  retired element ID, an unknown deviation ID or an unknown element a named
  deviation amends makes the whole result unavailable, naming every missing
  ID. There is no truncation path. A malformed deviation, or two with one ID,
  is a harness defect and throws.
- `hash` is the SHA-256 of `text` and `bytes` its UTF-8 length.

## Extraction and acceptance

`src/analysis/extraction.ts` holds the three turns of the `catalog-extractor`
role, each a fresh read-only session given captured file paths, with a
procedure and a tool of its own in the `catalog-extractor/1` package:

| Turn | Tool | Submission | Accepted when |
| --- | --- | --- | --- |
| Intake, once | `submit_intake` | `goal`, `elements`, `incorporation` (`documents`, `missing`) | elements are `non-functional` or `recommendation` from plan documents; every plan document and missing reference judged once; no `required` gap |
| Principles, per principles document | `submit_principle_elements` | `elements` | elements are `fixed` or `recommendation` from that document |
| Checker, per captured document | `submit_catalog_check` | `corrections`, `entries`, `scenarios` | see below |

The initial architect (`initial-architect/3`, submission
`ramify-agent.initial-analysis/3`) submits `elements` (`functional` or
`context`, from plan documents) beside its entries, hypotheses and
scenarios; an entry's `requirementRefs` and `acceptanceRefs` cite functional
keys and its `contextRefs` context keys, and every scenario's `refs` cites
functional keys. Scenario form rule 6 holds when each acceptance element of
an entry is in the `refs` of one of its scenarios. Its brief carries the
root plan, the paths of the other plan documents and the plan scenarios of
the documents the intake incorporated; no document index and no catalog.
`acceptArchitectElements` numbers its elements and rewrites every key to
its ID.

A checker's correction is `add` (elements of its document), `rewrite` (an
element of its document, keeping ID, kind and document) or `replace`
(`retire` IDs of its document, add elements), each with a `reason`.
`reviseCatalog` applies them; `entries` and `scenarios` replace the named
entries' and scenarios' citation lists, citing new keys or active IDs.
`applyCheck` rejects, with paths, a correction outside the document, a
citation of a retired or unknown ID, a citation of the wrong kind and a
broken scenario form; otherwise it returns the catalog, the re-cited
analysis and one `CatalogFinding` per correction (`document`, `invocation`,
`action`, `reason`, `elements`, `retired`).

`analysis-accepted` commits the entries, work items (`requirementRefs`,
`acceptanceRefs`, `contextRefs` as element IDs) and scenarios, and carries
`catalog` counts by kind, `findings`, and `evidence`: the catalog file
`analysis/catalog/<hash>.json` (`serializeElementCatalog`, hash
`elementCatalogHash`) and the incorporation file
(`ramify-agent.document-incorporation/2`, without governing passages).
`readAcceptedEvidence` returns the frozen catalog, its hash, the
incorporation and the captured documents.

## Selection

The selector (`context-selector/2`) forks the oriented local architect and
receives the orientation packet and every `non-functional`, `fixed` and
`recommendation` element rendered by `createPackage`. It submits
`selected: [{ id, reason, conditions, uncertainty }]`; `prepareContextSelection`
rejects an unknown, a functional or context and a repeated ID with its path.
The selection record `ramify-agent.context-selection/2` holds the identity,
the judgments and `package`, a `packageCitationSchema` of the entry's
functional and context elements, the selected IDs and every plan deviation
recorded then. `context-selection-recorded { workItem, selection,
selectionHash, packageHash, supersedes? }` binds it; the latest selection of
a work item is its current one. `readRecordedContextSelection` renders the
package again and refuses a hash that differs.

## Delivery

`deliverPackage(catalog, planDeviations, citation)` renders a citation again
and is unavailable when an ID is missing or the bytes differ from its hash;
`citePackage` cites IDs that must render. The harness derives
`planDeviations` from its plan deviation records with `packageDeviation`.

| Consumer | Receives |
| --- | --- |
| Local architect | its orientation brief names the entry's element IDs; the work-item package is appended once after orientation, or carried once by the first prompt of a session that lacks it; every later brief names it by hash and IDs and renders the deviations recorded after it |
| Assignment | `citedElements` must be IDs of the current work-item package (error path `assignment.citedElements.N`); the record's `source` cites them with every deviation recorded at assignment, before `iteration-assigned` |
| Engineer, contract engineer | the assignment package (the requester's for a contract iteration), on a session's first prompt only |
| Code review, scope review | request `source`: the assignment package unchanged, or its elements with the deviations recorded at the request; rendered under "What the plan asks of it" |
| Unresolved global fork | the work-item package with every recorded deviation; `deviation.amends` names its non-context elements |
| Coordinator assessment and action | every `nfr-` and `fix-` element with every recorded deviation; assessment covers exactly those IDs |
| Investigation, repair | the elements they name, with every recorded deviation |

A plan deviation record holds `amends: [{ id, path, text }]` in place of
plan lines; a non-functional deviation holds `element: { id, document, text }`.

## Projections

The analysis query's `planEvidence` holds the catalog hash, every element by
kind (`ElementView`), the retired IDs, the checkers' findings
(`CatalogFindingView`), the non-required missing references and the
incorporation; each entry lists the elements it cites. Each iteration of the
work-item query carries `package`: its citation and the text rendered on that
request, or why it cannot be rendered. The run page shows the catalog, the
findings and the incorporation at the review stop, and the work-item page
each iteration's package.

## Evidence

`subs/harness/subs/plan-evidence/src/tests/catalog.test.ts` covers ID
assignment across three submissions, retired IDs, catalog revision,
document-kind rejection with paths, strictness and unbounded text, citation
resolution, deterministic serialization, the five kinds in order with
context first and recommendations last with their fixed sentences, context
refused from a principles document and as a deviation's amendment, a
1,400-character element with its own heading rendered whole, identical bytes
for reordered and repeated IDs, unavailability naming every missing ID, only
the named deviations after the elements, and the absent locator. The
harness's scripted-run tests cover the extraction turns, the checker's
corrections, selection, delivery and the projections.
