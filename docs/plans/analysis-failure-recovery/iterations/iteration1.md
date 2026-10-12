# Iteration 1: Contracts, exposures and acceptance fixtures

**Plan:** [Evidence during invalid analysis](../main-plan.md).
**Prerequisites:** The current acquisition, classification and context APIs named in the main plan exist; review the proposed contracts before implementation.
**Owners:** Existing analysis/project, analysis, contexts, daemon, root and CLI contract owners, coordinated for this one contract package.

## Goal

Make every cross-owner shape, exposure, failure mapping and fixture concrete before its consumers are implemented.

## Read first

- [Main plan](../main-plan.md), especially contract decisions and current gaps.
- [Recovery specification](../../../architecture/analysis-failure-recovery.spec.md), all sections.
- [CLI contract](../../../architecture/cli-invocation.spec.md), output versions and failures.
- [Daemon](../../../architecture/daemon.md), revisions, service outcomes and compatibility; [memory lifecycle](../../../architecture/memory-lifecycle.md), bounds and eviction.
- [Architect principles](../../../agents/module-architect.principles.md) and [glossary](../../../agents/glossary.md).
- Current `InventoryRun`, `ProjectScope`, `PathOwnership`, `ContextRevision`, `ServiceError`, `CheckDocument`, codec validators and affected table validation. Search the generated architect/API views first when available; refresh before proposing new exposure names.

## Deliverables

1. Record reviewed examples under this plan's `contracts.md`: every ownership outcome, changed-check invalidity, a contextual service error without a report, invocation error, no baseline and overflow. Use exact fields/types from the specification and main plan. Resolve gap-reason composition, path argument validation reuse, canonical-root preservation and the no-report diagnostic representation explicitly.
2. Map every changed carrier and producer to its owner and consumers, including check, affected, materialize and measure failures. Identify evidence discarded by each adapter; distinguish project-resolution issues from analysis diagnostics without inventing locations.
3. Record the `ramify.ipc/3` proposal and explicit incompatibility policy, public ownership decoder name, ownership validator reuse mechanism, and required `module.ramify` exposure/signature companions. No new module, runtime browser promise or resident ownership operation.
4. Add owner-local contract fixtures for FR01–FR02 and the fixture builders needed by iteration 2. Retain frozen old-schema examples; do not rewrite an old fixture to make a new field appear backward compatible.
5. Update owning architecture contracts to the reviewed proposed behavior when execution adopts them. Keep status explicit; do not mark the whole design implemented. No importability principles, declaration grammar or source interpretation changes.

## Matrix rows executed here

FR01 and FR02: contract examples and independently expected schema rules. Runtime acceptance remains with the later listed iterations.

## Verification

Validate example structure and field omission rules against the proposed unions; enumerate invalid examples, including failure plus scope, ownership plus recovery, and evidence in scalar error details. Run `npm run type-check` if TypeScript contract fixtures are added. There is no ownership command or runtime recovery yet; those are explicit intermediate gaps.

## Exit criteria

The concrete contract package has been reviewed, every foreign type has an exposure path, all FR01–FR02 variants have independent expected outcomes, and no contract question blocks the next iteration.

## Handoff

Reviewed contract examples, exposure map, fixture builders, exact error mapping and compatibility decision. Record accepted changes to the proposal in the iteration results without changing historical evidence.
