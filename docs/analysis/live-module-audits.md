# Live module audits and selective verification

**Date:** 2026-09-12. **Status:** Analysis and design proposal for discussion.
This is a possible follow-up to
[Plan 5: fast incremental checks](../plans/iteration-5-fast-incremental-checks/main-plan.md)
and [Plan 7: affected modules](../plans/iteration-7-affected-modules/main-plan.md).
It is not an implementation plan, an accepted runtime contract or a claim that
these capabilities are implemented. No delivery number is assigned here.

The subsequent [prior-art comparison](incremental-testing-prior-art.md) examines
existing test runners, task caches, live tools, Git workflows and research.
It recommends existing execution/cache backends where suitable, while retaining
the cross-worktree audit history needed for regression reconstruction. No
complete replacement for that workflow was established by the comparison.

The [Cucumber profile spike review](cucumber-profile-spike-review.md) adds bounded
evidence for Bazel as a profile executor and shared cache, and identifies shared
router dependencies and incomplete runtime input modeling as limits. It leaves
the Git audit and evidence-applicability requirements in this proposal intact.

## Intended outcome

Ramify maintains a live picture of which modules have current passing audit
evidence and which need verification after changes. When a caller requests an
audit, it executes the required checks and reuses results whose relevant
inputs remain unchanged. Git provenance connects results to development
history and helps narrow when a regression appeared.

The central workflow includes different agents making changes in parallel
worktrees, merging their work, and reconstructing when an unexpected regression
was introduced. Audit records must remain interpretable across those worktrees
and after integration or worktree cleanup. Live selective testing improves the
cost of that workflow; its Git-linked evidence remains part of the requirement.

The user wants live invalidation and audits on request. Automatic test execution
after every edit is not required. API, CLI and MCP access would let cucumber-viz
consume the same state and use failures in its existing repair workflow.

The proposed foundation is an evidence store for **audit tasks**, with module
status derived from the tasks required for each module. Plan 5 supplies current
source facts and revision coordination; Plan 7 supplies dependency impact.
The new work is test-task mapping, additional input tracking, execution,
evidence reuse and persistence.

## A concrete workflow

Suppose A depends on B, B depends on C, and D is unrelated. Each has configured
module tests, and all four have passing audit evidence.

| Event | Required behavior |
| --- | --- |
| C's implementation changes | Invalidate the relevant tasks for C, B and A. D's evidence still applies. Stable exports do not preserve caller test evidence. |
| An audit is requested | Run the invalidated tasks and any missing prerequisites; reuse D's applicable evidence. Execute a shared integration task once even if several modules require it. |
| B's tests fail | Record a current failure, preserve the prior passing execution, and identify the changes that invalidated its evidence. |
| A changes while the audit runs | Keep results attached to the inputs actually tested. Affected current tasks remain invalidated until evidence covers their new inputs. |
| An unrelated README changes | Reuse test evidence only if that file is outside the tasks' declared inputs. A documentation check may still need to run. |
| The daemon restarts | Load persisted evidence, reconcile current inputs, then restore applicable statuses. Persisted green status alone is insufficient. |

The response distinguishes newly executed checks, reused evidence, failures,
uncovered obligations and work that became stale during execution. Reusing
several old executions does not mean the whole suite ran again at the current
revision.

## What cucumber-viz already provides

A subagent inspected the installed cucumber-viz **0.6.3** source on 2026-09-12.
The findings below describe that version. No audit or test was executed during
the investigation. Source locations are recorded in the provenance table below;
they are references for adaptation, not Ramify runtime dependencies.

| Existing behavior | Relevance to Ramify |
| --- | --- |
| `auditStillApplies` and `auditPassed` are separate values. Applicability checks impacting committed and dirty paths. | Preserve freshness separately from the result. An old pass can be stale; a current result can fail. |
| Audit reports retain the source commit/tree, branch, timestamp, named checks and output. Reports have separate Git refs and history. | Preserve immutable execution evidence and source provenance without rewriting the original result. |
| Final workflow checks can reuse passing results by check ID when the branch audit still applies. | Reuse exists, but needs finer input and task identities for a live selective system. |
| Scoped regression derives commands from declared/confirmed module scope, with broader execution when scope cannot be established. | Runner selection and conservative fallback are useful concepts. The inspected selection is not a dependency-graph query. |
| Detached audits run a captured commit; another mode executes in an existing worktree. | A live audit must define exactly which committed and uncommitted inputs were tested. |
| Failed tests become findings with test identity and focused rerun commands; workflow orchestration handles remediation. | Evidence production can remain separate from agents that investigate or fix failures. |

