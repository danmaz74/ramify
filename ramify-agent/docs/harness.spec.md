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
documentation, scratch and owned-unwired trees, except its owned-nested-project
trees. Child subtrees and owned nested projects require explicit inclusion,
each as a whole. External trees are never writable in the enclosing run. Guarded configuration remains
an authorization restriction within ownership; owning a file does not waive
that restriction.

The issuing architect names each included project tree with a reason and
instructions for its meaning. The tree is excluded from Ramify source checks;
its own instructions and commands apply from its root. Substantial work on that project belongs in
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

An iteration's scoped verification selects its module and explicitly included
child subtrees using ramify-audit's ownership-based test-selection policy.
Owned non-source changes follow their owner's impact; project-wide inputs
follow the audit's declared full-audit policy. Ownership, source classification
and the tests selected by a runner are distinct. Excluded source receives a
not-analyzed answer, never a passing source-check claim.

The harness consumes ramify-audit's combined evidence across required commands
and configurations. It cannot accept missing required tests or incomplete
execution as passing. An included project tree is verified by its owner's
tests during ordinary iterations; a project's own nested audit is required
at the plan's final gate. Preserve each project's audit result separately.

### Scratch Has The Iteration's Lifetime

The harness ensures module scratch directories are ignored by Git before use.
It adds missing rules to the project's `.gitignore`, preserving existing rules
and avoiding duplicates, including when new modules are introduced. This is
harness setup responsibility, independent of an engineer's module write scope.

The harness creates the assigned module's scratch directory within its scope.
Scratch survives repairs and interrupted-iteration resumption, and every module's
scratch directory is removed when the iteration closes, whatever its outcome.
Readiness removes scratch left by an earlier run. Evidence that must survive
belongs in durable results or evidence records, not scratch. The project remains
responsible for compiler exclusions that keep scratch out of builds.

### A Module Carries Its Own Onboarding

The launcher supplies the module description, relevant documentation and
permitted contracts as initial context.

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
placement conflict or requests handback. An accepted submission changes the
orchestration; it does not claim that implementation is accepted. Read,
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
