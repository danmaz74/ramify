# Reference harness

This independent Node tool scope inventories reference expectations, owns
temporary mutation projects and requires evidence from registered capabilities.
The current runtime registers the model's `registry` capability and 14 I1-14
instances, plus the descriptions owner's `parse` capability and 53 I1-04 syntax
variants through their public APIs. Model assertions use constructed trees;
parser assertions use the reviewed description texts and independent decoded
statements, reason codes and original locations. Neither establishes filesystem
or source coverage; the other 241 reviewed instances remain unexecuted.

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
resolution to the example's own ancestor `node_modules`. Cleanup removes only
that invocation's directory, including after copying or setup fails. Concurrent
runs never share a mutation directory. Preservation retains only a failed run
and reports its location.

The remaining fixture recipes, checked baselines and real assertions arrive
with their assigned capabilities. Inventory commands and harness stubs do not
establish semantic outcomes. Actual model assertions are recorded individually
by `model-cases.ts` and `parser-cases.ts`; the required gate membership remains
in the reviewed plan.
