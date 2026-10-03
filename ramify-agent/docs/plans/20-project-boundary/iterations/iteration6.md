# Iteration 6: Use explicit package preparation at readiness

**Plan:** [Main plan](../main-plan.md).
**ID:** H4b. **Family:** H4. **Status:** pending.
**Project:** `ramify-agent`.
**Prerequisites:** H4a accepted with exact revision-bound handoff.
**Owners:** Harness readiness and worktree preparation.

## Goal

Use explicit package preparation at readiness. Deliver this bounded capability with a green required gate.

## Read first

Read H4a migrated configuration and audit workspace packageDirectories contract; existing readiness and worktree-link tests.

Read the local main plan's authority and contract sections and the immediate
predecessor's receipt. Relative source paths belong to `ramify-agent`; commands
run from that project's own root. Expand reads only to resolve a named question.

## Scope boundary

Preparation mechanism only. No further source moves, scope redesign or package compatibility repairs; those reopen H4a/H1 as appropriate.

## Deliverables

Replace manifest discovery/nested-readiness testing and its switch with the committed audit preparation package set. Validate containment/dependencies and use the same set for worktree links. Preparation does not grant assignment writes or imply nested audit targets. Preserve missing-dependency and recovery evidence.

## Matrix rows executed here

HB11; H4 family closure. A slice is intermediate evidence; the full case closes only
when all its named slices and the completing integration step pass.

## Verification

Use actual package/worktree fixtures for required/absent dependencies, external preparation directories and link recovery. Verify no manifest discovery or nested suite remains at readiness and owner verification still has every needed fixture dependency. Required project audit passes.

Use focused checks first. Full suites execute only through the committed audit
configuration, never duplicated locally. Preserve self-check and all required
gates; no deferred-red exception or partial-evidence pass. Preserve unrelated
work and use an isolated implementation checkout. Record source/configuration
revisions, independently expected outcomes and primary artifacts.

## Exit criteria

The same explicit preparation contract drives readiness and audit worktrees; H5 receives completed implementation with exact pins and configuration.

## Handoff

Write `iteration6-results.md`: exact candidate revision, completed case slices,
public contracts/exposures, command/configuration identities, evidence references,
and next-step inputs. Describe remaining obligations, not a replay of the whole
transcript. No design or repair outside the scope boundary is silently added.
