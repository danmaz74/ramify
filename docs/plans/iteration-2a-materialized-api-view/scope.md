# Plan 2A scope and semantic decisions

**Status:** draft review package for
[Plan 2A](main-plan.md), prepared 2026-09-15. The
[architecture specification](../../architecture/materialized-api-view.spec.md)
owns the generated format and user workflow. This document fixes the
implementation boundary and the semantics that providers must share.

## Selection and source areas

`ramify materialize` first selects a project by the existing CLI invocation
contract. Without `--all`, it resolves `--from`, relative to the invocation
working directory, or the working directory itself to the innermost declared
module. The selected path must exist inside the selected project and below the
module directory; a path below a child's directory selects the child.

**Revision (user decision, 2026-09-15).** Materialization must only produce
output; it must not change how the project is analyzed. The module's ordinary
view targets `<module>/src/.ramify` only when the inventory says that ordinary
area is present before materialization; a testing view targets
`<module>/src/tests/.ramify` only when the inventory says that tests area is
present before materialization. The command must not create `src/` or
`src/tests/`. A module without `src/` owns no source, so nothing would read
its ordinary view: selecting it directly (`--from`) still succeeds, with zero
targets; `--all` silently omits a module with neither area present from
publication (it names no target), while still resolving and reporting on
every other selected module. `--all` selects every inventory module in byte
order. `--all` and `--from` are mutually exclusive.

An ordinary projection uses the module's ordinary `SourceArea`. A testing
projection uses its fixed testing `SourceArea`; it is computed from all foreign
originals again. The testing projection is complete and may repeat every
ordinary entry. There is no overlay, inheritance or merge at search time.

## Available originals

For each foreign original visible to the consuming module:

1. Testing-origin and missing required-importer tags block both forms.
2. Value form is available only when the original has a runtime binding and
   satisfies every required-symbol tag in the consumer profile.
3. Type-only form is available when the original has a type binding and value
   form is unavailable, including a pure type original or a missing
   required-symbol tag.
4. An original with neither available form is absent.

The result has only `value` and `type-only` states. It has no true availability
flag. Same-owner originals are absent because the catalog describes foreign
APIs. Results are unique by canonical original and defining-file export name.
Redundant exposure paths never duplicate an entry.

The implementation must share the source-profile and tag-requirement helper
with `explainImport`; an independently reimplemented approximation is not
accepted. Model tests enumerate every combination above, and integration tests
compare the list with independent real imports checked by Ramify.

## Defining names and files

The heading is an export name actually present in the original defining file,
not a Ramify exposure alias or a forwarding-file name. Join each available
original to `SourceCatalog.files` where `file === original.file` and the export
resolves to that original. If the defining file has two valid export names for
one original, both entries appear in that one generated document; otherwise an
original appears once.

The generated file is:

```text
<area>/.ramify/<category>/<project-relative-defining-file>.md
```

The source extension remains and `.md` is appended. Paths use `/`, must be
canonical project-relative inventory paths, and must contain neither an empty
segment nor `.` or `..`. An invalid join or path makes the projection
unavailable; it is not skipped.

`children` means the original owner is a proper descendant of the consumer.
The first descendant under the consumer determines the grouping relationship,
but the file path remains the original owner's full project-relative path.
`external` means the owner lies outside the consumer subtree, including an
ancestor, sibling or cousin. npm and platform declarations never enter either
category.

## Symbol details

The TypeScript adapter resolves the named export in its defining file to the
same original identity used by the catalog. It renders a declaration-like,
body-free signature using the checker, retaining only overloads that distinguish
callable forms. It returns the first non-empty documentation paragraph after
normalizing internal whitespace. It never returns source bodies, compiler
objects, absolute paths or timestamps.

Each entry is one of:

- `described`: signature present; documentation optional;
- `truncated`: bounded signature present and one or more detail limits named;
- `unavailable`: a stable reason is present and no signature is emitted.

