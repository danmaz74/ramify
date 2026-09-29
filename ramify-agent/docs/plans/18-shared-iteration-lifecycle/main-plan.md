# Plan 18: one iteration lifecycle with producer-owned audit evidence

**Date:** 2026-09-29. **Status:** proposed implementation plan; no implementation
or acceptance is claimed. The user requested this plan after reviewing the
Plan 16 retry 7 run and confirming that capability assignments must behave
exactly like ordinary assignments, with the architect's consumer/provider
knowledge being the difference. On the same date, the user authorized merging
Plan 19 into this plan and explicitly required the missing generated API-view
preparation to be fixed. Plan 19 is absorbed; implementation is not started.

[Provider contract](provider-contract.md) · [Acceptance](acceptance.md) ·
[Iterations](iterations/README.md)

## Outcome

Every engineer assignment uses the ordinary iteration lifecycle, regardless
of which architect issued it. The capability architect knows the consumer's
request and actual usage, the provider's behavior, and the affected owners.
That context changes its design and assignment decisions. It does not change
engineer preparation, tools, gates, commits, reviews, repair or recovery.

The implementation removes the separate capability engineer loop. It does
not maintain two loops that happen to share some helpers or pass similar tests.
The existing ordinary lifecycle is the implementation to generalize and reuse.
The shared path also adopts the audit-evidence and repair changes formerly in
Plan 19: ramify-audit produces check evidence, engineers diagnose and repair,
and no second test selection or failure tally chooses repair ownership.
Parity means both coordinators use that corrected path; it does not preserve
old ordinary-path defects.

```text
ordinary architect ────┐
                      ├─ ordinary assignment → shared iteration executor
capability architect ──┘                         │
                               normal gate / repair / commit / review
                                                │
                                    ordinary iteration result
                                                │
                                    issuing architect continues
```

Capability delegation retains a parent continuation and a bounded task goal.
Completing that goal returns the result to its caller. It does not complete
the consumer's broader assignment or an independently queued provider entry.

## Evidence, baseline and prerequisites

The inspected Plan 16 implementation is commit `0c53c57a` in
`/tmp/ramify-plan16-capability-architect`. Its relevant execution paths match
the retry 7 runtime at `86d0af72`. The
[retry 7 report](/tmp/ramify-plan16-capability-architect/ramify-agent/docs/plans/16-capability-architect/evidence/2026-09-29-retry7-run-analysis.md)
records fifteen capability assignments, five combined implementation gates,
three failed semantic reviews and a context-budget stop without handback.
The report is historical evidence, not a fresh acceptance result.

This plan is authored in `/ramify/ramify-agent`; the enclosing checkout was
at `11fdd81138cf25b33d413b61f1fc9bd43f4dfb92`, with unrelated edits present.
That checkout already pins registry releases of Ramify and ramify-audit; the
Plan 16 worktree has older dependency arrangements. Do not copy those older
package files or its runtime configuration into the implementation baseline.

Before implementation, use an isolated checkout with the Plan 16 source
integrated and identify the exact starting commit. Preserve unrelated work
and the failed trial's dirty target. This corrective plan does not require
the old Plan 16 CA27 live witness to pass first; delivering that behavior is
part of this plan's final witness.

[Plan 17](../17-machine-test-lock/main-plan.md) owns audit selection, test
locking, time accounting and shell test restrictions. Adopt its delivered
ordinary behavior through the shared path. Record which parts are present
at implementation time; do not duplicate its work or restore retry 7's
whole-suite policy. Final integration must reconcile changes to shared run,
gate and equipment code before acceptance.

The current [harness principles](../../harness.principles.md) also place check
execution evidence with ramify-audit. Both coordinators consume that producer's
results and complete relevant diagnostics. Shared execution must not preserve
a parallel failure tally or infer repair responsibility from test locations
or a second test run. The engineer judges the failure and asks its architect
when scope or design decisions are needed.

