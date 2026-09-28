# Iteration 1: durable capability records and authority

[Plan 16](../main-plan.md) · [Contracts](../contract-appendix.md)

## Prerequisites and owners

Complete the main plan's clean-baseline prerequisite: resolve the version-4
contract prompt/package/test edits separately, record their disposition and
actual precursor revision, then establish the clean committed execution tree
and baseline audit. Preserve unrelated changes in their original checkout.
Scope: harness internals; child ledger and agent interfaces are consumed.

## Goal and read first

Make capability coordination a durable, versioned harness concept.
Read the contract appendix, `work/records.ts`, `work/committed.ts`,
`contracts/records.ts`, `run/log.ts`, `run/records.ts`,
`interfaces/protocol/runs.ts` and every principle/glossary entry named in
[model amendments](../model-amendments.md). Paths beginning with `work/`, `contracts/`,
`run/` or `interfaces/` are under `subs/harness/src/`.

## Deliverables

- Implement request, task, plan-revision, exchange and handback records, pure
  transitions and ledger materialization. Extend assignment/invocation links
  explicitly rather than disguising a capability as an ordinary B work item.
- Define action schemas, the shared prevalidation/action validator and
  separation between structural errors and agent judgments.
- Establish stable request/example identities and immutable original requests;
  plan changes retain reasons, coverage links and unresolved requirements.
- Record active delegation authority, parent continuation and nested-task
  references, the depth-first stack, deferred provider entries and provisional
  requesting-source snapshots. Handback cannot close unfinished work.
- Implement distinct assignment ownership/numbering for tasks and work items,
  captured task limits and combined work-unit accounting. Keep capability/task
  identities separate in durable records and future projections.
- Review the exact model amendments against the contracts, including protocol
  actions and historical obligation/conformance vocabulary. Record final wording
  for iteration 7 to apply alongside rollout; current principles are not changed
  to describe a partially implemented workflow.

## Verification and exit criteria

Start `capability-records.test.ts`, `capability-submission.test.ts` and
`capability-state.test.ts` in harness-owned tests. Cover CA01, CA11 and CA16
structural rules plus CA29 and CA34; replay records, reject stale updates, preserve old contracts
and avoid semantic string heuristics. Run the main plan's per-iteration checks.

Exit: records round-trip through the real ledger and schemas; state and
authority invariants are executable; protocol migration is documented without
claiming orchestration exists.

## Handoff

Update the contract appendix with actual schema names and exports. Provide
minimal scripted fixtures and transition builders for iteration 2.
Write `iteration1-results.md` with baseline/disposition evidence and amendment
decisions, following the [iteration index](README.md).
