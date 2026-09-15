# Ramify as a source of Bazel target definitions

**Date:** 2026-09-12; updated 2026-09-13. **Status:** Working hypothesis and feasibility analysis.
This follows the [prior-art comparison](incremental-testing-prior-art.md) and
[live-audit proposal](live-module-audits.md). It does not change Plans 5 or 7,
adopt Bazel, or establish measured Ramify-versus-Gazelle performance. A Sol subagent investigated
Gazelle implementations; the primary agent checked key sources, Bazel/rules_ts
behavior and Ramify's current model and planned retained contracts.

The subsequent [Cucumber profile spike review](cucumber-profile-spike-review.md)
adds measured profile execution and cross-worktree reuse. Its highly shared
router closure limits either selector, and its successful flat source groups
suggest a narrower Ramify integration through profile input manifests. The
tested Gazelle dependency graph was unusable; the earlier spike below remains
the evidence for the Vitest path.

## Assessment

The hypothesis is credible when stated as follows:

> For projects already using Ramify, derive and maintain Bazel targets from
> declared module ownership and retained source facts, with separately chosen
> compilation and test boundaries. Reuse those target identities in the Git
> audit history.

This could reduce duplicated configuration and keep architectural, build and
audit boundaries aligned. A substantial speed advantage over current Gazelle
is unproven. Module-sized compilation, configurable grouping and incremental
BUILD generation already exist. Ramify's strongest prospective contribution
is the shared source of ownership and dependency facts.

Three claims need separate evaluation:

| Claim | Present assessment |
| --- | --- |
| Less manual maintenance and drift | Plausible: reuse boundaries already declared for architecture instead of maintaining a second grouping policy. |
| Faster BUILD generation | Plausible for an already warm Ramify context, but must beat a cached, scoped Gazelle run. Cold compiler analysis can cost more than import parsing. |
| Faster builds and audits | Depends on the generated action/input graph, test costs and cache behavior. Faster generation or fewer visible BUILD declarations alone does not establish it. |

## What the cucumber-viz spike changes

The user supplied *Bazel and Aspect Gazelle for Affected Audit Tests*, dated
2026-09-12. The following observations come from that report; its raw logs and
cucumber-viz BUILD files were not independently inspected or rerun here.

The report records a 1.06–1.15 second warm Gazelle scan, a 5.96 second first
executable-surface generation, and a 3.01 second combined generation/test run
with one executed Vitest target and two cached targets. Two independent changes
took 3.64 seconds; the expensive affected target took 10.10 seconds. Detached
worktrees and a shared disk cache were part of the experiment. This is concrete
feasibility evidence for reusable execution across worktrees.

The runtime sample contains three targets. The wider scan covered 225 BUILD
files and generated/checked 156 test compilation projects, which do not execute
Vitest. It also reported 22 unresolved-import warning groups and a target cycle.
Cucumber execution was analyzed rather than demonstrated. Behavior-neutral
mutations establish invalidation behavior, not detection of newly introduced
test failures. These limits prevent extrapolating a whole-audit speedup.

The comparison with direct module selection is:

| Dimension | Spike's Gazelle/Bazel path | Ramify impact query with existing runners |
| --- | --- | --- |
| Decision mechanism | Request tests and execute those lacking applicable cached results. | Map changed modules to dependent modules, then to runnable tests. |
| Warm selection overhead | Roughly one second for the reported whole-surface generation, plus Bazel processing. | A ready Plan 5 context can answer from retained facts; integrated audit timing is unmeasured. |
| New worktrees | Shared cache and lockfile-driven npm materialization address repeated execution/provisioning. | Each worktree needs correct source facts; Plan 7 adds neither dependency provisioning nor persistent test-result reuse. |
| Cycles | The target graph must be made acyclic. | Reverse traversal terminates on cycles; no new compilation DAG is needed when existing runners remain. |
| Selection precision | Determined by each test action's complete inputs; broad target/runfiles groups can over-invalidate. | Plan 7 selects at module granularity, deliberately including type and test dependencies; all mapped tests in an affected module may run. |
| Integration tests | Needs Cucumber execution targets and complete runtime data. | Needs module-to-profile/shard mapping and explicit shared/runtime inputs. |
| Adoption | Build definitions, toolchains, runner generation and sandbox compatibility. | Conforming Ramify ownership/source layout, retained analysis and runner mapping; this is not necessarily cheaper for a project without Ramify modules. |
| Git investigation | Execution/cache evidence must still be attached to original source and merge history. | The same evidence requirement remains; the current-only impact query does not provide an audit ledger. |

