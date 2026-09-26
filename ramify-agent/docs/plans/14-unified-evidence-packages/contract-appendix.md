# Plan 14 contract appendix

This appendix fixes the element catalog and package creator contracts that
iteration 1 of [Plan 14](main-plan.md) implemented. The schemas live in
`subs/harness/subs/plan-evidence/src/interfaces/catalog.ts`, which the child
exposes to the harness. Nothing here claims a producer or consumer is wired:
the extraction turns, the recorded citing records and every delivery are
iterations 2 and 3. Plan 13's `catalogSchema`, `passageReferenceSchema` and
`resolvePassage` stay beside these contracts until their consumers move.

## Ownership

| Owner | Public contracts received by the harness | Dependencies it must not take |
| --- | --- | --- |
| `harness/plan-evidence` | `elementCatalogSchema`, `catalogElementSchema`, `submittedElementSchema`, `catalogDocumentSchema`, `elementConditionSchema`, `elementIdSchema`, `planDeviationIdSchema`, `packageDeviationSchema`, `openElementCatalog`, `acceptElements`, `resolveCitations`, `serializeElementCatalog`, `elementCatalogHash`, `createPackage`, `contextNotice`, `recommendationNotice`, `deviationNotice` | Run service, ledger, agent, filesystem, Git, HTTP, scenarios, deviation records |

The file imports only `zod`, Node crypto and the `DocumentManifest` type of
its sibling contracts file. The harness remains the only durable writer.

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
other citation, including a retired ID, is an error at `<path>.<index>`. The
initial architect's entries, checker re-citations and an assignment's
`citedElements` (with `elements` set to its work-item package) use it.

`serializeElementCatalog` writes sorted-key JSON with one trailing newline;
these are the bytes of `analysis/catalog.json`. `elementCatalogHash` is the
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

## Evidence

`src/tests/catalog.test.ts` covers ID assignment across three submissions,
retired IDs, document-kind rejection with paths, strictness and unbounded
text, citation resolution, deterministic serialization, the five kinds in
order with context first and recommendations last with their fixed
sentences, context refused from a principles document and as a deviation's
amendment, a 1,400-character
element with its own heading rendered whole, identical bytes for reordered
and repeated IDs, unavailability naming every missing ID, only the named
deviations after the elements, and the absent locator.
