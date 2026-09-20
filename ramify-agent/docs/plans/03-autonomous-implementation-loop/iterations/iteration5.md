# Iteration 5: Initial analysis and work-item coordination

**Goal:** turn a plan into entry assignments, hypotheses, a capability registry
and a work-item frontier, and let a local architect close a work item whose goal
is already satisfied. A run with work items completes.

## Prerequisites

Iteration 4: the run, its invocations, readiness and the final gate.

## Write scope

`subs/harness/src/analysis/`, `subs/harness/src/work/`,
`subs/harness/src/prompts/`, `subs/harness/src/progress/`; and, for the
conversion, `subs/harness/src/mapping/`, `subs/harness/src/maps/`,
`subs/harness/src/interfaces/`, `subs/harness/src/jobs/`, `subs/harness/src/http/`,
`subs/harness/module.ramify`, the root `module.ramify`, `subs/web/src/` and
`scripts/live-trial.ts`. No engineer, no
write tools, no global fork, no contract.

## Interfaces consumed and established

Consumed: `RunRecord`, `Invocation`, the check engine, `commitRecord`,
`loadArchitectIndex`, `loadModuleTree`.

Established: `EntryAssignments`, `Hypothesis`, `RegistryEntry`, `WorkItem`,
`WorkItemOutline`, `CapabilityProgress` as an internal projection, the
`InitialAnalysisSubmission` union with real content, and the
`LocalArchitectSubmission` members `request-completion` and `unresolved`. The
run-log events `analysis-accepted`, `work-item-started`,
`hypotheses-delivered`, `outline-revised`, `work-item-completed`.

## Work

### The mapping job becomes the initial analysis

By Dan's decision, as the main plan's
[conversion table](../main-plan.md#the-mapping-job-becomes-the-initial-analysis)
lays out. The initial-architect invocation is built from the mapping job's
parts and the mapping job is then removed, in this order, so the project passes
at each step:

1. Move `modulePathSchema`, `sha256Schema`, `citationSchema`,
   `viewIdentitySchema` and `inputManifestSchema` to
   `interfaces/protocol/evidence.ts` and point their users at it.
2. Build `src/analysis/` from `mapping/architect.ts` (the session, its tools and
   bounded correction) and `mapping/validate.ts` (citations verified against the
   views). The prompt package starts from `mapping/architect-prompt.md` and
   `mapping/feature-mapping.md`. The API-view tool is not offered to the initial
   architect: requester availability is the local architect's to verify.
3. Remove `mapping/`, `maps/`, `interfaces/map.ts`,
   `interfaces/protocol/maps.ts`, the `start-mapping` and `approve-map` commands,
   the `map-validated` and `map-approved` events, the map queries and their
   tests, and the two `module.ramify` statements that exposed the map.
4. Remove the web's `map-view.tsx`, `map-document.tsx`, `mapping.ts`, their
   routes and tests. `module-tree.tsx` stays. Until iteration 11 the web shows
   plans only.
5. Point `scripts/live-trial.ts` at the initial analysis of a run.

A mapping job directory that Plan 1 left on disk is not a run and is not
listed. Entries and hypotheses carry `citations`, and an owner, a module or a
symbol an architect cites must exist in the view it cites.

### Initial analysis

One `initial-architect` invocation over the captured plan, the refreshed
architect view and the module-architect skill. Its submission commits, in one
`analysis-accepted` event: `EntryAssignments`, every `Hypothesis` at revision 1,
one `RegistryEntry` per entry capability with `origin: 'entry'` and
`decision: null`, and one `WorkItem` per entry capability.

Validation beyond the schema: every owner exists in the refreshed view or
carries a `proposed` block; capability and hypothesis slugs are unique in the
run; every `PlanRef` lies inside the captured plan. A failure returns every error with its path
to the same session.

**A hypothesis never creates work.** It has no reference to a work item, and
nothing references it but a decision and a local architect's input. Revision 1
is never rewritten. `change` offers `reuse`, `extend`, `create` and
`create-by-extraction`; `refactor` is dropped, because no decision outcome could
confirm it and every union value must have a producer. That is a revision of the
[proposal](../core-records.proposal.md#initial-analysis) and is recorded as such.

Work-item grouping comes from the submission and is applied mechanically.

### Hypothesis delivery

When a work item starts, `hypotheses-delivered` records which hypothesis
revisions it received, selected by `involvedModules` and by being an anticipated
consumer, not only the suggested owner. Delivery happens at a coordination
point and never rewrites an active assignment.

### The local architect

One continuing session per work item. Compaction is allowed and recorded. It
receives the goal, its requirement and acceptance refs, the module's onboarding
and API view, the relevant hypotheses with their rationales, and the registry.

This iteration offers it two submission members:

- `request-completion`, which commits a `WorkItemOutline` with
  `decomposition: 'single-iteration'` or `'staged'` and its rationale, then runs
  the `work-item` gate. Requesting completion with no iteration is a legitimate
  outcome: the goal is already satisfied by existing behavior, which is verified
  reuse, and the outline records why.
- `unresolved`, which ends the run with its conflict and evidence rather than
  weakening the request.

A failing work-item gate returns to the local architect, which may revise its
outline. Exhaustion of `repairRoundsPerWorkItemGate` fails the run with
`repair-exhausted` and the original cause preserved.

### Progress

The internal `CapabilityProgress` projection: `todo` for an expected or
confirmed need with no work started, `working` once work started, `completed`
only with current verification evidence. A hypothesis-only capability is
`tentative`. A superseded hypothesis leaves the list without becoming
`completed`. The projection is a pure function of the logs and records and
appends nothing. Its public shape arrives in iteration 11.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| G1 | Initial analysis produces executable entry assignments and separate deeper hypotheses; hypotheses create no work | A submission with two entries and four hypotheses commits both; the frontier holds exactly one work item per entry capability; a search of every work item, obligation and completion requirement finds no hypothesis reference |
| X2 | Initial, global and local compaction is observed and recorded when it happens | A scripted compaction during initial analysis and during a local architect session yields `compaction` observations with trigger, success and before/after where available |
| M1 | Hypothesis, decision, work and progress records remain visibly distinct | Distinct record kinds in distinct directories, with a test asserting that the `Hypothesis` type has no work-item reference and that the progress projection is pure |

## Guards owned

The cross-cutting JSON validation rule applies to `InitialAnalysisSubmission`
and to both local architect members added here, each with its schema-break and
rule-break test.

## Exit evidence

- A run over the `collection-review` fixture whose two entry capabilities are
  already satisfied: two work items, two outlines recorded as
  `single-iteration`, two passing work-item gates, one passing final gate,
  completed.
- An initial submission naming an owner absent from the view is rejected with
  its path, corrected, and accepted.
- A duplicate capability slug is rejected; three rejections end the invocation
  as `invalid-submission`.
- A work-item gate failure returns to the local architect and exhausts
  deterministically, with the original cause preserved.
- The delivered hypothesis revisions for each work item, and a test that a
  hypothesis appears in no work record.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
