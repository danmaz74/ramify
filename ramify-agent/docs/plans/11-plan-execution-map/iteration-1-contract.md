# Iteration 1 contract: execution-map/1

**Starting source:** `7d6af7f410aba9e644044719f1903bd39deaf6e8` plus the design and plan in this directory. This contract fixes the first wire shape. Its fixture is a scripted projection witness, not a recorded harness run or an implemented HTTP answer.

## Snapshot and query

`GET /api/v1/plans/:planId/runs/:runId/execution-map?version=N[&cursor=...][&limit=...]` returns `executionMapPageSchema`. A first request supplies the committed run version from the existing run query. The harness must bind an opaque cursor to that version, a deterministic node/link ordering, the limits and the run identity; clients neither parse nor manufacture cursors. Node order is first source event sequence (records without one last), then kind, then durable ID. Link order is source sequence (records without one last), then link ID. Later record additions do not reorder existing elements inside the same version. A later request with an obsolete version or a cursor for another version returns the existing HTTP `409` `stale-version` error with `currentVersion`. The client discards all old pages and restarts from the new version. An invalid cursor or limit receives `400 invalid-request`. The limit defaults to 100 nodes, may be 1–100, and no page has more than 200 links. These are separate page bounds; `nextCursor` remains non-null until both ordered streams are exhausted. `coverage.nodes/links.shown` count this page and `total` count the snapshot, so they do not state cumulative progress. The response contains the current module tree answer, which can explicitly be unavailable, and named `gaps` for partial retained records. An absent answer is never turned into an empty graph.

Every node and link repeats `runVersion`, and validation rejects mixed versions. A node key is `kind:durable-id`; the kind prefix is enforced. The capability durable ID follows the existing exact slug policy. One key represents one card across pages, including a shared provider. A link endpoint is `shown` when its node is in this page, `other-page` when it is a known node in another page, or `unresolved` with a reason when retained evidence lacks its target. A link may not silently dangle. The server must verify page-wide ID uniqueness and snapshot-wide uniqueness when constructing the ordered streams; the schema verifies each page's duplicates and endpoint coverage.

The index contains scenario names, latest real result, capability reason, current direct consumer requirement keys and compact source references. It excludes full Gherkin and transcript bodies. The targeted capability and scenario paths each require the same run version and return an `available` full description/source block or an explicit `unavailable` reason. Full source blocks are not clipped to a page limit. Existing work-item, gate and transcript queries remain their body sources. The HTTP handlers and browser fetch client are iteration 5 work; these path functions declare their intended URLs now.

## Field provenance

| Contract field | Owning record or event | Rule |
| --- | --- | --- |
| `runVersion`, current activity source | Run event log and committed run snapshot | Awaited session and active gate IDs require exact recorded evidence; an open work item alone cannot create either. |
| Capability key, `level`, `owner`, `reason`, `state` | Accepted analysis entry, capability registry and `CapabilityProgress` | Entry identity is the exact slug; `completed` alone colors a capability green. |
| Capability `scenarios` and `directRequirements` | Tracked scenario membership, latest real gate results, current consumer requirement revisions | Deduplicate IDs. Count only direct current-revision consumer requirements; partial or missing membership stays partial or unavailable. |
| Scenario key, name, kind, state and latest real result | Accepted frozen scenario and tracked scenario state/gate history | Ignore dry-run results; latest real pass is green only while `implemented`. The result bucket and lifecycle remain separate. |
| Work-item key, state, full module path and goal | Work-item records and summaries | A missing owner path is null, not a shortened module name. |
| Iteration key, ordinal, outline revision and state | Committed assignment and outline revision | The order is assignment order; forecasts create no iteration node. |
| Placement request and contract nodes | Typed placement request/decision and contract records | Candidate module relation does not imply implementation activity. Contract revision remains explicit. |
| Requirement state, consumer, contract and revisions | Consumer requirement record and verification event | `verified` requires verification of the current revision. A previous verification remains visible as `verifiedRevision` after reopening. |
| Session key, role, state, executor and work item | Run session lineage and retained session record | Use exact session ID and preserve all roles, including initial and global architect sessions. |
| Gate key, verdict, audit, repair round, commits and active | Gate attempt, audit record and gate start/finish events | An active gate has `verdict: null` until its result is recorded; every settled gate has a verdict, including `not-verified` when that is the actual result. Verdict and audit are independent. `auditedCommit` is a commit ID, not an audit result. A failed gate can have an audit pass. |
| Node/module relation | Owner assignment, contract consumer/provider, candidate placement, authorized scope or observed write record | Relation role is explicit. Candidate and authorized scope are not observed participation. |
| Link kind, endpoints and `source` | Typed event or decision named by `executionSourceRefSchema` | `sequence` is exact where recorded; null for a record without a run event. A provider is canonical even with several consumers. |
| Current tree | Existing `moduleTreeResponseSchema` answer | Current tree revision is independent of run version; an unavailable tree stays unavailable. |

