# Architectural plan artifact

> **Superseded** on 2026-09-19 by the [harness principles](../../../harness.principles.md) and the
> [harness architecture](../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../README.md) for what may be reused.

**Plan:** [Pi architectural planning MVP](main-plan.md).
**Status:** proposed contract; no producer or consumer is implemented.

## Purpose and authority

`plans/<plan-id>/architecture/<revision>.json` is the canonical completed
architectural plan. The current browser consumes this file; the later
[implementation runner](../pi-agent-implementation/main-plan.md) will consume the
same contract. The user's `plan.md` remains the original request. Architecture
revisions elaborate its implementation and may include explicitly approved
amendments, but never rewrite that source document.

The architect proposes semantic contents; the harness assigns identity and
input provenance, validates references and publishes the completed file. A
partial model answer is not an artifact. Older revisions remain immutable.
The [prompt package](architect-prompts.md) defines how the skill's report
obligations map to these fields and the job's discovery evidence.

## Required contents

| Field | Contents and purpose |
| --- | --- |
| `schemaVersion` | Format version checked by every consumer |
| `revision` | Unique revision ID within this plan |
| `predecessor` | Previous architecture revision when this revises one; omitted for the first |
| `inputs` | Planning job/input-snapshot reference, plan content hash, project source commit, Ramify evidence revision and references to the measurement snapshot, baseline and KPI-policy version; hashes of used reference documents are in the input snapshot |
| `summary` | Short explanation of the proposed implementation |
| `requirements` | Stable IDs, required outcomes/constraints, and references into the captured plan or a recorded approved amendment |
| `modules` | Existing module identity/path or a proposed module ID/path/parent; intended change, rationale, evidence references, alternatives for proposed placement/refactoring, and qualitative work weight |
| `reuse` | Existing behavior/symbol, owner, intended requester, evidence reference and access status: available, needs change or unknown |
| `seams` | Cross-scope agreement needed, participants, responsible work package and affected consumers; rationale/evidence and existing contract references where known |
| `workPackages` | Stable IDs, titles, goals, type, scopes, dependencies, requirement references, related seam/reuse references and acceptance IDs |
| `acceptance` | Requirement references and observable success criteria; declared command argv/cwd when known, otherwise the package responsible for making the check executable |
| `assumptions` | Explicit assumptions, unknowns and evidence limits, with a discovery package where resolution is needed |
| `change` | For a revision: trigger, explanation, impact against original requirements and amendments, routine/substantial classification, and decision reference when approval is required |

Use empty arrays for collections with no findings. Omit optional fields that
have no value. Measured scope totals are derived harness projections under the
[measurement contract](../../../measurements-and-kpis.md), not architect-authored
claims or duplicate embedded inventories. Preserve initial work weights, seams
and reuse findings unchanged for later drift comparisons.

Identity/provenance comes from the harness; the architect cannot
invent a source revision or assert that its own output has passed checks.

A requirement ID remains stable when its meaning is preserved. An approved
change records its predecessor and decision rather than silently reusing an
ID for different behavior. New work packages get new IDs; changing an existing
package retains its identity and is distinguished by architecture revision.

## Work package and scope

A work package is a meaningful goal such as Add provider validation, Adapt the
consumer or Verify the integrated behavior. Types are implementation, contract,
discovery and integration. A package can span a manageable subtree; it is not
required to correspond to exactly one module or one pi session.

Each package includes:

- Its goal and which requirements it advances.
- Primary module, explicit read/write module selectors and supporting paths.
  Each selector names exact-owner or subtree; ordinary/testing API areas stay
  distinct. New modules use their proposed path and parent until materialized.
- `dependsOn` package IDs and a stable order for equally ready work.
- Related reuse/seam IDs, expected result and acceptance IDs.

In the successor, the coordinator turns the next ready package into an
executable brief, attaching current evidence and handoffs. It may use an architect session to refine that
brief automatically. Concrete implementation details can remain deferred, but
no package executes without a usable scope, goal and verification instructions.
No required acceptance may disappear merely because its command is not known
yet; assign work to make it executable before the final verification gate.

A diagram edge means a prerequisite package. A seam means an agreement between
scopes. Neither claims to be a complete source dependency or runtime call graph.
The browser shows the work-package dependency graph and exposes seams in detail.

## Validation and publication

The harness checks the JSON schema, unique IDs, valid references, an acyclic package
graph, valid existing/proposed module paths, scope resolution, and that each
required outcome has work and acceptance references. Unknown discovery evidence
stays explicit. Whether the design really satisfies the request remains an
architect judgment and later implementation/acceptance obligation.

The source plan is free-form Markdown. Extract requirements with references;
record assumptions rather than pretending that structural validation proves
that every sentence was interpreted correctly. An unsatisfied constraint must
be addressed by discovery or a substantial-change proposal before work that
would violate it begins.

Write a candidate outside the completed architecture directory, validate it,
then publish with an atomic rename and a durable completion event. Only completed
published revisions appear as ready. Recovery reconciles a published file whose
completion event was interrupted; no partial file becomes ready. Invalid output
gets automatic correction without asking the user to edit JSON.

The first deliverable records freshness and exposes no implementation launch.
In the successor, a revision becomes eligible for implementation only when its
input snapshot is current, it has no unapproved substantial change, and it is the latest selected
completed planning result. The launch request names the exact revision and
expected current job state. Recheck in the harness to close stale-tab races.

## Planning evidence and successor execution

Architecture files contain the design, not mutable task status, transcripts or
claims that checks passed. The current deliverable records planning jobs and
publication. The execution records and rules below belong to the successor.
Job events name architecture revision, package ID,
attempt ID and outcome; check artifacts hold actual execution evidence.
Progress is a harness projection of these events onto the current architecture.
Clients read it through the [client protocol](client-protocol.md); they do not
write artifact files or derive their own authoritative workflow state.

Routine replanning publishes a new revision and an activation event. Keep prior
package attempts and observations bound to their original brief and resolved
scope. Accepted work can carry forward only when its scope, prerequisites and
acceptance remain valid; otherwise schedule revalidation or repair.

A substantial proposal is retained with the job until decided. It is displayed
as a proposal, never as an activated implementation plan. An approval binds its
exact ID/content and is required before its revision can activate. A rejection
preserves the original commitments and triggers further architect work.
