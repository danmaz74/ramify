# Iteration 2: producer execution and complete evidence

[Plan 18](../main-plan.md) · [Provider contract](../provider-contract.md) ·
[Acceptance](../acceptance.md)

## Prerequisites and owners

Iteration 1 contracts and baseline. Provider changes belong in /ramify-audit;
the harness audit child owns the package adaptation. Work on parent execution
callers remains separately scoped to harness.

## Goal and read first

Read the public provider operations named by the inventory, audit-child
check-execution.ts, checks/execution.ts, run/readiness.ts, sessions/single.ts,
engineer test tools, checks/scenario-check.ts and their received API views.

## Deliverables

- Execute real conformance cases for native and registered Vitest/Cucumber
  reporting, partial composition, exact exits, incomplete reports and complete
  artifact retrieval. Implement missing parsed dirty-diagnostic execution,
  lifecycle or durable scenario-detail capabilities at their producer.
- Release required provider changes and pin the accepted public package before
  dependent consumer execution. Do not import provider internals.
- Integrate one mode-specific execution/evidence boundary for committing gates,
  readiness, standalone gates and focused tools. Prefer native provider support;
  justify any remaining registered bridge by a concrete unavailable host capability.
- Preserve complete provider payloads, qualifications and full artifacts before
  temporary workspace/reporter cleanup. Necessary control facts are direct
  projections, not another parser, reducer or failure ledger.
- Dirty focused checks identify actual working source and remain diagnostics;
  do not commit for diagnosis or certify dirty bytes as a HEAD audit.
- Preserve cancellation, process registration/settlement, environment, source
  path mapping, nested projects and Plan 17 lock/bounds behavior. Focused checks
  remain focused and unlocked; nested suite execution does not double-lock.
- Retain exact completed result identities for idempotent recovery. Do not
  manufacture commands for reused, inherited, unselected or noExecution evidence.
  Keep prior required diagnostics until the replacement demonstrably supplies them.

## Verification and exit criteria

AE01–AE06 and AE10–AE15 at their real provider/adapter boundaries. Assert actual
process counts and known failure contents, not only adapter call counts. Include
long assertion diffs, later independent failures, suite-load failure, malformed
reporter, nested worktrees and retrieval after temporary cleanup.

Run provider-required configurations and audit-child focused conformance through
the projects' supported audit workflows.

Exit: required modes have a proven public contract and installed package;
complete producer evidence is retained without a parallel execution/reporting
authority. Later orchestration cutover can consume it.

## Handoff

Update provider-contract.md with actual public signatures, versions, source
identities and limitations. Record conformance and adoption in
iteration2-results.md, including anything still blocked.
