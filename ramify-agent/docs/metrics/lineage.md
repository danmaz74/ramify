# Lineage measurements

**Status:** implemented by [Plan 9](../plans/09-session-model-and-transcripts/main-plan.md),
iteration 10; not an empirical validation claim. **Policy identifier:**
`lineage/1`.

This policy follows the [measurement principles](measurement-principles.md)
and uses the [metrics glossary](glossary.md). It compares segments by the
start their executor made: what a fork inherits and costs against a fresh
start, how a continued session grows, what a repair costs, how often starts
degrade and sessions are replaced, and how many forks each context generation
serves. It is versioned apart from `kpi/1` and reads no scope size.

## Inputs

| Input | Record |
| --- | --- |
| Requested start | `session-opened` (`fork`, `replaces`) and `invocation-started` (`start`, `continues`) in the run log |
| Actual start | The requested start, or the `degraded` relation of `invocation-ended`; unknown where the outcome records no start |
| Context generation | A fork's `fork.generation`; generation 1 with the initial architect, and each `global-context-rebuilt` generation |
| Starting context size | The first `context` observation of the invocation's observation log |
| Usage | The input, cache-read, cache-write and output tokens of `outcome.json` |

No executor ref is read. A running segment is in no measurement until it
ends, since its actual start is known only then.

## Groups

Each segment belongs to the group of its actual start, or of its requested
start where the actual one is unknown.

| Group | Segments |
| --- | --- |
| `fork.generation-<g>` | Forks of context generation `g` |
| `fresh-fork` | Global-fork segments whose start was fresh: the fork that rebuilds the context, and a fork the executor made fresh |
| `repair` | Continued segments whose reason is `repair` |
| `fresh-engineer` | Engineer segments whose start was fresh, reconstructions included |

Each group has one measurement per segment cost measure: `start-context`,
`input`, `cache-read`, `cache-write` and `output`, such as
`fork.generation-1.cache-read`. The value is the mean per segment, with the sum
as numerator and the segment count as denominator. A generation is listed
whether or not it served a fork.

## Measurements

| ID | Unit | Calculation |
| --- | --- | --- |
| `<group>.<measure>` | tokens per segment | Mean of the measure over the group |
| `continuation-growth` | tokens per continuation | Mean over continued segments of the starting context size less the previous segment's |
| `degraded-starts`, `degraded-starts.continue`, `degraded-starts.fork` | degraded starts per requested start | Degraded starts over requested continuations and forks whose actual start is known; the executor's reasons are the evidence |
| `replacements.reconstructed`, `replacements.context-rebuilt` | replacements per session | Sessions that replace another for the reason, over every session of the run |
| `forks-served.generation-<g>` | forks | Forks of generation `g` whose actual start was a fork |

## States

- A group with no segment is `not-applicable`.
- A segment whose starting context size or usage is missing, or whose actual
  start is unknown, makes its group's measurement `unavailable`, with the
  known subtotal, the coverage and each missing input's reason.
- A requested start whose actual start is unknown makes `degraded-starts` and
  `forks-served` `partial`, with the known count and coverage.
- Replacements are counted from the log, which records every session opened,
  so their zero is measured.

## Degraded starts

A fork or continuation the executor made fresh inherited nothing. It is
measured as a fresh start of its role, counted among the degraded starts, and
excluded from fork cost, continuation growth, repair cost and forks served.
The next continuation of its session grows from it.

The same rule reaches `kpi/1`. `session-weighted-total` sums each session's
scope once, at its largest, because a continued session holds its scope in
one model context. A degraded continuation loaded its scope into a new one,
so from there on its session is a second term of the sum. `session-count`
still counts harness sessions.

## Interpretation

The comparisons are descriptive. A fork and a fresh global fork differ in more
than their start: the fresh one is oriented from the records. A repair and a
fresh engineer differ in their work. The starting context size is an estimate
taken after the segment's first model call, so it includes that call's
exchange as well as what was inherited.
