# Iteration 10: nested verification, recovery and projections results

**Date:** 2026-10-08. **Status:** iteration 10 source qualified by the
`ramify-audit@0.7.2` normal audit of clean `8dc6068c`. It was requested as
ramify-partial (defaulted), executed as ramify-partial at chain depth 1 over
the failed full audit of `29215476`, and passed. The branch push awaits
coordinator review. **Entry source:** `8e09c2bf`
(clean). **Source commits** on `feat/plan21-project-boundary-adoption`:

- `c896bd7e983b43af0faf7c41545bf1a70ef80620` (tree
  `0f5f15e34c963a559a13569e1d712cd3d0cd4e6b`): verify the final gate
  through the nested configured audit;
- `de4cf76444cb38cbb22be7e8d7810ed71e2143ad` (tree
  `826d8ea86ff9465f35bda4be2830f17e9e1e591b`): show nested audit projects
  and post-write path dispositions;
- `0a025f5707f75d8df1faf1f6ff0bc7a7584166f9` (tree
  `b04efcb2f57ce082e7b5e6d8a3b1e6b6dbe18ad5`): follow the renamed CA08
  acceptance test in the union inventory (a Plan 22 citation, see below);
- `23744ddec76f807900cd00b13e3aafba3d7ba449` (tree
  `42d124da20754edad6c077e265f9c602a41b58e9`): add the Plan 21 nested
  projections Chromium witness;
- `292154763c95d5338405fad41c27dd06caefb914` (tree
  `2678959aec490040d60d3abdc6581c8498c4da40`): record the F4 and Chromium
  evidence;
- `8dc6068c96af393cacff12d7759bc366b9fcba9d` (tree
  `20abc0e5f6b86a5240ec62979387d69efd902d6e`): state the nested final audit
  in the policy and protocol fixtures, after the first audit. This is the
  final audited source.

This is intermediate Plan 21 qualification work, not production enablement.
The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. No provider capability was missing. Run policy stays `run-policy/7`;
no policy bump. No protected document was edited, nothing was pushed by the
implementation agent and iteration 11 was not started.

## Actual changes

**The final gate is one nested full request.** Only the `final` checkpoint
sets `audit.nested` (`checkpoint.ts`). `createConfiguredAudit` then passes
`nested: true` to the installed provider. `configuredProjectResult` maps
each `AuditResult.projects` entry into a `GateAuditProjectRecord`:

- the project's verdict, failures and status;
- whether this request ran it, reused an applicable earlier record or did
  not run it;
- its request id, audited commit, requested and executed mode, fallback
  reason and reuse;
- the report, run and tree refs, retrieval commands, duration and check,
  test and scenario counts.

`GateAuditRecord` gains `nested`, `projects` (the root first) and
`discovery`: complete or indeterminate, each skipped definition with its
enclosing project, reason and directory, and each undecided enclosing
project. The gate verdict follows `invocationVerdict`:

- `fail` is `failed`/`check-failed`;
- `indeterminate` (undecided discovery, or a project not run) is
  `not-verified`/`infrastructure`.

The root's own pass therefore cannot hide a nested failure or an unrun
project. `nestedInvocationRefusal` refuses a nested answer if:

- it lacks the root, or lists a project twice;
- a project has a foreign commit or no applicable record;
- the invocation verdict disagrees with its projects and discovery;
- it is a partial answer to a full request.

Final verification adds no per-scenario or file-matching condition: the
provider's configured checks decide.

**Recovery by durable identities.** After a fresh nested answer the audit
child writes an invocation receipt (`ramify-agent.audit-invocation/1`,
`gates/<attempt>/audit-invocation.json`). It names each project's request
id, provider run id and record (`requestId`, `sourceCommit`,
`reportCommit`, `runRef`, `treeRef`), or why the project has none. On
restart, `recoverCompletedAuditAnswer`:

- **With a receipt:** retrieves each project's record through
  `findCompletedAuditRequest` and verifies it against the receipt. A
  mismatched receipt is refused. Nothing executes.
- **Without a receipt:** asks the provider again. It answers every
  published project by reuse, again with no execution.

A cancelled invocation keeps no receipt, so a replacement asks again. The
provider reuses the published root and engine records and runs only the
cancelled project. Lease, workspace ownership and process settlement are
unchanged from iteration 9's audit workspace recovery. Recovery never reruns
an audit to rebuild a view field.

