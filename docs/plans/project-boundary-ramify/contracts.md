# Phase 1 contract proposal

**Status:** proposed for the user's review. These are implementation contracts,
not claims of support. The user accepts or revises R1–R6 before iteration 1;
iteration 1 records that revision and puts the precise rules in the owning
specifications before iteration 2 implements them. Names below
are proposed additions to existing interfaces, not discovered available APIs.

## Review decisions

| ID | Proposed decision | Review boundary |
| --- | --- | --- |
| R1 | Two standalone version 1 statements: `owned-ignored "directory"` and `external "directory"`. | Grammar, reserved names, spans, malformed input and statement ordering. |
| R2 | Reject duplicate normalized directories and overlapping nested-tree declarations; reject symlink traversal, escapes, reserved exclusions and child-module overlap. | Decided 2026-10-03 as the simplest rule: any two declarations whose directories are equal or nested are an error, whatever their kinds, so at most one exclusion ever matches a path and no precedence rule exists. |
| R3 | One Project-owned path classifier over revision-bound scope metadata; affected/report/CLI/view schema 2 and IPC protocol 2. | Exact foreign vocabulary, exposure channels and all producers/consumers. |
| R4 | A changed check gives the result the complete check would give on the project after the change. Paths Ramify does not analyze carry a not-analyzed disposition and need no content coverage; they never change the exit code. Exit 2 remains only for a check that could not establish that result. | Hook/API disposition, content freshness and negative controls. |
| R5 | Decided 2026-10-03: correctness under the new rules comes first, optimization second. No rule is weakened to meet a limit or timing target. Capacity limits remain safety limits and are raised with a recorded measurement if the new rules need it. Earlier timing targets are measured and reported to the user at the end of the plan; missing one does not stop the plan. Inert/excluded contents never become inputs. | [Budgets](budgets.md), observation and cancellation coverage. |
| R6 | Decided 2026-10-03: the reference harness stays at `scripts/reference-harness/` as an owned-ignored tree of the root, with its compiler configuration, runner and commands unchanged; analyzed toolkit code no longer imports from it. Site consumes packed toolkit exports. | No analyzed importer of the tree, package/build graph and preserved test inventory. |

R2, R4 and R6 carry the user's decisions of 2026-10-03, and the user accepted
R1 and R3 as drafted and decided R5 on the same day; no entry is an open question. For R3 the
user confirmed that the path and the current declarations alone decide
ownership, and that no backwards compatibility is kept: the version numbers
change only so that an outdated reader fails clearly. R4 follows the user's decision of 2026-10-03: the changed check is the quick
form of the complete check and, wherever it answers, gives exactly the result
the complete check would give on the project after the change. It differs
only in analyzing the change against the retained baseline. The rule is stated
in the [CLI invocation specification](../../architecture/cli-invocation.spec.md#hook-and-complete-checks),
added at the user's request; the not-analyzed dispositions below are the part
iteration 1 still has to adopt there.

The review receipt resolves all six entries to accepted concrete wording or a
revised contract package. Adoption, implementation and acceptance are separate
statuses. Changes to an accepted interface invalidate affected downstream receipts.

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
`overlapping-nested-tree` and `undeclared-project-boundary`, retaining located
declaration evidence. A malformed statement is a description error. An invalid
boundary makes acquisition invalid; never attribute hidden contents to the
parent and continue with a valid partial model.

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
Use `ramify.ipc/2` for the strict daemon handshake and codec. Record the exact
schema inventory in iteration 1, including nested worker messages, root service
types, dependency reports, measurement results and browser DTOs. Unchanged
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

CLI root climbing remains unchanged: a description outside `subs/` establishes
its own root, including when invoked within a nested project. Production
selection still consumes resolved profiles; testing modules and nested testing
areas are excluded, ordinary analyzed auxiliary inputs are eligible, and inert
owned files are not production merely because they have an owner.

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
