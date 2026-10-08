# Iteration 0: inventory and case preservation

**Plan:** [Plan 22](../main-plan.md). **Prerequisites:** inspected implementation
base containing adopted Plan 21 configured-audit contracts; wrapper qualification
can proceed independently as described in the plan. **Owners:** project testing
configuration and harness test inventory.

## Goal

Define every case's destination and the real boundaries that must survive before
changing fixtures or runner selection. Prioritize the slowest acceptance-file
mapping so lower-cost families do not delay preparation of iteration 3.

## Read first

[Source state](../source-state.md), [contracts](../contracts.md),
`AGENTS.md`, current `vitest.config.ts`, `package.json`, `ramify-audit.json`,
the Plan 7 runtime profile, and the active Plan 21 source/handoffs. Search the
architect and each owner's testing API view before proposing foreign helpers.

## Deliverables

Capture exact clean base, runner/configuration hashes, installed versions and
actual configured discovery. Trace helper-mediated external calls for every
selected owner, including setup, teardown and candidate/audit defaults.
Write `case-migration.json` and `boundary-inventory.md` beside the plan: old
path/title/ID, expected assertion, proposed destination, owning iteration and
boundary rationale. Preserve all twelve acceptance variants and each restart
table row. Name exact retained Git/process/Ramify/audit witnesses; split mixed
files rather than exempting ordinary cases. Expand iterations 3–5 with exact
paths from this inventory before their implementation begins. Resolve drift
from the planning snapshot against the current source without reviving removed
Plan 21 APIs.

## Matrix rows executed here

TB01 and the pre-migration portion of TB02; fixtures F1–F5.

## Verification

From `ramify-agent/`, run `node_modules/.bin/vitest list --filesOnly --json`.
Case-title collection may evaluate module setup: first inspect top-level effects,
then collect in an isolated, guarded fixture where needed. Check every discovered
file/case has an inventory entry. No full test run is needed to establish this
inventory; supplied timings remain explicitly historical diagnostic inputs.

## Exit criteria

No unexplained selected file/case, no unnamed retained boundary, no test-only
Git reimplementation proposal, and exact adopted contracts identified. The
responsible architect reviews proposed case treatments before conversions.

## Handoff

`iteration0-results.md`, discovery, case migration and boundary inventory, with
source identities and the exact per-iteration work list.
