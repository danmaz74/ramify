# Incremental testing: prior art and implications for Ramify

**Date:** 2026-09-12. **Status:** Research and design assessment, not an
implementation commitment. This compares
[Plan 7](../plans/iteration-7-affected-modules/main-plan.md) and the
[live-audit proposal](live-module-audits.md) with existing tools and research.

Two Sol subagents researched JS/TS systems and regression-test-selection
literature. The primary agent reviewed build-system and industrial experience,
cross-checked key sources, and synthesized the recommendations. Sources are
official documentation, implementation repositories, author papers and
first-party experience reports. No product benchmark or audit was run.
Published measurements describe their study populations, not predicted Ramify
results. Tool documentation was checked on the date above; version-dependent
behavior must be pinned and probed before integration.

The follow-up [Bazel target-generation analysis](ramify-bazel-target-generation.md)
examines using Ramify's module ownership and retained facts to maintain build
definitions, including the overlap with Gazelle's grouped targets and caches.

## Assessment

Incremental test selection, persistent test-result reuse and continuously
updated test feedback are established capabilities. Ramify does not need a
new theory of incremental testing. The strongest justification is an audit
service expressed in Ramify's module model, using its retained analysis and
existing runners, with explicit evidence applicability and coverage.

The required workflow includes agents making independent changes in parallel
worktrees, merging their work, and reconstructing the origin of an unexpected
regression. None of the reviewed products has been established as a complete
replacement for that cucumber-viz workflow. Execution/cache overlap alone cannot
justify dropping its Git audit history or reducing that history to a cache key.

Keep the module-impact provider and a deliberate audit-evidence/Git-history
design; prefer adapters for existing task engines and caches where they are
already installed. A standalone executor may still serve projects without such
infrastructure, but a new distributed build/cache system is not justified by
this use case. The ownership recommendation concerns those underlying layers;
the cross-worktree audit and reconstruction requirement remains central.