The scripted witness in `subs/harness/src/tests/helpers/execution-map-fixture.ts` fixes expected IDs, source sequences, two entry roots, a shared provider, local architects, a contract engineer, two consumer requirement stages, failed/repaired gate attempts, contract revision reopening, follow-up work, integration scenario and a finite dependency cycle. Its structured writer-change inputs include a proposed and an unplaced module, binary and unmapped paths, and a partial line event. Iteration 4 must turn those writer inputs into independently asserted module totals and coverage; the current page does not pretend to publish those totals.

The retained `status-badge-tone` pi run remains a separate compatibility witness. It has not been replayed by iteration 1, and its missing nested-provider cases must not be fabricated from summaries.

## Visual tokens

`subs/web/src/execution-map-tokens.ts` fixes tokens for later components. These are foreground/accent colors against the listed background, not a license to put small text on saturated fills. The five statuses have text labels and marker shapes. Direct recorded module participation uses violet with a `worked in` label; neutral slate means no recorded work, while unavailable data uses a labeled diagonal hatch. Role marks carry both the icon name and label in the marker, shelf, time rail and window header. The initial architect cyan is deliberately distinct from participation violet. The contract engineer's umber is close to attention amber, so its link icon and role label are mandatory.

| Meaning | Light foreground on `#ffffff` | Contrast | Dark foreground on `#0f172a` | Contrast |
| --- | --- | ---: | --- | ---: |
| Todo | `#475569` | 7.58:1 | `#cbd5e1` | 12.02:1 |
| Working | `#1d4ed8` | 6.70:1 | `#93c5fd` | 9.90:1 |
| Completed | `#15803d` | 5.02:1 | `#86efac` | 12.71:1 |
| Attention | `#92400e` | 7.09:1 | `#fcd34d` | 12.38:1 |
| Failed | `#b91c1c` | 6.47:1 | `#fca5a5` | 9.41:1 |
| Worked in | `#6d28d9` | 7.10:1 | `#c4b5fd` | 9.67:1 |
| Initial architect, compass | `#0e7490` | 5.36:1 | `#67e8f9` | 12.32:1 |
| Global fork, branch | `#a21caf` | 6.32:1 | `#f0abfc` | 10.15:1 |
| Local architect, blueprint | `#0f766e` | 5.47:1 | `#5eead4` | 12.07:1 |
| Engineer, tool | `#4338ca` | 7.90:1 | `#a5b4fc` | 8.96:1 |
| Contract engineer, link | `#92400e` | 7.09:1 | `#fdba74` | 10.59:1 |

All listed foreground pairs exceed 4.5:1 by the WCAG relative-luminance formula. Icons, lines and rings still need browser review at their actual thickness and backgrounds. Only a recorded awaited session or running gate pulses (1600 ms); map focus may briefly outline a target (900 ms). Under `prefers-reduced-motion`, both use a static outline. No other node animates.
