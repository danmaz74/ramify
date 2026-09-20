# Iteration 1: Extract `harness/evidence` and move jobs onto the ledger

**Goal:** give the evidence boundary its own module and make the harness's job
code write durable state only through `harness/ledger`, while the harness
behaves exactly as it does today.

The justification and the exact exposures are in the main plan:
[why `harness/evidence`](../main-plan.md#why-harnessevidence-is-extracted),
[why `harness/jobs` is not extracted](../main-plan.md#why-harnessjobs-is-not-extracted)
and [exact public exposures](../main-plan.md#exact-public-exposures).

## Prerequisites

Iteration 0's baseline, and iteration 0B: `harness/ledger` exists with its
tests. Nothing from iteration 0's port contract is needed here.

## Write scope

`subs/harness/`. No change to `subs/web/`, `subs/harness/subs/agent/`,
`subs/harness/subs/ledger/`, the root `module.ramify`, `src/` or `fixtures/`.

## Interfaces established

`RecordRef`, `commitRecord`, `readCommitted`, `recoverCommits` and `effect` in
the harness's own `src/jobs/commit.ts`, a thin adapter over the ledger, plus the
exposures the main plan lists for `evidence`.

## Work

### `harness/evidence`

Declared at `subs/harness/subs/evidence/` with its `README.md`. It receives
`mapping/ramify-cli.ts` and `mapping/views.ts` unchanged in content, as
`ramify-cli.ts` and `views.ts` in its own `src/`. Its `module.ramify` is the one
the main plan gives, minus `run-command.ts`, `measure.ts`, `guarded-files.ts`
and `git.ts`, which iteration 2 adds. `mapping/validate.ts` stays with the
harness until iteration 5 converts it.

### Jobs on the ledger

The job code stays in the harness's own `src/jobs/`; no module is declared for
it, since the run will be the only kind of job. `jobs/log.ts` stops writing
`events.jsonl` itself and appends through the ledger, keeping the job event
schema, the sequence as the job's version and the terminal-event rules. The
command-acceptance part of `jobs/service.ts` becomes `jobs/commands.ts`:
`CommandLedger`, `CommandRejection` and `commandHash`, with the three rules of
Plan 1's contract item 4 intact. The mapping job keeps running on this code
until iteration 5 converts it, which gives the move a living consumer and its
existing tests.

### The commit rule

New `src/jobs/commit.ts`, a thin adapter over the ledger that applies rules 2,
3, 4 and 9 of the
[proposal](../core-records.proposal.md#eleven-rules-the-structures-follow) to
job records, for every record kind:

- `commitRecord(log, { eventType, records: [{ path, id, revision, body }] })`
  appends **one** log line holding every record body of the transition; the
  ledger then writes each record file as a materialized copy. The append is the
  commit.
- A transition already in the log is not appended again. A file that differs
  from its body in the log is rewritten from the log.
- `readCommitted` returns `valid`, `unsupported-version` or `invalid`. The last
  two are failures with evidence, never an absent record.
- `recoverCommits` replays the log on load and rewrites every record file that
  is missing or differs. It is one loop for every record kind and calls no
  agent.
- `effect(log, { key, intent, perform, complete })` records an intent, performs
  an external effect with its idempotency key and records the completion; on
  load, an intent without a completion is performed again.

None of this reimplements what the ledger does: torn lines, flushing, replay
and materialization are the ledger's, and are tested there.

### Harness-side changes

`store/atomic.ts` and `store/jsonl.ts` are gone into the ledger by iteration 0B;
`store/lock.ts` and `store/state-directory.ts` stay and use the ledger's file
primitives. Imports across the harness move to the new paths. Record the
exposed names before and after.

## Acceptance cases owned

None. This iteration is a foundation; its exit evidence is its own.

## Guards owned

| Guard | Test |
| --- | --- |
| A transition already in the log is not appended again; an external effect repeated with its key happens once | `subs/harness/src/tests/commit.test.ts` |
| A reader returns valid, unsupported version or invalid, never an absent record | `subs/harness/src/tests/record-reader.test.ts` |
| A crash before a transition's log line leaves no trace; a crash after it re-materializes every file, with no agent call and no duplicate | `subs/harness/src/tests/commit-recovery.test.ts` |

## Exit evidence

- The architect view before and after, with the exposed-name inventory compared:
  only owner and source path change for the moved names, and no new exposure
  reaches the root.
- `.ramify-architect/` lists the root, `harness`, `harness/ledger`,
  `harness/evidence`, `harness/agent`, `harness/agent/pi` and `web`.
- The mapping job's behavior is unchanged: `mapping.test.ts`, `jobs.test.ts`,
  `recovery.test.ts`, `approval.test.ts` and the HTTP tests pass without
  changes beyond import paths.
- The three guard tests above.
- The measured size of `harness`'s own production source after the move,
  compared with the 28 files and 156,355 bytes the main plan recorded.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
