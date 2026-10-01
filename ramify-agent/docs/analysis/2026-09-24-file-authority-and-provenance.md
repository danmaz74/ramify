# File authority and provenance across today's changes

**Date:** 2026-09-24. **Status:** analysis of the documents changed or added
on this date, with recommendations; not an implementation plan and not a
principles change.

## Premise

ramify-agent is built for a project in which most artifacts are never read by
a person. Agents write the tests, most of the documentation and many of the
requirements, and they invent requirements together with the tests that
verify them. A person reviews the principles documents and the original plan,
approves the analysis and its frozen scenarios, and decides structural and
ownership questions; everything else is produced and consumed by agents. The
harness principle [Trust Follows Provenance](../harness.principles.md#trust-follows-provenance)
draws the consequence: an artifact is weighed by where it came from, never by
its kind or its wording, and scarce human and agent attention goes where the
weight and the risk are highest.

That principle was written on 2026-09-24, during a revision of the
[CheckFinding principles](../check-findings.principles.md). The revision
reframed a CheckFinding as a risk signal with a risk level and a credibility
derived from the provenance of what grounds it, made every subjective signal
waivable by an actor with authority over the modules it concerns, and bounded
the correction loop so that exhausted rounds leave signals unresolved for the
user rather than settled by a machine. Its aim is the return on the cost of
working a signal, not exactness.

The same day produced other documents that decide who may change which file:
the [sealed-file edit analysis](2026-09-24-sealed-file-edit-hooks.md), the
[Implementation Studio adoption analysis](2026-09-24-implementation-studio-adoption.md),
Plan 12's [contract appendix](../plans/12-check-findings/contract-appendix.md)
and the toolkit's [shared guidance sync plan](../../../docs/plans/shared-guidance-sync/main-plan.md).
Each was written against its own concern, and each adapted a cucumber-viz
lesson: sealed files, guarded hashes, constraint selection, pinned guidance.
The authority of a file was being decided in several places at once, by
several vocabularies, with the provenance principle arriving last.

This analysis was requested to read those documents together: to list what
the system already had, what the day added, where the pieces contradict each
other, and what to do about it under the
[cost rule of the CheckFinding specification](../check-findings.spec.md#working-a-signal-is-a-cost-spend-where-the-return-is-highest).
It answers before any of the new mechanisms is implemented, so that the
sealed-edit plan and the resumed Plan 12 iterations start from one model of
file authority rather than four. It is a reading of documents and of the
guard, scope and gate sources they describe; it measures nothing.

After this analysis was written, the harness principles gained a
[premise](../harness.principles.md#premise) and the principle
[An Executable Specification Is a Translation](../harness.principles.md#an-executable-specification-is-a-translation),
with the terms semantic specification, executable specification, translate
and interpretation defined in the [glossary](../glossary.md). They give the
two columns the three-class model below rests on: whether a specification is
semantic or a translation of one, and who authored each. A translation adds
an author of its own: a scenario a person approved, translated by an agent
into step definitions, is a person's requirement verified through an agent's
reading, and the scope review is the place to look for a translation that
satisfies the scenario with less than it means.

## What the system had

Four mechanisms, each with its own vocabulary, none described as one model:

| Mechanism | Who may change the file | Where it is enforced |
| --- | --- | --- |
| **Hard-denied** files: `ramify-agent.json`, tracked feature files | Nobody but the harness | [`guard/write-guard.ts`](../../subs/harness/src/guard/write-guard.ts) before the write |
| **Guarded** files: compiler and test-runner configuration, manifests, contract artifacts, scenario support files | The architect, by authorizing a hash pair with the assignment, before the edit | [`work/scope.ts`](../../subs/harness/src/work/scope.ts) captures them; the gate compares |
| **Write scope**: the module's contents plus named child subtrees and extra locations | The engineer, within a recorded assignment | The guard blocks; only a new assignment widens |
| **Frozen scenarios**: plan scenarios, whose authority is the plan's, and architect scenarios, whose authority is the person's review | Nobody; agents bind them late | Rendering by the harness plus hard denial |

Over all of that, the [harness principles](../harness.principles.md) reserve
structural and ownership changes for a person.

## What today added

1. **Trust Follows Provenance** in the harness principles: human-reviewed,
   derived from human-reviewed, agent-generated. Weight orders attention and
   never makes a required gate optional.
2. **The CheckFinding principles and Plan 12**: credibility in five levels,
   derived by a path-based classifier in the
   [contract appendix](../plans/12-check-findings/contract-appendix.md)
   (`**/*.principles.md`, the plan directory, a harness-written feature file
   and an approved requirement record are human-reviewed; any other path is
   agent-generated). Waive authority is scoped by module: the user for
   anything, the global architect for the project, the local architect for
   its own module. Required tests and scenarios cannot be waived.
3. **The [sealed-file edit analysis](2026-09-24-sealed-file-edit-hooks.md)**:
   a third protection class, *sealed*, where the engineer may edit with a
   justification that becomes a CheckFinding assessed by the local architect
   at reconciliation. It states that guarded and sealed are not synonyms,
   that the seal set needs a governing authority, and leaves membership
   undecided.
4. **The [Implementation Studio adoption analysis](2026-09-24-implementation-studio-adoption.md)**:
   Studio's hash-verified registry of active constraints is left uncovered;
   user-approved exceptions would need authority, scope, reason and
   revalidation recorded separately from check truth.
5. **The toolkit's [shared guidance sync plan](../../../docs/plans/shared-guidance-sync/main-plan.md)**:
   the owner authors, the consumer adopts a pinned snapshot; status (active,
   proposed, historical) and force (required, recommended) are explicit; a
   `.principles.md` suffix alone does not make a document bind a consumer.
6. **Plan 12's appendix**: the design review binds guidance file hashes and
   the scope review binds requirement hashes, per candidate.

## Where it is incoherent

### Two axes, four vocabularies, no map between them

"Who may change this file" is answered by denied, guarded, sealed and scope;
"how much to trust its content" is answered by provenance. Both are keyed by
path and describe the same files. The credibility classifier is a glob; the
guarded list is a hand-maintained array; the seal set is undecided; the
frozen scenarios are their own mechanism. Nothing states that a file only a
person may change is, by that fact, human-reviewed. That single connection is
missing, and it is what would make the rest coherent.

### Sealed edits and module-scoped waiving contradict each other

The seal analysis says that only the governing owner can approve a change
where the seal policy reserves that decision, and deliberately replaces
Studio's default of user review with local-architect assessment. Waive
authority is now module-scoped: a local architect can waive any subjective
CheckFinding in its module. A justified edit to a sealed file inside its
module becomes a CheckFinding that the architect can waive quietly, although
the seal exists because the file is above the module's authority. The seal's
governing authority has to constrain waiving, and nothing carries it into the
CheckFinding today.

### "Approved" is read as "reviewed"

Trust Follows Provenance counts the accepted analysis and its frozen scenarios
as what a person approved. Plan 10's review stop is one approval for the
whole analysis, and the same principle's premise is that a person does not
read all of it. Architect scenarios are therefore credited with a person's
review while being bulk-approved agent output. Either that is a convention to
state, or an architect scenario's credibility is really "derived", one level
lower.

### The obligation-change rule ignores provenance

The CheckFinding principles say that changing a test is a change to the
obligation, with its own authority. An engineer edits its own tests in scope
freely, and those tests are the least trusted artifacts the provenance
principle names. The rule over-protects agent-written tests once they are
promoted to a CheckFinding and does not protect them before. It should scale
with who holds the test: a frozen scenario is a person's; a delegation test
that passed against a fake and became the provider's obligation is the
consumer architect's; an engineer's own test is the engineer's.

### Required checks: "outside" against "inside but unwaivable"

The principles place required gates outside the CheckFinding system. Plan
12's iteration 6 promotes failed scenarios into it, flagged `required`. The
design works, but the two texts read as a contradiction. One sentence fixes
it: a required failure may be tracked as a signal but is never settled by one.

### Three hash-binding mechanisms for guidance

The design review captures guidance hashes per request; the shared-guidance
plan has a lock with hashes; the seal analysis proposes a baseline with
hashes and authority. Studio's constraint registry is listed as a gap while
all three are partial versions of it.

### Module READMEs are agent-generated authority

"A Module Carries Its Own Onboarding" makes the README the guidance a scoped
agent works from, and engineers write it in scope. Under provenance it is
agent-generated, but nothing marks it so, and a design reviewer has no reason
to distrust it. Documentation maintenance is a P3 item.

None of these is a defect in shipped code. The second and the fourth become
one when the sealed-edit plan or Plan 12's iteration 5 is implemented as
written.

## Recommendations, by return on cost

### One classification, used twice

Define three authority classes by who may change a file, and derive
provenance from the same class:

| Class | Who changes it | Provenance |
| --- | --- | --- |
| **Person-held**: principles, plans, frozen scenarios, the harness's configuration | A person, or the harness rendering what a person approved | human-reviewed |
| **Architect-held**: `module.ramify`, contract artifacts, guarded configuration, registry decisions | An architect, through a recorded assignment or authorization | derived |
| **Engineer-held**: module source, tests, README | The engineer, within scope | agent-generated |

One captured list per run, path, class and hash, replaces the glob
classifier, the guarded array and the seal set. Denied is "person-held and
not editable in this run"; sealed is "person-held or architect-held, editable
with a justification". The waive rule becomes one sentence: a CheckFinding is
waivable by an actor whose authority covers the class of every file it
concerns. This closes the first, second and sixth incoherences with less
machinery than today. It belongs in the harness principles beside Trust
Follows Provenance, before the sealed-edit plan is written.

### Scale the obligation rule

Changing a test is a decision by whoever holds it: a person for a scenario,
the consumer's architect for a delegation test, the engineer for its own. The
scope review already looks for test weakening; make that its job for
engineer-held tests, and stop treating those as obligations. This removes a
rule that would otherwise create CheckFindings nobody wants.

### State what approval means

Write the convention down: analysis approval counts as review of the frozen
scenarios. Do not build per-scenario review. If the trial shows architect
scenarios grounding bad signals, lower their provenance to "derived" then.

### Do not build a constraint registry

The captured authority list above, with the design review's guidance
selection, covers what Studio's registry did. Improve the selection heuristic
only when design-review yield shows it picking the wrong documents.

### Measure by credibility before adding rules

Plan 12's trial should report, per credibility level, how many signals were
fixed, waived or left unresolved. If signals grounded in agent-generated
material are mostly waived, the fix is a reviewer prompt change: ground in
human-reviewed material or do not report. It is the cheapest lever in the
system, and the one the ROI principle predicts.

### Consolidate the words

Denied, guarded, sealed, frozen, protected and reserved all appear in today's
documents. Three [glossary](../glossary.md) entries for the classes, and the
rest retired as documents are touched.

## Method and limits

This is a reading of the documents committed or amended on 2026-09-24
(`6da0086`, `23a84bb`, and `30be57a` on `feat/plan12-check-findings`) against
the existing guard, scope and gate sources named above. No run was executed
and no behavior was measured; the incoherences are contradictions between
texts and the behavior those texts specify, not observed failures.
