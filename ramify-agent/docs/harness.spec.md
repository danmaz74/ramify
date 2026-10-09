# Harness Specification

**Status:** Proposed. The whole-tree scope and verification rules adopted on
2026-10-01 are normative design decisions; their implementation remains pending.

## Purpose

Specify the scope, verification, preparation and session behavior governed by
the [harness principles](harness.principles.md). The principles remain
applicable alongside these detailed contracts.

## Specification

### Forecast Early; Decide with Current Evidence

When a concrete need arises, reuse the responsible agent's oriented context
with the new evidence, through continuation or a fork carrying accumulated
decision briefs. It considers the immediate need alongside forecast needs
elsewhere, earlier decisions and current findings. Anticipated consumers inform
the design, but their requirements remain provisional until examined during
their own work. Considering them does not by itself coordinate their execution.

### Every Agent Scope Is a Cut on the Module Tree

A module assignment covers its owned contents, including configuration,
documentation, scratch and owned-unwired trees, except its
owned-nested-project trees. Child subtrees and owned-nested-project trees
require explicit inclusion, each as a whole. External trees are never
writable in the enclosing run. Guarded configuration remains
an authorization restriction within ownership; owning a file does not waive
that restriction.

The issuing architect names each included tree with a reason and instructions
for its meaning. An included owned-nested-project tree is excluded from Ramify
source checks; its own instructions and commands apply from its root. Substantial work on that project belongs in
a run rooted there. An engineer needing a scope expansion asks its architect;
excluded analysis never creates write authority.

An engineer's default working directory and code-search root are the assigned
module's `src/`, including its tests and interface vocabulary. Work on auxiliary
source and other owned contents uses their actual locations within the authorized
scope. Expanding reads is deliberate navigation; the harness checks write
authority separately. A directory layout alone does not control write access.
A production-only search excludes testing-classified source: `src/tests/` and
the ordinary `src/` of modules tagged `testing`.

Before launching work intended for `src/`, the harness creates that directory
if absent. Work on the module's own tests uses `src/tests/` without entering
child implementations; the harness creates that directory if needed. It must
not substitute the module root or a child module for either source location.

### Verification Follows Scope And Audit Policy

Verification executes the project's configured checks through ramify-audit.
For committed partial audits, impact selection comes from Ramify and the
project's audit policy; inert and excluded paths need not select their owner.
Detected shared inputs and explicitly listed undetected configuration files
follow the provider's full-audit policy. The harness records complete audit
results and preserves producer verdicts. The responsible architect evaluates
implementation, tests and relevant audit diagnostics and declares whether a
registered requirement is correctly implemented and passing. The harness
trusts that declaration and asks the architect about missing reports; it does
not match declarations or references to test files or execution results.
Final verification is a full audit of the configured suite, including required
nested projects. Architect declarations and that audit result remain separate.
An owned-unwired tree is verified by its owner's tests; an included
owned-nested-project tree needs its own nested audit at the plan's final
gate, and each project's audit result is preserved separately.
Ownership, source classification and configured test execution are distinct.
A not-analyzed path is never presented as passing source analysis.

### Scratch Has The Iteration's Lifetime

The harness ensures module scratch directories are ignored by Git before use.
It adds missing rules to the project's `.gitignore`, preserving existing rules
and avoiding duplicates, including when new modules are introduced. This is
harness setup responsibility, independent of an engineer's module write scope.

The harness creates the assigned module's scratch directory within its scope.
Scratch survives for as long as the iteration that generated it remains open,
including repairs, suspension for nested capability work and interrupted-iteration
resumption. Closing another iteration never removes that scratch. At closure,
the harness removes scratch from modules with no iteration still open, whatever
the closing outcome. It preserves and reports any paths in Git's index instead
of deleting them. Readiness first checks all scratch for tracked paths and stops
without deleting anything if any exist; otherwise it removes scratch left by an
earlier run. Evidence that must survive belongs in durable results or evidence
records, not scratch. The project remains responsible for compiler exclusions
that keep scratch out of builds.

### A Module Carries Its Own Onboarding

The launcher supplies the module description, relevant documentation and
permitted contracts as initial context.

Each ordinary task brief supplies the task's current goal, applicable cited elements,
known module/API/test pointers and declared check/configuration
pointers from the caller's existing records. Relevance follows the role, task
and assigned scope in the existing briefing constructors. The agent decides
what to read and explores for additional information. Inapplicable or unavailable
optional information is omitted; there is no required-input matrix or new
completeness gate. Review pointers use the candidate snapshot; module tasks
use their working-directory conventions.

Work orientation receives the work item's own functional, acceptance and context
elements, then asks the local architect to explore its module before submitting.
The context selector forks that point with selectable elements and its current
instruction, retaining inherited support sections without redelivering them.
The assignment turn continues with the selected package and explores further
as needed. A fresh selector or architect receives the ordinary full task inputs.

### Fakes Are Explicitly Named

Fake implementation files use a `.fake` suffix before the language extension,
such as `send-email.fake.ts`. Exported fake implementations, factories and
classes include `Fake` in their names, such as `createSendEmailFake`.
Re-exports preserve that designation rather than exposing a fake under a
production-looking name.

