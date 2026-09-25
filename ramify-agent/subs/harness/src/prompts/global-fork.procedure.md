<!-- ramify-agent global fork procedure, version 2. -->
For a placement request, do this, in order:

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
  the behavior, `create` when a new capability is needed, `extract` when
  existing behavior moves to a new owner, and `external` when a package or
  another system satisfies it.
- An extension is a `create`. Never revise a registered capability's behavior
  to cover more: name the extended behavior for itself, such as
  `send-email-with-attachment` beside `send-email`, register it as a new
  capability, and give it the module that already holds the behavior as its
  owner. The two capabilities may end at the same symbol, and no relation
  between them is recorded.
- `decision.changesExistingSymbols` is true when implementing this capability
  will change symbols that already have consumers. Say so: it is what break
  analysis reads, and what lets the contract engineer read those consumers.
  Only a module the refreshed view already has can be true here, so a
  capability whose owner you propose, and an `external` one, are false.
- `decision.owner` is the module that owns the capability. It is `null` only
  for `external`, which no module owns.
- An owner the refreshed view does not have yet needs `decision.proposed`,
  and only `create` and `extract` may propose one. Its parent must exist and
  its directory must be a free direct child under that parent's `subs/`.
  `reuse` may name an owner an accepted proposal already created; it never
  introduces one.
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

A file outside every module's own contents, such as a project script,
belongs to no module, and no placement moves it. Where a request asks where
such a file belongs, decide the capability in question as usual — often
`reuse` with the owner the registry already gives it — and say in `brief`
that the requester changes the file itself as an `outside-modules` location
of its assignment. That question alone is no reason for `partial`.

## `partial`

You could not decide. Say what you established in `findings` and what is
missing in `gaps`. This is never appended and is never a decision: the
harness retries this request within its bound and then returns an unresolved
outcome to the local architect. It never asks the parent context to supply
the choice you could not make.

Do not invent a decision to avoid a partial return.

## An unresolved request

A local architect answered that its request cannot be met as stated. The
message gives its conflict and evidence, the plan with its line numbers, and
the deviations already recorded. Do this, in order:

1. Read the conflict and verify its evidence. A conflict you cannot confirm is
   not a reason to depart from the plan.
2. Decide whether it is a placement question after all: the behavior belongs
   to another owner, or exists already. Then answer `decision`, as for a
   placement request. Nothing of the plan changes.
3. Otherwise, find the smallest departure that makes the rest of the plan
   achievable. **Keep as much of each requirement as the conflict allows;
   drop no more than the conflict requires.** A requirement that fails in
   one clause keeps its other clauses. Answer `deviation`.
4. Answer `nothing-possible` only when no deviation leaves anything of the
   plan worth doing. The run ends there.

### `deviation`

A plan deviation amends the plan for the rest of this run. The plan file is
never changed; the deviation is recorded beside it, local architects receive
it with the requirement it changes, and reviews judge the work against the
plan as it amends it. The person reviews it afterwards and may reject it. It
holds no work item and no gate, and the work item that asked goes on under
it.

- `deviation.requirements` are the requirements as written that you depart
  from, as line ranges of the plan in the message. Cite exactly the lines
  you change, not their section.
- `deviation.instead` is what the run does instead: the part of each
  requirement it still meets, and the replacement for the part it cannot.
- `deviation.why` is why the requirement cannot be met as written, on the
  evidence you verified.
- `deviation.rejected` names each alternative you considered, such as
  another owner, a staged break or a smaller departure, and why it does not
  work. Name at least one.
- `deviation.loss` is what the person loses compared with the plan as
  written, stated so they can decide whether to accept it.
- `deviation.workItems` names the other work items whose work it changes;
  the one that asked is always included.
- `deviation.scenarios` rewords a scenario the conflict makes impossible to
  state: the scenario's ID and its new `Scenario:` block without tags. The
  harness renders the feature file from it. Only a pending scenario can be
  reworded; leave a scenario that is bound, declared or implemented as it is.

A run records a bounded number of deviations. Past that number a deviation
is still recorded, and the run waits for the person to accept or reject it
before it goes on. Many deviations say the plan is wrong: prefer
`nothing-possible` to a deviation that leaves the plan's purpose behind.

### `nothing-possible`

Say in `reason` why no deviation leaves anything of the plan worth doing,
and list what you verified in `evidence`. Do not use it for a conflict a
deviation could answer.

### `partial`

As for a placement request: what you established and what is missing. The
harness retries within its bound; exhaustion ends the run.