Plan 19 inspected provider source `/ramify-audit` at
`2e6f6cecf80dcc52ac2530aca095a8a097acf6ad` and installed ramify-audit 0.3.0.
The [provider inventory](provider-contract.md) distinguishes exposed operations
from required extensions. Provider-owned changes are implemented, tested and
released there, then adopted through an exact package pin. Its contract review
and the common assignment characterization can proceed independently; final
production acceptance uses an identified revision containing both changes.

[Plan 7](../07-commit-audit-integration/main-plan.md) supplies commit-then-audit
and the existing adapter boundary. Preserve source binding while replacing
obsolete blanket registered-executor workarounds with supported provider
execution. CheckFindings remain their own issue/disposition lifecycle; immediate
repair does not require another per-test finding registry.

## What is wrong today

Source names below refer to the inspected Plan 16 revision, not a claim that
its branch has already been delivered into the authoring checkout.

| Ordinary execution | Separate capability execution | Required correction |
| --- | --- | --- |
| `run/service.ts:assignIteration` and `work/iterations.ts` capture the assignment, selected requirements, scope, gate policy, scenarios and bounds. | `assignCapabilityWork` builds a reduced `CapabilityAssignment`. | One assignment contract with a separate coordination-owner reference. |
| `takeIteration` delivers full selected requirement text, `iterationViews`, scenario briefing and normal engineer equipment. | The capability prompt supplies a plan and scope, omitting these preparation steps. | Use the same preparation and equipment code. |
| Completion is validated, gated, repaired and closed with an ordinary result. | Both `completion-proposed` and `partial` settle as provisional `partial`. | Preserve the actual outcome and apply the normal completion gate. |
| The gate commits a candidate before checks; a passing gate records an accepted iteration and schedules reviews. | Commits and separate synchronous reviews are deferred to capability handback. | Same commit boundary, review scheduling and finding reconciliation. |
| Failure and partial work return to the architect under ordinary bounds. | Capability work has its own reconstruction loop and run-failure decisions. | Same failure digest, recovery, limits and return behavior. |
| Results and Git describe implementation progress. | `read_capability_evidence` repeatedly returns all assignments, exchanges, capability events and run gate events. | Deliver the latest relevant result; inspect Git and targeted artifacts. |

The ordinary new-run submission surface already includes `capability-needed`.
Keep it. The schema's exclusion of historical `contract-needed` is not the
duplicate lifecycle this plan removes.

## Binding decisions

### 1. One assignment, executor and result

Generalize the existing `IterationAssignment`, `IterationResult`, assignment
builder and executor to identify their coordination owner: an ordinary work
item or a capability task. The target module scope remains a separate fact.
There must be one authoritative owner reference, not two independently
writable associations or a fabricated provider work item.

Capability-owned iterations use their task's sequence and budget. They do
not advance a provider entry's sequence, spend its iteration limit or close
its goal. The requesting consumer's suspended assignment retains its identity.
Repair and session reconstruction stay within the original assignment and
do not reset its counters.

Make both architect `assign` actions use the same authorable assignment body:
stage/kind/goal/approach, ordinary scope, selected requirement elements,
external-capability references and completion evidence, with the same optional
authorizations, scenario selection and raised bounds. The common builder
supplies IDs, sequence, current outline/plan basis, package citation and
kind-derived gate policy. A capability plan supplies the task's design basis;
it does not require a fabricated work-item outline or a second design record.
When work reaches another owner, use the existing context selector/package
assembly to include its relevant requirements before binding the assignment.
Do not fill absent ordinary fields with capability-specific defaults just to
make the executor accept the old reduced action.

Use the common new-run engineer submission validation, including evidence,
scenario and unresolved-finding checks. A successful schema parse is not
implementation acceptance. Do not introduce a capability-only engineer
prompt, equipment policy, test selection rule or execution state machine.

### 2. Normal preparation, gates and reviews

Both coordinators use the same selected-requirement assembly and delivery,
foreign API materialization, module onboarding, scenario briefing, scoped
tools, write enforcement, measurements, bounds and command policies.
Full selected requirements retain their qualifications; requirement IDs or
the capability plan cannot substitute for the requirement text.

#### Explicit fix: materialize and brief generated API views

