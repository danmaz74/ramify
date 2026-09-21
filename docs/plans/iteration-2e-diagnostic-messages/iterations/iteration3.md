# Iteration 3: Description syntax and exposure linking

**Plan:** [Plan 2E](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis/descriptions` (`tokenize.ts`, `parse.ts`, `link.ts`).

## Goal

Every parse and link message names the statement, what was found, what the format requires and, for linking, the module and the declaration it concerns.

## Read first

- Main plan: Contract rules 1 to 5.
- `subs/analysis/subs/descriptions/src/tokenize.ts:40-120`, `parse.ts:40-235`, `link.ts:20-170`, `interfaces/syntax.ts:13-25`, `interfaces/linking.ts:20-27`.
- `docs/model/module-description.principles.md` sections on statement forms and `:861-899` on validation.
- The reference harness's substring assertions in `scripts/reference-harness/project-cases.ts` and `linking-cases.ts`.

## Deliverables

1. Parse messages state the statement kind and the offending token in backticks, then the rule: for example that `expose-test` accepts named selections only and the statement selects `*`.
2. Link messages name the module by declared path, the statement's location and the fact: a child that is not a direct child, a file that belongs to another owner and which one, a wildcard file outside `src/interfaces/`, an export absent from a complete description, a name that denotes two originals and where each is declared.
3. `invalid-encoding` constructed as a `DescriptionIssue`; the pre-formatted `line:column: code: message [start,end)` string in `analysis/project` is no longer parsed back (coordinate with iteration 4 through the issue type only).
4. `related` roles: `statement`, `original-declaration`, `coverage-note`.
5. Catalogue rows and the owner's catalogue test; harness substring assertions updated in the same change.

## Matrix rows executed here

- DM-02 (descriptions)
- DM-03

## Verification

- One test per code with the full text.
- The reference harness's description and linking cases pass.

## Exit criteria

- No description or link row is `TBD`.

## Handoff

- None beyond the catalogue.
