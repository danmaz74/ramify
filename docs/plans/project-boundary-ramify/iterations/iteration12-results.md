# Iteration 12 results: boundary-aware project observation

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 12](iteration12.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the second
worktree. No case is produced here (the brief names none); PB1-21, PB1-22,
PB1-23 and PB1-24 receive observer-level evidence only. `reference:verify` was
not run: the coordinator's gate runs it.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit / tree | `6b372aa9` (tree `0bb74cd6…`), clean at assignment, prepared with `npm ci`, the example's `npm ci` and `npm run build` |
| Contract revision | `contracts.md` blob `ea76b4ec…`; `module-description.spec.md` `2e583562…`; `daemon.md` `a21c0428…`; `glossary.md` `ae8e3207…` (all unchanged; no patch proposed) |
| Configuration | unchanged: `package.json`, `package-lock.json` `fd3c84ba…`, `ramify-audit.json` `b59f28f6…`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration12/` |

## Changed behaviour

1. **Identity of unread observations** (`subs/analysis/subs/project/src/capture.ts`).
   An observation whose bytes no stage read (an existence probe, the kind of a
   listed entry, an absence, a link) is identified by its kind and canonical
   path (with the link target and exact name as before), without size, times,
   inode or mode. A directory and a file whose bytes were read keep the full
   stat signature, so read coherence (`bytes()` compares the signature after
   reading) is unchanged. `changes()`, and so the sweep and `seal()`, compares
   the same answer. A byte edit of a file no stage read therefore changes no
   captured input and the sweep reports nothing for it. Two lookups were added:
   `identity(path)`, the identity `inputs` reports for a recorded path, and
   `readThrough(path)`, whether an observation holding read bytes resolves to
   that path's canonical location (a read through a link), kept as a count per
   canonical path when bytes are captured or forgotten.
2. **Classification** (`observer.ts`, `#classify`, now asynchronous). It uses
   one per-inventory index (files and modules by path, the ancestor
   directories of auxiliary files, of module directories and of declared
   owned-ignored or external directories), built once per inventory object,
   and `classifyProjectPath`, so a changed path costs work proportional to its
   depth. Classification stops at the first structural path.
3. **Declared trees and scratch directories** (`#excluded`). The tree's or
   scratch directory's own directory: structural unless it was observed and its
   re-observed identity is the same. A path beneath it: never read; unobserved,
   it matters only by changing a listing a stage recorded of its parent (then
   structural if that listing changed, else ignored); observed with read bytes
   (a compiler read), the ordinary input rule as before; observed unread, a
   changed identity (kind or membership) is structural, because the compiler
   selection and its warnings can change, and an unchanged identity is
   ignored unless bytes were read through a link (then an input).
4. **Directories on the way to a declared tree** are structural: removing
   `data` above `owned-ignored "data/cache"` now rebuilds to
   `missing-owned-ignored` (it was a local input refresh).
5. **Other exclusions** (installed packages, repository metadata, compiler
   output): a path a stage observed keeps the existing input or broad rule; an
   unobserved one is ignored (an unobserved `module.ramify` or any path beneath
   `subs/` inside such a tree no longer rebuilds).
6. **Package manifests**: a `package.json` anywhere in the walked tree is
   structural (a new one in a non-module directory, including inside `src/`, is
   an `undeclared-project-boundary` layout error; it used to be ignored or
   inventoried as a resource).
7. **Auxiliary membership** (`#auxiliaryFile`). An edit, addition or deletion
   of owned compiler source outside `src/` is a local update (`changed`,
   `created`, `deleted`), as beneath `src/`, when the walk reaches the file
   through directories it already lists: every directory from the file's
   directory up to its owner's is a recorded, listed real directory; the file's
   directory is listed afresh; the exact name is checked. The new inventory
   record is `{ path, owner: nearest module, area: 'ordinary', kind: 'source',
   placement: 'auxiliary', sha256, bytes }`. A new or removed directory on the
   way, a link, or a replaced file is structural. Removing a directory that
   holds auxiliary source or a module boundary stays structural.
8. **Walked paths outside every `src/`** (`#walked`): a new directory is
   structural (8C gap: a directory created with source already inside, seen
   through its own event or one file's); an observed directory whose identity
   changed (listing, kind) is structural, so source the sweep finds only
   through a changed listing is inventoried; an observed unread file whose
   identity is unchanged (an inert byte edit) is ignored, and one whose kind
   changed stays an input; an unobserved non-directory (inert creation) is
   ignored and leaves no observation. This replaces the former rule that any
   path beneath any module's `subs/` is structural: an inert file there no
   longer rebuilds on a byte edit.
9. **Removed source-area directory** (`#owned`): a removed directory beneath
   `src/` (or `src/` itself) is structural. It used to return `unchanged`,
   leaving its files inventoried (a stale pass if only the directory event
   arrived).
10. **Documents.** The Project README describes the identity of unread
    observations, the auxiliary membership rule and the observer's boundary
    rules. Its first paragraph is unchanged, so the final-contract validator
    needs no purpose layer; no exposure changed.

No document shape changes: no member or closed value of `ramify.analysis/2`,
`ramify.ipc/2`, `ramify.watch/2` or `ramify.check/2` changes; captured input
hashes of unread observations take different values in the same shape.

## What the observer records and reads, by change

| Change | Update | Reads / observations |
| --- | --- | --- |
| Declaration added, removed, changed (kind or directory) | structural | fresh acquisition: newly excluded files leave the inventory and inputs; reincluded files are read afresh |
| Child module added or removed; module directory removed | structural | fresh acquisition |
| Owned-ignored root (or a directory on the way) removed | structural → `invalid` (`missing-owned-ignored`); last valid inventory kept | fresh acquisition |
| Manifest appears in the walked tree | structural → `invalid` (`undeclared-project-boundary`) | fresh acquisition |
| Auxiliary edit / addition / deletion | `local` `changed` / `created` / `deleted` | the file's bytes; its directory listed afresh; deletion forgets the file |
| Directory created outside `src/` | structural | fresh acquisition |
| Byte edit in an owned-ignored, external or scratch directory, or of an inert file | `unchanged`; inputs and identity unchanged; sweep empty | an observed unread entry is re-stated (kind only); nothing read, nothing listed |
| Membership change of an entry the configuration listed beneath an exclusion | structural (selection and warnings recomputed) | the parent's existing listing re-read |
| Unobserved path beneath an exclusion whose parent no stage listed | ignored | none |
| File read through a link into a declared tree, edited | `local` `changed` | as before (input) |
| Inert file created | ignored; no observation kept | one kind probe, then forgotten |

## Deviation 1 of iteration 8B: fixed here at the observation level

Deliverable 2 forbids admitting excluded contents to freshness, and the
contracts state "inert/excluded byte edits do not change input identity", so
this is an observation matter. It was caused by the stat signature in the
identity of the zero-byte kind observations the configuration listing makes,
not by the listing itself. The listing and the kinds are kept: the compiler
selection, and therefore the compiler-selection warnings, depend on
membership and kind, and the retained configuration product replays them. With
item 1, a byte edit beneath a listed declared tree or scratch directory
changes no sealed input, no identity and no sweep result; a membership or kind
change there rebuilds and recomputes the warnings. What remains for 15–16:
those entries are still observations (kind and membership), so a watcher
built from observations would need the scope's exclusions to avoid
registering them (iteration 16).

## Referenced resources: not contained, not implemented

The contracts define a referenced resource as an owned resource outside `src/`
"that an analysis stage reads", distinct from an inert owned file, and forbid
a blanket outside-`src/` sweep. The only stage that learns of such a file is
TypeScript resolution, after acquisition: `resolution.ts` `place()` returns
`resource-target` for an owned, non-inventoried, non-excluded resource, and
the catalog and accesses record a `resource-target` limit. Producing the
placement needs (a) the TypeScript owner to report the target, (b) the
batch and session integrations to add an inventory entry and catalog it
(a second pass or a feedback from compilation into acquisition), and (c) a
decision on the module description specification, whose adopted text says
"Every other owned file outside `src/` is inert: it is not inventoried".
None of this is in the Project observer, so it stays open; its owner is a
TypeScript/analysis slice with a coordinator decision on (c). Observation
already treats such a file soundly: when the compiler reads it, its bytes are
a captured input and an edit is an ordinary input change.

## PB1-21 to PB1-24 evidence at this boundary

`subs/analysis/subs/project/src/tests/project-boundary-observer.test.ts`
(new, 16 tests) builds the written topology (root `app` with owned-ignored
`fixture-project`, external `external-project`, scratch, `notes/`, `scripts/`,
`tools/tmp/`; `a` with owned-ignored `fixtures/sample`, `scripts/report.ts`,
`docs/guide.md`, grandchild `grand`; `b`), with the owner's local parser double.

| Case | Tests | Independent expectation |
| --- | --- | --- |
| PB1-23 | byte edits (7 paths: both declared trees, a's ignored sample, both scratch directories, two inert files) | `unchanged`; inputs deep-equal, `inputId` equal, content reads and directory enumerations unchanged, sweep empty, a fresh acquisition records the same inputs; boundary roots observed, nothing beneath a declared tree observed, nothing beneath scratch read |
| PB1-23 | deviation 1 (`include` covers `fixture-project` and `src`) | warnings for both; listed entries are zero-byte `dependency` observations; byte edits `unchanged`, sweep empty; a deletion in scratch rebuilds and drops the scratch warning; a new file named only by its event rebuilds and the owned-ignored warning lists two files; no content read beneath the tree |
| PB1-23 | link | a compiler read through `links/` into `fixture-project` keeps the physical file an input: edited, `local` `changed` |
| PB1-21 | declaration added then removed | the tree's auxiliary file leaves inventory and inputs (only the tree directory observed), an edit while excluded is `unchanged`, removal brings the file back with the hash of its current bytes, equal to a fresh acquisition |
| PB1-21 | kind and directory changes | structural; ownership exclusions as declared |
| PB1-21, PB1-24 | missing root | removing `data` above `data/cache` (one event) and removing `fixture-project`: `invalid` with `missing-owned-ignored`; observer inventory unchanged |
| PB1-21 | child modules | adding `subs/c` and removing `subs/a/subs/grand`: structural with the expected module IDs |
| PB1-21 | manifests | `notes/package.json` and `subs/a/src/vendor/package.json`: `invalid` with `undeclared-project-boundary` at the manifest |
| PB1-21 | removed `src/` directory | structural; its file leaves the inventory |
| PB1-22 | auxiliary membership | edit `local` `changed`; three additions (root, `a`, loose `subs/`) `local` `created` with exact records and owners; deletion `local` `deleted` and the input forgotten; after each, inventory files and inputs equal a fresh acquisition; inert `.md` and inadmissible `.mjs` `unchanged` |
| PB1-22 | new directory with source | from the directory event and from one file's event: structural with every file |
| PB1-22 | sweep | a silent `misc/hidden.ts`: the sweep names `misc`, the update is structural with the file, the next sweep is empty |
| PB1-22 | directory removal | structural without its files |
| PB1-24 | overlap | `invalid` with `overlapping-nested-tree`, inventory unchanged; restored, a local description update |
| PB1-24 | cancellation | a pre-aborted structural update rejects, inventory unchanged; the next one rebuilds |
| PB1-24 | byte bound | an application byte limit exceeded during a rebuild is `incomplete` (`resource-limit`), inventory unchanged |

**Negative control** (`negative/`): with `capture.ts` and `observer.ts`
replaced by the base commit's, 9 of the 16 tests fail (both PB1-23 byte-edit
tests, missing root above the tree, manifests, removed `src/` directory, the
three auxiliary membership tests and the byte bound, whose directory event the
base ignored); the 7 that pass are behaviours the base already had (positive
controls). Both files were restored and their SHA-256 verified
(`negative/restored.txt`).

## Re-reasoned expectations

- `project-boundary-inventory.test.ts`, "observation of auxiliary source"
  (8C G6): an added and a deleted auxiliary file are now `local` `created` /
  `deleted` with the same resulting inventories; removing their directory
  stays structural. Reason: contracts, "Auxiliary edits/additions/deletions
  use ordinary source invalidation".
- `session-revision.test.ts`, "stays invalid through source-only and
  README-only events until the invalid description is repaired": the branch's
  source and README lie under the layout-invalid boundary its invalid
  description makes, so they are neither inventoried nor read; their byte
  edits change no input (item 1), and the session answers `identical` with the
  invalid revision (sequence unchanged, still invalid, still equal to a batch
  evaluation and audited). The repaired revision is the invalid one's
  sequence + 1, `broad`, with the edited export and purpose.

No harness file, instance row, count or identity changed; no row became stale.

## Performance

Classification is per changed path: `classifyProjectPath` and set lookups by
path, at most one re-observation of the path (or its parent's existing
listing); the per-inventory index is built once per inventory object
(O(files + modules + declarations) × depth), replacing the former linear
`find`/`some` scans over all files and modules for each changed path. The
identity change makes `changes()` cheaper (no stat comparison beyond kind for
unread entries). S1000 cold retained-session open with the I5-08 inputs:
**23.6 s**, 1000 owners, 11 000 files, complete (`s1000-cold-open.out`;
iteration 11 23.4 s; deadline 30 s). Both I5-08 instances passed.

## Commands and results

Following the user's rule relayed by the coordinator during this slice, focused
commands ran without the lock; the reference-harness runs, single instances and
the S1000 measurement held `/tmp/ramify-audit-tests.lock`. A first combined
script waited under the lock (`run-focused-1.sh`); the coordinator terminated
that wait and the script was rerun without the lock.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` (new file checked separately) | 0 | clean | `diff-check.log`, `new-file-whitespace.log` |
| `npm run type-check` | 0 | four scopes | `type-check.log` (`tsc-1.log` main scope) |
| `npm run build` | 0 | built | `build.log` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 594 files | `validator.log` |
| `npm run check:self`; JSON | 0 | passed, partial; 577 source files (576 + the new test), 17 resources, 8489 accesses, 41 limits, 0 errors, 0 warnings, 0 denied | `check-self.log`, `self-final.json` |
| `npx vitest run subs/analysis/subs/project/src/tests/project-boundary-observer.test.ts` | 0 | 16 tests | `pbo-1.log` |
| Negative control (base `capture.ts`, `observer.ts`) | 1 | 9 failed, 7 passed; restored | `negative/` |
| `npx vitest run subs/analysis/subs/project/src/tests` | 1, then 0 | G6 re-reasoned; final 14 files, 315 tests | `project-tests-1.log`, `project-tests-2.log` |
| `npx vitest run subs/analysis/src/tests --maxWorkers=4` | 1 | 41 files passed; 1 test re-reasoned (`session-revision.test.ts`), rerun below | `t-analysis.log` |
| `npx vitest run subs/analysis/src/tests/session-revision.test.ts` | 0 | 42 tests | `t-session-revision.log` |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 0 | 13 files, 177 tests | `t-contexts.log` |
| `npx vitest run subs/daemon/src/tests` | 0 | 21 files, 248 tests | `t-daemon.log` |
| `npx vitest run subs/cli/src/tests` | 0 | 8 files, 245 tests | `t-cli.log` |
| `npx vitest run` the 20 root `src/tests/*.test.*` files by name | 0 | 20 files, 103 tests | `t-root.log` |
| Harness `resident-fixtures.test.ts` (locked) | 0 | 18 tests | `h-resident-fixtures.log` |
| Harness `plan5-live.test.ts` (locked) | 0 | 6 tests | `h-plan5-live.log` |
| Plan 5 single instances (locked): I5-05 ×8, I5-04 `created-deleted-configuration`, `invalidate-all`, `observed-reads-complete`, I5-08 `worker-nonblocking`, `deadline-exceeded-explicit` | 0 | 13/13 passed | `p5-instances.out` |
| S1000 cold open (locked) | 0 | 23.6 s | `s1000-cold-open.out` |
| `npm run reference:cases` (locked, after the build, frozen tree, 15:42:32–15:48:23 UTC) | 0 | **37 files, 393 tests**; tree unchanged during the run | `cases.stdout`, `cases.stderr`, `diff-*-cases.sha`, `status-*-cases.txt` |

`reference:verify` was not run; it is left to the coordinator's gate.

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited, and no patch is
proposed: the slice implements tooling behaviour the contracts and the daemon
architecture already state ("Inert/excluded byte edits do not change input
identity"; boundary changes are structural), and no specification status line
names observer behaviour. One question for the coordinator is in the gaps
(referenced resources versus the specification's inert rule).

## What iterations 13–16 still lack

- 13: the session receives the new local auxiliary `created`/`deleted`
  updates through its existing membership path (synthetic roots include every
  inventoried source); hot/warm equality with a fresh batch for auxiliary
  forwarding, boundary add/remove/re-inclusion and missing roots, retirement of
  compiler observations after a declaration, and session cancellation are not
  qualified here.
- 14: affected path bases and seed status.
- 15: changed-path dispositions; contexts still answer an unobserved excluded
  path `unobserved-input`.
- 16: watcher registrations still use the fixed `excluded` name set
  (`node_modules`, `.git`, `dist`, `.reference-work`), not the scope's
  exclusions; observations beneath excluded trees made by a configuration
  listing (kinds and membership) must not become watch registrations.

## Gaps and decisions needed

1. **Referenced resources**: see above; needs an owner (TypeScript/analysis)
   and a decision on the specification's "not inventoried" text.
2. **Unread identity applies everywhere**, not only to excluded and inert
   paths: a touched-but-unread package declaration or probed candidate no
   longer changes an identity. Every unread observation is by definition one
   whose bytes no stage used; read coherence keeps the full signature.
3. **Listing changes of walked directories outside `src/` rebuild** (former
   behaviour: root-level non-`src/`, non-`subs/` directories were a local input
   refresh). Needed for source found only through a listing; an inert file
   creation is otherwise ignored until the sweep finds its parent's listing,
   which then rebuilds. Correctness first (R5); cost recorded here.
4. **Membership churn of configuration-listed entries in scratch or declared
   trees rebuilds**, even when `exclude` removes them from the selection,
   because only the compiler can say the selection is unchanged.
5. **A declared tree beneath `src/`** makes `src/` itself a directory on the
   way to it: an event naming `src/` rebuilds.
6. **Link reads**: an edit of a declared-tree file read through a link reports
   the physical path; the link's own observation is refreshed by the sweep.
7. **Pre-existing**: after an `invalid` rebuild the observer keeps its last
   valid inventory, but its capture already holds the refreshed description
   (the session's stale reconciliation covers it). Not changed.

## Coordinator review

The coordinator reviewed the observer and capture changes and the new test
against the brief and the contracts. No protected document changed. This
iteration ran one iteration ahead in the second worktree while iteration 11's
milestone gate ran, and was committed after that gate was green. Accepted:
an observation whose bytes no stage read is identified by kind and canonical
path only, which ends the iteration 8B limitation that an edit beneath a
listed exclusion changed the input identity; the additional rebuilds listed
in this receipt, chosen for correctness. `referenced-resource` placement is
not produced by this slice; whether the vocabulary keeps a value nothing
produces is put to the user. The agent did not run `reference:verify`; the
coordinator's gate runs the audit, `reference:cases` and the full Plan 1 and
Plan 2 verification on the committed candidate.