Three precedents make the overlap concrete. Bazel can reuse test results and
check whether they are current without executing tests. Wallaby provides live
affected-test feedback, including unsaved edits. Nx supplies affected selection,
content-based task caching and an agent-facing MCP interface. Live feedback,
hashing, Git selection and MCP access are therefore not individually novel.
[Bazel test options](https://bazel.build/docs/user-manual),
[Wallaby VS Code integration](https://wallabyjs.com/docs/intro/get-started-vscode.html),
[Nx caching](https://nx.dev/docs/concepts/how-caching-works),
[Nx MCP](https://nx.dev/docs/reference/nx-mcp).

## Separate the problems before comparing implementations

| Problem | Question | Ramify's proposed role |
| --- | --- | --- |
| Dependency impact | Which owners or test targets could be affected? | Plan 7's module closure, with explicit source scope and limits. |
| Test selection | Which runnable tests/tasks cover the required checks? | Map module obligations to actual runner targets; preserve integration suites and prerequisites. |
| Result reuse | Does an earlier execution apply to these exact inputs? | Validate task/input identities or accept a supported backend's evidence contract. |
| Live status | What is current, invalidated, failed, running or uncovered? | Present revisioned module/task state across the chosen runners. |
| Prioritization | Which required checks should run first? | Optional scheduling policy; it need not change which evidence is required. |
| Integration history and regression attribution | What was verified in each worktree, what was merged, and where did a failure first appear? | Preserve exact input identities, branch/merge ancestry and original audit records. Support reconstruction across branches; automated historical search can be staged separately. |

A source transform cache does not establish reusable passing-test evidence.
Likewise, a Git affected list chooses work but does not prove that a cached
result still applies to the current environment. A task may be in the affected
set relative to a branch baseline yet already have a reusable result from an
earlier local execution.

## Existing JS/TS approaches

| System | What is already implemented | Implication for Ramify |
| --- | --- | --- |
| Jest | Changed/related-test selection over inverse dependencies. Its CLI documents the static-graph restriction; transformation caching and prior-result sequencing are separate mechanisms. [CLI](https://jestjs.io/docs/30.0/cli), [transforms](https://jestjs.io/docs/code-transformation), [sequencer](https://github.com/jestjs/jest/blob/v30.5.1/packages/jest-test-sequencer/src/index.ts). | Reuse its execution/reporting capabilities. Selected tests still run; Ramify would supply module obligations and applicability evidence. Computed loading and non-imported fixtures need additional handling. |
| Vitest | Related/changed selection, watch-mode module dependencies, mappings for non-imported input changes, and full-suite triggers for configuration changes. Its result cache supports sequencing. [CLI](https://vitest.dev/guide/cli), [watch triggers](https://vitest.dev/config/watchtriggerpatterns), [full triggers](https://vitest.dev/config/forcereruntriggers), [cache](https://vitest.dev/config/cache). | A practical first runner for Ramify's current toolkit. Borrow explicit fixture/configuration triggers and require actual selected/completed-test reporting. Do not equate transform or sequencing caches with reusable audit passes. |
| Wallaby.js | Continuous affected-test execution and live failure/coverage feedback, including uncommitted and unsaved source. [Editor behavior](https://wallabyjs.com/docs/intro/get-started-vscode.html), [coverage](https://wallabyjs.com/docs/intro/coverage.html). | The closest user-experience precedent. Use it as a comparison baseline. This review did not establish a supported external evidence API or an immutable, persistent audit-input contract; an adapter would need separate feasibility work. |
| Nx | Git/project-graph affected selection, task hashes, local/remote result reuse, a watched project-graph daemon, and Cloud run/flake history. [Affected](https://nx.dev/docs/features/ci-features/affected), [caching](https://nx.dev/docs/concepts/how-caching-works), [daemon](https://nx.dev/docs/reference/nx-daemon), [flakes](https://nx.dev/docs/features/ci-features/flaky-tasks). | The strongest JS/TS integration candidate to investigate. Map obligations to targets and reuse its execution/cache layer. Core and Cloud features differ; do not assume a local installation provides all historical services. |
| Turborepo | Task/global hashes and output reuse. The inspected 2.10.12 documentation also exposes task-level affected queries with structured reasons and input matching. [Cache documentation](https://github.com/vercel/turborepo/blob/v2.10.12/apps/docs/content/docs/crafting-your-repository/caching.mdx), [affected query](https://github.com/vercel/turborepo/blob/v2.10.12/apps/docs/content/docs/reference/query.mdx). | Existing task identities and summaries can support an adapter. Avoid comparisons assuming it only understands whole-package changes. Query behavior and run/watch future flags must be distinguished and version-tested. |
| moon | Affected tasks, content-based task hashes, persisted run state/manifests and local/remote caching. [Affected model](https://moonrepo.dev/docs/concepts/affected), [cache model](https://moonrepo.dev/docs/concepts/cache). | Another precedent for the proposed evidence store. It reinforces the need to distinguish domain-specific audit semantics from generic task execution and caching. |

These products already combine capabilities across CLI, resident, editor and
cloud surfaces. The absence of a command called "module audit" is not evidence
that the underlying mechanism is missing. Nx also supports its own project
boundaries and plugins; package size or a missing module name alone is not a
reason to build a competing engine. The candidate distinction is using the
same ownership and dependency semantics as Ramify's architectural checks.
[Nx plugins](https://nx.dev/docs/concepts/nx-plugins),
[Nx module boundaries](https://nx.dev/docs/features/enforce-module-boundaries).

## Broader build systems and industrial experience

**Bazel is a direct precedent for current test evidence.** Its default test
caching reruns changed tests/dependencies, external tests and failures, with
different behavior available through explicit flags. It also has a status-only
up-to-date check. This is close to the proposed "run what lacks valid evidence"
behavior, though Ramify wants to express the result as module obligations.
[Bazel test options](https://bazel.build/docs/user-manual).

**Correct reuse requires more than a source graph.** Bazel's test specification
requires declared sources, build products and controlled resources for
reproducible outcomes and useful culprit finding. Its cache documentation
explicitly discusses concurrent input modification and untracked host tools.
These are concrete failure modes for our snapshot/environment contract.
An isolated checkout with mutable shared dependencies is not a complete
solution. [Test environment](https://bazel.build/reference/test-encyclopedia),
[cache limitations](https://bazel.build/remote/caching#known-issues).

**Impact selection can still help even when caching exists.** Meta's Buck2
Change Detector explains that loading the entire action graph may cost too
much time or memory even if no actions need execution. It compares both base
and changed target graphs, then delegates execution to Buck2. Its documentation
also warns that limiting traversal depth trades away detection. This is a good
architectural precedent for Plan 7 as a separate impact provider and for retaining
old dependency information in the audit follow-up.
[Buck2 Change Detector](https://github.com/facebookincubator/buck2-change-detector).

**Deleted inputs are a demonstrated trap.** A Pants issue reported that deleting
an imported Python file caused dependent checks/tests to be omitted, because
dependency inference no longer resolved that import. The report concerns
2.31.0.dev3 and the issue is closed; it is historical failure evidence, not a
claim about the current release. Ramify's previous/current ownership or retained
execution manifests should remain a required part of audit invalidation.
[Pants issue #23240](https://github.com/pantsbuild/pants/issues/23240).

**Operational fallbacks are part of mature selection.** Azure Pipelines TIA
includes impacted, newly added and previously failing tests, widens to all tests
when it cannot classify changes, and supports periodic full execution. Its
documented support is restricted to particular managed-code/topology scenarios;
it is a useful policy precedent, not a universal TS runner recommendation.
[Microsoft TIA](https://learn.microsoft.com/en-us/azure/devops/pipelines/test/test-impact-analysis?view=azure-devops).

**Predictive selection makes a different promise.** Meta reported in 2018 that
its deployed model ran roughly one-third of transitively eligible tests while
detecting more than 99.9% of faulty changes before trunk integration. Its workflow
also used exhaustive testing before deployment and treated flakiness explicitly.
Those are deployment-specific observations, not a no-missed-regression guarantee.
Prediction can prioritize Ramify's queue; skipping required tests probabilistically
must not produce the same "current passing evidence" status.
[Meta's production account](https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/).

## Parallel worktrees, merges and regression reconstruction

This is the central purpose of cucumber-viz's Git integration, as clarified by
the user. Its audited source snapshots and separate report history are relevant
to that purpose even without an automatic bisect implementation. The existing
source inspection is recorded in the [live-audit analysis](live-module-audits.md#what-cucumber-viz-already-provides).

Consider two worktrees branching from O. A has passing audit evidence, B has
passing audit evidence, and their merged tree M fails. Both observations can
remain valid for A and B. They do not automatically establish a passing audit
for M. The failure may result from interactions between the changes or from
merge resolution. Historical comparison must identify the actual trees, test
definitions and environments involved before attributing the failure to a
particular change. A newly introduced test may not even exist on both parents.

The reviewed runners, selectors and caches can supply execution and reuse for
this investigation. Nx Cloud also supplies run history and CI observability;
its self-healing feature proposes and verifies fixes for failing PR tasks.
Those capabilities go beyond test execution, but the reviewed contracts do not
establish the complete local parallel-worktree audit/reconstruction workflow.
[Nx Cloud capabilities](https://nx.dev/docs/features/ci-features),
[self-healing CI](https://nx.dev/docs/features/ci-features/self-healing-ci).

Two additional precedents address parts of the Git workflow directly:

| Precedent | Relevant capability | Remaining responsibility |
| --- | --- | --- |
| GitHub merge queues | Validate a candidate together with the latest target branch and earlier queued changes before merging. [Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). | Adopt combined-tree validation. A queue's checks do not by themselves supply Ramify's live module evidence or historical diagnosis after an unexpected failure. |
| Git bisect | Automate searching known good/bad revisions using a test command. Its first-parent option identifies the integration merge where a regression entered the mainline. [Documentation](https://git-scm.com/docs/git-bisect). | Supply a reproducible failure predicate and environments, preserve observations, and distinguish a mainline introduction from a faulty change inside a branch or an interaction between branches. |

The product boundary should therefore distinguish three responsibilities:

1. Runners and task engines execute, select and cache work.
2. The audit service records which evidence applies to which source/task input
   view, retains original provenance across worktrees and merges, and exposes
   the history required for reconstruction. Content-equivalent reuse adds an
   applicability record; it must not invent a new historical execution.
3. The agent workflow creates worktrees, integrates changes, decides when to
   investigate, and assigns repairs. cucumber-viz can retain this orchestration
   while using Ramify's audit service through its API/MCP surface.

A shared evidence store must survive worktree cleanup and concurrent writers.
Branch names or per-worktree caches are insufficient durable identities; record
commit/tree identities and ancestry, plus captured dirty-input identity when
needed. Status at M must reconcile its task inputs against prior evidence,
including integration tasks whose inputs combine both branches. A global
timestamp-ordered list of passes and failures cannot replace the Git ancestry.

This strengthens the case for a dedicated audit service. It does not establish
that the underlying execution/cache system needs to be new, nor that regression
reconstruction itself is unprecedented. Integration feasibility must be judged
against this complete workflow rather than just a repeated test command.

## Lessons from the research literature

| Work | Evidence and limits | Design lesson |
| --- | --- | --- |
| Rothermel and Harrold, TOSEM 1997 | Safe regression selection is defined relative to an existing suite and controlled execution conditions. It does not establish that the suite is adequate or that new tests are unnecessary. [Paper](https://doi.org/10.1145/248233.248262), [author-access PDF](https://www.cs.purdue.edu/homes/xyzhang/spring07/Papers/p173-rothermel.pdf). | Treat snapshot/environment equivalence and obligation coverage as explicit assumptions. A successful closure traversal proves neither. |
| Graves et al., TOSEM 2001 | Their empirical comparison found large variation in useful selection across subjects. Its cost model did not directly measure selection-analysis cost and assumed uniform test costs. [Paper](https://www.cs.umd.edu/users/aporter/Docs/p184-graves.pdf). | Test counts and headline selection percentages are insufficient measures of developer benefit. |
| Gligoric, Eloussi and Marinov, ISSTA 2015: Ekstazi | Dynamic file dependencies include resources, directories and attempted absent-file access. Across 615 committed revisions of 32 Java projects, end-to-end time fell 32% on average and 54% for suites over one minute. It sometimes selected more tests yet ran faster than finer-grained approaches. Dirty concurrent edits were not evaluated. [Paper](https://users.ece.utexas.edu/~gligoric/papers/GligoricETAL15Ekstazi.pdf). | Prefer economical dependency tracking integrated with existing runners. Measure collection as well as selection/execution, and track input membership/absence. These figures do not predict TS or Ramify savings. |
| Legunsen et al., FSE 2016: static RTS study | Across 985 revisions of 22 single-module Maven projects, method-level static selection had more disagreements classified as safety violations than class-level selection; reflection and excluded libraries were important causes. The oracle was Ekstazi, so disagreements were not all demonstrated escaped faults. [Paper](https://www.cs.cornell.edu/~legunsen/pubs/LegunsenETAL16StaticRTSStudy.pdf). | More detailed static analysis is not automatically more reliable. Unsupported dependency forms need explicit uncertainty or wider execution. |
| Zhang, ICSE 2018: HyRTS | Hybrid fine/coarse selection improved selection and some timings across 2,707 passing revisions of 32 Maven projects. Structural additions/deletions deliberately trigger coarser treatment; collection cost narrows gains. Passing-revision filtering limits conclusions about fault detection. [Paper](https://lingming.cs.illinois.edu/publications/icse2018.pdf). | Use precision only where its semantics and total cost are established. Keep broad invalidation for structural changes. |
| Lam et al., ISSTA 2020 | Selecting, reordering and parallelizing tests exposed order-dependent failures. The study used projects already known to contain such tests; its results are not population prevalence estimates. [Paper](https://homes.cs.washington.edu/~mernst/pubs/dependent-tests-issta2020.pdf). | Task identity must cover setup, order, shared state and prerequisites. Preserve whole-suite boundaries when independent execution has not been established. |
| Peng, Chen and Yang, TSE 2022 | A year of history in 11 large Java systems showed substantial variation: several systems had median impacted sets of 40–72%, while three were below 10%. Static analysis omitted external binaries. [Paper](https://jinqiuyang.github.io/papers/testImpactAnalysisTSE2021.pdf). | High fan-out is ordinary enough to benchmark explicitly. Architectural modules do not ensure small affected closures. |
| Maurina, Cazzola and Ghosh, TSE 2025: BabelRTS | Polyglot dependency patterns were evaluated across 142 projects. On curated real-fault benchmarks, default patterns achieved reported fault-detection ratios of 99% Java, 100% Python and 85% JavaScript; tailored patterns raised the evaluated sets to 100%. These are study results, not universal guarantees. [Author manuscript](https://air.unimi.it/retrieve/handle/2434/1159321/2831308/tse24-third.pdf), [publication record](https://air.unimi.it/handle/2434/1159321). | Version dependency rules/adapters and include cross-language/library relationships. Missing support is a correctness limit, not just a performance issue. |

BabelRTS's source also makes an assumption that this live-audit design should
not inherit: deleted files are omitted from the changed set on the assumption
that references/tests were adjusted. Our retained dependency history needs to
invalidate evidence even when a deletion leaves dangling consumers.
[BabelRTS author manuscript, §2.1](https://air.unimi.it/retrieve/handle/2434/1159321/2831308/tse24-third.pdf).

The broader architecture is also established. *Build Systems à la Carte*
(Mokhov, Mitchell and Peyton Jones, ICFP 2018) separates scheduling from the
decision to rebuild/reuse, showing how existing systems combine these choices.
For Ramify, choosing module-aware applicability does not require owning every
execution, scheduling and storage mechanism.
[Paper and implementation](https://www.microsoft.com/en-us/research/publication/build-systems-la-carte/).

## What should change in our proposal

The following are recommendations from this comparison. They are not changes
to an approved implementation scope.

1. **Keep Plan 7 as an impact query.** It remains useful to applications that
   need Ramify module IDs and its supported source semantics. Do not extend
   its current-only API silently into a historical audit-validity guarantee.
2. **Make execution/cache integration a primary design path.** Define an
   adapter returning task identity, actual selection, execution or cache-hit
   disposition, input/environment evidence, outputs and original run reference.
   Prototype a Vitest runner for the current toolkit and one existing task
   engine, with Nx the first candidate to evaluate.
3. **Separate dependency edges from task input identity.** Keep original,
   forwarding, type/test, shim and symbol-free relationships from Plan 5/7,
   but also cover fixtures, runtime resources, generated artifacts, configuration,
   platform and test selection/order. A graph or test pass cannot certify that
   every relevant input was observed.
4. **Preserve history needed for invalidation.** File deletion, module removal,
   renaming, new tests and changed discovery rules must not disappear when the
   new graph is built. Use prior manifests or before/after graph information.
5. **Expose why reuse is justified and where it is limited.** Current/invalidated/
   unknown, last raw outcome, activity and coverage remain separate. A backend
   hash is useful evidence; its completeness depends on the adapter's supported
   input contract. Do not override a backend cache miss with a narrower Ramify
   graph-based pass, or assume every backend hit meets a stronger audit claim.
6. **Keep runtime behavior changes in invalidation.** Plan 5 may avoid repeated
   architectural analysis when exports are unchanged. Tests still depend on
   implementation behavior; declaration-only hashes are not enough for them.
7. **Treat selection policy as part of the evidence.** Unknown dependencies
   need conservative fallback. Probabilistic prioritization can order work;
   probabilistic omission requires a different, explicitly weaker result.
8. **Design execution consistency before persistence.** Capture the relevant
   input view, and only apply an old run to current work when its task inputs
   still match. A live directory can change and be restored between two hash
   checks. Restart recovery and concurrent requests need the same rules.

Several of these constraints were already in the live-audit proposal. The new
conclusion is about implementation ownership: their presence does not justify
reimplementing the mature runner/cache layers beneath them.

## Does Ramify warrant a separate approach?

There is a concrete product case to evaluate for a **Ramify audit service**:
module applicability and Git-linked evidence across parallel development and
integration. The reviewed systems have not established a complete replacement.
The case for a separate general-purpose incremental test engine remains
unproven; existing execution/cache layers can support the audit service.

Ramify already owns explicit modules, same-owner testing areas, original and
forwarding ownership, source interpretation limits and a planned retained
analysis service. Reusing those facts can avoid another analysis setup for
projects already using Ramify. A module-facing view of required obligations,
missing coverage and applicable evidence can also serve cucumber-viz and other
clients through one contract. These are integration and adoption advantages
to validate; they are not new regression-selection algorithms.

There are limits to that advantage. Nx projects need not be npm-package-sized;
existing tools have boundary models, plugins and agent integrations. Ramify's
module graph may be coarser than individual tests and still invalidate almost
everything after a shared-library edit. TypeScript interpretation does not
automatically cover filesystem reads, process execution or independent language
scopes. We have not measured that Ramify improves real audit latency or reduces
configuration effort compared with an existing integration.

| Project situation | Recommended direction |
| --- | --- |
| Uses Ramify and an established task engine | Add module/obligation mapping and evidence ingestion; let the engine retain responsibility for its execution/cache decisions. |
| Uses Ramify with plain test-runner commands | Offer the audit service with an initial runner adapter and bounded local evidence. Keep the execution backend replaceable. |
| Primarily needs live JS/TS feedback in an editor | Evaluate existing continuous-testing tools; Ramify should not rebuild that experience merely to offer it under another name. |
| Needs repository-scale remote execution and artifact caching | Use an established build/task system; this audit feature alone does not justify taking on that platform. |

No Wallaby export API or completed Nx/Turbo evidence adapter was established by
this review. Supported result formats, hash provenance, cache-hit reporting,
licensing/hosting constraints and snapshot compatibility must be verified in
the proposed integration prototype. Documentation overlap is not a tested
drop-in replacement.

## How to validate the decision before a large implementation

Compare a native Ramify proof of concept with a supported runner/task-engine
integration using the same obligations and representative projects. Preserve
the existing fixed fixtures, then add a real project large enough for test time
and shared-input fan-out to matter. The present Plan 7 graph microbenchmarks
cannot answer this question.

Measure the complete requested-audit path: synchronization, graph/manifest
work, runner startup, selected test duration, dependency collection, result
persistence and reconciliation. Record idle memory, high fan-out invalidation
and setup/maintenance effort. A reduction in the number of tests is useful
only if end-to-end feedback and operating cost improve.

During validation, compare proposed selections with full executions on fixed,
controlled inputs and retain independently expected change cases. Cover body
changes, shared fixtures, config/env/tool changes, resource loading, new and
deleted tests, removed providers, task order, dirty worktrees at identical HEADs,
mid-run edits/restoration, cancelled tasks, restarts and missing history.
The important negative case is a failing test omitted by selection or a stale
pass accepted as current. The positive control is successful reuse after an
unrelated edit. Any broader scheduled validation remains explicit evidence,
not a way to label a risk-based subset as exhaustive.

Also compare the actual parallel-agent workflow: two independently passing
branches whose combination fails, explicit merge-resolution changes, concurrent
audit publication, cleanup of the originating worktree, and reconstruction
using retained evidence after a later failure. Reuse must retain the original
execution identity. A prototype that only accelerates tests has not validated
replacement of cucumber-viz's audit role.

Choose further native implementation only after the comparison shows a concrete
benefit: less configuration for Ramify projects, a needed module/evidence
contract that the adapter cannot express, or better measured feedback with
the same correctness assumptions. Otherwise, an integration can deliver the
user workflow with less execution infrastructure to maintain.