**Merge readiness.** `MergeReadinessInput.finalGate.audit`
(`FinalAuditFacts`) carries the final gate's mode, nested flag, status,
executed mode, verdict, discovery and per-project status. Readiness reports:

- `gate-failed` naming the failing projects for a composed failure;
- `unavailable` with the gap for anything short of a full, nested, completed
  and fully executed pass. Gaps include a partial or run-local pass,
  undecided discovery and a project that was not completed, was not a pass
  or was not executed in full.

**Projections, without web-side recomputation.** The run protocol's
`GateView.audit` gains `nested`, `projects` (`gateAuditProjectViewSchema`)
and `discovery` (`gateAuditDiscoveryViewSchema`). `projections/work.ts`
copies the recorded facts. The execution map's gate audit gains
`indeterminate`. The failed-gate digest that continues the engineer session
(`checks/diagnostics.ts`) lists:

- each project's verdict, execution, mode, counts and duration;
- for a project that did not pass, its failures and a retrieval command;
- each skipped or undecided definition.

The web shows the same facts:

- **Run page:** the invocation verdict, an "Audited projects" list
  (verdict, execution, mode, counts, duration, reuse, failures, report and
  run refs, retrieval details), and "Nested discovery" with skipped and
  undecided definitions.
- **Execution-map gate detail:** the invocation verdict over N projects and
  the project and skipped lists.
