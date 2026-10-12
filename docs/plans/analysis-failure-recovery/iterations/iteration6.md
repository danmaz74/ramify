# Iteration 6: CLI evidence presentation and forward repair

**Plan:** [Evidence during invalid analysis](../main-plan.md).
**Prerequisites:** Iteration 5's decoded operation/service outcomes and iteration 2's ownership command.
**Owners:** CLI command/error/formatting owners; root integration tests for the composed workflow.

## Goal

Give callers current located diagnostics and contextual recovery through the final CLI envelopes, while preserving check and projection semantics.

## Read first

- [Specification](../../../architecture/analysis-failure-recovery.spec.md), failure evidence, carriers and continuation.
- [Main plan](../main-plan.md), ownership and migration; [matrix](../acceptance.md), FR02, FR04, FR07, FR09–FR13 and FR20–FR23.
- CLI `changed-command.ts`, `check-command.ts`, `affected-command.ts`, `materialize-command.ts`, `measure-command.ts`, `run-cli.ts`, `format.ts`, `errors.ts`, public contracts and relevant tests.

## Deliverables

1. Complete Check/4 and CLI/2 formatting for both reported invalidity and failures without reports. Preserve all existing findings, execution, coverage and path dispositions plus available stages/recovery. Maintain exit 0/1/2/130 meanings.
2. Forward both IPC recovery locations without conflating omitted context evidence with no changes. An established invalid initial context reports unavailable history; a pre-context invocation error omits recovery.
3. Present failed operation and located diagnostics before explaining unavailable evidence. Preserve original causes if formatting fails; make output-limit omissions explicit. Historical paths are investigation evidence, with no causal inference or rollback advice.
4. Verify fresh batch analysis, ownership and complete resident reports omit recovery under their unchanged domains. Ownership remains independent even when affected/materialization cannot answer.
5. Run the composed A→B→C→D workflow through the quick environment and actual CLI command dispatcher. Retain old generated view identities while invalid and publish fresh views only from valid current evidence.
6. Update CLI help and owning CLI/daemon documentation to match delivered behavior; leave whole-plan status pending final qualification.

## Matrix rows executed here

FR02, FR04, FR07, FR09–FR13 and FR20–FR23. Actual installed-process FR24 remains iteration 7.

## Verification

Run focused CLI changed/check/affected/materialize/measure/error/argument tests, ownership schema tests, root batch-CLI tests and the composed recovery fixture. Run type checks, build and `check:self`.

Validate every emitted JSON document using the reviewed schemas. Assert human operation labels and primary/related locations independently of JSON. Exercise valid analysis with a failed check, reportless service error, invalid initial context, no-context invocation error, cancellation and exhausted lifecycle recovery. Verify no stale or mixed projection is published. All planned CLI behavior must now work; no later-iteration semantic gap remains.

## Exit criteria

The caller can investigate invalid B/C and repair to D without reset using current diagnostics, independent ownership and resident history. Old CLI schemas remain unchanged, and every mapped failure adapter preserves available evidence.

## Handoff

CLI wire/human examples, workflow results and the built artifact for process qualification. List any environmental limitation separately from behavior proven through direct adapters.
