# Potential future capabilities

**Status:** Candidate registry. An entry here is neither scheduled nor approved
for implementation.

This directory collects user-facing capabilities that may follow the current
MVP. Keep each entry short and link to an existing design when one exists. A
candidate moves to `docs/plans/` only when implementation is planned; design
work that becomes substantial can get its own document in this directory.

The maturity labels used here are:

- **Captured:** the desired outcome is recorded, but it has not been designed.
- **Explored:** constraints or alternatives have been investigated.
- **Specified:** a design describes the expected behavior.
- **Planned:** an implementation plan exists under `docs/plans/`.

## Measurement and evaluation

### Delivered-solution token efficiency

**Maturity:** Planned; blocked until Plan 3 is complete and merged.

Measure provider-reported token cost against the accepted endpoint source diff,
with a fixed allowance for the starting project's source-line search-space
proxy. [Plan 4](../plans/04-token-efficiency/main-plan.md) implements the agreed
[`token-efficiency/1`](../metrics/token-efficiency.md) policy without changing
Plan 3's byte-based scope KPIs. It also adds precise context-limit visibility:
budget returns, compaction triggers and exact overflow-triggered occurrences.
Actual exploration and solution efficiency remain outside that plan.

## Planning

### Plan-scoped capability registry with entry points

**Maturity:** Captured. Post-MVP.

One registry per plan holds every capability the agents name, existing or new,
under a name the harness forces to be unique. The initial architect registers
what it discovers; later roles add to it. The dependency graph is drawn over
these entries, and the harness runs the checks the entries make possible.

- **Entry points.** An entry for a capability that exists points to its entry
  point, usually a function or a method: module, file and exported name. At
  the start only some lower-level capabilities have one, and no top-level
  capability does, because a top-level capability that exists needs no work.
  As the plan advances every capability gains an entry point, unless it is
  retired because of information acquired later, with the reason recorded.
- **An extension is a new capability.** Adding attachments to an existing
  "send email" is registered as "send email with attachment", a capability of
  its own with no entry point yet. No relation to "send email" is recorded.
  Several capabilities may end at the same symbol.
- **Names are ephemeral.** They are units of decomposition used while
  planning. They are never materialized in the project, and nothing outside
  the plan's records depends on them.
- **What the harness verifies** is form and existence, never meaning: a name is
  unique; a graph is coherent (no unknown name, no cycle, nothing depends on a
  top-level capability); a registered entry point exists, is owned by the
  stated module and appears in each registered consumer's API view; a
  registered entry point that a later iteration removes or renames is reported
  at the next gate; the run ends with every capability mapped or retired.
  Whether a symbol is the capability stays the agents' judgment.
- **What it gives the roles.** An engineer's briefing names the entry point of
  each capability another module owns and says whether its module receives
  it, so it does not search that module's source.

The [required capabilities analysis](../analysis/2026-09-23-capability-registry-analysis.md)
revises the end-of-run rule: only required capabilities need an entry point,
and every other capability is retired by deduction once the run completes.

Today's run-scoped registry (`ramify-agent.capability/1`) records behavior,
owner, origin and consumers, without entry points or a lifecycle, and keeps
forecast capabilities apart as hypotheses. The
[capability dependency progress graph](#capability-dependency-progress-graph)
would read this registry.

## Execution visibility

### Capability dependency progress graph

**Maturity:** Specified.

Show plan progress as a dependency graph. Entry capabilities appear at the
left, their dependencies occupy successive columns, arrows show dependency
direction and visual state distinguishes todo, working on and completed work.
The [follow-up specification](../architecture/autonomous-implementation-loop.md#follow-up-capability-dependency-graph-visualization)
defines the retained records and presentation rules. The current MVP retains
the source records but does not deliver the graph.

### Iteration explorer

**Maturity:** Captured.

Let a person inspect planned, active, completed and superseded iterations,
including their assignments, scope revisions, outcomes, retries and reasons
for waiting or reopening.

Test and check results belong in the iteration view initially. Show every gate
attempt, its selected checks, result, repair round and full-output reference.
The MVP already records this append-only evidence; the future capability is a
richer user-facing projection over it.

## Session visibility

### Agent session explorer

**Maturity:** Delivered in part by
[Plan 9](../plans/09-session-model-and-transcripts/results.md); search remains
captured, and retention and redaction are pending.

Let a person inspect activity and logs for every running and past agent
invocation. Preserve the distinction between normalized harness events and raw
pi transcripts. A design must settle live streaming, search, retention,
redaction and behavior when a raw transcript is unavailable.

Plan 9 delivered the Sessions page, a transcript per session in the harness's
own format, a live transcript that follows complete entries, a missing
transcript shown as missing, session marks on the progress diagrams and the
lineage timeline. What remains:

- **Search** across sessions and within transcripts; the list has no filter.
- **Retention** of transcripts and stored bodies, item 6 of the
  [to-do list](../todo.md).
- **Redaction** of secret-looking values, not decided.
- **Streaming text** within an entry, which the entry numbers leave room for.

## Quality review

### Check findings

**Maturity:** Captured; explicitly deferred from the MVP.

Add a finding lifecycle similar to cucumber-viz, with stable finding identity,
status, evidence, disposition and resolution history. The current architecture
deliberately stops at an
[append-only history of gate attempts](../architecture/autonomous-implementation-loop.md#harness-owned-testing-gates-and-repair),
without finding adjudication, waivers or a separate resolution workflow.

### Automated code reviews

**Maturity:** Captured.

Run automated reviews and present their actionable results. Treat reviews as
producers of findings once the finding lifecycle exists, so review output does
not create a separate status and resolution model.

## Delivery lifecycle

### Isolated worktree execution and merge

**Maturity:** Captured.

Run implementation in an isolated worktree and merge an accepted result into
its destination. A design must cover source preparation, branch ownership,
concurrent changes, conflicts, final validation, merge authority, recovery and
worktree cleanup. Keep the merge decision distinct from implementation-loop
completion.