Retry 7 confirmed a setup defect: capability engineers in Analysis and Model
searched `.ramify/external` and `.ramify/children` from their source directories
and found them absent. The capability assignment's `scope.resolved.view`
contained architect-view metadata; its `materialized` status did not certify
an ordinary or testing foreign API view. The normal path already calls
`iterationViews` → `iterationApiViews` → `apiViewsOf`, which invokes
`ramify.materialize(projectRoot, ownerDirectory)` and reads each source area's
API view. Reuse that preparation through the common executor.

Before dispatching either kind of engineer, materialize/refresh the selected
owner views using the common scope-to-view selection, and brief their actual
locations, source-area identity, revision and coverage. Ordinary source uses
`src/.ramify/{external,children}`; testing source uses its distinct
`src/tests/.ramify/{external,children}`. Never merge those catalogs or use the
project architect view as evidence of their availability. An absent source
area is distinct from an existing area whose generated view is missing; a
reported successful refresh missing that area's metadata is a preparation gap.

Do this on fresh, continued and reconstructed invocations as the ordinary
preparation does, including assignments after a provider API change. Reuse
unchanged generated data only when the common materialization contract confirms
it is current. A failed, missing or partial view carries its actual reason and
coverage through the same ordinary preparation outcome; stale startup metadata
must not turn it into a successful current view. Missing evidence is not proof
that no API exists. Never hand-write generated files or add a separate capability
materializer. SI16–SI18 verify the original defect and these edge cases.

An engineer's completion proposal requests the ordinary kind-derived gate.
Commit the candidate at the common gate boundary, record the actual checks,
perform normal repair/retry handling, and close with the normal result.
An accepted iteration schedules the same reviews as an ordinary iteration,
with the same concurrency, freshness and finding-resolution rules.

A commit is a candidate snapshot, not proof of acceptance: the implementation
commits before checking. Correct shared prompt wording that claims otherwise.
An explicit partial submission does not acquire an accepted commit. Failed
gate candidate commits remain visible with their failed verdicts.

A failed iteration gate delivers all relevant producer failures and complete
diagnostics to that same engineer through normal repair handling, for either
coordinator type. The engineer decides the remedy; an explicit need, partial
outcome, architectural decision or ordinary exhausted-attempt outcome brings
the architect back. Diagnostic paths and failure counts do not choose the owner.
This does not weaken actual write-scope enforcement.

### 3. Partial source and attribution use common rules

Preserve the consumer's tracked, staged, untracked and deleted changes when
it requests a capability. Record each writer's starting state and its actual
mutations. Earlier changes are not attributed to the next engineer and do
not expand that engineer's write authority.

The whole candidate remains subject to the normal checks. For example, if B
changes a result type and A's provisional caller no longer type-checks, record
the failed gate or explicit partial result. The capability architect assigns
the appropriate owner to repair A. A later passing gate checks the combined
candidate; it does not retroactively relabel the earlier partial iteration
as accepted or complete the suspended A assignment.

Prefer compatible implementation stages where the behavior permits them.
An actual breaking change uses the existing authorized breaking-iteration
rules. No capability-only failure waiver, enlarged scope or acceptance bypass
is added. Any missing inherited-change support is fixed in the common path
and exercised under both coordinator types.

### 4. Completion is shared; return routing is task-specific

Apply the existing completion, project-check and review-reconciliation
machinery to the delegated task's bounded goal. Require real provider and
consumer behavior, resolved relevant findings and current execution evidence.
Task completion does not require finishing unrelated scenarios belonging to
the consumer's broader goal, and does not mark those scenarios implemented.

Remove the separately maintained capability acceptance/reviewer pipeline.
A failed task-completion check returns to the architect already coordinating
that goal, whether an ordinary work item or a delegated capability task. This
is distinct from a failed iteration gate, which returns to its engineer.
Task completion may need the normal whole-task check; it does not replace
per-iteration gates or request duplicate reviews solely because the owner is
a capability task. Reuse evidence only under the shared freshness policy.
Preserve Plan 17's audit-reuse decisions; recording configuration identity
does not introduce a capability-only audit cache key or force policy.

