# Iteration 2: declared preparation and native readiness results

**Date:** 2026-10-07. **Status:** iteration 2 source qualified by the released
`ramify-audit@0.7.2` full execution of a normal partial request; branch push
awaits coordinator review. **Source commits:**
`7080d8099843e7ccf6aa2e100c485e6c1ae9036a` and
`50ab93a3875ae941a3d4cda32217b1db67d9cf8a` and
`cc875398981e7e7b4e0fdcf8c97e1376eb693220` and
`8b15ce532c1852b2ded73aeb4114f7f8f2f0f5fa` and
`fcd7d39544e6337522dd0f71d14f3571fd72e680` on
`feat/plan21-project-boundary-adoption`. The coordinator reviews the
qualified delivery; push is deferred until that review. This
iteration does not start iteration 3.

## Effective policy and migration

The audit child reads the committed project configuration through the installed
provider’s public `requestFromCommittedConfiguration` operation. Development
evidence used released `ramify-audit@0.7.1`; delivery now pins exact 0.7.2. The
captured record keeps the requested source commit, exact configuration blob and
path, normalized ignore/configuration policy, opaque check definitions, and
effective `nodejs` workspace preparation. Preparation retains ordered commands,
project-relative working directories, declared environment and timeouts. It
distinguishes omitted package directories (optional root dependency link) from
explicit directories (required installation), honors `linkNodeModules: false`,
and retains the provider's optional default root build when `setupCommands`
is omitted. Invalid or unsupported provider configuration remains an explicit
readiness failure; no checks execute during the read.

New-run policy no longer discovers nested manifests or imposes a depth limit.
Readiness validates the existing project, clean tree, scratch, compiler, agent
configuration and Ramify preflight in order. It then validates declared
installation and runs committed setup in the run working tree, before one
configured **full** provider audit of HEAD. Declared package directories do not
create checks. `ramify-agent.json` setup is reconciled once against committed
audit setup; a conflict refuses readiness before duplicate execution. A changed
captured audit blob/policy refuses reuse with a named cause. A completed result
qualifies only with full executed, unscoped, compatible configuration and check
identity; its original requested mode is retained, so provider-widened full
evidence can still qualify. Both requested and audited source commits and the
provider report/run/tree refs remain in the readiness record.

The native full request owns the same durable workspace intent, conservative
orphan recovery, cleanup and repository execution lease as the existing audit
child. A completed-request lookup acquires the lease and settles abandoned
workspaces before reuse. Provider waiting events keep the deadline paused until
all parallel command lock waits acquire or settle. Only the installed provider
executes configured checks or discovers expected tests. The harness records raw
provider evidence without fabricating command execution or semantic
implementation judgments. Missing discovery, provider failure, mismatched
recovered identity, preparation failure and cancellation stop readiness before
branch creation; environmental timeouts use bounded recovery.

Stopping a run aborts its owned readiness process and waits for confirmed
settlement before `job-stopped`. The cancelled attempt is written after
`stop-requested` and before the terminal event, with subsequent steps
`not-verified`; recovery and branch creation are suppressed. Closing the
service aborts readiness and waits for quiescence without publishing a
terminal event, preserving the existing close contract. A process-backed
native command cancellation witness confirms termination, paired intended/
cleaned workspace callbacks and no branch.

The provider process adapter in its isolated audit workspace binds each
declared environment to exact command argv and absolute project-relative cwd,
using the recorded audit workspace root. Local working-tree preparation uses
`runCommand` with `checkCommandEnvironment`. It retains narrowly named provider reporter/selection/lock environment
variables, including the 0.7.2 Vitest exclusion channel, and scrubs unrelated
inherited variables. An ambiguous declaration
or lost declared value refuses execution. Root audit configuration and declared package manifest/lock inputs join the
captured guarded-file inputs for candidate/configuration authorization checks;
explicit recorded authorization can still permit edits to these project-owned
files. Write interception separately enforces scope and harness-only denial. Captured policy changes cannot
silently mutate the active readiness run. The legacy scenario gate remains a
separate non-readiness adapter for iteration 9.

