# Iteration 6: Analysis limits

**Plan:** [Plan 2E](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis/typescript` (`catalog.ts`, `accesses.ts`).

## Goal

Every coverage note says which construct, what could not be established, and that it was not verified, in words that cannot be read as a denial.

## Read first

- Main plan: Contract rule 5.
- `subs/analysis/subs/typescript/src/accesses.ts:160-410`, `catalog.ts:190-850`, `interfaces/source.ts:89-100`.
- `docs/model/typescript-source-interpretation.principles.md:420-449`.

## Deliverables

1. Messages for all reachable `SourceLimit` codes, each ending in the fixed clause that the access or export was not verified.
2. `details` on `SourceLimit` where a compiler code or a forwarding chain explains the limit.
3. `compiled-source` removed.
4. Catalogue rows and the owner's catalogue test.

## Matrix rows executed here

- DM-02 (typescript)
- DM-03

## Verification

- One test per code with the full text; a scan test that no limit message contains `denied` or `not allowed`.

## Exit criteria

- No limit row is `TBD`.

## Handoff

- None.
