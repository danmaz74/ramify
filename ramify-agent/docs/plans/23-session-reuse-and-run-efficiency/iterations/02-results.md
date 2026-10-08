# Iteration 2 results: stable role/task prompts and delivered manifests

**Acceptance:** P01–P05 provider behavior passed focused deterministic verification.
Runtime session binding remains iterations 8–10; this receipt does not qualify
an unmigrated workflow or native transport.

## Identity and boundary

- Worktree: `/home/app/ramify-plan23-02-prompts`; branch `feat/plan23-02-prompts`.
- Accepted dependency/base: `97aa9430bf588c0b4daefc7604bec3d775e2ff0e`.
- Source head: c15901467fa9b4a13ed53f8e7473ce98b4a619e6.
- Delivery head is the commit containing this receipt; resolve exactly with
  `git log -1 --format=%H -- ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/02-results.md`.
- Contract: execution v1, C3, independently frozen F2/F5. No frozen wire value,
  role authority, workflow decision or configured audit selection changed.
- All edits stay in iteration 2's exact reserved paths. No service, records,
  scenario/catalog implementation, harness declaration, registry, main checkout,
  remote or other worker was edited. `npm ci` installed independent dependencies
  from the committed lockfile; package/lockfile pins remained unchanged.

## Implemented provider behavior

Stable system templates now describe enduring roles and submission protocol.
Current procedures, actual tool names, cwd, candidate/snapshot, limits, available
tools, supplied API-view/module/coverage details, Cucumber config and support
paths enter the task packet explicitly. Read-only embedded skills use supplied
views, preserve limits and finish through the task submission; they require
neither shell materialization nor a report file. Package inventories no longer
read/hash unused skill references as delivered. Delivery sources contain only
actually expanded skill files, including explicitly supplied custom paths.

The complete compact submission schema occurs once in its specialized declaration
**description**; native `inputSchema` is `{ type: 'object' }`. Exact submission
validation stays with the existing validator, which consumers must bind. Same-name
identical inherited declarations are reused; a changed declaration fails and
requires a new tool name. Initial role bytes remain equal across phases; role
additions are explicit rather than replacements.

Canonical goal/requirements sections are constructed once and then revision-diffed.
Fresh delivery includes every section; continuation appends only changed sections;
a pre-briefing fork receives ordered r1 then r2 updates, while an r1 fork receives
only R2. Replay appends none. Unknown/wrong ancestry, conflicting revisions,
missing continuation ancestry and removed sections without an explicit replacement
are unavailable, never false deltas or implicit fresh starts. Current full sections
are validation input only, so unchanged goals/requirements do not re-enter a turn.

Required slot checks detect unresolved double braces and known single-brace
procedure/submission misspellings while retaining ordinary JSON/code braces and
single-pass substituted text. Orientation gets its goal and requirement text,
with an explicit orientation submission. Initial analysis does not reclassify
accepted intake or duplicate entries as hypotheses; local capability instructions
recognize registered entries. Catalog prose specifies reference kinds, retire-only
replacement and registry scenario identities without copying Gherkin. Command
prose distinguishes pre-execution refusal from mutation checks; import provenance
is asserted only when recorded. Empty repair evidence/uncertainty prose is omitted.
Reviews use a supplied canonical changed-path list or obtain it once, read patches
first, reuse guidance only with known identical identities, and require current
snapshot-read grounds for every reported concern. Harness binding annotations
retain the actual candidate diff.

## Exported API and consumer sequence

All providers are harness-owned; callers in the harness need no foreign exposure.
No new cross-owner source import was introduced.

1. `taskBriefingRevision({ revision, goal, requirements, sections })` in
   `prompts/briefings.ts` constructs reserved `goal`/`requirements` sections.
   Other named sections carry exact text/source identities; do not duplicate
   these reserved sections in the current objective or package.
2. `buildBriefingDelivery({ mode: 'fresh' | 'continue' | 'fork', current,
   inheritedRevision, history })` consumes the ordered **recorded briefing revision**
   history, not the conversation transcript. Bind inheritedRevision to the selected
   exact session point. Treat `unavailable` explicitly; only authorized fresh
   recovery can create a full packet.
3. `buildTaskPacket({ loaded, kind, objective, goal, requirements, environment,
   briefing, inheritedPoint, inherited, supplyRoleInstructions, changedPaths? })`
   in `prompts/tasks.ts` validates canonical current goal/requirements and complete
   environment, then returns stable role instructions, one current message, the
   declaration, submission name, exact delivered components and manifest.
