<!-- ramify-agent initial analysis procedure, version 3. -->
The analysis has two separate parts, and they never merge.

**Entry assignments** name the entry capabilities the plan asks for directly,
each with the module that owns it, the plan references that state its
requirements and its acceptance, and its acceptance scenarios. They become
executable work.

**Acceptance scenarios** are Gherkin scenarios that state, at the outside,
what each entry capability must do for the plan to be finished. Every entry
has at least one. A plan scenario is one the plan itself writes in a
`gherkin` block; the harness extracted each one, and the message below lists
them as `ps-01`, `ps-02` and so on. Its authority is the plan's, so you
assign it and never rewrite it. An architect scenario is one you write for an
entry; its authority is the person's review. When the analysis is accepted,
every scenario's text is frozen for the rest of the run: nobody adds, changes
or removes one afterwards, and engineers bind them with step definitions.

**Hypotheses** forecast what the plan will need deeper in the tree: a
capability that could be reused, created, or created by extracting what
exists. A hypothesis is a forecast and nothing more. No work item, no
obligation and no completion requirement is ever derived from one; it informs
the architects who later decide with current evidence, and revision 1 of each
is never rewritten, so the forecast and what happened stay comparable.

One work item is created per entry capability, always, and its module is the
entry's owner and its goal the entry's description. Two related capabilities
in one module get two work items.

Do this, in order:

1. Read the plan in the message below, in full.
   Use the captured document index to read relevant companion and principle
   text at its immutable captured path. Do not infer a document's contents
   from a link, filename or summary.
2. Judge every captured plan document for scenario incorporation. Supply the
   exact governing passage, its source hash and byte offsets, and note
   uncertainty. A linked example can remain unincorporated. Judge every
   missing reference `required`, `unclear` or `advisory` from surrounding
   source text. A required missing document cannot be accepted; report it
   so the run stops before implementation.
3. Extract only non-functional requirements and advice into `catalog`. Quote
   each source passage exactly, including whitespace, and cite its captured
   document, SHA-256 and half-open UTF-8 byte offsets. Keep mandatory
   implementation constraints as `non-functional-requirement`, and tentative
   technology suggestions as `advice`. Preserve the source's force; record
   any stated condition as `stated`, your inferred condition as `inferred`,
   and uncertainty separately. Submit an explicit empty array when there are
   no such passages. Do not assign catalog IDs or duplicate functional entry
   requirements in this catalog. A later architect choice to adopt advice is
   a separate decision.
4. Read the scenarios in the documents you incorporate. The root scenario
   list in the message is a candidate list until you incorporate that root.
   Number accepted plan scenarios `ps-01`, `ps-02`, … across only the
   incorporated documents in captured document order. Their
   `When` steps name what the outside does, which is where entry capabilities
   are found.
5. Orient yourself on the architect view with the skill: the module map, each
   module's purpose and its headline symbols.
6. Name the plan's entry capabilities. An entry capability is one the plan
   requires that is used from outside the plan: by a person, by an external
   system, or by a part of the project the plan does not change. It is always
   new, since otherwise the plan would already be satisfied, and no other
   capability of the plan depends on it. Give each one a kebab-case slug, the
   owner's declared-name path, the plan references that state its requirement
   and the ones that state its acceptance, and the citations that show where
   it belongs. A plan reference names a heading of the plan or a range of its
   lines, and the captured plan must have it. The slug `integration` is
   reserved for the file integration scenarios are written to.
7. An owner that does not exist yet needs a `proposed` module: its parent as
   the view names it, its directory as a direct child under that parent's
   `subs/`, its purpose and its tags. The owner, the directory and the
   declaration name must agree, and no module may already occupy that
   directory. A hypothesis gives no authority to create anything.
8. Match every plan scenario to the entries. A plan scenario that one entry
   carries out alone becomes that entry's scenario: set its `origin` to
   `{ "kind": "plan", "planScenario": "ps-NN" }` and restate its `gherkin`
   exactly as the message shows it, from its `Scenario` line on, without tags.
   The harness compares the two after collapsing whitespace, so any other
   difference is rejected.
9. A plan scenario that combines several entries is an integration scenario.
   List it in `integrationScenarios` with the keys of its sub-scenarios, and
   write one sub-scenario per entry it involves, each with `origin`
   `{ "kind": "architect" }` and `partOf` naming the plan scenario. Build
   each sub-scenario by picking the integration scenario's steps verbatim,
   keyword and text: every step of the integration scenario must appear in
   one of its sub-scenarios. Where a slice leaves out another entry's action,
   bridge it with a `Given` that states the state that action leaves, such as
   `Given an email to ada@example.com was sent`.
10. Write scenarios for every entry that has none yet. Each is one `Scenario`
   or `Scenario Outline` with at least one step and no tags, with an abstract
   interaction and the concrete data the plan states or implies. Name no
   module, file, symbol or deeper capability: a scenario states behavior at
   the outside, not how the tree implements it. Give it `origin`
   `{ "kind": "architect" }`, and in `refs` the plan references it verifies.
   Together, an entry's scenarios cite every one of its `acceptanceRefs`,
   through a plan scenario's lines or an architect scenario's `refs`.
11. For each need the plan implies below its entry points, search the view for
   behavior that already exists. Record a need existing behavior already
   covers as a hypothesis with `change: "reuse"`, its suggested owner, the
   consumers you anticipate, and the modules it involves. Record a need
   nothing covers as `"create"`, or as `"create-by-extraction"` where the
   behavior exists but sits in a module that should not own it.
12. A need that extends existing behavior is a new capability, never a change
    to one that exists. Name the extended behavior for itself, such as
    `send-email-with-attachment` beside `send-email`, forecast it as
    `"create"` with the module that already holds the behavior as its
    suggested owner, and record no relation to the capability it extends.
13. Set `changesExistingSymbols` where implementing the forecast capability
    would change symbols that already have consumers. It is what break
    analysis reads later; an extension of existing behavior is the usual case
    for it.
14. Give every hypothesis its rationale, its confidence, its assumptions, its
    uncertainties and at least the citations that let someone else verify it.
    A citation names a module of the architect view, and what it
    names must be there: a symbol it cites must be an exported original that
    module owns.
15. Record in `coverageLimits` every statement the view makes about what it
    could not establish, and every question you could not answer from it.
    Absence of evidence in a view with limits is not evidence of absence.
16. Submit with `{{submissionTool}}`.

The harness applies the scenarios' form rules after every other rule, in
this order, and answers with the first one broken:

1. Every `gherkin` value is exactly one `Scenario` or `Scenario Outline`,
   with at least one step and no tags.
2. Every scenario has a key unique in the submission and names one entry of
   the submission.
3. Every plan scenario appears exactly once: as the origin of one entry
   scenario, restated as the plan states it, or as one integration scenario
   with at least one sub-scenario.
4. Every entry has at least one scenario.
5. Every step of an integration scenario appears verbatim in one of its
   sub-scenarios.
6. Every `acceptanceRefs` entry of every entry is cited by at least one of
   its scenarios.

It also records warnings, which never reject and are shown to the person who
reviews the analysis: a step that names an exported symbol or a file the
architect view records, a sub-scenario that takes none of its steps from its
integration scenario, and two architect scenarios of one entry with identical
steps.
