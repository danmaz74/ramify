# Plan 2B: Generated project views

**Date:** 2026-09-15. **Status:** draft implementation plan for review. Plan 2B
is a successor to [Plan 2A](../iteration-2a-materialized-api-view/main-plan.md).
It starts only after Plan 2A's completion gate has been recorded. It changes no
Plan 2A document, and it keeps Plan 2A's generated API view byte-identical.

Plan 2B turns Plan 2A's single materialized API view into a small set of
generated views that share one revision-bound query and one transactional
publisher. It then adds two views:

- `.exported_symbols/`, a project-root catalog of each module's exposed
  symbols, latent internal exports and test inventory; and
- `docs/modules/`, a project-root tree of symbolic links to each module's
  `src/docs/` directory.

The [contracts](contracts.md), [scope](scope.md), [owners](owners.md) and
[executable instance inventory](subcases.md) beside this file form the review
package, with 73 executable instances. Nine implementation iterations are
registered in [the manifest](iterations/manifest.json); the last iteration is the completion
gate.

## Runnable outcome

From anywhere in a project:

```sh
ramify materialize                          # every view; API view for the selected module
ramify materialize --view exported-symbols  # one project view
ramify materialize --view api --view module-docs --all --root /work/project
```

The command produces, from one valid revision:

```text
<root>/
├── .exported_symbols/
│   ├── _meta.json
│   ├── exposed-symbols.txt        # root module
│   ├── internal-exports.txt
│   ├── tests.txt
│   └── workspace/
│       ├── exposed-symbols.txt
│       ├── internal-exports.txt
│       ├── tests.txt
│       └── reviews/ ...
├── docs/modules/
│   ├── docs -> ../../src/docs      # only when the root module has src/docs
│   └── workspace/
│       └── reviews/
│           └── docs -> ../../../../subs/workspace/subs/reviews/src/docs
└── subs/**/src/.ramify/ ...        # Plan 2A API view, unchanged
```

Repeating an identical invocation writes nothing. A failed, cancelled or
resource-limited invocation preserves every previous complete view.

## Position in the roadmap

Plan 2B executes after Plan 2A and before Plan 3's successor review. Plan 2A
supplies availability enumeration, bounded symbol details, the API projection,
the transactional publisher, the `materialize` service operation and CLI
command. Plan 2B generalizes those parts and adds a test-hierarchy provider and
two project-scope views.

Plan 3's successor review may register further views through the same view
registry instead of adding another query, publisher or command.

## Starting point

Planning inspected the Plan 2A working tree on 2026-09-15, before Plan 2A's
completion gate. Iteration 1 re-inventories the source at Plan 2A's recorded
completion commit and replaces every stale path, name and count below.

- `materialize` carries one view. `RetainedSession.apiView`,
  `ContextManager.apiView`, the service `materialize` operation, its codec and
  the CLI each carry `ApiView*` types.
- The publisher replaces one whole `<area>/.ramify` directory per module source
  area, refuses every symlink inside a target and has no project-root target.
- `isRamifyGeneratedPath` reserves the `.ramify` segment and its `.tmp-*` and
  `.old-*` siblings anywhere in a project path. It knows no other output.
- Plan 2A shares a requirement helper between `explainImport` and
  `listAvailableOriginals` by refactoring `decisions.ts`. It serializes API
  queries as a second entry kind in the per-context check queue. Its warm
  session query can promote newly observed inputs.
- The inventory walks only module `src/` and `subs/`. The daemon watcher
  watches the whole root, skips `node_modules`, `.git`, `dist`,
  `.reference-work` and reserved names, and never descends into symlinked
  directories.
- The model records `Exposure { module, original, names, destinations,
  provider, effective }`; an owned exposure has `provider === null` and
  `module === original.owner`. The catalog records `FileExports` per file with
  `CatalogExport { name, original, namespace, forwarding }`.
- Module names match `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, so a module directory
  name never collides with `_meta.json` or a `.txt` file name.
- No toolkit module has `src/docs/` yet. The toolkit site sets `docs: false`
  and does not read `docs/`.
- The reference project's testing module owns
  `subs/integration-tests/src/features/collection-review.viz.feature`.

## Architecture slice

```text
ramify materialize [--view <id>]...
  -> resident client / daemon service (publication lock per root)
  -> contexts: unchanged synchronized check path, then one revision query
  -> retained analysis worker
       -> ViewFacts built from SessionFacts at that sequence (read only)
       -> view registry: api | exported-symbols | module-docs
            -> providers: availability, symbol details, test hierarchy
            -> pure projection and rendering to GeneratedTarget[]
  -> daemon generic output publisher
  -> <root>/.exported_symbols, <root>/docs/modules, <module>/src[/tests]/.ramify
