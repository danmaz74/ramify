# Plan 9 results: session model and transcripts

**Date:** 2026-09-23. **Status:** implemented on `feat/plan9-session-model`;
the audit of the final commit is pending (ST14).

The harness now owns sessions. Every invocation belongs to a recorded session
whose state a pure reducer derives from the run log, and continuation, forking,
replacement, request and degradation are recorded between harness points.
Each session has a durable transcript in the harness's own format, with large
bodies stored once by content. The HTTP protocol serves the project's sessions,
a run's sessions with their lineage, transcript pages, an update poll and
bodies. The web shows a Sessions page, a transcript that follows a live
session, session marks on both progress diagrams, a lineage timeline and the
lineage measurements.

The iteration notes under [iterations/](iterations/) record each iteration's
final names. This document maps the acceptance to its evidence and
consolidates every change from the [main plan's design](main-plan.md#design).

## Acceptance

Test counts are from the final verification run of iteration 11, file by
file, run by explicit path (see [Verification](#verification)).

| ID | Result | Evidence |
| --- | --- | --- |
| ST01 | Passed | `c755b54`. [session-reducer.test.ts](../../../subs/harness/src/tests/session-reducer.test.ts) (12 tests) takes five states by seven events: the eight valid transitions reach their states, and the other 27 pairs are rejected with the event's sequence. [session-lifecycle.test.ts](../../../subs/harness/src/tests/session-lifecycle.test.ts) (2) states the sessions after each of the scripted run's 44 session events. [composition.test.ts](../../../subs/harness/src/tests/composition.test.ts) (6) derives every session of the 14 composed runs: every invocation belongs to one. |
| ST02 | Passed | `c755b54`. [run-recovery.test.ts](../../../subs/harness/src/tests/run-recovery.test.ts) (31) finishes an interrupted invocation's session and a session opened without an invocation as `interrupted`, and a kept session as `run-ended`. The three `composition-recovery*` files hold all 35 crash rows to that rule. No composed run, completed, failed or stopped, holds a live or suspended session. |
| ST03 | Passed | `523d925`. `session-lifecycle.test.ts` checks that every `continued` start names `continues` from its own session's latest point, that a fork names its source point, generation and briefs, and that none of the run's executor refs appears in any relation. `iteration-gate.test.ts` and `placement.test.ts` cover `reconstructed`, `context-rebuilt` and degraded starts; `session-reducer.test.ts` rejects stale and unreached points. |
| ST04 | Passed | `523d925`, `64c27bf`. [kpi-metrics.test.ts](../../../subs/harness/src/tests/kpi-metrics.test.ts) (13) builds a run's records and reads them through `metricsOf`: a continued session counts once in `session-weighted-total`, at its largest size, although each invocation ends at another ref; with the old grouping the same test fails with three sessions. See [the grouping](#session-weighted-total-and-st04) for how a degraded continuation counts. |
| ST05 | Passed | `a72e21c`. [neutral-actions.test.ts](../../../subs/harness/src/tests/neutral-actions.test.ts) (4) runs one engineer turn with pi's tool names and again with `Read` (`file_path`), `Grep`, `CreateFile` and `ReplaceText`: the same reads, searches, excursion, guard decisions and mutations. The agent and pi `tool-actions.test.ts` (4 each), [write-guard.test.ts](../../../subs/harness/src/tests/write-guard.test.ts) (9) and [read-excursions.test.ts](../../../subs/harness/src/tests/read-excursions.test.ts) (6) cover the classification and its consumers. |
| ST06 | Passed | `9243bc0`. [pi transcript-content.test.ts](../../../subs/harness/subs/agent/subs/pi/src/tests/transcript-content.test.ts) (2) runs a real pi session on pi's scripted provider: the first prompt before the first model request, every assistant block, thinking `unmarked` and `redacted`, tool results paired by call ID, every optional field pi supplied, a retry, and `null` for each field a reply leaves out. The [agent's test](../../../subs/harness/subs/agent/src/tests/transcript-content.test.ts) (6) covers the scripted fake. The [development pi check](#development-pi-check) confirmed it with a real model. |
| ST07 | Passed | `11dd329`, corrected by `1a49f13`. [transcript-writer.test.ts](../../../subs/harness/src/tests/transcript-writer.test.ts) (8) keeps every entry before a crash, discards a torn last line and numbers on. [transcript-run.test.ts](../../../subs/harness/src/tests/transcript-run.test.ts) (2) shows each invocation's `started` entry was the last entry when `startSession` was called, and that a transcript that cannot be written is one `transcript-incomplete` gap while the run completes; since `1a49f13` that gap no longer lowers `observation-coverage`. |
| ST08 | Passed | `11dd329`. `transcript-run.test.ts` stores a 12 KB file read three times across two sessions as one blob, and each role's system prompt once, and finds none of more than 20 bodies, raw or JSON-escaped, in any record, event or observation. `single-session.test.ts` (10) checks the standalone records alike. |
| ST09 | Passed | `572e071`. [session-queries.test.ts](../../../subs/harness/src/tests/session-queries.test.ts) (2) orders live and suspended first across runs and standalone sessions, answers only entries after each cursor, never resets a number, reports a state change within one poll, and lists a finished and a crashed standalone session as `finished` and `interrupted`. [transcript-pages.test.ts](../../../subs/harness/src/tests/transcript-pages.test.ts) (4) and [protocol-contract.test.ts](../../../subs/harness/src/tests/protocol-contract.test.ts) (34) cover paging and the schemas. |
| ST10 | Passed | `da6d271`. [session-page.test.tsx](../../../subs/web/src/tests/session-page.test.tsx) (14) and [sessions-page.test.tsx](../../../subs/web/src/tests/sessions-page.test.tsx) (5): blocks collapsed by default, a body fetched on first expansion only, entries arriving in separate polls, a state change while open and a missing transcript file. Browser: `transcript-block-open-*.png`, `live-transcript-before-*.png` and `live-transcript-after-*.png`. |
| ST11 | Passed | `8f985f1`, `f844963`. [session-marks.test.tsx](../../../subs/web/src/tests/session-marks.test.tsx) (10) covers counts and role chips, the suspended mark, the element list, the run-level strip and a mark that changes within one poll. [session-fixture.test.ts](../../../subs/harness/src/tests/session-fixture.test.ts) (4) reads the served fixture. Browser: `progress-by-module*-*.png` and `progress-dependencies*-*.png`. |
| ST12 | Passed | `eb8af13`. [session-timeline.test.tsx](../../../subs/web/src/tests/session-timeline.test.tsx) (10) covers segments, gaps, appends, forks, replacements, requests and degraded starts, keyboard order and the text alternative. Browser: `timeline-lineage-*.png`, `timeline-lineage-replacement-*.png` and `timeline-live-*.png`. |
| ST13 | Passed | `64c27bf`. The [metrics glossary](../../metrics/glossary.md) defines each measurement and [lineage.md](../../metrics/lineage.md) specifies `lineage/1`. [lineage-metrics.test.ts](../../../subs/harness/src/tests/lineage-metrics.test.ts) (10) computes every measurement from a scripted run with hand-computed values, and reports `unavailable` with its known subtotal and reason when inputs are missing. |
| ST14 | Pending audit | Browser evidence at both widths: 22 captures with no console error, warning or page error and no page-level horizontal overflow ([evidence/](evidence/), `61020c8`). Development pi check: passed ([below](#development-pi-check)). `npm run check:self`: 0 errors, 0 warnings, 132 analysis limits. Audit: pending: orchestrator runs the ramify-audit request and the root cucumber-viz audit on commit <hash>. |

## Review decisions

1. **Event names and reasons.** The Events and Lineage tables stand, with
   the changes listed below: `invocation-ended` is discriminated on `kept`,
   `invocation-started` names its `start`, `brief-appended` names the
   executor's point `ref`, and degradation is recorded at `invocation-ended`.
   The finish reasons are the design's six. The continue reasons are
   `placement-answered`, `iteration-closed`, `completion-refused` and
   `repair`, in place of the design's examples `next-round` and `revision`.
   Fork, replace and request reasons are `placement-request`,
   `reconstructed` or `context-rebuilt`, and `contract-needed`.
2. **Inline body threshold: 8 KiB is kept,** as
   `RunPolicy.transcript.inlineBodyBytes` (`run-policy/2`). Measured sizes
   fall well to either side of it, so moving it would change almost nothing:

   | Source | Inline bodies | Stored bodies |
   | --- | --- | --- |
   | Served fixture: 27 transcripts, 288 entries | 178, the largest 4,166 B (a first prompt) | 39: system prompts of 14,078 to 45,529 B, always stored, and three assistant bodies of 21,768, 185,588 and 204,033 B |
   | pi check: 1 transcript, 12 entries | the largest 5,568 B (a 159-line source file read); first prompt 1,969 B; thinking 44 and 45 B | the system prompt, 17,017 B |

   `file` bodies name existing logs and copy nothing: 11 in the fixture (at
   most 85 B), and in the pi check a 43 B shell log and a 1,388,630 B hook
   check log. The first prompt's second copy (iteration 5, change 5) costs
   under 5 KB per invocation in both, so it stays inline.
3. **Transcript location, as recommended.** A run's transcripts are
   `transcripts/<session>.jsonl` and its content store is `blobs/`, beside
   `invocations/`. A standalone session has `transcript.jsonl` and `blobs/`
   in its directory; the executor's own record stays in `session/`, whose
   layout key is now `executorSession`.

## Changes from the design

Each is recorded, with its reason, in the iteration note named.

### Sessions and lifecycle (iteration 1)

- `invocation-ended` is `{ kept: true }` or `{ kept: false, finished: <reason> }`,
  and `invocation-started.start` is `opened` or `continued`.
- **An eighth reducer transition:** a session opened whose first invocation
  never started accepts `session-finished`, since a run can end or crash
  between the two appends. The rule is one: `session-finished` finishes a
  session whose harness awaits no invocation of it.
- Run end appends every `session-finished` and the terminal event as one
  serialized write. A session whose invocation is still awaited at run end,
  such as a stop whose grace expired, stays live, and readers show it
  interrupted.
- `brief-appended.session` is the harness session; the executor's point is
  `ref`. `GlobalContext` gains `session` and `point`.
- `job.json` is `ramify-agent.job/3`; a `job/2` run is refused as
  unsupported. `invocation.json` and `outcome.json` are unchanged, since the
  events carry the session. The standalone `session.json` is
  `ramify-agent.session/2`, with `model`.
- Two new crash boundaries, `session-opened` and `session-finished`: the
  composed recovery table has 35 rows.

### Lineage and metrics (iterations 2 and 10)

- **A degraded start is recorded at `invocation-ended`,** as `degraded`, not
  at `invocation-started`: that event is committed before `startSession`, and
  the actual start is known only after it. Nothing shows a degraded start
  while its invocation runs.
- A reconstruction is a replacement, not a degradation. A request is
  recorded for a contract sub-session only.
- The engineer's `Continuing iteration …` note is not a point: a
  continuation names the previous invocation's end. The transcript records
  the note as `note-appended`.
- Every lineage field is optional in the schema; the reducer checks a
  relation where one is present, and the run service writes one for every
  start that is not fresh.
- The lineage measurements are their own policy, `lineage/1`, in their own
  response field, so `kpi/1`'s list is unchanged. A segment is measured by
  its actual start; an unknown start is never guessed.

#### `session-weighted-total` and ST04

ST04 asks that `session-weighted-total` group by session. It groups by the
harness session, never by an executor's ref (iteration 2). Iteration 10 then
refined the term the metric sums: a **model context history**. A session
has one, and each continued start the executor made fresh adds another,
because the continuation loaded its scope into a new model context. So a
session continued normally counts once, at its largest size, as ST04
requires, and a session with a degraded continuation contributes a second
term. `session-count` and the adaptation share still count harness sessions,
and the metric's evidence names each extra context. `kpi/1` keeps its
version: the formula is unchanged, and only its grouping was corrected.

### The port (iterations 3 and 4)

- `ExecutorSupport` replaces `PortObservations`, keeping `usage`, `context`
  and `compaction` and adding `continue`, `fork`, `forkAtPoint`,
  `appendContext`, `exactSystemPrompt`, `guard`, `afterMutation`,
  `thinking` and `retries`.
- **A write naming several paths is blocked as unresolved,** since the
  guard records one decision per call. So is a non-write action reaching the
  guard. A pi `read` without a path is `other`.
- **Tool results are messages, not blocks:** a `tool-result` message names
  its call by `callId`, with text and other blocks.
- **`unmarked` is a fourth thinking visibility.** pi does not say whether a
  provider summarized its thinking, so the adapter does not guess: pi's
  thinking is `unmarked` unless it is `redacted`.
- Cost is null for a model without rates, which pi reports as zero. pi's
  `custom` messages are `user` messages.

### Transcripts (iteration 5)

- A shell call's complete log is the result's `output`, a `file` body beside
  the blocks the agent saw.
- A fork's first entry is its `started` entry, which names the source point.
  The actual start is in `ended`.
- The system prompt always goes to the content store. The first prompt is
  recorded twice: as `started.prompt`, before the model call, and as the
  first `user` message the executor reported.
- The inline limit is a required policy field, so the run policy is
  `run-policy/2`.
- Recovery ends an interrupted invocation's transcript with `ended`
  (`actual: null`) and its point.

### Queries (iteration 6)

- There are two body queries: `bodies/:hash` for the content store and
  `sessions/:session/files?path=` for `file` bodies, each with a standalone
  twin, and a standalone session has a detail route.
- The relation schemas are declared again in the protocol, since
  `run/records.ts` is not browser-safe.
- A complete line that is not JSON is skipped and reported by line number.
- **Analysis limits rose from 87 to 132.** Iteration 10 added 2 and
  iteration 6 added 43 (25 in `sessions.ts`, 18 in `transcripts.ts`). All 45
  are `signature-inferred` limits on newly exposed schemas, the limit every
  exposed schema has. `check:self` reports 0 errors and 0 warnings.

### Web (iterations 7 to 9)

- A message's `error: null` is not listed as "not reported"; the first
  prompt is collapsed with the system prompt; the chapter's evaluation
  formatting is shared with the Run page.
- Interrupted sessions are marked, apart from suspended ones. The run-level
  strip also holds sessions whose element the view does not draw, such as a
  global fork in By module. A capability row's detail lists its sessions.
- **Timeline columns are event order, not time.** A column is one run event
  at which a session changed; a gap spans its suspension's events, and its
  width is not a duration. A lane starts at its first invocation's start.
- Run → Sessions was an interim list in iteration 7, which the timeline
  replaced along with the Measurements tab's Sessions table.

### Owners beyond each iteration's Owner line

The web client changed in iteration 6 (client calls and the stub) and in
iteration 10 (the Lineage panel). The agent module changed in iteration 8,
where the scripted fake gained an `await` step for the paced fixture, and
the served fixture uses `FakeRamifyCli`.

## Iteration 11

### Pre-acceptance correction

A failed transcript write is a gap in raw output, not in the observations,
which are complete. Iteration 6 found that `transcript-incomplete` still
lowered `observation-coverage` and was listed as
`observation-coverage.transcript-incomplete`. `1a49f13` adds
`rawOutputGapKinds` beside the observation schema, and
`observation-coverage` and its per-kind breakdown leave those kinds out. The
gap stays in the invocation's observation log and in its evaluation's
`gaps`, which the session queries serve and each transcript chapter shows
under "Coverage gaps". A new `kpi-metrics.test.ts` case and an extended
`transcript-run.test.ts` case cover it. `kpi/1` keeps its version, as the
ratio now counts what it names.

### Browser evidence

[evidence/capture.mjs](evidence/capture.mjs) is re-runnable from
`ramify-agent/` after `npm run build:web`:

```sh
node docs/plans/09-session-model-and-transcripts/evidence/capture.mjs
```

It starts `serve-progress-fixture.ts` on free ports, drives Chromium through
playwright-core at 1440×1000 and 390×844, releases the live engineer's steps
with `POST <control>/step` from its own process, and stops the server by the
pid the fixture prints. It fails on any console error or warning, any page
error, and any page-level horizontal overflow, and it asserts what each
capture shows. [browser-evidence.json](evidence/browser-evidence.json)
records each capture's facts. The 22 captures, each `-desktop` and
`-narrow`:

| Capture | Shows |
| --- | --- |
| `sessions-page` | 27 sessions; the live engineer first, then the two suspended architects; an interrupted session among the finished ones |
| `transcript-block-open` | the lineage run's `ses-0001` with its system prompt open: a 15.8 KiB stored body, requested once, on expansion |
| `live-transcript-before`, `live-transcript-after` | the live engineer's transcript before and after two released steps (5 then 7 entries at 1440 px, 7 then 10 at 390 px), followed at the bottom |
| `progress-by-module`, `progress-by-module-panel` | `shared-ui` marked `1 live`, `engineer`, `1 suspended`; its side panel lists `ses-0004` live, awaiting `inv-0005`, and `ses-0002` suspended; the run-level strip holds `ses-0001` |
| `progress-dependencies`, `progress-dependencies-panel` | `badge-tone` marked alike; its panel adds `ses-0003` finished, `not-kept`; the strip holds `ses-0001` |
| `timeline-lineage`, `timeline-lineage-replacement` | the lineage run's 10 lanes and 14 segments: a fork, an append, a request, a degraded continuation and, scrolled along the timeline, the dashed replacement |
| `timeline-live` | the live run's four lanes, with the awaited segment reaching `now` |

playwright-core is the repository root's dependency, not ramify-agent's; the
script resolves it from there, and Chromium from `RAMIFY_CHROMIUM` or
`/usr/bin/chromium`, as the toolkit's browser acceptance does.

### Development pi check

This check called a real model once, for development only; no test calls a
model. A copy was prepared with `npm run trial -- prepare --into
/tmp/plan9-pi-check --no-install`, and one standalone session ran on
`collection-review/workspace/reviews`:

```sh
npm run session -- --project /tmp/plan9-pi-check/collection-review \
  --module collection-review/workspace/reviews --prompt-file <assignment> \
  --model openai-codex/gpt-5.6-luna:medium
```

The assignment asked the engineer, without editing anything, to read
`subs/workspace/subs/reviews/src/mcp.ts`, run `wc -l` on it with the shell
tool, and submit a `partial` result. It ended `submitted` after 11 s,
`partial` with no rejected submission, using 20,329 tokens. The raw
transcript and session directory are not committed.

- **Entries:** 12. `started` 1; `message` 7 (`user` 1, `assistant` 3,
  `tool-result` 3); `harness` 2 (a post-write check after the shell call and
  the accepted submission verdict); `ended` 1; `point` 1. No compaction or
  retry occurred.
- **The first prompt** is in `started.prompt` (inline, 1,969 B), written
  before the model call, and again as the first `user` message. The system
  prompt is a 17,017 B blob.
- **Thinking:** two blocks, `unmarked`, of 45 and 44 B, each a one-line bold
  heading: the provider's reasoning summary rather than its reasoning, which
  is why the adapter does not mark pi's thinking `full`.
- **Tool calls and results:** three calls, `read`, `shell` and
  `submit_iteration_result`, with actions `read` (whole file), `command` and
  `harness`. Each has one `tool-result` with the same call ID. The read's
  result holds the file inline (5,568 B); the shell's result names its
  complete log, `shell/001.log` (43 B), as its output.
- **Optional detail present** on every assistant message: `model`
  (`openai-codex/gpt-5.6-luna`), usage, `stopReason` (`tool-use`),
  `reasoningTokens` (20, 0 and 48) and `cost`. `error` was null, as no
  message failed.
- **Optional detail absent:** `thinkingLevel`, although the command asked
  for `medium`: pi's own record holds no provider thinking level either.
  `cacheWrites` by retention: pi reported no cache writes and no 1-hour
  split. The `started` entry records the requested
  `openai-codex/gpt-5.6-luna:medium`.
- **The session lists as finished.** `ramify-agent serve --agent fake` on the
  copy answered `/api/v1/sessions` with one entry: standalone, `finished`,
  role `engineer`, executor `pi`, that model, one invocation, reaching
  `collection-review/workspace/reviews`. Its transcript page returned all 12
  entries, and its detail the `submitted` outcome.
- **A finding:** the post-write check's log, `hooks/001.json`, is 1,388,630
  B. The files query serves the first 1 MiB with `truncated: true`, as
  designed, so the chapter shows a truncated log.

### Documents

- The [analysis](../../analysis/2026-09-23-session-transcripts-live-view.md)
  points to these results. Its decision 7 now says an earlier run is
  unsupported, and its open decisions record what this plan settled.
- The future [agent session explorer](../../future/README.md#agent-session-explorer)
  is delivered in part; search, retention and redaction remain.
- The [glossary](../../glossary.md) gains **Transcript** and **Point**,
  which the analysis, these results and the future registry use. Tool
  action and declared support stay port names, defined in the iteration 3
  and 4 notes.
- The [README](../../../README.md)'s quick pi test section names the
  harness's `transcript.jsonl` and pi's own `session/`.
- The main plan's Status and the [documents index](../../README.md) say the
  plan is implemented.

## Verification

From `ramify-agent/`, on the final tree:

```sh
npx vitest run subs/harness/src/tests/session-reducer.test.ts \
  subs/harness/src/tests/session-lifecycle.test.ts subs/harness/src/tests/run-recovery.test.ts \
  subs/harness/src/tests/composition.test.ts subs/harness/src/tests/kpi-metrics.test.ts \
  subs/harness/src/tests/neutral-actions.test.ts \
  subs/harness/subs/agent/src/tests/transcript-content.test.ts subs/harness/subs/agent/src/tests/tool-actions.test.ts \
  subs/harness/subs/agent/subs/pi/src/tests/transcript-content.test.ts \
  subs/harness/subs/agent/subs/pi/src/tests/tool-actions.test.ts \
  subs/harness/src/tests/transcript-writer.test.ts subs/harness/src/tests/transcript-run.test.ts \
  subs/harness/src/tests/session-queries.test.ts subs/harness/src/tests/transcript-pages.test.ts \
  subs/harness/src/tests/lineage-metrics.test.ts subs/harness/src/tests/session-fixture.test.ts \
  subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/protocol-contract.test.ts \
  subs/harness/src/tests/single-session.test.ts subs/harness/src/tests/write-guard.test.ts \
  subs/harness/src/tests/read-excursions.test.ts
# 21 files, 212 tests passed
npx vitest run subs/web/src/tests
# 11 files, 105 tests passed
npm run type-check     # passed
npm run build:web      # built
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 132 analysis limits
node docs/plans/09-session-model-and-transcripts/evidence/capture.mjs
# 22 captures, no console error or warning, no page-level horizontal overflow.
```

## Open items

- **A whole-suite run.** Iteration 1 ran every test file once by a mistyped
  filter, against the plan's rule of focused runs. It passed: 114 files (1
  skipped), 821 tests.
- **A live invocation's evaluation is stale in polls.** Its observations are
  appended outside the run log, so the poll does not report the change; the
  chapter's evaluation refreshes with a state change or a reload.
- **Multi-path writes are refused** as unresolved until the guard records
  one decision per path, or one per call that lists several targets.
- **Images are `other` blocks,** described and not carried; whether the
  content store should keep them is undecided.
- **Tool results after a stop are discarded,** as the harness discards what
  a stopped session produces, so such a call shows no result.
- **Declared support is not recorded** with each session.
- **A failed append's transcript write** has no invocation to record a gap
  against; it is a run-service warning.
- **A complete non-JSON transcript line** makes every later append fail as a
  coverage gap, rather than numbering on past it.
- **An unserved run is derived again** on every list request, since a failure
  is not kept.
- **The transcript page follows one session per poll,** though the poll
  accepts 50 cursors.
- **The Sessions list has no filter or search.**
- **Stop on the fixture's live run is untested,** and the first read of the
  sessions lays the capability graph out twice.
- **A long run makes a wide timeline,** one column per changed event, with
  no collapsing or zoom.
- **`metrics.evaluation.invocations`** is no longer read by the web.
- **The starting context size** is observed after the first model call, and
  no composed run degrades a start; the degraded cases are constructed runs.
- **pi reports no thinking level,** so `thinkingLevel` is absent in real
  sessions although the request names one; the `started` entry keeps the
  requested model and level.
- **A hook check log can exceed the 1 MiB body bound,** as the pi check's
  1.39 MB log did; it is served truncated, and nothing pages the rest.
- **Retention, redaction and streaming text** remain out of scope, as the
  plan states.
