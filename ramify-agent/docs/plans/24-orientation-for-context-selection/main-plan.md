# Plan 24: useful starting briefs and orientation reuse

**Date:** 2026-10-09. **Status:** implementation in progress; iteration 0 base
audit accepted through existing evidence and iterations 1–3 complete; iteration
4 pending. See the [iteration 0 receipt](iterations/00-results.md),
[iteration 1 receipt](iterations/01-results.md) and
[iteration 2 receipt](iterations/02-results.md) and
[iteration 3 receipt](iterations/03-results.md). Source inspected at `1b052e74`.

## Outcome and decisions

Give every session useful information and clear pointers the harness already
has. Let the agent explore for anything else. Reuse an existing orientation
through continuation or a fork where the workflow already calls for it; when
that context is unavailable, use the ordinary fresh-session brief.

This is the single implementation plan for the
[fresh-session inputs analysis](../../analysis/2026-10-09-fresh-session-inputs.md)
and the adopted orientation work in the
[orientation analysis](../../analysis/2026-10-09-orientation.md). It replaces
Plan 24's earlier C1–C6-only scope. Dan's latest decisions govern this plan:

- Relevance comes from the role, current task and assigned scope, expressed in
  the existing briefing constructors. The harness makes no semantic relevance
  judgment; the agent decides what to read and what further exploration to do.
- Supply known facts and useful pointers. Omit inapplicable or unavailable
  optional information. Keep existing useful diagnostics, but add no mandatory
  unavailability markers, required-input matrix or completeness enforcement.
- Keep the context selector. Make the local architect's orientation useful to
  its selector fork and subsequent assignment.
- Keep rare session-loss handling small. Fresh starts use normal task inputs;
  no reconstruction subsystem or replacement-parent machinery is needed.
- Reuse inexpensive metrics. Dan assesses benefits. Benchmark runs, before/after
  comparisons, performance thresholds and benefit verification are outside this
  plan and its acceptance gates.

The earlier analysis's proposed fail-on-missing-input checks, global project
configuration cache, readiness-time configuration acquisition and open questions
are not additional requirements. Agents can fill gaps through ordinary orientation.
Existing validation of actual task submissions, authorization and durable task
records remains in force.

## Current implementation to build on

Plan 23 already provides task packets, named briefing sections and deltas,
exact session operations, focused Cucumber commands, and timing, usage and
exploration metrics. Use these mechanisms rather than adding parallel ones.

The current gaps are concrete:

- `orientAndSelectWorkContext` omits the orientation task inputs, so `taskBrief`
  substitutes the captured plan; `workItemMessage` incorrectly says the work
  item's text arrives later.
- The orientation procedure does not request module exploration. Assignment
  requests it after the selector's fork point.
- `contextSelectorMessage` repeats the orientation packet even on a fork.
- Known module, test, scenario and configuration pointers are inconsistently
  supplied to fresh sessions; several fallback paths lose the scoped briefing.
- Missing work/design orientation can prevent progress. A recorded point can
  also be unusable: `HarnessSessionOperations.start` reports a failed fork,
  rather than automatically constructing a fresh invocation.

The analyses retain the detailed inventory and historical observations. Their
older recommendations do not expand the work below.

## 1. Improve the ordinary starting briefs

Use each existing caller's task and records. Put short facts inline and give
large files a path with a short description. Avoid dumping whole plans when
there is already a work-item or assignment package. Keep the captured plan
where reading the plan itself is the task, such as initial analysis.

The following is an implementation checklist, not a runtime requirements table:

| Session | Useful inputs to supply from existing data |
| --- | --- |
| Every session | Task, working directory, applicable instructions, available tools and existing limits/scope. Preserve the inputs already supplied correctly. |
| Initial architect | Existing plan and architect view, plus declared scenario check, configuration/profile and feature locations when known. |
| Local architect: orientation, assignment, later turns, qualification and reconciliation | Work-item goal and elements or selected package as appropriate; module README/declaration/source and API/architect view pointers; relevant scenarios and test areas; applicable check/configuration pointers; current decisions and task evidence. |
| Engineer: iteration, repair and standalone | Assignment or standalone task; owned module/test areas and API views; declared check setup and exact prepared focused scenario command when applicable; existing handoff and gate evidence. |
| Contract engineer and nonfunctional repair engineer | Existing task/package/source, relevant provider/consumer or assigned-module test areas and API views, and declared check setup. |
| Capability architect | Existing request/package/progress and obligations, provider/consumer module and API pointers, test areas and scenario setup. |
| Code/scope reviewer | Existing candidate, assignment and review evidence; applicable configuration, support and test-file pointers through snapshot tools. |
| Design reviewer | Captured guidance and current candidate/review task, including on a fresh fallback. |
| Context selector | Work-item elements and briefing on a fresh start; selectable elements and selection instruction on every start. |
| Global fork, consultation, catalog extraction and nonfunctional coordination | Preserve their ordinary request, records, source and scope; ensure a fresh start does not depend on lost history. No indiscriminate test-setup section. |
| Failure analyst | Existing failure evidence and a concise explanation of the shell restrictions relevant to interpreting it. |