Shared contracts keep behavior-oriented names, such as `SendEmail`, because
both the fake and the real provider implement them. The implementing
assignment and its gate check the naming convention when a fake is used.

### A Small Closed Set of Outcomes Is the Whole Protocol

Each role submits from a closed action union. A requesting engineer can
propose completion, report partial work or request a capability. The local
architect qualifies reuse or delegates. The capability architect consults,
revises its plan, assigns scoped work, delegates a nested need, records a
placement conflict or requests handback. An accepted engineer completion
proposal advances orchestration to verification; it does not establish correct
implementation. An authorized architect's accepted done report records that
architect's judgment that its registered obligation is correctly implemented
and passing. The harness trusts the report and does not infer that judgment
from gate results. Read,
plan-update and prevalidation tools have explicit recorded effects but do not
complete work. The harness applies only accepted actions and current gates.

### An Engineer's Failure Is Its Architect's Decision

The harness reports the failure pre-analyzed: a digest of what it already
holds, then a model's analysis, so the decision needs no transcript. A bound
that proves too tight is the architect's to raise, within the policy's
ceilings.

### An Oriented Context Is Reused, Never Required

Fork an oriented session for independent tasks. It starts from the point where
the earlier session was oriented, before it took up any one task, so the reused
context stays bounded and several questions can start from it at once.

When successive tasks benefit from shared orientation but produce substantial
exploratory context, execute each task in a fork of the updated long-lived
context. The fork can make decisions within its assigned authority and returns
a concise brief of its conclusions, rationale, corrected assumptions and
required follow-ups, referencing the durable records.

Append that brief to the long-lived context without invoking the model. The
next invocation receives the accumulated updates; detailed searches and tool
results remain in the fork. Tasks whose decisions depend on one another must
receive the preceding accepted decisions before starting.

Continuity can come from accumulated decision briefs as well as from continuing
the full conversation. Use direct continuation when its continuity is more
valuable than isolating task exploration. Forks limit accumulated context but
do not necessarily reduce total tokens or latency.

Each request supplies relevant new findings; context reuse does not
automatically reveal changes in the repository.

If reusable context is unavailable, the workflow uses the ordinary fresh task
brief. An actual unavailable fork or continuation closes its original invocation
and permits one new fresh invocation with the full inputs and recorded degradation
reason. Only known missing reusable session/history/payload inputs license that
fallback; the operation receipt's optional `contextUnavailable` indication does
not classify arbitrary provider, task, authorization, cancellation or conflict
failures as context loss. Uncertain effects do not license replay.

After the existing work-orientation attempt bound, fresh selection and assignment
proceed from authoritative work-item records. Recorded attempts preserve that
bound across restart; already accepted orientation still recovers. Failed or
unreadable design orientation leads to an ordinary fresh review with captured
guidance and candidate tools. Global requests use current requests, registry,
hypotheses and decisions when the retained parent is unavailable. New losses
create no rebuild generation or replacement parent. An unavailable append records
`brief-not-appended`; later work starts fresh. Historical rebuild readers remain.

Existing invocation records, observations and projections expose timing, provider
usage, start modes and exploration. [Session observations](metrics/session-observations.md)
describes access and coverage. These are inputs for Dan's benefit assessment;
implementation and qualification require no benefit trial or performance gate.

### Effective Instruction Blocks and Exact Delivery

Each task selects its current role, kind, objective, submission tool and
`procedure:<role>:<family>` key with the SHA-256 of its exact rendered set text.
The selected body must be available at the selected session point or supplied
with that task. Assignment, completion and ordinary local-architect repair use
the main family; orientation, reconciliation and qualification have distinct
families. Inherited procedures remain available, but only the current selection
is active. Current tools, cwd, validator, destination and read/write authority
bind independently of inherited prose.

Reusable procedure, environment and named briefing inputs use invariant framing:
`# Block <key>`, followed by `Current value; replaces any earlier value for this key.`
and the exact body, separated by LF. First delivery and replacement use identical
framing; equality and selected-procedure hashes include that framing. A structural
withdrawal uses `Withdrawn; this block no longer applies.` with a final LF. Role
instructions stay pinned and same-name submission declarations remain immutable.

Resolve effective blocks by replaying actual ordered inputs at the chosen point.
Fresh tasks supply the complete current inputs; continuations and forks supply
missing/changed blocks and explicit withdrawals. A retaining selector's omitted
section remains inherited. Environment fields replace whole values in declared
order with deterministic object properties and preserved array order. Null and
empty values clear earlier values explicitly. Superseded inputs remain physically
in the conversation; effective state is not physical context size.

Briefing content identity hashes canonical ordered section bodies/provenance.
Occurrence identity identifies an accepted update after its predecessor and
durable operation identity. A → B → A has equal A content hashes and distinct
ordered A occurrences. Unchanged content at the selected point reuses its
occurrence. Named accepted appends use the same history; ad hoc prose is not
parsed into blocks. A fork inherits only its named point, never a later parent
or sibling. Prepared-only or uncommitted failures establish no delivery.

