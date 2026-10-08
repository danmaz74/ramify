# Plan 23 source state and architecture discovery

## Request

- **As understood:** implement both linked analyses, preserving accepted session
  semantics and safely parallelizing independent iterations.
- **Question type:** discover existing capabilities and locate implementation
  responsibilities; no module restructuring is proposed.
- **Requesting module:** harness ordinary source and its agent/pi, evidence,
  plan-evidence and scenarios providers; web receives harness projections.

## Method

- **Authoring checkout:** `/ramify`, branch `ramify-agent`, HEAD
  `38b81e5e6814ad0980fbfa8d077bcec6cd91e56a`.
- **Guidance read:** project instructions; planning skill and implementation
  workflow; module-architect discovery, access and report guidance. The toolkit
  roadmap/Studio execution rules do not govern this separate project's plan.
- **Architect revision:** retained `rev/1:20ddaec6-fabc-4428-9955-c230cc44114e:1`;
  production dependencies and test references recorded measured; 1,030 cut
  records and 16 dynamic titles. These are bounds of the retained view, not a
  successful fresh analysis of this checkout.
- **Refresh attempted:** `node_modules/.bin/ramify materialize --view architect`
  from `ramify-agent/`, exit 2: `Compiler server request failed: Offset is outside
  the bounds of the DataView`. No complete refresh was claimed.
- **Source inspected directly:** agent `src/interfaces/port.ts`; harness
  `src/run/observations.ts`, `src/hooks/post-write.ts`,
  `src/tools/shell-tests.ts`; plan-evidence `src/interfaces/catalog.ts`;
  staged diffs in harness `src/kpi/capture.ts`, `src/kpi/metrics.ts` and
  `src/work/engineer-equipment.ts`; source file inventory for scenarios, audit,
  agent and tests; project package scripts and dependency pins. The two source
  analyses supply the earlier pi/runtime investigation; that evidence must be
  rechecked against the execution base before implementation.
- **Verification performed:** planning inspection and document checks only.
  No tests, live model calls or audit were run during authoring.

## Evidence

- The [current port](../../../subs/harness/subs/agent/src/interfaces/port.ts)
  still exposes `startSession(SessionSpec)` and `appendContext(ref, key, text)`.
  `SessionSpec` carries a full system prompt, session start/ref and equipment;
  it does not already implement the proposed high-level operation contract.
- [Observations](../../../subs/harness/src/run/observations.ts) record reads by
  path and searches by tool/query. They do not yet provide the full resolved
  search-scope, byte and elapsed-time contract required by the proposal.
  Observation persistence is deliberately weaker than durable run state.
- [Hook checking](../../../subs/harness/src/hooks/post-write.ts) currently
  treats both missing and empty changed-path sets as requiring a complete check
  and increments a caller-supplied counter around asynchronous checks. The plan
  separates proven no change from unknown and supplies serialized allocation.
- [Command classification](../../../subs/harness/src/tools/shell-tests.ts)
  treats positional arguments as focus without proving effective Cucumber
  profile selection. Native selected-file evidence is required after correction.
- [Catalog acceptance](../../../subs/harness/subs/plan-evidence/src/interfaces/catalog.ts)
  already validates individual elements before allocation and exposes retirement.
  Iteration 5 must fill end-to-end reference/submission gaps rather than replace
  working validation unnecessarily.
- [Current scope-size/2](../../measurements-and-kpis.md#scope-size-policy-v2)
  is more specific than the older run analysis: writer scope excludes soft read
  scope, sizes use the frozen baseline, and nested projects have an explicit
  proxy exclusion. Preserve this policy and show read/exploration separately.
- Staged [capture](../../../subs/harness/src/kpi/capture.ts) and
  [metrics](../../../subs/harness/src/kpi/metrics.ts) changes already implement
  role support/brief inputs, deduplication, revision comparison, delivered-change
  weighting, partial contributions and corrected units. New staged delivered
  attribution, tests and projections accompany them. These are concurrent working
  changes, not evidence of a clean qualified implementation of this plan.
- [Plan 21 final status](../21-project-boundary-adoption/main-plan.md) records
  completion; [Plan 22 results](../22-test-boundaries/final-results.md) records
  qualified ordinary/native test separation with a retained working-tree
  materializer failure. Their audited candidates do not qualify current dirty
  changes or Plan 23.
- Installed package pins are pi `0.87.1`, Ramify `0.4.1`, ramify-audit `0.7.2`
  and Cucumber `13.2.1`, per [package.json](../../../package.json). These identities
  are captured inputs to final transport/configuration verification.

## Answer

Keep the existing module responsibilities. Agent operations and pi transport can
be implemented behind their existing boundary; harness storage uses the ledger.
Prompt construction, hooks, focused-command construction, catalog validation and
pure metrics form independent provider iterations. The central run service and
shared records require ordered integration, followed by independent UI/trial work.

The strongest alternative is one large runtime rewrite. It would couple adapter,
prompt, correctness and metrics changes before any of them have isolated evidence
and prevents safe parallel work. New session/provider modules are unnecessary for
the accepted abstraction and are not selected.

## Not verified

The retained architect/API views are stale: they list `buildScenarioProfile` in
`subs/harness/subs/scenarios/src/profiles.ts`, a file no longer present. This plan
does not reuse or recreate that retired audit/scenario runner. The retained
ordinary harness API view also contains ledger/agent leads, but it cannot certify
new public access against the dirty tree. Iteration 0 refreshes both surfaces
together or records the limitation and verifies current declarations directly;
tests use their separate testing API view. No foreign API is invented as an
already available capability.

Exact pi dispatch interception, durable store types and the installed public
Cucumber configuration interface must be pinned on the clean execution base.
No cross-provider compatibility, live preservation, new metric accuracy or speed
improvement is claimed by this discovery. Generated-view absence or stale records
are not proof of capability absence.

## Next step

Execute iteration 0 after implementation is requested: reconcile concurrent work,
freeze exact interfaces and independent fixtures, and assign ready iterations
under the ownership/dependency rules. Do not start from an older clean commit
that silently discards the current accepted work.
