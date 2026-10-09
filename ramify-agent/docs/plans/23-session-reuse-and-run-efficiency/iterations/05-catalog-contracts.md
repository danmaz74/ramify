# Iteration 5: Catalog and scenario-form corrections

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 0.
**Status:** completed; see [05-results.md](05-results.md) and [final qualification](14-results.md).

## Owners and write boundary

Harness/plan-evidence catalog interface and tests; harness/scenarios form.ts and tests. Excludes prompt templates, focused command builder and run/service.ts.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Validate submitted keys and typed references consistently while retaining accepted classification and architect authority.

## Read first

[C5](../contracts.md#c5-catalog-and-semantic-authority), catalog.ts, scenarios/form.ts, Plan 21 completion contract and existing form/catalog tests.

## Deliverables

Complete local-key error reporting before durable ID allocation. Reuse existing acceptElements/reviseCatalog behavior that already meets the contract. Allow retire-only revisions at every affected validator, retain scenario identity references instead of duplicate Gherkin and validate each reference list's allowed kinds.

Adjust form rule 6 for an agent-declared non-behavioral acceptance covered by a registered test. Validate the declaration and references mechanically; do not have the harness infer whether behavior was implemented or whether a test proves a requirement.

Expose accepted intake/revision results for iteration 10. Prompt wording is owned by 2; this iteration only supplies validation contracts and expected error examples.

## Matrix rows executed here

C01, C02, C03 in the [acceptance matrix](../acceptance.md).

## Verification

F5 covers invalid local references, duplicate keys, rejection/retry with unchanged issued IDs, retirement without additions and valid/invalid scenario/test references. Exercise existing architect-owned done states as regression evidence; no audit-to-scenario mapping.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/subs/scenarios/src/tests/form.test.ts subs/harness/subs/plan-evidence/src/tests/plan23-catalog-contracts.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

C01–C03 pass and existing accepted catalog/obligation semantics remain intact.

## Handoff

Catalog/form interfaces, typed reference and error examples, accepted intake integration contract. Record exact base/head, changed paths, commands and results in
`05-results.md`; do not create a passing receipt before executing the work.
