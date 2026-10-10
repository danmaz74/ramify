# Plan 28 self-run: ramify-agent on its own source — 10 October 2026

This was the first attempt to run ramify-agent on a copy of ramify-agent
itself. The plan was [Plan 28](../plans/28-design-review-guidance-sessions/main-plan.md),
prepared guidance sessions for design review. Two runs started, and neither
produced usable work:

- Run 1 failed at its readiness audit. The copy was missing a file that only
  the surrounding toolkit repository supplies, and the failing audit's output
  was then too large for the run's event log.
- Run 2 passed readiness and reached an engineer. The engineer could not
  work: Ramify's analysis worker inside the harness had run out of memory and
  was never replaced. Then a rename invalidated a module description, and the
  harness ended the run as an internal failure.

Neither run reached the plan's subject, so nothing here measures Plan 28 or
the models. Each failure is a defect or a setup gap that a larger project
exposes and the collection-review fixture does not. Three of the defects stop
any rerun of Plan 28 until they are fixed. [Proposals](#proposals) lists the
fixes and orders them.

## Setup

The copy was `/home/app/ramify-selfrun-plan28/ramify-agent`, a standalone
repository whose project root is its Git root. It was made with
`git archive` of `2b41b49a` (the `ramify-agent` branch) and `npm ci`.

The harness ran from `/ramify/ramify-agent` with
`serve --project <copy> --port 4320 --agent pi --model openai-codex/gpt-5.6-sol:high`.

The copy needed these steps before readiness could pass:

| Step | Why |
| --- | --- |
| A baseline commit, then the setup as a second commit | The audit's `patch-integrity` check runs `git diff --check HEAD^ HEAD` and needs a parent. |
| `.gitignore` entries for `node_modules` and the `.ramify*` view directories | In `/ramify` only the toolkit's root `.gitignore` ignores them. Without them `git-clean` fails, or gate commits pick up generated views. |
| A minimal `ramify-agent.json` (`typeCheck.output: tsc`) | Readiness requires the project configuration. |
| The plan at `plans/28-design-review-guidance-sessions/plan.md`, with its two open decisions settled | Plan discovery reads `plans/<id>/plan.md`. Plan 28 is untracked, so a Git-based copy lacks it. Dan settled the decisions: the name stays "design review", and the work item leaves the prepared-session key. |
| The postmortem link left unchanged | Plan evidence follows Markdown links transitively. A link into `docs/analysis/` reaches a postmortem with absolute `/home/app` links, and `start-run` then refuses with "Plan evidence cannot be captured". Left as written, the link resolves to a missing file, which the run records only as a gap. |
| `skills/module-architect` replaced by its files (added after run 1) | See [S1](#s1-a-tracked-symlink-leaves-the-project). |

## Run 1: `20261009T204430Z-684768`

The analysis took about 11 minutes: seven invocations, ending with 1 entry
capability, 8 hypotheses and 1 work item. The readiness audit then ran all
six configured checks. Its vitest suite failed, and the run ended `internal`:

```text
The transaction is 14454948 bytes, over the 8388608-byte line bound;
write it to a file beside the log and reference it
```

### S1. A tracked symlink leaves the project

ramify-agent tracks `skills/module-architect` as a symlink to
`../../.claude/skills/module-architect`, a directory of the surrounding
toolkit repository. In a standalone copy the link dangles. The initial
architect's prompt package reads `skills/module-architect/SKILL.md`, so 34
test failures were `ENOENT` on that file, and the tests that depend on those
packages failed with them.

This breaks the rule that ramify-agent is self-contained. It will also break
the planned move to its own repository. In the copy, commit `8a1efde`
replaced the link with the committed files of `2b41b49a`. After that, three
of the failing test files passed (86 tests).

### H1. A large failed-gate transaction ends the run

The ledger refuses any line over 8 MiB (`maximumLineBytes`,
`subs/harness/subs/ledger/src/ledger.ts:8`, raised at `:234`). The
`readiness-failed` transaction carries the attempt's `detail` and its
`ReadinessAttempt` record (`subs/harness/src/run/log.ts:246`). With
ramify-agent's suite failing, that transaction reached 14.4 MB; the audit's
own `summary.json` alone is 5.2 MB. The `RangeError` escapes `drive` and
becomes `fail(run, 'internal', …)` (`subs/harness/src/run/service.ts:3222`).

So a project with a large failing suite cannot report a readiness failure,
and the same holds for any gate. The error message already names the fix:
store the body beside the log and reference it.

### H2. The private daemon stays dead after a failure

After run 1, `start-run` refused four times in a row with "The architect view
could not be materialized: … analysis-failed: Session worker exited (1)".
The same `ramify materialize --view architect` succeeded from a shell, which
used the shared daemon rather than the server's private one. Restarting the
server created a fresh private daemon, and the start went through. Run 2
shows the cause: see [R1](#r1-the-analysis-worker-runs-out-of-heap) and
[R2](#r2-a-dead-session-is-never-replaced).

## Run 2: `20261009T210416Z-92993c`

Run 2 lasted from 21:04 to 21:37 UTC:

1. **Analysis:** 1 entry capability, 6 hypotheses and 1 work item, `wi-001`
   in `ramify-agent/harness`.
2. **Readiness:** passed at attempt 1, so S1 was the only problem in the
   suite.
3. **Local architect:** inv-0008 ended `context-budget-reached`, and a fresh
   session (inv-0009) took over. Context selection, the context package and
   the outline followed.
4. **Engineer:** iteration `wi-001.i01` went to the engineer (inv-0012,
   219 s), which submitted `partial`.
5. **End:** the next ownership query failed, and the run ended `internal`:

   ```text
   ramify ownership query exited with 1: … invalid-project:
   Export "orientationKey" is absent from subs/harness/subs/reviews/src/inputs.ts
   ```

The engineer's submission explains the partial:

- It never received its API views, because "materialization failed with the
  same session-worker analysis error".
- After its first two edits, every later edit was refused as outside its
  scope. The refusal named paths under `subs/harness/` and
  `subs/harness/subs/reviews/`, both inside its writable roots.

It left two uncommitted edits:

- `orientationKey` renamed to `preparedGuidanceKey` in
  `reviews/src/inputs.ts`;
- `orientationSubmissionSchema` removed from
  `reviews/src/interfaces/submissions.ts`.

### R1. The analysis worker runs out of heap

The private daemon's log recorded `FATAL ERROR: … JavaScript heap out of
memory` at 21:25:52 UTC. That was during the readiness gate, before the
engineer started. The shared daemon, which was also observing the copy,
failed the same way at about 21:27:51. Its last client had left at 21:03, so
background re-analysis alone killed it.

ramify.ts 0.4.1 runs analysis in a worker thread whose old generation is
fixed at 512 MiB: `resourceLimits.maxOldGenerationSizeMb`, set from
`workerHeapMiB: 512` in `dist/src/resident-budgets.js:13`. The worker refuses
heap-flag overrides. On ramify-agent the worker holds about 316 MB after the
first architect materialization. After a few edit and rematerialize cycles it
holds 478–494 MB, and the fatal collection happened with 410 MB live, during
a large `Map` rehash. The project fits, but with no headroom.

The harness makes this worse. Its session-operations store lives inside the
project at `plans/.harness/session-operations/`, and Ramify counts those files
as observed inputs. A reproduction on a separate copy showed:

- 300 new files raised observed inputs from 8,678 to 8,981.
- A single new file caused a full revision on the next 30 s sweep, about
  11 s of analysis.
- Creating a file every 2 s kept the daemon reconciling for 9 minutes.
- One materialize then took about 5 minutes and returned dependencies
  unavailable (`wait-limit`).

Adding `owned-unwired "plans"` to the root `module.ramify` brought observed
inputs from 12,343 down to 8,673. Afterwards, 50 new files under
`plans/.harness` caused no revision over 75 s. The collection-review fixture
already declares `owned-unwired "plans"`; ramify-agent does not.

### R2. A dead session is never replaced

When the worker dies, the daemon keeps its context "warm" and "reconciling"
with a dead session. The sweep failure path
(`dist/subs/daemon/subs/contexts/src/context-manager.js:1173-1191` in
ramify.ts 0.4.1) marks the context reconciling and fails waiters. It never
closes and reopens the session. Fifteen minutes after the crash,
`ramify check --changed` through that endpoint still answered
`analysis-failed: Session worker exited (1)`. The exit code is the
supervisor's default (1), because the supervisor process dies before it
sends an exit message.

This explains H2, the engineer's missing API views, and its failing hook
checks.

### H3. A failed placement query refuses every write as out of scope

The write guard asks Ramify where each path belongs. When that query throws,
the guard refuses every path:
`catch { return paths.map(() => false); }`
(`subs/harness/src/guard/write-guard.ts:146`). The engineer then reads "lies
outside every location this assignment may write" for paths that plainly lie
inside its roots, with no hint of the real cause. The placement query is
`affected --batch` (`subs/harness/src/work/scope.ts:462`). Batch analysis is
not subject to R2, so once the rename had made the project invalid, the
guard was refusing because of that rename.

### H4. An invalid module description ends the run

A module description becomes invalid when a source edit removes or renames a
symbol the description exposes. That is the normal intermediate state of any
change that retires an exposed symbol. Once the description is invalid:

- `queryOwnership` throws on any non-zero exit
  (`subs/harness/subs/evidence/src/ramify-cli.ts:154`).
- `checkWriteScope` documents that "the query's own failure is the
  provider's, and propagates" (`subs/harness/src/work/scope.ts:546`).
- The error escapes `drive` and the run ends `internal`.

Nothing turns `invalid-project` into a description diagnostic for the
engineer or the local architect. Through H3, the guard also refuses the
`module.ramify` edit that would repair it, although that file is in the
engineer's own area (`scope.ts:205`).

**This defect will stop every rerun of Plan 28.** The plan removes
`orientationMessage`, `orientationToolName`, `orientationJsonSchema`,
`orientationSubmissionDescription` and `validateOrientation`. The reviews
module exposes all of them in `subs/harness/subs/reviews/module.ramify`. The
first removal invalidates the description unless the engineer edits
`module.ramify` first, and nothing tells it to. The rename of
`orientationKey` was not asked for: the plan keeps the existing key. It only
hit the trap first.

### H5. The session-operations store grows quadratically

After the two runs, `plans/.harness/session-operations/` held 1.37 GB in 1,808
files. Almost all of it is `store/record-bodies/`: each tool step writes a
new body containing every earlier effect of its invocation. For example:

| Invocation | Bodies | Size | Effects in the last body |
| --- | --- | --- | --- |
| inv-0008 (local architect, budget reached) | 260 | 425 MB | 78 |
| inv-0009 (local architect) | 279 | 318 MB | 83 |
| inv-0012 (engineer) | 176 | 165 MB | 46 |
| inv-0004 (initial architect) | 180 | 63 MB | 26 |

The largest body is 2.9 MB, nearly all repeated tool results (about 52 KB
per pi read result). These operation IDs are reused across the two runs, so
the rows may combine both. The growth stays quadratic either way: a
100-effect invocation writes about 100 times its own output. These files are
also what R1's churn consists of.

### O1. The start blocks while views materialize

`start-run` did not answer for about two minutes on ramify-agent, while it
materialized the architect view. A plain `curl` with the default timeout
gives up first. The run had been accepted; only the response was slow.

## Proposals

The proposals are ordered by what a rerun needs. P1–P3 are harness changes
on the `ramify-agent` branch, each with focused tests on the scripted agent
and a full audit before merge. P4 is a copy-setup change. P5 needs a toolkit
release.

### Needed before a rerun

**P1. An invalid module description becomes a repairable finding (H3, H4).**

- The guard reports a failed placement query as that failure, naming
  Ramify's diagnostic. It does not answer "outside scope".
- When the project is invalid, the assigned owner's own `module.ramify` (and
  any `module.ramify` the assignment already authorizes) stays writable
  without a placement answer. The owner's area is known statically
  (`scope.ts:205`), so the guard needs no query for it.
- The hook check and the iteration gate return `invalid-project` to the
  engineer as a description finding in the assigned scope. The engineer
  repairs it like any other violation, and the iteration cannot pass while
  it stands. An invalid description in a module outside the assignment goes
  to the local architect.
- One sentence in `engineer.procedure.md`: when you remove or rename a
  symbol your module exposes, change its `module.ramify` exposure in the same
  step.

**P2. The harness restarts its private daemon when the daemon reports a
dead worker (H2, R2).** On `analysis-failed` or `resource-unavailable` from
its own endpoint, the harness runs `ramify daemon stop` once and retries,
for materialization and the hook check. It does not end the run or degrade
silently. The harness owns this daemon, so recovering it is in scope until
ramify.ts replaces dead sessions itself (P5). Record each restart as an
event, so a run shows how often it happened.

**P3. Large gate transactions are stored beside the log (H1).** Bodies above
a threshold go to a file under the run directory, and the line references it
by hash, as the ledger message already suggests. A failed gate's evidence
should point to the audit report the audit already publishes under its refs,
not copy it inline.

### Copy setup for the rerun

**P4.** In the rerun copy:

- Add `owned-unwired "plans"` to the root `module.ramify` (R1). Placement
  does not depend on plans being owned: the fixture already declares this.
  Whether ramify-agent's own description should declare it as well is a
  separate change; I suggest yes. Any project the harness serves gets its
  record store under `plans/`.
- Keep `8a1efde`'s inlined skill until S1 is fixed at the source.
- Start a fresh server, so no stuck daemon carries over.

### Follow-ups that need no rerun

- **S1:** replace the `skills/module-architect` symlink with files owned by
  ramify-agent, or have the prompt package read the skill from a path inside
  the project. Today the harness's prompts depend on the toolkit checkout.
- **H5:** store each step's new effects as a delta, not the cumulative list,
  or rewrite one body per invocation in place. Move the store outside the
  project tree, or keep it under a directory every served project declares
  `owned-unwired`.
- **O1:** answer `start-run` once the run is accepted, and materialize
  afterwards as the first event, or document the delay in `real-session` and
  the README.
- **A self-run preparation script.** `trial prepare` assumes the fixture and
  the `collection-review` directory name. A `--self` preparation, or a short
  section in the README, would record the steps in [Setup](#setup).

### ramify.ts (P5, a toolkit release)

- Dispose and reopen (or evict) a context whose session worker died, instead
  of keeping it reconciling forever.
- Size the worker heap from the project, or make it configurable. ramify-agent
  idles at 300–490 MB of a fixed 512 MiB.
- Keep directories that hold only inert files from triggering full
  re-analysis, even when a project has not declared them `owned-unwired`.
  Whether this is needed once P4 is the norm is a question for the toolkit's
  daemon design.

## Decisions for Dan

1. **Fix P1–P3 before rerunning?** Suggestion: yes. H4 is certain to stop
   any rerun of Plan 28. P2 and P3 are small, and without them the next
   heap exhaustion or large failure ends the run again.
2. **Add `owned-unwired "plans"` to ramify-agent's own `module.ramify`?**
   Suggestion: yes, together with P1–P3, so the copy needs no setup edit for
   it.

## Evidence

Copied to `/home/app/ramify-trial-evidence/plan28-selfrun-20261009/`:

- run 1: `events.jsonl` and the readiness audit invocation;
- run 2: `events.jsonl`, the engineer's invocation (`inv-0012`), its
  iteration records and its uncommitted diff;
- both server logs;
- the shared daemon's log with the OOM.

The private daemon's log (`/tmp/ra-ZEChrS/`) was removed when the server
stopped. The excerpts above come from the investigation.

The copy itself, with its run branches and the 1.37 GB record store, stays at
`/home/app/ramify-selfrun-plan28/ramify-agent` until it is no longer needed.
