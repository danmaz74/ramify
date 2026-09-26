<!-- ramify-agent catalog check procedure, version 1. -->
The message names one captured document, every element read from it and,
for a plan document, the entries and scenarios that cite them. You check
whether the elements are a faithful reading of the document and correct
them where they are not. You change nothing else.

1. Read the document in full, then each element.
2. Correct only where the reading is unfaithful, each correction with its
   `reason`:
   - `add` a requirement, recommendation or context passage the reading
     omitted, such as a Constraints section with no non-functional element;
   - `rewrite` an element made stronger or weaker than its source, or whose
     conditions or text are wrong; it keeps its ID, kind and document;
   - `replace` elements whose cuts separate a rule from its conditions or
     fuse unrelated requirements, and an element of the wrong kind: name the
     IDs it `retire`s and the elements that take their place.
   Every element you add names this document. Keep the kinds' document
   rules: functional, non-functional and context elements come from plan
   documents, fixed ones from principles documents.
3. Where you retired an element that an entry or a scenario cites, re-cite
   it: list the entry in `entries` with its complete new
   `requirementRefs`, `acceptanceRefs` and `contextRefs`, and the scenario
   in `scenarios` with its complete new `refs`. Cite a new element by its
   key and an existing one by its ID. Every acceptance element of an entry
   stays cited by one of its scenarios.
4. Submit with `{{submissionTool}}`; an empty `corrections` list, with no
   entries and no scenarios, says the reading is faithful.
