# The plan context catalog: purpose and fidelity

**Date:** 2026-09-26. **Status:** design statement, decided by Dan. It binds
the catalog that [Plan 13](../plans/13-plan-evidence-and-nonfunctional-work/main-plan.md)
implemented for non-functional requirements, the excerpt contract that
commit `0109c84c` revised, and the element catalog that
[Plan 14](../plans/14-unified-evidence-packages/main-plan.md) proposes.
Where those documents ask for more exactness than this one allows, this
document wins.

## Why the catalog exists

The catalog was created to deliver the relevant context to each agent in an efficient way. It is the bounded view of the plan that an agent works from,
in the sense of the
[bounded context principle](../harness.principles.md#bounded-context-is-what-makes-agents-efficient):
an agent that receives its elements has what it needs and never has to read
the original documents. Each element is one requirement, or one passage
of plan context, as its source states it, with a stable run-local ID, its text, its classification, its
stated and inferred conditions and the extracting agent's uncertainty.
Assignments, reviews and assessments cite elements by ID, and every
downstream prompt receives the cited elements in full and unchanged.

The unit is a requirement, not a sentence. An element is as long as its
source needs to state one requirement so that it can be understood,
selected and honored on its own: a bullet, a paragraph, a table with its
heading, or a whole section with its example and the qualifications that
bound it. The interpretation of an exposure statement in the
module-description principles, some 1,400 characters with an example and
four qualifications, is one element; cut shorter it would be a rule without
the conditions that make it true. A Constraints list of five unrelated
bullets is five elements, because each is selected and assessed apart from
the others. Extraction places the cuts so that no element needs another to
be read correctly, and a long element is the ordinary case, not an
exception.

## Five kinds of element

The catalog holds every requirement that is relevant to the plan, of three
kinds, and two kinds that are not requirements:

- **A functional requirement** comes from the plan. It states what the plan
  delivers, including the plan's acceptance statements. Work is organized
  around these: each entry capability cites the functional elements that
  state its requirement and its acceptance, and its scenarios verify them.
- **A non-functional requirement of the plan** comes from the plan's own
  constraints: size limits, determinism, tests kept in step with changed
  text, what the candidate must not change, and the like. It constrains how
  the functional work is done and is assessed against the final candidate.
  A statement that only says what the plan does not deliver is no element.
- **A fixed requirement** comes from a principles document. It is a rule
  every plan of the project must adhere to, and it enters the catalog only
  where it bears on this plan. In the catalog it is a non-functional
  requirement like the plan's own, distinguished by its source.

- **A recommendation** comes from the plan or from a principles document
  and suggests without obliging: a preferred technique, a library to
  consider, a pattern the project favors, a warning about a known trap. It
  is selected into a package when it is relevant to the work, like a
  non-functional requirement, and it is rendered apart from the
  requirements under its own label, so that no reader mistakes it for
  something the candidate must satisfy. Nothing assesses a recommendation.
  An architect that adopts one turns it into a constraint of its own
  assignment, and that constraint carries the architect's authority, not
  the source's; an engineer that departs from one says so in its result
  and owes nothing more.

- **Context** comes from the plan and explains the situation the plan
  starts from or why it exists, such as what a reader gets today. An
  element is one whole explanation. Each entry capability cites the context
  a reader needs to understand it, and that context travels with the entry's
  functional requirements, rendered first under its own label. Nothing
  assesses context and no deviation amends it. The reasoning of a principles
  document is not context: its rules are what a plan keeps.

Plan 13 called recommendations advice. The name changes because advice
reads as a quality of the text, while a recommendation is one element that
can be cited, selected and declined.

Work proceeds in that order: the functional requirements first, through
work items, then the non-functional requirements, through assessment of the
candidate they produced. Recommendations accompany both and gate neither;
context accompanies the functional work and gates nothing.

## How much fidelity it promises

The catalog maintains as much fidelity to the source as the LLM and agent
technology allows, and not more.

Extraction is a reading. An agent decides which requirements the sources
state, where one ends and the next begins, what class each belongs to and
what conditions apply. None of that is exact, and asking the agent to make it
exact makes the reading worse: a validator the agent can fail by a byte
selects for the smallest submission that passes, such as a title line quoted
in place of a passage, or an empty catalog in place of a Constraints
section. The trial of 2026-09-26 showed both. A comparison against the
source bytes also measures the wrong thing: a verbatim quote with the wrong
class passes it, and a faithful paraphrase fails it.

So the catalog records the agent's reading, and the harness does not grade
it against the source:

- The text of an element is as close to the source wording as the agent
  found practical. It carries no byte offsets, no span and no hash of its
  own, and the harness never compares it with the captured bytes.
- An element names the captured document it was read from and may carry a
  locator written for a person, such as a heading name. A locator is never
  resolved by the harness and never gates anything.
- Faithfulness is judged by a reader, as the
  [free-text judgment principle](../harness.principles.md#free-text-judgment-requires-an-agent-or-llm)
  requires: an agent given that one task when the catalog is submitted, and
  the person at the review stop, where the accepted analysis gains the
  weight that
  [provenance](../harness.principles.md#trust-follows-provenance) gives it.
- Nothing tracks changes to the source documents during a run. The plan is
  captured once and nobody edits it. A plan deviation is a run artifact with
  its own authority, recorded beside the catalog and never written into it.
  Whether a principles document changed is a question for the next run.

## What stays exact

Exactness belongs to facts about bytes that the harness produces and
compares itself, never to a reading:

- The captured documents' identities, one hash per document, taken at
  capture.
- Element IDs, assigned by the harness on acceptance, and the frozen
  catalog: no element is added, rewritten or removed after acceptance.
- Delivery: the rendering of an element is a pure function of the catalog
  and an ID, so every consumer receives the same bytes for the same ID.
- Validity: an assignment that cites an ID the catalog does not hold is
  rejected on acceptance, with the path of the bad citation. That is the
  one validator this catalog needs.

## How a non-functional package is generated, and when

A package is the rendering of a set of elements chosen from the catalog for
one consumer. Its functional part is fixed: the functional and context
elements the work item's entry cites. Its non-functional part is always a selection. When a
functional requirement is implemented, some non-functional requirements
bear on it and most do not, and which ones is a judgement about this work
in this module. These rules govern that judgement:

- **The selection is made by a fork of the warmed-up local architect.** After
  the local architect has oriented on its work item and read its module, a
  read-only fork of that session reads the catalog's non-functional
  requirements and recommendations and selects the relevant ones, each with its reason,
  its conditions and its uncertainty. The fork sees what the parent read
  and discards what it read itself, so the parent pays only for the
  package. A fresh selector started from the recorded orientation is the
  degraded fallback when the fork point is lost.
- **It selects over elements, never over documents.** The selector reads
  element text with IDs and answers with IDs. It may open a captured
  document to settle a doubt, but nothing it says is resolved by the
  harness, and no locator, heading or line range passes through it.
- **It is made once per work item, before the first assignment.** The
  package is rendered once into the local architect's session and cited by
  its ID afterwards; a continued turn never repeats its body. The one event
  that repeats the selection is a placement decision that adds an owner to
  the work item, since the relevant fixed requirements may change with the
  module; the new package supersedes the old for later assignments.
- **An assignment cites a subset.** The local architect names, by ID, the
  elements of the work-item package that one iteration must honor. The
  engineer, the contract engineer and the scope reviewer of that iteration
  receive exactly that subset, rendered by the same function, and a
  contract iteration inherits its requester's subset.
- **Assessment is not selected.** When the functional work is done, the
  non-functional coordinator receives every non-functional element of the
  catalog, from the plan and from principles alike, and assesses each
  against the candidate. Selection is about what an engineer must keep in
  view while working; assessment is about what the plan must satisfy. A
  repair engineer receives the subset the coordinator cites.
- **The rendering is one function.** Every package, for whichever consumer,
  is produced by the same package creator from the frozen catalog and a
  list of IDs, with the run's plan deviations rendered after the elements
  they amend. There is no second route by which source text reaches a
  prompt.

## What a consumer may rely on

A consumer receives every element its scope cites, whole, and never a
locator to resolve or a summary in place of the text. An element that
cannot be delivered is a visible gap in the consumer's brief, never a
skipped step and never a clean result. Because the catalog is the bounded
view, a consumer that finds the elements insufficient records that as a gap
or asks through the run's ordinary channels; it does not go back to the
source documents to complete the reading on its own.

## Open

Fixed requirements are extracted from the captured principles documents
into the catalog before any work item starts, one document per bounded
turn. Whether that extraction is guided by the plan's goal, so that only
requirements bearing on this plan become elements, or extracts every rule of
a document once and is cached by the document's hash across runs, is not
yet decided. Plan 14 records the choice.
