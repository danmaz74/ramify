# Optimization 9: guarded readiness policy and lifecycle cases

The 17 ordinary readiness cases now exercise real files, readiness logic,
RunService, ledger records and provider-settlement ordering with strict external
responses. They initialize no Git repository and start no process. The three
installed-provider/native-command cases moved to
`subs/harness/src/tests/readiness.boundary.test.ts`; their literal registrations
and callbacks are byte-identical. No production source, dependency pin, runner
configuration, timeout, skip or retry changed.

The isolated branch is `perf/plan22-readiness`, based on
`b52aa48ff2ba7e34b4b158e99dac32b8312c649d`. Its implementation source is identified
by the four path SHA-256 values in [the compact evidence](09-readiness-evidence.json).
The target's committed source remained that base through qualification. Unfinished
Plan 21 changes were neither copied nor committed.

## Preserved cases and real boundaries

All 20 original titles and their 115 expectation calls remain. The evidence maps
each case to its current file and records unchanged native callback hashes.

| Original cases | Current location and evidence |
| --- | --- |
| 1 | Native file: installed full provider execution, local committed setup, published full-result reuse, deleted working output recreated by actual command. |
| 2 | Native file: cancellation settles the registered actual command and owned provider workspace before readiness returns; no run branch created. |
| 3 | Native file: actual scratch-only successor retains captured audit policy; committed policy change refuses native readiness. |
| 4–13 | Ordinary file: declared packages, setup/reuse/file outcomes, setup failure, symlink escape, provider and policy refusal, nested failure/discovery/reuse, installation recovery, timeout classification, dirty/non-Git refusal and linked-install refusal. |
| 14–18 | Ordinary file: RunService installation repair/ineffective repair, two-recovery bound, timeout followed by pass versus failing tests, failed daemon restart with no audit. |
| 19–20 | Ordinary file: stop/close abort readiness, await scripted provider settlement, preserve recorded event order and branch refusal. |

`readiness-boundaries.ts` states literal initial head/tree identities, unchanged
candidate bytes, the collection-review ownership topology, clean/dirty/unavailable
Git answers and final no-change commit/trailer responses. It reads no fixture
files to infer any Git or ownership answer. Branch mutations and final
lookup/commit responses exhaust at their stated cardinalities. Configuration and
unchanged Git/Ramify reads are explicitly repeatable; required branch, audit,
command, capture, head/version and lifecycle measurement replies are checked.

Setup and installation replies validate the exact configured argv, resolved cwd,
allowlisted environment and deadline. Their separately declared real filesystem
effects create the original output or dependency directory; they never execute
or interpret the configured program. Nine controls prove unknown/wrong Git,
exhausted/unused branch, wrong/exhausted/unused audit and
wrong/exhausted/unused command responses fail persistently after caught errors.
Existing original negative cases still establish symlink, dirty/non-Git,
ineffective repair, test-failure and bounded-recovery refusal.

The ordinary files install the current process guard before helper/application
imports. They assert zero attempts after reverse owned cleanup. Service settlement
precedes fixture removal; cancellation controls release their owned settlement
barrier during cleanup even if an assertion fails. This cut uses the existing
file-local enforcement; automatic root enforcement and explicit boundary runner
registration remain later Plan 22 work.

The live composition metadata references only ordinary readiness cases. Those
paths stay unchanged; no scanner or acceptance-source lookup was modified.

## Qualification

Commands ran from this worktree's `ramify-agent/` directory:

```sh
node_modules/.bin/vitest run --project node subs/harness/src/tests/readiness.test.ts --reporter=json --outputFile=/tmp/plan22-readiness-baseline.json
node_modules/.bin/vitest run --project node subs/harness/src/tests/readiness.test.ts subs/harness/src/tests/readiness-boundaries.test.ts subs/harness/src/tests/readiness.boundary.test.ts subs/harness/src/tests/composition.test.ts --reporter=json --outputFile=/tmp/plan22-readiness-final-focused.json
npm run type-check
npm run check:self
node_modules/.bin/vitest list --filesOnly --json
```

The baseline passed all 20 originals. Final focused qualification passed all 40
cases: 17 ordinary originals, nine strict controls, three native originals and
11 composition cases; zero failures or skips. All four compiler scopes passed.
The module check completed and passed with zero errors/warnings and 313 existing
analysis limits (partial coverage). Configured discovery selected 264 files:
247 Node and 17 web, including both new readiness files.

| Measurement | Before | Qualified observation |
| --- | --- | --- |
| Original ordinary readiness callbacks | 4.896 s aggregate in mixed baseline | 3.352 s ordinary file in final focused run; earlier guarded runs 2.03–2.20 s |
| Native three callbacks | 1.308 s aggregate in mixed baseline | 2.215 s native file in final focused run; earlier split run 1.362 s |
| Mixed original baseline file | 6.204 s | Split files; parallel file timing is not a comparable summed wall time |
| Ordinary process attempts | Not instrumented in baseline | Zero throughout setup, flow and cleanup in both guarded files |

These are shared-host observations, with compiler/module checks running alongside
final focused tests. Native commands were not separately counted. This cut
claims removal of ordinary process calls, not a controlled whole-suite speedup.

Authoring failures remain in the compact evidence and `/tmp/plan22-readiness-*`
JSON/log artifacts. The first conversion run failed three cases: final trailer
expectations used `ga-0002` despite a readiness retry consuming that gate, and the
failed-version answer incorrectly refused the lifecycle's independent measurement
read. The second run retained only the two gate mismatches. Correct literal
`ga-0003` final responses and a separately permitted synthetic measurement reply
resolved them; no production change was needed. The initial composition selector
mistakenly selected similarly named CheckFinding files (five additional passing
regressions). The final command uses the required `composition.test.ts` and its
11 literal-title/static-source checks.

No released audit was run by this optimization agent. The coordinator must run
the installed full nested audit on the clean committed candidate before merge,
recheck committed target drift, preserve unfinished target work and run integrated
focused verification. Audit execution health, this engineer report and responsible
architect preservation/completion judgment remain separate.