## Consumer and producer witnesses

The [F3 consumer test](../evidence/iteration0-public-fixtures/README.md)
replays committed A and B with distinct exact blobs and definitions while the
working file is malformed C. It checks read-only behavior, absent/invalid
committed definitions and unchanged refs. The [iteration 2 consumer bundle](../evidence/iteration2-consumer/README.md)
holds raw, replayable results and provider pin.

The [native readiness result](../evidence/iteration2-consumer/native-readiness.json)
uses the real installed public service through `runReadiness`: a deep declared
package with no test command prepares first; its deleted working output is
recreated even when the full provider result is reused. The unrelated nested
manifest creates no check. The committed config blob and both source
identities, fresh/reused full reports and refs are retained in the artifact.
This fixture's command has `parser: none`, so it proves native execution and
preparation ordering, not configured test discovery.

The separate [F2 full](../evidence/iteration2-consumer/f2-full.json) and
[normal partial](../evidence/iteration2-consumer/f2-partial.json) results are
direct released-CLI producer runs, replayable from
[f2.bundle](../evidence/iteration2-consumer/f2.bundle). The committed runner
selects custom `*.check.ts` files and excludes a deliberately failing default
`src/tests/excluded.test.ts`; the normal partial successor executes
`src/tests/new-root.check.ts`, omits the excluded default file, and records
3/3 configured expected/run files with complete scoped composition. The child
consumer test qualifies their exact source, mode, configuration and report
identities. These direct CLI results are distinct from the native readiness
fixture. The full source `34beebf9b477ad1a02f1f1e551b33d9da8a72b7b`
has 7/7 configured expected/run files, unscoped composition `pass`, and
report `3e893cef7785b98b206a28afdddbf10d3d3dfff9`. The normal partial
source `c93c956874af67329a275337a8f4b23c39b3eb86` has executed mode
`ramify-partial`, scoped composition `pass`, zero outstanding failures, and
report `2cb0d5032040e460651f51e994e28a0e93109b53`, rooted in that full
report. Both producer results use schema 4 and the same committed definition
digest.

**Acceptance mapping:** PB3-P01 has the public committed F3 A/B versus
malformed working C reader and exact blob/source refusal controls. PB3-P02
has deep/setup-only declared package, unrelated-manifest, missing-install,
failed-setup, bounded recovery and cancellation controls. PB3-P03 has the F2
direct producer custom-name/excluded-default discovery result; harness runtime
delivery of configured tests remains an iteration 9 case. PB3-P04 has root
audit and declared package input guards, active-run config conflict and
explicit authorization controls; whole included-tree authority and its
package configuration expansion remain iteration 3, and gate-wide audit
compatibility remains iteration 9. PB3-P05 has the real native full
fresh/reuse, deleted working-output recreation and source identities. Scripted
RunService controls establish lifecycle behavior, not provider conformance.

## Verification and delivery audit

The explicit focused Vitest run before the final environment hardening passed
13 files and skipped one optional file: 153 tests passed, two optional tests
skipped. The environment/cwd correction then passed all eight audit-child
tests, and the real native fresh/reuse readiness filter passed its one selected
test (14 others filtered, not passed). `npm run type-check` passed. An initial
`npm run check:self` exposed a missing named exposure for
`configuredFullRecovery`; after adding it, the final check passed with zero
errors/warnings and 319 nonblocking analysis limits. The original failure is
retained at `/tmp/ramify-plan21-iteration2-self-initial-failure.log`.
During cancellation hardening, an 18-test readiness file run passed 17 and
failed one **test assertion**: it expected `job-stopped` immediately after
`readiness-failed`, overlooking the existing `session-finished` event. The
ordered-event assertion was corrected and its selected stop control passed.
No production failure was hidden by that correction.
An intermediate type check failed because the public read result's `checks`
array is readonly and the new local variable was typed as the mutable Zod
record. The receiving type was corrected to the child-owned public read
shape; subsequent type checks passed.

Final focused commands from the `ramify-agent` package root:

