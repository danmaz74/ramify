# CheckFinding Principles

**Status:** Proposed

## Purpose and authority

These principles govern how ramify-agent records, settles and presents
CheckFindings from implementation checks and agent reviews. The
[harness principles](harness.principles.md) and the rules that govern
acceptance scenarios still apply to their own subjects. Required gates and
acceptance scenarios are outside the CheckFinding system: a CheckFinding
decision cannot turn a required, unverified gate or scenario into a pass, and
only the obligation's own authority can change it.

## Principles

### A CheckFinding is a risk signal

A CheckFinding signals a risk: that the system will not work correctly, or
that the implementation is not as good as it could be. A signal is
**objective** when a check observed it, such as a failing test or a
structural diagnostic, and **subjective** when an agent judged it. Each
signal carries a risk level, **high**, **medium** or **low**; its reporter
proposes the level and the assessing architect may correct it.

A signal is never a verdict. A subjective signal is an opinion, however
confidently worded, and its wording, severity and confidence do not turn it
into a fact. The observation, the judgment about it, the decision taken and
the verification of that decision are recorded separately, so that a later
agent can question any of them.

### Working a signal is a cost; spend where the return is highest

Every action on a signal costs something: investigating, matching, repairing,
checking the repair, and above all a person's attention. The system spends in
proportion to the estimated return, which grows with the signal's risk and its
credibility. This is a trade-off under uncertainty, not an exact accounting. A
recorded reasonable estimate beats a precision that costs more than the fix.

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
   the original plan, a frozen scenario or a requirement a person approved;
4. subjective, grounded in agent-generated material: an agent's test, added
   requirement or documentation;
5. ungrounded.

Principles documents and original plans count as human-reviewed. A reviewer
names what grounds its concern, and the harness derives credibility from that
reference; a reviewer cannot declare its own credibility.

### Objective and subjective signals settle differently

An objective signal is **fixed** only when the same check passes again on the
candidate being accepted, with the same assertion and comparable inputs and
environment. A different test passing, a changed or deleted test, or an
agent's assurance does not fix it. A runner crash, timeout or missing result
is an execution gap, not a pass and not a failure. Changing the test itself is
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

Fixing signals leads to a review of the fix, which raises new signals. Left
alone, this loop never ends. Correction rounds per work item are bounded. The
first round may correct any signal the architect chooses; a later round may be
started only for a signal of non-low risk, and its review covers the
correction's own change.

When the bound is reached, the remaining signals stay **unresolved**. Neither
the harness nor a final agent turn settles them. Unresolved is a normal end
state of a work item and never blocks its gate; the user decides which ones
deserve more.

### Keep only distinctions that change a decision

A check result belongs to its check attempt. It needs a persistent CheckFinding
only when an issue must be followed through a repair, a reassessment or a
decision, never for every diagnostic, failure or reviewer note. Add a state,
role or workflow only when it serves a different decision. Simplicity must not
hide uncertainty or merge a passing judgment with a passing required check.

An objective signal keeps its identity through the producer's stable key. Two
subjective signals are the same issue when the assessing architect judges
that they describe the same behavior and records why; a reasonable match is
enough, and matching must not cost more than the signals are worth. File
overlap alone is not a match. Absence from a narrower or unrun check settles
nothing.

### Use best effort without manufacturing a clean result

Agent review has incomplete coverage and fallible output. Run it with bounded
retries and focused evidence. When a reviewer is unavailable, returns
malformed output or cannot inspect the relevant change, record **not
verified** with the reason; an empty or invalid result is never "no
CheckFindings". Whether the run continues with that gap is policy, and best
effort is often right for subjective reviews. Reports distinguish completed
coverage from unavailable coverage, and a passing gate does not prove the
absence of a semantic defect.

### Routine settlement needs no person

The default path is that the existing engineer, architect and gate
responsibilities assess a signal, repair or waive it, and verify the claim.
The system may choose a reasonable interpretation when evidence is incomplete
or a tension with guidance is weak; it records the choice and its uncertainty
as a material choice, so the user can reconsider it. Automatic settlement
never silently changes a frozen scenario, an explicit principle, a protected
contract or another artifact whose owner requires approval.

Ask the user only when the system cannot responsibly choose among outcomes
with materially different consequences under existing authority: a proposed
resolution that directly conflicts with an explicit requirement or principle,
changes an approved acceptance obligation, or needs an approval that another
governing document reserves to a person. The request names the exact
conflicting text and revision, the options and the consequence of each.

### Show the user what to focus on

Presentation orders signals by risk, then credibility, then recency, and
groups them by the modules their evidence concerns, so that the global view
shows for each module how many signals are unsettled. A non-low risk signal
left unresolved because it surfaced in the latest review is marked distinctly;
it must not hide inside a count.

Settled signals need no notification. Their evidence and history remain
inspectable. Summaries distinguish **fixed**, **waived**, **superseded**,
**deferred**, **unresolved** with its reason, and unverified coverage; they
never collapse these into "resolved".