New task manifests and harness operation intents use `/2`; readers accept `/1`
and `/2`. Manifests retain ordered physical inherited/appended entries with exact
bytes, hashes and actual source provenance. Legacy normalization interprets known
components without changing their physical bytes or manufacturing separately
delivered environment fields. Retry uses the original admitted packet, schema,
declarations, context and destination exactly, including legacy `/1` operations.
Historical hashes and evidence are not rewritten.

### Optional Discovery Handoffs and NFR Comparisons

Work orientation, architect assignments and engineer completion/partial results
may declare concise `startingPoints` path/note pairs. Paths are normalized literal
project-relative locations, never absolute paths, traversal or globs. Omission
remains valid. Syntax validation does not probe existence or judge relevance.
No extra discovery invocation, completeness rule or semantic decision follows.

The shared named `support:starting-points` briefing groups pointers by their
harness-recorded producer, work item, iteration, invocation and source boundary
when available. Identical path/note pairs coalesce while retaining every origin.
Assignment pointers reach the engineer; result pointers reach its architect and
that exact candidate's code/scope/design reviewers. Retained orientation and
selector contexts need no repeated pointer list; fresh consumers receive usable
recorded orientation pointers alongside their ordinary current brief.

Workspace consumers use their current cwd conventions. Snapshot consumers use
the pinned candidate's project-relative paths and existing captured entry/access
filters. Missing, symlink, generated-view, run-record or inaccessible hints are
omitted without task failure or new filesystem probes. Origin boundaries describe
history, not unchanged files. Hints grant no access, writes or completion authority;
the consumer inspects the current source and explores beyond stale hints.

NFR source preparation supplies two captured comparisons to the same candidate
tree: `run-start` from reliable original recorded source, and `accepted-boundary`
from the latest accepted commit. Dirty original capture retains its qualification:
the commit comparison excludes uncommitted starting bytes. Missing reliable
history omits `run-start`; current HEAD cannot fabricate it, and a failed diff
cannot become an empty comparison. Changed paths obey existing NFR source filters.

NFR `snapshot_diff` accepts only captured comparison names and reports actual
base/target identities for both lists and patches. New tasks default to reliable
`run-start`, otherwise explicitly to `accepted-boundary`. Legacy admitted tasks
retain their original declaration/default on exact retry. Ordinary reviewer
iteration-base semantics remain. Repair retains guarded workspace tools and its
prepared candidate identity; reassessment rebuilds comparisons and filters hints
for the new candidate. Scoped investigations retain their declared read scope.

NFR assessment starts from supplied implementation locations and requests a
relevant diff when useful; no initial pathless diff is required. Every fixed/NFR
obligation, broader permitted inspection, uncertainty and independent judgment
remains. Pointer notes, previous completion reports and green audits cannot
establish satisfaction. Audit establishes configured test health; responsible
architects assess semantic completion.

### Review Patch Delivery

The harness child `reviews` prepares fixed candidate evidence and validates reviewer
submissions; harness retains agent invocation, cancellation, durable records and
CheckFinding coordination. Its preparation API binds delivered patches and observed
tool answers to one validator.

Before invoking a code, scope or design reviewer, collect patches through the
candidate source between the request's fixed base and audited candidate. Apply
the same snapshot path restrictions as the review tools. Include complete
patches inline when their combined UTF-8 size is at most 200 KiB. Once collection
exceeds that budget, stop acquiring further patches and deliver a name-status
summary capped at 200 entries, with explicit omissions. Reviewers obtain the
needed per-file patches through `snapshot_diff` against the same fixed commits.
The complete canonical changed-path list remains supplied separately.

Record the diff payload once as a literal delivered input, including its hash
and byte count in the invocation's delivery manifest. A complete patch delivered
in the current review message can establish inspection coverage without another
tool call. A summary, unavailable patch or omitted patch cannot. Concern grounds
still require a file read with `snapshot_read` during that review. Patch collection
supplies evidence; it makes no judgment about correctness, scope or design.

### Principles And Specifications Are Captured And Sealed

The harness captures applicable `.principles.md` documents as sources of fixed
requirements and `.spec.md` documents for initial plan review, preserving each
document's kind and authority. Their review lifecycle follows
[Principles Guide Implementation; Specifications Constrain the Plan](harness.principles.md#principles-guide-implementation-specifications-constrain-the-plan).
Relocating an approved requirement between these kinds does not change its
review provenance or make it optional.

Sealing belongs to ramify-agent and covers both `.principles.md` and `.spec.md`
files. Cucumber-viz sealing is deprecated for Ramify projects.

Specification discovery, initial specification review, credibility preservation
and sealing remain implementation work. The current evidence scan discovers
principles automatically; a specification reached through a plan link is captured
as plan material. The current credibility classifier downgrades a concern grounded
in a specification, as the [CheckFinding specification](check-findings.spec.md#credibility-follows-provenance)
records. These contracts do not establish runtime support.

Continuing design reviews select principles and relevant READMEs as guidance.
They do not receive the whole specification set. Relevant specification obligations
must reach implementation and review through the reviewed plan; this does not
require adding every specification to recurring design guidance.