4. On Create, use `roleInstructions` as the enduring head; on a role-changing
   fork append that role's instructions. On same-role Continue set
   `supplyRoleInstructions:false`; the actual inherited components must include
   the role. Retain the inherited head unchanged. The returned `additions` are
   **manifest components**, not additional duplicate provider messages: role/tool
   entries are separate inputs, while procedure/environment/brief/task components
   already occur once in `message`. Supply `message` once as the current task.
5. Add/rebind the declaration as needed and bind the exact current validator,
   authority and result destination through the agent boundary. Do not put the
   full schema in another tool field, system text or task text.
6. `buildDeliveredManifest` / `exactInputHash` in `prompts/delivered-manifest.ts`
   retain actual inherited/appended component identities and source files, plus
   the complete current message hash/byte count. Pass the actual inherited prefix
   at the named point, not every available package. `briefingAdditionKey` supplies
   an idempotent revision/section/byte identity for recorded updates.

`TaskEnvironment` requires explicit projectRoot, workingDirectory, candidate,
snapshot, limits, availableTools, views, supportPaths and cucumberConfiguration.
Candidate/snapshot/config may be null where unavailable; review requires current
candidate and snapshot. Every supplied view names its real path, revision (or
null), module identities and coverage reasons. An unavailable view is omitted
with its limit retained in the briefing, never an invented directory. Copy these
inputs from captured configuration/evidence; the builder does not rediscover them.

## Renderer migration table for 8–10

The independent expected fixture table in `plan23-task-prompts.test.ts` names 36
role/task/tool combinations covering all 12 Roles and both workflow packages.

| Existing entry point / role | Task kind | Current submission |
| --- | --- | --- |
| renderInitialArchitectPrompt | initial-analysis | submit_initial_analysis |
| renderExtractionPrompt | intake / principles / check | submit_intake / submit_principle_elements / submit_catalog_check |
| renderGlobalForkPrompt | placement | submit_placement_decision |
| renderLocalArchitectPrompt | assignment / completion / repair / qualification | submit_work_item_result |
| renderWorkOrientationPrompt | orientation | submit_work_orientation |
| renderContextSelectorPrompt | selection / reselection | submit_context_selection |
| renderCapabilityArchitectPrompt | capability | submit_capability_action |
| renderEngineerPrompt, ordinary/capability/standalone session | engineering / repair / qualification / standalone-command | submit_iteration_result |
| renderContractPrompt | contract | submit_contract_result |
| renderReconciliationPrompt, local/capability architect | reconciliation | submit_reconciliation |
| renderReviewerPrompt | code / scope / design | submit_review |
| renderOrientationPrompt | design-orientation | submit_orientation |
| renderFailureAnalystPrompt | failure-analysis | submit_failure_analysis |
| renderNonfunctionalCoordinatorPrompt | assessment / action / investigation | submit_nonfunctional_assessment / submit_nonfunctional_action / submit_nonfunctional_investigation |
| renderNonfunctionalRepairPrompt | repair | submit_nonfunctional_repair |

Existing render functions remain compilable transitional composites. Their
system/task concatenation must not be reused as a new preserving head; consumers
must migrate to `buildTaskPacket`. Optional explicit orientation goal/requirements
inputs extend `workOrientationMessage` without breaking its old callers. The
existing capability submission owner has no exported tool-name constant, so its
established literal remains.

## Executed verification

From worktree `ramify-agent/`:

```sh
npm ci
npm run test:quick -- subs/harness/src/tests/plan23-task-prompts.test.ts subs/harness/src/tests/engineer-briefing.test.ts --maxWorkers=2
npm run type-check
npm run check:self
```

- Focused ordinary checks passed **2 files / 54 tests**, including **49 new cases**
  and 5 existing engineer-briefing regressions. The new cases include 36 independently
  authored role/task/tool pairs, full schema counting over decoded model-visible
  declarations, exact G1/R1/K1→R2/replay/fork controls, unchanged literal requirements,
  same-role bytes, on-disk unused skill additions/changes, missing inputs, JSON/code
  braces, coverage bounds and current snapshot review grounds.
- Type-check passed all four compiler scopes.
- Structural check passed: 12 owners, 646 source files, zero errors/warnings;
  coverage remains partial with 313 analysis limits, never complete coverage.
- Guarded final focused receipts have zero native launches and zero refused
  launches; exact cwd/file/time receipts are retained outside analyzed source.
- `git diff --check` and exact changed-path/write-set comparison passed.
- Logs: `/tmp/ramify-plan23-iteration02/{focused,type-check,check-self}.log`;
  guard receipt selection: `/tmp/ramify-plan23-iteration02/process-receipts.json`.
