# Phase 1 contracts

**Status:** accepted by the user on 2026-10-03 and adopted in the owning
specifications in iteration 1 (commit `6d0c66f0`); implementation pending.
R7, the root marker, was decided by the user on 2026-10-03 after iteration 2;
the coordinator adopts its specification patches before iteration 3A.
These are implementation contracts, not claims of support. Names below are
planned additions to existing interfaces, not discovered available APIs.

## Review decisions

| ID | Decision | Review boundary |
| --- | --- | --- |
| R1 | Two standalone version 1 statements: `owned-ignored "directory"` and `external "directory"`. | Grammar, reserved names, spans, malformed input and statement ordering. |
| R2 | Reject duplicate normalized directories and overlapping nested-tree declarations; reject symlink traversal, escapes, reserved exclusions and child-module overlap. | Decided 2026-10-03 as the simplest rule: any two declarations whose directories are equal or nested are an error, whatever their kinds, so at most one exclusion ever matches a path and no precedence rule exists. |
| R3 | One Project-owned path classifier over revision-bound scope metadata; affected/report/CLI/view schema 2 and IPC protocol 2. | Exact foreign vocabulary, exposure channels and all producers/consumers. |
| R4 | A changed check gives the result the complete check would give on the project after the change. Paths Ramify does not analyze carry a not-analyzed disposition and need no content coverage; they never change the exit code. Exit 2 remains only for a check that could not establish that result. | Hook/API disposition, content freshness and negative controls. |
| R5 | Decided 2026-10-03: correctness under the new rules comes first, optimization second. No rule is weakened to meet a limit or timing target. Capacity limits remain safety limits and are raised with a recorded measurement if the new rules need it. Earlier timing targets are measured and reported to the user at the end of the plan; missing one does not stop the plan. Inert/excluded contents never become inputs. | [Budgets](budgets.md), observation and cancellation coverage. |
| R6 | Decided 2026-10-03: the reference harness stays at `scripts/reference-harness/` as an owned-ignored tree of the root, with its compiler configuration, runner and commands unchanged; analyzed toolkit code no longer imports from it. Site consumes packed toolkit exports. | No analyzed importer of the tree, package/build graph and preserved test inventory. |
| R7 | Decided 2026-10-03: a project root declares itself with `root` before `module` on its module line, in format version 1, so existing root descriptions are invalid until migrated. Without `--root`, selection takes the nearest description at or above the working directory carrying the marker; unmarked descriptions never stop the climb, and no marked description means exit 2. `--root` must name a marked description. A marked description inside a declared tree is a separate project and is not interpreted; one elsewhere in the evaluated tree is a layout error; a selected root without the marker is an error whose message says to add it. | Grammar and reserved keyword, climb and resolution reuse, discovery validity, and migration of every toolkit root, generator and fixture before enforcement. See [root marker](#root-marker). |

The user accepted all six entries on 2026-10-03: R2, R4, R5 and R6 as decided
in their rows, and R1 and R3 as drafted. The user decided R7 later the same
day; it resolves the plan's former open question on root selection inside an
owned-ignored tree beneath `subs/`, and needs no principles edit, since the
importability principles already require an explicit application root. For R3 the user confirmed that the path
and the current declarations alone decide ownership, and that no backwards
compatibility is kept: the version numbers change only so that an outdated
reader fails clearly. Under R4 the changed check is the quick form of the
complete check and, wherever it answers, gives exactly the result the complete
check would give on the project after the change. It differs only in analyzing
the change against the retained baseline. The rule and the per-path
dispositions below are stated in the
[CLI invocation specification](../../architecture/cli-invocation.spec.md#hook-and-complete-checks).

Iteration 1 adopted the accepted wording in the owning specifications (commit
`6d0c66f0`) and recorded the review receipt in
[its results](iterations/iteration1-results.md). R7's exact patches to the
module description and CLI invocation specifications, the glossary and the
proposal are adopted by the coordinator under the
[protected-document procedure](execution.md#protected-principles-and-specifications)
before iteration 3A, and the receipt is recorded with that iteration's
handoff. Runtime support and acceptance remain with the producing slices. Changes to an accepted interface invalidate
affected downstream receipts.

## Description language and validation

Extend the specified document grammar without changing its format version:

```ebnf
document = version-line, module-line, { exposure-line | nested-tree-line } ;
nested-tree-line = ( "owned-ignored" | "external" ), hws, STRING, LF ;
```

Statements can be interleaved after the one module header. Neither has tags,
selections, aliases, exposure destinations or extra clauses. Use existing UTF-8,
escaping, comment, physical-line and span rules. Add both keywords to the
specified reserved-name rules; explicitly specify their treatment in tag lists
so registry tag parsing does not accidentally change as a tokenizer side effect.
In tag position both remain valid lowercase tag names, resolved only through
the registry, like the existing special tag tokens. A declaration defines no tag.

Replace the exposure-only `DescriptionStatement` interface with a discriminated
union. Its exposure member retains existing fields under `ExposureStatement`;
`NestedTreeStatement` has `index`, `kind: 'owned-ignored' | 'external'`, `span`
and `directory: { value: string; span: TextSpan }`. Indices are positions among
all statements. Linkers and exact-source-reference readers process exposure
members only. Project acquisition interprets tree statements, never the linker.

Decode a nonempty directory string relative to its declaring module. Use `/`
separators, reject absolute paths, backslashes, empty segments and control
characters, normalize `.`/`..`, and require strict containment after normalization.
`external` cannot lie under that owner's `src/`; either kind cannot overlap a
child module. Reject duplicate/overlapping declarations and declarations of
always-excluded paths. Do not traverse symlinks to validate a declaration.
An owned-ignored target must be an existing real directory. An external target
may be absent; an existing target must be a real directory.

Planned Project issue codes are `invalid-nested-tree`, `missing-owned-ignored`,
`overlapping-nested-tree`, `undeclared-project-boundary` and, for R7,
`unmarked-root-description`, retaining located declaration evidence.
Iteration 3B introduces `undeclared-project-boundary` for marked descriptions;
iteration 8 extends it to package manifests. A malformed statement is a description error. An invalid
boundary makes acquisition invalid; never attribute hidden contents to the
parent and continue with a valid partial model.

## Root marker

R7 extends the module line without changing the format version:

```ebnf
module-line = [ "root", hws ], "module", hws, module-name,
              [ hws, tag-clause ], LF ;
```

`root` joins the reserved keywords as `owned-ignored` and `external` did. In
every name position it must be double-quoted, as in `module "root"`. In tag
position it remains a valid lowercase tag name resolved only through the
registry, like the other special tag tokens; the marker defines no tag. A
`root` keyword anywhere other than immediately before the header's `module`
keyword is malformed syntax, reported with the existing parser codes; no new
parser issue code is added. No committed or generated toolkit description
uses a bare `root` in a name or tag position (verified at `3f435172`;
`ramify-agent/` included).

`DescriptionDocument.module` gains `root: TextSpan | null`: the span of the
marker keyword, null when unmarked. The header's existing `span` covers the
whole module line, beginning at the marker when present. An unmarked document
remains valid: the parser does not know which description is the root.

**Marker determination.** A description carries the marker when its module
line begins with `root`. Selection decides this from the module line alone,
using the Descriptions owner's tokenizer and header rules, supplied to Project
the way `parse` is supplied today; Project gains no second grammar. A
description whose module line begins with `root` carries the marker even when
later lines are invalid, so the climb stops there and acquisition reports
those errors. A description whose module line cannot be read, because of an
encoding error before it or a missing or misplaced header, does not carry it.

**Selection.** Without `--root`, selection takes the nearest directory at or
above the canonical working directory whose `module.ramify` carries the marker,
reading each description it passes. Unmarked descriptions never stop it. The
`subs/`-based advance and the missing-parent-description check are removed;
a child left without its parent description is reported by the selected
project's discovery as a misplaced description. No marked description at or
above the working directory remains `root-not-found`: status unavailable,
exit 2, naming the working directory. `--root` must name a directory whose
description carries the marker. A description there without it is
`unmarked-root-description`: status invalid, exit 1 like
`missing-root-description`, naming that description, with a message that
says to add `root` before `module`. Symlink rules are unchanged.

A reused resolution's discovery evidence includes the marker determination of
every description selection read, so a marker change at any of them makes the
reused resolution stale. A byte edit that leaves every determination unchanged
does not.

**Acquisition validity.** The root description acquisition parses must carry
the marker; otherwise acquisition is invalid with `unmarked-root-description`,
which also covers a change between selection and reading. Every other
description the walk interprets that carries the marker is
`undeclared-project-boundary`, category layout, located at the marker, with a
message naming the nested-tree declaration to add in its nearest enclosing
module. That directory contributes no module, and its contents are not
attributed to an enclosing module, as for the existing layout-invalid
descriptions. Until iteration 8 the walk still skips inferred independent
scopes, so it does not read a marked description inside one. Iteration 8
prunes declared trees before descent, so a marked description inside a
declared tree is never read and is the root of a separate project.

**Migration.** Every existing toolkit root description, and every toolkit
generator or fixture that writes one, adopts the marker before enforcement;
child descriptions stay unmarked. Iteration 3A migrates them and iteration 3B
enforces the rule. `ramify-agent/` and `/ramify-audit` update their own roots,
fixtures and target projects in their phases.

## Canonical path ownership and inventory

Project owns `ProjectOwnership`, `PathOwner`, `ProjectExclusion`,
`PathOwnership` and the pure operation:

```ts
classifyProjectPath(scope: ProjectScope, path: string): PathOwnership
```

`ProjectScope.independentScopes` is removed and replaced by
`ownership: ProjectOwnership`. The ownership value holds byte-ordered module
records `{ id, parent, directory }` and exclusions `{ kind, directory, owner }`.
Directories are normalized project-relative strings, `'.'` for the project
root. Exclusion kinds are `owned-ignored`, `external`, `scratch`, `repository`,
`packages`, `output` and `generated`; only owned-ignored and scratch carry an
owner. Preserve the canonical generated-path predicate for catalogs and their
staging/rollback forms, including boundaries whose outputs are absent.

The classifier reads no files and does no existence check. It accepts canonical
project-relative paths, including leading `../` for a path outside the root and
`'.'` for the root directory. Reject absolute/noncanonical paths, empty strings,
backslashes and interior `.`/`..` segments; CLI normalization happens before the
query. Return one of:

```ts
type PathOwnership =
  | { status: 'owned'; module: string; directory: string;
      exclusion: ProjectExclusion | null }
  | { status: 'excluded'; module: null; exclusion: ProjectExclusion }
  | { status: 'outside-project'; module: null }
  | { status: 'invalid-path'; message: string };
```

Containment chooses the nearest module. Reserved exclusions and declared
boundaries take precedence over ordinary source-area prefixes. Owned-ignored
and scratch paths retain ownership. Their excluded analysis status is a separate
fact; ordinary ownership does not prove a path was inventoried or checked.

`InventoryModule` retains its existing source areas and description. Its nested
trees are obtained by joining the scope's ownership facts; do not keep a second
independently computed boundary table. `InventoryFile` adds
`placement: 'src' | 'auxiliary' | 'referenced-resource'`. Auxiliary means owned
compiler source outside `src/` only, with ordinary classification. A referenced
resource outside `src/` has an ordinary owner/profile but is not auxiliary code.
Inventory descriptions, READMEs, compiler source, configuration, required package
metadata and referenced resources only. Inert docs/data and excluded contents
are never application inputs, per-file hashes or per-file watch targets.
Only auxiliary compiler source is newly added by the base inventory walk.
Preserve existing source-area resource/projection inputs and exact-reference
acquisition; do not create a blanket outside-`src/` resource sweep. A resource
read by an existing stage is distinct from an inert owned file.
Existing external-package compiler dependencies stay outside that application
set, including established installed links; do not turn their physical target
into owned application source or block valid package resolution with a blanket
realpath blacklist.

Discovery no longer stops at a `tsconfig.json`. An undeclared non-module
directory with a package manifest or root description is a located layout error
that suggests a boundary declaration. A directory containing only a compiler
configuration is not silently skipped. Remove `.reference-work`'s special case.
Honor declarations before descending so descriptions inside ignored trees are
never interpreted as stray modules or descriptions-in-src.

## Source and exposure provenance

`SourceOrigin` adds `auxiliary: boolean`, true only for compiler-source originals
and importers outside their owner's `src/`. Preserve original IDs, ordinary/test
profiles and the original provenance through forwarding aliases. Header tags
classify auxiliary source; a `.test.ts` suffix does not create testing source.
Prepared adapter producers derive the flag from `InventoryFile.placement`;
they do not hardcode false once auxiliary inventory activates. Old fixture
defaults are false only for actual `src/` origins.
Non-testing auxiliary code cannot access test-classified source even same-owner.
Linking rejects an auxiliary original selected through any forwarding chain with
`auxiliary-original-exposure`; the model also rejects a forged exposure input.

TypeScript resolution retains the actual route before realpath classification.
Do not infer a package route from a bare spelling, a real path, a path segment
named `node_modules` or `isExternalLibraryImport` alone. Use the pinned resolver's
established package-resolution evidence and preserve it for linked packages.
An owned source import through a TypeScript `paths` alias is still a project
import. Relative paths or workspace links into a declared tree are not package
resolution. Unsupported resolver evidence is explicit coverage, not a guessed
external classification. Verify code and resource targets, declaration shims,
extension substitution and export-map/subpath cases.

`SourceTarget` gains a `nested-tree` member with the physical project-relative
target and its declared exclusion. Rename `outside-module` to `outside-project`;
owned source outside `src/` is an application target. Established package,
builtin and standard-library targets retain the external member. Known imports
into declared trees produce a definite `project-boundary-import` diagnostic
before symbol selection or same-owner exemptions, including type-only and
symbol-free loads and re-exports. Excluded code is not interpreted. Outside-root
non-package and unresolved targets remain explicit coverage limits. A linked
package's real location inside an ignored tree remains external by provenance.
An always-excluded non-package target uses a separate `excluded` member and
`excluded-target` coverage, rather than being mislabeled outside the root or
allowed. This reports the analysis gap without inventing an additional definite
import rule for scratch/output paths; declared-tree violations remain definite.
Intercept resolved non-package excluded targets before admitting their source
to the application compiler/catalog. Retain enough resolver target evidence to
report the boundary finding without interpreting exports from excluded files.
Package dependency reads retain the existing external-package policy and
resolution identity; they are not enclosing-project source analysis.

Boundary accesses use an explicit `AccessResult.outcome: 'denied'`, with one
located boundary diagnostic per occurrence and no fabricated symbol decision.
They increment the summary's denial/error evidence and fail the check even when
the selected-symbol list is empty. No new target variant may fall through to
the old default `checked` result. Update all result consumers in the producing
slice, including serialization and browser mapping.

## Reports, affected queries and freshness

Replace `OutsideSourceWarning` with `ProjectWarning`, carrying `code`, `path`,
`message` and a bounded `files` list plus total `count` where file evidence is
needed. Codes are `compiler-selected-owned-ignored`, `compiler-selected-scratch`
and `ignored-but-walked`. Warnings remain nonblocking. Source outside `src/`
is analyzed; no outside-module-source warning survives. Git advice is produced
by the CLI, not the analysis model or scope fingerprint.

Affected answers keep module seeds and the reverse-import dependency graph.
Extend path bases with `containment` and `excluded`. Every path seed includes
`status: 'owned' | 'excluded' | 'outside-project'` and `exclusion`, nullable.
An owned seed has a module and inventory/declaration/area/containment basis;
an excluded seed has no module, excluded basis and an unowned exclusion; an
outside seed has no module, none basis and no exclusion. Only outside seeds
cause `unowned-path` widening. A scratch or owned-ignored path selects its owner
and transitive importers, although its own contents are unanalyzed. Root-owned
config/docs do not automatically select children. Affected never lists tests
or runs them. Return the whole ownership topology in scope so consumers can
derive exclusions without reading directories or copying provider code.

Queries for deleted/new paths use current declaration containment without
per-file inventory or filesystem existence. Leading `../` is the explicit
outside-project query form; other malformed seeds return invalid-query.
Coverage-based widening, sorted deduplication, revision identity, warm-session
behavior, query bounds and cancellation stay as specified in the existing
affected contract, updated for the new shapes.

Changed checks expose a `PathCheckDisposition` for every requested path:
`checked`, `not-analyzed` or `not-checked`, with module/exclusion and a reason.
`checked` requires completed relevant analysis and covering content/deletion evidence.
`not-analyzed` reasons include owned-ignored, external, scratch, other reserved
exclusion and owned-non-source. `not-checked` covers unavailable or stale work.
Deletion of a previously analyzed source is checked after membership removal;
it is not relabeled inert merely because its inventory entry disappeared.
Descriptions, configuration, READMEs and referenced resources that are captured
analysis inputs are distinct from inert non-source paths; their relevant model
work and identity evidence determine their disposition. Existing unavailable
configuration-change behavior remains explicit until a covering capture exists.

Contexts use revision-bound ownership to classify paths before requiring their
content as synchronized inputs. Extend check requests with normalized `paths`
and a classification sequence; content expectations are needed only for paths
whose analysis requires them. If a boundary change makes the client's
classification stale, return `classification-changed` with the current revision
and retry once through the client's existing bounded recovery path. Excluded
or inert paths never become captured/watched contents to satisfy freshness.
Classification comes from Project facts, not a second algorithm in contexts.

Check JSON replaces the old `changed[].covered` boolean with `paths`
dispositions carrying the actual input/deletion identity where checked; excluded
or inert paths carry no asserted captured-content hash.

The exit code and findings are those the complete check would report on the
project after the change. A path with a `not-analyzed` disposition is one the
complete check does not read either, so it requires no content coverage and
does not affect the exit code: a request naming only such paths exits 0 when
the covering revision has no findings and 1 when it has findings or is
invalid, exactly as `ramify check` would. Exit 2 is reserved for a check that
could not establish that result: a `not-checked` path, an expired deadline,
stale or unobserved analyzed content, or unavailable work. Findings verified
before such a failure are retained. The per-path disposition, not the exit
code, states that an excluded or inert path was not analyzed; no such path is
shown as passing source checks.

## Transport, observation and projections

Upgrade `ramify.analysis`, `ramify.affected`, `ramify.affected-cli`,
`ramify.check`, `ramify.watch`, `ramify.daemon-status`, architect projection/view/
module schemas to version 2 wherever their existing payload shapes change.
Use `ramify.ipc/2` for the strict daemon handshake and codec. Iteration 1
recorded the schema inventory, including nested worker messages, root service
types, dependency reports, measurement results and browser DTOs;
[schema versions](#schema-versions) places each version change. Unchanged
formats retain their version. Reject mismatched wire peers coherently; no old
schema decoder is implemented.

Project observation retains boundary root existence/validity and analysis inputs,
never excluded descendants. A declaration change, a child-module membership
change or a missing owned-ignored root is structural. Retire facts and compiler
observations when source becomes excluded. Bring source back only after fresh
acquisition when a declaration is removed. Auxiliary edits/additions/deletions
use ordinary source invalidation and dependency reach. Inert/excluded byte edits
do not change input identity. Boundary-root existence changes can invalidate it.

Watcher ports receive revision-bound excluded directory roots and the canonical
reserved-path rules. Do not register watches beneath them. Reconfigure after
boundary/module changes; cover any reconfiguration gap through conservative
recapture. Watch the necessary enclosing directory to detect boundary-root
removal, without watching that tree's contents. Preserve existing budgets and
proper cancellation/disposal of old watches, sessions and compiler processes.

Architect module metadata lists owned-ignored and external directory boundaries
with kinds and declaration evidence, never symbols/files/tests inside them.
Auxiliary analyzed exports can appear as internal evidence, never available
foreign APIs. Source counts and explorer/measurement buckets include analyzed
auxiliary source and referenced resources, exclude inert/ignored contents, and
use the same inventory/profile facts. API-view selection from auxiliary source
uses the owner's ordinary profile and publishes beneath its `src/`; selection
from an excluded tree is invalid-location. Existing projection budgets and
transactional publication remain in force.

CLI root selection follows R7, as [root marker](#root-marker) states:
iteration 3B implements it in Project for every command that selects a
project, and iteration 17 demonstrates it through real CLI processes. Production
selection still consumes resolved profiles; testing modules and nested testing
areas are excluded, ordinary analyzed auxiliary inputs are eligible, and inert
owned files are not production merely because they have an owner.

## Schema versions

A document's schema version advances in the slice that first changes its
payload shape, so an outdated reader fails rather than misreads (R3). That
slice changes the identifier and updates every toolkit reader in the same
candidate: producers, CLI, batch process, daemon, the hook example, measurement
scripts, toolkit tests and the reference harness's expected values. A document
changes shape when one of its embedded values without its own schema
identifier does, such as `ProjectScope` or report warnings. An envelope that
carries a document with its own identifier, such as an IPC message or a watch
line carrying an analysis report, advances that document's identifier
instead; the envelope advances only when its own members change. The IPC
protocol identifier covers the wire messages and the fields its strict codec
decodes.

Where an early slice changes a shape that a later slice changes again, the
version advances once, at the first change, and the later slices extend
that version, version 2 for all but the modularity report, before the
phase's handoff. This is an alpha migration: no reader
exists for the intermediate shapes, and only the final shape is handed off.

| Document | Advances in | First shape change | Later slices extending it |
| --- | --- | --- | --- |
| `ramify.analysis/2` | 2 | The report snapshot's parsed descriptions gain the nested-tree statement member | 3 scope `ownership`; 3A the parsed module header's `root` marker span; 3B the `unmarked-root-description` and marked-description `undeclared-project-boundary` layout issues; 4 origin, placement and target vocabulary; 8 `independentScopes` removed, `ProjectWarning`; 11 denied outcome, boundary diagnostics and excluded-target coverage |
| `ramify.affected/2`, `ramify.affected-cli/2` | 3 | The selection's `scope` gains `ownership` | 8 `independentScopes` removed; 14 bases, seed status, exclusion and topology; 17 CLI output |
| `ramify.watch/2`, `ramify.daemon-status/2` | 3 | Context status `scope` gains `ownership`; daemon status names `ramify.ipc/2` | 8 `independentScopes` removed; 15–17 check and status fields |
| `ramify.ipc/2` | 3 | The strict codec's context-status scope gains `ownership` | 8 `independentScopes` removed; 15–16 check request paths, classification sequence and dispositions |
| `ramify.check/2` | 8 | Embedded warnings become `ProjectWarning` | 11 boundary findings; 15 and 17 path dispositions replace `covered` |
| `ramify.measure/2` | 8 | `outsideModuleFiles` retires | 18 measurement buckets |
| `ramify.modularity/3` | 8 | `omittedScopes` lists declared nested trees instead of `independentScopes`; outside occurrences count `outside-project` targets, as the [modularity report specification](../../architecture/modularity-report.spec.md) requires | None |
| `ramify.architect-module/2`, `ramify.architect-view/2`, `ramify.architect-projection/2` | 18 | Boundary metadata in module records | None |
| `ramify.api-view`, `ramify.api-view-projection`, `ramify.explorer-*` | 18, only if the shape changes | Not expected | None |
| `ramify.cli/1`, `ramify.production-files/1`, `ramify.daemon-record/1` and every other identifier | Unchanged | None | None |

The daemon record keeps `ramify.daemon-record/1`; from iteration 3 its
`protocol` member names `ramify.ipc/2`, which its reader already compares
exactly. Iteration 4 renames `outside-module` to `outside-project` in
`SourceTarget`, which extends `ramify.analysis/2`, and in the modularity
producer's internal target kinds without changing the serialized modularity
report. Toolkit tests use `ramify.ipc/2` as the incompatible-peer literal;
iteration 3 replaces it with a literal no build produces. R7's issue codes are
new values of existing code fields, not new members: a document that carries
such a code as a string without enumerating it, such as `ramify.check/1` before
iteration 8 or a `ramify.cli/1` diagnostic, keeps its version, and the human
report keeps its root and selection lines.

Diagnostic, warning, coverage-note and limit code fields are open sets
(decided by the user on 2026-10-03): a reader tolerates a code it does not
know, and a new code is not a shape change. A changed meaning of an existing
value, or a new value in a closed status field that readers branch on, such as
an outcome or an execution status, is a shape change and advances the version.

If a slice finds an
earlier shape change than this table names, the version advances in that slice
and the coordinator updates the table.

## Git advisory warning

At CLI check time, when inside a repository and Git is available, run
`git ls-files --others --ignored --exclude-standard --directory` with NUL output
for path safety. Resolve repository-relative directory paths to the selected
project, classify them with Project facts, and warn only about ignored directories
Ramify would enter. Excluded directories and descendants produce no warning.
Do not read ignore files into model inputs or change selection from Git output.
No repository or executable means no warning; a failed optional Git command
does not change the analysis verdict. Handle spaces, nested project roots and
repository-relative paths outside the selected root.
