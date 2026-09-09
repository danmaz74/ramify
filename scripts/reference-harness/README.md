# Reference harness

This independent Node tool scope inventories reference expectations, owns
temporary mutation projects and requires evidence from registered capabilities.
The current runtime registers `registry`, `parse`, `acquire`, `metadata`,
`catalog`, `link` and `static-access` through their public provider APIs. It
executes 165 reviewed instances; 143 later instances remain unexecuted. Model
assertions use constructed trees; source assertions use captured projects and
the real compiler, linker and model. No stage result claims plan completion.

`npm run reference:cases` runs the family, instance, gate, mutation and invocation
tests under this directory's Vitest configuration. The deterministic gate stubs
in those tests verify harness behavior only; they never enter `runtime.ts`.
`npx tsx scripts/reference-harness/validate.ts` validates the reviewed inventory
and pointers without invoking Vitest or a checker.

`npm run reference:report -- --dry-run` prints every family and instance without
executing application tiers or reference assertions. The ordinary report still
runs the example's existing tiers. Its old hand-reviewed violation count remains
explicitly separate from checker evidence until iteration 14 replaces it.

`npm run reference:verify -- --plan 1` requires every reviewed leaf and currently
exits 1 for absent capabilities. Add `--iteration 3` to execute and require
the 14 implemented model instances and their prerequisites, or `--iteration 4`
for all 53 parser variants and prerequisite closure `[1, 2, 4]`. Parser execution
is independent of the model. Every other instance remains not executed in
that intermediate gate. Iteration verification never claims plan completion, even for
iteration 15. `--format json` emits the same result as one JSON document;
`--preserve-on-failure` keeps failed project copies for inspection. Invalid
arguments exit 2.

## Activating an assigned instance

The [reviewed subcase list](../../docs/plans/iteration-1-project-verifier/subcases.md)
defines membership independently of executable records. `plan.ts` checks that
list and its prerequisites against the main plan; `cases.ts` exports the
transcribed 308 records. Removing a record, changing its independent expectation
or disabling a handler cannot remove an obligation from the gate.

Later iterations register actual capabilities and exact instance handlers in
`runtime.ts`. They consume the supported owner API available at their stage.
Capability prerequisites are checked before a handler is invoked. Resource
identity cases require catalog support at iteration 6; resource-access support
is a later requirement. No implementation status is stored in an instance.

Project handlers supply a copy source or materialization recipe. Their optional
`prepare` establishes the documented positive baseline; `baseline` asserts it
through `context.assertions.equal` or `ok`. Only a successful, nonempty baseline
permits `mutate`, followed by `run` with the independent result assertions.
`replaceExactlyOnce` rejects a missing or repeated source anchor before writing.
Pure model and text-only parser handlers can run in memory with the same
assertion recorder. Each invalid parser variant first asserts the unchanged D
description as its positive baseline; no filesystem fixture or compiler is used.
Handlers must await all their work. A return value, an empty handler, or a caught
assertion failure cannot manufacture a pass; assertion recording closes at
completion.

Each project invocation gets its own
`examples/collection-review/.reference-work/run-*/<instance-id>/project/`.
`context.request` explicitly selects that copied root with configuration
discovery and whole-project scope. The copier retains owned source and test
nesting, excludes dependencies and generated outputs, and leaves dependency
resolution to the example's own installed `node_modules` (linked into reference
copies when needed). Cleanup removes only
that invocation's directory, including after copying or setup fails. Concurrent
runs never share a mutation directory. Preservation retains only a failed run
and reports its location.

The remaining fixture recipes, checked baselines and real assertions arrive
with their assigned capabilities. Inventory commands and harness stubs do not
establish semantic outcomes. Actual model assertions are recorded individually
by `model-cases.ts`, `parser-cases.ts` and `project-cases.ts`; the required gate membership remains
in the reviewed plan.


Iteration 5 registers `acquire` and `metadata` using the public `readProject`
operation with the real injected description parser. Its 35 filesystem instances
materialize the reviewed F recipe in `fixtures/plan1/project.ts` or copy the
unchanged reference. Both reference scope variants also acquire the toolkit and
assert its nine owners. Syntax, source export resolution and permission checking
remain distinct capabilities.

Iteration 9 registers 26 static-access instances across I1-06, I1-07, I1-08 and
I1-18, retaining each syntax variant. Its stage driver uses one captured input
view for the public parser, acquisition, catalog, linker and model operations.
It checks both baseline and changed fixtures with TypeScript, then asserts
independent permissions, originals, forwarding origins and exposure locations.
The unchanged reference has 292 static occurrences: 164 application decisions
and 128 compiler-proven external selections. Its lazy import and import-type
query remain recorded for iteration 11. The public analysis session and report
assembly arrive in iteration 12.

`npm run reference:verify -- --plan 1 --iteration 9` requires all 165 instances
in prerequisite closure `[1, 2, 3, 4, 5, 6, 7, 9]`. Iteration 8's migration is
independent and adds no matrix instances. The unfiltered plan gate still fails
for the 143 instances assigned to later capabilities.

The no-project ancestry case necessarily uses an owned OS temporary directory:
a directory under the ramified harness checkout would discover that enclosing
project. It creates a described project below the unmarked working directory,
asserts that discovery never searches downwards, and deletes the temporary tree
in `finally`. All other mutations use the ordinary isolated harness copy.
