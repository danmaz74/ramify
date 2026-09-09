# Iteration 5: Project acquisition and metadata

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iterations 2 and 4. Independent of iteration 3.
**Owner:** `subs/analysis/subs/project/`.

## Goal

Read a real project from an explicit root: discover owners, validate the
physical layout, inventory ordinary and testing source areas and resources,
capture a coherent view of file contents, warn about project files outside
modules, and extract README
purpose metadata. This is the first iteration that executes reference
instances against real files.

## Read first

- [Module-description principles](../../../model/module-description.principles.md):
  layout, `src/`, `subs/`, `src/tests/`, `src/interfaces/`, containment,
  symlink policy and the README convention.
- [CLI invocation](../../../architecture/cli-invocation.spec.md): selecting the
  project, compiler configuration, files outside modules.
- Main plan: Source scope and project selection, Supported platforms,
  Coherent inputs and later reuse, the `ProjectInputView` and
  `ProjectInventory` rows of the contract table.
- Iteration 1's `scope.md` for configuration files and limits.

## Deliverables

1. Root selection per the CLI contract: `--root`, or the climb from the
   working directory over canonical paths, including ordinary grouping
   directories between `subs/` and child modules. Stop at independent project
   boundaries as the CLI contract specifies; outside any project is a failure.
   Nothing above the selected root enters analysis. Child owners exist only
   beneath `subs/`; invalid descriptions in the checked tree, including one
   inside `src/`, and discovered stray `module.ramify` files are errors with the
   responsible path and no guessed ancestor owner. A stray description is
   invalid by placement even when its contents are valid. Compiler-selected
   loose source beneath `subs/` or in sibling
   `tests/` and `interfaces/` directories produces warnings, not layout errors.
   It receives no owned source-area classification.
2. `ProjectInventory`: declared IDs, parents, source areas, resources,
   empty owners with their intended source root, layout errors and outside-source
   warnings as distinct outcomes. Grouping directories preserve identity;
   rename and reparent change it, with no invented history.
3. Path rules: exact decoded paths, `/` separators, containment, root escape,
   byte-exact comparison against actual directory entries so a case mismatch
   is invalid on Linux and macOS alike, and POSIX symlink policy: reject a
   symlink root, description or referenced path; do not traverse directory
   symlinks.
4. `ProjectInputView`: captured bytes and content identities for source,
   descriptions, READMEs and configuration inputs; the compiler configuration
   found in the root or an ancestor; project files outside
   modules derived from that configuration's selection and warned about per
   top-level entry, with stray descriptions reported as individual layout
   errors; a scope report naming the root, how it was selected, the configuration
   and the walked areas.
5. README purpose extraction: path plus the first top-level prose paragraph;
   explicit missing-file and no-paragraph states; never another owner's text.
6. Real filesystem fixtures under the harness for every rule above, using the
   iteration 2 runner.

## Matrix rows executed here

- I1-02: all eight subcases; five invalid-layout outcomes and three
  outside-source warning outcomes.
- I1-03: `empty-owner`, `grouping-move`, `rename`, `reparent`.
- I1-04: `exact-path`, `case-mismatch`, `escape`, `symlink-root`,
  `symlink-description`, `symlink-reference`, `symlink-directory`.
- I1-25: `purpose`, `missing-readme`, `no-paragraph`, `readme-edit`.
- I1-29: `explicit-root`, `root-from-subdirectory`,
  `root-from-grouped-subdirectory`, `root-outside`,
  `nested-project-root`, `stray-files`, `scope-report`.

Root-selection fixtures include several grouping levels and an independent
example inside a child module's examples directory. The latter must stay
independent even though a higher ancestor contains it beneath its own `subs/`.
The `stray-files` fixture asserts per-entry aggregation and counts, and silence
for unselected files outside module source areas. I1-02's `stray-description`
adds a syntactically valid `tests/module.ramify` beside a selected `tests/helper.ts`
and expects a located layout error. The three I1-02 warning cases have no stray
description and assert that the files are outside checked source without
invalidating the tree.

## Verification

```sh
npm run type-check && npm test
npm run reference:verify -- --plan 1   # the rows above executed; the rest pending
```

## Exit criteria

- The unchanged reference inventories exactly fifteen owners with their
  source areas and both CSS resources; the toolkit skeleton inventories nine.
- Every listed instance ran against real files and asserted its own outcome.

## Handoff

Iteration 6 reads compiler inputs only through `ProjectInputView`. Iterations
7 and 12 consume the inventory and content identities.