Keep the small coordination boundary: qualify a request, suspend the caller,
start a fresh architect with consumer/provider context, consult the caller,
delegate nested needs depth-first, and return the verified result once.
Handback supplies actual interface/use guidance, limitations and completion
references. The original engineer then continues its original assignment.
Unrelated frontier entries remain deferred while this task or a child waits.

### 5. Ordinary inspection replaces the history tool

Give both ordinary and capability architects the same read-only Git
inspection: status, diffs, log and show. Reuse the harness's existing Git
execution support through one small shared tool surface; do not give one
architect a special privilege or build a general command-policy framework.
Keep source mutation and Git mutation unavailable to these readers. Status
must expose untracked files, and ordinary file reads must let the agent
inspect their contents; a tracked diff alone is not a complete candidate.

At continuation, provide the latest engineer result, relevant gate/review
findings and direct paths to their artifacts. At fresh reconstruction,
provide the current task, open work and the same artifact location, using
the existing recovery briefing. Necessary findings must be usable without
decoding the ledger; older details remain available through ordinary reads.

Remove `read_capability_evidence`, its mandatory prompt instruction and the
requirement for agents to copy source/configuration hashes into each case.
The harness retains the provider's source/report identities and binds them to
its actual candidate and orchestration obligations. It does not recompute the
provider's check truth or create another configuration-based audit reuse rule.
The agent still identifies which tests establish each required behavior and
explains corrections to an expected result. Existing
durable records remain available for recovery and inspection.

### 6. Historical runs and projections

Capture the new execution contract in the run version/policy. New runs use
only the common lifecycle. Old capability assignment and review records stay
readable with their original partial/accepted meanings. Do not rewrite retry 7
or silently resume an old run through different commit and acceptance rules.
An incompatible resume returns a concrete explanation before executing work.

Capability detail and execution-map views project the common iteration
result, gate, commit and review references. Web code does not infer acceptance
from a commit, an engineer submission or a task label. Task completion remains
distinct from consumer and provider entry completion.

## Responsibility boundary

| Responsibility | Owner |
| --- | --- |
| Supported check execution, runner result interpretation, test totals, failures, execution completeness, output artifacts, partial selection and evidence composition | ramify-audit, using its actual supported public contracts |
| Ramify importability/dependency facts and diagnostics | Ramify; consumed through the audit integration when checking, with their provenance intact |
| Audit request construction, package/version adaptation, complete report retention and artifact access | Existing harness `audit` child |
| Work and scenario identities, requested obligations, writer settlement, authorized scopes, durable orchestration and bounded attempts | Harness |
| Explaining failures, deciding whether tests or implementation are wrong, grouping related problems, choosing and performing repairs | Agent doing the work; its architect when a scope or architectural decision is needed |
| Display of counts, failures, timing and verdicts | Direct projection of producer evidence; no new computation of test truth in the web or prompt layers |

Counts may be displayed because ramify-audit supplied them. The harness has no
independent outstanding-test counter and does not calculate acceptance from a
failure-list length. It may count its own invocations or enforce an authorized
attempt bound; those are execution policy, not a test-failure tally.

## Integration design

Use the existing `subs/harness/subs/audit` boundary. Keep external imports there,
and expose only the harness-owned access contracts allowed by that module's
boundary. Preserve the complete versioned provider payload behind those access
contracts rather than maintaining a second, reduced audit schema or duplicating
its failure ledger. Known facts needed for control flow are projected directly;
other returned data remains retrievable, with its qualification and provenance.

Prefer native provider execution. Retain a registered bridge only for a concrete
host capability the public provider API does not yet supply. For supported test
runners that bridge must participate in ramify-audit's reporter/parser protocol;
manufacturing an `AuditCheckSummary` from a boolean and output tail is insufficient.
Where lifecycle callbacks, exact exit information, dirty-source execution or
scenario details are missing, extend the provider first. No internal provider
imports or parallel harness parser are an acceptable workaround.

Every surfaced field has a source listed in the [provider contract](provider-contract.md).
Absence is unknown/unavailable, never zero, an empty failure list, an inferred
pass, or permission to rerun tests merely to reconstruct the missing report.
Do not strip supported provider data because today's prompt or UI does not use it.

