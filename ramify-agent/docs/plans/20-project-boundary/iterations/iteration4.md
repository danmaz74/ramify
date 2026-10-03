# Iteration 4: Integrate nested final-gate evidence and findings

**Plan:** [Main plan](../main-plan.md).
**ID:** H3b. **Family:** H3. **Status:** pending.
**Project:** `ramify-agent`.
**Prerequisites:** H3a accepted with exact revision-bound handoff.
**Owners:** Harness final gate and CheckFinding projections.

## Goal

Integrate nested final-gate evidence and findings. Deliver this bounded capability with a green required gate.

## Read first

Read H3a normal verification handoff, released nested envelope and project-qualified finding/settlement contracts.

Read the local main plan's authority and contract sections and the immediate
predecessor's receipt. Relative source paths belong to `ramify-agent`; commands
run from that project's own root. Expand reads only to resolve a named question.

## Scope boundary

Nested envelope/identity integration only. Provider defects reopen audit work; no readiness or fixture migration here.

## Deliverables

Request nested audits at final gate only, persist every project result/ref and qualify findings by project/check/revision. Update composition union inventories and existing projections atomically. Keep repair ownership semantic; same-named checks in another project cannot settle a child finding.

## Matrix rows executed here

HB09; HB12 final-gate adapter slice; H3 family closure. A slice is intermediate evidence; the full case closes only
when all its named slices and the completing integration step pass.

## Verification

Use actual provider fixtures for failing/reused/incomplete children and settlement on the correct repaired project candidate. Validate durable event/projection round-trips and non-success for unknown results.

Use focused checks first. Full suites execute only through the committed audit
configuration, never duplicated locally. Preserve self-check and all required
gates; no deferred-red exception or partial-evidence pass. Preserve unrelated
work and use an isolated implementation checkout. Record source/configuration
revisions, independently expected outcomes and primary artifacts.

## Exit criteria

Nested evidence reaches durable state and existing views without a second orchestration lifecycle or evidence tally.

## Handoff

Write `iteration4-results.md`: exact candidate revision, completed case slices,
public contracts/exposures, command/configuration identities, evidence references,
and next-step inputs. Describe remaining obligations, not a replay of the whole
transcript. No design or repair outside the scope boundary is silently added.
