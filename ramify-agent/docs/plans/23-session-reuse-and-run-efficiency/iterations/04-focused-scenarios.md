# Iteration 4: Project-configured focused scenario commands

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 0.
**Status:** completed; see [04-results.md](04-results.md) and [final qualification](14-results.md).

## Owners and write boundary

Harness focused-config builder (new src/work/focused-scenarios.ts), tools/shell-tests.ts, evidence child adapter for effective project configuration if required, and their own tests. Excludes scenario form, run service and scenario-briefing wiring.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Give an engineer a working explicit command for exactly its pending scenarios using the project support setup.

## Read first

[C4](../contracts.md#c4-mutation-checks-and-focused-commands), shell-tests.ts, scenario-briefing.ts as consumer, installed Cucumber public configuration surface established in 0, current audit/evidence contracts.

## Deliverables

Acquire effective declared configuration through the installed public surface behind the existing external-evidence owner. Produce a generated scratch config with exact assigned feature paths, required imports/loaders/world parameters and pending enabled. Prevent automatic default-profile discovery/merging. Keep configuration identity and selection evidence.

Classify help/version and dry-run separately; a CLI path appended to a broad default profile cannot establish focus. Unknown configuration/selection is explicit. Preserve full configured audit behavior and do not reconstruct removed scenario-to-audit execution logic.

Keep this provider usable through explicit inputs; iteration 10 supplies the working directory, scratch lifetime and briefing. Prepare an actual-Cucumber witness recipe for 14; scripted selection alone is not proof of installed behavior.

## Matrix rows executed here

H05, H06 in the [acceptance matrix](../acceptance.md).

## Verification

F4 independently states effective configs and selected paths. Test pending override, support retention, multiple profiles, broader CLI merge, missing configuration, cwd/path handling and non-executing command categories using scripted external facts.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/shell-tests.test.ts subs/harness/src/tests/plan23-focused-scenarios.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

H05–H06 pass in ordinary tests with native confirmation explicitly pending until 14.

## Handoff

Focused command/config contract, consumer briefing payload, configuration limitations and native F4 recipe. Record exact base/head, changed paths, commands and results in
`04-results.md`; do not create a passing receipt before executing the work.
