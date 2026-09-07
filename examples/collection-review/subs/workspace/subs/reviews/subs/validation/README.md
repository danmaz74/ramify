# Review Validation

Review Validation decides whether a revision chain is sound. Given a chain it
returns findings, including the one for a predecessor reference that resolves to
no revision. It is deterministic and depends on nothing but the neutral
vocabulary.

It sits outside the review runtime's subtree deliberately. It reaches the
runtime through their common parent, and nothing owned by the runtime or its
children is visible to it, so it can import neither their behaviour nor their
types.
