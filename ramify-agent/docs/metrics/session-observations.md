# Reading session observations

Plans 24/25 reuse existing machine-readable records and projections. No new
collector or benefit trial is required. Dan can use these observations to assess
orientation reuse and instruction/discovery delivery; they do not establish a
benefit themselves.

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
| Task kind and procedure | The retained packet's current task section starts with `# Current task: <kind>` and selects `procedure:<role>:<family>` with its exact framed SHA-256. That body can be inherited rather than appended. See the correlation lookup below. |
| Actual instruction inputs | `invocation.json.prompt.manifest`, also `evaluation.efficiency.manifest`, preserves ordered inherited/appended entries, bytes, hashes, sources and inherited point. `/1` and `/2` are readable; new packets use `/2` with optional logical block key/effect. |
| Briefing updates | The operation correlation's `context.history` retains ordered occurrence revisions and optional canonical `contentHash`; `context.revision` selects the current occurrence. Equal content hashes can name distinct A → B → A occurrences. Packet additions record actual set/remove effects. |
| Discovery origin and comparison | `packet.additions` and retained context carry `brief:support:starting-points` producer/work/iteration/invocation/boundary origins and `brief:support:nonfunctional-source` captured comparison names/base/target/default. Inherited pointers need not appear again in current additions. |
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

To distinguish physical delivery from logical state, count ordered manifest
entries by `delivery`. Superseded sets and withdrawals remain physical inherited
bytes. Replay `/2` block effects in order for effective state; do not label that
map as provider context size. The manifest hash covers its original serialized
entry representation, not a schema parser's reordered serialization. Current
message bytes exclude the separately delivered role and tool declaration.

Support-size projections count delivered source identities and unique briefing
content as defined by the scope-size policy, rather than summing every physical
manifest entry. Read those components separately from inherited/appended totals.
Original retries retain the exact old packet and manifest; legacy normalization
does not synthesize physical field deliveries or change historical provenance.

NFR comparison identities describe actual Git boundaries. `run-start` is absent
when original provenance is unavailable; dirty original captures exclude
uncommitted starting bytes. An empty accepted-boundary comparison can coexist
with historical run-start changes, and unchanged caller pointers can be useful
with either empty diff. Neither diff nor pointer provenance proves satisfaction.

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