Where a scenario briefing already knows candidate step directories, include
existing step-file names using the available listing helper. Name observed
files as observed files; do not claim a directory listing proves runner loading.
Do not scan the entire repository to make the brief exhaustive.

### Small shared rendering, existing acquisition

Factor repeated rendering into a small helper only where callers share it.
Render known audit commands, their cwd/package, authored configuration pointers,
known support paths and shell restrictions from inputs already available to the
caller. Include the focused command once in the engineer's task, and replace
hard-coded Vitest/npm hints when the actual project command is known. If no
focused form is established, point to the declared configuration and let the
agent inspect it; do not invent a command.

Keep `prepareAssignedCucumber` and its effective-configuration acquisition at
assignment preparation. Other roles can receive authored configuration pointers
without executing configuration at readiness. Do not add a configuration cache,
dependency crawler or new invalidation scheme. Stable shared prose should precede
variable task text where the existing packet format makes that straightforward;
this introduces no provider-cache guarantee or new prefix-management subsystem.

Resolve paths using existing project-root, module cwd and snapshot conventions.
A selector workspace needs rooted references; a reviewer needs snapshot-readable
references; a tool-less session needs the relevant content inline. Preserve
existing view revisions and coverage notes. This is caller correctness, not a
new preflight that probes every path or rejects an incomplete brief.

## 2. Reuse useful work orientation

1. Pass an explicit orientation task with the work item's goal and complete
   requirement, acceptance and context element text, rendered from the frozen
   catalog by the existing package creator. Those elements are available before
   selection; only non-functional, fixed and recommendation elements are selected.
2. Ask the local architect to read those elements, explore its module's README,
   declaration and relevant source, and use its API views. It submits focus,
   understanding and questions when ready to organize the work. Keep the existing
   orientation submission schema; the agent judges when it has explored enough.
3. Remove the shared misleading closing instruction and the claim that element
   text arrives after orientation. Give each task its own closing instruction.
4. Fork the selector from the completed orientation point. Supply the selectable
   elements and selection instruction without repeating the inherited packet.
   A fresh selector receives the ordinary work-item brief and elements, with
   the recorded orientation submission if it is available.
5. Continue the local architect into assignment with the selected package. Its
   procedure says to build on what it has read and explore further as needed.
   The same procedure works for a fresh architect.

Reuse the existing named sections and delta delivery. Do not hand-strip text
that a fresh invocation will need. Keep reselection's placement-decision update
when the shared selector renderer is changed; it is new information even on a
fork. No engineer-from-architect fork or design-orientation redesign is introduced.

## 3. One simple fresh fallback

At the workflow caller, if the intended orientation/session point is unavailable,
start fresh with that task's ordinary brief. This also covers a point that exists
in the log but cannot actually be forked or continued. A failed attempt does not
silently change its recorded operation: the fresh invocation is a new attempt
with its normal full packet and the existing degradation reason.

Apply this rule to the touched work-orientation/selection/assignment paths and
the existing reused-context consumers: global requests, design/scope reviews,
qualification, reconciliation, capability work, consultation and continuing
engineer/contract work. Most already have a fresh branch; fix missing inputs
there rather than creating another recovery layer.

Keep the implementation bounded:

- After the existing work-orientation attempt limit, proceed to fresh selection
  and assignment. Use recorded invocation attempts to recognize that exhaustion
  on restart. Recover an already accepted orientation as today, including the
  completed-before-event case fixed in `dca003af`.
- A missing or altered orientation packet is discarded as reusable context;
  build the ordinary task brief from the authoritative work-item records.
- For selection provenance, retain the orientation attempt's invocation ID even
  when it produced no accepted orientation; the existing degraded flag and null
  point express fresh selection. Do not fabricate a successful orientation or
  introduce an optional-orientation state machine. Document this field meaning.
- Failed/unreadable design orientation leads to a fresh review with its captured
  guidance and candidate. Use its existing recorded result to avoid repeating it.
- Global requests with an unavailable parent use their ordinary request, registry,
  hypotheses and decisions. Stop generating rebuilds or promoting a fresh request
  into a replacement parent for new losses. Keep readers of historical rebuild
  records; no event-history migration or unrelated metric rewrite.
- Reuse existing session availability results and bounded attempts. Distinguish
  unavailable reusable context from cancellation, authorization failure and a
  failed task: those retain their existing handling. Do not retry arbitrary
  failures as fresh starts or add a background repair/retry service.

If an append cannot use its retained session, the next task starts fresh with
its ordinary current records. An append failure alone does not justify rebuilding
an architect context. No repeated orientation is scheduled merely to restore a
cache. An inability to read authoritative task records remains an ordinary error;
losing a reusable conversation does not make those records optional.

## 4. Reuse inexpensive metrics

Inspect existing invocation records, transcripts, `kpi/efficiency.ts`,
`kpi/exploration.ts`, `kpi/lineage.ts` and their projections first. They already
cover much of this. Keep or cheaply expose the following per invocation, joined
by existing invocation/work-item identities:

