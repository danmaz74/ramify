# Iteration 5 results: the transcript writer

**Date:** 2026-09-23. **Owner:** `harness`. **Branch:** `feat/plan9-session-model`.

Every session of a run and every standalone session now has a durable
transcript in the harness's own format. It is written from the port's events
and from the harness's own decisions, beside the observations. Each
invocation's start is durable before its session starts. Bodies over the
inline limit are stored once by content. A failed write is a coverage gap
and never fails the session.

## Final names

### File layout

| Where | Path | Named by |
| --- | --- | --- |
| A run's session | `transcripts/<session>.jsonl` in the run directory | `runLayout.transcript(session)` |
| A run's content store | `blobs/<sha256>` in the run directory | `runLayout.blobs` |
| A standalone session | `transcript.jsonl` in its directory | `sessionLayout.transcript` |
| A standalone content store | `blobs/<sha256>` in its directory | `sessionLayout.blobs` |
| The executor's own record | `session/` in a standalone session's directory | `sessionLayout.executorSession` |

- `runLayout` is in [run/records.ts](../../../../subs/harness/src/run/records.ts).
- `sessionLayout` is in [sessions/records.ts](../../../../subs/harness/src/sessions/records.ts).
  Its old `transcript: 'session'` key is now `executorSession`.
- A run's `invocations/<id>/session/` is unchanged. Its `runLayout.session`
  now says that it is the executor's own record.

A standalone session is its own one invocation, so its identifier names
both. It already named its equipment's invocation and its writer that way.
Its entries therefore carry `invocation: <session id>`, and its point is
`{ session: id, invocation: id }`.

### The entry schema

The schema is in
[interfaces/protocol/transcripts.ts](../../../../subs/harness/src/interfaces/protocol/transcripts.ts).
It imports only `zod` and its siblings `evidence.ts` (`sha256Schema`) and
`runs.ts` (`roleSchema`). It is not in `module.ramify` yet. Iteration 6 can
expose it with its new `sessions.ts`, as a sibling import or its own
`expose-src *` line.

- `transcriptEntrySchema`, `TranscriptEntry`, `TranscriptEntryType` and
  `TranscriptEntryOf<T>` describe one line.
- Every entry has these fields:
  - `n`: a positive integer. It starts at 1 and rises by one per entry of
    the transcript, across invocations and appends, and is never reset.
  - `at`: an ISO time.
  - `type`.
  - `invocation`: a string, or null for what the harness did between
    invocations.
- All object schemas are strict.

