# Iteration 3 results: observed mutation and check settlement

H01–H04 provider capabilities are implemented and verified with independent
ordinary scripted controls. Equipment/run wiring remains iteration 10 work;
this receipt does not claim integrated runtime or whole-plan acceptance.

## Identity and write boundary

- Worktree `/home/app/ramify-plan23-03-hooks`, branch `feat/plan23-03-hooks`.
- Base `97aa9430bf588c0b4daefc7604bec3d775e2ff0e`, including accepted iteration 0
  execution-v1 contracts, fixture contracts and exact write sets.
- Result HEAD is the commit containing this receipt; resolve with
  `git log -1 --format=%H -- ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/03-results.md`.
- Changed production: `subs/harness/src/hooks/post-write.ts`,
  `subs/harness/src/hooks/mutation-order.ts`, `subs/harness/src/tools/shell.ts`.
  New test: `subs/harness/src/tests/plan23-mutation-order.test.ts`. This receipt
  is the fifth changed path. Existing hook-checks tests remain unchanged.
- No equipment, shell classification, service/records, declaration, runner,
  registry, manifest, package or lockfile changes. Main/other worktrees and
  their indexes were not edited. No push or merge performed by this worker.

## Implemented capability evidence

| Row | Implemented behavior and actual control |
| --- | --- |
| H01 | Explicit known paths, unknown observation and pre-execution refusal. Only comparable complete same-scope content inventories establish known-empty. Added/deleted/edited paths are retained. Empty/refused mutations skip without clearing findings; unknown performs the full fallback and records its changed-path gap. Nonzero exit with actual writes still checks. Executor rejection observes again, retains unknown effect and settles the check before propagating the original error. Completion explicitly checks independently after a skipped empty mutation. |
| H02 / F3 | Worktree FIFO lease covers command execution, snapshots, checking, logging and settlement. Three overlapping shell requests reserve distinct identities before queueing, with later check promises ready in reverse order; trace proves A mutation/check/settlement precedes B and C. Distinct roots proceed independently. Concurrent direct checks cannot reuse stale `ran` log numbers or clear later findings out of order. Lease denial/release, handler throw, executor+observation failures, wrong/released lease, queued cancellation, active Stop and late dispatch fencing are controlled. |
| H03 | Incomplete/changed-input checks establish no project verdict and fabricate no violation. Actual incomplete diagnostics survive and earlier findings remain; removed identities/coverage cannot clear them. Cancellation during a checker retains earlier findings even when its late response claims a pass. Cancelled pre-check settlement runs no provider and records not-checked with no log/provider claim. |
| H04 | An explicit current-role submission policy supplies legal outcome names and completion name for new, repeated and completion-refusal messages. Capability-role controls advertise `capability-needed`, `partial` and `completion-proposed`, without substituting `contract-needed`. Old callers retain their prior default during integration sequencing. |

The tests script command outcomes, raw provider documents and controlled
promises, using the actual provider decoder. They never launch real shell,
Ramify, Git, Cucumber or a model. Temporary filesystem writes are limited to
test log observations. No scheduler or finding outcome is a model/architect
semantic completion decision.

## Executed verification

Independent `npm ci` from this worktree's `ramify-agent/` passed; committed pins
and lockfile remain unchanged. Log `/tmp/ramify-plan23-03-npm-ci.log`.
Ordinary/testing API discovery was refreshed separately before using the
evidence owner's declarations:

```sh
node_modules/.bin/ramify materialize --from subs/harness/src
node_modules/.bin/ramify materialize --from subs/harness/src/tests
```

Both passed, 2 targets/849 entries, revision
`rev/1:c39f811b-4c90-40da-b171-806fa2563341:1`. Ordinary `_meta.json` records
coverage 1/truncated 1; testing records coverage 15/truncated 1. These explicit
limits are not absent-API proof. Logs
`/tmp/ramify-plan23-03-api-ordinary.log` and
`/tmp/ramify-plan23-03-api-testing.log`. Generated views were neither edited nor
committed. Architect-refresh failure is already recorded by iteration 0 and
remains qualification debt; no complete architect view is claimed here.

Commands below ran from `ramify-agent/` with focused workers capped at two:

```sh
npm run test:quick -- subs/harness/src/tests/hook-checks.test.ts subs/harness/src/tests/plan23-mutation-order.test.ts --maxWorkers=2
npm run test:quick -- subs/harness/src/tests/shell-tool.test.ts subs/harness/src/tests/hook-run-boundaries.test.ts subs/harness/src/tests/engineer-failures.test.ts --maxWorkers=2
npm run type-check
npm run check:self
```

