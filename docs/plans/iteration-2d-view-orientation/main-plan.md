# Plan 2D: View orientation

**Date:** 2026-09-21. **Status:** draft for contract review; implementation has
not started. This plan adds to the two materialized views the orientation
facts their readers need and that the views do not yet carry, without changing
what any existing search returns. It follows
[Plan 2A](../iteration-2a-materialized-api-view/main-plan.md),
[Plan 2B](../iteration-2b-generated-views/main-plan.md) and
[Plan 2C](../iteration-2c-module-measurements/main-plan.md), all implemented.
It adds no owner, command, service operation or package entry. Everything the
preserved [Plan 3 draft](../iteration-3-project-inspection/main-plan.md)
proposed that does not belong in a view is the subject of the separate
[inspection successor](../iteration-3-inspection-successor/main-plan.md).

## Purpose of each view

The additions are selected by what each view is for, as the user stated on
2026-09-21.

- The **architect view** is used to find existing capabilities, to map a
  potential capability to an existing module, to decide whether a new module
  is needed, and to decide the scope of an implementation iteration: one
  module, or a module with some of its children and their whole subtrees.
- A module's **API view** lets an agent bound to that module orient itself in
  the project from that module's position: which foreign symbols it may use
  freely, and whose they are.

A fact that serves neither use is not added, even when it is cheap.

## Runnable outcome

After `ramify materialize --all --view architect` on a project with a running
daemon:

- every published API view has a `README.md` beside `_meta.json` that lists the
  provider modules of that source area, each with its identifier, header tags,
  purpose paragraph, entry counts and the directory of the view that holds its
  files;
- the architect view's `_meta.json` and `README.md` name every tag of the
  resolved registry with its kind; and
- the `module.json` of every module with children carries the dependencies
  that cross its subtree's boundary, in both directions.

Every file beneath `external/` and `children/`, and every `behavior.jsonl`,
`supporting.jsonl` and `tests.jsonl`, is byte-identical to the one the
starting build publishes for the same inputs.

## What exists

Verified against source on 2026-09-21, branch `ramify-agent` at `2395497`.
Recheck at iteration 1.

- `ApiViewAreaProjection` (`subs/analysis/src/interfaces/session.ts`) carries
  `area`, `root`, `files`, `coverage`, `detailsUnavailable` and `truncated`.
  An `ApiViewFile` has `category`, `definingFile` and `entries`. No projection
  field names the owning module of a defining file, its tags or its purpose.
- The API view renderer (`subs/daemon/src/api-view-documents.ts`) is pure. It
  renders one document per defining file as `<category>/<definingFile>.md` and
  `_meta.json` last. Nothing else is published in `.ramify/`.
