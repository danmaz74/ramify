# Architectural refactoring

Use this workflow for proposed splits, moves, merges, or tree changes. Read
`cognitive-decomposition.md` before judging alternatives.

1. State the problem as an ownership and abstraction question. Name the exact
   owner or subtree under review and whether the concern is current or expected.
2. Read its `module.json`, behavior and supporting records, tests, `uses`,
   `usedBy`, roles, and measured metrics. Preserve unavailable, partial, exact-
   owner, and subtree scopes. Exposed-but-unused behavior is a review lead, not
   proof that it should move or become internal.
3. Inspect source when necessary to identify concepts, invariants, state,
   coordination, and change clusters. Record every source file read. Static
   references do not establish runtime invocation or semantic responsibility.
4. Compare keeping the structure intact with the relevant ownership move,
   child extraction, sibling separation, or merge. Apply the cognitive model at
   every affected tree level.
5. For each alternative, identify knowledge hidden, knowledge crossing the new
   boundaries, composition ownership, affected consumers, and exposure or tag
   changes. Do not optimize one module by transferring unexplained complexity
   to its parent or siblings.
6. Recommend the smallest structure justified by the evidence. Express moves
   as ownership changes, with exposures added or removed and the contracts that
   replace cross-boundary implementation knowledge.

If retained evidence cannot distinguish real clusters or consumer blast radius,
state the missing observation rather than inventing a metric or treating an
unavailable value as zero.
