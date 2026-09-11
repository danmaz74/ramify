# Project

Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It resolves the root and compiler configuration on request, records raw source areas, configuration selection, outside-module warnings and README purpose metadata, and can reuse its configuration product when its captured dependencies are unchanged, without deciding import permissions.

This is the final owner responsibility. Acquisition is implemented; the separate
`resolveProjectRoot` operation and retained configuration reuse remain incomplete.

`src/read-project.ts` exposes `readProject` through the reviewed vocabulary in
`src/interfaces/project.ts`. Supply a whole-project request, the text-only
`DescriptionParser`, finite acquisition limits and an optional abort signal.
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

Configuration discovery uses the root or nearest ancestor `tsconfig.json`.
The pinned TypeScript 7.0.2 sync API performs configuration inheritance and file
selection inside a disposable process group. Its private helper receives every
filesystem result from the parent capture through a single-operation protocol,
with 1 MiB frames and sequential 192 KiB chunks. It opens no compiler program.
Configuration scripts and application entries are never executed. Owned source
is inventoried independently of compiler selection; selected outside-source
files produce aggregated warnings. Unselected outside-source files are silent,
but their misplaced descriptions remain errors. Independent configurations,
installed dependencies and compiler output supply discovery boundaries; an
arbitrary compiler source exclusion cannot hide an owner or a stray marker.

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
