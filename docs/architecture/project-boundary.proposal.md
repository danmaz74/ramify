# Project boundary and whole-tree ownership

**Date:** 2026-09-30. **Status:** decided, not implemented. It records the
decisions of the 2026-09-30 design discussion. Once implemented, it changes the
[module description principles](../model/module-description.principles.md),
the [CLI invocation contract](cli-invocation.spec.md#files-outside-modules),
the harness's write-scope and test-selection rules in ramify-agent, and
ramify-audit's treatment of nested projects. Until then those documents stand.
Syntax and plan breakdown are left to the implementation plan.

## 1. Why

Ramify and its tools were planned around modules. Files no module owns were
treated as a residual case: the CLI warns about compiler-selected ones and is
silent about the rest, and the harness added an `outside-modules` write
purpose to get past one blocked run. That purpose conflated two decisions, a
write permission and a test-selection root, and the audit adapter then
replaced each per-file check it produced with the whole suite. The
[run-problems analysis](../../ramify-agent/docs/analysis/2026-09-25-toolkit-run-problems.md#h6-no-assignment-can-write-a-file-outside-every-module)
records the incident. The root cause is that "outside modules" was never
defined positively, so every layer improvised its own meaning.

The survey behind this document found the same gap in the toolkit itself: the
reference harness under `scripts/` imports the analysis module's internals by
relative path, and no rule fires, because `scripts/` is outside the compiler
configuration and unselected files are silent.

## 2. The principle

- Every file beneath the project root belongs to exactly one module: the
  nearest enclosing module, minus the subtrees of its children under `subs/`
  and minus its declared nested trees. The root is a module and owns what no
  child owns, including the project's configuration, documentation and
  repository host files.
- Write permission works at module level. An agent that may edit a module's
  code may edit that module's configuration, documentation and other owned
  files, and may not edit anyone else's.
- The only exceptions are declared nested trees, of three kinds, in section 5.
  Part of the project means belongs to a module; not part of the project
  means as if it did not exist.
- Ramify gives every guarantee such a system can give and no more. Where a
  rule can rest only on a convention, the convention is accepted and named.

## 3. Ownership is a rule over paths, not an inventory

Owning a file does not mean inventorying it. Ownership is a function of the
path alone, answered from the module tree and the declared boundaries, for a
file that exists, one about to be created or one just deleted. The inventory
keeps exactly what the analysis reads and fingerprints: descriptions,
READMEs, package manifests, configuration, compiler source and referenced
resources. Documentation, plans and other inert owned files are never listed,
never hashed and never watched.

Consequences:

- The affected query gains a `containment` basis beside `inventory`,
  `declaration` and `area`. The `none` basis remains only for paths outside
  the project.
- Discovery still visits every non-excluded directory, to find descriptions
  and honor boundaries, and records no more files than today.
- The inventory ceilings and the daemon's watch set are unchanged; no
  ignore file becomes an influencing input.
- A directory of plain data needs no declaration of any kind. Section 5
  says when one is needed.

## 4. Owned code outside `src/`

A compiler-source file that a module owns but that lies outside its `src/`,
such as a build script at the root, is analyzed as that module's importer
with the module's ordinary classification and tags. It may import same-owner
internals under the existing exemption, it needs exposure for anything
foreign, and it can never be exposed itself because exposure paths start at
`src/`. Its exports are nobody's API.

The synthetic compiler program already includes owned files whatever the
configuration selects, so the mechanism exists. The weaker reading, owned but
unanalyzed, would keep the back door of section 1 open. Files that resolve
badly under the root's compiler options become coverage notes, as today. A
script that imports test-only helpers is denied by testing isolation and
moves into `src/tests/` or a testing module. A test-shaped file outside
`src/tests/` is ordinary auxiliary code for import rules; whether it runs is
decided by test selection, section 9, which follows ownership rather than
areas. Ramify has no view of runner configuration and never claims that a
file is or is not selected by one. The toolkit's reference harness, whose
tests live under `scripts/` and run under their own Vitest configuration,
is the standing instance.

Today's warning for loose source beneath `subs/` disappears: such a file is
the parent's, and is analyzed as the parent's.

## 5. Nested trees

A module declares each nested tree in its own description, by directory
relative to the module, with one of three kinds. The statements are part of
the description grammar, beside the exposure statements; their exact syntax
is the implementation plan's.

| Kind | Part of the project | Owned and written by the declaring module | Analyzed |
| --- | --- | --- | --- |
| `nested-project` | yes | yes | in its own evaluation, as a Ramify root |
| `owned-ignored` | yes | yes | never |
| `external` | no | no | never, by this project |

**`nested-project`.** A dependent sub-project: it uses the enclosing project
and depends on it, and it can be detached as its own project. Example
projects and fixture projects are nested projects. The directory must hold a
valid root description of its own, which Ramify verifies. Nothing inside it
changes on declaration, and detaching it is deleting the declaration and
moving the directory. In the enclosing view it is a node of kind `project`
whose parent is the declaring module, whose name is its own root name and
whose purpose is read from its README. It has no source areas, no tags and
no exposure in either direction, and it is not a child for `expose-sub`. Its
own modules exist only in its own evaluation, where the enclosing project is
an ordinary external package.

**`owned-ignored`.** A directory the declaring module owns whose contents
Ramify never interprets. It is needed only where the contents look like
source or descriptions: sample `.ts` inputs for a parser test, a captured
project fragment, a spike. Plain data needs no declaration, since by
containment it is already owned and never inventoried. The directory may lie
anywhere in the declaring module's own contents, including beneath
`src/tests/`, and not inside a child module. Ramify verifies only that it
exists and lies where it may. Discovery does not enter it, so a description
inside it is neither a stray nor a description-in-src error; none of its
files is inventoried, compiled by Ramify, checked, watched or listed in the
architect view. Ownership, write scope and test selection are unchanged by the
declaration.

The declaration is an analysis gap by design, bounded by these rules:

- Analyzed code cannot depend on an ignored tree: an import resolving into
  it is a definite finding, per section 6. Code hidden there is unreachable
  through the import graph. This is the guarantee.
- Compiler-selected source inside an ignored tree is a warning. A file the
  project compiles is part of its program, and the declaration contradicts
  that; the project excludes the tree from compilation or stops ignoring it.
- The architect view lists each module's ignored trees, so the omission is
  visible to an agent.
- Ramify does not prevent a runner or a tool from executing files there by
  its own configuration. That remains a convention.

A real instance: the scenarios module's fixture at
`ramify-agent/subs/harness/subs/scenarios/src/tests/fixtures/sample-project/`,
a miniature project read as text by a rendering test. Today its step files
are analyzed as the scenarios module's testing source and pass by luck, it
cannot carry a description, and its world's exported type appears in the
architect view as a scenarios symbol.

**`external`.** Not part of the project, as if it did not exist. ramify-agent
inside the toolkit checkout is external. Discovery does not enter it, nobody
in a run of the enclosing project writes it, and changes there affect
nothing here.

**Rules common to all three.** The directory lies beneath the declaring
module's directory and outside every child module. A `nested-project` or
`owned-ignored` directory must exist; an `external` one need not, since a
scratch directory or a tool cache is absent in a fresh checkout and is as if
it did not exist either way. A `nested-project` or `external` directory lies
outside the declaring module's `src/`; only `owned-ignored` may lie beneath
`src/tests/`. Discovery does not descend into any of them.

**Migration diagnostic.** The current discovery convention, a directory
outside `src/` and `subs/` with its own `tsconfig.json` and no file selected
by the root configuration, stops ending the walk. It remains as a
diagnostic: an undeclared directory that is not a module's own directory
and holds a root description or a package manifest is a layout error that
names the declaration to add.
Nothing is dropped silently, and migration is guided.

## 6. Imports across a boundary

The model has one evaluation, the enclosing project's, and one rule:

- Code in the tree is analyzed. An import from it that resolves into a
  `nested-project`, `owned-ignored` or `external` tree, other than by package
  resolution through `node_modules`, is a definite finding. Relative paths
  and workspace links are both caught. A subtree the project needs to import
  belongs under `subs/` as a child, or is an external package.
- Code in those trees is not analyzed, so what it imports is not this
  evaluation's concern.

Imports resolved through `node_modules` into installed packages stay external
package imports, unchecked as today. The check judges how resolution went, a
bare specifier through a `node_modules` directory, never where the real file
ends up: a linked dependency resolves to a real path inside the enclosing
tree and still counts as a package import.

**The package boundary.** From the TypeScript and JavaScript point of view a
nested project is its own package: its own manifest, its own dependency
resolution and its own compiler program. It reaches the enclosing project
only through the enclosing project's package. Across packages the specifier
is a bare package name resolved through `node_modules`, and the enclosing
package's `exports` map decides which subpaths exist. Node and TypeScript
under NodeNext both refuse a subpath the map does not list, so the
dependent's public API is enforced by the toolchain and Ramify does not model
the exports map. Whether a dependent honors that, rather than aliasing into
the enclosing project's internals, is not verified: in the dependent's own
check such an import is the existing outside-scope analysis limit, visible
and nonblocking. This is a named convention, and a reverse rule can be added
later without changing anything decided here.

Current state in this checkout: ramify-agent depends on the toolkit through
the registry and imports a listed entry. The site aliases
`@ramify/presentation` and `@ramify/model` straight onto internal index files
in [docusaurus.config.ts](../../site/docusaurus.config.ts). The example
project imports nothing from the toolkit; it is a check target, not a
dependent.

## 7. Not part of the project

Nothing is derived from the repository's ignore rules. It is the project's
responsibility to declare the directories Ramify must not enter. A path is
outside the project's analysis in exactly three cases, all deterministic
from the tree and the descriptions, so every checkout agrees whatever its
local exclude files say:

1. Always excluded: the repository's metadata directory, installed packages,
   the compiler configuration's output directories and Ramify's own generated
   paths.
2. A declared `external` tree, per section 5: not owned, as if it did not
   exist. Scratch directories, tool caches and build outputs that are not the
   compiler's are declared this way.
3. A declared `owned-ignored` tree, per section 5: owned, never entered.

An undeclared unversioned directory is an ordinary owned directory: it is
walked for descriptions, and compiler source inside it is analyzed as the
owner's code under section 4. That is the incentive to declare it.

**Ignored-but-walked warning.** Where the root lies in a repository and a
`git` executable is available, `ramify check` lists the directories the
repository ignores, with `git ls-files --others --ignored --exclude-standard
--directory`, and reports as a warning each one that Ramify would enter: not
always excluded and not inside a declared `external` or `owned-ignored`
tree. The warning names the declaration to add. It is nonblocking, nothing in
the model depends on it, and without a repository or without `git` it is
simply absent. The special case for `.reference-work` in discovery is
removed; the toolkit declares that directory instead.

## 8. Auditing a project with nested projects

An audit of a project is delegated to its nested projects: each is audited
as an independent project, and nothing is composed into the enclosing
record. Structure stays in the descriptions; which nested projects an audit
also runs is audit policy and lives in `ramify-audit.json`, beside the
project's checks, ignore list and workspace preparation. This also serves
projects that are not Ramify projects, which have no description to declare
anything in.

The configuration lists the nested projects an audit of the project also
audits:

```json
{
  "nestedProjects": ["examples/collection-review", "site"]
}
```

Rules:

- A listed root must be declared a `nested-project` by the project's
  descriptions when the project is a Ramify project. Listing an undeclared
  directory, or one declared `external`, is a configuration error, so the
  two files never disagree silently.
- A listed project must have its own audit definition. Its checks and
  commands are its own; the enclosing runner never touches its files.
- The enclosing audit audits the enclosing project only: its own checks,
  its own ignore list, its own reuse lookup and its own record. Paths
  beneath a declared nested project, listed or not, are removed from its
  change set, since they are that project's. A change beneath a nested project alone leaves
  the enclosing record reusable; a change to the enclosing project alone
  leaves each nested project's reuse to that project.
- For each listed nested project, the driver requests an independent audit
  of it in the same mode, partial or full. That audit applies the nested
  project's own ignore list, reuse rule and unpinned-dependency rule, and
  writes its record under the nested project's own key. A nested project
  inside a nested project is that project's to delegate in turn, so the
  scheme is recursive with no special case.
- The caller sees the conjunction: one exit code, and one report naming the
  enclosing project and each nested project with its verdict and whether it
  ran or was reused. No record claims coverage it did not run, and no
  enclosing record cites a nested verdict that could go stale.
- An unchanged listed project costs a manifest read and one ref lookup: its
  own changes since are empty, no module is selected, and its existing
  record for the same tree is reused.
- A listed project whose manifest depends on the enclosing project through a
  workspace, file or link specifier is an unpinned dependent, and ramify-audit
  already counts the enclosing project's impacting changes as its own. Those
  paths resolve to none of its modules, so it re-runs its whole ledger, in
  either mode. This is the price of being live against the enclosing source,
  chosen in the dependent's manifest; a dependent that consumes the built
  package at a pinned version costs nothing until it upgrades.
- A declared nested project that is not listed is not audited, and the
  report names it as skipped. Absent key: none audited, every declared
  nested project named. A consumer asking whether a commit is audited for
  the enclosing project and a nested one queries each project's status,
  which the per-project refs support.
- An `external` tree's paths are removed, replacing the marker file for
  Ramify projects. The marker stays for projects that are not Ramify
  projects.
- An `owned-ignored` tree needs nothing: its changes belong to the owning
  module and are classified by the project's policy like any owned non-source
  file.

The driver is ramify-audit's `audit` command, so a person gets one
invocation and one exit code. The harness invokes the same command at its
gates and records the conjunction in its own gate record, as it does for
several checks today.

## 9. Test selection by ownership

Selecting a module for testing selects every test-shaped file the module
owns: the files beneath its directory, minus the subtrees of its children
under `subs/` and minus its declared nested trees of all three kinds. An
`owned-ignored` tree is excluded because it may hold test-shaped fixtures
that must not run. Root selection therefore covers the root's `src/tests/`
and any root-owned tooling tests alike, and a child with a misplaced
sibling `tests/` directory has those tests run with the child. Selection is
the audit's and the harness's business, where a name convention such as
`.test.ts` is acceptable; it is not classification, which stays Ramify's
and follows areas.

Which modules are selected is unchanged: the dependency closure over import
facts for an audit, and the owner plus explicitly included child subtrees
for an iteration's scoped run. Tree position selects nothing by itself, and
a nested project is outside the closure, per section 8.

**Through Vitest, without file lists.** The command names directories, not
files, using two facilities verified in Vitest 4.1.11:

- A positional filter is a substring match on each test file's path, and a
  filter ending in `/` keeps its trailing slash, so `subs/cli/` matches every
  test beneath `cli` and nothing beneath `subs/cli-extra/`.
- `--exclude` is a repeatable option adding globs to the configuration's
  exclude list, and an exclusion wins over a filter.

For a selection of modules, one invocation carries: one positional filter
per selected module, its directory with a trailing slash, and none for the
root, since no filter means all files; one `--exclude` per child module of a
selected module that is not itself selected, covering that child's own
contents; one `--exclude` per declared nested tree of a selected module; and
the audit's reporters as today. Exact file lists never appear on the
command line.

**The subtlety.** Where an unselected child has a selected descendant, the
child's exclusion must cover its own contents and not its `subs/`. Globs
cannot subtract, but picomatch's extended syntax can express it, as
`subs/cli/!(subs)/**` together with `subs/cli/*`. Vitest globs through
picomatch, where that syntax is on by default. The fallback is one
invocation per group of selected modules not nested inside an unselected
one, each with plain `**` exclusions; the closure rarely produces that
shape.

**Mandate: test first.** Before any plan relies on this recipe, a test
against the pinned Vitest must establish, on a fixture tree with a root, a
child, a grandchild, a sibling whose name extends the child's, and one
nested tree of each kind: that the trailing-slash filter excludes the
sibling; that the exclusions remove the unselected child and every nested
tree; that the extended-glob exclusion keeps a selected grandchild under an
unselected child; and that the reporter's summary lists exactly the
expected files. If the extended glob fails, the fallback is adopted and the
recipe's text here is corrected. No selection code is written before that
test passes.

**Two conditions.** The project's Vitest include must cover test-shaped
files anywhere in the tree, with nested trees and unversioned paths
excluded; a filter only narrows what the configuration includes, and
`--passWithNoTests` would hide an omission. And the audit verifies it: the
tracked files under each selected module, exclusions applied, compared with
the reporter's summary of files that ran, give a coverage note naming any
test the runner did not select. That list is internal to the comparison and
never part of the command. This is the guarantee the harness's per-file
outside suites were reaching for, obtained without extra runs.

Tests needing their own runner configuration, as the reference harness does
today, either fold into the main configuration, which the broad include
favors, or remain a separately declared command in the audit definition.

## 10. Consequences by layer

### Ramify

- Discovery honors declared boundaries; the `tsconfig.json` convention
  becomes a diagnostic, and the ignored-but-walked warning of section 7 is
  added to the CLI check.
- The inventory adds owned compiler source outside `src/` and nothing else.
- The architect view lists nested projects as nodes of kind `project` and
  each module's ignored trees.
- Compiler-selected source inside an `owned-ignored` tree is a warning.
- The affected query answers every in-project path by containment; widening
  for an unowned path applies only outside the project.
- The outside-module-source warning is retired; its cases become ownership,
  findings or silence per sections 4 to 7. The outside-scope analysis limit
  remains for an import resolving outside the root other than through a
  package.
- The version 1 description grammar gains the three nested-tree statements.
- Production selection is unchanged: it consumes resolved areas, and owned
  non-source files are not production.
- The CLI's root selection climb stops at a declared nested project's root,
  as it stops today at a description outside `subs/`.

### ramify-agent harness

- A module scope is the module's directory minus its children's subtrees and
  its `external` trees. `nested-project` and `owned-ignored` trees are inside
  the declaring module's scope. The `outside-modules` purpose, the per-file
  outside suites and the hook's suppression of outside warnings are removed.
  The audit adapter's whole-suite substitution stays for the scoped tests
  check, whose narrowing by affected modules it exists for; it no longer has
  a per-file check to misapply to.
- The guarded-configuration rule stays as an authorization layer within root
  scope. A child-scoped engineer needing a root configuration change requests
  it from the root's owner, the lowest common ancestor rule already in the
  harness principles.
- A change to an owned non-source file is the owner's change and is
  selected like any other: the owner's tests and those of its transitive
  importers, through the affected query's dependency closure. At the root
  that is the whole project. This is a convention, not a derivation: Ramify
  follows imports, not filesystem reads, so a module that opens the file by
  path while importing nothing from its owner, or a descendant that imports
  nothing from it, is not selected. The full audit every 25 changes and at
  plan end bounds that case, as it bounds every partial audit. The project's
  ignore list names inert paths, such as documentation, so they select
  nothing.
- The scoped run of an iteration resolves each selected module's tests by
  section 9, with the same Vitest recipe as the audit, so harness and audit
  select identically.
- Nested packages come from the audit configuration's list, not from a
  manifest walk. Readiness installs the listed projects; gates invoke the
  delegating audit of section 8 and record the conjunction, without a
  separate nested-tests switch.
- The agent's fixture projects are nested projects of the module whose tests
  read them, which means moving them beneath the harness module.

### ramify-audit

- Section 8 in full: the `audit` command delegates to listed nested
  projects, records stay strictly per project, and no record composes
  another project's verdict. Widening for `unowned-path` is reserved for
  paths outside the project.
- Narrowed Vitest commands follow section 9: directory filters and
  exclusions in place of the current module `src` paths and root file
  lists, plus the coverage comparison of expected and run files.

## 11. Migration of the two projects

Toolkit:

- Declare `site/` and `examples/collection-review/` as nested projects,
  and list them in the audit configuration as the release audit requires.
  The site gains a root description and, separately, should consume the
  package through its exports.
- Declare `ramify-agent/` external, and every ignored directory the warning
  of section 7 would otherwise name: `.reference-work/`, `.history/`, which
  holds editor copies of source files that would be analyzed as the root's
  code, `.cucumber-viz/`, `.playwright-mcp/` and the planning-state
  directory beneath the done Plan 1. Ramify's generated views, `dist/` and
  `node_modules/` are always excluded and need no declaration.
- Turn the reference harness into a testing module. Root scripts and
  measurements become root-owned analyzed code, and the analysis module
  exposes to the root what they import.

ramify-agent:

- Move `fixtures/` beneath the harness module and declare each fixture a
  nested project. Declare source-shaped test fixtures such as the scenarios
  sample project `owned-ignored`, and exclude them from the compiler
  configuration, which selects them today, or the warning of section 5
  names them. `scripts/` becomes root-owned analyzed
  code. `spikes/` becomes `owned-ignored` or is deleted.

## 12. Decisions of 2026-09-30

1. Owned code outside `src/` is analyzed as the owner's importer.
2. Three kinds of nested tree: `nested-project`, `owned-ignored`,
   `external`. A data-only directory is not made a project; plain data needs
   no declaration.
3. The declarations are statements in the enclosing module's description.
4. Nothing is derived from the repository's ignore rules. A project declares
   the directories Ramify must not enter; a warning names ignored
   directories it would still enter.
5. Analyzed code must not import from any nested tree; the reverse direction
   is not checked.
6. Nested projects an audit also runs are listed in `ramify-audit.json`;
   the audit delegates to each as an independent audit in its own mode and
   reports the conjunction, composing nothing into its own record; an
   unchanged one costs a ref lookup; an unpinned dependent re-runs by
   ramify-audit's existing rule. The dependency reading is thereby already
   in place.
7. Test selection follows ownership, through Vitest directory filters and
   exclusions rather than file lists, with the test-first mandate of
   section 9.

## 13. Proposed principles and glossary entries

What this document adds to the principles documents and their glossaries,
once its open issues are settled, grouped by project. Principles are rules;
glossary entries are definitions. Each list runs from the most impactful
down, and each entry names its document and whether it is new or updates an
existing statement. Three principles are provisional on the issues raised
against section 8 and section 9.

### Ramify

Principles:

1. **Whole-tree ownership.** Every path beneath the project root belongs to
   exactly one module: the nearest enclosing module, minus the subtrees of
   its children under `subs/` and minus its declared nested trees. The root
   owns what no child owns. *Module description, updates the rule that a
   module owns only its `src/` and its two declaration files.*
2. **Boundary imports.** An import from analyzed source that resolves into
   a nested tree of any kind, other than by package resolution, is a
   violation. Code in nested trees is not analyzed, and what it imports is
   not evaluated. *Cross-module importability, new.*
3. **Not part of the project.** Exactly the always-excluded paths and the
   declared external trees are outside the project. Nothing is derived
   from the repository's ignore rules. *Module description, updates the
   caller-supplied discovery exclusions.*
4. **Auxiliary source is ordinary source.** Compiler source a module owns
   outside its `src/` is analyzed as that module's ordinary source: same
   tags, same testing isolation, same need for exposure. It is never
   exposable. *Module description and cross-module importability, new.*
5. **Nested trees are declared by their owner.** A module declares its
   nested trees in its own description, and discovery does not enter them.
   A nested project's own root description is verified, nothing in it
   changes on declaration, and detaching it is deleting the declaration.
   *Module description, new.*
6. **The package is the boundary.** A nested project reaches the enclosing
   project only through the enclosing package. Ramify does not model the
   package's exports map; that guarantee is the toolchain's. Whether an
   import crossed a boundary is judged by how it resolved, never by the
   real path it reached. *Cross-module importability and TypeScript source
   interpretation, new.*
7. **Ownership is not inventory.** Ownership is answered from the path and
   the tree. Ramify reads and fingerprints only descriptions, READMEs,
   manifests, configuration, compiler source and referenced resources;
   other owned files are never listed. *Module description, new.*
8. **An ignored tree is bounded.** An owned-ignored tree is declared only
   where owned contents look like source or descriptions; plain data needs
   no declaration. Compiler-selected source inside it is a warning, and
   what a runner executes there is not Ramify's to prevent. *Module
   description, new.*
9. **Undeclared projects are layout errors.** An undeclared directory
   outside every module's own directory that holds a root description or
   a package manifest is a layout error naming the declaration to add.
   *Module description, updates the compiler-configuration convention.*
10. **Boundaries are evidence.** The architect view shows nested projects
    as nodes and lists each module's ignored trees, so an agent sees where
    analysis stops. Absence inside those trees is not evidence. *Module
    architect principles, new.*
11. **Outside the root is a limit.** An import resolving outside the
    project root other than through a package remains an analysis limit.
    *TypeScript source interpretation, unchanged, restated for contrast
    with principle 2.*

Glossary entries, in the model glossary:

1. **Owned contents.** Everything beneath a module's directory except the
   subtrees of its children under `subs/` and its declared nested trees.
2. **Nested tree.** A directory a module declares in its description as one
   of three kinds: nested project, owned-ignored tree or external tree.
   Discovery does not enter it.
3. **Nested project.** A nested tree that is owned by the declaring module
   and is a Ramify project of its own, with its own root description,
   package and evaluation.
4. **External tree.** A nested tree that is not part of the project: not
   owned, not entered, as if it did not exist.
5. **Owned-ignored tree.** A nested tree owned by the declaring module whose
   contents Ramify never interprets.
6. **Auxiliary source.** Compiler source a module owns outside its `src/`.
7. **Package resolution.** Resolution of a bare specifier through a
   `node_modules` directory, whatever real path it reaches.
8. **Always-excluded path.** The repository's metadata directory, installed
   packages, the compiler configuration's output directories and Ramify's
   own generated paths.
9. **Containment.** The basis on which a path is attributed to a module by
   position alone, without an inventory entry.

### ramify-audit

Principles, as entries in its decision list:

1. **One audit per project.** An audit covers one project root. It
   delegates to listed nested projects as independent audits in the same
   mode, reports the conjunction, and composes nothing across projects.
   *New.*
2. **Nested paths are theirs.** Paths beneath a declared nested project are
   removed from the enclosing change set, and an unpinned dependent counts
   the enclosing project's impacting changes as its own. *New; provisional
   on the test-input question.*
3. **Selection goes through the runner.** Narrowing names directories, not
   files: a filter per selected module and an exclusion per unselected
   module beneath one, plus every nested tree, on every run. *New;
   provisional on the mandated Vitest test and on full-run exclusions.*
4. **Selection is covered.** A selected file the runner did not run is a
   coverage note, never a silent pass. *New.*

Glossary entries:

1. **Unpinned dependent.** A nested project whose manifest depends on the
   enclosing project through a workspace, file or link specifier.
2. **Test-shaped file.** A file whose name matches the audit's test
   pattern, such as a `.test.ts` suffix; a selection convention, not a
   classification.
3. **Test input.** A nested tree the enclosing project's own tests read.
   *Provisional.*

### ramify-agent

Principles, in the harness principles:

1. **Every agent scope is a cut on the module tree.** A module scope is the
   module's owned contents. Write permission at module level covers the
   module's configuration and documentation, there is no write purpose for
   files no module owns, and guarded configuration is an authorization rule
   within a scope, never a second ownership. *Updates the existing
   statement.*
2. **Tests follow ownership.** A module's tests are the test-shaped files it
   owns. Which modules are selected comes from the scope, the owner plus its
   included children, or from the audit's dependency closure. Tree position
   selects nothing by itself. *New.*
3. **Nested projects verify themselves.** A nested project is verified
   through its own definition and commands. The enclosing runner never runs
   its files, and the harness takes the list from the audit configuration
   rather than from a walk. *New.*

Glossary entries, in the harness glossary:

1. **Test-shaped file.** As in ramify-audit; the harness's selection uses
   the same pattern.
2. **Included child.** A child module whose whole subtree an assignment's
   scope names; a scope includes a child entirely or not at all.

## 14. Verified current state

Facts established on 2026-09-30, for the reader who checks this document
against the code:

- Discovery walks the whole tree and ends a branch at a directory with its
  own `tsconfig.json` and no selected file, in
  [inventory.ts](../../subs/analysis/subs/project/src/inventory.ts). The
  principles sanction caller-supplied exclusions for independent projects.
- The inventory records only files beneath `src/`.
- The harness limits a module's own contents to `src/`, `module.ramify` and
  `README.md` in [scope.ts](../../ramify-agent/subs/harness/src/work/scope.ts),
  copies `outside-modules` paths into the test policy, discovers suites
  beneath them and runs each alone, and the audit adapter replaces every
  selection-bearing tests check with the whole-suite command.
- The harness discovers nested packages by walking for manifests and runs
  their tests at readiness only.
- ramify-audit keeps each project's evidence under its own refs, opts a
  nested project out through a marker file in that project, widens to the
  whole ledger when a changed path resolves to no module, and counts the
  enclosing project's changes as an unpinned dependent's own.
- The agent's own `scripts/` directory carries a `tsconfig.json` and is
  therefore silently treated as an independent project today.
- ramify-audit narrows a Vitest command by appending each selected module's
  `src` directory as a positional filter, and the root's tracked `src` files
  one by one, then `--passWithNoTests` and its own reporter. Vitest 4.1.11
  matches positional filters as substrings, honors a trailing slash, and
  accepts repeatable `--exclude` globs.
