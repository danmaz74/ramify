# Iteration 5: Registry and model issues

**Plan:** [Plan 2E](../main-plan.md).
**Prerequisites:** iteration 1.
**Owners:** `analysis/model` (`registry.ts`, `profiles.ts`, `model.ts`); the three duplicate `invalid-registry` sites in `analysis`.

## Goal

Registry, tree, original and ungrounded-exposure messages name the definition, module or original concerned and the rule.

## Read first

- `subs/analysis/subs/model/src/registry.ts`, `profiles.ts`, `model.ts:45-205`, `data.ts:50`, `interfaces/model.ts:21-27`.
- `subs/analysis/src/run-analysis.ts:63`, `session-engine.ts:806`, `validation.ts:35`, `inventory.ts:52`.
- The principles on the tag registry and on required tags of new bindings.

## Deliverables

1. Messages for every `ModelIssue` code; `missing-required-tag` names the original, its defining source area and the tags it must retain and why.
2. One shared constructor for the duplicated `invalid-registry` text.
3. Catalogue rows and the owner's catalogue test.

## Matrix rows executed here

- DM-02 (model)
- DM-03

## Verification

- One test per code with the full text; the model cases of the reference harness.

## Exit criteria

- No registry or model row is `TBD`.

## Handoff

- None.
