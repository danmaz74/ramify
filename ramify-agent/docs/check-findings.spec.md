# CheckFinding Specification

**Status:** Proposed

## Purpose and authority

Specify how ramify-agent classifies, settles and presents CheckFindings under
the [CheckFinding principles](check-findings.principles.md) and
[harness principles](harness.principles.md). Required gates and acceptance
scenarios retain their own authority.

## Specification

### A CheckFinding is a risk signal

A CheckFinding signals a risk: that the system will not work correctly, or
that the implementation is not as good as it could be. A signal is
**objective** when a check observed it, such as a failing test or a
structural diagnostic, and **subjective** when an agent judged it. Each
signal carries a risk level, **high**, **medium** or **low**; its reporter
proposes the level and the assessing architect may correct it.

### Working a signal is a cost; spend where the return is highest

No signal is skipped. The local architect spends at least a little attention
on every signal of its work item; a low-risk, low-credibility signal earns a
one-line waiver, and a high-risk, credible one earns a repair.

### Credibility follows provenance

The harness principle
[Trust Follows Provenance](harness.principles.md#trust-follows-provenance)
applies to signals: a signal is weighed by the provenance of what grounds it,
never by its kind or its wording. In decreasing credibility:

1. objective and reproduced;
2. objective, observed once;
3. subjective, grounded in human-reviewed material: a principles document,
   an approved specification, the original plan, a frozen scenario or a
   requirement a person approved;
4. subjective, grounded in agent-generated material: an agent's test, added
   requirement or documentation;
5. ungrounded.

Principles documents, approved specifications and original plans count as
human-reviewed. Moving an approved requirement from principles to a specification
preserves its review provenance. A reviewer names what grounds its concern,
and the harness derives credibility from that reference; a reviewer cannot
declare its own credibility.

**Implementation gap, 2026-10-01:** The current credibility classifier recognizes
the `.principles.md` suffix, the run's original plan and accepted feature files;
it classifies other file paths, including `.spec.md`, as `agent-generated`.
Moving an approved rule into a specification therefore currently downgrades a
concern grounded in that file. This is a known migration regression, pending
support for approved specifications in the classifier.

### Objective and subjective signals settle differently

An objective signal is **fixed** only when the same check passes again on the
candidate being accepted, with the same assertion and comparable inputs and
environment. A different test passing, a changed or deleted test, or an
agent's assurance does not fix it. A runner crash, timeout or missing result
is an execution gap, not a pass and not a failure. A signal from a nested
project's audit is fixed only by the same check passing in that project; a
check of the same name in the run's own project settles nothing for it. Changing the test itself is
a change to the obligation, with its own authority. Flaky tests get bounded,
focused reruns that keep every attempt and distinguish **reproduced**,
**intermittent** and **inconclusive**; a later pass never erases the earlier
failure.

A subjective signal is **fixed** when the architect confirms against the
changed code that the concern no longer applies, **superseded** when a fresh,
reasoned judgment finds the concern wrong or moot, or **waived**. Every
subjective signal is waivable. Recency alone gives a judgment no authority,
and the earlier judgment stays inspectable.

### Waiving is a settlement

A waiver states that the signal is understood and the code stays as it is. It
records who waived, why, and the risk accepted. The user can waive any
signal. An agent can waive a signal when it has authority over every module
the signal concerns: the local architect for its own module, the global
architect for the project.

A waived signal stays settled when the same issue is raised again; the new
report joins it as evidence and does not reopen it. Only an explicit
revocation reopens a waiver: the user can revoke any, an agent only its own or
a lower authority's. A required test or scenario cannot be waived here; that
belongs to its gate.

### Bound the correction loop

The first round may correct any signal the architect chooses; a later round may be
started only for a signal of non-low risk, or to assess a claimed repair or a
person's answer that an earlier round is owed, and its review covers the
correction's own change. Such a round may plan a correction only within its
own floor.

### Keep only distinctions that change a decision

An objective signal keeps its identity through the producer's stable key. Two
subjective signals are the same issue when the assessing architect judges
that they describe the same behavior and records why; a reasonable match is
enough, and matching must not cost more than the signals are worth. File
overlap alone is not a match. Absence from a narrower or unrun check settles
nothing.

### Show the user what to focus on

Presentation orders signals by risk, then credibility, then recency, and
groups them by the modules their evidence concerns, so that the global view
shows for each module how many signals are unsettled. A signal from a nested
project's audit names that project and concerns the module that owns its
tree. A non-low risk signal
left unresolved because it surfaced in the latest review is marked distinctly;
it must not hide inside a count.

Settled signals need no notification. Their evidence and history remain
inspectable. Summaries distinguish **fixed**, **waived**, **superseded**,
**deferred**, **unresolved** with its reason, and unverified coverage; they
never collapse these into "resolved".
