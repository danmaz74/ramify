# CheckFinding Principles

**Status:** Proposed

## Purpose and authority

These principles govern how ramify-agent records, settles and presents
CheckFindings from implementation checks and agent reviews. They follow the
harness principle that
[an executable specification is a translation](harness.principles.md#an-executable-specification-is-a-translation):
a verdict is about an executable specification, a judgment applied to a
semantic specification gives a signal, and this document is about the
signals. The
[harness principles](harness.principles.md) and the rules that govern
acceptance scenarios still apply to their own subjects. Required gates and
acceptance scenarios are outside the CheckFinding system: a CheckFinding
decision cannot turn a required, unverified gate or scenario into a pass, and
only the obligation's own authority can change it.

## Principles

### A CheckFinding is a risk signal

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

### Bound the correction loop

Fixing signals leads to a review of the fix, which raises new signals. Left
alone, this loop never ends. Correction rounds per work item are bounded.

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
An accepted non-functional deviation changes review standing for its assessed
candidate, not the verdict of a required gate or scenario.

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
