# Iteration 6 production acceptance evidence

**Status:** implementation committed and the fourth full source audit passed
on `4d95dad9`. The one fresh production Pi run failed readiness before any
engineer, capability task or implementation gate. Live delivery, full Plan 18
acceptance and destination delivery remain open. No retry was started.

## Frozen inputs

| Input | Identity and boundary |
| --- | --- |
| Consumer source | Launched from `4d95dad9a231dc3561dbe26c46f383504ae40acc`, tree `e4134a7cc019deb8e2a64f0b69c6846687d012af`. Three earlier audit candidates `e3779ed0`, `35937a46` and `6c3cc3aa` failed and remain separate evidence; the fourth changes the exact-review replay test oracle after the third. |
| Audit provider | Exact consumer pin `ramify-audit@0.3.2`; provider release source `3cb7acf248f0efa183dc67dcb71104a4a37f76a1`. |
| Trial target | Fresh isolated `/tmp/ramify-plan18-realpi-target`, detached at accepted base `91c3b74e38a619ae7ed5d2ff3b68e200f0ce1dc6`; clean before launch. |
| Captured plan | `plans/plan16-bounded-denials/plan.md` SHA-256 `064998244f903b32e368fc28b3126476e8b3f0fe858d66224a7ea7fbbf7a01fd`. |
| Model and entry point | Started once: `npm run real-session -- --project /tmp/ramify-plan18-realpi-target --plan plan16-bounded-denials --model openai-codex/gpt-6-sol:medium`, from the frozen consumer checkout. Run `20260929T171702Z-f54367`; live origin `http://127.0.0.1:42391/`; log `/tmp/plan18-realpi-20260929T171634Z.log`. |

The target had its own installed root, example, site and nested agent
dependencies. Its toolkit build completed after those installs. The
test-running nested agent fixture was missed during external preparation,
and the nested agent install lacked its `node_modules/.bin/ramify` launcher.
Before launch, the installed root CLI
materialized the architect view and only CLI's ordinary and testing API views:
`dist/src/ramify materialize --view architect --view api --from subs/cli --root .`
reported revision 1, three targets, 2,336 entries and zero unchanged entries.
`subs/cli/src/.ramify` and `subs/cli/src/tests/.ramify` exist;
`subs/analysis/` and its Model child have no `.ramify` directory. The owned
preparation daemon stopped. These are setup observations, not SI16 live evidence.

## Source audit and controlled evidence

