# Iteration 7 results: macOS RSS sampling and plan closure

**Date:** 2026-09-13. **Outcome:** HO-19 and HO-20 pass, and the three carried
items are done. `npm run check:self` passes again with 0 errors. The racing
measurement assertion accepts a hook covered on publication. The Plan 5
contracts show the additive resolution members. On a platform where a read
spawns `/bin/ps`, the session host reads compiler RSS once per compiler and then
at most once per interval, in the background. The
[closure](closure.md) records the plan's evidence. Direct work; no Studio
workflow.

## Commits

| Commit | Item |
| --- | --- |
| `630da32` | A: self-check visibility |
| `05b756e` | B: racing measurement assertion |
| `1bfe0d6` | C: Plan 5 contract text |
| `4715194` | D: compiler RSS sampling (HO-19) |
| `ad0043b` | D: analysis update (HO-20) |
| closing commit | D: this document, the closure and the iteration's verification block |

## A. Self-check remediation

`npm run build && npm run check:self` failed on `f2f24d8` with five
`not-visible` errors. Iteration 6 recorded them without fixing them.

| Error | Cause | Fix | Exposure change |
| --- | --- | --- | --- |
| `subs/analysis/src/tests/root-resolution.test.ts:11` `readConfiguration`, `ConfigurationChanged`, `acquireConfiguration` (three) | The HO-10/HO-12 test mocked `analysis/project`'s `configuration.ts` and typed the mock with `typeof import(...)`, which selects every export of a file `project` does not expose. | The test now mocks `resolve-root.ts` through its exposed `resolveProjectRoot` binding, typed with `import type { resolveProjectRoot }`. Each call counts the configuration helper processes spawned while it runs (`PROCESSWRAP`, as `resolve-root.test.ts` counts them) and whether it returned a resolution it was not given. `counted` reports the helper count as `resolutions`, as before, and also requires that count to equal the number of new resolutions. | None |
| `subs/cli/src/interfaces/cli.ts:4` `ReplyTimings` | Iteration 3 added `CheckDocument.timings.reply`. `ReplyTimings` was not in daemon's N5 relay or root's R7 relay, which carry the other contexts vocabulary to `cli`. | `ReplyTimings` added after `CheckOutcome` in daemon's N5 list (`subs/daemon/module.ramify`) and root's R7 list (`module.ramify`). | Two existing named lists extended |
| `subs/daemon/subs/contexts/src/tests/scripted-driver.ts:4` `OperationTimings` | Iteration 1 added `OperationTimings` to `analysis`'s `interfaces/session.ts`, which analysis exposes to its parent with `*`. Root's R3 relay to descendants names session types individually and did not name it. | `OperationTimings` added after `RevisionTimings` in root's R3 list. | One existing named list extended |

**Assertions kept.** Every `resolutions` expectation in both tests is unchanged.
The count still means configuration helper reads made by root resolution.
Acquisition's own configuration reads still do not pass through the counted
binding, and the new equality adds a check. A mutation that passes no known
resolutions in `session-engine.ts` fails both tests with `expected 1 to be +0`.
It was reverted.

**Deviation.** The main plan says no exposure line is added. None is added, but
three existing named lists are extended by one name each. `module.ramify` and
`subs/daemon/module.ramify` change. The alternative for `cli` and the contexts
test driver was to derive each type from an already received one, for example
`NonNullable<Extract<CheckOutcome, …>['timings']>`. That hides a vocabulary
dependency the relays exist to state.

Verification after the fix: `npm run check:self` in resident mode, and
`dist/src/ramify check --batch --root .`, both report 11 owners,
`check: passed`, `0 errors, 0 warnings, 0 analysis limits; 2611 allowed,
0 denied`. `npx vitest run subs/daemon/subs/contexts/src/tests
subs/cli/src/tests/changed-command.test.ts
subs/analysis/src/tests/root-resolution.test.ts`: 11 files, 140 tests passed.
`npm run type-check` passed.

## B. Racing measurement assertion

`scripts/measurements/fast-assertions.mjs` `racing hooks wait for an uncovered
identity` required a racing body cycle to add no covered request. Since
iteration 5 a racing hook is usually a covered request on the watcher
revision's publication, so a real run would have failed it.

The check is now `racing hooks are answered from the racing revision`. Its
predicate is the exported `racingHookAttributed(cycle)`
(`scripts/measurements/fast-assertions.mjs:111`). It uses the counters sampled
before the save (`countersBeforeSave`) and once settled (`settled.counters`),
plus the hook's `ramify.check/1` document. It requires:

- every counter field present and natural;
- the covering-edit conditions: exit 0, `checked`, complete, the document's
  revision is the cycle's revision and newer than `beforeSequence`, and every
  changed entry covered with the expected path and hash;
