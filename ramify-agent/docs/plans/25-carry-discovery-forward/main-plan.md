# Plan 25: discovery handoffs and instruction delivery

**Date:** 2026-10-09. **Status:** complete; implementation and configured qualification accepted.
Planning source inspected: `90940442`. Consolidated on 2026-10-09 with
[former Plan 26](../26-instruction-block-delivery/main-plan.md). This is the single
implementation plan for discovery handoffs and versioned instruction delivery.
Both address the [status-badge postmortem](../../analysis/2026-10-09-status-badge-tone-postmortem.md).
Implementation ran serially in the isolated worktree. The qualified source is
`2df3a6cc2825b3b5e5e9c7e8e61db23544b1ef80`.
[Final results](iterations/05-results.md) join all 45 cases to owning source,
focused checks, failed qualification attempts and the passing configured audit.

## Outcome

Carry useful discoveries forward and avoid repeatedly appending instructions and
facts the selected session point already contains. Every task explicitly selects
its current role, phase, procedure and submission tool. Changed information is
delivered; unchanged information is inherited; withdrawals are explicit.

A local architect can pass the source, test, support and caller locations it
discovered to its engineer. An engineer can pass additional discoveries back to
its architect and on to candidate reviewers. The final non-functional assessor
receives useful source pointers from the implementation, including changes
already accepted earlier in the run, instead of starting its search at the
project root.

Pointers are optional navigation help. They do not determine relevance, prove
correctness, restrict an assessment, grant access or authorize writes. The
receiving agent decides what to inspect and can search beyond them. The harness
transports declared information and checks structural/path rules; it does not
infer meaning from findings, transcripts or source.

## Predecessors and observed gap

[Plan 24](../24-orientation-for-context-selection/main-plan.md) is already
implemented. Its audited candidate `e1fa315c` is an ancestor of trial source
`390eef60`; the trial ran on 2026-10-09 at 13:28–13:37 UTC. The findings below
were observed **after Plan 24**, not before it. The trial's
[result and source provenance](/home/app/ramify-trial-evidence/status-badge-tone-20261009/result.json)
and retained prompts remain historical evidence; use their recorded revision
when interpreting them.

Plan 24 already supplies module/API/test/configuration pointers, explores the
module before context selection, forks the selector, continues assignment, and
falls back to an ordinary fresh brief when context is lost. Keep that behavior.
This plan adds the specific discoveries agents make, rather than repeating its
general onboarding work.

The [NFR prompt review](../../analysis/2026-10-09-status-badge-tone-postmortem/reviews/nonfunctional-assessment.md)
records a fresh assessor rediscovering the badge, its owner and callers. Its
root-wide search returned 10,207 bytes and root README read returned 12,019 bytes.
Its supplied diff compared the final source with itself. The whole assessment
took 63.3 seconds; that is an observed stage duration, not an estimated saving.

The later correction `90940442` already labels the prepared-source comparison
and warns that an empty diff cannot establish historical preservation. It also
records snapshot exploration. Preserve those corrections; they do not yet
supply the missing historical comparison or discovery handoffs.

The same post-Plan-24 trial repeated 6,614 bytes of procedure and 2,204 bytes of
environment in the completion message. These are retained-message byte counts,
not provider tokens or measured savings. Instruction delivery and discovery
handoffs share task packets, named sections and session ancestry; implement one
mechanism and qualify it once.

### Current implementation to extend

Paths in this table are relative to `subs/harness/src/`.

