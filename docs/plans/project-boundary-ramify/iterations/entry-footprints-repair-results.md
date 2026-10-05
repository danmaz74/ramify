# Entry-footprints repair results

**Date:** 2026-10-05. **Status:** implemented in the measurement recipe and
its assertions; uncommitted. This relaxes a reviewed pass/fail check of
`I2-29:entry-footprints` and `I5-13:entry-footprints` by user decision. No
measurement recipe was run.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit | `ea0e4331` |
| Changed | `scripts/measurements/resident-observer.mjs`, `resident-workloads.mjs`, `resident-assertions.mjs`, `README.md`; new `scripts/measurements/entry-footprints.test.mjs`; this receipt |
| Unchanged | `fast-assertions.mjs` (it already delegates `I5-13:entry-footprints` to the resident predicates), both evidence readers, the harness instance handlers, `plan2-instances.ts`, `plan5-instances.ts` |
| Evidence | `/home/app/ramify-pb1-evidence/entry-footprints/` |

Every `.mjs` under `scripts/measurements/` is part of the resident and fast
evidence identity (`recipes` in `resident-inputs.mjs`), so this change must
land before the iteration 20 measurements.

## Cause

The help step of `entry-footprints` runs `ramify --help` under the 50 ms
external POSIX sampler. Since the Bun-compiled client became the installed
launcher, help answers in about 25 ms. At Plan 5's closure the archived run
(`resident-2026-09-14T14-13-56.663Z-…json.gz`) took two samples: the mark
before launch, with no process, and one of the already exiting client, with
0 bytes. The binding predicate `help contains real externally sampled RSS`
observed 0 and failed. It was the workload's only failing predicate.

## Decision

The user's relayed decision: an entry whose process exits within one sampler
interval is recorded as completed below sampling resolution, with its measured
wall time, and passes on that basis. The Node entry is not substituted for the
compiled client. A process that runs one interval or longer must still have
real externally sampled RSS. A missing or non-finite wall time fails. The other
entry-footprint predicates are unchanged.

## What the report records

`entryFootprint(samples, durationMs, intervalMs)` in `resident-observer.mjs`
builds the help record when the measurement is taken. The observer now exposes
its `intervalMs`. The record is:

- `durationMs`: the controller's spawn-to-close wall time. It includes the
  synchronous launch sample, so it is an upper bound on the process lifetime.
- `samplerIntervalMs`: the observer's interval, 50.
- `belowSamplingResolution`: `true` only when no sample holds resident bytes
  and `durationMs` is finite, positive and below `samplerIntervalMs`.
- `rssBytes`: `null` when below sampling resolution, otherwise the sampled
  peak (0 when a run of one interval or longer has no resident sample).
- `samples`: the raw samples, as before.

## What the assertion accepts and rejects

A help row marked `belowSamplingResolution: true` is judged by `help completed
below sampling resolution` (observed: wall time, interval and sampled peak;
maximum: 50). It passes only if the raw samples are complete and hold no
resident bytes, `rssBytes` is `null`, `samplerIntervalMs` equals the recipe's
`sampleIntervalMs` (50) and `durationMs` is a finite number with
0 < `durationMs` < 50. Any other help row is judged by the unchanged `help
contains real externally sampled RSS`: the sampled peak must be positive and
equal `rssBytes`.

| Help row | Result |
| --- | --- |
| Marked, no resident bytes, wall time 25.5 ms | passes |
| Sampled, positive peak equal to `rssBytes`, marked `false` or unmarked | passes, as before |
| Unmarked or `false`, no resident bytes, any wall time | fails |
| Marked, wall time 50 or 60 ms | fails |
| Marked, interval 100 ms and wall time 75 ms | fails |
| Marked, but a sample holds resident bytes, or `rssBytes` is 0 | fails |
| Marked, wall time missing, `null`, NaN, infinite, 0, negative or a string | fails |

`help: complete actual process samples` still applies to every help row.

## Tests

`scripts/measurements/entry-footprints.test.mjs` judges synthetic fragments
under both `I2-29:entry-footprints` and `I5-13:entry-footprints`.

