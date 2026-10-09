# Reading session observations

Plan 24 reuses existing machine-readable records and projections. No new
collector or benefit trial is required. Dan can use these observations to assess
orientation reuse; they do not establish a benefit themselves.

## Per-invocation access

Run records live under
`plans/<plan>/.harness/jobs/<run>/invocations/<invocation>/`. The existing API
serves `GET /api/v1/plans/<plan>/runs/<run>/metrics` and
`GET /api/v1/plans/<plan>/runs/<run>/sessions/<session>`. Metrics exposes
`evaluation.invocations[]`; session detail exposes `session.invocations[]`,
including each invocation's `evaluation`. Join on `invocation` and the existing
work-item/iteration/request identities. The Sessions page already shows the
corresponding timing, usage and exploration details.

| Observation | Existing location |
| --- | --- |
| Role and work identity | `invocation.json`: `role`, `work`; metrics evaluation also exposes role, work item, iteration and request. |
| Task kind | The retained task packet's `message` starts its task section with `# Current task: <kind>`. Its delivered additions also name `procedure:<kind>`. See the correlation lookup below. |
| Requested and actual start | `invocation.json.session.requested`; `outcome.json.session.mode` when recorded. Session detail includes `operation.mode`, continuation/fork lineage and `degraded`. For a separate fresh fallback, `degraded.requested` retains the original fork/continue intention while the new operation's mode is fresh. |
| Fresh fallback reason | `session.invocations[].degraded.reason`, recorded start/outcome reasons, and the failed predecessor's outcome. Global append loss also appears as `brief-not-appended` in `events.jsonl`. |
| Elapsed time | `outcome.json.elapsedMs`; metrics `efficiency.timing.elapsedMs`, from recorded invocation boundaries. Milestone, model and tool durations have their own fields and coverage. |
| Provider usage | `outcome.json.usage`: `input`, `cacheRead`, `cacheWrite`, `output`, `total`, or `{ unavailable: ... }`. `observations.jsonl` retains per-call `usage` rows. Recorded charges, when supplied, expose `newInputTokens`, `cachedInputTokens`, `cacheWriteTokens` and `outputTokens` under `efficiency.charges[]`. |
| Exploration | `efficiency.exploration.metrics`: reads, unique files, repeated reads, searches, broad/outside-scope searches, returned bytes and observed elapsed sum; `zeroMatchSearches` and original observations sit beside it. |
| All tool calls | `observations.jsonl` rows of type `tool-start`; count their distinct `data.callId` within an invocation. Tool durations are separate `tool-duration` rows. Read/search subsets are the exploration counts above. |

To locate a retained task packet, read `invocation.json.sessionOperation.runId`
and `.operationId`. Its harness correlation is under
`plans/.harness/session-operations/correlations/operations/<hash>.json`, where
`<hash>` is SHA-256 of the UTF-8 bytes of JavaScript
`JSON.stringify([runId, operationId])`. Read `packet.message` or
`packet.additions`; no provider payload decoding is needed. Legacy invocations
without this correlation have no retained task-kind value here.

## Coverage and interpretation

Missing provider usage, task correlations or timing endpoints remain unknown;
they are never zero. Read coverage fields and retain known subtotals separately.
Provider usage categories retain their recorded meanings. Do not infer uncached
input by subtracting categories unless that provider's accounting supports it.
A recorded fork does not guarantee provider prompt-cache reuse.

Exploration observations retain source identity across replay and inheritance.
The existing projection deduplicates them and excludes conflicting observations;
raw log analysis should likewise count original calls once. Returned output bytes
are not scanned/source bytes. Wall time is not the sum of parallel tool calls.

Run-level `lineage.metrics` groups actual fresh/continue/fork starts and preserves
degradation reasons. Its requested-start counts use `degraded.requested` for
separate fresh fallback invocations, while the operation remains fresh; [lineage measurements](lineage.md) defines those aggregates
and their historical generation/replacement inputs. Historical values remain
readable even though new context losses do not build replacement parents.
