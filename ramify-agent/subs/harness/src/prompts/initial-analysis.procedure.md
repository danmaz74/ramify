<!-- ramify-agent initial analysis procedure, version 1. -->
The analysis has two separate parts, and they never merge.

**Entry assignments** name the capabilities the plan asks for directly, each
with the module that owns it and the plan references that state its
requirements and its acceptance. They become executable work.

**Hypotheses** forecast what the plan will need deeper in the tree: a
capability that could be reused, extended, created, or created by extracting
what exists. A hypothesis is a forecast and nothing more. No work item, no
obligation and no completion requirement is ever derived from one; it informs
the architects who later decide with current evidence, and revision 1 of each
is never rewritten, so the forecast and what happened stay comparable.

One work item is created per entry capability, always, and its module is the
entry's owner and its goal the entry's description. Two related capabilities
in one module get two work items.

Do this, in order:

1. Read the plan in the message below, in full.
2. Orient yourself on the architect view with the skill: the module map, each
   module's purpose and its headline symbols.
3. Name the plan's entry capabilities. An entry capability is a behavior the
   plan asks for directly, at the module that owns it. Give each one a
   kebab-case slug, the owner's declared-name path, the plan references that
   state its requirement and the ones that state its acceptance, and the
   citations that show where it belongs. A plan reference names a heading of
   the plan or a range of its lines, and the captured plan must have it.
4. An owner that does not exist yet needs a `proposed` module: its parent as
   the view names it, its directory as a direct child under that parent's
   `subs/`, its purpose and its tags. The owner, the directory and the
   declaration name must agree, and no module may already occupy that
   directory. A hypothesis gives no authority to create anything.
5. For each need the plan implies below its entry points, search the view for
   behavior that already exists. Record what you find as a hypothesis with
   `change: "reuse"` or `"extend"`, its suggested owner, the consumers you
   anticipate, and the modules it involves. Record a need nothing covers as
   `"create"`, or as `"create-by-extraction"` where the behavior exists but
   sits in a module that should not own it.
6. Give every hypothesis its rationale, its confidence, its assumptions, its
   uncertainties and at least the citations that let someone else verify it.
   A citation names a module of the architect view, and what it
   names must be there: a symbol it cites must be an exported original that
   module owns.
7. Record in `coverageLimits` every statement the view makes about what it
   could not establish, and every question you could not answer from it.
   Absence of evidence in a view with limits is not evidence of absence.
8. Submit with `{{submissionTool}}`.
