# Architectural planning acceptance

> **Superseded** on 2026-09-19 by the [harness principles](../../../harness.principles.md) and the
> [harness architecture](../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../README.md) for what may be reused.

**Plan:** [Pi architectural planning MVP](main-plan.md).
**Status:** planned cases; no runtime/browser trial has run.

## Fixtures and verification

Create `web-plan-lab`, a valid Ramify Git project with provider and consumer
modules, root composition and `plans/validation/plan.md`. Its request describes
a feature needing provider validation and consumer integration; this deliverable
plans that feature but does not implement it. Include a second readable plan,
a missing/unreadable file and a plan without a heading. Initial source is
committed; `plan.md` may be uncommitted. Add a contrasting fixture variant where
the requested provider operation already exists and is accessible, plus a
recorded incomplete-evidence condition. Define factual expectations for reuse,
access, ownership, scope rationale, dependencies and requirement coverage before
running either live prompt trial.

Deterministic pi/process fixtures exercise lifecycle and invalid-output paths.
Browser tests use the actual harness HTTP API. Node client tests use that
same API with no browser or web assets. The final gate uses a real pi session
with an existing subscription, without supplied briefs or architecture JSON.

Proposed commands in the separate application's checkout:

- `npm run type-check` for shared contracts.
- `npm run test:plans` for discovery, inputs and artifact contracts.
- `npm run test:protocol` for actual HTTP reads/commands, admission and
  snapshot/event consistency from browser-independent clients.
- `npm run test:prompts` for prompt assembly, resource/tool selection and
  correction/decision/recovery contexts.
- `npm run trial:architect-prompts -- --project <fixture-root>` for both real pi
  decomposition cases and their factual rubric.
- `npm run test:measurements` for producer-contract matching, scope aggregates,
  baseline/coverage and planning activity metrics.
- `npm run test:planning` for pi planning, decisions, lifecycle and publication.
- `npm run test:web -- --stage <plans|planning|architecture>` for browser cases.
- `npm run trial:web-planning -- --project <fixture-root>` for the live gate.

These commands will be created during implementation; they do not exist yet.

## Matrix