| Boundary | Result | Evidence to bind before acceptance |
| --- | --- | --- |
| First consumer source audit | Audit of `e3779ed0` failed: 4 of 5 checks passed; test check failed after 817.885 seconds with 1,928 passed, 16 failed and 7 skipped tests across 239 passed, 7 failed and 2 skipped files. | Run `c97a571e-863d-4022-8ae9-b5bd6b2a0dbf`, report `0a2dc20a2e52f1d3e6df98a18a08c8fd75ac45eb`, ref `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-09-29T16-03-17Z-e3779ed01`; retrieve its durable summary with `git show <ref>:reports/audit/summary.json`. Full local result `/tmp/plan18-full-audit-1.json`. Type-check, Ramify structure, web build and patch checks passed. Later revisions are not certified by this run. |
| Second frozen source audit | Failed on `35937a46`: test suite exceeded its 900-second bound (923.412 seconds total); four other checks passed. The provider's runner error has no terminal test counts or Vitest summary. A capability fixture was active near cutoff, but completed/total acceptance counts are unknown. Partial stdout also records ordinary test failures, so the timeout is not the only issue. | Report `ff6f33c154ffcbc22bb7baa1a27b2ae3bdeffdc7`, ref `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-09-29T16-36-32Z-35937a46d`; local result `/tmp/plan18-full-audit-2.json` and `/tmp/plan18-full-audit-2.stderr`. The configured suite bound is 20 minutes only after `0f1ee758`; that change does not repair the recorded ordinary failures. |
| Third frozen source audit | Failed on `6c3cc3aa`: 1,945 tests passed, one CF06/CF07 prefix-recovery assertion failed, seven skipped, 1,953 total. All twelve capability acceptance cases and four other configured checks passed. | Report `238fd65291077639a1ec508cca8e15fb7276dc8b`, ref `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-09-29T16-57-21Z-6c3cc3aac`; local result `/tmp/plan18-full-audit-3.json`, stderr and `/tmp/plan18-full-audit-3-tests.log`. The old assertion disallowed findings recovered from an already accepted reviewer submission. Test-only commit `4d95dad9` requires the recovered attempt and findings to match the original exactly; the fourth audit verifies that correction. |
| Fourth frozen source audit | Passed all five checks on `4d95dad9`: 1,946 tests passed, none failed, seven skipped of 1,953; 246 files passed, two skipped of 248; 798.348 seconds total. All twelve capability acceptance cases passed in this audit. | Report `17b0c76b1ef17168778e27f2b9993a33f36311be`, ref `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-09-29T17-15-30Z-4d95dad9a`; local result `/tmp/plan18-full-audit-4.json` and `/tmp/plan18-full-audit-4-tests.log`. This is source audit evidence, not live Pi acceptance. |
| Real provider conformance | Provider source audit passed; combined case reconciliation pending. | Provider `0.3.2` source `3cb7acf2` passed its own audit, ref `refs/audited/runs/2026-09-29T15-35-50Z-3cb7acf24`, report `8754c97c4453b3c5ab4f48f0255a9c10b3c1e00a`. Reconcile every declared mode/configuration, retained report and raw artifact with the consumer source. Prior [iteration 2](iteration2-results.md) reports focused integration evidence. |
| Common lifecycle and API preparation | Controlled source tests passed in the `4d95dad9` audit; live dispatch unobserved. | The twelve capability acceptance cases passed in the full audit. Prior [iteration 5](iteration5-results.md) reports focused cold-view and projection tests. No engineer was dispatched in the live run. |
| Served browser and historical inspection | Terminal historical state observed; other live states unobserved. | A no-agent server reread version 51 at 17:35:58 UTC with no page/network errors and was then stopped. [Browser capture](/tmp/plan18-realpi-browser-verified/browser.json) and overview/checks/capability-task screenshots are under the same directory. It correctly showed failed readiness, zero completed work items, five pending scenarios and no capability request. Repair and handback states did not occur. |

## Single real-Pi witness

Run `20260929T171702Z-f54367` started at 17:17:02.193 UTC from audited
runtime `4d95dad9` with provider `0.3.2` and ended failed at
17:32:29.976 UTC (15 minutes 27.783 seconds wall time). `real-session`
exited 1. The eleven Pi invocations were ten catalog extractors and one
initial architect; all submitted, for 480.738 seconds summed invocation time.
Recorded usage totaled 139,433 input, 20,997 output, 108,288 cache-read and
268,718 total tokens; the largest recorded context was 32,614 tokens in
initial architect `inv-0006`. One catalog submission in `inv-0011` was
rejected for an invalid correction action and omitted required arrays, then
corrected and applied. The second readiness attempt executed nine configured
commands (eight passed, the nested agent test command failed). There were two
readiness attempts, zero implementation gate attempts, zero engineer
invocations, zero candidate commits and zero completed work items. Five
scenarios remained pending. These counts come from the durable ledger,
invocation outcomes and `gates/ga-0002/attempt.json`, not from the passing
source audit. Peak OS process count was not measured.