- The agent instructions in `AGENTS.md` and the
  [API view specification](../../architecture/materialized-api-view.spec.md#agent-instructions)
  search exactly `src/.ramify/{external,children}` and
  `src/tests/.ramify/{external,children}`. A file directly in `.ramify/` is
  outside both searched paths.
- Plan 2C measures API-view bytes from one in-memory render of the same
  renderer, and MM07 requires those bytes to equal the published files' sizes.
  A new rendered file therefore changes `metrics.contextSize.*.views` in every
  architect `module.json` and must be rendered by the same path.
- `ArchitectModuleFacts` (`subs/analysis/src/interfaces/architect-view.ts`)
  carries identity, tags, areas, purpose, docs and file counts.
  `architect-render.ts` builds `uses` and `usedBy` per module from
  `DependencyDiagramFacts` boundaries under the production filter; no subtree
  aggregation exists in the architect renderer.
- The resolved registry (`ResolvedTagRegistry`, tag definitions with
  `kind: 'required-importer' | 'required-symbol'`) is part of the session
  state. Neither view publishes it. The architect view prints tag names on
  modules and symbols without their kind.
- Plan 2B's hit cost exceeds its thresholds on the toolkit, and the user
  deferred that on 2026-09-18. The costliest search was a module identifier.
  Plan 2C re-measured it; its archive is the baseline here.

## Decisions for contract review

Each decision ends in one proposal. RD-3 and RD-5 are the ones most likely to
change scope.

1. **RD-1: the provider map is a `README.md` directly in `.ramify/`.** It lies
   outside the searched paths, so no documented search gains a hit, and agents
   open a directory's README unprompted, as the architect view already relies
   on. The alternative, a header line in each generated document, multiplies
   module-identifier hits and is rejected.
2. **RD-2: a provider is a module that owns at least one entry of that area's
   view.** The map lists nothing else: no unavailable module, no blocked
   original and no reason. Presence still means available.
3. **RD-3: subtree dependencies are included.** They come from the user's
   stated scope-decision use, not from the Plan 3 draft. They are the only
   addition that adds lines to a searched file: each non-leaf module's
   `module.json` gains lines holding module identifiers. VO14 measures the
   growth. Dropping this decision removes VO08 to VO10 and nothing else.
4. **RD-4: tag kinds are always emitted.** An agent cannot know the default
   registry, and a project may add names of either kind. The cost is one
   `_meta.json` key and one `README.md` line.
5. **RD-5: both published schemas keep their identity.** `README.md` is a new
   file beside `ramify.api-view/1`'s `_meta.json`, and `tagKinds` and `subtree`
   are additive keys of `ramify.architect-view/1` and
   `ramify.architect-module/1`, as Plan 2C's `metrics` was. The ephemeral
   projection schemas are internal and change freely. The alternative is `/2`
   for the two architect documents; choose it if a consumer is known to
   reject unknown keys.
6. **RD-6: no test-scope consumer lists.** A test file's use of a foreign
   symbol is already recorded by `exercises` in `tests.jsonl`, which a search
   for `<module>#<name>` finds. Widening `dependencyScope` would lengthen
   records that already exceed the 500-character line.

Facts considered and not added, with the successor plan as their place:
reasons for type-only or blocked availability, visible-but-blocked originals,
exposure declarations and ineffective exposures, denied accesses, file-level
usage, import specifiers, and full documentation. A source area's profile is
not added anywhere: it is `testing` plus the header's required-importer tags,
which `tags` and RD-4's kinds already give.

## Contract

### API view `README.md`

One per published area, at `<module>/src/.ramify/README.md` and
`<module>/src/tests/.ramify/README.md`. UTF-8, LF, terminating newline, no
timestamp or host path. In this order:

1. The fixed instruction block as a `text` code fence: the area's own lines of
   the specification's [agent instructions](../../architecture/materialized-api-view.spec.md#agent-instructions),
   with one added line, `This file lists the modules that provide them.`
2. One line: `Module <module> · area <ordinary|tests> · revision <revision>`.
3. `## children`, then `## external`; a heading is omitted when its category
   has no provider. An area with no provider has the line
   `No foreign API is available to this area.` instead of both.
4. Under each heading, one entry per provider in module-identifier byte order:

```markdown
- **workspace/contracts** [dispatch] — Defines the vocabulary every workspace module shares: …
  14 symbols · 3 type-only · external/subs/workspace/subs/contracts/
```

- The first line is the provider's identifier, its header tags in brackets
  separated by `, ` when any, and its purpose paragraph cut at 600 UTF-8 bytes
  on a character boundary with `…` when cut, or `(no README purpose)`. There
  is no fallback to another owner's prose.
- `symbols` counts the provider's entries in this view and `type-only` the
  ones marked `[type-only]`; `· N type-only` is omitted when zero.
- The path is the category followed by the provider's project-relative
  directory and `/`. It is a prefix of every generated file of that provider;
  a nested provider's files also lie beneath its ancestor's prefix, and each
  entry is counted for its owning module only. The root module's prefix is
  the category alone.

`_meta.json` is unchanged. The README is written before `_meta.json`, which
stays last, and is removed and replaced with the rest of the directory.

`ApiViewAreaProjection` gains `providers`, in the order above:

```ts
export interface ApiViewProvider {
  readonly module: ModuleId;
  readonly directory: string;                 // project-relative; '' for the root module
  readonly category: ApiViewCategory;
  readonly tags: readonly TagName[];          // header tags
  readonly purpose: { readonly state: 'present'; readonly text: string } | { readonly state: 'missing' };
  readonly entries: number;
  readonly typeOnly: number;
}
```

`analysis` computes it from the facts the projection already reads; `daemon`
renders it. `purpose.text` is uncut in the projection and counts toward
`bytes`; the renderer cuts it. The README's bytes count toward `maxAreaBytes`
and the invocation ceiling like any document.

### Architect `_meta.json` and `README.md`: tag kinds

`_meta.json` gains one key after `metrics` and before the exceptional counts:

```json
"tagKinds":{"requiredImporter":["dispatch","testing","ui"],"requiredSymbol":["browser"]}
```

Both arrays are always present, in byte order, and hold every tag of the
resolved registry of the view's revision. `README.md` gains one line directly
after the revision line:

```text
Tags · required importer: dispatch, testing, ui · required symbol: browser
```

A kind with no tag reads `none`. The instruction block is unchanged.

### Architect `module.json`: subtree dependencies

A module with at least one child gains, directly after `usedBy`:

```json
"subtree": {
  "uses": [
    { "module": "ramify/cli", "behavioral": 1, "nonBehavioral": 4 }
  ],
  "usedBy": [
    { "module": "ramify/daemon", "behavioral": 6, "nonBehavioral": 9 }
  ]
}
```

- `uses` counts, per owning module outside the subtree, the distinct originals
  that any module of the subtree depends on. `usedBy` counts, per consuming
  module outside the subtree, the distinct originals owned in the subtree that
  it depends on. Dependencies between two modules of the subtree are absent.
- An original is counted once per pair with the architect view's existing
  precedence: behavioral, else unknown, else non-behavioral. `unknown` is
  present only when nonzero. Ordering and layout follow `uses` and `usedBy`.
- The key is absent for a module without children, whose own lists already
  are its subtree's, and absent when `_meta.json` records dependencies as
  unavailable. The root module's arrays are present and empty.
- The facts, the production filter and the revision are those of `uses` and
  `usedBy`. The `README.md` map is unchanged.

### Specifications changed

The [API view specification](../../architecture/materialized-api-view.spec.md)
gains the README under Locations and a section after Metadata, and its agent
instructions gain the one line. The
[architect view specification](../../architecture/architect-view.spec.md)
gains `tagKinds`, the README line and `subtree`. `AGENTS.md` and the
module-architect skill's `references/access.md` repeat the changed API
instruction block. No principles document changes.

## Non-pollution invariant

This is the plan's first acceptance condition, not a preference.

- For identical inputs, every file under `external/` and `children/`, every
  `behavior.jsonl`, `supporting.jsonl` and `tests.jsonl`, and the architect
  `README.md` apart from its one new line, are byte-identical before and after
  this plan.
- The only changed bytes of existing files are: the architect `_meta.json`
  key, the architect `README.md` line, `subtree` in non-leaf `module.json`
  files, and the `views` byte values in every `module.json` `metrics` block,
  which grow by exactly the README sizes.
- The two documented API searches return identical output before and after.

Iteration 1 archives the baseline before changing source.

## Exposure

`ApiViewProvider` joins the API projection types in `analysis`'s
`interfaces/session.ts`, already exposed to its parent and received by
`daemon` through the root. The architect additions are fields of types that
`interfaces/architect-view.ts` already exposes. `npm run check:self` must show
no new exposure line beyond the one type.

## Iterations

| Iteration | Delivers | Owner | Prerequisite |
| ---: | --- | --- | --- |
| [1](iterations/iteration1.md) | Baseline archive; specification text; `providers` in the API projection; tag kinds and subtree dependencies in the architect projection and renderer | `analysis` | none |
| [2](iterations/iteration2.md) | API view `README.md` rendering and publication; view-byte equality with Plan 2C; instruction blocks | `daemon` | 1 |
| [3](iterations/iteration3.md) | Toolkit and reference evidence, the invariant, hit cost and budgets; completion report; roadmap | evidence | 2 |

## Acceptance

| ID | Iteration | Case |
| --- | ---: | --- |
| VO01 | 1 | The API projection of the reference fixture lists, per area, exactly the modules owning at least one entry, in byte order, each with its category, directory, header tags and counts; `entries` sums to the area's entry total and `typeOnly` to its type-only total. |
| VO02 | 1 | A provider without a README purpose is `missing`; no other owner's prose is used. A nested provider's entries are counted for it and not for its ancestor. An area with no entries has no provider. |
| VO03 | 1 | The ordinary and tests areas of one module list different providers and counts where the testing profile changes availability; an original that is type-only in ordinary source and a value in tests moves between the counts. |
| VO04 | 1 | Provider purposes count toward `bytes`; a projection one byte over an injected `maxAreaBytes` is refused whole, and the at-limit one succeeds. |
| VO05 | 1 | `_meta.json` carries `tagKinds` with every registry tag under its kind in byte order, in the pinned key position. A registry with an added tag of each kind and one with no required-symbol tag render correctly, the second as an empty array and `none`. |
| VO06 | 1 | The architect `README.md` carries the tags line directly after the revision line; every other line of the fixture's golden README is unchanged. |
| VO07 | 1 | Matching and rendering of tag kinds depend on the registry's kind, never on a tag's name: renaming `browser` in a fixture registry moves nothing but the name. |
| VO08 | 1 | For the architect fixture, a non-leaf module's `subtree.uses` and `subtree.usedBy` equal an independent aggregation of the boundary facts; dependencies within the subtree are absent; an original used by two modules of the subtree counts once. |
| VO09 | 1 | Leaf modules have no `subtree` key; the root has two empty arrays; with dependencies unavailable no module has the key. Key order and layout are pinned by golden files. |
| VO10 | 1 | Classification precedence across the subtree: an original behavioral for one inside consumer and non-behavioral for another counts as behavioral. |
| VO11 | 2 | The rendered README matches its golden for ordinary and tests areas, for an empty area, for a cut purpose on a multibyte boundary and for the root module as provider. It is written before `_meta.json`, replaced with the directory, and left untouched by a failed or cancelled publication. |
| VO12 | 2 | Plan 2C's view bytes from the in-memory render still equal the published file sizes per owner and area, README included, and an unchanged project republishes zero bytes. |
| VO13 | 3 | The non-pollution invariant holds on the toolkit and the reference project against iteration 1's baseline: a recursive byte comparison reports only the changes the invariant names, and both documented API searches produce identical output for the recorded term list. |
| VO14 | 3 | Hit cost on the toolkit is re-measured with Plan 2C's recipe and term list. Every added hit line is one of the named additions; a module-identifier term gains at most two hit lines per non-leaf module, one in each `subtree` list. The result is compared with Plan 2C's archive and reported as a delta; Plan 2B's failed thresholds are not claimed as passed. |
| VO15 | 3 | Warm toolkit budgets from Plan 2C still hold: 15 s architect session query, 90 s whole architect materialization, 8 MiB published architect view, zero bytes on an unchanged repeat. API view totals and the largest README are recorded for the toolkit, the reference project and S100. |
| VO16 | 3 | `npm run check:self` passes with `ApiViewProvider` as the only new exposed name; `AGENTS.md`, the skill reference and both specifications carry the delivered text; Plan 2A's, 2B's and 2C's focused suites pass on the same build. |

`api` evidence calls the owners' operations directly; VO11 to VO12 use the
daemon's publisher tests and VO13 to VO15 the installed executable against a
real daemon. A quick run never replaces VO13 to VO15.

## Completion gate

All cases have evidence. Both specifications, `AGENTS.md` and the skill
reference describe the delivered files. The completion report records VO01 to
VO16, the baseline and final archives, the hit-cost delta, the measured sizes
and the disposition of RD-1 to RD-6. The roadmap's Plan 2D row and brief are
advanced to implemented.

## Handoff

To the [inspection successor](../iteration-3-inspection-successor/main-plan.md),
Plan 4 and Plan 7: the provider map's contract, the tag-kind keys, the subtree
dependency semantics, and the hit-cost delta as further evidence for the
query-interface or split-view choice that Plan 2B left to the user.

## Out of scope

Any change to a generated API document or to a JSONL record; blocked or
unavailable originals in any view; availability reasons; exposure declarations;
denied accesses; file-level or test-scope usage lists; import specifiers;
staleness detection; any new command, operation, capability or schema
identity; interpretation, ranking or recommendation; the hit-cost overages
Plan 2B deferred.
