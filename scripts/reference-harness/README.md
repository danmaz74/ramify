# Reference harness

This independent Node tool scope inventories reference expectations, owns
temporary mutation projects and requires evidence from registered capabilities.
The current runtime registers `registry`, `parse`, `acquire`, `metadata`,
`catalog`, `link`, `static-access`, `tags-origin`, `namespace`, `lazy`,
`symbol-free`, `resources`, `coverage` and `session` through the real providers
and public analysis session. It executes 268 reviewed instances; 40 later
instances remain unexecuted. Model
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
query are now checked by iteration 11. Iteration 12 supplies the public analysis
session and report assembly used by its source and lifecycle handlers.

`npm run reference:verify -- --plan 1 --iteration 9` requires all 165 instances
in prerequisite closure `[1, 2, 3, 4, 5, 6, 7, 9]`. Iteration 8's migration is
independent and adds no matrix instances. The unfiltered plan gate still fails
for the instances assigned to later capabilities.

The no-project ancestry case necessarily uses an owned OS temporary directory:
a directory under the ramified harness checkout would discover that enclosing
project. It creates a described project below the unmarked working directory,
asserts that discovery never searches downwards, and deletes the temporary tree
in `finally`. All other mutations use the ordinary isolated harness copy.

Iteration 10 registers all 36 tag/origin instances and syntax/owner variants.
The shared source driver calls the analysis-owned `evaluateAccesses` stage,
retaining its diagnostics alongside model evidence. Its tests cover exact
importer profiles, required importer tags after visibility, browser value/type
requests, private test access, testing support declared in ordinary source,
and isolation through accessed sources, resources and forwarding paths. The
stylesheet instance checks both a default binding and a symbol-free load. Each
negative starts from a clean captured baseline; both baseline and mutation must
compile independently. No fixture changes the running application.

`npm run reference:verify -- --plan 1 --iteration 10` requires 201 instances in
prerequisite closure `[1, 2, 3, 4, 5, 6, 7, 9, 10]`. The 107 later instances stay
unexecuted in that iteration-specific run. Iteration 12 registers the public
session and resource-access capability.


Iteration 11 registers all 44 namespace, forwarding, lazy, import-type and
symbol-free instances, including each quote, destructuring, type syntax and
same/foreign-owner variant. The TypeScript and JSDoc import-type records use
separate fixtures; only the JavaScript fixture enables `allowJs` and `checkJs`.
Unknown keys, escaped namespaces and nonliteral targets retain located coverage;
known selections and denials remain independently asserted. Whole source exports
check their complete membership, with `default` excluded only by star exports.

`npm run reference:verify -- --plan 1 --iteration 11` requires 209 instances in
prerequisite closure `[1, 2, 3, 4, 5, 6, 7, 9, 11]`. Iteration 10 is independently
available but outside that closure. Every baseline and changed fixture runs the
real compiler and captured acquisition/catalog/linker/evaluation path. The
unchanged reference has 294 occurrences: 166 allowed application decisions and
128 proven external selections, with no source coverage notes. The authored
lazy ReviewPanel callback, import-type query and Cucumber hook are included.
These are source-stage assertions; runtime regression and Plan 1 completion
remain separate evidence.


Iteration 12 registers all 23 resource, coverage, session-lifecycle and input
coherence instances through `analyzeProject` or `createAnalysisSession`. The
reference resource variants distinguish missing targets from definite missing
export names and invalid declarations. Coverage fixtures retain compiler
problems, unsupported macros/CommonJS and outside-module targets without
turning them into permission decisions. The partial clean/denied controls assert
independent execution, check and coverage dimensions from the same public report.

Lifecycle handlers run isolated workers that instrument Node filesystem and
compiler-process boundaries. They hold actual captured reads or catalog work,
abort/dispose the public session, inject read failures and change bytes during
capture validation. No testing hook extends the production API. Each worker
accounts open/closed input handles and helper processes. Retention evidence
traverses all property descriptors and prototypes, retains 25 reports after five
warmup cycles, checks weak references to disposed sessions, and applies the
reviewed settled heap/RSS bounds. Those fixture measurements do not replace
iteration 15's reference and 100-owner workloads or compiled-entry measurements.

`npm run reference:verify -- --plan 1 --iteration 12` requires 268 instances in
prerequisite closure `[1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12]`. The remaining 40
records stay unexecuted; this iteration does not establish Plan 1 completion.