- **Transcript post-write check** (iteration 4's dispositions): the badge
  reads "project passed" or the project verdict, with the provider schema
  and revision. A "Path dispositions" list shows each named path. A
  not-analyzed path names its nested tree, kind and owner and never shows a
  passing label.

**Documentation.** The audit child, harness and web READMEs describe the
nested final request, its receipt and recovery, merge readiness and the
projections.

**Scenario list layout.** The browser witness showed the iteration 6
scenario table at the 52rem text width, breaking ids, state badges and
headings mid-word at desktop. It now uses the broad area, keeps ids, states
and headings whole and breaks only paths anywhere. A narrow layout restores
breaking for all columns except the state badge.

## Protocol changes

| Contract | Change |
| --- | --- |
| `ConfiguredAuditInput` | `nested?: boolean` |
| `ConfiguredAuditResult` | `nested`, `projects: ConfiguredProjectResult[] \| null`, `discovery: ConfiguredNestedDiscovery \| null` |
| `GateRequest.audit` | `nested?: boolean` (final checkpoint only) |
| `GateAuditRecord` (`gate-attempt/3`) | required `nested`, `projects`, `discovery`; `verdict` is the invocation verdict for a nested request |
| `AuditInvocationReceipt` | new `ramify-agent.audit-invocation/1` |
| `GateView.audit` | `nested`, `projects`, `discovery` |
| Execution map gate `audit` | adds `indeterminate` |
| `MergeReadinessInput.finalGate` | `audit: FinalAuditFacts \| null` |

`subs/audit/module.ramify` exposes `AuditInvocationReceipt`,
`AuditInvocationProject`, `ConfiguredProjectResult`,
`ConfiguredCountBucket` and `ConfiguredNestedDiscovery` to the parent; they
are signature companions of already exposed symbols.

## Acceptance mapping

| Case | Evidence |
| --- | --- |
| PB3-E05 | `project-boundary-audit.integration.test.ts`, F4 with the installed provider ([evidence](../evidence/iteration10-f4/iteration10-f4-nested-final.json)). F4 is a Ramify root declaring `owned-unwired "docs"`, `owned-nested-project "engine"` and `external "vendor"`. Its projects are `.`, `engine` (a non-Ramify project) and the grandchild `engine/tools`; `vendor/lib/ramify-audit.json` is skipped with reason `external` beneath `vendor` of `.`. The failing commit gives `ga-0001` `failed`/`check-failed` over a passing root. The invocation is `fail`, failing `engine/tools`, whose `summary.json` is read from its own run ref. The repaired commit passes. A change under `engine/docs` reuses `engine`'s record (`ignoredChangedPaths: ['engine/docs/notes.md']`) and runs the rest. An invalid root `module.ramify` makes discovery `indeterminate`: the root alone passes, but the gate is `not-verified`/`infrastructure` ([evidence](../evidence/iteration10-f4/iteration10-f4-indeterminate-discovery.json)). |
| PB3-E06 | F4 recovery ([evidence](../evidence/iteration10-f4/iteration10-f4-recovery.json)): with the receipt, recovery returns identical project results and records with no execution (counters unchanged); without it, every project is answered `reused`, again with no execution; a mismatched receipt is refused. Cancellation ([evidence](../evidence/iteration10-f4/iteration10-f4-cancellation.json)): the test holds `engine/tools` in a live process (`heldProcess`) and aborts. The answer is `completed`/`indeterminate` with `engine/tools` `cancelled`/`not-run`, the gate is `not-verified`, the held process has exited and the audit workspaces are removed. No receipt is written. The replacement reuses root and engine and runs only `engine/tools` (executions: root 1, engine 1, engine/tools 2, vendor/lib 0). `audit-workspace-recovery.test.ts` (F5 durable restart, [evidence](../evidence/iteration10-f4/iteration10-nested-restart.json)): a killed service's nested answer is recovered equal from the receipt, then all `reused` without it; the nested command counter stays 1. `completed-audit.test.ts`: 6 refusal and mapping tests. |
| PB3-E07 | Briefs: `gate-diagnostics.test.ts` asserts the exact per-project lines of the failed-gate digest that continues the engineer. API: the F4 test projects each attempt through `runView`/`gateOf`, and the Chromium runner parses every exported view with the protocol's `gateViewSchema`. Browser: the PB3-E07 tests in `run-page.test.tsx`, `execution-map.test.tsx` and `session-page.test.tsx`. The Chromium witness `plan21-projections.ts` ([results](../evidence/iteration10-browser/iteration10-browser-results.json)) ran 33 checks at 1440x900 and 480x700 on the run projection of real F4 attempts ([fixture](../evidence/iteration10-browser/plan21-gate-views.json), SHA-256 recorded): failing, reused and cancelled final gates with each project's verdict, execution, failure and report, the skipped external definition, and no sideways scroll; the scenario three states; the capability task repair and handback pages; and the transcript dispositions with no passing label on not-analyzed paths. |
| PB3-E08 | `merge-readiness.test.ts`: a completed full nested pass is `ready`; twelve final audits short of it are each `unavailable` ("no applicable full nested audit pass"): none recorded, mode `project-default`, not nested, executed `ramify-partial`, `refused`, an `indeterminate` verdict, undecided or absent discovery, no or empty projects, an `indeterminate` project and a project executed `ramify-partial`. A composed failure is `gate-failed` naming `packages/engine` even when the run-local verdict passed. `completed-audit.test.ts` refuses a partial nested answer to a full request; F4 `ga-0001` fails over a passing root. |

## Focused verification

All commands ran from `ramify-agent/` with explicit files. No `npm test` or
unrestricted `vitest run` was used.

- New and extended harness and audit tests:
  - `project-boundary-audit.integration` (4) with
    `audit-workspace-recovery` (7): 11/11;
  - `merge-readiness`, `gate-diagnostics`, `execution-map-projection` and
    `completed-audit` (16) passed;
  - after the citation fix, `composition` passed 11/11.
  - after the first audit, `protocol-contract` and `run-policy` passed
    2 files and 50 tests.
- Neighbouring harness suites passed: accepted-commit, accepted-boundary,
  acceptance-trial, audit-check-execution, capability-recovery,
  check-findings, fixture-trials (opt-in skip), gate-progress,
  integration-scenarios, iteration-gate-integration, iterations-integration,
  nonfunctional, plan13-composed, readiness, review-stop, run, run-git,
  run-projections, run-protocol, run-recovery, scenario-projections,
  scenario-states, test-lock, union-values and work-items.
- Web, after the layout change: `run-page`, `session-page`,
  `execution-map` and `capability-tasks` passed 4 files and 84 tests.
- `npm run type-check` exited 0 for all four compiler configurations.
- `npm run check:self` passed with 0 errors, 0 warnings and 313 nonblocking
  analysis limits over 12 owners, 581 source files, 48 resources and 11,464
  accesses (8,566 allowed, 0 denied).

## Browser acceptance

The existing tooling ran on committed source `23744dde`, clean
(`dirtyAtStart: false`):

- `npm run test:browser:plan21-projections`: 33 checks passed. Desktop and
  narrow screenshots of the failing, reused and cancelled final gates, the
  scenarios, both capability task stages and the transcript dispositions
  are in [iteration10-browser](../evidence/iteration10-browser/).
- `BROWSER_ACCEPTANCE_ARTIFACTS=…/iteration10-browser/execution-map npm run
  test:browser:execution-map`: 47 checks passed
  ([results](../evidence/iteration10-browser/execution-map/browser-results.json)),
  leaving Plan 11's evidence untouched. Iteration 9 had edited `run.ts`
  without running it. One check's premise had expired: it expected more than
  five historical audit gaps in the durable scripted run, which iteration
  9's configured audit delivery removed. The run now has exactly one gap,
  which the check names (see limitations). The many-gap collapse remains
  covered by `execution-map.test.tsx`'s fourteen-gap fixture.

## Delivery audit

From the repository root, on clean committed heads:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Source | Window (UTC) | Requested mode | Executed mode | Result |
| --- | --- | --- | --- | --- |
| `29215476` | 05:20:25–05:25:55 | ramify-partial (defaulted) | full (`preparation-input: package.json`) | **fail**: 2 tests in 2 files |
| `8dc6068c` | 05:27:24–05:32:11 | ramify-partial (defaulted) | ramify-partial, chain depth 1 | **pass**: 210/211 files, 0 failed |

- **First audit, a defect of this iteration.** The new
  `test:browser:plan21-projections` script changed `package.json`, a
  preparation input, so the provider ran a full audit (329.6 s; 248 of 251
  files passed and 1 skipped). Two fixtures this iteration had not updated
  failed ([projection](../evidence/iteration10-audit/delivery-audit-1-failed.json)):
  - `run-policy.test.ts`: the checkpoint policy table lacked the final
    gate's `nested` flag;
  - `protocol-contract.test.ts`: the gate view fixture lacked the required
    `nested`, `projects` and `discovery`.

  `8dc6068c` states the new behaviour in both. The protocol test now also
  parses a nested gate view and refuses an unknown project execution or
  skip reason. No test was weakened.
- **Second audit.** The projection is
  [delivery-audit.json](../evidence/iteration10-audit/delivery-audit.json).
  The raw JSON is `/tmp/pb3-it10-audit.json`, with its SHA-256 recorded
  there.
- **Run.** The audit took 286.4 s and the CLI exited 0, with status
  `completed` and `overall: pass`.
- **Identifiers.** Request `6ae65f53-db77-42f0-abbb-93886e8c9a1d`, run
  `2f756666-0ac4-4176-8707-779503028b49`, report
  `c426daa11636dda4b1dc59ec21c445fcc58a8f5b`. The chain root is report
  `6c3360546fd9bcb3983601aa84ef3a06909d8199`, the full audit of `29215476`.
- **Selection.** Scoped over the modules `.`, `subs/harness`,
  `subs/harness/subs/agent/subs/pi`, `subs/harness/subs/audit` and
  `subs/web`. All six checks were selected and none omitted. The two
  carried failures were rerun and pass, so the composition has 0
  outstanding failures.
- **Checks.** All six passed: agent-scenarios (0 scenarios), agent-structure
  (17.4 s), agent-tests (249.9 s), agent-typecheck (5.7 s), agent-web-build
  (0.6 s) and patch-integrity.
- **Expected files.** 211 expected and 211 run (`partial-answer`):
  `complete`.
- **Counts.** Files: 210 passed, 0 failed and 1 skipped (the opt-in
  `fixture-trials`). Tests: 1,622 passed, 0 failed and 2 skipped.
- **Ledger.** The failure ledger is complete.
- **Run conditions.** Lock wait was 0 s. There was no cancellation, and
  stderr was empty.
- **Flakes.** None was observed.

## Deviations and limitations

- **Readiness stays non-nested.** Only the final checkpoint requests a
  nested audit. Readiness requests a full root audit, as in iteration 9. The
  coordinator should confirm this reading of contract 12, or schedule nested
  readiness.
- **Receipt window.** The receipt is written after the provider answers and
  before the gate attempt completes. A crash between the provider's
  publication and the receipt write leaves no receipt; recovery then asks
  the provider again, which reuses every published project without
  execution (witnessed above), so no result is lost.
- **Gate records under `run-policy/7`.** `gate-attempt/3` now requires
  `nested`, `projects` and `discovery`. Gate records written by iteration 9
  code do not parse. With no policy bump (as instructed), a run started
  before this iteration must be restarted; Plan 21 runs are qualification
  runs only.
- **Readiness gate audit gap (pre-existing).** In the durable scripted
  acceptance run, readiness gate `ga-0001` publishes evidence but has no
  retained audit outcome. The execution map then lists "Audit result for
  gate ga-0001 is unavailable", even though it projects readiness audits as
  `not-applicable`. The gap is identical at entry `8e09c2bf` (checked in a
  temporary worktree) and is outside iteration 10's scope. `run.ts` now
  names it rather than the expired many-gap premise.
- **Static browser fixtures.** The gate views in the Chromium witness are
  real F4 projections. The scenario list, capability tasks and transcript
  entries come from the web tests' schema-checked protocol fixtures. F5
  end-to-end browser coverage of a scripted run with nested final gates is
  iteration 11's.
- **Narrow scenario table.** At 480px the six-column scenario table still
  breaks words within columns. It fits without sideways scroll and keeps
  state badges whole. A card layout for narrow widths would be a later web
  change.
- **Plan 22 citation fix (`0a025f57`).** Plan 22's `18b7eccf` renamed
  "CA08 … real multi-owner migration…" to "…scripted multi-owner
  migration…" in `capability-acceptance.integration.test.ts`. It did not
  update the four citations in `composition.test.ts`, so the union
  inventory failed on this branch regardless of iteration 10. The separate
  commit changes only the cited title. The coordinator may drop it if Plan
  22 lands the same fix.
- **Evidence production.** Witness evidence is written by the committed
  tests when `PLAN21_ITERATION10_EVIDENCE` names a directory. The Chromium
  runner exports its own F4 views unless `PLAN21_ITERATION10_GATE_VIEWS`
  names a directory. Commit IDs are those of temporary repositories.
- **Concurrent Plan 22 commits.** During this iteration, these commits not
  made by it landed on the branch in this worktree:
  - `84651baa`, the merge `3d69f923` and `fd9bd91f`;
  - `18b7eccf`, `72bb060d` and `1f2785f5`;
  - `5a1ec03c`, the merge `b8b3e055` and `afcd2e2c`;
  - `743a25f9`, `c8510cc8`, `e050f968` and the merge `bf1261cb`, all
    before the audited source;
  - `19c9c3cf`, during the first audit;
  - `5fd5c55c`, the merge `aec0c056`, `cf6a83e1` and the merge
    `cf813618`, between the two audits and so inside the audited source.
    They script the write guard ownership tests and retarget three
    `composition.test.ts` citations to `write-guard.boundary.test.ts`;
  - `68cde9ec` and `556e0817`, documentation after the audit.

  Only `service.ts` and `composition.test.ts` overlap this iteration's
  files: Plan 22 added `provisionalSourceGit` and the retargeted
  citations, and this iteration's own lines sit beside them. The audit
  qualifies `8dc6068c`, which includes those Plan 22 commits.
- This receipt commit is documentation only. The audit checked source
  `8dc6068c`, not the receipt commit.

## Protected-file comparison

The baseline taken at entry `8e09c2bf` lists the 16 tracked
`.principles.md`/`.spec.md` files, which is exactly the tracked set at
`8dc6068c`. All 16 match the baseline:

- in the worktree (`sha256sum -c`);
- in the index;
- at the audited source, whose blobs equal the entry's.

No protected path is staged, unstaged, untracked or renamed, and none
changed in any commit since entry. No protected document needed a patch.
The two pending authorized `harness.spec.md` patches remain the
coordinator's and were not applied.

## Next-iteration prerequisites

Iteration 11 (integration acceptance) may start after the coordinator:

- reviews this receipt and decides on the readiness and citation items
  above;
- applies or schedules the pending `harness.spec.md` patches;
- pushes the branch, verifying
  `HEAD == origin/feat/plan21-project-boundary-adoption` on the live remote.

It builds on `run-policy/7`, the exact `ramify.ts` 0.4.1 / `ramify-audit`
0.7.2 pair and the nested contract above. Its F5 browser runs can reuse
`plan21-projections.ts`'s gate checks.
