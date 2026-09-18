# Materialized API discovery view

**Date:** 2026-09-15. **Status:** Implemented by
[Plan 2A](../plans/iteration-2a-materialized-api-view/main-plan.md); its
[completion report](../plans/iteration-2a-materialized-api-view/iterations/iteration10-results.md)
records measured limits and the one remaining gap. `ramify materialize`
publishes the view described below exactly as specified; the frozen numeric
bounds in [contracts.md](../plans/iteration-2a-materialized-api-view/contracts.md#revision-iteration-1-2026-09-15)
are evidence-backed, not candidates. The one open item is platform evidence:
Linux and macOS byte-identical output is measured on Linux only, since this
implementation ran with no macOS runner available; the completion report names
the exact command and archive path a macOS host still needs to run.
[Plan 2B](../plans/iteration-2b-generated-views/main-plan.md) adds `--view`,
which selects this view, the [architect view](architect-view.spec.md) or both;
without it the command, its request and this view's bytes are unchanged.

## Purpose

Give coding agents a local, searchable description of every foreign Ramify API
available to the source they are editing. The description is generated beneath
the consuming module's source area and searched with ordinary filesystem tools,
especially `rg`. Discovery does not require an MCP query or an interactive
Ramify search command.

The view is derived documentation. It creates no visibility, availability,
ownership, exposure or source dependency. The
[importability principles](../model/cross-module-importability.principles.md)
remain authoritative for those rules, and the
[TypeScript interpretation](../model/typescript-source-interpretation.principles.md)
remains authoritative for original bindings and export names.

## Scope

The view contains foreign originals that are available as values or types in
one source area. It excludes:

- the consuming module's own symbols;
- foreign originals blocked for both value and type imports;
- packages, built-ins and standard-library declarations outside the Ramify
  application source set;
- explanations of unavailable symbols, observed usage and proposed exposure
  declarations.

The latter queries may have separate commands or later clients. They are not
part of API discovery through this view.

## Locations

**Revision (user decision, 2026-09-15).** Materialization must only produce
output; it must not change how the project is analyzed. The materializer
therefore never creates `src/` or `src/tests/`. A module's ordinary view lives
at `<module>/src/.ramify/` only when `<module>/src/` already exists; a module
without `src/` owns no source, so nothing would read its ordinary view, and
selecting it yields zero targets rather than a created directory.

For a module at `<module>` whose `src/` already exists, ordinary-source
documentation lives at:

```text
<module>/src/.ramify/
├── _meta.json
├── external/
│   └── <project-relative-defining-file>.md
└── children/
    └── <project-relative-defining-file>.md
```

When `<module>/src/tests/` already exists, its complete testing-source
documentation lives at:

```text
<module>/src/tests/.ramify/
├── _meta.json
├── external/
│   └── <project-relative-defining-file>.md
└── children/
    └── <project-relative-defining-file>.md
```

The materializer must not create `src/` or `src/tests/` solely to hold a view.
An absent ordinary or testing source area therefore remains absent.

The exact directory name `.ramify` is reserved for generated Ramify output.
Users must not edit it or store other files there. A materializer may replace
its complete contents.

## Ordinary and testing views

`src/.ramify/` is the complete foreign API view for the module's ordinary
source area.

`src/tests/.ramify/` is the complete foreign API view for the module's testing
source area. It is computed independently with the testing profile and repeats
ordinary entries that remain available there. An original that is type-only in
ordinary source but value-available to testing source appears as a value entry
in the testing view.

A testing-source consumer searches only `src/tests/.ramify/`. It never needs
to combine that view with `src/.ramify/` or apply overlay precedence. The
intentional duplication makes each source area's discovery surface
self-contained.

## Child and external partition

Every entry occurs in exactly one category, determined from the original
owner rather than from an arbitrary effective exposure path:

- `children/` contains an original owned by a proper descendant of the
  consuming module. The first descendant beneath the consumer is its direct
  child grouping, even when the original is owned more deeply in that child's
  subtree.
- `external/` contains an original owned outside the consuming module's
  subtree. This includes originals owned by ancestors, siblings and cousins
  that an ancestor exposes to descendants. It does not mean an npm package.

An original reachable through redundant exposure paths is not duplicated.
The owner relationship alone selects its category.

## Mapping a defining file to a generated file

One generated Markdown file represents one defining application file. Its
path after `external/` or `children/` is the defining file's path relative to
the selected project root, with `/` separators and `.md` appended without
removing the original extension.

For example, this defining file:

```text
subs/workspace/subs/contracts/src/interfaces/vocabulary.ts
```

becomes:

```text
src/.ramify/external/subs/workspace/subs/contracts/src/interfaces/vocabulary.ts.md
```

The generated path therefore carries the defining file and its physical
provider location. Neither is repeated in the document. Appending `.md`
keeps `api.ts`, `api.js`, `api.css` and `api.ts.md` unambiguous.

Only files with at least one entry are emitted. Empty categories contain no
placeholder document; `_meta.json` distinguishes a current empty category
from a missing view.

The defining path is not a ready-to-paste import specifier. Relative
TypeScript specifiers depend on the directory of the file being edited. An
agent derives the specifier from the generated path and the actual importing
file, replacing the source extension according to the project's resolution
rules. A materialized view must not claim one module-wide relative specifier
is correct from every nested source directory.

## Markdown representation

Entries are grouped by defining file through the generated filename and
ordered by export name in byte order. One entry represents one importable
defining-file export name and original pair.

The compact form is:

````md
## `recordIdSchema`

```ts
const recordIdSchema: ZodString
```

Identifier of a catalog record.

## `RecordId` [type-only]

```ts
type RecordId = string
```

Identifier used by catalog records.
````

The representation follows these omission rules:

- Presence means available. Never emit an `availability` field.
- Value availability is the default. Emit `[type-only]` only when a value
  import is forbidden but a type-only import is permitted.
- The signature conveys symbol kind. Never emit a separate kind field.
- The generated filename conveys the defining file and physical provider.
  Never repeat either in the content.
- Do not emit tags, original identifiers, exposure paths, availability
  reasons or exposure aliases. They have already contributed to the decision
  or are not needed to write an import.
- Emit at most the first useful documentation paragraph. Omit it entirely
  when no documentation exists; do not emit a placeholder.
- Normalize a signature to the bounded, body-free form defined by the source
  detail contract. Preserve overloads only when they distinguish callable
  forms an agent may need.
- Emit `[truncated]` or `[details-unavailable]` only on the affected entry and
  only when that exceptional state applies.

The defining file's export name is the heading. A Ramify exposure alias is not
a TypeScript import name and does not appear. Forwarding retains the original;
the entry remains under its defining file.

## Metadata

`_meta.json` is a deterministic single-line JSON document. A successful
ordinary view has the minimum shape:

```json
{"schema":"ramify.api-view/1","module":"workspace/reviews","area":"ordinary","revision":"rev/1:..."}
```

The testing view uses `"area":"tests"`. The module identifier is
needed because physical directories and declared module names are distinct.
The revision identifies the one completed analysis from which every entry in
that view was derived.

Exceptional counts are optional and appear only when nonzero:

```json
{"schema":"ramify.api-view/1","module":"workspace/reviews","area":"ordinary","revision":"rev/1:...","coverage":2,"detailsUnavailable":1,"truncated":3}
```

`coverage` means source-analysis limits may have omitted APIs, so absence from
the view must not be interpreted as proof that no matching API exists.
`detailsUnavailable` and `truncated` count the entry markers. Complete views do
not repeat zero-valued fields.

## Materialization

The terminating command is:

```sh
ramify materialize [--from <path>] [--all] [--root <dir>]
ramify materialize --view <api|architect>... [--from <path> | --all] [--root <dir>]
```

Without `--all`, the working directory or `--from` resolves to one module and
the command refreshes, when the ordinary source area exists, that module's
ordinary view, and, when the testing source area exists, its complete testing
view. A module with neither area present refreshes zero targets, successfully.
`--all` refreshes every module in the selected project the same way. Project
selection follows the existing CLI invocation contract.

`--view` names the generated views of one invocation: `api`, this view, and
`architect`, the project's [architect view](architect-view.spec.md). It may
repeat, once per view. Without `--view` the command materializes this view
alone, and its request and output are exactly those without Plan 2B. `--from`
and `--all` select this view's modules, so they are invalid invocations
(exit 2) when `--view` omits `api`. Every requested view comes from the same
synchronized revision and is published in one transaction: a failure while
switching restores every target. The request carries `views` only when
`--view` is given; a daemon whose welcome lacks the `materialize-views`
capability answers `incompatible-service`, exit 2. The success output keeps
its two lines and adds one line for the architect view.

Materialization has these guarantees:

1. It synchronizes once and derives every output in the invocation from the
   same completed, valid revision.
2. It computes availability from the definitive model and obtains bounded
   signatures and documentation from that revision's compiler state.
3. If a current valid view cannot be produced, it exits without replacing the
   previous complete view and does not describe the old view as current.
4. It stages complete replacement content, publishes `_meta.json` last and
   removes files that no longer correspond to available APIs.
5. It compares bytes before writing. Repeating materialization for the same
   result performs no file writes.
6. It refuses a `.ramify` path that is or traverses a symbolic link.
7. It reports success only after every requested module view has been
   published. Cancellation or a partial write is not success.

Ordinary `ramify check` remains read-only. A post-write integration may invoke
`ramify materialize`, but materialization is not an implicit side effect of a
check.

## Generated-output isolation

Although the API descriptions are Markdown rather than TypeScript, Ramify's
project inventory otherwise treats files beneath `src/` as owned resources.
Both `.ramify` locations must therefore be excluded before directory contents
become application inputs.

The project loader, retained observer, compiler input adapter and filesystem
watcher must treat `.ramify` as generated output. Creating, replacing or
deleting a view must not:

- add an application source or resource;
- change an analysis input identity;
- publish another revision;
- trigger a reconciliation or audit; or
- make an ordinary or testing source area exist when it was previously absent.

The generated files cannot be named by `expose-src` or `expose-test`, imported
as application resources or used as evidence for a module boundary.

Projects gitignore the generated directories. A root rule may reserve the
name everywhere:

```gitignore
**/.ramify/
```

Git ignoring is not the runtime exclusion: Ramify applies the isolation above
even when a project uses no Git repository or has a different ignore file.

The architect view's `.ramify-architect` and its staging siblings
`.ramify-architect.tmp-<suffix>` and `.ramify-architect.old-<suffix>` are
reserved the same way, at any depth.

**Known gap (Plan 2B iteration 8, 2026-09-18).** The retained session's
compiler lists directories without omitting reserved names, and reports what
it lists to the observer. A resident session opened while generated views
exist therefore records each `.ramify` and `.ramify-architect` directory it
lists as an observed input, so its input identity differs from a batch check
of the same project. Publishing or replacing a view still starts no revision,
and a session opened before the views existed is unaffected. The
[iteration 8 results](../plans/iteration-2b-generated-views/iterations/iteration8-results.md)
record the witness.

## Agent instructions

The project's `AGENTS.md` must tell agents that the view is generated, hidden
from ordinary recursive searches and searched by passing its path explicitly.
From a module root, the operational instructions are:

```text
Search generated foreign API documentation before inventing a cross-module API.

Ordinary source:
  rg -n -i -C 6 '<terms>' src/.ramify/{external,children}

Testing source:
  rg -n -i -C 6 '<terms>' src/tests/.ramify/{external,children}

Each view is complete for its source area; do not combine them.
The catalogs are generated and gitignored. Never edit or import from them.
Refresh a missing or stale view with `ramify materialize --from <path>`.
If materialization reports coverage limits, absence is not proof that no API exists.
```

An explicit `.ramify` path makes `rg` traverse the hidden, ignored directory.
Broad `--hidden --no-ignore` searches are neither required nor recommended.

## Determinism and bounds

Identical project inputs, registry, compiler configuration and Ramify version
produce byte-identical view contents. Generated documents contain no timestamp,
absolute host path, process identifier or context-specific timing.

The Plan 2A probes must measure, on the reference project and the 100-, 500- and
1,000-owner fixtures:

- generated file count and bytes;
- duplicated bytes across consumer modules and source-area views;
- warm materialization latency;
- bytes written for an unchanged repeat;
- peak memory while projecting every module; and
- the largest ordinary and testing views.

No limit may silently truncate the available set. A resource limit makes the
requested materialization unavailable and preserves the previous complete
view. Detail-specific bounds may emit the explicit exceptional markers above.
Binding budgets are selected from the probes during Plan 2A's contract review.

## Acceptance evidence

Implementation requires independent evidence that:

- every ordinary entry is available in that module's ordinary source area and
  every completely blocked original is absent;
- every testing entry is available in the testing source area and every
  test-available foreign original is present without consulting the ordinary
  view, while every completely blocked original is absent;
- descendant-owned and outside-subtree originals land in `children/` and
  `external/` respectively, including redundant exposure paths;
- each generated path maps reversibly to the original defining file;
- an import derived for a real consumer file passes `ramify check`, while a
  type-only entry imported as a value is denied;
- ordinary `rg` omits `.ramify`, while `rg` with the explicit paths above finds
  names, signatures and documentation;
- generation and repeated no-op generation leave Git status, analysis inputs
  and the daemon revision unchanged;
- stale files disappear only when a complete replacement is published;
- interrupted writes and symlink paths cannot publish a mixed or escaped view;
  and
- Linux and macOS produce the same relative paths and document bytes.

## Relation to the roadmap

Plan 2A implements this view as a new predecessor to Plan 3. The view
supersedes Plan 3's proposed `ramify available` command and the need for an MCP
search tool as the primary agent-discovery surface. The internal availability
enumeration and symbol-detail extraction remain reusable providers.
`ramify explain`, module summaries and observed usage are separate product
decisions and are not specified here.

The existing Plan 3 package is deliberately preserved rather than replaced by
Plan 2A. It predates this decision and must receive a separate successor review
before execution so its remaining contracts, iterations, instance matrix and
Plan 4 handoff do not duplicate Plan 2A.