Only the latter two produce `[truncated]` or `[details-unavailable]`. Missing
documentation alone is ordinary omission. A whole-query limit cannot turn every
entry into a prefix; it refuses the projection.

## Documents

Files and entries are byte-ordered. A described entry has exactly a heading, a
`ts` code fence containing the signature, and optionally one prose paragraph.
A type-only entry adds `[type-only]`. A truncated entry adds `[truncated]`. An
unavailable entry adds `[details-unavailable]` and has no empty code fence.
When a heading or signature contains a backtick run, the renderer chooses a
longer deterministic code-span or fence delimiter.

Documents end with one newline. They contain no availability flag, provider,
defining path, original ID, tag list, exposure path, reason for availability,
alias, timestamp or placeholder documentation. The generated path carries the
defining file and physical provider.

`_meta.json` is one line plus a newline. Keys are emitted in this order:
`schema`, `module`, `area`, `revision`, then the nonzero exceptional counts
`coverage`, `detailsUnavailable`, `truncated`. `coverage` counts distinct
catalog/source-description limits that may have omitted an API; access-only
coverage notes do not inflate it.

## Revision behavior

The service performs one synchronized context operation. Contexts holds the
request in the same per-context queue used for revision publication, obtains a
projection whose session sequence equals the selected `ContextRevision`, and
does not permit a later revision to be substituted.

For a hot session, details use its live compiler. For a warm session, analysis
may recreate a compiler from the retained observer's captured view. This may
read that captured view but may not perform another project inventory walk or
build a second model/report. Newly observed content or a changed input identity
makes the query `superseded`; contexts schedules ordinary reconciliation and
the publisher is not called. The projection itself is ephemeral and is released
after publication.

Import violations do not prevent a view: the analysis execution and model must
be valid, while its import check may pass or fail. Invalid, incomplete,
unavailable or resource-limited analysis cannot replace a view.

## Publication and recovery

The daemon renders and stages every selected area before switching any target.
Sibling directories named `.ramify.tmp-<request-id>` and
`.ramify.old-<request-id>` are reserved transient publisher output. Inventory,
observation, watching and Git ignore rules exclude the final name and both
prefixes.

Before staging, the publisher uses `lstat` on existing path components and
recursively on an existing target. Any symlink refuses the invocation. It writes
only validated relative paths, creates `_meta.json` last in each stage, fsyncs
files/directories where the platform supports the required guarantee, and then
switches targets by rename. Existing targets remain as rollback directories
until all requested switches succeed.

If a switch fails, the publisher rolls back every switched target in reverse
order and reports failure. A rollback failure is separately named and never
reported as success. The next invocation recovers only publisher-owned stage or
rollback directories whose names and ownership marker match; it never deletes
an arbitrary similarly named directory.

**Revision (iteration 6, 2026-09-15).** The ownership marker for a
`.ramify.tmp-<suffix>` or `.ramify.old-<suffix>` directory is a *sibling
file*, `<the directory's own name>.marker.json`, never a file written inside
the directory. Both prior phrasing here and in the "Revision (coordinator,
after iteration 1)" note below spoke loosely of a directory's marker without
fixing where it lives; implementation found this load-bearing. `.ramify.tmp-
<suffix>` is later renamed verbatim into the live target, so a marker written
inside it would otherwise leak into published `.ramify` content the moment the
switch's final rename adopts that directory — a real defect the byte-
determinism and omitted-redundancy leaves would have caught. The sibling
marker path still matches the same reserved segment pattern (`^\.ramify\.
(tmp|old)-.+$`, since that pattern is unbounded and absorbs the trailing
`.marker.json`), so it stays excluded from inventory, observation, watching
and Git ignore rules exactly like the directory it describes. The marker for
each directory is written before that directory exists (or, for `.old-`,
before the rename that creates it), so a crash between the two can never
leave a directory this publisher created without its own marker.

