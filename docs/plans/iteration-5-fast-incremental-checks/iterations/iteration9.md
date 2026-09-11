# Iteration 9: Contexts on the session driver and Plan 2 engine removal

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 8 (`hosting`: the worker-hosted session with the
sweep, deadlines and levels). **Owners:** `subs/daemon/subs/contexts/`,
`subs/daemon/` and root; the Plan 2 amendment in
`docs/plans/done/iteration-2-resident-verification/` and the harness.

## Goal

Drive each context from one retained session instead of a per-revision
increment: revisions from the session's observed inputs, a compact history
with the report projected on demand, the covered-identity rendezvous, the
`cold` and `deadline-exceeded` outcomes, hot and warm contexts, and the
scheduled sweep and idle audit. In the same commit, delete Plan 2's engine
core and record the supersession amendment.

## Read first

- [contracts.md](../contracts.md#contexts-the-session-driver-revisions-and-requests):
  the revised `AnalysisDriver`, `ContextRevision`, `CheckRequest`,
  `CheckDelta`, `CheckOutcome`, `ContextBudgets` and every manager rule;
  [Root: the service vocabulary and the driver](../contracts.md#root-the-service-vocabulary-and-the-driver)
  for `createSessionDriver`; [Removed names](../contracts.md#removed-names).
- [scope.md](../scope.md#live-updates-and-the-covering-rule): Live updates and
  the covering rule; [The sweep](../scope.md#the-sweep);
  [Deadlines and cold contexts](../scope.md#deadlines-and-cold-contexts);
  [Plan 2 supersession](../scope.md#plan-2-supersession) in full.
- [owners.md](../owners.md): Contexts, Daemon, Root, Analysis and the four
  iteration 9 rows of the activation manifest.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 7 and 9;
  [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  item 4; matrix rows I5-09 and I5-10; the supersession risk row.
- Source: `subs/daemon/subs/contexts/src/{context-manager,context,queue,history,tokens}.ts`
  and `src/interfaces/contexts.ts`; `src/resident-assembly.ts`,
  `src/resident-budgets.ts` and `src/tests/quick-environment.ts`;
  `subs/analysis/src/{increment,retained-products,run-analysis,session}.ts`.
- Plan 2 [contracts](../../done/iteration-2-resident-verification/contracts.md)
  and [subcases](../../done/iteration-2-resident-verification/subcases.md):
  the records this amendment retires and the ones that stay required.

## Deliverables

1. `interfaces/contexts.ts` revised inside X2: `AnalysisDriver.open` returning
   a `SessionOpen` in place of `check`; `ContextRevision` carrying the checked
   set, delta counts and timings and losing `reused`; `CheckRequest` carrying
   `scope`, `since` and `deadlineMs`; `CheckDelta`; `CheckOutcome` gaining
   `cold` and `deadline-exceeded`; `ContextBudgets` gaining `maxHotContexts`,
   `sweepIntervalMs` and `updateDeadlineMs` and losing
   `verificationIntervalMs`; `RevisionCause` gaining `sweep`;
   `ContextStatus.session`.
2. Manager rules as contracts.md fixes: `open` calls `driver.open` once per
   context and holds the handle; watcher batches and sweep results become
   `session.update` calls under Plan 2's queue, debounce, cancellation and
   supersession rules; a synchronized request whose `expect` identities are
   covered by the published revision is answered from it with
   `reusedRevision: true` and no update, and otherwise its paths join the next
   update; history stores headers, diagnostics, warnings, coverage and deltas
   within the Plan 2 limits and projects a report through `session.report`
   only for `scope: 'report'` or a `published` read naming a revision; a
   `since` revision no longer retained is `evicted-revision`; deadlines
   produce `cold` or `deadline-exceeded` while the update continues;
   `maxHotContexts` demotes the least recently used context through
   `session.releaseCompiler()`; sweeps and the idle `verify` are scheduled as
   scope.md fixes and a mismatch increments `auditMismatches`.
3. Daemon N5 gains `CheckDelta`; root R7 relays it; root R3 loses the six
   increment names and gains the thirteen session names; root's project R4
   line gains the five observer names.
4. Root `src/resident-assembly.ts` exports `createSessionDriver()`
   implementing the revised port over `openRetainedSession` with Plan 2's
   limits plus the session limits from `resident-budgets.ts`;
   `createAnalysisDriverFromSessions` is removed. `src/tests/quick-environment.ts`
   builds its environment over the session driver.
5. Removal of Plan 2's engine core in this commit:
   `subs/analysis/src/increment.ts`, `subs/analysis/src/retained-products.ts`,
   the retained input of `run-analysis.ts` and the retained variant of
   `session.ts`, the `InputChange`, `RetainedStageId`, `RetainedStage`,
   `RetainedAnalysis`, `IncrementInputs` and `IncrementRun` types, their tests
   `src/tests/increment.test.ts` and `src/tests/retained-products.test.ts`,
   and analysis A9's `analyzeIncrement` line. `resolveProject`,
   `analyzeProject`, `createAnalysisSession`, `validateProject` and
   `acquireInventory` stay.
6. The Plan 2 amendment
   `docs/plans/done/iteration-2-resident-verification/supersession-plan5.md`
   recording the ten retired instances with the I5 instance that supersedes
   each: `I2-10:null-changes-no-reuse` and `I2-10:configuration-rerun` by
   `I5-07:configuration-broad`; `I2-10:metadata-only-reuse` by
   `I5-07:readme-metadata-only`; `I2-10:exposure-only-reuse` and
   `I2-10:header-tag-rerun` by `I5-07:description-relink-subtree`;
   `I2-10:source-rerun` by `I5-06:export-added-importers`;
   `I2-10:absent-appears-rerun` by `I5-07:created-importing-file`;
   `I2-10:dependency-rerun` by `I5-07:dependency-broad`;
   `I2-10:products-plain` by `I5-06:unchanged-surface-no-propagation`; and
   `I2-11:reuse-equal` by `I5-07:audit-equal-sequence`. The file records the
   user's acceptance date, and `plan2-instances.ts` marks exactly those ten
   records `superseded` so `--plan 2` requires the remaining 166 plus the
   named counterparts. The four `I2-10` resolution instances and every
   contexts, IPC, host, CLI, lifecycle and equivalence record stay required.
7. Tests: contexts `src/tests/{session-driver,covering,deadlines,hot-budget}.test.ts`
   with the scripted session handle in `src/tests/scripted-driver.ts`, and
   extensions of `src/tests/history.test.ts` for the compact history; root
   `src/tests/resident-assembly.test.ts` for `createSessionDriver`.

## Matrix rows executed here

- I5-09: `session-driver-open` (one `driver.open` per context, revision 1
  equal to batch); `revision-from-session`; `covered-immediate` (no update
  call); `flush-on-uncovered` (exactly one update carrying both);
  `unobserved-input`; `superseded-mismatch`; `history-compact` (headers and
  deltas within budget, report projected once on demand);
  `cold-explicit` and `not-checked-at-deadline`; `hot-budget-demotion`.
- I5-10: `increment-removed` (no removed name anywhere in the build);
  `plan2-gate-amended` (`--plan 2` passes with ten superseded records and 166
  required); `plan2-contexts-regression` (the Plan 2 contexts, host, IPC, CLI
  and lifecycle groups pass on the session driver).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/daemon/subs/contexts/src/tests/session-driver.test.ts \
  subs/daemon/subs/contexts/src/tests/covering.test.ts \
  subs/daemon/subs/contexts/src/tests/deadlines.test.ts \
  subs/daemon/subs/contexts/src/tests/hot-budget.test.ts \
  subs/daemon/subs/contexts/src/tests/history.test.ts \
  src/tests/resident-assembly.test.ts
npm test
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run reference:verify -- --plan 5 --iteration 9      # requires 2 to 9
npm run reference:verify -- --plan 2                    # passes with the recorded supersession
npm run reference:verify -- --plan 1                    # unchanged on this build
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `unit` over `M` for most of I5-09, `quick` over `Q/R` for
`session-driver-open`, and `process` for I5-10. Expected intermediate
failures: the unfiltered `--plan 5` gate, and the CLI, live and measurement
capabilities. Removing a Plan 2 record other than the ten named ones must fail
`--plan 2`; that behavior is I5-02's `removed-record-fails` analogue for the
amended gate and is checked here by restoring the deleted record after the
negative run.

## Exit criteria

- Contexts drive one retained session per context, answer covered requests
  without analysis, and produce `cold`, `deadline-exceeded`,
  `unobserved-input` and `superseded` explicitly.
- Plan 2's engine core is gone, the amendment is recorded with the user's
  acceptance, and `--plan 2` and `--plan 1` pass on this build.
- Every I5-09 and I5-10 instance ran and asserted its own expectation.

## Handoff

Iteration 10 puts the compact reply on the wire and behind
`ramify check --changed`; iterations 11 and 12 run the live gate and the
measurements over this driver. `CheckDelta`, the extended `ContextRevision`
and the `cold` and `deadline-exceeded` outcomes are the values the CLI renders
and the exit mapping consumes.
