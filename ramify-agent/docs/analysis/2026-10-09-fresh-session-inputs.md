# Fresh-session inputs

**Date:** 2026-10-09. **Status:** historical inventory and design proposal;
implementation direction superseded by the consolidated
[Plan 24](../plans/24-orientation-for-context-selection/main-plan.md).

Dan's later decision is to supply useful known facts and pointers and let agents
explore for anything else. The required-input table, fail-on-missing-input
enforcement, mandatory unavailability markers, configuration cache and readiness
acquisition proposed below are not implementation requirements. Plan 24 contains
the selected work and current decisions; this document retains the inventory and
earlier reasoning for reference.

The original analysis states a rule, inventories fresh-session inputs and briefs changes.
No code changed; nothing here is evidence of implementation. Inspected at
`1b052e74`; line references drift, the named functions are authoritative.

Implementation outcomes are recorded in the
[Plan 24 iteration receipts](../plans/24-orientation-for-context-selection/main-plan.md#implementation-sequence).
[Session observations](../metrics/session-observations.md) documents the existing
metrics available for Dan's assessment. The inventory below describes the inspected
base, not the later implementation.

## Summary

- The [orientation analysis](2026-10-09-orientation.md#d2-reused-context-falls-back-to-a-plain-fresh-session)
  decided (D2) that a lost reusable session or a failed orientation leads to
  a plain fresh session whose prompt carries everything the task requires.
  D2 holds only if every fresh-start prompt is complete. This document makes
  that a general rule and gives it a mechanical check.
- The rule: a fresh session receives every input the harness holds or can
  derive for its task, inline or as a named path, and rediscovers nothing the
  harness already knows. A fact the harness cannot derive is stated as
  unavailable with its reason. Relevance is fixed per role and task kind,
  not judged per invocation.
- The largest gaps today: no role receives the project's test and scenario
  setup as derived facts except the engineer, which receives them only per
  assignment and only when scenarios are assigned; three fresh-start paths
  substitute the whole captured plan for the task's inputs; and nothing
  verifies that a packet is complete beyond its goal, requirements and
  environment keys.
- Enforcement reuses the task packet: a per-role, per-task-kind table of
  required input keys that `buildTaskPacket` checks against the briefing
  sections and environment it is given. A missing input fails packet
  construction, before any model call.
- The project environment becomes one pure rendering of the guarded inputs,
  identical for every session of a run until a guarded file changes, placed
  before per-task content. The exact focused command stays per assignment,
  as a literal command line in the task part.

## The rule

### Statement

Every fresh session receives, in its first message, references to everything
its task needs that the harness holds or can derive from captured inputs. It
never has to rediscover what the harness already knows. What the harness
cannot derive is stated as unavailable, with the reason, in the place where
the fact would otherwise stand. The rule applies to every fresh start,
including the fresh fallback of a continuation or fork that the harness could
not take.

The [harness principles](../harness.principles.md#an-oriented-context-is-reused-never-required)
now state the commitment; this document and the detailed contract proposed
for the [harness specification](../harness.spec.md) carry the rules.

### What "everything it needs" is

The inputs of a task fall into five groups. The first three are the same for
every task of a role; the last two are per task.

| Group | Contents | Source the harness holds |
|---|---|---|
| Role environment | working directory, project root, write scope and its roots, available tools, limits, candidate and snapshot identities | the invocation request and `TaskEnvironment` (`prompts/tasks.ts:25`) |
| Project environment | how the gate's checks run; how scenarios run and where their support, step and feature files load from; where each module's tests live; what the shell refuses; the guarded files and their identities | the captured audit definition (`run.record.auditConfiguration`), the effective Cucumber configuration of its declared command, package manifests, the captured project configuration, module declarations, the shell policy |
| Evidence views | the architect view and the API views of the modules the task reads or writes, with revision and coverage limits | the run manifest and `apiViewsOf` / `iterationViews` |
| Task records | goal, requirement and element text, package, scenarios with their states and files, obligations, registry, hypotheses, decisions, outlines, last iteration, gate diagnostics, CheckFindings | the run's committed records |
| Task commands | the exact command that runs the assigned scenarios, and nothing broader | `prepareAssignedCucumber` (`work/session.ts:649`) |

"The project environment" is the term used below for the second group; it
is the [scenario harness](../glossary.md#scenario-harness) plus the test
runner, the type check and the shell policy, as facts.

### What a reference is

A reference is either the content itself or a named path.

- **Inline** when the harness owns the rendering and the content is short:
  a command line, a path with one line saying what it holds, an identity, a
  list of modules and areas, a scenario's text.
- **A named path** when the content is large and already lives in a file
  the session's tools can read: a README, a `module.ramify`, a Cucumber
  configuration file, a step file, an API view page, the architect view.
  Every named path carries one line saying what it holds, so the agent
  knows whether to open it. A path is a reference only for a session whose
  tools can read it: a reviewer reads candidate paths through its snapshot
  tools; the coordinator reads within its bounded scope; the selector reads
  from its workspace; a session with no tools receives content inline.

A reference to a *location* where something might be is not a reference to
the thing. "Write step definitions in `src/tests/steps/`" names a convention;
"the step files of `workspace/shared-ui` are `src/tests/steps/badge.steps.ts`"
names what exists. The rule asks for the second wherever the harness can
list it.

### Derived, never explored

Project-environment facts come from captured, guarded inputs, and only from
them: the committed audit definition, the Cucumber configuration the declared
check command selects, the package manifests, the test-runner and compiler
configuration, `ramify-agent.json` and the module declarations. These are
the files `guardedConfigurationFiles` (`work/scope.ts:96`) and
`auditPreparationPaths` already name and hash. The rendering is a pure
function of their bytes, so it is the same for every session of the run until
one of them changes, and the manifest records one identity for it.

Where a fact cannot be derived, the rendering says so in its place, with the
reason, exactly as `prepareAssignedCucumber` already answers
"Exactly one declared Cucumber executor is required" or `apiViewsOf` answers
why a view was not materialized. The rendering never infers a command from
feature paths, never substitutes the harness's own Cucumber setup, and never
guesses a runner invocation from a file name.

### Relevance per role

Relevance is a property of the role and task kind, decided once and recorded
in the table that enforcement uses. It is not judged per invocation and not
inferred from the diff, the module or the plan.

| Role and task kinds | Project environment | Task commands | Why |
|---|---|---|---|
| engineer: engineering, repair, standalone-command | yes | yes, when the assignment names feature files; otherwise an explicit not-applicable | runs tests and scenarios from `shell` |
| contract-engineer: contract | yes | not applicable, stated | runs the consumer's tests and the conformance suite |
| nonfunctional-repair-engineer: repair | yes | not applicable, stated | runs tests from `shell` |
| local-architect: orientation, assignment, completion, repair, capability-qualification, reconciliation | yes | no | assigns scenario binding and judges gate diagnostics; names step locations and test obligations |
| capability-architect: capability, capability-qualification, reconciliation | yes | no | decides which tests are appropriate and verifies the consumer against the real provider |
| reviewer: code, scope | yes, as named paths | no | judges step files and tests in the candidate |
| failure-analyst: failure-analysis | yes | no | reads shell logs that contain refused and focused commands |
| initial-architect: initial-analysis | open question 2 | no | writes scenarios; needs to know whether the project runs them |
| engineer: consultation | no | no | answers a question from the suspended source |
| context-selector, catalog-extractor, global-fork, reviewer design and design-orientation, nonfunctional-coordinator | no | no | no test or scenario work |

Every role receives the role environment, the evidence views its procedure
names and the task records of its task kind; the table in
[Enforcement](#enforcement) lists those per role.

## Inventory

Each row is one fresh-start path. "Today" cites the renderer; "missing" is
measured against the rule. The [session-reuse analysis](2026-10-08-session-reuse-and-system-prompts.md#use-cases)
lists the start modes; Plan 23 implemented them, and the
[status-badge-tone run](2026-10-08-status-badge-tone-real-run.md) predates
Plan 23's prompt changes, so each of its findings is checked against the
current source below.

### What Plan 23 already changed

- D3 (the engineer cannot run its pending scenarios) is largely corrected.
  `prepareAssignedCucumber` derives the focused command from the declared
  Cucumber executor and the effective configuration, writes a dedicated
  profile in the module's scratch, and the engineer's prompt ends with
  "# Exact focused scenario command", the command line, the support/world/
  loader JSON, the environment names, the configuration hash and the pending
  note (`run/service.ts:8832`, `work/engineer.ts:159`). The shell refuses an
  unverified `cucumber-js <feature>` and names the prepared command
  (`tools/shell.ts:204`). What remains: the block is appended after the
  assignment package at the end of the prompt, exists only when the
  assignment names feature files, and the procedure's step 4 still says only
  `npx vitest run <file>` (`prompts/engineer.procedure.md:18`).
- C5 (orientation inputs) is partly corrected: `workOrientationMessage`
  accepts goal and requirements (`context-selection/prompts.ts:4`), but the
  service calls it without them (`run/service.ts:5052`), so the orientation
  turn's requirements are the whole captured plan (`taskBrief`,
  `run/service.ts:4523`). [Plan 24](../plans/24-orientation-for-context-selection/main-plan.md)
  C1 fixes this; this document treats it as one instance of the rule.
- P4.3 (declared Cucumber, support, step and API paths) was delivered for
  the engineer only. The local architect's briefing still names no Cucumber
  configuration, support file or existing step file; C4's 32 KB grep remains
  possible.
- The environment JSON now carries `cucumberConfiguration` as credential-free
  facts (`work/session.ts:742`); it is `null` for every role but the engineer,
  and `buildTaskPacket` accepts `null` without comment
  (`prompts/tasks.ts:115`).

### The paths

| Role, path | Today | Missing |
|---|---|---|
| initial-architect, initial analysis (fresh, `run/service.ts:4595`) | plan text, accepted intake, architect view path with revision and coverage limits, module-architect skill | whether the audit definition runs scenarios and where it loads them from (open question 2); nothing else test-related |
| catalog-extractor, three turns (fresh, `run/service.ts:4707`) | captured documents | nothing |
| local-architect, orientation (fresh, `run/service.ts:5084`) | `workItemMessage` (`work/session.ts:289`): goal; requirement, acceptance and context IDs with "Their text arrives in your work-item package once you have oriented" (`:306`); onboarding first paragraph with its path; API view paths, revisions and coverage; architect view path (`:345`); default write scope with its guarded files; hypotheses; registry; decisions; scenarios with feature files and the generic `src/tests/steps/` convention (`work/scenario-briefing.ts:84`); engineer bounds; closing "Read your module, decide, and submit" (`:503`). Requirements in the packet: the whole captured plan (`run/service.ts:4523`). | the work item's element text (Plan 24 C1); the project environment: Cucumber configuration path and profile, effective feature paths and tag filter, support files, the module's test area, the existing step files of its module, the runner facts; a procedure that asks it to explore the module (Plan 24 C2) |
| local-architect, assignment and later turns, fresh fallback (no retained orientation point or reconstruction; `run/service.ts:5774`) | the same briefing with the work-item package in the prompt, obligations, intervening capability work, last iteration with gate summary and scenarios passed | the same project-environment facts; the gate summary names failing steps but not where the step files or support files load from |
| local-architect, capability qualification, fresh fallback (`run/service.ts:7601`) | request, provisional source, the **whole captured plan package** when no point exists, registry clues, instructions | the work-item package the architect was given, its module briefing (onboarding, API view paths, default write scope) and the project environment; the whole plan stands in for inputs the harness holds in better form |
| local-architect and capability-architect, reconciliation, fresh fallback (`run/service.ts:1981`, `:2079`) | the reconciliation packet: source, round, review coverage, CheckFindings (`reviews/reconciliation-message.ts:53`) | the module briefing the parent had; the project environment where a CheckFinding concerns a test or step file |
| context-selector, fresh fallback, degraded (`run/service.ts:5248`) | the orientation packet (briefing plus submission) and every selectable element; cwd is a run workspace | nothing test-related; its briefing paths are rooted, so they resolve from the workspace |
| engineer, new iteration and budget return (fresh, `run/service.ts:8809`) | `iterationMessage` (`work/engineer.ts:353`): goal, approach, package, starting module and cwd, write scope, API views per written module, completion evidence, gate description, the owned test areas (`:420`), `npx vitest run <file>` hint (`:423`), obligations, scenarios with candidate step locations (`work/scenario-briefing.ts:132`), base commit, handoff, failed gate; then the focused command block (`run/service.ts:8832`); environment JSON with `cucumberConfiguration` | the runner facts as the project declares them (check commands, cwd, package directory, Vitest configuration path): the hint is generic and wrong for a nested package directory; the Cucumber configuration path, profile and effective paths as prose; existing step files in the candidate directories (the integration briefing lists them, `work/session.ts` `integrationSection`; the entry briefing does not); the shell's refusal rules as facts (whole suite, watch, unverified Cucumber selection, non-executing help, version and dry-run) rather than the system prompt's one sentence; the focused command before the package rather than after it; a stated not-applicable when no feature file is assigned (the standalone session states it, `sessions/single.ts:512`; the iteration does not) |
| engineer, read-only consultation, fresh fallback (`run/service.ts:8089`) | question, plan, original request and suspended source, references | nothing further; it answers from the source it is given |
| contract-engineer, first turn (fresh, `run/service.ts:9451`) | `contractMessage` (`contracts/session.ts`): goal, package, agreement, need, what to do, naming, exposure, write scope, existing consumers, completion evidence, base commit, failed gate | the project environment; the consumer's and provider's test areas (`ownedTestAreas` is not called); API views (the contract procedure names view directories by convention, `prompts/contract.procedure.md:20`, not by supplied path) |
| nonfunctional-repair-engineer (fresh, `run/service.ts:3825`) | task, candidate, plan package, starting module, evidence and uncertainty, the nonfunctional-source JSON (base, head, tree, changed paths, read scope, exclusions) | the project environment and the test areas; `cucumberConfiguration` is `null` without a stated not-applicable; no API views |
| reviewer, code review (fresh, `run/service.ts:1244`) and scope review fresh fallback (`:1412`) | `reviewMessage` (`reviews/message.ts:39`): the iteration, what the plan asks, changed paths with pending-tag attribution, CheckFindings, package | named paths of the Cucumber configuration and support files in the candidate, so a reviewer can tell whether a step file is loaded; the test area of the written module |
| reviewer, design orientation (fresh, `run/service.ts:1483`) and design review fresh fallback | the captured guidance inline | nothing; it has no tools (orientation analysis, open question 3) |
| global-fork, fresh fallback through a rebuilt context (`run/service.ts:6323`, `:6602`) | request, view, registry, hypotheses, decisions, plus `orientation()` text | nothing test-related; the `orientation()` text is the machinery the orientation analysis proposes to remove |
| capability-architect, first delegation and fresh fallback (`run/service.ts:7872`) | task identity, request, plan, provider decisions and outlines, usage paths, default write scope, selected plan package, progress, obligations, result summaries, gate report directory | the project environment; the provider's and consumer's test areas and existing step files; API view paths for provider and consumer (it is told to "inspect current source" and has `inspect_git`, but no view path) |
| failure-analyst (fresh, `run/service.ts:10547`) | `failureAnalysisMessage` (`work/failure.ts:286`): goal, digest, evidence directory with each file's purpose | the shell's refusal rules, so a refused command in a log is read as a refusal and not as a failure of the project |
| nonfunctional-coordinator: assessment, action, investigation (fresh, `run/service.ts:3722`, `:3753`, `:3967`) | plan package, candidate, nonfunctional-source JSON, decision and results | nothing test-related |
| engineer, standalone command (`sessions/single.ts:351`) | `iterationMessage` without test areas, scenarios or package; `cucumberConfiguration` not-applicable | the owned test areas and the project environment |

Two defects of the same kind sit beside these: the engineer's shell refusal
text names `npm test -- <file>` as a focused form (`tools/shell.ts:209`),
which is true only where the package's `test` script is a Vitest call the
classifier recognizes (`tools/shell-tests.ts:92`); and the local architect's
briefing says the gate runs "every scenario that carries no pending tag"
without naming the profile that enforces it.

## Enforcement

### What exists

`buildTaskPacket` (`prompts/tasks.ts:96`) already refuses a packet without
objective, goal, requirement text, project root, working directory, or any of
the seven environment keys; it refuses a full fresh briefing appended to an
inherited session, a briefing whose canonical `goal` and `requirements`
sections do not match its explicit inputs, a submission tool the session does
not have, and a review without candidate and snapshot identities.
`renderRequiredSlots` refuses an unfilled placeholder. The briefing revision
(`prompts/briefings.ts`) carries named sections with stable keys when the
caller supplies them as `literalSections` (`support:assignment-package`,
`support:work-item-package`, `support:nonfunctional-source`,
`support:design-guidance`, `support:selected-plan-package`,
`support:accepted-intake`). The delivered manifest records every component
with its hash and sources.

Two things keep this from enforcing the rule. First, most of a prompt reaches
the packet through `taskSupportSections` (`work/task-support.ts`), which
groups the renderer's prose by Markdown heading into keys such as
`support:## Your module:0`; a renderer that drops a block changes a key
nobody checks. Second, nothing says which keys a role and task kind require,
so `cucumberConfiguration: null` and an absent test-area block pass for every
role.

### The required-inputs table

Add, beside `taskDefinition` in `prompts/tasks.ts`, a table from role and
task kind to required input keys. Each entry names a briefing section key or
an environment field and one of two modes:

- `present`: the section must be delivered with non-empty text;
- `present-or-unavailable`: the section must be delivered, and its text may
  be the stated unavailability with its reason.

`buildTaskPacket` checks the table after its existing checks. On a fresh
start (`briefing.mode === 'full'`) every required section key must be among
`currentSections` with non-empty text; on a continuation or fork it must be
among the inherited components or the current additions, which the packet
already receives as `inherited` and `briefing.currentSections`. A missing key
throws, like the existing checks, so the invocation ends failed at packet
construction and no model call is made. A `present` key whose text begins
with the unavailability marker also throws.

For the table to hold, every required block becomes a keyed `literalSections`
entry supplied by the service, not prose that `taskSupportSections` keys by
heading. Prose stays where it is; the required facts move into keyed
sections. The keys this document proposes:

| Key | Content | Required by |
|---|---|---|
| `environment:project` | the project environment rendering, below | every role marked yes in [Relevance per role](#relevance-per-role) |
| `brief:work-item` | the work item's goal and the complete text of its requirement, acceptance and context elements (Plan 24 C1) | local-architect orientation |
| `support:work-item-package` | exists | local-architect assignment and later turns, capability qualification |
| `support:assignment-package` | exists | engineer, contract-engineer, reviewer code and scope, where the assignment has a source |
| `brief:module` | onboarding path and purpose, declaration path, source directory, API view paths with revision and coverage, architect view path, default write scope | local-architect every turn, capability-architect |
| `brief:scenarios` | the scenarios the role sees, with state, feature file, text, candidate step directories and the step files found there | local-architect, engineer, capability-architect; `present-or-unavailable` where the work item has none |
| `brief:test-areas` | the test areas the assignment owns | engineer, contract-engineer, nonfunctional-repair-engineer, standalone |
| `task:commands` | the exact focused command, or the stated not-applicable or unavailability | engineer engineering, repair and standalone-command |
| `environment.views` | non-empty, or a `brief:module` line stating why none exists | every role that reads source |

The table is data; a test renders every role and task kind of the existing
36-row fixture table in `plan23-task-prompts.test.ts` and asserts that each
packet satisfies it, and that removing any one required section throws.

### The project environment rendering

One pure function, proposed as `renderProjectEnvironment(inputs)` in a new
`prompts/project-environment.ts`, takes only data derived from guarded
inputs and returns the `environment:project` section. Its inputs:

- the captured audit definition's checks: name, executor command, arguments,
  cwd and parser, and the workspace package directories;
- the effective Cucumber configuration of the declared Cucumber check, as
  `loadCucumberConfiguration` returns it: configuration file, selected
  profiles, `paths`, `tags`, `import`, `require`, `requireModule`, `loader`,
  `worldParameters`; or its unavailability reason;
- each package directory's `test` script and the Vitest or Vite
  configuration path present, from the guarded files;
- the module test areas (`moduleTestAreas`, `run/project-config.ts:62`);
- the captured project configuration (`ramify-agent.json`) or its invalidity;
- the shell policy: what is refused before dispatch, what counts as focused,
  what is non-executing;
- the identities of the guarded files the rendering drew on.

It renders, in this order: the checks the gate runs; how scenarios run (the
configuration file, profile, effective feature paths, the tag filter and what
it excludes, the support and world files, the step-directory convention per
module kind); how tests run (per package directory: the command the audit
declares, the configuration file, and the focused form the shell accepts);
each module's test area; what the shell refuses; the guarded files with
their hashes. Every path is project-relative with one line saying what it
holds. An unavailable fact is rendered as `unavailable: <reason>` in its
place.

The function takes no per-task input, so its bytes are identical for every
session of the run until a guarded file changes. The service computes it once
per guarded-file state, keyed by the hash of the inputs' identities, and
supplies the same section to every fresh start that requires it. The
effective Cucumber configuration is then acquired once per guarded state
rather than once per engineer iteration, which is where
`prepareAssignedCucumber` runs it today (open question 4).

The section goes before per-task content in the message. Today
`buildTaskPacket` orders the message as briefing-state line, briefing
sections (goal, requirements, then literal sections), procedure, environment
JSON, task (`prompts/tasks.ts:153`). The proposal reserves
`environment:project` as the first briefing section, before `goal`, through
`taskBriefingRevision`. Open question 1 concerns the briefing-state line that
precedes it.

The environment JSON keeps the facts the shell classifier and the manifest
need: `cucumberConfiguration` with cwd, config path, profile, exact paths,
configuration identity, source identities, argv, selection and environment
names (`focusedScenarioFacts`). Those facts are per assignment and stay in the
environment; the prose rendering does not repeat them.

### Per-assignment content

The exact focused command moves from the end of the engineer's prompt
(`run/service.ts:8832`) into the task part, rendered by `buildTaskPacket`
under `# Current task` from a new `task.commands` input: one literal command
line with a one-line instruction, "Run the assigned scenarios with this
command; it is the only Cucumber command the shell accepts as focused", and
the pending note. Where the assignment names no feature file, the task part
says so in one line. Where preparation failed, it states the reason and that
no Cucumber selection will be accepted. The support, world and loader paths
and the configuration identity are already in the project environment and the
environment JSON and are not repeated.

The scenario briefing lists, for each candidate step directory, the step
files found there at the base commit, as the integration briefing already
does for its owners (`work/session.ts` `integrationSection`). Provenance
stays as the briefing states it today: files observed, not imports
established.

## Changes, by file

A brief for a plan, not a plan. Each item names the owner's file and the
change; tests are listed with the file they verify.

1. `subs/harness/src/prompts/project-environment.ts` (new): the input type
   and `renderProjectEnvironment`. Tests: identical bytes for two inputs that
   differ only in per-task data; a changed guarded identity changes the
   bytes; every unavailable input renders in place with its reason; no
   inferred command appears when the Cucumber executor is unavailable.
2. `subs/harness/src/prompts/tasks.ts`: the required-inputs table beside
   `taskDefinition`; the check in `buildTaskPacket`; `task.commands`
   rendered in the task text. Tests in `plan23-task-prompts.test.ts`: every
   fixture row satisfies the table; each required key, removed, throws; the
   commands line appears exactly once and only for the roles that require it.
3. `subs/harness/src/prompts/briefings.ts`: `environment:project` as a
   reserved first section of `taskBriefingRevision`, with the revision
   covering it as it covers the others; a continuation whose project
   environment changed receives it again as a delta, which the existing
   section diff already does.
4. `subs/harness/src/work/session.ts`: split `prepareAssignedCucumber` into
   the effective-configuration acquisition, keyed by the guarded identities
   and shared across assignments, and the per-assignment focused command;
   extend the scenario briefing with the step files found; remove "Their
   text arrives in your work-item package once you have oriented" and the
   fixed closing line (Plan 24 C1 and C3).
5. `subs/harness/src/run/service.ts`: compute the project environment once
   per guarded state and supply `environment:project` to every fresh start
   the relevance table marks; supply `brief:module`, `brief:scenarios` and
   `brief:test-areas` as keyed sections where the table requires them; pass
   the orientation `task` (Plan 24 C1); give the capability qualification
   fallback the work-item package and module briefing instead of the whole
   captured plan; give the contract engineer, the non-functional repair
   engineer and the capability architect the test areas and API view paths;
   pass `task.commands` for the engineer and stop appending the command
   block to the prompt. Tests: the existing fresh-fallback tests
   (`plan23-continuing-work.test.ts`, `capability-delegation.test.ts`,
   `context-selection-runtime.test.ts`) assert the delivered sections; a
   scripted run with a lost architect point shows the fallback packet
   carrying every required key.
6. `subs/harness/src/work/engineer.ts` and `work/scenario-briefing.ts`: the
   generic `npx vitest run` hint gives way to the project environment's
   focused form; the entry briefing lists step files. `engineer.procedure.md`
   step 4 names the task's command and the project environment's focused
   form instead of a fixed invocation.
7. `subs/harness/src/sessions/single.ts`: supply the test areas and the
   project environment to a standalone session.
8. `subs/harness/src/tools/shell.ts`: unchanged in behavior; its refusal
   text names the focused form the project environment states rather than a
   fixed `npm test -- <file>`.
9. `docs/harness.spec.md`, section "An Oriented Context Is Reused, Never
   Required": the detailed contract of a fresh-start prompt: the five input
   groups, inline versus named-path references, the relevance table, stated
   unavailability, and enforcement at packet construction. `docs/glossary.md`:
   a definition of "project environment" if Dan wants the term.
10. `docs/analysis/2026-10-09-orientation.md`: the proposed next step's last
    bullet ("Verify, per workflow, that the fresh-start prompt carries every
    required input") points here.

Plan 24 C1 to C3 and this design touch the same renderers; whichever plan
runs first carries those items, and the other builds on them.

## Open questions

1. **The briefing-state line.** The message opens with "Briefing revision:
   …; based on: … (mode)", which differs for every task, so placing the
   project environment after it gives identical bytes but not an identical
   message prefix. Moving the line after the project environment, or keeping
   it only in the manifest, makes the role instructions, declarations and
   project environment one identical prefix for every fresh session of a role.
   Recommendation: move the line after the project environment; the agent
   needs it only to notice which sections were updated, and its position is
   immaterial to that.
2. **The initial architect.** It writes the scenarios engineers bind, so it
   benefits from knowing whether the audit definition runs scenarios and from
   which paths. Supplying the full project environment adds test-runner and
   shell facts it cannot use. Recommendation: do not supply it in this plan;
   add a one-line fact to its message in the catalog work if a real run shows
   it registering scenarios the project cannot run.
3. **What a missing required input does.** Failing packet construction ends
   the invocation as failed with an internal cause; for a writer that fails
   the run. The alternative records a degradation and proceeds with an
   incomplete prompt. Recommendation: fail. A missing input is a harness
   defect, and D2 is sound only if a fresh start is complete; an incomplete
   prompt that proceeds hides the defect behind the agent's exploration.
4. **When the effective Cucumber configuration is acquired.** It runs the
   project's own `loadConfiguration` in a child process. Once per guarded
   state, at readiness and after each guarded change, replaces once per
   engineer iteration and makes the project environment available to the
   architects before any engineer runs; it also means a readiness failure of
   that acquisition is reported before work starts rather than as an
   unavailable command later. Recommendation: once per guarded state at
   readiness, keeping the per-assignment focused command where it is.
5. **Step-file listing.** Listing the step files found in each candidate
   directory is cheap and deterministic but is per-task content that changes
   with every commit, and the agent could `ls` the directory it is told
   about. Recommendation: list them; the integration briefing already does,
   and one `ls` per role per iteration is exactly the rediscovery the rule
   removes.
6. **Reviewers and the project environment.** Code and scope reviews judge
   step files and tests but hold only snapshot tools; the project environment
   names paths they can read in the candidate. The cost is one section per
   review. Recommendation: supply it to code and scope reviews; not to design
   reviews.