An unchanged target is established by equal path sets and equal bytes. It is not
renamed or rewritten, so target mtimes do not change. A changed complete target
replaces the old one, so stale files disappear. No individual file is patched
in place.

## Generated-output isolation

**Revision (iteration 1, 2026-09-15).** The canonical segment predicate is
fixed precisely, so iteration 2 implements it without choosing a rule. Given
one path segment name at the position where `.ramify` would appear (directly
under a module's `src/` or `src/tests/`):

1. The exact segment `.ramify` is the final generated name.
2. A segment matching `^\.ramify\.tmp-[A-Za-z0-9_-]+$` is a reserved transient
   stage directory.
3. A segment matching `^\.ramify\.old-[A-Za-z0-9-]+$` is a reserved transient
   rollback directory. Both transient forms use the request ID exactly as
   [contracts.md](contracts.md) bounds it; the predicate does not otherwise
   constrain the suffix beyond the character class above.
4. Any other segment, including `.ramify-other`, `.ramify2`, `.ramify.tmp` (no
   trailing `-<id>`), or `.ramifyx`, is an ordinary segment. It is not
   reserved and is not excluded by generated-output isolation.

Only the three exact forms above are reserved; the predicate is a closed
enumeration, not a prefix match on `.ramify`. This resolves
`I2A-02:transient-names-excluded`'s open question explicitly: `.ramify-other`
is ordinary input, never reserved, because it matches none of the three forms.
A future strict-mode reservation of additional near-miss names is not part of
this plan.

**Revision (coordinator, after iteration 1, 2026-09-15).** Service request IDs
may contain any printable ASCII up to 128 characters, including `/` and spaces,
so they cannot name a directory. The rules above are amended:

- The isolation predicate reserves the exact segment `.ramify` and any segment
  matching `^\.ramify\.(tmp|old)-.+$`, at **any** segment position of a
  project-relative path, not only directly under `src/` or `src/tests/`.
  `.ramify-other`, `.ramify2`, `.ramify.tmp` and `.ramifyx` remain ordinary.
- The publisher never embeds the request ID in a path. It names its stage and
  rollback siblings `.ramify.tmp-<suffix>` and `.ramify.old-<suffix>`, where
  `<suffix>` is 32 lowercase hexadecimal characters it generates per invocation.
  Its ownership marker records the publisher version and suffix; recovery acts
  only on directories whose name matches that exact form and whose marker
  matches.

One canonical segment predicate owns the reserved names. It is applied before:

- project inventory/classification and explicit compiler selection;
- source/reference/exposure resolution;
- capture and observer input admission;
- filesystem watcher event normalization and overflow sweeps; and
- retained change classification.

Generated writes, renames and cleanup must leave application input identity,
revision sequence, reconciliation count and testing-area presence unchanged.
Tests cover both ordinary and testing locations plus the transient names.

## Limits and platforms

Iteration 1 freezes the detail, area, invocation, staging and deadline limits in
[contracts.md](contracts.md) from R, T, S100, S500 and S1000 observations.
Detail limits may mark entries. Area/invocation/heap/deadline exhaustion refuses
publication and preserves prior output. No available-set limit emits a partial
catalog.

Linux is the primary implementation platform. macOS must produce the same
relative paths and document bytes and pass actual publication/process cases.
Windows remains outside this plan, but path validation must not encode POSIX-only
separator assumptions in generated data.

## Explicit deferrals

- unavailable-symbol explanations and exposure proposals;
- module purpose/summary and observed incoming usage;
- source-text or ranked search beyond `rg`;
- import-specifier calculation;
- automatic post-write refresh;
- MCP and explorer integration;
- historical views, persistent caches and compressed catalogs;
- changing Plan 5's S500/S1000 support solely to obtain benchmark numbers.

These are not hidden completion gaps. Plan 3 reviews its remaining product scope
after this predecessor is complete.
