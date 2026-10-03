# Project

Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It resolves the root and compiler configuration on request, records raw source areas, configuration selection, outside-module warnings and README purpose metadata, can reuse its configuration product when its captured dependencies are unchanged, and can keep its observations live for a retained session, updating the inventory locally, rebuilding it for structural changes and re-observing its whole observed set, without deciding import permissions.

`resolveProjectRoot` selects the canonical root by the root marker and finds
its configuration. Without an explicit root it takes the nearest description
at or above the canonical working directory that carries the marker; unmarked
descriptions never stop the climb. An explicit root must carry it. Selection
reads each description it passes only to decide its marker, through the
supplied Descriptions reader, and from the lines that decode as UTF-8. With no
marked description it reports `root-not-found`, naming the working directory
and the nearest unmarked description, if any; an unmarked explicit root is
`unmarked-root-description`. A linked or non-file description is not read, so
it ends the climb and its own rules reject it. A reused resolution replays the
marker determination of every description it read, so a marker change makes it
stale and a marker-preserving edit does not. Its short-lived configuration
helper identifies unsupported references-only projects. Acquisition accepts a retained configuration
product and reuses it only after its complete observation recipe matches a fresh
capture, including absent inputs and enumerated directories.

`src/read-project.ts` exposes `readProject` through the reviewed vocabulary in
`src/interfaces/project.ts`. Supply a whole-project request, the text-only
`DescriptionParser` and `RootMarkerReader`, finite acquisition limits and an
optional abort signal.
Acquisition returns an open `ProjectInputView` on success; invalid layout,
unavailable selection/configuration, incomplete acquisition and cancellation
have distinct results. Raw header tags are retained without registry evaluation.

The view captures file bytes, exact directory entries, POSIX file kinds,
canonical paths and negative lookups. Inventory paths are root-relative; read
methods accept root-relative or absolute paths, and directory reads return
absolute child paths. External input records use `external:<directory-hash>/`
scopes so they cannot be mistaken for application locations. Source text must
be valid UTF-8; binary resource bytes are hashed without decoding. Description
encoding errors are invalid input. Parser diagnostics retain their original
code, line, column and span in located acquisition issues; malformed boundaries
never supply guessed owners.

Discovery decides the marker of every regular description it meets. A root
description without it is `unmarked-root-description`, which also covers a
marker lost between selection and reading; the root still contributes its
module. Any other marked description, at a child, stray or `src/` position, is
the layout error `undeclared-project-boundary`, located at its marker and
naming the nested-tree declaration its nearest enclosing module would add; it
contributes no module and its contents are attributed to none. A directory
that is not a module's own directory and holds a `package.json` is the same
layout error, located at the manifest. Discovery never stops at a nested
`tsconfig.json`; it prunes each module's scratch directory and every declared
nested tree before descent, observing the pruned directory as an entry of its
parent and reading nothing beneath it, so a marked description inside a
declared tree is never read. An observed description that gains or loses the
marker rebuilds the inventory through acquisition.

Configuration discovery uses the root or nearest ancestor `tsconfig.json`.
The pinned TypeScript 7.0.2 sync API performs configuration inheritance and file
selection inside a disposable process group. Its private helper receives every
filesystem result from the parent capture through a single-operation protocol,
with 1 MiB frames and sequential 192 KiB chunks. It opens no compiler program.
Configuration scripts and application entries are never executed. Owned source
is inventoried independently of compiler selection. Each project warning
carries a `code`, a `path`, a `message` and, where file evidence is needed, a
byte-ordered `files` list of at most 20 entries with the total `count`.
Compiler-selected source inside an owned-ignored tree or a module's scratch
directory produces one `compiler-selected-owned-ignored` or
`compiler-selected-scratch` warning per tree or directory, located there; such a
file is neither inventoried nor read, and selected files in an external tree
produce no warning. Other selected outside-source files produce the transitional
`outside-module-source` warning, one per first path entry, until auxiliary
source is analyzed. Each inventory file records its `placement`:
`src`, `auxiliary` for owned compiler source outside `src/`, or
`referenced-resource`. Acquisition inventories files beneath `src/` only, so
every file is `src` until auxiliary source is inventoried. Unselected outside-source files are silent,
but their misplaced descriptions remain errors. Declared nested trees, scratch
directories, installed dependencies and compiler output supply discovery
boundaries; an arbitrary compiler source exclusion cannot hide an owner or a
stray marker.

Acquisition validates its observations and retries the complete attempt up to
the supplied three-attempt ceiling within one deadline. The successful view
stays open so the later compiler adapter can capture additional influencing
inputs. Call `seal()` after that work to validate all observations and prohibit
new reads; a changed result requires discarding the entire view and dependent
compiler work. The source/session owners enforce their later-stage deadlines.
Always await idempotent `dispose()`, including on failures. It clears retained
bytes and observations; inventory and previously obtained input records remain
frozen plain data.

Exact source references use decoded POSIX paths with lexical normalization,
containment and byte-exact directory comparisons. They never use compiler
aliases, extension substitution or symlink traversal. Inventory records wildcard
interface eligibility; export expansion, tag assignment and linking arrive in
iteration 7. README purpose is the first top-level prose paragraph with inline
formatting rendered as text, or an explicit missing-file/no-paragraph state.

Every inventory's `scope.ownership` is the revision's immutable ownership
table: the modules, each module's scratch directory `src/tmp`, the compiler
configuration's output directories and the declared nested trees, byte-ordered
by directory. `classifyProjectPath` answers the owner of one canonical
project-relative path from that table alone, without reads or existence checks:
the first exclusion reached from the root wins, owned-ignored and scratch paths
keep their owner, and repository, package and generated segments are excluded
wherever they occur. Declarations are decoded and normalized against their
module; one that escapes, lies in a child module, overlaps another, places an
external tree under `src/` or names an always-excluded path contributes no
exclusion. Acquisition reports each such declaration as
`invalid-nested-tree`, or `overlapping-nested-tree` for every participant of an
overlap, located at its directory string. It then checks every other
declaration on the filesystem without traversing a symbolic link, observing
each directory from the declaring module down to the declared one: a link on
that path or at the target, or a target that exists but is not a directory, is
`invalid-nested-tree`; an absent owned-ignored target is
`missing-owned-ignored`; an absent external target is valid. Those
observations are captured inputs, so a tree's appearance or disappearance makes
the revision stale. Any such issue makes the acquisition invalid. The observer
ignores changes beneath a declared tree or scratch directory unless the
compiler reported reading the path, and rebuilds when such a directory itself
changes.

`isRamifyGeneratedSegment` reserves the generated view names at any depth:
`.ramify` and `.ramify-architect`, and their publisher siblings
`.ramify.tmp-<suffix>`, `.ramify.old-<suffix>`, `.ramify-architect.tmp-<suffix>`
and `.ramify-architect.old-<suffix>`. Inventory, the configuration host,
capture and the observer skip a path with such a segment, so publishing a view
starts no revision. Near misses such as `.ramify-other` stay ordinary. The
retained compiler's own directory listings do not omit these names yet; see
the [known gap](../../../../docs/architecture/materialized-api-view.spec.md#generated-output-isolation).