- Required final focused checks passed **2 files/47 tests**, duration 2.43s:
  unchanged 25 hook tests plus 22 new controls. Log
  `/tmp/ramify-plan23-03-focused-final.log`.
- Affected shell/hook/engineer regressions passed **3 files/24 tests**, duration
  5.75s. Log `/tmp/ramify-plan23-03-regressions.log`. The final rejection-path
  error-preservation change is additionally covered by the final focused
  controls, rather than claiming the earlier regression execution followed it.
- Final type-check passed all configured harness, web, scripts and browser
  script compiler scopes. Log `/tmp/ramify-plan23-03-types-final.log`.
- Final `check:self` passed actual installed structural CLI checking; partial
  coverage remains reported by that CLI: 12 owners, 644 source files,
  50 resources, 12,517 accesses; 0 errors, 0 warnings and 313 analysis limits;
  9,211 allowed, 0 denied and 3,306 external accesses. Log
  `/tmp/ramify-plan23-03-structure-final.log`. This is structural checking,
  not a native test scenario or full audit claim.
- `git diff --check` passed. Baseline old hook tests passed 25/25 before edits.
  Initial new fixture/type checks exposed test.each array argument spreading
  and assumptions about asynchronous shell admission; these were corrected
  with object fixtures and explicit reservation barriers, then final checks
  passed. No production requirement was relaxed to obtain passing controls.

No whole suite or full audit was run here. The accepted base retains the
iteration-0 native project-boundary DataView architect-materializer failure;
Q03/full configured qualification remains iteration 14, not a passing skip.

## Iteration 10 integration recipe

Use one `MutationOrder` keyed by the canonical project root across shell,
guarded tools and completion checks, including when command cwd is a nested
module. `resolve()` normalizes relative roots; the integrator supplies a common
canonical identity for any aliases/symlinks. Different run roots must not
accidentally share a key. The lease protects the entire mutation/check/observation
lifecycle, not just a checker callback.

For shell, supply `ShellOptions.mutation`: shared order/root, synchronous
`reserve(call)` using the invocation's `FindingsSeen.reserveCheck()`, actual
snapshot provider, and `settled`. Map each admitted call to its reservation
before awaiting execution. `settled` receives result/change/held lease/signal;
call `runHookCheck` with those, the reservation, and the role's current
`HookSubmissionPolicy`, then settle hook, coverage and transcript observations
inside that callback. Return its text for the shell response. Avoid a second
command hook in old `afterMutation`, which would duplicate checking/reacquire
the held lease. Reservations can contain gaps when commands are denied or
unchanged; on recovery initialize their lower bound from persisted maximum
identity, not a count of physical checks.

Snapshots require complete file/content identities for the declared project
inventory, including additions/deletions and configuration. `scopeIdentity`
identifies that inventory/exclusion policy, not its changing content revision.
Incomplete inventories, unavailable observations or changed inventory policies
must report unknown. Unchanged guessed Git status, a lexical command category
or an LLM assertion cannot prove known-empty. Job/output placement follows
iteration 13's actual owned-unwired contract, with no guessed toolkit/global
ignore. A rejected executor retains unknown effect even after observation;
this provider does not establish effect-safe reuse from a checker verdict.

For guarded builtins, acquire a lease before mutation authorization/execution
and reserve the identity synchronously. On guard denial release immediately:
denied calls do not receive `afterMutation`. On successful mutation, invoke the
hook inside the held lease, settle all observations, then release in `finally`.
On a thrown handler, observe actual changes or retain unknown, check/record
truthfully as permitted by cancellation, settle observations and release in
the outer finalizer. Stop/cancellation must await active effect settlement;
queued actions are refused before execution, while active leases remain held
through settlement. Denied, thrown and stopped paths cannot rely exclusively
on the successful `afterMutation` callback for releasing their lease. The
agent-owned uncertain-effect recovery contract remains authoritative.

Completion must independently call `runHookCheck` with `purpose: 'completion'`
inside the same order/lease, and with the actual write scope or explicit
unknown scope as appropriate. Its supplied policy must match the submission
validator; pass it to `openFindingsMessage` too. Unknown or empty completion
scope requests a complete check, without a fabricated mutation-gap claim.
An earlier empty/refused mutation cannot waive completion checking. A cancelled
check remains not-checked and cannot clear findings or establish a pass.

Default old callers remain compilable but do not provide shell snapshots or
guarded-tool lease ownership. H01–H04 qualify the new provider contracts;
cross-tool integrated guarantees require iteration 10's explicit wiring and
cross-boundary controls. No capability completion, live provider support,
performance improvement or production acceptance is inferred here.