- at least one analysis other than a sweep or audit;
- then either exactly one covered request, with `timings.reply` absent or its
  `invocationCheck`, `workerStatus`, `workerRoundTrip` and `publication` all 0
  (covered on publication), or no covered request, with `timings.reply` absent
  or `workerRoundTrip > 0` (answered by an update that included the hook, as
  when it reached the daemon before the watcher's batch, which may run two
  updates).

An answer from another revision, a second covered request, a covered reply that
reports session work, an uncovered reply that reports none, or no analysis fails.
The observed value lists the number of cycles, the number covered and the
unattributed cycle numbers.

The test `scripts/measurements/fast-evidence.test.mjs:154` replaces the old
single mutation with four accepted variants and ten rejected ones, each checked
through both the predicate and the workload assertion. The measurement README
describes the racing judgment.

**Limit.** The CLI document carries no freshness record, so the harness cannot
tell a hook covered on publication from one that reached the daemon after
publication and was covered on arrival. Both have zero reply session work. The
`racing hooks launched before publication` check still requires the hook to
start before `publishedAt`. The successor can separate the two by recording the
daemon's `freshness.acknowledged` against the revision's `publishedAt`.

Verification: `node --test scripts/measurements/fast-evidence.test.mjs`
passed 19 of 19. `node --test scripts/measurements/resident-reuse.test.mjs
scripts/measurements/fast-fixture.test.mjs scripts/measurements/fast-clone.test.mjs`
passed 11 of 11. `npx tsc -p tsconfig.scripts.json --noEmit` passed. No
`npm run measure:*` ran.

## C. Contract documents

The [Plan 5 contracts](../../iteration-5-fast-incremental-checks/contracts.md)
remain authoritative under this plan, so the current text was updated rather
than only recorded here:

- `ProjectObserver` shows `readonly resolution: Extract<ProjectResolution, {
  readonly status: 'resolved' }>`. The observer prose now describes it and the
  optional `known` argument of `resolveProjectRoot(request, signal?, known?)`
  and `resolveProject(request, control?, known?)`, citing resolved decision 5.
  The prose no longer says `resolveProjectRoot` is unchanged.
- The session section's "`resolveProject` is unchanged" now names the added
  argument.
- `AnalysisDriver.resolve(request, control?, known?)` shows the parameter, with
  a sentence on the manager's use after the contexts block.

`docs/architecture` describes none of these signatures, so it needed no change.
The historical owner manifests that list the relays
(`docs/plans/iteration-2-resident-verification/owners.md`,
`docs/plans/iteration-5-fast-incremental-checks/owners.md`) were not updated
for item A.

## D. Compiler RSS sampling (HO-19)

### Clarification: no RSS limit is enforced

The plan row says sampling "still enforces the RSS limit". No supervision code
consumes the sample. `SessionHost` sampled the compiler, not the worker, on
every worker message with a status (`subs/analysis/src/session-host.ts:82` at
`f2f24d8`), and stored it as `SessionStatus.compiler.rss`. Only status readers
use it: daemon status, `session-worker.test.ts` and the Plan 5 hosting case.
The worker heap limit is V8's `resourceLimits`, and the measurement harness
takes RSS from its own external process samples. The row is therefore evidenced
as a bounded staleness of the reported sample, not as enforcement.

### Design

`createRssSampler(refreshed, options)` (`subs/analysis/src/session-processes.ts:89`)
takes optional `platform`, `read`, `now` and `intervalMs`.
`processRss(pid, platform)` (`:50`) gains the platform parameter.

- **Linux:** `sample` is the read itself, `/proc/<pid>/status` on every status
  message, as before. No process starts.
- **Elsewhere,** where the default read is `/bin/ps` on macOS and `null`
  otherwise:
  - The first status message that reports a pid awaits one read. A live
    compiler therefore still reports an RSS as soon as it is first reported.
  - Later messages for that pid return the kept sample.
  - A message that finds the sample at least `intervalMs` old, 5,000 ms by
    default (`rssSampleIntervalMs`, `:67`), starts one background read. No
    other read starts while it runs. The message still reports the kept sample.
  - The read's result is dated at its start. It replaces the sample and calls
    `refreshed`, unless a different pid was reported meanwhile or the sampler
    was disposed. A rejected read only clears the running flag.
  - No read runs without a status message, so an idle session starts no
    process.
- **Host.** `SessionHost` builds the sampler (`subs/analysis/src/session-host.ts:54`).
  Its `refreshed` callback replaces `#status` with the new compiler RSS only
  while the session has not failed or started closing and the status still
  names that pid. Disposal disposes the sampler after the message chain drains.
  `openWorkerSession(inputs, control, entry?, sampling?)` passes the options
  through; production passes none.

