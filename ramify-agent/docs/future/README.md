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

**Maturity:** Captured.

Let a person inspect activity and logs for every running and past agent
invocation. Preserve the distinction between normalized harness events and raw
pi transcripts. A design must settle live streaming, search, retention,
redaction and behavior when a raw transcript is unavailable.

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

### Standalone commit-audit integration

**Maturity:** Dependency gated.

Integrate the commit-auditing mechanism after it has been extracted from
cucumber-viz into a standalone CLI tool. The audit should run checks against
the exact committed source tree and return evidence bound to that tree. Replace
the harness's gate implementation behind its existing single entry point,
rather than adding a second checking path.

The current Plan 3 design intentionally prepares this seam and leaves the tool
out of scope. See the
[reuse decision](../plans/03-autonomous-implementation-loop/reuse/README.md#not-copied-the-commit-audit)
and the [core-records decision](../plans/03-autonomous-implementation-loop/core-records.proposal.md#run-the-checks-then-commit).

## Delivery lifecycle

### Isolated worktree execution and merge

**Maturity:** Captured.

Run implementation in an isolated worktree and merge an accepted result into
its destination. A design must cover source preparation, branch ownership,
concurrent changes, conflicts, final validation, merge authority, recovery and
worktree cleanup. Keep the merge decision distinct from implementation-loop
completion.
