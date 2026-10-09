# Iteration 2: Stable role/task prompts and delivered manifests

**Plan:** [Plan 23](../main-plan.md). **Prerequisites:** iteration 0.
**Status:** completed; see [02-results.md](02-results.md) and [final qualification](14-results.md).

## Owners and write boundary

Harness src/prompts/ templates/packages and new pure task/brief builders with isolated prompt tests. Do not edit run/service.ts or plan-evidence/scenarios implementations.

Confirm exact paths against [execution rules](../execution.md) before work begins.
No edits to another active iteration's files or the main checkout's index.

## Goal

Deliver stable general instructions with explicit task-specific procedure, environment and one submission schema.

## Read first

[C3](../contracts.md#c3-prompt-and-workflow-inputs), role templates and packages.ts, source P3/P4 proposals.

## Deliverables

Separate initial role instructions from current procedure/submission/environment. Render complete fresh packets and revision-bound deltas; expose additions and post-fork updates as ordered task inputs. Fix all required placeholder defects with declared-slot validation that permits quoted braces/JSON.

Define delivered manifests from actual supplied and inherited inputs. Do not hash unused skills as delivered. Adapt read-only skill instructions to supplied views, submission tools and honest coverage limits. Include orientation's required goal/requirements, valid API/config/support paths and current environment through explicit builder inputs.

Correct duplicate-entry/hypothesis instructions, command policy/import-provenance wording, fresh reviewer boilerplate and empty temporal/deviation prose. Prepare canonical changed-path/patch-first review builders without weakening snapshot grounding. Leave catalog validation to 5 and runtime binding to 8–10.

## Matrix rows executed here

P01, P02, P03, P04, P05 in the [acceptance matrix](../acceptance.md).

## Verification

Render every role/task pair in F2, including qualification/reconciliation/NFR variants. Assert one full schema in the combined delivered model input, stable initial role bytes across phases, exact changed sections and explicit missing-input errors. Retain independently authored expected task/tool pairs.

From `ramify-agent/` (new `plan23-*` files are deliverables of this iteration):

```sh
npm run test:quick -- subs/harness/src/tests/plan23-task-prompts.test.ts
```

Record focused outcomes and evidence limits in this iteration's receipt. The
integrator runs affected cross-boundary checks after merging accepted work;
final full configured qualification belongs to iteration 14.

## Exit criteria

P01–P05 pass; builders expose complete inputs for consumers without rereading entire histories or changing the initial prompt.

## Handoff

Task/manifest builder interfaces, migration table for all renderers and F2 expected packets. Record exact base/head, changed paths, commands and results in
`02-results.md`; do not create a passing receipt before executing the work.