**Bound.** A status message reports a sample whose read started at most
`intervalMs` (5 s) before the message. Otherwise the message itself starts a
read whose result replaces the status within that read's 1 s `ps` timeout.
Between messages the value is not refreshed, so after an idle period the first
message reports the pre-idle sample and replaces it within 1 s. `/bin/ps` runs
at most once per compiler start plus once per interval in which a status
message arrives.

### Tests

All in `subs/analysis/src/tests/rss-sampling.test.ts`:

| Case | Evidence |
| --- | --- |
| `:30` `rss-sampling: Linux reads /proc for every status message and starts no process` | Five samples with an injected read make five reads, and `refreshed` is never called. On Linux, a real `processRss(process.pid, 'linux')` is positive and the `child_process` diagnostics channel records no `/bin/ps` child. |
| `:45` `rss-sampling: elsewhere a compiler is read when first reported, then at most once per interval in the background` | Deferred reads and an injected clock show: the first sample awaits its read; ten samples within the interval read nothing; at the interval the stale value returns and one read starts; a sample during that read starts none; the result reaches `refreshed` and later samples, dated at its start; a rejected read reports nothing and allows the next; a new pid awaits its own read and the old pid's late result is discarded; after `dispose` an in-flight result is discarded. |
| `:105` `rss-sampling: on the macOS path worker messages start no process until a new compiler or the interval` | A real worker session opened with `platform: 'darwin'`, an injected clock and a read that counts and calls the real `processRss(pid, 'darwin')`, which runs `/bin/ps` on Linux too. Open reads once, for the compiler pid, and reports a positive RSS. Ten updates, a source edit update and a sweep add no read, and the channel records exactly one `ps -o rss=` child. Advancing the clock past the interval makes the next update start one read, observed as a second child, and the status object is replaced with that compiler's positive RSS. Three more updates add none. `releaseCompiler` reports `{ pid: null, rss: null }`. The next update's new compiler is read once before its first report. Three children in total. |

A mutation that returns the read directly on every platform fails both
elsewhere cases. It was reverted. The worker case runs inside `workerSuite` and
carries the owner's 120 s `timeout`; the pure cases carry 30 s.

## D. Analysis update (HO-20)

[The optimization analysis](../../../analysis/fast-incremental-checks-optimization.md)
now has a delivery note under its status. It links this plan and the closure,
and states that every measured figure is pre-optimization and not measured
again. The ranked targets table gains a status column: 0 to 5 and 7 link their
iteration results, target 1 notes the deferred sweep step, and 6 is open.

Targets 0 to 4 and 7 each gain a **Delivered** paragraph. Target 3's names the
replay basis that replaced the observer's dependencies. Target 4's names the
remaining two-update case. Target 7's names the compiler as the sampled process
and says no limit consumes the sample. Target 5's paragraph from iteration 6 was
already present and is unchanged. The projection is labelled as
pre-optimization estimates. No figure changed.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/src/tests` | 14 files, 215 tests passed (212 plus 3 new) |
| `npx vitest run subs/daemon/subs/contexts/src/tests subs/cli/src/tests/changed-command.test.ts subs/analysis/src/tests/root-resolution.test.ts` | 11 files, 140 tests passed (after item A) |
| `node --test scripts/measurements/fast-evidence.test.mjs` | 19 of 19 passed |
| `npm run type-check` | passed |
| `npm run build` | passed |
| `npm run check:self` | resident; 11 owners, 282 source files, 3,715 accesses; `check: passed`; 0 errors, 0 warnings, 0 analysis limits; 2,622 allowed, 0 denied, 1,093 external |
| `git diff --check` | clean |

The cucumber-viz commit audit was not run by this agent, and no full suite ran.
The audit remains for the controlling session. The daemons started by
`check:self` were stopped by PID.

## Deviations and limits

- **Exposure lists extended** (item A). Three existing named lists gain one name
  each; no line is added.
- **HO-19 wording.** No RSS limit exists to enforce; see the clarification.
- **Background status change.** On the sampled path the host's status can change
  between messages when a background read lands. Only `compiler.rss` changes,
  and only for the pid it read.
- **Undisposed `ps`.** A background `/bin/ps` still running at disposal is not
  awaited. It ends within its 1 s timeout, and its result is discarded.
- **Unsampled platforms** other than Linux and macOS read `null`, as before,
  now through the kept-sample path.
- **No macOS run.** HO-19 exercises the macOS path on Linux with an injected
  platform and the real `/bin/ps`. The measurement successor covers macOS.
- **Racing attribution** cannot separate publication coverage from arrival
  coverage in CLI evidence; see item B.

## Handoff

- The [closure](closure.md) gathers matrix evidence, contract clarifications,
  audit results, remaining gaps and the measurement successor.
- **Measurement.** `status.compiler.rss` on macOS can be up to 5 s old, or older
  after idle until the next message's read lands. Use external process samples
  for memory budgets, as the harness already does.