| Test | Before the change | After |
| --- | --- | --- |
| Exit within one interval passes, record carries marker and wall time | failed (`false !== true`) | passed |
| One interval or longer without a resident sample fails | failed (no below-resolution row existed to inspect) | passed |
| Sampled entry passes as before; contradicting marker fails | passed | passed |
| Missing or non-finite wall time fails | failed (no below-resolution row existed to inspect) | passed |
| The recorder marks only a fast unsampled exit | not runnable (no recorder) | passed |

Logs: `before-tests.log`, `after-tests.log`.

Replaying the Plan 5 archived help observation through the recorder
(`archived-help.mjs`, `archived-help.log`) gives `belowSamplingResolution:
true`, `rssBytes: null`, `durationMs` 25.54. The workload's predicates go from
one failure to all passing.

## Real probe

The scripts offer no help-only entry-footprints run, so
`help-probe.mjs` imports the same `command` helper, observer and recorder and
runs only the help step five times against this build's launcher,
`dist/src/ramify`. The installed bin is a symlink to it, and it executes the
Bun-compiled client. No daemon, fixture, archive or index record is involved.
All five runs took 20.6–25.9 ms. The launch sample caught the live client at
12.0–17.0 MiB, so each run took the sampled path, marked `false`, and passed
`help contains real externally sampled RSS` (`help-probe.log`). Whether the
launch sample sees the live process or the exiting one is a race. The Plan 5
replay covers the other outcome.

## Stale prose

The reviewed rows were left byte-identical. Neither row says "real externally
sampled RSS", but both describe help as a measured footprint:

- `plan2-instances.ts`, `I2-29:entry-footprints`: "Idle CLI help, … CLI check
  client." / "Within the budget table; recorded raw." Help has no budget, and a
  fast exit is now recorded without an RSS figure. The raw samples are still
  kept.
- `plan5-instances.ts`, `I5-13:entry-footprints`: "Plan 2's entry footprint
  workloads on this build: idle CLI help, …" / "Each footprint is within Plan
  2's recorded limit". The same applies.

No specification, principles document or glossary states this check, so no
patch is proposed.

## Verification

| Check | Result |
| --- | --- |
| `git diff --check` | clean; the new test file has no trailing whitespace |
| `npm run type-check` | passed (`type-check.log`) |
| `node --test scripts/measurements/entry-footprints.test.mjs` | 5/5 passed |
| `node --test scripts/measurements/*.test.mjs` (10 files) | 66/66 passed (`measurement-tests.log`) |
| `npm run check:self` | exit 0: 15 owners, 597 files, 0 errors, 0 warnings, 41 analysis limits, 5665 allowed, 0 denied (`check-self.log`). The limit count matches earlier logs, and the only limit in a changed file is the existing `dist` codec import at `resident-workloads.mjs:6` |
| Locked: `resident-measurements`, `evidence-reuse`, `completion-composition`, `final-contracts` harness tests | 4 files, 15 tests passed (`harness-focused.log`) |
| Locked: `npm run reference:cases` | 37 files, 393 tests passed (`reference-cases.log`) |

No measurement recipe, `reference:verify` or audit was run.

## Expected at iteration 20

The help row of both instances should show one of two outcomes, and both pass:

- sampled: `belowSamplingResolution: false`, `rssBytes` a partial startup
  figure (12.0–17.0 MiB in this probe; help has no budget), and `help contains real externally sampled RSS` passed;
- below resolution: `belowSamplingResolution: true`, `rssBytes: null`,
  `durationMs` under 50, and `help completed below sampling resolution` passed.

A help row with no resident bytes and a wall time of 50 ms or more fails. That
would mean a broken sampler or a slow entry and needs investigation. The other
entry-footprint predicates are judged as before. At Plan 5's closure they all
passed.

## Coordinator review

The coordinator commissioned this slice before the iteration 20 measurements,
because the measurement scripts are part of the evidence identity. The
relaxation of this reviewed pass/fail check was settled by the relay session
under the user's standing instruction; the user was told and may override it.
The coordinator reviewed the rule: the measuring code records a help run as
below sampling resolution only when no sample holds resident bytes and the
measured time is under one sampler interval, and the check then passes on
that record; a run of one interval or more without a resident sample still
fails. The Node entry is not substituted. The two instance rows whose prose
still describes a measured footprint are added to the stale-prose table of
the handoff. No protected document changed.
