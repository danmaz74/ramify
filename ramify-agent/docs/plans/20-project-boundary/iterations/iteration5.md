# Iteration 5: Migrate project fixtures and auxiliary source

**Plan:** [Main plan](../main-plan.md).
**ID:** H4a. **Family:** H4. **Status:** pending.
**Project:** `ramify-agent`.
**Prerequisites:** H3b accepted with exact revision-bound handoff.
**Owners:** Agent root configuration and fixture owners.

## Goal

Migrate project fixtures and auxiliary source. Deliver this bounded capability with a green required gate.

## Read first

Read the reviewed fixture/source inventory, exact toolkit package and H1/H3 adapter readiness; current compiler/audit/module files.

Read the local main plan's authority and contract sections and the immediate
predecessor's receipt. Relative source paths belong to `ramify-agent`; commands
run from that project's own root. Expand reads only to resolve a named question.

## Scope boundary

Fixture/source/configuration migration only. Do not replace nested-package readiness or worktree dependency linking in this candidate.

## Deliverables

Move fixtures under their proper owners, declare source-shaped ignored trees and compiler exclusions, retain declared spikes, and repair auxiliary script imports. Adopt the exact new toolkit pin atomically with those changes; update required runner registration, scratch compiler exclusions and fullAuditPaths. Keep the existing readiness/package-link mechanism until H4b.

## Matrix rows executed here

HB10; HB12 exact-pin migration slice. A slice is intermediate evidence; the full case closes only
when all its named slices and the completing integration step pass.

## Verification

Run focused fixture/scenario/import cases and the committed audit across required configs. Existing intentionally invalid fixture contents remain unchanged. The new host toolkit self-check, type-check and build pass with the pin/declarations in one candidate.

Use focused checks first. Full suites execute only through the committed audit
configuration, never duplicated locally. Preserve self-check and all required
gates; no deferred-red exception or partial-evidence pass. Preserve unrelated
work and use an isolated implementation checkout. Record source/configuration
revisions, independently expected outcomes and primary artifacts.

## Exit criteria

All project source/configuration is compatible with the new toolkit; H4b starts from a green migrated project and no pending fixture repair.

## Handoff

Write `iteration5-results.md`: exact candidate revision, completed case slices,
public contracts/exposures, command/configuration identities, evidence references,
and next-step inputs. Describe remaining obligations, not a replay of the whole
transcript. No design or repair outside the scope boundary is silently added.
