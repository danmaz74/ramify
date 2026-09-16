# Plan 2B scope and semantic decisions

**Status:** draft review package for [Plan 2B](main-plan.md), prepared
2026-09-15. Plan 2A's
[specification](../../architecture/materialized-api-view.spec.md) remains
authoritative for the API view. This document fixes the semantics of the
generic view layer and the two new views.

## Analysis invariance

Materialization only produces output. For identical project inputs, a session
that also materializes must publish the same revisions, reports, findings,
coverage and session counters as a session that does not.

Plan 2B restores three Plan 2A mechanisms that touch the analysis path:

1. **Decisions.** `decisions.ts` returns to its text before Plan 2A.
   `listAvailableOriginals` asks the public `explainImport` for each foreign
   original with a `value` request and, when that is denied, a `type-only`
   request. A listed form is exactly an allowed decision, so enumeration cannot
   drift from enforcement.
2. **Scheduling.** The per-context queue holds check requests only. A
   materialization obtains its revision by submitting an ordinary synchronized
   check through the unchanged path, then queries the session at that revision's
   sequence. If the session has advanced, the query returns `superseded` and
   nothing is published.
3. **Session query.** The query reads that sequence's facts and never promotes,
   records or reconciles observed inputs. A released compiler may be recreated
   from captured inputs. When a recreated compiler reads content whose identity
   differs from the captured identity, the query returns `superseded` and leaves
   the session state untouched.

The reserved-output table is the only analysis-side effect of views. It removes
generated output from inputs; it does not change the analysis of any other path.

## Reserved outputs

`analysis/project` owns one static table. Each entry reserves a target and its
transient siblings `<target>.tmp-<suffix>` and `<target>.old-<suffix>` and
their `.marker.json` files.

| View | Kind | Target |
| --- | --- | --- |
| `api` | area segment | `.ramify` directly beneath any module `src/` or `src/tests/`, and anywhere else as in Plan 2A |
| `exported-symbols` | root path | `.exported_symbols` |
| `module-docs` | root path | `docs/modules` |

A project-relative path is reserved when any segment is a reserved area segment
or its transient form, or when the path equals or lies beneath a reserved root
path or its transient form. Near misses such as `.exported_symbols2`,
`docs/modules-old` and `docs/module` remain ordinary.

The table is applied before inventory classification, explicit compiler
selection, configuration globbing, capture, observation, watcher admission and
overflow sweeps. It is also applied to symlink resolution: a compiler or watcher
path reached through `docs/modules` is reserved even though its target is
module source.

Plan 2B keeps Plan 2A's sibling staging scheme, so recovery of a crash left by
a Plan 2A publisher still works.

## Views and targets

A view has an identifier, a scope and a pure projection:

- `module-area` views (only `api`) produce targets inside selected module
  source areas.
- `project` views produce one target at their reserved root path and ignore
  module selection.

`ramify materialize` without `--view` runs every registered view. `--view`
may repeat; unknown or duplicate identifiers are invalid arguments. A view that
has nothing to publish still produces its target with only its metadata file,
if it has one, so absence and emptiness stay distinct.

### Replacing an existing target

The publisher replaces a project-view target only when the path is absent, or
when every entry beneath it matches that view's generated shape:

- `.exported_symbols`: directories named by module names, the three `.txt`
  names and one top-level `_meta.json`, all regular files or directories.
- `docs/modules`: directories named by module names and symlinks named `docs`,
  with no regular files.

Anything else, including a user file placed there, refuses the invocation with
`invalid-path` and changes nothing. A symlink in any ancestor of a target always
refuses the invocation.

## Exported-symbols view

### Layout

`.exported_symbols/` mirrors the module tree: a module's directory is its
identifier without the root module's name. The root module's three files sit
directly in `.exported_symbols/`; module `collection-review/workspace/reviews`
uses `.exported_symbols/workspace/reviews/`. Every inventory module has a
directory and all three files, even when a file lists nothing.

`_meta.json` is one line:

```json
{"schema":"ramify.exported-symbols/1","revision":"rev/1:...","modules":15}
```

Nonzero `coverage`, `detailsUnavailable` and `truncated` counts follow, as in
Plan 2A.

### Common text format

Each file is UTF-8 with LF line endings and one final newline. It starts with a
header naming the module identifier and its project-relative directory, then
one section per defining file in byte order. Entries within a file are in byte
order of export name. Signatures come from Plan 2A's symbol-detail provider with
its frozen bounds: class entries include public members, interface entries
include every member, and bodies never appear. Each signature line is indented
four spaces.

### `exposed-symbols.txt`

Lists the module's own originals that the module exposes, from effective owned
exposures (`provider === null`, `module === original.owner`), plus names the
module re-exposes from a direct child.

```text
module collection-review/workspace/reviews (subs/workspace/subs/reviews)

== subs/workspace/subs/reviews/src/router.ts
createReviewsRouter -> parent
    function createReviewsRouter(deps: ReviewDeps): ReviewsRouter;

== subs/workspace/subs/reviews/src/tests/fixture.ts [testing]
makeReviewFixture -> parent [testing]
    function makeReviewFixture(): ReviewFixture;

== relayed
InspectionPort <- core -> parent
validateRevisionChain <- validation -> descendants
```