- Role/task kind and requested/actual start mode.
- Elapsed time and provider-reported cached input, new input and output tokens.
- Existing tool-call counts, including exploration calls where already captured.
- Existing fresh-fallback reason.

Prefer the existing machine-readable records/projections. Add only a small missing
field or join if necessary; document where Dan can read the values. If they are
already accessible, documentation is sufficient. Missing provider usage stays
unknown, not zero. No new dashboard, telemetry backend, pricing fetch, benchmark
collector, comparison report or automatic efficiency policy. Do not run a benefit
trial as part of implementation or qualification.

## Implementation sequence

Keep this as one plan. Execute iterations serially because their main write set
is shared. Preserve unrelated working-tree edits. Each implementation iteration
is one source commit plus its concise result record under this plan; a result
records the commit, changed behavior, checks and remaining limitations.

Paths below are relative to `ramify-agent/subs/harness/src/` unless stated otherwise.

### Iteration 0: establish the base

Use a clean committed implementation checkout, preserve the planning checkout,
and run the configured agent audit. Confirm the named source and metrics surfaces
before editing. Record existing failures separately from this work.

From the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

### Iteration 1: ordinary briefs and project pointers

Own `run/service.ts`, existing renderers under `work/`, `contracts/`, `reviews/`,
`sessions/single.ts`, task/briefing rendering under `prompts/`, and the relevant
shell hint text under `tools/`. Add a small shared rendering helper only if useful.

Implement section 1, including explicit task inputs for orientation and the
qualification/reconciliation fallbacks. Cover the checklist's fresh callers;
keep their existing record gathering and configuration acquisition.

Verification: focused prompt and runtime tests show the actual scoped task/package
and known pointers reach the intended sessions, including standalone and initial
analysis. Representative module-cwd, selector-workspace and reviewer-snapshot
cases use the correct path convention. A caller with no optional setup facts still
starts normally. The engineer receives the exact prepared scenario command once.

### Iteration 2: useful orientation and inherited input delivery

Own `context-selection/prompts.ts`, `context-selection/orientation.procedure.md`,
`prompts/local-architect.procedure.md`, `work/session.ts` and `run/service.ts`.
Implement section 2 using the input work from iteration 1.

Verification: use `context-selection-runtime.test.ts`, `plan23-task-prompts.test.ts`
and relevant existing caller tests. Check the orientation task receives its own
elements, the procedure asks for exploration, a fork omits duplicate briefing,
a fresh selector includes it, and assignment supports both continued and fresh
starts. Retain reselection's new placement information. These tests verify delivery
and workflow, not how well a model explores or how much time it saves.

### Iteration 3: simple fresh starts when reuse is unavailable

Own the touched workflow branches in `run/service.ts`, context-selection packet
and provenance handling, and the minimal session-operation/global-context changes
needed for section 3. Reuse existing records; avoid new recovery abstractions.

Verification: extend the existing context-selection, continuing-work, fork-workflow
and recovery tests with representative cases: exhausted work orientation, missing
orientation packet, unusable recorded fork/continuation point, and failed design
orientation. Check normal fresh task inputs are delivered, a restart does not
repeat exhausted orientation, successful forks still retain their point, and stop
requests are not converted into fresh work. Check global fallback uses ordinary
records without a rebuild or replacement parent. Keep historical record reading
and the accepted-orientation recovery regression passing.

### Iteration 4: existing metrics, documentation and final audit

Make only the small metrics exposure changes justified by section 4, with focused
projection tests if code changes. Document existing field locations if no change
is needed. Update the harness specification, catalog specification and affected
README/procedure descriptions to match the implementation; reference this plan
from the analyses. Do not add a new mandatory-input contract to the specification.

Run focused tests for changed behavior, `npm run type-check` and
`npm run check:self` from `ramify-agent/`. Follow the
[testing specification](../../testing.spec.md): ordinary tests script external
Git, command and provider answers; use `npm run test:quick -- <exact file filters>`.
Do not launch a direct whole suite. On the clean final committed candidate, run
from the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Earlier implementation iterations also run focused affected tests, type-check
and check:self before handoff. Do not broaden tests for unchanged behavior or
create exhaustive permutations of rare failures. No live provider or benefit
measurement run is required by this plan.

## Acceptance and boundaries

- Ordinary fresh sessions receive useful known inputs for their task through the
  existing briefing paths. No new optional-input failure gate is introduced.
- Local work orientation has the scoped task and exploration procedure; the
  selector forks it and assignment continues it without duplicate briefing.
- Unavailable reusable context takes the ordinary fresh path with current task
  inputs, including after an actual failed session operation.
- Existing inexpensive invocation metrics remain available, with their access
  documented. No performance improvement is claimed or required.
- Focused correctness checks, type-check, check:self and the final configured
  audit pass. Audits establish execution health; agents retain semantic judgment.

Outside this plan: deciding whether forks are faster or cheaper, expanding reuse
to new role relationships, redesigning design orientation, generalized reorientation
signals, configuration dependency tracking and comprehensive prompt completeness
validation. Dan owns benefit assessment and any later decision to expand reuse.
