# Iteration 1 results: `harness/evidence` and jobs on the ledger

**Date:** 2026-09-20. **Status:** complete. The [brief](iteration1.md) is
satisfied: `harness/evidence` is declared with its README and the exposures the
main plan lists, minus the four files iteration 2 adds; the harness's job code
writes `events.jsonl` only through `harness/ledger`; `src/jobs/commit.ts` holds
the commit rule and `src/jobs/commands.ts` the acceptance of a command; and the
mapping job runs on that code with its behavior unchanged.

`npm run check:self` reports `ramify-agent/harness/evidence` as a seventh
owner. The architect view records its `uses` as empty and its `usedBy` as
`ramify-agent/harness` alone, so "it returns its own types and receives nothing
from the harness" is enforced and not a convention.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches iteration 0B's exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  29 passed (29)
                                  Tests  209 passed (209)
=== npm run build:web ===    ✓ 287 modules transformed.   EXIT: 0
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 6 owners, 87 source files, 3 resources, 924 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 533 allowed, 0 denied, 391 external
                             EXIT: 0
```

## 2. Architect views this iteration worked from

Both were refreshed with `node_modules/.bin/ramify materialize --view architect`
from `ramify-agent/`, the first before any change and the second after the work,
before any claim about the module tree.

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:a01bbb9d-9596-435b-9c8b-bb3f0ec448d8:3` | `rev/1:28de61c9-1d3d-46c2-a462-630be6d5ae6a:1` |
| Input identity | `input/1:1b60c796d6f56ff41cb4efa27233557672c01a5d36d4ae70dd984a9b45a54f55` | `input/1:f7d9100d0604055b81b8071de5954fc0d102f86f5b183770c6e3a191e3c88742` |
| Modules, records | 6, 376 | 7, 401 |
| Dependencies | **unavailable (wait-limit)** | measured |
| Test references, metrics, cut | unavailable, measured, 98 | measured, measured, 102 |

The before view reports `dependencies unavailable (wait-limit)`, which is the
daemon behaviour the harness's own README records: after a directory is added to
the project, a materialization in the same daemon context waits about 125
seconds and then publishes without dependency facts. It cost that view its
`uses`, `usedBy` and test references; it does not affect the exposed-name
inventory below, which is read from each module's `behavior.jsonl` and
`supporting.jsonl`. The after view was taken from a freshly stopped daemon and
has dependencies measured. Neither view's cut is zero, so an absent detail in
either is not evidence that behavior is absent.

Iteration 0 recorded that the revision UUID is fresh on every materialize and
that the input identity covers every directory listing, so neither value's
change is evidence of source drift on its own.

### The module list

`.ramify-architect/` lists exactly the seven modules the brief requires.

| Module | Directory | Parent |
| --- | --- | --- |
| `ramify-agent` | *(root)* | none |
| `ramify-agent/harness` | `subs/harness` | `ramify-agent` |
| `ramify-agent/harness/agent` | `subs/harness/subs/agent` | `ramify-agent/harness` |
| `ramify-agent/harness/agent/pi` | `subs/harness/subs/agent/subs/pi` | `ramify-agent/harness/agent` |
| `ramify-agent/harness/evidence` | `subs/harness/subs/evidence` | `ramify-agent/harness` |
| `ramify-agent/harness/ledger` | `subs/harness/subs/ledger` | `ramify-agent/harness` |
| `ramify-agent/web` | `subs/web` | `ramify-agent` |

### The exposed-name inventory compared

Every exposed original of every module, before and after, by owner, name,
channel and source path. 151 names become 171; the twenty added are listed
below and nothing else differs.

| Owner | Before | After |
| --- | ---: | ---: |
| `ramify-agent` | 0 | 0 |
| `ramify-agent/harness` | 113 | 113 |
| `ramify-agent/harness/agent` | 18 | 18 |
| `ramify-agent/harness/agent/pi` | 3 | 3 |
| `ramify-agent/harness/evidence` | — | 20 |
| `ramify-agent/harness/ledger` | 17 | 17 |

The twenty are the five of `ramify-cli.ts` and the fifteen of `views.ts`, each
`to parent`, each from `subs/harness/subs/evidence/src/`.

Two things the brief expected are worth stating precisely.

- **The moved names are new exposures, not moved ones.** `mapping/ramify-cli.ts`
  and `mapping/views.ts` were internals of `harness`, so their names crossed no
  module boundary before. Extracting them into a child is what makes those
  names cross one, and the inventory records them as twenty additions on a new
  owner rather than as twenty rows whose owner and path changed. No name left
  `harness`'s exposed set: it is 113 before and after.
- **No new exposure reaches the root.** The root module exposes 0 originals
  before and after, and the root `module.ramify` was not touched. `evidence`
  exposes nothing to its descendants, as the main plan requires; nor does
  `ledger`.