```sh
./node_modules/.bin/vitest run subs/harness/subs/audit/src/tests/workspace-preparation.test.ts
PLAN21_NATIVE_READINESS_EVIDENCE=docs/plans/21-project-boundary-adoption/evidence/iteration2-consumer/native-readiness.json ./node_modules/.bin/vitest run subs/harness/src/tests/readiness.test.ts -t 'the installed provider runs full after local setup'
npm run type-check
npm run check:self
```

The final explicit 14-file focused command, also from the package root, is:

```sh
./node_modules/.bin/vitest run subs/harness/subs/audit/src/tests/workspace-preparation.test.ts subs/harness/src/tests/run-policy.test.ts subs/harness/src/tests/readiness.test.ts subs/harness/src/tests/readiness-nested-packages.test.ts subs/harness/src/tests/readiness-direct-recovery.test.ts subs/harness/src/tests/project-config.test.ts subs/harness/src/tests/write-guard.test.ts subs/harness/src/tests/scratch-setup.test.ts subs/harness/src/tests/scenario-check-integration.test.ts subs/harness/src/tests/fixture-acceptance.test.ts subs/harness/src/tests/run-recovery.test.ts subs/harness/src/tests/run.test.ts subs/harness/src/tests/run-protocol.test.ts subs/harness/src/tests/scenario-findings-run.test.ts
```

The broad run passed 13 files, with one optional file skipped: **170 passed
tests and two optional skipped tests**, zero failed. Its log is
`/tmp/ramify-plan21-iteration2-focused-final.log`. Its first attempt had 164
passed, two optional skipped and five failed assertions: one stale legacy
readiness-step list and four HTTP protocol fixture/read failures. The
protocol fixture now injects an explicitly scripted configured port, so its
no-external-process guard remains meaningful. The HTTP reader also exposed a
real durable-record defect: the readiness gate had persisted the ephemeral
`auditOverall` field, which strict schema reads rejected with HTTP 422. The
field was removed from the readiness gate; raw provider evidence still carries
the automated outcome. A final lifecycle rerun after a terminal-race guard
passed **24/24 tests** in two files. Its log is
`/tmp/ramify-plan21-iteration2-lifecycle-final.log`. The final type check and
`check:self` passed again at `/tmp/ramify-plan21-iteration2-type-final3.log`
and `/tmp/ramify-plan21-iteration2-self-final3.log`; the latter reported 12
owners, 583 source files, 55 resources, 11,549 accesses, zero errors/warnings
and 319 nonblocking analysis limits.

A real Git successor control commits
only an ignore-rule change between capture and readiness, proving unchanged
audit policy/blob can be rebound to current HEAD while preserving the
captured source. A later committed audit-policy change refuses readiness.
This is a source-advance compatibility control; normal `setupScratch` follows
readiness in RunService.

Their logs are `/tmp/ramify-plan21-iteration2-child-final.log`,
`/tmp/ramify-plan21-iteration2-native-final.log`,
`/tmp/ramify-plan21-iteration2-type-final.log` and
`/tmp/ramify-plan21-iteration2-self-final.log`. The earlier focused log is
`/tmp/ramify-plan21-iteration2-focused.log`. The final native witness was
rerun after environment hardening and its tracked raw result refreshed.

Two obsolete clean-source normal audit attempts were intentionally interrupted
with exit 130 after subsequent corrections: `7080d809` request
`76e8d13d-48e5-47cf-8f92-5cc149df242f`/run
`4506091b-25e7-4204-bd5b-a5463bf81caf` and `50ab93a3` request
`de9831e3-4cbf-4018-be3e-fb7b63e974e6`/run
`e6f36a03-0e78-4548-a775-904ddec9cc82`. Both CLI responses are
`cancelled` with no completed report, composition verdict or source
qualification. Their JSON files are
`/tmp/ramify-plan21-iteration2-delivery-audit.json` and
`/tmp/ramify-plan21-iteration2-delivery-audit-final.json`. The final released
normal partial command from the repository root is:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