| Existing surface | Available behavior and remaining work |
| --- | --- |
| `work/starting-inputs.ts`; `run/service.ts:taskBrief` | Render known module, test, API, scenario and configuration pointers. Reuse these sections; do not scan the repository to make them exhaustive. |
| `context-selection/submissions.ts:workOrientationSubmissionSchema` | Records focus, understanding and questions. Add optional explicit starting points for fresh consumers; inherited sessions already retain exploration. |
| `work/assignment.ts`; `work/iterations.ts` | Assignment and result records already connect producers to consumers. Extend these records rather than creating a discovery database. |
| `work/engineer.ts`; `work/session.ts` | Render assignment inputs and return engineer findings to the architect. Preserve the new pointers along these same paths. |
| `prompts/briefings.ts`; `run/session-operations.ts` | Named sections and exact-point ancestry exist. Correct occurrence identity when identical briefing content recurs, then integrate block metadata and immutable retries. |
| `prompts/tasks.ts`; `prompts/delivered-manifest.ts`; `interfaces/protocol/runs.ts` | Procedures/environment are appended unconditionally. Add reusable blocks and compatible `/2` manifests while preserving `/1` readers. |
| `run/service.ts:nonfunctionalSourceInputs` | Supplies only latest-accepted-to-prepared changed paths. Add run-start-to-candidate paths and source starting points. |
| `run/service.ts:runBase`; `reviews/snapshot.ts`; `nonfunctional/submissions.ts` | Existing original-boundary recovery, candidate reads/diffs and source exclusions provide the comparison and access boundaries. |

## Instruction delivery foundation

The [instruction-block contracts](instruction-block-contracts.md) own exact block
identity, rendering, selection, session ancestry and durable compatibility.
Discovery remains a caller-owned input, delivered as `brief:<section key>` using
this same mechanism. There is no second discovery delivery cache or block resolver.

1. Resolve effective blocks from ordered actual delivery at the selected session
   point. Fresh tasks receive all current inputs; continuations and forks append
   only missing/changed blocks and explicit withdrawals.
2. Declare procedure families in the role/task definitions. Assignment,
   completion and ordinary local-architect repair share their main procedure;
   orientation, reconciliation and qualification use distinct families. Each task
   selects the current procedure key/hash even when the body is inherited.
3. Split environment facts into one replaceable block per existing field. Render
   object properties deterministically, preserve array order and replace whole
   field values. Null/empty values explicitly clear earlier values.
4. Keep the canonical goal/requirement sections, selector retention policy and
   ordered briefing updates, but correct the existing content-hash-as-occurrence
   assumption. A → B → A must create a new occurrence of A after B, not fail with
   `Inherited revision B is not an ancestor of A`. The correction belongs to the
   existing briefing algorithm and its session caller, not a parallel algorithm.
5. Use invariant set framing: a block always says its value replaces any earlier
   value of that key, including on first delivery. Do not add state-dependent
   wording to bytes used for equality. The exact rendered set text is the block
   version hash and selected-procedure hash; manifests hash the actual delivered
   entries. Withdrawal has its own explicit remove representation.
6. Keep original-packet retry, exact fork points, current tool/validator/authority
   binding, pinned role packages and immutable tool declarations. Adopt new
   manifest/intent readers before new writers; do not rewrite historical evidence.

Known discoveries supplement the current task; they never activate an inherited
procedure, tool or write permission. Superseded text remains physically in the
conversation. Logical replacement does not mean provider context was shortened.

## 1. Capture concise discoveries on existing records

Add one shared, harness-internal shape:

```ts
type StartingPoint = {
  path: string; // literal project-relative file or directory
  note: string; // agent's short explanation of what to inspect there
};
```

Add optional `startingPoints` arrays to:

- the local work-orientation submission, retained by its existing packet;
- the assignment body and committed iteration assignment;
- engineer `completion-proposed` and `partial` submissions, retained by the
  corresponding iteration result.

The shared assignment/engineer paths include capability-coordinated iterations
where they already use those schemas. Do not add new roles or expand unrelated
contract, consultation or initial-analysis submission protocols in this plan.
Those callers continue to use their existing briefs and structured references.

Ask producers to name a few useful locations encountered during their actual
work: implementation entry points, tests, support/configuration, callers or
relevant API-view files. A note such as "existing caller that omits tone; check
compatibility" expresses the producer's judgment, not a harness finding.
Producers may omit the field; no extra discovery turn or completeness check is
introduced. The architect selects assignment pointers for the engineer instead
of forwarding its entire exploration history.

Validate shape and literal project-relative path syntax using the existing
path conventions. Do not allow absolute paths, traversal or globs. A pointer
may name foreign source that the receiving task can already read; it grants no
new authority. Do not require a separate filesystem probe or semantic validity
check before accepting an otherwise valid submission.

