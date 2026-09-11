# Reference harness

This independent Node tool inventories reference expectations, owns isolated
mutation projects and requires assertions from the real checker. The runtime
registers all 308 reviewed Plan 1 instances, including the toolkit self-check,
independent negative and relocated package. Registration does not claim execution. A passed
iteration gate does not claim plan completion or pass a whole reference family.

Run these commands from the toolkit root after `npm run build`:

- `npm run check:reference` invokes the compiled CLI against the unchanged
  example. The two configuration-file warnings remain visible. Append
  `-- --format json` for its structured analysis report.
- `npm run reference:verify -- --plan 1 --iteration 14` executes and requires
  all 305 instances in iterations 3–14, including every prerequisite and syntax
  variant. Every required instance must execute assertions and pass.
- `npm run check:self` invokes the compiled CLI against the toolkit, including
  every owned source/test file and its ESM process probe.
- `npm run reference:verify -- --plan 1` requires all 308 instances, including
  fresh dependency installation, build, toolkit tests and an installed executable
  in a relocated copy. Every missing or failed required result fails the gate.
- `npm run reference:report` runs the source matrix and the example's actual
  type-check, Vitest, Vite build and Cucumber tiers. Each tier executes once in
  its own unchanged copy. The violation total and source coverage come from
  the compiled CLI baseline, and the report retains each family's larger scope.
  This command now fails if any required matrix instance is missing or fails.
  Batch measurement budgets remain separate acceptance evidence.
- `npm run reference:report -- --dry-run` inventories without running providers,
  regression tiers or a checker. It reports violations as **not measured**.
- `npm run reference:cases` runs independent inventory, gate, mutation and
  invocation tests. It exercises bounded real prerequisite runs and deliberate
  full/intermediate gate sabotage; it does not duplicate the full matrix inside
  Vitest test timeouts. `npx tsx scripts/reference-harness/validate.ts` checks only
  reviewed membership, pointers and prerequisite integrity.

Verification and report commands automatically save unique portable JSON files
under `.reference-work/reports/`. Verification `--format json` emits the same
artifact to stdout; human output prints its path. Each artifact contains the
revision, dirty-source hash, compiled build hash, runtime/compiler versions,
command, timings, requested capabilities, independent instance expectations,
executed assertions, observed diagnostics/coverage and retained pending work.
Machine and scratch locations are replaced with scope labels; no environment
variables or dependency inventories are recorded. Source or build changes
during a run prevent publication of coherent evidence. Reports over 32 MiB fail
explicitly instead of silently truncating. The files are ignored execution
artifacts, not workflow control-plane outputs.

`--preserve-on-failure` retains only failed mutation copies. Without it every
owned copy is removed, including on baseline or command failure. Invalid
verification arguments exit 2. Earlier `--iteration N` commands retain their
reviewed transitive prerequisite sets. The full gate's required membership
always comes from the reviewed plan, never available handlers.

## Activating an assigned instance

The [reviewed subcase list](../../docs/plans/done/iteration-1-project-verifier/subcases.md)
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
`examples/collection-review/.reference-work/run-*/<instance-directory>/project/`.
The directory spelling replaces the instance ID's colon with a hyphen so local
npm executable paths work under POSIX PATH semantics. Report IDs are unchanged.
The relocation handler explicitly chooses an OS temporary parent outside the
checkout and any enclosing repository; the same cleanup/preservation rules apply.
`context.request` explicitly selects that copied root with configuration
discovery and whole-project scope. The copier retains owned source and test
nesting, excludes dependencies and generated outputs, and leaves dependency
resolution to the example's own installed `node_modules` (linked into reference
copies when needed). Cleanup removes only
that invocation's directory, including after copying or setup fails. Concurrent
runs never share a mutation directory. Preservation retains only a failed run
and reports its location.

Each fixture recipe and its checked baseline stays with its assigned capability. Inventory commands and harness stubs do not
establish semantic outcomes. Actual model assertions are recorded individually
by `model-cases.ts`, `parser-cases.ts` and `project-cases.ts`; the required gate membership remains
in the reviewed plan.


Iteration 5 registers `acquire` and `metadata` using the public `readProject`
operation with the real injected description parser. Its 35 filesystem instances
materialize the reviewed F recipe in `fixtures/plan1/project.ts` or copy the
unchanged reference. Both reference scope variants also acquire the toolkit and
assert its eleven owners, including the two Plan 2 header-only owners. Syntax, source export resolution and permission checking
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

Iteration 13 registers 22 CLI and process instances. Real injected handlers and
the compiled executable consume the public session report. Independent mutations
exercise denied imports, invalid declarations, selected outside-source warnings,
stray descriptions and unavailable invocation/configuration. Help/version trace
loaded modules. Process probes record socket and process operations, captured
handle counts and child termination; only the reviewed finite compiler helpers
are permitted. Root-owned process tests additionally cover installed bin use,
SIGINT during acquisition/catalog work and broken stdout pipes.

After `npm run build`, `npm run reference:verify -- --plan 1 --iteration 13`
requires 290 instances, with prerequisite closure covering iterations 1–13.
The 18 later records remain unexecuted. `npx tsx scripts/validate-final-contracts.ts`
compares the nine Plan 1 declarations with their reviewed final selections, links
them against real exports and resolves every installed package entry. Plan 2
iteration 10 extends that separate final-declaration validator.


