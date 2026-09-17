# Plan 6D acceptance matrix

**Date:** 2026-09-17. **Status:** accepted strict gate, 2026-09-17. Companion to the
[plan](main-plan.md) and [contracts](contracts.md).

## Fixtures

- `path-facts`: compiler-backed project where consumer `A` reaches one original
  through imported modules `B` and `C`; variants reference only B, both, neither,
  type/data uses, mixed uses and an isolated compiler limit.
- `forwarding`: real modules `A`, `B`, `B/A` where `B` forwards originals owned
  by `B/A`, including one access that selects an allowed and a denied original
  and an unrelated unused import.
- `dependency-report`: frozen complete report containing behavioral,
  non-behavioral, unused, unknown, same-owner, self-barrel and external controls.
- `reference`: Collection Review.
- `toolkit`: Ramify.
- `mutation`: isolated small real project whose edit publishes a new input ID.

## Classifier and projection

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD01 | 1 | compiler | Only-B-used produces a used B access fact and an unused C access fact; the aggregate headline fact is behavioral. |
| BD02 | 1 | compiler | Both-used produces two independently classified access facts; neither-used produces one aggregate unused dependency and no used path. |
| BD03 | 1 | compiler | Repeated references and aliases in one access do not add facts; two import declarations to the same boundary deduplicate later without losing their supporting access IDs. |
| BD04 | 1 | compiler | Call/construction/callable-reference, type/data/forwarding and mixed evidence follow the fixed precedence per access and aggregate. |
| BD05 | 1 | compiler | An access-specific limit affects only its path; aggregate unknown is omitted unless behavioral evidence on another path settles it. Limits remain frozen and ordered. |
| BD06 | 1 | regression | Ordinary batch, retained open/update and daemon context behavior remain unchanged; the `behaviorRuns` counter stays zero for ordinary and changed-file paths. |
| BD07 | 2 | pure | Imported-boundary facts use `(consumer, imported module, original)`; original-owner/headline aggregation uses `(consumer, original)`. Both-B-and-C yields two boundaries and one headline dependency. |
| BD08 | 2 | pure | Only-B-used yields no C boundary; unused, symbol-free, same-owner, external, outside-module and unresolved controls yield no diagram fact. A self-barrel access to a foreign original yields a boundary fact that downstream mapping gives no imported edge. |
| BD09 | 2 | pure | Unknown facts make coverage partial and add no displayed count; known imported-boundary lower bounds remain identified without turning the original-owner unit into known. |
| BD10 | 2 | pure | Production/test filters and declared/candidate ownership resolve consumers, imported modules and original owners consistently; consumer-owned originals are absent. |
| BD11 | 2 | pure | Status and reasons come only from decisions for the fact's original: one access selecting an allowed and a denied original gives an allowed and a denied fact. |
| BD12 | 2 | pure | Projection is deterministic, ordered, frozen, lists every view module, is headline-equal to `behavior`, is reached through `projectModularity` under `ramify.modularity/2`, and refuses rather than truncates above its byte limit. |
| BD13 | 2 | real batch | Clean Ramify and Collection Review baselines record commit/input identity, complete or explicit partial coverage and the two headline counts. |

## Lean analyzer

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD14 | 3 | compiler | For `path-facts` and `forwarding`, `behavior` with supplied imports equals the batch path's facts over identical inputs, and the analyzer's diagram equals `projectDependencyDiagram` over the batch report. |
| BD15 | 3 | compiler | A supplied-import run issues no `catalog`, `describe`, `accesses`, `interpreter` or `interpret` helper command, and opens no retained session. |
| BD16 | 3 | analyzer | Editing a read source file, a configuration file or the module layout after the report was produced returns `inputs-changed` with the differing paths and no diagram. |
| BD17 | 3 | process | Cancellation, the deadline and an oversized response terminate the analyzer child and its compiler helper within 5 seconds, with no partial outcome; an incomplete report is `invalid-report`. |
| BD18 | 3 | measurement | On Ramify and Collection Review, the analyzer's acquire/project/classify/total times and peak memory of both processes are recorded beside a full batch with `dependency-behavior` over the same commit, 5 runs each. |