## 3. What was delivered

### `harness/evidence`

`subs/harness/subs/evidence/`, with a `README.md` whose first top-level prose
paragraph states its purpose, and the `module.ramify` the main plan gives minus
the statements for `run-command.ts`, `measure.ts`, `guarded-files.ts` and
`git.ts`, which iteration 2 adds.

- `src/ramify-cli.ts`, received from `subs/harness/src/mapping/ramify-cli.ts`.
- `src/views.ts`, received from `subs/harness/src/mapping/views.ts`,
  byte-identical.

`mapping/validate.ts` stayed with the harness, as the brief requires, and now
receives `findInView`, `symbolRecords` and three types from `evidence`.
`mapping/architect.ts`, `http/app.ts` and `http/server.ts` likewise changed only
their import paths. `subs/harness/module.ramify` needed no change: the harness
receives a child's to-parent exposures without declaring anything, and
re-exposes none of them.

### Jobs on the ledger

`src/jobs/log.ts` no longer writes `events.jsonl` itself. `JobLog.open` opens a
ledger on the job's directory with `jobEventSchema` as its event schema, and
`JobLog.append` appends one transition per event. What is a job's own stayed
here: the job event schema, the sequence as the job's version, that every event
names its job, and that nothing follows a terminal event except one
`map-approved` after `job-completed`. `CorruptJobLogError` still names the path,
the line and the reason, including for a `LedgerCorruptError` the ledger raises
on load.

`src/jobs/commands.ts` received the command-acceptance part of `service.ts`:
`CommandRejection`, `commandHash` and the new `CommandLedger`, which holds the
three rules of Plan 1's contract item 4 intact — `admit` for an exact repeat and
for a reused ID with other content, `requireVersion` for a stale expected
version. `accept` builds the record of an acceptance and `remember` stores it,
so a command is still remembered only after the event that holds it is in the
log. `service.ts` keeps everything else and is 1,331 bytes smaller.

### The commit rule

`src/jobs/commit.ts`, a thin adapter over the ledger:

- `RecordRef`, `Commit`, `CommittedEvent`, `CommitOutcome`, `CommittedSchema`
  and `CommitRecovery` as its types.
- `commitRecord(log, { event, records })` appends **one** line holding the event
  and every record body of the transition, after which the ledger writes each
  record file as a materialized copy. The append is the commit. A transition
  already in the log is not appended again; instead its record files are
  rewritten from the log, so a repeat after a crash between the line and its
  files leaves one line and correct files.
- A transition's identity is its event type and the path, ID and revision of
  each record it commits, never a body: rule 2 makes a change a new revision in
  a new file, so a differing body at the same revision is a file to rewrite, not
  a second transition.
- `readCommitted` calls the ledger's `readRecord` and returns `valid`,
  `unsupported-version` or `invalid`. It re-implements none of the three.
- `recoverCommits` calls `materialize`: one loop over the log for every record
  kind, rewriting what is missing or differs, with no agent to call.
- `effect(log, { key, intent, perform, complete })` calls the ledger's `effect`.

The mapping job commits no record file, so its transitions carry an event and no
record body; `commitRecord` refuses a transition with no record, since a
transition that commits none is an ordinary append and would have no identity to
compare. The mapping job is therefore the living consumer of the ledger-backed
log, and `commit.ts` is exercised by the three guard tests until iteration 4
gives it the run's records.

## 4. Exit evidence