The spike weakens the argument for replacing Gazelle primarily to save scan
time: around one second is the measured stage being targeted, and a Ramify
replacement has its own cost. The much larger potential savings come from
avoiding irrelevant expensive tests. Its 3.01-second path cannot be compared
with Plan 7's isolated millisecond graph probe, which excludes synchronization,
runner startup, provisioning and execution.

Ramify does have a useful alternative advantage: a test selector can consume
a cyclic module graph without turning every module into a compilation target.
This avoids the spike's build-partitioning problem when preserving the existing
npm/Vitest/Cucumber execution path. It does not cure runtime cycle defects, and
cycles may make the selected set large. Using Ramify to generate Bazel targets
still requires a valid DAG.

Compiler-derived facts could resolve some imports more accurately, but the 22
warning groups require case-by-case disposition. Missing dependencies, stale
paths, excluded projects and undeclared assets are not automatically solved by
changing the analyzer. Nor should cucumber-viz's current domain directories be
assumed to satisfy Ramify's required module layout and declarations.

Plan 7 also defers change-to-owner mapping, historical graphs and deleted-module
recovery. Safe audit selection needs a known applicable evidence baseline, new
or previously unverified tests, changed configuration/environment, and tasks
whose external state requires execution. An unchanged module is not enough
reason to skip a task. This extra work belongs to the audit layer whichever
executor is selected.

For cucumber-viz's immediate adoption, the spike supports continuing the bounded
Bazel shadow path. If Ramify adoption is independently desired, compare a direct
selector on the same runtime cohort before introducing a second authoritative
graph. Both paths need identical Cucumber coverage and deliberately failing
mutations, not just cache-hit comparisons after neutral edits. Include fresh
worktrees, cache misses/eviction, new tests, deletions and shared support changes.

A hybrid can use Ramify for ownership, target grouping and explanations, Bazel
for dependency materialization and reusable execution, and cucumber-viz for Git
publication and agent orchestration. Initially request all in-scope Bazel tests
and compare Ramify's candidates in shadow. Prefiltering solely by changed
modules could hide an uncached or newly required test that Bazel would otherwise
run. Reduce the requested target set only when the audit layer accounts for
every excluded obligation and its evidence applicability.

## Does whole-module testing trade speed for confidence?

The user's hypothesis identifies a real conservative-selection policy, but
granularity alone establishes neither a speed advantage nor a confidence
guarantee. Keep three choices separate: which tests are selected, how they are
grouped into executions, and when earlier results may be reused.

For code-change impact, within the same covered project and using the same
dependency facts and test inventory, aggregating file relationships into module
relationships yields a superset of the tests reached at file granularity.
Plan 7 deliberately makes that approximation: it runs impact through the whole
module even when different files account for its incoming and outgoing edges.
The audit adapter would then need to execute every required mapped test.

This broader set offers protection against some dependency-model omissions.
If a test in an already selected module uses changed code through an unrecorded
dynamic relationship, executing the whole module can reveal a failure that a
fine selector would skip. That is a practical argument for starting with module
selection while runtime dependency declarations are incomplete.

The protection is bounded. If an omitted relationship prevents the entire
consumer module from being selected, its tests still do not run. Missing global
configuration, external state, undeclared integration suites and stale ownership
are not cured by running all tests in the modules that were selected.