| ID | Iteration | Case and required evidence |
| --- | ---: | --- |
| PW01 | 1 | Discover only `plans/*/plan.md`; list two plans, H1/fallback titles, empty/unreadable states and refresh. Reject paths escaping the project. |
| PW02 | 1 | Select and render a plan read-only, preserve selection on reload, follow allowed document links and render hostile Markdown without executing scripts. No plan editing endpoint or UI action exists. |
| PW03 | 1 | Capture an uncommitted plan, identify later external edits, show the captured version separately and keep running inputs unchanged. Architecture/job records have separate responsibilities and schema validation. |
| PW04 | 2 | Start planning from the browser using actual pi subscription authentication; readiness/errors are visible, no credentials reach browser/job logs, and no API-billing fallback occurs. A real SDK session/tool event reaches the retained job evidence. |
| PW05 | 2 | Pi reads the captured request and Ramify evidence and submits a valid artifact with requirements, modules, reuse/seams where applicable, scopes, dependencies and acceptance. Source files and `plan.md` remain unchanged. |
| PW06 | 2 | Missing/malformed output, invalid references/cycles and incomplete acceptance coverage receive bounded automatic correction. Exhaustion fails the job; partial output never appears as completed architecture. Atomic publication/restart recovery cannot expose incomplete JSON. |
| PW07 | 2 | Planning progress survives browser reconnect; Stop/Resume and harness restart reconcile processes without a duplicate worker. Explicit cancellation is respected. Duplicate starts/tabs cannot launch two jobs, and failed regeneration preserves the prior completed artifact. |
| PW08 | 3 | The same artifact renders summary, dependency diagram, module list, assumptions and package details. Exact-owner/subtree and existing/proposed modules differ visibly; arrows mean prerequisites. Ordered list and diagram agree. |
| PW09 | 3 | Revision switching shows the correct contents. An external plan/reference/source-commit change marks the result stale without hiding it; regeneration captures new inputs and creates a new revision. A running job retains its captured inputs. This release exposes no implementation launch. |
| PW18 | 2 | A substantial change discovered during planning produces a browser decision with evidence and alternatives. Acceptance binds the exact proposal; rejection continues planning within the original requirements. Cumulative changes and stale decisions cannot bypass the rule, and plan.md stays unchanged. Routine scope selection/correction requires no human decision. |
| PW19 | 3 | Complete the real browser/pi/subscription journey from selecting an uncommitted plan through architectural planning to viewing its persisted artifact. The graph and details use that same artifact. Retain captured inputs, native sessions and publication evidence; no human-authored briefs or prepared architecture substitute for pi output. Application source and plan.md are unchanged. |
| PW20 | 3 | The product ends at a viewable architectural plan: no Implementation tab, Start implementation button, implementation-start API or engineering worker is exposed. A planning job never runs the proposed work packages. |
| PW21 | 1 | Start the standalone harness with web assets absent and no browser. A Node client reads project/plan projections over HTTP. Protocol/client code imports neither pi/filesystem implementation nor UI code; the harness starts without importing the web application. |
| PW22 | 2 | Use the shared Node client to start a planning job with no browser and let it complete; attach a web client during another job and read the same job/state/artifact. Disconnect every client and show continued progress. A pending substantial decision remains durable for a later client. |
| PW23 | 2 | Lose the response to an accepted command, retry the same ID and recover the same job/receipt. Reusing an ID with changed payload conflicts. Different start IDs racing create one job; stale state/proposal responses are rejected. Repeat around harness restart and reconcile a durable admission before worker launch without duplicate workers or silent lost work. |
| PW24 | 3 | Snapshot and event cursor identify consistent committed state. Reconnect, overlapping event pages and two clients yield consistent job status without duplicate feed entries or workflow actions. Web state is limited to presentation/connection data; every command is validated by the harness even when bypassing UI controls. |
| PW25 | 2 | Author all role/task/correction/continuation templates and custom-tool descriptions. Assembled instructions include captured inputs, applicable project policy, selected skill references and compatible structured-output instructions. Record effective prompt/resource/tool versions. Exercise validation repair, exact-proposal acceptance/rejection and interruption without absent-template paths, unrelated autoloaded context or instructions to use unavailable tools. |
| PW26 | 2 | Real pi uses the authored package on both the reusable-provider and missing-provider fixtures. Retain evidence-backed reuse/access, justified owners/scopes, relevant seams/dependencies, requirement/acceptance coverage and explicit unknowns under incomplete evidence. Assess factual obligations with the written rubric, not exact prose/task counts; valid JSON alone cannot pass. |
| PW27 | 2 | Consume built Plan 2C CLI data and architect views with matching revisions. Missing capability/schema, revision mismatch and acquisition failure cannot become measured zero. Preserve snapshots/version/hash and handle legitimate unavailable view bytes; do not recompute Ramify inventory or send agent fields to the producer. |
| PW28 | 2 | Exact/subtree and overlapping selections deduplicate files and API areas. Preserve production/testing classification separately from physical area, documentation and supplementary agent-input bytes. Frozen baseline, unavailable views, new module size and zero denominators have the specified behavior. Unchanged materialization uses target bytes, not bytesWritten. |
| PW29 | 2 | Collect actual architect sessions/attempts, elapsed time, provider usage, direct read/search activity and causes from pi/harness records, including failed/no-change/correction attempts. Resume/SDK retry/compaction do not inflate distinct session count; missing usage is unavailable, not zero. Proposed packages do not count as executed sessions. |
| PW30 | 3 | The architecture screen and HTTP/Node clients show identical harness-derived scope and planning KPI values, evidence references and coverage. Implementation KPIs are Not started. Live planning evidence includes real Plan 2C snapshots and actual pi activity; neither the browser nor Ramify computes agent KPIs. |

## Completion boundary

All cases above have evidence, including the actual browser/pi/subscription
path. Retain provider/model/package and Ramify versions, source/input identities,
the saved architecture, native sessions, effective prompt versions, live
decomposition assessments, Plan 2C measurement snapshots, planning KPI
projections and lifecycle evidence. Missing live
credentials leave live cases unrun, not passed.

PW10–PW17 now belong to the [implementation runner acceptance](../pi-agent-implementation/acceptance.md).
They are not gates for this deliverable. This release is complete when the user
can generate and inspect an architectural plan while original source and plan
remain unchanged. The harness must also complete planning through the same API
with no browser or web assets. No production CLI, engineering execution or
comparison benchmark is required. The producer dependency is real and generic;
all activity collection and KPI computation is tested within ramify-agent.
