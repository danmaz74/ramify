# Optimization 1: avoid cleanup waits for completed commands

**Date:** 2026-10-08. **Delivery:** implementation and focused verification ready;
the coordinator's initial full audit failed one crash fixture, corrected in the
qualification follow-up below. Full-audit rerun remains coordinator work.

## Inputs and correction

Worktree: `/home/app/ramify-plan22-command-cleanup`.
Branch: `perf/plan22-command-cleanup`.
Base: `2683945ceed261c4c796dc54da07e141589b0a8c`, from the active
Plan 21 worktree. The installed dependencies are linked from that worktree;
no package or lockfile changed. Vitest version: 4.1.11.

The [cleanup wrapper](../../../../subs/harness/subs/evidence/src/run-command-with-cleanup.sh)
now sleeps and escalates only when TERM succeeds. The group branch still
signals the complete owned group even after its leader exits. The fallback
branch applies the same missing-target rule to the single process. Start
barrier, registration, stdin, original exit status and parent kernel-identity
checks are unchanged. A delivered TERM still receives the existing bounded
200 ms grace period followed by KILL.

Changed implementation SHA-256:
`6f6b803f53b70937c8337c1eea7994b3a4f3411b393bddb1c91dbf94832bd79e`.
Unchanged Vitest configuration SHA-256:
`c0f54f605e468027bffb775b4847c487bb88fb59f1b06528dbacb09738f07e7e`.
Unchanged agent audit configuration SHA-256:
`9bfaaa5d6b95d590cf044ecab60faec812b2e39fd5a7752be28e7190afa80baa`.

## Regression and verification

[Owner tests](../../../../subs/harness/subs/evidence/src/tests/run-command.test.ts)
retain all 14 prior cases and add five cases. Four deterministic full-wrapper
controls replace signal delivery and sleep with recorded shell functions;
they cover both group and fallback modes, missing targets and successful TERM.
They assert the original exit code 7, group announcement, exact signal target,
zero missing-target sleep/KILL calls, and matching KILL targets after the
200 ms grace request. The fifth real-process case starts a descendant with
TERM ignored, waits for its readiness marker, exits its parent with code 7,
and verifies KILL leaves no live group member while preserving that exit code.

Before the production change, the following focused reproduction failed:

```sh
# From ramify-agent/
node_modules/.bin/vitest run subs/harness/subs/evidence/src/tests/run-command.test.ts -t 'does not sleep or escalate'
```

Both group and fallback controls failed with `expected ... to have a length
of 1 but got 3`: the original wrapper recorded TERM, sleep and KILL even though
TERM reported no target. Two failures, 16 filtered cases, duration 209 ms.

After the correction and final test edits:

| Command | Observed result |
| --- | --- |
| `node_modules/.bin/vitest run subs/harness/subs/evidence/src/tests/run-command.test.ts` | 1 file, 19 tests passed; no skipped cases; duration 1.88 s, test time 1.70 s. |
| `npm run type-check` | Exit 0 across all four declared compiler scopes. |
| `npm run check:self` | Exit 0; 12 owners, 569 source files, 47 resources; zero errors/warnings, 310 nonblocking analysis limits; completed execution, passed check, partial coverage. |
| `bash -n ramify-agent/subs/harness/subs/evidence/src/run-command-with-cleanup.sh` from repository root | Exit 0. |
| `git diff --check` from repository root | Exit 0. |

The real owner cases cover successful output, exact stdin bytes, durable group
registration/start barrier and kernel identity, nonzero exit, timeout, spawn
failure, cancellation, output cap, bounded output tail, omitted output files,
ordinary descendants and TERM-resistant descendants. Teardown observes live
group members for actual requests, including timeout/cancellation/output-cap
cases, with bounded polling. No live owned group member remained. Dead zombies
awaiting host reaping are excluded from live membership. Cancellation can return
while the wrapper finishes cleanup; this optimization preserves that existing
executor behavior rather than making a stronger synchronous settlement claim.

The separate existing Plan 21 audit was running concurrently. It was neither
interrupted nor used as this optimization's audit result.

## Repeated no-op measurement

Python `subprocess.run`, three sequential batches of 20 `/usr/bin/true`
invocations for each path, stdout/stderr discarded, exit checked. The wrapper
path receives `start\n` on stdin. The same host and source path were used before
and after; a concurrent suite prevents a quiet-host claim. Results are advisory
observations, not millisecond assertions.