## Daemon operation

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD19 | 4 | service | Superseded, invalid-current, ready-from-retained, join, `busy/analysis-running` and start follow C4's order; busy starts no work. |
| BD20 | 4 | service | Two callers for one revision create one runner call; ten requests after ready add none. One caller's cancellation leaves the job for the other; the last cancellation aborts it. A second context's request during the job is busy. |
| BD21 | 4 | service | Publication of a newer revision aborts the job and answers waiting callers superseded; `inputs-changed` answers `busy/inputs-changed` and counts it; nothing is retained in either case; no job restarts without a request. |
| BD22 | 4 | service | The retained result counts in `retainedBytes`, and is released on newer publication, eviction and close but not demotion; exceeding the per-context or global retained budget returns `resource-limit` without retention. |
| BD23 | 4 | IPC | The operation validates input, frames large results within existing response capacity, appears in capabilities and counters, and the client method maps every outcome. Existing operations' requests and outputs are unchanged. |
| BD24 | 4 | process | Against the real daemon with the injected process runner on Ramify, a diagram reaches ready while a watch update and a `check --changed` complete during the job; the retained session receives no diagram operation, its helper records zero `behaviorRuns`, and the daemon loads no analyzer module. |

## Explorer server

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD25 | 5 | pure | DTO counts, one row per diagram module, breakdowns, copied evidence status/reasons, self-barrel omission from imported edges and deterministic IDs follow C5; identity mismatch, inconsistent counts and oversize are refused. |
| BD26 | 5 | service | `dependencyView` follows the router table: unavailable, superseded, ready, analyzing, one-second waiting memory and start; a superseded daemon answer is never retried with another revision. |
| BD27 | 5 | service | One in-flight request and one settled DTO per binding; a different revision aborts the in-flight request; newer publication releases the DTO; server close aborts and releases. |
| BD28 | 5 | HTTP/process | A real daemon and explorer server reach ready for one exact input ID over HTTP; the server's loaded module list contains no compiler or analysis runtime module. |
| BD29 | 5 | regression | Existing `projectView`, `explorerDetails`, `serverStatus`, module tree and daemon setup remain compatible; no request other than `dependencyDiagram` contains `dependency-behavior`. |

## Presentation and connected workflow

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| BD30 | 6 | component | Default renders behavioral imported-module links; non-behavioral-only and occurrence-only edges are absent. Nodes remain visible while dependency data is pending. |
| BD31 | 6 | component | Toggle adds non-behavioral counts/edges locally; switching link target uses original-owner endpoints locally; neither action requests data. |
| BD32 | 6 | component | Forwarded original links to B by default and B/A alternatively. Both-boundaries fixture renders two default links and one original-owner dependency. |
| BD33 | 6 | component | Mixed edge is solid, non-behavioral-only is muted/dotted, logarithmic width is bounded, and status remains a separate badge/colour dimension. |
| BD34 | 6 | component | Project panel shows both headline cards, displayed links, coverage and revision; non-behavioral says `not drawn` or `shown` and no ratio/pie/confidence appears. |
| BD35 | 6 | component | Module panel distinguishes Uses, Used through this module and Owned originals used by others with their correct units and active/alternate ordering. |
| BD36 | 6 | component | Each edge panel uses its projection-specific labels and breakdown; evidence lists only referenced classified originals and labels accesses as supporting occurrences. |
| BD37 | 6 | component | Scope, filters and out-of-view nodes use active links; changing settings reconciles/clears selection by projection-specific ID; node size does not change. |
| BD38 | 6 | component/a11y | Controls have keyboard/label support; waiting, analyzing, unavailable, measured-zero, partial, superseded and stale states are distinguishable. |
| BD39 | 7 | HTTP/browser | Real `reference` server reaches ready, defaults correctly, exercises both controls and panel scopes, and performs no second request for control changes. |
| BD40 | 7 | HTTP/browser | Real `forwarding` fixture proves B versus B/A endpoints, per-original status evidence and both-boundaries count behavior. |
| BD41 | 7 | HTTP/browser | `mutation` publishes a newer revision during and after analysis; polling stops on superseded, the old graph remains coherent and stale, refresh obtains matching structure/counts, and late old results cannot overwrite it. |
| BD42 | 7 | process/browser | Ten settled refreshes, hidden-page polling, an edit during a job, and server close meet the lifecycle limits, with recorded daemon settled memory with and without a retained result, analyzer peak memory, server memory and `behaviorRuns`. |
| BD43 | 7 | regression | Focused tests, type-check, production build, self-check, real browser gate, BD24 isolation evidence and zero `behaviorRuns` for ordinary and changed-file checks pass on one source revision. |

Returning old occurrence links while pending fails BD30. Returning an empty
graph fails because every fixture contains positive controls. Component tests
do not establish BD39–BD42, and a clean browser rendering does not establish
hook isolation.