The first completed delivery attempt against clean source
`cc875398981e7e7b4e0fdcf8c97e1376eb693220` requested `ramify-partial`
and the provider widened it to **full** because its drift cap counted 73
distinct paths since the last full report (limit 25). CLI launch-to-exit was
**969.36 seconds (16m 9s)**; the producer reported 968.815 seconds. All five
configured checks and 254/254 expected files ran with complete discovery, but
the result failed: 246 test files passed, six failed and two skipped; 1,995
tests passed, six failed and ten skipped; the failed session fixture left
additional controls unrun. The ledger had seven outstanding failures. This is
a failed report, not a passing baseline. Raw JSON is
`/tmp/ramify-plan21-iteration2-delivery-audit-cc875398.json` and the public
report is `9c995e07d930c28221399bd2fc944379225c0238` at run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-07T13-35-35Z-cc8753989`.
The coordinator's file-selection projection is
`/tmp/ramify-plan21-iteration2-audit-selection-cc875398.json`; raw provider
JSON remains the authority. The failed attempt is preserved in
`/ramify/.git/plan21-iteration2-cc875398-failed-audit-review.json`.

The seven failures named six files. One was a real durable stop/reload regression:
`job-interrupted` had been blocked by the new stop-requested terminal guard,
so the guard now permits the recovery terminal without weakening active stop
settlement. Stale acceptance readiness steps and composition citations were
updated to the native steps and current evidence owners, including historical
step values retained only for record reads. The setup-attribution fixture now
injects its existing owned command-execution seam and verifies captured
argv/cwd/environment/timeout/signal; the production path remains process-backed.
HTTP review-stop and session fixtures now inject explicitly scripted configured
audit ports under their no-spawn guards. The K5a evidence index now names the
current readiness controls. No pass or provider result was synthesized for the
failed audit.

The explicit nine-file failure-repair run was:

```sh
./node_modules/.bin/vitest run subs/harness/src/tests/acceptance-trial.test.ts subs/harness/src/tests/composition-recovery.test.ts subs/harness/src/tests/composition.test.ts subs/harness/src/tests/review-stop.test.ts subs/harness/src/tests/session-fixture.test.ts subs/harness/src/tests/setup-attribution.test.ts subs/harness/src/tests/readiness.test.ts subs/harness/src/tests/gate-not-verified.test.ts subs/harness/src/tests/nonfunctional-recovery.test.ts
```

It ran 104 passing tests, three failed assertions in the composition/setup
updates, and two optional skips: seven files passed and two failed. The seven
passing files include the slow session fixture and recovery cases. Targeted
reruns corrected setup-attribution and composition on the final source:

```sh
./node_modules/.bin/vitest run subs/harness/src/tests/setup-attribution.test.ts
./node_modules/.bin/vitest run subs/harness/src/tests/composition.test.ts
```

Setup attribution passed 5/5 and composition passed 7/7. Logs are
`/tmp/ramify-plan21-iteration2-failed-files-focused.log`,
`/tmp/ramify-plan21-iteration2-mapping-focused.log`,
`/tmp/ramify-plan21-iteration2-setup-final.log` and
`/tmp/ramify-plan21-iteration2-composition-final.log`. After those final
source edits, `npm run type-check` passed at
`/tmp/ramify-plan21-iteration2-type-repair-final.log` and
`npm run check:self` passed at
`/tmp/ramify-plan21-iteration2-self-repair-final.log` with zero errors or
warnings and 319 nonblocking analysis limits. Source was then committed clean
as `8b15ce532c1852b2ded73aeb4114f7f8f2f0f5fa`.

The final clean-source normal request against
`8b15ce532c1852b2ded73aeb4114f7f8f2f0f5fa` **executed partial**
without widening and terminated with CLI exit 1. Launch-to-exit elapsed
**978.215 seconds (16m 18s)** from 13:47:43 to 14:04:01 UTC; the producer
reported 977.75 seconds. The raw result is
`/tmp/ramify-plan21-iteration2-delivery-audit-8b15ce53.json`, timing
`/tmp/ramify-plan21-iteration2-audit-timing-8b15ce53.json`, report
`38c9b24cb4e29bfde7af09d0c51b6c191a8681ea`, and run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-07T14-04-01Z-8b15ce532`.
The public result selected five modules (`ramify-agent`, `harness`, `agent/pi`,
`audit`, `web`), eight changed source/test paths, all five checks and all five
configured test units. The first failed full report's seven failures were
carried into this request. Four checks passed. Both Vitest invocation groups
exited 0 with zero failed tests: the combined output has 262 passed file
*invocations*, two skipped, 2,062 passed test invocations and six skipped.
The earlier seven outstanding failure entries cleared, but that does **not**
make the partial report passing.