| Path | Before: seconds per 20 commands | After: seconds per 20 commands | Before median | After median |
| --- | --- | --- | --- | --- |
| Direct | 0.009195, 0.008464, 0.008617 | 0.010091, 0.008335, 0.008446 | 0.008617 s | 0.008446 s |
| Wrapper | 4.463974, 4.390411, 4.464258 | 0.073233, 0.076655, 0.076169 | 4.463974 s | 0.076169 s |

Wrapper median per command decreased from 223.199 ms to 3.808 ms, approximately
58.6 times faster. The deterministic controls establish zero no-target cleanup
sleeps independently of these timings.

Reproduce each before/after measurement from the repository root:

```sh
python3 - <<'PY'
import subprocess, time, statistics
wrapper = 'ramify-agent/subs/harness/subs/evidence/src/run-command-with-cleanup.sh'
for label, argv, stdin in [
    ('direct', ['/usr/bin/true'], None),
    ('wrapper', ['bash', wrapper, '/usr/bin/true'], 'start\n'),
]:
    samples = []
    for batch in range(3):
        start = time.perf_counter()
        for command in range(20):
            subprocess.run(argv, input=stdin, text=True, check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        samples.append(time.perf_counter() - start)
    print(label, samples, 'median', statistics.median(samples))
PY
```

## Limits and successor work

TB03/TB04 have focused wrapper and real-process evidence. No ordinary-test
conversion, runner partition, provider contract or concurrency policy changed.
The initial implementation did not run a full configured audit locally; the
coordinator subsequently ran the audit described below. A passing comparable
four-worker suite baseline remains outstanding.
These checks establish observed execution behavior, not responsible-architect
semantic completion of Plan 21 or Plan 22.

## Qualification follow-up: the CA20 crash fixture

The coordinator's full audit of commit
`42c1552737734de4ecb296855d76d3b923454e80` completed with a failing composition
verdict. `/tmp/ramify-plan22-cleanup-baseline-audit.json` retained the failure:
CA20, "a registered real process group survives a service crash and is settled
before any successor work", raised `LedgerCorruptError` on ledger event 58,
because another live writer had appended 243 bytes. This result remains a
failed audit, not a passing baseline.

The focused reproduction with the optimized wrapper also failed deterministically
in 954 ms of test execution. The unchanged test passed with the original wrapper
in 14.53 s. For that diagnostic, the original wrapper was read from base
`2683945c`; the qualified wrapper was restored in a `finally` block. The preserved
outputs are `/tmp/plan22-ca20-optimized.txt` and
`/tmp/plan22-ca20-original.txt`.

CA20 simulated a crash by freezing the durable registration callback while
keeping the original service and real executor alive in the test process.
The recovery service killed the registered group. This independently completed
the old executor's callback, allowing the allegedly crashed service to resume
and append concurrently with recovery. Unconditional waits on unrelated Git
commands had masked the race. No production ledger or executor behavior was
changed to accommodate this invalid crash simulation.

The correction uses the existing injected `commandExecution` port. It runs the
actual `runCommand` implementation and retains actual durable registration,
kernel identity, OS liveness, group kill and recovery assertions. Once the
crash flag is set, the test withholds the old executor's completion reply so
that the abandoned service cannot receive callbacks after its simulated crash.
An added assertion verifies that the original service's event sequence remains
exactly at the recorded crash boundary after recovery. Cleanup is registered
when the real group is observed, before the crash callback can freeze, so the
group is killed even if subsequent fixture assertions fail.

This remains an in-process service-crash simulation with a real OS process-group
witness; it does not claim that the service itself was killed in a separate
process, or label real command results as synthetic adapter evidence. The
missing command completion reply models the stopped service's inability to
receive a callback. Existing writer-unsettled and no-successor-work assertions
are unchanged.

Focused checks after the fixture correction, from `ramify-agent/`:

```sh
node_modules/.bin/vitest run subs/harness/subs/evidence/src/tests/run-command.test.ts subs/harness/src/tests/capability-recovery.test.ts -t 'command cleanup wrapper|runCommand|childEnvironment|environmentNames|a registered real process group'
npm run type-check
```

Both focused files passed: 20 selected tests, with 17 other recovery cases
filtered by the explicit title selection, duration 3.26 s and summed test time
2.70 s. All 19 executor cases and the corrected CA20 recovery case executed.
All four declared compiler scopes passed. Full output is retained in
`/tmp/plan22-cleanup-recovery-regressions.txt` and
`/tmp/plan22-cleanup-recovery-typecheck.txt`. `npm run check:self` also passed
after the new test import: zero errors/warnings, 310 analysis limits, partial
coverage, with output in `/tmp/plan22-cleanup-recovery-checkself.txt`.
`git diff --check` passed. A full audit was not rerun by the
optimization subagent; the coordinator owns that serialized qualification.