| `type` | Fields |
| --- | --- |
| `started` | `role`, `work` (`{ workItem?, iteration?, request? }`), `start` (`opened` \| `continued`), `requested` (`fresh` \| `continue` \| `fork`), `continues`, `fork`, `replaces`, `requestedBy` (each nullable, the run log's relations), `executor`, `model` (nullable), `systemPrompt` and `prompt` (bodies) |
| `message`, `role: 'user'` | `blocks`: `TranscriptContentBlock[]` |
| `message`, `role: 'assistant'` | `blocks`: `TranscriptAssistantBlock[]`, `usage` (nullable), `detail` (`transcriptMessageDetailSchema`, where null means absent) |
| `message`, `role: 'tool-result'` | `callId`, `tool`, `isError`, `blocks`: `TranscriptContentBlock[]`, `output`: a body or null |
| `harness` | `decision`: `transcriptHarnessDecisionSchema`; `invocation` may be null |
| `compaction` | `phase: 'started'` with `reason`; `phase: 'ended'` with `reason`, `tokensBefore`, `tokensAfter`, `aborted`, `errorText` |
| `retry` | `phase: 'started'` with `attempt`, `maxAttempts`, `delayMs`, `errorText`; `phase: 'ended'` with `attempt`, `succeeded`, `errorText` |
| `point` | `point`: `transcriptPointSchema`, which is `{ session, invocation }` or `{ session, append }`; `invocation` is null for an append's point |
| `ended` | `ended` (`transcriptEndedSchema`), `interruption` (`transcriptInterruptionSchema`, nullable), `error` (nullable), `actual` (`{ mode, degradedReason }`, or null where the session never ran or recovery closed it) |

The blocks follow the port's blocks from iteration 4. Each block has a header
and a body:

| Block | Header | Body |
| --- | --- | --- |
| `text` | none | `body` |
| `thinking` | `visibility` | `body`; empty when `redacted` |
| `tool-call` | `callId`, `tool`, `action` (`transcriptToolActionSchema`, the neutral action) | `input`, the call's input as JSON |
| `other` | `kind`, `description` | none |

The harness decisions, discriminated on `kind`:

| `kind` | Fields |
| --- | --- |
| `guard-denied` | `callId`, `tool`, `verdict` (`blocked-scope` \| `blocked-unresolved`), `requested`, `reason`, `text` (the denial the agent saw) |
| `submission-verdict` | `callId`, `tool`, `verdict` (`accepted` \| `rejected` \| `refused`), `text` (the answer, or null where the executor's own acknowledgement was used) |
| `post-write-check` | `callId` (null when `atCompletion`), `atCompletion`, `checks` (`paths`, `mode`, `outcome`, `reason`, `newFindings`, `log` as a file body or null), `text` (what the call's result was told, or null) |
| `read-reminder` | `callId` (the call whose result carried it), `text` |
| `brief-appended` | `decision`, `generation`, `outcome` (`appended` \| `already-present`), `text` |
| `note-appended` | `text`: the engineer's `Continuing iteration …` note, appended before a continued invocation. It is not a point |
| `budget-reached` | `tokens`, `threshold`, `reportDelivered` |

A body is `transcriptBodySchema` (`TranscriptBody`), discriminated on
`stored`:

- `{ stored: 'inline', text, bytes }`;
- `{ stored: 'blob', hash, bytes, preview }`. `preview` is the first line
  with text, cut to `previewCharacters` (120);
- `{ stored: 'file', path, bytes | null }`. The path is relative to the
  transcript's directory, such as `invocations/inv-0003/shell/001.log`.

`bytes` is the UTF-8 size.

### The policy value

The inline limit is `RunPolicy.transcript.inlineBodyBytes`.

- Its default is `defaultTranscriptPolicy = { inlineBodyBytes: 8192 }` in
  [run/policy.ts](../../../../subs/harness/src/run/policy.ts).
- It is recorded in `job.json` with the rest of the policy.
- `runPolicySchema` requires it, so `runPolicyVersion` is now
  `run-policy/2`.
- A standalone session reads the same value from its policy.

A body larger than the limit goes to the content store. The system prompt
always goes there, whatever its size, because every invocation of a role
shares it.

### Writer, reader and store

- **Store:** [transcripts/store.ts](../../../../subs/harness/src/transcripts/store.ts)
  holds `ContentStore(directory)`:
  - `put(content): Promise<StoredContent>` answers `{ hash, bytes }`. The
    hash is the SHA-256 of the content's UTF-8 bytes. The blob is written
    with the ledger's `writeFileExclusive`, so it is written whole or not
    at all, and never rewritten;
  - `path(hash)`;
  - `read(hash): Promise<string | null>`.
- **Writer:** [transcripts/writer.ts](../../../../subs/harness/src/transcripts/writer.ts)
  holds `TranscriptWriter({ session, path, root, store, inlineBytes, now? })`,
  one per session:
  - `append(build)` takes a builder, which receives `TranscriptBodies`
    (`text(content, 'by-size' | 'stored')` and `file(absolutePath)`) and
    returns a `TranscriptEntryInput` (an entry without `n` and `at`);
  - appends are ordered;
  - each append validates the entry and writes it with `appendJsonLine`,
    which syncs the line;
  - the file is read lazily. Loading discards a torn last line with
    `discardPartialLine` and numbers on from the last entry;
  - a failed append rejects and resets the writer, so the next append
    reads the file again;
  - `drain()` waits for every append asked for so far.
- **Readers:** `writer.ts` also holds the readers:
  - `readTranscript(path): Promise<TranscriptRead>` answers `entries`,
    `discardedPartial` and `unreadable` (line numbers). It changes nothing,
    and a missing file has no entries;
  - `readBody(root, store, body)` answers a body's content, or null;
  - `previewOf(content)`.
- **Recorder:** [transcripts/recorder.ts](../../../../subs/harness/src/transcripts/recorder.ts)
  holds `InvocationTranscript(writer, invocation, gap)`, what one invocation
  writes:
  - `started(InvocationStart)` is awaited before `startSession`;
  - `event(AgentEvent)` writes `message`, `compaction` and `retry` entries
    and ignores other events;
  - `note(HarnessNote)`;
  - `output(callId, path)` names a call's complete output;
  - `end(InvocationEnd)` writes `ended` and then `point`. After it, what the
    session reports is dropped;
  - `drain()`;
  - `gap(detail)` runs once, for the first failed entry of the invocation.
- **Recorder helpers:** `recordAppend(writer, note, append | null)` writes
  an append between invocations, and its point for a brief. `verdictNote`
  maps a `SubmissionVerdict` to a note. `TranscriptNotes` is the
  equipment's view: `note` and `output`.
- **Coverage gap:** the new kind is `transcript-incomplete`, in
  [run/observations.ts](../../../../subs/harness/src/run/observations.ts).

### Where each entry is written

- **The run service**
  ([run/service.ts](../../../../subs/harness/src/run/service.ts)):
  - `Run` holds the `ContentStore` and a map of one `TranscriptWriter` per
    session;
  - `started` is written right after `invocation-started` commits. It
    precedes `writer-acquired` and every `afterWrite` of the invocation;
  - `PortEventRecorder` forwards every port event to
    `PortEventRecorderOptions.transcript`;
  - the submission tool's `accept` notes each verdict;
  - a `context-budget-reached` outcome notes `budget-reached`;
  - `endInvocation` writes `ended` and `point` after `invocation-ended`
    commits and before its `afterWrite`. This covers recovery's closing of
    an interrupted invocation, whose `actual` is null;
  - `appendBrief` writes `brief-appended` and its point
    `{ session, append: <brief-appended sequence> }` after the append
    commits;
  - the engineer loop writes `note-appended` before a continued engineer's
    `started`.
- **The equipment**
  ([work/engineer-equipment.ts](../../../../subs/harness/src/work/engineer-equipment.ts)):
  `EquipContext.transcript` is optional. The equipment uses it to note:
  - guard denials;
  - each post-write check with its log;
  - each read reminder;
  - the check at completion;
  - each shell call's `shell/NNN.log`, through `output`.
- **The standalone session**
  ([sessions/single.ts](../../../../subs/harness/src/sessions/single.ts))
  writes the same entries through the same recorder. Its `started` precedes
  `startSession`, and its `ended` and `point` precede the gate.

## Changes from the design

1. **A shell call's log is the result's `output`, beside its blocks.** The
   blocks keep what the agent saw: the 8 KiB tail and any appended hook
   text. `output` names the complete log as a `file` body and copies
   nothing. Replacing the result's body with the log would lose what the
   agent saw, and the transcript would no longer read back to the port's
   events.
2. **The fork's first entry is its first `started` entry.** Its `fork`
   names the source point. There is no separate entry type. Every
   `started` entry carries the start's relations.
3. **The actual start is in `ended`.** Degradation is known only after
   `startSession`, as iteration 2 found, so `started` records what was
   requested.
4. **The system prompt always goes to the content store,** whatever its
   size. Only the size threshold decides for other bodies. A small file
   read twice is therefore stored inline twice, and a file over 8 KiB is
   stored once.
5. **The first prompt appears twice:** as `started.prompt` and as the first
   `user` message the executor reported. The first records what the
   harness sent before the model was called. The second records what the
   executor reported, and keeps the read-back to the port's events exact.
   Under 8 KiB both copies are inline.
6. **Two appends are recorded.**
   - The brief is a `harness` `brief-appended` entry followed by a `point`
     entry.
   - The engineer's continuation note is `note-appended` with no point,
     following iteration 2's decision that it is not a harness point.
   - Both have `invocation: null`.
7. **Recovery ends the transcript too.** Recovery closes an interrupted
   invocation through `endInvocation`. That call also appends `ended`
   (`session-lost`, `actual: null`) and `point` after the entries the crash
   left.
8. **The policy version.** The inline limit is a required policy field, so
   `run-policy/1` became `run-policy/2`. `job.json` stays
   `ramify-agent.job/3`, which this plan introduced.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/harness/src/tests/transcript-writer.test.ts \
  subs/harness/src/tests/transcript-run.test.ts subs/harness/src/tests/single-session.test.ts \
  subs/harness/src/tests/run-recovery.test.ts
# included in the run below
```

The harness's unit test files were run by explicit path: 75 files, every
`subs/harness/src/tests/*.test.ts` except the integration files and the two
fixture files.

- 75 files passed, 581 tests.
- Iteration 1's four named files are among them: `session-reducer`,
  `session-lifecycle`, `run-recovery` and `composition`.
- So are the files whose subject changed: `observation-log`,
  `single-session`, `union-values`, `run-policy`, `composition` and the
  three `composition-recovery*` files.

```sh
npx vitest run <the 7 harness integration files>   # 7 files, 8 tests passed
npm run type-check                                  # passed
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 87 analysis limits (the baseline's 87)
```

- **A crash keeps every earlier entry, and a torn last line is discarded**
  (ST07). `transcript-writer.test.ts` writes three entries and then half a
  fourth. It shows:
  - the reader discards the torn line and keeps the three;
  - a new writer truncates it and numbers on from 4.

  In `run-recovery.test.ts`, a run frozen after `invocation-started` keeps
  its `started` entry, and recovery adds `ended` and `point` after it
  (entries 1 to 3). A run frozen after `invocation-ended` has exactly one
  `ended`.
- **Numbers are never reset.** A session's entries are numbered across two
  invocations, an append and a second writer. In the scripted run, every
  transcript is numbered 1 to *k*.
- **A file read twice is stored once, and so is the shared system prompt**
  (ST08). A 12 KB file is read three times across two sessions: it is one
  blob, named by three blocks. The same system prompt in two sessions is
  one blob. In the scripted run, each of the five roles has exactly one
  system-prompt hash.
- **No record, event or observation contains a body** (ST08). In the
  scripted run, every body of 32 characters or more is checked (more than
  20 of them), both raw and JSON-escaped, against every `.json` record,
  `events.jsonl` and every `observations.jsonl`. None contains one. The
  check covers:
  - thinking;
  - system prompts and first prompts;
  - tool results;
  - write inputs, which carry file contents;
  - the texts of the harness's decisions.

  Two kinds of body are excluded:
  - assistant text, which the Plan 1 `activity` observation already
    records;
  - submission inputs, which are records by design.

  The standalone test checks its records likewise.
- **A transcript reads back to its port events.**
  - `transcript-run.test.ts` wraps the scripted fake to keep each
    invocation's port events. The scenario is iteration 1's scripted run,
    moved to `tests/helpers/session-scenario.ts`, with a thinking message,
    a retry, a compaction and a read added to the initial architect.
  - For all 14 invocations, the `message`, `compaction` and `retry` events
    rebuilt from the entries, with every body read back, equal the port's.
  - `transcript-writer.test.ts` does the same with present and absent
    optional detail, a redacted thinking block, an `other` block and a
    stored tool result.
- **The start precedes the model call** (ST07). The wrapped port reads the
  transcript files when `startSession` is called. For every invocation, the
  last entry was that invocation's `started`, and so was the standalone
  session's.
- **Points and forks.** Every `invocation-ended` is followed by its
  `ended` and its `point { session, invocation }`. The brief appended to
  the architect context is followed by `point { session, append: <its
  sequence> }`. Every session's first entry is its `started`, and the
  global fork's names `ses-0001 at inv-0001`.
- **A failed write is a coverage gap, and the session completes** (ST07).
  - A run whose `transcripts/ses-0001.jsonl` is a directory completes, and
    its invocation is `submitted`. Its observations hold exactly one
    `transcript-incomplete` gap.
  - In `transcript-writer.test.ts`, a content store that cannot be created
    loses the one entry whose body it needed, and records one gap. The
    other entries are numbered without a hole.
- **The standalone session.** `single-session.test.ts` checks the session's
  `transcript.jsonl` beside `session/` and one blob. It also checks:
  - the shell result's `output: shell/001.log`;
  - the guard's denial;
  - three post-write checks, one of them at completion;
  - the accepted verdict with its answer;
  - `ended` and the point `{ session: id, invocation: id }`.

## Open items

- **Iteration 6** exposes `transcripts.ts`, or re-declares its schemas in
  `sessions.ts`, and reads the transcripts with `readTranscript`. The body
  query reads a blob with `ContentStore.read`, and a `file` body with
  `readBody`, which refuses a path outside the directory.
  `readJsonLines` still throws on a complete line that is not JSON. A
  transcript corrupted that way fails its reader, as an observation log
  does.
- **An append's failed write has no invocation** to record a gap against. It
  is a warning of the run service, like the other append warnings.
- **Metrics show the new gap kind.** `kpi/metrics.ts` lists coverage gaps
  by kind, so an invocation with `transcript-incomplete` appears there,
  though no metric depends on its transcript. It was left as it is, since
  iteration 10 changes the metrics in parallel.
- **Images** stay `other` blocks, described and not carried, as iteration 4
  left them.
- **Streaming** can follow on the same numbers. Durable entries stay
  complete messages, and deltas would be held in memory against the next
  number.
- **The first prompt is duplicated** (change 5). If sizes from the pi check
  suggest it, `started.prompt` could always go to the content store, as the
  system prompt does.
