# Iteration 3: Preserve current failure evidence through providers

**Plan:** [Evidence during invalid analysis](../main-plan.md).
**Prerequisites:** Iteration 2's acquisition evidence and batch operation; iteration 1's adapter inventory.
**Owners:** Analysis and its existing producers, root batch assembly and service contracts; CLI error adapters as needed to retain causes.

## Goal

Keep the complete bounded producer evidence available to every consumer when analysis fails, including failures without reports.

## Read first

- [Specification](../../../architecture/analysis-failure-recovery.spec.md), failure evidence and continuation.
- [Matrix](../acceptance.md), FR04–FR05 and FR09–FR11; iteration 1 contracts and iteration 2 results.
- Root `src/batch.ts`, `src/interfaces/batch.ts`, `src/interfaces/service.ts`; analysis diagnostics/stages and retained-session outcomes; CLI `errors.ts`, affected refusal and top-level error handling.

## Deliverables

1. Replace first-message-only reductions in provider and assembly outcomes with typed diagnostics and available stages. Preserve code, ID, primary/related locations and existing truncation evidence. Keep the original execution reason where no report exists.
2. Preserve evidence for parsing, root/configuration/layout, linking and compiler failures, using existing producers. Do not derive structured locations/stages from strings or present partial scope as certified ownership.
3. Define typed service-error evidence fields outside `details`; retain those through `CliFailure` causes. Ensure formatting failures retain the original cause when available.
4. Keep ordinary violations completed and invalid analysis distinct from incomplete/unavailable execution. Preserve existing cancellation, shutdown and bounded retries.
5. Extend existing adapter tests with multi-diagnostic and related-location cases. Avoid an unrelated refactor of successful operation payloads.

## Matrix rows executed here

FR04–FR05 provider evidence and FR09–FR11 through analysis/assembly. Socket and final CLI assertions remain scheduled for iterations 5 and 6.

## Verification

Run analysis inventory/link failure tests, root `src/tests/affected-batch.test.ts` and `src/tests/batch-cli.test.ts`, and CLI `errors.test.ts` as applicable via `npm test -- <file>`. Run type checks and `check:self` after rebuilding changed output.

Compare structured records to the independently expected producer evidence, including two missing exports and both locations. Inject a no-report crash, limit truncation and formatter throw; assert the original reason survives. No IPC evidence is claimed until the new protocol is enabled.

## Exit criteria

All provider failures retain trustworthy evidence and correct execution/exit distinctions. No adapter required by iteration 1's inventory still reduces available diagnostics to the first message.

## Handoff

Typed provider/service failure payloads and evidence fixtures for contexts and transport; list the remaining transport and presentation adapters awaiting iterations 5–6.
