# Iteration 1: Shared ownership scope and included-tree contract

**Plan:** [Main plan](../main-plan.md).
**ID:** H1. **Status:** pending.
**Project:** `ramify-agent`.
**Prerequisites:** A6 accepted with exact revision-bound handoff.
**Owners:** Harness scope/contracts/prompts; evidence CLI adapter.

## Goal

Shared ownership scope and included-tree contract. Deliver only this capability and the supporting contracts needed for it.

## Read first

Relative source paths in this iteration are within `ramify-agent`. Run commands
from that project root and follow its own instructions; do not launch it in
the toolkit working directory.

Read [the main plan](../main-plan.md), including authority, contracts and acceptance. Read harness spec/principles, work/scope.ts, assignment schemas, write guards and prompt generation; inspect generated provider APIs before new imports.

## Scope boundary

Shared scope schema, guards and prompt contract only. Exercise new toolkit contracts in isolated exact-package fixtures until H4a activates the host toolkit pin atomically with its migration.

## Deliverables

Extend the shared ordinary/capability assignment schema with includedTrees, revalidate canonical ownership on writes/resume, preserve protected configuration and explicit child scopes. Remove outside-modules from new assignments; retain historical readability and require scope reissuance for old active records. Relay not-analyzed and include precise tree instructions.

## Matrix rows executed here

HB01, HB02, HB03, HB04. Cases assigned only in part retain pending status until the named integration iteration completes them.

## Verification

Run scope/assignment/hook tests with new/absent files, symlink escape, sibling/root protections, ignored inclusion, changed boundary and historical resume. Assert both coordinator paths use the same lifecycle.

Use an isolated implementation checkout and preserve unrelated changes. Record candidate source/configuration revisions, commands, expected and observed behavior and primary artifact paths. A blocked or unrun stage is never a pass.

## Exit criteria

Shared scope contract and durable migration behavior verified. Hand off schema/projection changes and explicit cases to H2/H3.

## Handoff

Write `iteration1-results.md` with case outcomes, public contract changes, exact package/revision identities, resolved failures and remaining unrun acceptance cases and the next iteration's inputs. Advance status only from that evidence; planning validation does not establish implementation.
