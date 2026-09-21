# ledger

Writes the harness's durable state, and is the only thing that does: one
flushed append to a log is one transition, record files are materialized
copies of that log, and an effect outside the harness goes from intent to
completion under an idempotency key. It hides how an append becomes durable,
what a torn line is, how record files are rebuilt from the log and how a
crash between an intent and its completion is repaired. It knows nothing of
jobs, runs, agents, git or Ramify, and imports Node and zod only.

## Why it is separate

It is the critical path of every recovery. A crash anywhere above it resumes
from the last consistent state only if this module is right, so it is one
independent service, tested beyond the rest, and its declaration receives
nothing: that nothing here imports from the harness is a rule
`npm run check:self` enforces, not a convention.

## One line is one transaction

`openLedger({ logPath, recordsRoot, eventSchema })` replays the log and
returns a `Ledger<E>` generic over the caller's event type. Every line is
validated with the caller's schema as it is read.

- `append(transaction)` serializes the event and every record body into one
  JSON line, writes it with a single write, flushes the file, and only then
  resolves. The sequence is one more than the last and the time is assigned
  here.
- A line over 8 MiB is refused before anything is written, so a record that
  belongs in a file beside the log cannot be pushed through it by accident.
- Appends are serialized inside the ledger. Two ledgers on one log are the
  caller's to prevent with the project lock; this one detects a sequence it
  did not write on its next append and fails with `LedgerCorruptError`.
- On open a torn last line is truncated away. An invalid line anywhere else,
  a sequence out of order, a record path that escapes the records root, or a
  line the event schema rejects is `LedgerCorruptError`, which names the
  path, the line and the reason. A malformed line never yields a shorter
  history.

## Record files are materialized copies

The log is the authority; the files exist for people and agents to read.

- After an append each record body is written to its path under
  `recordsRoot` with an atomic replace. A failure there is not a failed
  transaction: the line is in the log, and `materialize` repairs the file.
- `materialize()` replays the log and rewrites every record file that is
  missing or whose bytes differ, and returns the paths it rewrote. It touches
  only paths the log names and refuses a path that resolves outside
  `recordsRoot`. Run twice, the second run rewrites nothing.
- `readRecord(path, { schema, body })` returns `RecordRead`: `valid`,
  `unsupported-version` with the schema the file declares, or `invalid` with
  one message per error. A missing file is `invalid`, never an absent record.

## External effects

`effect({ key, intent, perform, complete })` appends the intent, calls
`perform(key)` and appends the completion with the result. `pendingEffects()`
lists the intents whose completion is not in the log, for the caller to
perform again on load; the key is what makes the effect itself a no-op when
it already happened. Calling `effect` again for a key whose intent is already
in the log appends no second intent, and calling it for a completed key
returns the recorded result without performing anything. The ledger does not
know what an effect is: which effects exist is the harness's.

## File primitives

`atomic.ts` and `jsonl.ts` are exposed with the ledger, since a caller also
needs them for files that are not records, such as the project lock and a
gate's output. The ledger's own writing goes through the injected file system
of `fs.ts`, which stays internal, so a test can fail any single write, flush,
rename or directory sync.

## Tests

`src/tests/` covers a fault at every file system operation of an append, a
last line torn at every byte offset, corrupt logs, materialization,
`RecordRead`, effects, concurrency, and a real writer process killed with
`SIGKILL` in the middle of appending.
