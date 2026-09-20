# Spike protocol

This is a manual simulation using `gpt-5.6-sol` subagents in place of pi.
The target is the Ramify toolkit at `/ramify`. All authored artifacts stay
inside this spike. Do not implement a feature, a test, a fake, a contract or
the harness. Do not start an implementation agent or change module declarations.

## Inputs and authority

Each case receives only its example request, this protocol, project guidance
and relevant project evidence. Do not read `example-selection.md`, other
cases, the coordinator's anticipated module counts, or superseded designs.
The request is a simulated global plan, not an instruction to execute it.

User decisions governing this experiment:

- The implementation map specifies capabilities, never work items, task
  scopes, implementation instructions, iteration goals or scheduling order.
- Work begins at a consumer. Cross-branch work uses separate scoped agents
  joined by contracts; choosing a high subtree root does not authorize a
  single implementation agent to do arbitrary horizontal work.
- A work item can need several iterations. Only the next iteration's goal
  is fixed. A successful iteration can leave local continuation as well as
  external needs. A large task alone does not justify creating modules.
- Agent invocations are restartable from repository state. A brief must
  work for a fresh session without an earlier conversation.
- This spike ends immediately before the first implementation invocation.
  Its initial consumer will establish executable evidence later. Do not
  invent tests, fake paths or passing results to make the brief look ready.

The coordinator refreshes the architect and API views once before agent
launch. Use that shared snapshot; do not refresh it concurrently. Record its
metadata and limitations. All other project access is read-only.

## Stage A: capability mapping

A fresh Sol architect reads the request and uses the module-architect skill
progressively. Follow discovery first, then placement when needed; inspect
requester-specific API views for any assertion of import availability.
Treat semantic capability attribution as judgment and cite the source facts.

Write `capability-map.json` with these top-level fields:

- `caseId`, `schemaVersion` (1), `architectRevision`, `inputIdentity`.
- `capabilities`: objects with `id`, `description`, `owner` (canonical module
  ID), `state` (`existing`, `extension` or `new`), `evidence` (path/location
  references), and `uncertainties` (strings). Descriptions state an ability;
  they do not order implementation actions.
- `relationships`: objects with `consumerCapability`, `providerCapability`
  and `reason`. These are capability relationships, not scheduled tasks.
- `reuse`: objects with `capability`, `symbol`, `requester`, `availability`
  (`available`, `unavailable` or `unknown`), and `evidence`.
- `seams`: objects with `id`, `consumerCapability`, `providerCapability`
  and `agreementNeeded`. Describe what must agree, not the future contract's
  invented API or work sequence.
- `openQuestions`: strings. State whether a question blocks identifying an
  initial bounded consumer goal or can be resolved during local engineering.

Use existing owners unless evidence requires proposing a structural change.
New capability does not imply new module. Mark assumptions explicitly.
Write `mapping-report.md` following the skill's applicable report headings,
including guidance and every source file actually read. Do not select tasks
or produce briefs in this stage.

## Gate between stages

The coordinator validates artifact shape and capability references and reads
the map for work instructions and unsupported availability claims. Corrections
return to the architect. This is artifact review, not feature validation.

For this experiment only, after artifact review, simulate the map-approval
transition with `approvalKind: simulation-assumption`. This is not a person's
approval of the map or permission to implement a structural change. Its only
effect is allowing the next planning stage to be exercised.

## Stage B: initial execution decision and brief

A different fresh Sol agent acts as a briefing architect, not an implementation
engineer. Read the request and accepted capability map. Select the first
consumer and prepare the smallest useful first iteration. Read module-local
onboarding and relevant generated API information to ground the handoff. Any
source inspection must be bounded, justified and listed. Do not implement.

Write `execution-decision.json` with these top-level fields:

- `caseId`, `schemaVersion` (1), `mapRef`, `approvalKind`
  (`simulation-assumption`), `status` (`ready-for-first-implementation` or
  `blocked-before-first-implementation`).
- `workItem`: `id`, `consumerModule`, `scopeRoot`, `goal`,
  `capabilityIds`, `allowedModuleIds`, `writeBoundary`, `excludedWork`.
  Name module IDs, not just directories; the boundary must be one bounded
  subtree. Record deliberate exclusions even if a subtree contains them.
- `firstIteration`: `goal`, `acceptance` (observable conditions),
  `requiredEvidence`, `notCompletionOf` (remaining feature obligations).
- `readFirst`: existing paths with a short reason for each.
- `knownExternalNeeds`: candidate dependencies with evidence and unresolved
  questions; these are not executable provider delegations yet.
- `localContinuation`: possible remaining responsibilities, not a scheduled
  backlog or fixed future iteration goals.
- `blockers`: concrete information or authorization missing before launch.
- `rationale`: why this consumer and iteration; bounded alternatives rejected.

Write `first-work-brief.md`: the actual text a fresh first implementation agent
would receive. Include goal, scope, relevant requirements, a compact slice of
the map, read-first references, iteration acceptance, remaining obligations,
outcome protocol and restart behavior. Do not require the engineer to read the
whole capability map, the whole global plan or a global architectural report.
Preserve all constraints relevant to this iteration, including edge cases.
Point to additional detail only when needed. Do not invent foreign APIs.

Work-item completion and iteration completion are distinct. The brief must
say how to report useful partial progress, local continuation and external
needs; passing against a fake is never completion of a delegation or feature.
It must neither demand the entire large feature in one iteration nor allow
an arbitrary placeholder to count as meaningful progress.

Write `briefing-report.md`: exact evidence read, requirement coverage and
deferred requirements, assumptions/blockers, decisions made beyond the map,
and what this exercise exposed about the proposed process. A readiness claim
means the brief is ready for a future invocation, not that tests already exist.

## Stop and report

After checking each brief, record either `ready-for-first-implementation` or
`blocked-before-first-implementation`. In both cases implementation launches
remain zero. Do not simulate outcomes of tests or agents that did not run.
Record actual corrections, planning-agent IDs, model, artifacts, and findings.
