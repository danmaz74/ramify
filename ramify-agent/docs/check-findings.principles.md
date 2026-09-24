# CheckFinding Principles

**Status:** Proposed

## Purpose and authority

These principles govern how ramify-agent records, resolves and presents
CheckFindings from implementation checks and agent reviews. The
[harness principles](harness.principles.md) and the rules that govern
acceptance scenarios still apply to their own subjects. In particular, a
CheckFinding decision cannot turn a required, unverified gate or scenario
into a pass.

## Principles

### Keep only distinctions that change a decision

A check result belongs to its check attempt. It needs a persistent CheckFinding only
when an issue must be tracked through repair, reassessment or a decision. Do
not create a long-lived case for every diagnostic, failure or reviewer note.

Represent the few distinctions that affect what the system does: what was
observed, what an agent judged, what action was chosen, and how that action was
verified. Keep the evidence needed to recover and explain those decisions.
Add a separate state, role or workflow only when it serves a different
responsibility or decision. Simplicity must not conceal uncertainty or merge a
passing judgment with a passing required check.

### Record observations, judgments and decisions separately

A check execution records what happened on a particular source tree with a
particular command, selection and environment. A test failed, a checker emitted
a diagnostic, or a review agent asserted a concern: these events are
observations. Whether the diagnostic identifies a defect, whether the test
failure was caused by this change, and whether the concern merits a code change
are separate judgments. A disposition records what the system chose to do
about them.

Most CheckFindings contain judgments. Their wording, severity and confidence
must not turn them into objective facts. Each CheckFinding keeps its producer,
attempt, source revision or tree identity, relevant evidence, scope, rationale
and any uncertainty. The original observation and later decisions remain
available even when the current judgment changes.

### A failed test is an observed failure until that test passes

A failed test is a fact about that execution, not proof of its cause or that
the current change introduced it. A runner crash, timeout or missing test
result is an execution gap, not a test failure. Claiming the failure fixed
requires a passing rerun of the *same test*, with the same
behavioral assertion and comparable inputs and environment, against the
candidate being accepted. A different test passing, a changed or deleted test,
or an agent's assurance does not establish that fix. If the test itself must
change, that is a separate, explicit change to the test obligation and needs
its own authority and review.

Flaky tests produce real failures and real passes. The system should run
bounded, focused reruns when it can identify the failing test, preserve every
attempt and distinguish **reproduced**, **intermittent**, and **inconclusive**
evidence. A later pass does not erase the earlier failure; repeated passes can
support a provisional flaky classification, not a claim that the underlying
behavior is correct. A flaky disposition may permit progress under an explicit
policy with recorded risk and follow-up, but must never be represented as a
passing required gate. If a focused rerun cannot be built, the result stays
unclassified rather than becoming a presumed flaky test.

### Judgments can be superseded by judgments

A fresh, reasoned assessment may reject, narrow or replace an earlier review
judgment without any code change. This is a valid resolution of a judgmental
CheckFinding; it is not a code fix or an owner check passing. Record which judgment
it supersedes, the new evidence or interpretation, and the decision maker.
Recency alone does not confer authority. The system must keep the earlier
assessment inspectable and reopen the issue when later evidence warrants it.

An objective check result has a different resolution path. A remediation claim
does not supersede the result; the responsible check must rerun on the relevant
candidate, or the system must record a distinct authorized change to the
obligation. A failed or omitted rerun is not verification.

### Resolve routine CheckFindings automatically

The default path is for the system to assess a CheckFinding, make a bounded repair
or revise the judgment, and verify the resulting claim. It should use the
existing engineer, architect and gate responsibilities rather than create a
human review stop for ordinary disagreement or uncertainty. Attempts have
limits so an unresolved CheckFinding cannot cause an endless repair and review loop.

The system may automatically choose a reasonable interpretation when the
evidence is incomplete or a possible conflict with guidance is weak. It
records the choice, its uncertainty and the resulting fix. Material choices
are reported with that fix so the user can reconsider them later. Automatic
resolution does not authorize silently changing a frozen scenario, an explicit
principle, a protected contract, or another artifact whose owner requires
approval.

Ask the user only when the system cannot responsibly choose among outcomes
with materially different consequences under existing authority. A strong
contradiction includes a proposed resolution that directly conflicts with an
explicit requirement or principle, changes an approved acceptance obligation,
or needs an approval that another governing document reserves to a person.
The request should name the exact conflicting text and revision, the options,
and the consequence of each. A weak or merely possible tension is resolved
automatically and reported for optional reconsideration.

### Use best effort without manufacturing a clean result

Agent review and semantic classification have incomplete coverage and fallible
outputs. Run them with bounded retries and focused evidence. If a reviewer is
unavailable, returns malformed output, or cannot inspect the relevant diff,
record **not verified** with the reason. Do not turn an empty or invalid result
into “no CheckFindings.” Whether the run may continue with that gap is a policy
decision, and best effort may often be appropriate for judgmental reviews.

Required tests, structural checks and acceptance scenarios retain their own
completion rules. Best effort for an optional review does not waive an
objective gate. Nor does a successful gate prove that no semantic defect
exists. Reports must distinguish completed coverage from unavailable coverage.

### Keep CheckFindings tied to their evidence and owner

A CheckFinding persists across attempts only when its issue identity is supported
by the producer or a deliberate relation. File overlap alone is insufficient
to merge two reports. Reruns reconcile a CheckFinding only within the scope actually
checked; absence from an unrun or narrower check does not resolve it. A later
change of source tree or accepted obligation may make an earlier decision stale
and require reassessment.

The harness owns durable CheckFindings and dispositions. Check producers supply
observations; review agents supply judgments; the responsible check or a fresh
review supplies verification appropriate to the claim. The history links each
CheckFinding to its repair attempt, superseding judgment, rerun and final
disposition. This allows a new agent to continue without treating a prior
agent's conclusion as unquestionable truth.

### Show users decisions that matter, without routine noise

Most CheckFindings that the system resolves need no default notification. Their
evidence and history remain available when the user chooses to inspect them.
Report a material judgment with the chosen fix, rationale and remaining
uncertainty, even when no user action is needed. Ask for a decision only at the
authority boundary above. Summaries distinguish fixed failures, superseded
judgments, accepted risks, unresolved issues and verification gaps; they do
not collapse all of these into “resolved.”
