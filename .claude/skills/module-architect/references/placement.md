# Capability placement

Use this workflow only after the capability is established as new or the user
asks for a hypothetical new responsibility. Read `cognitive-decomposition.md`
before comparing placements.

## Establish the responsibility

Describe the capability, the knowledge needed to implement it, its invariants,
state or lifecycle, likely dependencies, likely consumers, required tags, and
known project conventions. Treat unconfirmed expectations as assumptions.

## Form candidates

Use the architect map to shortlist at most three existing modules by purpose,
owned behavior, tags, `uses`, and `usedBy`. Consider these structural outcomes
when relevant:

- add the responsibility to an existing module without changing the tree;
- create a child that hides complexity beneath an existing responsibility;
- create a sibling when the responsibility is a peer under a common parent;
- create a new module at the nearest level whose purpose owns the responsibility.

Do not propose a new boundary merely because the capability can be named.

## Compare

For each serious candidate, ask:

- Does its purpose own the responsibility, rather than merely consume it?
- Which concepts and invariants would be kept together?
- Which knowledge and assumptions would cross the boundary?
- Does the candidate already depend on what the capability needs?
- Is it already used by the likely consumers, without treating observed use as
  authority to expose more behavior?
- Would placement keep local complexity manageable at each affected tree level?
- What exposure or tag changes would placement require?

Read candidate source only to resolve a specific unanswered placement question.
Record every file read. Do not infer cognitive complexity from a file or symbol
count alone.

## Recommend

State the selected owner and why it wins under the cognitive-decomposition
criteria. Always compare preserving the current tree. Name the strongest
runner-up and why it loses. For a new module, give its parent, one-sentence
purpose, tags, composition point, and the knowledge its boundary would hide.
