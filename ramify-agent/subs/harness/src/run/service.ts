import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { AgentPort, AgentSession, JsonSchema, SessionSpec, SessionStart } from '../../subs/agent/src/interfaces/port.js';
import { gitCandidateSource, gitService, GitError, type CandidateSource, type GitService } from '../../subs/evidence/src/git.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { projectConfigurationFile } from '../../subs/evidence/src/project-configuration.js';
import { coverageLimitsOf, findModule, readArchitectMeta, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { GateAttempt, GateRuleRecord, TestSelectionPolicy } from '../checks/records.js';
import { acceptedCommit } from '../checks/accepted.js';
import { inPlaceCheckExecution, type CheckExecutionPort } from '../checks/execution.js';
import { executePreparedGate, type PreparedGate } from '../checks/gate.js';
import { resolveTestSelection } from '../checks/selection.js';
import {
  planScenarioFindings, scenarioGatesToRead, scenarioObservations,
  type GateCheckFindingOutcome, type ScenarioFindingNote, type ScenarioGateInputs, type ScenarioObservation,
} from '../checks/scenario-findings.js';
import type { GuardedScope } from '../guard/write-guard.js';
import { ExcursionWatcher } from './excursions.js';
import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import type {
  CheckFindingAt, CheckFindingCommand, CheckFindingGround, CheckFindingId, CheckFindingQueryInput, CheckFindingReportCredibility, CheckFindingRisk,
  CheckFindingSelection, CheckFindingState, CheckFindingSummary,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { CheckFindingCause } from '../check-findings/records.js';
import { checkFindingStateOf } from '../check-findings/state.js';
import {
  commitCheckFindingChange, decideCheckFindingTransaction, type CheckFindingBuild, type CheckFindingCommit,
} from '../check-findings/transition.js';
import {
  attentionAt, basisChange, briefText as reconciliationBrief, needsLaterRound, reconciliationAssessmentSchema, reconciliationBasisSchema,
  reconciliationId, reconciliationJsonSchema, reconciliationLayout, reconciliationSubmissionDescription, reconciliationToolName, roundFloor,
  validateReconciliation,
  type AttentionEntry, type BasisRequest, type BoundReconciliation, type BriefAppendOutcome, type ReconciliationAssessment,
  type ReconciliationBasis, type ReconciliationSubmission, type UnresolvedReason,
} from '../reviews/reconciliation.js';
import { reconciliationMessage, type PacketRequest, type ReconciliationPacket } from '../reviews/reconciliation-message.js';
import { recordSettledSnapshot } from './mutations.js';
import { reportCommand, type BoundReport } from '../check-findings/report.js';
import { userCheckFindingChange, userRejectionCode } from '../check-findings/user-commands.js';
import type { CheckFindingUserCommand } from '../interfaces/protocol/check-findings.js';
import { canonicalJson } from '../jobs/commands.js';
import {
  concernKey, reviewAttemptId, reviewAttemptSchema, reviewLayout, reviewOrientationSchema, reviewRequestId, reviewRequestSchema, reviewSchemas,
  type ForkPoint, type NotVerifiedReason, type OrientationSubmission, type ReviewAttempt, type ReviewOrientation, type ReviewRequest,
  type ReviewResult, type ReviewSubmission, type ReviewSubmissionRecord,
} from '../reviews/records.js';
import { orientationKey, planExcerpts, readGuidance, type CapturedInput } from '../reviews/inputs.js';
import { orientationMessage, reviewMessage } from '../reviews/message.js';
import { ReviewQueue } from '../reviews/scheduler.js';
import { candidateModuleIndex, concernModules, groundCredibility } from '../reviews/signals.js';
import { openCandidateSnapshot, resolveSnapshotPath, snapshotTools, type CandidateSnapshot, type SnapshotTools } from '../reviews/snapshot.js';
import { reviewCoverage, reviewStateOf, unsettledRequests, type ReviewCoverage } from '../reviews/state.js';
import {
  orientationJsonSchema, orientationSubmissionDescription, orientationToolName, reviewJsonSchema, reviewSubmissionDescription,
  reviewToolName, validateOrientation, validateReview,
} from '../reviews/submission.js';
import type { AcceptedCommand, Receipt } from '../interfaces/protocol/jobs.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import type { Role, RunCommand, RunFailureReason } from '../interfaces/protocol/runs.js';
import { CommandLedger, CommandRejection } from '../jobs/commands.js';
import { commitRecord, readCommitted, recoverCommits, type RecordRef as CommitRecord } from '../jobs/commit.js';
import { Mutex, PriorityMutex } from '../jobs/mutex.js';
import { declaredSchemaOf, jobSchemaVersion, listJobDirectories, newJobId, planStateDirectory } from '../jobs/records.js';
import { ensureStateDirectory } from '../store/state-directory.js';
import { planPath, readPlan } from '../plans/discover.js';
import {
  inputsHash, loadPromptPackages, renderContractPrompt, renderEngineerPrompt, renderGlobalForkPrompt,
  renderInitialArchitectPrompt, renderLocalArchitectPrompt, renderOrientationPrompt, renderReconciliationPrompt, renderReviewerPrompt, sha256,
  type LoadedPackage,
} from '../prompts/packages.js';
import { baselineScope, captureSnapshot, rootModuleOfSnapshot, scopeSize, supportDocument } from '../kpi/capture.js';
import { lineEvents, takeLineSnapshot, type LineSnapshot } from '../kpi/lines.js';
import { writeFileAtomic, writeFileExclusive } from '../../subs/ledger/src/atomic.js';
import type { ProjectLock } from '../store/lock.js';
import { acceptAnalysis } from '../analysis/accept.js';
import { acceptDecision } from '../architecture/accept.js';
import { briefText, globalContext, orientation, type GlobalContext } from '../architecture/context.js';
import {
  architectureLayout, architectureSchemas, globalDecisionId, localDecisionId, placementRequestSchema, requestId,
  type PlacementDecision, type PlacementRequest,
} from '../architecture/records.js';
import { forkMessage } from '../architecture/session.js';
import {
  forkJsonSchema, forkToolName, validateFork,
  type ForkSubmission, type PlacementEvidence, type PlacementRequestBody,
} from '../architecture/submission.js';
import { describePlan, initialAnalysisJsonSchema, initialAnalysisToolName, validateInitialAnalysis, type InitialAnalysisSubmission } from '../analysis/submission.js';
import { registerContract, registrationNeeded, type AttachedConsumer } from '../contracts/accept.js';
import { cycleClosedBy, cycleIdentity, type DependencyCycle, type DependencyEdge } from '../contracts/graph.js';
import { fakeNamingViolations, type NamedFile } from '../contracts/naming.js';
import {
  contractId, contractOfObligation, contractsLayout, obligationId, requirementId,
  type ConsumerRequirement, type ContractRecord, type ProviderObligation,
} from '../contracts/records.js';
import {
  bindingKey, conformanceKey, nextWorkItem, openRequirements, providerItemOf, verificationKey,
  type ScheduleState,
} from '../contracts/schedule.js';
import { reopenEvidence, type SchedulingBinding } from '../contracts/revision.js';
import { contractMessage, type RevisionBriefing } from '../contracts/session.js';
import {
  contractJsonSchema, contractToolName, validateContract,
  type ContractSubmission, type EstablishedContract, type NeedAsBehavior,
} from '../contracts/submission.js';
import { remainingInjections } from '../contracts/verification.js';
import type { Hypothesis, RegistryEntry } from '../analysis/records.js';
import { creationAuthority } from '../work/assignment.js';
import { engineerEquipment, type EngineerEquipment, type EngineerEquipmentInputs, type EquipContext, type Equipment } from '../work/engineer-equipment.js';
import {
  engineerJsonSchema, engineerSubmissionDescription, engineerToolName, iterationAcceptance, iterationMessage,
  validateEngineer, type EngineerSubmission, type IterationApiViews,
} from '../work/engineer.js';
import {
  iterationAssignmentSchema, iterationId, iterationLayout, iterationResultSchema, iterationSchemas, moduleNoticeSchema,
  workItemOfIteration,
  type IterationAssignment, type IterationResult, type ModuleNotice,
} from '../work/iterations.js';
import { resolveRealTarget } from '../guard/resolve-contained-path.js';
import {
  captureGuardedFiles, checkpointOf, deniedFiles, guardedScopeOf, resolveWriteScope, scopePaths, scopeProbePolicyOf, testPolicyOf,
  type GuardedScenarioFiles,
} from '../work/scope.js';
import { committedRecords, refOf } from '../work/committed.js';
import { capabilityOf, frontierOrder, hypothesesFor } from '../work/frontier.js';
import { integrationScenarioOf, originKindOf, workLayout, workItemId, workItemOutlineSchema, type WorkItem, type WorkItemOutline } from '../work/records.js';
import { apiViewsOf, iterationApiViews, onboardingOf, workItemMessage, type DelegationBriefing, type ReconciliationBriefing } from '../work/session.js';
import { localArchitectJsonSchema, localArchitectToolName, validateLocalArchitect, type LocalArchitectSubmission } from '../work/submission.js';
import { gateDiagnostics, scenarioCheckLines, type GateAudience } from '../checks/diagnostics.js';
import { commitForGate, commitMessage, prepareCheckpoint, type CheckpointRequest } from './gates.js';
import { capturePlan, EvidenceUnavailableError, type RunInputs } from './inputs.js';
import { extractPlanScenarios, type PlanScenarioExtraction } from '../../subs/scenarios/src/extraction.js';
import type { RenderedFeatureFile } from '../../subs/scenarios/src/rendering.js';
import { planScenarioCheck, type ScenarioCheckInputs } from '../checks/checkpoint.js';
import { RunLog, type RunEvent, type RunEventInput, type RunEventOf } from './log.js';
import type { Transaction } from '../../subs/ledger/src/ledger.js';
import { ObservationLog } from './observations.js';
import { endedOf, InvocationBounds, PortEventRecorder } from './port-events.js';
import { contextPolicyOf, defaultRunPolicy, discoverNestedPackages } from './policy.js';
import { captureProjectConfig, scenarioModules, supportFiles } from './project-config.js';
import {
  commitForMaterialization, commitForScenarios, contentHash as featureContentHash, expectedFeatureFiles, expectedFeatureHashes, materializationMessage, rerenderFeatureFiles,
  incompleteScenarios, trackedScenarios, withdrawalMessage, withdrawnTrailerValue, withStates, writtenScenarios,
  type FeatureRerendering,
} from './feature-files.js';
import type { ScenarioState } from '../../subs/scenarios/src/states.js';
import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { scenariosToDeclare, type DeclarationContext } from '../work/declarations.js';
import { dueIntegrations, integrationBriefing, integrationWorkItem, type IntegrationBriefing } from '../work/integration.js';
import { entryScenariosOf, type EngineerScenarios } from '../work/scenario-briefing.js';
import { bridgingGivens, compositionFailures } from '../../subs/scenarios/src/composition.js';
import { failingStep, performRecovery, readinessFailureReason, recoveryFor, runReadiness, withRecovery } from './readiness.js';
import {
  gateAttemptId, invocationId, invocationOutcomeSchema, invocationSchema,
  recoveryId, runDirectory, runLayout, runRecordSchema, runSchemas, sessionId, snapshotId,
  type GateOperation, type Invocation, type InvocationOutcome, type MeasurementSnapshot, type RecordRef, type RunPolicy, type RunRecord,
  type ArchitectRef, type ReviewKind, type ContinueReason, type ContinueRelation, type DegradeRelation, type ForkRelation, type ReplaceRelation,
  type RequestRelation, type SessionFinishReason, type SessionId,
} from './records.js';
import { reduceSessions, type RunSessions } from './sessions.js';
import { runSnapshot, type RunSnapshot } from './snapshot.js';
import { InvocationTranscript, recordAppend, verdictNote } from '../transcripts/recorder.js';
import { ContentStore } from '../transcripts/store.js';
import { TranscriptWriter } from '../transcripts/writer.js';
import { SubmissionJudge, type SubmissionValidation } from './submissions.js';
import { nodeProcessGroups, WriterBlockedError, WriterOwnership, type ProcessGroups, type TreeObserver } from './writer.js';

/*
 * The implementation runs of one project: their commands, their lifecycle,
 * their recovery and the queries that read them.
 *
 * The run's `events.jsonl` is its only authority. Every transition is one
 * flushed append that carries the bodies of every record it commits, and the
 * record files beneath the run are materialized copies of it. An event that
 * licenses an agent is appended before the agent starts; the event that
 * closes work is the last write of that work.
 *
 * This iteration invokes exactly one role, the initial architect, then
 * verifies readiness and the final composition. Work items, iterations and
 * writers arrive with the iterations that build them; the writer's ownership
 * and settlement are here already, because no gate may run against a tree
 * something might still be writing.
 */

/** One durable boundary a test can freeze the run at, as a crash would. */
export type RunWrite =
  | 'job-created'
  | 'contract-requested'
  | 'contract-registered'
  | 'work-item-yielded'
  | 'work-item-resumed'
  | 'provider-conformed'
  | 'requirement-verified'
  | 'evidence-reopened'
  | 'revision-needed'
  | 'dependency-cycle-detected'
  | 'session-opened'
  | 'invocation-started'
  | 'invocation-ended'
  | 'session-finished'
  | 'analysis-accepted'
  | 'readiness-attempted'
  | 'scenarios-materializing'
  | 'scenarios-committed'
  | 'scenarios-materialized'
  | 'work-item-started'
  | 'hypotheses-delivered'
  | 'placement-requested'
  | 'view-refreshed'
  | 'fork-returned-partial'
  | 'decision-accepted'
  | 'brief-appending'
  | 'brief-appended'
  | 'decision-delivered'
  | 'outline-revised'
  | 'iteration-assigned'
  | 'writer-acquired'
  | 'writer-released'
  | 'iteration-closed'
  | 'work-item-completed'
  | 'gate-attempted'
  | 'gate-committing'
  | 'gate-committed'
  | 'job-completed';

export interface RunServiceOptions {
  /** External command execution. Tests script outcomes; actual process tests use the default. */
  readonly commandExecution?: CommandRunner | undefined;
  readonly projectRoot: string;
  /** The project lock, held for as long as the service runs. */
  readonly lock: ProjectLock;
  /** The agent that runs the run's sessions. Without one, a start is refused as unavailable. */
  readonly agent?: AgentPort | undefined;
  /** The model the agent was asked to run, recorded with each session; without one, the agent chose its own. */
  readonly model?: string | undefined;
  /** The evidence side of a run: its manifest, the view its analysis is checked against, and its inputs. */
  readonly inputs: RunInputs;
  /** The Ramify command line the run's readiness and measurements use. */
  readonly ramify: RamifyCli;
  /** External Git operations. Lifecycle tests supply scripted answers, like their agent port. */
  readonly git?: GitService | undefined;
  /** Where a review reads its frozen candidate from: Git's objects by default; tests script it like Git. */
  readonly candidates?: CandidateSource | undefined;
  /** How committing checkpoint commands run. */
  readonly checkExecution: CheckExecutionPort;
  /**
   * How readiness commands run: in place by default, which is what a run
   * over a real project does. A lifecycle test whose subject is the run's
   * state machine, and which must start no process, supplies a direct port;
   * readiness discovery, classification and recovery are unaffected.
   */
  readonly readinessExecution?: CheckExecutionPort | undefined;
  /** The policy the run captures. Without one it is the hardcoded default over this project. */
  readonly policy?: ((projectRoot: string, nested: Awaited<ReturnType<typeof discoverNestedPackages>>) => RunPolicy) | undefined;
  /** The module the baseline is frozen over; the architect view's root by default. */
  readonly rootModule?: string | undefined;
  /** How long a stop waits for the session before the run is marked stopped anyway. */
  readonly stopGraceMs?: number | undefined;
  /** The skill directory of the prompt packages, for a test that supplies its own. */
  readonly skillDirectory?: string | undefined;
  /** The operating system, as writer settlement uses it. */
  readonly groups?: ProcessGroups | undefined;
  /** Called after each durable write; tests freeze a run there, as a crash would. */
  readonly afterWrite?: ((write: RunWrite, runId: string) => Promise<void>) | undefined;
  /** The wall clock. Tests control it at invocation boundaries. */
  readonly now?: (() => Date) | undefined;
  readonly warn?: ((message: string) => void) | undefined;
}

/** What a recovery did with each run it found without a terminal event. */
export interface RunRecoveryReport {
  readonly interrupted: string[];
  /** Runs whose record files were missing or differed from the log, and were rewritten. */
  readonly rematerialized: string[];
  /** External effects whose intent had no completion, performed again under their key. */
  readonly effects: string[];
  /** Invocations whose start had no end: closed as interrupted, with no agent call. */
  readonly invocations: string[];
  /** Run directories that could not be loaded and are not served. */
  readonly skipped: string[];
  /** Review requests an accepted iteration was owed and recovery recorded, and attempts it finished as not verified. */
  readonly reviews: string[];
}

const key = (planId: string, runId: string) => `${planId}/${runId}`;

/** What one invocation is: its role, its work, its prompt and the one submission it may make. */
interface InvocationRequest<T> {
  readonly role: Role;
  readonly work: Invocation['work'];
  /** The count of this role's invocations for this work, this one included. */
  readonly attempt: number;
  readonly loaded: LoadedPackage;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly start: SessionStart;
  readonly toolName: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  /** The schema literal the stored submission declares; the agent never supplies it. */
  readonly submissionSchema: string;
  readonly validate: (input: unknown) => SubmissionValidation<T> | Promise<SubmissionValidation<T>>;
  /**
   * What an accepted submission is answered with. Without it the agent
   * implementation's own acknowledgement is used, which knows nothing of the
   * kind that was submitted.
   */
  readonly acceptedText?: ((value: T) => string) | undefined;
  readonly scope: Invocation['scope'];
  /** Whether this invocation holds the run's one writer. */
  readonly writer?: boolean | undefined;
  /**
   * The scope this invocation may write, where it has one. The guard needs
   * it, and so do the two observations that read the tree afterwards: the
   * snapshot of what changed while the writer held it, and the reads that
   * left the scope.
   */
  readonly guarded?: GuardedScope | undefined;
  /**
   * What this role is given beyond reading and its submission tool: the
   * implementation's own mutating built-ins, the harness's own tools, and
   * the guard each mutating call passes. It is built once, with the
   * invocation's own observation log, so that everything the session does is
   * recorded against the invocation that did it.
   */
  readonly equip?: ((session: EquipContext) => Equipment) | undefined;
  /** A session that ended for a reason only the caller can name, such as a tool's exhausted bound. */
  readonly endedAs?: (() => InvocationOutcome['ended'] | undefined) | undefined;
  /**
   * Whether this invocation is a reader beside the writer: it holds no
   * writer, a run-wide bound it meets refuses it without failing the run,
   * and a session of it that does not become idle blocks no writer, since it
   * was given nothing that writes or starts a process.
   */
  readonly reader?: boolean | undefined;
  /** The session's working directory; the project root when absent. A reader's is an empty directory of its own. */
  readonly workingDirectory?: string | undefined;
  /** A tighter absolute bound than the run policy's, such as a review attempt's. */
  readonly absoluteMs?: number | undefined;
  /** Called once `invocation-started` is committed and before the session starts, such as to commit what the invocation is for. */
  readonly onStarted?: ((invocation: string, session: SessionId) => Promise<void>) | undefined;
  /**
   * Whether the invocation, once started, ends at once as stopped with no
   * session: a reader whose request its work item's deadline settled while
   * it was being started. Asked after `onStarted`.
   */
  readonly fenced?: (() => boolean) | undefined;
  /** A session mode the caller could not honor, recorded on the invocation. */
  readonly degraded?: { readonly requested: 'fresh' | 'continued' | 'fork'; readonly reason: string } | undefined;
  /** The session a continued start joins; a fresh or forked start opens a new one. */
  readonly session?: SessionId | undefined;
  /**
   * Why a continued start continues its session; required with one. The
   * point it continues from is the session's latest, which the log holds.
   */
  readonly continuing?: ContinueReason | undefined;
  /** The harness point a forked start forks, and why; required with one. */
  readonly fork?: ForkRelation | undefined;
  /** The session a session this invocation opens takes the place of. */
  readonly replaces?: ReplaceRelation | undefined;
  /** The invocation whose result asked for the session this invocation opens. */
  readonly requestedBy?: RequestRelation | undefined;
  /**
   * Whether the harness keeps the session once this invocation ends: kept,
   * to continue it or append to it, or finished with the reason. It is
   * answered from how the invocation ended and what it submitted, before the
   * end is recorded. A run that is ending finishes it as `run-ended`,
   * whatever this answers.
   */
  readonly keep: (ended: InvocationOutcome['ended'], value: T | undefined) => SessionKeeping;
}

/** What the harness does with a session when one of its invocations ends. */
type SessionKeeping = { readonly kept: true } | { readonly kept: false; readonly finished: SessionFinishReason };

const kept: SessionKeeping = { kept: true };
const finished = (reason: SessionFinishReason): SessionKeeping => ({ kept: false, finished: reason });

/** The reconciliation rounds of a run whose policy predates them. */
const defaultReconciliationRounds = 3;

/**
 * The local architect's own session while its work item reconciles: the
 * harness's session and the executor's latest point, which a brief append
 * moves, and the rounds whose brief did not land, which its next input carries.
 */
interface ParentSession {
  session: SessionId | undefined;
  ref: string | undefined;
  readonly undelivered: string[];
}

/**
 * What a work item's completion is validated against before
 * `work-item-completed`: the source, the settled requests and the attention
 * set its last reconciliation left, and whether decisions were made against
 * that source, which its scenario-rendering lineage must then preserve.
 */
interface CompletionBasis {
  readonly commit: string;
  readonly requests: readonly BasisRequest[];
  readonly checkFindings: readonly CheckFindingAt[];
  readonly decided: boolean;
}

/** What a reconciliation leads to: the work item's gate, or a correction its architect assigns. */
type Reconciled =
  | { readonly kind: 'gate'; readonly basis: CompletionBasis }
  | { readonly kind: 'correct'; readonly reconciliation: string };

/** What a reconciliation brief's append did; the completion of its effect. */
interface BriefAppend {
  readonly session: SessionId | null;
  readonly ref: string | null;
  readonly outcome: BriefAppendOutcome;
  readonly reason: string | null;
}

/** An assessment whose basis no longer held when it was to be committed; nothing was appended. */
class AssessmentRefusedError extends Error {}

/**
 * What one iteration ended with: the result that closed it, and the need it
 * reported where the behavior it required is owned outside its scope.
 */
/** What one contract iteration ended with: its result, and what its registration found. */
interface ContractOutcome {
  readonly findings: string[];
  /** The iteration result, where this outcome closed one. */
  readonly result?: IterationResult | undefined;
  /** A cycle this registration closed, delivered once to the local architect. */
  readonly cycle?: DependencyCycle | undefined;
}

interface IterationOutcome {
  /** Set where the iteration reported that the provider cannot conform. */
  readonly reportedRevision?: boolean | undefined;
  readonly result: IterationResult;
  /**
   * The gate that returned this iteration to the local architect, with what
   * each failing command reported. It is not in the result record: the
   * record holds the findings, and this is the diagnosis the next architect
   * briefing carries.
   */
  readonly returnedGate?: { readonly id: string; readonly cause: string | null; readonly summary: readonly string[] } | undefined;
  readonly need?: {
    readonly need: NeedAsBehavior;
    readonly suggestedProvider?: string | undefined;
    readonly invocation: string;
  } | undefined;
}

/** What one invocation ended with. `value` is present only for an accepted submission. */
interface InvocationResult<T> {
  readonly id: string;
  readonly ended: InvocationOutcome['ended'];
  readonly value: T | undefined;
  /** The point the session's history reached, for a turn that continues it. */
  readonly ref: string;
  readonly outcomeKind: string;
  /** The session the invocation belongs to; empty where no invocation started. */
  readonly session: SessionId;
  /** Whether the harness kept the session to use it again. */
  readonly kept: boolean;
  /** The bound or fault that interrupted it, where one did. */
  readonly interruption?: InvocationOutcome['interruption'];
  /** The mode the executor actually started the session in; absent where none started. */
  readonly actual?: 'fresh' | 'continue' | 'fork' | undefined;
}

/** One invocation the run has open: the writer or a reader, and its session once it started. */
interface LiveInvocation {
  readonly role: Role;
  readonly reader: boolean;
  session: AgentSession | undefined;
  readonly done: Promise<void>;
}

class Run {
  readonly mutex = new Mutex();
  /**
   * Serializes the start of invocations: each one's identifier and its
   * session's are counted from the log, so two starts must not count the
   * same prefix. Nothing slow runs under it. A writer's start waiting here
   * goes before every reader's: the writer has scheduling priority.
   */
  readonly starting = new PriorityMutex();
  /** Every invocation the run has open, by ID: at most one writer, and the readers beside it. */
  readonly live = new Map<string, LiveInvocation>();
  stopRequested: boolean;
  /** Settles when the run's driver has nothing left to do. */
  done: Promise<void> = Promise.resolve();
  /** The run's review readers, once it reviews; undefined for a run whose policy requests none. */
  reviews: ReviewQueue | undefined;
  /** Why the run stopped its readers, which a reader stopped for it records as its attempt's reason. */
  readerStop: NotVerifiedReason | undefined;
  /** When the run's reviews must be settled by, once its final settlement began; epoch milliseconds. */
  settleDeadline: number | undefined;
  /** The design orientations being made, by key, so that two attempts of one key make it once. */
  readonly orienting = new Map<string, Promise<ReviewOrientation>>();
  /** The commit-and-audit effect in flight, which the run's terminal event waits for. */
  gating: Promise<unknown> | undefined;
  /** The writer of the run; one at a time, and the log says which. */
  readonly writer: WriterOwnership;
  index: ArchitectIndex | null = null;
  /** Wakes a driver waiting at the review stop, to read the log again. */
  private wake: (() => void) | undefined;
  /** The content store the run's transcripts name their large bodies in. */
  readonly store: ContentStore;
  /** One transcript writer per session, so each session's entries keep one order. */
  readonly transcripts = new Map<SessionId, TranscriptWriter>();

  constructor(
    readonly record: RunRecord,
    readonly directory: string,
    readonly log: RunLog,
    readonly base: string,
    writer: WriterOwnership,
  ) {
    this.writer = writer;
    this.stopRequested = log.find('stop-requested') !== undefined;
    this.store = new ContentStore(join(directory, runLayout.blobs));
  }

  get key(): string {
    return key(this.record.planId, this.record.jobId);
  }

  /** The sessions of every open invocation, the writer's and the readers'. */
  sessions(filter: (live: LiveInvocation) => boolean = () => true): AgentSession[] {
    return [...this.live.values()].filter(filter).flatMap(live => (live.session === undefined ? [] : [live.session]));
  }

  /** Settles once the driver, every open invocation and every review attempt have finished. */
  async idle(): Promise<void> {
    await this.done;
    await this.reviews?.settled();
    while (this.live.size > 0) await Promise.all([...this.live.values()].map(live => live.done));
  }

  /** Settles at the next `notify`: an approval, a stop or the service closing. */
  changed(): Promise<void> {
    return new Promise(resolve => { this.wake = resolve; });
  }

  notify(): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }

  /** An absolute path beneath the run's directory, from a layout path. */
  path(relative: string): string {
    return join(this.directory, relative);
  }
}

export class RunService {
  private readonly runs = new Map<string, Run>();
  private readonly commands = new CommandLedger();
  private readonly commandMutex = new Mutex();
  private closed = false;
  private closing: Promise<void> | undefined;

  private readonly git: GitService;
  private readonly candidates: CandidateSource;

  private constructor(private readonly options: RunServiceOptions) {
    this.git = options.git ?? gitService;
    this.candidates = options.candidates ?? gitCandidateSource;
  }

  /**
   * Loads every run of the project and recovers those without a terminal
   * event, under the project lock the caller holds. Recovery replays each
   * log, rewrites every record file that is missing or differs, performs
   * again each external effect whose intent has no completion, closes an
   * invocation whose start has no end, and marks the run interrupted. It
   * calls no agent and makes no duplicate.
   */
  static async open(options: RunServiceOptions): Promise<{ service: RunService; recovery: RunRecoveryReport }> {
    const service = new RunService(options);
    const recovery = await service.load();
    return { service, recovery };
  }

  get projectRoot(): string {
    return this.options.projectRoot;
  }

  private warn(message: string): void {
    (this.options.warn ?? console.warn)(message);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private async afterWrite(write: RunWrite, runId: string): Promise<void> {
    await this.options.afterWrite?.(write, runId);
  }

  /**
   * One run-log write, serialized with every other. The event is built
   * inside the lock, so its sequence is the one the ledger gives its line
   * and two writes can never disagree about it. A terminal log accepts
   * nothing more: the event that ends a run is its last write.
   */
  private write(run: Run, input: RunEventInput, records: readonly CommitRecord[] = [], at?: Date): Promise<'committed' | 'already-committed' | 'ended'> {
    return run.mutex.run(async () => {
      if (run.log.terminal) return 'ended';
      if (records.length === 0) {
        await run.log.append(input, at);
        return 'committed';
      }
      return commitRecord(run.log.ledger, { event: run.log.next(input), records: [...records] });
    });
  }

  /**
   * The run's terminal event, with a `session-finished` before it for every
   * session the run still holds and awaits no invocation of: each one it
   * kept, as `run-ended`, and one opened whose first invocation never
   * started, for `opening`'s reason. They are one serialized write, so no
   * invocation can start between them, and a final run holds no suspended
   * session. A session whose invocation is still awaited is left live: its
   * end is that invocation's own.
   */
  private async endRun(run: Run, terminal: RunEventInput, opening: SessionFinishReason = 'run-ended'): Promise<'committed' | 'ended'> {
    // A gate's commit and audit run outside the mutex; its attempt is
    // committed before anything ends the run, as when the mutex held it.
    await run.gating?.catch(() => undefined);
    return run.mutex.run(async () => {
      if (run.log.terminal) return 'ended';
      const sessions = this.sessionsOf(run);
      for (const session of sessions?.values() ?? []) {
        const reason = session.state === 'suspended' ? 'run-ended' : session.state === 'live' && session.awaiting === null ? opening : null;
        if (reason !== null) await run.log.append({ type: 'session-finished', data: { session: session.id, reason } });
      }
      await run.log.append(terminal);
      return 'committed';
    });
  }

  /**
   * Releases a session the harness kept and will not use again. A session
   * that is not suspended is left alone: it was finished when its last
   * invocation ended, or the run has ended.
   */
  private async finishSession(run: Run, session: SessionId | undefined, reason: SessionFinishReason): Promise<void> {
    if (session === undefined) return;
    const written = await run.mutex.run(async () => {
      if (run.log.terminal || this.sessionsOf(run)?.get(session)?.state !== 'suspended') return false;
      await run.log.append({ type: 'session-finished', data: { session, reason } });
      return true;
    });
    if (written) await this.afterWrite('session-finished', run.record.jobId);
  }

  /**
   * What a continued invocation continues from: its session's latest point,
   * the end of its previous invocation or an append since, and the briefs
   * appended since that invocation ended. An executor's ref is never read
   * for it.
   */
  private continuationOf(run: Run, session: SessionId, reason: ContinueReason): ContinueRelation {
    const point = this.sessionsOf(run)?.get(session)?.point ?? null;
    if (point === null) throw new Error(`Run ${run.record.jobId}: ${session} has no point to continue from`);
    const ended = run.log.all('invocation-ended').filter(event => event.data.session === session).at(-1)?.sequence ?? 0;
    const briefs = run.log.all('brief-appended')
      .filter(event => event.data.session === session && event.sequence > ended)
      .map(event => event.data.decision);
    // A reconciliation's brief is appended to the local architect's own
    // session; the append is the executor's and names no harness point.
    const reconciled = run.log.all('reconciliation-brief-appended')
      .filter(event => event.data.session === session && event.sequence > ended && (event.data.outcome === 'appended' || event.data.outcome === 'already-present'))
      .map(event => event.data.reconciliation);
    return { from: point, reason, briefs: [...briefs, ...reconciled] };
  }

  /** The transcript of one of the run's sessions. */
  private transcriptOf(run: Run, session: SessionId): TranscriptWriter {
    let writer = run.transcripts.get(session);
    if (writer === undefined) {
      writer = new TranscriptWriter({
        session,
        path: run.path(runLayout.transcript(session)),
        root: run.directory,
        store: run.store,
        inlineBytes: run.record.policy.transcript.inlineBodyBytes,
        now: () => this.now(),
      });
      run.transcripts.set(session, writer);
    }
    return writer;
  }

  /**
   * What one invocation writes to its session's transcript. An entry that
   * could not be written is a coverage gap in the invocation's own
   * observations, and never fails the invocation.
   */
  private invocationTranscript(run: Run, session: SessionId, invocation: string, observations?: ObservationLog): InvocationTranscript {
    return new InvocationTranscript(this.transcriptOf(run, session), invocation, async detail => {
      const log = observations ?? await ObservationLog.open(run.path(runLayout.observations(invocation)));
      await log.record({ type: 'coverage-gap', data: { kind: 'transcript-incomplete', detail } });
    });
  }

  /** The run's sessions as its log derives them, or undefined, with a warning, where the log breaks the lifecycle. */
  private sessionsOf(run: Run): RunSessions | undefined {
    try {
      return reduceSessions(run.log.events);
    } catch (error) {
      this.warn(`Run ${run.record.jobId}: its sessions cannot be derived: ${message(error)}`);
      return undefined;
    }
  }

  // Reviews

  /**
   * The run's review readers, created when its driver starts for a run whose
   * policy requests reviews. Each wake starts what the policy has room for.
   */
  private startReviews(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>): void {
    const policy = run.record.policy.reviews;
    if (policy === undefined || run.reviews !== undefined) return;
    run.reviews = new ReviewQueue({
      concurrency: policy.concurrency,
      queue: policy.queue,
      unsettled: () => unsettledRequests(run.log.events).map(request => request.id),
      attempt: request => this.runReviewAttempt(run, agent, packages, request),
      overflow: async request => {
        await this.finishUnsettledReviews(run, () => ({ reason: 'queue-overflow', detail: `More than ${policy.queue} review requests were waiting; this one was not run` }), [request]);
      },
      deadline: request => this.reviewDeadline(run, request),
      attemptMs: policy.attemptMs,
      expire: async request => {
        await this.finishUnsettledReviews(run, () => ({
          reason: 'no-time-before-deadline',
          detail: `An attempt may run ${policy.attemptMs} ms, and its reviews must be settled by ${new Date(this.reviewDeadline(run, request) ?? 0).toISOString()}; none was started`,
        }), [request]);
      },
      now: () => this.now().getTime(),
      warn: text => this.warn(`Run ${run.record.jobId}: ${text}`),
    });
    run.reviews.wake();
  }

  /**
   * When a request must be settled by: its work item's first completion
   * request after it was recorded, plus the policy's settlement bound, or
   * the run's own settlement deadline once that began, whichever is
   * earlier. Null while neither applies. Read from the log each time.
   */
  private reviewDeadline(run: Run, id: string): number | null {
    const policy = run.record.policy.reviews;
    if (policy === undefined) return null;
    const recorded = run.log.all('review-request-recorded').find(event => event.data.request === id);
    if (recorded === undefined) return null;
    // Only the revision that commits a completion request carries the
    // architect's point after it, null or not.
    const completion = run.log.all('outline-revised')
      .find(event => event.data.workItem === recorded.data.workItem && event.sequence > recorded.sequence && event.data.architectRef !== undefined);
    const deadlines = [
      ...(completion === undefined ? [] : [Date.parse(completion.at) + policy.settleMs]),
      ...(run.settleDeadline === undefined ? [] : [run.settleDeadline]),
    ];
    return deadlines.length === 0 ? null : Math.min(...deadlines);
  }

  /**
   * The iterations that closed accepted after an engineer's passing gate,
   * which are the ones a review request is owed for: their audited commit,
   * gate and assignment. Contract iterations establish agreements and are
   * not reviewed in this version.
   */
  private reviewableClosings(run: Run): Array<{ readonly workItem: string; readonly iteration: string; readonly gate: string; readonly commit: string }> {
    const assigned = new Set(run.log.all('iteration-assigned').map(event => event.data.iteration));
    return run.log.all('iteration-closed').flatMap(event => (
      event.data.outcome === 'accepted' && event.data.gate !== null && event.data.commit !== null && assigned.has(event.data.iteration)
        ? [{ workItem: event.data.workItem, iteration: event.data.iteration, gate: event.data.gate, commit: event.data.commit }]
        : []));
  }

  /**
   * Records every review request owed for one accepted iteration, once per
   * key, before the driver passes it. The candidate's tree is read first,
   * outside the mutex; the key is checked and the identifier counted under
   * it. Answers the requests it recorded: none for a key already recorded,
   * a run that has ended, or a candidate whose tree cannot be read, which
   * is warned about.
   */
  private async requestReviews(run: Run, closed: { readonly workItem: string; readonly iteration: string; readonly gate: string; readonly commit: string }): Promise<string[]> {
    const policy = run.record.policy.reviews;
    if (policy === undefined) return [];
    let tree: string;
    try {
      tree = await this.candidates.commitTree(this.projectRoot, closed.commit);
    } catch (error) {
      // A request binds its tree; without one there is nothing to review
      // against, and the gap is the missing request, stated here.
      this.warn(`Run ${run.record.jobId}: no review of ${closed.iteration} was requested; the tree of ${closed.commit} could not be read: ${message(error)}`);
      return [];
    }
    const number = Number.parseInt(closed.iteration.slice(closed.iteration.lastIndexOf('.i') + 2), 10);
    const base = this.acceptedBefore(run, closed.gate);
    const assignment = iterationLayout.assignment(closed.workItem, number);
    // Each question's captured inputs are read before the mutex, as the tree is.
    const inputs = new Map<ReviewKind, ReviewInputs>();
    for (const kind of policy.kinds) inputs.set(kind, await this.reviewInputs(run, kind, { ...closed, assignment, base }));
    const recorded: string[] = [];
    for (const kind of policy.kinds) {
      const outcome = await run.mutex.run(async () => {
        if (run.log.terminal) return null;
        const existing = [...reviewStateOf(run.log.events).values()]
          .find(request => request.iteration === closed.iteration && request.candidate === closed.commit && request.kind === kind);
        if (existing !== undefined) return null;
        const id = reviewRequestId(run.log.count('review-request-recorded') + 1);
        const request = reviewRequestSchema.parse({
          schema: 'ramify-agent.review-request/1',
          id,
          key: { iteration: closed.iteration, candidate: closed.commit, kind, policy: policy.version },
          workItem: closed.workItem,
          assignment,
          base,
          gate: closed.gate,
          tree,
          ...inputs.get(kind)!,
        } satisfies ReviewRequest);
        await commitRecord(run.log.ledger, {
          event: run.log.next({
            type: 'review-request-recorded',
            data: { request: id, workItem: closed.workItem, iteration: closed.iteration, kind, gate: closed.gate, candidate: closed.commit },
          }),
          records: [{ path: reviewLayout.request(id), id, revision: 1, body: request }],
        });
        return id;
      });
      if (outcome !== null) recorded.push(outcome);
    }
    run.reviews?.wake();
    return recorded;
  }

  /**
   * What one question of one candidate is given besides the candidate, and
   * the point its reviewer starts from. Code review needs nothing more and
   * never forks. Scope review binds the plan excerpts the assignment cites
   * and the local architect's pinned point at the assignment. Design review
   * binds the guidance it selects from the candidate and the orientation
   * key of that selection. An input that cannot be read is recorded as
   * such: the attempt then says what it lacked.
   */
  private async reviewInputs(
    run: Run,
    kind: ReviewKind,
    closed: { readonly workItem: string; readonly iteration: string; readonly commit: string; readonly assignment: string; readonly base: string },
  ): Promise<ReviewInputs> {
    const none: ReviewInputs = { requirements: [], guidance: [], forkPoint: { kind: 'none' } };
    if (kind === 'code') return none;
    if (kind === 'scope') {
      const assigned = run.log.all('iteration-assigned').find(event => event.data.iteration === closed.iteration);
      const pinned = assigned?.data.architectRef;
      const forkPoint: ForkPoint = pinned === undefined || pinned === null
        ? { kind: 'unavailable', reason: pinned === null ? 'The local architect\'s session was not kept after the assignment' : 'The assignment recorded no pinned point of the local architect' }
        : { kind: 'session', session: pinned.session, ref: pinned.ref };
      const requirements = await this.scopeRequirements(run, closed.assignment).catch(error => {
        this.warn(`Run ${run.record.jobId}: the plan excerpts of ${closed.iteration} could not be read: ${message(error)}`);
        return [] as CapturedInput[];
      });
      return { requirements: requirements.map(({ ref, hash }) => ({ ref, hash })), guidance: [], forkPoint };
    }
    try {
      const snapshot = await openCandidateSnapshot(this.candidates, this.projectRoot, { commit: closed.commit, base: closed.base });
      const guidance = (await readGuidance(this.candidates, this.projectRoot, snapshot)).map(({ ref, hash }) => ({ ref, hash }));
      if (guidance.length === 0) return { ...none, forkPoint: { kind: 'unavailable', reason: 'The candidate holds no guidance to judge a design against' } };
      const key = orientationKey({
        guidance,
        packageHash: run.record.prompts.reviewer?.hash ?? null,
        agent: run.record.agent,
        model: this.options.model ?? null,
        context: run.record.policy.context.reviewer,
      });
      return { requirements: [], guidance, forkPoint: { kind: 'orientation', key } };
    } catch (error) {
      return { ...none, forkPoint: { kind: 'unavailable', reason: `The candidate's guidance could not be read: ${message(error)}` } };
    }
  }

  /** The plan excerpts an iteration's assignment cites, from the captured plan. */
  private async scopeRequirements(run: Run, assignmentPath: string): Promise<CapturedInput[]> {
    const assignment = iterationAssignmentSchema.parse(this.committedBody(run, assignmentPath));
    const plan = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    return planExcerpts(plan, assignment.requirementRefs);
  }

  /** A record body as the log committed it, never the materialized file. */
  private committedBody(run: Run, path: string): unknown {
    for (const entry of run.log.ledger.replay()) {
      for (const record of entry.transaction.records) if (record.path === path) return record.body;
    }
    return undefined;
  }

  /**
   * One attempt of one request, from its snapshot to its terminal record.
   * Answers whether a terminal record was committed: an attempt fenced by a
   * settled request, a run that ended or a service that is closing commits
   * nothing, and its reader's session was stopped and closed like any other.
   */
  private async runReviewAttempt(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, id: string): Promise<boolean> {
    const policy = run.record.policy.reviews;
    const state = reviewStateOf(run.log.events).get(id);
    if (policy === undefined || state === undefined || state.settledBy !== null) return false;
    if (this.ignoring(run) || run.reviews?.accepting !== true) return false;
    const request = reviewRequestSchema.parse(this.committedBody(run, reviewLayout.request(id)));
    const kind = request.key.kind;
    const attempt = reviewAttemptId(id, state.attempts.length + 1);
    const queuedAt = state.attempts.at(-1)?.finished?.at ?? state.recordedAt;
    const retryLeft = state.attempts.filter(entry => entry.finished !== null && !entry.finished.settles).length < policy.retries;
    const requestedStart = requestedStartOf(request);
    const base = { id: attempt, request: id, queuedAt, requestedStart };
    const unavailable = (detail: string) => this.finishReview(run, request, {
      ...base, startedAt: null, invocation: null, session: null, actualStart: null,
    }, { result: 'not-verified', reason: 'unavailable', detail }, true);

    const loaded = packages.get('reviewer');
    if (loaded?.reviewer === undefined) return await unavailable('No prompt package is loaded for the reviewer') === 'committed';
    if (kind === 'design' && request.guidance.length === 0) {
      return await unavailable(request.forkPoint.kind === 'unavailable' ? request.forkPoint.reason : 'No design guidance was selected') === 'committed';
    }
    let snapshot: CandidateSnapshot;
    let requirements: CapturedInput[] = [];
    let guidance: CapturedInput[] = [];
    try {
      snapshot = await openCandidateSnapshot(this.candidates, this.projectRoot, { commit: request.key.candidate, base: request.base });
    } catch (error) {
      return await unavailable(`The audited candidate could not be read: ${message(error)}`) === 'committed';
    }
    try {
      // The question's inputs are read again and must be the bytes the
      // request bound; anything else is not the question it asked.
      if (kind === 'scope') requirements = boundInputs(await this.scopeRequirements(run, request.assignment), request.requirements);
      if (kind === 'design') {
        const texts = await Promise.all(request.guidance.map(entry => this.candidates.readBlob(this.projectRoot, request.key.candidate, entry.ref)));
        guidance = boundInputs(request.guidance.map((entry, index) => ({ ref: entry.ref, hash: sha256(texts[index]!), text: texts[index]! })), request.guidance);
      }
    } catch (error) {
      return await unavailable(`The ${kind} review's captured inputs could not be read as recorded: ${message(error)}`) === 'committed';
    }
    const start = await this.reviewStart(run, agent, loaded, request, guidance);
    // An orientation made first may have met a stop or the deadline, and
    // its work item's deadline may have settled the request meanwhile.
    if (this.closed || this.ignoring(run) || run.reviews?.accepting !== true) return false;
    if (reviewStateOf(run.log.events).get(id)?.settledBy !== null) return false;

    const assignment = iterationAssignmentSchema.safeParse(this.committedBody(run, request.assignment));
    const held = selectCheckFindings(checkFindingStateOf(run.log.ledger), { kind: 'list', owner: { kind: 'work-item', workItem: request.workItem }, select: 'all', limit: 100 });
    const tools = snapshotTools(snapshot, this.candidates, this.projectRoot);
    const workspace = run.path(join(dirname(reviewLayout.attempt(attempt)), 'workspace'));
    await mkdir(workspace, { recursive: true });

    let started: { invocation: string; session: SessionId; at: string } | undefined;
    /** Set when the request was settled before this attempt's start could be recorded. */
    let fenced = false;
    const result = await this.runInvocation<ReviewSubmission>(run, agent, {
      role: 'reviewer',
      work: { workItem: request.workItem, iteration: request.key.iteration },
      attempt: state.attempts.length + 1,
      loaded,
      systemPrompt: renderReviewerPrompt(loaded, '(no working directory: the audited candidate only)', kind),
      prompt: reviewMessage({
        request,
        snapshot,
        assignment: assignment.success ? assignment.data : null,
        checkFindings: held.ok && 'items' in held.view ? held.view.items.map(item => ({ id: item.id, standing: item.standing, title: item.title })) : [],
        requirements,
        planDocument: snapshot.entries.get(planPath(run.record.planId))?.kind === 'file' ? planPath(run.record.planId) : null,
      }),
      start: start.start,
      ...(start.fork === undefined ? {} : { fork: start.fork }),
      ...(start.degraded === undefined ? {} : { degraded: start.degraded }),
      toolName: reviewToolName,
      description: reviewSubmissionDescription,
      inputSchema: reviewJsonSchema,
      submissionSchema: 'ramify-agent.review-submission/1',
      validate: input => validateReview(input, { snapshot, inspected: tools.inspected(), read: tools.read(), maxConcerns: policy.maxConcerns }),
      keep: () => finished('work-closed'),
      scope: { write: null, measurement: null, size: null },
      reader: true,
      workingDirectory: workspace,
      absoluteMs: policy.attemptMs,
      equip: () => ({ builtinTools: [], tools: [...tools.definitions] }),
      // The start is recorded only for a request still unsettled, under the
      // mutex its deadline settles it under; a settled one's reader never starts.
      onStarted: async (invocation, session) => {
        const at = this.now();
        const recorded = await run.mutex.run(async () => {
          if (run.log.terminal !== undefined || reviewStateOf(run.log.events).get(id)?.settledBy !== null) return false;
          await run.log.append({ type: 'review-attempt-started', data: { request: id, attempt, invocation, session, requestedStart } }, at);
          return true;
        });
        if (recorded) started = { invocation, session, at: at.toISOString() };
        else fenced = true;
      },
      fenced: () => fenced,
    });
    // A closing service records nothing more; recovery finishes the attempt.
    if (this.closed || fenced) return false;

    const outcome = reviewOutcome(result, run.readerStop);
    const settles = !(outcome.retryable && retryLeft && !this.ignoring(run) && run.reviews?.accepting === true);
    const attemptBody = {
      ...base,
      startedAt: started?.at ?? null,
      invocation: started?.invocation ?? null,
      session: started?.session ?? null,
      // What the executor answered, never what was asked: a fork it could
      // not take is a fresh start, and is never measured as a fork.
      actualStart: result.actual === undefined ? null : result.actual === 'fork' ? 'fork' as const : 'fresh' as const,
    };
    const submission = result.ended === 'submitted' ? result.value : undefined;
    // What the harness binds to each concern is read here, before the
    // transition takes the run mutex.
    const bindings = submission === undefined || submission.concerns.length === 0
      ? []
      : await this.concernBindings(run, request, snapshot, tools, submission);
    const committed = await this.finishReview(run, request, attemptBody, outcome.result, settles, submission, bindings);
    return committed === 'committed';
  }

  /**
   * The ground, credibility and modules of each concern of a valid
   * submission, in concern order. The ground is the file the reviewer named,
   * with the hash of what `snapshot_read` answered; its credibility is the
   * provenance class of that file; the modules own the concern's locations
   * on the candidate's own module tree, else the work item's module. A
   * candidate whose module declarations cannot be read leaves only that
   * fallback, with a warning.
   */
  private async concernBindings(run: Run, request: ReviewRequest, snapshot: CandidateSnapshot, tools: SnapshotTools, submission: ReviewSubmission): Promise<ConcernBinding[]> {
    const index = await candidateModuleIndex(this.candidates, this.projectRoot, snapshot).catch(error => {
      this.warn(`Run ${run.record.jobId}: the module declarations of ${request.key.candidate} could not be read, so ${request.id}'s concerns name only their work item's module: ${message(error)}`);
      return null;
    });
    const ledger = run.log.ledger.replay();
    const workItemModule = committedRecords(ledger).workItems.find(item => item.id === request.workItem)?.module ?? null;
    const provenance = { planId: run.record.planId, featureFiles: new Set(trackedScenarios(ledger).records.map(record => record.file)) };
    const read = tools.read();
    return submission.concerns.map(concern => {
      const resolved = concern.ground === null ? null : resolveSnapshotPath(snapshot, concern.ground.path);
      const path = resolved?.ok === true ? resolved.path : null;
      const hash = path === null ? undefined : read.get(path);
      const ground = path === null || hash === undefined ? null : { ref: path, hash };
      return {
        ground,
        credibility: groundCredibility(ground?.ref ?? null, provenance),
        modules: concernModules(index, concern.locations, workItemModule),
      };
    });
  }

  /**
   * Where one attempt's reviewer starts. Code review starts fresh. Scope
   * review forks the local architect at the point that produced its
   * assignment, and design review forks the orientation of its guidance,
   * made first where none exists yet. A fork point that is missing or
   * unusable starts fresh, recorded as a start the caller could not honor;
   * the message is the complete input either way.
   */
  private async reviewStart(run: Run, agent: AgentPort, loaded: LoadedPackage, request: ReviewRequest, guidance: readonly CapturedInput[]): Promise<{
    readonly start: SessionStart;
    readonly fork?: ForkRelation | undefined;
    readonly degraded?: { readonly requested: 'fork'; readonly reason: string } | undefined;
  }> {
    const fresh = (reason: string) => ({ start: { mode: 'fresh' } as const, degraded: { requested: 'fork' as const, reason } });
    const point = request.forkPoint;
    if (point.kind === 'none') return { start: { mode: 'fresh' } };
    if (point.kind === 'unavailable') return fresh(point.reason);
    let from: { readonly session: SessionId; readonly invocation: string; readonly ref: string; readonly reason: 'scope-review' | 'design-orientation' };
    if (point.kind === 'session') {
      const assigned = run.log.all('iteration-assigned').find(event => event.data.iteration === request.key.iteration);
      if (assigned === undefined) return fresh(`No assignment of ${request.key.iteration} is recorded`);
      from = { session: point.session as SessionId, invocation: assigned.data.invocation, ref: point.ref, reason: 'scope-review' };
    } else {
      const orientation = await this.orientation(run, agent, loaded, request, guidance);
      if (orientation.outcome !== 'oriented' || orientation.session === null || orientation.invocation === null || orientation.ref === null) {
        return fresh(`The design orientation ${point.key.slice(0, 12)} did not orient: ${orientation.reason ?? 'no reason was recorded'}`);
      }
      from = { session: orientation.session as SessionId, invocation: orientation.invocation, ref: orientation.ref, reason: 'design-orientation' };
    }
    const source = this.sessionsOf(run)?.get(from.session);
    if (source === undefined || !source.invocations.includes(from.invocation) || source.awaiting === from.invocation) {
      return fresh(`${from.session} has not reached the end of ${from.invocation}`);
    }
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === from.invocation)?.sequence ?? 0;
    const briefs = run.log.all('brief-appended')
      .filter(event => event.data.session === from.session && event.sequence < ended)
      .map(event => event.data.decision);
    return {
      start: { mode: 'fork', from: from.ref },
      fork: { from: { session: from.session, invocation: from.invocation }, reason: from.reason, briefs },
    };
  }

  /**
   * The design orientation of a request's guidance selection: the one the
   * log records for its key, or one made now, once, by a reviewer session
   * that reads the guidance and is kept. A failed orientation is recorded
   * too, so the run does not pay for it twice; its design reviews start
   * fresh with the reason.
   */
  private async orientation(run: Run, agent: AgentPort, loaded: LoadedPackage, request: ReviewRequest, guidance: readonly CapturedInput[]): Promise<ReviewOrientation> {
    const key = request.forkPoint.kind === 'orientation' ? request.forkPoint.key : '';
    const recorded = this.recordedOrientation(run, key);
    if (recorded !== undefined) return recorded;
    let making = run.orienting.get(key);
    if (making === undefined) {
      making = this.orient(run, agent, loaded, request, key, guidance);
      run.orienting.set(key, making);
    }
    return await making;
  }

  private recordedOrientation(run: Run, key: string): ReviewOrientation | undefined {
    if (run.log.all('review-orientation-recorded').every(event => event.data.key !== key)) return undefined;
    const parsed = reviewOrientationSchema.safeParse(this.committedBody(run, reviewLayout.orientation(key)));
    return parsed.success ? parsed.data : undefined;
  }

  private async orient(run: Run, agent: AgentPort, loaded: LoadedPackage, request: ReviewRequest, key: string, guidance: readonly CapturedInput[]): Promise<ReviewOrientation> {
    const policy = run.record.policy.reviews!;
    const workspace = run.path(join(dirname(reviewLayout.orientation(key)), key.slice(0, 16)));
    await mkdir(workspace, { recursive: true });
    const result = await this.runInvocation<OrientationSubmission>(run, agent, {
      role: 'reviewer',
      work: { workItem: request.workItem, iteration: request.key.iteration },
      attempt: 1,
      loaded,
      systemPrompt: renderOrientationPrompt(loaded),
      prompt: orientationMessage(guidance),
      start: { mode: 'fresh' },
      toolName: orientationToolName,
      description: orientationSubmissionDescription,
      inputSchema: orientationJsonSchema,
      submissionSchema: 'ramify-agent.orientation-submission/1',
      validate: input => validateOrientation(input, guidance.map(entry => entry.ref)),
      // The orientation is retained: every design review of its key forks it.
      keep: ended => (ended === 'submitted' ? kept : finished('not-kept')),
      scope: { write: null, measurement: null, size: null },
      reader: true,
      workingDirectory: workspace,
      absoluteMs: policy.attemptMs,
      equip: () => ({ builtinTools: [], tools: [] }),
    });
    const oriented = result.ended === 'submitted' && result.value !== undefined && result.ref !== '';
    const orientation = reviewOrientationSchema.parse({
      schema: 'ramify-agent.review-orientation/1',
      key,
      guidance: guidance.map(({ ref, hash }) => ({ ref, hash })),
      request: request.id,
      invocation: result.id === '' ? null : result.id,
      session: result.session === '' ? null : result.session,
      ref: oriented ? result.ref : null,
      outcome: oriented ? 'oriented' : 'failed',
      summary: oriented ? result.value!.summary : null,
      reason: oriented ? null : `The orientation ended ${result.ended}${result.interruption === undefined ? '' : ` (${result.interruption})`}`,
    } satisfies ReviewOrientation);
    if (!this.closed) {
      await this.write(run, {
        type: 'review-orientation-recorded',
        data: { key, request: request.id, invocation: orientation.invocation, session: orientation.session, outcome: orientation.outcome },
      }, [{ path: reviewLayout.orientation(key), id: key, revision: 1, body: orientation }]);
    }
    return orientation;
  }

  /**
   * Commits one terminal attempt: its record, its valid submission and one
   * report per concern, as one line through the CheckFinding transition. A
   * request already settled or an attempt already finished is fenced, and a
   * terminal run refuses it; neither appends anything. A concern set the
   * transition refuses leaves the attempt not verified, never clean.
   */
  private async finishReview(
    run: Run,
    request: ReviewRequest,
    attempt: Omit<ReviewAttempt, 'schema' | 'result' | 'settles' | 'checkFindings' | 'finishedAt'>,
    result: ReviewResult,
    settles: boolean,
    submission?: ReviewSubmission,
    bindings: readonly ConcernBinding[] = [],
  ): Promise<'committed' | 'fenced'> {
    if ((submission?.concerns.length ?? 0) !== bindings.length) {
      throw new Error(`${attempt.id} submitted ${submission?.concerns.length ?? 0} concerns, and ${bindings.length} were bound`);
    }
    const finishedAt = this.now().toISOString();
    const record: ReviewSubmissionRecord | undefined = submission === undefined
      ? undefined
      : { schema: 'ramify-agent.review-submission/1', attempt: attempt.id, ...submission };
    const evidenceHash = record === undefined ? null : `sha256:${sha256(canonicalJson(record))}`;
    const commit = await this.commitCheckFindings(run, ({ log, state }) => {
      const current = reviewStateOf(log.events).get(request.id);
      if (current === undefined) return { stale: `No review request ${request.id} is recorded` };
      if (current.settledBy !== null) return { stale: `${request.id} was settled by ${current.settledBy}; the result of ${attempt.id} is fenced` };
      if (current.attempts.some(entry => entry.id === attempt.id && entry.finished !== null)) return { stale: `${attempt.id} has already finished; its later result is fenced` };
      const concerns = record?.concerns ?? [];
      const commands = concerns.map((concern, index) => reportCommand({
        producer: `review:${request.key.kind}`,
        attempt: attempt.id,
        reportKey: concernKey(index),
        owner: { kind: 'work-item', workItem: request.workItem },
        source: { kind: 'tree', id: request.tree },
        issueKey: null,
        verification: { kind: 'assessment' },
        observation: {
          kind: 'review-concern',
          summary: concern.summary,
          evidence: [{ kind: 'review-submission', ref: reviewLayout.submission(attempt.id), hash: evidenceHash }],
          locations: concern.locations,
        },
        judgment: {
          actor: { kind: 'agent', role: 'reviewer', invocation: attempt.invocation ?? 'none' },
          consequence: concern.consequence,
          rationale: concern.rationale,
          uncertainty: concern.uncertainty,
          remedy: concern.remedy,
          risk: concern.risk,
          ground: bindings[index]!.ground,
        },
        // A hint only, and only toward a CheckFinding of the same work item.
        suggests: concern.suggests !== null && sameWorkItem(state.findings.get(concern.suggests)?.owner, request.workItem) ? concern.suggests : null,
        credibility: bindings[index]!.credibility,
        modules: [...bindings[index]!.modules],
      } satisfies BoundReport));
      return {
        commands,
        compose: decided => {
          const touched = [...new Set(decided.outcomes.flatMap(outcome => outcome.touched))];
          const body: ReviewAttempt = { schema: 'ramify-agent.review-attempt/1', ...attempt, finishedAt, result, settles, checkFindings: touched };
          return {
            event: {
              type: 'review-attempt-finished',
              data: {
                request: request.id, attempt: attempt.id, result: result.result,
                reason: result.result === 'not-verified' ? result.reason : null, settles, checkFindings: [...decided.events],
              },
            },
            records: [
              { path: reviewLayout.attempt(attempt.id), id: attempt.id, revision: 1, body },
              ...(record === undefined ? [] : [{ path: reviewLayout.submission(attempt.id), id: attempt.id, revision: 1, body: record }]),
            ],
          };
        },
      };
    });
    if (commit.kind === 'committed' || commit.kind === 'replayed') return 'committed';
    if (commit.refusal.reason === 'run-ended' || commit.refusal.reason === 'stale-basis') return 'fenced';
    // The concerns could not be promoted as submitted; the attempt covers
    // nothing then, and says why.
    return await this.finishReview(run, request, attempt, {
      result: 'not-verified', reason: 'invalid-output', detail: `Its concerns were refused: ${commit.refusal.message}`,
    }, settles);
  }

  /**
   * Finishes every unsettled request, or those named, as not verified: an
   * attempt a reader started and never finished, whose later result is then
   * fenced, or a new one that never started. Each settles its request.
   */
  private async finishUnsettledReviews(
    run: Run,
    why: (request: ReturnType<typeof unsettledRequests>[number], running: boolean) => { readonly reason: NotVerifiedReason; readonly detail: string },
    only?: readonly string[],
  ): Promise<string[]> {
    const finishedIds: string[] = [];
    for (const state of unsettledRequests(run.log.events)) {
      if (only !== undefined && !only.includes(state.id)) continue;
      const body = this.committedBody(run, reviewLayout.request(state.id));
      const parsed = reviewRequestSchema.safeParse(body);
      if (!parsed.success) {
        this.warn(`Run ${run.record.jobId}: review request ${state.id} cannot be read, so it was left unsettled`);
        continue;
      }
      const open = state.attempts.find(entry => entry.started !== null && entry.finished === null);
      const { reason, detail } = why(state, open !== undefined);
      const attempt = open?.id ?? reviewAttemptId(state.id, state.attempts.length + 1);
      const outcome = await this.finishReview(run, parsed.data, {
        id: attempt,
        request: state.id,
        queuedAt: state.attempts.filter(entry => entry.id !== attempt).at(-1)?.finished?.at ?? state.recordedAt,
        startedAt: open?.started?.at ?? null,
        invocation: open?.started?.invocation ?? null,
        session: (open?.started?.session ?? null) as SessionId | null,
        requestedStart: requestedStartOf(parsed.data),
        actualStart: null,
      }, { result: 'not-verified', reason, detail }, true);
      if (outcome === 'committed') finishedIds.push(attempt);
    }
    return finishedIds;
  }

  /**
   * Waits for the run's reviews before its final gate, at most the policy's
   * settlement bound, then stops what is still running and finishes it as
   * not verified at the deadline, so the run completes with every request
   * settled and no reader left.
   */
  private async settleReviews(run: Run): Promise<void> {
    const policy = run.record.policy.reviews;
    if (policy === undefined || run.reviews === undefined) return;
    // From here every waiting request has a deadline, and one that could not
    // finish by it is finished at once rather than started.
    run.settleDeadline = this.now().getTime() + policy.settleMs;
    run.reviews.wake();
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      run.reviews.settled(),
      new Promise<void>(resolve => { timer = setTimeout(resolve, policy.settleMs); }),
    ]);
    clearTimeout(timer);
    await this.stopReaders(run, 'deadline', run.record.policy.limits.stopSettleMs);
  }

  /**
   * Settles one work item's review requests at its completion request: it
   * waits for them until their deadline, the completion request plus the
   * policy's settlement bound, and then finishes what is left as not
   * verified at the deadline and stops its readers. The run's queue stays
   * open for the rest of the run. Answers false once the run has ended.
   */
  private async settleWorkItemReviews(run: Run, workItem: string): Promise<boolean> {
    const policy = run.record.policy.reviews;
    const queue = run.reviews;
    if (policy === undefined || queue === undefined) return !this.ignoring(run);
    for (;;) {
      if (this.ignoring(run)) return false;
      // Both waits are registered before the log is read, so an attempt that
      // ends, or a stop that lands, in between still wakes this one.
      const ended = queue.changed();
      const stopped = run.changed();
      const unsettled = unsettledRequests(run.log.events).filter(request => request.workItem === workItem);
      if (unsettled.length === 0) return true;
      const deadlines = unsettled.map(request => this.reviewDeadline(run, request.id)).filter((deadline): deadline is number => deadline !== null);
      const deadline = deadlines.length === 0 ? this.now().getTime() + policy.settleMs : Math.max(...deadlines);
      const remaining = deadline - this.now().getTime();
      if (remaining <= 0) {
        await this.stopWorkItemReaders(run, workItem, run.record.policy.limits.stopSettleMs);
        return !this.ignoring(run);
      }
      queue.wake();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([ended, stopped, new Promise<void>(resolve => { timer = setTimeout(resolve, remaining); })]);
      clearTimeout(timer);
    }
  }

  /**
   * The deadline of one work item's reviews. Every request of it still
   * unsettled is finished as not verified at the deadline, which fences any
   * later result of its attempt, and each reader still running for one is
   * asked to stop and awaited at most `grace`; the harness owns its cleanup
   * until it settles. The queue, and every other work item's requests, are
   * left as they are.
   */
  private async stopWorkItemReaders(run: Run, workItem: string, grace: number): Promise<void> {
    const unsettled = unsettledRequests(run.log.events).filter(request => request.workItem === workItem);
    if (unsettled.length === 0) return;
    const running = unsettled.flatMap(request => request.attempts
      .filter(attempt => attempt.started !== null && attempt.finished === null)
      .map(attempt => attempt.started!.invocation));
    await this.finishUnsettledReviews(run, (_request, open) => ({
      reason: 'deadline',
      detail: open
        ? `${workItem}'s reviews had to settle by its completion request plus the settlement bound; this attempt was still running, and its reader was stopped`
        : `${workItem}'s reviews had to settle by its completion request plus the settlement bound; this review had not run`,
    }), unsettled.map(request => request.id));
    const readers = running.flatMap(invocation => {
      const live = run.live.get(invocation);
      return live === undefined ? [] : [live];
    });
    if (readers.length === 0) return;
    for (const reader of readers) void reader.session?.stop().catch(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(readers.map(reader => reader.done)),
      new Promise<void>(resolve => { timer = setTimeout(resolve, grace); }),
    ]);
    clearTimeout(timer);
  }

  /**
   * Recovery of a run's reviews: every request an accepted iteration is owed
   * and has not is recorded once, and every request left unsettled is
   * finished as not verified, since a recovered run is interrupted and runs
   * nothing more. An attempt whose reader was running is one whose session
   * was lost with the harness.
   */
  private async recoverReviews(run: Run): Promise<string[]> {
    if (run.record.policy.reviews === undefined) return [];
    const recovered: string[] = [];
    for (const closed of this.reviewableClosings(run)) {
      for (const request of await this.requestReviews(run, closed)) recovered.push(`review request ${request} of ${closed.iteration}`);
    }
    const finishedIds = await this.finishUnsettledReviews(run, (_request, running) => (running
      ? { reason: 'execution-failed', detail: 'The harness stopped while this attempt ran; its reader\'s session was lost with it' }
      : { reason: 'stopped', detail: 'The harness stopped before this review ran; a recovered run is interrupted and runs nothing more' }));
    for (const attempt of finishedIds) recovered.push(`review attempt ${attempt}, finished as not verified`);
    return recovered;
  }

  /** The run's review requests and coverage, from its log; undefined for an unknown run. */
  reviews(planId: string, runId: string, workItem?: string): { readonly coverage: ReviewCoverage; readonly requests: ReturnType<typeof unsettledRequests> } | undefined {
    const run = this.runs.get(key(planId, runId));
    if (run === undefined) return undefined;
    const requests = [...reviewStateOf(run.log.events).values()].filter(request => workItem === undefined || request.workItem === workItem);
    return { coverage: reviewCoverage(run.record.policy, run.log.events, workItem), requests };
  }

  // Reconciliation

  /**
   * The work item's review requests and attention set as the log stands:
   * each settled request with the attempt that settled it, the requests
   * still unsettled, every open CheckFinding of the work item in attention
   * order, and the revision of every one of its CheckFindings. This version
   * evaluates no revisit condition, so no deferral is due.
   */
  private basisState(run: Run, workItem: string): {
    readonly requests: BasisRequest[];
    readonly unsettled: string[];
    readonly attention: Map<CheckFindingId, AttentionEntry>;
    readonly revisions: Map<CheckFindingId, number>;
    readonly due: CheckFindingId[];
    readonly state: CheckFindingState;
  } {
    const requests: BasisRequest[] = [];
    const unsettled: string[] = [];
    for (const request of reviewStateOf(run.log.events).values()) {
      if (request.workItem !== workItem) continue;
      const settling = request.attempts.find(attempt => attempt.id === request.settledBy)?.finished;
      if (request.settledBy === null || settling == null) unsettled.push(request.id);
      else requests.push({ request: request.id, attempt: request.settledBy, result: settling.result });
    }
    const state = checkFindingStateOf(run.log.ledger);
    const due: CheckFindingId[] = [];
    const attention = new Map<CheckFindingId, AttentionEntry>();
    for (const summary of this.ownerCheckFindings(state, workItem, 'attention', due)) {
      attention.set(summary.id, { revision: summary.revision, reason: summary.reason, awaiting: summary.awaiting, risk: summary.risk, modules: summary.modules });
    }
    const revisions = new Map(this.ownerCheckFindings(state, workItem, 'all').map(summary => [summary.id, summary.revision]));
    return { requests, unsettled, attention, revisions, due, state };
  }

  /** Every CheckFinding of one work item the query selects, all pages, in attention order. */
  private ownerCheckFindings(state: CheckFindingState, workItem: string, select: 'attention' | 'all', due: readonly CheckFindingId[] = []): CheckFindingSummary[] {
    const items: CheckFindingSummary[] = [];
    let after: CheckFindingId | null = null;
    for (;;) {
      const page = selectCheckFindings(state, {
        kind: 'list', owner: { kind: 'work-item', workItem }, select, due: [...due], after, limit: 100, order: 'attention',
      });
      if (!page.ok || page.view.kind !== 'list') return items;
      items.push(...page.view.items);
      if (page.view.next === null) return items;
      after = page.view.next;
    }
  }

  /** The `outline-revised` that commits the work item's latest completion request. */
  private latestCompletion(run: Run, workItem: string): RunEventOf<'outline-revised'> | undefined {
    return run.log.all('outline-revised').filter(event => event.data.workItem === workItem && event.data.architectRef !== undefined).at(-1);
  }

  /** The reconciliation of the work item's latest round, whose basis a completion's unresolved reasons are read against. */
  private latestBasis(run: Run, workItem: string): ReconciliationBasis | undefined {
    const started = run.log.all('reconciliation-started').filter(event => event.data.workItem === workItem).at(-1);
    if (started === undefined) return undefined;
    const parsed = reconciliationBasisSchema.safeParse(this.committedBody(run, reconciliationLayout.basis(started.data.reconciliation)));
    return parsed.success ? parsed.data : undefined;
  }

  /**
   * The reconciliation whose repair intent the work item's next assignment
   * resolves: its latest assessment, where that chose a correction and no
   * assignment has resolved it yet.
   */
  private pendingCorrection(run: Run, workItem: string): string | undefined {
    const assessed = run.log.all('reconciliation-assessed').filter(event => event.data.workItem === workItem).at(-1);
    if (assessed === undefined || assessed.data.next !== 'correct') return undefined;
    const resolved = run.log.all('iteration-assigned').some(event => event.data.corrects === assessed.data.reconciliation);
    return resolved ? undefined : assessed.data.reconciliation;
  }

  /**
   * Reconciles one work item that requested completion (appendix §6): its
   * reviews settle, any user decision it waits for is answered, and its
   * attention set is captured. An empty set goes to the work item's gate
   * with no agent call. Otherwise one round forks the local architect at
   * its completion request, within the round's floor, and the assessment it
   * commits leads to the gate, to a correction, or to a user decision and
   * another round. A refused basis or a fork that returns nothing is another
   * round. A round after the first starts only for a signal that warrants
   * one, and none starts once the rounds are spent: what is open then stays
   * unresolved, and the gate alone decides. Null once the run has ended.
   */
  private async reconcileWorkItem(run: Run, agent: AgentPort, loaded: LoadedPackage, item: WorkItem, parent: ParentSession): Promise<Reconciled | null> {
    const limit = run.record.policy.limits.reconciliationRoundsPerWorkItem ?? defaultReconciliationRounds;
    const minimum = run.record.policy.limits.laterRoundMinimumRisk ?? 'medium';
    for (;;) {
      if (!await this.settleWorkItemReviews(run, item.id)) return null;
      if (!await this.awaitUserDecisions(run, item.id)) return null;
      const commit = this.accepted(run);
      const captured = this.basisState(run, item.id);
      const rounds = run.log.all('reconciliation-started').filter(event => event.data.workItem === item.id).length;
      const gate = (decided: boolean): Reconciled => ({
        kind: 'gate',
        basis: { commit, requests: captured.requests, checkFindings: attentionAt(captured.attention), decided },
      });
      // Nothing needs attention, the rounds are spent, or what is left does
      // not warrant a later round: the gate follows, and what is open stays
      // unresolved.
      if (captured.attention.size === 0) return gate(false);
      if (rounds >= limit || (rounds > 0 && !needsLaterRound(captured.attention.values(), minimum))) return gate(rounds > 0);

      let tree: string;
      try {
        tree = await this.candidates.commitTree(this.projectRoot, commit);
      } catch (error) {
        await this.fail(run, 'internal', `The audited source ${commit} of ${item.id}'s reconciliation could not be read: ${message(error)}`);
        return null;
      }
      const basis = await this.startReconciliation(run, item.id, rounds + 1, limit, { commit, tree }, captured);
      if (basis === 'ended') return null;
      if (basis === 'stale') continue;
      const assessed = await this.assessReconciliation(run, agent, loaded, item, basis, captured.attention, parent, { limit, minimum });
      if (assessed === null) return null;
      if (assessed.kind === 'refused') {
        await this.write(run, { type: 'reconciliation-refused', data: { workItem: item.id, reconciliation: basis.id, stage: 'assessment', reason: assessed.reason } });
        if (this.ignoring(run)) return null;
        continue;
      }
      if (assessed.next === 'correct') return { kind: 'correct', reconciliation: basis.id };
      if (assessed.next === 'await-user') continue;
      const after = this.basisState(run, item.id);
      return { kind: 'gate', basis: { commit, requests: after.requests, checkFindings: attentionAt(after.attention), decided: true } };
    }
  }

  /**
   * Commits one round's `reconciliation-started` with its basis, after
   * checking under the mutex that what was captured still holds. Stale when
   * it does not, and nothing is appended.
   */
  private async startReconciliation(
    run: Run,
    workItem: string,
    round: number,
    limit: number,
    source: { readonly commit: string; readonly tree: string },
    captured: ReturnType<RunService['basisState']>,
  ): Promise<ReconciliationBasis | 'stale' | 'ended'> {
    const id = reconciliationId(workItem, round);
    const pinned = this.latestCompletion(run, workItem)?.data.architectRef;
    const forkPoint: ForkPoint = pinned === undefined || pinned === null
      ? { kind: 'unavailable', reason: pinned === null ? 'The local architect\'s session was not kept after its completion request' : 'No completion request of this work item recorded the local architect\'s point' }
      : { kind: 'session', session: pinned.session, ref: pinned.ref };
    const basis = reconciliationBasisSchema.parse({
      schema: 'ramify-agent.reconciliation-basis/1',
      id,
      workItem,
      round,
      source,
      requests: captured.requests,
      checkFindings: attentionAt(captured.attention),
      due: captured.due,
      applied: captured.state.applied,
      forkPoint,
      floor: roundFloor(round, limit),
    } satisfies ReconciliationBasis);
    return await run.mutex.run(async () => {
      if (run.log.terminal !== undefined) return 'ended' as const;
      const now = this.basisState(run, workItem);
      const changed = this.accepted(run) !== source.commit
        || basisChange(basis, { source, requests: now.requests, unsettled: now.unsettled, revisions: now.revisions }) !== null
        || attentionAt(now.attention).some(entry => !basis.checkFindings.some(held => held.checkFinding === entry.checkFinding))
        || run.log.all('reconciliation-started').some(event => event.data.reconciliation === id);
      if (changed) return 'stale' as const;
      await commitRecord(run.log.ledger, {
        event: run.log.next({ type: 'reconciliation-started', data: { workItem, reconciliation: id, round } }),
        records: [{ path: reconciliationLayout.basis(id), id, revision: 1, body: basis }],
      });
      return basis;
    });
  }

  /**
   * Waits while a CheckFinding of the work item awaits a user's answer: the
   * answer is what the next round assesses. A stop or the service closing
   * ends the wait. Answers false once the run has ended.
   */
  private async awaitUserDecisions(run: Run, workItem: string): Promise<boolean> {
    for (;;) {
      if (this.ignoring(run)) return false;
      // Registered before the state is read, so an answer in between still wakes it.
      const changed = run.changed();
      const pending = [...checkFindingStateOf(run.log.ledger).findings.values()]
        .some(entry => sameWorkItem(entry.owner, workItem) && entry.pendingUserDecision !== null);
      if (!pending) return true;
      await changed;
    }
  }

  /**
   * Where a reconciliation's fork starts: the local architect's point after
   * its completion request, or fresh with the complete packet and the reason
   * where that point is missing or unusable.
   */
  private reconciliationStart(run: Run, basis: ReconciliationBasis, completion: RunEventOf<'outline-revised'> | undefined): {
    readonly start: SessionStart;
    readonly fork?: ForkRelation | undefined;
    readonly degraded?: { readonly requested: 'fork'; readonly reason: string } | undefined;
  } {
    const fresh = (reason: string) => ({ start: { mode: 'fresh' } as const, degraded: { requested: 'fork' as const, reason } });
    const point = basis.forkPoint;
    if (point.kind !== 'session') return fresh(point.kind === 'unavailable' ? point.reason : 'No point of the local architect was captured');
    if (completion === undefined) return fresh('No completion request of this work item is recorded');
    const from = { session: point.session as SessionId, invocation: completion.data.invocation };
    const source = this.sessionsOf(run)?.get(from.session);
    if (source === undefined || !source.invocations.includes(from.invocation) || source.awaiting === from.invocation) {
      return fresh(`${from.session} has not reached the end of ${from.invocation}`);
    }
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === from.invocation)?.sequence ?? 0;
    const briefs = run.log.all('brief-appended')
      .filter(event => event.data.session === from.session && event.sequence < ended)
      .map(event => event.data.decision);
    return { start: { mode: 'fork', from: point.ref }, fork: { from, reason: 'reconciliation', briefs } };
  }

  /** The one bounded packet of a round, from the log and the CheckFinding state. */
  private reconciliationPacket(run: Run, item: WorkItem, basis: ReconciliationBasis, state: CheckFindingState, bounds: { readonly limit: number; readonly minimum: string }): ReconciliationPacket {
    const reviews = reviewStateOf(run.log.events);
    const requests: PacketRequest[] = basis.requests.map(entry => {
      const request = reviews.get(entry.request);
      const attempt = entry.attempt === null ? undefined : reviewAttemptSchema.safeParse(this.committedBody(run, reviewLayout.attempt(entry.attempt)));
      return {
        request: entry.request,
        kind: request?.kind ?? 'unknown',
        iteration: request?.iteration ?? 'unknown',
        candidate: request?.candidate ?? 'unknown',
        attempt: entry.attempt,
        result: attempt?.success === true ? resultText(attempt.data.result) : entry.result,
      };
    });
    const attention = basis.checkFindings.flatMap(entry => {
      const detail = selectCheckFindings(state, { kind: 'detail', checkFinding: entry.checkFinding });
      return detail.ok && detail.view.kind === 'detail' ? [detail.view] : [];
    });
    const inBasis = new Set(basis.checkFindings.map(entry => entry.checkFinding));
    const iterations = run.log.all('iteration-assigned').filter(event => event.data.workItem === item.id).map(event => {
      const number = Number.parseInt(event.data.iteration.slice(event.data.iteration.lastIndexOf('.i') + 2), 10);
      const assignment = iterationAssignmentSchema.safeParse(this.committedBody(run, iterationLayout.assignment(item.id, number)));
      const closed = run.log.all('iteration-closed').find(entry => entry.data.iteration === event.data.iteration);
      return { id: event.data.iteration, goal: assignment.success ? assignment.data.goal : '(its assignment could not be read)', outcome: closed?.data.outcome ?? null };
    });
    const earlier = run.log.all('reconciliation-assessed').filter(event => event.data.workItem === item.id).flatMap(event => {
      const record = reconciliationAssessmentSchema.safeParse(this.committedBody(run, reconciliationLayout.assessment(event.data.reconciliation)));
      return record.success ? [{ id: record.data.id, next: record.data.next, brief: record.data.submission.brief }] : [];
    });
    return {
      basis,
      limit: bounds.limit,
      laterRoundMinimumRisk: bounds.minimum,
      module: item.module,
      requests,
      attention,
      others: this.ownerCheckFindings(state, item.id, 'all').filter(summary => !inBasis.has(summary.id)),
      iterations,
      earlier,
      refused: run.log.all('reconciliation-refused').filter(event => event.data.workItem === item.id)
        .map(event => ({ reconciliation: event.data.reconciliation, reason: event.data.reason })),
    };
  }

  /**
   * One round's fork: the packet, a submission validated against the basis
   * and the CheckFinding rules, and its commit. Refused when the fork ends
   * without an assessment or its basis no longer holds when it commits; null
   * once the run has ended.
   */
  private async assessReconciliation(
    run: Run,
    agent: AgentPort,
    loaded: LoadedPackage,
    item: WorkItem,
    basis: ReconciliationBasis,
    attention: ReadonlyMap<CheckFindingId, AttentionEntry>,
    parent: ParentSession,
    bounds: { readonly limit: number; readonly minimum: CheckFindingRisk },
  ): Promise<{ readonly kind: 'refused'; readonly reason: string } | { readonly kind: 'assessed'; readonly next: ReconciliationAssessment['next'] } | null> {
    const completion = this.latestCompletion(run, item.id);
    const start = this.reconciliationStart(run, basis, completion);
    const state = checkFindingStateOf(run.log.ledger);
    const held = new Map(this.ownerCheckFindings(state, item.id, 'all').map(summary => [summary.id, summary.revision]));
    const plan = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    let invocation: string | undefined;
    let bound: BoundReconciliation | undefined;
    const result = await this.runInvocation<ReconciliationSubmission>(run, agent, {
      role: 'local-architect',
      work: { workItem: item.id },
      attempt: basis.round,
      loaded,
      systemPrompt: renderReconciliationPrompt(loaded, this.projectRoot),
      prompt: reconciliationMessage(this.reconciliationPacket(run, item, basis, state, bounds)),
      start: start.start,
      ...(start.fork === undefined ? {} : { fork: start.fork }),
      ...(start.degraded === undefined ? {} : { degraded: start.degraded }),
      toolName: reconciliationToolName,
      description: reconciliationSubmissionDescription,
      inputSchema: reconciliationJsonSchema,
      submissionSchema: 'ramify-agent.reconciliation-submission/1',
      validate: async input => {
        const checked = await validateReconciliation(input, {
          id: basis.id,
          workItem: item.id,
          module: item.module,
          floor: basis.floor,
          laterRoundMinimumRisk: bounds.minimum,
          attention,
          held,
          actor: { kind: 'agent', role: 'local-architect', invocation: invocation ?? 'none' },
          source: { kind: 'tree', id: basis.source.tree },
          evidence: submission => [{
            kind: 'reconciliation-submission',
            ref: runLayout.submission(invocation ?? 'none'),
            hash: `sha256:${sha256(canonicalJson(submission))}`,
          }],
          document: async path => {
            if (path === 'plan') return { text: plan, revision: `sha256:${sha256(plan)}` };
            try {
              return { text: await this.candidates.readBlob(this.projectRoot, basis.source.commit, path), revision: basis.source.commit };
            } catch {
              return null;
            }
          },
          decide: command => {
            const now = this.basisState(run, item.id);
            if (basisChange(basis, { source: basis.source, requests: now.requests, unsettled: now.unsettled, revisions: now.revisions }) !== null) return null;
            const change = decideCheckFindingChange(now.state, command);
            return change.ok ? null : change.rejection;
          },
        });
        if (!checked.ok) return checked;
        bound = checked.value;
        return { ok: true, value: checked.value.submission };
      },
      // A fork is never continued: its brief is what reaches the architect's own session.
      keep: () => finished('not-kept'),
      scope: { write: null, measurement: null, size: null },
      onStarted: async id => { invocation = id; },
    });
    if (this.ignoring(run)) return null;
    if (result.ended !== 'submitted' || result.value === undefined || bound === undefined || invocation === undefined) {
      return { kind: 'refused', reason: `The reconciliation fork${result.id === '' ? '' : ` ${result.id}`} ended without an assessment (${result.ended})` };
    }
    return await this.commitAssessment(run, agent, basis, {
      invocation,
      session: result.session,
      requestedStart: start.start.mode === 'fork' || start.degraded !== undefined ? 'fork' : 'fresh',
      actualStart: result.actual === undefined ? null : result.actual === 'fork' ? 'fork' : 'fresh',
      bound,
    }, parent);
  }

  /**
   * Commits one assessment and appends its brief to the local architect's
   * session, as the ledger's external effect keyed `brief:<reconciliation>`:
   * the intent is `reconciliation-assessed` with its record and every
   * CheckFinding event, decided under the mutex against the basis as it
   * stands; the effect is the append; the completion says what the append
   * did. The decisions are durable before any append, and a repeat after a
   * crash appends the same key once.
   */
  private async commitAssessment(
    run: Run,
    agent: AgentPort,
    basis: ReconciliationBasis,
    fork: {
      readonly invocation: string;
      readonly session: SessionId;
      readonly requestedStart: 'fresh' | 'fork';
      readonly actualStart: 'fresh' | 'fork' | null;
      readonly bound: BoundReconciliation;
    },
    parent: ParentSession,
  ): Promise<{ readonly kind: 'refused'; readonly reason: string } | { readonly kind: 'assessed'; readonly next: ReconciliationAssessment['next'] }> {
    const { submission, commands, conflicts } = fork.bound;
    const parentRef = parent.session !== undefined && parent.ref !== undefined ? { session: parent.session, ref: parent.ref } : null;
    let record: ReconciliationAssessment | undefined;
    let appended: BriefAppend;
    try {
      appended = await run.log.ledger.effect<BriefAppend>({
        key: `brief:${basis.id}`,
        serialize: work => run.mutex.run(work),
        intent: () => {
          const decided = decideCheckFindingTransaction(run.log, ({ log }) => {
            if (log.all('reconciliation-assessed').some(event => event.data.reconciliation === basis.id)) return { stale: `${basis.id} is already assessed` };
            const latest = log.all('reconciliation-started').filter(event => event.data.workItem === basis.workItem).at(-1);
            if (latest?.data.reconciliation !== basis.id) return { stale: `${basis.id} is not the work item's latest round` };
            const now = this.basisState(run, basis.workItem);
            const stale = this.accepted(run) !== basis.source.commit
              ? `the accepted source is ${this.accepted(run)}, not ${basis.source.commit}`
              : basisChange(basis, { source: basis.source, requests: now.requests, unsettled: now.unsettled, revisions: now.revisions });
            if (stale !== null) return { stale };
            return {
              commands: commands.length === 0 ? [] : [{ type: 'assess', commands: [...commands] }],
              compose: decided => {
                const events = decided.events;
                record = reconciliationAssessmentSchema.parse({
                  schema: 'ramify-agent.reconciliation-assessment/1',
                  id: basis.id,
                  workItem: basis.workItem,
                  round: basis.round,
                  invocation: fork.invocation,
                  session: fork.session,
                  requestedStart: fork.requestedStart,
                  actualStart: fork.actualStart,
                  submission,
                  conflicts,
                  next: submission.next.kind,
                  checkFindings: [...new Set(decided.outcomes.flatMap(outcome => outcome.touched))],
                  decisions: events.flatMap(event => (event.type === 'check-finding-decided' ? [event.data.decision.id] : [])),
                  relations: events.flatMap(event => (event.type === 'check-finding-related' ? [event.data.relation.id] : [])),
                  parent: parentRef,
                  brief: reconciliationBrief({ id: basis.id, round: basis.round, source: basis.source, submission, events }),
                } satisfies ReconciliationAssessment);
                return {
                  event: {
                    type: 'reconciliation-assessed',
                    data: { workItem: basis.workItem, reconciliation: basis.id, invocation: fork.invocation, next: submission.next.kind, checkFindings: [...events] },
                  },
                  records: [{ path: reconciliationLayout.assessment(basis.id), id: basis.id, revision: 1, body: record }],
                };
              },
            };
          }, this.now());
          if (decided.kind === 'transaction') return decided.transaction;
          throw new AssessmentRefusedError(decided.kind === 'refused' ? decided.refusal.message : `${basis.id} decided nothing new`);
        },
        perform: key => this.appendReconciliationBrief(agent, key, parentRef, record!.brief),
        complete: result => ({
          event: run.log.next({ type: 'reconciliation-brief-appended', data: { reconciliation: basis.id, ...result } }),
          records: [],
        }),
      });
    } catch (error) {
      if (error instanceof AssessmentRefusedError) return { kind: 'refused', reason: error.message };
      // The ledger measures a line before writing any of it.
      if (error instanceof RangeError) return { kind: 'refused', reason: `The assessment does not fit one ledger line: ${error.message}` };
      throw error;
    }
    await this.afterBriefAppend(run, basis.id, appended, record!.brief, parent);
    return { kind: 'assessed', next: record!.next };
  }

  /** The brief's append to the local architect's session. A lost session, a failure and no session are outcomes, never thrown. */
  private async appendReconciliationBrief(agent: AgentPort, key: string, parent: ArchitectRef | null, brief: string): Promise<BriefAppend> {
    if (parent === null) return { session: null, ref: null, outcome: 'no-session', reason: 'The local architect\'s session was not kept after its completion request' };
    try {
      const answer = await agent.appendContext(parent.ref, key, brief);
      if (answer.outcome === 'session-lost') return { session: parent.session, ref: null, outcome: 'session-lost', reason: 'The local architect\'s session can no longer be read' };
      return { session: parent.session, ref: answer.ref, outcome: answer.outcome, reason: null };
    } catch (error) {
      return { session: parent.session, ref: null, outcome: 'failed', reason: message(error) };
    }
  }

  /**
   * What the architect's own session holds after the append: the point its
   * next turn continues from, the note in its transcript, or, where the
   * append did not land, the brief its next input carries from the log. A
   * session that can no longer be read is finished as lost.
   */
  private async afterBriefAppend(run: Run, reconciliation: string, appended: BriefAppend, brief: string, parent: ParentSession): Promise<void> {
    if (appended.outcome === 'appended' || appended.outcome === 'already-present') {
      parent.ref = appended.ref ?? parent.ref;
      const session = appended.session;
      if (appended.outcome === 'appended' && session !== null) {
        await recordAppend(this.transcriptOf(run, session), { kind: 'note-appended', text: brief }, null)
          .catch(error => this.warn(`Run ${run.record.jobId}: the brief of ${reconciliation} is missing from ${session}'s transcript: ${message(error)}`));
      }
      return;
    }
    parent.undelivered.push(reconciliation);
    if (appended.outcome === 'session-lost') {
      await this.finishSession(run, parent.session, 'lost');
      parent.session = undefined;
      parent.ref = undefined;
    }
  }

  /**
   * What the local architect's next turn is told of a reconciliation: the
   * correction it chose with the CheckFindings planned for repair, and the
   * brief of every round whose append did not land, read from the log.
   */
  private reconciliationBriefing(run: Run, reconciliation: string, undelivered: readonly string[]): ReconciliationBriefing | undefined {
    const read = (id: string) => {
      const parsed = reconciliationAssessmentSchema.safeParse(this.committedBody(run, reconciliationLayout.assessment(id)));
      return parsed.success ? parsed.data : undefined;
    };
    const record = read(reconciliation);
    if (record === undefined) return undefined;
    const state = checkFindingStateOf(run.log.ledger);
    const repairs = [...state.findings.values()]
      .filter(entry => entry.standing === 'open' && entry.repair?.kind === 'intent' && entry.repair.ref === reconciliation)
      .map(entry => ({ checkFinding: entry.id, title: entry.reports[0]?.observation.summary ?? '' }));
    const briefs = undelivered.flatMap(id => {
      const undeliveredRecord = read(id);
      return undeliveredRecord === undefined ? [] : [undeliveredRecord.brief];
    });
    const failure = run.log.all('reconciliation-brief-appended').filter(event => undelivered.includes(event.data.reconciliation)).at(-1);
    return {
      id: reconciliation,
      next: record.next,
      ...(record.submission.next.kind === 'correct' ? { goal: record.submission.next.goal } : {}),
      repairs,
      ...(briefs.length === 0 ? {} : { brief: briefs.join('\n\n') }),
      ...(failure === undefined ? {} : { appendFailure: `${failure.data.outcome}${failure.data.reason === null ? '' : `: ${failure.data.reason}`}` }),
    };
  }

  /**
   * Commits `work-item-completed` where the completion basis still holds
   * (appendix §6): the gate audited the reconciled source or its scenario
   * rendering, every request of the work item is settled as the basis names
   * it, every basis CheckFinding is at its captured revision, and nothing
   * that warrants another round has become open. Where one of those fails
   * and a round remains, the completion is refused and recorded, and the
   * caller reconciles again; otherwise the work item completes, naming each
   * CheckFinding left open and why.
   */
  private async completeWorkItem(run: Run, item: WorkItem, gate: GateAttempt, basis: CompletionBasis): Promise<'completed' | 'ended' | { readonly refused: string }> {
    const limit = run.record.policy.limits.reconciliationRoundsPerWorkItem ?? defaultReconciliationRounds;
    const minimum = run.record.policy.limits.laterRoundMinimumRisk ?? 'medium';
    // The lineage is read outside the mutex: both commits are immutable.
    const lineage = basis.decided ? await this.sourceLineage(run, basis.commit, gate.audited) : null;
    const outcome = await run.mutex.run(async () => {
      if (run.log.terminal !== undefined) return 'ended' as const;
      const now = this.basisState(run, item.id);
      const rounds = run.log.all('reconciliation-started').filter(event => event.data.workItem === item.id).length;
      const inBasis = new Set(basis.checkFindings.map(entry => entry.checkFinding));
      const raised = [...now.attention].filter(([id]) => !inBasis.has(id)).map(([, entry]) => entry);
      // A changed source or request set always refuses: the next capture
      // binds the source and requests as they now stand. A changed or new
      // CheckFinding refuses only where it warrants a round that remains.
      const hard = lineage ?? basisChange({ source: { commit: basis.commit, tree: '' }, requests: basis.requests, checkFindings: [] },
        { source: { commit: basis.commit, tree: '' }, requests: now.requests, unsettled: now.unsettled, revisions: now.revisions });
      if (hard !== null) return { refused: hard };
      const moved = basis.checkFindings.find(entry => now.revisions.get(entry.checkFinding) !== entry.revision);
      const soft = moved !== undefined
        ? `${moved.checkFinding} is at revision ${now.revisions.get(moved.checkFinding) ?? 'none'}, not ${moved.revision}`
        : raised.length > 0 ? `${raised.length === 1 ? 'a CheckFinding' : `${raised.length} CheckFindings`} became open after the basis` : null;
      // A first round is warranted by any signal; a later one by a signal that clears its start.
      const warranted = (entries: readonly AttentionEntry[]) => (rounds === 0 ? entries.length > 0 : needsLaterRound(entries, minimum));
      if (soft !== null && rounds < limit && warranted([...now.attention.values()])) return { refused: soft };
      const unresolved = this.unresolvedOf(run, item.id, now.state, limit);
      await run.log.append({
        type: 'work-item-completed',
        data: { workItem: item.id, gate: gate.id, ...(unresolved.length === 0 ? {} : { unresolved }) },
      });
      return 'completed' as const;
    });
    if (typeof outcome === 'object') {
      await this.write(run, { type: 'reconciliation-refused', data: { workItem: item.id, reconciliation: this.latestBasis(run, item.id)?.id ?? null, stage: 'completion', reason: outcome.refused } });
    }
    return outcome;
  }

  /**
   * Each open CheckFinding of a completing work item, and why it is left
   * open: open at the last round's assessment, open below its round's floor,
   * or opened after the last basis. Read under the mutex.
   */
  private unresolvedOf(run: Run, workItem: string, state: CheckFindingState, limit: number): Array<{ readonly checkFinding: CheckFindingId; readonly reason: UnresolvedReason }> {
    const last = this.latestBasis(run, workItem);
    const inLast = new Set(last?.checkFindings.map(entry => entry.checkFinding) ?? []);
    return this.ownerCheckFindings(state, workItem, 'all').filter(summary => summary.standing === 'open').map(summary => ({
      checkFinding: summary.id,
      reason: !inLast.has(summary.id) ? 'raised-after-last-round' as const : last!.round >= limit ? 'rounds-exhausted' as const : 'below-floor' as const,
    }));
  }

  /**
   * Why the gate's audited commit is not the reconciled source, or null when
   * it is, or when it differs from it only by the expected rendering of the
   * tracked feature files, byte for byte.
   */
  private async sourceLineage(run: Run, from: string, to: string | null): Promise<string | null> {
    if (to === null) return `the gate audited no commit, and the reconciled source is ${from}`;
    if (to === from) return null;
    try {
      const changes = await this.candidates.diffNameStatus(this.projectRoot, from, to);
      const tracked = trackedScenarios(run.log.ledger.replay());
      const expected = new Map(expectedFeatureHashes(expectedFeatureFiles(tracked, { planId: run.record.planId, runId: run.record.jobId }))
        .map(file => [file.path, file.hash]));
      for (const change of changes) {
        const hash = expected.get(change.path);
        if (hash === undefined) return `${change.path} changed between the reconciled source ${from} and the gate's ${to}, and only a rendered feature file may`;
        if (change.status === 'D' || featureContentHash(await this.candidates.readBlob(this.projectRoot, to, change.path)) !== hash) {
          return `${change.path} at ${to} is not its expected rendering`;
        }
      }
      return null;
    } catch (error) {
      return `the lineage from ${from} to ${to} could not be read: ${message(error)}`;
    }
  }

  // Loading and recovery

  private async load(): Promise<RunRecoveryReport> {
    const report: RunRecoveryReport = { interrupted: [], rematerialized: [], effects: [], invocations: [], skipped: [], reviews: [] };
    for (const { planId, jobId } of await listJobDirectories(this.projectRoot)) {
      const directory = runDirectory(this.projectRoot, planId, jobId);
      const recordPath = join(directory, runLayout.record);
      let run: Run;
      try {
        const document = await readIfExists(recordPath);
        if (document === undefined) continue;
        const parsed: unknown = JSON.parse(document.toString('utf8'));
        if ((parsed as { kind?: unknown } | null)?.kind !== 'implementation') continue;
        const record = runRecordSchema.parse(parsed);
        if (record.jobId !== jobId || record.planId !== planId) throw new Error('job.json names another run');
        const log = await RunLog.open(join(directory, runLayout.events), jobId);
        const base = await this.runBase(record, log);
        let loaded!: Run;
        loaded = new Run(record, directory, log, base, this.newWriter(record.policy, () => this.accepted(loaded)));
        run = loaded;
      } catch (error) {
        report.skipped.push(key(planId, jobId));
        this.warn(`Skipping ${directory}: ${message(error)}. It declares ${declaredSchemaOf(await readJson(recordPath))}.`);
        continue;
      }
      this.runs.set(run.key, run);

      const rewritten = await recoverCommits(run.log.ledger);
      if (rewritten.rewritten.length > 0) report.rematerialized.push(`${run.key}: ${rewritten.rewritten.length} record file(s)`);

      if (!run.log.terminal) {
        for (const effect of await this.completeEffects(run)) report.effects.push(`${run.key}: ${effect}`);
        for (const scenario of await this.completeWithdrawals(run)) report.effects.push(`${run.key}: the withdrawal of ${scenario}`);
        for (const decision of await this.completeDeliveries(run)) report.effects.push(`${run.key}: the delivery of decision ${decision}`);
        for (const invocation of await this.closeInterruptedInvocations(run)) report.invocations.push(`${run.key}: ${invocation}`);
        // A request an accepted iteration is owed is recorded once, and
        // every unsettled one is finished: the run runs nothing more.
        for (const review of await this.recoverReviews(run)) report.reviews.push(`${run.key}: ${review}`);
        // Every session the run still keeps is finished as a run end
        // finishes it, and one opened whose first invocation never started
        // was interrupted with it, so a recovered run holds no suspended
        // session either.
        const ended = await this.endRun(run, {
          type: 'job-interrupted',
          data: { message: 'The harness stopped while the run was running. Its records are complete to the last committed transition; start a new run to continue.' },
        }, 'interrupted');
        if (ended === 'committed') report.interrupted.push(run.key);
      }

      for (const event of run.log.events) {
        if (event.type === 'job-started' || event.type === 'stop-requested' || event.type === 'analysis-approved') {
          this.commands.remember(event.data.command);
        }
        if (event.type === 'check-findings-recorded' && event.data.cause.kind === 'user-command') this.commands.remember(event.data.cause.command);
      }
    }
    return report;
  }

  /**
   * Every external effect whose intent has no completion, performed again
   * under its key: the parent append of a decision, the commit a gate makes,
   * which a repeat finds by its `Ramify-Gate` trailer, and the commit that
   * materializes the feature files, which a repeat finds by its
   * `Ramify-Scenarios` trailer. None makes a second commit.
   */
  private async completeEffects(run: Run): Promise<string[]> {
    const performed: string[] = [];
    for (const pending of run.log.ledger.pendingEffects()) {
      const event = pending.event;
      if (event.type === 'decision-accepted') {
        // The decision is committed and its brief is not in the parent
        // context yet. The append is keyed by the decision, so performing it
        // again appends it once: a repeat answers already-present.
        const decision = await this.readDecision(run, event.data.decision);
        if (decision === null) {
          this.warn(`Run ${run.record.jobId}: the decision of effect "${pending.key}" cannot be read; its brief was left unappended`);
          continue;
        }
        const agent = this.options.agent;
        if (agent === undefined) {
          this.warn(`Run ${run.record.jobId}: no agent is configured, so the brief of ${decision.id} was left unappended`);
          continue;
        }
        await this.appendBrief(run, agent, decision, null);
        performed.push(`the parent append of decision ${decision.id}`);
        continue;
      }
      if (event.type === 'reconciliation-assessed') {
        // The assessment is committed and its brief is not in the local
        // architect's session yet. The append is keyed by the
        // reconciliation, so performing it again appends it once.
        const id = event.data.reconciliation;
        const record = reconciliationAssessmentSchema.safeParse(this.committedBody(run, reconciliationLayout.assessment(id)));
        const agent = this.options.agent;
        if (!record.success || agent === undefined) {
          this.warn(`Run ${run.record.jobId}: the brief of ${id} was left unappended: ${record.success ? 'no agent is configured' : 'its assessment cannot be read'}`);
          continue;
        }
        await run.log.ledger.effect<BriefAppend>({
          key: pending.key,
          serialize: work => run.mutex.run(work),
          // The intent is in the log already; the ledger never builds it again.
          intent: () => { throw new Error(`The intent of ${pending.key} is already committed`); },
          perform: key => this.appendReconciliationBrief(agent, key, record.data.parent, record.data.brief),
          complete: result => ({ event: run.log.next({ type: 'reconciliation-brief-appended', data: { reconciliation: id, ...result } }), records: [] }),
        });
        performed.push(`the parent append of reconciliation ${id}`);
        continue;
      }
      if (event.type === 'scenarios-withdrawing') {
        // The files are re-rendered with the intent's scenarios pending, and
        // the commit is found by its trailers where the attempt made it.
        await this.performWithdrawal(run, event.data, true);
        performed.push(`the withdrawal commit of ${event.data.scenarios.join(', ')}`);
        continue;
      }
      if (event.type === 'scenarios-materializing') {
        // The files are re-rendered from the ledger, and the commit is found
        // by its trailers where the interrupted attempt made it.
        await this.performMaterialization(run, true);
        performed.push('the materialization of the feature files');
        continue;
      }
      if (event.type !== 'gate-committing') {
        this.warn(`Run ${run.record.jobId}: effect "${pending.key}" has no known completion and was left alone`);
        continue;
      }
      const read = await readCommitted(run.log.ledger, runLayout.gateOperation(event.data.gate), runSchemas.gateOperation);
      if (read.kind !== 'valid') {
        this.warn(`Run ${run.record.jobId}: the gate operation of effect "${pending.key}" cannot be read; its commit was left alone`);
        continue;
      }
      const operation = read.value as GateOperation;
      await this.commitGate(run, preparedGate(operation), undefined, undefined, undefined, operation.message);
      performed.push(`the commit and audit of gate ${event.data.gate}`);
    }
    return performed;
  }

  /**
   * An invocation whose start has no end was interrupted with the harness.
   * It is closed as `failed` with `session-lost`, which calls no agent: the
   * successor of an interrupted invocation belongs to a run that is started
   * again, and the tree it left is what that run's engineer reads. Its
   * session is finished with it, as `interrupted`.
   */
  private async closeInterruptedInvocations(run: Run): Promise<string[]> {
    const closed: string[] = [];
    const ended = new Set(run.log.all('invocation-ended').map(event => event.data.invocation));
    for (const started of run.log.all('invocation-started')) {
      const id = started.data.invocation;
      if (ended.has(id)) continue;
      const settled = await run.writer.release(id).catch(() => ({ confirmed: false, at: this.now().toISOString(), groupsKilled: 0, lateWrites: [] }));
      // Observations are appended without a transaction, by decision 2, so
      // the last of an invocation the harness was interrupted in may be
      // missing. The gap is recorded rather than left to be read as an
      // invocation that observed nothing more.
      await (await ObservationLog.open(run.path(runLayout.observations(id)))).record({
        type: 'coverage-gap',
        data: {
          kind: 'observation-truncated',
          detail: 'the harness stopped while this invocation was running, so its last observations may be missing',
        },
      }).catch(error => this.warn(`Run ${run.record.jobId}: ${id}'s truncation gap was not recorded: ${message(error)}`));
      await this.endInvocation(run, id, started.data.session, finished('interrupted'), {
        ended: 'failed',
        interruption: 'session-lost',
        disposition: 'incomplete',
        submission: null,
        rejectedSubmissions: 0,
        settled: { ...settled, confirmed: false },
        outsideScope: [],
        usage: { unavailable: 'the harness stopped while the session was running' },
        elapsedMs: 0,
        error: 'The harness stopped while this invocation was running.',
      });
      closed.push(id);
    }
    return closed;
  }

  private newWriter(policy: RunPolicy, boundary: () => string): WriterOwnership {
    const tree: TreeObserver = { changed: () => this.git.changedPaths(this.projectRoot, boundary()).catch(() => []) };
    return new WriterOwnership({
      settleMs: policy.limits.writerSettleMs,
      tree,
      groups: this.options.groups ?? nodeProcessGroups,
    });
  }

  /** The source boundary accepted by the latest passed committing gate. */
  private accepted(run: Run): string {
    return acceptedCommit(run.log.ledger.replay(), run.base);
  }

  /**
   * The run's original source boundary. Real inputs record it in the
   * manifest; older and test inputs can be recovered from the first durable
   * invocation or gate before consulting the current checkout.
   */
  private async runBase(record: RunRecord, log: RunLog): Promise<string> {
    if (record.manifest.source !== null) return record.manifest.source.commit;
    for (const entry of log.ledger.replay()) {
      for (const stored of entry.transaction.records) {
        const body = stored.body as { readonly schema?: unknown; readonly base?: unknown; readonly head?: unknown } | null;
        if (body?.schema === 'ramify-agent.invocation/1' && typeof body.base === 'string') return body.base;
        if (body?.schema === 'ramify-agent.gate-attempt/3' && typeof body.head === 'string') return body.head;
      }
    }
    return this.git.currentHead(this.projectRoot);
  }

  // Queries

  listRuns(planId: string): RunSnapshot[] {
    return this.runsOf(planId).map(run => runSnapshot(run.record, run.log.events));
  }

  getRun(planId: string, runId: string): RunSnapshot | undefined {
    const run = this.runs.get(key(planId, runId));
    return run && runSnapshot(run.record, run.log.events);
  }

  /** The run's events, exactly as its log holds them. */
  events(planId: string, runId: string) {
    return this.runs.get(key(planId, runId))?.log.events;
  }

  /** The record of one run, for a caller that reads what it was started with. */
  recordOf(planId: string, runId: string): RunRecord | undefined {
    return this.runs.get(key(planId, runId))?.record;
  }

  /**
   * What a projection reads of one run: its record, its directory and every
   * complete line of its log, record bodies included. It is a read: the
   * caller receives the replay, and nothing it does with it reaches the log.
   */
  committed(planId: string, runId: string) {
    const run = this.runs.get(key(planId, runId));
    return run && { record: run.record, directory: run.directory, entries: run.log.ledger.replay() };
  }

  /**
   * Commits CheckFinding commands on a path with no run event of its own,
   * such as recovery or a user's answer, as one `check-findings-recorded`
   * line under the run mutex. An exact redelivery appends nothing; a
   * refusal appends nothing and says why. Undefined for an unknown run.
   */
  async recordCheckFindings(
    planId: string,
    runId: string,
    change: { readonly cause: CheckFindingCause; readonly commands: readonly CheckFindingCommand[] },
  ): Promise<CheckFindingCommit | undefined> {
    const run = this.runs.get(key(planId, runId));
    if (run === undefined) return undefined;
    const committed = await this.commitCheckFindings(run, () => ({
      commands: change.commands,
      compose: decided => ({ event: { type: 'check-findings-recorded', data: { cause: change.cause, checkFindings: [...decided.events] } } }),
    }));
    // A work item waiting for a user's answer reads the state again.
    if (committed.kind === 'committed') run.notify();
    return committed;
  }

  /**
   * The run's CheckFindings, as the child selects them from the state
   * replayed from its log: a bounded list or one detail. Undefined for an
   * unknown run.
   */
  checkFindings(planId: string, runId: string, query: CheckFindingQueryInput): CheckFindingSelection | undefined {
    const run = this.runs.get(key(planId, runId));
    return run && selectCheckFindings(checkFindingStateOf(run.log.ledger), query);
  }

  /**
   * The one CheckFinding transition of a run, for every producer and
   * decision path: see `check-findings/transition.ts`. Slow work is done
   * before it; `build` validates what that work captured under the mutex.
   */
  private async commitCheckFindings(run: Run, build: CheckFindingBuild): Promise<CheckFindingCommit> {
    return await commitCheckFindingChange(run, build, this.now());
  }

  /** The runs of one plan, newest first, as `committed` answers each. */
  committedRuns(planId: string) {
    return this.runsOf(planId).map(run => ({ record: run.record, directory: run.directory, entries: run.log.ledger.replay() }));
  }

  /**
   * Every run it serves, of every plan, with its version: the sequence of its
   * last event. A reader compares versions to know which runs changed,
   * without replaying any log.
   */
  runVersions(): Array<{ readonly planId: string; readonly runId: string; readonly version: number }> {
    return [...this.runs.values()].map(run => ({
      planId: run.record.planId,
      runId: run.record.jobId,
      version: run.log.events.at(-1)?.sequence ?? 0,
    }));
  }

  /** The name of the agent a run starts with, or undefined when none is configured and no run can start. */
  get agentName(): string | undefined {
    return this.options.agent?.name;
  }

  /** Settles when the run's driver has nothing left to do. For tests and shutdown. */
  async settled(planId: string, runId: string): Promise<void> {
    const run = this.runs.get(key(planId, runId));
    if (run) await run.idle();
  }

  private runsOf(planId: string): Run[] {
    return [...this.runs.values()]
      .filter(run => run.record.planId === planId)
      .sort((a, b) => (a.record.createdAt === b.record.createdAt
        ? (a.record.jobId < b.record.jobId ? 1 : -1)
        : (a.record.createdAt < b.record.createdAt ? 1 : -1)));
  }

  // Commands

  /**
   * Runs a command and returns its receipt. A command whose ID and content
   * match an accepted command returns that command's receipt and does nothing
   * more. A reused ID with other content is a conflict. A new command whose
   * expected version is not the run's is stale and carries the current
   * version. A second run while one is active is busy.
   */
  execute(command: RunCommand): Promise<Receipt> {
    return this.commandMutex.run(async () => {
      if (this.closed) throw new CommandRejection('unavailable', 'The harness is shutting down');
      const admitted = this.commands.admit(command);
      if (admitted.kind === 'repeat') return admitted.receipt;
      switch (command.type) {
        case 'start-run': return this.start(command, admitted.contentHash);
        case 'stop-job': return this.stop(command, admitted.contentHash);
        case 'approve-analysis': return this.approve(command, admitted.contentHash);
        case 'respond-to-check-finding':
        case 'waive-check-finding':
        case 'revoke-check-finding-waiver':
          return this.checkFindingCommand(command, admitted.contentHash);
      }
    });
  }

  private async start(command: Extract<RunCommand, { type: 'start-run' }>, contentHash: string): Promise<Receipt> {
    const { planId, agent: requested, reviewStop } = command.payload;
    this.commands.requireVersion(command, 0, 'A start creates a run, whose version is 0');
    const agent = this.options.agent;
    if (!agent) throw new CommandRejection('unavailable', 'No agent is configured, so no run can start');
    if (agent.name !== requested) throw new CommandRejection('unavailable', `The configured agent is "${agent.name}", not "${requested}"`);
    const running = [...this.runs.values()].find(run => !run.log.terminal);
    if (running) {
      throw new CommandRejection('busy', `Run ${running.record.jobId} of plan "${running.record.planId}" is still running; one run runs at a time`);
    }
    const plan = await readPlan(this.projectRoot, planId);
    if (!plan) throw new CommandRejection('not-found', `No plan with ID "${planId}"`);
    if (plan.status === 'unreadable') throw new CommandRejection('unreadable', `${plan.path}: ${plan.message}`);
    if (!await this.options.lock.held()) throw new CommandRejection('internal', 'This harness no longer holds the project lock');

    // The plan's state directory exists, with its marker and its
    // `.gitignore`, before the evidence is captured: the run's own records
    // never change what the evidence describes, `git add -A` at a gate never
    // commits them, and readiness sees a clean tree. Nothing else of the plan
    // is created; a run saves no map.
    await ensureStateDirectory(planStateDirectory(this.projectRoot, planId), { gitignore: true });
    const captured = await capturePlan(this.projectRoot, planId);
    const { manifest, packages, promptManifest, policy } = await this.captureInputs(captured);

    const now = this.now();
    const runId = newJobId(now);
    const directory = runDirectory(this.projectRoot, planId, runId);

    // Written once, before the first event: the captured plan, the prompt
    // manifest, the frozen baseline and then `job.json`, which names them.
    await mkdir(join(directory, 'input'), { recursive: true });
    await mkdir(join(directory, 'prompts'), { recursive: true });
    await mkdir(join(directory, 'measurements'), { recursive: true });
    await writeOnce(join(directory, runLayout.capturedPlan), captured);
    await writeOnce(join(directory, runLayout.promptManifest), `${JSON.stringify(promptManifest, null, 2)}\n`);

    const baseline = await this.freezeBaseline(directory, planId, manifest, packages);
    const record = runRecordSchema.parse({
      schema: jobSchemaVersion,
      jobId: runId,
      planId,
      kind: 'implementation',
      agent: requested,
      createdAt: now.toISOString(),
      manifest,
      prompts: Object.fromEntries([...packages].map(([role, loaded]) => [role, { package: loaded.package, hash: loaded.hash }])),
      policy,
      // Read once, beside the policy. A missing or invalid file is captured
      // with its reason; readiness reports it, and the start is not refused.
      projectConfig: await captureProjectConfig(this.projectRoot),
      baseline: baseline.reference,
      // The plan's own scenarios, extracted once from the captured bytes. A
      // block that does not parse is a limitation, never a refusal.
      planScenarios: extractPlanScenarios(new TextDecoder().decode(captured)),
      reviewStop,
    });
    await writeOnce(join(directory, runLayout.record), `${JSON.stringify(record, null, 2)}\n`);

    const log = await RunLog.open(join(directory, runLayout.events), runId);
    const base = manifest.source?.commit ?? await this.git.currentHead(this.projectRoot);
    let run!: Run;
    run = new Run(record, directory, log, base, this.newWriter(policy, () => this.accepted(run)));
    run.index = await this.options.inputs.index(this.projectRoot, manifest).catch(() => null);
    const accepted = this.commands.accept(command, contentHash, runId, run.log.nextSequence, now);
    this.runs.set(run.key, run);
    await run.log.append({ type: 'job-started', data: { command: accepted } }, now);
    this.commands.remember(accepted);

    run.done = this.drive(run, agent, packages, baseline.snapshot)
      .catch(error => this.fail(
        run,
        error instanceof WriterBlockedError && error.reason === 'unsettled' ? 'writer-unsettled' : 'internal',
        message(error),
      ))
      .catch(error => this.warn(`Run ${runId}: ${error instanceof Error ? error.stack : String(error)}`));
    return accepted.receipt;
  }

  private async captureInputs(captured: Uint8Array) {
    const { manifest: promptManifest, packages } = await loadPromptPackages({
      ...(this.options.skillDirectory === undefined ? {} : { skillDirectory: this.options.skillDirectory }),
    });
    let manifest;
    try {
      manifest = await this.options.inputs.capture(this.projectRoot, captured, packages);
    } catch (error) {
      if (error instanceof EvidenceUnavailableError) throw new CommandRejection('unavailable', error.message);
      throw error;
    }
    const nested = await discoverNestedPackages(this.projectRoot);
    const policy = (this.options.policy ?? ((root, found) => defaultRunPolicy({ projectRoot: root, nested: found })))(this.projectRoot, nested);
    return { manifest, packages, promptManifest, policy };
  }

  /**
   * Freezes `B` from the first snapshot of the run, over the root subtree,
   * all view areas, the architect view and the initial support set, each
   * once. The snapshot is written beside `job.json`, before it, because
   * `job.json` names it. A producer that cannot be run leaves the baseline
   * unavailable with that reason, never a zero.
   */
  private async freezeBaseline(
    directory: string,
    planId: string,
    manifest: RunRecord['manifest'],
    packages: ReadonlyMap<string, LoadedPackage>,
  ): Promise<{ reference: RunRecord['baseline']; snapshot: MeasurementSnapshot }> {
    const support: Array<{ path: string; bytes: number }> = [];
    const plan = await supportDocument(this.projectRoot, join(this.projectRoot, 'plans', planId, 'plan.md'));
    if (plan !== null) support.push(plan);
    for (const loaded of packages.values()) {
      for (const file of loaded.files) support.push({ path: file.path, bytes: file.bytes });
    }
    const id = snapshotId(1);
    const snapshot = await captureSnapshot({
      id,
      ramify: this.options.ramify,
      projectRoot: this.projectRoot,
      head: '',
      view: manifest.architectView,
      supplementary: support,
    });
    const path = join(directory, runLayout.measurement(id));
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    await writeOnce(path, content);
    if ('unavailable' in snapshot.measure) {
      return { reference: { unavailable: snapshot.measure.unavailable }, snapshot };
    }
    return { reference: { measurement: { id, revision: 1, hash: sha256(content) } }, snapshot };
  }

  private async stop(command: Extract<RunCommand, { type: 'stop-job' }>, contentHash: string): Promise<Receipt> {
    const { planId, jobId } = command.payload;
    const run = this.runs.get(key(planId, jobId));
    if (!run) throw new CommandRejection('not-found', `No run ${jobId} for plan "${planId}"`);
    const receipt = await run.mutex.run(async () => {
      this.commands.requireVersion(command, run.log.version);
      if (run.log.terminal) throw new CommandRejection('conflict', `The run has already ended (${run.log.terminal.type})`);
      if (run.stopRequested) throw new CommandRejection('conflict', 'A stop was already accepted for this run');
      const at = this.now();
      const accepted = this.commands.accept(command, contentHash, jobId, run.log.nextSequence, at);
      await run.log.append({ type: 'stop-requested', data: { command: accepted } }, at);
      run.stopRequested = true;
      this.commands.remember(accepted);
      return accepted.receipt;
    });
    // A driver waiting at the review stop has no session to stop; it reads
    // the stop and returns, and the run is stopped with nothing written.
    run.notify();
    const driving = run.done;
    const stopping = this.endStopped(run).catch(error => this.warn(`Run ${jobId}: ${message(error)}`));
    run.done = Promise.all([driving, stopping]).then(() => undefined);
    return receipt;
  }

  /**
   * Ends a stopped run: asks every open session to stop, the writer's and
   * each reader's, waits for them at most the bound, finishes every review
   * request still unsettled as stopped, and marks the run stopped whether or
   * not they became idle. Whatever a session produces afterwards is rejected.
   */
  private async endStopped(run: Run): Promise<void> {
    const grace = this.options.stopGraceMs ?? run.record.policy.limits.stopSettleMs;
    const settled = await this.stopReaders(run, 'stopped', grace, true);
    if (this.closed) return;
    await this.endRun(run, { type: 'job-stopped', data: { settled } });
  }

  /**
   * Stops the run's readers, and with `writer` its writer too: no attempt
   * starts from here on, every open session is asked to stop, and each open
   * invocation and review attempt is awaited at most `grace`. A request still
   * unsettled then is finished as not verified with `reason`, so the run's
   * terminal event follows a complete review history. Answers whether every
   * session stopped within the bound.
   */
  private async stopReaders(run: Run, reason: NotVerifiedReason, grace: number, writer = false): Promise<boolean> {
    run.readerStop ??= reason;
    run.reviews?.close();
    const sessions = run.sessions(live => writer || live.reader);
    let timer: NodeJS.Timeout | undefined;
    const settled = sessions.length === 0 || await Promise.race([
      Promise.all(sessions.map(session => session.stop().then(() => true, () => true))).then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), grace); }),
    ]);
    clearTimeout(timer);
    // The run's terminal event is its last write, so the invocations it has
    // open, and the attempts that record their readers' results, close first.
    const open = [...run.live.values()].filter(live => writer || live.reader).map(live => live.done);
    await Promise.race([
      Promise.all([...open, run.reviews?.settled()]),
      new Promise<void>(resolve => { timer = setTimeout(resolve, grace); }),
    ]);
    clearTimeout(timer);
    if (!this.closed && run.record.policy.reviews !== undefined) {
      await this.finishUnsettledReviews(run, (_request, running) => ({
        reason,
        detail: reason === 'deadline'
          ? (running ? 'The reviews\' settlement bound passed while this attempt ran; its reader was stopped' : 'The reviews\' settlement bound passed before this review ran')
          : (running ? 'The run stopped while this attempt ran; its reader was stopped' : 'The run stopped before this review ran'),
      }));
    }
    return settled;
  }

  /**
   * A person's approval of the accepted analysis. At the review stop it
   * wakes the driver, which goes on to readiness; in any other run it is
   * recorded and changes nothing else. It is decided under the run's lock,
   * against the log as it stands, like a stop.
   */
  private async approve(command: Extract<RunCommand, { type: 'approve-analysis' }>, contentHash: string): Promise<Receipt> {
    const { planId, jobId, reviewer, note } = command.payload;
    const run = this.runs.get(key(planId, jobId));
    if (!run) throw new CommandRejection('not-found', `No run ${jobId} for plan "${planId}"`);
    const receipt = await run.mutex.run(async () => {
      this.commands.requireVersion(command, run.log.version);
      const snapshot = runSnapshot(run.record, run.log.events);
      const refusal = approvalRefusal(run, snapshot);
      if (refusal !== null) throw new CommandRejection('conflict', refusal);
      const at = this.now();
      const accepted = this.commands.accept(command, contentHash, jobId, run.log.nextSequence, at);
      await run.log.append({
        type: 'analysis-approved',
        data: {
          command: accepted,
          reviewer,
          note: note ?? null,
          duringRun: snapshot.state === 'running' && snapshot.phase !== 'awaiting-review',
        },
      }, at);
      this.commands.remember(accepted);
      return accepted.receipt;
    });
    run.notify();
    return receipt;
  }

  /**
   * A person's answer, waiver or revocation of one CheckFinding. Under the
   * run's lock it expects the run's version and the CheckFinding's revision
   * the person saw, validates the person's authority, and commits the one
   * decision the child accepts on a `check-findings-recorded` line that holds
   * the accepted command. A refusal appends nothing. A work item waiting for
   * the answer reads the state again.
   */
  private async checkFindingCommand(command: CheckFindingUserCommand, contentHash: string): Promise<Receipt> {
    const { planId, jobId } = command.payload;
    const run = this.runs.get(key(planId, jobId));
    if (!run) throw new CommandRejection('not-found', `No run ${jobId} for plan "${planId}"`);
    const at = this.now();
    let accepted: AcceptedCommand | undefined;
    const committed = await commitCheckFindingChange(run, ({ log, state }) => {
      this.commands.requireVersion(command, log.version);
      const change = userCheckFindingChange(command, state.findings.get(command.payload.checkFinding));
      if (!change.ok) throw new CommandRejection(change.code, change.message, undefined, change.evidence);
      const receipt = this.commands.accept(command, contentHash, jobId, log.nextSequence, at);
      accepted = receipt;
      return {
        commands: [change.command],
        compose: decided => ({ event: { type: 'check-findings-recorded', data: { cause: { kind: 'user-command', command: receipt }, checkFindings: [...decided.events] } } }),
      };
    }, at);
    if (committed.kind === 'refused') {
      const { refusal } = committed;
      if (refusal.reason === 'run-ended') throw new CommandRejection('conflict', `The run has ended; its CheckFindings accept no command. ${refusal.message}`);
      if (refusal.reason === 'check-finding') {
        const entry = checkFindingStateOf(run.log.ledger).findings.get(command.payload.checkFinding);
        throw new CommandRejection(userRejectionCode(refusal.rejection), refusal.message, undefined,
          entry === undefined ? [] : [`${entry.id} is at revision ${entry.revision}`]);
      }
      throw new CommandRejection('conflict', refusal.message);
    }
    if (committed.kind !== 'committed' || accepted === undefined) throw new CommandRejection('internal', 'The CheckFinding command committed nothing');
    this.commands.remember(accepted);
    run.notify();
    return accepted.receipt;
  }

  // The run itself

  private ignoring(run: Run): boolean {
    return run.stopRequested || this.closed || run.log.terminal !== undefined;
  }

  private async drive(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot): Promise<void> {
    // The run's files are written and its first event is in the log; nothing
    // of the run itself has happened yet.
    await this.afterWrite('job-created', run.record.jobId);
    if (this.ignoring(run)) return;
    this.startReviews(run, agent, packages);
    const accepted = await this.analyse(run, agent, packages, baseline);
    if (!accepted || this.ignoring(run)) return;

    const approved = await this.awaitReview(run);
    if (!approved || this.ignoring(run)) return;

    const ready = await this.reachReadiness(run);
    if (!ready || this.ignoring(run)) return;

    await this.materializeScenarios(run);
    if (this.ignoring(run)) return;

    const worked = await this.takeWorkItems(run, agent, packages, baseline);
    if (!worked || this.ignoring(run)) return;

    // Every review settles, or is finished at its bound, before the final
    // gate: the run completes with no reader left and no request pending.
    await this.settleReviews(run);
    if (this.ignoring(run)) return;

    await this.finalGate(run);
  }

  // Invocations

  /**
   * One invocation, from the event that licenses it to the outcome that
   * closes it. Every role goes through here: the record is committed before
   * `startSession`, the judge is the one answer to an invalid submission,
   * the session's settlement is the harness's own observation, and the
   * closing event is the last write of the invocation.
   */
  private async runInvocation<T>(run: Run, agent: AgentPort, request: InvocationRequest<T>): Promise<InvocationResult<T>> {
    // The start is serialized with every other start, since the identifiers
    // are counted from the log; the session itself runs outside it, so a
    // reader and the writer run at once.
    const started = await run.starting.run(() => this.startInvocation(run, agent, request), request.reader === true ? 'after' : 'first');
    if ('refused' in started) {
      // A run that has spent its bounds starts nothing more. The writer's
      // path fails the run with the counter as evidence; a reader is only
      // refused, and the next writer invocation meets the same bound.
      if (request.reader !== true) await this.fail(run, 'limit-exceeded', started.refused);
      return { id: '', ended: 'stopped', value: undefined, ref: '', outcomeKind: 'stopped', session: '', kept: false };
    }
    try {
      return await this.runSession(run, agent, started.id, started.session, started.observations, started.transcript, request);
    } finally {
      started.closed();
    }
  }

  /**
   * Everything before an invocation's session starts, under `run.starting`:
   * the run-wide bounds, the identifiers, the events that license it, its
   * transcript's start and, for the writer, the writer's acquisition.
   */
  private async startInvocation<T>(run: Run, agent: AgentPort, request: InvocationRequest<T>): Promise<
    | { readonly refused: string }
    | { readonly id: string; readonly session: SessionId; readonly observations: ObservationLog; readonly transcript: InvocationTranscript; readonly closed: () => void }
  > {
    // The run-wide bounds are read before an invocation is started, so a run
    // that has spent them starts nothing more. The absolute bound is checked
    // at each invocation boundary; an invocation already running is bounded
    // by its own limits below.
    const limits = run.record.policy.limits;
    const invocations = run.log.count('invocation-started');
    // The time the run waited for a person at its review stop is not its own.
    const now = this.now().getTime();
    const age = now - Date.parse(run.record.createdAt) - reviewPauseMs(run.log.events, now);
    if (invocations + 1 > limits.maxInvocationsPerRun || age > limits.runAbsoluteMs) {
      return {
        refused: invocations + 1 > limits.maxInvocationsPerRun
          ? `The run has made ${invocations} invocations; the policy allows ${limits.maxInvocationsPerRun}`
          : `The run has run for ${age} ms; the policy allows ${limits.runAbsoluteMs}`,
      };
    }
    const id = invocationId(invocations + 1);
    // A fresh or forked start opens a session; a continued one joins the
    // session the caller kept. The executor's ref stays the caller's.
    const opens = request.start.mode !== 'continue';
    if (!opens && request.session === undefined) throw new Error(`The ${request.role} invocation ${id} continues a session it does not name`);
    // Every start that is not fresh names its harness point and its reason.
    if (!opens && request.continuing === undefined) throw new Error(`The ${request.role} invocation ${id} continues a session without a reason`);
    if (request.start.mode === 'fork' && request.fork === undefined) throw new Error(`The ${request.role} invocation ${id} forks without naming its point`);
    const session = opens ? sessionId(run.log.count('session-opened') + 1) : request.session!;
    const continues = opens ? undefined : this.continuationOf(run, session, request.continuing!);
    const invocation = invocationSchema.parse({
      schema: 'ramify-agent.invocation/1',
      id,
      role: request.role,
      work: request.work,
      attempt: request.attempt,
      session: requestedSession(request),
      prompt: { package: request.loaded.package, hash: request.loaded.hash, inputsHash: inputsHash([request.systemPrompt, request.prompt]) },
      scope: request.scope,
      writer: request.writer === true,
      base: this.accepted(run),
      startedAt: this.now().toISOString(),
    } satisfies Invocation);

    await mkdir(run.path(runLayout.session(id)), { recursive: true });
    const observations = await ObservationLog.open(run.path(runLayout.observations(id)));

    // Registered before any event, so a stop that arrives between the
    // invocation's start and its session's applies to a known invocation.
    let closed = () => undefined as void;
    run.live.set(id, { role: request.role, reader: request.reader === true, session: undefined, done: new Promise<void>(resolve => { closed = () => resolve(); }) });
    const release = () => {
      run.live.delete(id);
      closed();
    };
    try {
      if (opens) {
        await this.write(run, {
          type: 'session-opened',
          data: {
            session, role: request.role, work: request.work, executor: agent.name, model: this.options.model ?? null,
            ...(request.start.mode === 'fork' ? { fork: request.fork! } : {}),
            ...(request.replaces === undefined ? {} : { replaces: request.replaces }),
            ...(request.requestedBy === undefined ? {} : { requestedBy: request.requestedBy }),
          },
        });
        await this.afterWrite('session-opened', run.record.jobId);
      }
      await this.write(run, {
        type: 'invocation-started',
        data: {
          invocation: id, role: request.role, session, work: request.work, start: opens ? 'opened' : 'continued',
          ...(continues === undefined ? {} : { continues }),
        },
      }, [
        { path: runLayout.invocation(id), id, revision: 1, body: invocation },
      ]);
      // The transcript's start holds the prompts, and is written before the
      // session starts, so a crash before the first reply still leaves them.
      const transcript = this.invocationTranscript(run, session, id, observations);
      await transcript.started({
        role: request.role,
        work: request.work,
        start: opens ? 'opened' : 'continued',
        requested: request.start.mode,
        continues,
        fork: request.start.mode === 'fork' ? request.fork : undefined,
        replaces: opens ? request.replaces : undefined,
        requestedBy: opens ? request.requestedBy : undefined,
        executor: agent.name,
        model: this.options.model ?? null,
        systemPrompt: request.systemPrompt,
        prompt: request.prompt,
      });
      if (request.writer === true) {
        // The writer is acquired before the session starts, so a stop that
        // arrives between them applies to a writer the log already names.
        run.writer.acquire(id);
        await this.write(run, { type: 'writer-acquired', data: { invocation: id, scopeRevision: request.scope.write } });
        await this.afterWrite('writer-acquired', run.record.jobId);
      }
      await request.onStarted?.(id, session);
      return { id, session, observations, transcript, closed: release };
    } catch (error) {
      release();
      throw error;
    }
  }

  private async runSession<T>(
    run: Run,
    agent: AgentPort,
    id: string,
    session: SessionId,
    observations: ObservationLog,
    transcript: InvocationTranscript,
    request: InvocationRequest<T>,
  ): Promise<InvocationResult<T>> {
    // What the harness does with the session once this invocation ends. A
    // run that is ending uses none again.
    const keeping = (ended: InvocationOutcome['ended'], value: T | undefined): SessionKeeping =>
      (this.ignoring(run) ? finished('run-ended') : request.keep(ended, value));
    await this.afterWrite('invocation-started', run.record.jobId);
    if (this.ignoring(run) || request.fenced?.() === true) {
      await this.endInvocation(run, id, session, keeping('stopped', undefined), stoppedOutcome(), undefined, transcript);
      return { id, ended: 'stopped', value: undefined, ref: '', outcomeKind: 'stopped', session, kept: false };
    }

    const started = this.now().getTime();
    let value: T | undefined;
    let submissionHash: string | null = null;
    const judge = new SubmissionJudge<T>({
      target: request.toolName,
      bound: run.record.policy.limits.rejectedSubmissionsPerTurn,
      validate: input => request.validate(input),
      accept: async accepted => {
        const content = `${JSON.stringify({ schema: request.submissionSchema, ...(accepted as object) }, null, 2)}\n`;
        await writeFileAtomic(run.path(runLayout.submission(id)), content);
        value = accepted;
        submissionHash = sha256(content);
      },
      observations,
      ...(request.acceptedText === undefined ? {} : { acceptedText: request.acceptedText }),
      closed: () => (this.ignoring(run) ? 'This run accepts no further submissions.' : undefined),
    });

    // Read boundaries are soft: an excursion into another module is
    // permitted, recorded once, and reminded of once.
    const excursions = new ExcursionWatcher({
      projectRoot: this.projectRoot,
      index: run.index,
      scope: request.guarded,
    });
    const context = contextPolicyOf(run.record.policy, request.role);
    const recorder = new PortEventRecorder({ projectRoot: this.projectRoot, observations, judge, excursions, context, transcript });
    const equipment: Equipment = request.equip?.({
      invocation: id,
      observations,
      callId: tool => recorder.callId(tool),
      reminders: () => excursions.takeReminders(),
      transcript,
    }) ?? {};

    // Every port event is activity; `touch` is what the idle bound resets.
    const bounds = new InvocationBounds(request.absoluteMs === undefined
      ? run.record.policy.limits
      : { ...run.record.policy.limits, invocationAbsoluteMs: Math.min(run.record.policy.limits.invocationAbsoluteMs, request.absoluteMs) });
    let budget: InvocationOutcome['budget'] | undefined;

    const spec: SessionSpec = {
      role: request.role,
      scope: { workingDirectory: request.workingDirectory ?? this.projectRoot },
      systemPrompt: request.systemPrompt,
      prompt: request.prompt,
      session: request.start,
      context,
      builtinTools: equipment.builtinTools ?? ['read', 'grep', 'ls'],
      tools: [...(equipment.tools ?? [])],
      ...(equipment.guard === undefined ? {} : { guard: equipment.guard }),
      ...(equipment.afterMutation === undefined ? {} : { afterMutation: equipment.afterMutation }),
      submission: {
        name: request.toolName,
        description: request.description,
        inputSchema: request.inputSchema,
        accept: async input => {
          const verdict = await judge.judge(input);
          transcript.note(verdictNote(recorder.callId(request.toolName), request.toolName, verdict));
          return verdict;
        },
      },
      sessionDirectory: run.path(runLayout.session(id)),
      onEvent: event => {
        bounds.touch();
        void recorder.record(event)
          .catch(error => this.warn(`Run ${run.record.jobId}: observation not recorded: ${message(error)}`));
      },
    };

    let agentSession: AgentSession;
    try {
      agentSession = agent.startSession(spec);
    } catch (error) {
      const keptAs = keeping('failed', undefined);
      await this.endInvocation(run, id, session, keptAs, {
        ...stoppedOutcome(),
        ended: 'failed',
        interruption: 'adapter-fault',
        error: `The agent session could not start: ${message(error)}`,
      }, undefined, transcript);
      return { id, ended: 'failed', value: undefined, ref: '', outcomeKind: 'failed', session, kept: keptAs.kept, interruption: 'adapter-fault' };
    }
    const live = run.live.get(id);
    if (live !== undefined) live.session = agentSession;
    // A start the executor could not honor is known only now, after the
    // invocation's start is committed; its end records it.
    const degraded: DegradeRelation | undefined = request.start.mode !== 'fresh' && agentSession.start.mode !== request.start.mode
      ? { requested: request.start.mode, actual: agentSession.start.mode, reason: agentSession.start.degradedReason ?? null }
      : undefined;

    // The policy's two bounds on one invocation. Either asks the session to
    // stop and ends the invocation as failed with the bound as its
    // interruption; settlement below is what then says whether it is gone.
    const limits = run.record.policy.limits;
    const outcome = await bounds.outcome(agentSession);
    const interruption = bounds.interruption;
    const elapsedMs = this.now().getTime() - started;
    if (outcome.kind === 'context-budget-reached') {
      budget = { threshold: context.budgetTokens ?? 0, observed: outcome.tokens, reportDelivered: outcome.report !== undefined };
      transcript.note({ kind: 'budget-reached', tokens: outcome.tokens, threshold: context.budgetTokens, reportDelivered: outcome.report !== undefined });
    }

    // Whatever the equipment started ends before the writer is released:
    // discarding a reply is not shutdown, and a command still running is a
    // command that can still write.
    await equipment.settle?.().catch(error => this.warn(`Run ${run.record.jobId}: ${id} did not settle its own tools: ${message(error)}`));

    // An architect writes nothing, so it holds no writer; its settlement is
    // still the harness's own observation of the session.
    const settled = await this.settleSession(run, id, agentSession, request.reader === true);
    // `onEvent` cannot be async at the port boundary. Its ordered writes must
    // still finish before gaps are derived and before this driver can settle.
    await recorder.drain();
    await recorder.recordGaps(agent);
    const ref = agentSession.ref;

    // What the tree says changed since the last accepted commit. It is the
    // only observation that sees a write no guard saw, and comparing it with
    // the scope is what fills `outsideScope`. Nothing here blocks anything.
    let outsideScope: string[] = [];
    if (request.writer === true) {
      const snapshot = await recordSettledSnapshot({
        projectRoot: this.projectRoot,
        changed: () => this.git.changedPaths(this.projectRoot, this.accepted(run)),
        scope: request.guarded,
      }, observations);
      outsideScope = [...snapshot.outsideScope];
    }

    const ended = interruption !== undefined ? 'failed' : request.endedAs?.() ?? endedOf(outcome.kind, judge.boundReached);
    const keptAs = keeping(ended, ended === 'submitted' ? value : undefined);
    await this.endInvocation(run, id, session, keptAs, {
      ended,
      ...(interruption === undefined ? {} : {
        interruption,
        error: interruption === 'idle-timeout'
          ? `No port event for ${limits.invocationIdleMs} ms`
          : `The invocation ran for ${limits.invocationAbsoluteMs} ms, its absolute bound`,
      }),
      // What the implementation answered, not what was asked for: a fork it
      // could not take is a fresh session, and the comparison of fork cost
      // must not be corrupted by one that silently became fresh.
      session: {
        ref,
        mode: agentSession.start.mode === 'continue' ? 'continued' : agentSession.start.mode,
        ...(agentSession.start.degradedReason === undefined ? {} : { degradedReason: agentSession.start.degradedReason }),
      },
      disposition: this.ignoring(run) ? 'superseded' : ended === 'submitted' ? 'applied' : 'incomplete',
      submission: submissionHash === null ? null : { hash: submissionHash },
      rejectedSubmissions: judge.rejections,
      ...(budget === undefined ? {} : { budget }),
      settled,
      outsideScope,
      usage: recorder.outcomeUsage(agent),
      elapsedMs,
      ...(outcome.kind === 'failed' && interruption === undefined ? { error: outcome.error } : {}),
    }, degraded, transcript);

    return {
      id,
      ended,
      value: ended === 'submitted' ? value : undefined,
      ref,
      outcomeKind: interruption === undefined ? outcome.kind : 'failed',
      session,
      kept: keptAs.kept,
      ...(interruption === undefined ? {} : { interruption }),
      actual: agentSession.start.mode,
    };
  }

  // The initial analysis

  /** The initial architect's one invocation, and the records its submission commits. */
  private async analyse(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot): Promise<boolean> {
    if (run.log.find('analysis-accepted')) return true;
    const loaded = packages.get('initial-architect');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the initial architect');
      return false;
    }

    const plan = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    const systemPrompt = renderInitialArchitectPrompt(loaded, this.projectRoot);
    const prompt = analysisMessage(run.record, plan);
    const scope = baselineScope(
      this.options.rootModule ?? rootModuleOf(run.index) ?? rootModuleOfSnapshot(baseline) ?? 'root',
      baseline.supplementary.map(entry => entry.path),
    );
    const shape = describePlan(plan);

    const result = await this.runInvocation<InitialAnalysisSubmission>(run, agent, {
      role: 'initial-architect',
      work: {},
      attempt: 1,
      loaded,
      systemPrompt,
      prompt,
      start: { mode: 'fresh' },
      toolName: initialAnalysisToolName,
      description: 'Submit the run\'s initial analysis. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.',
      inputSchema: initialAnalysisJsonSchema,
      submissionSchema: 'ramify-agent.initial-analysis/2',
      validate: input => validateInitialAnalysis(input, { index: run.index, plan: shape, planScenarios: run.record.planScenarios.scenarios }),
      // An accepted analysis session becomes the run's architect context:
      // briefs are appended to it and every placement request forks it.
      keep: ended => (ended === 'submitted' ? kept : finished('not-kept')),
      scope: {
        write: null,
        measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
        size: scopeSize(baseline, scope),
      },
    });

    if (this.ignoring(run)) return false;
    if (result.ended !== 'submitted' || result.value === undefined) {
      if (result.outcomeKind === 'failed' && result.ended === 'failed') {
        await this.fail(run, 'agent-failed', analysisFailure(result.ended, result.outcomeKind), []);
        return false;
      }
      await this.fail(run, result.ended === 'invalid-submission' ? 'invalid-submission' : 'analysis-invalid',
        analysisFailure(result.ended, result.outcomeKind), []);
      return false;
    }

    const accepted = acceptAnalysis(result.value, {
      invocation: result.id,
      view: run.record.manifest.architectView,
      planId: run.record.planId,
      planScenarios: run.record.planScenarios.scenarios,
      index: run.index,
    });
    await this.write(run, {
      type: 'analysis-accepted',
      data: {
        invocation: result.id,
        entries: accepted.entries.entries.length,
        hypotheses: accepted.hypotheses.length,
        registry: accepted.registry.length,
        workItems: accepted.workItems.length,
        scenarios: accepted.scenarios.length,
        warnings: [...accepted.warnings],
      },
    }, accepted.records);
    await this.afterWrite('analysis-accepted', run.record.jobId);
    return true;
  }

  /**
   * The review stop. A run started with it records `review-requested` once
   * the analysis is accepted and waits, holding the project and starting no
   * session, until the log holds `analysis-approved` or the run is stopped
   * or the service closes. Nothing is written to the tree before readiness,
   * so a stop here leaves the repository as the run found it.
   */
  private async awaitReview(run: Run): Promise<boolean> {
    if (!run.record.reviewStop) return true;
    if (run.log.find('review-requested') === undefined) {
      if (await this.write(run, { type: 'review-requested', data: {} }, [], this.now()) === 'ended') return false;
    }
    // The log is read and the wait registered in one turn, so an approval
    // or stop that lands between them still wakes it.
    while (run.log.find('analysis-approved') === undefined && !this.ignoring(run)) await run.changed();
    return !this.ignoring(run);
  }

  // Work items

  /**
   * Every work item of the frontier, in the order the analysis committed
   * them. A work item that is already closed is passed over, which is how a
   * run that is started again after a crash does no work twice.
   */
  private async takeWorkItems(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot): Promise<boolean> {
    if (packages.get('local-architect') === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the local architect');
      return false;
    }
    // The frontier is read again on every round, because a delegation
    // creates work items while the run is running: a provider work item of a
    // requirement just registered is taken before the next independent entry
    // work item, and that is what makes the scheduling depth-first.
    for (;;) {
      if (this.ignoring(run)) return false;
      const records = committedRecords(run.log.ledger.replay());
      if (records.workItems.length === 0) return true;
      if (records.workItems.length > run.record.policy.limits.maxWorkItems) {
        await this.fail(run, 'limit-exceeded', `The run has ${records.workItems.length} work items; the policy allows ${run.record.policy.limits.maxWorkItems}`);
        return false;
      }
      const state = this.scheduleStateOf(run, records);
      const next = nextWorkItem(state);
      if (next === null) {
        const open = records.workItems.filter(item => !state.completed.has(item.id));
        if (open.length === 0) return true;
        // Every remaining item is yielded and no provider it waits for has
        // conformed. Nothing further can run, and the requirements say why.
        const waiting = open.flatMap(item => (state.yielded.get(item.id) ?? []).map(requirement => `${item.id} waits for ${requirement}`));
        await this.fail(run, 'unresolvable-requirement',
          `No work item can run: ${waiting.join('; ') || open.map(item => item.id).join(', ')}`,
          open.map(item => workLayout.item(item.id)));
        return false;
      }
      const turns = run.log.all('work-item-started').filter(event => event.data.workItem === next.item.id).length
        + run.log.all('work-item-resumed').filter(event => event.data.workItem === next.item.id).length;
      if (turns > run.record.policy.limits.maxIterationsPerWorkItem) {
        await this.fail(run, 'limit-exceeded',
          `${next.item.id} has been taken up ${turns} times, and the policy allows ${run.record.policy.limits.maxIterationsPerWorkItem}`);
        return false;
      }
      if (await this.takeWorkItem(run, agent, packages, baseline, next.item, next.resumes) === null) return false;
    }
  }

  /**
   * The committed state the scheduler reads. Every part of it is a
   * projection over the log: a run just recovered and one that never crashed
   * answer the same thing.
   */
  private scheduleStateOf(run: Run, records: ReturnType<typeof committedRecords>): ScheduleState {
    const yielded = new Map<string, readonly string[]>();
    for (const event of run.log.events) {
      if (event.type === 'work-item-yielded') yielded.set(event.data.workItem, event.data.requirements);
      if (event.type === 'work-item-resumed') yielded.delete(event.data.workItem);
    }
    const completed = new Set(run.log.all('work-item-completed').map(event => event.data.workItem));
    return {
      items: records.workItems,
      completed,
      yielded,
      requirements: records.requirements,
      conformed: new Set(run.log.all('provider-conformed').map(event => conformanceKey(event.data.obligation, event.data.revision))),
      bindings: this.bindingsOf(run),
      reopened: new Set(records.workItems
        .filter(item => !completed.has(item.id) && this.pendingRevisionReports(run, records, item.id).length > 0)
        .map(item => item.id)),
    };
  }

  /**
   * The work item responsible for each subject revision. A registration
   * binds its obligation to the provider work item it started and each of
   * its requirements to the consumer work item whose iteration established
   * the agreement; a revision records its bindings itself, because it may
   * bind a subject to a work item that already exists.
   */
  private bindingsOf(run: Run): Map<string, string> {
    const bindings = new Map<string, string>();
    for (const event of run.log.events) {
      if (event.type === 'contract-registered') {
        if (event.data.obligation !== null && event.data.providerWorkItem !== null) {
          bindings.set(bindingKey(event.data.obligation, event.data.revision), event.data.providerWorkItem);
        }
        const consumer = workItemOfIteration(event.data.iteration);
        if (consumer !== null) {
          for (const requirement of event.data.requirements) bindings.set(bindingKey(requirement, event.data.revision), consumer);
        }
        continue;
      }
      if (event.type !== 'evidence-reopened') continue;
      for (const binding of event.data.bindings) bindings.set(bindingKey(binding.subject.id, binding.subject.revision), binding.workItem);
    }
    return bindings;
  }

  /** The work item bound to one subject's current revision, or null where nothing binds it. */
  private boundItem(run: Run, subject: string, revision: number): string | null {
    return this.bindingsOf(run).get(bindingKey(subject, revision)) ?? null;
  }

  /**
   * The `revision-needed` reports this work item has not answered. A report
   * is delivered once: the architect's next turn has it in its own history,
   * and repeating it would read as a second report.
   */
  private pendingRevisionReports(
    run: Run,
    records: ReturnType<typeof committedRecords>,
    workItem: string,
  ): Array<RunEventOf<'revision-needed'>> {
    const lastTurn = run.log.all('invocation-started')
      .filter(event => event.data.role === 'local-architect'
        && records.invocations.get(event.data.invocation)?.work.workItem === workItem)
      .at(-1)?.sequence ?? 0;
    return run.log.all('revision-needed')
      .filter(event => event.data.consumerWorkItem === workItem && event.sequence > lastTurn);
  }

  /** The requirement revisions a `requirement-verified` has closed. */
  private verifiedRequirements(run: Run): Set<string> {
    return new Set(run.log.all('requirement-verified').map(event => verificationKey(event.data.requirement, event.data.revision)));
  }

  /**
   * The requirements one work item owes that no `requirement-verified` has
   * closed. The scheduling binding decides whose they are, not the
   * requirement's own `workItem`: a revision may bind a requirement to a
   * follow-up while its record keeps naming the item it followed.
   */
  private openRequirementsOf(run: Run, records: ReturnType<typeof committedRecords>, workItem: string): ConsumerRequirement[] {
    return openRequirements(records.requirements, this.verifiedRequirements(run), workItem, this.bindingsOf(run));
  }

  /**
   * The obligation one provider work item currently owes: the latest
   * revision of its own obligation that is bound to it. A completed item
   * that a revision rebound elsewhere owes nothing more.
   */
  private obligationOwedBy(run: Run, item: WorkItem, records: ReturnType<typeof committedRecords>): ProviderObligation | null {
    if (!('obligation' in item.origin)) return null;
    const obligation = records.obligations.get(item.origin.obligation.id);
    if (obligation === undefined) return null;
    const bound = this.boundItem(run, obligation.id, obligation.revision);
    if (bound !== null) return bound === item.id ? obligation : null;
    return item.origin.obligation.revision === obligation.revision ? obligation : null;
  }

  /** The agreements one work item consumes, which are the ones its architect may revise. */
  private contractsConsumedBy(run: Run, records: ReturnType<typeof committedRecords>, workItem: string): Set<string> {
    const bindings = this.bindingsOf(run);
    const contracts = new Set<string>();
    for (const requirement of records.requirements.values()) {
      const bound = bindings.get(bindingKey(requirement.id, requirement.revision)) ?? requirement.workItem;
      if (bound !== workItem) continue;
      contracts.add(contractOfObligation(requirement.obligation));
    }
    return contracts;
  }

  /** The count of iterations this work item has been assigned, contract sub-sessions included. */
  private assignedCount(run: Run, workItem: string): number {
    return run.log.all('iteration-assigned').filter(event => event.data.workItem === workItem).length
      + run.log.all('contract-requested').filter(event => event.data.workItem === workItem).length;
  }

  /** The capability one work item is implementing, whatever its origin. */
  private capabilityOfItem(item: WorkItem, records: ReturnType<typeof committedRecords>): string | null {
    if ('entry' in item.origin) return item.origin.entry;
    if ('obligation' in item.origin) return records.obligations.get(item.origin.obligation.id)?.capability ?? null;
    if ('integration' in item.origin) return null;
    const requirement = records.requirements.get(item.origin.verification.id);
    return requirement?.forCapability ?? null;
  }

  /**
   * One work item: its start, the hypothesis revisions it receives, the
   * continuing session of its local architect, the iterations that architect
   * assigns, and the `work-item` gate that is the only thing that closes it.
   *
   * A failing gate returns to the same architect, which may revise its
   * outline or assign a repair; exhaustion of the policy's repair rounds
   * fails the run with the original cause preserved.
   */
  private async takeWorkItem(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    resumes: readonly string[] | null,
  ): Promise<'completed' | 'yielded' | 'reported' | null> {
    const loaded = packages.get('local-architect')!;
    if (!run.log.all('work-item-started').some(event => event.data.workItem === item.id)) {
      const integration = integrationScenarioOf(item);
      await this.write(run, {
        type: 'work-item-started',
        data: { workItem: item.id, module: item.module, origin: originKindOf(item), ...(integration === null ? {} : { scenario: integration }) },
      });
      await this.afterWrite('work-item-started', run.record.jobId);
      if (this.ignoring(run)) return null;
    }
    // The providers this item waited for have conformed. Resumption licenses
    // the architect to assign verification; the requirements stay open until
    // that verification replaces the fake and passes, and waiting for them
    // here would wait for this item itself.
    if (resumes !== null) {
      await this.write(run, { type: 'work-item-resumed', data: { workItem: item.id, requirements: [...resumes] } });
      await this.afterWrite('work-item-resumed', run.record.jobId);
      if (this.ignoring(run)) return null;
    }

    const plan = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    const onboarding = await onboardingOf(this.projectRoot, directoryOf(run.index, item.module));
    const views = await apiViewsOf(this.options.ramify, this.projectRoot, run.index, item.module);
    const systemPrompt = renderLocalArchitectPrompt(loaded, this.projectRoot);
    const scope = baselineScope(item.module, baseline.supplementary.map(entry => entry.path));
    const integration = await this.integrationOfItem(run, item);

    let sessionRef: string | undefined;
    /** The session this architect's turns share, while the harness keeps it; `sessionRef` is its executor's point. */
    let session: SessionId | undefined;
    /** Why its next turn continues that session: what happened since its last turn. */
    let continuing: ContinueReason | undefined;
    let attempt = 0;
    let gateRound = 0;
    let failedGate: { id: string; cause: string | null; summary: string[] } | undefined;
    /** The cause of the first gate that failed; exhaustion preserves it. */
    let firstCause: { gate: string; cause: string | null } | undefined;
    /** The last assignment of this work item, whose own tests probe a failing project gate. */
    let lastAssignment: IterationAssignment | undefined;
    /** What the last iteration of this work item ended with, for the architect that receives it. */
    let lastResult: IterationResult | undefined;
    /** The gate that returned that iteration, where one did, with what it found. */
    let lastIterationGate: { id: string; cause: string | null; summary: readonly string[] } | undefined;
    /** A placement request of this work item that came back without a decision. */
    let unresolvedRequest: { id: string; findings: readonly string[]; gaps: readonly string[] } | undefined;
    /** A cycle one of this item's registrations closed, delivered once as a finding. */
    let cycleFinding: DependencyCycle | undefined;
    /** Providers of this item's requirements that reported they cannot conform. */
    let revisionReports: DelegationBriefing['revisionsNeeded'];
    /** Why completion was refused, where it was. */
    let blocked: string[] | undefined;
    /** How many times completion was refused for an open requirement. */
    let refusals = 0;
    let released = resumes;
    const bound = run.record.policy.limits.repairRoundsPerWorkItemGate;
    /** The reconciliation that returns this work item to its architect: a correction, or a brief that did not land. */
    let returned: string | undefined;
    /** The rounds whose brief the architect's own session lacks, which its next input carries from the log. */
    const undelivered: string[] = [];

    turns: for (;;) {
      if (this.ignoring(run)) return null;
      attempt += 1;
      const current = committedRecords(run.log.ledger.replay());
      // The view is refreshed before the architect's turn, so the rules its
      // submission is judged by are applied against the project as it stands.
      const index = await this.refreshIndex(run);
      // This turn is a coordination point: the hypothesis revisions this
      // work item holds reach it here, before it assigns anything.
      const hypotheses = await this.deliverHypotheses(run, item, current.hypotheses);
      if (hypotheses === null) return null;
      const registry = new Map(current.registry.map(entry => [entry.capability, entry]));
      const outlines = current.outlines.get(item.id) ?? [];
      const open = this.openRequirementsOf(run, current, item.id);
      // The guarded paths as they stand: an authorization may name one of
      // these and nothing else, because a gate compares nothing else. The
      // configuration and the feature files are the harness's alone, so no
      // authorization names them.
      const scenarioFiles = await this.guardedScenarioFiles(run);
      const harnessOnly = new Set([projectConfigurationFile, ...(scenarioFiles.expected ?? []).map(file => file.path)]);
      const guarded = new Set((await captureGuardedFiles(
        this.projectRoot,
        this.requiredArtifacts(current).map(artifact => artifact.path),
        scenarioFiles,
      )).map(file => file.path).filter(path => !harnessOnly.has(path)));
      const conformed = new Set(run.log.all('provider-conformed').map(event => conformanceKey(event.data.obligation, event.data.revision)));
      // A provider's report reaches this architect once, here, even while
      // this work item is yielded: what blocks it is the agreement.
      revisionReports ??= this.pendingRevisionReports(run, current, item.id).map(event => ({
        obligation: event.data.obligation.id,
        revision: event.data.obligation.revision,
        contract: contractOfObligation(event.data.obligation.id),
        iteration: event.data.iteration,
        detail: (current.results.get(event.data.iteration)?.findings ?? []).join('; '),
      }));
      // The scenarios of this work item's entry, in the states this turn
      // finds them, and what the last accepted iteration's gate bound.
      const scenarioLedger = trackedScenarios(run.log.ledger.replay());
      const scenarios = entryScenariosOf(scenarioLedger.records, scenarioLedger.states, 'entry' in item.origin ? item.origin.entry : null);
      const lastScenarios = lastResult === undefined ? [] : await this.passedScenarioLines(run, lastResult);
      const prompt = workItemMessage({
        item,
        plan,
        onboarding,
        views,
        hypotheses,
        registry: current.registry,
        // The decisions this work item is party to: the ones made for it,
        // and the ones whose consequences name it.
        decisions: [...current.decisions.values()].filter(decision =>
          decision.workItem === item.id
          || decision.revises?.affected.some(affected => affected.workItem === item.id) === true),
        outlines,
        delegation: {
          open: open.map(requirement => ({
            requirement: requirement.id,
            capability: current.obligations.get(requirement.obligation)?.capability ?? requirement.forCapability,
            provider: current.obligations.get(requirement.obligation)?.provider ?? 'unknown',
            conformed: conformed.has(conformanceKey(requirement.obligation, requirement.contractRevision)),
            fakeInjections: requirement.evidence.fakeInjections,
            suite: current.obligations.get(requirement.obligation)?.evidence.conformance ?? [],
          })),
          released: released ?? [],
          obligation: obligationBriefing(item, current),
          ...(cycleFinding === undefined ? {} : { cycle: cycleFinding }),
          ...(blocked === undefined ? {} : { blocked }),
          ...(revisionReports === undefined || revisionReports.length === 0 ? {} : { revisionsNeeded: revisionReports }),
        },
        ...(unresolvedRequest === undefined ? {} : { unresolvedRequest }),
        ...(returned === undefined ? {} : { reconciliation: this.reconciliationBriefing(run, returned, undelivered) }),
        ...(integration === undefined ? {} : { integration }),
        ...(scenarios.length === 0 ? {} : { scenarios }),
        ...(failedGate === undefined ? {} : { failedGate }),
        ...(lastResult === undefined ? {} : {
          lastIteration: {
            id: lastResult.iteration,
            outcome: lastResult.outcome,
            findings: lastResult.findings,
            ...(lastResult.recommendation === undefined ? {} : { recommendation: lastResult.recommendation }),
            commit: lastResult.commit,
            ...(lastIterationGate === undefined ? {} : { gate: lastIterationGate }),
            ...(lastScenarios.length === 0 ? {} : { scenarios: lastScenarios }),
          },
        }),
      });
      // A finding is delivered once: the next turn of this same architect
      // has it in its own history, and repeating it would read as a second
      // detection.
      cycleFinding = undefined;
      blocked = undefined;
      released = null;
      revisionReports = [];
      returned = undefined;
      undelivered.length = 0;

      const result = await this.runInvocation<LocalArchitectSubmission>(run, agent, {
        role: 'local-architect',
        work: { workItem: item.id },
        attempt,
        loaded,
        systemPrompt,
        prompt,
        start: sessionRef === undefined ? { mode: 'fresh' } : { mode: 'continue', ref: sessionRef },
        session,
        continuing,
        // The architect is continued after a placement request, an
        // iteration and a refused or failed completion. A yield and an
        // unresolved request end its use: a resumed work item starts afresh.
        keep: (ended, value) => (ended === 'submitted' && value !== undefined && value.kind !== 'unresolved' && value.kind !== 'yield-for-providers'
          ? kept
          : finished('not-kept')),
        toolName: localArchitectToolName,
        description: 'End this turn with the work item\'s result. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.',
        inputSchema: localArchitectJsonSchema,
        submissionSchema: 'ramify-agent.local-architect-submission/1',
        validate: input => validateLocalArchitect(input, {
          index,
          registry,
          outline: outlines.at(-1) ?? null,
          hypotheses: new Map(current.hypotheses.map(hypothesis => [hypothesis.id, hypothesis])),
          decisions: current.decisions,
          workItems: new Set(current.workItems.map(entry => entry.id)),
          openRequirements: new Set(open.map(requirement => requirement.id)),
          contracts: this.contractsConsumedBy(run, current, item.id),
          guardedPaths: guarded,
          scenarios: this.declarationContext(run, item),
          ...(integration === undefined ? {} : { integration: integration.scope }),
        }),
        scope: {
          write: null,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: scopeSize(baseline, scope),
        },
      });
      sessionRef = result.kept && result.ref !== '' ? result.ref : undefined;
      session = sessionRef === undefined ? undefined : result.session;

      if (this.ignoring(run)) return null;
      if (result.ended !== 'submitted' || result.value === undefined) {
        await this.fail(
          run,
          result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
          `The local architect of ${item.id} ended without a result (${result.ended})`,
          [runLayout.outcome(result.id)],
        );
        return null;
      }

      if (result.value.kind === 'unresolved') {
        await this.fail(run, 'unresolvable-requirement',
          `The local architect of ${item.id} reports the request cannot be met as stated: ${result.value.conflict}`,
          [runLayout.submission(result.id), ...result.value.evidence]);
        return null;
      }

      if (result.value.kind === 'request-placement') {
        // The work item leaves its repair path for a placement question, so
        // what it declared and never passed is pending again first.
        if (!await this.withdrawScenarios(run, item, 'placement-requested')) return null;
        const resolution = await this.requestPlacement(run, agent, packages, baseline, item, result.value.request);
        if (resolution === null) return null;
        unresolvedRequest = resolution.kind === 'unresolved'
          ? { id: resolution.request, findings: resolution.findings, gaps: resolution.gaps }
          : undefined;
        continuing = 'placement-answered';
        continue;
      }

      if (result.value.kind === 'yield-for-providers') {
        // A bound scenario that passed against the fakes stays bound; one
        // that never passed a gate since its declaration is pending again.
        if (!await this.withdrawScenarios(run, item, 'yielded')) return null;
        await this.write(run, {
          type: 'work-item-yielded',
          data: { workItem: item.id, requirements: [...result.value.requirements], invocation: result.id },
        });
        await this.afterWrite('work-item-yielded', run.record.jobId);
        return this.ignoring(run) ? null : 'yielded';
      }

      if (result.value.kind === 'assign') {
        const assigned = await this.assignIteration(run, item, result.id, result.value, index, registry, architectRefOf(result));
        if (assigned === null) return null;
        lastAssignment = assigned;
        // A direct revision is a contract iteration of this work item: the
        // contract engineer establishes it, and the agreement in force stays
        // in force until that iteration's gate passes.
        if (assigned.revisesContract !== undefined) {
          const revised = await this.reviseContract(run, agent, packages, baseline, item, assigned);
          if (revised === null) return null;
          if (revised.result !== undefined) lastResult = revised.result;
          if (revised.result?.outcome === 'exhausted' && !await this.withdrawScenarios(run, item, 'repair-exhausted')) return null;
          lastIterationGate = undefined;
          failedGate = undefined;
          if (revised.cycle !== undefined) cycleFinding = revised.cycle;
          continuing = 'iteration-closed';
          continue;
        }
        const outcome = await this.takeIteration(run, agent, packages, baseline, item, assigned, index);
        if (outcome === null) return null;
        lastResult = outcome.result;
        // The iteration spent its repair rounds without a pass: what it
        // declared is pending again, so no untagged failing scenario stays
        // in the tree for the next gate that runs its owner.
        if (outcome.result.outcome === 'exhausted' && !await this.withdrawScenarios(run, item, 'repair-exhausted')) return null;
        lastIterationGate = outcome.returnedGate;
        failedGate = undefined;
        // The provider reported that the agreement cannot be met. This work
        // item's turn ends here: what blocks it is the consumer architect's
        // to answer, and the report is already in the log. Its next turn
        // starts a session of its own.
        if (outcome.reportedRevision === true) {
          await this.finishSession(run, session, 'not-kept');
          return 'reported';
        }
        if (outcome.need !== undefined) {
          const contract = await this.takeContract(run, agent, packages, baseline, item, {
            ...outcome.need,
            requestedBy: assigned.id,
          });
          if (contract === null) return null;
          if (contract.result?.outcome === 'exhausted' && !await this.withdrawScenarios(run, item, 'repair-exhausted')) return null;
          const reported = outcome.result;
          lastResult = { ...reported, findings: [...reported.findings, ...contract.findings] };
          if (contract.cycle !== undefined) cycleFinding = contract.cycle;
        }
        continuing = 'iteration-closed';
        continue;
      }

      // The request's own declarations apply first, so a request that
      // declares the last scenario is not refused for it.
      if (!await this.declareScenarios(run, item, result.id, result.value.scenarios)) return null;

      // Completion is refused while a requirement of this work item is open,
      // and while the obligation it exists for is not conformed: a
      // fake-backed pass never completes a capability, and the gate's verdict
      // on the tests says nothing about which provider ran. It is refused
      // too while a scenario of its entry is pending or bound.
      const owing = this.obligationOwedBy(run, item, current);
      const owed = owing !== null && !conformed.has(conformanceKey(owing.id, owing.revision)) ? owing : null;
      const unbound = this.unfinishedScenarios(run, item, ['pending', 'bound']);
      if (open.length > 0 || owed !== null || unbound.length > 0) {
        refusals += 1;
        blocked = [
          ...open.map(requirement => {
            const obligation = current.obligations.get(requirement.obligation);
            return `${requirement.id} is open: ${obligation?.capability ?? requirement.forCapability} is still held by the fake at ${requirement.evidence.fakeInjections.join(', ')}`;
          }),
          ...(owed === null ? [] : [`${owed.id} is owed: the agreed conformance suite has not passed against the real provider yet`]),
          ...unbound.map(scenario => scenarioRefusal(scenario)),
        ];
        if (refusals > bound) {
          await this.refuseCompletion(run, item, refusals, blocked, { open, owed: owed !== null, scenarios: unbound });
          return null;
        }
        continuing = 'completion-refused';
        continue;
      }

      const revision = outlines.length + 1;
      const outline = workItemOutlineSchema.parse({
        schema: 'ramify-agent.work-item-outline/1',
        workItem: item.id,
        revision,
        invocation: result.id,
        ...result.value.outline,
        hypothesesSeen: hypotheses.map(hypothesis => refOf(hypothesis.id, hypothesis.revision, hypothesis)),
      } satisfies WorkItemOutline);
      // The revision that commits a completion request records the point
      // after it, which this work item's reconciliation forks; and it starts
      // the work item's wait for its reviews.
      await this.write(run, { type: 'outline-revised', data: { workItem: item.id, revision, invocation: result.id, architectRef: architectRefOf(result) } }, [
        { path: workLayout.outline(item.id, revision), id: item.id, revision, body: outline },
      ]);
      await this.afterWrite('outline-revised', run.record.jobId);
      run.reviews?.wake();
      if (this.ignoring(run)) return null;

      // Before the gate, the work item's reviews settle and what they
      // raised is reconciled; a completion whose basis no longer holds is
      // reconciled again, as often as rounds remain.
      const parent: ParentSession = { session, ref: sessionRef, undelivered };
      let gate: GateAttempt | null = null;
      let refusedCompletions = 0;
      for (;;) {
        const reconciled = await this.reconcileWorkItem(run, agent, loaded, item, parent);
        session = parent.session;
        sessionRef = parent.ref;
        if (reconciled === null) return null;
        if (reconciled.kind === 'correct') {
          // The architect's own session assigns the correction, through the
          // ordinary gate and reviews.
          returned = reconciled.reconciliation;
          continuing = 'reconciliation';
          continue turns;
        }
        if (undelivered.length > 0) returned = this.latestBasis(run, item.id)?.id;
        gate = await this.workItemGate(run, item, result.id, gateRound, result.value.summary, lastAssignment);
        gateRound += 1;
        if (gate === null) return null;
        if (gate.verdict !== 'passed') break;
        // A declared scenario the gate did not pass stays declared, and the
        // work item cannot complete around it.
        const unverified = this.unfinishedScenarios(run, item, ['pending', 'bound', 'declared']);
        if (unverified.length > 0) {
          refusals += 1;
          const refusingGate = gate.id;
          blocked = unverified.map(entry => scenarioRefusal(entry, refusingGate));
          if (refusals > bound) {
            await this.refuseCompletion(run, item, refusals, blocked, { open: [], owed: false, scenarios: unverified });
            return null;
          }
          continue turns;
        }
        const completed = await this.completeWorkItem(run, item, gate, reconciled.basis);
        if (completed === 'ended' || this.ignoring(run)) return null;
        if (completed === 'completed') {
          await this.afterWrite('work-item-completed', run.record.jobId);
          await this.finishSession(run, session, 'work-closed');
          return 'completed';
        }
        // Each refusal found another round warranted; the rounds bound them.
        refusedCompletions += 1;
        if (refusedCompletions > (run.record.policy.limits.reconciliationRoundsPerWorkItem ?? defaultReconciliationRounds)) {
          await this.fail(run, 'repair-exhausted', `${item.id}'s completion was refused ${refusedCompletions} times: ${completed.refused}`);
          return null;
        }
      }
      if (gate === null) return null;

      failedGate = await this.diagnosticsOf(run, gate, 'local-architect');
      firstCause ??= { gate: gate.id, cause: gate.cause };
      continuing = 'repair';
      if (gateRound > bound) {
        await this.fail(run, 'repair-exhausted',
          `The ${item.id} gate did not pass after ${bound} repair round${bound === 1 ? '' : 's'}; the first cause was ${firstCause.cause ?? 'unknown'} at gate ${firstCause.gate}`,
          [runLayout.gate(firstCause.gate), runLayout.gate(gate.id)]);
        return null;
      }
    }
  }

  /** The module inventory as the project stands now, or null when it cannot be refreshed. */
  private async refreshIndex(run: Run): Promise<ArchitectIndex | null> {
    try {
      const index = await this.options.inputs.refresh(this.projectRoot);
      if (index !== null) run.index = index;
      return index;
    } catch (error) {
      this.warn(`Run ${run.record.jobId}: the architect view could not be refreshed: ${message(error)}`);
      return null;
    }
  }

  /** The run's architect context, as its log and its committed outcomes hold it. */
  private globalContextOf(run: Run): GlobalContext {
    const records = committedRecords(run.log.ledger.replay());
    return globalContext({
      events: run.log.events,
      sessionRef: invocation => records.outcomes.get(invocation)?.session?.ref,
    });
  }

  /**
   * The identity of the view a decision is recorded against. The revision
   * and the input identity come from the view that was read; the coverage
   * limits come from its own metadata, and where those cannot be read the
   * limit says so rather than reporting none.
   */
  private async viewIdentityOf(index: ArchitectIndex | null): Promise<ViewIdentity> {
    if (index === null) return { status: 'placeholder' };
    const meta = await readArchitectMeta(this.projectRoot).catch(() => null);
    const limits = meta === null || meta.input !== index.input
      ? ['the view\'s own coverage limits could not be read, so absence in it is not proof of absence']
      : coverageLimitsOf(meta);
    return { status: 'materialized', revision: index.revision, input: index.input, coverageLimits: limits };
  }

  private async readDecision(run: Run, id: string): Promise<PlacementDecision | null> {
    const read = await readCommitted(run.log.ledger, architectureLayout.decision(id), architectureSchemas.decision);
    return read.kind === 'valid' ? (read.value as PlacementDecision) : null;
  }

  /**
   * The hypothesis revisions this work item holds at its coordination point.
   * A revision a decision made reaches the work items it involves before
   * their next assignment, and delivery rewrites nothing: the architect
   * assesses what it means for the work that remains.
   */
  private async deliverHypotheses(run: Run, item: WorkItem, hypotheses: readonly Hypothesis[]): Promise<Hypothesis[] | null> {
    const deliveries = run.log.all('hypotheses-delivered').filter(event => event.data.workItem === item.id);
    const relevant = hypothesesFor(item, hypotheses);
    const refs = relevant.map(hypothesis => refOf(hypothesis.id, hypothesis.revision, hypothesis));
    const last = deliveries.at(-1);
    const delivered = last !== undefined
      && last.data.refs.length === refs.length
      && refs.every((ref, index) => {
        const before = last.data.refs[index];
        return before !== undefined && before.id === ref.id && before.revision === ref.revision && before.hash === ref.hash;
      });
    if (!delivered) {
      await this.write(run, { type: 'hypotheses-delivered', data: { workItem: item.id, refs } });
      await this.afterWrite('hypotheses-delivered', run.record.jobId);
      if (this.ignoring(run)) return null;
    }
    return relevant;
  }

  /**
   * One global placement request, from the local architect that made it to
   * the decision returned to it. Requests run one at a time: the harness
   * pauses implementation writes, refreshes the architect view and records
   * its identity with the request, then forks the architect context's latest
   * point. The fork investigates and decides; the parent neither reassesses
   * nor approves, and is never invoked for the choice.
   */
  private async requestPlacement(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    body: PlacementRequestBody,
  ): Promise<PlacementResolution | null> {
    const loaded = packages.get('global-fork');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the global architect');
      return null;
    }

    const count = run.log.count('placement-requested') + 1;
    if (count > run.record.policy.limits.maxPlacementRequests) {
      await this.fail(run, 'limit-exceeded',
        `The run has made ${count - 1} placement requests; the policy allows ${run.record.policy.limits.maxPlacementRequests}`);
      return null;
    }

    const id = requestId(count);
    const committed = committedRecords(run.log.ledger.replay());
    const request = placementRequestSchema.parse({
      schema: 'ramify-agent.placement-request/1',
      id,
      workItem: item.id,
      requester: item.module,
      forCapability: body.forCapability,
      question: body.question,
      requiredBehavior: body.requiredBehavior,
      findings: body.findings.map(finding => ({ text: finding.text, citations: finding.citations.map(citation => ({ ...citation })) })),
      candidates: body.candidates.map(candidate => ({ ...candidate })),
      unresolved: [...body.unresolved],
      // The revision and the hash are the harness's: the request names a
      // hypothesis, and the record says which revision of it was tested.
      hypotheses: body.hypotheses.flatMap(tested => {
        const hypothesis = committed.hypotheses.find(candidate => candidate.id === tested.hypothesis);
        if (hypothesis === undefined) return [];
        return [{ ref: refOf(hypothesis.id, hypothesis.revision, hypothesis), stance: tested.stance, evidence: tested.evidence }];
      }),
      localDecisions: [...body.localDecisions],
    } satisfies PlacementRequest);

    await this.write(run, {
      type: 'placement-requested',
      data: { request: id, workItem: item.id, requester: item.module, capability: body.forCapability },
    }, [{ path: architectureLayout.request(id), id, revision: 1, body: request }]);
    await this.afterWrite('placement-requested', run.record.jobId);
    if (this.ignoring(run)) return null;

    const systemPrompt = renderGlobalForkPrompt(loaded, this.projectRoot);
    const bound = run.record.policy.limits.forkRetriesPerRequest;
    const measured = baselineScope(
      this.options.rootModule ?? rootModuleOf(run.index) ?? rootModuleOfSnapshot(baseline) ?? 'root',
      baseline.supplementary.map(entry => entry.path),
    );
    let partial: { attempt: number; findings: string[]; gaps: string[] } | undefined;
    let revalidate: { was: string; now: string } | undefined;

    for (;;) {
      if (this.ignoring(run)) return null;
      // Implementation writes are paused and the tools of the last
      // invocation have settled before the evidence is taken.
      run.writer.requireSettled(`The architect view for ${id} cannot be refreshed`);

      const attempt = run.log.all('view-refreshed').filter(event => event.data.request === id).length + 1;
      const index = await this.refreshIndex(run);
      const view = await this.viewIdentityOf(index);
      // A failed refresh does not make an older view current; what it could
      // not establish stays explicit in the decision's own gaps.
      const unavailable = index === null
        ? 'the architect view could not be refreshed for this request, so what it does not show is not established'
        : null;
      await this.write(run, { type: 'view-refreshed', data: { request: id, attempt, view, unavailable } });
      await this.afterWrite('view-refreshed', run.record.jobId);
      if (this.ignoring(run)) return null;

      const current = committedRecords(run.log.ledger.replay());
      const context = this.globalContextOf(run);
      const decisions = [...current.decisions.values()];
      const result = await this.runInvocation<ForkSubmission>(run, agent, {
        role: 'global-fork',
        work: { workItem: item.id, request: id },
        attempt,
        loaded,
        systemPrompt,
        prompt: forkMessage({
          request,
          view,
          ...(unavailable === null ? {} : { viewUnavailable: unavailable }),
          registry: current.registry,
          hypotheses: current.hypotheses,
          decisions,
          // A parent that was rebuilt has no session to fork: the next fork
          // is oriented from the records, and becomes the context itself.
          ...(context.ref === null
            ? { orientation: orientation({ hypotheses: current.hypotheses, registry: current.registry, decisions }) }
            : {}),
          ...(partial === undefined ? {} : { partial }),
          ...(revalidate === undefined ? {} : { revalidate }),
        }),
        start: context.ref === null ? { mode: 'fresh' } : { mode: 'fork', from: context.ref },
        ...(context.point === null ? {} : {
          fork: { from: context.point, reason: 'placement-request', generation: context.generation, briefs: [...context.appended] },
        }),
        // The first fork after a rebuild becomes the context in place of
        // the one the rebuild found unreadable.
        ...(context.session === null && context.previous !== null
          ? { replaces: { session: context.previous, reason: 'context-rebuilt' } }
          : {}),
        // A fork is never continued. The first fork after a rebuild is the
        // exception: it becomes the architect context, which is kept for
        // the briefs appended to it and the forks taken from it.
        keep: ended => (context.session === null && ended === 'submitted' ? kept : finished('not-kept')),
        toolName: forkToolName,
        description: 'End this fork with its decision, or with the findings and gaps of a fork that could not decide. The harness validates it; an invalid submission is returned with every error and its path.',
        inputSchema: forkJsonSchema,
        submissionSchema: 'ramify-agent.fork-submission/1',
        validate: input => validateFork(input, placementEvidenceOf(current, index)),
        scope: {
          write: null,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: scopeSize(baseline, measured),
        },
      });

      if (this.ignoring(run)) return null;
      if (result.ended !== 'submitted' || result.value === undefined) {
        await this.fail(
          run,
          result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
          `The placement fork of ${id} ended without a result (${result.ended})`,
          [runLayout.outcome(result.id)],
        );
        return null;
      }

      if (result.value.kind === 'partial') {
        const retry = run.log.all('fork-returned-partial').filter(event => event.data.request === id).length + 1;
        await this.write(run, { type: 'fork-returned-partial', data: { request: id, invocation: result.id, retry } });
        await this.afterWrite('fork-returned-partial', run.record.jobId);
        if (this.ignoring(run)) return null;
        partial = { attempt, findings: [...result.value.findings], gaps: [...result.value.gaps] };
        revalidate = undefined;
        // Exhaustion returns an unresolved outcome to the local architect.
        // The parent is never invoked to supply the choice the fork could
        // not make.
        if (retry > bound) return { kind: 'unresolved', request: id, findings: partial.findings, gaps: partial.gaps };
        continue;
      }

      // The evidence must still be the evidence the fork decided on. Two
      // revisions are never combined: the affected investigation repeats.
      const now = await this.viewIdentityOf(await this.refreshIndex(run));
      if (!sameView(view, now)) {
        const partials = run.log.all('fork-returned-partial').filter(event => event.data.request === id).length;
        const revalidations = attempt - partials;
        revalidate = { was: identityOf(view), now: identityOf(now) };
        partial = undefined;
        if (revalidations > bound) {
          return {
            kind: 'unresolved',
            request: id,
            findings: [],
            gaps: [`the architect view changed under every investigation of ${id}; it was ${revalidate.was} and is ${revalidate.now}`],
          };
        }
        continue;
      }

      const decisionId = globalDecisionId(id);
      const accepted = acceptDecision({
        id: decisionId,
        authority: 'global',
        request: id,
        workItem: item.id,
        invocation: result.id,
        body: result.value.decision,
        registry: result.value.registry,
        hypothesisRevisions: result.value.hypothesisRevisions,
        brief: result.value.brief,
        view,
        committed: {
          registry: new Map(current.registry.map(entry => [entry.capability, entry])),
          hypotheses: new Map(current.hypotheses.map(hypothesis => [hypothesis.id, hypothesis])),
        },
      });

      await this.appendBrief(run, agent, accepted.decision, {
        input: {
          type: 'decision-accepted',
          data: {
            request: id,
            decision: decisionId,
            workItem: item.id,
            invocation: result.id,
            registry: accepted.registry.length,
            hypotheses: accepted.hypotheses.length,
          },
        },
        records: accepted.records,
      });
      if (this.ignoring(run)) return null;
      if (!await this.deliverDecision(run, accepted.decision)) return null;
      return { kind: 'decided', decision: accepted.decision };
    }
  }

  /**
   * The brief of one accepted decision, appended to the parent context as
   * the ledger's external effect: the intent is `decision-accepted` with
   * every record it commits, the effect is the append under the decision's
   * own identifier, and the completion says what the append did. A repeat
   * after a crash appends the same key, which the port answers
   * `already-present`, so one brief reaches the parent exactly once.
   *
   * Appending is storage. No model request, acknowledgement or parent review
   * happens here; the brief reaches a model only when the next fork inherits
   * it.
   */
  private async appendBrief(
    run: Run,
    agent: AgentPort,
    decision: PlacementDecision,
    intent: { readonly input: RunEventInput; readonly records: readonly CommitRecord[] } | null,
  ): Promise<void> {
    const fallback: RunEventInput = {
      type: 'decision-accepted',
      data: {
        request: decision.request ?? decision.id,
        decision: decision.id,
        workItem: decision.workItem,
        invocation: decision.invocation,
        registry: decision.registry.length,
        hypotheses: decision.hypothesisRevisions.length,
      },
    };
    const result = await run.mutex.run(() => run.log.ledger.effect<AppendResult>({
      key: `brief:${decision.id}`,
      intent: {
        event: run.log.next(intent?.input ?? fallback),
        records: [...(intent?.records ?? [])],
      },
      perform: async () => {
        // The decision is committed and the brief is not appended yet: a run
        // frozen here is one that crashed between them.
        await this.afterWrite('decision-accepted', run.record.jobId);
        const context = this.globalContextOf(run);
        if (context.session === null || context.ref === null) {
          return { outcome: 'session-lost', generation: context.generation, session: context.session, reason: 'the run has no architect context to append to' };
        }
        const answer = await agent.appendContext(context.ref, decision.id, briefText(decision));
        // The append reached the parent and its completion is not in the log.
        await this.afterWrite('brief-appending', run.record.jobId);
        if (answer.outcome === 'session-lost') {
          return {
            outcome: 'session-lost',
            generation: context.generation,
            session: context.session,
            reason: `the architect context of generation ${context.generation} can no longer be read`,
          };
        }
        return { outcome: answer.outcome, generation: context.generation, session: context.session, ref: answer.ref };
      },
      complete: result => ({
        event: run.log.next(result.outcome === 'session-lost'
          ? { type: 'global-context-rebuilt', data: { generation: result.generation + 1, reason: result.reason } }
          : {
              type: 'brief-appended',
              data: { decision: decision.id, generation: result.generation, session: result.session, ref: result.ref, outcome: result.outcome },
            }),
        records: [],
      }),
    }));
    // The brief and the point it makes, in the transcript of the session
    // appended to. A failed write loses the entries and never the append.
    const appended = run.log.all('brief-appended').find(event => event.data.decision === decision.id);
    if (appended !== undefined) {
      await recordAppend(this.transcriptOf(run, appended.data.session), {
        kind: 'brief-appended', decision: decision.id, generation: appended.data.generation,
        outcome: appended.data.outcome, text: briefText(decision),
      }, appended.sequence).catch(error => this.warn(`Run ${run.record.jobId}: the brief of ${decision.id} is missing from ${appended.data.session}'s transcript: ${message(error)}`));
    }
    await this.afterWrite('brief-appended', run.record.jobId);
    // The session that held a context the agent can no longer read is not
    // used again: the next fork is oriented from the records instead.
    if (result.outcome === 'session-lost') await this.finishSession(run, result.session ?? undefined, 'lost');
  }

  /** The accepted decision returns to the requesting local architect, before any contract work. */
  private async deliverDecision(run: Run, decision: PlacementDecision): Promise<boolean> {
    if (run.log.all('decision-delivered').some(event => event.data.decision === decision.id)) return true;
    await this.write(run, { type: 'decision-delivered', data: { decision: decision.id, workItem: decision.workItem } });
    await this.afterWrite('decision-delivered', run.record.jobId);
    return !this.ignoring(run);
  }

  /**
   * A decision whose brief is in the parent context but whose delivery is
   * not in the log: the harness was interrupted between them. Delivering it
   * calls no agent and makes no duplicate.
   */
  private async completeDeliveries(run: Run): Promise<string[]> {
    const delivered = new Set(run.log.all('decision-delivered').map(event => event.data.decision));
    const unanswered = new Set(run.log.ledger.pendingEffects().map(effect => effect.key));
    const completed: string[] = [];
    for (const event of run.log.all('decision-accepted')) {
      if (delivered.has(event.data.decision) || unanswered.has(`brief:${event.data.decision}`)) continue;
      const decision = await this.readDecision(run, event.data.decision);
      if (decision === null) continue;
      await this.deliverDecision(run, decision);
      completed.push(event.data.decision);
    }
    return completed;
  }

  /**
   * Every contract artifact this run has registered, with the agreement that
   * established it: the interface, the conformance suite, the fake and the
   * exposure declarations of each contract at its current revision.
   *
   * They are guarded on every ordinary assignment, so deleting a conformance
   * suite is a change the gate names rather than an absent file it passes
   * over. The contract iteration that writes the agreement carries the
   * authorization for them, because rewriting them is what it is for.
   */
  private requiredArtifacts(committed: ReturnType<typeof committedRecords>): Array<{ path: string; contract: ContractRecord }> {
    const artifacts: Array<{ path: string; contract: ContractRecord }> = [];
    for (const contract of committed.contracts.values()) {
      const paths = [
        ...contract.artifacts.interface.map(entry => entry.path),
        ...contract.artifacts.conformance.map(entry => entry.path),
        ...contract.artifacts.fake.map(entry => entry.path),
      ];
      for (const path of paths) artifacts.push({ path, contract });
    }
    return artifacts;
  }

  /**
   * Commits one `IterationAssignment`. The architect supplied the goal, the
   * approach and the scope's base; the harness captures the real paths, the
   * bootstrap authority the registry gives, the gate, its test-selection
   * policy and the guarded hashes, and none of those is in any submission.
   */
  private async assignIteration(
    run: Run,
    item: WorkItem,
    invocation: string,
    submission: Extract<LocalArchitectSubmission, { kind: 'assign' }>,
    index: ArchitectIndex | null,
    registry: ReadonlyMap<string, RegistryEntry>,
    architectRef: ArchitectRef | null,
  ): Promise<IterationAssignment | null> {
    const committed = committedRecords(run.log.ledger.replay());
    let outlines = committed.outlines.get(item.id) ?? [];
    const delivery = run.log.all('hypotheses-delivered').filter(event => event.data.workItem === item.id).at(-1);

    if (submission.outline !== undefined) {
      const revision = outlines.length + 1;
      const outline = workItemOutlineSchema.parse({
        schema: 'ramify-agent.work-item-outline/1',
        workItem: item.id,
        revision,
        invocation,
        ...submission.outline,
        hypothesesSeen: (delivery?.data.refs ?? []).map(ref => ({ ...ref })),
      } satisfies WorkItemOutline);
      await this.write(run, { type: 'outline-revised', data: { workItem: item.id, revision, invocation } }, [
        { path: workLayout.outline(item.id, revision), id: item.id, revision, body: outline },
      ]);
      await this.afterWrite('outline-revised', run.record.jobId);
      if (this.ignoring(run)) return null;
      outlines = [...outlines, outline];
    }

    const outline = outlines.at(-1);
    if (outline === undefined) {
      await this.fail(run, 'internal', `The assignment of ${item.id} has no outline to work from`);
      return null;
    }

    // Contract sub-sessions are iterations of this work item too, so they
    // count: two assignments must never derive the same identifier.
    const number = this.assignedCount(run, item.id) + 1;
    if (number > run.record.policy.limits.maxIterationsPerWorkItem) {
      await this.fail(run, 'limit-exceeded',
        `${item.id} has reached ${run.record.policy.limits.maxIterationsPerWorkItem} iterations, which the policy allows`);
      return null;
    }

    // The placement this architect decided within its own authority, committed
    // with the assignment: `authority: 'local'`, no request and no brief
    // appended to the parent. It is discoverable from the registry, which is
    // how a later fork finds a capability nobody was asked about.
    const localView = await this.viewIdentityOf(index);
    const localRegistry = new Map(registry);
    const localHypotheses = new Map(committed.hypotheses.map(hypothesis => [hypothesis.id, hypothesis]));
    const localRecords: CommitRecord[] = [];
    const localDecisions: string[] = [];
    let decided = [...committed.decisions.values()].filter(decision => decision.authority === 'local' && decision.workItem === item.id).length;
    for (const local of submission.localDecisions) {
      decided += 1;
      const accepted = acceptDecision({
        id: localDecisionId(item.id, decided),
        authority: 'local',
        request: null,
        workItem: item.id,
        invocation,
        body: local.decision,
        registry: local.registry,
        view: localView,
        committed: { registry: localRegistry, hypotheses: localHypotheses },
      });
      for (const entry of accepted.registry) localRegistry.set(entry.capability, entry);
      localRecords.push(...accepted.records);
      localDecisions.push(accepted.decision.id);
    }

    const body = submission.assignment;
    // A broad base names existing modules only: nothing is bootstrapped into
    // being by the exception that isolates a break.
    const owner = 'module' in body.scope.base ? body.scope.base.module : null;
    const authority = owner === null || (index !== null && findModule(index, owner) !== undefined)
      ? undefined
      : creationAuthority(localRegistry, owner);
    const bootstrap = authority?.proposed === undefined
      ? []
      : [{ capability: refOf(authority.capability, authority.revision, authority), directory: authority.proposed.directory }];

    // A direct revision is a contract iteration, and its scope, gate and
    // revision number are the harness's, not the architect's: the agreement
    // it revises names the provider, and the contract, the conformance suite
    // and the fake are rewritten where they already are.
    const revised = body.revisesContract === undefined ? undefined : committed.contracts.get(body.revisesContract);
    if (body.revisesContract !== undefined && revised === undefined) {
      await this.fail(run, 'internal', `The assignment of ${item.id} revises "${body.revisesContract}", which this run has not registered`);
      return null;
    }
    const providerDirectory = revised === undefined ? null : directoryOf(index, revised.provider);
    if (revised !== undefined && providerDirectory === null) {
      await this.fail(run, 'internal',
        `The refreshed architect view has no directory for "${revised.provider}", so no contract scope could be captured for ${item.id}`);
      return null;
    }

    const scope = revised !== undefined && providerDirectory !== null
      ? await this.contractScope(run, index, {
        revision: number,
        consumer: item.module,
        provider: revised.provider,
        providerDirectory,
        rationale: `The revision of ${revised.id}: the contract, its conformance suite, its fake and this consumer's integration. ${body.scope.rationale}`,
      })
      : await resolveWriteScope({
        projectRoot: this.projectRoot,
        index,
        view: run.record.manifest.architectView,
        revision: number,
        base: body.scope.base,
        extra: body.scope.extra,
        read: body.scope.read,
        bootstrap,
        rationale: body.scope.rationale,
      });

    // A guarded path this architect authorized is one the engineer may write
    // through the guarded tools: the authorization is the permission, and
    // the assignment records it beside the scope it widens by that one file.
    for (const authorization of revised === undefined ? submission.assignment.authorizations ?? [] : []) {
      const target = await resolveRealTarget(this.projectRoot, authorization.path);
      if (target.ok && !scope.resolved.files.includes(target.resolved)) scope.resolved.files.push(target.resolved);
    }

    // Registered evidence this iteration must satisfy. It is derived, never
    // submitted: a provider item runs the agreed suite against the real
    // implementation, and a verification runs its consumer's tests with the
    // fake replaced. An engineer cannot remove one or weaken it.
    const evidenceObligations = revised === undefined ? this.evidenceFor(run, item, body.kind, committed) : [];

    // The guarded set is the project's configuration and manifests together
    // with the contract artifacts in force. A contract iteration carries the
    // authorization for those artifacts, because rewriting the agreement is
    // what it is assigned to do; every other kind carries only what this
    // architect recorded with an outline revision.
    const artifacts = this.requiredArtifacts(committed);
    const outlineRef = refOf(item.id, outline.revision, outline);
    const authorizations = revised === undefined
      ? (body.authorizations ?? []).map(entry => ({
        path: entry.path,
        rationale: entry.rationale,
        by: outlineRef,
      }))
      : artifacts.map(artifact => ({
        path: artifact.path,
        rationale: `The revision of ${revised.id} rewrites the agreement's own artifacts.`,
        by: refOf(artifact.contract.id, artifact.contract.revision, artifact.contract),
      }));

    const id = iterationId(item.id, number);
    const assignment = iterationAssignmentSchema.parse({
      schema: 'ramify-agent.iteration-assignment/1',
      id,
      workItem: item.id,
      outline: outlineRef,
      stage: body.stage,
      kind: body.kind,
      goal: body.goal,
      approach: body.approach,
      scope,
      requirementRefs: body.requirementRefs,
      externalCapabilities: revised === undefined
        ? body.externalCapabilities
        : [{ capability: revised.capability.id, owner: revised.provider, role: 'request' }],
      completionEvidence: body.completionEvidence,
      evidenceObligations,
      gate: { checkpoint: checkpointOf(body.kind), tests: testPolicyOf(body.kind, scope.base, evidenceObligations) },
      guarded: await captureGuardedFiles(this.projectRoot, artifacts.map(artifact => artifact.path), await this.guardedScenarioFiles(run)),
      authorizations,
      ...(revised === undefined ? {} : { revisesContract: refOf(revised.id, revised.revision, revised) }),
      ...(revised !== undefined || body.scenarios === undefined || body.scenarios.length === 0 ? {} : { scenarios: [...body.scenarios] }),
    } satisfies IterationAssignment);

    await this.write(run, revised === undefined
      ? {
        type: 'iteration-assigned',
        // The architect's pinned point that produced this assignment is
        // committed with it: the iteration's scope review forks it. The
        // first assignment after a reconciliation chose a correction
        // resolves that reconciliation's repair intent.
        data: {
          workItem: item.id, iteration: id, kind: assignment.kind, scopeRevision: scope.revision, invocation, decisions: localDecisions, architectRef,
          ...(this.pendingCorrection(run, item.id) === undefined ? {} : { corrects: this.pendingCorrection(run, item.id)! }),
        },
      }
      : {
        type: 'contract-requested',
        data: {
          workItem: item.id,
          iteration: id,
          scopeRevision: scope.revision,
          invocation,
          capability: revised.capability.id,
          consumer: item.module,
          provider: revised.provider,
          // A direct revision is the architect's own; no engineer asked for it.
          requestedBy: null,
          revises: revised.id,
        },
      }, [
      { path: iterationLayout.assignment(item.id, number), id, revision: 1, body: assignment },
      ...localRecords,
    ]);
    await this.afterWrite(revised === undefined ? 'iteration-assigned' : 'contract-requested', run.record.jobId);
    return this.ignoring(run) ? null : assignment;
  }

  /**
   * The equipment of one implementation session, over this run: its paths
   * hold the shell output and the hook logs, and its policy supplies the
   * commands and the bounds.
   */
  private implementationTools(run: Run, options: {
    readonly scopeRevision: number;
    readonly guarded: GuardedScope;
    readonly tests: TestSelectionPolicy;
    readonly scenarios?: EngineerEquipmentInputs['scenarios'];
  }): EngineerEquipment {
    return engineerEquipment({
      commandExecution: this.options.commandExecution,
      projectRoot: this.projectRoot,
      ramify: this.options.ramify,
      commands: run.record.policy.commands,
      bounds: run.record.policy.limits,
      refresh: () => this.refreshIndex(run),
      index: () => run.index,
      ...options,
      outputPath: (kind, invocation, number) => run.path(kind === 'shell'
        ? runLayout.shellOutput(invocation, number)
        : kind === 'hook' ? runLayout.hookOutput(invocation, number) : runLayout.scopeScenarios(invocation, number)),
    });
  }

  /**
   * The registered evidence one assignment must satisfy, derived from the
   * work item's origin and its open requirements. A provider work item owes
   * its obligation's conformance suite against the real implementation; a
   * verification owes its consumer's tests with every fake replaced.
   */
  private evidenceFor(
    run: Run,
    item: WorkItem,
    kind: IterationAssignment['kind'],
    records: ReturnType<typeof committedRecords>,
  ): IterationAssignment['evidenceObligations'] {
    const evidence: IterationAssignment['evidenceObligations'] = [];
    // A provider work item owes its obligation at every iteration of it, so
    // the agreed suite runs against the real implementation before the item
    // can complete. A verification of its own requirements does not excuse
    // it, and a revision binds it to the revision it now owes.
    const obligation = this.obligationOwedBy(run, item, records);
    if (obligation !== null) {
      evidence.push({
        obligation: refOf(obligation.id, obligation.revision, obligation),
        suite: [...obligation.evidence.conformance],
        against: 'real',
      });
    }
    if (kind === 'verification') {
      for (const requirement of this.openRequirementsOf(run, records, item.id)) {
        const obligation = records.obligations.get(requirement.obligation);
        evidence.push({
          requirement: refOf(requirement.id, requirement.revision, requirement),
          suite: [...(obligation?.evidence.conformance ?? [])],
          against: 'real',
        });
      }
    }
    return evidence;
  }

  /**
   * One iteration: the engineer invocations that work it, the gate that owns
   * the verdict, the repair rounds the policy allows, and the result that
   * closes it. The counters are keyed by the iteration, not by the session,
   * so a fresh session after a context-budget return resets nothing.
   */
  private async takeIteration(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    assignment: IterationAssignment,
    assignedIndex: ArchitectIndex | null,
  ): Promise<IterationOutcome | null> {
    const loaded = packages.get('engineer');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the engineer');
      return null;
    }
    const number = this.assignedCount(run, item.id);
    const systemPrompt = renderEngineerPrompt(loaded, this.projectRoot);
    const measurementScope = {
      exactOwners: 'module' in assignment.scope.base ? [assignment.scope.base.module] : assignment.scope.base.modules,
      subtrees: 'module' in assignment.scope.base ? assignment.scope.base.includedChildren : [],
      apiViews: true,
      architectView: false,
      supportDocuments: baseline.supplementary.map(entry => entry.path),
    };

    const invocations: string[] = [];
    const findings: string[] = [];
    let sessionRef: string | undefined;
    /** The engineer's session while the harness keeps it; `sessionRef` is its executor's point. */
    let session: SessionId | undefined;
    /** A lost session the next one is reconstructed in place of. */
    let replacing: SessionId | undefined;
    let handoff: { done: string[]; unfinished: string[] } | undefined;
    let failedGate: { id: string; cause: string | null; summary: string[] } | undefined;
    let firstCause: { gate: string; cause: string | null } | undefined;
    let repairRound = 0;
    let attempt = 0;

    // Closing the iteration closes the work of a session still kept for it.
    const close = async (outcome: IterationResult['outcome'], extra: Partial<IterationResult> = {}): Promise<IterationOutcome> => {
      const result = await this.closeIteration(run, item, number, assignment, {
        outcome, invocations, findings, gate: null, commit: null, ...extra,
      });
      await this.finishSession(run, session, 'work-closed');
      return { result };
    };

    for (;;) {
      if (this.ignoring(run)) return null;

      // A session the implementation can no longer read is reconstructed from
      // records rather than continued, and the counters are kept.
      let start: SessionStart = { mode: 'fresh' };
      let degraded: InvocationRequest<EngineerSubmission>['degraded'];
      if (sessionRef !== undefined) {
        const note = `Continuing iteration ${assignment.id}.`;
        const appended = await agent.appendContext(sessionRef, `${assignment.id}:${attempt}`, note);
        if (appended.outcome === 'session-lost') {
          const used = this.reconstructions(run, item.id);
          if (used >= run.record.policy.limits.sessionReconstructionsPerWork) {
            findings.push(`The engineer's session was lost and ${used} reconstruction${used === 1 ? '' : 's'} were already spent`);
            await this.finishSession(run, session, 'lost');
            return close('exhausted');
          }
          // The session reconstructed from records takes the lost one's place.
          await this.finishSession(run, session, 'replaced');
          degraded = { requested: 'continued', reason: 'the implementation can no longer read the session; it was reconstructed from records' };
          replacing = session;
          sessionRef = undefined;
          session = undefined;
        } else {
          start = { mode: 'continue', ref: appended.ref };
          if (appended.outcome === 'appended' && session !== undefined) {
            const kept = session;
            await recordAppend(this.transcriptOf(run, kept), { kind: 'note-appended', text: note }, null)
              .catch(error => this.warn(`Run ${run.record.jobId}: the note continuing ${kept} is missing from its transcript: ${message(error)}`));
          }
        }
      }

      attempt += 1;
      const before = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      const guarded = guardedScopeOf(assignment.scope, await this.deniedFiles(run));
      const briefedScenarios = await this.engineerScenarios(run, item);
      // The engineer's own test run is a diagnosis over the modules it was
      // given. Where the gate is the whole project, the tool still resolves
      // this iteration's own modules, with the suites its evidence requires.
      const probed = assignment.gate.tests.policy === 'all-project'
        ? { ...scopeProbePolicyOf(assignment.scope.base), extraSuites: [...assignment.gate.tests.extraSuites] }
        : assignment.gate.tests;
      const tools = this.implementationTools(run, {
        scopeRevision: assignment.scope.revision,
        guarded,
        tests: probed,
        scenarios: this.scopeScenarioCheck(run, item, probed),
      });

      const result = await this.runInvocation<EngineerSubmission>(run, agent, {
        role: 'engineer',
        work: { workItem: item.id, iteration: assignment.id },
        attempt,
        loaded,
        systemPrompt,
        prompt: iterationMessage({
          assignment,
          projectRoot: this.projectRoot,
          base: this.accepted(run),
          views: await this.iterationViews(run, assignment),
          ...(failedGate === undefined ? {} : { failedGate }),
          ...(handoff === undefined ? {} : { handoff: { ...handoff, returns: this.budgetReturns(run, assignment.id) } }),
          ...(briefedScenarios === undefined ? {} : { scenarios: briefedScenarios }),
        }),
        start,
        session,
        // The engineer is kept only after a proposed completion, and
        // continued only for the repair its failing gate asks for. The
        // harness point is its previous invocation's end: the note appended
        // before it is the executor's, and no other session starts from it.
        continuing: 'repair',
        ...(replacing === undefined ? {} : { replaces: { session: replacing, reason: 'reconstructed' } }),
        ...(degraded === undefined ? {} : { degraded }),
        // A proposed completion is kept for the repair its gate may ask
        // for; any other result closes the iteration, and a budget return
        // starts a fresh session unless it is the last one the iteration may
        // make.
        keep: (ended, value) => {
          if (ended === 'context-budget-reached') {
            return finished(this.budgetReturns(run, assignment.id) + 1 >= run.record.policy.limits.budgetReturnsPerIteration ? 'work-closed' : 'not-kept');
          }
          if (ended !== 'submitted' || value === undefined) return finished('not-kept');
          return value.kind === 'completion-proposed' ? kept : finished('work-closed');
        },
        toolName: engineerToolName,
        description: engineerSubmissionDescription,
        inputSchema: engineerJsonSchema,
        submissionSchema: 'ramify-agent.engineer-submission/1',
        // A claimed completion is checked afresh over the write scope
        // before it is judged, because the hook checks saw only the
        // mutations they covered.
        validate: async input => validateEngineer(input, {
          obligation: assignment.evidenceObligations
            .find(evidence => evidence.obligation !== undefined && evidence.against === 'real')?.obligation ?? null,
          kind: assignment.kind,
          openFindings: await tools.findingsAtCompletion(input),
          scenarios: this.declarationContext(run, item),
        }),
        acceptedText: value => {
          const check = tools.completionCheck();
          return iterationAcceptance(value.kind, check?.kind === 'not-checked' ? check.reason : null);
        },
        scope: {
          write: assignment.scope.revision,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: scopeSize(baseline, measurementScope),
        },
        writer: true,
        guarded,
        equip: tools.equip,
        endedAs: () => (tools.exhausted() ? 'invalid-submission' : undefined),
      });
      invocations.push(result.id);
      sessionRef = result.kept && result.ref !== '' ? result.ref : undefined;
      session = sessionRef === undefined ? undefined : result.session;
      replacing = undefined;

      // The line events of this writer, from the two snapshots around it.
      // Two snapshots see the tree and not the history between them, so a
      // command that changed a file and put it back is invisible to them.
      const after = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      await this.recordLineEvents(run, result.id, before, after, tools.shellCalls() > 0
        ? ['unguarded-shell: this invocation ran unguarded commands, so a change one of them made and reverted is not in these counts']
        : []);
      if (this.ignoring(run)) return null;

      if (result.ended === 'context-budget-reached') {
        const returns = this.budgetReturns(run, assignment.id);
        const report = result.value;
        handoff = report !== undefined && report.kind === 'partial'
          ? { done: [...report.done], unfinished: [...report.unfinished] }
          : { done: [], unfinished: ['the session reached its context budget before it reported'] };
        findings.push(`The engineer reached its context budget (return ${returns} of ${run.record.policy.limits.budgetReturnsPerIteration})`);
        if (returns >= run.record.policy.limits.budgetReturnsPerIteration) {
          return close('partial');
        }
        sessionRef = undefined;
        session = undefined;
        continue;
      }

      if (result.ended !== 'submitted' || result.value === undefined) {
        await this.fail(
          run,
          result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
          `The engineer of ${assignment.id} ended without a result (${result.ended})`,
          [runLayout.outcome(result.id)],
        );
        return null;
      }

      if (result.value.kind === 'partial') {
        findings.push(...result.value.findings, ...result.value.unfinished.map(entry => `unfinished: ${entry}`));
        return close('partial');
      }
      if (result.value.kind === 'unsuitable') {
        findings.push(`unsuitable (${result.value.reason}): ${result.value.detail}`);
        // The provider cannot meet the agreement as it stands. The harness
        // derives the obligation from the assignment, the writer has settled
        // with the invocation, the iteration closes here, and the report
        // reaches the consumer's architect. Nothing of the agreement changes.
        if (result.value.reason === 'provider-cannot-conform') {
          const closed = await close('unsuitable');
          const reported = await this.reportRevisionNeeded(run, item, assignment, result.value.detail);
          return reported === null ? null : { ...closed, reportedRevision: true };
        }
        return close('unsuitable');
      }

      // The behavior this iteration needs is owned elsewhere. Its turn ends
      // here: no nested live session is started, the iteration closes with
      // what it did, and the harness answers with a contract iteration of
      // its own whose outcome is in the records.
      if (result.value.kind === 'contract-needed') {
        const need = result.value.need;
        findings.push(`the behavior needed for "${need.capability}" is owned outside this scope: ${result.value.summary}`);
        const closed = await close('partial');
        return {
          result: closed.result,
          need: {
            need,
            ...(result.value.suggestedProvider === undefined ? {} : { suggestedProvider: result.value.suggestedProvider }),
            invocation: result.id,
          },
        };
      }

      const proposal = result.value;
      // The proposal's declarations apply at its acceptance, before the gate
      // that verifies them: that gate selects them by identity.
      if (!await this.declareScenarios(run, item, result.id, proposal.scenarios)) return null;
      let infrastructureAttempt = 0;
      for (;;) {
        const gate = await this.iterationGate(run, item, assignment, result.id, repairRound, infrastructureAttempt, proposal.summary);
        if (gate === null) return null;
        firstCause ??= { gate: gate.id, cause: gate.cause };

        if (gate.verdict === 'passed') {
          findings.push(...proposal.findings);
          const closed = await this.closeIteration(run, item, number, assignment, {
            outcome: 'accepted',
            invocations,
            findings,
            gate: gate.id,
            commit: gate.audited,
            ...(proposal.recommendation === undefined ? {} : { recommendation: proposal.recommendation }),
          });
          // The candidate's reviews are requested before the driver passes
          // it; they run beside the next iteration's writer.
          if (closed.commit !== null) await this.requestReviews(run, { workItem: item.id, iteration: assignment.id, gate: gate.id, commit: closed.commit });
          await this.finishSession(run, session, 'work-closed');
          // The evidence this acceptance discharges: a provider that ran the
          // agreed suite against the real implementation has conformed, and a
          // verification that replaced every fake injection closes its
          // requirement.
          if (!await this.dischargeEvidence(run, item, assignment, gate.id, closed)) return null;
          return { result: closed };
        }

        if (gate.next === 'retry-infrastructure') {
          infrastructureAttempt += 1;
          continue;
        }
        if (gate.next === 'exhausted') {
          findings.push(...proposal.findings);
          findings.push(`the gate did not pass; the first cause was ${firstCause.cause ?? 'unknown'} at gate ${firstCause.gate}`);
          return close('exhausted');
        }
        if (gate.next === 'return-to-local-architect') {
          findings.push(...proposal.findings);
          findings.push(`the gate returned to the local architect: ${gate.cause ?? 'unknown'} at gate ${gate.id}`);
          // The architect can only record a revision for a change it can
          // name, so the guarded paths the attempt found go with the cause.
          for (const change of gate.guardedChanges) {
            if (change.authorizedBy !== null) continue;
            findings.push(`no record authorizes the change to the guarded file "${change.path}"${change.after === null ? ', which this iteration deleted' : ''}`);
          }
          // What failed and what it reported travel with the outcome: a
          // cause alone was read as a write outside the assignment, the
          // architect narrowed the file list, and the same failure returned.
          const returnedGate = await this.diagnosticsOf(run, gate, 'local-architect');
          return { ...await close('unsuitable'), returnedGate };
        }
        // One repair round: the rerun runs the gate's complete required set.
        repairRound += 1;
        failedGate = await this.diagnosticsOf(run, gate);
        break;
      }
    }
  }

  /**
   * What a provider's report that it cannot conform records. The obligation
   * is derived from the assignment and not from what the engineer said; the
   * report is deduplicated per obligation revision, and it returns to the
   * local architect of the consumer that asked for this provider work, even
   * while that consumer is yielded.
   *
   * A second report at the same obligation revision means the agreement was
   * not revised and this provider cannot proceed; the run fails with the
   * evidence rather than asking the same question again.
   */
  private async reportRevisionNeeded(
    run: Run,
    item: WorkItem,
    assignment: IterationAssignment,
    detail: string,
  ): Promise<'reported' | null> {
    const owed = assignment.evidenceObligations
      .find(evidence => evidence.obligation !== undefined && evidence.against === 'real')?.obligation;
    if (owed === undefined) {
      await this.fail(run, 'internal',
        `${assignment.id} reported it cannot conform, and its assignment owes no real-provider obligation`);
      return null;
    }
    const already = run.log.all('revision-needed')
      .some(event => event.data.obligation.id === owed.id && event.data.obligation.revision === owed.revision);
    if (already) {
      await this.fail(run, 'unresolvable-requirement',
        `${item.id} reports again that it cannot conform to ${owed.id} at revision ${owed.revision}, and the agreement was not revised: ${detail}`,
        [contractsLayout.obligation(owed.id, owed.revision), iterationLayout.result(item.id, this.assignedCount(run, item.id))]);
      return null;
    }

    const records = committedRecords(run.log.ledger.replay());
    const consumer = this.consumerOf(run, records, item, owed.id, owed.revision);
    if (consumer === null) {
      await this.fail(run, 'internal',
        `${owed.id} has no consumer work item to return the report of ${assignment.id} to`);
      return null;
    }
    await this.write(run, {
      type: 'revision-needed',
      data: { obligation: owed, iteration: assignment.id, consumerWorkItem: consumer },
    });
    await this.afterWrite('revision-needed', run.record.jobId);
    return this.ignoring(run) ? null : 'reported';
  }

  /**
   * The consumer work item a provider's report returns to: the one whose
   * yield started this provider work, where that item is still open, and
   * otherwise the open item that holds a requirement of the obligation.
   */
  private consumerOf(
    run: Run,
    records: ReturnType<typeof committedRecords>,
    item: WorkItem,
    obligation: string,
    revision: number,
  ): string | null {
    const completed = new Set(run.log.all('work-item-completed').map(event => event.data.workItem));
    const bindings = this.bindingsOf(run);
    const holders = [...records.requirements.values()]
      .filter(requirement => requirement.obligation === obligation && requirement.contractRevision === revision)
      .map(requirement => bindings.get(bindingKey(requirement.id, requirement.revision)) ?? requirement.workItem);
    if (item.startedFor !== null && holders.includes(item.startedFor) && !completed.has(item.startedFor)) return item.startedFor;
    return holders.find(holder => !completed.has(holder)) ?? holders[0] ?? null;
  }

  /**
   * One contract revision the consumer's architect assigned directly: the
   * contract engineer that establishes it, the gate that verifies it, and
   * the reopening a passing gate commits. The agreement in force stays in
   * force until then.
   */
  private async reviseContract(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    assignment: IterationAssignment,
  ): Promise<ContractOutcome | null> {
    const loaded = packages.get('contract-engineer');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the contract engineer');
      return null;
    }
    const records = committedRecords(run.log.ledger.replay());
    const reference = assignment.revisesContract!;
    const contract = records.contracts.get(reference.id);
    if (contract === undefined) {
      await this.fail(run, 'internal', `${assignment.id} revises "${reference.id}", which this run has not registered`);
      return null;
    }
    const reported = run.log.all('revision-needed')
      .filter(event => contractOfObligation(event.data.obligation.id) === contract.id)
      .at(-1);
    const report = reported === undefined
      ? undefined
      : (records.results.get(reported.data.iteration)?.findings ?? []).join('; ');

    return this.runContractSession(run, agent, baseline, item, assignment, loaded, {
      provider: contract.provider,
      capability: contract.capability.id,
      number: this.assignedCount(run, item.id),
      revision: {
        contract: contract.id,
        inForce: contract.revision,
        behavior: contract.behavior,
        artifacts: [
          ...contract.artifacts.interface.map(entry => entry.path),
          ...contract.artifacts.conformance.map(entry => entry.path),
          ...contract.artifacts.fake.map(entry => entry.path),
        ],
        rationale: assignment.approach,
        ...(report === undefined || report === '' ? {} : { report }),
      },
    });
  }

  /**
   * One contract sub-session: the assignment that licenses it, the engineer
   * that establishes the agreement, the gate that verifies it, and the
   * registration a passing gate makes.
   *
   * It is an iteration of the requesting work item, with its own identifier,
   * scope, gate and result. A caller that dies discovers its outcome from
   * those records and needs no reply from it.
   */
  private async takeContract(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    request: {
      readonly need: NeedAsBehavior;
      readonly suggestedProvider?: string | undefined;
      readonly invocation: string;
      readonly requestedBy: string;
    },
  ): Promise<ContractOutcome | null> {
    const loaded = packages.get('contract-engineer');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the contract engineer');
      return null;
    }
    const records = committedRecords(run.log.ledger.replay());
    const index = await this.refreshIndex(run);

    // The owner comes from the registry, and from nothing an engineer said.
    // A capability the registry does not place, or places with the consumer
    // itself, is a placement question: it goes back to this work item's own
    // architect, which is the role that may ask the global architect.
    const entry = records.registry.find(candidate => candidate.capability === request.need.capability);
    if (entry === undefined || entry.owner === item.module) {
      return {
        findings: [entry === undefined
          ? `the capability "${request.need.capability}" is not in the registry, so no owner can be resolved for it; place it before it can be delegated`
          : `the registry places "${request.need.capability}" with "${entry.owner}", which is this work item's own module, so there is nothing to delegate`],
      };
    }
    const providerDirectory = directoryOf(index, entry.owner);
    if (providerDirectory === null) {
      return { findings: [`the refreshed architect view has no directory for "${entry.owner}", so no contract scope could be captured`] };
    }

    const outline = (records.outlines.get(item.id) ?? []).at(-1);
    if (outline === undefined) {
      await this.fail(run, 'internal', `The contract iteration of ${item.id} has no outline to work from`);
      return null;
    }
    const number = this.assignedCount(run, item.id) + 1;
    if (number > run.record.policy.limits.maxIterationsPerWorkItem) {
      await this.fail(run, 'limit-exceeded',
        `${item.id} has reached ${run.record.policy.limits.maxIterationsPerWorkItem} iterations, which the policy allows`);
      return null;
    }

    const base = { module: item.module, includedChildren: [] as string[] };
    const scope = await this.contractScope(run, index, {
      revision: number,
      consumer: item.module,
      provider: entry.owner,
      providerDirectory,
      rationale: `The agreement between ${item.module} and ${entry.owner}: the contract, its conformance suite, its fake, the consumer's integration and the exposure declarations on the path between them. The provider's implementation is not this iteration's.`,
    });

    const subArtifacts = this.requiredArtifacts(committedRecords(run.log.ledger.replay()));
    const id = iterationId(item.id, number);
    const assignment = iterationAssignmentSchema.parse({
      schema: 'ramify-agent.iteration-assignment/1',
      id,
      workItem: item.id,
      outline: refOf(item.id, outline.revision, outline),
      stage: 0,
      kind: 'contract',
      goal: `Establish the agreement that gives ${item.module} the behavior of "${entry.capability}", which ${entry.owner} owns, and integrate it in ${item.module} against a fake.`,
      approach: `${item.module} stated the need as behavior. Design the interface, write the conformance suite and the fake, integrate the fake in ${item.module}, and leave ${entry.owner} to implement the provider.`,
      scope,
      requirementRefs: [],
      externalCapabilities: [{ capability: entry.capability, owner: entry.owner, role: 'request' }],
      completionEvidence: `${item.module}'s own tests pass against the fake, and the fake passes the conformance suite.`,
      evidenceObligations: [],
      gate: { checkpoint: 'contract', tests: testPolicyOf('contract', base, []) },
      guarded: await captureGuardedFiles(this.projectRoot, subArtifacts.map(artifact => artifact.path), await this.guardedScenarioFiles(run)),
      authorizations: subArtifacts.map(artifact => ({
        path: artifact.path,
        rationale: `The agreement ${artifact.contract.id} is this iteration's to write.`,
        by: refOf(artifact.contract.id, artifact.contract.revision, artifact.contract),
      })),
      requestedBy: request.requestedBy,
    } satisfies IterationAssignment);

    await this.write(run, {
      type: 'contract-requested',
      data: {
        workItem: item.id,
        iteration: id,
        scopeRevision: scope.revision,
        invocation: request.invocation,
        capability: entry.capability,
        consumer: item.module,
        provider: entry.owner,
        requestedBy: request.requestedBy,
        revises: null,
      },
    }, [{ path: iterationLayout.assignment(item.id, number), id, revision: 1, body: assignment }]);
    await this.afterWrite('contract-requested', run.record.jobId);
    if (this.ignoring(run)) return null;

    return this.runContractSession(run, agent, baseline, item, assignment, loaded, {
      need: request.need,
      provider: entry.owner,
      capability: entry.capability,
      number,
      requestedBy: { invocation: request.invocation, reason: 'contract-needed' },
    });
  }

  /**
   * The write scope of one contract iteration: the requesting consumer, and
   * the directories of the contract, its conformance suite and its fake
   * under the provider, with the declarations on the path between the two.
   *
   * It is given directories because the files it will write may not exist
   * yet and their names are the agreement's to choose. A revision is scoped
   * the same way: it rewrites the same three places.
   */
  private async contractScope(
    run: Run,
    index: ArchitectIndex | null,
    subject: {
      readonly revision: number;
      readonly consumer: string;
      readonly provider: string;
      readonly providerDirectory: string;
      readonly rationale: string;
    },
  ) {
    return resolveWriteScope({
      projectRoot: this.projectRoot,
      index,
      view: run.record.manifest.architectView,
      revision: subject.revision,
      base: { module: subject.consumer, includedChildren: [] },
      extra: [
        { path: `${subject.providerDirectory}/src/interfaces`, purpose: 'contract', kind: 'directory' },
        { path: `${subject.providerDirectory}/src/tests`, purpose: 'conformance', kind: 'directory' },
        { path: `${subject.providerDirectory}/src/fakes`, purpose: 'fake', kind: 'directory' },
        ...declarationsBetween(index, subject.consumer, subject.provider).map(path => ({ path, purpose: 'exposure-declaration' as const })),
      ],
      read: [subject.provider, subject.consumer],
      bootstrap: [],
      rationale: subject.rationale,
    });
  }

  /** The contract engineer's invocations, its gate, and what a passing gate registers. */
  private async runContractSession(
    run: Run,
    agent: AgentPort,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    assignment: IterationAssignment,
    loaded: LoadedPackage,
    subject: {
      readonly need?: NeedAsBehavior | undefined;
      readonly revision?: RevisionBriefing | undefined;
      readonly provider: string;
      readonly capability: string;
      readonly number: number;
      /** The invocation whose need opened this sub-session; none for a revision its architect assigned. */
      readonly requestedBy?: RequestRelation | undefined;
    },
  ): Promise<ContractOutcome | null> {
    const systemPrompt = renderContractPrompt(loaded, this.projectRoot);
    const measurementScope = {
      exactOwners: [item.module, subject.provider],
      subtrees: [],
      apiViews: true,
      architectView: false,
      supportDocuments: baseline.supplementary.map(entry => entry.path),
    };
    const invocations: string[] = [];
    const findings: string[] = [];
    let sessionRef: string | undefined;
    /** The contract engineer's session while the harness keeps it; `sessionRef` is its executor's point. */
    let session: SessionId | undefined;
    let failedGate: { id: string; cause: string | null; summary: string[] } | undefined;
    let repairRound = 0;
    let attempt = 0;

    for (;;) {
      if (this.ignoring(run)) return null;
      attempt += 1;
      const before = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      const guarded = guardedScopeOf(assignment.scope, await this.deniedFiles(run));
      const tools = this.implementationTools(run, {
        scopeRevision: assignment.scope.revision,
        guarded,
        tests: assignment.gate.tests,
      });
      const index = await this.refreshIndex(run);

      const result = await this.runInvocation<ContractSubmission>(run, agent, {
        role: 'contract-engineer',
        work: { workItem: item.id, iteration: assignment.id },
        attempt,
        loaded,
        systemPrompt,
        prompt: contractMessage({
          assignment,
          projectRoot: this.projectRoot,
          base: this.accepted(run),
          ...(subject.need === undefined ? {} : { need: subject.need }),
          ...(subject.revision === undefined ? {} : { revision: subject.revision }),
          consumer: { module: item.module, iteration: assignment.requestedBy ?? null },
          provider: subject.provider,
          existingConsumers: this.consumersOf(run, subject.capability, item.module),
          ...(failedGate === undefined ? {} : { failedGate }),
        }),
        start: sessionRef === undefined ? { mode: 'fresh' } : { mode: 'continue', ref: sessionRef },
        session,
        continuing: 'repair',
        ...(subject.requestedBy === undefined ? {} : { requestedBy: subject.requestedBy }),
        // An established agreement is kept for the repair its gate may ask
        // for; a budget return or an incomplete one closes the iteration.
        keep: (ended, value) => {
          if (ended === 'submitted' && value !== undefined) return value.kind === 'established' ? kept : finished('work-closed');
          return finished(ended === 'context-budget-reached' ? 'work-closed' : 'not-kept');
        },
        toolName: contractToolName,
        description: 'End your turn with the result of this contract iteration. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.',
        inputSchema: contractJsonSchema,
        submissionSchema: 'ramify-agent.contract-submission/1',
        validate: input => validateContract(input, {
          index,
              exists: (path: string) => stat(join(this.projectRoot, path)).then(found => found.isFile(), () => false),
        }),
        scope: {
          write: assignment.scope.revision,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: scopeSize(baseline, measurementScope),
        },
        writer: true,
        guarded,
        equip: tools.equip,
        endedAs: () => (tools.exhausted() ? 'invalid-submission' : undefined),
      });
      invocations.push(result.id);
      sessionRef = result.kept && result.ref !== '' ? result.ref : undefined;
      session = sessionRef === undefined ? undefined : result.session;

      const after = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      await this.recordLineEvents(run, result.id, before, after, tools.shellCalls() > 0
        ? ['unguarded-shell: this invocation ran unguarded commands, so a change one of them made and reverted is not in these counts']
        : []);
      if (this.ignoring(run)) return null;

      // A threshold return registers nothing, as an `incomplete` submission
      // does: a contract session that did not finish has established no
      // agreement, whatever it wrote.
      if (result.ended === 'context-budget-reached') {
        findings.push('the contract session reached its context budget before it established the agreement; nothing was registered');
        const closed = await this.closeIteration(run, item, subject.number, assignment, {
          outcome: 'partial', invocations, findings, gate: null, commit: null,
        });
        return this.ignoring(run) ? null : { findings, result: closed };
      }

      if (result.ended !== 'submitted' || result.value === undefined) {
        await this.fail(
          run,
          result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
          `The contract engineer of ${assignment.id} ended without a result (${result.ended})`,
          [runLayout.outcome(result.id)],
        );
        return null;
      }

      if (result.value.kind === 'incomplete') {
        findings.push(
          `the contract iteration ${assignment.id} did not establish the agreement, and registered nothing`,
          ...result.value.unfinished.map(entry => `unfinished: ${entry}`),
          ...result.value.findings,
        );
        const closed = await this.closeIteration(run, item, subject.number, assignment, {
          outcome: 'partial', invocations, findings, gate: null, commit: null,
        });
        return this.ignoring(run) ? null : { findings, result: closed };
      }

      const established = result.value;
      const gate = await this.contractGate(run, item, assignment, result.id, established, repairRound);
      if (gate === null) return null;

      if (gate.verdict === 'passed') {
        const registration = await this.registerAgreement(run, item, assignment, gate.id, established);
        if (registration === null) return null;
        findings.push(...registration.findings);
        const closed = await this.closeIteration(run, item, subject.number, assignment, {
          outcome: 'accepted', invocations, findings, gate: gate.id, commit: gate.audited,
        });
        await this.finishSession(run, session, 'work-closed');
        if (this.ignoring(run)) return null;
        return { findings, result: closed, ...(registration.cycle === undefined ? {} : { cycle: registration.cycle }) };
      }

      if (gate.next === 'repair' && repairRound + 1 < run.record.policy.limits.repairRoundsPerIteration) {
        repairRound += 1;
        failedGate = await this.diagnosticsOf(run, gate);
        continue;
      }
      findings.push(`the contract gate did not pass: ${gate.cause ?? 'unknown'} at gate ${gate.id}; nothing was registered`);
      const closed = await this.closeIteration(run, item, subject.number, assignment, {
        outcome: gate.next === 'return-to-local-architect' ? 'unsuitable' : 'exhausted',
        invocations, findings, gate: null, commit: null,
      });
      await this.finishSession(run, session, 'work-closed');
      return this.ignoring(run) ? null : { findings, result: closed };
    }
  }

  /** The consumers an agreement for one capability already has, this one excluded. */
  private consumersOf(run: Run, capability: string, exclude: string): string[] {
    const records = committedRecords(run.log.ledger.replay());
    const obligations = new Set([...records.obligations.values()].filter(entry => entry.capability === capability).map(entry => entry.id));
    return [...new Set([...records.requirements.values()]
      .filter(requirement => obligations.has(requirement.obligation) && requirement.consumer !== exclude)
      .map(requirement => requirement.consumer))];
  }

  /**
   * The contract gate: the consumer's own tests and the conformance suite the
   * agreement names, resolved anew from the tree, the project's type check, a
   * complete Ramify check, and the fake-naming rule the harness verifies
   * itself over the files this iteration wrote.
   */
  private async contractGate(
    run: Run,
    item: WorkItem,
    assignment: IterationAssignment,
    invocation: string,
    submission: EstablishedContract,
    repairRound: number,
  ): Promise<GateAttempt | null> {
    run.writer.requireSettled(`The ${assignment.id} gate cannot run`);
    const gateId = gateAttemptId(this.gateCount(run) + 1);
    // The conformance suite is the agreement's own evidence, so the gate
    // requires it beside the consumer's tests. The suite did not exist when
    // the assignment was made; it exists now, and a selection that cannot
    // reach it is not verified.
    const policy: TestSelectionPolicy = {
      ...assignment.gate.tests,
      extraSuites: [...new Set([...assignment.gate.tests.extraSuites, ...submission.artifacts.conformance.map(entry => entry.path)])].sort(),
    };
    const index = await this.refreshIndex(run);
    const tests = await resolveTestSelection({ projectRoot: this.projectRoot, index, policy });
    await this.recordRunnerGaps(run, invocation);

    const rules = [await this.fakeNamingRule(submission)];
    const modules = await this.pendingModules(run, assignment.id);
    const attempt = await this.committingCheckpoint(run, {
      id: gateId,
      runId: run.record.jobId,
      checkpoint: 'contract',
      projectRoot: this.projectRoot,
      directory: run.path(runLayout.gateOutput(gateId)),
      head: await this.git.currentHead(this.projectRoot),
      policy: run.record.policy,
      proposedBy: invocation,
      repairRound,
      infrastructureAttempt: 0,
      subject: { workItem: item.id, iteration: assignment.id },
      tests,
      guarded: this.guardedAtGate(run, assignment.guarded),
      writeScope: writeScopePaths(this.projectRoot, assignment),
      authorizations: assignment.authorizations.map(entry => ({ path: entry.path, by: entry.by })),
      rules,
    }, submission.summary, modules, assignment.goal);

    if (attempt.verdict !== 'passed') {
      return this.ignoring(run) ? null : attempt;
    }
    await this.afterWrite('gate-committed', run.record.jobId);
    if (this.ignoring(run)) return null;
    if (!await this.recordScenarioPasses(run, attempt)) return null;
    return attempt;
  }

  /**
   * The fake-naming rule, verified over the files the agreement names and the
   * consumer locations that hold the fake. It reads the source and not the
   * submission: what generated architectural evidence will show is the
   * source, so the source is what is checked.
   */
  private async fakeNamingRule(submission: EstablishedContract): Promise<GateRuleRecord> {
    const paths = [...new Set([
      ...submission.artifacts.interface.map(entry => entry.path),
      ...submission.artifacts.fake.map(entry => entry.path),
      ...submission.fakeInjections,
    ])];
    const files: NamedFile[] = [];
    for (const path of paths) {
      const text = await readFile(join(this.projectRoot, path), 'utf8').catch(() => null);
      if (text !== null) files.push({ path, text });
    }
    const violations = fakeNamingViolations(files, submission.artifacts.fake.map(entry => entry.path));
    return { rule: 'fake-naming', outcome: violations.length === 0 ? 'passed' : 'failed', violations };
  }

  /**
   * What a passing contract gate registers: the contract, the one provider
   * obligation, one requirement per consumer and the provider work item.
   * Every identifier is derived from committed state, and a registration
   * already in the log is not appended again.
   */
  private async registerAgreement(
    run: Run,
    item: WorkItem,
    assignment: IterationAssignment,
    gate: string,
    submission: EstablishedContract,
  ): Promise<{ readonly findings: string[]; readonly cycle?: DependencyCycle | undefined } | null> {
    const records = committedRecords(run.log.ledger.replay());
    // The capability is the one the harness put on the assignment when it
    // resolved the owner from the registry. The agreement did not choose it.
    const capability = assignment.externalCapabilities[0]?.capability;
    const registryEntry = capability === undefined
      ? undefined
      : records.registry.find(candidate => candidate.capability === capability);
    if (registryEntry === undefined) {
      await this.fail(run, 'internal', `The contract assignment ${assignment.id} names no registered capability, so no agreement can be registered`);
      return null;
    }
    const forCapability = this.capabilityOfItem(item, records);
    if (forCapability === null) {
      await this.fail(run, 'internal', `The consumer ${item.id} implements no capability the registry names, so no dependency edge could be recorded`);
      return null;
    }

    const hashes = new Map<string, string>();
    for (const path of [
      ...submission.artifacts.interface.map(artifact => artifact.path),
      ...submission.artifacts.conformance.map(artifact => artifact.path),
      ...submission.artifacts.fake.map(artifact => artifact.path),
      ...submission.artifacts.exposure.map(artifact => artifact.path),
    ]) {
      hashes.set(path, sha256(await readFile(join(this.projectRoot, path))));
    }

    // A revision names the agreement it revises; the harness fills the next
    // revision number, and the agreement in force stays in force until this
    // transaction. Otherwise an agreement already registered for this
    // capability and this provider is the one in force, and a further
    // consumer attaches to it.
    const revises = assignment.revisesContract;
    const existing = revises === undefined
      ? [...records.contracts.values()].find(candidate =>
        candidate.capability.id === registryEntry.capability && candidate.provider === submission.provider)
      : records.contracts.get(revises.id);
    if (revises !== undefined && existing === undefined) {
      await this.fail(run, 'internal', `${assignment.id} revises "${revises.id}", which this run has not registered`);
      return null;
    }
    const contract = existing?.id ?? contractId(records.contracts.size + 1);
    const revision = existing === undefined ? 1 : revises === undefined ? existing.revision : existing.revision + 1;

    const bindings = this.bindingsOf(run);
    const attached = [...records.requirements.values()]
      .filter(requirement => contractOfObligation(requirement.obligation) === contract);
    // Only a revision carries a consumer's existing requirement forward. An
    // engineer that asks for the same agreement again is a further
    // attachment, with a requirement of its own.
    const mine = revises === undefined
      ? undefined
      : attached.find(requirement =>
        (bindings.get(bindingKey(requirement.id, requirement.revision)) ?? requirement.workItem) === item.id);

    const consumer: AttachedConsumer = {
      requirement: mine?.id ?? requirementId(records.requirements.size + 1),
      workItem: mine?.workItem ?? item.id,
      module: item.module,
      forCapability,
      tests: mine?.evidence.tests ?? testPolicyOf('ordinary', { module: item.module, includedChildren: [] }, []),
      fakeInjections: submission.fakeInjections,
    };
    // Every consumer of the agreement is reopened at the new revision; each
    // keeps its own identity, its own tests and its own injection sites,
    // and the revising consumer takes the ones this session just wrote.
    const consumers: readonly AttachedConsumer[] = revises === undefined
      ? [consumer]
      : [
        ...attached.map(requirement => (requirement.id === consumer.requirement ? consumer : {
          requirement: requirement.id,
          workItem: requirement.workItem,
          module: requirement.consumer,
          forCapability: requirement.forCapability,
          tests: requirement.evidence.tests,
          fakeInjections: requirement.evidence.fakeInjections,
        })),
        ...(mine === undefined ? [consumer] : []),
      ];

    const obligation = submission.mode === 'access-only' ? null : obligationId(contract);
    const prior = [
      ...run.log.all('contract-registered').map(event => ({
        contract: event.data.contract,
        revision: event.data.revision,
        obligation: event.data.obligation,
        requirements: event.data.requirements,
      })),
      ...run.log.all('evidence-reopened').map(event => ({
        contract: event.data.contract,
        revision: event.data.revision,
        obligation: event.data.obligation,
        requirements: event.data.requirements,
      })),
    ];
    const requirements = submission.mode === 'access-only' ? [] : consumers.map(entry => entry.requirement);
    if (!registrationNeeded(prior, { contract, revision, obligation, requirements })) {
      return { findings: [`the agreement ${contract} at revision ${revision} is already registered; nothing was appended`] };
    }

    const existingProvider = obligation === null || revises !== undefined
      ? undefined
      : providerItemOf(records.workItems, obligation, revision, bindings);
    const registration = registerContract({
      contract,
      revision,
      capability: { ref: refOf(registryEntry.capability, registryEntry.revision, registryEntry), slug: registryEntry.capability, decision: registryEntry.decision },
      submission,
      hashes,
      establishedBy: { iteration: assignment.id, gate },
      consumers: submission.mode === 'access-only' ? [] : consumers,
      // A revision schedules its own work: the reopening binds each new
      // subject to the item responsible for it, reusing the unfinished and
      // following the completed.
      provider: obligation === null || revises !== undefined
        ? { kind: 'none' }
        : existingProvider !== undefined
          ? { kind: 'existing', id: existingProvider.id }
          : { kind: 'create', id: workItemId(records.workItems.length + 1), goal: `Implement ${registryEntry.capability} in ${submission.provider} so that the agreed conformance suite passes against the real provider.`, startedFor: item.id },
    });

    if (revises !== undefined) {
      const reopened = await this.reopenAgreement(run, item, assignment, registration, {
        contract,
        revision,
        obligation,
        previousRevision: existing!.revision,
        records,
        bindings,
        cause: `${assignment.id} revised ${contract} from revision ${existing!.revision} to ${revision}`,
      });
      if (reopened === null) return null;
      const findings = [
        `the agreement ${contract} is reopened at revision ${revision}; ${registration.requirements.map(entry => entry.id).join(', ')} verify again`,
        ...reopened.findings,
      ];
      if (mine !== undefined) return { findings };
      const cycle = registration.obligation === null
        ? null
        : await this.checkDependencyGraph(run, item, {
          from: forCapability,
          to: registration.obligation.capability,
          requirement: consumer.requirement,
          workItem: item.id,
        });
      if (cycle === undefined) return null;
      return { findings, ...(cycle === null ? {} : { cycle }) };
    }

    // An attachment to an agreement already in force adds its requirement and
    // its binding, and nothing else: the contract and the obligation in the
    // log stay as they are.
    const committedBodies = existing === undefined
      ? registration.records
      : registration.records.filter(record => record.path.startsWith('requirements/') || record.path.startsWith('work-items/'));

    await this.write(run, {
      type: 'contract-registered',
      data: {
        contract,
        revision,
        mode: submission.mode,
        iteration: assignment.id,
        obligation,
        requirements: registration.requirements.map(requirement => requirement.id),
        providerWorkItem: registration.providerWorkItem?.id ?? existingProvider?.id ?? null,
      },
    }, committedBodies);
    await this.afterWrite('contract-registered', run.record.jobId);
    if (this.ignoring(run)) return null;

    const findings = [submission.mode === 'access-only'
      ? `the agreement ${contract} establishes access to existing behavior: no obligation and no fake`
      : `the agreement ${contract} is registered; ${consumer.requirement} is open and ${obligation} is owed by ${submission.provider}`];

    const cycle = registration.obligation === null
      ? null
      : await this.checkDependencyGraph(run, item, {
        from: forCapability,
        to: registration.obligation.capability,
        requirement: consumer.requirement,
        workItem: item.id,
      });
    if (cycle === undefined) return null;
    return { findings, ...(cycle === null ? {} : { cycle }) };
  }

  /**
   * One reopening: the contract, obligation and requirement revisions, the
   * binding from each to the work item responsible for it, the follow-up
   * work items of the ones that had completed, and the results that close
   * unfinished assignments of the previous revision, in one transaction.
   *
   * Prior records and prior gate results stay historical. An item that
   * completed stays completed; only the latest requirement revision can
   * satisfy completion.
   */
  private async reopenAgreement(
    run: Run,
    item: WorkItem,
    assignment: IterationAssignment,
    registration: ReturnType<typeof registerContract>,
    subject: {
      readonly contract: string;
      readonly revision: number;
      readonly obligation: string | null;
      readonly previousRevision: number;
      readonly records: ReturnType<typeof committedRecords>;
      readonly bindings: ReadonlyMap<string, string>;
      readonly cause: string;
    },
  ): Promise<{ readonly findings: string[] } | null> {
    const { records, bindings } = subject;
    // The item responsible for each subject before this transaction. A
    // subject has one at a time, whatever revision it was bound at.
    const previous = new Map<string, string>();
    if (registration.obligation !== null) {
      const held = providerItemOf(records.workItems, registration.obligation.id, subject.previousRevision, bindings);
      if (held !== undefined) previous.set(registration.obligation.id, held.id);
    }
    for (const requirement of records.requirements.values()) {
      if (contractOfObligation(requirement.obligation) !== subject.contract) continue;
      previous.set(requirement.id, bindings.get(bindingKey(requirement.id, requirement.revision)) ?? requirement.workItem);
    }
    for (const requirement of registration.requirements) {
      if (previous.has(requirement.id)) continue;
      // A consumer attaching at this revision brings its own work item.
      previous.set(requirement.id, item.id);
    }

    const reopening = reopenEvidence({
      obligation: registration.obligation,
      requirements: registration.requirements,
      requestedBy: item.id,
      previous,
      completed: new Set(run.log.all('work-item-completed').map(event => event.data.workItem)),
      items: new Map(records.workItems.map(entry => [entry.id, entry])),
      workItemCount: records.workItems.length,
      // The iteration that established this revision is not superseded by
      // it; every other assignment that never closed is.
      unfinishedAssignments: [...records.assignments.values()]
        .filter(candidate => candidate.id !== assignment.id && !records.results.has(candidate.id)),
    });

    await this.write(run, {
      type: 'evidence-reopened',
      data: {
        cause: subject.cause,
        contract: subject.contract,
        revision: subject.revision,
        iteration: assignment.id,
        obligation: subject.obligation,
        requirements: registration.requirements.map(requirement => requirement.id),
        bindings: reopening.bindings.map(binding => ({ subject: binding.subject, workItem: binding.workItem })),
        followUps: reopening.followUps.flatMap(followUp => (followUp.follows === undefined
          ? []
          : [{ workItem: followUp.id, follows: followUp.follows }])),
        superseded: reopening.superseded.map(result => result.iteration),
      },
    }, [...registration.records, ...reopening.records]);
    await this.afterWrite('evidence-reopened', run.record.jobId);
    if (this.ignoring(run)) return null;

    const findings: string[] = [];
    for (const binding of reopening.bindings) {
      const followUp = reopening.followUps.find(entry => entry.id === binding.workItem);
      findings.push(followUp === undefined
        ? `${binding.subject.id} at revision ${binding.subject.revision} stays with ${binding.workItem}, which has not finished`
        : `${binding.subject.id} at revision ${binding.subject.revision} goes to ${followUp.id}, which follows ${followUp.follows ?? 'nothing'}`);
    }
    for (const result of reopening.superseded) findings.push(`${result.iteration} closed as superseded: it was assigned under the previous revision`);
    return { findings };
  }

  /**
   * The dependency graph, checked when a requirement is committed. Its nodes
   * are capabilities: a cycle of modules is not a cycle, and a cycle of
   * changes is not one either. `undefined` says the run has ended.
   */
  private async checkDependencyGraph(run: Run, item: WorkItem, added: DependencyEdge): Promise<DependencyCycle | null | undefined> {
    const records = committedRecords(run.log.ledger.replay());
    const edges: DependencyEdge[] = [];
    for (const requirement of records.requirements.values()) {
      if (requirement.id === added.requirement) continue;
      const obligation = records.obligations.get(requirement.obligation);
      if (obligation === undefined) continue;
      edges.push({ from: requirement.forCapability, to: obligation.capability, requirement: requirement.id, workItem: requirement.workItem });
    }
    const cycle = cycleClosedBy(edges, added);
    if (cycle === null) return null;

    const identity = cycleIdentity(cycle);
    const detection = run.log.all('dependency-cycle-detected')
      .filter(event => event.data.members.join(' → ') === identity).length + 1;
    await this.write(run, {
      type: 'dependency-cycle-detected',
      data: {
        members: [...cycle.members],
        requirements: [...cycle.requirements],
        workItems: [...cycle.workItems],
        closedBy: item.id,
        detection,
      },
    });
    await this.afterWrite('dependency-cycle-detected', run.record.jobId);
    if (this.ignoring(run)) return undefined;

    const replans = run.record.policy.limits.cycleReplansPerWorkItem;
    if (detection > replans) {
      await this.fail(run, 'dependency-cycle',
        `The capability cycle ${identity} was detected ${detection} times, and the policy allows ${replans} re-plan${replans === 1 ? '' : 's'} of it`,
        cycle.requirements.map(requirement => contractsLayout.requirement(requirement, 1)));
      return undefined;
    }
    return cycle;
  }

  /**
   * What one accepted iteration discharges. A provider that ran the agreed
   * conformance suite against the real implementation has conformed; a
   * verification that replaced every fake injection closes its requirement.
   * Neither is the gate's verdict alone: `requirement-verified` also requires
   * that no named location still reaches the fake.
   */
  private async dischargeEvidence(
    run: Run,
    item: WorkItem,
    assignment: IterationAssignment,
    gate: string,
    result: IterationResult,
  ): Promise<boolean> {
    void result;
    const records = committedRecords(run.log.ledger.replay());
    const conformed = new Set(run.log.all('provider-conformed').map(event => conformanceKey(event.data.obligation, event.data.revision)));

    for (const evidence of assignment.evidenceObligations) {
      if (evidence.obligation === undefined || evidence.against !== 'real') continue;
      if (conformed.has(conformanceKey(evidence.obligation.id, evidence.obligation.revision))) continue;
      await this.write(run, {
        type: 'provider-conformed',
        data: { obligation: evidence.obligation.id, revision: evidence.obligation.revision, workItem: item.id, iteration: assignment.id, gate },
      });
      await this.afterWrite('provider-conformed', run.record.jobId);
      if (this.ignoring(run)) return false;
    }

    const verified = this.verifiedRequirements(run);
    let closed = false;
    for (const evidence of assignment.evidenceObligations) {
      if (evidence.requirement === undefined) continue;
      if (verified.has(verificationKey(evidence.requirement.id, evidence.requirement.revision))) continue;
      const requirement = records.requirements.get(evidence.requirement.id);
      if (requirement === undefined) continue;
      const contract = [...records.contracts.values()].find(candidate => obligationId(candidate.id) === requirement.obligation);
      if (contract === undefined) continue;
      const sites: Array<{ path: string; text: string }> = [];
      for (const path of requirement.evidence.fakeInjections) {
        const text = await readFile(join(this.projectRoot, path), 'utf8').catch(() => null);
        if (text !== null) sites.push({ path, text });
      }
      const remaining = remainingInjections(contract, sites);
      if (remaining.length > 0) {
        // The gate passed, and the delegation is not closed: passing against
        // a fake is never completion. The architect is told at its next turn.
        this.warn(`Run ${run.record.jobId}: ${requirement.id} is not verified; the fake is still reached at ${remaining.map(entry => `${entry.path} (${entry.reference})`).join(', ')}`);
        continue;
      }
      await this.write(run, {
        type: 'requirement-verified',
        data: { requirement: requirement.id, revision: requirement.revision, workItem: requirement.workItem, iteration: assignment.id, gate },
      });
      await this.afterWrite('requirement-verified', run.record.jobId);
      if (this.ignoring(run)) return false;
      closed = true;
    }
    // The last open requirement is verified and no conformance is owed: a
    // bound scenario of this work item would now run without fakes, so it
    // is due, and the next commit removes its pending tag.
    if (closed && !this.holdsFakes(run, item)) {
      for (const scenario of this.unfinishedScenarios(run, item, ['bound'])) {
        await this.write(run, { type: 'scenario-due', data: { scenario: scenario.id, cause: 'requirements-verified' } });
        if (this.ignoring(run)) return false;
      }
    }
    return true;
  }

  /**
   * The iteration's gate: the tests its scope owns, resolved anew from the
   * current tree, the project's type check and a complete Ramify check. Once
   * verified, the attempt's tree is committed before either passing or
   * failing audit evidence is produced.
   */
  private async iterationGate(
    run: Run,
    item: WorkItem,
    assignment: IterationAssignment,
    invocation: string,
    repairRound: number,
    infrastructureAttempt: number,
    summary: string,
  ): Promise<GateAttempt | null> {
    run.writer.requireSettled(`The ${assignment.id} gate cannot run`);
    const gateId = gateAttemptId(this.gateCount(run) + 1);
    // A breaking iteration is judged at an all-project boundary: the
    // project's own runner selects, and the assignment's own modules run
    // beside it as the probe that tells a failure inside this iteration's
    // scope from one outside it.
    const allProject = assignment.gate.tests.policy === 'all-project';
    const tests = allProject ? undefined : await this.resolveTests(run, assignment);
    const probe = allProject ? await this.resolveProbe(run, assignment) : undefined;
    await this.recordRunnerGaps(run, invocation);

    const modules = await this.pendingModules(run, assignment.id);
    const attempt = await this.committingCheckpoint(run, {
      id: gateId,
      runId: run.record.jobId,
      checkpoint: assignment.gate.checkpoint,
      projectRoot: this.projectRoot,
      directory: run.path(runLayout.gateOutput(gateId)),
      head: await this.git.currentHead(this.projectRoot),
      policy: run.record.policy,
      proposedBy: invocation,
      repairRound,
      infrastructureAttempt,
      subject: { workItem: item.id, iteration: assignment.id },
      ...(tests === undefined ? {} : { tests }),
      ...(probe === undefined || probe.selection.resolved.length === 0 ? {} : { scopeProbe: probe }),
      guarded: this.guardedAtGate(run, assignment.guarded),
      writeScope: writeScopePaths(this.projectRoot, assignment),
      authorizations: assignment.authorizations.map(entry => ({ path: entry.path, by: entry.by })),
    }, summary, modules, assignment.goal);

    if (attempt.verdict !== 'passed') {
      return this.ignoring(run) ? null : attempt;
    }
    await this.afterWrite('gate-committed', run.record.jobId);
    if (this.ignoring(run)) return null;
    if (!await this.recordScenarioPasses(run, attempt)) return null;
    return attempt;
  }

  /** Resolves the assignment's captured policy against the tree as it stands now. */
  private async resolveTests(run: Run, assignment: IterationAssignment) {
    const index = await this.refreshIndex(run);
    return resolveTestSelection({ projectRoot: this.projectRoot, index, policy: assignment.gate.tests });
  }

  /** The assignment's own modules, resolved anew, as an all-project checkpoint's probe. */
  private async resolveProbe(run: Run, assignment: IterationAssignment) {
    const index = await this.refreshIndex(run);
    return resolveTestSelection({
      projectRoot: this.projectRoot,
      index,
      policy: scopeProbePolicyOf(assignment.scope.base),
    });
  }

  /**
   * Suites of the project the MVP's one supported runner does not select.
   * They are a coverage gap on every attempt, never an absence of tests, and
   * they are read from the project's own manifest. A Cucumber script is none
   * once the captured configuration names the acceptance modes, which run
   * the project's scenarios in the harness's own profile.
   */
  private async recordRunnerGaps(run: Run, invocation: string): Promise<void> {
    const manifest = await readJson(join(this.projectRoot, 'package.json')) as { scripts?: Record<string, unknown> } | null;
    const declared = manifest?.scripts ?? {};
    const acceptance = 'config' in run.record.projectConfig;
    const scripts = Object.keys(declared)
      .filter(name => name.startsWith('test:'))
      .filter(name => !(acceptance && typeof declared[name] === 'string' && /\bcucumber-js\b/u.test(declared[name])))
      .sort();
    if (scripts.length === 0) return;
    const observations = await ObservationLog.open(run.path(runLayout.observations(invocation)));
    for (const script of scripts) {
      await observations.record({
        type: 'coverage-gap',
        data: { kind: 'unsupported-runner', detail: `the project's "${script}" script is outside the one runner this MVP selects` },
      });
    }
  }

  /**
   * The module declarations the commit about to be made adds or removes,
   * read from the working directory rather than from what an agent said.
   */
  private async pendingModules(run: Run, iteration: string): Promise<ModuleNotice[]> {
    let entries: Array<{ status: string; path: string }>;
    try {
      entries = await this.git.changedEntries(this.projectRoot, this.accepted(run));
    } catch (error) {
      this.warn(`Run ${run.record.jobId}: the pending module declarations could not be read: ${message(error)}`);
      return [];
    }
    const proposals = this.proposedBy(run);
    const notices: ModuleNotice[] = [];
    for (const entry of entries) {
      if (entry.path !== 'module.ramify' && !entry.path.endsWith('/module.ramify')) continue;
      const removed = entry.status.includes('D');
      notices.push(moduleNoticeSchema.parse({
        kind: removed ? 'module-removed' : 'module-created',
        module: moduleNameOf(run.index, entry.path),
        declaration: entry.path,
        commit: 'pending',
        iteration,
        decision: proposals.get(directoryOfDeclaration(entry.path)) ?? null,
      } satisfies ModuleNotice));
    }
    return notices;
  }

  /**
   * The decision that proposed each directory a module may be created at,
   * read from the registry the run committed. An entry assignment proposed
   * its own owner and names no decision, which is what `null` says.
   */
  private proposedBy(run: Run): Map<string, RecordRef | null> {
    const records = committedRecords(run.log.ledger.replay());
    const proposals = new Map<string, RecordRef | null>();
    for (const entry of records.registry) {
      if (entry.proposed === undefined) continue;
      const decision = entry.decision === null ? undefined : records.decisions.get(entry.decision);
      proposals.set(entry.proposed.directory, decision === undefined ? null : refOf(decision.id, 1, decision));
    }
    return proposals;
  }

  /**
   * The same notices, read between the preceding accepted boundary and the
   * passing attempt's audited revision. A failed attempt may have committed
   * the declaration first; acceptance, not that intermediate commit, emits
   * the notice.
   */
  private async committedModules(run: Run, commit: string | null, iteration: string, gate: string | null): Promise<ModuleNotice[]> {
    if (commit === null || gate === null) return [];
    let changes: Array<{ status: string; path: string }>;
    try {
      changes = await this.git.diffNameStatus(this.projectRoot, this.acceptedBefore(run, gate), commit);
    } catch (error) {
      this.warn(`Run ${run.record.jobId}: the commit's module declarations could not be read: ${message(error)}`);
      return [];
    }
    const proposals = this.proposedBy(run);
    const notices: ModuleNotice[] = [];
    for (const change of changes) {
      if (change.path !== 'module.ramify' && !change.path.endsWith('/module.ramify')) continue;
      if (change.status !== 'A' && change.status !== 'D') continue;
      notices.push(moduleNoticeSchema.parse({
        kind: change.status === 'A' ? 'module-created' : 'module-removed',
        module: moduleNameOf(run.index, change.path),
        declaration: change.path,
        commit,
        iteration,
        decision: proposals.get(directoryOfDeclaration(change.path)) ?? null,
      } satisfies ModuleNotice));
    }
    return notices;
  }

  /** The accepted source boundary immediately before this gate's event. */
  private acceptedBefore(run: Run, gate: string): string {
    const entries = run.log.ledger.replay();
    const index = entries.findIndex(entry => {
      const event = entry.transaction.event;
      return event.type === 'gate-attempted' && event.data.gate === gate;
    });
    if (index < 0) throw new Error(`Gate ${gate} is not committed in run ${run.record.jobId}`);
    return acceptedCommit(entries.slice(0, index), run.base);
  }

  /** Commits the `IterationResult` and closes the iteration. It is the last write of that iteration. */
  private async closeIteration(
    run: Run,
    item: WorkItem,
    number: number,
    assignment: IterationAssignment,
    body: {
      readonly outcome: IterationResult['outcome'];
      readonly invocations: readonly string[];
      readonly findings: readonly string[];
      readonly gate: string | null;
      readonly commit: string | null;
      readonly recommendation?: string | undefined;
    },
  ): Promise<IterationResult> {
    // The notices are read from the commit itself, never from an agent's
    // words, so a run that repeats the effect derives the same ones.
    const notices = await this.committedModules(run, body.commit, assignment.id, body.gate);
    const result = iterationResultSchema.parse({
      schema: 'ramify-agent.iteration-result/1',
      iteration: assignment.id,
      outcome: body.outcome,
      invocations: [...body.invocations],
      gate: body.gate,
      commit: body.commit,
      findings: [...body.findings],
      changedAssumptions: [],
      ...(body.recommendation === undefined ? {} : { recommendation: body.recommendation }),
      artifacts: [],
    } satisfies IterationResult);

    const data = { workItem: item.id, iteration: assignment.id, outcome: result.outcome, gate: result.gate, commit: result.commit, notices };
    const record = { path: iterationLayout.result(item.id, number), id: assignment.id, revision: 1, body: result };
    const corrects = run.log.all('iteration-assigned').find(event => event.data.iteration === assignment.id)?.data.corrects;
    if (result.outcome === 'accepted' && result.gate !== null && result.commit !== null && corrects !== undefined) {
      await this.closeCorrection(run, item.id, { data, record, corrects, gate: result.gate, commit: result.commit, invocation: body.invocations.at(-1) ?? null });
    } else {
      await this.write(run, { type: 'iteration-closed', data }, [record]);
    }
    await this.afterWrite('iteration-closed', run.record.jobId);
    return result;
  }

  /**
   * Closes an accepted correction iteration with the repair claim of each
   * CheckFinding still planned under the reconciliation intent it resolves,
   * on the same line: the claim names the audited tree and the iteration,
   * and each CheckFinding stays open until its verification rule is met.
   * A claim the transition refuses leaves the iteration closed without it.
   */
  private async closeCorrection(
    run: Run,
    workItem: string,
    closing: {
      readonly data: Omit<RunEventOf<'iteration-closed'>['data'], 'checkFindings'>;
      readonly record: CommitRecord;
      readonly corrects: string;
      readonly gate: string;
      readonly commit: string;
      readonly invocation: string | null;
    },
  ): Promise<void> {
    let tree: string | undefined;
    try {
      tree = await this.candidates.commitTree(this.projectRoot, closing.commit);
    } catch (error) {
      this.warn(`Run ${run.record.jobId}: the tree of ${closing.commit} could not be read, so ${closing.data.iteration} claims no repair: ${message(error)}`);
    }
    if (tree !== undefined) {
      const candidate = { kind: 'tree' as const, id: tree };
      const committed = await this.commitCheckFindings(run, ({ state }) => ({
        commands: [...state.findings.values()]
          .filter(entry => entry.standing === 'open' && entry.reason === 'repair-planned' && entry.pendingUserDecision === null
            && entry.repair?.kind === 'intent' && entry.repair.ref === closing.corrects && sameWorkItem(entry.owner, workItem))
          .map(entry => ({
            type: 'dispose' as const,
            checkFinding: entry.id,
            expectedRevision: entry.revision,
            decision: {
              actor: { kind: 'agent' as const, role: 'engineer', invocation: closing.invocation ?? 'none' },
              source: candidate,
              rationale: `The correction ${closing.data.iteration} of ${closing.corrects} closed accepted at gate ${closing.gate}, on the audited commit ${closing.commit}`,
              evidence: [{ kind: 'gate-attempt', ref: runLayout.gate(closing.gate), hash: null }],
              communication: { mode: 'quiet' as const },
              decision: { action: 'claim-repair' as const, candidate, change: closing.data.iteration },
            },
          })),
        compose: decided => ({
          event: { type: 'iteration-closed', data: { ...closing.data, ...(decided.events.length === 0 ? {} : { checkFindings: [...decided.events] }) } },
          records: [closing.record],
        }),
      }));
      if (committed.kind !== 'refused' || committed.refusal.reason === 'run-ended') return;
      this.warn(`Run ${run.record.jobId}: the repair claims of ${closing.data.iteration} were refused, so it closes without them: ${committed.refusal.message}`);
    }
    await this.write(run, { type: 'iteration-closed', data: closing.data }, [closing.record]);
  }

  /** Captures one writer invocation's line events from the two snapshots around it. */
  private async recordLineEvents(
    run: Run,
    invocation: string,
    before: LineSnapshot,
    after: LineSnapshot,
    gaps: readonly string[] = [],
  ): Promise<void> {
    // An invocation the run's bounds refused was never started, and has no line events.
    if (invocation === '') return;
    const summary = lineEvents({ invocation, before, after, index: run.index, gaps });
    await writeFileAtomic(run.path(runLayout.lineEvents(invocation)), `${JSON.stringify(summary, null, 2)}\n`);
  }

  /** The API views of the modules one iteration writes, for the engineer's briefing. */
  private async iterationViews(run: Run, assignment: IterationAssignment): Promise<IterationApiViews[]> {
    const base = assignment.scope.base;
    const modules = 'module' in base ? [base.module, ...base.includedChildren] : [...base.modules];
    return iterationApiViews(this.options.ramify, this.projectRoot, run.index, modules);
  }

  /**
   * How many times this iteration has returned at its context budget,
   * counted over committed history: the counter is keyed by the work, so a
   * fresh session does not reset it and neither does a repair round.
   */
  private budgetReturns(run: Run, iteration: string): number {
    const records = committedRecords(run.log.ledger.replay());
    return run.log.all('invocation-ended')
      .filter(event => event.data.ended === 'context-budget-reached')
      .filter(event => records.invocations.get(event.data.invocation)?.work.iteration === iteration)
      .length;
  }

  /** How many sessions of this work item were reconstructed, counted over committed history. */
  private reconstructions(run: Run, workItem: string): number {
    const records = committedRecords(run.log.ledger.replay());
    return [...records.invocations.values()]
      .filter(invocation => invocation.work.workItem === workItem && invocation.session.requested !== invocation.session.actual)
      .length;
  }

  /**
   * The work item's gate: all project tests, the type check and a complete
   * Ramify check, with the last assignment's own selection beside them as
   * the probe that tells a failure inside that scope from one outside it.
   */
  private async workItemGate(
    run: Run,
    item: WorkItem,
    invocation: string,
    repairRound: number,
    summary: string,
    lastAssignment: IterationAssignment | undefined,
  ): Promise<GateAttempt | null> {
    run.writer.requireSettled(`The ${item.id} gate cannot run`);
    const gateId = gateAttemptId(this.gateCount(run) + 1);
    const probe = lastAssignment === undefined ? undefined : await this.resolveTests(run, lastAssignment);
    const attempt = await this.committingCheckpoint(run, {
      id: gateId,
      runId: run.record.jobId,
      checkpoint: 'work-item',
      projectRoot: this.projectRoot,
      directory: run.path(runLayout.gateOutput(gateId)),
      head: await this.git.currentHead(this.projectRoot),
      policy: run.record.policy,
      proposedBy: invocation,
      repairRound,
      subject: { workItem: item.id },
      ...(probe === undefined || probe.selection.resolved.length === 0 ? {} : { scopeProbe: probe }),
      ...(lastAssignment === undefined ? {} : { writeScope: writeScopePaths(this.projectRoot, lastAssignment) }),
    }, summary);
    const subject = attempt;

    if (subject.verdict !== 'passed') {
      return this.ignoring(run) ? null : subject;
    }
    await this.afterWrite('gate-committed', run.record.jobId);
    if (this.ignoring(run)) return null;
    // Every declared scenario it ran untagged and passed is implemented.
    if (!await this.recordScenarioPasses(run, subject)) return null;
    return subject;
  }

  /**
   * What the harness observed when one invocation's session ended: the
   * session idle, and every process group it registered killed and gone.
   * Neither `stop()` resolving nor the agent's word is evidence.
   */
  private async settleSession(run: Run, id: string, session: AgentSession, reader = false) {
    if (run.writer.held === id) {
      const released = await run.writer.release(id, session);
      // The release is in the log before anything else may write or check:
      // an unconfirmed one blocks every writer and every gate that follows.
      await this.write(run, {
        type: 'writer-released',
        data: { invocation: id, confirmed: released.confirmed, groupsKilled: released.groupsKilled },
      });
      await this.afterWrite('writer-released', run.record.jobId);
      return released;
    }
    const idle = await session.settled().catch(() => 'timed-out' as const);
    const settled = { confirmed: idle === 'settled', at: this.now().toISOString(), groupsKilled: 0, lateWrites: [] as string[] };
    // A reader was given no tool that writes or starts a process, so its
    // session not becoming idle leaves the tree as the writer's settlement
    // found it; it is recorded on its outcome and blocks no writer. Its
    // session stays the run's to stop at a stop or a shutdown.
    if (!settled.confirmed && !reader) {
      run.writer.markUnsettled(id, 'its session did not become idle within the implementation\'s bound');
    }
    return settled;
  }

  /**
   * Closes one invocation: the outcome record and the event, in one
   * transition, with whether the harness keeps its session.
   */
  private async endInvocation(
    run: Run,
    id: string,
    session: SessionId,
    keeping: SessionKeeping,
    body: Omit<InvocationOutcome, 'schema' | 'invocation'>,
    degraded?: DegradeRelation,
    transcript?: InvocationTranscript,
  ): Promise<void> {
    if (run.log.all('invocation-ended').some(event => event.data.invocation === id)) return;
    const outcome = invocationOutcomeSchema.parse({ schema: 'ramify-agent.invocation-outcome/1', invocation: id, ...body });
    const ended = {
      invocation: id, ended: outcome.ended, submission: outcome.submission?.hash ?? null, session,
      ...(degraded === undefined ? {} : { degraded }),
    };
    const written = await this.write(run, {
      type: 'invocation-ended',
      data: keeping.kept ? { ...ended, kept: true } : { ...ended, kept: false, finished: keeping.finished },
    }, [
      { path: runLayout.outcome(id), id, revision: 1, body: outcome },
    ]);
    // The transcript's end follows the log's, so the point it names is one
    // the log has; recovery ends an interrupted invocation's transcript too.
    if (written !== 'ended') {
      await (transcript ?? this.invocationTranscript(run, session, id)).end({
        ended: outcome.ended,
        interruption: outcome.interruption ?? null,
        error: outcome.error ?? null,
        actual: outcome.session === undefined ? null : {
          mode: outcome.session.mode === 'continued' ? 'continue' : outcome.session.mode,
          degradedReason: outcome.session.degradedReason ?? null,
        },
      });
    }
    await this.afterWrite('invocation-ended', run.record.jobId);
  }

  /**
   * Readiness, with its bounded recovery. A failure a preparation can repair
   * consumes one recovery and the next attempt runs; one it cannot consumes
   * none and ends the run at once with the step that failed.
   */
  private async reachReadiness(run: Run): Promise<boolean> {
    if (run.log.find('readiness-passed')) return true;
    const bound = run.record.policy.limits.readinessRecoveries;

    for (;;) {
      if (this.ignoring(run)) return false;
      run.writer.requireSettled('Readiness cannot run');

      const attemptNumber = run.log.count('readiness-passed') + run.log.count('readiness-failed') + 1;
      const gateId = gateAttemptId(this.gateCount(run) + 1);
      // Readiness runs on the branch the project is on. The run branch is
      // created only once a clean repository has been established.
      const head = await this.git.currentHead(this.projectRoot);
      await this.write(run, { type: 'gate-started', data: { gate: gateId, checkpoint: 'readiness' } });
      const result = await runReadiness(this.options.readinessExecution ?? inPlaceCheckExecution, {
        attempt: attemptNumber,
        projectRoot: this.projectRoot,
        gateDirectory: run.path(runLayout.gateOutput(gateId)),
        gateId,
        policy: run.record.policy,
        projectConfig: run.record.projectConfig,
        index: run.index,
        ramify: this.options.ramify,
        git: this.git,
        head,
      });

      if (result.attempt.verdict === 'passed' && result.gate !== null) {
        await this.createBranch(run);
        await this.write(run, { type: 'readiness-passed', data: { attempt: attemptNumber, gate: gateId } }, [
          { path: runLayout.gate(gateId), id: gateId, revision: 1, body: result.gate },
          { path: runLayout.readiness(attemptNumber), id: String(attemptNumber), revision: 1, body: result.attempt },
        ]);
        await this.afterWrite('readiness-attempted', run.record.jobId);
        return true;
      }

      const step = failingStep(result.attempt);
      const plan = recoveryFor(result.attempt, result.gate, run.record.policy);
      const spent = run.log.all('readiness-failed').filter(event => event.data.recovery !== null).length;
      const recoverable = plan !== null && spent < bound;

      let recovery = null;
      if (recoverable) {
        recovery = await performRecovery({
          id: recoveryId(spent + 1),
          attempt: attemptNumber,
          plan,
          projectRoot: this.projectRoot,
          policy: run.record.policy,
          ramify: this.options.ramify,
          commandExecution: this.options.commandExecution,
          count: spent + 1,
          directory: run.path('recoveries'),
        });
      }

      const attempt = withRecovery(result.attempt, recovery?.id ?? null);
      const records = [
        ...(result.gate === null ? [] : [{ path: runLayout.gate(gateId), id: gateId, revision: 1, body: result.gate }]),
        { path: runLayout.readiness(attemptNumber), id: String(attemptNumber), revision: 1, body: attempt },
        ...(recovery === null ? [] : [{ path: runLayout.recovery(recovery.id), id: recovery.id, revision: 1, body: recovery }]),
      ];
      const final = recovery === null || recovery.outcome === 'failed';
      await this.write(run, {
        type: 'readiness-failed',
        data: { attempt: attemptNumber, gate: gateId, step: step?.step ?? 'unknown', detail: step?.detail ?? '', recovery: recovery?.id ?? null, final },
      }, records);
      await this.afterWrite('readiness-attempted', run.record.jobId);

      if (final) {
        await this.fail(run, readinessFailureReason(step?.step), `Readiness failed at ${step?.step ?? 'an unknown step'} after ${attemptNumber} attempt${attemptNumber === 1 ? '' : 's'}: ${step?.detail ?? ''}`,
          [runLayout.readiness(attemptNumber), ...(result.gate === null ? [] : [runLayout.gate(gateId)])]);
        return false;
      }
    }
  }

  /**
   * The final gate: all project tests, the type check and a complete Ramify
   * check, on the current tree. `job-completed` requires a passing attempt;
   * an empty work queue alone never satisfies it.
   */
  private async finalGate(run: Run): Promise<void> {
    run.writer.requireSettled('The final gate cannot run');
    // The final gate waits for every latest requirement revision. A
    // capability still held by a fake is not implemented, whatever the
    // project's tests say about it.
    const records = committedRecords(run.log.ledger.replay());
    const verified = this.verifiedRequirements(run);
    const open = [...records.requirements.values()]
      .filter(requirement => !verified.has(verificationKey(requirement.id, requirement.revision)));
    if (open.length > 0) {
      await this.fail(run, 'unresolvable-requirement',
        `The run cannot complete: ${open.map(requirement => `${requirement.id} of ${requirement.consumer} is still held by its fake`).join('; ')}`,
        open.map(requirement => contractsLayout.requirement(requirement.id, requirement.revision)));
      return;
    }
    // The consistency rule acceptance-incomplete: every tracked scenario is
    // implemented before the final run. Once every work item has completed
    // it cannot fail; when it does, the run fails with the scenarios as
    // evidence rather than returning anywhere.
    const tracked = trackedScenarios(run.log.ledger.replay());
    const incomplete = incompleteScenarios(tracked);
    if (incomplete.length > 0) {
      await this.fail(run, 'acceptance-incomplete',
        `The final gate cannot run: ${incomplete.map(scenario => `${scenario.id} ${scenario.entry === null ? '(integration)' : `of ${scenario.entry}`} is ${scenario.state}`).join('; ')}`,
        incomplete.map(scenario => scenario.evidence));
      return;
    }
    // Every tracked scenario, integration scenarios included.
    const required = tracked.records;
    const gateId = gateAttemptId(this.gateCount(run) + 1);
    const head = await this.git.currentHead(this.projectRoot);
    const attempt = await this.committingCheckpoint(run, {
      id: gateId,
      runId: run.record.jobId,
      checkpoint: 'final',
      projectRoot: this.projectRoot,
      directory: run.path(runLayout.gateOutput(gateId)),
      head,
      policy: run.record.policy,
      proposedBy: null,
    });

    if (attempt.verdict !== 'passed') {
      await this.fail(run, attempt.verdict === 'not-verified' ? 'recovery-exhausted' : 'repair-exhausted',
        `The final gate did not pass: ${attempt.verdict}${attempt.cause === null ? '' : ` (${attempt.cause})`}`, [runLayout.gate(gateId)]);
      return;
    }

    await this.afterWrite('gate-committed', run.record.jobId);
    if (this.ignoring(run)) return;
    // The final attempt's scenario check ran every tracked scenario in full
    // mode and passed each one; a pass that did not run one proves nothing
    // about it.
    const unproven = finalScenarioGaps(attempt, required.map(record => record.id));
    if (unproven !== null) {
      await this.fail(run, 'acceptance-incomplete', `The final gate passed, and its scenario check does not prove the plan's scenarios: ${unproven}`, [runLayout.gate(gateId)]);
      return;
    }
    const workItems = run.log.count('work-item-completed');
    await this.endRun(run, { type: 'job-completed', data: { gate: gateId, commit: attempt.audited, workItems } });
    await this.afterWrite('job-completed', run.record.jobId);
  }

  /** Verify before effects, then commit and audit before writing the complete attempt once. */
  private async committingCheckpoint(
    run: Run,
    request: CheckpointRequest,
    summary?: string,
    modules?: readonly ModuleNotice[],
    goal?: string,
  ): Promise<GateAttempt> {
    const scenarios = await this.scenarioInputs(run);
    const prepared = await prepareCheckpoint(scenarios === undefined ? request : { ...request, scenarios });
    if ('schema' in prepared) {
      await this.write(run, {
        type: 'gate-attempted',
        data: { gate: prepared.id, checkpoint: prepared.checkpoint, verdict: prepared.verdict, next: prepared.next },
      }, [{ path: runLayout.gate(prepared.id), id: prepared.id, revision: 1, body: prepared }]);
      await this.afterWrite('gate-committed', run.record.jobId);
      return prepared;
    }
    return this.commitGate(run, prepared, summary, modules, goal);
  }

  /**
   * The commit-and-audit external effect. Its intent holds the verified
   * operation, not a partial attempt. Recovery finds the commit by its run
   * and gate trailers and re-audits it; completion writes the immutable
   * attempt exactly once.
   *
   * The run mutex is held while the intent is appended and again while the
   * completion is, and not while the commit and audit run: a reader's
   * result arriving during a slow audit is committed at once instead of
   * waiting for it. Nothing a reader commits is part of what the gate
   * verified or decides, the driver is the only writer of gates and
   * iterations, and a terminal event waits for the effect (`endRun`), so the
   * attempt and its verdict are exactly what holding the mutex throughout
   * produced.
   */
  private async commitGate(
    run: Run,
    prepared: PreparedGate,
    summary?: string,
    modules?: readonly ModuleNotice[],
    goal?: string,
    recordedMessage?: string,
  ): Promise<GateAttempt> {
    const identity = prepared.request;
    // A reader contributed nothing to the source this commit holds.
    const invocations = run.log.all('invocation-started').filter(event => event.data.role !== 'reviewer').map(event => event.data.invocation);
    const message = recordedMessage ?? commitMessage({
      runId: run.record.jobId, planId: run.record.planId,
      gate: {
        id: identity.id, checkpoint: prepared.checkpoint, subject: identity.subject ?? {},
        repairRound: identity.repairRound ?? 0,
      },
      invocations,
      ...(goal === undefined ? {} : { goal }),
      ...(summary === undefined ? {} : { summary }),
      ...(modules === undefined || modules.length === 0 ? {} : { modules }),
      ...(earlierAttempts(run, identity.id, identity.subject ?? {}).length === 0 ? {} : { earlier: earlierAttempts(run, identity.id, identity.subject ?? {}) }),
    });
    const operation = gateOperation(prepared, message);
    const effect = run.log.ledger.effect<{ readonly attempt: GateAttempt; readonly findings: ScenarioGateFindings }>({
      key: `gate-commit:${identity.id}`,
      serialize: work => run.mutex.run(work),
      intent: () => ({
        event: run.log.next({ type: 'gate-committing', data: { gate: identity.id, checkpoint: prepared.checkpoint } }),
        records: [{ path: runLayout.gateOperation(identity.id), id: identity.id, revision: 1, body: operation }],
      }),
      perform: async () => {
        await this.afterWrite('gate-attempted', run.record.jobId);
        // The feature files go into the gate's commit as the states now
        // render them; the guarded comparison before this effect judged the
        // tree against the rendering the assignment captured.
        await this.rerenderScenarios(run);
        const commit = await commitForGate(this.projectRoot, run.record.jobId, identity.id, message, undefined, this.git);
        await this.afterWrite('gate-committing', run.record.jobId);
        const sourceCommit = commit ?? identity.head;
        const attempt = await executePreparedGate(this.options.checkExecution, prepared, sourceCommit, commit);
        if (attempt.audited !== null && attempt.audited !== sourceCommit) {
          throw new Error(`Gate ${attempt.id} audited ${attempt.audited}, expected ${sourceCommit}`);
        }
        if (attempt.evidence !== null && attempt.audited !== sourceCommit) {
          throw new Error(`Gate ${attempt.id} published evidence without the expected audited commit ${sourceCommit}`);
        }
        if (attempt.verdict === 'passed' && (attempt.audited !== sourceCommit || attempt.evidence === null)) {
          throw new Error(`Gate ${attempt.id} passed without published evidence for ${sourceCommit}`);
        }
        // What the scenario check means for the work item's CheckFindings
        // is read here, outside the mutex; the completion decides it.
        return { attempt, findings: await this.scenarioGateFindings(run, attempt) };
      },
      complete: ({ attempt, findings }) => {
        const { auditOverall, ...durableAttempt } = attempt;
        if (auditOverall != null && (attempt.audited === null || attempt.evidence === null)) {
          throw new Error(`Gate ${attempt.id} has an audit outcome without its published commit`);
        }
        return this.gateAttempted(run, attempt, findings, [
          { path: runLayout.gate(attempt.id), id: attempt.id, revision: 1, body: durableAttempt },
          ...(auditOverall == null ? [] : [{ path: runLayout.gateAuditOutcome(attempt.id), id: attempt.id, revision: 1,
            body: { schema: 'ramify-agent.gate-audit-outcome/1', gate: attempt.id, overall: auditOverall, audited: attempt.audited } }]),
        ]);
      },
    });
    run.gating = effect;
    try {
      return (await effect).attempt;
    } finally {
      if (run.gating === effect) run.gating = undefined;
    }
  }

  /**
   * What a committing gate's scenario check means for its work item's
   * CheckFindings, read before its completion takes the mutex (Plan 12
   * iteration 6): the tracked scenarios it observed, every earlier attempt
   * of the work item, and the audited tree of each attempt a promotion or a
   * witness needs. Null when there is nothing to promote or witness, which
   * reads no tree; unavailable when a tree cannot be read, which the
   * completion records and the attempt survives.
   */
  private async scenarioGateFindings(run: Run, attempt: GateAttempt): Promise<ScenarioGateFindings> {
    const workItem = attempt.subject.workItem;
    if (workItem === undefined || attempt.audited === null) return null;
    try {
      const tracked = trackedScenarios(run.log.ledger.replay()).records.map(record => ({ id: record.id, owner: record.owner, file: record.file }));
      const observations = scenarioObservations(attempt, tracked);
      if (observations.length === 0) return null;
      const earlier = run.log.all('gate-attempted').flatMap(event => {
        const body = event.data.gate === attempt.id ? undefined : gateBodyOf(run, event.data.gate);
        return body === undefined || body.subject.workItem !== workItem ? [] : [{ body, observations: scenarioObservations(body, tracked) }];
      });
      const needed = scenarioGatesToRead(checkFindingStateOf(run.log.ledger), workItem, attempt.verdict, observations,
        earlier.map(entry => ({ gate: entry.body.id, observations: entry.observations })));
      if (needed === null) return null;
      const trees = new Map<string, string>();
      const treeOf = async (commit: string): Promise<string> => {
        const known = trees.get(commit);
        if (known !== undefined) return known;
        const tree = await this.candidates.commitTree(this.projectRoot, commit);
        trees.set(commit, tree);
        return tree;
      };
      const observed = async (body: GateAttempt, entries: readonly ScenarioObservation[], read: boolean) => ({
        gate: body.id,
        tree: read && body.audited !== null ? await treeOf(body.audited) : null,
        observations: entries,
        record: runLayout.gate(body.id),
        output: runLayout.gateOutput(body.id),
      });
      const current = await observed(attempt, observations, true);
      return {
        workItem,
        verdict: attempt.verdict,
        changedFiles: attempt.guardedChanges.map(change => change.path),
        current: { ...current, tree: current.tree! },
        earlier: await Promise.all(earlier.map(entry => observed(entry.body, entry.observations, needed.includes(entry.body.id)))),
        tracked,
      };
    } catch (error) {
      return { unavailable: `The audited tree a scenario CheckFinding of gate ${attempt.id} needs could not be read: ${message(error)}` };
    }
  }

  /**
   * The `gate-attempted` line of a committing gate: its attempt and records,
   * and the CheckFinding part its scenario check decides under the mutex.
   * The attempt and its verdict are committed whatever that part does; a
   * part refused as a whole is recorded on the event with its reason, and a
   * scenario left out as a note.
   */
  private gateAttempted(run: Run, attempt: GateAttempt, findings: ScenarioGateFindings, records: CommitRecord[]): Transaction<RunEvent> {
    const data = { gate: attempt.id, checkpoint: attempt.checkpoint, verdict: attempt.verdict, next: attempt.next };
    const plain = (outcome?: GateCheckFindingOutcome): Transaction<RunEvent> => ({
      event: run.log.next({ type: 'gate-attempted', data: { ...data, ...(outcome === undefined ? {} : { scenarioFindings: outcome }) } }),
      records,
    });
    if (findings === null) return plain();
    if ('unavailable' in findings) {
      this.warn(`Run ${run.record.jobId}: ${findings.unavailable}; the gate is committed without its CheckFinding part`);
      return plain({ refused: { reason: 'source-unavailable', message: findings.unavailable }, notes: [] });
    }
    let notes: ScenarioFindingNote[] = [];
    const decided = decideCheckFindingTransaction(run.log, ({ state }) => {
      const plan = planScenarioFindings(state, findings);
      notes = [...plan.notes];
      return {
        commands: plan.commands,
        compose: outcome => ({
          event: {
            type: 'gate-attempted',
            data: {
              ...data,
              ...(outcome.events.length === 0 ? {} : { checkFindings: [...outcome.events] }),
              ...(notes.length === 0 ? {} : { scenarioFindings: { refused: null, notes } }),
            },
          },
          records,
        }),
      };
    });
    if (decided.kind === 'transaction') return decided.transaction;
    if (decided.kind === 'replayed') return plain(notes.length === 0 ? undefined : { refused: null, notes });
    const refusal = `${decided.refusal.reason}: ${decided.refusal.message}`;
    this.warn(`Run ${run.record.jobId}: the CheckFinding part of gate ${attempt.id} was refused (${refusal}); the gate is committed without it`);
    return plain({ refused: { reason: 'transition-refused', message: refusal }, notes });
  }

  /**
   * What a checkpoint's scenario check is planned from: the captured scenario
   * harness, the modules of the current view that have feature files, and
   * every tracked scenario with its owner, file and state as the ledger and
   * the log hold them. A run past readiness has a valid configuration; one
   * without it plans no scenario check.
   */
  private async scenarioInputs(run: Run): Promise<ScenarioCheckInputs | undefined> {
    const captured = run.record.projectConfig;
    if ('invalid' in captured) return undefined;
    const { records, states } = trackedScenarios(run.log.ledger.replay());
    return {
      harness: captured.config.acceptance,
      modules: await scenarioModules(this.projectRoot, run.index),
      scenarios: records.map(record => ({ id: record.id, owner: record.owner, file: record.file, state: states.get(record.id) ?? 'pending' })),
    };
  }

  /** The count of committed gate attempts: every readiness and every checkpoint. */
  private gateCount(run: Run): number {
    return run.log.count('readiness-passed') + run.log.all('readiness-failed').length + run.log.count('gate-attempted');
  }

  /**
   * Creates and checks out `ramify-agent/run-<run-id>`, once readiness has
   * established a clean repository. A run resumed after a crash finds its
   * branch and stays on it; the branch is never reset.
   */
  private async createBranch(run: Run): Promise<void> {
    try {
      await this.git.createRunBranch(this.projectRoot, run.record.jobId);
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      this.warn(`Run ${run.record.jobId}: the run branch could not be created: ${error.message}`);
    }
  }

  /**
   * Writes the tracked feature files onto the run branch and commits them as
   * "Scenarios of <planId>", once readiness has passed and the branch
   * exists, before the first local architect starts. The commit is an
   * external effect of the ledger: `scenarios-materializing` is its intent
   * and `scenarios-materialized` its completion, and a crash between them
   * is recovered by re-rendering and by the commit's trailers. A run without
   * scenarios has no file to write and records nothing.
   */
  private async materializeScenarios(run: Run): Promise<void> {
    if (run.log.find('scenarios-materialized') !== undefined) return;
    if (this.expectedFeatures(run).length === 0) return;
    run.writer.requireSettled('The feature files cannot be written');
    await this.performMaterialization(run, false);
    await this.afterWrite('scenarios-materialized', run.record.jobId);
  }

  /** The materialization effect, from its intent or, on recovery, from the intent the log holds. */
  private async performMaterialization(run: Run, recovering: boolean): Promise<{ commit: string | null; files: string[] }> {
    const expected = this.expectedFeatures(run);
    const files = expected.map(file => file.path);
    return run.mutex.run(() => run.log.ledger.effect<{ commit: string | null; files: string[] }>({
      key: 'scenarios-materialize',
      intent: { event: run.log.next({ type: 'scenarios-materializing', data: { files } }), records: [] },
      perform: async () => {
        await this.afterWrite('scenarios-materializing', run.record.jobId);
        await rerenderFeatureFiles(this.projectRoot, expected);
        const message = materializationMessage({
          planId: run.record.planId, runId: run.record.jobId, files, scenarios: trackedScenarios(run.log.ledger.replay()).records.length,
        });
        const commit = await commitForMaterialization(this.projectRoot, run.record.jobId, message, recovering, this.git);
        await this.afterWrite('scenarios-committed', run.record.jobId);
        return { commit, files };
      },
      complete: result => ({ event: run.log.next({ type: 'scenarios-materialized', data: result }), records: [] }),
    }));
  }

  /** Every tracked feature file's expected content under the states the ledger holds now. */
  private expectedFeatures(run: Run): RenderedFeatureFile[] {
    return expectedFeatureFiles(trackedScenarios(run.log.ledger.replay()), { planId: run.record.planId, runId: run.record.jobId });
  }

  /**
   * Re-renders the tracked feature files once they are materialized: writes
   * those that differ from the states' rendering and reports whether a
   * commit is needed. Before materialization it writes nothing.
   */
  private async rerenderScenarios(run: Run): Promise<FeatureRerendering> {
    if (run.log.find('scenarios-materialized') === undefined) return { files: [], written: [], commitNeeded: false };
    return rerenderFeatureFiles(this.projectRoot, this.expectedFeatures(run));
  }

  /**
   * What an assignment guards of the scenarios: the support files the
   * captured configuration names, and every tracked feature file with the
   * hash of the rendering the harness last wrote, once the files are
   * materialized.
   */
  private async guardedScenarioFiles(run: Run): Promise<GuardedScenarioFiles> {
    const captured = run.record.projectConfig;
    const support = 'invalid' in captured ? [] : await supportFiles(this.projectRoot, captured.config.acceptance.support);
    const expected = run.log.find('scenarios-materialized') === undefined ? [] : expectedFeatureHashes(this.writtenFeatures(run));
    return { support, expected };
  }

  /** Every tracked feature file as the harness last rendered it into the tree. */
  private writtenFeatures(run: Run): RenderedFeatureFile[] {
    return expectedFeatureFiles(writtenScenarios(run.log.ledger.replay()), { planId: run.record.planId, runId: run.record.jobId });
  }

  /**
   * The guarded files a gate compares: what the assignment captured, with
   * each tracked feature file at the hash of the rendering the harness last
   * wrote. A gate's commit in an earlier repair round may have rewritten one
   * since the capture, and only an agent's change is a guarded change.
   */
  private guardedAtGate(run: Run, guarded: IterationAssignment['guarded']): IterationAssignment['guarded'] {
    if (run.log.find('scenarios-materialized') === undefined) return guarded;
    const written = new Map(expectedFeatureHashes(this.writtenFeatures(run)).map(file => [file.path, file.hash]));
    return guarded.map(file => (written.has(file.path) ? { ...file, hash: written.get(file.path)! } : file));
  }

  /** The canonical files the write guard refuses every agent of this run: the configuration and the tracked feature files. */
  private async deniedFiles(run: Run): Promise<string[]> {
    const features = trackedScenarios(run.log.ledger.replay()).records.map(record => record.file);
    return deniedFiles(this.projectRoot, features);
  }

  // Scenario states, architecture §7 to §9

  /** The work item's entry or integration scenario and the run's tracked scenarios, which a declaration is judged against. */
  private declarationContext(run: Run, item: WorkItem): DeclarationContext {
    return {
      entry: 'entry' in item.origin ? item.origin.entry : null,
      integration: integrationScenarioOf(item),
      records: trackedScenarios(run.log.ledger.replay()).records,
    };
  }

  /**
   * Whether the work item still runs against fakes: a requirement it holds
   * is open, or the conformance its obligation owes has not passed.
   */
  private holdsFakes(run: Run, item: WorkItem): boolean {
    const records = committedRecords(run.log.ledger.replay());
    if (this.openRequirementsOf(run, records, item.id).length > 0) return true;
    const owing = this.obligationOwedBy(run, item, records);
    if (owing === null) return false;
    const conformed = new Set(run.log.all('provider-conformed').map(event => conformanceKey(event.data.obligation, event.data.revision)));
    return !conformed.has(conformanceKey(owing.id, owing.revision));
  }

  /**
   * The work item's scenarios in the given states: its entry's, or an
   * integration work item's one scenario. A provider or follow-up work item
   * has none.
   */
  private unfinishedScenarios(run: Run, item: WorkItem, states: readonly ScenarioState[]): Array<{ id: string; state: ScenarioState }> {
    const entry = 'entry' in item.origin ? item.origin.entry : null;
    const integration = integrationScenarioOf(item);
    if (entry === null && integration === null) return [];
    const tracked = trackedScenarios(run.log.ledger.replay());
    return tracked.records
      .filter(record => (integration === null ? record.kind === 'entry' && record.entry === entry : record.id === integration))
      .map(record => ({ id: record.id, state: tracked.states.get(record.id) ?? 'pending' }))
      .filter(scenario => states.includes(scenario.state));
  }

  /**
   * An integration work item's briefing: its scenario, the sub-scenarios,
   * their owners' step files as the tree holds them now, and the scope its
   * engineer must be given. Undefined for every other work item.
   */
  private async integrationOfItem(run: Run, item: WorkItem): Promise<IntegrationBriefing | undefined> {
    const id = integrationScenarioOf(item);
    if (id === null) return undefined;
    const { records } = trackedScenarios(run.log.ledger.replay());
    const record = records.find(candidate => candidate.id === id);
    if (record === undefined) return undefined;
    return integrationBriefing(this.projectRoot, record, records, sub => bridgingGivens(record, sub));
  }

  /**
   * The scenario check an engineer's `run_scope_tests` runs beside its
   * tests: quick mode, the scope's scenarios selected by identity as an
   * iteration gate selects them, and this work item's pending ones too, so
   * the engineer sees the scenarios it binds pass before it declares them.
   * Planned anew on each call; nothing where the run tracks no scenario or
   * has no scenario harness.
   */
  private scopeScenarioCheck(run: Run, item: WorkItem, scope: TestSelectionPolicy): EngineerEquipmentInputs['scenarios'] {
    const { records } = trackedScenarios(run.log.ledger.replay());
    if (records.length === 0) return undefined;
    return {
      names: new Map(records.map(record => [record.id, record.name])),
      plan: async () => {
        const inputs = await this.scenarioInputs(run);
        if (inputs === undefined) return undefined;
        const pending = this.unfinishedScenarios(run, item, ['pending']).map(scenario => scenario.id);
        return planScenarioCheck('iteration', inputs, {
          projectRoot: this.projectRoot,
          scope: { exactOwners: scope.exactOwners, subtrees: scope.subtrees },
          include: pending,
        });
      },
    };
  }

  /**
   * What an engineer is told of its work item's scenarios: its entry's, or
   * an integration work item's one scenario with its sub-scenarios' step
   * files. Undefined for a provider or follow-up work item, whose briefing
   * says nothing about scenarios.
   */
  private async engineerScenarios(run: Run, item: WorkItem): Promise<EngineerScenarios | undefined> {
    const tracked = trackedScenarios(run.log.ledger.replay());
    const integration = integrationScenarioOf(item);
    if (integration !== null) {
      const briefing = await this.integrationOfItem(run, item);
      return briefing === undefined ? undefined : { kind: 'integration', integration: briefing, state: tracked.states.get(integration) ?? 'pending' };
    }
    const scenarios = entryScenariosOf(tracked.records, tracked.states, 'entry' in item.origin ? item.origin.entry : null);
    return scenarios.length === 0 ? undefined : { kind: 'entry', scenarios };
  }

  /**
   * Applies an accepted declaration: each `pending` scenario it names
   * becomes `bound` while the work item holds fakes, and `declared`
   * otherwise. A `bound`, `declared` or `implemented` one is left as it is.
   * The gate's commit re-renders the files, so a declared scenario loses
   * its pending tag there.
   */
  private async declareScenarios(run: Run, item: WorkItem, invocation: string, ids: readonly string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const moved = scenariosToDeclare(ids, trackedScenarios(run.log.ledger.replay()).states);
    if (moved.length === 0) return true;
    const state = this.holdsFakes(run, item) ? 'bound' : 'declared';
    for (const scenario of moved) {
      await this.write(run, { type: 'scenario-declared', data: { scenario, by: invocation, state } });
      if (this.ignoring(run)) return false;
    }
    return true;
  }

  /**
   * What a passing committing gate establishes of the scenarios it ran: a
   * `declared` one it passed is `implemented`, and a `bound` one it passed
   * has its fake-backed pass recorded and stays `bound`.
   */
  private async recordScenarioPasses(run: Run, attempt: GateAttempt): Promise<boolean> {
    if (attempt.verdict !== 'passed') return true;
    const passed = [...new Set(attempt.commands.flatMap(command => (command.kind !== 'scenarios' || command.outcome !== 'passed'
      ? []
      : (command.scenarios?.scenarios ?? []).filter(result => result.status === 'passed').map(result => result.id))))].sort();
    if (passed.length === 0) return true;
    const { states } = trackedScenarios(run.log.ledger.replay());
    for (const scenario of passed) {
      const state = states.get(scenario);
      if (state === 'declared') await this.write(run, { type: 'scenario-implemented', data: { scenario, gate: attempt.id } }, this.integrationItemsDue(run, scenario));
      else if (state === 'bound') await this.write(run, { type: 'scenario-bound-passed', data: { scenario, gate: attempt.id } });
      else continue;
      if (this.ignoring(run)) return false;
    }
    return true;
  }

  /**
   * The integration work items the implementation of one scenario makes due,
   * as the records its `scenario-implemented` commits: one per integration
   * scenario whose last sub-scenario this is (architecture §10). Committed
   * after every earlier work item, it queues behind the current one, since
   * work items run one at a time.
   */
  private integrationItemsDue(run: Run, scenario: string): CommitRecord[] {
    const lines = run.log.ledger.replay();
    const tracked = trackedScenarios(lines);
    const after = new Map(tracked.states);
    after.set(scenario, 'implemented');
    const items = [...committedRecords(lines).workItems];
    const records: CommitRecord[] = [];
    for (const integration of dueIntegrations(tracked.records, after, items)) {
      if (!integration.subScenarios.includes(scenario)) continue;
      const item = integrationWorkItem(integration, items.length);
      items.push(item);
      records.push({ path: workLayout.item(item.id), id: item.id, revision: 1, body: item });
    }
    return records;
  }

  /** Whether a gate passed the scenario since its latest declaration: a fake-backed pass or its implementation. */
  private passedSinceDeclaration(run: Run, scenario: string): boolean {
    const declared = run.log.all('scenario-declared').filter(event => event.data.scenario === scenario).at(-1)?.sequence ?? 0;
    return run.log.events.some(event => event.sequence > declared
      && (event.type === 'scenario-bound-passed' || event.type === 'scenario-implemented')
      && event.data.scenario === scenario);
  }

  /**
   * Withdrawal: the work item leaves its repair path without a pass, by
   * exhaustion, a placement request or a yield. Every `declared` or `bound`
   * scenario of its entry that no gate passed since its declaration returns
   * to `pending`, and the commit "Withdraw sc-NNN" restores its pending tag
   * at once, so no untagged failing scenario waits for the next gate that
   * runs its owner. A bound scenario never lost its tag, so a withdrawal of
   * bound ones alone changes no file and commits nothing; its events name
   * the accepted boundary, which carries the tag.
   */
  private async withdrawScenarios(run: Run, item: WorkItem, reason: string): Promise<boolean> {
    const scenarios = this.unfinishedScenarios(run, item, ['bound', 'declared'])
      .filter(scenario => !this.passedSinceDeclaration(run, scenario.id))
      .map(scenario => scenario.id);
    if (scenarios.length === 0) return true;
    const tracked = trackedScenarios(run.log.ledger.replay());
    const identity = { planId: run.record.planId, runId: run.record.jobId };
    const now = expectedFeatureFiles(tracked, identity);
    const withdrawn = expectedFeatureFiles(withStates(tracked, new Map(scenarios.map(id => [id, 'pending' as const]))), identity);
    const changes = withdrawn.some((file, index) => file.path !== now[index]?.path || file.content !== now[index]?.content);
    let commit = this.accepted(run);
    if (changes) {
      run.writer.requireSettled('The feature files cannot be written');
      const performed = await this.performWithdrawal(run, {
        withdrawal: run.log.count('scenarios-withdrawing') + 1, workItem: item.id, scenarios, reason,
      }, false);
      commit = performed.commit;
    }
    // The effect's completion withdrew the first; the rest follow with its commit.
    const states = trackedScenarios(run.log.ledger.replay()).states;
    for (const scenario of scenarios) {
      if (states.get(scenario) === 'pending') continue;
      await this.write(run, { type: 'scenario-withdrawn', data: { scenario, reason, commit } });
      if (this.ignoring(run)) return false;
    }
    return !this.ignoring(run);
  }

  /**
   * The withdrawal commit, as an external effect of the ledger:
   * `scenarios-withdrawing` is its intent and the first scenario's
   * `scenario-withdrawn` its completion. The files are rendered with the
   * intent's scenarios pending, from the ledger, so a recovery renders the
   * same; it finds the commit by its run and `withdrawn-<n>` trailers first.
   */
  private async performWithdrawal(
    run: Run,
    data: RunEventOf<'scenarios-withdrawing'>['data'],
    recovering: boolean,
  ): Promise<{ commit: string }> {
    return run.mutex.run(() => run.log.ledger.effect<{ commit: string }>({
      key: `scenarios-withdraw:${data.withdrawal}`,
      intent: { event: run.log.next({ type: 'scenarios-withdrawing', data }), records: [] },
      perform: async () => {
        const tracked = withStates(trackedScenarios(run.log.ledger.replay()), new Map(data.scenarios.map(id => [id, 'pending' as const])));
        await rerenderFeatureFiles(this.projectRoot, expectedFeatureFiles(tracked, { planId: run.record.planId, runId: run.record.jobId }));
        const files = [...new Set(tracked.records.filter(record => data.scenarios.includes(record.id)).map(record => record.file))].sort();
        const message = withdrawalMessage({ runId: run.record.jobId, withdrawal: data.withdrawal, workItem: data.workItem, scenarios: data.scenarios, reason: data.reason, files });
        const commit = await commitForScenarios(this.projectRoot, run.record.jobId, withdrawnTrailerValue(data.withdrawal), message, recovering, this.git);
        return { commit: commit ?? await this.git.currentHead(this.projectRoot) };
      },
      complete: result => ({
        event: run.log.next({ type: 'scenario-withdrawn', data: { scenario: data.scenarios[0]!, reason: data.reason, commit: result.commit } }),
        records: [],
      }),
    }));
  }

  /**
   * A withdrawal whose commit is recorded and some of whose scenarios have no
   * `scenario-withdrawn` yet: the harness stopped between them. Each is
   * written with the recorded commit; nothing is committed again.
   */
  private async completeWithdrawals(run: Run): Promise<string[]> {
    const completed: string[] = [];
    for (const intent of run.log.all('scenarios-withdrawing')) {
      const after = run.log.all('scenario-withdrawn').filter(event => event.sequence > intent.sequence);
      const first = after.find(event => event.data.scenario === intent.data.scenarios[0]);
      if (first === undefined) continue;
      for (const scenario of intent.data.scenarios) {
        if (after.some(event => event.data.scenario === scenario)) continue;
        await this.write(run, { type: 'scenario-withdrawn', data: { scenario, reason: intent.data.reason, commit: first.data.commit } });
        completed.push(scenario);
      }
    }
    return completed;
  }

  /**
   * The last refusal of a completion request the bound allows: the run fails
   * with the requirements as evidence where one is open or owed, and with
   * the scenarios otherwise.
   */
  private async refuseCompletion(
    run: Run,
    item: WorkItem,
    refusals: number,
    blocked: readonly string[],
    owing: { readonly open: readonly ConsumerRequirement[]; readonly owed: boolean; readonly scenarios: ReadonlyArray<{ readonly id: string }> },
  ): Promise<void> {
    if (owing.open.length > 0 || owing.owed) {
      await this.fail(run, 'unresolvable-requirement',
        `${item.id} asked for completion ${refusals} times with evidence still owed: ${blocked.join('; ')}`,
        owing.open.map(requirement => contractsLayout.requirement(requirement.id, requirement.revision)));
      return;
    }
    await this.fail(run, 'acceptance-incomplete',
      `${item.id} asked for completion ${refusals} times with ${integrationScenarioOf(item) === null ? 'scenarios of its entry' : 'its integration scenario'} not implemented: ${blocked.join('; ')}`,
      owing.scenarios.map(scenario => runLayout.scenario(scenario.id)));
  }

  /**
   * What a failing gate tells its reader: every command that did not pass
   * with what it reported, and a composition failure where the gate's
   * scenario check shows one.
   */
  private async diagnosticsOf(run: Run, gate: GateAttempt, audience: GateAudience = 'engineer'): Promise<{ id: string; cause: string | null; summary: string[] }> {
    const { records } = trackedScenarios(run.log.ledger.replay());
    const diagnostics = await gateDiagnostics(gate, audience, new Map(records.map(record => [record.id, record.name])));
    const composition = compositionLines(gate, records);
    return { ...diagnostics, summary: [...diagnostics.summary, ...composition] };
  }

  /**
   * The scenarios an accepted iteration's gate passed, each with the step
   * definitions that bound it, for the local architect: binding is
   * recorded, not policed, and this is where the architect sees it.
   */
  private async passedScenarioLines(run: Run, result: IterationResult): Promise<string[]> {
    if (result.outcome !== 'accepted' || result.gate === null) return [];
    const gate = await this.readGate(run, result.gate);
    const summary = gate?.commands.find(command => command.kind === 'scenarios')?.scenarios;
    if (summary === undefined) return [];
    const { records } = trackedScenarios(run.log.ledger.replay());
    return scenarioCheckLines(summary, new Map(records.map(record => [record.id, record.name])), { only: 'passed' });
  }

  private async readGate(run: Run, id: string): Promise<GateAttempt | null> {
    const read = await readCommitted(run.log.ledger, runLayout.gate(id), runSchemas.gate);
    return read.kind === 'valid' ? (read.value as GateAttempt) : null;
  }

  private async fail(run: Run, reason: RunFailureReason, text: string, evidence: readonly string[] = []): Promise<void> {
    // A failure is the run's final decision; its readers are stopped and
    // their requests finished first, so no review is left running past it.
    if (run.reviews !== undefined && !run.log.terminal) await this.stopReaders(run, 'stopped', run.record.policy.limits.stopSettleMs);
    await this.endRun(run, { type: 'job-failed', data: { reason, message: text, evidence: [...evidence] } });
  }

  /**
   * Stops accepting commands and asks every running session to stop,
   * recording nothing: the next start of the harness marks an unfinished
   * run interrupted. The project lock remains held until every run driver
   * is quiescent, so no durable write can cross into a successor service's
   * ownership. A driver that does not quiesce within the captured settlement
   * bound makes close fail and leaves the lock held for a later retry. A
   * completed driver whose settlement was not confirmed also leaves it held;
   * the service has no recovery contract that can later declare it settled.
   */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.closed = true;
    const closing = this.closeQuiescent();
    this.closing = closing.catch(error => {
      this.closing = undefined;
      throw error;
    });
    return this.closing;
  }

  private async closeQuiescent(): Promise<void> {
    await this.commandMutex.run(async () => {
      const drivers = [...this.runs.values()];
      const active = drivers.filter(run => !run.log.terminal);
      for (const run of active) {
        run.reviews?.close();
        for (const session of run.sessions()) void session.stop().catch(() => undefined);
        run.notify();
      }

      if (drivers.length > 0) {
        const bound = Math.max(...drivers.map(run => run.record.policy.limits.stopSettleMs));
        let timer: NodeJS.Timeout | undefined;
        const quiescent = await Promise.race([
          Promise.all(drivers.map(run => run.idle())).then(() => true),
          new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), bound); }),
        ]);
        clearTimeout(timer);
        if (!quiescent) {
          throw new Error(`The harness did not become quiescent within ${bound} ms; its project lock remains held`);
        }
      }
      const unsettled = drivers.filter(run => run.writer.isUnsettled);
      if (unsettled.length > 0) {
        throw new Error(`The harness has ${unsettled.length} run driver${unsettled.length === 1 ? '' : 's'} whose settlement was not confirmed; its project lock remains held`);
      }
      await this.options.lock.release();
    });
  }
}

/** Why a completion request is refused for one scenario of its entry, by its state. */
function scenarioRefusal(scenario: { readonly id: string; readonly state: ScenarioState }, gate?: string): string {
  switch (scenario.state) {
    case 'pending':
      return `${scenario.id} is pending: nothing has declared it; declare it with the request where existing step definitions bind it, or assign an iteration that writes them`;
    case 'bound':
      return `${scenario.id} is bound: it passed only against a fake, and becomes due once this work item's requirements are verified`;
    default:
      return `${scenario.id} is ${scenario.state}, and the work-item gate${gate === undefined ? '' : ` ${gate}`} did not pass it: its owner's run did not execute it`;
  }
}

/**
 * Why a passing final attempt does not prove the plan's scenarios: no
 * scenario check, one not in full mode, one that did not pass, or a tracked
 * scenario it did not pass. Null when it proves every one.
 */
function finalScenarioGaps(attempt: GateAttempt, required: readonly string[]): string | null {
  if (required.length === 0) return null;
  const check = attempt.commands.find(command => command.kind === 'scenarios');
  const summary = check?.scenarios;
  if (check === undefined || summary === undefined) {
    return `no scenario check ran${attempt.scenarios === 'none-selected' ? ', because no module has feature files' : ''}`;
  }
  if (summary.mode !== 'full' || summary.dryRun) return `its scenario check was a ${summary.dryRun ? 'dry run' : 'run'} in ${summary.mode} mode, not a full-mode run`;
  if (check.outcome !== 'passed') return `its scenario check ${check.outcome === 'failed' ? 'failed' : 'was not verified'}`;
  const passed = new Set(summary.scenarios.filter(result => result.status === 'passed').map(result => result.id));
  const missing = required.filter(id => !passed.has(id));
  return missing.length === 0 ? null : `${missing.join(', ')} did not pass in it`;
}

/** What one placement request resolved to, for the local architect that made it. */
type PlacementResolution =
  | { readonly kind: 'decided'; readonly decision: PlacementDecision }
  | { readonly kind: 'unresolved'; readonly request: string; readonly findings: readonly string[]; readonly gaps: readonly string[] };

/** What the parent append did, as the effect's completion records it, with the session that holds the context. */
type AppendResult =
  | { readonly outcome: 'appended' | 'already-present'; readonly generation: number; readonly session: SessionId; readonly ref: string }
  | { readonly outcome: 'session-lost'; readonly generation: number; readonly session: SessionId | null; readonly reason: string };

/** The records the placement rules are checked against, as the log holds them. */
/** The obligation a provider work item exists to satisfy, as its architect is told it. */
function obligationBriefing(item: WorkItem, records: ReturnType<typeof committedRecords>) {
  if (!('obligation' in item.origin)) return undefined;
  const obligation = records.obligations.get(item.origin.obligation.id);
  if (obligation === undefined) return undefined;
  return {
    id: obligation.id,
    capability: obligation.capability,
    behavior: obligation.behavior,
    suite: obligation.evidence.conformance,
  };
}

/**
 * The `module.ramify` declarations on the path between two modules: each
 * module at or below their lowest common ancestor that is one of them or an
 * ancestor of one of them. An agreement's exposure is declared along exactly
 * that path and nowhere else.
 */
function declarationsBetween(index: ArchitectIndex | null, consumer: string, provider: string): string[] {
  if (index === null) return [];
  const ancestors = (module: string): string[] => {
    const parts = module.split('/');
    return parts.map((_, position) => parts.slice(0, position + 1).join('/'));
  };
  const common = ancestors(consumer).filter(candidate => ancestors(provider).includes(candidate)).at(-1);
  if (common === undefined) return [];
  const onPath = new Set([...ancestors(consumer), ...ancestors(provider)].filter(module => module === common || module.startsWith(`${common}/`)));
  const declarations: string[] = [];
  for (const module of onPath) {
    const entry = findModule(index, module);
    if (entry === undefined) continue;
    declarations.push(entry.dir === '' ? 'module.ramify' : `${entry.dir}/module.ramify`);
  }
  return [...new Set(declarations)].sort();
}

function placementEvidenceOf(records: ReturnType<typeof committedRecords>, index: ArchitectIndex | null): PlacementEvidence {
  return {
    index,
    registry: new Map(records.registry.map(entry => [entry.capability, entry])),
    hypotheses: new Map(records.hypotheses.map(hypothesis => [hypothesis.id, hypothesis])),
    decisions: records.decisions,
    workItems: new Set(records.workItems.map(item => item.id)),
  };
}

/** Whether two view identities describe the same state of the source. */
function sameView(left: ViewIdentity, right: ViewIdentity): boolean {
  if (left.status !== 'materialized' || right.status !== 'materialized') return left.status === right.status;
  return left.revision === right.revision && left.input === right.input;
}

function identityOf(view: ViewIdentity): string {
  return view.status === 'materialized' ? `${view.revision} (${view.input})` : 'unmaterialized';
}

/** The project-relative directory of one module, or the project root when the view has none. */
function directoryOf(index: ArchitectIndex | null, module: string): string {
  return index?.modules.get(module)?.dir ?? '';
}

/** The directory one `module.ramify` declares, as a proposal names it. */
function directoryOfDeclaration(declaration: string): string {
  return declaration === 'module.ramify' ? '' : declaration.slice(0, -'/module.ramify'.length);
}

/** The module whose declaration this path is, by the view's own directories, or the directory itself. */
function moduleNameOf(index: ArchitectIndex | null, declaration: string): string {
  const directory = declaration === 'module.ramify' ? '' : declaration.slice(0, -'/module.ramify'.length);
  if (index !== null) {
    for (const entry of index.modules.values()) if (entry.dir === directory) return entry.module;
  }
  return directory === '' ? '.' : directory;
}

/**
 * The earlier attempts at the same subject, newest last, as the accepted
 * commit's message states them. It reads the log and nothing else.
 */
function earlierAttempts(run: Run, attemptId: string, attemptSubject: GateAttempt['subject']): Array<{ id: string; verdict: string; cause: string | null }> {
  const subject = attemptSubject.iteration ?? attemptSubject.workItem;
  if (subject === undefined) return [];
  return run.log.all('gate-attempted')
    .filter(event => event.data.gate !== attemptId && event.data.verdict !== 'passed')
    .flatMap(event => {
      const body = gateBodyOf(run, event.data.gate);
      if (body === undefined) return [];
      if ((body.subject.iteration ?? body.subject.workItem) !== subject) return [];
      return [{ id: body.id, verdict: body.verdict, cause: body.cause }];
    });
}

/** What a committing gate's completion decides its CheckFinding part from; see `scenarioGateFindings`. */
type ScenarioGateFindings = ScenarioGateInputs | { readonly unavailable: string } | null;

/** One gate attempt as the log committed it, without reading the file again. */
function gateBodyOf(run: Run, id: string): GateAttempt | undefined {
  for (const entry of run.log.ledger.replay()) {
    for (const record of entry.transaction.records) {
      const body = record.body as { schema?: unknown; id?: unknown };
      if (body?.schema === 'ramify-agent.gate-attempt/3' && body.id === id) return record.body as GateAttempt;
    }
  }
  return undefined;
}

function gateOperation(prepared: PreparedGate, message: string): GateOperation {
  const request = prepared.request;
  if (request.runId === undefined) throw new Error('A committing gate requires its durable run ID');
  if (prepared.decisive.length > 0 || request.checks.some(check => check.discovery !== undefined || check.kind === 'conformance')) {
    throw new Error(`Gate ${request.id} was not completely verified before its operation was recorded`);
  }
  return {
    schema: 'ramify-agent.gate-operation/1',
    checkpoint: prepared.checkpoint as GateOperation['checkpoint'],
    request: {
      id: request.id,
      runId: request.runId,
      projectRoot: request.projectRoot,
      directory: request.directory,
      head: request.head,
      checks: request.checks.map(({ discovery: _discovery, ...check }) => ({
        ...check,
        kind: check.kind as 'ramify-check' | 'type-check' | 'tests' | 'scenarios',
      })),
      selection: {
        policy: request.selection?.policy ?? 'all-project',
        exactOwners: [...(request.selection?.exactOwners ?? [])],
        subtrees: [...(request.selection?.subtrees ?? [])],
      },
      dependencyDirectories: [...(request.dependencyDirectories ?? [])],
      subject: request.subject ?? {},
      proposedBy: request.proposedBy ?? null,
      repairRound: request.repairRound ?? 0,
      infrastructureAttempt: request.infrastructureAttempt ?? 0,
      writeScope: [...(request.writeScope ?? [])],
      limits: {
        repairRounds: request.limits?.repairRounds ?? 1,
        infrastructureRetries: request.limits?.infrastructureRetries ?? 1,
      },
      ...(request.scenarios === undefined ? {} : { scenarios: request.scenarios }),
    },
    guardedChanges: [...prepared.guardedChanges],
    rules: prepared.rules.map(rule => ({ ...rule, violations: rule.violations.map(violation => ({ ...violation })) })),
    unauthorized: prepared.unauthorized,
    ruleFailed: prepared.ruleFailed,
    timeoutMs: prepared.timeoutMs,
    message,
  };
}

function preparedGate(operation: GateOperation): PreparedGate {
  return {
    checkpoint: operation.checkpoint,
    request: {
      ...operation.request,
      checks: operation.request.checks,
      dependencyDirectories: operation.request.dependencyDirectories,
      writeScope: operation.request.writeScope,
    },
    guardedChanges: [...operation.guardedChanges],
    rules: [...operation.rules],
    unauthorized: operation.unauthorized,
    ruleFailed: operation.ruleFailed,
    decisive: [],
    timeoutMs: operation.timeoutMs,
  };
}

/**
 * What a failing gate tells the agent that receives it: its cause, each
 * command that did not pass, and what that command reported. A Ramify
 * check's findings are relayed as findings; anything else is quoted from the
 * end of its own output.
 */
/**
 * The lines a composition failure adds to a failing gate's diagnostics: the
 * integration scenario that failed while its sub-scenarios passed, and the
 * sub-scenarios whose bridging Given is suspect (architecture §10).
 */
function compositionLines(gate: GateAttempt, records: readonly ScenarioRecord[]): string[] {
  const results = gate.commands.flatMap(command => (command.kind === 'scenarios' ? command.scenarios?.scenarios ?? [] : []));
  return compositionFailures(records, results).flatMap(failure => [
    `- composition failure: \`${failure.scenario}\` failed while its sub-scenarios ${failure.passed.map(id => `\`${id}\``).join(', ')} passed, so their step definitions work one by one and not together.`,
    ...(failure.suspects.length === 0
      ? ['  - No sub-scenario has a bridging Given; look at what the step definitions share between the steps.']
      : failure.suspects.map(suspect => `  - The bridging Given of \`${suspect.scenario}\` is suspect: ${suspect.givens.map(given => `"${given}"`).join(', ')} assumes what the real behavior may not do.`)),
  ]);
}

/** The write scope of one assignment, project-relative, as a gate attributes findings against it. */
function writeScopePaths(projectRoot: string, assignment: IterationAssignment): string[] {
  const paths = scopePaths(projectRoot, assignment.scope);
  return [...paths.roots, ...paths.files];
}

function rootModuleOf(index: ArchitectIndex | null): string | undefined {
  if (index === null) return undefined;
  for (const entry of index.modules.values()) if (entry.parent === null) return entry.module;
  return undefined;
}

/**
 * The session an invocation asks for, as its record states it. `actual` here
 * is what the caller already knew: a session it could not continue degrades
 * before the invocation starts. What the implementation answered is in the
 * outcome, which is written once the session has started.
 */
/** What a review request binds besides its candidate: its question's captured inputs and its fork point. */
type ReviewInputs = Pick<ReviewRequest, 'requirements' | 'guidance' | 'forkPoint'>;

/** What the harness binds to one concern of a valid submission. */
interface ConcernBinding {
  readonly ground: CheckFindingGround | null;
  readonly credibility: CheckFindingReportCredibility;
  readonly modules: readonly string[];
}

/** The start a request intends: a fork for every question with a fork point, fresh for code review. */
function requestedStartOf(request: ReviewRequest): 'fresh' | 'fork' {
  return request.forkPoint.kind === 'none' ? 'fresh' : 'fork';
}

/**
 * The inputs a request bound, as read again now: each must be there with
 * the hash the request recorded, or the question is not the one it asked.
 */
function boundInputs(read: readonly CapturedInput[], bound: ReadonlyArray<{ readonly ref: string; readonly hash: string }>): CapturedInput[] {
  return bound.map(entry => {
    const found = read.find(input => input.ref === entry.ref);
    if (found === undefined) throw new Error(`${entry.ref} is no longer there`);
    if (found.hash !== entry.hash) throw new Error(`${entry.ref} has hash ${found.hash}, and the request bound ${entry.hash}`);
    return found;
  });
}

/**
 * The local architect's pinned point after one invocation, where the harness
 * kept its session: the session and the executor's ref at the invocation's
 * end. Null where the session was not kept or no ref was reported.
 */
function architectRefOf(result: InvocationResult<unknown>): ArchitectRef | null {
  return result.kept && result.ref !== '' && result.session !== '' ? { session: result.session, ref: result.ref } : null;
}

function requestedSession<T>(request: InvocationRequest<T>): Invocation['session'] {
  if (request.degraded !== undefined) {
    return {
      requested: request.degraded.requested,
      actual: request.start.mode === 'continue' ? 'continued' : 'fresh',
      ref: '',
      degradedReason: request.degraded.reason,
    };
  }
  if (request.start.mode === 'continue') {
    return { requested: 'continued', actual: 'continued', ref: request.start.ref, from: request.start.ref };
  }
  if (request.start.mode === 'fork') {
    return { requested: 'fork', actual: 'fork', ref: request.start.from, from: request.start.from };
  }
  return { requested: 'fresh', actual: 'fresh', ref: '' };
}

function analysisFailure(ended: InvocationOutcome['ended'], kind: string): string {
  switch (ended) {
    case 'invalid-submission': return 'Every allowed submission of the initial analysis was invalid';
    case 'failed': return 'The initial architect\'s session failed';
    case 'context-budget-reached': return 'The initial architect reached its context budget without submitting an analysis; a budget return is never a completion';
    case 'stopped': return 'The initial architect\'s session stopped without a stop request';
    default: return `The initial architect ended without an accepted analysis (${kind})`;
  }
}

/**
 * Why an approval of the run's analysis is refused, or null when it is
 * accepted: once only, never before the analysis is accepted or during the
 * final verification, and never for a run that did not complete.
 */
function approvalRefusal(run: Run, snapshot: RunSnapshot): string | null {
  const earlier = run.log.find('analysis-approved');
  if (earlier !== undefined) return `The analysis was already approved by ${earlier.data.reviewer} at ${earlier.at}`;
  switch (snapshot.state) {
    case 'failed': return 'The run failed; the analysis of a failed run is not approved';
    case 'stopped': return 'The run was stopped; the analysis of a stopped run is not approved';
    case 'interrupted': return 'The run was interrupted; the analysis of an interrupted run is not approved';
    case 'completed': return null;
    case 'running': break;
  }
  if (run.stopRequested) return 'A stop was accepted for this run; its analysis is not approved';
  if (run.log.find('analysis-accepted') === undefined) return 'The run has no accepted analysis yet';
  if (snapshot.phase === 'final-verification') return 'The run is in its final verification; approve its analysis once it has completed';
  return null;
}

/**
 * How long the run waited at its review stop: from `review-requested` to
 * `analysis-approved`, or to `now` while it still waits. A run bound reads
 * its age without it.
 */
function reviewPauseMs(events: readonly RunEvent[], now: number): number {
  const requested = events.find(event => event.type === 'review-requested');
  if (requested === undefined) return 0;
  const approved = events.find(event => event.type === 'analysis-approved');
  return Math.max(0, (approved === undefined ? now : Date.parse(approved.at)) - Date.parse(requested.at));
}

/** The outcome of an invocation whose session never ran: stopped, with nothing observed. */
function stoppedOutcome(): Omit<InvocationOutcome, 'schema' | 'invocation'> {
  return {
    ended: 'stopped',
    rejectedSubmissions: 0,
    disposition: 'incomplete',
    submission: null,
    settled: { confirmed: true, at: new Date().toISOString(), groupsKilled: 0, lateWrites: [] },
    outsideScope: [],
    usage: { unavailable: 'the session never started' },
    elapsedMs: 0,
  };
}

function analysisMessage(record: RunRecord, plan: string): string {
  const view = record.manifest.architectView;
  const source = record.manifest.source;
  return [
    `# Plan "${record.planId}"`,
    '',
    `The plan, as \`plans/${record.planId}/plan.md\` read when this run started:`,
    '',
    '<plan>',
    plan.trim(),
    '</plan>',
    '',
    ...planScenariosSection(record.planScenarios),
    '# This run\'s evidence',
    '',
    view.status === 'materialized'
      ? `- Architect view: \`.ramify-architect/\`, revision \`${view.revision}\`, input \`${view.input}\`.`
      : '- Architect view: none was materialized for this run, so every claim about the module tree is yours to establish from the source.',
    view.status === 'materialized'
      ? `- Coverage limits the view reports: ${view.coverageLimits.length ? view.coverageLimits.join('; ') : 'none'}.`
      : '- Coverage limits: unknown.',
    `- Source: ${source === null ? 'not a git checkout' : `commit ${source.commit}${source.dirty ? ', with uncommitted changes, which the views include' : ''}`}.`,
    '',
    `Analyse the plan with the procedure above and submit with \`${initialAnalysisToolName}\`.`,
  ].join('\n');
}

/**
 * The plan scenarios the harness extracted, by ID with their text and plan
 * lines, and every `gherkin` block that did not parse. A plan without
 * blocks is said to have none in one line.
 */
function planScenariosSection(extraction: PlanScenarioExtraction): string[] {
  const lines = ['# The plan\'s scenarios', ''];
  if (extraction.scenarios.length === 0 && extraction.limitations.length === 0) {
    return [...lines, 'The plan has no `gherkin` block, so it states no scenario: write every entry\'s scenarios yourself.', ''];
  }
  if (extraction.scenarios.length === 0) {
    lines.push('The plan states no scenario that could be extracted: write every entry\'s scenarios yourself.', '');
  } else {
    lines.push(
      `The harness extracted ${extraction.scenarios.length === 1 ? 'one scenario' : `${extraction.scenarios.length} scenarios`} from the plan's \`gherkin\` blocks. Each appears exactly once in your submission: as the origin of one entry scenario, restating its text as written here, or as an integration scenario with its sub-scenarios.`,
      '',
    );
    for (const scenario of extraction.scenarios) {
      lines.push(
        `## ${scenario.id}: ${scenario.name}`,
        '',
        `Plan lines ${scenario.lines[0]}–${scenario.lines[1]}${scenario.outline ? ', a Scenario Outline with its examples' : ''}.`,
        '',
        '```gherkin',
        ...scenario.source,
        '```',
        '',
      );
    }
  }
  if (extraction.limitations.length > 0) {
    lines.push('Blocks the harness could not parse. They are not plan scenarios; the plan is the person\'s and the harness never edits it, so state what they meant in your own scenarios where an entry needs it:', '');
    for (const limitation of extraction.limitations) {
      lines.push(`- Plan lines ${limitation.lines[0]}–${limitation.lines[1]}: ${limitation.message.replace(/\n/g, '; ')}`);
    }
    lines.push('');
  }
  return lines;
}

/** The commit the working directory is on, or the empty string outside git. */
async function writeOnce(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  if (await writeFileExclusive(path, content) === 'exists') {
    const existing = await readIfExists(path);
    if (existing === undefined) throw new Error(`${path} could not be written`);
  }
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readJson(path: string): Promise<unknown> {
  const content = await readIfExists(path);
  if (content === undefined) return null;
  try {
    return JSON.parse(content.toString('utf8'));
  } catch {
    return null;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}

/** Whether a CheckFinding's owner is this work item. */
/** A terminal review result as a reconciliation packet states it: covered scope, gaps and concerns. */
function resultText(result: ReviewResult): string {
  const concerns = (count: number) => `${count} concern${count === 1 ? '' : 's'}`;
  if (result.result === 'complete') return `complete, ${concerns(result.concerns)}`;
  if (result.result === 'partial') return `partial, ${concerns(result.concerns)}; not inspected: ${result.missing.map(entry => `${entry.path} (${entry.reason})`).join(', ')}`;
  return `not verified (${result.reason}): ${result.detail}`;
}

function sameWorkItem(owner: { readonly kind: string; readonly workItem?: string } | undefined, workItem: string): boolean {
  return owner?.kind === 'work-item' && owner.workItem === workItem;
}

/**
 * What one reviewer invocation's end means for its attempt: covered scope,
 * or why none, and whether another attempt could do better. Invalid output,
 * a failed execution and a timeout may be retried; an unavailable input or
 * a stop may not.
 */
function reviewOutcome(
  result: InvocationResult<ReviewSubmission>,
  stop: NotVerifiedReason | undefined,
): { readonly result: ReviewResult; readonly retryable: boolean } {
  const notVerified = (reason: NotVerifiedReason, detail: string, retryable: boolean) => ({ result: { result: 'not-verified' as const, reason, detail }, retryable });
  if (result.id === '') return notVerified('unavailable', 'The run\'s invocation bounds refused the reviewer', false);
  switch (result.ended) {
    case 'submitted': {
      const submission = result.value;
      if (submission === undefined) return notVerified('invalid-output', 'The reviewer ended without an accepted submission', true);
      const inspected = submission.inspected.map(path => ({ path }));
      return {
        result: submission.missing.length === 0
          ? { result: 'complete', inspected, concerns: submission.concerns.length }
          : { result: 'partial', inspected, missing: submission.missing.map(entry => ({ path: entry.path, reason: entry.reason })), concerns: submission.concerns.length },
        retryable: false,
      };
    }
    case 'invalid-submission':
      return notVerified('invalid-output', 'Every submission the reviewer made was invalid, up to the bound', true);
    case 'ended':
      return notVerified('invalid-output', 'The reviewer ended without a submission', true);
    case 'context-budget-reached':
      return notVerified('execution-failed', 'The reviewer reached its context budget before it submitted', true);
    case 'failed':
      return result.interruption === 'idle-timeout' || result.interruption === 'absolute-timeout'
        ? notVerified('timed-out', `The reviewer met its ${result.interruption === 'idle-timeout' ? 'idle' : 'attempt'} bound`, true)
        : notVerified('execution-failed', `The reviewer's session failed${result.interruption === undefined ? '' : ` (${result.interruption})`}`, true);
    case 'stopped':
      return notVerified(stop ?? 'stopped', stop === 'deadline' ? 'The reviews\' settlement bound passed while this attempt ran' : 'The run stopped its readers while this attempt ran', false);
  }
}