With complete input tracking, a valid earlier pass and deterministic controlled
execution, an unchanged test does not gain additional regression-detection
power simply by being run again. Bazel's test specification makes those input
and reproducibility assumptions explicit; it does not prove that every project
has satisfied them. A larger fresh run provides additional practical evidence
when those assumptions are uncertain, rather than an unconditional confidence
guarantee. [Test environment contract](https://bazel.build/reference/test-encyclopedia).

Fine executable targets also need narrow inputs to improve cache reuse. The
spike demonstrates reuse among three targets, not repository-wide per-file
precision. More tests usually add execution work under matched conditions, but
startup, parallelism and selection overhead determine elapsed time. Research has
found coarser selection finishing faster despite executing more tests.
[Ekstazi study](https://users.ece.utexas.edu/~gligoric/papers/GligoricETAL15Ekstazi.pdf).

Selecting every file in a module also does not mean executing them together.
Suite setup, order and shared state are separate execution semantics; changing
them can change outcomes. [Dependent-test study](https://homes.cs.washington.edu/~mernst/pubs/dependent-tests-issta2020.pdf).

The resulting design choice is a policy that either backend can implement:
fine reuse for validated independent inputs, broader module invalidation where
dependency completeness is uncertain, and explicit integration/global checks.
Bazel can retain per-file targets while executing all targets selected for an
affected module; requesting those labels alone still permits cache reuse, so
fresh-execution policy or broader declared inputs must be explicit.
[Bazel test-cache controls](https://bazel.build/docs/user-manual).

To establish the tradeoff, compare actual selected sets and deliberately failing
changes, including dynamic relationships, shared fixtures and merge interactions.
Use matched test obligations and execution conditions. The neutral mutations in
the supplied spike cannot quantify a difference in missed-regression risk.

## The Gazelle baseline already covers much of the proposed mechanism

There is more than one TypeScript extension, with different defaults:

| Implementation inspected | Existing behavior | Consequence |
| --- | --- | --- |
| Aspect Gazelle JS `js-v1.2.0` | Default main/test source groups per Bazel package; named custom groups and per-group configuration. Imports are resolved into the group's dependencies. [Documentation](https://github.com/aspect-build/aspect-gazelle/blob/js-v1.2.0/language/js/README.md). | One compilation target per source file is not a necessary Gazelle baseline. A test source group is also distinct from an executable test target. |
| Aspect cache utilities | Persistent content-based caching, Watchman invalidation and a watch-protocol cache, separated by worktree root. [Documentation](https://github.com/aspect-build/aspect-gazelle/blob/js-v1.2.0/common/cache/README.md). | Retaining analysis and reacting to edits are established features. Compare against this warm path. |
| BenchSci `rules_nodejs_gazelle` `v0.9.0` | Defaults to individual-file targets; also supports grouping around barrel files or collecting a subtree, and per-file Jest targets. [Documentation](https://github.com/benchsci/rules_nodejs_gazelle/blob/v0.9.0/README.md). | Both fine test targets and coarser compilation groupings have precedents. |

Gazelle itself supports updating specified directories and lazy indexing.
Its default whole-repository indexing can remain expensive even when few BUILD
files are updated; bounded updates and suitable indexing are part of a fair
comparison. `generation_mode=update_only` prevents new BUILD creation; it does
not mean incremental changed-file analysis.
[Gazelle v0.50 reference](https://github.com/bazel-contrib/bazel-gazelle/blob/v0.50.0/gazelle-reference.md).

The useful distinction is deriving groups from Ramify's ownership declarations
and testing classification. Existing directory/glob/barrel mechanisms can often
express the same groups, but need configuration connecting them to that model.
A small integration might capture most of the value; replacing all of Gazelle
is not a prerequisite.

## Compilation, execution and cache granularity are different

The quoted compromise is a reasonable starting policy, not a universal optimum.
Bazel rules describe actions over input and output files. A visible target can
create several actions, and several consumers can use outputs from one action.
Target count, compiler process count and cache invalidation therefore differ.
[Bazel rules and actions](https://bazel.build/extending/rules).

`rules_ts` already separates JavaScript transpilation, declaration production
and type-checking, including an isolated type-check path where the project's
TypeScript options permit it. Custom transpilers can introduce finer actions
without requiring a separate full TypeScript project for every source file.
Type-checking must still be included as an audit obligation when a faster
runtime path bypasses it. [Transpiler design](https://github.com/aspect-build/rules_ts/blob/main/docs/transpiler.md),
[performance design](https://github.com/aspect-build/rules_ts/blob/main/docs/performance.md).
Bazel also supports persistent workers; target count must not be treated as a
count of fresh compiler startups. Compatibility with the selected rules and
compiler needs verification. [Worker model](https://bazel.build/remote/persistent).

A candidate mapping for a module with 25 implementation files and eight
independently runnable test files is:

| Ramify concept | Candidate Bazel representation |
| --- | --- |
| Owned production source | One `ts_project`, subject to compiler settings and dependency-cycle constraints. |
| Owned test source and helpers | A separate test-only compilation group where needed, sharing production outputs. |
| Eight independent test files | Eight executable test targets consuming already produced code. This does not require eight compilations of the production module. |
| Module audit | A mapping to its required executable tests, type checks and other checks; an optional suite label for convenient invocation. |
| Large or stateful integration suite | A separately configured execution group, associated with every module it verifies. |

This is a proposed mapping, not tested Starlark or a target-count prediction:
macros may expand into additional targets and actions. Tiny tests may share an
execution target to amortize startup. Splitting slow tests needs actual timing
and independence evidence; ownership alone does not choose the optimal size.

### The main trap: fine test labels with broad inputs

Suppose tests X and Y exercise independent files in the same module. If both
test targets receive all module outputs, a changed JavaScript output can alter
both tests' input identities even though only X exercises that code. The JS
launcher implementation includes source and transitive-source providers from
its data targets by default. [rules_js input collection](https://github.com/aspect-build/rules_js/blob/main/js/private/js_binary.bzl).

Fine test targets can still improve scheduling and reporting, but fine cache
reuse requires suitably narrow, complete runtime inputs. Narrowing those inputs
may be possible using emitted-file mappings and runtime dependency closures,
without duplicating the compilation action. It requires preserving fixtures,
setup, assets, package metadata, dynamic loading and other runtime inputs.
Unknown inputs cannot simply be omitted.

Conversely, a compilation action rerunning does not imply every downstream
test reruns: unchanged consumed outputs can retain their content identities.
Probe the actual actions and test input manifests, not just target dependencies.
[Bazel cache model](https://bazel.build/remote/caching).

## What Plan 5 supplies, and what still needs to be added

[Plan 5's contracts](../plans/iteration-5-fast-incremental-checks/contracts.md)
provide retained file descriptions, interpreted accesses, ownership, resolution
observations and revision coordination. The current
[source vocabulary](../../subs/analysis/subs/typescript/src/interfaces/source.ts)
distinguishes targets, originals, forwarding, runtime loads and coverage limits.
These are useful inputs to a build adapter; the reviewed current checkout does
not establish the planned retained implementation as completed.

A synchronized warm export could reuse those facts without a second compiler
analysis. Cold starts and changes requiring source analysis still pay Plan 5's
cost. Bazel's compiler/transpiler actions remain separate: Plan 5's compiler
session is neither emitted build output nor a drop-in Bazel worker.

The adapter additionally needs:

- Deterministic module-to-label and source-to-output mappings, including moves,
  deletions, generated source and manually defined targets.
- Compiler scopes, output paths, package resolution, external dependency labels,
  resources and runner/toolchain configuration. The current toolkit uses NodeNext
  and TypeScript 7.0.2; splitting its existing compilation is a compatibility
  exercise, not merely writing BUILD files.
- Runnable test discovery, setup and execution grouping. Testing classification
  includes helpers and does not itself identify runnable tests.
- A supported export contract and tracking for build-specific inputs beyond
  Plan 5's architectural inputs. Compiler-resolution observations do not
  establish a complete runtime input inventory.

[Plan 7](../plans/iteration-7-affected-modules/main-plan.md) intentionally unions
production, test, type, runtime, forwarding and shim relationships for impact.
It does not export a Bazel build graph or a per-test runtime closure. Build
generation should project underlying facts for its own purpose, preserving
actual imported resources and forwarding paths. Exposed symbols alone omit
private implementation required to compile and run the module.

Incomplete coverage must block a narrow build projection or use an explicitly
complete, compatible input group. Plan 7's fallback of selecting every module
for testing cannot be translated into adding every module to every `deps` list;
that can create cycles and still omit undeclared runtime resources.

## Boundary mismatches must be explicit

**The module tree is not proof of an acyclic build graph.** Bazel requires a
target DAG. Collapsing a source graph into module targets can introduce cycles
even when individual files have no circular dependency. Keeping production and
tests separate avoids some artificial cycles, but real grouping cycles require
refactoring, a compatible combined compilation group, or a clear unsupported
result. Combining groups may require explicit cross-package source labels and
output ownership; it is not a trivial fallback.
[Bazel dependency model](https://bazel.build/concepts/dependencies).

**Architectural visibility is richer than target visibility.** Bazel can enforce
allowed target dependencies, while Ramify checks original symbols, tags and
exposure channels. Generating coarse visibility may be useful, but the adapter
must retain Ramify checking instead of claiming exact equivalence. Forbidden
imports should be reported, not silently dropped to create an incomplete build.
[Bazel visibility](https://bazel.build/concepts/visibility),
[Ramify importability](../model/cross-module-importability.principles.md).

**Bazel packages are additional boundaries.** Adding BUILD files changes package
membership and recursive globs. A per-module package layout can align with
Ramify's separate `src/` and `subs/` ownership, but existing packages, grouped
compilation and generated files require explicit treatment.
[Bazel glob behavior](https://bazel.build/reference/be/functions#glob),
[Ramify layout](../model/module-description.principles.md).

## A practical integration shape

Start by comparing two adapters: one emits module grouping configuration for
Aspect Gazelle; another consumes a versioned Ramify fact export through a
custom generator or Gazelle extension. The first can retain more existing
dependency resolution and BUILD maintenance. The second can avoid duplicate
source analysis, but needs a larger integration contract. Gazelle's extension,
merge and manual-preservation mechanisms are useful infrastructure; the built-in
JS extension has not been shown to accept an external fact graph directly.
[Gazelle extension model](https://github.com/bazel-contrib/bazel-gazelle/blob/v0.50.0/extend.md).

Use a generation boundary before Bazel loads the build graph:

1. Synchronize the requested worktree's source and build configuration.
2. Produce deterministic target definitions for that captured input view.
3. Publish only changed definitions; a body edit normally changes no BUILD file.
4. Execute Bazel against the matching input view and record its test results.

Generation should also work from a cold checkout without a resident daemon.
Ordinary actions cannot generate new BUILD definitions for the same invocation's
already analyzed graph. Avoid unsynchronized live rewrites while Bazel is
loading or executing. Commit generated definitions or regenerate them in a
captured audit checkout under an explicit policy; record the consumed definition
digest and generator configuration alongside audit inputs. Do not put volatile
revision IDs or timestamps into BUILD files and invalidate them on every edit.

After merging agent worktrees, regenerate or validate against the merged source
and reconcile audit evidence. Combining parents' generated dependency lists or
green statuses is insufficient. Keep original run identity when Bazel reuses
results. This preserves the [Git audit requirement](live-module-audits.md#git-history-and-regression-attribution)
while allowing Bazel to own execution and caching.

## How to test the hypothesis

First compare target definitions and required manual configuration, using a
well-configured Aspect Gazelle setup with equivalent compilation/test groups.
Then compare scoped cached Gazelle with the Ramify-backed path on identical
edits. Finally vary target/input granularity separately. This distinguishes a
better generator from a better target layout or runner configuration.

Measure cold setup, warm generation, changed BUILD count, configured targets,
actions, Bazel analysis, compilation, test execution/reuse and total feedback
time. Include memory across concurrent worktrees: retaining both Ramify and
Bazel state has a cost. Use body edits, import additions/removals, new tests,
resource changes, shared dependencies, grouping cycles and branch merges.

Correctness cases must include stale BUILD detection, complete test discovery,
isolated runner behavior, output-path equivalence and a merged failure after
both parents passed. If tests have broad runfiles, report that limitation rather
than attributing theoretical per-file reuse to the generated labels.

The decision is whether Ramify's shared model removes enough configuration,
drift or repeated analysis to justify the adapter. The performance claim should
follow that evidence. No benchmark, Bazel installation or build migration was
performed for this analysis.
