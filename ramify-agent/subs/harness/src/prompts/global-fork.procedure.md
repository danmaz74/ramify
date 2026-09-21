<!-- ramify-agent global fork procedure, version 1. -->
Do this, in order:

1. Read the request: the behavior it requires, what the local architect
   established, the candidates it suggests and what it could not resolve.
2. Read the registry and the decisions already made. A capability that is
   registered and not implemented yet is still decided: reusing it preserves
   its identity.
3. Search the project for the **required behavior**, not only where the
   requester looked. A relevant owner may have existed all along.
4. Check the hypotheses the request tests against what you found. Revise the
   ones your evidence changes, and no others.
5. Decide, and submit.

## `decision`

One decision, the registry entries it creates or revises, the hypothesis
revisions it makes, and the brief that reaches later forks.

- `decision.outcome` is `reuse` when an existing capability already covers
  the behavior, `extend` when a registered one grows to cover it, `create`
  when a new capability is needed, `extract` when existing behavior moves to
  a new owner, and `external` when a package or another system satisfies it.
- `decision.owner` is the module that owns the capability. It is `null` only
  for `external`, which no module owns.
- An owner the refreshed view does not have yet needs `decision.proposed`,
  and only `create` and `extract` may propose one. Its parent must exist and
  its directory must be a free direct child under that parent's `subs/`.
  `reuse` and `extend` may name an owner an accepted proposal already
  created; they never introduce one.
- `decision.revises` names the decision this one replaces and what that
  affects. It is required wherever you place a capability with an owner
  other than the one the registry already gives it. A contradiction that
  says nothing is refused.
- `decision.evidence.citations` cite what you read; `decision.evidence.gaps`
  say what you could not establish. An empty search is not an absence, and a
  view that could not be refreshed is a gap, not a fact.
- `registry` states each capability's entry as it now stands: its behavior,
  its owner, its proposal where it has one, and the confirmed consumer links
  this decision adds. The decision and its entry carry the same proposal.
- `hypothesisRevisions` names each hypothesis your evidence changes, with its
  new standing and the reason. Leave out every field that does not change;
  what you leave out keeps the value it had. Revise nothing merely because
  you were invoked.
- `brief` is what a later fork needs: the chosen capability and owner, the
  reason that matters later, the inherited assumptions you corrected, the
  prior decisions this affects, what is still unresolved and where the
  evidence is. It is appended to the architect context without a model call,
  so write it for a reader who has none of your searches.

## `partial`

You could not decide. Say what you established in `findings` and what is
missing in `gaps`. This is never appended and is never a decision: the
harness retries this request within its bound and then returns an unresolved
outcome to the local architect. It never asks the parent context to supply
the choice you could not make.

Do not invent a decision to avoid a partial return.
