# Written provider topology and expected answers

**Status:** proposed independent fixture contract. It describes files and
expected answers; it is not a fixture library. Toolkit tests construct isolated
copies locally. Phase 2/3 consumers construct this topology in their own tests
and execute their pinned Ramify. No fixture files are shared between projects.

## Topology

```text
app/                              root module app tagged [dispatch]
  module.ramify
  tsconfig.json
  README.md
  notes/design.md                 inert root-owned prose
  scripts/check.ts                root auxiliary source imports a's api
  src/main.ts
  src/forward.ts                  mutation: forwards an auxiliary original
  src/tmp/throwaway.test.ts        root-owned scratch, unanalyzed
  tools/tmp/helper.ts             root auxiliary source, not scratch
  fixture-project/                root owned-ignored; its own module/config
  external-project/               root external, optionally absent
  subs/
    a/                            module a, api exposed to parent
      src/api.ts                  export function api(): number
      src/tests/api.test.ts        testing area
      src/tests/tmp/real.test.ts   ordinary testing source, not scratch
      src/tmp/throwaway.ts         a-owned scratch
      scripts/report.ts           a auxiliary source; same-owner api import
      fixtures/sample/            a owned-ignored, miniature project
      subs/grand/                 module grand; no import edges
    a-extra/                      independent sibling, no import edges
      src/other.test.ts
    b/                            module b; imports a's api
      src/consumer.ts
  node_modules/sample/            installed link into a's ignored sample
```

Root declarations, under the adopted grammar:

```ramify
ramify 1
root module app tagged [dispatch]
owned-ignored "fixture-project"
external "external-project"
expose-sub api from a to descendants
```

The `a` description declares `owned-ignored "fixtures/sample"` and
`expose-src api from "api.ts" to parent`. Other modules expose nothing unless a
case says otherwise. Every other description in `app` is unmarked. The ignored
projects have their own valid descriptions, with marked roots, configurations
and source that would be invalid if interpreted as the enclosing project's
source. They are data in the enclosing evaluation. Normal compiler
configuration excludes both declared trees and all module scratch directories;
warning cases deliberately include them.

`scripts/check.ts` imports `a/src/api.js`; `b/src/consumer.ts` imports the same
export. These are the only inter-module edges: `a -> app` and `a -> b` in the
reverse-dependency graph. An isolated grandchild or sibling has no dependency
merely because of its directory position.

## Ownership and affected expectations

The table uses short labels; their exact module IDs are `app`, `app/a`,
`app/a/grand`, `app/a-extra` and `app/b`. Results are byte-ordered. For an
`a` seed, changedModules is `[app/a]`, affectedModules is `[app, app/b]`,
and testModules is `[app, app/a, app/b]`. The all-modules answer is
`[app, app/a, app/a-extra, app/a/grand, app/b]`. Arrays here denote literal
module IDs, not paths or ancestry-based selection.

| Path seed | Owner / analysis | Expected changed / test modules with complete coverage |
| --- | --- | --- |
| `notes/design.md`, new `notes/new.md`, deleted `notes/old.md` | app, inert | app / app |
| `scripts/check.ts` | app, auxiliary ordinary | app / app |
| `subs/a/scripts/report.ts` | a, auxiliary ordinary | a / a, app, b |
| `subs/a/fixtures/sample/src/world.ts` | a, owned-ignored | a / a, app, b |
| `subs/a/src/tmp/new.ts` | a, scratch | a / a, app, b |
| `subs/a/src/tests/tmp/real.test.ts` | a, analyzed testing | a / a, app, b |
| `subs/a/subs/grand/new.txt` | grand, inert | grand / grand |
| `external-project/file.ts`, existing or absent | no owner, excluded | none / none |
| `node_modules/sample/index.ts`, `dist/output.ts`, generated catalogs | no owner, reserved exclusion | none / none |
| `../outside.ts` | outside project, none basis | none / all modules, unowned-path widening |

Run queries for additions, deletions and both sides of a rename without creating
the named inert file; answers depend on current declarations, not existence.
Add/remove a child declaration to test changed containment at a new revision.
Partial coverage uses the existing conservative widening policy independently
of ownership; its evidence cannot be hidden by an excluded seed.

## Import and exclusion mutations

1. Relative value, type-only, re-export, namespace, lazy and symbol-free imports
   from analyzed source into either declared tree each fail with the boundary
   diagnostic. A TypeScript alias and a workspace link are negative controls.
2. A real package import through `node_modules/sample`, including its installed
   symlink to the ignored sample, is external. A bare alias to that same physical
   target remains a boundary violation. Unresolved imports are coverage limits.
3. An auxiliary file may import same-owner ordinary internals; it needs exposure
   for a foreign original and cannot import testing-classified source. Naming it
   `report.test.ts` does not change that rule.
4. Forward an auxiliary export through `src/forward.ts` and try to expose it;
   linking rejects the original. Exposing an ordinary source export is the
   positive control. A directly supplied forged model exposure is also rejected.
5. Ignore-tree contents can contain malformed descriptions and test-shaped
   files: no enclosing inventory, compiler application set, watch registration,
   view symbol/test listing or source check includes them. Select an ignored
   project's own root separately and it receives ordinary project evaluation.
6. Modify only inert, ignored or scratch contents: analysis input identities and
   facts do not change. Remove an owned-ignored directory, change its declaration
   or introduce a child boundary: acquisition/invalidation reacts to that boundary
   evidence. Excluded bytes never become freshness inputs.

## Root selection

Selection follows the [root marker](contracts.md#root-marker), independently of
declarations:

| Working directory or `--root` | Expected selection |
| --- | --- |
| `subs/a/subs/grand/` or `scripts/` | `app`, found; unmarked descriptions do not stop the climb |
| inside `subs/a/fixtures/sample/` | `sample`, found; its marked root lies beneath `app`'s `subs/` |
| inside `fixture-project/` | `fixture-project`, found |
| a directory with no marked description at or above it | `root-not-found`, exit 2, naming the working directory |
| `--root subs/a` (unmarked) | `unmarked-root-description`, invalid, exit 1, saying to add the marker |
| `--root .` | `app`, given |

Mutations: removing `app`'s marker makes a found selection from `app`'s own
directory `root-not-found` and an explicit one invalid; marking `subs/b` makes
`app`'s acquisition report `undeclared-project-boundary` at that marker, while
a selection from inside `subs/b` selects `b` as its own root.

## Qualification variations

Add invalid path/symlink/overlap declarations, compiler-selection contradictions,
repository ignore settings and absent Git. Use an extended sibling name and a
selected grandchild to support the later audit runner probe, but Phase 1 does not
implement or certify Vitest narrowing. Scale copies hold 10,000 inert files and
5,000 excluded files to verify bounded captured inputs and no excluded watcher
registrations. Capacity limits follow the [budget policy](budgets.md#policy); they
return explicit incomplete/unavailable outcomes, never a partial pass.