Every command was run from `ramify-agent/` after the work was complete. The
output below is verbatim.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  32 passed (32)
      Tests  231 passed (231)
   Duration  33.61s

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 287 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DJ9mvXsL.js   430.38 kB │ gzip: 129.68 kB
✓ built in 350ms
EXIT: 0

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 93 source files, 3 resources, 993 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 569 allowed, 0 denied, 424 external
EXIT: 0
```

Against the baseline: 6 owners become 7, 87 source files become 93, 924
accesses become 993, and the findings stay at zero with coverage complete. 209
tests become 231; the 22 new ones are the three guard tests. The browser build
is unchanged at 287 modules, which is the evidence that nothing the web module
sees moved.

### The mapping job's behavior is unchanged

`mapping.test.ts`, `jobs.test.ts`, `recovery.test.ts`, `approval.test.ts` and
the HTTP tests all pass. `http.test.ts`, `jobs-http.test.ts`,
`map-contract.test.ts`, `protocol-contract.test.ts`, `lock.test.ts` and
`plans.test.ts` were not touched at all. Of the rest:

| Test file | What changed |
| --- | --- |
| `mapping.test.ts` | Two import paths |
| `approval.test.ts` | Three import paths |
| `validate.test.ts` | One import path |
| `jobs.test.ts` | One import path, and one line that reads the raw log |
| `recovery.test.ts` | One line that appends to the raw log by hand |
| `helpers/jobs.ts` | One line: `eventsOnDisk` reads the event out of its line |

The last three are the deviation in section 6: a ledger line carries the event
and the records of its transition, so the three places that read or write
`events.jsonl` as bare events now read or write a line. No assertion changed.

### The three guard tests

22 tests, 0.3 seconds, none of which touch pi, the network or the fixture
project.

| Guard | Test | Tests | What it asserts |
| --- | --- | ---: | --- |
| A transition already in the log is not appended again; an external effect repeated with its key happens once | `subs/harness/src/tests/commit.test.ts` | 10 | One line holds every record body and every record file is a copy of it; a repeat in the same process and a repeat from a second ledger after a restart each append nothing; a repeat rewrites a record file that differs from the log; a new revision of the same record and the same records under another event type are each a different transition; a transition with no record is refused and nothing is written; a repeated effect performs once and returns the recorded result, across a restart; a failed effect leaves its intent pending and the retry appends no second intent |
| A reader returns valid, unsupported version or invalid, never an absent record | `subs/harness/src/tests/record-reader.test.ts` | 7 | Valid with its value; `unsupported-version` naming the schema the file declares; `invalid` for a body the schema rejects, with one message per error, each naming its path; `invalid` for a file that is not JSON, for a file declaring no schema, and for a missing file; and one case asserting all three kinds are produced |
| A crash before a transition's log line leaves no trace; a crash after it re-materializes every file, with no agent call and no duplicate | `subs/harness/src/tests/commit-recovery.test.ts` | 5 | A torn line is discarded, its record file was never written, recovery rewrites nothing, and the repeated commit appends exactly one line; a log with no complete line leaves nothing to recover; with three record kinds committed and one file deleted, one corrupted and one intact, a single recovery rewrites exactly the two and appends nothing; a second recovery rewrites nothing; every transition repeated after recovery is already committed |

`src/tests/helpers/commit.ts` holds the shared log: an event type that names
itself, a records root, a record body of a reader-acceptable shape, and the
bytes a materialized record file holds.

### The measured size of `harness`'s own production source

From the architect view's `metrics.contextSize.exact.production`, which the file
system confirms exactly.

| State | Source files | Source bytes |
| --- | ---: | ---: |
| Main plan's record, before Plan 3 | 28 | 156,355 |
| After iteration 0B moved the two file primitives out | 26 | 151,242 |
| After this iteration | **26** | **144,432** |

11,923 bytes and two files below the main plan's baseline, a reduction of 7.6%.
The file count is level because `ramify-cli.ts` and `views.ts` left as
`commit.ts` and `commands.ts` arrived. Within it, `jobs/` grew from 6 files and
47,677 bytes to 8 files and 55,399 bytes, which is where the commit rule and
command acceptance now live. `harness/evidence`'s own production source is 2
files and 14,626 bytes: the main plan measured 14,623 for the same two files,
and the three added bytes are the one extra `../` the executable path needs from
its new depth.

## 5. Acceptance cases owned

None. The brief assigns none; this iteration is a foundation and its exit
evidence is its own.

## 6. Deviations from the brief, with reasons

1. **`events.jsonl` changed format, so three places that read it by hand
   changed with it.** The brief's exit evidence expects the mapping job's tests
   to pass "without changes beyond import paths", but its work section requires
   `jobs/log.ts` to append through the ledger, and rule 3 makes a ledger line
   carry the event *and* the record bodies of its transition. A line is now
   `{sequence, at, event, records}` where it was a bare `JobEvent`. Three lines
   of test code changed to match, listed in section 4; no assertion did. The
   format is the job's internal record, iteration 5 replaces the mapping job,
   and nothing in `fixtures/` holds a log.
2. **`commitRecord` reads the transition's event type from the event rather
   than beside it.** The brief writes
   `commitRecord(log, { eventType, records: [...] })`, but the event itself must
   be appended, and a job event carries `data` as well as a type. Passing both
   `eventType` and `event` would let the two disagree, so `Commit<E>` carries
   the event, `E` is constrained to name its `type`, and the identity is read
   from there. The rule the brief states is unchanged.
3. **`commitRecord` refuses a transition with no record.** A transition with no
   record has no identity to compare, so "already in the log" could only mean
   "an event of this type is in the log", which is wrong for the mapping job,
   whose log holds four `activity` events in a row. A commit holds at least one
   record; an event with none is an ordinary `JobLog.append`. The refusal is a
   `TypeError` with a test.
4. **`architectViewDirectory` is exposed, which the main plan's exposure list
   for `evidence` omits.** `mapping/architect.ts` names the architect view's
   directory in the prompt it builds for a session, so the agent knows where to
   search. The plan's "what crosses" row says no view path reaches a consumer,
   but the exposed `ApiViewSnapshot` already carries `path` for exactly the same
   purpose, and `architect.ts` prints it in the same prompt. Exposing the
   constant keeps `views.ts` byte-identical and keeps the directory name in one
   place; the alternative was to add a field to `ArchitectIndex`, which changes
   a type contract to avoid changing a list. It is the only addition to the
   exposures the main plan gives.
5. **`ramify-cli.ts` is not byte-identical.** Its `ramifyExecutable` resolves
   `node_modules/.bin/ramify` relative to its own file, and the file is one
   directory deeper than before, so the path gained one `../`. The behavior is
   identical: `mapping.test.ts` and `approval.test.ts` run the real `ramify`
   executable through this file, so a wrong path fails them.
6. **`recoverCommits` proves "no agent call" by construction, not by
   interception.** It takes a ledger and nothing else, so it has no agent to
   call. The two recovery tests hold a scripted agent and assert
   `agent.sessions` is empty afterwards, which shows the scenario completes with
   no session started; it is not a stronger claim than the signature already
   makes. The recovery that does have an agent in reach is `JobService.load`,
   whose own tests cover it.
7. **No `union-values.test.ts` was created.** The cross-cutting requirement asks
   each iteration to extend it, but it does not exist yet and this iteration
   adds no submission union member and no durable union value. `RecordRead`'s
   three kinds are the one union in reach, and `record-reader.test.ts` has a
   case asserting all three are produced. The file belongs to the first
   iteration that writes a union value into a record.

## 7. What the next iteration must know

- **`harness/evidence` exists and receives nothing.** Iteration 2 adds
  `run-command.ts` with its wrapper script as a resource beside it, `measure.ts`,
  `guarded-files.ts` and `git.ts`, and the four `expose-src` statements the main
  plan gives for them. The module has no `src/tests/` yet; iteration 2's
  `run-command.test.ts` is its first, and it goes in the owner's `src/tests/`.
  The comment above the views statement reads "the architect view and a
  requester API view"; restore "and the measurement document" when `measure.ts`
  arrives.
- **The harness imports the evidence module as `../../subs/evidence/src/<file>.js`**
  from a directory of `subs/harness/src/` and from `subs/harness/src/tests/`
  alike, the same shape it already uses for `agent` and `ledger`.
  `subs/harness/module.ramify` still needs no statement for either child.
- **A job's log line is a ledger transaction.** Anything that reads
  `events.jsonl` reads `line.event`, and anything that appends to it by hand
  appends `{sequence, at, event, records: []}`. `JobLog.version` is the ledger's
  version, not the length of an array.
- **`commit.ts` is where a record-committing transition goes.** Iteration 4's
  `RunRecord`, its layout and its log should call `commitRecord` rather than
  append and write separately; the records root for a run is
  `plans/<plan-id>/.harness/jobs/<run-id>/`, as iteration 0B recorded, and
  `RecordBody.path` is relative to it.
- **A transition's identity excludes the body.** Two transitions of the same
  event type committing the same record path, ID and revision are the same
  transition. A record that changes must take a new revision in a new file, as
  rule 2 requires; a run that reuses a path and revision for different content
  would silently be treated as a repeat.
- **`CommandLedger` is where a new command kind's acceptance goes.**
  `start-run` and `stop-job` in iteration 4 use `admit`, `requireVersion`,
  `accept` and `remember` in that order, and remember only after the event that
  holds the acceptance is in the log.
- **The daemon's wait-limit behaviour costs a view its dependency facts.**
  Adding a directory to the project — which declaring a module does — makes
  every later materialization in the same daemon context publish
  `dependencies unavailable (wait-limit)`. Stop the daemon before the
  materialization an iteration reports, or its architect view will have no
  `uses` or `usedBy` to show.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  stale.** They are gitignored generated API views and predate the two new
  children. Refresh them with `ramify materialize --view api --from subs/harness`
  before relying on them; `npm run check:self` does not read them.

## 8. Not done, with the reason

Nothing in the brief was left undone. Two limits are worth naming rather than
hiding:

- **The before architect view has no dependency facts.** It was materialized in
  a daemon context that had already seen a directory added, so it reports
  `dependencies unavailable (wait-limit)` and carries no `uses`, `usedBy` or
  test references. The exposed-name inventory the brief asks for does not come
  from those facts, so the comparison in section 2 is sound; a before-and-after
  comparison of `uses` and `usedBy` is not available and is not claimed.
- **`commit.ts` has no production consumer yet.** The mapping job's transitions
  commit no record, so `commitRecord`, `readCommitted` and `recoverCommits` are
  exercised by their guard tests and not by a running job. The brief places them
  here deliberately, ahead of the run records of iteration 4; this note records
  that their first production use is still to come.
