# Iteration 8: Global architect decisions

**Goal:** resolve capability identity and placement in sequential forks of one
long-lived architect context, commit each decision with its registry and
hypothesis revisions, append a concise brief without a parent model call, and
recover from every interruption in that chain.

## Prerequisites

Iterations 5, 6 and 7: work items, local architects, assignments and the write
guard. Iteration 3's session modes and `appendContext`, as iteration 0 settled
them.

## Write scope

`subs/harness/src/architecture/`, `subs/harness/src/work/` (the
`request-placement` path and decision delivery), `subs/harness/src/prompts/`.

## Interfaces consumed and established

Consumed: `Hypothesis`, `RegistryEntry`, `Invocation`, `appendContext`, the
fork session mode, `RamifyCli.materialize`, `ViewIdentity`.

Established: `PlacementRequest`, `PlacementDecision`, the `GlobalContext`
projection, the `ForkSubmission` union, the `LocalArchitectSubmission` member
`request-placement`, and the run-log events `placement-requested`,
`view-refreshed`, `fork-returned-partial`, `decision-accepted`,
`brief-appended`, `global-context-rebuilt` and `decision-delivered`.

## Work

### The long-lived parent

The initial analysis session becomes the run's architect context. It is never
invoked for a decision. Briefs are appended to it without inference; any
reorientation or compaction happens under the next requested fork, and is
recorded against that fork. The parent has no per-invocation context policy;
that is this plan's resolution of the proposal's `Record<Role, ...>` gap.

### One request at a time

The harness pauses implementation writes and lets active tools settle, then
refreshes the architect view and records its revision and input identity with
the request. It forks the parent's latest point and gives the fork the focused
request, the current record references and the registry. The fork investigates
and decides; the parent does not reassess or approve.

The request carries what the architecture's brief table lists: the decision
needed, the required behavior, relevant findings with citations, candidates and
uncertainty, and the hypotheses being tested with the stance on each. The local
architect explains intent and local discoveries; it does not reproduce the view.

### The decision

`ForkSubmission.decision` commits, in one `decision-accepted` event, the
`PlacementDecision`, the `RegistryEntry` revisions it creates and the
`Hypothesis` revisions it makes. `outcome` is `reuse`, `extend`, `create`,
`extract` or `external`; `owner` is null only for `external`. An existing owner
is validated against the refreshed view. `create` or `extract` may instead
carry a `ModuleProposal` with an existing parent and a non-conflicting direct-child
directory; the decision and registry must carry the same proposal. Iteration 6's
bootstrap assignment creates it, and its gate requires the refreshed view to
recognize it. `reuse` and `extend` may reference an already accepted proposal in
the registry, preserving capability identity before implementation; they cannot
introduce an absent owner themselves. A decision that replaces an earlier one
carries `revises` with the affected work items, contracts and consequences: a
silent contradiction is impossible because the field is required for a
conflicting owner.

`ForkSubmission.partial` records findings and gaps. It is never appended and is
never a decision. It consumes one `forkRetriesPerRequest`; exhaustion returns an
unresolved outcome to the local architect without invoking the parent to supply
the missing choice.

### The brief

The fork returns a short brief: the request and decision references, the chosen
capability and owner, the reason that matters later, corrected inherited
assumptions or hypothesis changes, affected prior decisions, unresolved
questions and evidence references. The harness appends it through
`appendContext`, keyed by `DecisionId`. Appending causes **zero model calls**.
A repeated key answers `already-present`. A lost parent raises the generation
through `global-context-rebuilt`, and the rebuilt parent is oriented from the
hypotheses, registry and decisions, which clears the pending list.

### Delivery

`decision-delivered` returns the accepted decision to the requesting local
architect before any contract work begins. A material hypothesis revision
reaches every affected local architect at its next coordination point, through
`hypotheses-delivered`, before dependent work is assigned. Delivery triggers no
extra local invocation and never rewrites an active iteration, contract or
accepted placement.

### Local authority

A local architect places work within its assigned subtree when the choice
refines the subtree's established responsibility, preserves recorded ownership
and leaves no competing candidate. Those local decisions are recorded with
`authority: 'local'` and `request: null`, and are discoverable from the registry
without a parent append. Physical containment alone does not justify local
ownership; a hypothesis proposing an external owner with anticipated consumers
elsewhere is strong evidence against localizing, and a material departure needs
a focused global request with counterevidence.

### Stale evidence

If the view identity changes between `view-refreshed` and `decision-accepted`,
the fork's evidence is revalidated and the affected investigation repeats. Two
revisions are never combined. A failed refresh does not make an older view
current; coverage loss stays explicit in the decision's `evidence.gaps`.
Neither an empty search nor an absent hit establishes absent behavior.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| G2 | Two sequential placement forks run without a diff baseline; the first revises a hypothesis and registers a capability, the second inherits its brief and reuses the entry | The `revision-diff` fixture with a scripted architect: the second decision has `outcome: 'reuse'` and names the existing `RegistryEntry` rather than a new slug |
| G3 | Appending a parent brief causes zero model calls and reaches the next fork's input | The scripted agent counts model calls across the append; the next fork's rendered input contains the brief text |
| G4 | A crash between an accepted decision and the parent append recovers exactly once | Restart after `decision-accepted`: the append is keyed by `DecisionId`, the port answers `already-present` on the repeat, and exactly one `brief-appended` exists |
| G5 | A local architect uses an external-owner hypothesis as evidence, makes routine local refinements without a global call, and escalates real counterevidence | Three scripted local architects over one hypothesis: one refines locally with no `placement-requested`, one escalates with counterevidence, and the local decision is recorded without a parent append |
| G6 | A later fork finds a locally registered unimplemented capability without a parent brief | A local decision registers a capability; a later fork's input contains no brief for it, and its decision reuses the registry entry |
| G7 | A relevant hypothesis revision reaches affected local architects before dependent work is assigned | `hypotheses-delivered` precedes the next `iteration-assigned` of every work item whose `involvedModules` match the revision |
| G10 | Global placement can authorize a new owner without claiming it already exists | A create decision and matching registry proposal lead to a passing creation assignment. A nonexistent parent, conflicting directory and reuse of an absent owner without an accepted proposal are rejected; reuse of an already registered proposal preserves its capability identity |
| X1c | A decision fork threshold returns partial findings and no accepted decision | `fork-returned-partial`; no `decision-accepted`, no append, one retry within `forkRetriesPerRequest`, then an unresolved outcome to the local architect |

## Guards owned

The cross-cutting JSON rule for both `ForkSubmission` members and for
`request-placement`, each with its schema-break and rule-break test. An owner
absent from the refreshed view without a valid proposal is the named rule-break case.

## Exit evidence

- The crash table of the placement chain, with one passing test per row:
  after `placement-requested`, after `invocation-ended`, after
  `decision-accepted`, after `brief-appended`, and after parent loss.
- A decision whose `revises` names the affected work and whose consequences
  reach the relevant local architects.
- A fork that is interrupted mid-investigation and repeats from current records
  and revalidated evidence, producing one decision, not two.
- A view identity that changes during an investigation, forcing revalidation.
- A global `create` decision proposing a new owner, followed by a bootstrap
  assignment that creates it and passes its gate; absent parents, conflicting
  directories and absent owners without accepted proposals for `reuse` are rejected.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
