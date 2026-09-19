# Access analysis

Use this workflow after the target original is known.

1. Name the requesting module and source area. Keep ordinary `src/` and
   `src/tests/` separate. Confirm that the start step refreshed its API view in
   the same materialization as the architect view.
2. Search `src/.ramify/{external,children}` for ordinary source or
   `src/tests/.ramify/{external,children}` for testing source. Presence with its
   import spelling is the definitive evidence that the original is currently
   available. Do not combine ordinary and testing catalogs.
3. If the original is absent, check reported coverage before concluding it is
   unavailable. An incomplete catalog cannot prove denial.
4. For a complete negative view, derive the proposed exposure path from the
   original's owner to the requester: lowest common ancestor, each ancestor
   that must re-expose it, original ownership and tags, requester tags, and any
   ineffective declaration. Read the `module.ramify` files on that path.
5. State the current answer separately from a proposed architecture change.
   Present a proposal as exact declaration lines per affected module. A path
   that could be declared is not proof that it should be declared.
6. If certainty about a hypothetical change is requested, use a scratch
   worktree and `ramify check --batch`. Record the command, result, and any
   remaining limits; never edit the working project for this verification.

When no requesting module is named, report the target's role and exposure but
do not generalize that evidence into a complete list of eligible importers.
