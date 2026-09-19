# Plan 2C consumer review

**Date:** 2026-09-19. **Scope:** review of the proposed Ramify measurement
producer for ramify-agent; no producer files or runtime code changed.

[Plan 2C](../../../docs/plans/iteration-2c-module-measurements/main-plan.md)
is a required dependency of architectural planning and execution measurements.
Its separation is appropriate: Ramify supplies revision-bound project facts;
ramify-agent computes scope selections and run KPIs. The plan is still proposed,
and the inspected service interface has no `measure` operation yet.

## Findings

1. **P1 — The published ownership rule overclaims what an unlisted path proves.**
   Decision 7 and MM10 promise arbitrary-path attribution from the nearest
   module and path shape. Inventory discovery also excludes dependency/output
   roots, independent compiler scopes and generated paths, and does not traverse
   symlinks. Those boundaries are absent from the proposed document. For example,
   a path under `src/node_modules/` would receive an ordinary owner under this
   rule although it is excluded from the inventory. `.ramify-architect` and its
   temporary siblings are also reserved, not only `.ramify`.
   Freeze a path-resolution contract with generated/excluded/outside/unknown
   outcomes and precedence, and expose the facts needed to apply it. At minimum,
   label unlisted new paths as provisional rather than verified inventory facts.
   Add excluded-output, dependency, independent-scope, generated and symlink
   cases to MM10. Locations: main plan decision 7 and the query file record;
   evidence: `inventory.ts` lines 20–27, 143–174 and `generated-path.ts`.

2. **P1 — The JSON cannot reproduce source-filtered totals for selected files.**
   Production/tests buckets include a testing module's ordinary source under
   tests, but `files[].area` remains ordinary and `modules[]` exposes no tags or
   source profile. A consumer selecting individual supporting files cannot
   classify them consistently from `measure` alone. Add an explicit production/
   testing classification to source/resource records, or the ordinary source
   profile to module records. Preserve physical area separately for choosing
   ordinary versus testing API views. Specify documentation's area value too:
   it is not a source area. Extend MM03/MM04/MM11 to recompute buckets from file
   records for a testing-classified owner. Locations: main plan lines 113–115,
   135–143; source-filter spec and `InventoryFile` confirm the distinction.

3. **P1 — Whole-project rendering/output has no explicit resource-limit contract.**
   Decisions 4/6 and iteration 3 render every owner's API views and return all
   files in one document. The existing wire transport has negotiated response
   ceilings, and materialization has output/staging limits. The proposal does
   not say which limits constrain this read-only operation or what happens
   before an oversized render/serialization. It already inherits deadline and
   cancellation outcomes; define their render checkpoints along with byte/count
   budgets, bounded accumulation and an explicit
   unavailable/resource-limit response. Add a large many-owner/large-file-list
   case over the actual transport. A warm toolkit latency sample alone does
   not establish that this path remains bounded.

4. **P2 — The view-byte fallback contradicts the equality acceptance gate.**
   Decision 4 permits API-view byte measurements in the architect summary to be
   unavailable when its budget is exceeded, while the runnable outcome and MM08
   require both surfaces to have the same values. Define equality for common
   measured fields and an explicit
   allowed availability difference. State that query bytes remain measurable
   independently, retain the reason, and test the fallback. The decision points
   at MM10 for cost, but the budget case is MM12. The client must be able to use
   the query even when the architect summary omits view-byte measurements.

## Consumer compatibility, not producer defects

Context-size inventory is not the literal default `rg` search space: it has
its own exclusions, includes the declared documentation bucket and excludes
uninventoried support. Use a named inventory-based proxy unless exact search
semantics become a separate requirement. Do not silently rename these buckets
as bytes actually searched or read.

Plan 2C intentionally omits agent sessions, changed lines, model usage, causes,
planning drift and ratios. ramify-agent owns those. Architect-view size is also
absent from `measure`; the consumer can retain Ramify's materialization target
byte count (not `bytesWritten`, which is zero on unchanged publication) and
hash the generated artifact it actually uses. Supplementary prompt/support
bytes belong to a separate consumer manifest, not another source inventory.

Synchronized `measure` and `materialize` calls can still observe different
revisions. Consumers must compare revision identities and retry/reject the
pair; they cannot assume sequential calls produce one snapshot.

## Integration gate

The consumer adapter requires the built Plan 2C CLI/schema, its completion
report and resolved dispositions for findings 1–4. Plan browsing/protocol work
can proceed independently. Metric-aware architect acceptance and implementation
KPIs cannot be declared delivered from mocks or a draft producer plan. When a
supported producer reports a legitimate limit, preserve it in the KPI output;
do not substitute zero or implement a parallel Ramify analyzer.
