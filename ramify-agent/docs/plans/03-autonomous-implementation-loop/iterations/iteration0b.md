# Iteration 0B: The ledger

**Goal:** build `harness/ledger`, the one service through which the harness
writes durable state, and test it beyond anything else in the project. It is
the critical path of every recovery: if it is right, a crash anywhere resumes
from the last consistent state; if it is wrong, nothing above it can be.

It implements rules 3, 4 and 11 of the
[proposal](../core-records.proposal.md#eleven-rules-the-structures-follow). It
knows nothing of jobs, runs, agents, git or Ramify, and imports Node and zod
only. The main plan gives its justification and exposures:
[why `harness/ledger` is its own module](../main-plan.md#why-harnessledger-is-its-own-module).

## Prerequisites

Plan 2 complete. Nothing from iteration 0: it needs no port contract, so it can
run beside the spike or before iteration 1 in any order.

## Write scope

`subs/harness/subs/ledger/`, `subs/harness/module.ramify`, and the import paths
of the harness files that use `store/atomic.ts` and `store/jsonl.ts`. No change
to behavior anywhere else, and no change to `subs/web/`, `subs/harness/subs/agent/`,
`src/` or `fixtures/`.

## Interfaces established

```ts
/** One transition: its event and the bodies of every record it commits. */
interface Transaction<E> {
  readonly event: E;                                    // validated by the caller's schema
  readonly records: ReadonlyArray<RecordBody>;
}
interface RecordBody { readonly path: string; readonly id: string; readonly revision: number; readonly body: unknown }

type RecordRead<T> =
  | { readonly kind: 'valid'; readonly value: T }
  | { readonly kind: 'unsupported-version'; readonly schema: string; readonly path: string }
  | { readonly kind: 'invalid'; readonly errors: readonly string[]; readonly path: string };

interface Ledger<E> {
  /** The last sequence in the log; 0 before any. */
  readonly version: number;
  /** Appends one line holding the whole transaction, flushed before it resolves, then materializes its records. */
  append(transaction: Transaction<E>): Promise<{ readonly sequence: number; readonly at: string }>;
  /** Every complete line, in order. */
  replay(): ReadonlyArray<{ readonly sequence: number; readonly at: string; readonly transaction: Transaction<E> }>;
  /** Rewrites every record file that is missing or differs from the log; removes none it did not write. */
  materialize(): Promise<{ readonly rewritten: readonly string[] }>;
  /** Intent, the effect under its key, completion. Resolves with the effect's result. */
  effect<R>(spec: EffectSpec<E, R>): Promise<R>;
  /** Intents without a completion, for the caller to perform again on load. */
  pendingEffects(): ReadonlyArray<PendingEffect>;
}

function openLedger<E>(options: {
  readonly logPath: string; readonly recordsRoot: string;
  readonly eventSchema: z.ZodType<E>;
}): Promise<Ledger<E>>;
```

The ledger is generic over the caller's event type and validates every line it
reads with the caller's schema. `LedgerCorruptError` names the path, the line
and the reason. The file primitives of `atomic.ts` and `jsonl.ts` are exposed
with it, since a caller also needs them for files that are not records, such as
the project lock and a gate's output.

## Work

### The module

Declared at `subs/harness/subs/ledger/` with the `module.ramify` the main plan
gives and a `README.md` whose first paragraph states its purpose.
`store/atomic.ts` and `store/jsonl.ts` move into its `src/` unchanged in
content, with their tests; `store/lock.ts` and `store/state-directory.ts` stay
in the harness and import the primitives from the ledger. Its declaration
receives nothing, which is what makes "imports nothing from the harness" a rule
that `npm run check:self` enforces and not a convention.

### One line is one transaction

- `append` serializes the event and every record body into **one** JSON line,
  writes it with a single `write`, flushes the file, and only then resolves. The
  sequence is one more than the last; the time is assigned here.
- A line larger than a fixed bound, 8 MiB, is refused before anything is
  written, so a record that belongs in a file beside the log cannot be pushed
  through it by accident.
- Appends are serialized inside the ledger. Two ledgers on one log are
  prevented by the project lock, which is the caller's; the ledger detects a
  sequence it did not write on its next append and fails with
  `LedgerCorruptError`.
- On open, a torn **last** line is truncated away. An invalid line anywhere
  else, a sequence out of order, or a line the event schema rejects is
  `LedgerCorruptError`. A malformed line never yields a shorter history.

### Record files are materialized copies

- After an append, each record body is written to its path under
  `recordsRoot` with `writeFileAtomic`. A failure here is not a failed
  transaction: the line is in the log, and `materialize` repairs the file.
- `materialize` replays the log and rewrites every record file that is missing
  or whose bytes differ. It touches only paths the log names, and refuses a path
  that resolves outside `recordsRoot`.
- Reading a record goes through `RecordRead`: valid, unsupported version, or
  invalid. The last two are failures with evidence, never an absent record.

### External effects

`effect({ key, intent, perform, complete })` appends the intent, calls
`perform(key)`, and appends the completion with the result. On load,
`pendingEffects` lists the intents without a completion, and the caller performs
each again; the key is what makes the effect itself a no-op when it already
happened. The ledger does not know what an effect is: the brief append, starting
an invocation, releasing the writer and the accepted commit are the harness's.

### Tests beyond the rest

The file system the ledger uses is injected, so every test below is
deterministic, except the last, which is real on purpose.

| Test | What it shows |
| --- | --- |
| A fault at **every** write, flush, rename and directory sync of an append, one at a time | After each, a reopened ledger holds either the whole transaction or none of it, and `materialize` makes every record file match the log |
| A last line truncated at **every** byte offset | Each reopens to the previous transaction, with the torn bytes gone and the next append valid |
| An invalid line in the middle, a gap in the sequence, a line the schema rejects | `LedgerCorruptError` with the path, the line and the reason; never a shorter history |
| A record file deleted, truncated or edited by hand | `materialize` restores it from the log; a second run rewrites nothing |
| `replay` and `materialize` run twice | Both are idempotent: the same result, no writes the second time |
| A record path that escapes `recordsRoot` | Refused before anything is written |
| A line over the size bound | Refused; the log is unchanged |
| An effect that fails, and a crash between intent and completion | The intent is pending on load; performing it again with its key and completing it leaves one intent and one completion |
| Concurrent `append` calls | Serialized; sequences are dense and ordered |
| A schema version the reader does not support, and an invalid record | `unsupported-version` and `invalid`, each with evidence |
| **A real writer process killed with `SIGKILL` in the middle of appending, many times** | Every resulting log reopens, replays to a complete transaction and accepts the next append. The child appends in a loop; the parent kills it after a random delay |

## Acceptance cases owned

None. It is a foundation; its exit evidence is its own, and every later
iteration's recovery rests on it.

## Guards owned

| Guard | Test |
| --- | --- |
| The log is the authority, and a bad line is never an empty log | `subs/harness/subs/ledger/src/tests/corrupt-log.test.ts` |
| A crash before a transaction's line leaves no trace; after it, every file is re-materialized | `subs/harness/subs/ledger/src/tests/fault-injection.test.ts` and `torn-line.test.ts` |
| A repeated external effect happens once | `subs/harness/subs/ledger/src/tests/effects.test.ts` |
| A killed writer leaves a log that replays | `subs/harness/subs/ledger/src/tests/killed-writer.test.ts` |

## Exit evidence

- The tests above, with the fault-injection and torn-line tests reporting how
  many fault points and byte offsets they covered.
- `npm run check:self` with `harness/ledger` as an owner that receives nothing.
- The mapping job's behavior unchanged: every existing test passes with changes
  to import paths only.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
