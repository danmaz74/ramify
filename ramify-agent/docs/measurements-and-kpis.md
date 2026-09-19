# Ramify measurements and ramify-agent KPIs

**Status:** proposed consumer contract. It was written for two plans that are
now superseded; its references to their planning and implementation phases
need review against the [harness architecture](architecture.md). The
search-space measures it builds on are summarized in the
[archive index](.superseded/README.md#measurement).


## Ownership and dependency

[Ramify Plan 2C](../../docs/plans/iteration-2c-module-measurements/main-plan.md)
will produce `ramify.measure/1`, per-module context-size summaries in the architect
view, and a file/owner inventory. ramify-agent consumes the installed CLI and
generated files. It never imports toolkit internals or builds another project
analyzer. See the [producer review](reviews/2026-09-19-plan2c-consumer-review.md)
for contracts to resolve before accepting the adapter.

This dependency is strictly one-way. Plan 2C remains a Ramify-only plan: it
accepts no job/session/agent-scope inputs, records no agent activity and exposes
no agent KPI. All observing, joining and aggregation described below runs in
ramify-agent. Ramify is never taught which harness or model consumed its data.

| Ramify owns | ramify-agent owns |
| --- | --- |
| Revision, module tree, source areas/profiles and ownership evidence | Which scope an attempt is assigned and its immutable measurement reference |
| Source/resource/documentation bytes and ordinary/testing API-view bytes | Selecting and deduplicating those buckets/files into a scope-size proxy |
| Generated architect/API evidence and its limits | Pi usage, observed reads/searches/writes, session identity, timing and failures |
| Behavioral dependencies and visible original-symbol evidence | Change attribution, owner/seam/reuse drift and adaptation causes |
| Check outcomes | Run acceptance, KPI formulas, coverage and browser/API presentation |

Existing scaffolding in `ramify-agent/` provides `contracts`, `harness` and `web`.
The harness acquires evidence and computes KPIs; contracts defines wire shapes;
the web renders returned values. A future CLI receives the same values. No
client performs independent KPI calculation or writes authoritative records.

## Evidence capture and consistency

Before initial architectural planning, run `ramify measure --format json` and
materialize the architect/needed API views in the prepared project worktree.
Retain the exact query document once, its schema, content hash, Ramify version,
revision, input/workspace identity and acquisition result. Compare its revision
with the materialized metadata. Retry mismatches within a bounded preparation
attempt; do not merge numbers from different states. A missing/unsupported
producer blocks metric-aware planning readiness, not plan reading.

Freeze a run baseline before its first architect session. Later planning or
engineering attempts retain a current pre-attempt measurement snapshot after
previous tools settle. Refresh after module/source changes and retain end-state
measurements for new/deleted-file attribution. Associate every attempt with its
brief, pi session, baseline, snapshot and metric-policy version. Recovery never
relabels old attempts with new scopes or newer measurements.

A legitimate unavailable bucket may permit planning with explicit uncertainty,
provided the compatible producer is present. Mark every dependent value partial
or unavailable. Schema errors, revision conflicts or an absent producer cannot
masquerade as supported limited evidence. Session, time and usage collection
continues even when a size-dependent KPI is unavailable.

Store measurement documents once beside job inputs; store references in the
architectural artifact and attempt records. Store component IDs and aggregate
recipe, not copied inventories in every brief. The agent receives the small
module summaries relevant to choosing scopes, not the complete file list.

## Scope size policy v1

The proposed v1 uses **Ramify inventoried scope bytes**, a proxy
for scope size. This is not literal default `rg` traversal, text actually read,
or model context tokens. Preserve production, testing, documentation and
ordinary/testing API buckets separately beside the aggregate.

For each attempt define `S_s`, in bytes, as the deduplicated union of:

1. Source/resource file records in its selected exact owners/subtrees and source
   areas, plus explicitly selected documentation. Use Ramify's bytes/ownership.
2. Each declared ordinary or testing API-view area once, using its measured
   total. Deduplicate by owner and physical source area, even when scopes overlap.
   Distinct generated copies in different areas count separately because they
   are different materialized search surfaces.
3. Architect-view bytes when that attempt's profile includes the global view.
   Obtain these from Ramify's publication target size; unchanged publication
   still has the full size. Preserve its revision and content identity.
4. Named support/prompt/skill/plan/handoff documents outside those components,
   using the bytes of captured inputs. Never count the same file again if it
   was already supplied by Ramify's inventory. Record this supplementary bucket
   and its exclusion from Ramify coverage explicitly.

The architect's initial scope includes the architect view and its captured
instructions/request. Source/API expansions are observed and recorded; they do
not retroactively broaden the declared size. A routinely revised broader scope
creates another attempt. Scope-excursion statistics remain separate so narrow declared
scopes cannot hide broad exploration. Partial-path access to a generated area
is measured as its whole declared area in v1; do not invent per-file view bytes.

The root reference `B` is frozen from the initial snapshot: root subtree source,
resources and documentation, all ordinary/testing API-view areas, architect
view and the initial named support set, each once. Record the component list and
policy version. Later project growth or extra support may make `S_s / B` exceed
1; never clamp it or silently change B. B is a common reference universe, not
evidence that an actual root-scoped agent loaded every component.

Undefined/zero B makes normalized values unavailable. A missing size component
makes the total unavailable, with any known subtotal and coverage shown
separately. A new module has no observed pre-creation size: mark its proposed
size unknown, not zero, and refresh Ramify after it exists. Do not estimate tokens
by dividing bytes by four; pi usage is a separate observation.

## Current architect-only delivery

The first plan must supply these measurements without executing work packages:

- Root baseline and component breakdown, source snapshot and coverage.
- Derived size and relative size of each proposed work scope, with exact-owner/
  subtree choice and overlap removal visible; proposed/new scopes may be unknown.
- Actual architect session count, elapsed time, provider-reported usage, tool
  reads/searches, source excursions and result/decision/retry counts.
- Planning-session normalized total, using actual distinct architect sessions
  and their `S_s / B`, including failed and correction/recovery sessions;
  resumed attempts within one session follow the union rule below.

A package count is not an actual session count. Planned scopes and qualitative
work weights are not measured implementation cost. Show implementation KPIs as
**not started** until their required observations exist. Preserve the initial
owner/work-weight map, seams and reuse findings for comparison in the successor.
No extra human confirmation or numerical planning optimizer is introduced.

## Implementation cost KPIs

For change-weighted arithmetic, index each attributable mutation event e with
weight `w_e` (nonmechanical added/deleted text lines) and the enclosing attempt's
scope size `S_e`. For session-weighted arithmetic use distinct pi sessions s.
The included session/attempt set covers initial architecture, later architects,
contract/engineering/integration work and failures/retries linked to this run.
An explicitly linked initial planning job is counted once. A resumed pi session
retains its session identity; fresh model context has a new session identity.
Report session count and attempt count separately. SDK request retries and
compaction alone do not create a new pi session.

| KPI | Definition |
| --- | --- |
| Mean scope bytes per changed line | `sum(w_e * S_e) / sum(w_e)` |
| Scope-size ratio | Mean scope bytes per changed line divided by frozen B |
| Reduction factor | `1 / scope-size ratio`, only when defined and positive |
| Session count | Distinct pi sessions in the included run, including no-change/failed sessions |
| Session-weighted total | `sum(S_s / B)` over included pi sessions |
| Adaptation session share | Distinct sessions caused by a recorded adaptation / all included sessions |
| Adaptation usage share | Provider-reported usage for adaptation sessions / corresponding total usage, by compatible usage category |

These preserve the earlier search-space formulas while naming the inventory
proxy and its changed coverage. Values depend on the declared scopes, not on
bytes actually read. For a single persistent session continued across attempts,
use the union of its recorded scope components for session-weighted size,
counting each component once at its largest observed byte value. This explicit
conservative resume policy avoids counting one continued session twice; it is
not the size of a historical combined Ramify revision. Changed-line events use
their own attempt's measurement. Retain the intermediate terms.

When `sum(w_e)` is zero, mean/ratio/reduction are not applicable. Missing size
or usage data is not zero: show covered sessions/change weight and refuse an
unqualified whole-run ratio. Do not normalize against only known sessions and
present it as the full run. Keep input, cache-read/cache-write and output tokens
separate with provider definitions; combine only proven compatible categories.
Subscription usage is not converted to a hypothetical API invoice.

### Changed-line attribution and exclusions

Record before/after text deltas at observable mutation boundaries, including
untracked additions and deletions. Serialize mutating tool execution or record
an explicitly unattributable overlap; never assign another writer's edits to
the active session by guesswork. A line event is an addition or deletion; a
replacement counts both. Changes to the same line in later edits count again,
including repair/revert work. The final net Git diff is a separate output.

Resolve deleted lines with pre-change ownership and additions with post-change
Ramify facts; an unobserved/new path remains provisional until refresh confirms
it. Mixed ownership transitions retain both identities. Unmapped changes count
in overall change totals with a separate unmapped share, not as root-owned.
Binary deltas have file/byte counts but no invented line count.

A shell command may change and revert files internally between snapshots; those
line events are unknown. Report mutation coverage, not an exact all-write/rework
claim. Prefer direct edit/write deltas and instrumented snapshots. Failed calls
with actual deltas still contribute. No background competing writer is allowed.

Exclude generated/dependency/run-state paths under a fixed recorded policy.
Pure renames with identical content have zero text events; moves with edits
retain those edits. Exclude known formatting/mechanical work only with recorded
classification and evidence; retain raw and excluded counts/reasons. Uncertain
changes remain included with their classification limit. No requirement to
make a commit per session or to infer cause solely from commit trailers.

## Planning drift and adaptation

Compare to the initial architectural revision, not a revised plan that has
already absorbed the surprise. Additional comparisons to the latest revision
are separately labeled. Preserve missing and unclassifiable observations.

| KPI | Evidence and rule |
| --- | --- |
| Owner drift | Share of attributed changed-line events in owners absent from the initial map; list planned major owners with zero change and their change shares; compare the major set to the top k actual owners, where k is the initial major-set size and ties sort by owner ID. Show set intersection/union and unmapped changes; k=0 makes overlap not applicable. |
| Seam drift | Compare initial/final architect `module.json` production `uses` with positive behavioral counts. New directed owner pairs absent from initial planned seams are missed-seam candidates. Planned seams with no new pair and no contract session are unused-seam candidates, not proof of an architectural mistake. Retain evidence scope/unknown counts; unavailable dependency views cannot become empty edge sets. |
| Reuse drift | Adaptation needs identify requester, newly used original symbol, owner, access evidence and whether the initial reuse list named it. Count confirmed escalated reuse omissions only; ordinary visible reuse without adaptation is excluded. Compare symbol identity through Ramify evidence, not source text regexes. Missing/truncated identity evidence remains unclassified. |
| Adaptations and cost | Record each distinct need once, its exposure/tag/missing-provider/uncertain-discovery/wrong-owner classification, and all caused sessions. Repeated reports link to the same need. Sessions with multiple causes count once in the adaptation union; per-cause totals disclose overlap. |
| Knowable share | An architect assessment labels each adaptation knowable, newly discoverable or unknown with pointers to the original evidence. Report confirmed knowable/all adaptations, assessed coverage and the unknown count; its complement is not automatically unavoidable change. Assessments are judgments, not Ramify facts or required human checkpoints. |

Seam drift concerns static production behavioral dependencies; it is not a
runtime call graph and covers neither test-only seams nor all design contracts.
Flag module renames/splits and incomplete before/after coverage; do not infer
negative evidence from unavailable or unknown dependencies. Reuse drift may
be complete only for classified escalated needs; publish that denominator.
Full automated counterfactual planner-quality scoring is not promised.

Always show final acceptance and complete Ramify check outcomes beside cost and
drift. Lower cost with failed acceptance is not success. Record initial check
state so pre-existing violations are distinguishable from remaining/new ones.
Capture deterministic arithmetic cases plus live evidence; no competing harness
trial or root-agent benchmark is required to calculate the reference ratios.

## Storage, API and verification

The harness retains immutable measurement inputs, per-attempt observations,
line-event summaries, cause links and judgments; computes versioned KPI
projections; and serves them through the shared HTTP protocol. No alternate
spreadsheet or web-local calculation becomes canonical.

Every metric includes its unit, state (measured, partial, unavailable or not
applicable), policy version, numerator/denominator when relevant, evidence IDs
and coverage. Distinguish inferred classification from direct evidence.

Fixtures must cover overlap deduplication, a testing module's ordinary area,
missing views, zero denominators, new/deleted ownership, changed baselines,
no-change/failed sessions, repeated edits/reverts, shell observation gaps,
mechanical exclusions, shared adaptation causes, partial usage and unavailable
dependency evidence. The live architecture trial consumes a built Plan 2C
producer; the live implementation trial retains actual KPI inputs and outputs.

## Plan 2C boundary checklist

The dependency is satisfied through generic project information only: inventory
bytes/classification, module identities and ordinary generated outputs. The
consumer owns scope policy, frozen baselines, snapshots of what it consumed,
per-tool observations, edits, sessions/tokens, causes, judgments and all ratios.
Nothing in these records is sent back into Ramify or its measurement schema.
If exact `rg` traversal becomes required, ramify-agent must own that additional
observation; it does not become agent-aware work in Plan 2C.
