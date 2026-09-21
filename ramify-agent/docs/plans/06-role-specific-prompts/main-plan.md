# Plan 6: Role-specific prompts

**Date:** 2026-09-21. **Status:** proposed.

Every role's prompt becomes self-contained and written for the role's own
tools, evidence and submission. The module-architect skill, written before
this harness existed for an agent with a shell answering open architecture
questions, leaves the prompts. What it says that a role needs is rewritten
into that role's procedure. One short block that every role shares says what
a Ramify project is.

## Why

Evidence from the real run of the `review-notes` plan on
`openai-codex/gpt-5.6-sol:high` (2026-09-21), and from reading the prompts:

- **Two roles get the whole skill, three get nothing.** `SKILL.md` is
  embedded in the initial architect's and the global fork's system prompts.
  The local architect, the engineer and the contract engineer get none of it.
  The engineer had no Ramify orientation at all until its own section was
  added on 2026-09-21 (`54aa830`); a code comment had claimed the skill
  supplied it.
- **The skill points outside the project.** Its guidance is in reference
  files under `ramify-agent/skills/module-architect/`. The initial architect
  and the global fork each spent 6 of their 40 and 55 tool calls reading
  there, one on a file that does not exist (`references/report.md`).
- **Its first step is forbidden here.** It says to run
  `ramify materialize`. The harness has materialized the view and tells the
  role not to refresh it; the initial architect's prompt carries a disclaimer
  that the skill "was written for an agent with a shell".
- **Its last step does not apply.** It ends in a prose report template. Every
  role ends with a fixed JSON submission.
- **Some of its rules are wrong for a role.** "Propose changes; do not edit
  source" is false for engineers. "Record every source file read" repeats what
  the harness records.
- **What the architects need most is optional reading.** Placement and
  decomposition guidance is loaded on demand, so nothing ensures it is read.
- **The architects are not given the plan's text.** A work item's message
  says `Requirement: “Request”, “Constraints”`: heading anchors, rendered by
  `refs()` in `work/session.ts`. Both architect turns of a second run had to
  search `plans/` for the file.
- **The initial architect has no API view.** Views are materialized per
  module, for the local architect's turn. The initial architect recorded that
  accessibility "cannot be verified", and the sentence travelled into the
  hypotheses it delivered.

## Runnable outcome

An implementation run in which:

1. No role reads a file outside the project root, and no prompt names one.
2. Every role's system prompt opens its Ramify knowledge with the same block,
   byte for byte.
3. Each role's procedure holds the guidance for the decision that role makes,
   in terms of the tools it has (`read`, `grep`, `ls`, and for engineers
   `edit`, `write`, `shell`) and the fields of its submission.
4. The local architect's and the global fork's messages carry the text of the
   plan sections a work item or request refers to.
5. The initial architect is told what it decides, top-level capabilities,
   their owners and a graph of forecast lower-level capabilities, and what it
   does not: work items, staging and access. It does not record a missing API
   view as a limit of the evidence.

Behavior of the harness is otherwise unchanged: no record schema, submission
schema, gate or state transition changes.

## Scope

**In scope:** the five system prompts and their procedures; the prompt package
loader; the two briefing builders that name plan references; how the initial
architect learns about accessibility; offline tests; one real run as
development evidence.

**Out of scope:**

- **The engineer's per-code violation sentences and the "incomplete exposure"
  wording.** They change when Ramify's own messages become self-sufficient
  (toolkit Plan 2E) and when the signature-companions error lands.
- **Any change to a submission schema or to what a role may decide.**
- **The skill itself.** `skills/module-architect/` stays in the repository for
  standalone use, unchanged.
- **The contract skill's content.** `contract.skill.md` is already written for
  this harness. Only how it is packaged may change (D3).

## Prerequisites

