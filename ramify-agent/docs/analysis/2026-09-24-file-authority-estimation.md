# Estimating the authority of a file

**Date:** 2026-09-24. **Status:** proposed analysis for the first step of
representing source authority. The classification and registry below are
recommendations, not adopted principles or an implemented contract.

## Question and premise

How can ramify-agent make a practical estimate of a given file's authority?

The user's premise is that principles files are always reviewed by the main
human architect and carry very high authority. Accepted feature specifications
also carry substantial authority, especially their goals, although they change
more frequently. Other specifications, tests, code and explanations interpret
those sources; successive interpretations can move farther from the original
intent. A known human review is additional evidence worth retaining.

The proposal is a coarse estimate for a file within its stated purpose,
including how ramify-agent could capture and retain human review. It does not
attempt to score every sentence or determine whether an interpretation is
correct. Broader uses during implementation are a subsequent step.

## Existing basis

The harness principle [Trust Follows Provenance](../harness.principles.md#trust-follows-provenance)
already gives more weight to human-reviewed material and its direct
derivatives. [An Executable Specification Is a Translation](../harness.principles.md#an-executable-specification-is-a-translation)
explains why a test's interpretation does not replace the semantic
specification. The [CheckFinding principles](../check-findings.principles.md#credibility-follows-provenance)
apply provenance to the credibility of findings.

The [earlier authority analysis](2026-09-24-file-authority-and-provenance.md#one-classification-used-twice)
proposed deriving provenance from who may edit a file. This proposal takes a
different position: edit permission does not establish review or endorsement.
A protected file can contain unreviewed generated text, and an editable file
can have been reviewed carefully. Likewise, approval to proceed does not
establish that a person reviewed every artifact used by the run.

## Recommended estimate

Use four ordered levels, always accompanied by the reason for the estimate.
Use **unknown** separately when the available provenance is insufficient.

| Level | Basis | Typical example |
| --- | --- | --- |
| **Very high** | A governing principles document reviewed by the main human architect and active for this project | A recognized project principles file |
| **High** | An explicit human requirement or a document deliberately endorsed as authoritative for its purpose | An accepted feature specification or endorsed architectural decision |
| **Medium** | A direct interpretation of a very-high or high-authority source, without direct human endorsement | Scenarios derived from a feature specification; a plan directly interpreting its goals |
| **Low** | Further interpretation, or material known to have been generated independently without a stronger authority basis | Tests derived from agent-written scenarios; local implementation assumptions |

These are ordinal estimates, not probabilities or measured quality scores.
There is no evidence for a numerical decay factor such as losing a fixed
percentage of authority at each step. Initially, distinguishing a direct
interpretation from several interpretations is enough.

The examples describe provenance, not rules based on file extensions. Code
can have explicit human endorsement, and an agent can write a file named
`*.principles.md` that nobody has adopted. Known, active principles files can
be registered under the user's review convention; the filename alone cannot
establish that convention for a newly encountered file.

Authority remains specific to a purpose. A reviewed implementation does not
supersede the feature's goals. A contract may bind a provider through delegated
authority even when it remains an uncertain interpretation of those goals.
The estimate does not determine permissions, waive obligations or change gates.

## How to derive it

1. **Identify the file and exact content revision.** Find any recorded direct
   authority basis, review outcome and source references for those bytes.
2. **Apply a direct basis when one exists.** Recognized, reviewed principles
   receive very high authority. An accepted human requirement or deliberate
   endorsement receives high authority within its recorded purpose. Approval
   with reservations qualifies that authority as described below; consumers
   must retain the qualification. A review does not turn an ordinary file into
   a governing principles document.
3. **Otherwise follow the recorded derivation.** An interpretation directly
   based on a very-high or high-authority source receives medium authority.
   Further interpretations receive low authority. Known independent agent
   material without endorsement also receives low authority.
4. **Treat faithful copies separately.** Copying, moving or extracting unchanged
   text preserves its source provenance. Summarizing, adapting or translating
   it introduces interpretation. Local applicability still depends on the
   consuming project's adoption of the source.
5. **Return a reason and the state of the evidence.** Missing provenance is
   unknown. Broken references, cycles and dependencies on superseded revisions
   must be visible rather than producing an unexplained level.

For example:

> Medium — direct interpretation of the accepted export feature specification
> at revision X; no direct human endorsement recorded; source still current.

The system can resolve recorded references and count declared interpretation
steps. It cannot prove semantic fidelity from those references. A citation to
a principle must not promote unrelated content. The derivation record should
briefly state what was taken from the source and what interpretation was added.

With multiple sources, do not take the highest level of any cited document as
the authority of the entire file. Record the sources that materially establish
its purpose and requirements. If substantial parts have different authority
and a whole-file estimate would mislead, report mixed provenance and narrow
the assessed scope to an existing section. Fine-grained annotation of every
statement is unnecessary for this first step.

## Human review

The user proposed three choices: **skimmed**, **approved with reservations**
and **approved in full**. These express the extent of the person's endorsement.
They do not measure reading time or prove that the content is correct.

| User signal | Meaning | Effect on the estimate |
| --- | --- | --- |
| **Skimmed** | The person took a brief look; no endorsement is asserted | Retain the authority from other sources and record the limited human attention |
| **Approved with reservations** | The document is usable as the current direction, but the person is uncertain or lacks time to improve it | Supplies a qualified human endorsement; retain reservations wherever that authority is used |
| **Approved in full** | The person endorses the selected content for its stated purpose without expressing reservations | Supplies a direct high-authority basis for that scope and revision |

Approval with reservations is a useful completed human action. It need not
mean that implementation waits for another review. It also does not authorize
overriding a principle, reserved decision or required gate. If the person
states a blocking condition, that condition governs; the label cannot turn
"do not implement this section yet" into permission.

A reservation note is optional. Requiring a detailed explanation would defeat
the case where the person lacks time or cannot yet articulate the problem.
With no note, display **reservations unspecified**. The system must not invent
their meaning, treat the empty note as full approval or assume the reservations
are minor. A supplied note remains visible with the review.

For the same source and scope, approval with reservations provides stronger
human backing than skimming and weaker backing than full approval. Preserve
this distinction alongside the four authority levels, rather than inventing
a numeric score or another authority band. For example:

> High, qualified — feature specification approved with reservations by the
> user at revision X; reservations unspecified.

An unqualified high-authority badge would lose the distinction. A skimmed
principles document can still have very high authority from its established
governing basis; this new review signal alone does not revoke that basis.
Full approval of an implementation document does not make it a principle.

Record who reviewed which content revision, for what purpose and with what
outcome. Scope and action remain important:

| Recorded event | Meaning |
| --- | --- |
| Approval of the goals section only | Endorsement applies to those goals, not the document's implementation suggestions |
| Review that explicitly rejects the document or requests changes before use | Preserve that outcome; it is not approval with reservations |
| Approval to start or continue a run | Authorization to proceed; does not by itself establish content review |
| No review recorded | No direct review basis is available; does not assert that nobody reviewed it |

Review is optional. Capture the fact when it is known, without adding a review
stop merely to fill metadata. Human authorship or an explicit requirement can
also establish authority without a separate review ceremony.

## Capturing the signal in ramify-agent

Offer the three actions beside a document when the user inspects it in
ramify-agent, including documents presented for existing plan or analysis
decisions. Default to no selection. Each action records its meaning directly;
the user need not complete the earlier levels before choosing a later one.
An optional note is available, particularly for reservations. The normal
interaction is one action, with additional detail only when wanted.

The default subject is the displayed document. A user can narrow the subject
to a section such as goals. The interface identifies that scope and shows the
saved signal afterwards, with an option to correct or withdraw it. A general
run approval remains a separate action unless its wording explicitly includes
document endorsement and identifies the documents covered.

An explicit conversational declaration can use the same recording path when
the document, revision and meaning are clear. An ambiguous "looks good" must
not silently approve every open document. The structured action is the
unambiguous initial path; automatic interpretation of conversation can wait.

The harness records the exact snapshot the user saw. If the file changes
before the action is saved, the signal still refers to the displayed snapshot
and the current file is shown as changed since review. An approval must never
attach silently to unseen replacement content. Merely viewing the document,
elapsed time and scrolling do not generate a review declaration.

A review belongs to a revision. After an edit, preserve the old review and
show that the current file differs. Recompute the current estimate from any
remaining valid basis; otherwise report that its authority is unknown pending
reassessment. Do not silently extend endorsement to new text or erase the
historical review. An unchanged, precisely identified reviewed section can
retain its evidence when another section changes.

## Minimal record

Keep one small project registry of provenance facts. Add records for material
documents as they are created or encountered; do not require an initial
inventory of every source file. The estimate is derived, rather than being
an unrestricted label an agent assigns itself.

Each record needs a file reference and content hash, its purpose, any direct
authority basis, its material source references and any human review record.
A source relation distinguishes faithful copying from interpretation.

This is an illustrative record, not a proposed configuration API:

```yaml
file: docs/features/export/scenarios.md
revision: <content hash>
purpose: acceptance scenarios for the export feature
authority_basis: null
derived_from:
  - file: docs/features/export/spec.md
    revision: <source content hash>
    relation: interpretation
    rationale: translate the feature goals into acceptance examples
human_reviews: []
```

The referenced specification's record supplies its accepted-requirement basis.
The scenarios therefore receive medium authority. Full approval of those
scenarios as the intended acceptance behavior supplies a direct high-authority
basis for that revision and purpose. Approval with reservations supplies that
basis with its qualification preserved.

Store each human signal as a durable record containing:

- the project, file, captured content hash and whole-document or section scope;
- the human actor, time and originating user action;
- `skimmed`, `approved-with-reservations` or `approved-in-full`;
- the document's purpose and any optional reservation note;
- the earlier record it explicitly replaces or withdraws, when applicable.

The captured content must remain retrievable, not just its hash. Repeating
delivery of the same user action must not create duplicate reviews. Corrections
and withdrawals preserve history; a later qualification can replace a person's
earlier full approval. Do not compute the current view by taking the strongest
label ever recorded, or let a different person's skim erase an endorsement.

These records belong to project history and must survive individual runs.
The small registry is the queryable view of those facts. The harness is the
writer; the UI submits the user's action and displays the resulting record.
The authority estimator reads both the source basis and the applicable human
signal. Agent inputs must carry the qualification and note along with the
authority level, so a qualified approval cannot become full approval through
a simplified projection. This is a proposed integration, not an existing API.

Initial authority declarations come from the project owner; known human
review events come from the human action that established them. Agents can
propose derivation links and explain them, but cannot establish that a human
review occurred merely by writing it into a document. The storage and write
contracts require a later implementation design.

## Revision and applicability

Authority does not decay with age. An authorized new feature specification
supersedes an earlier revision; elapsed time alone changes nothing. Principles
may change less often, but that affects refresh frequency rather than the
meaning of their authority.

Keep the level separate from whether its basis is current. A derivative of an
old specification retains its historical provenance, but a changed source
means its applicability to current work needs reassessment. A new draft does
not supersede an accepted specification merely because it is newer.

An authoritative file may be irrelevant to a particular task. That relevance
assessment belongs to the agent applying it, not to the file's authority
level. Similarly, the estimate does not establish the factual correctness of
the file or the confidence of a finding grounded in it.

## Limits and next decision

Whole-file classification loses detail, recorded derivations can be mistaken,
and unknown provenance will be common initially. The explanation and source
references are therefore part of the result, not optional presentation.

The proposed first integration combines the four authority levels with the
three optional human signals, explicit missing evidence and revision-specific
records. Broader implementation uses, changes to finding credibility, exact
storage placement and executable contracts are subsequent design work.

This analysis records the user's premises and the proposed estimation method
against the current documents linked above. It does not establish runtime
behavior or measured benefits. No implementation or executable acceptance was
performed for this proposal.