The initial analysis was accepted with one entry capability, five hypotheses
and one work item. Readiness attempt 1 then failed at `nested-packages` because
the prepared target lacked `ramify-agent/fixtures/collection-review/node_modules`,
a test-running nested fixture omitted from the external dependency install.
The no-test module-tree fixture was also named but did not require installation.
The harness automatically began readiness attempt 2 (`ga-0002`), with the
missing test-running fixture now installed. Its root `npm test` passed in
167.337 seconds; example and fixture tests, type-check, Ramify check and both
scenario commands also passed. The nested `ramify-agent` `npm test` failed:
13 failed, 1,807 passed, seven skipped of 1,827 tests across eight failed,
220 passed and two skipped files. The installed nested package's
`node_modules/.bin/ramify` link was absent, although the target root's
`dist/src/ramify` launcher existed. Direct failures show `spawn .../.bin/ramify
ENOENT`; others are downstream unavailable or not-checked assertions. The
external preparation installed the nested package before building the root,
which likely explains the missing generated link. This is a trial setup
failure at the test command boundary, not a Pi submission failure or evidence
of a defect in the audited Plan 18 runtime. A later trial preparation should
build the root before installing file-dependent nested packages, verify the
nested launcher and install every test-running nested fixture before launch.

The first failure remains in `readiness/01/attempt.json`; the second and its
provider payload are in `readiness/02/attempt.json` and
`gates/ga-0002/attempt.json`. The complete nested failure output was extracted
to `/tmp/plan18-realpi-nested-agent-output.txt`. No external target edit or
second Pi start followed the first launch.

Check the following observations against the run's durable records, not only
against the console summary:

| Observation | Required evidence | Status |
| --- | --- | --- |
| Cold API preparation | Analysis and Model ordinary/testing `src/.ramify` metadata exist before their first engineer model request; prompts name actual paths, revision and coverage; received-symbol searches succeed in the correct source area. | Not observed: no engineer request occurred. Both areas remained cold at terminal. |
| Shared engineer lifecycle | A's original iteration suspends; provider B and compatibility D/P receive scoped assignments; each completion has its own candidate, gate, commit, result and reviews. Partial results remain partial. | Not observed: no implementation assignment or gate occurred. |
| Producer diagnostics and repair | Multiple independent failures, including a misleading test-owner location, are retained in full provider artifacts and delivered to the fixing engineer; focused repair and a new required audit occur without a harness-selected owner or scope probe. | Not observed: readiness failed before a fixing engineer existed. |
| Task verification and handback | Current combined gate/reviews verify actual use; `capabilities/cap-001/handback.json` and one `capability-handed-back` event precede A's continuation of its original assignment. Pending or zero-selected scenarios never count as passed. | Not observed: no capability request, review or handback occurred. |
| Failure attribution | Compare `events.jsonl`, `job.json`, `invocations/<id>/` outcomes/observations/submissions, `gates/<id>/attempt.json`, provider artifacts and process logs to identify a Pi, harness or provider boundary. | Observed at readiness: Pi submissions succeeded; nested command failed because the nested Ramify launcher was missing. |
| Target write accounting | Compare the exact accepted base to the final target; preserve the run's generated evidence separately. | Git HEAD stayed `91c3b74e`; `git diff --name-status` and `git ls-files --others --exclude-standard` were empty; status clean. `npm run trial -- verify` exited 2 because this clone has no helper-created `loop-trial-baseline.json`. |

## Acceptance ledger

The evidence named below maps the closest controlled tests and source paths
verified on the audited `4d95dad9` source, with earlier focused evidence
named where relevant. These controls passed their audit, but a live condition
is not satisfied by that fact. The one Pi run stopped before the engineer
boundary, so no row requiring implementation, repair or handback is marked
live passed. The remaining individual gaps are stated in each row.

