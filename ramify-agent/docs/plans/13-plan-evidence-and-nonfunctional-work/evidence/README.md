# Plan 13 boundary witnesses

These artifacts describe separate executable boundaries. A browser render,
agent-port probe, scripted harness run and full regression audit establish
different facts; none substitutes for the others.

## Real context selection

[`real-context-witness.json`](real-context-witness.json) records one actual
`openai-codex/gpt-6-sol` parent, selector fork and parent continuation at
implementation commit `4bf4ecb590e5417437a1df1acd99e2676ef34032`.
The checkout was clean and the six recorded implementation-file hashes were
unchanged across the run. The source fixture has its own commit and captured
document hashes, distinct from the implementation revision.

The selector selected all three supplied fixture passages: one NFR, one
advisory item and one principle. The first keyed append returned `appended`;
the repeated append returned `already-present`. The continued parent returned
the exact NFR quote and its classification. One selector submission was
rejected before a valid submission. Requested and actual start modes were
`fresh`, `fork` and `continue`.

| Measurement | Observed value and denominator |
| --- | --- |
| Catalog | 1 NFR and 1 advisory item in the supplied fixture |
| Selected passages | 3 of 3 supplied fixture passages; no omitted supplied passage |
| Exact quote check | 1 of 1 requested NFR quotes matched |
| Delivered package | 2,396 UTF-8 bytes for all 3 passages and their qualifications |
| Reported model tokens | 8,756 across 5 reported usage records, including cache-read tokens |
| Parent orientation | 6,798 ms for 1 invocation |
| Selector | 26,722 ms for 1 forked invocation, including its rejected submission |
| Pre-work model phases | 33,520 ms, the sum of orientation and selector elapsed times |
| Continued parent | 2,249 ms for 1 invocation |

This probe exercises the actual pi `AgentPort` and context-selection helpers.
It does not execute the full `RunService`, assess NFR satisfaction or measure
document-discovery recall. The phase sum excludes setup and other harness
work. There is no matched baseline and no efficiency or general recall claim.
Applicability to a later revision requires comparing the recorded file hashes.

## Analysis review browser

`plan13-review*` artifacts are produced by
`scripts/browser-acceptance/plan13-review.ts`. Its input is an actual
disk-backed harness analysis projection, rendered by the web component in
Chromium at desktop and mobile widths. The artifact records its own revision
and dirty-state limits. It is a component-browser witness, not a live HTTP
workflow or model run. The final implementation handoff records its rerun.

## Real module-local tools

[`real-module-local-witness.json`](real-module-local-witness.json) records two
fresh `openai-codex/gpt-6-sol` sessions on clean implementation `a9a66dc1`.
Both ran actual shell `pwd` under the chosen module's `src/`, read the seed and
wrote their own file. The ordinary engineer's cross-module write was refused;
the repair engineer's was allowed. Each refused all five protected/outside
write probes. All seven recorded implementation hashes stayed unchanged.
This is a pi/equipment boundary witness; the Ramify hook is explicitly
unavailable and no full RunService or project-gate claim follows.

## Composed functional trial and readiness

[`functional-composition.json`](functional-composition.json) records the actual
harness and ledger with scripted agent, Git and checks: two captured documents,
two NFRs, one advisory item, one selected NFR and two assessed NFRs. Its
candidate tree is declared fixture data. The model token count is unavailable.

[`plan13-readiness-fixture.json`](plan13-readiness-fixture.json) contains actual
run-query projections from the exhausted-run test, including its catalog,
candidate, final gate and current user decisions. The browser results record
its SHA-256, screenshot paths and individual assertions. They test production
components with those projections, rather than a live HTTP workflow.

The final [implementation report](../results.md#iteration-9--composed-acceptance-and-delivery)
records command outcomes, acceptance mapping and limits for all boundaries.
