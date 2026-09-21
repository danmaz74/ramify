# Iteration 1: Contract, catalogue, envelope fields and structured identity

**Plan:** [Plan 2E](../main-plan.md).
**Prerequisites:** none beyond the plan's accepted contract review (RD-1 to RD-6).
**Owners:** `analysis` (interfaces, `report-data.ts`, `inventory.ts`, `evaluate-accesses.ts` identity only); `analysis/typescript` (coverage ids only); documentation.

## Goal

The contract exists as a specification with a complete catalogue skeleton, every envelope has its new fields with empty values, and finding identity no longer depends on message text. No message is reworded yet.

## Read first

- Main plan: What exists, Decisions, Contract.
- `subs/analysis/src/interfaces/analysis.ts:53-137`, `subs/analysis/subs/project/src/interfaces/project.ts:60-83`, `subs/analysis/subs/typescript/src/interfaces/source.ts:89-119`, `subs/cli/src/interfaces/cli.ts:36-62`.
- Identity sites: `subs/analysis/src/report-data.ts:9-34`, `inventory.ts:15-17`, `evaluate-accesses.ts:29-37`, `subs/analysis/subs/typescript/src/catalog.ts:193-208`, `accesses.ts:164-171`; the consumer at `subs/daemon/subs/contexts/src/context-manager.ts:396`.
- `docs/architecture/cli-invocation.spec.md:134-201`, `docs/architecture/daemon.md:661-715`.

## Deliverables

1. `docs/architecture/diagnostic-messages.spec.md`: the nine rules, the envelope fields, the rendering block, and a catalogue table with one row per code of every union, each row holding owner, severity, fields and a `TBD` template that the owning iteration replaces. The denial family's rows are complete.
2. `evidence/baseline/`: the current text of every code, produced by running the reference harness and each owner's tests with a capture switch, so the completion report can show before and after.
3. The envelope additions with empty values at every construction site (`details: []`, `proposal: null`, `related[].role`, the warning's `message` set to today's renderer sentence, `reasonMessage: null`). `related` roles are assigned where the producing code already knows them; elsewhere `statement`.
4. Structured identity for the three id families and the two coverage id forms: a canonical JSON key of code, location, importer area, original identity, unsatisfied tags, blocking origins, statement span and named token. The id prefixes keep their names and gain no version suffix.
5. `scripts/check-diagnostic-catalogue.ts` and `npm run check:diagnostics`: enumerates every code union from the TypeScript program and fails on a code without a catalogue row, or a row without a code.
6. The two specification edits of the main plan's Specifications changed section.

## Matrix rows executed here

- DM-01 (skeleton complete, templates may be `TBD`)
- DM-06

## Verification

- `npm run check:diagnostics` passes.
- Identity tests per family: two diagnostics equal in every structured fact and different in `message` share an id; two that differ in one structured fact do not.
- The daemon's `new` and `removed` marks keep their existing tests green.
- `npm run check:self` and the type check pass. Expected intermediate failure: none; no wording changes here.

## Exit criteria

- Every union code has a catalogue row.
- No id computation reads `message`.
- Every envelope compiles with the new fields and every renderer still prints what it printed.

## Handoff

- The catalogue rows each owner must fill, the `RelatedLocation` type and its exposure, the baseline archive, the completeness script.