- During test authoring, counting raw JSON-escaped declaration bytes as decoded
  schema text and expecting object-only schema roots failed; corrected controls
  count the actual decoded provider declaration and accept valid union schemas.
  A readonly matcher type error was corrected with a mutable copy. Final checks
  above pass; no failure was skipped or weakened.

No direct full suite, full audit, native launch, live transport, performance
comparison or remote push was run. The accepted iteration 0 native materializer
DataView failure remains qualification debt for iteration 14. Runtime integration,
current policy/handler activation, preserved outgoing prefix and actual transport
acceptance remain their assigned consumers/witnesses, not claims of these pure
provider tests. No foreign API was invented; all new imports remain same-owner.

## Exact changed paths

- `ramify-agent/subs/harness/src/analysis/catalog-extractor.system.md`
- `ramify-agent/subs/harness/src/analysis/check.procedure.md`
- `ramify-agent/subs/harness/src/context-selection/orientation.procedure.md`
- `ramify-agent/subs/harness/src/context-selection/prompts.ts`
- `ramify-agent/subs/harness/src/nonfunctional/assessment.procedure.md`
- `ramify-agent/subs/harness/src/nonfunctional/coordinator.system.md`
- `ramify-agent/subs/harness/src/nonfunctional/prompts.ts`
- `ramify-agent/subs/harness/src/nonfunctional/repair.procedure.md`
- `ramify-agent/subs/harness/src/nonfunctional/repair.system.md`
- `ramify-agent/subs/harness/src/prompts/briefings.ts`
- `ramify-agent/subs/harness/src/prompts/capability-architect.system.md`
- `ramify-agent/subs/harness/src/prompts/code-review.procedure.md`
- `ramify-agent/subs/harness/src/prompts/contract-engineer.system.md`
- `ramify-agent/subs/harness/src/prompts/delivered-manifest.ts`
- `ramify-agent/subs/harness/src/prompts/design-review.procedure.md`
- `ramify-agent/subs/harness/src/prompts/engineer-capability.system.md`
- `ramify-agent/subs/harness/src/prompts/engineer.system.md`
- `ramify-agent/subs/harness/src/prompts/failure-analyst.system.md`
- `ramify-agent/subs/harness/src/prompts/global-fork.system.md`
- `ramify-agent/subs/harness/src/prompts/initial-analysis.procedure.md`
- `ramify-agent/subs/harness/src/prompts/initial-architect.system.md`
- `ramify-agent/subs/harness/src/prompts/local-architect-capability.procedure.md`
- `ramify-agent/subs/harness/src/prompts/local-architect.procedure.md`
- `ramify-agent/subs/harness/src/prompts/local-architect.system.md`
- `ramify-agent/subs/harness/src/prompts/packages.ts`
- `ramify-agent/subs/harness/src/prompts/reviewer-orientation.system.md`
- `ramify-agent/subs/harness/src/prompts/reviewer.system.md`
- `ramify-agent/subs/harness/src/prompts/scope-review.procedure.md`
- `ramify-agent/subs/harness/src/prompts/tasks.ts`
- `ramify-agent/subs/harness/src/tests/plan23-task-prompts.test.ts`
- `ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/02-results.md`

## Specialized task bindings added before runtime integration

Provider amendment `c74ecaa3177b12e993716a64eea41322f72d98db`, based on
`243ad4c39e0dd57359167c1e9c5741cb94586a3e`, changes only `prompts/tasks.ts`
and `tests/plan23-task-prompts.test.ts`. Inventory of actual runtime submission
names found three missing pairs: local/capability architect qualification and
engineer consultation. These now use explicit `capability-qualification` and
`consultation` task kinds. Qualification binds `submit_capability_qualification`
and the existing owner schema; consultation binds `answer_capability_consultation`
and requires `consultationSubmissionSchema` serialized from its caller's actual
validator. No schema fallback or parallel runtime schema was introduced.

Consumers must select these explicit kinds; consultation passes
`JSON.stringify(z.toJSONSchema(responseSchema))` from the runtime validator.
Stable role bytes, once-only full schema in the declaration, current tool
availability and immutable declaration conflict checks remain enforced. These
are provider controls; invocation wiring still belongs to iterations 8/9.

Integrated head `f16d47688331531e0dc53a7ee142107a055ed425`: two prompt/briefing
files passed 62 tests; three existing capability submission, consultation and
delegation files independently passed 24 tests. Type checks passed; structural
check passed with zero errors/warnings and 314 analysis limits. Logs are
`/tmp/ramify-plan23-integrated-specialized-packets-*.log`; worker handoff is
`/tmp/ramify-plan23-specialized-receipt.md`. No native/live or full audit claim
was made. All prior 36 role/task pairs and the three new pairs were exercised.
