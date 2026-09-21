# Measurement terminology and existing usage

Use the [glossary](glossary.md) for definitions and the
[measurement principles](measurement-principles.md) for interpretation rules.
This map connects those terms to existing documents and implementations. It
does not rename source fields or adopt additional metrics.

## From a concept to a result

Keep four statements distinguishable:

| Layer | Example |
| --- | --- |
| Concept | Delivered-change complexity: the extent and interdependence of the accepted changes. |
| Metric | Delivered change volume: eligible added plus deleted nonblank source lines. |
| Proxy interpretation | Use delivered change volume to represent delivered-change complexity in this policy. |
| Measurement | 600 changed source lines between two identified snapshots under `token-efficiency/1`. |

The last statement can be reproduced without claiming that 600 lines capture
all the difficulty of the change. Another metric could represent the same
concept differently; the definition of the concept need not change with it.

When specifying a metric, identify its name, object and scope, unit, inputs,
calculation policy, evidence identity, coverage, and intended interpretation.
State the direction only when the interpretation supplies one. A dependency
count has no universal better direction; a token-cost comparison has a lower
direction only with its output and adjustment policy held explicit.

This is a documentation convention, not a new wire schema. Definition status
(proposed or adopted), implementation status, empirical validation and the
coverage of one measurement are separate statements.

Existing code types called `Metric` can contain measurement results. Preserve
those identifiers when discussing code; use the distinction above when
describing what is defined versus what was observed.

## Complexity terms currently used

| Preferred term | Object and question | Existing usage or evidence | Measurement standing |
| --- | --- | --- | --- |
| Delivered-change complexity | The baseline-to-accepted transformation: how extensive and interdependent are its changes? | [Token-efficiency policy](token-efficiency.md). | Delivered change volume is the selected initial proxy; implementation is separate work. |
| Local cognitive complexity | One module at one abstraction level: what must be understood together? | The cognitive-decomposition proposal calls this **local complexity**. | Qualitative concept assessed from evidence; source size does not directly measure it. |
| Explorer file/dependency heuristic | One module relative to the explorer model: what weight results from its file and provider counts? | The implementation field is `approximateIcs`. | A computed relative heuristic with a historical complexity label; it does not measure delivered-change or local cognitive complexity. |

The explorer heuristic combines equally weighted owned-file and distinct
provider-module counts, then divides by the maximum raw value over the modules
in the supplied model, using zero when the maximum is zero. Its
[projection](../../../subs/service-api/src/project-view.ts) still computes
`approximateIcs`. The [older view-model document](../../../docs/plans/iteration-6-project-explorer/view-model.md)
calls it approximate complexity. The [later graph delivery](../../../docs/plans/iteration-6d-behavioral-dependency-diagram/iterations/iteration6-results.md)
removed the complexity pill and its use in node sizing; the
[current radial graph](../../../subs/presentation/subs/project-view/src/ModuleGraphRadial.tsx)
sizes nodes from owned source-file counts. Removal from that visualization is
distinct from removal of the projection field.

Because the heuristic is normalized against other modules, its value can
change when another module changes even if the measured module does not.
Call it the **explorer file/dependency heuristic** in new prose and preserve
`approximateIcs` when referring to the actual field. Do not infer an expanded
meaning for the abbreviation.

## Size, search space and context

| Preferred term | Existing quantity | Distinction |
| --- | --- | --- |
| Starting search-space size (source-line proxy) | `S0` in `token-efficiency/1` | Whole eligible baseline source, in nonblank lines; a proxy for potential starting search-space size. |
| Declared search-space size (inventory-byte proxy) | `S_s` or `S_e` in the [older KPI contract](../measurements-and-kpis.md), computed under `scope-size/1` | Assigned inventory/view/support components in bytes; neither actual exploration nor model tokens. |
| Root scope-byte baseline | `B` in the older KPI contract | A frozen byte universe that includes more kinds of content than `S0`; the two baselines are not interchangeable. |
| Inventory context size | `contextSize` buckets in Ramify measurements and the [modularity report](../../../docs/architecture/modularity-report.spec.md) | Named counts and bytes for exact owners or subtrees; each surface defines its included buckets. |
| Model context usage | Context observations in the [agent observation schema](../../subs/harness/src/run/observations.ts) | Tokens occupying context at an observation point; cumulative tokens spent are a different quantity. |
| Actual exploration | Reads, searches and information exposed during execution | An activity concept; its measurement is deferred for the new token-efficiency policy. |

The older names "starting source size" and "inventoried scope size" refer to
`S0` and the inventory-byte proxy respectively. Use the full measurement name
at first mention, then `S0` or **declared scope bytes** within that context.
Use **model context usage** for the token observation. Unqualified "context size" or "search space" does not
identify the unit, included content or observation being described.

## Change, cost and efficiency

| Preferred term | Existing quantity | Distinction |
| --- | --- | --- |
| Delivered change volume | `C = A + D` under `token-efficiency/1` | Accepted endpoint difference, with the policy's source and line exclusions. |
| Cumulative edit volume | Mutation-event weights in the older KPI design | Repeated edits and reversions count again; process activity rather than delivered output. |
| Invocation numstat increase | Current [line-event collector](../../subs/harness/src/kpi/lines.ts) | Positive differences of before/after per-path numstat counts; neither exact cumulative edits nor the whole-run final diff. |
| Token cost | `T`, or compatible provider usage categories | Observed consumption; not an estimate of intrinsic difficulty. |
| Tokens per 100 changed source lines, with or without search-space adjustment | `U` and `K` in the new policy | Explicit ratios used to evaluate token efficiency; lower is better under the stated policy. |
| Scope-size ratio | `scope-size-ratio` in the [current KPI projection](../../subs/harness/src/kpi/metrics.ts) | Assigned scope bytes weighted by reported changes, normalized by `B`; it is not a token-cost ratio. |
| Reduction factor | `reduction-factor` in that projection | Inverse scope-size ratio; it does not by itself establish actual token savings. |
| Solution efficiency | Assessment of the delivered solution relative to alternatives | Separate from the economy of the process that produced it; outside the current metric's scope. |

The collector's existing field names remain compatibility identifiers. New
prose should state what it actually observes, even where an older name suggests
a more complete measurement.

## Cohesion and coupling

Cohesion and coupling are architectural concepts. Boundary locality, internal
connectedness, contract breadth, interface use, fan-in/fan-out, structural
instability, cycle structure and change affinity are named metrics that can
inform assessments of them. Their definitions remain in the
[modularity specification](../../../docs/architecture/modularity-report.spec.md).

The [cohesion/coupling proposal](../architect-skill-design/2026-09-18-cohesion-coupling-indices.md)
also considers independent-change share and reference density. A proposal to
use a metric as evidence is distinct from adopting it as a definition of
cohesion. These measures do not become complexity measures merely because
they can help explain reasoning burden.

For example, "this module has low exact-owner locality" names a structural
observation. "Its responsibilities do not belong together" is an assessment
requiring additional reasoning. "It is too complex" leaves both the property
and supporting evidence unspecified.