### Remove, do not relocate

- `scopeProbe` in `checks/checkpoint.ts`, the extra scoped-test append, and the
  corresponding probe preparation at ordinary and capability gate call sites.
- `outsideAssignment()` and automatic repair-owner inference in `checks/gate.ts`.
  Diagnostic paths remain evidence; they no longer decide which agent gets work.
- Independent audit test totals, failure extraction, result reducers and composed
  verdict calculations in harness/prompt/web code where ramify-audit supplies
  them. Preserve scenario-to-plan associations, which the harness owns.
- Parsers whose only consumer was the deleted diagnostic-location attribution.
  Deliver underlying producer output and structured reports to the agent; do
  not create upstream domain parsers solely to preserve that discarded heuristic.
- Automatic escalation merely because Ramify reported a violation or a diagnostic
  was located outside an assignment. The agent determines the needed remedy.
- The output-tail-only failed-test brief. A log excerpt can supplement complete
  structured failure delivery; it cannot stand in for the missing failures.

Keep genuinely focused test tools. Refactor their execution/reporting through
the same provider boundary; do not turn every diagnostic into a committed audit
or impose the suite lock on focused runs contrary to Plan 17.

## Ownership and implementation entry points

Paths are investigation entry points, not exclusive edit lists.

| Owner | Responsibility and existing entry points |
| --- | --- |
| Harness | `subs/harness/src/run/service.ts`; `work/assignment.ts`, `work/iterations.ts`, `work/engineer.ts`, `work/session.ts`, `work/engineer-equipment.ts`; `capability/`; `checks/`; review scheduling/reconciliation; prompts and public projections. Own the unified lifecycle and its meaning. |
| ramify-audit | Separate `/ramify-audit` repository. Own supported execution/reporting, parsed diagnostic execution, durable runner artifacts, composition and any required public extension/release. |
| Audit adapter | `subs/harness/subs/audit/src/check-execution.ts` and its public access contracts. Own package adaptation, complete provider-result retention and mode-specific execution integration. |
| Evidence | `subs/harness/subs/evidence/src/git.ts`, `candidate-tree.ts`. Reuse existing Git operations and candidate identity; extend this owner only if a required read operation is absent. |
| Agent/Pi | `subs/harness/subs/agent/src/interfaces/port.ts` and its Pi implementation. Existing custom-tool and continuation support is expected to suffice; repair an observed adapter defect in its owner if needed. |
| Web | `subs/web/src/`. Consume shared harness contracts for task/iteration views. |

Before adding a cross-owner API, inspect the provider's generated foreign API
view and exposed contract, then the consumer's importability view. Prefer
existing operations. Keep adapter, evidence and rendering responsibilities
with their current owners.

## Implementation sequence

The [iteration manifest](iterations/manifest.json) is the single execution
schedule. Iteration 1 contains independent harness-characterization and provider
contract-inspection work; neither requires the other's live witness. Iteration 2
resolves provider gaps before consumers depend on them. Later iterations proceed
in order. Each handoff records exact source identities, implemented acceptance
rows, commands/results and limitations. No implementation result is implied by
this document.

| Iteration | Deliverable | Replaces original plan work |
| --- | --- | --- |
| [1](iterations/01-shared-contracts.md) | Common assignment ownership, ordinary-path characterization and provider contract decisions | Plan 18 iteration 1; contract-inspection portion of Plan 19 iteration 1 |
| [2](iterations/02-provider-integration.md) | Provider conformance/extensions/release and one execution/evidence adapter for all modes | Remaining Plan 19 iteration 1 and iteration 2 |
| [3](iterations/03-shared-execution.md) | One engineer executor, explicit API-view preparation fix and agent-owned repair without scope probes | Plan 18 iteration 2 and Plan 19 iteration 3 |
| [4](iterations/04-completion-recovery.md) | Shared completion, review reconciliation, recovery and historical compatibility | Plan 18 iteration 3 and relevant Plan 19 recovery work |
| [5](iterations/05-inspection-delivery.md) | Shared Git inspection, faithful evidence delivery, browser projections and removal of history replay | Plan 18 iteration 4 and Plan 19 iteration 4 |
| [6](iterations/06-production-acceptance.md) | One production cutover, real provider conformance, live capability delivery/repair and full audit | Both plans' iteration 5 |