- An entry line gives the exposed name, `-> ` and its destinations joined by
  `, `, then the original's tags in brackets when any exist. An exposure alias
  appears as `alias = exportName`.
- Testing-classified defining files are marked `[testing]` in their section
  header.
- The `relayed` section lists `expose-sub` selections with `<- child`, without
  signatures; the child's own file holds them.
- Ineffective exposures are listed in a final `ineffective` section with the
  same entry syntax.

### `internal-exports.txt`

Lists every export name in files owned by the module whose original is owned by
the module and is not the original of any owned exposure. Testing-area files
are included and marked `[testing]`. Forwarding re-exports of foreign originals
and namespace exports are excluded; they are not the module's capabilities.

```text
module collection-review/workspace/reviews (subs/workspace/subs/reviews)

== subs/workspace/subs/reviews/src/runtime-helpers.ts
normalizeRevision
    function normalizeRevision(input: RevisionInput): Revision;
```

### `tests.txt`

Lists test suites and cases in testing-classified source owned by the module:
the module's `src/tests/` area and, for a module with the `testing` header tag,
its ordinary area.

```text
module ramify/analysis/model (subs/analysis/subs/model)

== subs/analysis/subs/model/src/tests/decisions.test.ts
describe explainImport  :12
  // Import decisions follow the testing and tag requirements.
  describe testing origin  :14
    it denies ordinary source from importing testing originals  :15
    it.skip allows compatible testing source  :22
  test.each <dynamic: `${kind} import`>  :40

== subs/integration-tests/src/features/collection-review.viz.feature
Feature Collection review  :1
  Scenario Reviewer approves a record  :8
  Scenario Outline Reviewer rejects <reason>  :20
```

- TypeScript and JavaScript suites use the call names `describe`, `suite`,
  `context`, `it` and `test`, with the modifiers `.skip`, `.only`, `.todo`,
  `.concurrent`, `.sequential`, `.fails` and `.each`, as written.
- A string or no-substitution template literal is shown verbatim. Any other
  title is `<dynamic: expression>`, bounded to 120 UTF-8 bytes, and is never
  evaluated.
- Nesting follows the static call nesting of callback arguments. Calls inside
  loops or helper functions are listed where they appear lexically, with no
  attempt to expand them.
- A description is the first paragraph of a JSDoc or line comment immediately
  above the call, normalized to one line of at most 512 UTF-8 bytes.
- Gherkin `.feature` resources list `Feature`, `Rule`, `Background`,
  `Scenario` and `Scenario Outline` titles with their line numbers.
- Line numbers are one-based and follow two spaces and a colon.

## Module-docs view

`docs/modules/` mirrors the module tree in the same way as `.exported_symbols/`. For each module whose
`src/docs` is a real directory in the inventory, the view writes one relative
symlink named `docs` pointing to that directory. A module without `src/docs`
gets no symlink; its directory exists only when a descendant needs it.

The symlink target is the relative path from the symlink's directory to
`<module directory>/src/docs`, using `/`. The publisher never follows the
symlink, compares it with `readlink`, and refuses a target that would leave the
project root.

`docs/modules` has no metadata file. `ramify materialize` reports the revision
used.

## Publication

One invocation stages every changed target of every selected view before
switching any target. Unchanged targets are neither rewritten nor renamed.
A switch failure rolls back every switched target in reverse order. Symlink
entries are created in the stage with their final relative text. Plan 2A's
limits apply per target and per invocation. A project-view target counts as one
area for `maxAreaBytes`.

## Revision behavior

All views of one invocation use one revision. Import violations do not block a
view. Invalid, incomplete, unavailable, superseded or resource-limited analysis
publishes nothing and preserves every previous target.

## Review decisions

Iteration 1 confirms or replaces each proposed default before production work.

| Decision | Proposed default |
| --- | --- |
| Views owner | New `analysis/views` owner, the twelfth, as a child of `analysis`. Alternative: keep views inside `analysis`. |
| Git treatment | `.exported_symbols/` and `docs/modules/` are gitignored like `.ramify`. |
| Relayed exposures | Listed without signatures in a `relayed` section of `exposed-symbols.txt`. |
| Test-area exports | Included in `internal-exports.txt` and marked `[testing]`. |
| Test sources | Vitest-style calls and Gherkin features. |
| Test descriptions | Titles plus the first paragraph of the adjacent comment. |
| Symlink name | `docs`; module `README.md` files are not linked. |
| Default views | Every registered view. |

## Explicit deferrals

- running tests or importing test results;
- dynamic test title evaluation or expansion of generated suites;
- exposure proposals or rankings derived from internal exports;
- views beyond `api`, `exported-symbols` and `module-docs`;
- Windows symlink behavior;
- changing Plan 5's S500 and S1000 support to obtain measurements.
