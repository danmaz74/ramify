# Plan 3 core records: proposal for review

**Date:** 2026-09-20. **Status:** proposal, not accepted. Nothing here is
implemented. It precedes `main-plan.md` so the plan can reference reviewed
structures instead of inventing them per iteration. It incorporates the
[MVP shortlist](../../cucumber-viz-lessons/mvp-shortlist.md) of lessons from
cucumber-viz.

This proposes the durable records, agent submissions and identities on which
the state machines of the
[autonomous-loop architecture](../../architecture/autonomous-implementation-loop.md)
depend, as the [authoring brief](authoring-brief.md) requires. It covers the
structures that several state machines share. Records that serve one state
machine only are listed in [Left to the plan](#left-to-the-plan).

Shapes are TypeScript sketches. The implementation writes them as strict zod
schemas with a `schema: 'ramify-agent.<name>/1'` literal, as Plan 1 did. Paths
assume the post-Plan-2 tree, where the harness owns `src/interfaces/`.

## What already exists and is kept

| Existing | Use in Plan 3 |
| --- | --- |
| `job.json`, `events.jsonl`, job version = last sequence | A run is a job, and the only kind. Its job ID is the run ID. |
| Commands with `commandId`, `contentHash`, `expectedVersion`, receipts | Unchanged for `start-run` and `stop-job`. |
| `inputManifestSchema`, `viewIdentitySchema`, `sha256Schema`, `modulePathSchema`, `citationSchema` | Reused as they are, moved out of `interfaces/map.ts`, which is removed. |
| Write-once files committed by an event (`map-validated`) | Generalized into the record rule below. |
| `AgentPort`: one structured submission ends a session turn | Kept; every role's turn ends in one submission from a closed union. |

Decided 2026-09-20: Plan 1's implementation map was an earlier hypothesis and is
removed. The mapping job is converted into the run's initial analysis, which is
the same session shape; the main plan has the
[conversion table](main-plan.md#the-mapping-job-becomes-the-initial-analysis).

## Eleven rules the structures follow

1. **Two logs.** The run log, `events.jsonl`, holds state transitions only and
   is the canonical state of the run. Each invocation has an observation log,
   `invocations/<id>/observations.jsonl`, that is canonical for what was
   observed: activity, usage, guard verdicts, mutations, hook checks, context
   sizes. No state derives from an observation log. Decided 2026-09-20: an
   observation log does not go through the ledger. The harness appends to it
   with the ledger's `appendJsonLine` primitive and its torn-line handling,
   without transactions, materialization or a flush per line. A crash can lose
   the last observations of an invocation it interrupted anyway, which the
   KPIs report as a coverage gap. The ledger is kept for what must never be
   lost.
2. **Records are immutable files.** A change is a new revision in a new file.
   No record carries a status field; status is a projection of run-log events.
3. **One log line is one transaction.** Decided 2026-09-20. A transition is
   one flushed append to the run log, and that line carries the bodies of
   every record the transition commits: `decision-accepted` holds the
   decision, its registry entries and its hypothesis revisions. A transition
   is wholly in the log or it did not happen; a torn last line is discarded on
   load. The last consistent state is the log up to its last complete line,
   and work always resumes from it.
4. **Record files are materialized copies.** The files of
   [Layout of a run](#layout-of-a-run) exist for people and agents to read. On
   every load the harness replays the log and rewrites any file that is
   missing or differs. They are never the authority, so no ordering between a
   file and its event exists to get wrong, and recovery is one loop for every
   record kind, with no agent call. Large outputs, such as gate logs, are
   files written before their event and referenced by hash; an orphan is
   harmless. An effect outside the harness, of which the MVP has three, the
   brief append, starting an invocation and releasing the writer, is recorded
   as an intent, performed with an idempotency key, and recorded as complete;
   on restart an intent without its completion is performed again and the key
   makes a repeat a no-op.
5. **Links point backwards.** A record references records committed before it.
   Reverse links, such as a registry entry's contracts, are projections. No
   record is rewritten to add a link.
6. **Counters are counts.** Repair rounds, infrastructure retries, fork
   retries and budget returns are counted over committed history, keyed by
   the work they concern, never by invocation or session. A fresh session
   cannot reset them.
7. **Durable records are private; projections are public.** Everything in
   [Durable records](#durable-records) is a harness internal. The web receives
   only the [projections](#public-projections) the harness exposes from
   `src/interfaces/protocol/`. A projection is a pure function of the logs
   and records: it never appends an event or infers a transition.
8. **Closing is the last write.** The event that closes work is appended
   after every write that belongs to that work, and nothing is awaited from an
   agent afterwards. An event that licenses an agent, such as
   `invocation-started` or `writer-acquired`, is appended before the agent
   starts.
9. **The harness knows its own IDs.** No tool or submission schema has a field
   for an ID the harness assigned; it resolves the invocation, work and write
   scope from the session it started. A reader of a record returns valid,
   unsupported version or invalid, and the last two are failures with evidence,
   never an absent record. Every value of every union has a producer and a test.
10. **Everything an agent tells the harness is validated JSON.** This is
    fundamental and has no exception: every submission and every input of a
    harness tool is JSON, validated completely before it has any effect. The
    validation is the strict schema, then the rules the schema cannot hold:
    references that must exist in committed state, existing owners in the view
    or validated module proposals, paths that must lie in the scope, uniqueness
    of proposed slugs.
    A failure changes nothing. Every error, each naming its path and what is
    expected, returns to the same session as an error result with a request
    to correct and retry. Retries are bounded per turn, each rejection is an
    observation with its errors, and exhaustion ends the invocation as
    `invalid-submission`, distinct from a failure of the agent. Free text
    from an agent is never parsed for meaning. Plan 1 does this for the map
    submission; Plan 3 does it for every union in
    [Agent submissions](#agent-submissions) and for every harness tool.
11. **The transaction mechanism is one independent service.** Decided
    2026-09-20. Rules 3 and 4 are implemented once, in a module of their own,
    `harness/ledger`, which knows nothing of jobs, runs, agents or git: it
    appends a transaction, replays a log, materializes record files and
    drives an external effect from intent to completion. It imports nothing
    from the rest of the harness, and every other part of the harness writes
    durable state only through it. It is the critical path, so it is tested
    beyond the rest: a fault injected at every write and flush, a last line
    torn at every byte, a real process killed in the middle of an append, and
    replay and materialization shown idempotent.

## Identifiers

IDs are assigned by the harness from committed state, so a step repeated after
a crash derives the same ID. Agents propose only the two semantic slugs.

| ID | Form | Assigned from |
| --- | --- | --- |
| `RunId` | the job ID, `20260920T101500Z-3f9a1c` | `start-run` |
| `CapabilityId` | kebab slug, `send-email` | proposed by an architect; unique in the run; a collision is a submission error the session corrects |
| `HypothesisId` | kebab slug | proposed by the initial or a fork architect; same rule |
| `WorkItemId` | `wi-001` | count of committed work items |
| `IterationId` | `wi-001.i02` | count of committed assignments of the work item |
| `InvocationId` | `inv-0007` | count of committed invocations of the run |
| `RequestId` | `pr-003` | count of committed placement requests |
| `DecisionId` | `gd-003` for request `pr-003`; `ld-wi-001-02` for a local decision | its request, or the count of the work item's local decisions |
| `ContractId` | kebab slug, `send-email` | proposed by the contract session; unique in the run |
| `ObligationId` | `ob-<contract-id>` | its contract: one provider obligation per contract |
| `RequirementId` | `cr-<work-item-id>-<contract-id>` | the consumer work item and its contract |
| `GateAttemptId` | `ga-0012` | count of committed gate attempts |

```ts
/** A committed record at one revision. `hash` is the SHA-256 of the file's bytes. */
interface RecordRef { readonly id: string; readonly revision: number; readonly hash: string }

/** A commit accepted by a passed committing gate's audit. */
type AcceptedCommit = string;
```

The 2026-09-20 checks-then-commit decision was the MVP stand-in. Plan 7
superseded it with evidence bound to the exact committed tree. See
[Commit, then audit](#commit-then-audit).

## Layout of a run

```text
plans/<plan-id>/.harness/jobs/<run-id>/
  job.json                                  RunRecord; written once
  input/plan.md                             captured plan
  events.jsonl                              run log
  analysis/entries.json                     EntryAssignments
  hypotheses/<hypothesis-id>/<rev>.json     Hypothesis
  registry/<capability-id>/<rev>.json       RegistryEntry
  requests/<request-id>.json                PlacementRequest
  decisions/<decision-id>.json              PlacementDecision
  work-items/<wi>/item.json                 WorkItem
  work-items/<wi>/outline/<rev>.json        WorkItemOutline
  work-items/<wi>/iterations/<nn>/assignment.json   IterationAssignment
  work-items/<wi>/iterations/<nn>/result.json       IterationResult
  contracts/<contract-id>/<rev>.json        ContractRecord
  obligations/<obligation-id>/<rev>.json    ProviderObligation
  requirements/<requirement-id>/<rev>.json  ConsumerRequirement
  gates/<gate-attempt-id>/attempt.json      GateAttempt, beside its logs
  invocations/<inv>/invocation.json         Invocation
  invocations/<inv>/submission.json         accepted submission, verbatim
  invocations/<inv>/outcome.json            InvocationOutcome
  invocations/<inv>/observations.jsonl      observation log
  invocations/<inv>/session/                the agent implementation's own files
  measurements/<snapshot-id>.json           captured `ramify measure` documents
```

Everything is beneath the run. A second run of the same plan starts with an
empty registry; nothing carries over but the source.

## Durable records

### Run

```ts
interface RunRecord {                       // job.json
  schema: 'ramify-agent.job/2';              // Plan 1's /1 mapping jobs are not runs and are not listed
  jobId: RunId; planId: string; kind: 'implementation';
  agent: string;                            // 'pi' | 'scripted'
  createdAt: string;
  manifest: InputManifest;                  // as Plan 1: plan hash, source, versions, architect view
  /** Prompt and skill packages by role, each a content hash. */
  prompts: Record<Role, { package: string; hash: string }>;
  policy: RunPolicy;
  /** The frozen measurement baseline B; null with the reason when the producer is unavailable. */
  baseline: { measurement: RecordRef } | { unavailable: string };
}

interface RunPolicy {
  version: string;                          // names this hardcoded policy
  limits: {
    repairRoundsPerIteration: number;
    repairRoundsPerWorkItemGate: number;
    infrastructureRetriesPerGate: number;
    forkRetriesPerRequest: number;
    budgetReturnsPerIteration: number;
    sessionReconstructionsPerWork: number; cycleReplansPerWorkItem: number;
    rejectedSubmissionsPerTurn: number; rejectedToolInputsPerTurn: number;
    readinessRecoveries: number;
    stopSettleMs: number; writerSettleMs: number;
    /** One invocation that neither ends nor fails is stopped and settled. */
    invocationIdleMs: number; invocationAbsoluteMs: number;
    /** Whole-run bounds; exceeding one fails the run as `limit-exceeded`. Values are in the main plan. */
    maxIterationsPerWorkItem: number; maxWorkItems: number; maxPlacementRequests: number;
    maxInvocationsPerRun: number; runAbsoluteMs: number;
  };
  /** The long-lived global parent is no role: briefs append without inference, and its maintenance is recorded against the fork that performs it. */
  context: Record<Role, { compaction: 'forbidden' | 'allowed'; budgetTokens: number | null; budgetFraction: number | null; reportReserveTokens: number }>;
  commands: {
    typeCheck: CheckCommand; allTests: CheckCommand;
    ramifyCheck: CheckCommand; ramifyChanged: CheckCommand; hookTimeoutMs: number;
    /** Independent nested packages that readiness verifies and gates include. */
    nestedPackages: Array<{ directory: string; install: CheckCommand; tests: CheckCommand | null }>;
  };
}
/** `env` is the complete environment; the harness builds it and never passes on its own. */
interface CheckCommand { argv: string[]; cwd: string; env: Record<string, string>; timeoutMs: number }

type Role = 'initial-architect' | 'global-fork' | 'local-architect' | 'engineer' | 'contract-engineer';
```

`job.json` moves to `/2`. `kind` has one value, since the mapping job is
converted into the initial analysis. The policy is captured, not configurable: the run records
the limits it ran under so exhaustion is reproducible.

### Initial analysis

```ts
interface EntryAssignments {                // analysis/entries.json, written once
  schema: 'ramify-agent.entry-assignments/1';
  view: ViewIdentity;
  entries: Array<{
    capability: CapabilityId; description: string;
    owner: ModulePath; proposed?: ModuleProposal;
    requirementRefs: PlanRef[]; acceptanceRefs: PlanRef[];
    citations: Citation[];
  }>;
  // One work item per entry: its module is the entry's owner and its goal the entry's description.
}
/** A heading anchor or line range of the captured plan. */
interface PlanRef { anchor?: string; lines?: [number, number] }

interface ModuleProposal {
  parent: ModulePath;                       // must already exist in the refreshed view
  directory: string;                        // project-relative direct child under the parent's subs/
  purpose: string; tags: string[];
}

interface Hypothesis {                      // hypotheses/<id>/<rev>.json
  schema: 'ramify-agent.hypothesis/1';
  id: HypothesisId; revision: number;
  standing: 'tentative' | 'confirmed' | 'superseded';
  capability: CapabilityId;                 // the forecast capability; not a registry entry
  /** Each value has a decision outcome that can confirm it; `create-by-extraction` pairs with `extract`. */
  change: 'reuse' | 'extend' | 'create' | 'create-by-extraction';
  suggestedOwner: ModulePath;
  anticipatedConsumers: Array<ModulePath | CapabilityId>;
  involvedModules: ModulePath[];            // selects which local architects receive it
  dependsOn: CapabilityId[];                // forecast dependency links, all tentative
  confidence: 'low' | 'medium' | 'high';
  rationale: string; assumptions: string[]; uncertainties: string[];
  /** Where the claim can be verified; what it cites must exist in the view it cites. */
  citations: Citation[];
  /** Revision 1 comes from initial analysis; later ones from one global decision. */
  cause: { initial: InvocationId } | { decision: DecisionId; reason: string };
  supersededBy?: HypothesisId; confirmedBy?: DecisionId;
}
```

Revision 1 of every hypothesis is never rewritten, so expectation and
execution stay comparable. No harness code reads a hypothesis to create work,
obligations or completion requirements; the type has no reference to a work
item and nothing references it except a decision and a local architect's
input.

### Capability registry and placement

```ts
interface RegistryEntry {                   // registry/<capability-id>/<rev>.json
  schema: 'ramify-agent.capability/1';
  capability: CapabilityId; revision: number;
  behavior: string;
  owner: ModulePath; proposed?: ModuleProposal;
  origin: 'entry' | 'global-decision' | 'local-decision';
  decision: DecisionId | null;              // null for an entry assignment
  /** Confirmed consumer-to-dependency links this revision adds. */
  consumers: Array<{ capability: CapabilityId; workItem: WorkItemId }>;
  previousOwner?: ModulePath;               // set when a decision revises placement
}

interface PlacementRequest {                // requests/<request-id>.json
  schema: 'ramify-agent.placement-request/1';
  id: RequestId; workItem: WorkItemId; requester: ModulePath;
  forCapability: CapabilityId;              // the consumer capability being implemented
  question: string; requiredBehavior: string;
  findings: Array<{ text: string; citations: Citation[] }>;
  candidates: Array<{ capability?: CapabilityId; owner?: ModulePath; note: string }>;
  unresolved: string[];
  hypotheses: Array<{ ref: RecordRef; stance: 'supports' | 'contradicts' | 'departs'; evidence: string }>;
  localDecisions: DecisionId[];
}

interface PlacementDecision {               // decisions/<decision-id>.json
  schema: 'ramify-agent.placement-decision/1';
  id: DecisionId; authority: 'global' | 'local';
  request: RequestId | null;                // null for a local decision
  workItem: WorkItemId; invocation: InvocationId;
  question: string;
  /** `extract` moves existing behavior to a new owner and requires `revises` or affected consumers.
   *  `external` is satisfied by a package or another system: no owner module, no provider obligation. */
  outcome: 'reuse' | 'extend' | 'create' | 'extract' | 'external';
  capability: CapabilityId; owner: ModulePath | null;   // null only for `external`
  proposed?: ModuleProposal;                // required for an owner not yet in the view
  rationale: string; constraints: string[]; uncertainties: string[];
  evidence: { view: ViewIdentity; citations: Citation[]; gaps: string[] };
  /** An earlier decision this one replaces, with what it affects. Never silent. */
  revises?: { decision: DecisionId; affected: Array<{ workItem?: WorkItemId; contract?: ContractId; consequence: string }> };
  registry: RecordRef[];                    // entries this decision committed
  hypothesisRevisions: RecordRef[];
  /** Global decisions only: the text appended to the parent context. */
  brief?: string;
}
```

Only placement has its own decision record. The other significant choices of
architecture section 7 are fields of the records where they are made: scope
and its rationale in the assignment, breaking changes and plan revisions in
the outline, contract design in the contract record. The decision list a
person reviews is a projection over all of them. This avoids a second copy of
each choice.

The global context is a projection, not a record:

```ts
interface GlobalContext {
  generation: number;                       // rises when the parent is rebuilt from records
  session: SessionRef | null;
  appended: DecisionId[];                   // in this generation
  pending: DecisionId[];                    // accepted, not yet appended
}
```

A rebuilt parent is oriented from the hypotheses, registry and decisions, so
rebuilding clears `pending`. The port's append takes the decision ID as its
key and is a no-op when the session already holds that key.

### Work items, outlines and assignments

An absent owner is valid only with a `ModuleProposal` on an accepted entry or
placement decision and its matching registry entry. Its parent must exist;
the directory must be a non-conflicting direct child under that parent's
`subs/`, and the owner, directory and declaration name must agree. A hypothesis
alone never authorizes creation. `create` and `extract` may introduce a proposal;
`reuse` and `extend` may reference an already accepted proposal in the registry,
but cannot introduce an absent owner themselves. Multiple capabilities may
reference the same proposal but cannot propose conflicting definitions for one
directory.

The first assignment that creates that owner captures a `bootstrap` scope from
the committed registry reference: its declaration, README and own `src/`, plus
only explicitly assigned exposure files in existing owners. It receives the
parent's onboarding and views with the proposal; a nonexistent module's own
view is unavailable. The guard resolves missing paths through the nearest
existing ancestor and checks the remaining components for containment. Once
created, a refreshed view must recognize the proposed owner at that directory
before its gate can pass; the assignment's write authority never expands from
the refresh. Further child creation requires another accepted proposal.

```ts
interface WorkItem {                        // work-items/<wi>/item.json
  schema: 'ramify-agent.work-item/1';
  id: WorkItemId; module: ModulePath;
  origin: { entry: CapabilityId } | { obligation: RecordRef } | { verification: RecordRef };
  // The harness derives the one capability from the entry, obligation or requirement.
  /** A completed item's follow-up preserves that item's historical completion. */
  follows?: WorkItemId;
  goal: string;
  requirementRefs: PlanRef[]; acceptanceRefs: PlanRef[];
  /** The work item whose yield started this one; the depth-first stack. */
  startedFor: WorkItemId | null;
}

interface WorkItemOutline {                 // work-items/<wi>/outline/<rev>.json
  schema: 'ramify-agent.work-item-outline/1';
  workItem: WorkItemId; revision: number; invocation: InvocationId;
  changes: string;                          // the analysis, concise
  decomposition: { kind: 'single-iteration' | 'staged'; rationale: string };
  reuse: Array<{ capability: CapabilityId; owner: ModulePath; role: string }>;
  breakingChanges: Array<{ guarantee: string; reason: string; affectedConsumers: ModulePath[]; citations: Citation[] }>;
  stages: Array<{ title: string; approach: 'non-breaking' | 'breaking'; dependsOn: number[]; note: string }>;
  hypothesesSeen: RecordRef[];              // what the architect had been given
  /** Why this revision differs from the last; empty on revision 1. */
  revisionReason: string;
}

interface IterationAssignment {             // .../iterations/<nn>/assignment.json
  schema: 'ramify-agent.iteration-assignment/1';
  id: IterationId; workItem: WorkItemId; outline: RecordRef; stage: number;
  kind: 'ordinary' | 'breaking' | 'contract' | 'verification' | 'repair' | 'integration';
  goal: string; approach: string;
  scope: WriteScope;
  requirementRefs: PlanRef[];
  externalCapabilities: Array<{ capability: CapabilityId; owner: ModulePath; role: 'use' | 'request'; contract?: RecordRef }>;
  completionEvidence: string;
  /** Registered evidence this iteration must satisfy, owned anywhere. */
  evidenceObligations: Array<{ obligation?: RecordRef; requirement?: RecordRef; suite: string[]; against: 'fake' | 'real' }>;
  /** Derived by the policy from `kind` and `scope`; no submission carries it. */
  gate: { checkpoint: Checkpoint; tests: TestSelectionPolicy };
  /** Guarded files as captured; a gate compares the tree with them. */
  guarded: Array<{ path: string; hash: string }>;
  /** Set for a contract iteration: the engineer iteration that asked for it. */
  requestedBy?: IterationId;
  /** A local architect may assign a contract revision directly; the harness supplies the next revision. */
  revisesContract?: RecordRef;
}

interface WriteScope {
  revision: number;                         // per work item; only an assignment raises it
  base:
    | { module: ModulePath; includedChildren: string[] }        // non-breaking
    | { modules: ModulePath[]; rationale: string };             // an explicitly broad breaking scope
  /** Locations assigned beyond the base: contract, conformance, fake, exposure declaration. */
  extra: Array<{ path: string; purpose: 'contract' | 'conformance' | 'fake' | 'exposure-declaration' | 'consumer' }>;
  read: ModulePath[];                       // declared read scope beyond the base; soft
  /** Creation authority captured from accepted registry entries, never from hypotheses. */
  bootstrap: Array<{ capability: RecordRef; directory: string }>;
  rationale: string;
  /** Captured canonical paths, including validated absent bootstrap paths under a real ancestor. */
  resolved: { roots: string[]; files: string[]; view: ViewIdentity };
}

interface TestSelectionPolicy {
  policy: 'owned-by-scope' | 'all-project';
  exactOwners: ModulePath[]; subtrees: ModulePath[];
  extraSuites: string[];                    // from evidenceObligations
}
/** Resolved anew from the current tree before each gate or diagnostic test run. */
interface TestSelection extends TestSelectionPolicy {
  /** Recorded on the attempt, not the assignment. Empty required selections never pass. */
  resolved: string[];
}
type Checkpoint = 'readiness' | 'iteration' | 'contract' | 'breaking-iteration' | 'work-item' | 'final';

interface IterationResult {                 // .../iterations/<nn>/result.json
  schema: 'ramify-agent.iteration-result/1';
  iteration: IterationId;
  outcome: 'accepted' | 'partial' | 'unsuitable' | 'exhausted' | 'superseded';
  invocations: InvocationId[];              // every attempt, in order
  gate: GateAttemptId | null;               // the passing attempt, for 'accepted'
  /** For 'accepted': the commit the harness made after the gate passed. Null when nothing changed. */
  commit: AcceptedCommit | null;
  findings: string[]; changedAssumptions: string[]; recommendation?: string;
  artifacts: string[];
}
```

A contract sub-session is an iteration of kind `contract` whose `requestedBy`
names the engineer's iteration. It has its own assignment, scope, gate and
result, so the caller discovers a finished sub-session from committed records
without the original reply.

### Invocations

```ts
interface Invocation {                      // invocations/<inv>/invocation.json
  schema: 'ramify-agent.invocation/1';
  id: InvocationId; role: Role;
  work: { workItem?: WorkItemId; iteration?: IterationId; request?: RequestId };
  attempt: number;                          // of this role for this work
  /** `actual` differs from `requested` when the implementation could not continue or fork. */
  session: { requested: SessionMode; actual: SessionMode; ref: SessionRef; from?: SessionRef; degradedReason?: string };
  prompt: { package: string; hash: string; inputsHash: string };
  scope: { write: number | null; measurement: RecordRef | null };   // WriteScope revision; S_s components
  writer: boolean;
  supersedes?: InvocationId;
  /** The run branch's head when it starts: the last accepted commit. `git diff` shows the engineer the work not yet accepted. */
  base: AcceptedCommit;
}

type SessionMode = 'fresh' | 'continued' | 'fork';

interface InvocationOutcome {               // invocations/<inv>/outcome.json
  schema: 'ramify-agent.invocation-outcome/1';
  invocation: InvocationId;
  ended: 'submitted' | 'ended' | 'failed' | 'stopped' | 'context-budget-reached' | 'invalid-submission';
  rejectedSubmissions: number;              // each one is a `rejection` observation with its errors
  /** Set when `failed`. One with no mutation and no submission spends no repair round or budget return. */
  interruption?: 'idle-timeout' | 'absolute-timeout' | 'provider-error' | 'session-lost' | 'adapter-fault';
  /** What the harness did with it. A superseded invocation's result is kept and never applied. */
  disposition: 'applied' | 'superseded' | 'incomplete';
  submission: { hash: string } | null;
  budget?: { threshold: number; observed: number | null; reportDelivered: boolean };   // always an estimate; null is unknown
  /**
   * The harness's own observation, never `stop()` resolving or the agent's word: the session idle
   * and its registered process groups killed and gone. A write that still arrives late cannot touch
   * an accepted commit; it shows as an uncommitted change and joins the next commit.
   */
  settled: { confirmed: boolean; at: string; groupsKilled: number; lateWrites: string[] };
  /** Writers only: uncommitted changed paths outside the write scope when it settled, from `git status`. */
  outsideScope: string[];
  usage: Usage | { unavailable: string };
  elapsedMs: number; error?: string;
}
```

### Contracts, obligations and consumer verification

```ts
interface ContractRecord {                  // contracts/<contract-id>/<rev>.json
  schema: 'ramify-agent.contract/1';
  id: ContractId; revision: number;
  capability: RecordRef; decision: DecisionId;
  authority: { kind: 'provider' | 'consumer' | 'independent'; owner: ModulePath; rationale: string };
  provider: ModulePath;
  behavior: string;
  mode: 'fake-backed' | 'access-only';      // access-only: existing behavior, exposure change, no obligation
  artifacts: {
    interface: Array<{ path: string; exports: string[]; hash: string }>;
    conformance: Array<{ path: string; hash: string }>;
    fake: Array<{ path: string; exports: string[]; hash: string }>;   // `.fake` files, names containing `Fake`
    exposure: Array<{ path: string; declaration: string }>;
  };
  establishedBy: { iteration: IterationId; gate: GateAttemptId };
}

interface ProviderObligation {              // obligations/<obligation-id>/<rev>.json
  schema: 'ramify-agent.provider-obligation/1';
  id: ObligationId; revision: number;       // equals the contract revision
  contract: RecordRef; capability: CapabilityId; provider: ModulePath;
  behavior: string;
  evidence: { conformance: string[]; against: 'real' };
}

interface ConsumerRequirement {             // requirements/<requirement-id>/<rev>.json
  schema: 'ramify-agent.consumer-requirement/1';
  id: RequirementId; revision: number;       // equals contractRevision
  workItem: WorkItemId; consumer: ModulePath; // original consumer item; identity stays stable
  /** The capability the consumer is implementing: the tail of the dependency edge. The harness fills it from the work item. */
  forCapability: CapabilityId;
  obligation: ObligationId; contractRevision: number;
  behavior: string;
  evidence: { tests: TestSelectionPolicy; fakeInjections: string[] };   // what verification replaces
}
```

Registration is keyed by `(obligation, revision)` and `(requirement, revision)`;
a registration already in the log is not appended again. Shared consumers use
one provider execution per obligation revision and verify separately. A yielded
consumer resumes when all providers it waits for have conformed at the current
contract revisions. Its requirements remain open until its verification
iterations replace the fakes and pass; resumption never waits for that outcome.

#### Contract revision and follow-up work

A local architect requests revision through an assignment of kind `contract`
with `revisesContract` naming the current record and an approach explaining the
required change. `requestedBy` is absent for this direct assignment. The
accepted assignment is committed through `contract-requested`, as for a
sub-session, and licenses the contract engineer. The contract engineer
establishes the revised agreement through the same contract
gate; it cannot choose or overwrite the revision number. Until registration,
the existing contract remains authoritative.

Registering a new revision uses one `evidence-reopened` transaction in place of
the initial `contract-registered` transaction. It atomically commits the
contract, obligation and new
revisions of every attached requirement, and opens their evidence. Requirement
IDs and original `workItem` links stay stable. Prior records and gate results
remain historical; only the latest requirement revision can satisfy completion.
The same transaction records scheduling bindings from each
new obligation/requirement reference to the work item responsible for it:

- Reuse its existing unfinished work item, delivering the new evidence at its
  next coordination point. After writer settlement, any other unfinished assignment
  bound to the previous revision closes as `superseded`; a new assignment must
  carry the current references. No old assignment is rewritten or accepted for
  the new revision.
- If its previous work item completed, create a follow-up with `follows` naming
  it: an obligation-origin provider item or a verification-origin consumer
  item. Copy the relevant original requirement and acceptance references. The
  prior item stays completed. A new consumer attachment uses its own unfinished
  item and reuses any current provider conformance.

The provider binding is unique per `(obligation, revision)`; the consumer
binding is unique per `(requirement, revision)`. Replay restores the bindings
and follow-up records without scheduling duplicates. Provider work precedes
consumer verification, including when all previous items had completed.
Work-item completion checks evidence assigned by these bindings, not just the
requirement's original `workItem` field. A follow-up cannot complete while its
bound verification is open. Follow-ups use fresh local architect sessions
oriented from the prior item, its acceptance references and the current evidence.
Bindings to unfinished items may reuse one item across revisions, but each
revision requires its own evidence. All work and invocations count toward the
existing run and work-item limits. The final gate waits for every follow-up
and every latest requirement revision. P3 must exercise this through completion
after restart, not stop at the reopened projection.

A cycle is a cycle of **capabilities**, never of modules or of changes. The
graph the harness checks has capabilities as its nodes: a requirement adds the
edge from the capability its consumer is implementing (`forCapability`) to the
capability of its obligation. It is ordinary for change 1 in module A to need
change 2 in module B, which needs change 3 in module A: those are three
capabilities and three work items, since a new provider obligation starts a
work item of its own, even in a module that already has one yielded, and they
complete in the order 3, 2, 1. Only a capability that transitively depends on
itself is a cycle. No module identity enters the check.
The harness checks the graph when it commits a requirement. **A cycle returns to the local architect, and the person is
told.** Decided 2026-09-20. The harness appends `dependency-cycle-detected` with
the cycle, the capabilities that form it with their requirements and work items, and the
work item whose registration closed it. That work item's local architect
receives the cycle at its next turn as a finding and re-plans with its ordinary
submissions: it asks the global architect to place the capability elsewhere,
assigns work so that one side completes without the other, or submits
`unresolved`. The run fails with `dependency-cycle` only when the same cycle,
the same set of capabilities, is detected again, or when
`cycleReplansPerWorkItem` is spent. Every detected cycle is a
[notice](#public-projections) the person sees during the run and after it,
whether or not the re-plan resolved it, because a cycle between modules is an
architectural finding. An unresolvable dependency, where the provider reports that it
cannot implement the agreement, returns `revision-needed` to the consumer's
local architect, bounded by the work item's limits.

### Gate attempts

```ts
interface GateAttempt {                     // gates/<gate-attempt-id>/attempt.json
  schema: 'ramify-agent.gate-attempt/2';
  id: GateAttemptId; checkpoint: Checkpoint;
  subject: { workItem?: WorkItemId; iteration?: IterationId };   // neither for readiness and final
  proposedBy: InvocationId | null;
  repairRound: number; infrastructureAttempt: number;
  head: AcceptedCommit;                     // the run branch's head before this attempt made any commit
  /** The commit this attempt made, whatever its verdict; null when the tree was unchanged. */
  commit: AcceptedCommit | null;
  /** The commit the checks ran over; null when execution never began or ran in place. */
  audited: AcceptedCommit | null;
  /** Published run, report and tree refs bound to `audited`; null when nothing was published. */
  evidence: { runRef: string; reportCommit: string; treeRef: string } | null;
  /** `after: null` is a deletion, which is a change like any other. */
  guardedChanges: Array<{ path: string; before: string; after: string | null; authorizedBy: RecordRef | null }>;
  commands: Array<{
    kind: 'ramify-check' | 'type-check' | 'tests' | 'conformance';
    command: CheckCommand; selection?: TestSelection;
    startedAt: string; elapsedMs: number; exitCode: number | null;
    outcome: 'passed' | 'failed' | 'not-verified';
    notVerified?: 'timeout' | 'runner-error' | 'command-missing' | 'empty-selection' | 'interrupted'
      | 'discovery-error' | 'required-suite-missing';
    /** Set only by the code that spawns the command, such as a spawn error with a string code. Never inferred from output. */
    runnerError: { kind: string; message: string } | null;
    /** The complete output is a file beside attempt.json; `tail` has a fixed bound. */
    output: { path: string; bytes: number; truncated: boolean; tail: string };
  }>;
  verdict: 'passed' | 'failed' | 'not-verified';
  cause: 'in-scope' | 'infrastructure' | 'timeout' | 'invalid-session' | 'outside-assignment' | 'guarded-change' | 'unknown' | null;
  next: 'accept' | 'repair' | 'retry-infrastructure' | 'return-to-local-architect' | 'exhausted';
}
```

The verdict for a subject is that of its latest attempt; there is no stored
verdict and nothing to invalidate. An unauthorized guarded change,
an empty required selection or a missing command is never `passed`. The
harness verifies every command and selection before it runs the first; a gate
that cannot run what its checkpoint requires records `not-verified` and runs
nothing. `cause` derives from `runnerError`, the timeout and the exit codes,
never from output text.

## Agent submissions

Every turn of every role ends in one submission from a closed union. No agent
runs while another runs, so a writer that has submitted is idle, and a request
to another role is a committed record before that role starts. This depends on
the iteration-0 spike showing that pi can continue a session after a
submission; the fallback is a fresh session from records, which the design
needs anyway.

```ts
type InitialAnalysisSubmission = {
  entries: EntryAssignments['entries'];
  hypotheses: Array<Omit<Hypothesis, 'schema' | 'revision' | 'cause' | 'standing'>>;
  coverageLimits: string[];
};

type ForkSubmission =
  | { kind: 'decision'; decision: DecisionBody; registry: RegistryChange[]; hypothesisRevisions: HypothesisChange[]; brief: string }
  | { kind: 'partial'; findings: string[]; gaps: string[] };          // never appended, never a decision

type LocalArchitectSubmission =
  | { kind: 'assign'; outline?: OutlineBody; localDecisions: DecisionBody[]; assignment: AssignmentBody }
  | { kind: 'request-placement'; request: Omit<PlacementRequest, 'schema' | 'id' | 'workItem' | 'requester'> }
  | { kind: 'yield-for-providers'; requirements: RequirementId[]; reason: string }
  | { kind: 'request-completion'; summary: string }
  | { kind: 'unresolved'; conflict: string; evidence: string[] };

type EngineerSubmission =                                             // also breaking, verification, repair
  | { kind: 'completion-proposed'; summary: string; findings: string[]; recommendation?: string }
  | { kind: 'contract-needed'; capability: CapabilityId; behavior: NeedAsBehavior }
  | { kind: 'partial'; done: string[]; unfinished: string[]; findings: string[] }   // also the budget report
  | { kind: 'unsuitable'; reason: 'scope' | 'break-discovered' | 'obligation-change' | 'unplaced-need' | 'provider-cannot-conform'; detail: string };

type ContractSubmission =
  | { kind: 'established'; contract: Omit<ContractRecord, 'schema' | 'id' | 'revision' | 'establishedBy'>; changedPaths: string[] }
  | { kind: 'incomplete'; done: string[]; unfinished: string[] }      // registers nothing
  | { kind: 'unsuitable'; reason: 'break-discovered' | 'scope'; detail: string };

interface NeedAsBehavior { useCases: string[]; inputs: string; outputs: string; sideEffects: string; constraints: string[]; existingEvidence: string[] }
```

`DecisionBody`, `OutlineBody` and `AssignmentBody` are the matching records
without the fields the harness assigns: IDs, revisions, hashes, resolved
paths, captured gate and guarded hashes.

`provider-cannot-conform` is offered only to engineers assigned real-provider
obligations. The harness resolves the provider item's current obligation binding, settles
the writer and closes the iteration as `unsuitable`, then records
`revision-needed` and returns to the requesting consumer's local architect.
That architect assigns a contract revision or returns `unresolved`; the report
does not itself alter the agreement. Other roles receive a validation error
for that reason. `obligation-change` remains the general report of an assignment
whose evidence needs revision; it does not claim provider inability.

## The run log

One event envelope, as Plan 1: `{ sequence, jobId, at, type, data }`. Its
`data` holds references and scheduling bindings; the enclosing ledger
transaction also carries every record body committed by that event, as rules
3 and 4 require. The events that commit a record or license an agent are the
core; the plan adds the rest.

| Event | Commits or records | May start |
| --- | --- | --- |
| `job-started` | the start command | initial architect |
| `invocation-started` / `invocation-ended` | `Invocation` / `InvocationOutcome` and the submission hash | — |
| `analysis-accepted` | `EntryAssignments`, every `Hypothesis` rev 1, entry `RegistryEntry`s, entry `WorkItem`s | readiness |
| `readiness-passed` / `readiness-failed` | a `readiness` `GateAttempt` | first local architect |
| `work-item-started` | `WorkItem` state; delivers hypothesis refs | local architect |
| `placement-requested` | `PlacementRequest` | — |
| `view-refreshed` | `ViewIdentity` for the request | global fork |
| `fork-returned-partial` | the partial submission | global fork retry, within the limit |
| `decision-accepted` | `PlacementDecision`, its `RegistryEntry`s and `Hypothesis` revisions | — |
| `brief-appended` | `{ decision, generation, session }` | — |
| `global-context-rebuilt` | `{ generation }` | — |
| `decision-delivered` | `{ decision, workItem }` | local architect |
| `hypotheses-delivered` | `{ workItem, refs }` at a coordination point | — |
| `outline-revised` | `WorkItemOutline` | — |
| `iteration-assigned` | `IterationAssignment`, local `PlacementDecision`s | — |
| `writer-acquired` | `{ invocation, scopeRevision }` | the one writer |
| `writer-released` | `{ invocation, confirmed }`; unconfirmed blocks every writer and gate | — |
| `contract-requested` | a `contract` `IterationAssignment` with `requestedBy` for a sub-session or `revisesContract` for a direct revision | contract engineer |
| `contract-registered` | Initial `ContractRecord`, `ProviderObligation`, `ConsumerRequirement`s and their scheduling bindings and new work items; access-only contracts create no obligation | — |
| `gate-attempted` | `GateAttempt` | engineer repair, or local architect |
| `iteration-closed` | `IterationResult` | local architect |
| `work-item-yielded` | current requirement references waited for | provider work item |
| `work-item-resumed` | the requirements and current provider-conformance gates that permit resumption | consumer local architect, to assign verification |
| `provider-conformed` | `{ obligation: RecordRef, gate }` | — |
| `requirement-verified` | `{ requirement: RecordRef, workItem, gate }`; only the current revision, with no remaining fake injection; the only event that closes a delegation | — |
| `evidence-reopened` | `{ cause, bindings: Array<{ subject: RecordRef, workItem: WorkItemId }> }`, current evidence records, superseded assignment results and follow-up `WorkItem`s in one transaction; a contract revision includes its contract, obligation and every attached requirement | provider work, then consumer verification |
| `revision-needed` | `{ obligation: RecordRef, iteration, consumerWorkItem }`; deduplicated per obligation revision | consumer local architect, even if yielded |
| `dependency-cycle-detected` | `{ cycle: CapabilityId[], requirements: RequirementId[], closedBy: WorkItemId, occurrence }`; a cycle of capabilities, never of modules; a notice for the person | the local architect of `closedBy` |
| `work-item-completed` | `{ workItem, gate }` | next work item |
| `stop-requested`, `job-completed`, `job-failed`, `job-stopped`, `job-interrupted` | as Plan 1; `job-completed` names the `final` gate | — |

`job-completed` requires a passing `final` gate on the current tree, every
work item completed, and every requirement verified at its current contract
revision. An empty queue alone does not satisfy it.

The crash points of the placement chain show how rule 4 recovers:

| Crash after | Recovery |
| --- | --- |
| `placement-requested` | refresh the view again and start a fork |
| `invocation-ended` with a committed decision submission | derive the same decision, registry and revisions; append `decision-accepted` |
| `decision-accepted` | the decision is in `pending`; append the brief keyed by its ID, or rebuild the parent |
| `brief-appended` | append `decision-delivered`; the local architect's next turn receives the decision |

## Observation log

One line per observation, `{ n, at, type, data }`, written by the harness only.
A replayed agent event with the same `(invocation, callId, type)` is dropped,
so replay counts once and a new tool call counts again.

| Type | Data |
| --- | --- |
| `activity` | as Plan 1: read, search, tool, tool-error, message with usage |
| `rejection` | `{ callId, target: 'submission' \| tool name, attempt, errors: [{ path, message }] }`; the input itself is not stored when it may hold file contents |
| `guard` | `{ callId, tool, requested, resolved, owner, scopeRevision, verdict: 'allowed' \| 'blocked-scope' \| 'blocked-unresolved', reason }`; never file contents |
| `mutation` | `{ callId \| null, paths, added, deleted, observedBy: 'tool' \| 'snapshot', toolFailed, attributable }`; when a writer settles, one `snapshot` entry holds the paths `git status` reports since the last accepted commit |
| `hook-check` | `{ paths, mode: 'changed' \| 'complete', outcome: 'passed' \| 'findings' \| 'not-checked', reason, newFindings, log }` |
| `excursion` | `{ callId, module, firstEntry }` for a read outside the declared scope |
| `context` | `{ tokens: number \| null, window, threshold }` after a model or tool boundary; always an estimate, and `null` is unknown, never room |
| `compaction` | `{ trigger: 'threshold' \| 'overflow' \| 'explicit', succeeded, before, after }`; null where unavailable |
| `coverage-gap` | `{ kind: 'unguarded-shell' \| 'changed-paths-unknown' \| 'usage-unavailable' \| 'context-unavailable' \| 'observation-truncated', detail }` |

## Public projections

Exposed from `src/interfaces/protocol/runs.ts`; computed by the harness, never
by a client.

```ts
interface RunSnapshot {                     // extends the job snapshot fields
  phase: 'analysis' | 'readiness' | 'working' | 'final-verification' | 'ended';
  state: JobState; failure: { reason: RunFailureReason; message: string; evidence: string[] } | null;
  current: { workItem?: WorkItemId; iteration?: IterationId; role?: Role; waitingFor?: string } | null;
  counts: { workItems: number; completedWorkItems: number; openRequirements: number };
  /** Things the person must be told, kept for the whole run and after it, resolved or not. */
  notices: Array<
    | { kind: 'module-created' | 'module-removed'; at: string; sequence: number; summary: string;
        module: ModulePath; declaration: string; commit: AcceptedCommit; iteration: IterationId;
        /** The placement decision that proposed it; null when no decision did, which the notice says. */
        decision: DecisionId | null }
    | { kind: 'dependency-cycle'; at: string; sequence: number; summary: string;
        cycle: string[]; closedBy: WorkItemId; resolved: boolean }>;
}

interface CapabilityProgress {
  capability: CapabilityId; entry: boolean;
  tentative: boolean;                       // known from a hypothesis only
  state: 'todo' | 'working' | 'completed';
  reason: string;                           // such as 'waiting for provider ob-send-email'
  dependsOn: Array<{ capability: CapabilityId; tentative: boolean }>;
  workItems: WorkItemId[]; evidence: GateAttemptId[];
}

interface Metric {
  id: string; unit: string; policyVersion: string;
  state: 'measured' | 'partial' | 'unavailable' | 'not-applicable';
  value: number | null; numerator: number | null; denominator: number | null;
  coverage: { covered: number; total: number } | null;
  evidence: string[];
}
```

`completed` requires a verified requirement or a verified reuse at the current
contract revision and a current gate; a fake-backed pass is `working`. A
superseded hypothesis leaves the list without becoming `completed`. A missing
observation yields `unavailable`, never zero.

## Agent port additions

**Superseded by iteration 0.** The contract to implement is section 3 of the
[iteration 0 results](iterations/iteration0-results.md#3-the-port-contract-this-plan-should-implement).
The sketch below is kept as first written; the results revise it in four ways:
a `SessionRef` names a point in a history, `afterMutation` never sees a blocked
call, `tool-finished` gains `reachedTool`, and `settled()` is the harness's.

```ts
type SessionRef = string;                   // opaque to the harness; pi resolves it to its session files

interface SessionSpec {                     // additions
  session: { mode: 'fresh' } | { mode: 'continue'; ref: SessionRef } | { mode: 'fork'; from: SessionRef };
  context: { compaction: 'forbidden' | 'allowed'; thresholdTokens: number | null; reportReserveTokens: number };
  builtinTools: Array<BuiltinTool | 'edit' | 'write'>;
  /** Called before a guarded tool executes. A denial becomes the tool's error result. */
  guard?: (call: { callId: string; tool: string; input: unknown }) => Promise<{ allow: true } | { allow: false; text: string }>;
  /** Called after a mutating tool settles, whether it succeeded or not. */
  afterMutation?: (call: { callId: string; tool: string; failed: boolean }) => Promise<{ text: string } | null>;
}

interface AgentPort {
  startSession(spec: SessionSpec): AgentSession;          // AgentSession gains `ref` and `settled()`
  /** Stores text in a session without a model call. A repeated key is a no-op. */
  appendContext(ref: SessionRef, key: string, text: string): Promise<'appended' | 'already-present' | 'session-lost'>;
}
// AgentEvent gains 'context-observed' and 'compaction'; SessionOutcome gains 'context-budget-reached'.
// 'tool-started' gains `mutating: boolean`: the implementation, not generic harness code, says which of its tools mutate.
// `startSession` reports the session mode that was actual. Token cost, model context usage in tokens and compaction are port events and
// port policy, never prompt text; an implementation that cannot observe one reports it unavailable with a reason,
// and the scripted fake emits all of them.
```

## Tests the records require

Each guards an error that cost cucumber-viz real work; see the
[shortlist](../../cucumber-viz-lessons/mvp-shortlist.md#3-critical-errors-not-to-repeat).

- For every transition, a crash before its log line leaves no trace of it, and
  a crash after it re-materializes every record file on load, without an agent
  call and without a duplicate. A torn last line is discarded.
- For each of the three external effects, a crash between the intent and the
  completion performs the effect again and the key makes it happen once.
- After a crash in the middle of an engineer's work, the next engineer starts
  from the dirty tree.
- Every value of every union is written and read back; an unsupported version
  and an invalid record each surface as a failure with evidence.
- Adding a work item, an iteration or a repair leaves every completed one
  completed.
- No query appends an event.
- For every submission union and every harness tool: an input that breaks the
  schema and one that breaks a rule beyond the schema each change nothing,
  return every error with its path to the same session, and are accepted once
  corrected; the bound ends the invocation as `invalid-submission`.
- A stop that arrives between `invocation-started` and the session's start
  applies to that invocation.
- A denied `edit` or `write` made through the real adapter is blocked for
  every writer role, which shows that the guard is installed.
- A write the guard cannot see appears in `git status` when the writer settles
  and in `outsideScope`.
- A command that leaves a descendant running is settled by its process group;
  no gate or writer starts before that.
- A gate with a missing command or an empty required selection runs nothing
  and records `not-verified`.
- A requirement whose fake is still injected is not verified.
- Change 1 in module A needing change 2 in module B needing change 3 in module
  A, over three capabilities, completes in the order 3, 2, 1 with no cycle and
  no notice; a capability that transitively depends on itself is a cycle.

## Code reused from cucumber-viz

The [shortlist](../../cucumber-viz-lessons/mvp-shortlist.md#2-code-to-lift)
names four pieces, the process-group wrapper script, the command executor,
the clean environment and lexical path containment. Reference copies are in
[reuse/](reuse/README.md). They serve gate commands,
hook checks and the write guard. cucumber-viz is `AGPL-3.0` and ramify-agent
will be `GPL-3.0`; both have one author, who licenses the copied parts under
ramify-agent's license. Each copy carries a provenance comment. None of it
goes into the Ramify toolkit, which will be `MIT`.

<a id="run-the-checks-then-commit"></a>

## Commit, then audit

Decided 2026-09-21, superseding the 2026-09-20 checks-then-commit stand-in.
The target project is a git repository with a clean tree
at `start-run`; readiness refuses anything else. The harness creates the branch
`ramify-agent/run-<run-id>` and works on it. Agents never commit, and the
harness never resets or reverts.

```text
engineer proposes completion, and is idle
  -> the harness verifies the command plan and guarded files
  -> the harness commits the working directory on the run branch
  -> ramify-audit checks that commit in an isolated temporary worktree,
     using registered executors that call the harness's command runner
  -> the audit publishes refs bound to the commit
  -> passed: that audited commit becomes the accepted boundary
  -> failed: the commit remains on the run branch and diagnostics return for repair
```

Readiness and the single engineer session's optional gate do not commit and
continue to run in place. A committing gate whose plan cannot be verified
makes no commit and starts no audit. A changed failing attempt remains in the
branch history; its repair is a later attempt and, when the repair changes the
tree, a later commit. An unchanged retry audits the current head without making
a second commit. The latest passed committing attempt's `audited` hash is the
accepted boundary, whether that attempt made the commit or accepted an existing
head.

The commit is `git add -A` and `git commit` with `--no-verify`,
`--no-gpg-sign` and the harness's own identity, so the project's hooks and the
person's configuration cannot fail it. `git add -A` is safe here: the harness
is the only committer, the branch is its own and the tree was clean at the
start. Commit and audit are one recoverable external effect keyed by the gate
attempt: a repeat finds the commit by its `Ramify-Gate` trailer, cleans up any
inactive owned audit worktree and re-audits the same commit instead of making a
second one. The complete `GateAttempt` is written once after the audit returns.

The harness writes the message mechanically from records. The verdict does not
appear because it postdates the commit; `Audit-Note` gives the retrieval
command. The engineer's words enter only as the `summary` of its validated
submission.

```text
wi-001.i02: send the customer email from the page

<the engineer's `summary` from its accepted submission>

Earlier attempts: ga-0011 failed (in-scope: 2 tests)
Not covered: test:cucumber (one supported runner)

Ramify-Run: 20260920T101500Z-3f9a1c
Ramify-Work-Item: wi-001
Ramify-Iteration: wi-001.i02
Ramify-Gate: ga-0012
Audit-Note: git notes --ref=audit show <commit>
Ramify-Invocations: inv-0012, inv-0014
```

`GateAttempt.commit` names only the commit made by that attempt;
`GateAttempt.audited` names the tree the checks actually ran over, and its
evidence names the published run, report and by-tree refs. A failed audit may
therefore move branch head without moving the accepted boundary. Uncommitted
changes are the work after branch head, while accepted change accounting uses
the preceding and current accepted `audited` hashes. `git status` gives the
changed paths compared with the write scope for `outsideScope`, and
`git diff --numstat` between accepted boundaries gives the line counts of the
KPIs. The run's state directory,
`plans/<plan-id>/.harness/`, carries a `.gitignore` ignoring everything in it,
so the run's own log is never committed.

[Plan 7](../07-commit-audit-integration/main-plan.md) records the adapter,
publication, recovery and conformance decisions. It does not merge the run
branch or otherwise deliver it outside the harness-owned run.

## A created module is always reported

Decided 2026-09-20. Of everything a run decides, what the person must learn at
the end is whether a module was created. The harness finds that out from the
tree, not from what an agent said: when it makes an accepted commit, a
`module.ramify` that the commit adds is a module created, and one it deletes is
a module removed. Each becomes a `module-created` or `module-removed` notice in
the line that closes the iteration, with the module, its declaration's path, the
commit, the iteration and the placement decision that proposed it, or `null`
when none did, which the notice states. The accepted commit's message lists them
too, under `Modules created:`. Notices stay on the Run page's overview during
the run and after it, and the run's terminal event repeats their count.

## The source tree after a crash

Decided 2026-09-20. The source tree is outside every transaction. When the
harness dies while an engineer is editing, the log says that the iteration is
assigned and its writer acquired, and the tree holds whatever was written. The
harness does not restore the tree. The interrupted invocation ends as
`failed` with its interruption, `git status` records what changed, and
the next engineer of the same iteration starts from the dirty tree.
`git diff` shows it exactly the work that is not yet accepted, because every
accepted boundary is a commit. Agents resume well from uncommitted changes. No gate
pass exists for such a tree until a gate runs on it.

## Left to the plan

These serve one state machine and need no early review: readiness step
records, infrastructure-recovery attempts, measurement snapshots and the
`S_s` component recipe, line-event summaries, adaptation causes and the drift
KPIs, protocol commands, queries, error codes and page limits, and the prompt
package manifest.

## Decisions for review

1. **Decided 2026-09-20:** a run is a job and the only kind of job; it takes
   over Plan 1's lifecycle of commands, receipts, versions, stop and recovery.
2. **Decided 2026-09-20:** two logs. Transitions go through the ledger;
   observations are plain append-only JSONL, one log per invocation.
3. **Decided 2026-09-20:** the run log is the transaction (rules 3, 4 and 11). One
   line carries a whole transition; record files are materialized copies.
   SQLite was considered and set aside: it makes only the harness's records
   atomic, and it hides state that agents and people read as files.
4. Every turn ends in a submission, including an engineer asking for a
   contract sub-session, instead of a blocking tool call that runs another
   agent. It removes nested live sessions and makes writer settlement follow
   from idleness plus subprocess confirmation.
5. **Decided 2026-09-20:** a contract sub-session is an iteration of kind
   `contract`.
6. **Decided 2026-09-20:** one provider obligation per contract; consumers attach through
   `ConsumerRequirement`. Shared obligations need nothing further.
7. **Decided 2026-09-20:** a dependency cycle returns once to the local
   architect of the work item that closed it, and the person is told through a
   notice. The run fails only when the same cycle recurs.
8. **Decided 2026-09-20:** the simplest thing. Only placement decisions are
   their own record; every other choice is a field of the record where it is
   made, and the decision list is a mechanical projection. The one thing the
   person must be told at the end is whether a module was created: that is a
   notice, below.
9. **Decided 2026-09-20:** a gate runs the checks in the working directory
   and, when they pass, the harness commits on the run branch with the summary
   of the checks in the message. Nothing is compared or invalidated, so no
   change blocks anything. The commit audit becomes a standalone tool that
   ramify-agent integrates later.
10. **Decided 2026-09-20:** one work item per entry capability, always. No
    grouping field and no judgment; grouping is a later addition.
11. **Decided 2026-09-20:** the mapping job is converted into the run's initial
    analysis, and the implementation map, its approval, its protocol and its
    pages are removed.
12. **Decided 2026-09-20:** engineers have a shell in the MVP. It is a harness
    tool, `shell`, and pi's own `bash` stays withheld, which the spike verified
    is possible. The harness tool runs the command through the lifted executor:
    its own process group, a clean environment, a timeout and a bounded output
    tail, with the command text recorded as an observation. Settlement then
    kills groups the harness itself started, and rule 10 covers the tool's
    input. What the shell writes is not guarded: it is seen afterwards in
    `git status`, reported in `outsideScope`, and counted as the
    `unguarded-shell` coverage gap. `run_scope_tests` stays, since it runs
    exactly the gate's selection.