Keep legacy records without this optional field readable. Do not rewrite old
records, change their hashes or require an orientation to be recreated. Update
the actual submission JSON schemas, package versions and record readers together
where the repository's existing versioning requires it.

## 2. Deliver the right existing discoveries to each task

Use one named starting-points section where it adds information. Render each
producer group with its existing work-item/iteration/invocation identity and
the recorded source boundary, when available. These identities come from the
harness, not model-supplied provenance. A prior boundary describes where a
pointer originated; it does not assert that the current file is unchanged.

| Consumer | Inputs to carry forward |
| --- | --- |
| Selector fork and continued local architect | Retain the orientation context already inherited. Do not paste its pointer list again merely because the phase changed. |
| Fresh selector or fresh local architect | Include accepted orientation starting points with the ordinary current work brief when that optional record is available. Missing reusable context still takes Plan 24's simple fresh path. |
| Engineer, including an existing capability assignment | Include the architect's assignment starting points alongside the existing module/API/scenario/check sections. |
| Local architect after an engineer result | Include the engineer's starting points with that result, using the existing result delivery. Retain the distinction between accepted and partial work. |
| Code, scope and design reviewers | Include the reviewed assignment's and engineer result's source pointers for that exact iteration/candidate. Keep role-specific questions, guidance and independent inspection. |
| NFR assessment | Include assigned module/source/test locations, explicit starting points from accepted implementation results and their assignments, and the historical changed paths described below. This is a whole-run source assessment, so group origins by work item rather than selecting requirements heuristically. |
| Scoped NFR investigation and repair | Reuse applicable recorded locations within the declared investigation/read or repair authority, plus the existing coordinator task and evidence. Rebuild comparisons for a new prepared candidate. |

Fresh tasks get their ordinary complete inputs; continued and forked tasks use
the consolidated block-aware named-section deltas. Preserve inherited system/tool prefixes. Do not
replay transcripts or full tool outputs to transport discoveries. If a section
is replaced or its pointers are withdrawn, use an explicit replacement section
through the corrected briefing mechanism and record its block effect. Do not
silently retain obsolete advice or force a fresh session for an ordinary withdrawal.

Coalesce identical path/note pairs deterministically and keep their provenance.
Do not rank, summarize or extract paths from prose with regexes. Existing free
text findings remain available through their normal paths; the new field is
the explicit transport for source locations.

Keep additions concise: paths and short notes, no file bodies, catalog dumps or
new model-generated summary calls. Existing context bounds remain in force.
Do not add a global cache, relevance classifier, dependency crawler or a second
durable index of discoveries.

### Snapshot and materialized-view rules

- Workspace consumers receive paths resolved for their existing cwd convention.
  Snapshot consumers receive project-relative paths against their pinned tree.
- Use existing snapshot/source filters before delivery to reviewers and NFR
  tasks. Generated API/architect views and harness records remain excluded as
  NFR source evidence. A producer's origin can be named as metadata without
  requiring the assessor to open that run record.
- Omit inaccessible or absent optional pointers using already available snapshot
  information. Do not turn a missing hint into a task failure. Explicit deleted
  paths in a historical diff remain valid diff entries, not current read targets.
- A readable hint is still unverified. Prompt the consumer to inspect the current
  candidate and explore further when a hint is stale or unhelpful.
- Keep existing view revision/coverage information for agents allowed to use
  views. A pointer to a foreign symbol does not replace the importing module's
  own API view as evidence of importability. Ordinary and testing views remain
  separate; absent coverage is not proof that an API does not exist.

## 3. Give NFR assessment the implementation history it needs

Capture two explicitly named comparisons when preparing its source brief:

| Comparison | Base and target | Use |
| --- | --- | --- |
| `run-start` | Original recorded source boundary to prepared candidate tree | Locate net implementation changes, including previously accepted iterations. |
| `accepted-boundary` | Latest accepted commit to the same prepared candidate tree | Locate unaccepted changes introduced during final preparation or repair. |

Resolve the original boundary from the run's recorded source identity or the
existing durable recovery records. Never substitute today's checkout HEAD for
a missing historical boundary and label the result `run-start`. If no reliable
historical boundary exists, omit that optional comparison and retain the normal
brief and available comparison. A failed diff is not a successful empty diff.
Existing failures reading authoritative candidate evidence keep their error
handling.

