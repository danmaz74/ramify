# Project boundary and whole-tree ownership

**Date:** 2026-09-30, revised 2026-10-01. **Status:** decided, not
implemented. It records the decisions of the 2026-09-30 design discussion and
the 2026-10-01 simplification that removed the nested-project kind. Once
implemented, it changes the
[module description principles](../model/module-description.principles.md),
the [CLI invocation contract](cli-invocation.spec.md#files-outside-modules),
the harness's write-scope and test-selection rules in ramify-agent, and
ramify-audit's treatment of nested trees. Until then those documents stand.
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
  files, and may not edit anyone else's. An owned-ignored tree is written
  only where an assignment includes it, per section 10.
- The only exceptions are declared nested trees, of two kinds, in section 5.
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
relative to the module, with one of two kinds. The statements are part of
the description grammar, beside the exposure statements; their exact syntax
is the implementation plan's.

| Kind | Part of the project | Owned and written by the declaring module | Analyzed |
| --- | --- | --- | --- |
| `owned-ignored` | yes | yes | never |
| `external` | no | no | never |

**`owned-ignored`.** A directory the declaring module owns whose contents
Ramify never interprets. It is needed only where the contents look like
source or descriptions: sample `.ts` inputs for a parser test, a captured
project fragment, a spike, or a complete project such as an example or a
fixture project. Plain data needs no declaration, since by
containment it is already owned and never inventoried. The directory may lie
anywhere in the declaring module's own contents, including beneath
`src/tests/`, and not inside a child module. Ramify verifies only that it
exists and lies where it may. Discovery does not enter it, so a description
inside it is neither a stray nor a description-in-src error; none of its
files is inventoried, compiled by Ramify, checked, watched or listed in the
architect view. Ownership is unchanged by the declaration; the tree is left
out of test selection, per section 9, and out of an ordinary assignment's
write scope, per section 10.

**A project inside an ignored tree.** An example project is data to the
enclosing project: the declaring module owns it, its tests may read it, and
Ramify sees none of its descriptions, modules or imports. It is a project
only from its own directory, where `ramify`, the audit and the harness run
on it as on any root, with the enclosing project an ordinary external
package. The enclosing project records nothing about that, and detaching the
tree is deleting the declaration and moving the directory.

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

**Rules common to both.** The directory lies beneath the declaring
module's directory and outside every child module. An `owned-ignored`
directory must exist; an `external` one need not, since a scratch directory
or a tool cache is absent in a fresh checkout and is as if it did not exist
either way. An `external` directory lies outside the declaring module's
`src/`; only `owned-ignored` may lie beneath `src/tests/`. Discovery does not
descend into either.

**Migration diagnostic.** The current discovery convention, a directory
outside `src/` and `subs/` with its own `tsconfig.json` and no file selected
by the root configuration, stops ending the walk. It remains as a
diagnostic: an undeclared directory that is not a module's own directory
and holds a root description or a package manifest is a layout error that
names the declaration to add.
Nothing is dropped silently, and migration is guided.

## 6. Imports across a boundary

The model has one evaluation, the enclosing project's, and one rule:

- Code in the tree is analyzed. An import from it that resolves into an
  `owned-ignored` or `external` tree, other than by package
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

**The package boundary.** A project inside an ignored tree is its own
package: its own manifest, dependency resolution and compiler program. It
reaches the enclosing project only through the enclosing project's package,
by a bare specifier whose subpaths the package's `exports` map decides. Node
and TypeScript under NodeNext refuse an unlisted subpath, so that API is
enforced by the toolchain and Ramify does not model the exports map. Whether
a dependent honors it, rather than aliasing into the enclosing project's
internals, is not verified: in the dependent's own check such an import is
the existing outside-scope analysis limit. This is a named convention.

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

## 8. Auditing

By default an audit covers one project and knows no other, and no record
ever composes another project's verdict.

- A change beneath an `owned-ignored` tree belongs to the owning module and
  is classified by the project's policy like any owned non-source file. A
  project whose tests do not read the tree names it in the ignore list.
- An `external` tree's paths are removed, replacing the marker file for
  Ramify projects. The marker stays for projects that are not Ramify
  projects.
- A project inside an ignored tree is audited only by invoking the audit on
  it, with its own definition, change set, reuse lookup and record.
  ramify-audit's existing project-root and unpinned-dependency rules apply
  there unchanged.

**Nested audits, on request.** A nested project, for the audit, is a
directory beneath the project root that carries its own audit definition and
is neither inside an `external` tree nor opted out by its marker. Nothing in
a description declares it, and an ignored tree without a definition is plain
data. An `audit` invocation given the nested flag, in either mode, also
audits every nested project:

- Each nested audit runs in the enclosing audit's prepared checkout, after
  the enclosing checks, so its checks can use the enclosing project's build
  under audit.
- Each uses its own definition and writes its own record under its own key;
  nothing is composed into the enclosing record. A nested project's own
  nested projects are audited in turn.
- The caller gets one exit code and one result naming each project with its
  root, its verdict, whether it ran or was reused, and its failures.

Without the flag the audit is as above, so partial audits during a plan pay
nothing. The harness passes the flag at a plan's final gate, and a person
passes it for a release audit.

**Deferred.** During a plan, nothing verifies that an example still passes
under the changed toolkit until the final gate. A test owned by the module
that owns the tree, running the project's own analysis on it, would move
that earlier and is left to a later decision.

## 9. Test selection by ownership

Selecting a module for testing selects every test-shaped file the module
owns: the files beneath its directory, minus the subtrees of its children
under `subs/` and minus its declared nested trees of both kinds. An
`owned-ignored` tree is excluded because it may hold test-shaped fixtures
that must not run. Root selection therefore covers the root's `src/tests/`
and any root-owned tooling tests alike, and a child with a misplaced
sibling `tests/` directory has those tests run with the child. Selection is
the audit's and the harness's business, where a name convention such as
`.test.ts` is acceptable; it is not classification, which stays Ramify's
and follows areas.

Which modules are selected is unchanged: the dependency closure over import
facts for an audit, and the owner plus explicitly included child subtrees
for an iteration's scoped run. Tree position selects nothing by itself.

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
- The architect view lists each module's ignored trees.
- A changed check naming a path inside an ignored tree reports it as not
  analyzed, never as passed.
- Compiler-selected source inside an `owned-ignored` tree is a warning.
- The affected query answers every in-project path by containment; widening
  for an unowned path applies only outside the project.
- The outside-module-source warning is retired; its cases become ownership,
  findings or silence per sections 4 to 7. The outside-scope analysis limit
  remains for an import resolving outside the root other than through a
  package.
- The version 1 description grammar gains the two nested-tree statements.
- Production selection is unchanged: it consumes resolved areas, and owned
  non-source files are not production.
- The CLI's root selection is unchanged: the climb stops at a description
  outside `subs/`, so an invocation from inside an ignored tree selects the
  project there.

### ramify-agent harness

- A module scope is the module's directory minus its children's subtrees and
  its nested trees of both kinds.
- An assignment may include an `owned-ignored` tree of its module, named by
  the local architect with a reason, as it names included children: the tree
  is wholly included or wholly excluded. The iteration, its gate and its
  records are otherwise ordinary, so a change to the module and the matching
  change to the tree form one candidate. There is no separate iteration kind
  and no new action: an engineer that finds it needs the tree asks its
  architect or submits `unsuitable` with reason `scope`.
- An assignment that includes a tree carries instructions for it: the tree
  is not part of the project's module system, the write hook does not
  analyze it, its meaning is defined by the owner's tests and README, content
  those tests expect is not repaired even where it looks wrong, and where the
  tree is a project of its own, its instructions apply and its commands run
  from its directory.
- The write hook relays Ramify's not-analyzed answer for a path inside an
  ignored tree.
- The final gate invokes the audit with the nested flag of section 8 and
  records the result ramify-audit reports for each project. A CheckFinding
  from a nested audit names its project and concerns the module that owns the
  tree, as the agent's CheckFinding documents define.
- Substantial work on a project inside an ignored tree is a run rooted in
  that project, not an assignment of the enclosing one. The `outside-modules` purpose, the per-file
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
- The manifest walk for nested packages and the readiness run of their
  tests are removed, with the nested-tests switch: a package inside an
  ignored tree is data to the run. The packages whose installed dependencies
  readiness requires and a gate's worktree links are the package directories
  of the audit configuration's workspace preparation, since the project's
  tests may need them to read the tree.
- The agent's fixture projects are ignored trees of the module whose tests
  read them, which means moving them beneath the harness module.

### ramify-audit

- Section 8: `external` paths are removed from the change set, and
  widening for `unowned-path` is reserved for paths outside the project.
  The nested flag of section 8 is added to the `audit` command.
- Narrowed Vitest commands follow section 9: directory filters and
  exclusions in place of the current module `src` paths and root file
  lists, plus the coverage comparison of expected and run files.

## 11. Migration of the two projects

Toolkit:

- Declare `site/` and `examples/collection-review/` `owned-ignored` trees of
  the root. Separately, the site should consume the package through its
  exports.
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

- Move `fixtures/` beneath the harness module and declare each fixture
  `owned-ignored`, as well as source-shaped test fixtures such as the
  scenarios sample project, and exclude them from the compiler
  configuration, which selects them today, or the warning of section 5
  names them. `scripts/` becomes root-owned analyzed
  code. `spikes/` becomes `owned-ignored` or is deleted.

## 12. Decisions

Of 2026-09-30, as revised on 2026-10-01:

1. Owned code outside `src/` is analyzed as the owner's importer.
2. Two kinds of nested tree: `owned-ignored` and `external`. A data-only
   directory needs no declaration.
3. The declarations are statements in the enclosing module's description.
4. Nothing is derived from the repository's ignore rules. A project declares
   the directories Ramify must not enter; a warning names ignored
   directories it would still enter.
5. Analyzed code must not import from any nested tree; the reverse direction
   is not checked.
6. Test selection follows ownership, through Vitest directory filters and
   exclusions rather than file lists, with the test-first mandate of
   section 9.

Of 2026-10-01:

7. There is no `nested-project` kind. An example or fixture project is an
   `owned-ignored` tree of the enclosing project and a project only from its
   own directory. The earlier `nestedProjects` list is dropped.
8. An audit given the nested flag also audits every nested project, found
   by its own audit definition, inside the enclosing audit's prepared
   checkout and with separate records. The harness uses it at a plan's final
   gate. Earlier verification through an owned test is deferred.
9. In the harness, an ignored tree is written only by an assignment that
   includes it, with tree-specific instructions; there is no dedicated
   iteration kind. Until the final gate, nothing beyond the owner's tests
   verifies such an edit.
10. The harness links dependencies for the audit configuration's package
    directories instead of walking for manifests.

## 13. Proposed principles and glossary entries

Proposed additions and updates to the owning documents, once the open issues
are settled. Glossary entries define terms; principles state design rules.
Shared terms have one definition, reused by the other projects. Detailed
implementation recipes, diagnostics and migration guidance remain in sections 3 to 11;
unchanged principles are not repeated here. Provisional qualifications remain
attached to the affected entries.

### Ramify

Glossary entries, in the model glossary:

1. **Owned contents.** All paths beneath a module's directory except child
   module subtrees, declared external trees and always-excluded paths;
   owned-ignored trees remain included.
   *Updates “Files belonging to a module” rather than adding a second
   ownership definition.*
2. **Nested tree.** A directory declared in its enclosing module's
   description as an owned-ignored tree or an external tree.
3. **Owned-ignored tree.** An owned nested tree whose contents are excluded
   from Ramify interpretation.
4. **External tree.** A nested tree outside the enclosing project's
   ownership and analysis.
5. **Always-excluded path.** A path in repository metadata, installed
   packages, compiler-configured output directories or Ramify's generated
   directories, outside the enclosing project's ownership and analysis.
6. **Auxiliary source.** Compiler source a module owns outside its `src/`.
7. **Containment.** Attribution of a path to its nearest enclosing module
   within the project's declared boundaries, independently of inventory.
8. **Package resolution.** Resolution of a bare specifier through a
   `node_modules` directory, regardless of the resolved real path.

Principles:

1. **Ownership covers the whole project.** Every in-project path must have
   exactly one module owner, determinable by containment without an inventory
   entry. Inventory only analysis inputs. Repository ignore rules must not
   change ownership or analysis boundaries. *Module description, updates
   ownership and discovery rules.*
2. **Discovery respects declared boundaries.** Do not descend into nested
   trees. Report undeclared projects as layout errors and compiler-selected source in
   owned-ignored trees as warnings. Plain data needs no ignored-tree
   declaration. *Module description, new; replaces the implicit
   compiler-configuration boundary.*
3. **All owned source obeys its owner's rules.** Apply ordinary source tags,
   testing isolation and importability rules to auxiliary source. Auxiliary
   source cannot be exposed. *Module description and cross-module
   importability, new.*
4. **Imports respect project boundaries.** Imports from analyzed source into
   any nested tree must use package resolution. Package status follows
   resolution, not the resolved real path. A project inside an ignored tree
   uses the enclosing package by convention; its exports are enforced by the
   toolchain.
   *Cross-module importability and TypeScript source interpretation, new.*
5. **Evidence makes analysis boundaries visible.** Architectural evidence
   must identify owned-ignored trees. Absence of evidence
   within an unanalyzed tree proves nothing about its contents. *Module
   architect principles, new.*

### ramify-audit

Glossary entries:

1. **Test-shaped file.** A file whose name matches the configured
   test-selection pattern, independently of its Ramify source classification.

Principles, as entries in its decision list:

1. **Test selection follows ownership.** Select modules by dependency
   impact, not ancestry alone. Run their test-shaped files, excluding
   unselected modules' owned contents and all declared nested trees. Let the
   runner discover files within those boundaries. *New; the directory-filter recipe
   remains provisional on the mandated Vitest test and full-run exclusions.*
2. **Test selection is verified.** Compare expected test-shaped files with
   files actually run; report omissions as coverage notes. *New.*

### ramify-agent

Glossary entries, in the harness glossary:

1. **Included child.** A child module whose entire subtree is included in an
   assignment's scope.
2. **Included tree.** An owned-ignored tree of the assigned module that is
   included, whole, in an assignment's scope.

Reuse the model glossary's ownership terms and ramify-audit's definition of
**test-shaped file**, without redefining them in the harness glossary.

Principles, in the harness principles:

1. **Write authority follows module ownership.** A module assignment covers
   all its owned contents except owned-ignored trees; child subtrees and
   owned-ignored trees require explicit scope inclusion. Guarded configuration restricts authorization within that
   ownership. *Updates “Every Agent Scope Is a Cut on the Module Tree”.*
2. **Verification follows scope and audit policy.** Select the assignment's
   module and included children using the audit's ownership-based test policy.
   *New.*

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