- `54aa830` (the engineer's Ramify section) is merged; it is the model for the
  other roles.
- None of the pending toolkit changes. Where this plan quotes Ramify's
  vocabulary it uses the model's terms, which those changes do not alter.
- Plan 5 is independent. If it lands first, the engineer's prompt changes of
  this plan are checked with `ramify-agent session`; otherwise with
  `npm run quick-pi`.

## Decisions

| ID | Decision | Recommendation |
| --- | --- | --- |
| D1 | **Where role guidance lives.** | In each role's existing procedure file. No new file kind per role: a role has a system prompt and a procedure, and the procedure is where "how to decide" already is. The shared block is one new file, `prompts/ramify-project.shared.md`, filled into every system prompt through `{{ramifyProject}}`. |
| D2 | **How much of `cognitive-decomposition.md` (5.8 kB) to carry.** | A condensed form of about 1.5 kB in the procedure of the one role that splits work: the local architect, which stages iterations. The initial architect splits nothing: it names entry capabilities and forecasts lower-level ones, and the harness creates one work item per entry capability without judgment (`analysis/accept.ts`). The global fork gets only the placement comparison questions. Iteration 1 drafts the condensed text for review before it is used. |
| D3 | **The prompt manifest's `skill` version and the `skill` file kind.** | Keep the protocol field `versions.skill`, nullable as it is, and record `null`; removing a protocol field is a separate change. The file kind `skill` remains for `contract.skill.md`. The shared block is recorded with a new kind, `shared`. `RunServiceOptions.skillDirectory` and `defaultSkillDirectory` are removed. |
| D4 | **Accessibility for the initial architect.** Two ways: materialize every module's API view before the analysis, or say in the prompt that accessibility is established later. | Say it in the prompt. The initial architect submits entry capabilities with their owners and hypotheses about lower-level capabilities with their `dependsOn` graph. A hypothesis is a forecast by design: the local architect of each work item verifies access against its own API view and revises the outline or requests placement. The prompt states that, and that a missing API view at analysis time is expected and is not a coverage limit to record. Materializing every view up front does not scale with project size and only helps if the views are read. If real runs show a wrong capability graph caused by an access assumption, the fallback is a tool that materializes one module's API view on demand. |
| D5 | **How much plan text a briefing carries.** | The full text of each referenced section, each cut at 4,000 characters on a line boundary with the cut stated, and the plan's project-relative path for the rest. A line-range reference keeps today's form with its full text instead of a 160-character excerpt. |

## Iterations

### Iteration 1: The shared block, the condensed decomposition text and D4's measurement

**Owner:** `harness` (`prompts/`).

- Write `ramify-project.shared.md`, about 1.2 kB: the module tree and its
  files; that a module exposes a symbol to its parent or to its descendants
  and the other side receives it; that an ancestor may re-expose what it
  received; that being exported exposes nothing; tags and their two kinds in
  two sentences; testing source; the architect view (what exists and who owns
  it) against a module's API view (what that module may import); that both are
  generated, never edited and never imported from; that a Ramify check failure
  fails the gate.
- Move the corresponding sentences out of `engineer.system.md` so the engineer
  reads the shared block followed by its own part. The engineer's rendered
  prompt keeps every fact it states today; a test lists them.
- The shared block also states the division of roles in four sentences: the
  initial architect names top-level capabilities, their owners and a graph of
  forecast lower-level capabilities; the harness makes one work item per
  top-level capability and takes them in order; a work item's local architect
  verifies the forecasts, stages iterations and asks for placement; engineers
  carry out one iteration. A role that knows what it does not decide stops
  trying to decide it.
- Draft the condensed decomposition text (D2) and the placement questions as
  review material in this plan's directory.

**Exit:** the shared block renders into all five system prompts; the
engineer's fact list test passes; the drafts are recorded.

### Iteration 2: The initial architect

**Owner:** `harness` (`prompts/initial-architect.system.md`,
`initial-analysis.procedure.md`).

- Remove the embedded skill and its disclaimer.
- Discovery, rewritten for this role: form three to five search terms; search
  `.ramify-architect/README.md` first, then `grep` the view's `*.jsonl` for
  candidate files before reading records; open at most three candidates'
  `module.json`, `behavior.jsonl` and `tests.jsonl`; read defining source only
  when a bounded signature does not answer; stop after three narrowing
  searches; "not found" is never proof of absence and goes into
  `coverageLimits` with the view's own limits. Each step names the submission
  field it feeds: entry capabilities, registry entries, hypotheses, proposed
  modules.
- What it does not do, stated: it creates no work items and stages no work.
  An entry capability is a behavior the plan asks for at its top level; a
  hypothesis is a lower-level capability it expects that behavior to need,
  with its suggested owner and what it depends on. Guidance on telling the
  two apart, and on when a capability is one entry rather than two.
- Accessibility as D4 says: a forecast, verified later, never a limit to
  record.

**Exit:** the rendered prompt names no path outside the project, no
`ramify materialize` and no report template; the analysis-submission tests
pass with the package's new file list.

### Iteration 3: The global fork

**Owner:** `harness` (`prompts/global-fork.system.md`,
`global-fork.procedure.md`).

- Remove the embedded skill.
- Placement, rewritten as how to choose among the four outcomes this role
  submits (`reuse`, `create`, `extract`, `external`): establish the
  responsibility; shortlist at most three modules by purpose, owned behavior,
  tags, `uses` and `usedBy`; the comparison questions; which outcome each
  answer leads to; never propose a boundary only because a capability can be
  named. A proposed exposure is a proposal and never an existing permission.
  An extension is a `create` whose owner is an existing module, with
  `changesExistingSymbols` set.
- The discovery steps of iteration 2, shared as text, for its search for the
  required behavior.

**Exit:** as iteration 2, for this role; the placement decision tests pass.

### Iteration 4: The local architect, and the plan's text

**Owner:** `harness` (`prompts/local-architect.*`, `work/session.ts`,
`architecture/session.ts`).

- The shared block replaces the two sentences about views in its system
  prompt.
- Access, rewritten for this role: search the module's own API view under
  `external/` and `children/`, ordinary and testing kept apart; presence with
  its import spelling is definitive; absence under reported coverage limits
  proves nothing; for a complete negative view, read the `module.ramify` files
  on the path and, where another owner would have to expose something,
  `request-placement` rather than assigning an import that cannot pass.
- Decomposition, condensed (D2), phrased as how to stage iterations.
- An assignment's `approach` names only symbols the module receives. This is
  the rule the T2 assignment broke in spirit: it asked for a type the module
  does not receive.
- `refs()` carries section text (D5). The fork's request message carries the
  requirement's text the same way.

**Exit:** a work-item message for the fixture's `review-notes` plan contains
the text of its "Request" and "Acceptance" sections, cut as D5 says; session
tests pass.

### Iteration 5: The contract engineer, the package, and evidence

**Owner:** `harness` (`prompts/contract-engineer.system.md`,
`prompts/packages.ts`, `run/service.ts`), then a real run.

- The contract engineer's system prompt gains the shared block and the
  engineer's import rules, which apply to it unchanged.
- The package loader stops reading the skill directory (D3); the option and
  the default are removed; the manifest records `skill: null`.
- Offline tests, for every role: the rendered prompt contains the shared block
  byte for byte; no `{{placeholder}}` remains; no absolute path other than
  the project root; none of `ramify materialize`, `report.md`,
  `module-architect`; the package hash changes when the shared block changes.
- Development evidence, once, not a test: rerun the `review-notes` plan on
  `openai-codex/gpt-5.6-sol:high` and compare with the baseline below. Keep
  the run as the recording for the replay fake.

**Exit:** the completion gate.

## Completion gate

- The type check, the harness tests and `npm run check:self` pass.
- The offline prompt tests of iteration 5 pass for all five roles.
- In the real run, from the transcripts:
  - reads outside the project root: 0 (baseline: 6 by the initial architect,
    6 by each global fork);
  - no architect searches `plans/` for the plan's file;
  - the initial architect records no limit about a missing API view;
  - tool calls before the first submission do not rise for any architect role
    (baseline: initial architect 40, local architect 53, global fork 55).
- A results note records the run, the comparison and anything a role still had
  to find out for itself.

## Known interactions

- **Toolkit Plan 2E and the signature-companions error** change what a
  violation message says and remove the "incomplete exposure" case. This plan
  leaves that wording where it is, in the engineer's own part, so those
  changes touch one place.
- **Plan 4** reports token cost per role. The baseline above lets its first
  measurement show what this plan changed.
- **Plan 5** reuses the engineer's prompt unchanged, whichever lands first.
- **The capability-extension rule has landed.** `extend` is gone from the
  placement outcomes and the hypothesis changes, both procedures state that an
  extension is a new capability with its own name, and the decision and the
  hypothesis carry `changesExistingSymbols`. This plan's iteration 3 rewrites
  placement over the four outcomes that remain.
- **The to-do list's items 2 and 3** (hook texts, gate briefings) edit
  messages, not prompts, and do not conflict. Item 4 of that list is this
  plan.