The comparison covers its named Git boundaries. If original capture recorded
dirty source, preserve that qualification: the starting commit is not a claim
to include uncommitted starting bytes. Net changed paths also do not enumerate
every intermediate edit or every semantically affected caller.

List both sets of changed paths once, with base/target identities and source
exclusions. Exclude generated/run data with `nonfunctionalSourceAllows`, exactly
as for candidate inspection. Starting locations from assignments/results remain
useful even when both diffs are empty or a relevant caller was unchanged.

For NFR snapshot tools, offer a named comparison argument on `snapshot_diff` so
the assessor can obtain patches for either supplied comparison. Only those
captured comparisons are selectable; agents do not supply arbitrary Git refs.
Use `run-start` by default when available; otherwise explicitly identify the
available `accepted-boundary` default. Both list and per-path patch operations
must report their actual base and target. Keep ordinary review diff defaults
and iteration-baseline semantics unchanged. Share the existing snapshot filtering,
limits and observations rather than introducing a second inspection tool family.

The NFR prompt should start from the supplied implementation locations and use
the relevant diff when needed, instead of requiring a redundant pathless diff
before any inspection. It still assesses every NFR/fixed element in the package,
allows whole-tree discovery, records uncertainty, and makes its own semantic
judgment. Earlier completion claims, green audits and pointer notes do not prove
NFR satisfaction.

## Implementation sequence

Execute six serial iterations. Block delivery is the provider for discovery
briefs; both touch shared prompt/runtime records. Use an isolated clean checkout
and preserve unrelated edits. Reinspect the implementation base, including any
review-diff delivery changes currently being developed, before editing callers.
Iteration receipts are written during implementation, not during consolidation.

| Iteration | Deliverable | Prerequisite |
| --- | --- | --- |
| [0](iterations/00-block-foundation.md) | Block identities, compatible readers, and briefing occurrence model | Clean Plans 23/24 base |
| [1](iterations/01-instruction-delivery.md) | Procedure/environment reuse, exact-point ancestry, appends and retries | 0 |
| [2](iterations/02-discovery-records.md) | Optional discoveries on existing orientation, assignment and result records | 1 |
| [3](iterations/03-discovery-delivery.md) | Task-specific pointer delivery, snapshot filtering and fresh fallback | 2 |
| [4](iterations/04-nfr-context.md) | NFR starting locations and named historical comparisons | 3 |
| [5](iterations/05-qualification.md) | Combined workflows, documentation and final configured audit | 4 |

The [manifest](iterations/manifest.json), [execution rules](execution.md) and
[acceptance matrix](acceptance.md) define write boundaries and checks. Each source
iteration records its commit, checks, handoff and remaining limitations in
`iterations/<NN>-results.md` when executed. Former Plan 26 is incorporated, not a
second runnable plan. Its original delivery case IDs and Plan 25's discovery case
IDs remain distinct and traceable in the combined matrix.

## Performance assessment and boundaries

Use existing retained task packets, physical delivery manifests, invocation
timings, tool observations and provider new/cached-input/output usage for Dan's
benefit assessment. A later comparable trial can show whether repeated searches,
model calls and returned bytes fall without reducing inspection quality, and
whether added pointer text costs more than it saves. Preserve exact source/runtime
provenance: the cited trial already included Plan 24.

Deterministic tests verify delivery and authority. Serialized-prefix checks do
not establish provider cache hits. Fewer appended bytes do not prove reduced
cost or latency. No benchmark, paid live run, telemetry subsystem or performance
threshold is an implementation acceptance gate.

Outside scope: review concurrency, speculative NFR execution, model/reasoning
changes, role merging, new session relationships, cache routing, compaction or
reconstruction, configuration acquisition, repository-wide discovery caches,
automatic requirement-to-file mapping, transcript mining and new materialized
view formats. Procedure/environment reuse and pointer delivery are explicitly in
scope; unrelated prompt slimming remains outside it.

Planning validation covers documents, links, case ownership and the corrected
contracts. It is not runtime acceptance. Update current specifications only when
implementation is delivered; historical receipts remain unchanged.