## Acceptance and migration

[Acceptance](acceptance.md) preserves SI01–SI15 and AE01–AE18, with SI16–SI18
added for the confirmed generated API-view defect. Shared fixtures can cover
several rows, but scripted lifecycle parity cannot replace real provider
conformance or live Pi delivery. A fresh production run must demonstrate both
ordinary and capability engineer failure/repair, task handback and original
consumer continuation. A separate controlled stop preserves unfinished work.

Do not enable a path that drops diagnostics before the provider replacement
supplies them. Final rollout has one execution/evidence path per supported
mode and one engineer lifecycle. Historical readers are not an execution
fallback. Preserve old attempt verdicts and inferred-attribution fields as
historical claims, without fabricating newly available provider fields.

Recovery after provider completion retrieves the exact retained result and
artifacts before considering execution. Do not chase a mutable latest ref or
rerun a completed audit solely to reconstruct missing diagnosis. New-source
verification remains distinct from recovery. Use one compatible new-run
version boundary for the combined changes; incompatible old runs remain
inspectable and are refused before new work starts.

## Verification commands and evidence

Run commands from the implementation checkout, not the preserved retry 7
target. Use its project-local executables and recheck scripts/configuration
after baseline integration. During iterations, use explicit focused files,
`npm run type-check` and `npm run check:self` from `ramify-agent/`.

Existing focused suites to extend include `iterations*.test.ts`,
`iteration-gate*.test.ts`, `iteration-source-delivery.test.ts`,
`assignment-source-evidence.test.ts`, `capability-assignments.test.ts`,
`capability-acceptance*.test.ts`, `capability-dependencies.test.ts`,
`capability-recovery.test.ts`, `capability-historical-resume.test.ts`,
`review-lifecycle.test.ts`, `scenario-check-integration.test.ts`,
`run-git.integration.test.ts` and `capability-tasks-projection.test.ts` under
`subs/harness/src/tests/`. Use exact file arguments when executing; extend
existing fixtures and helpers rather than creating another simulated harness.

Suite audits use the committed `ramify-audit.json`, through ramify-audit.
From the repository root, the current configured command is:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

For a fresh final full audit, the installed 0.3.0 CLI supports:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --force --full --json
```

An already verified applicable full result may be reused under the shared
policy; do not rerun it without a reason. `--full` alone does not prevent
same-code evidence reuse, so inspect the result before claiming a fresh full
execution. Commit before auditing and report the audited identity, composition
verdict and any unexecuted checks. Plan 17's shared partial/full and machine-lock
behavior applies when integrated. Do not add per-plan audit request copies.

Provider implementation uses its own required tests, configurations and audit
workflow in /ramify-audit. Final evidence records both repository commits,
the installed public package pin, actual target source and report identities,
all declared configurations, process counts and outstanding limitations.
Passing injected adapter tests alone does not prove the provider seam.

## Scope boundaries and document updates

Update current principles, autonomous-loop architecture, engineer/architect
prompts, common assignment/result contracts, audit access contracts, recovery
compatibility and task/browser projections. Amend the relevant Plan 16 wording
to identify this correction while preserving historical reports and unmet
live claims. Plan 19 is absorbed, with its old paths forwarding here.

Plan 17 continues to own audit policy, full/partial selection, lock behavior,
time accounting and focused-shell restrictions. This plan changes integration,
failure delivery and repair routing, including removal of redundant scope
probes; it does not create a new audit waiver or reuse policy.

This plan does not redesign Pi compaction, raise limits to mask context
growth, repair the diagnostic feature from retry 7, change module ownership,
change Ramify's importability model or replace the durable ledger. The
context-threshold reporting discrepancy is separate. No general workflow
framework, new failure registry, parallel runner/parser, evidence catalog or
compatibility executor is required.
