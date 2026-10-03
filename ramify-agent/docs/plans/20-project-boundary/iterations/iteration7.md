# Iteration 7: Production-path mechanics and project acceptance

**Plan:** [Main plan](../main-plan.md).
**ID:** H5. **Status:** pending.
**Project:** `ramify-agent`.
**Prerequisites:** H4b accepted with exact revision-bound handoff.
**Owners:** Harness integration and project delivery.

## Goal

Production-path mechanics and project acceptance. Deliver only this capability and the supporting contracts needed for it.

## Read first

Relative source paths in this iteration are within `ramify-agent`. Run commands
from that project root and follow its own instructions; do not launch it in
the toolkit working directory.

Read [the main plan](../main-plan.md), including authority, contracts and acceptance. Read all local implementation receipts, actual installed providers, current committed audit config and coordination acceptance PB15.

## Scope boundary

Agent production-path acceptance only. Substantial repair returns to its implementation iteration and invalidates relevant evidence; no provider edits or unrelated live-model acceptance.

## Deliverables

Run controlled production-adapter fixture workflow through scope edit, commit, owner verification, repair/resume and nested final gate. Assemble per-project evidence and complete local audit; hand off exact pins/revision to H6. Keep Plan 16/18 live semantic acceptance status separate.

## Matrix rows executed here

HB12 mechanical slice and HB01–HB12 ledger; final HB12 closure remains H6. Cases assigned only in part retain pending status until the named integration iteration completes them.

## Verification

Run npm run type-check, npm run build, npm run check:self and the clean committed full nested audit described in main plan. Use actual CLI/process/package adapters, independently expected paths/statuses and no substitute fake acceptance. Record any unexecuted live-model behavior explicitly.

Use an isolated implementation checkout and preserve unrelated changes. Record candidate source/configuration revisions, commands, expected and observed behavior and primary artifact paths. A blocked or unrun stage is never a pass.

## Exit criteria

All local implementation/mechanical slices observed, full project audit complete, exact package adoption and destination state recorded; HB12 remains pending its H6 workflow witness. Write completion report and H6 handoff.

## Handoff

Write `iteration7-results.md` with case outcomes, public contract changes, exact package/revision identities, resolved failures and remaining unrun acceptance cases and the next iteration's inputs. Advance status only from that evidence; planning validation does not establish implementation.
