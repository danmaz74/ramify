# Measurement principles

## Separate meaning from calculation

Define the concept, name the metric used to represent it, and identify the
evidence behind each measurement. A formula does not become the definition of
the broader concept merely because it supplies the current proxy.

Distinguish delivered-change complexity from local cognitive complexity. The
former concerns accepted changes; the latter concerns knowledge that must be
understood together. Source size and dependency counts can inform assessments
without becoming interchangeable definitions of complexity.

Several metrics may represent one concept, and one metric may inform several
concepts. Name the interpretation whenever a metric is used as a proxy. Keep
assessments distinct from mechanically derived measurements.

Identify scope, unit, policy version and state or interval before comparing
values. A dimensionless ratio can still depend on a particular reference
population or baseline.

## Measure the token efficiency of the delivered solution

Evaluate the tokens consumed to produce the accepted result. Evaluating whether
a different solution would have been simpler, faster or more economical is
outside the current scope.

Acceptance establishes which result is being measured. It does not establish
that the result is an optimal solution.

## Compute delivered change volume after implementation

Use the delivered change as evidence for a complexity proxy. Plan prose,
estimated work weights and planned package counts are not observations of
delivered work.

A final diff reveals delivered change volume more directly than problem difficulty. A
difficult bug can have a one-line correction, while a straightforward migration
can change many lines. A proxy remains useful when its meaning and limitations
are explicit.

The selected initial proxy, delivered change volume, uses changed source lines.
Richer profiles based on
modified behaviors, contract changes, dependency relationships and ownership
changes remain possible later. Their overlapping contributions and extra
analysis requirements do not justify introducing arbitrary weights now.

## Separate delivered change from the cost of reaching it

Compare the starting snapshot with the accepted final snapshot for the
denominator. Include attributable discovery, implementation, review, repair and
failed attempts in the token numerator.

Repeated edits and reverted attempts consume tokens without enlarging the
delivered change. Cumulative mutation events answer a different question from
the final diff.

## Normalize against the starting search space

Freeze the whole project's eligible source inventory before the run. Use that
baseline for the search-space adjustment.

A small change in a large project can require substantial investigation. One
goal of ramify-agent is to use modularity to reduce that cost. Assigned local
scopes, actual files read and the neighborhood agents discover are outcomes of
the strategy being evaluated. Using them as the normalizing search space could
cancel the benefit of successful narrowing.

For two runs with the same delivered change volume and starting search-space
size measured by the same proxy, a fourfold reduction in tokens must yield a
fourfold reduction in adjusted token cost. This comparison does not require
establishing how search difficulty scales across different projects.

Generated API views, architect views and module counts must not enlarge the
baseline merely because a strategy introduces more representations or
boundaries.

## Use a modest, explicit size adjustment

Allow larger starting projects a greater search-space adjustment, with
diminishing growth. A linear adjustment would assume that doubling source size
doubles the difficulty allowance.

The initial logarithmic adjustment is a policy choice. Its shape and scale are
not an empirically established law. Same-baseline comparisons are easier to
interpret than comparisons across unrelated projects, languages or task kinds.

Retain the unadjusted cost and raw inputs beside the adjusted value. A future
policy can then recompute results from the same evidence.

## Preserve meaning and evidence

Publish the metric's unit, direction, policy version, source identities, token
accounting basis and coverage. Missing evidence is not zero.

Project identity must cover the captured content, including dirty and untracked
eligible source. A commit identifier alone need not identify that state.
Unattributable concurrent changes must not silently become delivered work.

Token totals require compatible, non-overlapping usage categories. Provider,
model and accounting differences remain visible in comparisons. Token
efficiency does not by itself measure monetary cost, latency or overall
productivity.

## Measure a segment by the start it made

A fork or continuation the executor made fresh inherited nothing. Counting it
as the start the harness asked for would credit a fork or a continuation with
a fresh start's cost. Measure it as a fresh start and count it as degraded.
Where the start is unknown, the segment stays in its requested group and its
figures are missing, never zero.

Session-weighted arithmetic sums scope once per model context, not per harness
session: a degraded continuation loaded its scope again.

Lineage comparisons are descriptive. A fork and a fresh start, or a repair and
a fresh engineer, differ in their prompts and work as well as in their start.

## Keep collection simple

Exploration measurement is deferred. File-read tracking, search-result
accounting, cumulative source exposure and estimates of context actually
examined are not prerequisites for the initial metric.

A learned expected-token model is also deferred. Such a model would require
comparable runs, validation on unseen plans and care not to use process costs
as complexity predictors. The initial policy can be calculated without a
training dataset.

Ramify owns generic source and ownership evidence. ramify-agent owns run
snapshots, attribution, usage observations, policy and aggregation. A new metric
does not justify a competing project analyzer.