```

## Resolved decisions

1. **Analysis invariance.** Views read one revision's facts and never change
   how the project is analyzed. Plan 2B restores `decisions.ts` to its
   pre-Plan-2A text, returns the contexts queue to check requests only, and
   removes input promotion from the session query. The only analysis-side
   effect of any view is the reserved-output table.
2. **One reserved-output table.** `analysis/project` owns a static table of
   reserved outputs. Inventory, compiler selection, capture, observation and
   watching consult it. Adding a view with a new location adds one table entry.
3. **One output tree and publisher.** A view returns `GeneratedTarget` values:
   a project-relative directory it owns completely and its file and symlink
   entries. The daemon publisher stages, compares, switches and rolls back every
   target of one invocation as one transaction.
4. **One view registry and query.** Each view is a pure definition in a new
   `analysis/views` owner. Session, contexts, service, codec and CLI carry view
   identifiers and compact summaries, never view-specific types.
5. **API view unchanged.** Its layout, bytes, metadata, agent instructions and
   Plan 2A evidence remain valid.
6. **Project views are whole-project.** `--from` and `--all` select modules for
   the API view only. A project view always regenerates its whole tree;
   byte comparison makes an unchanged repeat free.
7. **No ownership marker inside a view.** An existing project-view target is
   replaced only when it is absent or recognizably generated by that view
   (see [scope](scope.md#replacing-an-existing-target)).
8. **Views owner, pending review.** The proposal places views in a new
   `analysis/views` owner, the twelfth toolkit owner, and updates the owner
   count everywhere it is asserted. Iteration 1 confirms this or keeps views
   inside `analysis`.

The [review decisions](scope.md#review-decisions) list the proposed defaults
that iteration 1 must confirm before production work.

## Scope boundary

Included:

- the three analysis-invariance restorations with equivalence evidence;
- the reserved-output table and its application at every input boundary;
- the generic output tree, publisher and symlink entries;
- the `analysis/views` owner, registry and re-hosted API view;
- generic `materialize` with `--view` through session, contexts, service,
  codec, client and CLI;
- static test-hierarchy extraction for Vitest-style suites and Gherkin
  features;
- the exported-symbols and module-docs views;
- ignore rules, agent guidance, measurements, process and platform evidence.

Excluded:

- any change to Plan 2A documents or its API view output;
- views beyond the three named;
- evaluating tests, running test runners or reading coverage reports;
- ranking, recommending or proposing exposures from internal exports;
- automatic materialization during `check` or a post-write hook;
- MCP and explorer surfaces, persistent caches and Windows acceptance.

## Acceptance matrix

| Group | Capability | Iteration |
| --- | --- | ---: |
| I2B-01 | Contract review, probes and frozen bounds | 1 |
| I2B-02 | Analysis invariance | 2 |
| I2B-03 | Reserved-output table | 3 |
| I2B-04 | Generic output publisher | 3 |
| I2B-05 | Test-hierarchy provider | 4 |
| I2B-06 | View registry and re-hosted API view | 5 |
| I2B-07 | Generic materialize operation and CLI | 6 |
| I2B-08 | Exported-symbols view | 7 |
| I2B-09 | Module-docs view | 8 |
| I2B-10 | Process, scale and platform evidence | 9 |
| I2B-11 | Declarations, regressions and handoff | 9 |

## Iteration sequence

| Iteration | Title | Direct prerequisites | Parallel group |
| ---: | --- | --- | --- |
| 1 | Contract review and probes | Plan 2A completion record | — |
| 2 | Analysis invariance | 1 | foundations |
| 3 | Reserved outputs and generic publisher | 1 | foundations |
| 4 | Test-hierarchy provider | 1 | foundations |
| 5 | View registry and re-hosted API view | 2, 3 | — |
| 6 | Generic materialize operation and CLI | 5 | — |
| 7 | Exported-symbols view | 4, 6 | views |
| 8 | Module-docs view | 6 | views |
| 9 | Evidence, regressions and completion gate | 7, 8 | — |

Iterations in one parallel group have disjoint production owners, tests and
declaration edits. A coordinator applies shared relay edits after each group.

## Completion gate

Plan 2B is complete only when iteration 9 records all of the following on one
coherent build:

1. Every I2B instance is present and required, and each binding case passes.
   Approved performance waivers remain explicit.
2. The Plan 2A gate passes unchanged, and `ramify materialize --view api`
   reproduces Plan 2A's archived reference and toolkit trees byte for byte.
3. `npm run build`, `npm run type-check`, focused owner tests,
   `npm run reference:cases`, `npm run check:self` and
   `npm run check:reference` pass with all three views present. The full
   Vitest suite passes through the cucumber-viz audit.
4. The Plan 1 gate passes, and the Plan 2 and Plan 5 gates have no regression
   from their recorded baselines, with `I5-01` equivalence passing unmodified.
5. With and without interleaved materialization, identical inputs produce
   identical check reports, revision sequences and session counters.
6. Real compiled CLI and daemon runs produce independently expected
   `.exported_symbols` and `docs/modules` trees for the reference project and
   the toolkit, an unchanged repeat writes nothing, and the owned daemon is
   stopped in `finally`.
7. Linux and macOS produce byte-identical files and identical symlink targets
   for the shared fixture.
8. Twelve declarations and the existing eight package entries validate, and
   the lightweight `./cli` and `./client` import closures still exclude
   analysis, the worker and TypeScript.
9. Architecture, roadmap, CLI and testing guides and a completion report
   describe implemented behavior, limits and remaining gaps.

## Handoff

The completion report hands over the view registry contract, the reserved
output table, the generic publisher, the test-hierarchy provider and the two
new view formats, with measured limits and every waiver or unexecuted row.
