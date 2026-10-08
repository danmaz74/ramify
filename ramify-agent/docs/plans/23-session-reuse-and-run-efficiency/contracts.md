# Plan 23 contracts

**Parent:** [main plan](main-plan.md). Names below are proposed contracts, not
claims that the current port already implements them. Iteration 0 freezes exact
types and consumer fixtures; changing them later requires updating dependents.
The [execution v1 appendix](contract-appendix.md) freezes the execution-base
wire values, provider seams and recovery identities; [fixture contracts](fixture-contracts.md)
fix independent expectations.

## C1. Session identity, history and storage

The agent boundary exposes Create, Continue, Fork, Append context, Add tools/set
activation, Retry and Stop. Sessions have harness-owned identities; points are
session-bound immutable numbered-turn boundaries or opaque checkpoints. Create
and Fork return an initial checkpoint. One task invocation is one turn. A child
inherits numbers through N and next runs N+1 under its own identity.

Use a durable ordered operation journal and immutable transcript payloads with
content identities. Store initial instructions/declarations, every model-visible
message and provider-required artifact, additions, activation changes, boundaries,
operation inputs and outcomes. A committed boundary references all required
payloads. Incomplete writes are uncommitted evidence, never a usable point.
Pi files may serve as implementation caches; they cannot be the only record of
head instructions or appended declarations. Display transcripts are projections.

The harness supplies storage backed by its existing ledger facilities. The
agent boundary owns preservation/recovery semantics and accepts that storage
through an injected contract; callers never decode pi entries. Pi owns opaque
provider payload encoding. The ledger remains unaware of workflow roles.

Persist operation intent before dispatch and terminal outcomes before reporting
them. Run-scoped operation keys bind their complete inputs. Repeating Create or
Fork returns the same identity; repeating a completed operation returns its
outcome before considering its old expected point. Conflicting inputs fail.
Continue and standalone appends/tool changes compare the expected current point
atomically with their commit; two callers cannot both advance the same point.

Retry restores an unfinished operation with its original task, policy, validator,
environment and destination, using newly bound handlers. Recheck current authority
before executing. Changed policy or inputs cannot become a retry. An ordinary
Continue restores automatically and creates the next turn; there is no resume API.

Stop fences model dispatch and submission acceptance, retains effect evidence,
and settles outstanding calls before publishing a reusable point. Unknown effect
completion is unavailable for reuse until resolved; do not fabricate success.
Late callbacks cannot mutate a settled turn. A terminal stopped/failed operation
is returned on Retry, not executed again. Transcript idempotency does not promise
exactly-once arbitrary external effects; retain existing effect-recovery rules.

## C2. Provider request and tool contract

Fork and Continue preserve the full inherited serialized prefix, not just visible
chat text. Nothing replaces, removes or prepends inherited instructions, tools,
messages, calls, results or their ordering. Compare the actual outgoing request
at every dispatch, after transformations. The baseline is the persisted request
representation through the inherited point. A new session ID never changes old
message metadata. Cached input follows the accepted identical-prefix assumption.

Append role instructions when the workflow requires a distinct role, then native
new tool declarations, activation instructions and the current task. Use the
supported pi 0.87.1 `openai-codex/gpt-5.6-sol` path first. Validate support and exact
serialization, including later role instructions; flags alone are insufficient.
An initial validation failure makes zero calls; a later failure prevents the next
call and retains prior effects. The final check must sit outside pi's swallowed
extension-error path. No implicit fresh/summary fallback or automatic compaction.

Definitions are immutable in full. An identical existing definition gets a fresh
handler without another declaration; changed schema/description requires a new
name. Retain all historical definitions in pi's runtime declaration set.
Inactivation blocks execution before handlers run and is described by appended
instructions, never native removal. Current policy also restricts still-declared
tools. Only the designated current submission can complete the turn.

Keep the full submission schema once in the model-visible tool declaration
(the current compact description mechanism may be retained); do not additionally
duplicate it in system/task text or in a second full schema field. Validation
remains exact regardless of provider schema expressiveness.

## C3. Prompt and workflow inputs

System instructions contain the enduring role and task protocol. Task messages
carry objective, procedure, submission tool, environment and changed briefing
sections. Environment includes current cwd, snapshot/candidate, limits and tool
availability. Stable prompts do not bind these to an earlier invocation.

Full briefing on fresh start; deltas against a named inherited briefing revision
on continuation; all required post-point updates on a fork. Hashes identify exact
inputs, never prove that a semantic update is irrelevant. Ordinary task briefs
return to the parent idempotently without an extra model call. Delivered manifests
identify actual inherited and appended instruction sources, not unused packages.

All templates use declared placeholders and reject unresolved required slots,
including known single-brace misspellings. Do not reject arbitrary braces in
quoted code or JSON. Orientation receives the goal/requirements it must read.
Read-only instructions name the supplied views, real limits and submission tool;
they do not request CLI work or a `report.md`. The capability guarded set is one
declared input used by briefing, validation and execution; this plan does not widen it.

The fixed workflow mapping is:

| Workflow | Session choice |
| --- | --- |
| Local architect orientation → assignment/completion/repair/qualification | Continue latest settled point, including accepted appended briefs |
| Capability architect action/nested qualification | Continue the same capability session |
| Engineer repair/capability return within iteration; contract repair | Continue the same engineer session |
| Selector | Fork orientation initially; fork requesting assignment/qualification for re-selection |
| Read-only engineer consultation | Fork the recorded capability-request point |
| Reconciliation | Fork completion-request or capability handback point |
| Scope review | Fork the pinned assignment point; append reviewer authority at the proper instruction level |
| Design review | Fork orientation keyed by captured guidance selection/hashes, scope, prompt and execution configuration; new orientation when identity changes or is unknown |
| Global placement/unresolved request | Fork initial architect orientation plus accepted briefs through the recorded request point |
| Initial architecture/orientation, catalog, code review, first capability/engineer/contract task, failure analysis, standalone command | Fresh under existing contracts |
| Non-functional coordinator/investigator/assessment/repair | Existing fresh policy |
| New engineer iteration or existing budget-return recovery | Fresh from durable work note/plan/return records |

Missing parents follow only the named workflow's existing explicit fresh-recovery
contract; otherwise report unavailable context. Hard context limits stop the
preserving invocation. Do not synthesize an accepted agent budget-return if none
was submitted. No new summary-generation step, context-size threshold or strategy
scoring. Code review remains an independent fresh reading; scope review deliberately
inherits assignment reasoning. Snapshot evidence requirements remain enforced.

## C4. Mutation checks and focused commands

Distinguish a proven empty mutation set, an unknown set and a refused call.
Skip mutation-triggered checks only for proven no change/refusal. Unknown changes
retain the required complete check. Failed commands with actual changes still
receive checks. This optimization never skips the separate completion check.

Serialize mutation/check settlement for a shared working tree so a check does not
race another mutating operation; read-only commands may remain concurrent under
their established contract. Reserve check log identities before awaiting work.
Use observed evidence, not an LLM guess or a shell string, to claim no changes.
Incomplete/changed-input results stay not checked and do not fabricate violations
or clear existing findings. Preserve genuine findings accompanying partial checks.
Job records must be outside the analyzed tree or declared owned-unwired by the
prepared trial; do not invent a global ignore rule.

Build focused Cucumber commands from the project's effective declared support
configuration. A fresh generated config in permitted module scratch names exactly
the iteration's features, preserves required loaders/world/support, and enables
pending scenarios without merging the default profile's paths/tag exclusion.
Retain source config identity and explicit selection. Unknown/dynamic selection
cannot be called verified focus; report the limit rather than guessing.

Command classification distinguishes execution, help/version and dry-run.
Help/version and dry-run do not prove test execution. The actual native witness
checks Cucumber's effective selection, including a CLI-path-plus-default-profile
negative control. Reuse installed public Cucumber/provider configuration surfaces;
do not restore the removed harness scenario audit/discovery mechanism. Full audit
continues to use the project's complete committed configuration.

## C5. Catalog and semantic authority

Intake classification is supplied as accepted input to initial architecture.
Catalog check can retire without replacement; typed references name permitted
element kinds. Keep Gherkin in the scenario registry. Reject invalid local keys
before assigning durable IDs, and name the submitted keys in errors. Avoid
redeclaring existing capabilities/hypotheses. Non-behavioral acceptance may use
registered tests under the stated form rule; the agent makes that classification.

Architects judge requirements/scenarios; audit proves configured suite health.
No mapping from scenario IDs to executed files/results is a completion gate.
Missing required architect reports and failed configured audits still block.
Neither a narrower test command nor a metric creates semantic acceptance.

## C6. Metrics and observation

Preserve the current [scope-size/2](../../measurements-and-kpis.md#scope-size-policy-v2)
and [changed-line attribution](../../measurements-and-kpis.md#changed-line-attribution-and-exclusions)
contracts and staged corrections. Role-delivered support and briefs count once;
architect view is a distinct component. Retain known subtotals, unknown weights,
units, component/revision identities and explicit coverage. An unguarded shell
alone does not make complete attributable snapshots partial. Harness setup and
pending-tag removal remain separately attributed at the path/delta level.

Soft read scope and exploration are separate measurements; do not silently add
them to the writer's v2 declared-scope denominator. Report project-content-only
and total ratios with matching baseline components. Extra locations deduplicate;
unmeasured nested projects/bootstrap locations retain their stated exclusions or
limits, never fabricated byte counts. New role support in inherited contexts is
identified by actual delivered files, not the union of every role's package.

Exploration records invocation/role/session/turn/call identity, requested and
resolved read/search scope, observed bytes returned, start/end or elapsed time,
outcome and coverage. Distinguish returned bytes, unique files read and repeated
reads. A search's target scope does not prove that every byte there was scanned;
do not derive exact scanned bytes from a glob. Record broad/project-wide and
outside-scope searches even with zero matches. Missing byte/duration information
is unknown. Enrich existing tool events; do not add model summarization or repeat
file exploration to populate metrics. Observation loss qualifies metrics but
must not relax durable transcript preservation.

Use replay-safe observation identities including operation/invocation, call and
event kind. Report cached/new input and output separately with actual recorded
rates and estimated-charge labels where needed. Time to first informed action
uses an explicitly recorded milestone (first designated submission or engineering
action), not harness interpretation of reasoning. Report the chosen milestone;
parallel durations are not summed into wall time. No metric selects session mode.

## C7. Trials and evidence

Verify setup changes by recorded setup identity and exact attributed deltas.
An agent's unauthorized edit to the same `.gitignore` is still a finding. Fix
module-relative fixture paths using the actual cwd and preserve project-relative
fields. Remove supplied solutions/stale instructions from fixture README inputs.

Retain raw run logs, task inputs/manifests, operations, serialized prefix
comparisons, usage, scope/observation coverage, trial diffs and audit references.
Exclude credentials. The native/live qualification cannot be replaced by an
offline serializer check. No legacy-session fixtures or compatibility migration.