Iteration 15 registers the last three instances. Self-check compares the compiled
CLI and direct session over all eleven current owners and asserts that every owned source
file is fully catalogued. The independent negative imports the root's exposed
`BatchInvocation` type from the portable layout owner and requires the located
`required-importer-tag` denial for `dispatch`, with visibility established.

Relocation starts with no dependencies or output, installs the toolkit and
reference from their own lockfiles, builds from source, type-checks and runs the
relocated toolkit tests. It packs the package and installs the real archive into
a separate consumer without development dependencies. Every package entry must
resolve locally; installed clean, denied and restored CLI checks must preserve
their independent expectations. The full handler has no successful skip mode.
Its named smoke helpers can provide partial implementation feedback, but do not
register an instance pass without the required relocated regression.

See the [completion report](../../docs/plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
for actual executed evidence, and the [measurement recipes](../measurements/README.md)
for setup, combined process memory and repeated-session budgets. A source-matrix
pass alone does not establish those resource requirements or later services.

## Plan 2 resident verification

`plan2-instances.ts` transcribes all 176 reviewed leaves, including exact fixture
selections, evidence kinds, mutations and independent expectations. `plan.ts`
validates them against the Plan 2 inventory, the thirty main-plan matrix groups,
and all fourteen sequence indices, titles and prerequisite assignments. The
Plan 1 reader and its 308 records remain independent.

`npm run reference:verify -- --plan 2 --iteration 2` executes the four I2-28
harness controls. The full `--plan 2` gate requires all 176 and currently fails:
only `harness-gate` is available in `plan2-runtime.ts`. A Plan 1 capability never
activates its Plan 2 counterpart. Later providers add their capability and exact
handlers there; registration never establishes execution. `--iteration 5`
requires 64 instances from iterations 2–5; `--iteration 9` requires 134 from
2–9 (iteration 7 has owner tests only). All other records stay `not-executed`.

`npm run reference:cases` includes Plan 2 inventory, sabotage, command, generator
and prerequisite tests. `npx tsx scripts/reference-harness/validate.ts` validates
both inventories without running conformance assertions. The report command
lists Plan 2 capability availability without executing resident instances;
`reference:verify --plan 2` owns their execution and portable evidence files.

The eleven-owner skeleton requires the existing Plan 1 acquisition count and
self-check owner list to change in iteration 2. Their literal expectations now
include daemon and contexts; an owner with no source is accepted only when it is
one of these two owners and contains exactly its source/test `.gitkeep` files.
Once either gains source, the existing owned-test assertion applies. All 308
Plan 1 instance records, permission expectations and package entries remain
unchanged; the resident CLI and package-entry migration still belongs to later
iterations.

### Resident edit fixtures (iteration 6)

`fixtures/plan2/project.ts` prepares four F variants without changing the frozen
Plan 1 recipe: an unmarked `Type` import, an aliased default, a consumer using the
existing `@provider/*` mapping, and an unresolved `./later.js` import. The alias
baseline uses `export default value`, with consistent browser tags on both
exposures of that original; changing it to `export { value as default }` therefore
preserves identity. Replacing the recipe's separate `defaultValue` function would
test an original replacement instead.

`fixtures/plan2/reference.ts` supplies R copies and dependency preparation. The
shim variant copies Vite into the disposable fixture and links its other
dependencies. Edit only that copy's `node_modules/vite/client.d.ts`; the ordinary
R dependency symlink points at shared installed bytes and the shim mutation rejects
it. Removing the shim's default
export affects both CSS-module consumers while their resource targets remain the
same.

`resident-mutations.ts` defines the guarded W2 removal/restoration, K header and
invalid-description edits, C1/W1 vocabulary changes, README edit, F edits, shim
edit and helper move. `applyTextMutation(root, edit, true)` performs the exact
reverse for repair/recovery controls. Every text edit checks one anchor before
writing. The helper move checks both importer anchors and the absent destination
before changing files, then repairs relative imports at the new depth; its reverse
restores the initial bytes. `createLaterFile` checks its importer anchor and uses
exclusive creation. Returned paths describe fixture edits only: the acceptance
handlers must assert the real driver's `changed`, never supply these hints as
observed evidence.

`resident-fixtures.test.ts`, discovered by `npm run reference:cases`, checks the
fixture causes, exact restoration, drift rejection, dependency isolation and
selected batch effects. It registers no Plan 2 handler. At this checkpoint the
increment operations, context manager, shared service and `createQuickEnvironment`
are absent, so all twenty iteration-6 quick instances remain unexecuted. Complete
those providers before wiring these fixtures through the real direct channel.
Every sealed synchronized delivery must assert `verified: true`, ordering and
the expected reuse; the incomplete acquisition-failure delivery must instead
assert `verified: false`, as the reviewed contracts require. The driver failure
wrapper and all service assertions remain work for the resumed iteration.

The seven reference text-edit tests also call `resident-expectations.ts` to
assert their report effects: root's W2 denial; every core original's added `ui`
tag and the adapter's denied values; exact C1/W1 growth or shrinkage; located
foreign-original and missing-file errors without permissions; and changed README
metadata with preserved decisions. Restoration compares the entire batch report
after replacing only `runId`. Each edit assertion rejects the unchanged baseline
as a negative control. Future quick handlers can reuse these report assertions
with the harness's recorded `Assertions`, adding their resident-specific checks.
