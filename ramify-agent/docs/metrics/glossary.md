# Metrics glossary

This glossary names concepts and measurements currently used or selected for
ramify-agent. Calculation policies live in [token efficiency](token-efficiency.md),
[lineage measurements](lineage.md) and the
[earlier KPI contract](../measurements-and-kpis.md); the
[terminology map](terminology.md) identifies existing field names and limits.

## Concept

A property or idea whose meaning can be defined independently of a particular
measurement procedure.

## Metric

A named quantitative definition with specified inputs, scope, units and
calculation rules.

## Measurement

A result obtained by applying a metric to identified evidence under a
specified policy.

## Proxy

A metric used to represent a property it does not directly or completely
measure.

## Assessment

A reasoned judgment about evidence under stated criteria.

## Delivered solution

The accepted final project state produced by an implementation run.

## Delivered change

The difference between the captured starting project state and the accepted
final project state.

## Delivered-change complexity

The extent and interdependence of the changes between the starting project and
the accepted solution.

## Delivered change volume

The selected proxy for delivered-change complexity, `C = A + D`, counting
eligible added and deleted nonblank source lines between the baseline and
accepted final state under `token-efficiency/1`.

## Search space

The information available for investigation within a specified project or work
scope, including any selected representations of that information.

## Starting search-space size (source-line proxy)

The selected whole-project baseline proxy `S0`, counting eligible nonblank
production and test source lines under `token-efficiency/1`.

## Declared search-space size (inventory-byte proxy)

The deduplicated bytes of assigned source, resources, documentation, selected
API/architect views and named support inputs under `scope-size/1`.

## Root scope-byte baseline

The frozen whole-project reference `B` for the declared search-space byte
policy, including its selected view and support components.

## Declared scope

The source areas, views and supporting inputs assigned to an invocation or
session.

## Inventory context size

The named file, symbol, reference and byte counts published for an exact owner
or subtree by the applicable Ramify measurement surface.

## Search-space adjustment

The selected dimensionless allowance `g(S0) = 1 + log10(1 + S0 / 1000)` used
to normalize token cost for starting search-space size under
`token-efficiency/1`.

## Token cost

The model-token consumption attributable to a specified activity or run under
a compatible, non-overlapping provider-usage accounting policy.

## Token efficiency

The economy of model-token consumption in producing a specified delivered
solution.

## Tokens per 100 changed source lines

The unadjusted normalized token-cost metric `U = 100T / C`, where `T` is run
token cost and `C` is delivered change volume under `token-efficiency/1`.

## Search-space-adjusted tokens per 100 changed source lines

The adjusted normalized token-cost metric `K = 100T / (C * g(S0))` under
`token-efficiency/1`.

## Model context usage

The reported or estimated tokens occupying a model context at a specified
observation point.

## Context-limit occurrence

An automatic response to model context pressure under the recorded run policy:
either a context budget return or a compaction triggered by a threshold or
provider overflow. An explicit/manual compaction is recorded separately and is
not an automatic context-limit occurrence.

## Context budget return

An invocation ending `context-budget-reached` after its configured threshold
fires, with its final report opportunity and subsequent workflow action
recorded. Reaching the proactive threshold does not establish that the provider
overflowed.

## Compaction occurrence

One observed compaction attempt, with trigger, completion state and reported
model context usage before and after it. Its trigger is threshold, provider
overflow or explicit/manual action.

## Overflow-triggered compaction

A compaction occurrence whose provider or adapter reports `overflow` as its
trigger. This is the selected exact meaning of **context overflow occurrence**;
context budget returns and threshold-triggered compactions are related
context-limit occurrences but are not relabeled as provider overflows.

## Editing activity

Source changes performed during execution, including work later replaced or
reverted.

## Mutation event

An observed intermediate change to project content during a run.

## Cumulative edit volume

The older KPI design's sum of eligible additions and deletions across observed
mutation events, including repeated edits and reversions.

## Invocation numstat increase

The current line-event collector's sum of positive increases in per-path Git
added/deleted line counts between an invocation's before/after snapshots.

## Local cognitive complexity

The concepts, invariants, implementation details and relationships that must
be understood together to reason correctly about a module at a specified level
of abstraction, currently assessed qualitatively.

## Cohesion

The degree to which a module's responsibilities share concepts, invariants and
implementation knowledge that belong together.

## Coupling

The knowledge and assumptions that cross boundaries between specified modules.

## Explorer file/dependency heuristic

The legacy `approximateIcs` value: an equally weighted
owned-file/provider-count sum divided by the maximum sum over modules in the
supplied explorer model, or zero when that maximum is zero.

## Baseline

The immutable captured project state used as the starting reference for a run.

## Measurement policy

A versioned set of rules defining a metric's inputs, scope, exclusions and
calculation.

## Measurement coverage

The extent to which the evidence required by a measurement policy is available
and attributable.

## Segment

One invocation of a session: the stretch of the session's history from that
invocation's start to its end.

## Actual start

The start a segment's executor made: fresh, continued or forked. It is the
requested start unless the segment's end records it degraded, and unknown for
a segment whose session never ran or whose harness stopped while it ran.

## Degraded start

A segment whose actual start differs from the continuation or fork the harness
requested.

## Model context history

The consecutive segments of one session that share a model context: the
session's first segment begins one, and so does each continued segment whose
actual start was fresh.

## Context generation

The number of the architect context a global fork forks: 1 for the initial
architect's context, and one more after each rebuild.

## Starting context size

The model context usage of a segment's first context observation, in tokens.

## Segment cost profile

A segment's starting context size and its input, cache-read, cache-write and
output tokens.

## Fork cost against a fresh start

The mean segment cost profile of the forks of one context generation, beside
the mean profile of the global forks whose actual start was fresh, under
`lineage/1`. Its starting context size is the fork's inherited context.

## Continuation growth

The mean, over continued segments, of a segment's starting context size less
that of the segment before it in its session, under `lineage/1`.

## Repair segment cost

The mean segment cost profile of the segments continued for a repair, beside
the mean profile of the engineer segments whose actual start was fresh, under
`lineage/1`.

## Degraded-start rate

Degraded starts per requested continuation or fork, overall and by the
relation requested, under `lineage/1`.

## Replacement rate

Sessions opened in place of another for one reason, `reconstructed` or
`context-rebuilt`, per session of the run, under `lineage/1`.

## Forks served by a context generation

The number of forks of one context generation whose actual start was a fork,
under `lineage/1`.

## Scope exclusions

**Solution efficiency** means the economy of the delivered solution relative to
alternatives satisfying the same requirements; its evaluation is outside the
current scope. **Actual exploration** means the project information agents
actually inspect; measuring it is deferred. Neither has a selected metric here.