| Case | Current status | Evidence boundary to complete |
| --- | --- | --- |
| SI01 | Controlled coverage passed in source audit; live behavior unobserved. | `capability-assignments`, `engineer-api-preparation` and scenario checks exercise common preparation; exact paired text/equipment/unavailable comparison still needs reconciliation. |
| SI02 | Controlled coverage passed in source audit; live behavior unobserved. | Capability acceptance and ordinary gate tests exercise the shared kind-derived gate, commit and closure path; live parity remains unobserved. |
| SI03 | Controlled coverage passed in source audit; live behavior unobserved. | Capability acceptance review correction and gate diagnostics exercise repair; failed-check parity combines separate cases. |
| SI04 | Controlled coverage passed in source audit; live behavior unobserved. | Capability assignment partial and recovery end/no-result cases preserve unfinished source; reconcile remaining causes. |
| SI05 | Controlled coverage passed in source audit; live behavior unobserved. | Delegation/recovery real-Git tests cover dirty categories and attribution; acceptance covers B/D/P/A, with the full combination split across cases. |
| SI06 | Controlled coverage passed in source audit; live behavior unobserved. | Capability submission and acceptance test corrected expectations and drift; provider configuration reuse parity remains to bind. |
| SI07 | Controlled coverage passed in source audit; live behavior unobserved. | Scenario-state and scenario-check tests cover binding, exact selection and zero selection; live scenario selection remains unobserved. |
| SI08 | Controlled coverage passed in source audit; live behavior unobserved. | Capability-dependencies tests exercise B-to-C and A return, including restart; live depth-first chain remains unobserved. |
| SI09 | Controlled coverage passed in source audit; live behavior unobserved. | `capability-assignments.test.ts:210-219` asserts B/D/P/A assignment order and task-owned sequence `[1,2,3,4]` while unrelated `wi-002` has not started; dependency/recovery tests preserve child and parent assignment identities across restart. |
| SI10 | Controlled coverage passed in source audit; live behavior unobserved. | Historical-resume and policy composition tests cover explicit incompatibility; external historical corpus not exercised. |
| SI11 | Controlled coverage passed; terminal served state only. | Task projection HTTP and component tests cover source-derived states; served real repair and artifact retrieval remain unobserved. |
| SI12 | Controlled coverage passed in source audit; live behavior unobserved. | `inspect_git` tests use a real repository and both-role wiring; actual Pi architect use remains unobserved. |
| SI13 | Controlled coverage passed in source audit; live behavior unobserved. | Recovery/delegation prompt and result wiring tests cover current artifacts; several-result relevance and repeated-body volume remain to measure. |
| SI14 | Controlled coverage identified; specific condition open. | Partial blocker prompts, gate diagnostics and reconciliation packets exist; a fresh session discovering blockers without history replay lacks a dedicated witness. |
| SI15 | Live not observed: readiness blocked before engineers. | Scripted acceptance/restart and production composition exist; real Pi handback, A continuation and separate controlled stop remain unobserved. |
| SI16 | Live not observed: readiness blocked before engineers. | Real-CLI `engineer-api-preparation.test.ts:45` starts Analysis/Model cold and verifies separate ordinary/testing paths, revision, coverage and received symbols; common `service.ts:8230` prepares before invocation. Production first live prompt/search remains unobserved. |
| SI17 | Controlled coverage identified; specific conditions open. | Real-CLI tests cover changed API, grandchild and broad scopes; production fresh/continued/reconstructed prompt/search still needs binding. |
| SI18 | Controlled coverage identified; specific conditions open. | Real-CLI tests cover failed refresh and missing area; partial coverage and every stale/no-view variant need binding. |
| AE01 | Real provider and consumer controls passed; live behavior unobserved. | Provider `vitest-reporter.test.ts:84,153` exercises native multi-failure counts, and consumer `audit-check-execution.test.ts:178` runs real provider/consumer files. A failing cross-module adapter assertion preserving every count is still open. |
| AE02 | Controlled coverage passed in source audit; live behavior unobserved. | `audit-check-execution.test.ts:293,380` compares exact audit/in-place planned commands and failure; `checks/checkpoint.ts:79-86` and `checks/execution.ts:174,195` show one dispatch path. Those assertions ran under the final audited source. |
| AE03 | Real provider and consumer chain coverage identified. | Provider partial-audit/composition-chain tests carry inherited failures; consumer `audit-check-execution.test.ts:178-252` covers full-to-partial-to-failed-to-docs. An inherited-only gate verdict is unasserted. |
| AE04 | Real provider and consumer coverage identified; integration pending. | Provider no-execution/reuse tests and consumer `audit-check-execution.test.ts:226-238` cover unselected null exit/zero bytes. Integrated reuse duration and report identity remain unasserted. |
| AE05 | Real provider and synthetic consumer coverage identified. | `gate-diagnostics.test.ts:90` relays huge plus second diagnostics; provider reporter tests preserve real multiple failures. Their exact combined huge/suite-load condition remains open. |
| AE06 | Real provider and synthetic consumer coverage identified. | Provider `vitest-reporter` and `cucumber-runner` malformed/interrupted cases plus consumer `gate-diagnostics.test.ts:90` preserve unknown counts/raw paths; full adapter variant matrix remains open. |
| AE07 | Controlled repair coverage passed; live behavior unobserved. | `iteration-gate-integration.test.ts:50` uses real local same-engineer repair; `gate-diagnostics.test.ts:161` delivers outside-location evidence. Explicit out-of-scope `capability-needed` handoff remains to bind. |
| AE08 | Live not observed: readiness blocked before engineers. | Structural source coverage exists; real misleading root failures and agent-owned diagnosis remain unobserved. |
| AE09 | Both scripted coordinator paths covered; live task repair unobserved. | Ordinary `work-items.test.ts:264` and capability `capability-acceptance.integration.test.ts:508` exercise failed task-completion gate feedback to their active architects. |
| AE10 | Real provider and consumer coverage identified; combined matrix pending. | Provider dirty Cucumber and unlocked focus tests, plus consumer `focused-audit-check.test.ts:11` and `single-session-integration.test.ts:74`, cover seams separately. Readiness/standalone provider source identity remains open. |
| AE11 | Real Cucumber and consumer controls passed; live behavior unobserved. | Provider Cucumber status/raw/registered tests and consumer `scenario-check.test.ts:337,348` cover frozen IDs; exact bridge raw-artifact association remains open. |
| AE12 | Controlled diagnostics coverage identified; real multi-diagnostic boundary pending. | `gate-diagnostics.test.ts:90,138` and `audit-check-execution.test.ts:326` cover full relay/exit-2 remap; several real type/Ramify diagnostics together remain open. |
| AE13 | Real provider/consumer process coverage identified; combined matrix pending. | Provider `machine-test-lock.test.ts:99,116,161,179,222,262,284` covers wait, focus bypass, cancellation and nested behavior; consumer `test-lock-bounds.test.ts:13,35,69` covers bounds. |
| AE14 | Adapter variant controls passed; live behavior unobserved. | `audit-check-execution.test.ts:439,555,607,652,680,701,725,747` covers nested audit, setup/refusal, remap and cleanup, with each condition in its own case. |
| AE15 | Strong local recovery witness identified; literal OS crash open. | `audit-check-execution.test.ts:348` deletes the acknowledgement receipt, then recovers the same exact report/checks with one workspace; it simulates lost acknowledgement without killing a process. |
| AE16 | Historical compatibility coverage identified; same-fixture combo open. | Composition old causes/schema, `capability-historical-resume.test.ts:11` incompatible resume and provider legacy reuse are covered; unchanged old file plus new run in one fixture remains open. |
| AE17 | Projection and agent controls passed; terminal served state only. | Web `run-page.test.tsx:624-647` checks exact commit/ref/bytes, and `gate-diagnostics.test.ts:90` retains full agent diagnostics; served same-report/artifact comparison remains open. |
| AE18 | Live not observed: readiness blocked before engineers. | Narrow local iteration-gate repair and accepted fixture exist; real multi-failure Pi repair, fresh required audit and completion remain unobserved. |

## Verdict and remaining boundaries

The audited source passed its required five-check gate, and the one live trial
failed readiness before implementation. SI15, SI16, AE08 and AE18 remain
unobserved live; the separate controlled stop required by SI15 was not run in
this one-run assignment. Other row-specific gaps remain as stated above. The
terminal browser proves only the failed, no-task state. No capability handback,
consumer continuation, repair or destination delivery is established. The
target and run records are retained for review; a future trial would require a
new authorization and a complete preflight of the nested toolchain.