No live per-module evidence ledger or automatic Git bisect implementation was
found in the inspected source. Branch lookup finds the latest audit in history;
that lookup alone does not establish the first regression-introducing commit.
The retained source/report history still supports investigation of where a
regression appeared; automatic search is a separate capability.

The stored summary does not include a complete command/configuration,
test-inventory, toolchain, installed-dependency or environment fingerprint.
Check-ID reuse alone is therefore insufficient for the proposed feature.
Likewise, the existing-worktree execution service does not establish an
immutable input snapshot or validate all input changes during a run. Its audit
mutex serializes audit calls, not arbitrary editor writes. Detached worktrees
also share dependencies through a symlink in the inspected Node adapter.

Ramify has a local precedent in the
[Plan 2 evidence reuse policy](../plans/done/iteration-2-resident-verification/acceptance-evidence-policy.md#reuse-and-affected-execution):
compose unchanged executions and focused reruns while retaining original
artifacts, input identities and platform coverage. That was a scoped acceptance
amendment. It supplies useful requirements, not general authorization to reuse
arbitrary future test results.

## Audit tasks and module status

A module is a unit of ownership, but it is not necessarily an independently
runnable test suite. A task could be a module's unit tests, an integration
suite covering several modules, a package build or a project-wide type check.
One module can require several tasks; one task can satisfy obligations for
several modules. A root-owned test suite must not disappear merely because
the changed production module lives elsewhere.

Task definitions need a stable ID, runner/command and working directory,
selection/discovery rules, covered modules, prerequisites, relevant inputs,
supported platform/environment and a reuse policy. Definitions belong in
tooling configuration; extending `module.ramify` is not assumed. Source test
ownership continues to follow Ramify's existing module/source-area rules.

The runner adapter must report what actually executed. A command that returns
zero after selecting no tests cannot silently satisfy a nonempty obligation.
If an integration command is indivisible, run the whole task when necessary.
Explicit task coverage means coverage of configured audit obligations; it does
not prove that the tests exhaustively exercise the module's behavior.

Keep these dimensions separate:

| Dimension | Proposed states or information |
| --- | --- |
| Evidence applicability | Current, invalidated, or unknown while input reconciliation is pending. |
| Last execution | Passed, failed, errored, cancelled, or no execution. Preserve raw failures and individual results. |
| Activity | Idle, queued or running, with the captured input identity. |
| Verification coverage | Configured obligations satisfied, partial, or uncovered. |
| Policy disposition | Any explicit acceptance of flaky results or other exceptions, separately from raw outcome. |

A module has current passing audit evidence when every required obligation has
applicable passing evidence under its declared scope and policy. Missing test
configuration is uncovered unless an explicit policy marks the obligation
inapplicable. Running work does not turn an old failure into a pass.

Known current failures remain visible. A normal audit must execute missing or
invalidated tasks and tasks whose policy forbids reuse; explicit retry/force
options can rerun a current failure or an already passing task. Retry policy
and flakiness handling need review before defining CLI defaults.

## Evidence identity and reuse

Plan 5's project input ID identifies an analyzed revision. Using it as every
task's reuse key would invalidate all results after any project change and
lose most of the benefit. Each task needs an identity for its relevant inputs:

```text
task input identity = digest(
  task definition and selected test inventory,
  relevant module/source/test/resource contents,
  declared fixtures, configuration and prerequisite artifacts,
  runner, dependency, platform and environment identity,
  dependency interpretation and reuse-policy version
)
```

An execution record stores that identity and its dependency manifest, result,
timestamps, selected/completed checks, output artifact references, and optional
Git commit/tree provenance. An audit response references the original records
and explains why they apply to the requested current revision. Never rewrite
historical failures or label a reused result as freshly executed.

Input sets include membership, not only hashes of files present last time.
Adding a test, fixture or previously absent file can change execution. Changes
to discovery configuration or task coverage also change the obligations that
must be satisfied. A lockfile alone is not proof that mutable installed
dependencies or generated build artifacts match it.

Unknown external state cannot be represented by a fabricated stable identity.
Tasks using live services, time-sensitive data or uncontrolled environments
need an explicit validity policy, a supplied environment identity, or execution
on each audit request. Reuse cannot make nondeterministic tests deterministic.

Exact content restoration could make historical evidence applicable again
when all task/environment identities match and policy permits it. A simpler
first implementation can keep such evidence invalidated until rerun; historical
cache lookup is an optimization rather than a correctness requirement.

## Live invalidation and the dependency model

The source graph supplies a conservative starting point: a change invalidates
its owner's relevant tasks and those of transitive consumers. Include the
type-only, test, resource, shim, forwarding and symbol-free forms covered by
Plan 7. Resolved denied imports still describe dependencies. Plan 5's unchanged
export path and checked-file counts cannot justify skipping dependent tests.

Audit dependencies extend beyond source imports. Fixtures read by path,
runner configuration, test setup, feature files, generated artifacts and
independent compiler scopes need explicit task inputs or conservative rules.
The observer for analysis inputs does not automatically observe every audit
input. Unknown source coverage or unclassified changes require wider
invalidation and explicit uncertainty; executing all configured tasks still
does not prove coverage of an undeclared project or missing tests.

Plan 7 intentionally offers a current-only query with explicit seed IDs.
It does not supply changed-file-to-owner mapping across deletions, previous
graph history or task evidence. The follow-up must handle these gaps:

- Retain the dependencies of each execution so a deleted provider can
  invalidate evidence that used it, even when its old module ID is absent
  from the current inventory.
- Map edits, moves, creates and deletes through previous and current ownership
  or an equivalent retained input manifest. Reconcile module-ID changes.
- Recompute task inputs after source edges, test discovery or configuration
  change. A newly introduced dependency cannot be omitted from the next run.
- Treat changes whose impact cannot be classified as pending or broadly
  invalidated until reconciliation completes. No dropped event may preserve
  an unjustified current-pass status.

A useful additional index is `input/module -> dependent audit tasks`, derived
from the evidence manifests. When C changes, it identifies previously audited
tasks whose input set included C without rebuilding the complete source graph
for every keystroke. The manifests must include the relevant transitive inputs
or another proven representation of that relationship.

Live status is revisioned. It should state the analyzed revision and whether
new input observations are pending. Fast input notifications can remove the
claim of freshness immediately; coalesced background work then determines the
precise invalidated tasks. This preserves Plan 5's hook path while making
uncertainty visible. The next audit request synchronizes both analysis and
additional task inputs before selecting work.

## Storage choices and expected costs

The earlier Plan 7 decision was to build its module graph only when queried.
Live audit tracking introduces a different workload and a reason to retain
evidence dependencies. It does not automatically require changing Plan 7's
public behavior or keeping another permanent copy of its complete graph.

| Choice | Cost and implication |
| --- | --- |
| Recompute impact when audit/status is requested | Least continuous indexing; retain input changes and mark status pending until reconciled. Repeated status requests pay the projection cost. |
| Retain evidence dependencies and their reverse task index | Direct invalidation of known evidence, including old dependencies; requires bounded index lifecycle and task-input reconciliation. Recommended starting proposal. |
| Also maintain a live module graph | Can support frequent graph queries, but adds update/publication work and duplicates some retained relationships. Adopt only if measured usage warrants it. |

With T tasks and R recorded task-to-input/module relationships, task metadata
and the reverse evidence index grow roughly with T + R. Recording a full
transitive input list for every task can become large in densely coupled
projects. Shared module content digests and deduplicated manifests can reduce
duplication without claiming source-text or compiler retention is required.
Historical runs and logs need separate disk retention; keep only bounded
current summaries/indexes hot in memory.

The [Plan 7 graph measurements](../plans/iteration-7-affected-modules/storage-strategy-comparison.md)
measure a source projection, not this evidence store or its invalidation cost.
No additional-memory estimate or latency budget has been measured for live
audits. A future plan must measure ordinary edits, high fan-out shared inputs,
task rediscovery, restart reconciliation, retained relationships, logs and
concurrent audit execution. Bound queues, active tasks, history, output and
temporary workspaces independently, preserving Plan 5's resource guarantees.

## Execution, concurrent changes and process boundaries

The strongest starting proposal is execution against a captured input snapshot.
Committed audits can use a detached checkout of the requested commit. Auditing
current work requires capturing relevant dirty and untracked files as well,
without silently committing the user's working directory. Dependencies,
fixtures and build outputs must also be accounted for; source isolation alone
does not isolate mutable shared inputs.

Running directly in the working directory is cheaper, but accepting the result
requires a reliable rule for changes throughout execution. Comparing only
before/after hashes can miss a file that changes and is restored while a test
reads it. An uncertain or changing input view cannot establish reusable current
evidence. Snapshot versus controlled working-directory execution is a primary
design decision, not a detail to postpone until runner implementation.

After a run, compare its task input identities with the synchronized current
view. Unrelated project changes need not discard useful results. Changes to
the task's relevant inputs leave its current status invalidated while retaining
the historical execution. A cancelled or interrupted aggregate run can preserve
completed task records only when each task's execution, inputs and cleanup are
independently established.

Conceptual responsibilities are:

| Component | Responsibility |
| --- | --- |
| Existing analysis worker | Plan 5 facts and revisions; Plan 7 dependency queries. No test runners in this worker. |
| Audit coordinator | Task definitions, current applicability, input reconciliation, selection, bounded scheduling and module summaries. |
| Execution processes | Run project-provided commands/adapters with cancellation, time/output bounds, prerequisite handling and cleanup. |
| Evidence storage and Git adapter | Persist executions/artifacts, reconcile after restart, attach Git provenance and retrieve history. |
| Existing client adapters | Expose shared API/CLI/MCP behavior, progress and explanations. |

These are responsibility boundaries, not accepted module declarations.
Placement must preserve the [resident dependency and memory rules](../architecture/memory-lifecycle.md).
Audit capability can be loaded/activated when used, and heavy runner dependencies
belong in reclaimable execution processes. Separate processes avoid occupying
the analysis worker, but CPU and memory contention still need scheduling bounds.
Two clients requesting the same task/input may share work; disconnecting one
must not cancel another client's required run or leak the execution indefinitely.

## Git history and regression attribution

Use content identities for applicability and Git identities for provenance.
A clean commit, a dirty working copy and another worktree at the same HEAD can
have different audit inputs. Repository/worktree context must remain explicit;
cross-context reuse requires proven matching task/environment identities.

Evidence must survive the originating worktree's cleanup and concurrent
publication by other agents. Preserve source commit/tree identities, ancestry,
original execution references and captured dirty-input identities where needed.
Branch names and worktree paths supply context, not durable content identity.
A shared repository evidence store and its publication/retention rules need an
explicit contract even if remote cache sharing is deferred.

Passing audits on two branches do not automatically compose into a passing
audit of their merge. Reconcile against the merged tree's actual task inputs,
including integration checks that depend on both sets of changes. Retain the
parent observations so later investigation can distinguish branch failures,
integration interactions and merge-resolution changes. There need not be one
independently faulty branch commit.

Initially, report observed passing and failing executions along the relevant
ancestry, their input identities and intervening changes. A global ordering by
timestamp is insufficient across parallel branches. If several commits lie
between comparable observations, the introducing commit is not known.
Changes to tests themselves can also produce a failure, so locating a regression
must preserve test-definition identity and distinguish code, test and environment
changes. Flaky outcomes may prevent a definitive attribution.

Targeted historical reruns or bisect could narrow that interval later, using
isolated checkouts and compatible environments. Automatic fixes are another
consumer of the evidence: cucumber-viz can initially retain its finding,
flakiness and repair orchestration while asking Ramify which checks need to run.

Persistence need not write a Git commit or ref after every edit. Keep live
invalidation local; record executions durably. Git refs/notes, a local evidence
database or a combination are alternatives to review. Retention and pruning
must turn unavailable evidence into an explicit need to rerun, never a pass.

## Suggested first scope and decisions for planning

The proposed first delivery provides configured test tasks, live module/task
status, conservative invalidation, audits on request, persistent execution
records and Git provenance through API/CLI/MCP. Start with a runner that can
report actual selection and results, plus a generic indivisible command task.
The selection system can reuse a broader command's complete evidence, but
cannot claim per-module execution savings inside a command it cannot partition.

This scope includes handling deletions, restarts, partial analysis, new test
discovery and edits during execution. These determine whether reuse is correct.
It defers automatic per-edit test runs, automated repair agents, historical
bisect, remote/shared caches, browser visualization and universal runner support.
Deferring automatic bisect does not defer recording the branch/merge evidence
needed for reconstruction by a person or agent. Any staged delivery must state
which parts of cucumber-viz's audit workflow it can replace.
The analysis does not change the active Plan 5 work or Plan 7's current scope.

Before authoring a delivery plan, resolve:

1. Task configuration/discovery format, first runner, cross-module integration
   coverage and the meaning of a module with no configured obligations.
2. Input identity, shared/global inputs, external-state policy, and the exact
   evidence required before claiming complete reusable coverage.
3. Snapshot or working-directory execution, dirty-file capture, dependency
   provisioning and concurrent-edit acceptance.
4. Evidence-index representation, deletion/ownership handoff and freshness
   behavior while invalidation is pending.
5. Persistence, Git publication policy, restart reconciliation and retention.
6. Retry/flakiness policy, concurrency, cancellation, query/execution bounds
   and the measured effect on Plan 5 hook performance.

Correctness probes should establish selective reuse after a body edit,
invalidation from a shared fixture or new test, deleted/moved providers,
indivisible integration tasks, zero-test selection, dirty working copies at the
same HEAD, mid-run edits, restart recovery, cancellation and missing evidence.
Include the positive control that unrelated edits retain reusable passing
evidence. A full test run and selectively composed results should satisfy the
same configured obligations on fixed deterministic fixtures, with independent
expected selections rather than only comparing two paths sharing an algorithm.

## cucumber-viz source provenance

All paths in this table are relative to the inspected installation's `src/` at
`/usr/local/lib/node_modules/cucumber-viz/`. Line numbers refer to the 0.6.3
snapshot inspected on 2026-09-12 and may change in later versions. Keep these
references as adaptation evidence; Ramify must not import that source.

For compactness, `studio/` below means
`domain-sub-apps/implementation-studio/core/`.

| Source reference | Observed behavior |
| --- | --- |
| `studio/runtime/audit/branch-auditing.ts:162,664` | Latest-audit lookup; separate applicability and passing checks. |
| `studio/runtime/audit/commit-evidence-service.ts:383,390,420,850` | Commit/tree capture, existing-worktree execution and summary fields. |
| `studio/runtime/audit/report-commit-builder.ts:84,112,174` | Separate report commit and `refs/audited/runs/…` / `refs/audited/by-tree/…` publication. |
| `studio/workflow/audit-composition/adapters/nodejs-react-adapter.ts:55` | Default ignored paths and narrowly defined metadata changes. |
| `studio/workflow-service/final-checks-services.ts:288`; `studio/workflow/checks/check-definition.ts:78` | Passing check-ID reuse and command-executor equivalence test. |
| `studio/runtime/review/regression-scope-planning.ts:135`; `studio/workflow/checks/check-registry.ts:403,414` | Declared/confirmed regression scope and module/profile command mapping. |
| `server/orchestration/studio-mcp-dispatches.ts:1657`; `studio/workflow/audit-composition/adapters/nodejs-workspace.ts:82` | Detached audit execution and shared dependency linking. |
| `studio/runtime/check-execution/check-engine.ts:210`; `studio/runtime/check-execution/check-runner.ts:581` | Check prerequisites, command execution, cancellation and output/time bounds. |
| `studio/workflow/check-findings/check-finding-normalizers/regression.ts:125`; `studio/workflow-service/checks-regression.ts:632,679,718` | Findings, full/scoped regression execution and remediation orchestration. |
| `studio/runtime/audit/commit-evidence-service.ts:742` | Policy-accepted flaky results, motivating preservation of raw outcomes separately. |