The exact group argument and reported-file arrays are preserved in the raw
JSON at `summary.checks.agent-tests.commands.agent-vitest.invocationGroups`;
a read-only projection for review is
`/tmp/ramify-plan21-iteration2-provider-gap-8b15ce53.json`.
The installed provider expected 211 configured files but observed 254 unique
run files, and it recorded 264 file invocations because the ten `agent/pi`
test files ran in both groups. Group 1 ran all 254 files even though its
appended `--exclude` arguments named omitted child modules; group 2 explicitly
ran the ten `agent/pi` files. The producer's own failure ledger says
`files reported by multiple invocation groups` and marks completeness
`indeterminate`. It therefore marked `agent-tests` failed and composed the
scoped result as `fail` (zero outstanding failure entries); the completed
request is **not qualified** as iteration delivery. The longest selected file
was `capability-acceptance.integration.test.ts` at 931.978 seconds, close to
930.75 seconds in the prior full attempt and explaining why the narrowed
partial had little wall-time gain. Parallel file durations are not summed.

This is a bounded `ramify-audit@0.7.1` producer prerequisite under the
project's two-project Vitest configuration. The provider must enforce its
partial module exclusions across configured projects and prevent overlapping
invocation groups while retaining configured discovery/completeness. After
that correction is released and installed, the same normal CLI request must
run against an exact clean source, with the resulting report/composition and
failure ledger assessed. No harness-side filename filtering, forced full
request, or inference that zero failed tests means a passing audit substitutes
for that producer result.

The provider owner qualified source `4003d70d158777b3f97965853ac921d2063b9685`
with a passing full producer audit (four checks, 50/50 files, 1,310/1,310
tests, complete empty ledger), published exact registry `ramify-audit@0.7.2`,
and recorded the correction at
`/home/app/ramify-audit-vpe/docs/2026-10-07-vitest-project-exclusions.md`.
Its audited report is `3b8b9173079d960fcbdecb74042c2adfa77fe3e5`
and run ref is `refs/audited/runs/2026-10-07T14-28-13Z-4003d70d1`.
The new published tarball SHA-256 is
`52aa4f46d5b6594a349f43261b29f2994bc1e6c15af9718303f00fbe7379a062`;
the consumer lock records integrity
`sha512-pHIKSEIeYOD1Lwz045wx2x1cu1pl6YwCTY9sZWV9tGSt2H8sOJ/HV+ezYmcUakh1POi+4FvPxyb09fuGbNnrug==`.
The registry install and independent `npm pack` confirmed that SHA-256 and
left `ramify.ts` at 0.4.0. The provider’s public registry smoke proves that
its root group selects two files and a grandchild group selects one with no
duplicate. The coordinator verified the provider's live remote, local HEAD
and tracking branch all at its exact receipt commit
`43ca23e08a776df580655e945bbe4aff370e131a`. Earlier GitHub server
errors did not change the qualified source history.

The consumer adoption at clean source
`fcd7d39544e6337522dd0f71d14f3571fd72e680` changes only package/lock,
the audit child’s narrow provider environment allowance for
`RAMIFY_AUDIT_VITEST_EXCLUDES`, a process-backed A/B scrubber control, and this
nonprotected execution authorization note. The test proves the provider value
reaches only its requested command while an undeclared ambient
`RAMIFY_AUDIT_API_KEY` and the other command’s declared credential remain
scrubbed. Historical 0.7.1 raw results and native F3/F2 evidence remain
identified by their original pin; they were not relabeled as 0.7.2 evidence.

The exact new focused command from `ramify-agent/` was:

```sh
./node_modules/.bin/vitest run subs/harness/subs/audit/src/tests/workspace-preparation.test.ts subs/harness/subs/audit/src/tests/audit-conformance.test.ts subs/harness/subs/audit/src/tests/completed-audit.test.ts subs/harness/subs/audit/src/tests/test-lock.test.ts subs/harness/src/tests/readiness.test.ts
npm run type-check
npm run check:self
```

Five files and **53/53 tests passed** (`/tmp/ramify-plan21-iteration2-072-focused.log`);
type-check passed (`/tmp/ramify-plan21-iteration2-072-type.log`);
`check:self` passed with 0 errors/warnings and 319 analysis limits
(`/tmp/ramify-plan21-iteration2-072-self.log`). Source diff and index were
clean after commit.

The released normal request against exact clean source
`fcd7d39544e6337522dd0f71d14f3571fd72e680` finished with CLI exit 0.
It **requested `ramify-partial` but executed `full`**: the provider widened it
because the prior `8b15ce53` report's duplicate invocation groups left its
failure ledger indeterminate. This delivery result therefore qualifies the
consumer's full configured audit, not a new consumer partial-selection run.
The producer correction's own source and fresh-registry public `dispatchCheck`
smoke establish inline-project exclusions, while the consumer subprocess
control establishes the narrow environment allowance. A new normal partial
consumer witness remains for the iteration 3/9 boundary.

Launch-to-exit was **972.572 seconds (16m 13s)**, from
2026-10-07 15:20:31 to 15:36:43 UTC; the producer reported 972.155 seconds.
The raw CLI response and timing record are
`/tmp/ramify-plan21-iteration2-delivery-audit-fcd7d395.json` and
`/tmp/ramify-plan21-iteration2-audit-timing-fcd7d395.json` (raw SHA-256
`4dc7950bb2624ad862146d1e297864252f9aca02dfcecc0a0d3f08491607dd20`).
The exact audited tree is `ed30426794ac2bab43af7a5a81365978cc6ac891`,
the committed audit configuration blob is
`c6a2f6ce46c395103c40877d68b1a26f5148442c`, and the provider report
is `dddc493c18bb1a579adaa9016ce58e1764327b8b` at
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-07T15-36-43Z-fcd7d3954`.
All five configured checks passed. Its one Vitest invocation group recorded
254 unique `(path, project)` files with no duplicates; configured expected/run
files were 254/254, missing `[]`, status `complete`. The Vitest summary was
252 passed files, zero failed, two skipped; 2,005 passed tests, zero failed,
six skipped. Skips are unrun, not passes; the skipped files are the fixture
acceptance and fixture trials suites, opt-in through
`RAMIFY_AGENT_FIXTURE_ACCEPTANCE` and `RAMIFY_AGENT_TRIAL` respectively. The
failure ledger is complete with zero entries, and unscoped composition is
`pass`, chain depth zero, outstanding failures zero. The slowest file,
`capability-acceptance.integration.test.ts`, took 934.391 seconds. Its file
duration overlaps other checks and is not added to the request duration.

The released source-HEAD `check-branch` result at
`/tmp/ramify-plan21-iteration2-source-applicability-fcd7d395.json` found an
exact tree, `auditStillApplies: true`, `auditPassed: true` and the same passing
report. A second released check at the committed receipt HEAD is recorded in
the handoff; it establishes applicability of that source result, not a new
execution at the receipt commit.

## Boundary and successor

No policy-version bump or iteration 3 authority change was made. Provider
test health remains automated evidence; engineer implementation claims and
architect judgment remain later actor responsibilities. The old non-readiness
scenario gate and optional legacy fixtures are explicitly deferred to
iteration 9. Iteration 3 owns the combined new-policy authority boundary;
iteration 5/6 own the reserved protected-document patches.

The protected `.principles.md`/`.spec.md` inventory has 16 files. All 16
match their entry hashes in HEAD, index and worktree, with no new protected
path at source qualification. The final receipt-head comparison is part of
the coordinator handoff. No protected-document patch is authorized for
iteration 2.
