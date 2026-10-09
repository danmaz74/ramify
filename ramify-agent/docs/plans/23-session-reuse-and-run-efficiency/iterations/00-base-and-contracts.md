# Iteration 0: Reconcile the base and freeze contracts

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** none.
**Status:** completed; see [00-results.md](00-results.md) and [final qualification](14-results.md).

## Owners and write boundary

Plan artifacts and integration setup; no production implementation in this iteration.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Capture a clean execution base containing the selected current changes and freeze the contracts needed for independent implementation.

## Read first

[Source state](../source-state.md), [contracts](../contracts.md), [execution rules](../execution.md), the two source analyses, current metrics specification and Plan 21/22 final results.

## Deliverables

Record committed HEAD, staged/unstaged path inventory and the provenance/disposition of existing metrics work. Build an isolated clean execution base without altering the main index or losing edits. Establish which staged fixes are included and which remain separate before assigning workers.

Resolve the implementation seam for harness-owned durable storage injected into agent operations; freeze point/operation/outcome and observation/metric wire types in a contract appendix. Prove from the installed public surface how effective Cucumber configuration can be acquired without the retired profile API. Record the final pi dispatch interception seam against installed code. These are bounded engineering decisions; escalate only a required product-contract change.

Expand every iteration write set to exact files, freeze F1–F7 expected inputs/outcomes and record the native witness list for iteration 14. Refresh architect/API views on the clean base, recording failure/coverage honestly. Inspect current declarations where generated evidence is stale; a failed materializer cannot supply an availability claim.

## Matrix rows executed here

B01 in the [acceptance matrix](../acceptance.md).

## Verification

Document/contract validation and focused baseline checks for agent session modes, hook checks, scenario form and metrics. Retain known failing cases as expected pre-fix evidence. Validate public import access and run type/structural checks on the execution base; do not mark a failed materializer passed.

Run the complete configured audit from the main plan once on the committed execution base, before any worker branches from it. The staged work it carries has never been audited; a failing baseline audit is recorded as the base's known state and blocks iterations 1–6 until the integrator accepts or repairs it. This is the only full-suite run before iteration 14.

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

Exact contracts, baseline identity, an audited execution base, case fixtures and disjoint write ownership allow iterations 1–6 to start; missing live access is recorded separately.

## Handoff

Base commit, contract appendix, worker write sets, known failures and source/API access limits. Record exact base/head, changed paths, commands and results in
`00-results.md`; do not create a passing receipt before executing the work.
