import { captureGlobalTarget, localConsultationInputs, engineerConsultationInputs } from '../consultations/targets.js';
import { boundedNonfunctionalTools, nonfunctionalSourceAllows } from '../nonfunctional/submissions.js';
import { capabilityGuardedPolicy, capabilityAuthorizationErrors } from '../capability/authorization.js';
import { taskSupportSections } from '../work/task-support.js';
import { declaredCheckInputs, moduleInputPointers, startingPointsSection, type StartingPointGroup } from '../work/starting-inputs.js';
export { taskSupportSections } from '../work/task-support.js';
import type { ProvisionalSourceGit } from '../../subs/evidence/src/provisional-git.js';
import { runCommand, type CommandRunner } from '../../subs/evidence/src/run-command.js';
import { z } from 'zod';
import { lstat, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import type { AgentPort, AgentSession, JsonSchema, SessionSpec, SessionStart, ToolDefinition } from '../../subs/agent/src/interfaces/port.js';
import { gitCandidateSource, gitChangeHistory, gitService, type CandidateSource, type ChangeHistory, type GitService } from '../../subs/evidence/src/git.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { projectConfigurationFile } from '../../subs/evidence/src/project-configuration.js';
import { findModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { GateAttempt, GateRuleRecord, TestSelectionPolicy } from '../checks/records.js';
import { acceptedCommit } from '../checks/accepted.js';
import type { ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import type { PreparedGate } from '../checks/gate.js';
import type { GuardedScope } from '../guard/write-guard.js';
import { decideWrite } from '../guard/write-guard.js';
import { ExcursionWatcher } from './excursions.js';
import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import type {
  CheckFindingAt, CheckFindingCommand, CheckFindingId, CheckFindingQueryInput, CheckFindingRisk,
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
import { outsideScope, recordSettledSnapshot } from './mutations.js';
import { captureProvisionalSource } from '../capability/source.js';
import { capabilityRequestId, capabilityTaskId, capabilityAssignmentId, identifyCapabilityNeed, capabilityLayout,
  type CapabilityNeedInput, type CapabilityRequest, type CapabilityTask, type CapabilityPlan, type CapabilityExchange,
} from '../capability/records.js';
import { capabilityRunPolicyVersion, captureCapabilityLimits } from '../capability/policy.js';
import { createCapabilityWorkflow } from '../capability/workflow.js';
import { commitCapabilityTransition } from '../capability/ledger.js';
import { qualificationActionSchema, capabilityActionSchema, capabilityPlanUpdateSchema, buildCapabilityPlanRevision,
  unreportedByHandback, validateCapabilityAction, validateCapabilityPlanUpdate, type QualificationAction, type CapabilityAction } from '../capability/submission.js';
import { capabilityCompletionBlockers, capabilityHandbackReadiness, replayCapabilityState } from '../capability/state.js';
import type { CapabilityWorkflow } from '../capability/workflow.js';
import { userCheckFindingChange, userRejectionCode } from '../check-findings/user-commands.js';
import type { CheckFindingUserCommand } from '../interfaces/protocol/check-findings.js';
import { canonicalJson } from '../jobs/commands.js';
import {
  reviewAttemptId, reviewAttemptSchema, reviewLayout, reviewOrientationSchema, reviewRequestSchema, reviewSchemas, reviewSubmissionSchema,
  type ForkPoint, type NotVerifiedReason, type OrientationSubmission, type ReviewAttempt, type ReviewOrientation, type ReviewRequest,
  type ReviewResult, type ReviewSubmission,
} from '../reviews/records.js';
import type { CapturedInput } from '../../subs/reviews/src/inputs.js';
import { prepareReview, type PreparedReview } from '../../subs/reviews/src/preparation.js';
import { ReviewQueue } from '../reviews/scheduler.js';
import { openCandidateSnapshot, resolveSnapshotPath, snapshotTools, type CandidateSnapshot, type SnapshotComparison, type SnapshotTools } from '../../subs/reviews/src/snapshot.js';
import { reviewCoverage, reviewStateOf, unsettledRequests, type ReviewCoverage } from '../reviews/state.js';
import { orientationToolName } from '../../subs/reviews/src/submission.js';
import type { AcceptedCommand, Receipt } from '../interfaces/protocol/jobs.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import { breakpointSelectorSchema, type BreakpointState, type DebugExchange, type DebugInspection, type FailureAnalysis, type Role, type RunCommand, type RunFailureReason } from '../interfaces/protocol/runs.js';
import { CommandLedger, CommandRejection } from '../jobs/commands.js';
import { commitRecord, readCommitted, recoverCommits, type RecordRef as CommitRecord } from '../jobs/commit.js';
import { Mutex, PriorityMutex } from '../jobs/mutex.js';
import { declaredSchemaOf, jobSchemaVersion, listJobDirectories, newJobId, planStateDirectory } from '../jobs/records.js';
import { ensureStateDirectory } from '../store/state-directory.js';
import { planPath, readPlan } from '../plans/discover.js';
import { discoverDocuments } from '../../subs/plan-evidence/src/discovery.js';
import { verifyDocumentBytes } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import {
  elementIdSchema, openElementCatalog, serializeElementCatalog, type ElementCatalog, type ElementKind, type PackageCitation, type PackageDeviation,
} from '../../subs/plan-evidence/src/interfaces/catalog.js';
import {
  acceptIntake, acceptPrinciples, applyCheck, asValidation, checkJsonSchema, checkMessage, checkSubmissionSchema, checkToolName,
  intakeJsonSchema, intakeMessage, intakeSubmissionSchema, intakeToolName, principleJsonSchema, principleMessage,
  principleSubmissionSchema, principleToolName,
  type CheckState, type CheckSubmission, type ExtractionInputs, type IntakeSubmission, type PrincipleSubmission,
} from '../analysis/extraction.js';
import type { CatalogFinding } from '../analysis/records.js';
import { readAcceptedEvidence } from '../analysis/evidence.js';
import { assessmentSchema, roundSchema, type Assessment, type Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { decideNonfunctionalRound, type RoundDecision } from '../../subs/nonfunctional/src/rounds.js';
import { replayNonfunctionalPhase } from './nonfunctional-phase.js';
import { preparedCandidateSchema, nonfunctionalDeviationSchema, nonfunctionalRepairAssignmentSchema } from './nonfunctional-records.js';
import { assessedElements, bindCoordinatorAssessment, coordinatorAssessmentJsonSchema, coordinatorAssessmentToolName,
  coordinatorActionJsonSchema, coordinatorActionToolName, coordinatorInvestigationJsonSchema, coordinatorInvestigationToolName,
  coordinatorActionSchema,
  nonfunctionalRepairJsonSchema, nonfunctionalRepairToolName, validateCoordinatorAction, validateCoordinatorInvestigation,
  nonfunctionalRepairSubmissionSchema,
  type CoordinatorAssessmentSubmission, type CoordinatorAction, type CoordinatorInvestigation, type NonfunctionalRepairSubmission } from '../nonfunctional/submissions.js';
import { coordinatorAssessmentPrompt, coordinatorActionPrompt, repairPrompt } from '../nonfunctional/prompts.js';
import { contextSelectionSchema } from '../context-selection/contracts.js';
import { readRecordedContextSelection } from '../context-selection/recorded.js';
import { citePackage, deliverPackage } from '../context-selection/delivery.js';
import { orientationPacket, prepareContextSelection, workOrientationSubmissionSchema, workOrientationToolName, type ContextSelectorSubmission, type SelectionSource, type WorkOrientationSubmission } from '../context-selection/submissions.js';
import { documentChanges, readCapturedDocuments } from './document-inputs.js';
import { composeTaskBrief, type KnownProjectFacts } from './task-brief.js';
import { constructEngineerStep, engineerStepInputsOf, type ConstructedEngineerStep } from '../steps/engineer.js';
import {
  committedBody, finished, invocationRecord, InvocationRunner, kept,
  type InvocationRequest, type InvocationResult, type LiveInvocation, type RunnerHost, type RunnerRun, type SessionKeeping,
} from '../steps/runner.js';
import { knownFactsInputs } from '../steps/constructed.js';
import { projectPath, serializeStepInputs, stepInputsSchemaId, validateReviewInputs, validateSelectorInputs, validateWorkTurnInputs,
  type EngineerStepInputs, type KnownFactsInputs, type OrientationStepInputs, type ProjectPath, type StepInputs } from '../steps/inputs.js';
import { constructStep, freshFallback } from '../steps/construct.js';
import { assignmentBootstrap, constructOrientationStep, constructSelectorStep, constructWorkTurnStep, judgeWorkTurn, workBriefingInputs,
  type ConstructedWorkTurnStep } from '../steps/local-architect.js';
import { constructDesignOrientationStep, constructReviewStep } from '../steps/reviewer.js';
import { inputsHash, loadPromptPackages, renderContractPrompt, renderEngineerPrompt, renderFailureAnalystPrompt, renderGlobalForkPrompt, renderInitialArchitectPrompt, renderLocalArchitectPrompt, renderReconciliationPrompt, sha256, renderNonfunctionalCoordinatorPrompt, renderNonfunctionalRepairPrompt, renderExtractionPrompt, renderCapabilityArchitectPrompt, type ExtractionTurn, type LoadedPackage } from '../prompts/packages.js';
import {
  baselineScope, captureSnapshot, deliveredScopeInputs, invocationScope, revisionMismatch, rootModuleOfSnapshot, scopeSize, supportDocument, readScopeMeasurement, writeScopeMeasurement,
  type DeclaredScope,
} from '../kpi/capture.js';
import { cachedChangeHistory } from '../kpi/delivered.js';
import { lineEvents, takeLineSnapshot, type LineSnapshot } from '../kpi/lines.js';
import { writeFileAtomic, writeFileExclusive } from '../../subs/ledger/src/atomic.js';
import type { ProjectLock } from '../store/lock.js';
import { acceptAnalysis } from '../analysis/accept.js';
import { acceptDecision } from '../architecture/accept.js';
import { briefText, globalContext, type GlobalContext } from '../architecture/context.js';
import {
  architectureLayout, architectureSchemas, globalDecisionId, localDecisionId, placementRequestSchema, requestId,
  type PlacementDecision, type PlacementRequest,
} from '../architecture/records.js';
import { forkMessage, unresolvedForkMessage } from '../architecture/session.js';
import {
  defaultMaxPlanDeviations, deviationLayout, environmentProblemId, environmentProblemSchema, packageDeviation,
  planDeviationId, planDeviationSchema, unresolvedRequestId, unresolvedRequestSchema,
  type DeviationBody, type EnvironmentBody, type EnvironmentProblem, type PlanDeviation, type UnresolvedRequest,
} from '../deviations/records.js';
import { deviationCommands, isPlanDeviation, nextCheckFinding } from '../deviations/finding.js';
import { nonfunctionalDeviationCommands, nonfunctionalDeviationHash, prepareNonfunctionalDeviation } from '../deviations/nonfunctional.js';
import { environmentCommands, environmentOptions } from '../deviations/environment.js';
import {
  forkJsonSchema, forkSubmissionSchema, forkToolName, validateFork,
  type ForkSubmission, type PlacementEvidence, type PlacementRequestBody,
} from '../architecture/submission.js';
import {
  acceptArchitectElements, incorporatedExtraction, initialAnalysisJsonSchema, initialAnalysisToolName, validateInitialAnalysis,
  type AnalysisEvidence, type InitialAnalysisSubmission,
} from '../analysis/submission.js';
import { registerContract, registrationNeeded, type AttachedConsumer } from '../contracts/accept.js';
import { cycleClosedBy, cycleIdentity, type DependencyCycle, type DependencyEdge } from '../contracts/graph.js';
import { fakeNamingViolations, type NamedFile } from '../contracts/naming.js';
import type { StandIn } from '../contracts/parity.js';
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
import { assignmentBodySchema, assignmentErrors, type AssignmentBody } from '../work/assignment.js';
import {
  engineerEquipment, type EngineerEquipment, type EngineerEquipmentInputs, type EquipContext, type Equipment, type ShellCallRecord,
} from '../work/engineer-equipment.js';
import { engineerWorkingDirectory, repairWorkingDirectory } from '../work/engineer-directory.js';
import { createGitInspectionTool } from '../work/git-inspection.js';
import {
  capabilityEngineerJsonSchema, capabilityEngineerSubmissionSchema, engineerJsonSchema, engineerSubmissionSchema, engineerSubmissionDescription, engineerToolName, focusedCommandPendingNote, iterationAcceptance, iterationMessage,
  type AssignedObligation,
  validateEngineer, type EngineerSubmission, type IterationApiViews,
} from '../work/engineer.js';
import {
  iterationAssignmentSchema, iterationId, iterationLayout, iterationSchemas, type FailureDigest, type IterationAssignment, type IterationResult,
  type WriteScope,
} from '../work/iterations.js';
import {
  digestLines, failureAnalysisJsonSchema, failureAnalysisMessage, failureAnalysisSubmissionDescription, failureAnalysisToolName,
  failureDigest, renderTranscript, validateFailureAnalysis,
  type AnalysisEvidence as FailureEvidence, type DigestShellCall, type FailureAnalysisSubmission,
} from '../work/failure.js';
import { isContained, resolveRealTarget } from '../guard/resolve-contained-path.js';
import {
  scopeConfigurationPaths, captureGuardedFiles, checkWriteScope, deniedFiles, guardedScopeOf, protectedScopeOf, injectionSiteRule, moduleOwning,
  resolveWriteScope, testPolicyOf, type DefaultWriteScope, type GuardedScenarioFiles,
} from '../work/scope.js';
import { committedRecords, refOf } from '../work/committed.js';
import {
  obligationBriefingLines, obligationsOwnedBy, reportSourceLines, type ObligationActor, type ObligationProjection,
} from '../work/obligations.js';
import { capabilityOf, frontierOrder, hypothesesFor } from '../work/frontier.js';
import { integrationScenarioOf, originKindOf, workLayout, workItemId, type WorkItem } from '../work/records.js';
import { apiViewsOf, prepareAssignedCucumber, focusedScenarioFacts, defaultWriteScopeSection, iterationApiViews, onboardingOf, type DelegationBriefing, type WorkItemBriefing, type ReconciliationBriefing } from '../work/session.js';
import { localArchitectToolName, type LocalArchitectSubmission } from '../work/submission.js';
import { gateDiagnostics, passedScenarioLines, type GateAudience } from '../checks/diagnostics.js';
import { concernBindings, finishReview, requestedStartOf, reviewOutcome, sameWorkItem, type ConcernBinding } from './review-finish.js';
import { AfterHandling, assignedCount, completionBlockers, authorizedScope, evidenceFor, requiredArtifacts, bindingsOf, capabilityBlockersOf, integrationItemsDue, obligationOwedBy, obligationProjection, openRequirementsOf, pendingCorrection, verifiedRequirements, type HandlingHost } from './after-handling.js';
import { CandidateDriftError, CommittingGates, readinessAuditOutcome, writeScopePaths, type GateHost } from './committing-gate.js';
import { capturePlan, EvidenceUnavailableError, type RunInputs } from './inputs.js';
import { extractPlanScenarios, type PlanScenarioExtraction } from '../../subs/scenarios/src/extraction.js';
import type { RenderedFeatureFile } from '../../subs/scenarios/src/rendering.js';
import { RunLog, type RunEvent, type RunEventInput, type RunEventOf } from './log.js';
import { ObservationLog } from './observations.js';
import { endedOf, InvocationBounds, PortEventRecorder, type CallInFlight } from './port-events.js';
import { contextPolicyOf, defaultRunPolicy, invocationLimits, engineerBoundsOf, withProjectTimeouts, type EngineerBounds } from './policy.js';
import { captureProjectConfig, moduleTestAreas, type TestArea } from './project-config.js';
import {
  commitForMaterialization, commitForScenarios, contentHash as featureContentHash, expectedFeatureFiles, expectedFeatureHashes,
  materializationMessage, rerenderFeatureFiles, incompleteScenarios, rewordedTrailerValue, rewordingMessage, scenarioNameOf, trackedScenarios,
} from './feature-files.js';
import type { ScenarioState } from '../../subs/scenarios/src/states.js';
import { scenarioRecordSchema, scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { integrationBriefing, type IntegrationBriefing } from '../work/integration.js';
import { briefed, entryScenariosOf, type EngineerScenarios } from '../work/scenario-briefing.js';
import { failingStep, performRecovery, readinessFailureReason, recoveryFor, runReadiness, withRecovery } from './readiness.js';
import { declaredModuleDirectories } from './project-config.js';
import {
  assignmentStartingPointsOf, auditPreparationPathsOf, declaredCheckFacts, defaultWriteScopesOf, engineerBoundsFor, iterationAssignmentOf,
  knownProjectFactsOf, obligationBriefingOf, ownedTestAreasOf, unauthorizedGuardedOf, viewIdentityOf as projectViewIdentity,
} from './project-facts.js';
import { assertScratchSafe, ensureScratchRule, scratchSafetyRule, ScratchIgnoreConflictError } from '../work/scratch.js';
import {
  globalForkSourceSchema, gateAttemptId, gateAttemptSchema, invocationId, invocationOutcomeSchema, invocationSchema, lineEventSummarySchema,
  measurementSnapshotSchema, readinessAttemptSchema, recoveryId, runDirectory, runLayout, runRecordSchema, runSchemas, sessionId, snapshotId,
  type GateOperation, type Invocation, type InvocationOutcome, type LineEventSummary, type MeasurementSnapshot, type RecordRef, type RunPolicy,
  type RunRecord, type ArchitectRef, type ContinueReason, type ContinueRelation, type DegradeRelation, type ForkRelation, type ReplaceRelation,
  type RequestRelation, type SessionFinishReason, type SessionId,
} from './records.js';
import { reduceSessions, type RunSessions } from './sessions.js';
import { runSnapshot, type RunSnapshot } from './snapshot.js';
import { InvocationTranscript, recordAppend, verdictNote } from '../transcripts/recorder.js';
import { ContentStore } from '../transcripts/store.js';
import { readBody, readTranscript, TranscriptWriter } from '../transcripts/writer.js';
import { SubmissionJudge, validateAgainst, type SubmissionValidation } from './submissions.js';
import { nodeProcessGroups, WriterBlockedError, WriterOwnership, type ProcessGroups, type TreeObserver } from './writer.js';
import { HarnessSessionOperations, ReusableSessionUnavailableError, readSessionPointReference, settleSessionEquipment, type HarnessTaskBrief } from './session-operations.js';
import { deliveredSupportPaths, type TaskEnvironment, type TaskKind } from '../prompts/tasks.js';
import { processGroupIdentity } from '../../subs/evidence/src/run-command.js';

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
  | 'debug-exchange-admitted'
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
  | 'analysis-evidence-staged'
  | 'work-orientation-recorded'
  | 'context-selection-recorded'
  | 'context-package-append-requested'
  | 'context-package-appended'
  | 'readiness-attempted'
  | 'scratch-setting-up'
  | 'scratch-rule-appended'
  | 'scratch-committed'
  | 'scratch-setup-complete'
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
  | 'obligation-reported'
  | 'iteration-assigned'
  | 'writer-acquired'
  | 'writer-process-registered'
  | 'writer-released'
  | 'nonfunctional-phase-started'
  | 'nonfunctional-repair-assigned'
  | 'nonfunctional-repair-committed'
  | 'nonfunctional-assessed'
  | 'capability-coordinator-resumed'
  | 'capability-verification-started'
  | 'capability-source-captured'
  | 'capability-exchange-opened'
  | 'capability-exchange-answered'
  | 'capability-gate-recorded'
  | 'capability-handed-back'
  | 'capability-assignment-settled'
  | 'capability-assigned'
  | 'candidate-prepared'
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
  /** The history a run's delivered change is read from: Git's objects by default, its answers kept; tests script it like Git. */
  readonly changeHistory?: ChangeHistory | undefined;
  /** External index/blob reads for provisional capability snapshots. */
  readonly provisionalSourceGit?: ProvisionalSourceGit | undefined;
  /**
   * The provider's committed audit: its configuration, read at a commit, and
   * the configured audit every committing gate and readiness request.
   */
  readonly configuredAudit: ConfiguredAuditPort;
  /** The policy the run captures. Without one it is the hardcoded default over this project. */
  readonly policy?: ((projectRoot: string) => RunPolicy) | undefined;
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
  /** Manual runs, which `step run` and `session` write: neither executed nor recovered, and left exactly as they are. */
  readonly manual: string[];
}

const key = (planId: string, runId: string) => `${planId}/${runId}`;

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
  /** The directory the architect's own session runs from, which a fork of it keeps. */
  readonly workingDirectory: string;
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

/** The durable evidence owner and the architect whose completion is assessed. */
interface ReconciliationOwner {
  readonly id: string;
  readonly role: 'local-architect' | 'capability-architect';
  readonly request?: string;
  readonly provider?: string;
  readonly completion?: { readonly session: SessionId; readonly ref: string; readonly invocation: string };
}

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

interface ClosedIterationOutcome {
  readonly kind: 'closed';
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
    /** The files the fake must be injected in, as the engineer named them. */
    readonly injectionSites?: readonly string[] | undefined;
    readonly invocation: string;
  } | undefined;
}

interface SuspendedCapabilityOutcome {
  readonly kind: 'capability-needed';
  readonly summary: string;
  readonly need: CapabilityNeedInput;
  readonly invocation: string;
  readonly session: SessionId;
  readonly point: string;
}

type IterationOutcome = ClosedIterationOutcome | SuspendedCapabilityOutcome;

class ScratchSetupRefusal extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ScratchSetupRefusal';
  }
}

class Run implements RunnerRun {
  restoring = false;
  readonly restoredInvocations = new Set<string>();
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
  /** The prepared request remains on its driver stack; no invocation or writer exists yet. */
  debugPause: BreakpointState | undefined;
  debugPrepared: {
    inspect(): Promise<DebugInspection['input']>;
    exchange(text: string): Promise<InvocationResult<unknown>>;
    resume(text: string | undefined): void;
    held(): boolean;
  } | undefined;
  /** Settles when the run's driver has nothing left to do. */
  done: Promise<void> = Promise.resolve();
  /** The run's review readers, once it reviews; undefined for a run whose policy requests none. */
  reviews: ReviewQueue | undefined;
  /** Patch preparation belongs to its review request and stops with its readers. */
  readonly reviewPreparations = new Map<string, AbortController>();
  /** Why the run stopped its readers, which a reader stopped for it records as its attempt's reason. */
  readerStop: NotVerifiedReason | undefined;
  /** When the run's reviews must be settled by, once its final settlement began; epoch milliseconds. */
  settleDeadline: number | undefined;
  /** The design orientations being made, by key, so that two attempts of one key make it once. */
  readonly orienting = new Map<string, Promise<ReviewOrientation>>();
  /** The commit-and-audit effect in flight, which the run's terminal event waits for. */
  gating: Promise<unknown> | undefined;
  /** Owned readiness work: stopping aborts it and awaits process settlement before a terminal event. */
  readiness: { controller: AbortController; settled: Promise<void> } | undefined;
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

  get jobId(): string { return this.record.jobId; }
  get planId(): string { return this.record.planId; }
  get createdAt(): string { return this.record.createdAt; }
  get policy(): RunRecord['policy'] { return this.record.policy; }
  get baselineMeasurement(): RecordRef | null { return 'measurement' in this.record.baseline ? this.record.baseline.measurement : null; }

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
  /**
   * Write scopes captured while an assignment was judged, by the accepted
   * body they were captured for, so the assignment applies the scope its
   * submission was accepted with instead of capturing it a second time.
   */
  private readonly preparedScopes = new WeakMap<AssignmentBody, WriteScope>();
  private readonly commands = new CommandLedger();
  private readonly commandMutex = new Mutex();
  private sessionOperations: Promise<HarnessSessionOperations> | undefined;
  private closed = false;
  private closing: Promise<void> | undefined;

  private readonly git: GitService;
  private readonly candidates: CandidateSource;
  /** What the run queries read each run's delivered change from. */
  readonly changeHistory: ChangeHistory;
  get candidateSource(): CandidateSource { return this.candidates; }

  private constructor(private readonly options: RunServiceOptions, private readonly workflow: CapabilityWorkflow | null) {
    this.git = options.git ?? gitService;
    this.candidates = options.candidates ?? gitCandidateSource;
    this.changeHistory = options.changeHistory ?? cachedChangeHistory(gitChangeHistory);
    this.runner = new InvocationRunner<Run>(this.runnerHost());
    this.gates = new CommittingGates<Run>(this.gateHost());
    this.handling = new AfterHandling<Run>(this.handlingHost());
  }

  /** The handling after an accepted submission, which a manual run's `after` shares. */
  private readonly handling: AfterHandling<Run>;

  /** What the after-handling asks of an implementation run. */
  private handlingHost(): HandlingHost<Run> {
    const service = this;
    return {
      get projectRoot() { return service.projectRoot; },
      get git() { return service.git; },
      get candidates() { return service.candidates; },
      get gates() { return service.gates; },
      write: (run, input, records) => service.write(run, input, records),
      afterWrite: (write, runId) => service.afterWrite(write, runId),
      warn: text => service.warn(text),
      ignoring: run => service.ignoring(run),
      fail: (run, reason, detail, records) => service.fail(run, reason, detail, records),
      closeCorrection: (run, workItem, closing) => service.closeCorrection(run, workItem, closing),
      citeCurrentDeviations: (run, elements) => service.citeCurrentDeviations(run, elements),
      orientationIdentity: run => ({ packageHash: run.record.prompts.reviewer?.hash ?? null, agent: run.record.agent, model: service.options.model ?? null }),
      wakeReviews: run => run.reviews?.wake(),
    };
  }

  /** The committing gates of every run, which a manual run's gate shares. */
  private readonly gates: CommittingGates<Run>;

  /** What a committing gate asks of an implementation run. */
  private gateHost(): GateHost<Run> {
    const service = this;
    return {
      get projectRoot() { return service.projectRoot; },
      get git() { return service.git; },
      get ramify() { return service.options.ramify; },
      get configuredAudit() { return service.options.configuredAudit; },
      write: (run, input, records) => service.write(run, input, records),
      afterWrite: (write, runId) => service.afterWrite(write, runId),
      warn: text => service.warn(text),
      harnessFiles: run => service.harnessFiles(run),
      // The provider's definition as the run captured it, whatever the candidate commit holds.
      auditDefinition: async run => {
        const captured = run.record.auditConfiguration;
        if (captured === undefined || 'invalid' in captured) {
          throw new Error(`The run carries no committed audit definition: ${captured === undefined ? 'none was captured' : captured.invalid}`);
        }
        return captured.config;
      },
      previewCandidateTree: () => service.previewCandidateTree(),
      get candidates() { return service.candidates; },
      refreshIndex: run => service.refreshIndex(run),
      ignoring: run => service.ignoring(run),
    };
  }

  /** The invocation runner every role's invocation of every run goes through. */
  private readonly runner: InvocationRunner<Run>;

  /** What only an implementation run knows, which the invocation runner asks of it. */
  private runnerHost(): RunnerHost<Run> {
    const service = this;
    return {
      get projectRoot() { return service.projectRoot; },
      get git() { return service.git; },
      get model() { return service.options.model ?? null; },
      now: () => service.now(),
      warn: text => service.warn(text),
      afterWrite: (write, runId) => service.afterWrite(write, runId),
      operations: agent => service.operations(agent),
      openedOperations: () => service.sessionOperations,
      ignoring: run => service.ignoring(run),
      base: run => service.accepted(run),
      refusal: run => service.invocationRefusal(run),
      refused: async (run, reason, reader) => {
        if (!reader) await service.fail(run, 'limit-exceeded', reason);
      },
      taskBrief<T>(run: Run, request: InvocationRequest<T>, spec: SessionSpec, limits: RunPolicy['limits']) {
        return service.taskBrief(run, request, spec, limits);
      },
      async restore<T>(run: Run, agent: AgentPort, request: InvocationRequest<T>) {
        return run.restoring ? service.restoreInvocation(run, agent, request) : null;
      },
      previewCandidateTree: () => service.previewCandidateTree(),
    };
  }

  /**
   * Why the run starts no further invocation: the run-wide bounds, read
   * before an invocation is started, so a run that has spent them starts
   * nothing more. The absolute bound is checked at each invocation
   * boundary; an invocation already running is bounded by its own limits.
   */
  private invocationRefusal(run: Run): string | null {
    const limits = run.record.policy.limits;
    const invocations = run.log.count('invocation-started');
    // The time the run waited for a person at its review stop is not its own.
    const now = this.now().getTime();
    const age = now - Date.parse(run.record.createdAt) - callerPauseMs(run.log.events, now);
    if (invocations + 1 > limits.maxInvocationsPerRun) return `The run has made ${invocations} invocations; the policy allows ${limits.maxInvocationsPerRun}`;
    if (age > limits.runAbsoluteMs) return `The run has run for ${age} ms; the policy allows ${limits.runAbsoluteMs}`;
    return null;
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
    if (options.policy !== undefined) throw new Error('Production run policy is fixed; a caller cannot inject a policy');
    const service = new RunService(options, createCapabilityWorkflow());
    const recovery = await service.load();
    return { service, recovery };
  }

  /** Current-policy scripted lifecycle controls exercise the ordinary and narrow contract paths without launching capability coordination. */
  static async openForScriptedLifecycleTests(options: RunServiceOptions): Promise<{ service: RunService; recovery: RunRecoveryReport }> {
    const service = new RunService(options, null);
    const recovery = await service.load();
    return { service, recovery };
  }

  /** Internal test composition for the same factory production now uses. */
  static async openForCapabilityTests(options: RunServiceOptions, factory: () => CapabilityWorkflow): Promise<{ service: RunService; recovery: RunRecoveryReport }> {
    const workflow = factory();
    if (workflow.version !== 'capability-coordination/1') throw new Error('Unknown capability workflow factory');
    const service = new RunService(options, workflow);
    const recovery = await service.load();
    return { service, recovery };
  }

  get projectRoot(): string {
    return this.options.projectRoot;
  }

  /** No candidate is read while Git could include scratch in its tree. */
  private async previewCandidateTree(): ReturnType<GitService['previewCandidateTree']> {
    await assertScratchSafe(this.projectRoot, await declaredModuleDirectories(this.projectRoot), this.git);
    return this.git.previewCandidateTree(this.projectRoot);
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

  /** One run-log write, serialized with every other, as the invocation runner makes it. */
  private write(run: Run, input: RunEventInput, records: readonly CommitRecord[] = [], at?: Date): Promise<'committed' | 'already-committed' | 'ended'> {
    return this.runner.write(run, input, records, at);
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
      if (run.log.terminal || this.closed || (run.stopRequested && terminal.type !== 'job-stopped' && terminal.type !== 'job-interrupted')) return 'ended';
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

  private continuationOf(run: Run, session: SessionId, reason: ContinueReason): ContinueRelation {
    return this.runner.continuationOf(run, session, reason);
  }

  private transcriptOf(run: Run, session: SessionId): TranscriptWriter {
    return this.runner.transcriptOf(run, session);
  }

  private invocationTranscript(run: Run, session: SessionId, invocation: string, observations?: ObservationLog): InvocationTranscript {
    return this.runner.invocationTranscript(run, session, invocation, observations);
  }

  private sessionsOf(run: Run): RunSessions | undefined {
    return this.runner.sessionsOf(run);
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
      deadline: request => this.rawReviewDeadline(run, request),
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
    return run.reviews === undefined ? this.rawReviewDeadline(run, id) : run.reviews.deadline(id);
  }

  private rawReviewDeadline(run: Run, id: string): number | null {
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
    const assigned = new Set([...run.log.all('iteration-assigned').map(event => event.data.iteration),
      ...run.log.all('capability-assigned').map(event => event.data.assignment)]);
    return run.log.all('iteration-closed').flatMap(event => {
      if (event.data.outcome !== 'accepted' || event.data.gate === null || event.data.commit === null || !assigned.has(event.data.iteration)) return [];
      const assignment = committedRecords(run.log.ledger.replay()).assignments.get(event.data.iteration);
      return [{ workItem: assignment?.coordination?.kind === 'capability-task' ? assignment.coordination.id : event.data.workItem,
        iteration: event.data.iteration, gate: event.data.gate, commit: event.data.commit }];
    });
  }

  /**
   * A package with every plan deviation recorded so far: by default the
   * assessment package, every non-functional and fixed element; otherwise
   * the elements an investigation, a repair or an unresolved fork reads.
   */
  private planPackage(run: Run, catalog: ElementCatalog, elements: readonly string[] = assessedElements(catalog)): string {
    const planDeviations = this.planDeviationsOf(run);
    const cited = citePackage(catalog, planDeviations, elements, planDeviations.map(deviation => deviation.id));
    if ('missing' in cited) throw new EvidenceUnavailableError(`The non-functional package cites IDs the run does not hold: ${cited.missing.join(', ')}`);
    return cited.text;
  }

  /** The plan deviations recorded after a package, rendered by the package creator for a local architect's brief. */
  private laterDeviations(run: Run, catalog: ElementCatalog, pinned: readonly string[]): { readonly deviations?: string } {
    const planDeviations = this.planDeviationsOf(run);
    const later = planDeviations.filter(deviation => !pinned.includes(deviation.id)).map(deviation => deviation.id);
    if (later.length === 0) return {};
    const cited = citePackage(catalog, planDeviations, [], later);
    if ('missing' in cited) throw new EvidenceUnavailableError(`A plan deviation amends IDs the run does not hold: ${cited.missing.join(', ')}`);
    return { deviations: cited.text };
  }

  /** The frozen catalog of an accepted analysis; its absence is an input the caller lacks. */
  private async frozenCatalog(run: Run): Promise<ElementCatalog> {
    const evidence = await readAcceptedEvidence(run.directory, run.record, run.log.events);
    if (evidence.status === 'unavailable') throw new EvidenceUnavailableError(evidence.reason);
    return evidence.catalog;
  }

  /** The run's plan deviations as every package renders them, in recorded order. */
  private planDeviationsOf(run: Run): PackageDeviation[] {
    return this.deviationsOf(run).map(packageDeviation);
  }

  /** Cite elements with every plan deviation recorded so far. */
  private async citeCurrentDeviations(run: Run, elements: readonly string[]): Promise<PackageCitation> {
    const planDeviations = this.planDeviationsOf(run);
    const cited = citePackage(await this.frozenCatalog(run), planDeviations, elements, planDeviations.map(deviation => deviation.id));
    if ('missing' in cited) throw new EvidenceUnavailableError(`The package cites IDs the run does not hold: ${cited.missing.join(', ')}`);
    return cited.citation;
  }

  /** Render a cited package again from the frozen catalog and the record's IDs alone. */
  private async packageText(run: Run, cited: PackageCitation): Promise<string> {
    const delivered = deliverPackage(await this.frozenCatalog(run), this.planDeviationsOf(run), cited);
    if (delivered.status === 'unavailable') throw new EvidenceUnavailableError(delivered.reason);
    return delivered.text;
  }

  /** A work item's current selection: the latest one recorded, which supersedes any earlier. */
  private async currentSelection(run: Run, workItem: string) {
    const event = run.log.all('context-selection-recorded').filter(entry => entry.data.workItem === workItem).at(-1);
    if (event === undefined) return null;
    const recorded = await readRecordedContextSelection(run.directory, event, await this.frozenCatalog(run), this.planDeviationsOf(run));
    if (recorded.status === 'unavailable') throw new EvidenceUnavailableError(recorded.reason);
    return { event, ...recorded };
  }

  /** A record body as the log committed it, never the materialized file. */
  private committedBody(run: Run, path: string): unknown {
    return committedBody(run, path);
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
    const recovered = await this.recoverAcceptedReview(run, request, state);
    if (recovered !== null) return recovered;
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
    if (request.inputsUnavailable !== undefined) return await unavailable(request.inputsUnavailable) === 'committed';
    if (kind === 'design' && request.guidance.length === 0) {
      return await unavailable(request.forkPoint.kind === 'unavailable' ? request.forkPoint.reason : 'No design guidance was selected') === 'committed';
    }
    let snapshot: CandidateSnapshot;
    let assignmentPackage: string | undefined;
    let guidance: CapturedInput[] = [];
    try {
      snapshot = await openCandidateSnapshot(this.candidates, this.projectRoot, { commit: request.key.candidate, base: request.base });
    } catch (error) {
      return await unavailable(`The audited candidate could not be read: ${message(error)}`) === 'committed';
    }
    try {
      // The question's inputs are read again and must be the bytes the
      // request bound; anything else is not the question it asked.
      if (request.source !== undefined) assignmentPackage = await this.packageText(run, request.source);
      if (kind === 'design') {
        const texts = await Promise.all(request.guidance.map(entry => this.candidates.readBlob(this.projectRoot, request.key.candidate, entry.ref)));
        guidance = boundInputs(request.guidance.map((entry, index) => ({ ref: entry.ref, hash: sha256(texts[index]!), text: texts[index]! })), request.guidance);
      }
    } catch (error) {
      return await unavailable(`The ${kind} review's captured inputs could not be read as recorded: ${message(error)}`) === 'committed';
    }
    let start: Awaited<ReturnType<RunService['reviewStart']>>;
    try { start = await this.reviewStart(run, agent, loaded, request, guidance); }
    catch (error) { return await unavailable(`The recorded review source is unavailable: ${message(error)}`) === 'committed'; }
    // An orientation made first may have met a stop or the deadline, and
    // its work item's deadline may have settled the request meanwhile.
    if (this.closed || this.ignoring(run) || run.reviews?.accepting !== true) return false;
    if (reviewStateOf(run.log.events).get(id)?.settledBy !== null) return false;

    const pendingBindings = await this.handling.reviewPendingBindings(run, request, snapshot);
    const assignment = iterationAssignmentSchema.safeParse(this.committedBody(run, request.assignment));
    const reviewedResult = committedRecords(run.log.ledger.replay()).results.get(request.key.iteration);
    const discovery = assignment.success ? startingPointsSection([
      this.assignmentStartingPoints(run, assignment.data),
      await this.engineerStartingPoints(run, assignment.data,
        reviewedResult?.gate === request.gate && reviewedResult.commit === request.key.candidate ? reviewedResult : undefined,
        request.gate, request.key.candidate),
    ], { projectRoot: this.projectRoot, snapshot, allows: path => nonfunctionalSourceAllows(path, ['.']) }) : undefined;
    const held = selectCheckFindings(checkFindingStateOf(run.log.ledger), { kind: 'list', owner: { kind: 'work-item', workItem: request.workItem }, select: 'all', limit: 100 });
    // Binding reads may yield while this request is stopped or settled. Do
    // not register preparation after its cancellation sweep has already run.
    if (this.ignoring(run) || run.reviews?.accepting !== true || reviewStateOf(run.log.events).get(id)?.settledBy !== null) return false;
    // The question's message inputs, captured once: the review step is built from these.
    const intent = assignment.success ? {
      goal: assignment.data.goal, approach: assignment.data.approach, completionEvidence: assignment.data.completionEvidence,
      scopeRationale: assignment.data.scope.rationale,
      testAreas: assignment.data.scope.resolved.ownership.modules.filter(module => assignment.data.gate.tests.exactOwners.includes(module.id)
        || assignment.data.gate.tests.subtrees.some(owner => module.id === owner || module.id.startsWith(`${owner}/`)))
        .map(module => posix.join(module.directory, 'src/tests')),
    } : null;
    const checkFindings = held.ok && 'items' in held.view ? held.view.items.map(item => ({ id: item.id, standing: item.standing, title: item.title })) : [];
    const setup = kind === 'design' ? undefined : await this.checkInputSection(run, snapshot);
    const planDocument = snapshot.entries.get(planPath(run.record.planId))?.kind === 'file' ? planPath(run.record.planId) : null;
    let prepared: PreparedReview;
    const preparation = new AbortController();
    const preparationStarted = Date.now();
    const preparationTimer = setTimeout(() => preparation.abort(new Error('Review patch preparation exceeded its attempt bound')), policy.attemptMs);
    preparationTimer.unref?.();
    run.reviewPreparations.set(id, preparation);
    try {
      prepared = await prepareReview({
        source: this.candidates,
        projectRoot: this.projectRoot,
        signal: preparation.signal,
        maxConcerns: policy.maxConcerns,
        briefing: {
          request: {
            id: request.id, key: { kind, iteration: request.key.iteration, candidate: request.key.candidate },
            workItem: request.workItem, base: request.base, tree: request.tree, gate: request.gate, guidance: request.guidance,
          },
          snapshot,
          pendingBindings,
          assignment: intent,
          checkFindings,
          ...(assignmentPackage === undefined ? {} : { package: assignmentPackage }),
          ...(setup === undefined ? {} : { setup }),
          planDocument,
        },
      });
    }
    catch (error) {
      if (this.ignoring(run) || run.reviews?.accepting !== true || reviewStateOf(run.log.events).get(id)?.settledBy !== null) return false;
      return await unavailable(`The audited candidate's patches could not be collected: ${message(error)}`) === 'committed';
    } finally {
      clearTimeout(preparationTimer);
      run.reviewPreparations.delete(id);
    }
    if (this.ignoring(run) || run.reviews?.accepting !== true || reviewStateOf(run.log.events).get(id)?.settledBy !== null) return false;
    const workspace = join(dirname(reviewLayout.attempt(attempt)), 'workspace');
    await mkdir(run.path(workspace), { recursive: true });

    // The question is built from its inputs by the reviewer step's own
    // constructor, which `step render` uses too. The prepared patches, tools
    // and validator are the reviews child's, over the same candidate.
    let step: ReturnType<typeof constructReviewStep>;
    try {
      const reviewInputs = validateReviewInputs({
        schema: stepInputsSchemaId, role: 'reviewer', question: kind, run: { planId: run.record.planId, runId: run.record.jobId },
        work: { workItem: request.workItem, iteration: request.key.iteration }, attempt: state.attempts.length + 1,
        capabilityWorkflow: this.workflow !== null, limits: run.record.policy.limits, context: contextPolicyOf(run.record.policy, 'reviewer'),
        request, snapshotTree: snapshot.tree,
        briefing: {
          assignment: intent, checkFindings, ...(assignmentPackage === undefined ? {} : { package: assignmentPackage }), planDocument,
          pendingBindings: JSON.parse(JSON.stringify(pendingBindings)) as unknown[], ...(setup === undefined ? {} : { setup }),
          diffPayload: prepared.candidateDiff, changes: snapshot.changes.map(change => ({ status: change.status, path: change.path })),
          directories: (intent?.testAreas ?? []).filter(area => snapshot.directories.has(area)),
        },
        ...(discovery === undefined ? {} : { discovery }),
        workspace: { run: workspace },
        bounds: { absoluteMs: Math.max(1, policy.attemptMs - (Date.now() - preparationStarted)) },
        start: start.start.mode === 'fork' && start.fork !== undefined && 'invocation' in start.fork.from
          ? { kind: 'fork', session: start.fork.from.session, invocation: start.fork.from.invocation, point: start.start.from, reason: start.fork.reason, briefs: [...start.fork.briefs] }
          : { kind: 'fresh', ...(start.degraded === undefined ? {} : { degraded: start.degraded }) },
      });
      step = constructReviewStep(reviewInputs, { projectRoot: this.projectRoot, packages });
    } catch (error) {
      return await unavailable(`The ${kind} review cannot be constructed from its inputs: ${message(error)}`) === 'committed';
    }

    let started: { invocation: string; session: SessionId; at: string } | undefined;
    /** Set when the request was settled before this attempt's start could be recorded. */
    let fenced = false;
    const result = await this.runInvocation<ReviewSubmission>(run, agent, {
      role: step.role,
      brief: step.brief,
      context: step.context,
      stepInputs: step.before.inputs, consultationPackages: packages,
      fallback: this.stepFallback(step.inputs, packages),
      work: step.work,
      attempt: step.attempt,
      loaded: step.loaded,
      systemPrompt: step.systemPrompt,
      prompt: step.prompt,
      start: start.start,
      ...(step.fork === undefined ? {} : { fork: step.fork }),
      ...(start.degraded === undefined ? {} : { degraded: start.degraded }),
      toolName: step.submission.toolName,
      description: step.submission.description,
      inputSchema: step.submission.inputSchema,
      submissionSchema: step.submission.submissionSchema,
      validate: prepared.validate,
      keep: () => finished('work-closed'),
      scope: { write: null, measurement: null, size: null },
      reader: true,
      workingDirectory: step.equipment.workingDirectory,
      absoluteMs: step.bounds.absoluteMs,
      equip: () => ({ builtinTools: [...step.equipment.builtinTools], tools: [...prepared.tools.definitions] }),
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
      : await this.concernBindings(run, request, snapshot, prepared.tools, submission);
    const committed = await this.finishReview(run, request, attemptBody, outcome.result, settles, submission, bindings);
    return committed === 'committed';
  }

  /** Finish an accepted reader turn whose terminal review record was interrupted.
   * Its submitted bytes and settled outcome are durable; the candidate is
   * immutable, so concern grounds are recovered from that same audited tree. */
  private async recoverAcceptedReview(
    run: Run, request: ReviewRequest, state: ReturnType<typeof reviewStateOf> extends ReadonlyMap<string, infer R> ? R : never,
  ): Promise<boolean | null> {
    const pending = state.attempts.at(-1);
    if (pending?.started === null || pending?.started === undefined || pending.finished !== null) return null;
    const invocation = pending.started.invocation;
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === invocation);
    if (ended?.data.ended !== 'submitted') return null;
    const outcome = invocationOutcomeSchema.safeParse(this.committedBody(run, runLayout.outcome(invocation)));
    const bytes = await readIfExists(run.path(runLayout.submission(invocation)));
    if (ended.data.submission === null || bytes === undefined || sha256(bytes) !== ended.data.submission ||
      !outcome.success || outcome.data.submission?.hash !== ended.data.submission ||
      outcome.data.disposition !== 'applied' || !outcome.data.settled.confirmed || outcome.data.session === undefined) {
      await this.fail(run, 'recovery-exhausted', `Reviewer ${invocation} has no authenticated accepted submission for ${pending.id}`);
      return false;
    }
    const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const { schema: _schema, ...body } = raw;
    const parsed = reviewSubmissionSchema.safeParse(body);
    if (raw.schema !== 'ramify-agent.review-submission/1' || !parsed.success) {
      await this.fail(run, 'recovery-exhausted', `Reviewer ${invocation} has an invalid accepted submission for ${pending.id}`);
      return false;
    }
    const submission = parsed.data;
    const snapshot = await openCandidateSnapshot(this.candidates, this.projectRoot,
      { commit: request.key.candidate, base: request.base });
    const read = new Map<string, string>();
    for (const concern of submission.concerns) {
      if (concern.ground === null) continue;
      const resolved = resolveSnapshotPath(snapshot, concern.ground.path);
      if (!resolved.ok || resolved.kind !== 'file') {
        await this.fail(run, 'recovery-exhausted', `Reviewer ${invocation}'s accepted ground is unavailable in ${request.key.candidate}`);
        return false;
      }
      const text = await this.candidates.readBlob(this.projectRoot, request.key.candidate, resolved.path);
      read.set(resolved.path, `sha256:${sha256(text)}`);
    }
    const bindings = submission.concerns.length === 0 ? []
      : await this.concernBindings(run, request, snapshot, { read: () => read }, submission);
    const result: ReviewResult = submission.missing.length === 0
      ? { result: 'complete', inspected: submission.inspected.map(path => ({ path })), concerns: submission.concerns.length }
      : { result: 'partial', inspected: submission.inspected.map(path => ({ path })),
        missing: submission.missing.map(entry => ({ path: entry.path, reason: entry.reason })), concerns: submission.concerns.length };
    const previous = state.attempts.at(-2);
    const attempt = {
      id: pending.id, request: request.id, queuedAt: previous?.finished?.at ?? state.recordedAt,
      requestedStart: requestedStartOf(request),
      startedAt: pending.started.at, invocation, session: pending.started.session,
      actualStart: outcome.data.session.mode === 'fork' ? 'fork' as const : 'fresh' as const,
    };
    return await this.finishReview(run, request, attempt, result, true, submission, bindings) === 'committed';
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
  private async concernBindings(run: Run, request: ReviewRequest, snapshot: CandidateSnapshot, tools: Pick<SnapshotTools, 'read'>, submission: ReviewSubmission): Promise<ConcernBinding[]> {
    return concernBindings(run, { projectRoot: this.projectRoot, planId: run.record.planId, candidates: this.candidates, warn: text => this.warn(text) },
      request, snapshot, tools, submission);
  }

  /**
   * Where one attempt's reviewer starts. Code review starts fresh. Scope
   * review forks the local architect at the point that produced its
   * assignment, and design review forks the orientation of its guidance,
   * made first where none exists yet. Only the existing scope recovery may
   * use the complete recorded assignment packet. Unavailable orientation
   * or session history uses the ordinary fresh review task.
   */
  private async reviewStart(run: Run, agent: AgentPort, loaded: LoadedPackage, request: ReviewRequest, guidance: readonly CapturedInput[]): Promise<{
    readonly start: SessionStart;
    readonly fork?: ForkRelation | undefined;
    readonly degraded?: { readonly requested: 'fork'; readonly reason: string } | undefined;
  }> {
    const fresh = (reason: string) => ({ start: { mode: 'fresh' } as const, degraded: { requested: 'fork' as const, reason } });
    const point = request.forkPoint;
    if (point.kind === 'none') return { start: { mode: 'fresh' } };
    if (point.kind === 'unavailable') {
      if (request.key.kind === 'scope') return fresh(point.reason);
      throw new EvidenceUnavailableError(point.reason);
    }
    let from: { readonly session: SessionId; readonly invocation: string; readonly ref: string; readonly reason: 'scope-review' | 'design-orientation' };
    if (point.kind === 'session') {
      const assigned = run.log.all('iteration-assigned').find(event => event.data.iteration === request.key.iteration);
      const taskAssigned = run.log.all('capability-assigned').find(event => event.data.assignment === request.key.iteration);
      const invocation = assigned?.data.invocation ?? taskAssigned?.data.invocation;
      if (invocation === undefined) throw new EvidenceUnavailableError(`No assignment of ${request.key.iteration} is recorded`);
      from = { session: point.session as SessionId, invocation, ref: point.ref, reason: 'scope-review' };
    } else {
      const orientation = await this.orientation(run, agent, loaded, request, guidance);
      if (orientation.outcome !== 'oriented' || orientation.session === null || orientation.invocation === null || orientation.ref === null) {
        return fresh(`The design orientation is unavailable: ${orientation.reason ?? 'no retained point'}`);
      }
      from = { session: orientation.session as SessionId, invocation: orientation.invocation, ref: orientation.ref, reason: 'design-orientation' };
    }
    const source = this.sessionsOf(run)?.get(from.session);
    if (source === undefined) return fresh('The captured review session is unavailable');
    if (!source.invocations.includes(from.invocation) || source.awaiting === from.invocation) throw new EvidenceUnavailableError(`${from.session} has not reached the end of ${from.invocation}`);
    const outcome = committedRecords(run.log.ledger.replay()).outcomes.get(from.invocation);
    if (outcome?.session?.ref !== from.ref) throw new EvidenceUnavailableError('The captured review source differs from its accepted invocation point');
    if (!await (await this.operations(agent)).hasPoint(run.record.jobId, from.ref)) {
      if (from.reason === 'scope-review') return fresh('The captured assignment point is unavailable; reconstructing the complete scope review packet');
      return fresh('The recorded design orientation is unavailable');
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
   * too, so the run does not pay for it twice; its dependent design reviews
   * use their ordinary fresh task inputs.
   */
  private async orientation(run: Run, agent: AgentPort, loaded: LoadedPackage, request: ReviewRequest, guidance: readonly CapturedInput[]): Promise<ReviewOrientation> {
    const key = request.forkPoint.kind === 'orientation' ? request.forkPoint.key : '';
    const recorded = this.recordedOrientation(run, key);
    if (recorded !== undefined) return recorded;
    if (run.log.all('review-orientation-recorded').some(event => event.data.key === key)) return {
      schema: 'ramify-agent.review-orientation/1', key, guidance: request.guidance, request: request.id,
      outcome: 'failed', session: null, invocation: null, ref: null, summary: null, reason: 'The recorded design orientation is unreadable',
    };
    let making = run.orienting.get(key);
    if (making === undefined) {
      making = this.orient(run, agent, loaded, request, key, guidance);
      run.orienting.set(key, making);
    }
    return await making;
  }

  private recordedOrientation(run: Run, key: string): ReviewOrientation | undefined {
    if (run.log.all('review-orientation-recorded').every(event => event.data.key !== key)) return undefined;
    try {
      const parsed = reviewOrientationSchema.safeParse(this.committedBody(run, reviewLayout.orientation(key)));
      return parsed.success ? parsed.data : undefined;
    } catch { return undefined; }
  }

  private async orient(run: Run, agent: AgentPort, loaded: LoadedPackage, request: ReviewRequest, key: string, guidance: readonly CapturedInput[]): Promise<ReviewOrientation> {
    const policy = run.record.policy.reviews!;
    const workspace = join(dirname(reviewLayout.orientation(key)), key.slice(0, 16));
    await mkdir(run.path(workspace), { recursive: true });
    // The orientation is its own invocation, built from its inputs by its
    // own constructor, which `step render` uses too.
    const step = constructDesignOrientationStep({
      schema: stepInputsSchemaId, role: 'reviewer', question: 'design-orientation', run: { planId: run.record.planId, runId: run.record.jobId },
      work: { workItem: request.workItem, iteration: request.key.iteration }, attempt: 1, capabilityWorkflow: this.workflow !== null,
      limits: run.record.policy.limits, context: contextPolicyOf(run.record.policy, 'reviewer'), request: request.id, key,
      guidance: guidance.map(({ ref, hash, text }) => ({ ref, hash, text })), workspace: { run: workspace }, bounds: { absoluteMs: policy.attemptMs },
      architectView: this.architectViewInputs(run), start: { kind: 'fresh' },
    }, { projectRoot: this.projectRoot, packages: new Map([['reviewer', loaded]]) });
    const result = await this.runInvocation<OrientationSubmission>(run, agent, {
      role: step.role,
      brief: step.brief,
      context: step.context,
      stepInputs: step.before.inputs,
      work: step.work,
      attempt: step.attempt,
      loaded: step.loaded,
      systemPrompt: step.systemPrompt,
      prompt: step.prompt,
      start: { mode: 'fresh' },
      toolName: step.submission.toolName,
      description: step.submission.description,
      inputSchema: step.submission.inputSchema,
      submissionSchema: step.submission.submissionSchema,
      validate: step.validate,
      // The orientation is retained: every design review of its key forks it.
      keep: ended => (ended === 'submitted' ? kept : finished('not-kept')),
      scope: { write: null, measurement: null, size: null },
      reader: true,
      workingDirectory: step.equipment.workingDirectory,
      absoluteMs: step.bounds.absoluteMs,
      equip: () => ({ builtinTools: [...step.equipment.builtinTools], tools: [] }),
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
    return finishReview(run, () => this.now(), request, attempt, result, settles, submission, bindings);
  }

  /** Finishes unsettled requests. A durable accepted reader submission is
   * completed first; only a turn with no accepted result becomes not verified. */
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
      const accepted = await this.recoverAcceptedReview(run, parsed.data, state);
      if (accepted !== null) {
        if (accepted) finishedIds.push(state.attempts.at(-1)!.id);
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
    for (const request of unsettled) run.reviewPreparations.get(request.id)?.abort();
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
   * and has not is recorded once. An accepted reader submission is replayed;
   * every request still unsettled is finished as not verified, since an
   * interrupted run starts no new reader. An unaccepted attempt whose reader
   * was running lost its session with the harness.
   */
  private async recoverReviews(run: Run): Promise<string[]> {
    if (run.record.policy.reviews === undefined) return [];
    const recovered: string[] = [];
    for (const closed of this.reviewableClosings(run)) {
      for (const request of await this.handling.requestReviews(run, closed)) recovered.push(`review request ${request} of ${closed.iteration}`);
    }
    const finishedIds = await this.finishUnsettledReviews(run, (_request, running) => (running
      ? { reason: 'execution-failed', detail: 'The harness stopped while this attempt ran; its reader\'s session was lost with it' }
      : { reason: 'stopped', detail: 'The harness stopped before this review ran; a recovered run is interrupted and runs nothing more' }));
    for (const attempt of finishedIds) recovered.push(`review attempt ${attempt}, finished as not verified`);
    return recovered;
  }

  /** The run's review requests and coverage, from its log; undefined for an unknown run. */
  reviews(planId: string, runId: string, workItem?: string): { readonly coverage: ReviewCoverage; readonly requests: ReturnType<typeof unsettledRequests> } | undefined {
    this.refuseEarlierPolicy(planId, runId);
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
    return pendingCorrection(run.log, workItem);
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
  private async reconcileWorkItem(run: Run, agent: AgentPort, loaded: LoadedPackage, item: WorkItem, parent: ParentSession,
    owner: ReconciliationOwner = { id: item.id, role: 'local-architect' }): Promise<Reconciled | null> {
    const limit = run.record.policy.limits.reconciliationRoundsPerWorkItem ?? defaultReconciliationRounds;
    const minimum = run.record.policy.limits.laterRoundMinimumRisk ?? 'medium';
    for (;;) {
      if (!await this.settleWorkItemReviews(run, owner.id)) return null;
      if (!await this.awaitUserDecisions(run, owner.id)) return null;
      const commit = this.accepted(run);
      const captured = this.basisState(run, owner.id);
      const rounds = run.log.all('reconciliation-started').filter(event => event.data.workItem === owner.id).length;
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
        await this.fail(run, 'internal', `The audited source ${commit} of ${owner.id}'s reconciliation could not be read: ${message(error)}`);
        return null;
      }
      const basis = await this.startReconciliation(run, owner.id, rounds + 1, limit, { commit, tree }, captured, owner.completion);
      if (basis === 'ended') return null;
      if (basis === 'stale') continue;
      const assessed = await this.assessReconciliation(run, agent, loaded, item, owner, basis, captured.attention, parent, { limit, minimum });
      if (assessed === null) return null;
      if (assessed.kind === 'refused') {
        await this.write(run, { type: 'reconciliation-refused', data: { workItem: owner.id, reconciliation: basis.id, stage: 'assessment', reason: assessed.reason } });
        if (this.ignoring(run)) return null;
        continue;
      }
      if (assessed.next === 'correct') return { kind: 'correct', reconciliation: basis.id };
      if (assessed.next === 'await-user') continue;
      const after = this.basisState(run, owner.id);
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
    completion?: ReconciliationOwner['completion'],
  ): Promise<ReconciliationBasis | 'stale' | 'ended'> {
    const id = reconciliationId(workItem, round);
    const pinned = completion === undefined ? this.latestCompletion(run, workItem)?.data.architectRef : completion;
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
  private async reconciliationStart(run: Run, agent: AgentPort, basis: ReconciliationBasis, completion: { readonly session: SessionId; readonly invocation: string } | undefined): Promise<{
    readonly start: SessionStart;
    readonly fork?: ForkRelation | undefined;
    readonly degraded?: { readonly requested: 'fork'; readonly reason: string } | undefined;
  }> {
    const fresh = (reason: string) => ({ start: { mode: 'fresh' } as const, degraded: { requested: 'fork' as const, reason } });
    const point = basis.forkPoint;
    if (point.kind !== 'session') return fresh(point.kind === 'unavailable' ? point.reason : 'No point of the local architect was captured');
    if (completion === undefined) return fresh('No completion request of this work item is recorded');
    const from = { session: point.session as SessionId, invocation: completion.invocation };
    const source = this.sessionsOf(run)?.get(from.session);
    if (source === undefined) return fresh('The captured review session is unavailable');
    if (!source.invocations.includes(from.invocation) || source.awaiting === from.invocation) throw new EvidenceUnavailableError(`${from.session} has not reached the end of ${from.invocation}`);
    const outcome = committedRecords(run.log.ledger.replay()).outcomes.get(from.invocation);
    if (outcome?.session?.ref !== point.ref) throw new EvidenceUnavailableError('The recorded completion point does not match its accepted invocation');
    if (!await (await this.operations(agent)).hasPoint(run.record.jobId, point.ref)) return fresh('The recorded completion session point is unavailable; reconstructing the complete reconciliation packet');
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === from.invocation)?.sequence ?? 0;
    const briefs = run.log.all('brief-appended')
      .filter(event => event.data.session === from.session && event.sequence < ended)
      .map(event => event.data.decision);
    return { start: { mode: 'fork', from: point.ref }, fork: { from, reason: 'reconciliation', briefs } };
  }

  /** The one bounded packet of a round, from the log and the CheckFinding state. */
  private reconciliationPacket(run: Run, item: WorkItem, owner: ReconciliationOwner, basis: ReconciliationBasis, state: CheckFindingState, bounds: { readonly limit: number; readonly minimum: string }): ReconciliationPacket {
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
    const ordinaryIterations = run.log.all('iteration-assigned').filter(event => event.data.workItem === owner.id).map(event => {
      const number = Number.parseInt(event.data.iteration.slice(event.data.iteration.lastIndexOf('.i') + 2), 10);
      const assignment = iterationAssignmentSchema.safeParse(this.committedBody(run, iterationLayout.assignment(item.id, number)));
      const closed = run.log.all('iteration-closed').find(entry => entry.data.iteration === event.data.iteration);
      return { id: event.data.iteration, goal: assignment.success ? assignment.data.goal : '(its assignment could not be read)', outcome: closed?.data.outcome ?? null };
    });
    const taskIterations = owner.role !== 'capability-architect' ? [] : [...committedRecords(run.log.ledger.replay()).assignments.values()]
      .filter(entry => entry.coordination?.kind === 'capability-task' && entry.coordination.id === owner.id)
      .sort((a, b) => (a.coordination?.kind === 'capability-task' ? a.coordination.sequence : 0) -
        (b.coordination?.kind === 'capability-task' ? b.coordination.sequence : 0))
      .map(entry => ({ id: entry.id, goal: entry.goal,
        outcome: committedRecords(run.log.ledger.replay()).results.get(entry.id)?.outcome ?? null }));
    const earlier = run.log.all('reconciliation-assessed').filter(event => event.data.workItem === owner.id).flatMap(event => {
      const record = reconciliationAssessmentSchema.safeParse(this.committedBody(run, reconciliationLayout.assessment(event.data.reconciliation)));
      return record.success ? [{ id: record.data.id, next: record.data.next, brief: record.data.submission.brief }] : [];
    });
    return {
      basis,
      limit: bounds.limit,
      laterRoundMinimumRisk: bounds.minimum,
      module: item.module,
      owner: owner.role === 'capability-architect' ? 'capability task' : 'work item',
      ...(owner.role === 'capability-architect' ? { capabilityContext: { consumer: item.module, provider: owner.provider ?? 'unknown' } } : {}),
      requests,
      attention,
      others: this.ownerCheckFindings(state, owner.id, 'all').filter(summary => !inBasis.has(summary.id)),
      iterations: owner.role === 'capability-architect' ? taskIterations : ordinaryIterations,
      earlier,
      refused: run.log.all('reconciliation-refused').filter(event => event.data.workItem === owner.id)
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
    owner: ReconciliationOwner,
    basis: ReconciliationBasis,
    attention: ReadonlyMap<CheckFindingId, AttentionEntry>,
    parent: ParentSession,
    bounds: { readonly limit: number; readonly minimum: CheckFindingRisk },
  ): Promise<{ readonly kind: 'refused'; readonly reason: string } | { readonly kind: 'assessed'; readonly next: ReconciliationAssessment['next'] } | null> {
    const ordinaryCompletion = owner.completion === undefined ? this.latestCompletion(run, owner.id) : undefined;
    const completion = owner.completion ?? (ordinaryCompletion?.data.architectRef == null ? undefined
      : { session: ordinaryCompletion.data.architectRef.session, invocation: ordinaryCompletion.data.invocation });
    const start = await this.reconciliationStart(run, agent, basis, completion);
    const state = checkFindingStateOf(run.log.ledger);
    const held = new Map(this.ownerCheckFindings(state, owner.id, 'all').map(summary => [summary.id, summary.revision]));
    const evidence = await readAcceptedEvidence(run.directory, run.record, run.log.events);
    let invocation: string | undefined;
    let bound: BoundReconciliation | undefined;
    const result = await this.runInvocation<ReconciliationSubmission>(run, agent, {
      role: owner.role,
      task: { kind: 'reconciliation', goal: item.goal, requirements: [JSON.stringify(basis), (await this.currentSelection(run, item.id))?.packageText ?? this.planPackage(run, await this.frozenCatalog(run), [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs])], modules: [item.module] },
      work: owner.role === 'capability-architect' ? { capabilityTask: owner.id, request: owner.request } : { workItem: owner.id },
      attempt: basis.round,
      loaded,
      systemPrompt: renderReconciliationPrompt(loaded, this.projectRoot, parent.workingDirectory),
      prompt: reconciliationMessage(this.reconciliationPacket(run, item, owner, basis, state, bounds)),
      // The fork keeps the parent's working directory: its tools read where the architect read.
      workingDirectory: parent.workingDirectory,
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
          workItem: owner.id,
          module: item.module,
          floor: basis.floor,
          laterRoundMinimumRisk: bounds.minimum,
          attention,
          held,
          actor: { kind: 'agent', role: owner.role, invocation: invocation ?? 'none' },
          source: { kind: 'tree', id: basis.source.tree },
          evidence: submission => [{
            kind: 'reconciliation-submission',
            ref: runLayout.submission(invocation ?? 'none'),
            hash: `sha256:${sha256(canonicalJson(submission))}`,
          }],
          document: async path => {
            // An element of the frozen catalog is cited by its ID, at the catalog's hash.
            if (elementIdSchema.safeParse(path).success) {
              const element = evidence.status === 'available' ? evidence.catalog.elements.find(candidate => candidate.id === path) : undefined;
              return element === undefined || evidence.status !== 'available' ? null : { text: element.text, revision: `sha256:${evidence.catalogHash}` };
            }
            try {
              return { text: await this.candidates.readBlob(this.projectRoot, basis.source.commit, path), revision: basis.source.commit };
            } catch {
              return null;
            }
          },
          decide: command => {
            const now = this.basisState(run, owner.id);
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

  /**
   * The brief's append to the local architect's session. A lost session, a
   * failure and no session are outcomes, never thrown. A conflict, such as an
   * append while the session's turn is active, is a failure of this append
   * alone: the session is intact and the brief reaches its next input.
   */
  private async appendReconciliationBrief(agent: AgentPort, key: string, parent: ArchitectRef | null, brief: string): Promise<BriefAppend> {
    if (parent === null) return { session: null, ref: null, outcome: 'no-session', reason: 'The local architect\'s session was not kept after its completion request' };
    try {
      const answer = await (await this.operations(agent)).append(parent.ref, key, brief);
      if (answer.outcome === 'session-lost') return { session: parent.session, ref: null, outcome: 'session-lost', reason: 'The local architect\'s session can no longer be read' };
      if (answer.outcome === 'conflict') return { session: parent.session, ref: null, outcome: 'failed', reason: `The local architect's session did not take the brief: ${answer.reason}` };
      return { session: parent.session, ref: answer.ref, outcome: answer.outcome, reason: null };
    } catch (error) {
      return { session: parent.session, ref: null, outcome: 'failed', reason: message(error) };
    }
  }

  /**
   * What the architect's own session holds after the append: the point its
   * next turn continues from, the note in its transcript, or, where the
   * append did not land, the brief its next input carries from the log. Only
   * a session that can no longer be read is finished as lost; a conflict
   * leaves it in place.
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
  private capabilityBlockers(run: Run, workItem: string): string[] {
    return capabilityBlockersOf(run.log, workItem);
  }

  /** Shared completion check for a work item or bounded capability task. */
  private async completionBasisRefusal(run: Run, owner: string, gate: GateAttempt, basis: CompletionBasis): Promise<string | null> {
    const limit = run.record.policy.limits.reconciliationRoundsPerWorkItem ?? defaultReconciliationRounds;
    const minimum = run.record.policy.limits.laterRoundMinimumRisk ?? 'medium';
    const lineage = basis.decided ? await this.sourceLineage(run, basis.commit, gate.audited) : null;
    const now = this.basisState(run, owner);
    const rounds = run.log.all('reconciliation-started').filter(event => event.data.workItem === owner).length;
    const inBasis = new Set(basis.checkFindings.map(entry => entry.checkFinding));
    const raised = [...now.attention].filter(([id]) => !inBasis.has(id)).map(([, entry]) => entry);
    const hard = lineage ?? basisChange({ source: { commit: basis.commit, tree: '' }, requests: basis.requests, checkFindings: [] },
      { source: { commit: basis.commit, tree: '' }, requests: now.requests, unsettled: now.unsettled, revisions: now.revisions });
    if (hard !== null) return hard;
    const moved = basis.checkFindings.find(entry => now.revisions.get(entry.checkFinding) !== entry.revision);
    const soft = moved !== undefined
      ? `${moved.checkFinding} is at revision ${now.revisions.get(moved.checkFinding) ?? 'none'}, not ${moved.revision}`
      : raised.length > 0 ? `${raised.length === 1 ? 'a CheckFinding' : `${raised.length} CheckFindings`} became open after the basis` : null;
    const warranted = (entries: readonly AttentionEntry[]) => (rounds === 0 ? entries.length > 0 : needsLaterRound(entries, minimum));
    return soft !== null && rounds < limit && warranted([...now.attention.values()]) ? soft : null;
  }

  private async completeWorkItem(run: Run, item: WorkItem, gate: GateAttempt, basis: CompletionBasis): Promise<'completed' | 'ended' | { readonly refused: string }> {
    const limit = run.record.policy.limits.reconciliationRoundsPerWorkItem ?? defaultReconciliationRounds;
    const outcome = await run.mutex.run(async () => {
      if (run.log.terminal !== undefined) return 'ended' as const;
      if (this.workflow !== null) {
        const blockers = this.capabilityBlockers(run, item.id);
        if (blockers.length > 0) return { refused: blockers.join('; ') };
      }
      const refusal = await this.completionBasisRefusal(run, item.id, gate, basis);
      if (refusal !== null) return { refused: refusal };
      const now = this.basisState(run, item.id);
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

  /** The snapshot's exclusive file write precedes the request transaction.
   * Recover that precise suspended writer from its authenticated submission,
   * then adopt only matching live source and index bytes. */
  private async reconcileSuspendedCapabilityRequest(run: Run): Promise<void> {
    const records = committedRecords(run.log.ledger.replay());
    const requested = new Set([...records.capabilityRequests.values()].map(request => request.invocation));
    for (const started of run.log.all('invocation-started')) {
      const iteration = started.data.work.iteration;
      if (started.data.role !== 'engineer' || iteration === undefined ||
        requested.has(started.data.invocation) || records.results.has(iteration)) continue;
      const ended = run.log.all('invocation-ended').find(event => event.data.invocation === started.data.invocation);
      const outcome = records.outcomes.get(started.data.invocation);
      if (ended?.data.ended !== 'submitted' || ended.data.submission === null || !ended.data.kept ||
        outcome?.disposition !== 'applied' || !outcome.settled.confirmed || outcome.session?.ref === undefined) continue;
      const bytes = await readIfExists(run.path(runLayout.submission(started.data.invocation)));
      if (bytes === undefined || sha256(bytes) !== ended.data.submission || outcome.submission?.hash !== ended.data.submission) {
        throw new Error(`Suspended engineer ${started.data.invocation} has unauthenticated submission bytes`);
      }
      const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
      const { schema: _schema, ...body } = raw;
      const parsed = engineerSubmissionSchema.safeParse(body);
      if (raw.schema !== 'ramify-agent.engineer-submission/1' || !parsed.success || parsed.data.kind !== 'capability-needed') continue;
      const assignment = records.assignments.get(iteration);
      const item = assignment === undefined ? undefined : records.workItems.find(entry => entry.id === assignment.workItem);
      const taskId = assignment?.coordination?.kind === 'capability-task' ? assignment.coordination.id : undefined;
      const parentTask = taskId === undefined ? undefined : records.capabilityTasks.get(taskId);
      const parentPlan = parentTask === undefined ? undefined : records.capabilityPlans.get(parentTask.id)?.at(-1);
      if (assignment === undefined || item === undefined ||
        (assignment.coordination?.kind === 'capability-task' && (parentTask === undefined || parentPlan === undefined))) {
        throw new Error(`Suspended engineer ${started.data.invocation} lacks its original assignment`);
      }
      const release = run.log.all('writer-released').filter(event => event.data.invocation === started.data.invocation);
      if (release.length !== 1 || release[0]!.data.confirmed !== true) throw new Error(`Suspended engineer ${started.data.invocation} has no confirmed writer release`);
      const requestId = capabilityRequestId(records.capabilityRequests.size + 1);
      const source = await captureProvisionalSource({ git: this.git, sourceGit: this.options.provisionalSourceGit, projectRoot: this.projectRoot, runDirectory: run.directory,
        request: requestId, acceptedBase: this.accepted(run), writerSettledBy: started.data.invocation,
        changedPaths: await this.git.changedPaths(this.projectRoot, this.accepted(run)) });
      const captured = await readFile(run.path(runLayout.capturedPlan));
      const request: CapabilityRequest = { schema: 'ramify-agent.capability-request/1', id: requestId,
        parent: parentTask === undefined ? { kind: 'work-item', id: item.id } : { kind: 'capability-task', id: parentTask.id },
        assignment: assignment.id,
        invocation: started.data.invocation, consumer: assignment.coordination?.kind === 'capability-task'
          ? 'module' in assignment.scope.base ? assignment.scope.base.module : parentTask!.consumer
          : item.module,
        requirementPackage: parentTask === undefined
          ? { id: runLayout.capturedPlan, revision: 1, hash: sha256(captured) }
          : refOf(parentTask.id, parentPlan!.revision, parentPlan!),
        continuation: { session: started.data.session, point: outcome.session.ref }, source,
        summary: parsed.data.summary, original: identifyCapabilityNeed(requestId, parsed.data.request) };
      await run.mutex.run(() => commitCapabilityTransition(run.log, { type: 'capability-requested', data: {
        request: request.id, parent: request.parent.id, assignment: request.assignment, invocation: started.data.invocation,
      } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]));
      requested.add(started.data.invocation);
      break;
    }
  }

  private readonly refusedPolicies = new Map<string, string>();

  private refuseEarlierPolicy(planId: string, runId: string): void {
    const recorded = this.refusedPolicies.get(key(planId, runId));
    if (recorded !== undefined) throw new CommandRejection('unsupported-version', `Run policy ${recorded} is refused by ${capabilityRunPolicyVersion}; a fresh run is required`, undefined, [`plans/${planId}/.harness/jobs/${runId}/${runLayout.record}`]);
  }

  private async load(): Promise<RunRecoveryReport> {
    const report: RunRecoveryReport = { interrupted: [], rematerialized: [], effects: [], invocations: [], skipped: [], reviews: [], manual: [] };
    for (const { planId, jobId } of await listJobDirectories(this.projectRoot)) {
      const directory = runDirectory(this.projectRoot, planId, jobId);
      const recordPath = join(directory, runLayout.record);
      let run: Run;
      try {
        const document = await readIfExists(recordPath);
        if (document === undefined) continue;
        const parsed: unknown = JSON.parse(document.toString('utf8'));
        const kind = (parsed as { kind?: unknown } | null)?.kind;
        // A manual run has no drive and no phase progression: nothing of it
        // is executed or recovered, and its records are not touched.
        if (kind === 'manual') {
          report.manual.push(key(planId, jobId));
          continue;
        }
        if (kind !== 'implementation') continue;
        const policy = (parsed as { policy?: { version?: unknown } }).policy?.version;
        if (policy !== capabilityRunPolicyVersion) {
          const recorded = typeof policy === 'string' ? policy : '(missing policy)';
          this.refusedPolicies.set(key(planId, jobId), recorded);
          report.skipped.push(key(planId, jobId));
          this.warn(`Run policy ${recorded} is refused by ${capabilityRunPolicyVersion}; a fresh run is required`);
          continue;
        }
        const record = runRecordSchema.parse(parsed);
        if (record.jobId !== jobId || record.planId !== planId) throw new Error('job.json names another run');
        const log = await RunLog.open(join(directory, runLayout.events), jobId);
        const captured = await readCapturedDocuments(directory, record.manifest);
        if (!log.find('job-started')) throw new Error('Document capture stopped before the run was published');
        if (!log.find('document-manifest-committed')) await log.append({ type: 'document-manifest-committed', data: {
          manifest: record.manifest.documentManifest.path, hash: record.manifest.documentManifest.hash,
          documents: captured.manifest.documents.length,
        } });
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
      if (!run.log.terminal && run.record.breakpoint !== undefined) {
        for (const invocation of await this.closeInterruptedInvocations(run)) report.invocations.push(`${run.key}: ${invocation}`);
        await this.endRun(run, { type: 'job-interrupted', data: {
          message: 'The live server for this debug-enabled run was lost. Pending debugger and workflow effects were not replayed; start a new run to continue.',
        } }, 'interrupted');
        report.interrupted.push(run.key);
        for (const event of run.log.events) {
          if (event.type === 'job-started' || event.type === 'stop-requested' || event.type === 'analysis-approved' || event.type === 'debug-resumed' || event.type === 'debug-exchange-admitted') this.commands.remember(event.data.command);
        }
        continue;
      }
      // A crash can land after the durable close event and before its
      // filesystem cleanup. Repeat the idempotent cleanup on every load.
      try {
        await this.handling.cleanupClosedScratch(run);
      } catch (error) {
        if (!run.log.terminal) await this.fail(run, 'recovery-exhausted', `Closed iteration scratch could not be cleaned: ${message(error)}`);
        else this.warn(`Run ${run.record.jobId}: closed iteration scratch could not be cleaned: ${message(error)}`);
      }

      if (!run.log.terminal && this.workflow !== null && run.record.policy.version === capabilityRunPolicyVersion) {
        try {
          await this.reconcileSuspendedCapabilityRequest(run);
        } catch (error) {
          await this.fail(run, 'inputs-changed', `Suspended capability source could not be reconciled: ${message(error)}`);
          report.interrupted.push(run.key);
        }
      }


      if (!run.log.terminal) {
        if (this.workflow !== null && run.record.policy.version === capabilityRunPolicyVersion &&
          run.log.find('capability-requested') !== undefined) {
          for (const effect of await this.completeEffects(run)) report.effects.push(`${run.key}: ${effect}`);
          for (const invocation of await this.closeInterruptedInvocations(run)) report.invocations.push(`${run.key}: ${invocation}`);
          const writerIssue = [...run.log.all('writer-acquired')].find(acquired => {
            const releases = run.log.all('writer-released').filter(event => event.data.invocation === acquired.data.invocation);
            return releases.length !== 1 || releases[0]!.data.confirmed !== true;
          });
          if (writerIssue !== undefined || run.log.find('stop-requested') !== undefined) {
            const cause = writerIssue === undefined ? 'A stop was requested before restart'
              : `Writer ${writerIssue.data.invocation} has no unique confirmed settlement`;
            const active = replayCapabilityState(run.log.events).stack.at(-1);
            if (active !== undefined && active.startsWith('cap-')) await this.write(run, {
              type: 'capability-stopped', data: { task: active, reason: cause },
            });
            await this.fail(run, writerIssue === undefined ? 'recovery-exhausted' : 'writer-unsettled', cause);
            report.interrupted.push(run.key);
          } else if (this.options.agent === undefined) {
            await this.fail(run, 'recovery-exhausted', 'Capability continuation has no agent port');
            report.interrupted.push(run.key);
          } else {
            const { packages } = await loadPromptPackages({
              ...(this.options.skillDirectory === undefined ? {} : { skillDirectory: this.options.skillDirectory }),
              capabilityWorkflow: true,
            });
            const changed = [...packages].filter(([role, loaded]) => run.record.prompts[role]?.hash !== loaded.hash).map(([role]) => role);
            if (changed.length > 0) {
              await this.fail(run, 'inputs-changed', `Captured prompt packages changed before capability recovery: ${changed.join(', ')}`);
              report.interrupted.push(run.key);
            } else {
              run.index = await this.options.inputs.index(this.projectRoot, run.record.manifest).catch(() => null);
              const baseline = measurementSnapshotSchema.parse(JSON.parse(await readFile(run.path(runLayout.measurement(snapshotId(1))), 'utf8')));
              run.done = this.drive(run, this.options.agent, packages, baseline, true)
                .catch(error => this.fail(run, error instanceof WriterBlockedError ? 'writer-unsettled' : 'recovery-exhausted',
                  `Capability continuation failed: ${message(error)}`))
                .catch(error => this.warn(`Run ${run.record.jobId}: ${message(error)}`));
              report.effects.push(`${run.key}: resumed capability coordination from its committed stack`);
            }
          }
        } else if (run.log.find('nonfunctional-phase-started')) {
          const reason = await this.nonfunctionalResumeRefusal(run);
          if (reason !== null) {
            await this.fail(run, 'recovery-exhausted', `The non-functional phase cannot resume: ${reason}`);
            report.interrupted.push(run.key);
          } else {
            for (const effect of await this.completeEffects(run)) report.effects.push(`${run.key}: ${effect}`);
            const agent = this.options.agent!;
            const originalCoordinators = new Set<string>();
            if (agent.bindSessionStore) for (const started of run.log.all('invocation-started')) {
              if (started.data.role !== 'nonfunctional-coordinator' || run.log.all('invocation-ended').some(ended => ended.data.invocation === started.data.invocation)) continue;
              const record = this.invocationRecord(run, started.data.invocation).body;
              const original = await (await this.operations(agent)).originalOperation(run.record.jobId, started.data.invocation);
              if (record.writer || record.sessionOperation?.runId !== run.record.jobId || original === null
                || ![coordinatorAssessmentToolName, coordinatorActionToolName, coordinatorInvestigationToolName].includes(original.packet.submissionTool)) continue;
              originalCoordinators.add(started.data.invocation);
            }
            run.restoring = originalCoordinators.size > 0;
            for (const invocation of await this.closeInterruptedInvocations(run, originalCoordinators)) report.invocations.push(`${run.key}: ${invocation}`);
            const { packages } = await loadPromptPackages({
              ...(this.options.skillDirectory === undefined ? {} : { skillDirectory: this.options.skillDirectory }),
            });
            run.index = await this.options.inputs.index(this.projectRoot, run.record.manifest).catch(() => null);
            run.done = this.resumeNonfunctionalPhase(run, agent, packages)
              .catch(error => this.fail(run, error instanceof WriterBlockedError ? 'writer-unsettled' : 'recovery-exhausted',
                `The non-functional phase could not resume: ${message(error)}`))
              .catch(error => this.warn(`Run ${run.record.jobId}: ${message(error)}`));
            report.effects.push(`${run.key}: resumed the non-functional phase`);
          }
        } else if (this.options.agent?.bindSessionStore && !run.log.find('stop-requested') && run.log.all('invocation-started').some(event =>
          this.invocationRecord(run, event.data.invocation).body.sessionOperation?.runId === run.record.jobId)) {
          const { packages } = await loadPromptPackages({ ...(this.options.skillDirectory === undefined ? {} : { skillDirectory: this.options.skillDirectory }), capabilityWorkflow: this.workflow !== null });
          if ([...packages].some(([role, loaded]) => run.record.prompts[role]?.hash !== loaded.hash)) throw new Error('Captured owning prompt packages changed before restoration');
          if (run.log.all('writer-released').some(event => event.data.confirmed !== true)) throw new Error('Original writer settlement was unconfirmed');
          for (const effect of await this.completeEffects(run)) report.effects.push(`${run.key}: ${effect}`);
          for (const decision of await this.completeDeliveries(run)) report.effects.push(`${run.key}: the delivery of decision ${decision}`);
          run.index = await this.options.inputs.index(this.projectRoot, run.record.manifest).catch(() => null);
          const baseline = measurementSnapshotSchema.parse(JSON.parse(await readFile(run.path(runLayout.measurement(snapshotId(1))), 'utf8')));
          run.restoring = true;
          run.done = this.drive(run, this.options.agent, packages, baseline, true)
            .catch(error => this.fail(run, error instanceof WriterBlockedError ? 'writer-unsettled' : 'recovery-exhausted', `Original owning workflow restoration failed: ${message(error)}`))
            .catch(error => this.warn(`Run ${run.record.jobId}: ${message(error)}`));
          report.effects.push(`${run.key}: restored ordinary owning workflow from its original task correlations`);
        } else {
        for (const effect of await this.completeEffects(run)) report.effects.push(`${run.key}: ${effect}`);
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
      }

      for (const event of run.log.events) {
        if (event.type === 'job-started' || event.type === 'stop-requested' || event.type === 'analysis-approved' || event.type === 'debug-resumed' || event.type === 'debug-exchange-admitted') {
          this.commands.remember(event.data.command);
        }
        if (event.type === 'check-findings-recorded' && event.data.cause.kind === 'user-command') this.commands.remember(event.data.cause.command);
      }
    }
    return report;
  }

  /** Only the phase marker opts a run into same-run continuation. */
  private async nonfunctionalResumeRefusal(run: Run): Promise<string | null> {
    if (this.options.agent === undefined) return 'no agent is configured';
    if (run.log.find('stop-requested')) return 'a stop was requested';
    if (unsettledRequests(run.log.events).length > 0) return 'ordinary reviews have not settled';
    const finishedItems = new Set(run.log.all('work-item-completed').map(event => event.data.workItem));
    if (run.log.all('work-item-started').some(event => !finishedItems.has(event.data.workItem))) {
      return 'ordinary work has not settled';
    }
    const closedIterations = new Set(run.log.all('iteration-closed').map(event => event.data.iteration));
    if (run.log.all('iteration-assigned').some(event => !closedIterations.has(event.data.iteration))) {
      return 'an ordinary iteration has not closed';
    }
    for (const acquired of run.log.all('writer-acquired')) {
      const releases = run.log.all('writer-released').filter(event => event.data.invocation === acquired.data.invocation);
      if (releases.length !== 1 || releases[0]!.data.confirmed !== true) {
        return `writer ${acquired.data.invocation} has no unique confirmed release`;
      }
    }
    const accepted = await readAcceptedEvidence(run.directory, run.record, run.log.events);
    if (accepted.status === 'unavailable') return `fixed catalog cannot be authenticated: ${accepted.reason}`;
    const sourceChanges = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (sourceChanges.length > 0) return `captured documents changed: ${sourceChanges.join('; ')}`;
    const marker = run.log.find('nonfunctional-phase-started')!;
    if (marker.data.maxRounds !== (run.record.policy.limits.nonfunctionalRoundsPerPlan ?? 3)) {
      return 'phase marker round bound differs from captured policy';
    }
    const source = run.log.find('analysis-accepted')?.data.evidence.catalog.hash;
    if (source !== marker.data.catalogHash) return 'phase marker names another catalog';
    const nfrIds = assessedElements(accepted.catalog);
    const replay = replayNonfunctionalPhase(run.log.ledger.replay(), nfrIds, marker.data.maxRounds);
    if (!replay.ok) return `phase ledger prefix is invalid: ${replay.reason}`;
    if (replay.value.final !== null) {
      const preview = await this.previewCandidateTree();
      if (preview.tree !== replay.value.final.candidate.tree) return 'source tree changed after the final assessment';
    }
    const { packages } = await loadPromptPackages({
      ...(this.options.skillDirectory === undefined ? {} : { skillDirectory: this.options.skillDirectory }),
    });
    for (const role of ['nonfunctional-coordinator', 'nonfunctional-repair-engineer'] as const) {
      if (run.record.prompts[role]?.hash !== packages.get(role)?.hash) return `${role} prompt package changed after capture`;
    }
    return null;
  }

  private async resumeNonfunctionalPhase(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>): Promise<void> {
    const binding = await this.assessNonfunctional(run, agent, packages);
    if (binding !== null && !this.ignoring(run) && await this.recordNonfunctionalDeviations(run, binding)) await this.finalGate(run, binding);
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
      if (event.type === 'context-package-append-requested') {
        const agent = this.options.agent;
        const selected = run.log.all('context-selection-recorded').find(candidate => candidate.data.workItem === event.data.workItem
          && candidate.data.selection === event.data.selection);
        const evidence = await readAcceptedEvidence(run.directory, run.record, run.log.events);
        if (agent === undefined || selected === undefined || evidence.status === 'unavailable') {
          this.warn(`Run ${run.record.jobId}: context append ${pending.key} lacks its agent or verified selection`);
          continue;
        }
        const recorded = await readRecordedContextSelection(run.directory, selected, evidence.catalog, this.planDeviationsOf(run));
        if (recorded.status === 'unavailable') {
          this.warn(`Run ${run.record.jobId}: context append ${pending.key} is unavailable: ${recorded.reason}`);
          continue;
        }
        const orientation = run.log.all('work-orientation-recorded').find(candidate => candidate.data.workItem === event.data.workItem);
        await run.log.ledger.effect<BriefAppend>({
          key: pending.key, serialize: work => run.mutex.run(work),
          intent: () => { throw new Error(`The intent of ${pending.key} is already committed`); },
          perform: async key => {
            if (event.data.session === null || orientation?.data.point === null || orientation === undefined) {
              return { session: null, ref: null, outcome: 'no-session', reason: 'No retained parent point' };
            }
            try {
              const answer = await (await this.operations(agent)).append(orientation.data.point, key, recorded.packageText, 'support:work-item-package');
              if (answer.outcome === 'session-lost') return { session: event.data.session, ref: null, outcome: 'session-lost', reason: 'The parent session was lost' };
              if (answer.outcome === 'conflict') return { session: event.data.session, ref: null, outcome: 'failed', reason: `The parent session did not take the package: ${answer.reason}` };
              return { session: event.data.session, ref: answer.ref, outcome: answer.outcome, reason: null };
            } catch (error) { return { session: event.data.session, ref: null, outcome: 'failed', reason: message(error) }; }
          },
          complete: result => ({ event: run.log.next({ type: 'context-package-appended', data: {
            workItem: event.data.workItem, selection: event.data.selection, appendKey: event.data.appendKey, ...result,
          } }), records: [] }),
        });
        performed.push(`the context append of ${event.data.workItem}`);
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
      if (event.type === 'scenarios-rewording') {
        // The revised records are in the intent; the files are rendered from
        // the ledger again, and the commit is found by its trailers.
        await this.performRewording(run, event.data, [], true);
        performed.push(`the rewording commit of ${event.data.scenarios.join(', ')}`);
        continue;
      }
      if (event.type === 'scenarios-materializing') {
        // The files are re-rendered from the ledger, and the commit is found
        // by its trailers where the interrupted attempt made it.
        await this.performMaterialization(run, true);
        performed.push('the materialization of the feature files');
        continue;
      }
      if (event.type === 'scratch-setting-up') {
        await this.performScratchSetup(run, true);
        performed.push('the scratch ignore rule setup');
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
      await this.gates.commitGate(run, preparedGate(operation), undefined, undefined, undefined, operation.message);
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
  private async closeInterruptedInvocations(run: Run, preserved: ReadonlySet<string> = new Set()): Promise<string[]> {
    const closed: string[] = [];
    const ended = new Set(run.log.all('invocation-ended').map(event => event.data.invocation));
    for (const started of run.log.all('invocation-started')) {
      const id = started.data.invocation;
      if (ended.has(id) || preserved.has(id)) continue;
      const acquired = run.log.all('writer-acquired').some(event => event.data.invocation === id);
      const released = run.log.all('writer-released').some(event => event.data.invocation === id);
      if (acquired && !released) {
        // The new service has a new in-memory writer. Restore only the groups
        // durably registered before their commands were allowed to start.
        run.writer.acquire(id);
        for (const event of run.log.all('writer-process-registered')) {
          if (event.data.invocation !== id) continue;
          const current = await processGroupIdentity(event.data.pid);
          if (current !== null && current === event.data.identity) run.writer.register(id, event.data.pid);
          else this.warn(`Run ${run.record.jobId}: process group ${event.data.pid} cannot be authenticated after restart; it will not be signalled`);
        }
      }
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
  /** Historical context may use recorded boundaries only, never today's checkout. */
  private recordedRunBase(record: RunRecord, log: RunLog): string | undefined {
    if (record.manifest.source !== null) return record.manifest.source.commit;
    for (const entry of log.ledger.replay()) {
      for (const stored of entry.transaction.records) {
        const body = stored.body as { readonly schema?: unknown; readonly base?: unknown; readonly head?: unknown } | null;
        if (body?.schema === 'ramify-agent.invocation/1' && typeof body.base === 'string') return body.base;
        if (body?.schema === 'ramify-agent.gate-attempt/3' && typeof body.head === 'string') return body.head;
      }
    }
    return undefined;
  }

  private async runBase(record: RunRecord, log: RunLog): Promise<string> {
    return this.recordedRunBase(record, log) ?? this.git.currentHead(this.projectRoot);
  }

  // Queries

  listRuns(planId: string): RunSnapshot[] {
    return this.runsOf(planId).map(run => runSnapshot(run.record, run.log.events));
  }

  getRun(planId: string, runId: string): RunSnapshot | undefined {
    this.refuseEarlierPolicy(planId, runId);
    const run = this.runs.get(key(planId, runId));
    return run && runSnapshot(run.record, run.log.events);
  }

  /** Current debugger state, independent of the ordinary run snapshot. Inspection invokes no model. */
  debugState(planId: string, runId: string): BreakpointState | null {
    this.refuseEarlierPolicy(planId, runId);
    const run = this.runs.get(key(planId, runId));
    if (!run || run.log.terminal || run.stopRequested || !run.debugPause) return null;
    return structuredClone({ ...run.debugPause, cursor: run.log.version });
  }

  /** The run's events, exactly as its log holds them. */
  events(planId: string, runId: string) {
    this.refuseEarlierPolicy(planId, runId);
    return this.runs.get(key(planId, runId))?.log.events;
  }

  /** The record of one run, for a caller that reads what it was started with. */
  recordOf(planId: string, runId: string): RunRecord | undefined {
    this.refuseEarlierPolicy(planId, runId);
    return this.runs.get(key(planId, runId))?.record;
  }

  /**
   * What a projection reads of one run: its record, its directory and every
   * complete line of its log, record bodies included. It is a read: the
   * caller receives the replay, and nothing it does with it reaches the log.
   */
  committed(planId: string, runId: string) {
    this.refuseEarlierPolicy(planId, runId);
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
    this.refuseEarlierPolicy(planId, runId);
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
    this.refuseEarlierPolicy(planId, runId);
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
    this.refuseEarlierPolicy(planId, runId);
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
      if (command.type !== 'start-run' && command.type !== 'stop-job' && command.type !== 'debug-resume' && command.type !== 'debug-message') {
        const subject = this.runs.get(key(command.payload.planId, command.payload.jobId));
        if (subject?.debugPause !== undefined) throw new CommandRejection('busy', 'This run is suspended at an execution breakpoint');
      }
      switch (command.type) {
        case 'start-run': return this.start(command, admitted.contentHash);
        case 'stop-job': return this.stop(command, admitted.contentHash);
        case 'approve-analysis': return this.approve(command, admitted.contentHash);
        case 'debug-message': return this.messageDebug(command, admitted.contentHash);
        case 'debug-resume': return this.resumeDebug(command, admitted.contentHash);
        case 'respond-to-check-finding':
        case 'waive-check-finding':
        case 'revoke-check-finding-waiver':
          return this.checkFindingCommand(command, admitted.contentHash);
      }
    });
  }

  private async start(command: Extract<RunCommand, { type: 'start-run' }>, contentHash: string): Promise<Receipt> {
    const { planId, agent: requested, reviewStop, breakpoint } = command.payload;
    if (breakpoint !== undefined && !breakpointSelectorSchema.safeParse(breakpoint).success) {
      throw new CommandRejection('conflict', 'Supported breakpoint: before-agent:engineer');
    }
    if (this.options.policy !== undefined) {
      const policy = this.options.policy(this.projectRoot);
      if (policy.version !== capabilityRunPolicyVersion) throw new CommandRejection('conflict', `Run policy ${policy.version} is refused by ${capabilityRunPolicyVersion}; a fresh run is required`);
    }
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
    // The committed audit definition is read before anything of the run is
    // written or any agent starts: readiness, every gate and the final gate
    // ask it, so a project without a valid one is refused here.
    const sourceCommit = await this.git.currentHead(this.projectRoot);
    if (sourceCommit === '') throw new CommandRejection('unreadable', 'No committed HEAD is available, so no committed audit configuration can be read and no run can start');
    const auditConfiguration = await this.options.configuredAudit.read(this.projectRoot, sourceCommit)
      .then(config => ({ config }), (error: unknown) => {
        throw new CommandRejection('unreadable', `The committed audit configuration at ${sourceCommit} cannot be read, so no run can start: ${message(error)}`);
      });

    // The plan's state directory exists, with its marker and its
    // `.gitignore`, before the evidence is captured: the run's own records
    // never change what the evidence describes, `git add -A` at a gate never
    // commits them, and readiness sees a clean tree. Nothing else of the plan
    // is created; a run saves no map.
    await ensureStateDirectory(planStateDirectory(this.projectRoot, planId), { gitignore: true });
    const captured = await capturePlan(this.projectRoot, planId);
    const inputs = await this.captureInputs(captured);
    const capturedDocuments = await discoverDocuments(this.projectRoot, planId, inputs.manifest.source ?? { commit: null, dirty: false })
      .catch((error: unknown) => { throw new CommandRejection('unreadable', `Plan evidence cannot be captured: ${message(error)}`); });
    if (!Buffer.from(capturedDocuments.bytes.get(capturedDocuments.manifest.root)!).equals(Buffer.from(captured))) {
      throw new CommandRejection('inputs-changed', 'The root plan changed during input capture');
    }
    const documentManifestText = `${JSON.stringify(capturedDocuments.manifest, null, 2)}\n`;
    const manifest = { ...inputs.manifest, documentManifest: { path: runLayout.documentManifest, hash: sha256(documentManifestText) } };
    const { packages, promptManifest, policy } = inputs;

    const now = this.now();
    const runId = newJobId(now);
    const directory = runDirectory(this.projectRoot, planId, runId);

    // Written once, before the first event: the captured plan, the prompt
    // manifest, the frozen baseline and then `job.json`, which names them.
    await mkdir(join(directory, 'input'), { recursive: true });
    await mkdir(join(directory, 'prompts'), { recursive: true });
    await mkdir(join(directory, 'measurements'), { recursive: true });
    if (!verifyDocumentBytes(capturedDocuments.manifest.documents[0]!, captured)) throw new Error('Root plan bytes changed before installation');
    await writeOnce(join(directory, runLayout.capturedPlan), captured);
    for (const document of capturedDocuments.manifest.documents) {
      if (document.id === capturedDocuments.manifest.root) continue;
      const bytes = capturedDocuments.bytes.get(document.id)!;
      if (!verifyDocumentBytes(document, bytes)) throw new Error(`Document ${document.path} bytes changed before installation`);
      await mkdir(dirname(join(directory, document.storedAt)), { recursive: true });
      await writeOnce(join(directory, document.storedAt), bytes);
    }
    await writeOnce(join(directory, runLayout.documentManifest), documentManifestText);
    await readCapturedDocuments(directory, manifest);
    await writeOnce(join(directory, runLayout.promptManifest), `${JSON.stringify(promptManifest, null, 2)}\n`);

    const baseline = await this.freezeBaseline(directory, planId, manifest, packages);
    // Read once, beside the policy. A missing or invalid file is captured
    // with its reason; readiness reports it, and the start is not refused.
    // The gate command timeouts it declares replace the policy's own.
    const projectConfig = await captureProjectConfig(this.projectRoot);
    const record = runRecordSchema.parse({
      schema: jobSchemaVersion,
      jobId: runId,
      planId,
      kind: 'implementation',
      agent: requested,
      createdAt: now.toISOString(),
      manifest: baseline.manifest,
      prompts: Object.fromEntries([...packages].map(([role, loaded]) => [role, { package: loaded.package, hash: loaded.hash }])),
      policy: withProjectTimeouts(policy, projectConfig),
      projectConfig,
      auditConfiguration,
      baseline: baseline.reference,
      // The plan's own scenarios, extracted once from the captured bytes. A
      // block that does not parse is a limitation, never a refusal.
      planScenarios: extractPlanScenarios(new TextDecoder().decode(captured)),
      reviewStop,
      ...(breakpoint === undefined ? {} : { breakpoint }),
    });
    await writeOnce(join(directory, runLayout.record), `${JSON.stringify(record, null, 2)}\n`);

    const log = await RunLog.open(join(directory, runLayout.events), runId);
    const base = manifest.source?.commit ?? await this.git.currentHead(this.projectRoot);
    let run!: Run;
    run = new Run(record, directory, log, base, this.newWriter(record.policy, () => this.accepted(run)));
    run.index = await this.options.inputs.index(this.projectRoot, record.manifest).catch(() => null);
    const accepted = this.commands.accept(command, contentHash, runId, run.log.nextSequence, now);
    this.runs.set(run.key, run);
    await run.log.append({ type: 'job-started', data: { command: accepted } }, now);
    await run.log.append({ type: 'document-manifest-committed', data: {
      manifest: runLayout.documentManifest, hash: manifest.documentManifest.hash, documents: capturedDocuments.manifest.documents.length,
    } }, now);
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
      capabilityWorkflow: this.workflow !== null,
    });
    let manifest;
    try {
      manifest = await this.options.inputs.capture(this.projectRoot, captured, packages);
    } catch (error) {
      if (error instanceof EvidenceUnavailableError) throw new CommandRejection('unavailable', error.message);
      throw error;
    }
    const policy = (this.options.policy ?? ((root: string) => defaultRunPolicy({ projectRoot: root })))(this.projectRoot);
    if (policy.version !== capabilityRunPolicyVersion) {
      throw new CommandRejection('conflict', `Run policy ${policy.version} is refused by ${capabilityRunPolicyVersion}; a fresh run is required`);
    }
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
  ): Promise<{ reference: RunRecord['baseline']; snapshot: MeasurementSnapshot; manifest: RunRecord['manifest'] }> {
    const support: Array<{ path: string; bytes: number }> = [];
    const plan = await supportDocument(this.projectRoot, join(this.projectRoot, 'plans', planId, 'plan.md'));
    if (plan !== null) support.push(plan);
    // Each file once, though several roles' packages carry it.
    for (const loaded of packages.values()) {
      for (const file of loaded.files) if (!support.some(entry => entry.path === file.path)) support.push({ path: file.path, bytes: file.bytes });
    }
    const id = snapshotId(1);
    const capture = (view: ViewIdentity) => captureSnapshot({
      id,
      ramify: this.options.ramify,
      projectRoot: this.projectRoot,
      head: '',
      view,
      supplementary: support,
    });
    // The measurement and the view must describe one state. A revision that
    // moved between them is retried, a bounded number of times, against a
    // refreshed view; a mismatch that remains is recorded, and every size
    // taken from it is unavailable with the reason.
    let view = manifest.architectView;
    let snapshot = await capture(view);
    for (let retry = 0; retry < 2 && revisionMismatch(snapshot) !== null; retry += 1) {
      const index = await this.options.inputs.refresh(this.projectRoot);
      if (index === null) break;
      view = await this.viewIdentityOf(index);
      snapshot = await capture(view);
    }
    // The run record names the view the baseline was measured against, which
    // a successful retry refreshed.
    const frozen = { ...manifest, architectView: view };
    const path = join(directory, runLayout.measurement(id));
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    await writeOnce(path, content);
    if ('unavailable' in snapshot.measure) {
      return { reference: { unavailable: snapshot.measure.unavailable }, snapshot, manifest: frozen };
    }
    return { reference: { measurement: { id, revision: 1, hash: sha256(content) } }, snapshot, manifest: frozen };
  }

  /** Effective input at a live occurrence; no packet is recorded as delivery. */
  async debugInspect(planId: string, runId: string, pauseId: string): Promise<DebugInspection> {
    const run = this.runs.get(key(planId, runId));
    const pause = run?.debugPause;
    if (!run || this.ignoring(run) || !pause || pause.pauseId !== pauseId || !run.debugPrepared) throw new CommandRejection('conflict', 'This is not a live breakpoint occurrence');
    const revision = pause.revision;
    const input = await run.debugPrepared.inspect();
    if (this.ignoring(run) || run.debugPause !== pause || pause.revision !== revision) throw new CommandRejection('conflict', 'The breakpoint progressed during inspection');
    return structuredClone({ ...pause, cursor: run.log.version, kind: 'inspection', preview: true, input });
  }

  /** Durable admitted or settled exchange, even after the occurrence was released. */
  debugResult(planId: string, runId: string, commandId: string): DebugExchange | null {
    const run = this.runs.get(key(planId, runId));
    if (!run) return null;
    const admission = run.log.all('debug-exchange-admitted').find(event => event.data.command.commandId === commandId);
    if (!admission) return null;
    const settled = run.log.all('debug-exchange-settled').find(event => event.data.commandId === commandId);
    if (settled) return structuredClone(settled.data.result);
    const boundary = run.log.all('debug-pausing').find(event => event.data.pauseId === admission.data.pauseId)!;
    const terminal = run.log.terminal;
    const invocation = terminal ? run.log.all('invocation-started').filter(event => event.sequence > admission.sequence &&
      event.data.role === boundary.data.role && canonicalJson(event.data.work) === canonicalJson(boundary.data.work)).at(-1) : undefined;
    const outcome = invocation === undefined ? undefined : invocationOutcomeSchema.safeParse(this.committedBody(run, runLayout.outcome(invocation.data.invocation)));
    const actual = outcome?.success ? outcome.data : undefined;
    const state = run.debugPause?.pauseId === admission.data.pauseId ? run.debugPause : {
      kind: 'breakpoint' as const, planId, runId, pauseId: admission.data.pauseId, revision: admission.data.revision,
      cursor: run.log.version, state: 'exchanging' as const, role: boundary.data.role, work: boundary.data.work,
      goal: boundary.data.goal, nextAction: boundary.data.nextAction, taskState: 'pending' as const, summary: 'Exchange admitted; awaiting settlement.',
    };
    return structuredClone({ ...state, kind: 'exchange', commandId, cursor: run.log.version,
      status: terminal ? terminal.type === 'job-stopped' ? 'stopped' : 'interrupted' : 'admitted',
      taskState: terminal ? 'terminal' : state.taskState,
      answer: null, invocation: invocation?.data.invocation ?? null, session: invocation?.data.session ?? null,
      point: actual?.session?.ref || null, outcome: actual?.ended ?? terminal?.type ?? null,
      ...(actual === undefined ? {} : { settlementConfirmed: actual.settled.confirmed }),
      error: actual?.error ?? (terminal ? 'message' in terminal.data ? String(terminal.data.message) : `Run ended: ${terminal.type}` : null),
      continuityLoss: null, verdicts: [], evidence: invocation === undefined ? [] : [runLayout.invocation(invocation.data.invocation),
        runLayout.outcome(invocation.data.invocation), runLayout.observations(invocation.data.invocation), runLayout.transcript(invocation.data.session)],
      summary: terminal ? `Exchange was not completed; run ended as ${terminal.type}.` : state.summary });
  }

  private async messageDebug(command: Extract<RunCommand, { type: 'debug-message' }>, contentHash: string): Promise<Receipt> {
    const { planId, jobId, pauseId, expectedRevision, message: text } = command.payload;
    this.refuseEarlierPolicy(planId, jobId);
    const run = this.runs.get(key(planId, jobId));
    if (!run) throw new CommandRejection('not-found', `No run ${jobId} for plan "${planId}"`);
    const receipt = await run.mutex.run(async () => {
      if (this.ignoring(run)) throw new CommandRejection('conflict', 'This run accepts no debugger commands');
      const pause = run.debugPause;
      if (!pause || pause.pauseId !== pauseId || !run.debugPrepared) throw new CommandRejection('conflict', 'This is not the current breakpoint occurrence');
      if (pause.revision !== expectedRevision) throw new CommandRejection('stale-version', `The pause is at revision ${pause.revision}`, pause.revision);
      if (pause.state !== 'paused') throw new CommandRejection('busy', `The run is ${pause.state}`);
      if (pause.taskState !== 'pending') throw new CommandRejection('conflict', 'An outcome is held; resume consumes it without another model call');
      run.writer.requireSettled('Debugger exchange requires settled tools');
      const at = this.now();
      const accepted = this.commands.accept(command, contentHash, jobId, run.log.nextSequence, at);
      await run.log.append({ type: 'debug-exchange-admitted', data: { pauseId, revision: pause.revision, message: text, command: accepted } }, at);
      this.commands.remember(accepted);
      pause.state = 'exchanging'; pause.cursor = run.log.version;
      pause.summary = `Engineer exchange ${command.commandId} admitted; ordinary workflow remains suspended.`;
      return accepted.receipt;
    });
    // The command mutex protects only admission. An independent client can stop
    // or retrieve this command while its ordinary tools and model are running.
    const exchange = this.exchangeDebug(run, command).catch(error => this.fail(run, 'internal', `Debugger exchange could not settle: ${message(error)}`));
    run.done = Promise.all([run.done, exchange]).then(() => undefined);
    return receipt;
  }

  private async exchangeDebug(run: Run, command: Extract<RunCommand, { type: 'debug-message' }>): Promise<void> {
    const pause = run.debugPause!;
    const prepared = run.debugPrepared!;
    await this.afterWrite('debug-exchange-admitted', run.jobId);
    if (this.ignoring(run)) return;
    const changes = await documentChanges(this.projectRoot, run.planId, run.directory, run.record.manifest);
    if (changes.length > 0) { await this.fail(run, 'inputs-changed', `Captured documents changed while paused: ${changes.join('; ')}`); return; }
    if (this.ignoring(run)) return;
    const result = await prepared.exchange(command.payload.message);
    if (this.ignoring(run) || run.debugPause !== pause) return;
    const taskState = result.settlementConfirmed === false ? 'terminal' : result.pending ? 'pending' : result.ended === 'submitted' && result.value !== undefined ? 'accepted' : 'terminal';
    await run.mutex.run(async () => {
      if (this.ignoring(run) || run.debugPause !== pause) return;
      pause.state = 'paused'; pause.revision += 1; pause.taskState = taskState;
      pause.nextAction = taskState === 'pending' ? 'Resume continues the latest settled engineer session with its ordinary task.' : 'Resume handles the held engineer outcome without another model call.';
      pause.summary = taskState === 'pending' ? 'Engineer conversation settled; assignment remains pending. Resume continues its ordinary task.'
        : taskState === 'accepted' ? 'Engineer submitted an accepted action; workflow handling is held until resume.'
        : result.settlementConfirmed === false ? 'Engineer outcome retained, but tool settlement was not confirmed; writer, exchanges and gates remain blocked.' : `Engineer ended ${result.ended}; its actual outcome is held until resume.`;
      const exchange: DebugExchange = { ...pause, kind: 'exchange', commandId: command.commandId, cursor: run.log.nextSequence,
        status: 'settled', answer: result.lastText ?? null, invocation: result.id || null, session: result.session || null,
        point: result.ref || null, outcome: result.ended, error: result.error ?? null,
        ...(result.settlementConfirmed === undefined ? {} : { settlementConfirmed: result.settlementConfirmed }),
        continuityLoss: result.actual === 'fresh' && run.log.all('invocation-ended').some(event => event.data.invocation === result.id && event.data.degraded) ? run.log.all('invocation-ended').find(event => event.data.invocation === result.id)?.data.degraded?.reason ?? null : null,
        verdicts: [...result.verdicts ?? []], evidence: result.id === '' ? [] : [runLayout.invocation(result.id), runLayout.outcome(result.id), runLayout.observations(result.id), runLayout.transcript(result.session),
          ...(result.ended === 'submitted' ? [runLayout.submission(result.id)] : [])] };
      await run.log.append({ type: 'debug-exchange-settled', data: { pauseId: pause.pauseId, revision: pause.revision, commandId: command.commandId, result: exchange } }, this.now());
      pause.cursor = run.log.version;
    });
    run.notify();
  }

  private async resumeDebug(command: Extract<RunCommand, { type: 'debug-resume' }>, contentHash: string): Promise<Receipt> {
    const { planId, jobId, pauseId, expectedRevision } = command.payload;
    this.refuseEarlierPolicy(planId, jobId);
    const run = this.runs.get(key(planId, jobId));
    if (!run) throw new CommandRejection('not-found', `No run ${jobId} for plan "${planId}"`);
    const receipt = await run.mutex.run(async () => {
      if (this.ignoring(run)) throw new CommandRejection('conflict', 'This run accepts no debugger commands');
      const pause = run.debugPause;
      if (!pause || pause.pauseId !== pauseId) throw new CommandRejection('conflict', 'This is not the current breakpoint occurrence');
      if (pause.revision !== expectedRevision) throw new CommandRejection('stale-version', `The pause is at revision ${pause.revision}`, pause.revision);
      if (pause.state !== 'paused') throw new CommandRejection('busy', `The run is ${pause.state}`);
      // A held terminal outcome can return to ordinary failure handling without
      // acquiring a writer or starting a model. The unsettled barrier stays set.
      if (run.writer.isUnsettled && (pause.taskState !== 'terminal' || !run.debugPrepared?.held())) throw new CommandRejection('busy', run.writer.blocked!);
      const at = this.now();
      const accepted = this.commands.accept(command, contentHash, jobId, run.log.nextSequence, at);
      await run.log.append({ type: 'debug-resumed', data: { pauseId, revision: pause.revision + 1, command: accepted, ...(command.payload.message === undefined ? {} : { message: command.payload.message }) } }, at);
      run.debugPrepared?.resume(command.payload.message);
      this.commands.remember(accepted);
      run.debugPause = undefined;
      return accepted.receipt;
    });
    run.notify();
    return receipt;
  }

  private async stop(command: Extract<RunCommand, { type: 'stop-job' }>, contentHash: string): Promise<Receipt> {
    const { planId, jobId } = command.payload;
    this.refuseEarlierPolicy(planId, jobId);
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
    run.readiness?.controller.abort();
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
    const readiness = run.readiness;
    if (readiness !== undefined) {
      let timer: NodeJS.Timeout | undefined;
      const finished = await Promise.race([
        readiness.settled.then(() => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), grace); }),
      ]);
      clearTimeout(timer);
      if (!finished) throw new Error(`Readiness did not settle within ${grace} ms; refusing to publish job-stopped`);
    }
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
    for (const preparation of run.reviewPreparations.values()) preparation.abort();
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
    this.refuseEarlierPolicy(planId, jobId);
    const run = this.runs.get(key(planId, jobId));
    if (!run) throw new CommandRejection('not-found', `No run ${jobId} for plan "${planId}"`);
    const receipt = await run.mutex.run(async () => {
      this.commands.requireVersion(command, run.log.version);
      const snapshot = runSnapshot(run.record, run.log.events);
      const refusal = approvalRefusal(run, snapshot);
      if (refusal !== null) throw new CommandRejection('conflict', refusal);
      const changes = await documentChanges(this.projectRoot, planId, run.directory, run.record.manifest);
      if (changes.length > 0) throw new CommandRejection('inputs-changed', changes.join('; '));
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
   * the answer reads the state again. After the run has ended, only a plan
   * deviation accepts a command: the person reviews the run's deviations
   * once it is over.
   */
  private async checkFindingCommand(command: CheckFindingUserCommand, contentHash: string): Promise<Receipt> {
    const { planId, jobId } = command.payload;
    this.refuseEarlierPolicy(planId, jobId);
    const run = this.runs.get(key(planId, jobId));
    if (!run) throw new CommandRejection('not-found', `No run ${jobId} for plan "${planId}"`);
    const at = this.now();
    let accepted: AcceptedCommand | undefined;
    const committed = await commitCheckFindingChange(run, ({ log, state }) => {
      // A person's decision about a plan deviation outlasts the run; every
      // other CheckFinding of an ended run accepts no command.
      const entry = state.findings.get(command.payload.checkFinding);
      if (log.terminal !== undefined && (entry === undefined || !isPlanDeviation(entry))) {
        throw new CommandRejection('conflict', `The run has ended; its CheckFindings other than plan deviations accept no command. Run ${log.runId} has ended with ${log.terminal.type}`);
      }
      this.commands.requireVersion(command, log.version);
      const change = userCheckFindingChange(command, entry);
      if (!change.ok) throw new CommandRejection(change.code, change.message, undefined, change.evidence);
      const receipt = this.commands.accept(command, contentHash, jobId, log.nextSequence, at);
      accepted = receipt;
      return {
        commands: [change.command],
        compose: decided => ({ event: { type: 'check-findings-recorded', data: { cause: { kind: 'user-command', command: receipt }, checkFindings: [...decided.events] } } }),
      };
    }, at, { afterEnd: true });
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

  private async drive(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot,
    recovering = false): Promise<void> {
    // The run's files are written and its first event is in the log; nothing
    // of the run itself has happened yet.
    if (!recovering) await this.afterWrite('job-created', run.record.jobId);
    if (this.ignoring(run)) return;
    if (recovering) await this.handling.cleanupClosedScratch(run);
    this.startReviews(run, agent, packages);
    const accepted = await this.analyse(run, agent, packages, baseline);
    if (!accepted || this.ignoring(run)) return;

    const approved = await this.awaitReview(run);
    if (!approved || this.ignoring(run)) return;

    const ready = await this.reachReadiness(run);
    if (!ready || this.ignoring(run)) return;

    await this.setupScratch(run);
    if (this.ignoring(run)) return;

    await this.materializeScenarios(run);
    if (this.ignoring(run)) return;

    const worked = await this.takeWorkItems(run, agent, packages, baseline);
    if (!worked || this.ignoring(run)) return;

    // Every review settles, or is finished at its bound, before the final
    // gate: the run completes with no reader left and no request pending.
    await this.settleReviews(run);
    if (this.ignoring(run)) return;

    const nonfunctional = await this.assessNonfunctional(run, agent, packages);
    if (nonfunctional === null || this.ignoring(run)) return;
    if (!await this.recordNonfunctionalDeviations(run, nonfunctional) || this.ignoring(run)) return;
    await this.finalGate(run, nonfunctional);
  }

  /** Prepare the actual eventual commit tree after all source-mutating rendering. */
  private async prepareNonfunctionalCandidate(run: Run): Promise<{ id: string; candidate: Candidate } | null> {
    run.writer.requireSettled('A non-functional candidate cannot be prepared');
    const changed = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (changed.length > 0) {
      await this.fail(run, 'inputs-changed', `The captured plan evidence changed before assessment: ${changed.join('; ')}`, [runLayout.documentManifest]);
      return null;
    }
    await this.gates.rerenderScenarios(run);
    const preview = await this.previewCandidateTree();
    const id = `cand-${String(run.log.count('candidate-prepared') + 1).padStart(3, '0')}`;
    const candidate = { tree: preview.tree, head: preview.head, preparedAt: this.now().toISOString() };
    const body = preparedCandidateSchema.parse({
      schema: 'ramify-agent.prepared-candidate/1', candidate,
      scenarioRenderingHash: sha256(canonicalJson(this.gates.expectedFeatures(run))), writerSettled: true,
    });
    await this.write(run, { type: 'candidate-prepared', data: { candidate: id, tree: candidate.tree } }, [
      { path: runLayout.candidate(id), id, revision: 1, body },
    ]);
    await this.afterWrite('candidate-prepared', run.record.jobId);
    return { id, candidate };
  }

  /** Re-read the ledger after each step: a committed prefix is never repeated. */
  private async assessNonfunctional(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>,
  ): Promise<{ candidateId: string; assessment: Assessment } | null> {
    const evidence = await readAcceptedEvidence(run.directory, run.record, run.log.events);
    if (evidence.status === 'unavailable') {
      await this.fail(run, 'analysis-invalid', `The fixed non-functional catalog is unavailable: ${evidence.reason}`);
      return null;
    }
    const accepted = run.log.find('analysis-accepted');
    const catalogHash = accepted?.data.evidence.catalog.hash;
    if (catalogHash === undefined) {
      await this.fail(run, 'analysis-invalid', 'The fixed non-functional catalog has no accepted hash');
      return null;
    }
    const maxRounds = run.record.policy.limits.nonfunctionalRoundsPerPlan ?? 3;
    if (!run.log.find('nonfunctional-phase-started')) {
      await this.write(run, { type: 'nonfunctional-phase-started', data: { catalogHash, maxRounds } });
      await this.afterWrite('nonfunctional-phase-started', run.record.jobId);
    }
    const nfrIds = assessedElements(evidence.catalog);
    for (;;) {
      if (this.ignoring(run)) return null;
      const replay = replayNonfunctionalPhase(run.log.ledger.replay(), nfrIds, maxRounds);
      if (!replay.ok) {
        await this.fail(run, 'recovery-exhausted', `Committed non-functional phase is unavailable: ${replay.reason}`);
        return null;
      }
      const state = replay.value;
      const decision = decideNonfunctionalRound(state.input);
      if (decision.action === 'stop') {
        if (state.final === null) {
          await this.fail(run, 'recovery-exhausted', 'The closed non-functional phase has no final assessment');
          return null;
        }
        return { candidateId: state.final.candidateId, assessment: state.final.assessment };
      }
      if (decision.action === 'unavailable') {
        await this.fail(run, 'recovery-exhausted', 'No matching non-functional evidence was obtained within the captured bound');
        return null;
      }
      if (decision.action === 'prepare-candidate') {
        if (await this.prepareNonfunctionalCandidate(run) === null) return null;
        continue;
      }
      if (decision.action === 'assess') {
        const candidate = state.input.candidate;
        if (candidate === null || state.candidateId === null) throw new Error('assessment lacks prepared candidate');
        if (await this.assessNonfunctionalCandidate(run, agent, packages, evidence,
          { id: state.candidateId, candidate }, decision.round, decision.phase) === null) return null;
        continue;
      }
      if (decision.action === 'investigate' || decision.action === 'repair-or-close') {
        if (state.input.candidate === null || state.assessment === null) throw new Error('action lacks assessed candidate');
        if (state.assignment !== null) {
          if (!await this.resumeNonfunctionalRepair(run, agent, packages, evidence.catalog, state.assignment)) return null;
          continue;
        }
        const action = await this.nonfunctionalAction(run, agent, packages, evidence.catalog,
          state.input.candidate, state.assessment, decision, state.investigatedNfrs);
        if (action === null) return null;
        if (action.value.kind === 'investigate') {
          if (!await this.nonfunctionalInvestigation(run, agent, packages, state.assessment, action.value)) return null;
          continue;
        }
        if (action.value.kind === 'repair') {
          if (state.candidateId === null || !await this.nonfunctionalRepair(run, agent, packages, evidence.catalog,
            state.assessment, state.candidateId, action.value)) return null;
          continue;
        }
        await this.closeNonfunctionalRound(run, state, 'exhausted', action.invocation);
        continue;
      }
      if (decision.action === 'close') {
        if (decision.unresolved.length > 0) {
          if (state.input.candidate === null || state.assessment === null) throw new Error('closure lacks assessed candidate');
          const action = await this.nonfunctionalAction(run, agent, packages, evidence.catalog,
            state.input.candidate, state.assessment, decision, state.investigatedNfrs);
          if (action === null) return null;
          if (action.value.kind !== 'close') throw new Error('Closed repaired round received an action other than close');
          await this.closeNonfunctionalRound(run, state, decision.outcome, action.invocation);
        } else {
          await this.closeNonfunctionalRound(run, state, decision.outcome);
        }
        continue;
      }
    }
  }

  /** Record each exhausted source obligation with its user request in one durable line. */
  private async recordNonfunctionalDeviations(
    run: Run, binding: { candidateId: string; assessment: Assessment },
  ): Promise<boolean> {
    const unavailable = async (reason: string, refs: string[] = []): Promise<false> => {
      await this.fail(run, 'recovery-exhausted', `Non-functional deviation evidence is unavailable: ${reason}`, refs);
      return false;
    };
    const evidence = await readAcceptedEvidence(run.directory, run.record, run.log.events);
    if (evidence.status === 'unavailable') return unavailable(evidence.reason);
    const changed = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (changed.length > 0) {
      await this.fail(run, 'inputs-changed', `Captured plan evidence changed before non-functional deviation review: ${changed.join('; ')}`,
        [runLayout.documentManifest]);
      return false;
    }
    const nfrIds = assessedElements(evidence.catalog);
    const replay = replayNonfunctionalPhase(run.log.ledger.replay(), nfrIds, run.record.policy.limits.nonfunctionalRoundsPerPlan ?? 3);
    if (!replay.ok) return unavailable(replay.reason);
    const decision = decideNonfunctionalRound(replay.value.input);
    if (decision.action !== 'stop' || replay.value.final?.candidateId !== binding.candidateId
      || replay.value.final.assessment.id !== binding.assessment.id
      || replay.value.final.candidate.tree !== binding.assessment.candidate.tree) {
      return unavailable('The final closed assessment does not match the candidate sent to the gate');
    }
    if (decision.outcome === 'satisfied') return true;
    if (decision.outcome !== 'exhausted') return unavailable(`The final round ended ${decision.outcome}`);
    const closed = run.log.all('nonfunctional-round-closed').at(-1);
    const actionId = closed?.data.actionInvocation;
    if (closed?.data.outcome !== 'exhausted' || !actionId) return unavailable('Exhaustion has no accepted coordinator close action');
    const start = run.log.all('invocation-started').filter(event => event.data.invocation === actionId
      && event.data.role === 'nonfunctional-coordinator');
    const ended = run.log.all('invocation-ended').filter(event => event.data.invocation === actionId);
    if (start.length !== 1 || ended.length !== 1 || start[0]!.sequence >= ended[0]!.sequence
      || start[0]!.data.session !== ended[0]!.data.session || ended[0]!.data.ended !== 'submitted') {
      return unavailable('The close action has no accepted coordinator invocation', [runLayout.submission(actionId)]);
    }
    const outcome = invocationOutcomeSchema.safeParse(this.committedBody(run, runLayout.outcome(actionId)));
    const raw = await readIfExists(run.path(runLayout.submission(actionId)));
    if (!outcome.success || outcome.data.disposition !== 'applied' || outcome.data.ended !== 'submitted'
      || raw === undefined || sha256(raw) !== ended[0]!.data.submission
      || outcome.data.submission?.hash !== ended[0]!.data.submission) {
      return unavailable('The accepted close submission bytes or outcome cannot be verified', [runLayout.submission(actionId)]);
    }
    let action: CoordinatorAction;
    try {
      const envelope = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      if (envelope.schema !== 'ramify-agent.nonfunctional-action/1') throw new Error('wrong close submission schema');
      const { schema: _schema, ...body } = envelope;
      action = coordinatorActionSchema.parse(body);
    } catch (error) {
      return unavailable(`The close submission cannot be parsed: ${message(error)}`, [runLayout.submission(actionId)]);
    }
    if (action.kind !== 'close') return unavailable('The exhausted action was not a close submission');
    const unresolved = binding.assessment.results.filter(item => item.result !== 'satisfied');
    const choices = new Map(action.deviations.map(choice => [choice.nfr, choice]));
    if (choices.size !== unresolved.length || action.deviations.length !== unresolved.length
      || unresolved.some(item => !choices.has(item.nfr))
      || action.deviations.some(choice => choice.proposedAlternative === null && choice.uncertainty.trim() === '')) {
      return unavailable('The accepted close action does not dispose each unresolved NFR exactly once');
    }
    const preview = await this.previewCandidateTree();
    if (preview.tree !== binding.assessment.candidate.tree) {
      await this.fail(run, 'inputs-changed', 'The source tree changed before non-functional deviations were recorded');
      return false;
    }
    for (const result of unresolved) {
      const item = evidence.catalog.elements.find(candidate => candidate.id === result.nfr);
      const choice = choices.get(result.nfr);
      if (!item || !choice) return unavailable(`Fixed NFR ${result.nfr} has no accepted source or close choice`);
      const previous = run.log.all('nonfunctional-deviation-recorded').filter(event => event.data.nfr === result.nfr);
      if (previous.length > 1 || (previous.length === 1 && previous[0]!.data.assessment !== binding.assessment.id)) {
        return unavailable(`NFR ${result.nfr} has a conflicting recorded deviation`);
      }
      if (previous.length === 1) {
        const event = previous[0]!;
        const recorded = nonfunctionalDeviationSchema.safeParse(this.committedBody(run, runLayout.nonfunctionalDeviation(event.data.deviation)));
        const expected = prepareNonfunctionalDeviation({ id: event.data.deviation, checkFinding: event.data.checkFinding,
          item, assessment: binding.assessment, result,
          candidate: binding.assessment.candidate, coordinatorInvocation: binding.assessment.coordinatorInvocation,
          proposedAlternative: choice.proposedAlternative ?? '', uncertainty: choice.uncertainty });
        const finding = checkFindingStateOf(run.log.ledger).findings.get(event.data.checkFinding);
        if (!recorded.success || !expected.ok || canonicalJson(recorded.data) !== canonicalJson(expected.record)
          || finding?.reports[0]?.judgment?.ground?.hash !== nonfunctionalDeviationHash(recorded.data)
          || finding.reports[0].observation.kind !== 'plan-deviation'
          || finding.decisions[0]?.decision.action !== 'request-user-decision') {
          return unavailable(`Previously recorded deviation for ${result.nfr} cannot be verified`);
        }
        continue;
      }
      const version = run.log.version;
      const id = `nfd-${String(run.log.count('nonfunctional-deviation-recorded') + 1).padStart(3, '0')}`;
      const committed = await commitCheckFindingChange(run, ({ log, state }) => {
        if (log.version !== version || log.terminal !== undefined) return { stale: 'The assessed candidate moved before deviation recording' };
        if (log.all('nonfunctional-deviation-recorded').some(event => event.data.nfr === result.nfr)) {
          return { stale: `NFR ${result.nfr} was already recorded` };
        }
        const prepared = prepareNonfunctionalDeviation({ id, checkFinding: nextCheckFinding(state), item,
          assessment: binding.assessment, result,
          candidate: binding.assessment.candidate, coordinatorInvocation: binding.assessment.coordinatorInvocation,
          proposedAlternative: choice.proposedAlternative ?? '', uncertainty: choice.uncertainty });
        if (!prepared.ok) throw new Error(prepared.errors.join('; '));
        const record = prepared.record;
        const path = runLayout.nonfunctionalDeviation(id);
        const commands = nonfunctionalDeviationCommands(state, record, evidence.manifest, path);
        if (!commands.ok) throw new Error(commands.errors.join('; '));
        return { commands: commands.commands, compose: decided => ({
          event: { type: 'nonfunctional-deviation-recorded', data: { deviation: id, nfr: result.nfr,
            assessment: binding.assessment.id, checkFinding: record.checkFinding, checkFindings: [...decided.events] } },
          records: [{ path, id, revision: 1, body: record }],
        }) };
      }, this.now());
      if (committed.kind !== 'committed') return unavailable(`Could not record deviation ${id}: ${committed.kind === 'refused' ? committed.refusal.message : 'already replayed'}`);
      run.notify();
    }
    return true;
  }

  private async closeNonfunctionalRound(
    run: Run, state: import('./nonfunctional-phase.js').CommittedNonfunctionalPhase,
    outcome: 'satisfied' | 'continue' | 'exhausted', actionInvocation?: string,
  ): Promise<void> {
    const number = state.input.closedRounds.length + 1;
    const initial = state.input.initial;
    if (initial === null || state.candidateId === null) throw new Error('round closure lacks candidate-bound initial evidence');
    const id = `nfr-round-${String(number).padStart(3, '0')}`;
    const record = roundSchema.parse({ schema: 'ramify-agent.nonfunctional-round/1', number,
      initial: initial.id, investigation: state.investigationInvocations.at(-1) ?? null,
      repair: state.repair?.assignment ?? null, reassessment: state.input.reassessment?.id ?? null, outcome });
    await this.write(run, { type: 'nonfunctional-round-closed', data: { round: number, record: id, outcome,
      ...(actionInvocation === undefined ? {} : { actionInvocation }),
    } }, [
      { path: runLayout.nonfunctionalRound(number), id, revision: 1, body: record },
    ]);
  }

  /** Current immutable source selection; an empty list requires an actual successful diff. */
  /** Exact recorded NFR operations retain their installed declaration and accepted-boundary default. */
  private async originalNonfunctionalContext(run: Run, agent: AgentPort, toolName: string, candidate: Candidate) {
    if (!run.restoring) return { originalInvocation: undefined, legacy: false, base: undefined };
    const matches = [];
    for (const event of run.log.all('invocation-started').filter(event => event.data.role === 'nonfunctional-coordinator'
      && !run.log.all('invocation-ended').some(ended => ended.data.invocation === event.data.invocation))) {
      const original = await (await this.operations(agent)).originalOperation(run.record.jobId, event.data.invocation);
      if (original === null || original.packet.submissionTool !== toolName) continue;
      if (original.task.environment.candidate !== candidate.tree || original.task.environment.snapshot !== candidate.tree) throw new Error('Original NFR candidate binding changed');
      const declaration = original.declarations.find(tool => tool.name === 'snapshot_diff');
      const legacyDeclaration = boundedNonfunctionalTools({ source: this.candidates, projectRoot: this.projectRoot, candidate: candidate.tree,
        base: this.accepted(run) }).find(tool => tool.name === 'snapshot_diff')!;
      const legacy = declaration !== undefined && canonicalJson(declaration) === canonicalJson({ name: legacyDeclaration.name,
        description: legacyDeclaration.description, inputSchema: legacyDeclaration.inputSchema, mutating: false });
      const record = invocationSchema.parse(this.committedBody(run, runLayout.invocation(event.data.invocation)));
      matches.push({ originalInvocation: event.data.invocation, legacy, base: legacy ? record.base : undefined });
    }
    if (matches.length > 1) throw new Error('Ambiguous original NFR task correlation');
    return matches[0] ?? { originalInvocation: undefined, legacy: false, base: undefined };
  }

  private async nonfunctionalSourceInputs(run: Run, candidate: Candidate, scope: readonly string[] = ['.'], workspace = false,
    original?: { readonly legacy: boolean; readonly base: string | undefined }) {
    const base = original?.base ?? this.accepted(run);
    const runStart = original?.legacy ? undefined : this.recordedRunBase(run.record, run.log);
    const comparisons: SnapshotComparison[] = [];
    for (const [name, boundary] of [['run-start', runStart], ['accepted-boundary', base]] as const) {
      if (boundary === undefined) continue;
      const diff = await this.candidates.diffNameStatus(this.projectRoot, boundary, candidate.tree);
      const changes = [...new Map(diff.filter(change => nonfunctionalSourceAllows(change.path, scope)).map(change => [`${change.status}\0${change.path}`, change])).values()]
        .sort((left, right) => left.path.localeCompare(right.path) || left.status.localeCompare(right.status));
      comparisons.push({ name, base: boundary, target: candidate.tree, changes });
    }
    // Reuse candidate entries for optional hint filtering and the source tools. No live probes.
    const entries = new Map((await this.candidates.treeEntries(this.projectRoot, candidate.tree))
      .filter(entry => nonfunctionalSourceAllows(entry.path, scope)).map(entry => [entry.path, entry]));
    const directories = new Set(['']);
    for (const path of entries.keys()) for (let directory = posix.dirname(path); directory !== '.' && !directories.has(directory); directory = posix.dirname(directory)) directories.add(directory);
    const snapshot: CandidateSnapshot = { commit: candidate.tree, base, tree: candidate.tree, entries, directories,
      changes: comparisons.find(comparison => comparison.name === 'accepted-boundary')!.changes };
    const groups: StartingPointGroup[] = [];
    const records = committedRecords(run.log.ledger.replay());
    for (const result of records.results.values()) {
      if (result.outcome !== 'accepted') continue;
      const assignment = records.assignments.get(result.iteration);
      if (assignment === undefined) continue;
      const assigned = this.assignmentStartingPoints(run, assignment);
      const modules = assignment.scope.resolved.ownership.modules.filter(module => {
        const source = resolve(this.projectRoot, module.directory, 'src');
        return assignment.scope.resolved.roots.some(root => root === source || isContained(root, source))
          || assignment.gate.tests.exactOwners.includes(module.id)
          || assignment.gate.tests.subtrees.some(owner => module.id === owner || module.id.startsWith(`${owner}/`));
      });
      groups.push({ origin: { ...assigned.origin, producer: 'assigned module/source/test locations' }, points: modules.flatMap(module => [
        { path: posix.join(module.directory, 'README.md'), note: `Assigned module ${module.id} purpose` },
        { path: posix.join(module.directory, 'module.ramify'), note: `Assigned module ${module.id} declaration` },
        { path: posix.join(module.directory, 'src'), note: `Assigned module ${module.id} source` },
        { path: posix.join(module.directory, 'src/tests'), note: `Assigned module ${module.id} owned tests` },
      ]) }, assigned, await this.engineerStartingPoints(run, assignment, result));
    }
    const discoveries = startingPointsSection(workspace ? groups.map(group => ({ ...group,
      points: group.points?.filter(point => resolveSnapshotPath(snapshot, point.path).ok) })) : groups,
      { projectRoot: this.projectRoot, ...(workspace ? {} : { snapshot }), allows: path => nonfunctionalSourceAllows(path, scope) });
    const sourceSection = { key: 'support:nonfunctional-source', text: JSON.stringify({ head: candidate.head, tree: candidate.tree,
      defaultComparison: comparisons[0]!.name,
      comparisons: comparisons.map(({ changes, ...comparison }) => ({ ...comparison, changedPaths: changes })),
      originalSource: run.record.manifest.source,
      comparisonLimit: 'Named comparisons cover net changes at their recorded Git boundaries, not every intermediate edit or affected caller. An empty diff establishes no historical preservation. Dirty original capture excludes uncommitted starting bytes from the starting commit comparison.',
      readScope: scope, excludedDirectories: ['.git', 'node_modules', '.ramify', '.ramify-architect'], excludedRunOutputs: ['plans/.harness', 'plans/<plan>/.harness'],
      authority: 'Prepared candidate source is authoritative. Starting points, prior completion claims and green audits do not establish satisfaction. Assess all supplied fixed/NFR obligations independently and explore the whole allowed tree as needed.' }) };
    return { sections: [sourceSection, ...(discoveries === undefined ? [] : [discoveries])], snapshot, comparisons };
  }

  private async nonfunctionalAction(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, catalog: ElementCatalog,
    candidate: Candidate, assessment: Assessment, decision: RoundDecision,
    investigatedNfrs: readonly string[],
  ): Promise<{ value: CoordinatorAction; invocation: string } | null> {
    if (decision.action !== 'investigate' && decision.action !== 'repair-or-close' && decision.action !== 'close') {
      throw new Error(`A coordinator action cannot answer ${decision.action}`);
    }
    const loaded = packages.get('nonfunctional-coordinator');
    if (loaded === undefined) throw new Error('Non-functional coordinator package is unavailable');
    const unresolved = assessment.results.filter(item => item.result !== 'satisfied').map(item => item.nfr);
    const index = await this.refreshIndex(run);
    const context = { decision, results: assessment.results, investigatedNfrs,
      moduleNames: [...(index?.modules.keys() ?? [])] };
    const investigationPaths = run.log.all('nonfunctional-investigated')
      .filter(event => event.data.assessment === assessment.id && event.data.round === assessment.round)
      .map(event => run.path(runLayout.submission(event.data.invocation)));
    const original = await this.originalNonfunctionalContext(run, agent, coordinatorActionToolName, candidate);
    const sourceInputs = await this.nonfunctionalSourceInputs(run, candidate, ['.'], false, original);
    const result = await this.runInvocation<CoordinatorAction>(run, agent, {
      originalInvocation: original.originalInvocation, role: 'nonfunctional-coordinator', task: { goal: `Assess the requirements of candidate ${candidate.tree}`, requirements: [this.planPackage(run, catalog)], candidate: candidate.tree, snapshot: candidate.tree, literalSections: sourceInputs.sections }, work: {},
      attempt: run.log.all('invocation-started').filter(event => event.data.role === 'nonfunctional-coordinator').length + 1,
      loaded, systemPrompt: renderNonfunctionalCoordinatorPrompt(loaded, this.projectRoot, coordinatorActionToolName),
      prompt: [coordinatorActionPrompt(candidate, unresolved, investigatedNfrs,
        { assessment, allowedAction: decision.action, investigationPaths }), this.planPackage(run, catalog)].join('\n\n'),
      start: { mode: 'fresh' }, toolName: coordinatorActionToolName,
      description: 'Choose a bounded non-functional investigation, repair, or closure.',
      inputSchema: coordinatorActionJsonSchema, submissionSchema: 'ramify-agent.nonfunctional-action/1',
      validate: input => validateCoordinatorAction(input, context),
      keep: () => finished('work-closed'), scope: { write: null, measurement: null, size: null },
      equip: () => ({ builtinTools: [], tools: [...boundedNonfunctionalTools({ source: this.candidates, projectRoot: this.projectRoot, candidate: candidate.tree, base: sourceInputs.snapshot.base, snapshot: sourceInputs.snapshot, comparisons: original.legacy ? undefined : sourceInputs.comparisons, scope: undefined })] }),
    });
    if (result.ended !== 'submitted' || result.value === undefined) {
      await this.fail(run, 'agent-failed', `Non-functional coordinator action ended ${result.ended}`);
      return null;
    }
    const late = await this.previewCandidateTree();
    if (late.tree !== candidate.tree) {
      await this.fail(run, 'inputs-changed', 'The source tree changed during the non-functional coordinator action');
      return null;
    }
    return { value: result.value, invocation: result.id };
  }

  private async nonfunctionalInvestigation(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>,
    assessment: Assessment, action: Extract<CoordinatorAction, { kind: 'investigate' }>,
  ): Promise<boolean> {
    const loaded = packages.get('nonfunctional-coordinator');
    if (loaded === undefined) throw new Error('Non-functional coordinator package is unavailable');
    const original = await this.originalNonfunctionalContext(run, agent, coordinatorInvestigationToolName, assessment.candidate);
    const sourceInputs = await this.nonfunctionalSourceInputs(run, assessment.candidate, action.scope, false, original);
    const result = await this.runInvocation<CoordinatorInvestigation>(run, agent, {
      originalInvocation: original.originalInvocation, role: 'nonfunctional-coordinator', task: { goal: action.question, requirements: [this.planPackage(run, await this.frozenCatalog(run), action.nfrs)], candidate: assessment.candidate.tree, snapshot: assessment.candidate.tree, literalSections: sourceInputs.sections }, work: {},
      attempt: run.log.all('invocation-started').filter(event => event.data.role === 'nonfunctional-coordinator').length + 1,
      loaded, systemPrompt: renderNonfunctionalCoordinatorPrompt(loaded, this.projectRoot, coordinatorInvestigationToolName),
      prompt: [`Investigate element IDs ${action.nfrs.join(', ')} for assessment ${assessment.id} of tree ${assessment.candidate.tree}.`,
        `Question: ${action.question}`, `Scope: ${action.scope.join(', ')}`,
        'Read the prepared candidate with snapshot_list/read/search/diff within the declared scope and report observed evidence and uncertainty. Git metadata and run records are excluded. Do not edit source.', '',
        this.planPackage(run, await this.frozenCatalog(run), action.nfrs)].join('\n'),
      start: { mode: 'fresh' }, toolName: coordinatorInvestigationToolName,
      description: 'Report read-only investigation evidence for every named NFR.',
      inputSchema: coordinatorInvestigationJsonSchema, submissionSchema: 'ramify-agent.nonfunctional-investigation/1',
      validate: input => validateCoordinatorInvestigation(input, action.nfrs),
      keep: () => finished('work-closed'), scope: { write: null, measurement: null, size: null },
      equip: () => ({ builtinTools: [], tools: [...boundedNonfunctionalTools({ source: this.candidates, projectRoot: this.projectRoot, candidate: assessment.candidate.tree, base: sourceInputs.snapshot.base, snapshot: sourceInputs.snapshot, comparisons: original.legacy ? undefined : sourceInputs.comparisons, scope: action.scope })] }),
    });
    if (result.ended !== 'submitted' || result.value === undefined) {
      await this.fail(run, 'agent-failed', `Non-functional investigation ended ${result.ended}`);
      return false;
    }
    const late = await this.previewCandidateTree();
    if (late.tree !== assessment.candidate.tree) {
      await this.fail(run, 'inputs-changed', 'The source tree changed during non-functional investigation');
      return false;
    }
    await this.write(run, { type: 'nonfunctional-investigated', data: {
      round: assessment.round, invocation: result.id, assessment: assessment.id, nfrs: [...action.nfrs],
    } });
    return true;
  }

  private async nonfunctionalRepair(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, catalog: ElementCatalog,
    assessment: Assessment, candidateId: string, action: Extract<CoordinatorAction, { kind: 'repair' }>,
  ): Promise<boolean> {
    const id = `nfr-repair-${String(run.log.count('nonfunctional-repair-assigned') + 1).padStart(3, '0')}`;
    const answer = await this.options.ramify.queryOwnership(this.projectRoot, ['.']);
    const scope = await resolveWriteScope({ projectRoot: this.projectRoot, ramify: this.options.ramify, index: await this.refreshIndex(run),
      view: run.record.manifest.architectView, revision: assessment.round,
      base: { modules: answer.selection.scope.ownership.modules.map(module => module.id), rationale: 'The recorded coordinator authorized one project-wide non-functional repair batch' },
      extra: [], read: [], bootstrap: [], rationale: action.task });
    const assignment = nonfunctionalRepairAssignmentSchema.parse({
      schema: 'ramify-agent.nonfunctional-repair-assignment/1', id, round: assessment.round,
      assessment: assessment.id, candidate: candidateId, nfrs: action.nfrs,
      startingModule: action.startingModule, task: action.task,
      evidence: action.evidence, uncertainty: action.uncertainty, scope,
      guarded: await captureGuardedFiles(this.projectRoot, [], await this.guardedScenarioFiles(run), [...await this.auditPreparationPaths(run), ...scopeConfigurationPaths(scope)]),
    });
    await this.write(run, { type: 'nonfunctional-repair-assigned', data: {
      round: assignment.round, assignment: id, assessment: assessment.id, candidate: candidateId,
      nfrs: [...assignment.nfrs], startingModule: assignment.startingModule,
    } }, [{ path: runLayout.nonfunctionalRepairAssignment(id), id, revision: 1, body: assignment }]);
    await this.afterWrite('nonfunctional-repair-assigned', run.record.jobId);
    return await this.resumeNonfunctionalRepair(run, agent, packages, catalog, assignment);
  }

  private async performNonfunctionalRepair(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, catalog: ElementCatalog,
    assignment: import('./nonfunctional-records.js').NonfunctionalRepairAssignment,
  ): Promise<boolean> {
    const loaded = packages.get('nonfunctional-repair-engineer');
    if (loaded === undefined) throw new Error('Non-functional repair package is unavailable');
    const index = await this.refreshIndex(run);
    const workingDirectory = await repairWorkingDirectory(this.projectRoot, assignment.startingModule, index);
    const guarded = guardedScopeOf(assignment.scope, await deniedFiles(this.projectRoot,
      [...await this.deniedFiles(run), ...assignment.guarded.map(file => file.path)]), this.options.ramify);
    const commandTimeoutMs = engineerBoundsOf(run.record.policy.limits).defaults.commandTimeoutMs;
    const tools = this.implementationTools(run, { workingDirectory, scopeRevision: 1, guarded, commandTimeoutMs, submissions: { legalOutcomes: ['completed', 'partial'], completionOutcome: null } });
    // A writer like any other: its scope size from the frozen baseline, and
    // its line events from the snapshots around it.
    const baseline = await this.baselineSnapshot(run);
    const before = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
    const { candidate } = await this.readPreparedCandidate(run, assignment.candidate);
    // Repair reads follow the existing project source authority; writes remain guarded by assignment.scope.
    const sourceInputs = await this.nonfunctionalSourceInputs(run, candidate, ['.'], true);
    const result = await this.runInvocation<NonfunctionalRepairSubmission>(run, agent, {
      // The repair engineer receives the same changed-path section as the coordinator that assigned it.
      role: 'nonfunctional-repair-engineer', task: { candidate: candidate.tree, modules: 'module' in assignment.scope.base ? [assignment.scope.base.module] : assignment.scope.base.modules, goal: assignment.task, requirements: [this.planPackage(run, catalog, assignment.nfrs)],
        literalSections: sourceInputs.sections }, work: { nonfunctionalRepair: assignment.id },
      attempt: run.log.all('invocation-started').filter(event => event.data.role === 'nonfunctional-repair-engineer').length + 1,
      loaded, systemPrompt: renderNonfunctionalRepairPrompt(loaded, this.projectRoot),
      prompt: repairPrompt(assignment.task, candidate,
        this.planPackage(run, catalog, assignment.nfrs), assignment.startingModule,
        { evidence: assignment.evidence, uncertainty: assignment.uncertainty }),
      start: { mode: 'fresh' }, toolName: nonfunctionalRepairToolName,
      description: 'Report the authorized non-functional repair batch and remaining work.',
      inputSchema: nonfunctionalRepairJsonSchema, submissionSchema: 'ramify-agent.nonfunctional-repair/1',
      validate: input => validateAgainst(nonfunctionalRepairSubmissionSchema, input),
      keep: () => finished('work-closed'),
      scope: { write: 1, measurement: baseline === null ? null : this.baselineReference(run), size: null },
      ...(baseline === null ? {} : { measured: { snapshot: baseline, scope: writeScopeMeasurement(assignment.scope), readScope: readScopeMeasurement(assignment.scope) } }),
      writer: true, guarded, readModules: assignment.scope.read, workingDirectory, equip: tools.equip, previewEquipment: tools.preview,
    });
    await this.recordLineEvents(run, result.id, before, await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git));
    if (result.ended !== 'submitted' || result.value === undefined) {
      await this.fail(run, 'agent-failed', `Non-functional repair ended ${result.ended}`);
      return false;
    }
    run.writer.requireSettled('Non-functional repair cannot be committed');
    const changed = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (changed.length > 0) {
      await this.fail(run, 'inputs-changed', `Captured plan evidence changed during repair: ${changed.join('; ')}`);
      return false;
    }
    if (!await this.repairScopeAllowed(run, assignment)) return false;
    await this.write(run, { type: 'nonfunctional-repair-committed', data: {
      round: assignment.round, invocation: result.id, assignment: assignment.id,
    } });
    await this.afterWrite('nonfunctional-repair-committed', run.record.jobId);
    return true;
  }

  /** Check the exact captured repair boundary after shell writes and again on restart. */
  private async repairScopeAllowed(run: Run, assignment: import('./nonfunctional-records.js').NonfunctionalRepairAssignment): Promise<boolean> {
    try {
      const guard = guardedScopeOf(assignment.scope, await deniedFiles(this.projectRoot,
        [...await this.deniedFiles(run), ...assignment.guarded.map(file => file.path)]), this.options.ramify);
      const changed = await this.git.changedPaths(this.projectRoot, this.accepted(run));
      const candidate = [];
      for (const path of changed) {
        const captured = assignment.guarded.find(file => file.path === path);
        const hash = captured === undefined ? undefined : await readFile(join(this.projectRoot, path)).then(bytes => sha256(bytes)).catch(error => {
          if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
          throw error;
        });
        if (captured === undefined || hash !== captured.hash) candidate.push(path);
      }
      const outside = await outsideScope(this.projectRoot, guard, candidate);
      if (outside.length === 0) return true;
      await this.fail(run, 'inputs-changed', `Repair changed files outside captured and current authority: ${outside.join('; ')}`);
    } catch (error) { await this.fail(run, 'inputs-changed', `Repair ownership cannot be verified: ${message(error)}`); }
    return false;
  }

  /** A durable assignment may precede the child; a settled submitted child may precede its repair event. */
  private async resumeNonfunctionalRepair(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, catalog: ElementCatalog,
    assignment: import('./nonfunctional-records.js').NonfunctionalRepairAssignment,
  ): Promise<boolean> {
    const started = run.log.all('invocation-started').filter(event =>
      event.data.role === 'nonfunctional-repair-engineer' && event.data.work.nonfunctionalRepair === assignment.id);
    if (started.length > 1) {
      await this.fail(run, 'recovery-exhausted', `Repair ${assignment.id} has duplicate child invocations`);
      return false;
    }
    if (started.length === 0) {
      const prepared = await this.readPreparedCandidate(run, assignment.candidate);
      const observed = await this.previewCandidateTree();
      if (observed.tree !== prepared.candidate.tree) {
        await this.fail(run, 'inputs-changed', `Source changed before assigned repair ${assignment.id} could start`);
        return false;
      }
      return await this.performNonfunctionalRepair(run, agent, packages, catalog, assignment);
    }
    const invocation = started[0]!.data.invocation;
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === invocation);
    const release = run.log.all('writer-released').find(event => event.data.invocation === invocation);
    if (ended?.data.ended !== 'submitted' || ended.data.submission === null || release?.data.confirmed !== true) {
      await this.fail(run, 'recovery-exhausted', `Repair ${assignment.id} has no confirmed, accepted child result`);
      return false;
    }
    try {
      const outcome = invocationOutcomeSchema.safeParse(this.committedBody(run, runLayout.outcome(invocation)));
      if (!outcome.success || outcome.data.invocation !== invocation
        || outcome.data.ended !== 'submitted' || outcome.data.disposition !== 'applied'
        || outcome.data.submission?.hash !== ended.data.submission
        || outcome.data.settled.confirmed !== true) {
        throw new Error('committed child outcome is not applied, submitted and settled');
      }
      const raw = await readFile(run.path(runLayout.submission(invocation)));
      if (sha256(raw) !== ended.data.submission) throw new Error('submission hash differs from committed invocation outcome');
      const value = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      if (value.schema !== 'ramify-agent.nonfunctional-repair/1') throw new Error('repair submission schema differs');
      const { schema: _schema, ...submission } = value;
      nonfunctionalRepairSubmissionSchema.parse(submission);
    } catch (error) {
      await this.fail(run, 'recovery-exhausted', `Repair ${assignment.id} result cannot be authenticated: ${message(error)}`);
      return false;
    }
    const changed = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (changed.length > 0) {
      await this.fail(run, 'inputs-changed', `Captured plan evidence changed during repair recovery: ${changed.join('; ')}`);
      return false;
    }
    if (!await this.repairScopeAllowed(run, assignment)) return false;
    await this.write(run, { type: 'nonfunctional-repair-committed', data: {
      round: assignment.round, invocation, assignment: assignment.id,
    } });
    await this.afterWrite('nonfunctional-repair-committed', run.record.jobId);
    return true;
  }

  private async readPreparedCandidate(run: Run, id: string): Promise<{ candidate: Candidate }> {
    const record = await readCommitted(run.log.ledger, runLayout.candidate(id), runSchemas.preparedCandidate);
    if (record.kind !== 'valid') throw new Error(`Prepared candidate ${id} is unavailable`);
    return record.value;
  }

  /** One complete fixed-catalog assessment of an already prepared candidate. */
  private async assessNonfunctionalCandidate(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>,
    catalog: Awaited<ReturnType<typeof readAcceptedEvidence>> & { status: 'available' },
    prepared: { id: string; candidate: Candidate }, round: number, phase: Assessment['phase'],
  ): Promise<Assessment | null> {
    const nfrIds = assessedElements(catalog.catalog);
    const id = `nfa-${String(run.log.count('nonfunctional-assessed') + 1).padStart(3, '0')}`;
    let assessment: Assessment;
    if (nfrIds.length === 0) {
      // An empty fixed catalog still needs explicit candidate-bound coverage.
      assessment = assessmentSchema.parse({ schema: 'ramify-agent.nonfunctional-assessment/1', id,
        candidate: prepared.candidate, round, phase, coordinatorInvocation: 'harness:empty-catalog', results: [] });
    } else {
      const loaded = packages.get('nonfunctional-coordinator');
      if (loaded === undefined) {
        await this.fail(run, 'internal', 'No prompt package is loaded for the non-functional coordinator');
        return null;
      }
      const original = await this.originalNonfunctionalContext(run, agent, coordinatorAssessmentToolName, prepared.candidate);
      const sourceInputs = await this.nonfunctionalSourceInputs(run, prepared.candidate, ['.'], false, original);
      const result = await this.runInvocation<CoordinatorAssessmentSubmission>(run, agent, {
        originalInvocation: original.originalInvocation, role: 'nonfunctional-coordinator', task: { goal: `Assess the complete NFR catalog for ${prepared.candidate.tree}`, requirements: [this.planPackage(run, catalog.catalog)], candidate: prepared.candidate.tree, snapshot: prepared.candidate.tree, literalSections: sourceInputs.sections }, work: {},
        attempt: run.log.all('invocation-started').filter(event => event.data.role === 'nonfunctional-coordinator').length + 1,
        loaded, systemPrompt: renderNonfunctionalCoordinatorPrompt(loaded, this.projectRoot),
        prompt: coordinatorAssessmentPrompt(this.planPackage(run, catalog.catalog), prepared.candidate, round, phase),
        start: { mode: 'fresh' }, toolName: coordinatorAssessmentToolName,
        description: 'Submit one evidence-grounded result for every non-functional and fixed requirement.',
        inputSchema: coordinatorAssessmentJsonSchema, submissionSchema: 'ramify-agent.nonfunctional-assessment-submission/1',
        validate: input => {
          const checked = bindCoordinatorAssessment(input, { catalog: catalog.catalog, candidate: prepared.candidate,
            observedTree: prepared.candidate.tree, id, round, phase, coordinatorInvocation: 'pending' });
          return checked.ok
            ? { ok: true, value: { kind: 'assessment' as const, results: checked.value.results } }
            : checked;
        },
        keep: () => finished('work-closed'), scope: { write: null, measurement: null, size: null },
        equip: () => ({ builtinTools: [], tools: [...boundedNonfunctionalTools({ source: this.candidates, projectRoot: this.projectRoot, candidate: prepared.candidate.tree, base: sourceInputs.snapshot.base, snapshot: sourceInputs.snapshot, comparisons: original.legacy ? undefined : sourceInputs.comparisons, scope: undefined })] }),
      });
      if (result.ended !== 'submitted' || result.value === undefined) {
        await this.fail(run, 'agent-failed', `The non-functional coordinator ended ${result.ended} without a complete assessment`);
        return null;
      }
      const late = await this.previewCandidateTree();
      const bound = bindCoordinatorAssessment(result.value, { catalog: catalog.catalog, candidate: prepared.candidate,
        observedTree: late.tree, id, round, phase, coordinatorInvocation: result.id });
      if (!bound.ok) {
        await this.fail(run, 'inputs-changed', `The non-functional assessment could not bind to the prepared tree: ${bound.errors.map(error => error.message).join('; ')}`);
        return null;
      }
      assessment = bound.value;
    }
    const changed = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (changed.length > 0) {
      await this.fail(run, 'inputs-changed', `The captured plan evidence changed during assessment: ${changed.join('; ')}`, [runLayout.documentManifest]);
      return null;
    }
    await this.write(run, { type: 'nonfunctional-assessed', data: { assessment: id, candidate: prepared.id, round, phase } }, [
      { path: runLayout.assessment(id), id, revision: 1, body: assessment },
    ]);
    await this.afterWrite('nonfunctional-assessed', run.record.jobId);
    return assessment;
  }

  // Invocations

  /** One invocation, through the invocation runner every role shares. */
  private async runInvocation<T>(run: Run, agent: AgentPort, request: InvocationRequest<T>): Promise<InvocationResult<T>> {
    if (run.record.breakpoint !== undefined && ['engineer', 'contract-engineer', 'nonfunctional-repair-engineer'].includes(request.role)) {
      let current = request;
      let held: InvocationResult<T> | undefined;
      run.debugPrepared = {
        inspect: () => this.runner.preview(run, agent, current),
        exchange: async text => {
          const result = await this.runner.runInvocation(run, agent, { ...current, callerText: text, pendingPlainReturn: true });
          if (result.pending) {
            // Both the agent point and harness briefing ancestry were retained by
            // ordinary operations; continue that exact point with current bindings.
            current = { ...current, start: { mode: 'continue', ref: result.ref }, session: result.session,
              continuing: 'debugger', fork: undefined, replaces: undefined, degraded: undefined, originalInvocation: undefined, restore: false,
              callerText: undefined };
          } else held = result;
          return result;
        },
        held: () => held !== undefined,
        resume: text => { current = { ...current, callerText: text, pendingPlainReturn: false }; },
      };
      if (!await this.pauseEngineer(run, request)) return { id: '', ended: 'stopped', value: undefined, ref: '', outcomeKind: 'stopped', session: '', kept: false };
      if (held !== undefined) return held;
      return this.runner.runInvocation(run, agent, current);
    }
    return this.runner.runInvocation(run, agent, request);
  }

  /** Park before invocation admission, outside all mutexes and invocation cleanup. */
  private async pauseEngineer<T>(run: Run, request: InvocationRequest<T>): Promise<boolean> {
    if (this.ignoring(run)) return false;
    const refusal = this.invocationRefusal(run);
    if (refusal !== null) { await this.fail(run, 'limit-exceeded', refusal); return false; }
    const pauseId = `pause-${String(run.log.count('debug-pausing') + 1).padStart(4, '0')}`;
    const goal = request.task?.goal ?? request.description;
    const nextAction = `Execute the prepared ${request.role} task with its ordinary tools and submission validator.`;
    const pause: BreakpointState = { kind: 'breakpoint', planId: run.planId, runId: run.jobId, pauseId, revision: 1,
      cursor: run.log.version, state: 'pausing', role: request.role, work: { ...request.work }, goal, nextAction,
      taskState: 'pending', summary: `Settling admitted work before ${request.role}: ${goal}` };
    run.debugPause = pause;
    // Attempts already admitted may finish their orientation and review calls.
    // The barrier is for new attempts, not the calls within those pipelines.
    const releaseReviews = run.reviews?.suspend();
    try {
      if (await this.write(run, { type: 'debug-pausing', data: { pauseId, revision: 1, role: request.role,
        work: request.work, goal, nextAction } }) === 'ended') return false;
      await run.reviews?.settled();
      await run.gating;
      await run.readiness?.settled;
      while (run.live.size > 0) await Promise.all([...run.live.values()].map(live => live.done));
      if (this.ignoring(run)) return false;
      run.writer.requireSettled('A usable breakpoint requires a settled writer');
      const unsettledInvocation = run.log.ledger.replay().flatMap(entry => entry.transaction.records).find(record => {
        if (!record.path.startsWith('invocations/') || !record.path.endsWith('/outcome.json')) return false;
        const outcome = invocationOutcomeSchema.safeParse(record.body);
        return !outcome.success || !outcome.data.settled.confirmed;
      });
      const operations = this.sessionOperations === undefined ? undefined : await this.sessionOperations;
      if (unsettledInvocation !== undefined || operations?.settlementConfirmed(run.jobId) === false) {
        await this.fail(run, 'agent-failed', `Whole-run breakpoint settlement was not confirmed${unsettledInvocation === undefined ? '' : ` for ${unsettledInvocation.id}`}; no usable pause was published.`);
        return false;
      }
      // Settlement is execution time. Only the fully reached caller wait is excluded.
      const settledRefusal = this.invocationRefusal(run);
      if (settledRefusal !== null) { await this.fail(run, 'limit-exceeded', settledRefusal); return false; }
      const reached = await run.mutex.run(async () => {
        if (this.ignoring(run)) return false;
        await run.log.append({ type: 'debug-paused', data: { pauseId, revision: 1 } }, this.now());
        pause.state = 'paused';
        pause.cursor = run.log.version;
        pause.summary = `Paused before ${request.role}: ${goal} Assignment prepared; engineer not yet invoked. Resume executes its ordinary task.`;
        return true;
      });
      if (!reached) return false;
      for (;;) {
        const changed = run.changed();
        if (this.ignoring(run)) return false;
        if (run.debugPause !== pause) break;
        await changed;
      }
      if (!run.debugPrepared?.held()) run.writer.requireSettled('The resumed engineer requires a settled writer');
      const changes = await documentChanges(this.projectRoot, run.planId, run.directory, run.record.manifest);
      if (changes.length > 0) { await this.fail(run, 'inputs-changed', `Captured documents changed while paused: ${changes.join('; ')}`); return false; }
      return !this.ignoring(run);
    } finally {
      run.debugPause = undefined;
      run.debugPrepared = undefined;
      // Stop/close takes precedence even if it raced with a durable resume.
      if (this.ignoring(run)) run.reviews?.close();
      releaseReviews?.();
    }
  }

  /** Restore only an exact owning role/work/request phase; no whole-history cursor or new identity. */
  private async restoreInvocation<T>(run: Run, agent: AgentPort, request: InvocationRequest<T>) {
    const pending = run.log.all('invocation-started').filter(event => !run.log.all('invocation-ended').some(ended => ended.data.invocation === event.data.invocation));
    const analysisPrefix = !run.log.find('analysis-accepted') && ['catalog-extractor', 'initial-architect'].includes(request.role);
    const candidates = run.log.all('invocation-started').filter(event => !run.restoredInvocations.has(event.data.invocation) && event.data.role === request.role &&
      canonicalJson(event.data.work) === canonicalJson(request.work) && (pending.includes(event) || analysisPrefix || event.data.invocation === request.originalInvocation));
    const matched = [];
    for (const event of candidates) {
      const record = invocationSchema.parse(this.committedBody(run, runLayout.invocation(event.data.invocation)));
      if (record.prompt.hash !== request.loaded.hash || request.originalInvocation !== event.data.invocation && record.prompt.requestedInputsHash !== inputsHash([request.systemPrompt, request.prompt, ...(request.callerText === undefined ? [] : [request.callerText])])) continue;
      const packet = await (await this.operations(agent)).packet(run.record.jobId, event.data.invocation);
      if (packet && packet.submissionTool !== request.toolName) continue;
      matched.push({ event, record, packet });
    }
    if (matched.length > 1) throw new Error('Ambiguous original owning task correlation');
    if (matched.length === 0) {
      if (candidates.some(event => pending.includes(event))) throw new Error('Original unfinished owning task inputs changed or are unavailable');
      return null;
    }
    const { event, packet } = matched[0]!; const id = event.data.invocation;
    run.restoredInvocations.add(id);
    const ended = run.log.all('invocation-ended').find(item => item.data.invocation === id);
    if (ended) {
      const outcome = invocationOutcomeSchema.parse(this.committedBody(run, runLayout.outcome(id)));
      if (!outcome.settled.confirmed || outcome.ended !== 'submitted' || !outcome.submission) throw new Error('Original accepted owning phase is not confirmed');
      const bytes = await readIfExists(run.path(runLayout.submission(id)));
      if (!bytes || sha256(bytes) !== outcome.submission.hash) throw new Error('Original accepted owning destination changed');
      const { schema, ...body } = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
      if (schema !== request.submissionSchema) throw new Error('Original accepted owning validator schema changed');
      return { hasIntent: true, result: { id, ended: outcome.ended, value: body as T, ref: outcome.session?.ref ?? '', session: event.data.session,
        kept: ended.data.kept, outcomeKind: 'submitted' as const, elapsedMs: outcome.elapsedMs, inFlight: [], lastText: null } };
    }
    if (request.writer && run.writer.held === undefined) {
      const acquired = run.log.all('writer-acquired').some(item => item.data.invocation === id);
      const released = run.log.all('writer-released').find(item => item.data.invocation === id);
      if (!acquired || released) throw new Error('Original writer has no pending ownership');
      run.writer.acquire(id);
      for (const group of run.log.all('writer-process-registered').filter(item => item.data.invocation === id)) {
        const identity = await processGroupIdentity(group.data.pid);
        if (identity !== null && identity === group.data.identity) run.writer.register(id, group.data.pid);
        else throw new Error('Original writer process ownership cannot be authenticated');
      }
    }
    let closed = () => undefined as void;
    run.live.set(id, { role: request.role, reader: request.reader === true, session: undefined, done: new Promise<void>(resolve => { closed = () => resolve(); }) });
    return { hasIntent: packet !== null, started: { id, session: event.data.session, observations: await ObservationLog.open(run.path(runLayout.observations(id))),
      transcript: this.invocationTranscript(run, event.data.session, id), closed: () => { run.live.delete(id); closed(); } } };
  }

  /** Latest immutable invocation revision, unlike owning assignment/license lookups. */
  private invocationRecord(run: Run, id: string) {
    return invocationRecord(run, id);
  }

  private operations(agent: AgentPort): Promise<HarnessSessionOperations> {
    return this.sessionOperations ??= HarnessSessionOperations.open(join(this.projectRoot, 'plans', '.harness', 'session-operations'), agent);
  }

  private assignmentStartingPoints(run: Run, assignment: IterationAssignment): StartingPointGroup {
    const issued = assignment.coordination?.kind === 'capability-task'
      ? run.log.all('capability-assigned').find(event => event.data.assignment === assignment.id)
      : run.log.all('iteration-assigned').find(event => event.data.iteration === assignment.id);
    const invocation = issued?.data.invocation;
    const record = invocation === undefined ? undefined : committedRecords(run.log.ledger.replay()).invocations.get(invocation);
    const boundary = assignment.coordination?.kind === 'capability-task' ? assignment.coordination.startingTree : record?.candidateBefore ?? record?.base;
    return assignmentStartingPointsOf(assignment, { invocation, boundary });
  }

  /** The fresh construction a step whose session is unavailable falls back to, where its role has one. */
  private stepFallback(inputs: StepInputs, packages: ReadonlyMap<string, LoadedPackage>) {
    return (reason: string) => {
      const fresh = freshFallback(inputs, reason);
      if (fresh === null) return undefined;
      const step = constructStep(fresh, { projectRoot: this.projectRoot, packages });
      return { prompt: step.prompt, brief: step.brief, stepInputs: step.before.inputs };
    };
  }

  private async orientationStartingPoints(run: Run, workItem: string | undefined) {
    const event = run.log.all('work-orientation-recorded').find(event => event.data.workItem === workItem);
    if (event === undefined) return undefined;
    const records = committedRecords(run.log.ledger.replay());
    const outcome = records.outcomes.get(event.data.invocation);
    const bytes = await readIfExists(run.path(runLayout.submission(event.data.invocation))).catch(() => undefined);
    if (bytes === undefined || outcome?.submission?.hash !== sha256(bytes)) return undefined;
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>; } catch { return undefined; }
    if (raw.schema !== 'ramify-agent.work-orientation/1') return undefined;
    const { schema: _schema, ...body } = raw;
    const parsed = workOrientationSubmissionSchema.safeParse(body);
    if (!parsed.success) return undefined;
    const record = records.invocations.get(event.data.invocation);
    const boundary = record?.candidateBefore ?? record?.base;
    const group: StartingPointGroup = { origin: { producer: 'local architect orientation', workItem: event.data.workItem,
      invocation: event.data.invocation, ...(boundary === undefined ? {} : { boundary }) }, points: parsed.data.startingPoints };
    return { group, submission: parsed.data };
  }

  /** A reviewer may precede result closure; its exact passing gate identifies the proposal. */
  private async engineerStartingPoints(run: Run, assignment: IterationAssignment, result?: IterationResult, gateId?: string, candidate?: string): Promise<StartingPointGroup> {
    const gate = gateAttemptSchema.safeParse(this.committedBody(run, runLayout.gate(gateId ?? result?.gate ?? '')));
    const matches = gate.success && gate.data.subject.iteration === assignment.id
      && (candidate === undefined || (gate.data.verdict === 'passed' && gate.data.commit === candidate));
    const invocation = matches ? gate.data.proposedBy ?? undefined : result?.invocations.at(-1);
    const records = committedRecords(run.log.ledger.replay());
    const record = invocation === undefined ? undefined : records.invocations.get(invocation);
    const outcome = invocation === undefined ? undefined : records.outcomes.get(invocation);
    let points = result?.startingPoints;
    if (result === undefined && invocation !== undefined && record?.work.iteration === assignment.id) {
      const bytes = await readIfExists(run.path(runLayout.submission(invocation))).catch(() => undefined);
      if (bytes !== undefined && outcome?.submission?.hash === sha256(bytes)) {
        try {
          const { schema, ...body } = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
          const proposal = schema === 'ramify-agent.engineer-submission/1' ? engineerSubmissionSchema.safeParse(body) : undefined;
          if (proposal?.success && proposal.data.kind === 'completion-proposed') points = proposal.data.startingPoints;
        } catch { /* An unavailable optional hint leaves the ordinary review intact. */ }
      }
    }
    const boundary = result?.commit ?? (matches ? gate.data.commit : null) ?? outcome?.candidateAfter ?? record?.candidateBefore ?? record?.base;
    return { origin: { producer: result === undefined ? 'engineer completion proposal at passing gate' : `engineer ${result.outcome} result`,
      workItem: assignment.workItem, iteration: assignment.id, ...(invocation === undefined ? {} : { invocation }),
      ...(boundary === undefined ? {} : { boundary }),
      ...(assignment.coordination?.kind === 'capability-task' ? { capabilityTask: assignment.coordination.id } : {}) }, points };
  }

  private async taskBrief<T>(run: Run, request: InvocationRequest<T>, spec: SessionSpec, limits: RunPolicy['limits']): Promise<HarnessTaskBrief> {
    const kind = request.task?.kind ?? taskKindFor(request.role, request.toolName, request.continuing);
    const records = committedRecords(run.log.ledger.replay());
    const item = records.workItems.find(item => item.id === request.work.workItem);
    const goal = request.task?.goal ?? item?.goal ?? `Read the captured plan for ${run.record.planId} and perform the current ${kind} task.`;
    const requirements = request.task?.requirements ?? [new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)))];
    const groups = [...request.task?.startingPointGroups ?? []];
    if (request.role === 'engineer' && request.work.iteration !== undefined) {
      const assignment = records.assignments.get(request.work.iteration);
      if (assignment !== undefined) groups.push(this.assignmentStartingPoints(run, assignment));
    }
    if ((request.role === 'context-selector' && request.start.mode === 'fresh') || (request.role === 'local-architect' && kind !== 'orientation')) {
      const orientation = run.log.all('work-orientation-recorded').find(event => event.data.workItem === request.work.workItem);
      const parent = orientation === undefined ? undefined : run.log.all('invocation-started').find(event => event.data.invocation === orientation.data.invocation);
      // Retained orientation sessions already contain the submission. A reconstructed
      // architect keeps its explicit fallback section on subsequent turns.
      if (request.start.mode === 'fresh' || request.session !== parent?.data.session) {
        const oriented = await this.orientationStartingPoints(run, request.work.workItem);
        if (oriented !== undefined) groups.unshift(oriented.group);
      }
    }
    // Role/task rules deliver known facts; the agent decides what to inspect.
    const known = ['initial-architect', 'local-architect', 'capability-architect', 'engineer', 'contract-engineer', 'nonfunctional-repair-engineer'].includes(request.role)
      || (request.role === 'context-selector' && request.start.mode === 'fresh')
      ? await this.knownProjectFacts(run, request.task?.modules ?? (item === undefined ? [] : [item.module])) : undefined;
    return composeTaskBrief(this.projectRoot, { kind, work: request.work, goal, requirements, prompt: request.prompt,
      omit: request.task?.omit ?? [], literalSections: request.task?.literalSections ?? [], startingPointGroups: groups, known,
      retainInheritedSections: request.role === 'context-selector' && request.start.mode === 'fork',
      consultationSubmissionSchema: request.task?.consultationSubmissionSchema,
      environment: { projectRoot: this.projectRoot, workingDirectory: spec.scope.workingDirectory,
        candidate: request.task?.candidate ?? request.candidateBefore ?? null, snapshot: request.task?.snapshot ?? null,
        limits, availableTools: [...spec.builtinTools, ...spec.tools.map(tool => tool.name), spec.submission.name],
        views: request.task?.views ?? (run.record.manifest.architectView.status === 'materialized' ? [{ path: join(this.projectRoot, '.ramify-architect'), revision: run.record.manifest.architectView.revision, modules: [...(run.index?.modules.keys() ?? [])], coverage: run.record.manifest.architectView.coverageLimits }] : []),
        // Only the sources this task delivers; the package's other files never reach the model.
        supportPaths: deliveredSupportPaths(request.loaded, kind, request.task?.consultationSubmissionSchema), cucumberConfiguration: request.task?.cucumberConfiguration ?? null } });
  }

  /**
   * What a role that works in the source is told of the project: its declared
   * checks, the pointers of the named modules and the scenario files they own.
   * Every path is project-relative.
   */
  private async knownProjectFacts(run: Run, names: readonly string[]): Promise<KnownProjectFacts> {
    return knownProjectFactsOf(this.projectRoot, run.index, names, trackedScenarios(run.log.ledger.replay()).records, await this.checkInputFacts(run));
  }

  /** Authored setup pointers only: no effective configuration evaluation or readiness acquisition. */
  private async checkInputSection(run: Run, snapshot?: CandidateSnapshot): Promise<string> {
    return declaredCheckInputs({ projectRoot: this.projectRoot, ...await this.checkInputFacts(run, snapshot), snapshot: snapshot !== undefined });
  }

  /** The configured checks and the configuration pointers that exist, in the tree or in the snapshot. */
  private async checkInputFacts(run: Run, snapshot?: CandidateSnapshot): Promise<KnownProjectFacts['declaredChecks']> {
    return declaredCheckFacts(this.projectRoot, run.record.auditConfiguration, run.record.projectConfig.path, snapshot);
  }

  // The initial analysis

  /**
   * The initial analysis: the intake, one extraction per principles
   * document, the initial architect and one checker per captured document,
   * each a fresh bounded session, and the records the accepted analysis
   * commits. Nothing is durable before `analysis-accepted`, so a run started
   * again before it repeats every turn.
   */
  private async analyse(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot): Promise<boolean> {
    if (run.log.find('analysis-accepted')) return true;
    const loaded = packages.get('initial-architect');
    const extractor = packages.get('catalog-extractor');
    if (loaded === undefined || extractor === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the initial architect or the catalog extractor');
      return false;
    }
    const manifestRef = run.record.manifest.documentManifest;
    const documents = await readCapturedDocuments(run.directory, run.record.manifest);
    const inputs: ExtractionInputs = { planId: run.record.planId, manifest: documents.manifest, bytes: documents.bytes, runDirectory: run.directory };
    let catalog = openElementCatalog(manifestRef.hash, documents.manifest);

    const intake = await this.extract<IntakeSubmission>(run, agent, extractor, 'intake', {
      prompt: intakeMessage(inputs), toolName: intakeToolName, inputSchema: intakeJsonSchema, submissionSchema: 'ramify-agent.intake/1',
      validate: input => {
        const shape = validateAgainst(intakeSubmissionSchema, input);
        return shape.ok ? asValidation(shape.value, acceptIntake(catalog, documents.manifest, shape.value)) : shape;
      },
    });
    if (intake === undefined) return false;
    const intakeAccepted = acceptIntake(catalog, documents.manifest, intake.value);
    if (!intakeAccepted.ok) throw new Error('An accepted intake no longer validates');
    catalog = intakeAccepted.catalog;
    const { incorporation } = intakeAccepted;

    for (const document of documents.manifest.documents.filter(item => item.kind === 'principle')) {
      const extracted = await this.extract<PrincipleSubmission>(run, agent, extractor, 'principles', {
        prompt: principleMessage(inputs, document.id, intake.value.goal), toolName: principleToolName, inputSchema: principleJsonSchema,
        submissionSchema: 'ramify-agent.principle-extraction/1',
        validate: input => {
          const shape = validateAgainst(principleSubmissionSchema, input);
          return shape.ok ? asValidation(shape.value, acceptPrinciples(catalog, document.id, shape.value)) : shape;
        },
      });
      if (extracted === undefined) return false;
      const accepted = acceptPrinciples(catalog, document.id, extracted.value);
      if (!accepted.ok) throw new Error('An accepted principles extraction no longer validates');
      catalog = accepted.catalog;
    }

    const plan = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    const evidence: AnalysisEvidence = { index: run.index, catalog, incorporation, documents, registeredTests: new Set([...this.obligationProjection(run).obligations.values()].filter(item => item.kind === 'test').map(item => item.id)), planScenarios: run.record.planScenarios.scenarios };
    const systemPrompt = renderInitialArchitectPrompt(loaded, this.projectRoot);
    const prompt = analysisMessage(run.record, plan, inputs, incorporatedExtraction(evidence));
    const scope = baselineScope(
      this.options.rootModule ?? rootModuleOf(run.index) ?? rootModuleOfSnapshot(baseline) ?? 'root',
      // Each invocation's own package and the plan are its support documents.
      [],
    );

    const result = await this.runInvocation<InitialAnalysisSubmission>(run, agent, {
      role: 'initial-architect',
      task: { kind: 'initial-analysis', goal: intake.value.goal, requirements: [plan], literalSections: [{ key: 'support:accepted-intake', text: `Accepted intake classifications and incorporation: ${JSON.stringify({ catalog, incorporation })}` }] },
      work: {},
      attempt: 1,
      loaded,
      systemPrompt,
      prompt,
      start: { mode: 'fresh' },
      toolName: initialAnalysisToolName,
      description: 'Submit the run\'s initial analysis. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.',
      inputSchema: initialAnalysisJsonSchema,
      submissionSchema: 'ramify-agent.initial-analysis/3',
      validate: input => validateInitialAnalysis(input, evidence),
      // An accepted analysis session becomes the run's architect context:
      // briefs are appended to it and every placement request forks it.
      keep: ended => (ended === 'submitted' ? kept : finished('not-kept')),
      scope: {
        write: null,
        measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
        size: null,
      },
      measured: { snapshot: baseline, scope: scope },
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

    // Each checker reads one document once every element of it exists, and
    // corrects the catalog and the citations before any ID is final.
    let state: CheckState = acceptArchitectElements(catalog, result.value);
    const findings: CatalogFinding[] = [];
    for (const document of documents.manifest.documents) {
      const checked = await this.extract<CheckSubmission>(run, agent, extractor, 'check', {
        prompt: checkMessage(inputs, document.id, state), toolName: checkToolName, inputSchema: checkJsonSchema,
        submissionSchema: 'ramify-agent.catalog-check/1',
        validate: input => {
          const shape = validateAgainst(checkSubmissionSchema, input);
          return shape.ok ? asValidation(shape.value, applyCheck(state, document.id, 'candidate', shape.value, evidence)) : shape;
        },
      });
      if (checked === undefined) return false;
      const applied = applyCheck(state, document.id, checked.id, checked.value, evidence);
      if (!applied.ok) throw new Error('An accepted catalog check no longer validates');
      state = { catalog: applied.catalog, analysis: applied.analysis };
      findings.push(...applied.findings);
    }

    const sourceChanges = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (sourceChanges.length > 0) {
      await this.fail(run, 'inputs-changed', `The captured plan evidence changed before analysis acceptance: ${sourceChanges.join('; ')}`, [runLayout.documentManifest]);
      return false;
    }
    const accepted = acceptAnalysis(state.analysis, {
      invocation: result.id,
      view: run.record.manifest.architectView,
      planId: run.record.planId,
      planScenarios: run.record.planScenarios.scenarios,
      index: run.index,
      catalog: state.catalog,
      incorporation,
      documents,
    });
    const catalogText = serializeElementCatalog(state.catalog);
    const incorporationText = `${JSON.stringify(incorporation)}\n`;
    const catalogHash = sha256(catalogText);
    const incorporationHash = sha256(incorporationText);
    const catalogPath = runLayout.catalogVersion(catalogHash);
    const incorporationPath = runLayout.incorporationVersion(incorporationHash);
    await writeOnce(run.path(catalogPath), catalogText);
    await writeOnce(run.path(incorporationPath), incorporationText);
    await this.afterWrite('analysis-evidence-staged', run.record.jobId);
    const count = (kind: ElementKind) => state.catalog.elements.filter(element => element.kind === kind).length;
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
        catalog: { context: count('context'), functional: count('functional'), nonFunctional: count('non-functional'),
          fixed: count('fixed'), recommendation: count('recommendation') },
        findings,
        evidence: { catalog: { path: catalogPath, hash: catalogHash },
          incorporation: { path: incorporationPath, hash: incorporationHash } },
      },
    }, accepted.records);
    await this.afterWrite('analysis-accepted', run.record.jobId);
    return true;
  }

  /**
   * One catalog extractor turn: a fresh read-only session given captured
   * files and nothing else, whose one accepted submission is its answer. A
   * turn that ends without one fails the analysis, as the architect's does.
   */
  private async extract<T>(run: Run, agent: AgentPort, loaded: LoadedPackage, turn: ExtractionTurn, request: {
    readonly prompt: string; readonly toolName: string; readonly inputSchema: JsonSchema; readonly submissionSchema: string;
    readonly validate: (input: unknown) => SubmissionValidation<T>;
  }): Promise<{ readonly id: string; readonly value: T } | undefined> {
    const attempt = run.log.all('invocation-started').filter(event => event.data.role === 'catalog-extractor').length + 1;
    const result = await this.runInvocation<T>(run, agent, {
      role: 'catalog-extractor', work: {}, attempt, loaded,
      systemPrompt: renderExtractionPrompt(loaded, this.projectRoot, turn),
      prompt: request.prompt, start: { mode: 'fresh' },
      toolName: request.toolName, description: `Submit this ${turn} turn's reading of the captured documents. The harness checks its shape, documents and citations and answers every error with its path.`,
      inputSchema: request.inputSchema, submissionSchema: request.submissionSchema, validate: request.validate,
      keep: () => finished('not-kept'),
      scope: { write: null, measurement: null, size: null },
      equip: () => ({ builtinTools: ['read', 'grep', 'ls'], tools: [] }),
    });
    if (this.ignoring(run)) return undefined;
    if (result.ended !== 'submitted' || result.value === undefined) {
      await this.fail(run, result.ended === 'invalid-submission' ? 'invalid-submission' : result.outcomeKind === 'failed' ? 'agent-failed' : 'analysis-invalid',
        `The catalog extractor's ${turn} turn ended without an accepted submission (${result.ended}, ${result.outcomeKind})`, []);
      return undefined;
    }
    return { id: result.id, value: result.value };
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
    // Registration can publish a provider before its consumer has received
    // the original contract handback. Finish that captured active turn first;
    // only then may the new frontier's provider priority take effect.
    let restoredActiveItem = run.restoring && this.workflow === null
      ? [...run.log.events].reverse().find(event =>
        (event.type === 'work-item-started' || event.type === 'work-item-resumed') &&
        !run.log.events.some(later => later.sequence > event.sequence &&
          (later.type === 'work-item-yielded' || later.type === 'work-item-completed') &&
          later.data.workItem === event.data.workItem))
      : undefined;
    // The frontier is read again on every round, because a delegation
    // creates work items while the run is running: a provider work item of a
    // requirement just registered is taken before the next independent entry
    // work item, and that is what makes the scheduling depth-first.
    for (;;) {
      if (this.ignoring(run)) return false;
      const records = committedRecords(run.log.ledger.replay());
      if (this.workflow !== null && replayCapabilityState(run.log.events).stack.length > 1) {
        // Only the active depth-first frame may be reconstructed here. A
        // waiting frame cannot release unrelated ordinary frontier work.
        if (!await this.resumeCapabilityTask(run, agent, packages, baseline)) return false;
        continue;
      }
      if (records.workItems.length === 0) return true;
      if (records.workItems.length > run.record.policy.limits.maxWorkItems) {
        await this.fail(run, 'limit-exceeded', `The run has ${records.workItems.length} work items; the policy allows ${run.record.policy.limits.maxWorkItems}`);
        return false;
      }
      const state = this.scheduleStateOf(run, records);
      const activeId = restoredActiveItem?.type === 'work-item-started' || restoredActiveItem?.type === 'work-item-resumed' ? restoredActiveItem.data.workItem : undefined;
      restoredActiveItem = undefined;
      const active = records.workItems.find(item => item.id === activeId && !state.completed.has(item.id));
      const next = active === undefined ? nextWorkItem(state) : { item: active, resumes: null };
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

  /** Rebuild the active capability frame from committed records. An unknown
   * intermediate state remains incomplete; it never releases the frontier. */
  private async resumeCapabilityTask(run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot): Promise<boolean> {
    const state = replayCapabilityState(run.log.events);
    const activeId = state.stack.at(-1);
    if (activeId === undefined || !activeId.startsWith('cap-')) return true;
    const active = state.tasks.get(activeId);
    if (active === undefined) throw new Error(`Active capability frame ${activeId} has no task`);
    if (active.status !== 'coordinating' && active.status !== 'implementing' && active.status !== 'awaiting-consumer' && active.status !== 'verifying') {
      await this.fail(run, 'recovery-exhausted', `Capability ${activeId} remains ${active.status}; its pending effect requires recovery before another invocation`);
      return false;
    }
    const records = committedRecords(run.log.ledger.replay());
    const task = records.capabilityTasks.get(activeId);
    const request = task === undefined ? undefined : records.capabilityRequests.get(task.request);
    const plan = records.capabilityPlans.get(activeId)?.at(-1);
    const item = records.workItems.find(entry => entry.id === state.stack[0]);
    if (task === undefined || request === undefined || plan === undefined || item === undefined) {
      await this.fail(run, 'recovery-exhausted', `Capability ${activeId} lacks its committed task, request, plan or parent work item`);
      return false;
    }
    if (active.status === 'verifying') return this.recoverVerifyingHandback(run, task, request, plan);
    if (active.status === 'awaiting-consumer') {
      const entries = active.pendingExchange === null ? undefined : records.capabilityExchanges.get(active.pendingExchange);
      const exchange = entries?.[0];
      const opened = run.log.all('capability-exchange-opened').find(event => event.data.exchange === active.pendingExchange);
      if (exchange === undefined || opened === undefined) {
        await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has no committed pending consumer question`);
        return false;
      }
      const action: Extract<CapabilityAction, { kind: 'consult-consumer' }> = {
        kind: 'consult-consumer', task: task.id, planRevision: exchange.planRevision, invocation: opened.data.invocation,
        question: exchange.question, references: [...exchange.references], sections: ['Recovered pending consultation'],
        registrations: [], reports: [],
      };
      return await this.consultCapabilityConsumer(run, agent, packages, task, request, plan, action,
        opened.data.invocation, { point: request.continuation.point, session: request.continuation.session }, exchange) !== null;
    }
    if (active.status === 'implementing') {
      const assignment = active.activeAssignment === null ? undefined : records.assignments.get(active.activeAssignment);
      const assigned = run.log.all('capability-assigned').find(event => event.data.assignment === active.activeAssignment);
      if (assignment === undefined || assigned === undefined) {
        await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has no committed active assignment`);
        return false;
      }
      const action: Extract<CapabilityAction, { kind: 'assign' }> = {
        kind: 'assign', task: task.id, planRevision: plan.revision, invocation: assigned.data.invocation,
        registrations: [], reports: [],
        assignment: assignmentBodySchema.parse({ stage: assignment.stage, kind: assignment.kind,
          goal: assignment.goal, approach: assignment.approach,
          scope: { base: assignment.scope.base, extra: assignment.scope.extra,
            read: assignment.scope.read, rationale: assignment.scope.rationale },
          citedElements: assignment.source?.elements ?? [],
          externalCapabilities: assignment.externalCapabilities.map(({ capability, owner, role }) => ({ capability, owner, role })),
          completionEvidence: assignment.completionEvidence,
          authorizations: assignment.authorizations.map(({ path, rationale }) => ({ path, rationale })),
          ...(assignment.obligations === undefined ? {} : { obligations: assignment.obligations }),
          ...(assignment.bounds === undefined ? {} : { bounds: assignment.bounds }),
        }),
      };
      const result = await this.assignCapabilityWork(run, agent, packages, baseline, item, task, plan, action,
        assigned.data.invocation, { point: request.continuation.point, session: request.continuation.session },
        { point: undefined, session: undefined }, assignment);
      return result !== null;
    }
    const delegated = run.log.all('capability-delegated').find(event => event.data.task === activeId);
    if (delegated === undefined || active.coordinatorInvocation === null) {
      await this.fail(run, 'recovery-exhausted', `Capability ${activeId} lacks a delegation or coordinator basis`);
      return false;
    }
    const reconciliationSessions = new Set(run.log.all('session-opened')
      .filter(event => event.data.fork?.reason === 'reconciliation').map(event => event.data.session));
    const latest = [...run.log.all('invocation-started')].reverse().find(event => event.data.role === 'capability-architect' &&
      event.data.work.capabilityTask === activeId && event.data.work.request === request.id &&
      !reconciliationSessions.has(event.data.session));
    if (this.capabilityBudgetReturns(run, activeId) >= run.record.policy.limits.budgetReturnsPerIteration) {
      await this.fail(run, 'limit-exceeded', `Capability architect of ${activeId} exhausted its captured context-budget return bound; unfinished task remains`);
      return false;
    }
    let point: string | undefined;
    let session: SessionId | undefined;
    let reconstructedFrom: SessionId | undefined;
    let replay: InvocationResult<CapabilityAction> | undefined;
    if (latest !== undefined) {
      const ended = run.log.all('invocation-ended').find(event => event.data.invocation === latest.data.invocation);
      const outcome = this.committedBody(run, runLayout.outcome(latest.data.invocation)) as InvocationOutcome | null;
      if (ended?.data.ended === 'submitted') {
        const bytes = await readIfExists(run.path(runLayout.submission(latest.data.invocation)));
        const checkedOutcome = invocationOutcomeSchema.safeParse(outcome);
        const endings = run.log.all('invocation-ended').filter(event => event.data.invocation === latest.data.invocation);
        const starts = run.log.all('invocation-started').filter(event => event.data.invocation === latest.data.invocation);
        if (ended.data.submission === null || bytes === undefined || sha256(bytes) !== ended.data.submission || !checkedOutcome.success ||
          checkedOutcome.data.invocation !== latest.data.invocation || checkedOutcome.data.ended !== 'submitted' ||
          checkedOutcome.data.submission?.hash !== ended.data.submission || !checkedOutcome.data.settled.confirmed ||
          endings.length !== 1 || starts.length !== 1 || ended.data.session !== latest.data.session ||
          ended.sequence <= latest.sequence) {
          await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has an unauthenticated accepted coordinator action`);
          return false;
        }
        const authenticated = checkedOutcome.data;
        let raw: Record<string, unknown>;
        try { raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>; }
        catch {
          await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has an invalid accepted coordinator action`);
          return false;
        }
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has an invalid accepted coordinator action`);
          return false;
        }
        const { schema: _schema, ...body } = raw;
        const parsed = capabilityActionSchema.safeParse(body);
        if (raw.schema !== 'ramify-agent.capability-action/1' || !parsed.success || parsed.data.task !== task.id) {
          await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has an invalid accepted coordinator action`);
          return false;
        }
        if (authenticated.disposition === 'superseded') {
          // Closing the service can race an already accepted agent receipt.
          // That owning result remains discarded, even though its bytes are
          // retained. Only the existing bounded, record-backed reconstruction
          // may continue; no report or action is replayed from this result.
          const effect = run.log.events.some(event =>
            (event.type.startsWith('capability-') && 'invocation' in event.data &&
              event.data.invocation === latest.data.invocation) ||
            (event.type === 'unresolved-requested' && event.data.invocation === latest.data.invocation) ||
            ((event.type === 'obligation-reported' || event.type === 'obligation-registered') &&
              event.data.by === latest.data.invocation));
          const source = authenticated.session?.ref ? readSessionPointReference(authenticated.session.ref) : null;
          if (ended.data.kept || ended.data.finished !== 'run-ended' || authenticated.interruption !== undefined ||
            effect || source === null || source.runId !== run.record.jobId ||
            authenticated.sessionOperation?.runId !== run.record.jobId ||
            authenticated.sessionOperation.operationId !== latest.data.invocation ||
            canonicalJson(authenticated.sessionOperation.point) !== canonicalJson(source.point) ||
            authenticated.sessionOperation.sessionId !== source.point.sessionId) {
            await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has an unauthenticated superseded coordinator shutdown`);
            return false;
          }
        } else {
          if (authenticated.disposition !== 'applied' || !ended.data.kept || !authenticated.session?.ref) {
            await this.fail(run, 'recovery-exhausted', `Capability ${activeId} has an unauthenticated accepted coordinator action`);
            return false;
          }
          const chosen = parsed.data;
          const effectExists = chosen.kind === 'assign'
            ? run.log.all('capability-assigned').some(event => event.data.invocation === latest.data.invocation)
            : chosen.kind === 'consult-consumer'
              ? run.log.all('capability-exchange-opened').some(event => event.data.invocation === latest.data.invocation)
              : chosen.kind === 'request-handback'
                ? run.log.all('capability-verification-started').some(event => event.data.invocation === latest.data.invocation)
                : true;
          if (!effectExists && chosen.planRevision !== plan.revision) {
            await this.fail(run, 'recovery-exhausted', `Capability ${activeId} accepted action names stale plan revision ${chosen.planRevision}`);
            return false;
          }
          if (!effectExists) replay = { id: latest.data.invocation, ended: 'submitted', value: chosen,
            ref: authenticated.session.ref, session: latest.data.session, kept: true, outcomeKind: 'submitted' };
        }
      }
      if (ended?.data.kept && outcome?.session?.ref) {
        const continued = await (await this.operations(agent)).append(outcome.session.ref, `recover:${activeId}:${latest.data.invocation}`,
          `Recover capability ${activeId} from the committed plan and task state`);
        if (continued.outcome === 'appended' || continued.outcome === 'already-present') { point = continued.ref; session = latest.data.session; }
      }
      if (session === undefined) reconstructedFrom = latest.data.session;
    }

    if (reconstructedFrom !== undefined) {
      await this.finishSession(run, reconstructedFrom, 'lost');
    }
    const providerItems = records.workItems.filter(entry => entry.module === task.provider);
    const providerDecisions = [...records.decisions.values()].filter(entry => entry.owner === task.provider);
    const selected = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    const attempt = run.log.all('invocation-started').filter(event => event.data.role === 'capability-architect' &&
      event.data.work.capabilityTask === activeId && event.data.work.request === request.id).length + (replay === undefined ? 1 : 0);
    const progress = JSON.stringify({ status: active.status, planRevision: active.planRevision,
      assignments: [...active.assignments], exchanges: [...records.capabilityExchanges.values()].filter(entries => entries[0]?.task === activeId) });
    const result = await this.runCapabilityCoordinator(run, agent, packages, baseline, item, task, request, plan,
      delegated.data.invocation, selected, providerItems, providerDecisions,
      { basis: active.coordinatorInvocation, point, session, progress, attempt,
        ...(reconstructedFrom === undefined ? {} : { reconstructedFrom }),
        ...(replay === undefined ? {} : { replay }) });
    return result !== null && result.kind === 'satisfied';
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

  /** One work item's accepted source package, selected before its first assignment. */
  private async orientAndSelectWorkContext(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>,
    item: WorkItem, briefing: WorkItemBriefing, workingDirectory: string,
  ): Promise<{ readonly kind: 'failed' } | { readonly kind: 'ready'; readonly package: WorkPackage; readonly session: SessionId | undefined; readonly ref: string | undefined }> {
    const sourceChanges = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (sourceChanges.length > 0) {
      await this.fail(run, 'inputs-changed', `The captured plan evidence changed before context selection: ${sourceChanges.join('; ')}`, [runLayout.documentManifest]);
      return { kind: 'failed' };
    }
    const evidence = await readAcceptedEvidence(run.directory, run.record, run.log.events);
    if (evidence.status === 'unavailable') {
      await this.fail(run, 'inputs-changed', `The accepted context evidence is unavailable: ${evidence.reason}`);
      return { kind: 'failed' };
    }
    const selector = packages.get('context-selector');
    if (selector === undefined || run.record.policy.context['context-selector'] === undefined) {
      await this.fail(run, 'internal', 'The run has no context selector package or captured context policy');
      return { kind: 'failed' };
    }
    const orientationRequirements = [this.planPackage(run, evidence.catalog,
      [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs])];
    // The orientation is built from its inputs by the local architect's own
    // constructor, which `step render` uses too.
    const orientationInputs = (attempt: number, known: KnownFactsInputs): OrientationStepInputs => ({
      schema: stepInputsSchemaId, role: 'local-architect', phase: 'orientation', consultation: localConsultationInputs(run.log.events, item.id), run: { planId: run.record.planId, runId: run.record.jobId },
      work: { workItem: item.id }, attempt, capabilityWorkflow: this.workflow !== null, limits: run.record.policy.limits,
      context: contextPolicyOf(run.record.policy, 'local-architect'), workingDirectory: this.projectRelative(workingDirectory),
      briefing: workBriefingInputs(briefing), requirements: orientationRequirements, known, architectView: this.architectViewInputs(run),
      start: { kind: 'fresh' },
    });
    const orientationStep = async (attempt: number) => constructOrientationStep(
      orientationInputs(attempt, knownFactsInputs(await this.knownProjectFacts(run, [item.module]))), { projectRoot: this.projectRoot, packages });
    const first = await orientationStep(1);
    const orientationBriefing = first.briefingText;
    let orientation = run.log.all('work-orientation-recorded').find(event => event.data.workItem === item.id);
    const attempts: string[] = [];
    for (const started of run.log.all('invocation-started')) {
      if (started.data.role !== 'local-architect' || started.data.work.workItem !== item.id) continue;
      const packet = await (await this.operations(agent)).packet(run.record.jobId, started.data.invocation);
      const record = invocationSchema.parse(this.committedBody(run, runLayout.invocation(started.data.invocation)));
      if (packet?.submissionTool === workOrientationToolName || record.prompt.requestedInputsHash === inputsHash([first.systemPrompt, first.prompt])) attempts.push(started.data.invocation);
    }
    if (orientation === undefined) {
      // A completed dedicated orientation may precede its own event if the
      // harness stopped at that boundary. Its accepted submission is enough
      // to publish the same packet without another model call.
      let prior: { id: string; session: SessionId; ref: string | null; value: WorkOrientationSubmission } | undefined;
      for (const ended of [...run.log.all('invocation-ended')].reverse()) {
        if (ended.data.submission === null || !ended.data.kept) continue;
        const started = run.log.all('invocation-started').find(event => event.data.invocation === ended.data.invocation);
        if (started?.data.role !== 'local-architect' || started.data.work.workItem !== item.id) continue;
        // The orientation is the local architect's operation whose recorded
        // intent submits through the orientation tool. Its identity is that
        // intent, not the prompt this restart would render for it.
        const packet = await (await this.operations(agent)).packet(run.record.jobId, ended.data.invocation);
        if (packet?.submissionTool !== workOrientationToolName) continue;
        const raw = await readIfExists(run.path(runLayout.submission(ended.data.invocation)));
        if (raw === undefined || sha256(raw) !== ended.data.submission) continue;
        try {
          const submitted = JSON.parse(raw.toString('utf8')) as { schema?: string };
          if (submitted.schema !== 'ramify-agent.work-orientation/1') continue;
          const { schema: _schema, ...body } = submitted;
          void _schema;
          const value = workOrientationSubmissionSchema.parse(body);
          const outcome = this.committedBody(run, runLayout.outcome(ended.data.invocation)) as { session?: { ref?: string } };
          prior = { id: ended.data.invocation, session: started.data.session, ref: outcome.session?.ref ?? null, value };
          break;
        } catch { /* Another local submission is not an orientation. */ }
      }
      if (prior === undefined) {
        const count = run.record.policy.limits.forkRetriesPerRequest + 1;
        for (let attempt = attempts.length + 1; attempt <= count && !this.ignoring(run); attempt++) {
          const step = attempt === 1 ? first : await orientationStep(attempt);
          const result = await this.runInvocation<WorkOrientationSubmission>(run, agent, {
            role: step.role, brief: step.brief, context: step.context, stepInputs: step.before.inputs, consultationPackages: packages, work: step.work, attempt: step.attempt, loaded: step.loaded,
            systemPrompt: step.systemPrompt, prompt: step.prompt, workingDirectory: step.equipment.workingDirectory, start: { mode: 'fresh' },
            toolName: step.submission.toolName, description: step.submission.description,
            inputSchema: step.submission.inputSchema, submissionSchema: step.submission.submissionSchema,
            validate: step.validate, equip: () => ({ builtinTools: [...step.equipment.builtinTools] }),
            scope: { write: null, measurement: null, size: null },
            keep: (ended, value) => ended === 'submitted' && value !== undefined ? kept : finished('not-kept'),
          });
          if (result.id !== '') attempts.push(result.id);
          if (result.ended === 'submitted' && result.value !== undefined) {
            prior = { id: result.id, session: result.session, ref: result.kept && result.ref !== '' ? result.ref : null, value: result.value };
            break;
          }
        }
      }
      if (prior !== undefined) {
        const packet = orientationPacket({ workItem: item.id, briefing: orientationBriefing, submission: prior.value });
        const path = runLayout.orientationPacket(item.id, packet.hash);
        await writeOnce(run.path(path), packet.text);
        await this.write(run, { type: 'work-orientation-recorded', data: { workItem: item.id, invocation: prior.id, packetHash: packet.hash, packet: path, point: prior.ref } });
        await this.afterWrite('work-orientation-recorded', run.record.jobId);
        orientation = run.log.all('work-orientation-recorded').find(event => event.data.workItem === item.id);
      }
    }
    if (this.ignoring(run)) return { kind: 'failed' };
    // Missing reusable bytes never weaken authoritative work-item input checks.
    const path = orientation?.data.packet;
    const packetBytes = path && path === runLayout.orientationPacket(item.id, orientation!.data.packetHash)
      ? await readIfExists(run.path(path)).catch(() => undefined) : undefined;
    const usable = packetBytes !== undefined && sha256(packetBytes) === orientation?.data.packetHash;
    const oriented = await this.orientationStartingPoints(run, item.id);
    // Render explicit discovery pairs once in the shared named section on fresh
    // consumers. Retained packet bytes and their recorded hashes stay immutable.
    const packet = usable && oriented !== undefined
      ? orientationPacket({ workItem: item.id, briefing: orientationBriefing, submission: {
        focus: oriented.submission.focus, currentUnderstanding: oriented.submission.currentUnderstanding, questions: oriented.submission.questions,
      } }).text : usable ? packetBytes.toString('utf8') : orientationBriefing;
    const orientationInvocation = orientation?.data.invocation ?? attempts.at(-1);
    if (orientationInvocation === undefined) throw new Error('Work orientation has no recorded attempt');
    const orientationPoint = usable ? orientation!.data.point : null;
    const source: SelectionSource = { catalog: evidence.catalog, planDeviations: this.planDeviationsOf(run),
      workItemElements: [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs] };
    const parentStarted = run.log.all('invocation-started').find(event => event.data.invocation === orientationInvocation);
    const parentSession = orientationPoint === null ? undefined : parentStarted?.data.session;
    let selectionEvent = run.log.all('context-selection-recorded').find(event => event.data.workItem === item.id);
    if (selectionEvent === undefined) {
      const selected = await this.selectElements(run, agent, selector, item, source, {
        packet, orientationInvocation, point: orientationPoint, session: parentSession,
      });
      if (selected === 'failed') return { kind: 'failed' };
      selectionEvent = selected;
    }
    if (selectionEvent === undefined) {
      await this.fail(run, 'invalid-submission', `No valid context selection was obtained for ${item.id} within the captured retry bound`);
      return { kind: 'failed' };
    }
    const recorded = await readRecordedContextSelection(run.directory, selectionEvent, evidence.catalog, this.planDeviationsOf(run));
    if (recorded.status === 'unavailable') {
      await this.fail(run, 'inputs-changed', `The recorded context selection of ${item.id} is unavailable: ${recorded.reason}`, [selectionEvent.data.selection]);
      return { kind: 'failed' };
    }
    const changedBeforeDelivery = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (changedBeforeDelivery.length > 0) {
      await this.fail(run, 'inputs-changed', `The captured plan evidence changed before context delivery: ${changedBeforeDelivery.join('; ')}`, [runLayout.documentManifest]);
      return { kind: 'failed' };
    }
    // The package is also carried by the next prompt. That is the exact
    // reconstruction input if the executor lost the parent's session.
    let session = parentSession;
    let ref = orientationPoint ?? undefined;
    const appendKey = sha256(`${run.record.jobId}\n${item.id}\n${selectionEvent.data.selection}\n${session ?? 'no-session'}`);
    const appended = run.log.all('context-package-appended').find(event => event.data.appendKey === appendKey);
    if (appended === undefined) {
      const outcome = await run.log.ledger.effect<BriefAppend>({
        key: `context:${appendKey}`, serialize: work => run.mutex.run(work),
        intent: () => ({ event: run.log.next({ type: 'context-package-append-requested', data: {
          workItem: item.id, selection: selectionEvent!.data.selection, session: session ?? null, appendKey,
        } }), records: [] }),
        perform: async key => {
          await this.afterWrite('context-package-append-requested', run.record.jobId);
          if (session === undefined || ref === undefined) return { session: null, ref: null, outcome: 'no-session', reason: 'No retained parent point' };
          try {
            const answer = await (await this.operations(agent)).append(ref, key, recorded.packageText, 'support:work-item-package');
            if (answer.outcome === 'session-lost') return { session, ref: null, outcome: 'session-lost', reason: 'The parent session was lost' };
            if (answer.outcome === 'conflict') return { session, ref: null, outcome: 'failed', reason: `The parent session did not take the package: ${answer.reason}` };
            return { session, ref: answer.ref, outcome: answer.outcome, reason: null };
          } catch (error) { return { session, ref: null, outcome: 'failed', reason: message(error) }; }
        },
        complete: result => ({ event: run.log.next({ type: 'context-package-appended', data: {
          workItem: item.id, selection: selectionEvent!.data.selection, appendKey, ...result,
        } }), records: [] }),
      });
      await this.afterWrite('context-package-appended', run.record.jobId);
      if (outcome.outcome === 'appended' || outcome.outcome === 'already-present') ref = outcome.ref ?? undefined;
      else if (outcome.outcome === 'failed') throw new Error(outcome.reason ?? 'The parent session did not take the context package');
      else { session = undefined; ref = undefined; }
    } else if (appended.data.outcome === 'appended' || appended.data.outcome === 'already-present') {
      ref = appended.data.ref ?? undefined;
    } else if (appended.data.outcome === 'failed') throw new Error(appended.data.reason ?? 'The parent session did not take the context package');
    else { session = undefined; ref = undefined; }
    // A yielded work item may revisit its recorded selection after its
    // original architect session finished. Keep the package, not that session.
    if (session !== undefined && this.sessionsOf(run)?.get(session)?.state !== 'suspended') {
      session = undefined;
      ref = undefined;
    }
    return { kind: 'ready', package: { text: recorded.packageText, selection: selectionEvent.data.selection, citation: recorded.selection.package }, session, ref };
  }

  /** Whether a placement decision made for this work item names an owner none of its earlier decisions or its own module did. */
  private addsOwner(run: Run, item: WorkItem, decision: PlacementDecision): boolean {
    if (decision.owner === null || decision.owner === item.module) return false;
    const earlier = [...committedRecords(run.log.ledger.replay()).decisions.values()]
      .filter(entry => entry.workItem === item.id && entry.id !== decision.id);
    return !earlier.some(entry => entry.owner === decision.owner);
  }

  /** Select a work item's elements again after a decision added an owner, forking its architect's current session point. */
  private async reselectWorkContext(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, item: WorkItem, current: WorkPackage,
    from: { readonly invocation: string; readonly point: string | null; readonly session: SessionId | undefined }, decision: PlacementDecision,
  ): Promise<WorkPackage | null> {
    const selector = packages.get('context-selector');
    if (selector === undefined) {
      await this.fail(run, 'internal', 'The run has no context selector package');
      return null;
    }
    try {
      const catalog = await this.frozenCatalog(run);
      const packet = [
        `# Selection again for ${item.id}`, '',
        `Placement decision \`${decision.id}\` placed \`${decision.capability}\` in \`${decision.owner}\`, an owner this work item did not have. Select the elements for the work as it now stands; the package it replaces held ${current.citation.elements.join(', ') || 'no element'}.`,
      ].join('\n');
      const selected = await this.selectElements(run, agent, selector, item,
        { catalog, planDeviations: this.planDeviationsOf(run), workItemElements: [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs] },
        { packet, update: packet, orientationInvocation: from.invocation, point: from.point, session: from.session });
      if (selected === 'failed') return null;
      if (selected === undefined) {
        await this.fail(run, 'invalid-submission', `No valid context selection was obtained for ${item.id} within the captured retry bound`);
        return null;
      }
      const recorded = await readRecordedContextSelection(run.directory, selected, catalog, this.planDeviationsOf(run));
      if (recorded.status === 'unavailable') throw new EvidenceUnavailableError(recorded.reason);
      return { selection: selected.data.selection, citation: recorded.selection.package, text: recorded.packageText };
    } catch (error) {
      await this.fail(run, 'inputs-changed', `The work-item package of ${item.id} cannot be selected again: ${message(error)}`);
      return null;
    }
  }

  /**
   * One selection of a work item's elements by a read-only fork of its local
   * architect at `from.point`, or a fresh selector from the recorded
   * orientation where no point is retained, which marks it degraded. It
   * records the selection and the package it cites, superseding the work
   * item's earlier selection where there is one.
   */
  private async selectElements(
    run: Run, agent: AgentPort, selector: LoadedPackage, item: WorkItem, source: SelectionSource,
    from: { readonly packet: string; readonly update?: string; readonly orientationInvocation: string; readonly point: string | null; readonly session: SessionId | undefined },
  ): Promise<RunEventOf<'context-selection-recorded'> | undefined | 'failed'> {
    const supersedes = run.log.all('context-selection-recorded').filter(event => event.data.workItem === item.id).at(-1)?.data.selection;
    let selectionEvent: RunEventOf<'context-selection-recorded'> | undefined;
    const count = run.record.policy.limits.forkRetriesPerRequest + 1;
    const workspace = join('work', item.id, 'selector-workspace');
    for (let attempt = 1; attempt <= count && !this.ignoring(run); attempt++) {
      const forked = from.point !== null && from.session !== undefined;
      await mkdir(run.path(workspace), { recursive: true });
      // The selection is built from its inputs by its own constructor, which
      // `step render` uses too. A fork inherits the known facts and starting
      // points the inputs record for the fresh start it may fall back to.
      const oriented = await this.orientationStartingPoints(run, item.id);
      const inputs = validateSelectorInputs({
        schema: stepInputsSchemaId, role: 'context-selector', run: { planId: run.record.planId, runId: run.record.jobId }, work: { workItem: item.id },
        attempt, capabilityWorkflow: this.workflow !== null, limits: run.record.policy.limits, context: contextPolicyOf(run.record.policy, 'context-selector'),
        kind: supersedes === undefined ? 'selection' : 'reselection', goal: item.goal,
        requirements: [this.planPackage(run, source.catalog, source.workItemElements)],
        packet: from.packet, ...(from.update === undefined ? {} : { update: from.update }),
        catalog: source.catalog, planDeviations: [...source.planDeviations], workItemElements: [...source.workItemElements],
        orientation: { invocation: from.orientationInvocation, point: from.point }, workspace: { run: workspace },
        known: knownFactsInputs(await this.knownProjectFacts(run, [item.module])),
        startingPoints: oriented === undefined ? [] : [JSON.parse(JSON.stringify(oriented.group)) as unknown],
        architectView: this.architectViewInputs(run),
        start: forked ? { kind: 'fork', session: from.session!, invocation: from.orientationInvocation, point: from.point! }
          : { kind: 'fresh', degraded: { requested: 'fork', reason: 'the recorded orientation has no retained session point' } },
      });
      const step = constructSelectorStep(inputs, { projectRoot: this.projectRoot, packages: new Map([['context-selector', selector]]) });
      const result = await this.runInvocation<ContextSelectorSubmission>(run, agent, {
        role: step.role, brief: step.brief, context: step.context, stepInputs: step.before.inputs,
        fallback: this.stepFallback(step.inputs, new Map([['context-selector', selector]])),
        work: step.work, attempt: step.attempt, loaded: step.loaded,
        systemPrompt: step.systemPrompt, prompt: step.prompt, freshPrompt: step.freshPrompt,
        start: step.start.mode === 'fork' ? { mode: 'fork', from: step.start.ref } : { mode: 'fresh' },
        ...(step.fork === undefined ? {} : { fork: step.fork }),
        ...(step.start.mode === 'fresh' && step.start.degraded !== undefined ? { degraded: step.start.degraded } : {}),
        toolName: step.submission.toolName, description: step.submission.description,
        inputSchema: step.submission.inputSchema, submissionSchema: step.submission.submissionSchema,
        validate: step.validate,
        scope: { write: null, measurement: null, size: null }, workingDirectory: step.equipment.workingDirectory,
        equip: () => ({ builtinTools: [...step.equipment.builtinTools] }), keep: () => finished('not-kept'),
      });
      if (result.ended !== 'submitted' || result.value === undefined) continue;
      const prepared = prepareContextSelection(result.value, {
        workItem: item.id, orientationInvocation: from.orientationInvocation,
        orientationPoint: result.actual === 'fork' ? from.point : null, selectorInvocation: result.id,
        degraded: !forked || result.actual !== 'fork',
      }, source);
      if (prepared.status === 'unavailable') continue;
      const changed = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
      if (changed.length > 0) {
        await this.fail(run, 'inputs-changed', `The captured plan evidence changed during context selection: ${changed.join('; ')}`, [runLayout.documentManifest]);
        return 'failed';
      }
      const selectionText = `${JSON.stringify(prepared.selection)}\n`;
      const selectionHash = sha256(selectionText);
      const selectionPath = runLayout.selectionVersion(item.id, selectionHash);
      await writeOnce(run.path(selectionPath), selectionText);
      await this.write(run, { type: 'context-selection-recorded', data: {
        workItem: item.id, selection: selectionPath, selectionHash, packageHash: prepared.selection.package.hash,
        ...(supersedes === undefined ? {} : { supersedes }),
      } });
      await this.afterWrite('context-selection-recorded', run.record.jobId);
      selectionEvent = run.log.all('context-selection-recorded').filter(event => event.data.workItem === item.id).at(-1);
      break;
    }
    return selectionEvent;
  }

  /**
   * The work item responsible for each subject revision. A registration
   * binds its obligation to the provider work item it started and each of
   * its requirements to the consumer work item whose iteration established
   * the agreement; a revision records its bindings itself, because it may
   * bind a subject to a work item that already exists.
   */
  private bindingsOf(run: Run): Map<string, string> {
    return bindingsOf(run.log);
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
    return verifiedRequirements(run.log);
  }

  /**
   * The requirements one work item owes that no `requirement-verified` has
   * closed. The scheduling binding decides whose they are, not the
   * requirement's own `workItem`: a revision may bind a requirement to a
   * follow-up while its record keeps naming the item it followed.
   */
  private openRequirementsOf(run: Run, records: ReturnType<typeof committedRecords>, workItem: string): ConsumerRequirement[] {
    return openRequirementsOf(run.log, records, workItem);
  }

  /**
   * The obligation one provider work item currently owes: the latest
   * revision of its own obligation that is bound to it. A completed item
   * that a revision rebound elsewhere owes nothing more.
   */
  private obligationOwedBy(run: Run, item: WorkItem, records: ReturnType<typeof committedRecords>): ProviderObligation | null {
    return obligationOwedBy(run.log, item, records);
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
    return assignedCount(run.log, workItem);
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
        data: { globalTarget: captureGlobalTarget({ planId: run.record.planId, runId: run.record.jobId }, this.globalContextOf(run)), workItem: item.id, module: item.module, origin: originKindOf(item), ...(integration === null ? {} : { scenario: integration }) },
      });
      await this.afterWrite('work-item-started', run.record.jobId);
      if (this.ignoring(run)) return null;
    }
    // The providers this item waited for have conformed. Resumption licenses
    // the architect to assign verification; the requirements stay open until
    // that verification replaces the fake and passes, and waiting for them
    // here would wait for this item itself.
    if (resumes !== null) {
      await this.write(run, { type: 'work-item-resumed', data: { workItem: item.id, requirements: [...resumes], globalTarget: captureGlobalTarget({ planId: run.record.planId, runId: run.record.jobId }, this.globalContextOf(run)) } });
      await this.afterWrite('work-item-resumed', run.record.jobId);
      if (this.ignoring(run)) return null;
    }

    const initialRecords = committedRecords(run.log.ledger.replay());
    const moduleEntry = run.index === null ? undefined : findModule(run.index, item.module);
    const proposal = initialRecords.registry.find(entry => entry.owner === item.module)?.proposed;
    const onboarding = moduleEntry !== undefined || proposal !== undefined
      ? await onboardingOf(this.projectRoot, moduleEntry?.dir ?? proposal!.directory)
      : { path: '(module directory unavailable)', purpose: null, missing: 'the assigned module is absent from the architect view and no proposal gives its directory' };
    let views = await apiViewsOf(this.options.ramify, this.projectRoot, run.index, item.module);
    const moduleDirectory = moduleEntry?.dir;
    const moduleSource = moduleDirectory === undefined ? null : join(this.projectRoot, moduleDirectory, 'src');
    // A continued session keeps the same cwd even if an engineer creates the module later.
    const workingDirectory = moduleSource !== null && (await stat(moduleSource).catch(() => null))?.isDirectory()
      ? moduleSource
      : this.projectRoot;
    const scope = baselineScope(item.module, []);
    const integration = await this.integrationOfItem(run, item);

    let sessionRef: string | undefined;
    /** The session this architect's turns share, while the harness keeps it; `sessionRef` is its executor's point. */
    let session: SessionId | undefined;
    /** The work item's current package: the selection that cites it and its text. */
    let contextPackage: WorkPackage | undefined;
    /** A re-selection's package, which the next prompt carries once. */
    let packageUndelivered = false;
    /** Why its next turn continues that session: what happened since its last turn. */
    let continuing: ContinueReason | undefined;
    let attempt = 0;
    let originalLocalInvocation: string | undefined;
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
    /** The plan deviation the global architect recorded for this work item's last unresolved request, delivered once. */
    let deviationRecorded: PlanDeviation | undefined;
    /** The environment problem the global architect reported for that request, after which the operator resumed the run, delivered once. */
    let environmentResumed: { problem: EnvironmentProblem; note: string } | undefined;
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

    // A recovered handback still owes the original A engineer its suspended
    // iteration. Its assignment remains open; no new local architect turn
    // may assign over it or treat the handback as completion of A's goal.
    if (this.workflow !== null && run.record.policy.version === capabilityRunPolicyVersion) {
      const saved = committedRecords(run.log.ledger.replay());
      const capabilityState = replayCapabilityState(run.log.events);
      const unqualified = [...saved.capabilityRequests.values()].find(request =>
        request.parent.kind === 'work-item' && request.parent.id === item.id &&
        capabilityState.requests.get(request.id)?.task === null &&
        capabilityState.requests.get(request.id)?.qualification === undefined &&
        !saved.results.has(request.assignment));
      if (unqualified !== undefined) {
        const assignment = saved.assignments.get(unqualified.assignment);
        const raw = await readIfExists(run.path(runLayout.submission(unqualified.invocation)));
        const submitted = raw === undefined ? null : JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        const parsed = submitted === null ? null : engineerSubmissionSchema.safeParse((({ schema: _schema, ...body }) => body)(submitted));
        if (assignment === undefined || !parsed?.success || parsed.data.kind !== 'capability-needed' ||
          unqualified.continuation.point === null) {
          await this.fail(run, 'recovery-exhausted', `Pending request ${unqualified.id} cannot recover its original engineer submission`);
          return null;
        }
        const suspended: SuspendedCapabilityOutcome = { kind: 'capability-needed', summary: parsed.data.summary,
          need: parsed.data.request, invocation: unqualified.invocation,
          session: unqualified.continuation.session, point: unqualified.continuation.point };
        const answer = await this.coordinateCapabilityNeed(run, agent, packages, baseline, item, assignment, suspended,
          undefined, { session: undefined, point: undefined, workingDirectory }, unqualified);
        if (answer === null || answer.kind === 'delegated') return null;
        session = answer.parent.session; sessionRef = answer.parent.point;
        lastAssignment = assignment;
        let resumed = await this.takeIteration(run, agent, packages, baseline, item, assignment, await this.refreshIndex(run), {
          session: suspended.session, point: suspended.point, priorInvocation: suspended.invocation, guidance: answer.guidance,
        });
        if (resumed === null) return null;
        while (resumed.kind === 'capability-needed') {
          const next = await this.coordinateCapabilityNeed(run, agent, packages, baseline, item, assignment, resumed, undefined,
            { session, point: sessionRef, workingDirectory });
          if (next === null || next.kind === 'delegated') return null;
          session = next.parent.session; sessionRef = next.parent.point;
          resumed = await this.takeIteration(run, agent, packages, baseline, item, assignment, await this.refreshIndex(run), {
            session: resumed.session, point: resumed.point, priorInvocation: resumed.invocation, guidance: next.guidance,
          });
          if (resumed === null) return null;
        }
        lastResult = resumed.result;
        lastIterationGate = resumed.returnedGate;
        continuing = 'capability-returned';
      }
      const pending = [...saved.capabilityRequests.values()].find(request =>
        request.parent.kind === 'work-item' && request.parent.id === item.id &&
        saved.capabilityHandbacks.has(capabilityState.requests.get(request.id)?.task ?? '') &&
        saved.assignments.has(request.assignment) && !saved.results.has(request.assignment));
      if (pending !== undefined) {
        const handback = saved.capabilityHandbacks.get(capabilityState.requests.get(pending.id)!.task!)!;
        const assignment = saved.assignments.get(pending.assignment)!;
        if (pending.continuation.point === null) {
          await this.fail(run, 'recovery-exhausted', `Original assignment ${assignment.id} has no captured engineer continuation point`);
          return null;
        }
        const qualified = await this.replayAcceptedCapabilityQualification(run, pending, 'local-architect');
        if (qualified === null) return null;
        if (qualified === undefined) {
          await this.fail(run, 'recovery-exhausted', `Handback ${handback.task} has no accepted original local qualification point`);
          return null;
        }
        session = qualified.session; sessionRef = qualified.ref;
        lastAssignment = assignment;
        const guidance = [
          `Capability ${handback.task} handed back at ${handback.returnedTree}.`,
          `Accepted source ${handback.sourceRevision}; changes since your suspension: ${handback.deltaFromSuspension.join(', ') || '(none)'}.`,
          `Interface use: ${handback.interfaces.map(entry => `${entry.symbols.join(', ')} at ${entry.path}: ${entry.use}`).join('; ')}.`,
          `Continue ${assignment.id} from its current candidate. Its original goal remains unfinished.`,
        ].join('\n');
        let resumed = await this.takeIteration(run, agent, packages, baseline, item, assignment, await this.refreshIndex(run), {
          session: pending.continuation.session, point: pending.continuation.point,
          priorInvocation: pending.invocation, guidance,
        });
        if (resumed === null) return null;
        while (resumed.kind === 'capability-needed') {
          const answer = await this.coordinateCapabilityNeed(run, agent, packages, baseline, item, assignment, resumed, undefined,
            { session, point: sessionRef, workingDirectory });
          if (answer === null || answer.kind === 'delegated') return null;
          session = answer.parent.session; sessionRef = answer.parent.point;
          resumed = await this.takeIteration(run, agent, packages, baseline, item, assignment, await this.refreshIndex(run), {
            session: resumed.session, point: resumed.point, priorInvocation: resumed.invocation, guidance: answer.guidance,
          });
          if (resumed === null) return null;
        }
        lastResult = resumed.result;
        lastIterationGate = resumed.returnedGate;
        continuing = 'capability-returned';
      }
    }

    if (run.restoring) {
      const main: typeof run.log.events[number][] = [];
      for (const event of run.log.all('invocation-started').filter(event => event.data.role === 'local-architect' && event.data.work.workItem === item.id)) {
        const packet = await (await this.operations(agent)).packet(run.record.jobId, event.data.invocation);
        if (packet?.submissionTool === localArchitectToolName) main.push(event);
      }
      const latest = main.at(-1);
      if (latest?.type === 'invocation-started' && !run.log.all('work-item-yielded').some(event => event.data.invocation === latest.data.invocation)) {
        originalLocalInvocation = latest.data.invocation;
        const original = invocationSchema.parse(this.committedBody(run, runLayout.invocation(originalLocalInvocation)));
        const previous = committedRecords(run.log.ledger.replay()).outcomes.get(originalLocalInvocation);
        attempt = original.attempt - 1; session = latest.data.session;
        sessionRef = previous?.session?.ref || original.session.from || undefined;
        continuing = latest.data.continues?.reason;
        const selection = await this.currentSelection(run, item.id);
        if (selection) contextPackage = { text: selection.packageText, selection: selection.event.data.selection, citation: selection.selection.package };
      }
    }

    turns: for (;;) {
      if (this.ignoring(run)) return null;
      attempt += 1;
      const current = committedRecords(run.log.ledger.replay());
      // The view is refreshed before the architect's turn, so the rules its
      // submission is judged by are applied against the project as it stands.
      const index = await this.refreshIndex(run);
      // A view that could not be materialized is materialized again for each
      // later turn, rather than repeating a failure the project may have outgrown.
      if (attempt > 1 && views.unavailable !== null) views = await apiViewsOf(this.options.ramify, this.projectRoot, run.index, item.module);
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
      const guardedFiles = (await captureGuardedFiles(
        this.projectRoot,
        this.requiredArtifacts(current).map(artifact => artifact.path),
        scenarioFiles,
        await this.auditPreparationPaths(run),
      )).filter(file => !harnessOnly.has(file.path));
      const guarded = new Set(guardedFiles.map(file => file.path));
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
      const briefing: WorkItemBriefing = {
        item,
        setup: await this.checkInputSection(run),
        testAreas: (await moduleTestAreas(this.projectRoot, run.index)).filter(area => area.module === item.module),
        onboarding,
        views,
        defaultWriteScope: await this.defaultWriteScopes(index, [item.module], guardedFiles.filter(file => file.hash !== null).map(file => file.path)),
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
          obligation: obligationBriefingOf(item, current),
          ...(cycleFinding === undefined ? {} : { cycle: cycleFinding }),
          ...(blocked === undefined ? {} : { blocked }),
          ...(revisionReports === undefined || revisionReports.length === 0 ? {} : { revisionsNeeded: revisionReports }),
        },
        ...(unresolvedRequest === undefined ? {} : { unresolvedRequest }),
        // The deviation that just answered this architect's unresolved
        // request; every deviation after its package is rendered below.
        ...(deviationRecorded === undefined ? {} : { deviationRecorded: deviationRecorded.id }),
        ...(environmentResumed === undefined ? {} : { environmentResumed }),
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
            ...(lastResult.failure !== undefined
              ? { bounds: lastResult.failure.digest.bounds, failure: lastResult.failure }
              : lastAssignment === undefined ? {} : { bounds: this.engineerBounds(run, lastAssignment) }),
          },
        }),
        bounds: engineerBoundsOf(run.record.policy.limits),
        runDirectory: run.directory,
        projectRoot: this.projectRoot,
        workingDirectory,
        ...(moduleEntry !== undefined || proposal !== undefined ? { moduleDirectory: moduleEntry?.dir ?? proposal!.directory } : {}),
      };
      if (attempt === 1) {
        const context = await this.orientAndSelectWorkContext(run, agent, packages, item, briefing, workingDirectory);
        if (context.kind === 'failed') return null;
        if (context.kind === 'ready') {
          contextPackage = context.package;
          // A recovered handback already authenticated its accepted qualification
          // point. The context selection still supplies the package and the
          // immutable review fork source; it cannot rewind this action session.
          if (continuing !== 'capability-returned' || sessionRef === undefined) {
            session = resumes === null ? context.session : undefined;
            sessionRef = resumes === null ? context.ref : undefined;
            continuing = sessionRef === undefined ? undefined : 'context-selected';
          }
        }
      }
      // The package is in the session once: appended after the orientation,
      // or carried by the first prompt of a session that lacks it, such as a
      // reconstruction. Every other turn names it by its hash.
      const packageInPrompt = contextPackage !== undefined && (sessionRef === undefined || packageUndelivered);
      const owned = this.obligationBriefing(run, { kind: 'work-item', id: item.id });
      let intervening: string | undefined;
      if (attempt === 1 && this.workflow !== null) {
        const tasks = [...current.capabilityHandbacks.values()].flatMap(handback => {
          const task = current.capabilityTasks.get(handback.task);
          return task?.deferredWorkItems.includes(item.id) ? [{ task, handback }] : [];
        });
        if (tasks.length > 0) intervening = tasks.map(({ task, handback }) =>
          `Task ${task.id} returned tree ${handback.returnedTree} at ${handback.sourceRevision}. ` +
          `Plan ${handback.plan.id} revision ${handback.plan.revision}; changed since A suspension: ${handback.deltaFromSuspension.join(', ') || '(none)'}. ` +
          `Interface use: ${handback.interfaces.map(entry => `${entry.symbols.join(', ')} at ${entry.path}: ${entry.use}`).join('; ')}. ` +
          `This task did not complete ${item.id}. Reassess its prior outline, decisions and any unexecuted assignment against the current source before assigning it.`
        ).join('\n\n');
      }
      // The turn is built from its inputs by the local architect's own
      // constructor, which `step render` uses too.
      const requirements = contextPackage === undefined
        ? [this.planPackage(run, await this.frozenCatalog(run), [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs])] : [];
      const oriented = await this.orientationStartingPoints(run, item.id);
      const orientedEvent = run.log.all('work-orientation-recorded').find(event => event.data.workItem === item.id);
      const projection = this.obligationProjection(run);
      const plain = <V>(value: V): V => JSON.parse(JSON.stringify(value)) as V;
      let step: ConstructedWorkTurnStep;
      try {
        const turn = validateWorkTurnInputs({
          schema: stepInputsSchemaId, role: 'local-architect', phase: 'work-turn', consultation: localConsultationInputs(run.log.events, item.id), run: { planId: run.record.planId, runId: run.record.jobId },
          work: { workItem: item.id }, attempt, capabilityWorkflow: this.workflow !== null, limits: run.record.policy.limits,
          context: contextPolicyOf(run.record.policy, 'local-architect'), workingDirectory: this.projectRelative(workingDirectory),
          briefing: workBriefingInputs(briefing),
          ...(contextPackage === undefined ? {} : {
            package: { hash: contextPackage.citation.hash, elements: [...contextPackage.citation.elements], deviations: [...contextPackage.citation.deviations], text: contextPackage.text },
            ...this.laterDeviations(run, await this.frozenCatalog(run), contextPackage.citation.deviations),
          }),
          packageInPrompt, obligationLines: owned, ...(intervening === undefined ? {} : { intervening }),
          requirements, known: knownFactsInputs(await this.knownProjectFacts(run, [item.module])),
          startingPoints: lastResult === undefined || lastAssignment === undefined ? [] : [plain(await this.engineerStartingPoints(run, lastAssignment, lastResult))],
          ...(oriented === undefined ? {} : { orientation: { group: plain(oriented.group),
            session: (orientedEvent === undefined ? undefined : run.log.all('invocation-started').find(event => event.data.invocation === orientedEvent.data.invocation)?.data.session) ?? null } }),
          validation: {
            hypotheses: plain(current.hypotheses), decisions: plain([...current.decisions.values()]), workItems: current.workItems.map(entry => entry.id),
            openRequirements: open.map(requirement => requirement.id), contracts: [...this.contractsConsumedBy(run, current, item.id)],
            guardedPaths: [...guarded], harnessOnly: [...harnessOnly],
            obligations: { entries: plain([...projection.obligations.entries()]), tests: projection.tests },
            scope: { view: run.record.manifest.architectView, revision: this.assignedCount(run, item.id) + 1 },
          },
          start: sessionRef === undefined
            ? { kind: 'fresh', ...(continuing === undefined ? {} : { continuing }) }
            : { kind: 'continued', point: sessionRef, ...(session === undefined ? {} : { session }), ...(continuing === undefined ? {} : { continuing }) },
        });
        step = constructWorkTurnStep(turn, { projectRoot: this.projectRoot, packages });
      } catch (error) {
        await this.fail(run, 'inputs-changed', `The work-item package of ${item.id} cannot be rendered: ${message(error)}`);
        return null;
      }
      packageUndelivered = false;
      // A finding is delivered once: the next turn of this same architect
      // has it in its own history, and repeating it would read as a second
      // detection.
      cycleFinding = undefined;
      blocked = undefined;
      deviationRecorded = undefined;
      environmentResumed = undefined;
      released = null;
      revisionReports = [];
      returned = undefined;
      undelivered.length = 0;

      // A completion request that leaves an obligation of this architect
      // without a done report is rejected in this same turn, under the
      // per-turn bound, before any outline, commit or gate.
      let unreported: string[] = [];
      const result = await this.runInvocation<LocalArchitectSubmission>(run, agent, {
        role: step.role,
        originalInvocation: originalLocalInvocation,
        brief: step.brief,
        context: step.context,
        stepInputs: step.before.inputs, consultationPackages: packages,
        fallback: this.stepFallback(step.inputs, packages),
        work: step.work,
        attempt: step.attempt,
        loaded: step.loaded,
        systemPrompt: step.systemPrompt,
        prompt: step.prompt,
        workingDirectory: step.equipment.workingDirectory,
        start: step.start.mode === 'continue' ? { mode: 'continue', ref: step.start.ref } : { mode: 'fresh' },
        session,
        continuing: step.continuing,
        // The architect is continued after a placement request, an
        // unresolved request the global architect answered, an iteration and
        // a refused or failed completion. A yield ends its use: a resumed
        // work item starts afresh.
        keep: (ended, value) => (ended === 'submitted' && value !== undefined && value.kind !== 'yield-for-providers'
          ? kept
          : finished('not-kept')),
        toolName: step.submission.toolName,
        description: step.submission.description,
        inputSchema: step.submission.inputSchema,
        submissionSchema: step.submission.submissionSchema,
        equip: () => ({ builtinTools: [...step.equipment.builtinTools], tools: [createGitInspectionTool(this.projectRoot)] }),
        ...(!packageInPrompt ? {} : { onStarted: async (invocation: string, destination: SessionId) => {
          await this.write(run, { type: 'context-package-prompt-bound', data: {
            workItem: item.id, selection: contextPackage!.selection, packageHash: contextPackage!.citation.hash,
            invocation, session: destination,
          } });
        } }),
        // The submission is judged against the step's evidence and the view
        // as it stands. The scope is captured before the submission is
        // accepted, so a scope the provider refuses is answered here with its
        // path and the turn's remaining attempts, and nothing of it is committed.
        validate: async input => {
          const judged = await judgeWorkTurn(step, input, { index, ramify: this.options.ramify, projectRoot: this.projectRoot });
          // What the last rejected request left unreported, which an
          // exhausted turn's failure names.
          if (judged.unreported !== undefined) unreported = [...judged.unreported];
          if (judged.prepared !== undefined) this.preparedScopes.set(judged.prepared.body, judged.prepared.scope);
          return judged.verdict;
        },
        scope: {
          write: null,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: null,
        },
        measured: { snapshot: baseline, scope: scope },
      });
      originalLocalInvocation = undefined;
      sessionRef = result.kept && result.ref !== '' ? result.ref : undefined;
      session = sessionRef === undefined ? undefined : result.session;

      if (this.ignoring(run)) return null;
      if (result.ended !== 'submitted' || result.value === undefined) {
        // An exhausted rejection bound is a rejected-submissions result: it
        // names what the last rejected completion request left unreported,
        // and says nothing about the code.
        const owed = result.ended === 'invalid-submission' && unreported.length > 0
          ? `; its last rejected completion request left ${unreported.join(', ')} without a done report` : '';
        await this.fail(
          run,
          result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
          `The local architect of ${item.id} ended without a result (${result.ended})${owed}`,
          [runLayout.outcome(result.id)],
        );
        return null;
      }

      // The architect's registrations and reports apply on acceptance, before
      // its action and whatever the action leads to: reporting continues
      // alongside coordination, and no gate or audit outcome edits them.
      if (result.value.kind !== 'yield-for-providers'
        && !await this.handling.recordObligations(run, { kind: 'work-item', id: item.id }, result.id, result.value)) return null;

      if (result.value.kind === 'unresolved') {
        // The request cannot be met as stated. The global architect answers
        // it: a placement fix, a plan deviation this work item goes on
        // under, an environment problem the run holds for until the
        // operator resumes it, or nothing possible, which ends the run.
        const resolution = await this.resolveUnresolved(run, agent, packages, baseline, item, {
          invocation: result.id, conflict: result.value.conflict, evidence: result.value.evidence,
        });
        if (resolution === null) return null;
        unresolvedRequest = undefined;
        if (resolution.kind === 'deviation') {
          deviationRecorded = resolution.deviation;
          continuing = 'deviation-recorded';
        } else if (resolution.kind === 'environment') {
          environmentResumed = { problem: resolution.problem, note: resolution.note };
          continuing = 'environment-resumed';
        } else {
          continuing = 'placement-answered';
        }
        continue;
      }

      if (result.value.kind === 'request-placement') {
        // The work item leaves its repair path for a placement question;
        // what it bound or reported stays as it is.
        const resolution = await this.requestPlacement(run, agent, packages, baseline, item, result.value.request);
        if (resolution === null) return null;
        unresolvedRequest = resolution.kind === 'unresolved'
          ? { id: resolution.request, findings: resolution.findings, gaps: resolution.gaps }
          : undefined;
        // A decision that adds an owner to the work item may bring other
        // fixed requirements into play, so the work item selects again from
        // its architect's current point; later assignments cite the new
        // package, which the next prompt carries once.
        if (resolution.kind === 'decided' && contextPackage !== undefined && this.addsOwner(run, item, resolution.decision)) {
          const reselected = await this.reselectWorkContext(run, agent, packages, item, contextPackage,
            { invocation: result.id, point: result.ref ?? null, session: result.session }, resolution.decision);
          if (reselected === null) return null;
          contextPackage = reselected;
          packageUndelivered = true;
        }
        continuing = 'placement-answered';
        continue;
      }

      if (result.value.kind === 'yield-for-providers') {
        // A yield moves no obligation: what was bound stays bound.
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
          lastIterationGate = undefined;
          failedGate = undefined;
          if (revised.cycle !== undefined) cycleFinding = revised.cycle;
          continuing = 'iteration-closed';
          continue;
        }
        let outcome = await this.takeIteration(run, agent, packages, baseline, item, assigned, index);
        if (outcome === null) return null;
        while (outcome.kind === 'capability-needed') {
          const answer = await this.coordinateCapabilityNeed(run, agent, packages, baseline, item, assigned, outcome, contextPackage,
            { session, point: sessionRef, workingDirectory });
          if (answer === null) return null;
          if (answer.kind === 'delegated') return 'reported';
          session = answer.parent.session; sessionRef = answer.parent.point;
          outcome = await this.takeIteration(run, agent, packages, baseline, item, assigned, index, {
            session: outcome.session, point: outcome.point, priorInvocation: outcome.invocation, guidance: answer.guidance,
          });
          if (outcome === null) return null;
        }
        lastResult = outcome.result;
        // An iteration that spent its repair rounds moves no obligation:
        // a binding or a done report stays until a submission changes it.
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
          const reported = outcome.result;
          // A contract engineer that ended without a result is reported
          // with its digest and analysis, in place of the need's.
          lastResult = {
            ...reported,
            findings: [...reported.findings, ...contract.findings],
            ...(contract.result?.failure === undefined ? {} : { failure: contract.result.failure }),
          };
          if (contract.cycle !== undefined) cycleFinding = contract.cycle;
        }
        continuing = 'iteration-closed';
        continue;
      }

      // Completion is refused while a requirement of this work item is open,
      // and while the obligation it exists for is not conformed: a
      // fake-backed pass never completes a capability, and the gate's verdict
      // on the tests says nothing about which provider ran. Missing done
      // reports never reach here: validation rejected such a request.
      const blockers = completionBlockers(run.log, item, this.workflow !== null);
      if (blockers.blocked.length > 0) {
        refusals += 1;
        blocked = blockers.blocked;
        if (refusals > bound) {
          await this.refuseCompletion(run, item, refusals, blocked, { open: blockers.open, owed: blockers.owed !== null });
          return null;
        }
        continuing = 'completion-refused';
        continue;
      }

      if (await this.handling.reviseOutline(run, {
        item, invocation: result.id, outline: result.value.outline,
        hypothesesSeen: hypotheses.map(hypothesis => refOf(hypothesis.id, hypothesis.revision, hypothesis)),
        architectRef: architectRefOf(result),
      }) === null) return null;
      run.reviews?.wake();
      if (this.ignoring(run)) return null;

      // Before the gate, the work item's reviews settle and what they
      // raised is reconciled; a completion whose basis no longer holds is
      // reconciled again, as often as rounds remain.
      const parent: ParentSession = { session, ref: sessionRef, undelivered, workingDirectory };
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
        gate = await this.gates.workItemGate(run, item, result.id, gateRound, result.value.summary, undefined, run.restoring);
        gateRound += 1;
        if (gate === null) return null;
        if (gate.verdict !== 'passed') break;
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
    const context = globalContext({
      events: run.log.events,
      sessionRef: invocation => records.outcomes.get(invocation)?.session?.ref,
    });
    return context.session !== null && this.sessionsOf(run)?.get(context.session)?.state === 'finished' ? { ...context, ref: null, point: null } : context;
  }

  /**
   * The identity of the view a decision is recorded against. The revision
   * and the input identity come from the view that was read; the coverage
   * limits come from its own metadata, and where those cannot be read the
   * limit says so rather than reporting none.
   */
  private async viewIdentityOf(index: ArchitectIndex | null): Promise<ViewIdentity> {
    return projectViewIdentity(this.projectRoot, index);
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
  private async replayAcceptedBoundaryFork(run: Run, request: string, view: ViewIdentity):
    Promise<InvocationResult<ForkSubmission> | null | undefined> {
    const started = [...run.log.all('invocation-started')].reverse().find(event =>
      event.data.role === 'global-fork' && event.data.work.request === request);
    if (started === undefined || run.log.all('fork-returned-partial').some(event =>
      event.data.request === request && event.data.invocation === started.data.invocation)) return undefined;
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === started.data.invocation);
    if (ended?.data.ended !== 'submitted' || ended.data.submission === null) return undefined;
    const priorView = [...run.log.all('view-refreshed')].reverse().find(event =>
      event.sequence < started.sequence && event.data.request === request);
    if (priorView === undefined || !sameView(priorView.data.view, view)) {
      await this.fail(run, 'inputs-changed', `Accepted fork of ${request} has a changed architect view`);
      return null;
    }
    const outcome = this.committedBody(run, runLayout.outcome(started.data.invocation)) as InvocationOutcome | null;
    const bytes = await readIfExists(run.path(runLayout.submission(started.data.invocation)));
    if (bytes === undefined || sha256(bytes) !== ended.data.submission ||
      outcome?.submission?.hash !== ended.data.submission || outcome.disposition !== 'applied' ||
      !outcome.settled.confirmed) {
      await this.fail(run, 'recovery-exhausted', `Fork of ${request} has an unauthenticated accepted result`);
      return null;
    }
    const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const { schema: _schema, ...body } = raw;
    const parsed = forkSubmissionSchema.safeParse(body);
    if (raw.schema !== 'ramify-agent.fork-submission/1' || !parsed.success) {
      await this.fail(run, 'recovery-exhausted', `Fork of ${request} has an invalid accepted result`);
      return null;
    }
    return { id: started.data.invocation, ended: 'submitted', value: parsed.data,
      ref: outcome.session?.ref ?? '', session: started.data.session,
      kept: ended.data.kept, outcomeKind: 'submitted' };
  }

  private async recoveredBoundaryPartial(run: Run, request: string): Promise<{
    attempt: number; findings: string[]; gaps: string[] } | undefined> {
    const partial = run.log.all('fork-returned-partial').filter(event => event.data.request === request).at(-1);
    if (partial === undefined) return undefined;
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === partial.data.invocation);
    const bytes = await readIfExists(run.path(runLayout.submission(partial.data.invocation)));
    if (ended?.data.submission === null || bytes === undefined || sha256(bytes) !== ended?.data.submission) {
      throw new Error(`The partial fork of ${request} lost its accepted evidence`);
    }
    const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const { schema: _schema, ...body } = raw;
    const parsed = forkSubmissionSchema.safeParse(body);
    if (raw.schema !== 'ramify-agent.fork-submission/1' || !parsed.success || parsed.data.kind !== 'partial') {
      throw new Error(`The partial fork of ${request} has invalid accepted evidence`);
    }
    return { attempt: partial.data.retry, findings: [...parsed.data.findings], gaps: [...parsed.data.gaps] };
  }

  private async requestPlacement(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    body: PlacementRequestBody,
    existingId?: string,
  ): Promise<PlacementResolution | null> {
    const loaded = packages.get('global-fork');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the global architect');
      return null;
    }

    const count = run.log.count('placement-requested') + 1;
    if (existingId === undefined && count > run.record.policy.limits.maxPlacementRequests) {
      await this.fail(run, 'limit-exceeded',
        `The run has made ${count - 1} placement requests; the policy allows ${run.record.policy.limits.maxPlacementRequests}`);
      return null;
    }

    const id = existingId ?? requestId(count);
    const committed = committedRecords(run.log.ledger.replay());
    const request = existingId === undefined ? placementRequestSchema.parse({
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
      globalSource: globalForkSourceSchema.parse(this.globalContextOf(run)),
    } satisfies PlacementRequest) : placementRequestSchema.parse(this.committedBody(run, architectureLayout.request(id)));

    if (existingId !== undefined) {
      const accepted = run.log.all('decision-accepted').find(event => event.data.request === id);
      if (accepted !== undefined) {
        const decision = committed.decisions.get(accepted.data.decision);
        if (decision === undefined || !await this.deliverDecision(run, decision)) {
          await this.fail(run, 'recovery-exhausted', `Placement ${id} has no recoverable accepted decision`);
          return null;
        }
        return { kind: 'decided', decision };
      }
    }
    if (existingId === undefined) await this.write(run, {
      type: 'placement-requested',
      data: { request: id, workItem: item.id, requester: item.module, capability: body.forCapability },
    }, [{ path: architectureLayout.request(id), id, revision: 1, body: request }]);
    if (existingId === undefined) await this.afterWrite('placement-requested', run.record.jobId);
    if (this.ignoring(run)) return null;

    const systemPrompt = renderGlobalForkPrompt(loaded, this.projectRoot);
    const bound = run.record.policy.limits.forkRetriesPerRequest;
    const measured = baselineScope(
      this.options.rootModule ?? rootModuleOf(run.index) ?? rootModuleOfSnapshot(baseline) ?? 'root',
      // Each invocation's own package and the plan are its support documents.
      [],
    );
    let partial: { attempt: number; findings: string[]; gaps: string[] } | undefined = existingId === undefined
      ? undefined : await this.recoveredBoundaryPartial(run, id);
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
      const context = request.globalSource;
      if (context === undefined) {
        await this.fail(run, 'recovery-exhausted', `Placement ${id} has no recorded oriented request-time parent or named rebuild`);
        return null;
      }
      const decisions = [...current.decisions.values()];
      const replay = existingId === undefined ? undefined : await this.replayAcceptedBoundaryFork(run, id, view);
      if (replay === null) return null;
      const result = replay ?? await this.runInvocation<ForkSubmission>(run, agent, {
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
          ...(partial === undefined ? {} : { partial }),
          ...(revalidate === undefined ? {} : { revalidate }),
        }),
        start: context.ref === null ? { mode: 'fresh' } : { mode: 'fork', from: context.ref },
        ...(context.ref === null ? { degraded: { requested: 'fork' as const, reason: 'The global architect context is unavailable; using the ordinary request records' } } : {}),
        ...(context.point === null ? {} : {
          fork: { from: context.point, reason: 'placement-request', generation: context.generation, briefs: [...context.appended] },
        }),
        keep: () => finished('not-kept'),
        toolName: forkToolName,
        description: 'End this fork with its decision, or with the findings and gaps of a fork that could not decide. The harness validates it; an invalid submission is returned with every error and its path.',
        inputSchema: forkJsonSchema,
        submissionSchema: 'ramify-agent.fork-submission/1',
        validate: input => validateFork(input, placementEvidenceOf(current, index)),
        scope: {
          write: null,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: null,
        },
        measured: { snapshot: baseline, scope: measured },
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

      if (result.value.kind !== 'decision') {
        await this.fail(run, 'internal', `The placement fork of ${id} answered ${result.value.kind}, which only an unresolved request accepts`, [runLayout.submission(result.id)]);
        return null;
      }
      const decision = await this.acceptForkDecision(run, agent, item, id, result.id, result.value, view, current);
      return decision === null ? null : { kind: 'decided', decision };
    }
  }

  /**
   * Accepts one fork's decision for a request: commits it with its registry
   * and hypothesis revisions, appends its brief to the architect context
   * and delivers it to the work item. Null once the run has ended.
   */
  private async acceptForkDecision(
    run: Run,
    agent: AgentPort,
    item: WorkItem,
    id: string,
    invocation: string,
    value: Extract<ForkSubmission, { kind: 'decision' }>,
    view: ViewIdentity,
    current: ReturnType<typeof committedRecords>,
  ): Promise<PlacementDecision | null> {
    const decisionId = globalDecisionId(id);
    const accepted = acceptDecision({
      id: decisionId,
      authority: 'global',
      request: id,
      workItem: item.id,
      invocation,
      body: value.decision,
      registry: value.registry,
      hypothesisRevisions: value.hypothesisRevisions,
      brief: value.brief,
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
          invocation,
          registry: accepted.registry.length,
          hypotheses: accepted.hypotheses.length,
        },
      },
      records: accepted.records,
    });
    if (this.ignoring(run)) return null;
    if (!await this.deliverDecision(run, accepted.decision)) return null;
    return accepted.decision;
  }

  /**
   * A local architect's `unresolved` answer: its request cannot be met as
   * stated. The harness records it as an unresolved request and forks the
   * architect context with it, as for a placement request. The fork answers
   * with a placement decision, delivered as a placement answer is; with a
   * plan deviation, recorded with the CheckFinding that asks the person to
   * accept or reject it, under which the work item goes on; with an
   * environment problem, which holds the work item until the operator
   * resumes the run; or with nothing possible, which ends the run, as does a
   * fork that cannot decide within its retries. Null once the run has ended.
   */
  private async resolveUnresolved(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    answer: { readonly invocation: string; readonly conflict: string; readonly evidence: readonly string[] },
    existingId?: string,
  ): Promise<UnresolvedResolution | null> {
    const loaded = packages.get('global-fork');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the global architect');
      return null;
    }
    // Unresolved requests fork the architect context as placement requests
    // do, and count against the same bound.
    const forks = run.log.count('placement-requested') + run.log.count('unresolved-requested') + 1;
    if (existingId === undefined && forks > run.record.policy.limits.maxPlacementRequests) {
      await this.fail(run, 'limit-exceeded',
        `The run has made ${forks - 1} placement and unresolved requests; the policy allows ${run.record.policy.limits.maxPlacementRequests}`);
      return null;
    }

    const id = existingId ?? unresolvedRequestId(run.log.count('unresolved-requested') + 1);
    const request = existingId === undefined ? unresolvedRequestSchema.parse({
      schema: 'ramify-agent.unresolved-request/1',
      id,
      workItem: item.id,
      requester: item.module,
      invocation: answer.invocation,
      conflict: answer.conflict,
      evidence: [...answer.evidence],
      globalSource: globalForkSourceSchema.parse(this.globalContextOf(run)),
    } satisfies UnresolvedRequest) : unresolvedRequestSchema.parse(this.committedBody(run, deviationLayout.request(id)));
    if (existingId !== undefined) {
      const accepted = run.log.all('decision-accepted').find(event => event.data.request === id);
      if (accepted !== undefined) {
        const decision = committedRecords(run.log.ledger.replay()).decisions.get(accepted.data.decision);
        if (decision === undefined || !await this.deliverDecision(run, decision)) {
          await this.fail(run, 'recovery-exhausted', `Unresolved request ${id} has no recoverable accepted decision`);
          return null;
        }
        return { kind: 'decided', decision };
      }
      const deviationEvent = run.log.all('plan-deviation-recorded').find(event => event.data.request === id);
      if (deviationEvent !== undefined) {
        const deviation = planDeviationSchema.parse(this.committedBody(run, deviationLayout.deviation(deviationEvent.data.deviation)));
        if (deviation.scenarios.length > 0 && !await this.rewordScenarios(run, deviation)) return null;
        if (deviation.held && !await this.awaitDeviationDecision(run, deviation)) return null;
        return { kind: 'deviation', deviation };
      }
      const environmentEvent = run.log.all('environment-reported').find(event => event.data.request === id);
      if (environmentEvent !== undefined) {
        const problem = environmentProblemSchema.parse(this.committedBody(run, deviationLayout.environment(environmentEvent.data.problem)));
        const note = await this.awaitEnvironmentAnswer(run, problem);
        return note === null ? null : { kind: 'environment', problem, note };
      }
    }
    if (existingId === undefined) await this.write(run, {
      type: 'unresolved-requested',
      data: { request: id, workItem: item.id, requester: item.module, invocation: answer.invocation },
    }, [{ path: deviationLayout.request(id), id, revision: 1, body: request }]);
    if (this.ignoring(run)) return null;

    const plan = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    const planFile = planPath(run.record.planId);
    // The fork reads the work item's package, with every deviation recorded
    // so far, and a deviation amends its elements by ID.
    let catalog: ElementCatalog;
    let workElements: readonly string[];
    try {
      catalog = await this.frozenCatalog(run);
      workElements = (await this.currentSelection(run, item.id))?.selection.package.elements
        ?? [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs];
    } catch (error) {
      await this.fail(run, 'inputs-changed', `The package of ${item.id} cannot be read for its unresolved request: ${message(error)}`);
      return null;
    }
    const unresolvable = (detail: string, evidence: readonly string[]) => this.fail(run, 'unresolvable-requirement',
      `The local architect of ${item.id} reports the request cannot be met as stated (${answer.conflict}), and ${detail}`,
      [deviationLayout.request(id), runLayout.submission(answer.invocation), ...answer.evidence, ...evidence]);
    const systemPrompt = renderGlobalForkPrompt(loaded, this.projectRoot);
    const bound = run.record.policy.limits.forkRetriesPerRequest;
    const measured = baselineScope(
      this.options.rootModule ?? rootModuleOf(run.index) ?? rootModuleOfSnapshot(baseline) ?? 'root',
      // Each invocation's own package and the plan are its support documents.
      [],
    );
    let partial: { attempt: number; findings: string[]; gaps: string[] } | undefined = existingId === undefined
      ? undefined : await this.recoveredBoundaryPartial(run, id);
    let revalidate: { was: string; now: string } | undefined;

    for (;;) {
      if (this.ignoring(run)) return null;
      run.writer.requireSettled(`The architect view for ${id} cannot be refreshed`);

      const attempt = run.log.all('view-refreshed').filter(event => event.data.request === id).length + 1;
      const index = await this.refreshIndex(run);
      const view = await this.viewIdentityOf(index);
      const unavailable = index === null
        ? 'the architect view could not be refreshed for this request, so what it does not show is not established'
        : null;
      await this.write(run, { type: 'view-refreshed', data: { request: id, attempt, view, unavailable } });
      if (this.ignoring(run)) return null;

      const current = committedRecords(run.log.ledger.replay());
      const context = request.globalSource;
      if (context === undefined) {
        await this.fail(run, 'recovery-exhausted', `Unresolved request ${id} has no recorded oriented request-time parent or named rebuild`);
        return null;
      }
      const decisions = [...current.decisions.values()];
      const tracked = trackedScenarios(run.log.ledger.replay());
      const replay = existingId === undefined ? undefined : await this.replayAcceptedBoundaryFork(run, id, view);
      if (replay === null) return null;
      const result = replay ?? await this.runInvocation<ForkSubmission>(run, agent, {
        role: 'global-fork',
        work: { workItem: item.id, request: id },
        attempt,
        loaded,
        systemPrompt,
        prompt: unresolvedForkMessage({
          request,
          workItem: { goal: item.goal },
          package: this.planPackage(run, catalog, workElements),
          deviations: this.deviationsOf(run).length,
          deviationLimit: this.deviationLimit(run),
          environmentProblems: this.environmentProblemsOf(run),
          view,
          ...(unavailable === null ? {} : { viewUnavailable: unavailable }),
          registry: current.registry,
          hypotheses: current.hypotheses,
          decisions,
          ...(partial === undefined ? {} : { partial }),
          ...(revalidate === undefined ? {} : { revalidate }),
        }),
        start: context.ref === null ? { mode: 'fresh' } : { mode: 'fork', from: context.ref },
        ...(context.ref === null ? { degraded: { requested: 'fork' as const, reason: 'The global architect context is unavailable; using the ordinary request records' } } : {}),
        ...(context.point === null ? {} : {
          fork: { from: context.point, reason: 'unresolved-request', generation: context.generation, briefs: [...context.appended] },
        }),
        keep: () => finished('not-kept'),
        toolName: forkToolName,
        description: 'End this fork with its answer to the unresolved request: a placement decision, a plan deviation, an environment problem, nothing possible, or the findings and gaps of a fork that could not decide. The harness validates it; an invalid submission is returned with every error and its path.',
        inputSchema: forkJsonSchema,
        submissionSchema: 'ramify-agent.fork-submission/1',
        validate: input => validateFork(input, placementEvidenceOf(current, index), {
          kind: 'unresolved',
          elements: new Set(workElements.filter(element => !element.startsWith('ctx-'))),
          workItems: new Set(current.workItems.map(entry => entry.id)),
          scenarios: new Map(tracked.records.map(record => [record.id, tracked.states.get(record.id) ?? 'pending'])),
        }),
        scope: {
          write: null,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: null,
        },
        measured: { snapshot: baseline, scope: measured },
      });

      if (this.ignoring(run)) return null;
      if (result.ended !== 'submitted' || result.value === undefined) {
        await this.fail(
          run,
          result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
          `The fork of unresolved request ${id} ended without a result (${result.ended})`,
          [runLayout.outcome(result.id)],
        );
        return null;
      }

      const value = result.value;
      if (value.kind === 'partial') {
        const retry = run.log.all('fork-returned-partial').filter(event => event.data.request === id).length + 1;
        await this.write(run, { type: 'fork-returned-partial', data: { request: id, invocation: result.id, retry } });
        if (this.ignoring(run)) return null;
        partial = { attempt, findings: [...value.findings], gaps: [...value.gaps] };
        revalidate = undefined;
        if (retry > bound) {
          await unresolvable(`the global architect could not answer ${id} within ${bound} retr${bound === 1 ? 'y' : 'ies'}: ${[...value.findings, ...value.gaps].join('; ') || 'it named nothing'}`, [runLayout.submission(result.id)]);
          return null;
        }
        continue;
      }
      if (value.kind === 'nothing-possible') {
        await unresolvable(`the global architect found that no deviation leaves anything of the plan worth doing: ${value.reason}`, [runLayout.submission(result.id)]);
        return null;
      }
      if (value.kind === 'deviation') {
        return this.recordDeviation(run, item, id, result.id, value.deviation, { path: planFile, text: plan }, catalog);
      }
      if (value.kind === 'environment') {
        return this.reportEnvironment(run, item, request, result.id, value);
      }

      // A placement fix: the evidence must still be what the fork decided on.
      const now = await this.viewIdentityOf(await this.refreshIndex(run));
      if (!sameView(view, now)) {
        const partials = run.log.all('fork-returned-partial').filter(event => event.data.request === id).length;
        revalidate = { was: identityOf(view), now: identityOf(now) };
        partial = undefined;
        if (attempt - partials > bound) {
          await unresolvable(`the architect view changed under every investigation of ${id}; it was ${revalidate.was} and is ${revalidate.now}`, []);
          return null;
        }
        continue;
      }
      const decision = await this.acceptForkDecision(run, agent, item, id, result.id, value, view, current);
      return decision === null ? null : { kind: 'decided', decision };
    }
  }

  /**
   * Records the plan deviation a fork decided, with its CheckFinding, as one
   * line: the requirements it departs from are quoted from the captured
   * plan, which stays as written. The pending scenarios it rewords are
   * rendered and committed. Past the run's limit, the run waits for the
   * person to accept or reject it; a rejection there ends the run.
   */
  private async recordDeviation(
    run: Run,
    item: WorkItem,
    request: string,
    invocation: string,
    body: DeviationBody,
    plan: { readonly path: string; readonly text: string },
    catalog: ElementCatalog,
  ): Promise<UnresolvedResolution | null> {
    const recorded = run.log.count('plan-deviation-recorded');
    const held = recorded >= this.deviationLimit(run);
    const id = planDeviationId(recorded + 1);
    const current = committedRecords(run.log.ledger.replay());
    const workItems = [...new Set([item.id, ...body.workItems])];
    const modules = [...new Set(workItems.flatMap(workItem => {
      const module = current.workItems.find(entry => entry.id === workItem)?.module;
      return module === undefined ? [] : [module];
    }))];
    const tracked = trackedScenarios(run.log.ledger.replay());
    const scenarios = body.scenarios.map(entry => {
      const record = tracked.records.find(candidate => candidate.id === entry.scenario);
      if (record === undefined) throw new Error(`${entry.scenario} is no tracked scenario`);
      return { scenario: entry.scenario, file: record.file, before: [...record.source], after: [...entry.source] };
    });
    let deviation: PlanDeviation | undefined;
    const committed = await commitCheckFindingChange(run, ({ log, state }) => {
      if (log.all('plan-deviation-recorded').some(event => event.data.request === request)) return { stale: `${request} is already answered with a deviation` };
      const record = planDeviationSchema.parse({
        schema: 'ramify-agent.plan-deviation/1',
        id,
        request,
        workItem: item.id,
        invocation,
        plan: { path: plan.path, revision: `sha256:${sha256(plan.text)}` },
        amends: body.amends.map(element => {
          const found = catalog.elements.find(candidate => candidate.id === element)!;
          return { id: element, path: catalog.documents.find(document => document.id === found.document)!.path, text: found.text };
        }),
        instead: body.instead,
        why: body.why,
        rejected: body.rejected.map(entry => ({ ...entry })),
        loss: body.loss,
        workItems,
        modules,
        scenarios,
        checkFinding: nextCheckFinding(state),
        held,
      } satisfies PlanDeviation);
      deviation = record;
      return {
        commands: deviationCommands(state, record),
        compose: decided => ({
          event: {
            type: 'plan-deviation-recorded',
            data: { request, deviation: id, workItem: item.id, invocation, checkFinding: record.checkFinding, held, checkFindings: [...decided.events] },
          },
          records: [{ path: deviationLayout.deviation(id), id, revision: 1, body: record }],
        }),
      };
    }, this.now());
    if (committed.kind === 'refused' && committed.refusal.reason === 'run-ended') return null;
    if (committed.kind !== 'committed' || deviation === undefined) {
      await this.fail(run, 'internal', `Plan deviation ${id} of ${request} could not be recorded: ${committed.kind === 'refused' ? committed.refusal.message : 'it was already recorded'}`);
      return null;
    }
    run.notify();
    if (scenarios.length > 0 && !await this.rewordScenarios(run, deviation)) return null;
    if (held && !await this.awaitDeviationDecision(run, deviation)) return null;
    return { kind: 'deviation', deviation };
  }

  /**
   * Records the environment problem a fork reported, with its CheckFinding,
   * as one line, and holds the work item until the operator answers it:
   * nothing is placed, no deviation is recorded and the plan file is
   * untouched. Their resumption returns the work item to its local
   * architect with the diagnosis; their answer `end` ends the run.
   */
  private async reportEnvironment(
    run: Run,
    item: WorkItem,
    request: UnresolvedRequest,
    invocation: string,
    body: EnvironmentBody,
  ): Promise<UnresolvedResolution | null> {
    const id = environmentProblemId(run.log.count('environment-reported') + 1);
    let problem: EnvironmentProblem | undefined;
    const committed = await commitCheckFindingChange(run, ({ log, state }) => {
      if (log.all('environment-reported').some(event => event.data.request === request.id)) return { stale: `${request.id} is already answered with an environment problem` };
      const record = environmentProblemSchema.parse({
        schema: 'ramify-agent.environment-problem/1',
        id,
        request: request.id,
        workItem: item.id,
        invocation,
        diagnosis: body.diagnosis,
        suggestion: body.suggestion,
        checkFinding: nextCheckFinding(state),
      } satisfies EnvironmentProblem);
      problem = record;
      return {
        commands: environmentCommands(state, record, request, item.module),
        compose: decided => ({
          event: {
            type: 'environment-reported',
            data: { request: request.id, problem: id, workItem: item.id, invocation, checkFinding: record.checkFinding, checkFindings: [...decided.events] },
          },
          records: [{ path: deviationLayout.environment(id), id, revision: 1, body: record }],
        }),
      };
    }, this.now());
    if (committed.kind === 'refused' && committed.refusal.reason === 'run-ended') return null;
    if (committed.kind !== 'committed' || problem === undefined) {
      await this.fail(run, 'internal', `Environment problem ${id} of ${request.id} could not be recorded: ${committed.kind === 'refused' ? committed.refusal.message : 'it was already recorded'}`);
      return null;
    }
    run.notify();
    const note = await this.awaitEnvironmentAnswer(run, problem);
    return note === null ? null : { kind: 'environment', problem, note };
  }

  /**
   * Waits for the operator's answer to an environment problem: the run goes
   * no further meanwhile, with no time limit, and the run's decision
   * requests say it waits. Their resumption answers with their note, or the
   * empty string for none; their answer `end` ends the run with the
   * diagnosis and their note. A stop or the service closing ends the wait.
   */
  private async awaitEnvironmentAnswer(run: Run, problem: EnvironmentProblem): Promise<string | null> {
    for (;;) {
      if (this.ignoring(run)) return null;
      // Registered before the state is read, so an answer in between still wakes it.
      const changed = run.changed();
      const entry = checkFindingStateOf(run.log.ledger).findings.get(problem.checkFinding);
      if (entry === undefined) {
        await this.fail(run, 'internal', `Environment problem ${problem.id} names ${problem.checkFinding}, which is no CheckFinding`);
        return null;
      }
      if (entry.pendingUserDecision === null) {
        const settled = entry.decisions.find(decision => decision.id === entry.settledBy);
        if (entry.reason === 'waived') return settled === undefined || settled.actor.kind !== 'user' ? '' : settled.rationale;
        const answer = [...entry.decisions].reverse().find(decision => decision.decision.action === 'answer-user-decision');
        const option = answer?.decision.action === 'answer-user-decision' ? answer.decision.option : null;
        await this.fail(run, 'unresolvable-requirement',
          `The operator ended the run on environment problem ${problem.id} of ${problem.workItem}${option === environmentOptions.end ? '' : ` (answer ${option ?? 'none'})`}: ${answer?.rationale ?? 'no answer was recorded'}. The global architect's diagnosis: ${problem.diagnosis}`,
          [deviationLayout.environment(problem.id), deviationLayout.request(problem.request)]);
        return null;
      }
      await changed;
    }
  }

  /**
   * Waits for the person's decision on a deviation the run recorded past its
   * limit: the run goes no further meanwhile, with no time limit, and the
   * run's decision requests say it waits. Their acceptance lets the work item
   * go on; their rejection ends the run with their answer. A stop or the
   * service closing ends the wait.
   */
  private async awaitDeviationDecision(run: Run, deviation: PlanDeviation): Promise<boolean> {
    for (;;) {
      if (this.ignoring(run)) return false;
      // Registered before the state is read, so an answer in between still wakes it.
      const changed = run.changed();
      const entry = checkFindingStateOf(run.log.ledger).findings.get(deviation.checkFinding);
      if (entry === undefined) {
        await this.fail(run, 'internal', `Plan deviation ${deviation.id} names ${deviation.checkFinding}, which is no CheckFinding`);
        return false;
      }
      if (entry.pendingUserDecision === null) {
        if (entry.reason === 'waived') return true;
        const answer = [...entry.decisions].reverse().find(decision => decision.decision.action === 'answer-user-decision');
        await this.fail(run, 'unresolvable-requirement',
          `The person rejected plan deviation ${deviation.id}, recorded past the run's limit of ${this.deviationLimit(run)}: ${answer?.rationale ?? 'no answer was recorded'}`,
          [deviationLayout.deviation(deviation.id)]);
        return false;
      }
      await changed;
    }
  }

  /** Every plan deviation the run recorded, in order. */
  private deviationsOf(run: Run): PlanDeviation[] {
    return run.log.all('plan-deviation-recorded').flatMap(event => {
      const parsed = planDeviationSchema.safeParse(this.committedBody(run, deviationLayout.deviation(event.data.deviation)));
      return parsed.success ? [parsed.data] : [];
    });
  }

  /**
   * Every environment problem the run recorded, in order, with the
   * operator's note where they resumed the run for it, else null.
   */
  private environmentProblemsOf(run: Run): Array<{ problem: EnvironmentProblem; resumed: string | null }> {
    const findings = checkFindingStateOf(run.log.ledger).findings;
    return run.log.all('environment-reported').flatMap(event => {
      const parsed = environmentProblemSchema.safeParse(this.committedBody(run, deviationLayout.environment(event.data.problem)));
      if (!parsed.success) return [];
      const entry = findings.get(parsed.data.checkFinding);
      const settled = entry?.reason === 'waived' ? entry.decisions.find(decision => decision.id === entry.settledBy) : undefined;
      return [{ problem: parsed.data, resumed: settled === undefined ? null : settled.rationale }];
    });
  }

  /** How many deviations the run records before the next one waits for the person. */
  private deviationLimit(run: Run): number {
    return run.record.policy.limits.maxPlanDeviations ?? defaultMaxPlanDeviations;
  }

  /**
   * Renders the pending scenarios a deviation rewords into their feature
   * files and commits them, as the ledger's external effect: the intent
   * `scenarios-rewording` commits each revised scenario record, the effect
   * renders the tracked files from the ledger and commits them, and
   * `scenarios-reworded` is its completion. A recovery renders the same and
   * finds the commit by its trailers.
   */
  private async rewordScenarios(run: Run, deviation: PlanDeviation): Promise<boolean> {
    run.writer.requireSettled('The feature files cannot be written');
    const tracked = trackedScenarios(run.log.ledger.replay());
    const records = deviation.scenarios.map(entry => {
      const record = tracked.records.find(candidate => candidate.id === entry.scenario)!;
      return scenarioRecordSchema.parse({
        ...record,
        name: scenarioNameOf(entry.after) ?? record.name,
        source: [...entry.after],
        hash: scenarioSourceHash(entry.after),
      } satisfies ScenarioRecord);
    });
    await this.performRewording(run, {
      deviation: deviation.id,
      rewording: run.log.count('scenarios-rewording') + 1,
      scenarios: records.map(record => record.id),
      files: [...new Set(records.map(record => record.file))].sort(),
    }, records.map(record => ({ path: runLayout.scenario(record.id), id: record.id, revision: 2, body: record })), false);
    return !this.ignoring(run);
  }

  private async performRewording(
    run: Run,
    data: RunEventOf<'scenarios-rewording'>['data'],
    records: readonly CommitRecord[],
    recovering: boolean,
  ): Promise<{ commit: string }> {
    return run.mutex.run(() => run.log.ledger.effect<{ commit: string }>({
      key: `scenarios-reword:${data.rewording}`,
      intent: { event: run.log.next({ type: 'scenarios-rewording', data }), records: [...records] },
      perform: async () => {
        const tracked = trackedScenarios(run.log.ledger.replay());
        const expected = expectedFeatureFiles(tracked, { planId: run.record.planId, runId: run.record.jobId });
        const message = rewordingMessage({ runId: run.record.jobId, rewording: data.rewording, deviation: data.deviation, scenarios: data.scenarios, files: data.files });
        await assertScratchSafe(this.projectRoot, await declaredModuleDirectories(this.projectRoot), this.git);
        const commit = await commitForScenarios(this.projectRoot, run.record.jobId, rewordedTrailerValue(data.rewording), message, recovering, this.git, commit => this.verifyProducerCommit(expected, commit), () => this.renderProducerFeatures(run, expected));
        return { commit: commit ?? await this.git.currentHead(this.projectRoot) };
      },
      complete: result => ({ event: run.log.next({ type: 'scenarios-reworded', data: { deviation: data.deviation, commit: result.commit } }), records: [] }),
    }));
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
        const answer = await (await this.operations(agent)).append(context.ref, decision.id, briefText(decision));
        // The append reached the parent and its completion is not in the log.
        await this.afterWrite('brief-appending', run.record.jobId);
        if (answer.outcome === 'conflict') throw new Error(`The architect context did not take the brief: ${answer.reason}`);
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
          ? { type: 'brief-not-appended', data: { decision: decision.id, generation: result.generation, reason: result.reason } }
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
    return requiredArtifacts(committed);
  }

  /**
   * Commits one `IterationAssignment`. The architect supplied the goal, the
   * approach and the scope's base; the harness captures the real paths, the
   * bootstrap authority the registry gives, the gate, its test-selection
   * policy and the guarded hashes, and none of those is in any submission.
   */
  /** Captures the immutable implementation contract for either coordinator.
   * Only its design basis, sequence owner and selected requirements differ. */
  private async buildIterationAssignment(run: Run, input: {
    readonly id: string;
    readonly item: WorkItem;
    readonly basis: RecordRef;
    readonly coordination: NonNullable<IterationAssignment['coordination']>;
    readonly body: AssignmentBody;
    readonly scope: WriteScope;
    readonly source?: PackageCitation | undefined;
    readonly evidenceObligations: IterationAssignment['evidenceObligations'];
    readonly authorizations: IterationAssignment['authorizations'];
    readonly guardedPaths: readonly string[];
    readonly externalCapabilities?: IterationAssignment['externalCapabilities'] | undefined;
    readonly revisesContract?: RecordRef | undefined;
  }): Promise<IterationAssignment> {
    return iterationAssignmentOf(this.projectRoot, input,
      { scenarioFiles: await this.guardedScenarioFiles(run), preparationPaths: await this.auditPreparationPaths(run) });
  }

  /** The guarded paths that exist now and that an authorization can open, for an architect's briefing. */
  private async presentGuardedPaths(run: Run, records: ReturnType<typeof committedRecords>): Promise<string[]> {
    const scenarioFiles = await this.guardedScenarioFiles(run);
    const harnessOnly = new Set([projectConfigurationFile, ...(scenarioFiles.expected ?? []).map(file => file.path)]);
    return (await captureGuardedFiles(this.projectRoot, this.requiredArtifacts(records).map(artifact => artifact.path),
      scenarioFiles, await this.auditPreparationPaths(run)))
      .filter(file => file.hash !== null && !harnessOnly.has(file.path)).map(file => file.path);
  }

  /**
   * What an assignment based on each owner gives its engineer, for an
   * architect's briefing, from the provider's topology. Where the provider
   * gives no answer the architect view names the owner and its children, and
   * the briefing says the nested-project roots are unavailable.
   */
  private async defaultWriteScopes(index: ArchitectIndex | null, modules: readonly string[], guarded: readonly string[]): Promise<DefaultWriteScope[]> {
    return defaultWriteScopesOf(this.options.ramify, this.projectRoot, index, modules, guarded);
  }

  /**
   * The creation authority an ordinary base is captured with: the accepted
   * registry entry that proposes an owner the view does not have yet. A
   * broad base names existing modules only: nothing is bootstrapped into
   * being by the exception that isolates a break.
   */
  private bootstrapOf(index: ArchitectIndex | null, registry: ReadonlyMap<string, RegistryEntry>, body: AssignmentBody): WriteScope['bootstrap'] {
    return assignmentBootstrap(index, registry, body);
  }

  /**
   * The scope an accepted assignment applies: the one captured while its
   * submission was judged, where the revision and creation authority are the
   * same, or a fresh capture. A fresh capture the provider refuses is an
   * invalid submission that leaves nothing committed, never an internal
   * failure.
   */
  private async preparedScope(
    run: Run, body: AssignmentBody, revision: number, bootstrap: WriteScope['bootstrap'],
    capture: () => Promise<WriteScope>, subject: string,
  ): Promise<WriteScope | null> {
    const prepared = this.preparedScopes.get(body);
    this.preparedScopes.delete(body);
    if (prepared !== undefined && prepared.revision === revision && JSON.stringify(prepared.bootstrap) === JSON.stringify(bootstrap)) return prepared;
    try {
      return await capture();
    } catch (error) {
      await this.fail(run, 'invalid-submission', `${subject} names a write scope that cannot be captured: ${message(error)}`);
      return null;
    }
  }

  private async assignIteration(
    run: Run,
    item: WorkItem,
    invocation: string,
    submission: Extract<LocalArchitectSubmission, { kind: 'assign' }>,
    index: ArchitectIndex | null,
    registry: ReadonlyMap<string, RegistryEntry>,
    architectRef: ArchitectRef | null,
  ): Promise<IterationAssignment | null> {
    if (run.restoring) {
      const original = [...run.log.all('iteration-assigned'), ...run.log.all('contract-requested')].find(event => event.data.workItem === item.id && event.data.invocation === invocation);
      if (original) {
        const assignment = committedRecords(run.log.ledger.replay()).assignments.get(original.data.iteration);
        if (!assignment) throw new Error('Original licensed assignment is unavailable');
        return assignment;
      }
    }
    const committed = committedRecords(run.log.ledger.replay());
    let outlines = committed.outlines.get(item.id) ?? [];
    const delivery = run.log.all('hypotheses-delivered').filter(event => event.data.workItem === item.id).at(-1);

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
    const bootstrap = this.bootstrapOf(index, localRegistry, body);

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
        // The agreement in force names where its fake is held; the revision
        // rewrites the fake where it is.
        injectionSites: [...committed.requirements.values()]
          .filter(requirement => contractOfObligation(requirement.obligation) === revised.id)
          .flatMap(requirement => requirement.evidence.fakeInjections),
        rationale: `The revision of ${revised.id}: the contract, its conformance suite, its fake, the files that hold it and this consumer's integration. ${body.scope.rationale}`,
      })
      : await this.preparedScope(run, body, number, bootstrap, () => resolveWriteScope({ ramify: this.options.ramify,
        projectRoot: this.projectRoot,
        index,
        view: run.record.manifest.architectView,
        revision: number,
        base: body.scope.base,
        extra: body.scope.extra,
        read: body.scope.read,
        bootstrap,
        rationale: body.scope.rationale,
      }), `The assignment of ${item.id}`);
    if (scope === null) return null;

    // The outline revision is committed only once the scope it plans is
    // captured, so a scope the provider refuses leaves no revision behind.
    if (submission.outline !== undefined) {
      const revised = await this.handling.reviseOutline(run, {
        item, invocation, outline: submission.outline, hypothesesSeen: delivery?.data.refs ?? [],
      });
      if (revised === null) return null;
      if (revised.written) outlines = [...outlines, revised.outline];
    }

    const outline = outlines.at(-1);
    if (outline === undefined) {
      await this.fail(run, 'internal', `The assignment of ${item.id} has no outline to work from`);
      return null;
    }

    // A guarded path this architect authorized is one the engineer may write
    // through the guarded tools: the authorization is the permission, and
    // the assignment records it beside the scope it widens by that one file.
    await authorizedScope(this.projectRoot, scope, revised === undefined ? submission.assignment.authorizations ?? [] : []);

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
    // The assignment package is cited before `iteration-assigned`: the
    // elements the architect names, with every plan deviation recorded
    // now, so no later reader can fail to render it.
    let source: PackageCitation | undefined;
    try {
      const selected = await this.currentSelection(run, item.id);
      if (selected !== null) {
        const outside = body.citedElements.filter(element => !selected.selection.package.elements.includes(element));
        if (outside.length > 0) throw new EvidenceUnavailableError(`It cites ${outside.join(', ')}, which the work-item package does not hold`);
        source = await this.citeCurrentDeviations(run, body.citedElements);
      }
    } catch (error) {
      await this.fail(run, 'inputs-changed', `The assignment package of ${id} cannot be cited: ${message(error)}`);
      return null;
    }
    const assignment = await this.buildIterationAssignment(run, {
      id, item, basis: outlineRef, coordination: { kind: 'work-item', id: item.id },
      body: revised === undefined ? body : { ...body, obligations: [] }, scope, source,
      evidenceObligations, authorizations, guardedPaths: artifacts.map(artifact => artifact.path),
      ...(revised === undefined ? {} : {
        externalCapabilities: [{ capability: revised.capability.id, owner: revised.provider, role: 'request' }],
        revisesContract: refOf(revised.id, revised.revision, revised),
      }),
    });

    if (revised === undefined) {
      return this.handling.recordAssignment(run, { item, number, invocation, assignment, decisions: localDecisions, localRecords, architectRef });
    }
    await this.write(run, {
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
    await this.afterWrite('contract-requested', run.record.jobId);
    return this.ignoring(run) ? null : assignment;
  }

  /**
   * The test areas of the modules whose tests an assignment owns, for its
   * briefing: each exact owner's, and every module's beneath a subtree. It
   * selects nothing for a gate, whose audit selects its own checks.
   */
  private async ownedTestAreas(run: Run, tests: TestSelectionPolicy): Promise<TestArea[]> {
    return ownedTestAreasOf(this.projectRoot, run.index, tests);
  }

  /**
   * The equipment of one implementation session, over this run: its paths
   * hold the shell output and the hook logs, and its policy supplies the
   * commands and the bounds.
   */
  private implementationTools(run: Run, options: {
    readonly workingDirectory?: string;
    readonly scopeRevision: number;
    readonly guarded: GuardedScope;
    readonly commandTimeoutMs: number;
    readonly submissions?: { readonly legalOutcomes: readonly string[]; readonly completionOutcome: string | null };
    readonly focusedCommands?: Parameters<typeof engineerEquipment>[0]['focusedCommands'];
  }): EngineerEquipment {
    return engineerEquipment({
      commandExecution: this.options.commandExecution,
      registerProcessGroup: async (invocation, pid, identity) => {
        const committed = await this.write(run, { type: 'writer-process-registered', data: { invocation, pid, identity } });
        if (committed === 'ended') throw new Error(`Run ${run.record.jobId} ended before process group ${pid} was registered`);
        run.writer.register(invocation, pid);
        await this.afterWrite('writer-process-registered', run.record.jobId);
      },
      projectRoot: this.projectRoot,
      ramify: this.options.ramify,
      commands: run.record.policy.commands,
      bounds: run.record.policy.limits,
      refresh: () => this.refreshIndex(run),
      index: () => run.index,
      submissions: { legalOutcomes: this.workflow === null ? ['completion-proposed', 'partial', 'unsuitable', 'contract-needed'] : ['completion-proposed', 'partial', 'unsuitable', 'capability-needed'], completionOutcome: 'completion-proposed' },
      ...options,
      outputPath: (kind, invocation, number) => run.path(kind === 'shell'
        ? runLayout.shellOutput(invocation, number)
        : runLayout.hookOutput(invocation, number)),
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
    return evidenceFor(run.log, item, kind, records);
  }

  /**
   * One iteration: the engineer invocations that work it, the gate that owns
   * the verdict, the repair rounds the policy allows, and the result that
   * closes it. The counters are keyed by the iteration, not by the session,
   * so a fresh session after a context-budget return resets nothing.
   */
  /** The first capability transaction uses the same run invocation, session
   * and ledger paths as ordinary work. The parent architect and requesting
   * engineer are both kept at their exact points until a later handback. */
  private async replayAcceptedCapabilityQualification(run: Run, request: CapabilityRequest,
    role: 'local-architect' | 'capability-architect'): Promise<InvocationResult<QualificationAction> | null | undefined> {
    const started = [...run.log.all('invocation-started')].reverse().find(event =>
      event.data.role === role && event.data.work.request === request.id);
    if (started === undefined) return undefined;
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === started.data.invocation);
    if (ended?.data.ended !== 'submitted' || ended.data.submission === null) return undefined;
    const outcome = this.committedBody(run, runLayout.outcome(started.data.invocation)) as InvocationOutcome | null;
    const bytes = await readIfExists(run.path(runLayout.submission(started.data.invocation)));
    if (bytes === undefined || sha256(bytes) !== ended.data.submission ||
      outcome?.submission?.hash !== ended.data.submission || outcome.disposition !== 'applied' ||
      !outcome.settled.confirmed || !ended.data.kept || !outcome.session?.ref) {
      await this.fail(run, 'recovery-exhausted', `Qualification of ${request.id} has an unauthenticated accepted action`);
      return null;
    }
    const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const { schema: _schema, ...body } = raw;
    const parsed = qualificationActionSchema.safeParse(body);
    if (raw.schema !== 'ramify-agent.capability-qualification/1' || !parsed.success ||
      parsed.data.request !== request.id || parsed.data.invocation !== request.invocation) {
      await this.fail(run, 'recovery-exhausted', `Qualification of ${request.id} has an invalid accepted action`);
      return null;
    }
    return { id: started.data.invocation, ended: 'submitted', value: parsed.data,
      ref: outcome.session.ref, outcomeKind: 'submitted', session: started.data.session, kept: true };
  }

  private async coordinateCapabilityNeed(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    assignment: IterationAssignment,
    suspended: SuspendedCapabilityOutcome,
    contextPackage: WorkPackage | undefined,
    parent: { readonly session: SessionId | undefined; readonly point: string | undefined; readonly workingDirectory: string },
    existingRequest?: CapabilityRequest,
  ): Promise<{ readonly kind: 'satisfied'; readonly guidance: string; readonly parent: { readonly session: SessionId; readonly point: string } } | { readonly kind: 'delegated' } | null> {
    if (this.workflow === null || run.record.policy.version !== capabilityRunPolicyVersion) {
      await this.fail(run, 'internal', 'A capability request reached a run without its captured workflow');
      return null;
    }
    run.writer.requireSettled('A capability request cannot suspend an unsettled writer');
    const requestId = existingRequest?.id ?? capabilityRequestId(committedRecords(run.log.ledger.replay()).capabilityRequests.size + 1);
    const source = existingRequest?.source ?? await captureProvisionalSource({ git: this.git, sourceGit: this.options.provisionalSourceGit,
      projectRoot: this.projectRoot, runDirectory: run.directory, request: requestId,
      acceptedBase: this.accepted(run), writerSettledBy: suspended.invocation,
      changedPaths: await this.git.changedPaths(this.projectRoot, this.accepted(run)),
    });
    if (existingRequest === undefined) {
      await this.afterWrite('capability-source-captured', run.record.jobId);
      if (this.ignoring(run)) return null;
    }
    const packageRef = contextPackage === undefined
      ? { id: runLayout.capturedPlan, revision: 1, hash: sha256(await readFile(run.path(runLayout.capturedPlan))) }
      : { id: contextPackage.selection, revision: 1, hash: contextPackage.citation.hash };
    const request: CapabilityRequest = existingRequest ?? {
      schema: 'ramify-agent.capability-request/1', id: requestId,
      parent: { kind: 'work-item', id: item.id }, assignment: assignment.id,
      invocation: suspended.invocation, consumer: item.module,
      requirementPackage: packageRef, continuation: { session: suspended.session, point: suspended.point },
      source, summary: suspended.summary, original: identifyCapabilityNeed(requestId, suspended.need),
    };
    if (existingRequest === undefined) await run.mutex.run(() => commitCapabilityTransition(run.log, {
      type: 'capability-requested', data: { request: request.id, parent: item.id,
        assignment: assignment.id, invocation: suspended.invocation },
    }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]));

    const local = packages.get('local-architect');
    if (local === undefined) {
      await this.fail(run, 'internal', 'The local architect package is absent during qualification');
      return null;
    }
    const registry = committedRecords(run.log.ledger.replay()).registry;
    let point = parent.point;
    let parentSession = parent.session;
    let returned = '';
    const recovered = existingRequest === undefined ? undefined : await this.replayAcceptedCapabilityQualification(run, request, 'local-architect');
    if (recovered === null) return null;
    let qualification: InvocationResult<QualificationAction> | undefined = recovered;
    const priorTurns = run.log.all('invocation-started').filter(event => event.data.role === 'local-architect' &&
      event.data.work.request === request.id).length;
    for (let count = priorTurns - (recovered === undefined ? 0 : 1);
      count < run.record.policy.limits.maxIterationsPerWorkItem; count += 1) {
      qualification ??= await this.runInvocation<QualificationAction>(run, agent, {
      role: 'local-architect', task: { kind: 'capability-qualification', goal: request.original.need, requirements: [JSON.stringify(request), (contextPackage?.text ?? (await this.currentSelection(run, item.id))?.packageText ?? this.planPackage(run, await this.frozenCatalog(run), [...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs]))], modules: [item.module] }, work: { workItem: item.id, request: request.id },
      attempt: run.log.all('invocation-started').filter(event => event.data.work.workItem === item.id && event.data.work.request === request.id).length + 1,
      loaded: local, systemPrompt: renderLocalArchitectPrompt(local, this.projectRoot, parent.workingDirectory),
      prompt: [
        `# Qualify capability request ${request.id}`,
        `The engineer of ${assignment.id} retained its source and session. Its invocation is ${request.invocation}.`,
        `Original request: ${JSON.stringify(request.original, null, 2)}`,
        `Provisional source: ${JSON.stringify(request.source, null, 2)}`,
        ...(point === undefined ? [`Current assignment: ${JSON.stringify(assignment)}`] : []),
        `Registry clues: ${JSON.stringify(registry.map(entry => ({ capability: entry.capability, owner: entry.owner })))}`,
        'Read the actual exposed API and use sites. A matching name is not proof of sufficient behavior, and a missing name is not proof of absence.',
        'Submit satisfy-with-existing with concrete API evidence, delegate-capability with placement reasoning, request-placement, or unresolved.',
        `Use request ${request.id} and invocation ${request.invocation} in the action.`,
        ...(returned === '' ? [] : [`# Boundary decision\n\n${returned}`]),
      ].join('\n\n'),
      workingDirectory: parent.workingDirectory,
      start: point === undefined ? { mode: 'fresh' } : { mode: 'continue', ref: point },
      // Qualification continues the local architect's latest settled point.
      // Without one, the fresh start is a degradation the record states.
      ...(point === undefined
        ? { ...(parentSession === undefined ? {} : { replaces: { session: parentSession, reason: 'reconstructed' as const } }),
          degraded: { requested: 'continued' as const, reason: 'The local architect session point is unavailable; the request, its provisional source and the current work-item package were supplied to a fresh session.' } }
        : parentSession === undefined ? {} : { session: parentSession, continuing: 'capability-qualification' as const }),
      toolName: 'submit_capability_qualification',
      description: 'Qualify this exact request using current behavior and placement evidence.',
      inputSchema: z.toJSONSchema(qualificationActionSchema) as JsonSchema,
      submissionSchema: 'ramify-agent.capability-qualification/1',
      validate: input => {
        const parsed = validateAgainst(qualificationActionSchema, input);
        if (!parsed.ok) return parsed;
        if (parsed.value.request !== request.id || parsed.value.invocation !== request.invocation) {
          return { ok: false, errors: [{ path: 'request', message: 'The request or originating invocation is stale', expected: `${request.id} and ${request.invocation}` }] };
        }
        return parsed;
      },
      scope: { write: null, measurement: null, size: null },
      keep: (ended, value) => ended === 'submitted' && value !== undefined ? kept : finished('not-kept'),
      });
      if (qualification.ended !== 'submitted' || qualification.value === undefined) {
        await this.fail(run, 'invalid-submission', `The local architect could not qualify ${request.id}`);
        return null;
      }
      const pending = qualification.value;
      if (pending.kind === 'request-placement') {
        const resolution = await this.requestPlacement(run, agent, packages, baseline, item, {
          forCapability: request.id, question: pending.problem, requiredBehavior: request.original.need,
          findings: pending.evidence.map(text => ({ text, citations: [] })),
          candidates: request.original.suggestedProvider === undefined ? [] : [{ owner: request.original.suggestedProvider.module,
            note: request.original.suggestedProvider.reason }],
          unresolved: [pending.problem], hypotheses: [], localDecisions: [],
        }, run.log.all('placement-requested').find(event => event.data.capability === request.id)?.data.request);
        if (resolution === null) return null;
        returned = resolution.kind === 'decided'
          ? `Placement decision ${resolution.decision.id}: ${JSON.stringify(resolution.decision)}`
          : `The global architect could not settle placement ${resolution.request}: ${[...resolution.findings, ...resolution.gaps].join('; ')}`;
        point = qualification.ref || undefined;
        parentSession = qualification.kept ? qualification.session : undefined;
        qualification = undefined;
        continue;
      }
      if (pending.kind === 'unresolved') {
        const resolution = await this.resolveUnresolved(run, agent, packages, baseline, item, {
          invocation: qualification.id, conflict: pending.problem, evidence: pending.evidence,
        }, run.log.all('unresolved-requested').find(event => event.data.invocation === qualification!.id)?.data.request);
        if (resolution === null) return null;
        returned = `The responsible global architect answered the unresolved request: ${JSON.stringify(resolution)}`;
        point = qualification.ref || undefined;
        parentSession = qualification.kept ? qualification.session : undefined;
        qualification = undefined;
        continue;
      }
      break;
    }
    if (qualification?.value === undefined ||
      (qualification.value.kind !== 'satisfy-with-existing' && qualification.value.kind !== 'delegate-capability')) {
      await this.fail(run, 'limit-exceeded', `Qualification of ${request.id} did not settle within the captured work-item bound`);
      return null;
    }
    const decision = qualification.value;
    if (decision.kind === 'satisfy-with-existing') {
      await this.write(run, { type: 'capability-qualified', data: {
        request: request.id, invocation: qualification.id, outcome: 'satisfied', evidence: decision.evidence,
      } });
      return { kind: 'satisfied', parent: { session: qualification.session, point: qualification.ref }, guidance: [
        `Request ${request.id} was satisfied by existing behavior. Verify it from your original calling code and examples.`,
        `API: ${decision.api.owner}, ${decision.api.path}, ${decision.api.symbol}`,
        `Guidance: ${decision.guidance}`, `Evidence: ${decision.evidence.join('; ')}`,
      ].join('\n') };
    }
    const records = committedRecords(run.log.ledger.replay());
    const prior = request.original.revises === undefined ? undefined : records.capabilityHandbacks.get(request.original.revises.task);
    if (request.original.revises !== undefined && (prior === undefined ||
      records.capabilityTasks.get(request.original.revises.task)?.parent.id !== item.id)) {
      await this.fail(run, 'inputs-changed', `Revision request ${request.id} names no accepted handback of ${item.id}: ${request.original.revises.task}`);
      return null;
    }
    const taskId = capabilityTaskId(records.capabilityTasks.size + 1);
    const providerItems = records.workItems.filter(entry => entry.module === decision.provider);
    const task: CapabilityTask = {
      schema: 'ramify-agent.capability-task/1', id: taskId, request: request.id,
      parent: request.parent, originatingAssignment: assignment.id, consumer: item.module,
      provider: decision.provider, placementReason: decision.placementReason,
      authority: [
        { owner: item.module, reason: 'Requesting consumer integration and task-local architecture' },
        ...(decision.provider === item.module ? [] : [{ owner: decision.provider, reason: decision.placementReason }]),
      ],
      relatedEntries: providerItems.map(entry => ({ entry: entry.id, reason: 'Provider entry remains separate from this task' })),
      deferredWorkItems: providerItems.map(entry => entry.id), source,
      ...(prior === undefined || request.original.revises === undefined ? {} : { revises: {
        handback: refOf(prior.task, 1, prior), sourceRevision: prior.sourceRevision, reason: request.original.revises.reason,
      } }),
      limits: captureCapabilityLimits(run.record.policy),
    };
    let plan: CapabilityPlan = {
      schema: 'ramify-agent.capability-plan/1', task: task.id, revision: 1, basedOn: 0,
      updatedBy: qualification.id, revisionReason: 'Initial qualified request',
      need: request.original.need, proposedInterface: 'Undecided; the capability architect examines actual source and use',
      useCases: request.original.examples.map(example => ({ id: example.id, expectedBehavior: example.title, derivedFrom: [example.id] })),
      compatibility: [...request.original.constraints],
      outline: ['Review existing behavior and affected owners', 'Coordinate provider and consumer work', 'Verify real use and hand back'],
      decisions: [{ decision: `Coordinate in ${decision.provider}`, reason: decision.placementReason, evidence: [...decision.requirementRefs] }],
      openQuestions: [], requirementRefs: [...decision.requirementRefs],
      originalExamples: request.original.examples.map(example => example.id),
    };
    await run.mutex.run(() => commitCapabilityTransition(run.log, {
      type: 'capability-delegated', data: { task: task.id, request: request.id, parent: item.id,
        invocation: qualification.id, planRevision: 1 },
    }, [
      { path: capabilityLayout.task(task.id), id: task.id, revision: 1, body: task },
      { path: capabilityLayout.plan(task.id, 1), id: task.id, revision: 1, body: plan },
    ]));

    // The provider entry's recorded decisions belong in the fresh briefing.
    // It receives the selected source package whole, while its own transcript
    // has none of either local architect's history.
    const providerDecisions = [...records.decisions.values()].filter(entry =>
      entry.owner === decision.provider || providerItems.some(item =>
        item.id === entry.workItem || entry.revises?.affected.some(affected => affected.workItem === item.id)));
    let selected = contextPackage?.text ?? new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    if (providerItems.length > 0 && contextPackage !== undefined) {
      const selector = packages.get('context-selector');
      if (selector === undefined) {
        await this.fail(run, 'internal', 'No context selector is available for the expanded owner set');
        return null;
      }
      const catalog = await this.frozenCatalog(run);
      const expanded = await this.selectElements(run, agent, selector, item, {
        catalog, planDeviations: this.planDeviationsOf(run),
        workItemElements: [...new Set([
          ...item.requirementRefs, ...item.acceptanceRefs, ...item.contextRefs,
          ...providerItems.flatMap(entry => [...entry.requirementRefs, ...entry.acceptanceRefs, ...entry.contextRefs]),
        ])],
      }, {
        packet: [
          `Capability task ${task.id} adds provider ${decision.provider} to the relevant owner set.`,
          `Original request: ${request.original.need}`,
          `Earlier package: ${contextPackage.citation.elements.join(', ') || '(no elements)'}`,
          `Provider decisions: ${JSON.stringify(providerDecisions)}`,
        ].join('\n'), orientationInvocation: qualification.id,
        point: qualification.ref || null, session: qualification.kept ? qualification.session : undefined,
      });
      if (expanded === 'failed' || expanded === undefined) {
        await this.fail(run, 'inputs-changed', `The expanded owner context of ${task.id} could not be selected`);
        return null;
      }
      const delivered = await readRecordedContextSelection(run.directory, expanded, catalog, this.planDeviationsOf(run));
      if (delivered.status === 'unavailable') {
        await this.fail(run, 'inputs-changed', `The expanded owner package of ${task.id} is unavailable: ${delivered.reason}`);
        return null;
      }
      selected = delivered.packageText;
    }
    const coordinated = await this.runCapabilityCoordinator(run, agent, packages, baseline, item, task, request, plan,
      qualification.id, selected, providerItems, providerDecisions);
    // Qualification advanced this exact local action session. Hand its accepted
    // point back explicitly; the earlier context checkpoint remains fork authority.
    return coordinated?.kind === 'satisfied' ? { ...coordinated, parent: { session: qualification.session, point: qualification.ref } } : coordinated;
  }

  /** Drives one delegated task; the same path is used for a nested child. */
  private async runCapabilityCoordinator(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot,
    item: WorkItem, task: CapabilityTask, request: CapabilityRequest, plan: CapabilityPlan,
    originInvocation: string, selected: string, providerItems: readonly WorkItem[], providerDecisions: readonly PlacementDecision[],
    resume?: { readonly basis: string; readonly point: string | undefined; readonly session: SessionId | undefined;
      readonly progress: string; readonly attempt: number; readonly reconstructedFrom?: SessionId;
      readonly replay?: InvocationResult<CapabilityAction> },
  ): Promise<{ readonly kind: 'satisfied'; readonly guidance: string } | { readonly kind: 'delegated' } | null> {
    const records = committedRecords(run.log.ledger.replay());
    const loaded = packages.get('capability-architect');
    if (loaded === undefined) {
      await this.fail(run, 'internal', 'No capability architect package was captured');
      return null;
    }
    const selectedHash = sha256(selected);
    let coordinatorPoint: string | undefined = resume?.point;
    let coordinatorSession: SessionId | undefined = resume?.session;
    let coordinatorBasis = resume?.basis ?? originInvocation;
    let progress = resume?.progress ?? '';
    let pendingAction = resume?.replay;
    let reconstructedFrom = resume?.reconstructedFrom;
    // Consultation children never replace the original suspended consumer source.
    let consumerPoint = request.continuation.point;
    let consumerSession: SessionId | undefined = request.continuation.session;
    for (let attempt = resume?.attempt ?? 1; attempt <= task.limits.maxInvocations; attempt += 1) {
    // The task's architect may register a case of its current plan revision.
    const capabilityActor = (): ObligationActor => ({ kind: 'capability-task', id: task.id, useCases: new Set(plan.useCases.map(useCase => useCase.id)) });
    const currentBasis = () => {
      const state = replayCapabilityState(run.log.events).tasks.get(task.id);
      return state === undefined ? null : { task: task.id, planRevision: state.planRevision,
        coordinatorInvocation: state.coordinatorInvocation, state: state.status,
        openAssignment: state.activeAssignment, openChild: state.activeChild,
        obligations: { actor: capabilityActor(), projection: this.obligationProjection(run) } };
    };
    const validateActionInput = async (input: unknown) => {
      const basis = currentBasis();
      if (basis === null) return { valid: false as const, issues: [{ path: ['task'], message: 'Task is absent', kind: 'state' as const }] };
      const checked = validateCapabilityAction(input, basis);
      if (!checked.valid || checked.value.kind !== 'assign') return checked;
      const body = checked.value.assignment;
      const problems = [...capabilityAuthorizationErrors(body.authorizations, capabilityGuardedPolicy(this.requiredArtifacts(records))), ...assignmentErrors(body, {
        index: run.index, registry: new Map(records.registry.map(entry => [entry.capability, entry])),
        outline: null, capabilityCompatibility: plan.compatibility,
        guardedPaths: capabilityGuardedPolicy(this.requiredArtifacts(records)),
        revising: true, bounds: engineerBoundsOf(run.record.policy.limits),
        obligations: { actor: capabilityActor(), projection: this.obligationProjection(run), registrations: checked.value.registrations },
      })];
      // The scope is captured before the action is accepted, so a scope the
      // provider refuses is answered here with its path, under the turn's bound.
      const scoped = problems.length > 0 ? null : await checkWriteScope({ ramify: this.options.ramify, projectRoot: this.projectRoot,
        index: run.index, view: run.record.manifest.architectView,
        revision: replayCapabilityState(run.log.events).tasks.get(task.id)?.nextAssignmentSequence ?? 1,
        base: body.scope.base, extra: body.scope.extra, read: body.scope.read, bootstrap: [], rationale: body.scope.rationale });
      if (scoped?.scope != null) this.preparedScopes.set(body, scoped.scope);
      const errors = [...problems, ...(scoped?.errors ?? [])];
      return errors.length === 0 ? checked : { valid: false as const, issues: errors.map(problem => ({
        path: problem.path.split('.'), message: problem.message, kind: 'state' as const,
      })) };
    };
    const tools: ToolDefinition[] = [
      // The complete action schema reaches the model once, in the submit_capability_action
      // declaration; this validator takes any object and the harness validates it exactly.
      { name: 'validate_capability_action', description: 'Check an action against the current task without submitting it. The input is a candidate submit_capability_action input, as that declaration\'s schema describes it.',
        inputSchema: { type: 'object', description: 'A candidate submit_capability_action input; that declaration carries the complete schema.', additionalProperties: true } as JsonSchema,
        execute: async input => {
          const checked = await validateActionInput(input);
          return { text: JSON.stringify(checked), isError: !checked.valid };
        } },
      { name: 'update_capability_plan', description: 'Commit a new plan revision from the current one.',
        inputSchema: z.toJSONSchema(capabilityPlanUpdateSchema) as JsonSchema,
        execute: async input => {
          const basis = currentBasis();
          if (basis === null) return { text: 'Task is absent', isError: true };
          const checked = validateCapabilityPlanUpdate(input, basis);
          if (!checked.valid) return { text: JSON.stringify(checked.issues), isError: true };
          try {
            const next = buildCapabilityPlanRevision(plan, checked.value);
            await run.mutex.run(() => commitCapabilityTransition(run.log, {
              type: 'capability-plan-revised', data: { task: task.id, revision: next.revision,
                basedOn: plan.revision, invocation: checked.value.invocation },
            }, [{ path: capabilityLayout.plan(task.id, next.revision), id: task.id,
              revision: next.revision, body: next }]));
            plan = next;
            return { text: JSON.stringify({ task: task.id, revision: next.revision,
              path: capabilityLayout.plan(task.id, next.revision) }) };
          } catch (error) { return { text: message(error), isError: true }; }
        } },
      createGitInspectionTool(this.projectRoot),
    ];
    let unreported: string[] = [];
    const action = pendingAction ?? await this.runInvocation<CapabilityAction>(run, agent, {
      role: 'capability-architect', task: { kind: 'capability', goal: request.original.need, requirements: [JSON.stringify(request.original)], modules: [task.provider, task.consumer, ...task.authority.map(entry => entry.owner)],
        startingPointGroups: await Promise.all([...committedRecords(run.log.ledger.replay()).results.values()]
          .filter(result => result.coordination?.kind === 'capability-task' && result.coordination.id === task.id)
          .flatMap(result => {
            const assignment = committedRecords(run.log.ledger.replay()).assignments.get(result.iteration);
            return assignment === undefined ? [] : [this.engineerStartingPoints(run, assignment, result)];
          })),
        omit: [`# Selected plan package ${selectedHash}\n\n${selected}`], literalSections: [{ key: 'support:selected-plan-package', text: `# Selected plan package ${selectedHash}\n\n${selected}` }, { key: 'support:capability-request', text: `Original request: ${JSON.stringify(request, null, 2)}` }] }, work: { capabilityTask: task.id, request: request.id }, attempt,
      loaded, systemPrompt: renderCapabilityArchitectPrompt(loaded, this.projectRoot),
      prompt: [
        `# Capability task ${task.id}`, `Use task ${task.id}, planRevision ${plan.revision} and invocation ${coordinatorBasis} as your action basis.`,
        ...[
          `Current plan: ${JSON.stringify(plan, null, 2)}`,
          `Provider entry decisions: ${JSON.stringify(providerDecisions, null, 2)}`,
          `Provider entry outlines: ${JSON.stringify(providerItems.map(entry => ({ item: entry.id, outline: records.outlines.get(entry.id) ?? [] })), null, 2)}`,
          `Read the live source at ${request.original.usage.map(use => use.path).join(', ')} and its tests. The snapshot at ${request.source.snapshot} records the suspension tree.`,
          ...[defaultWriteScopeSection(await this.defaultWriteScopes(run.index,
            [task.provider, task.consumer, ...task.authority.map(entry => entry.owner)], [...capabilityGuardedPolicy(this.requiredArtifacts(records))])).join('\n').trim()]
            .filter(section => section !== ''),
          `# Selected plan package ${selectedHash}\n\n${selected}`,
          ...(progress === '' ? [] : [`Progress from the last turn: ${progress}`]),
        ],
        ...[this.obligationBriefing(run, { kind: 'capability-task', id: task.id }).join('\n')].filter(section => section !== ''),
        `Inspect current source and Git directly. The latest task assignment results are ${[...records.results.values()].filter(result => result.coordination?.kind === 'capability-task' && result.coordination.id === task.id).map(result => `${result.iteration}: ${result.outcome}, gate ${result.gate ?? '(none)'}, commit ${result.commit ?? '(none)'}, findings ${result.findings.join('; ')}`).join(' | ') || '(none)'}. Gate reports are under ${runLayout.gateOutput('ga-0001').replace(/ga-0001.*/, '')}; inspect the named gate and review artifacts when needed. Request handback when, in your judgment, the real provider and requesting consumer meet the original need: report ${task.id} and every obligation you registered done in the same or an earlier action; a request that leaves one unreported is rejected naming it. The original examples are the request's context; say what you concluded about one in your summary.`,
      ].join('\n\n'),
      start: coordinatorPoint === undefined ? { mode: 'fresh' } : { mode: 'continue', ref: coordinatorPoint },
      ...(coordinatorPoint === undefined || coordinatorSession === undefined
        ? reconstructedFrom === undefined
          ? { requestedBy: { invocation: originInvocation, reason: 'capability-needed' as const } }
          : { replaces: { session: reconstructedFrom, reason: 'reconstructed' as const },
            degraded: { requested: 'continued' as const, reason: 'The prior capability architect session ended; durable current request, plan and evidence were supplied to a fresh session.' } }
        : { session: coordinatorSession, continuing: 'capability-coordination' as const }),
      toolName: 'submit_capability_action', description: 'Record the next action for this capability task.',
      inputSchema: z.toJSONSchema(capabilityActionSchema) as JsonSchema,
      submissionSchema: 'ramify-agent.capability-action/1',
      validate: async input => {
        const checked = await validateActionInput(input);
        // What the last rejected handback request left unreported, which an
        // exhausted turn's failure names.
        if (!checked.valid) unreported = unreportedByHandback(input, currentBasis()?.obligations);
        return checked.valid ? { ok: true, value: checked.value }
          : { ok: false, errors: checked.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message,
            expected: issue.kind === 'state' ? 'current task authority' : 'the action schema' })) };
      },
      scope: { write: null, measurement: null, size: null },
      keep: ended => ended === 'context-budget-reached' ? finished('not-kept') : kept,
      equip: () => ({ builtinTools: ['read', 'grep', 'ls'], tools }),
    });
    const replayed = pendingAction !== undefined;
    pendingAction = undefined;
    if (this.ignoring(run)) return null;
    if (action.ended === 'context-budget-reached') {
      await this.fail(run, 'limit-exceeded', `Capability architect ${task.id} reached its hard context limit without an accepted action; its unfinished task remains`, [runLayout.outcome(action.id)]);
      return null;
    }
    if (action.ended !== 'submitted') {
      // An exhausted rejection bound names what the last rejected handback
      // request left unreported; it is no verdict on the code.
      const owed = action.ended === 'invalid-submission' && unreported.length > 0
        ? `; its last rejected handback request left ${unreported.join(', ')} without a done report` : '';
      await this.fail(run, 'invalid-submission', `The capability architect of ${task.id} did not submit an action${owed}`);
      return null;
    }
    if (action.value === undefined) {
      await this.fail(run, 'invalid-submission', `The capability architect of ${task.id} submitted no accepted action`);
      return null;
    }
    const chosen = action.value;
    // Registrations and reports apply on acceptance, before the action; a
    // replayed accepted action finds them recorded and applies nothing again.
    if (!await this.handling.recordObligations(run, capabilityActor(), action.id, chosen)) return null;
    if (chosen.kind === 'partial') {
      progress = `${chosen.progress}; unfinished: ${chosen.unfinished.join('; ')}`;
      coordinatorPoint = action.ref || undefined;
      coordinatorSession = action.kept ? action.session : undefined;
      if (coordinatorPoint === undefined || coordinatorSession === undefined) {
        await this.fail(run, 'invalid-submission', `The capability architect of ${task.id} lost its continuation point`);
        return null;
      }
      coordinatorBasis = action.id;
      await this.write(run, { type: 'capability-coordinator-resumed', data: {
        task: task.id, invocation: action.id, session: coordinatorSession,
      } });
      await this.afterWrite('capability-coordinator-resumed', run.record.jobId);
      if (this.ignoring(run)) return null;
      continue;
    }
    // Submission ends the turn; the committed invocation now owns the
    // transition it selected. The next turn will use this same basis.
    if (!run.log.all('capability-coordinator-resumed').some(event => event.data.task === task.id &&
      event.data.invocation === action.id)) {
      await this.write(run, { type: 'capability-coordinator-resumed', data: {
        task: task.id, invocation: action.id, session: action.session,
      } });
      await this.afterWrite('capability-coordinator-resumed', run.record.jobId);
      if (this.ignoring(run)) return null;
    }
    // Recovery's model-free append advanced this same recorded coordinator.
    // Replay the effect from the original action point, then continue from the
    // explicitly retained appended recovery point rather than the stale action.
    let nextCoordinator = { point: replayed ? resume?.point : action.ref || undefined,
      session: replayed && resume?.session === undefined ? undefined : action.kept ? action.session : undefined,
      invocation: action.id };
    if (chosen.kind === 'consult-consumer') {
      const answer = await this.consultCapabilityConsumer(run, agent, packages, task, request, plan, chosen, action.id,
        { point: consumerPoint, session: consumerSession });
      if (answer === null) return null;
      consumerPoint = answer.point;
      consumerSession = answer.session;
      progress = `A-engineer answered exchange ${answer.exchange.id}: ${answer.exchange.answer?.text}; objections: ${answer.exchange.answer?.objections.join('; ')}`;
    } else if (chosen.kind === 'assign') {
      const result = await this.assignCapabilityWork(run, agent, packages, baseline, item, task, plan, chosen, action.id,
        { point: consumerPoint, session: consumerSession }, { point: action.ref, session: action.session });
      if (result === null) return null;
      consumerPoint = result.point;
      consumerSession = result.session;
      if (result.coordinator !== undefined) {
        nextCoordinator = result.coordinator;
      }
      progress = result.progress;
    } else if (chosen.kind === 'request-placement' || chosen.kind === 'unresolved') {
      const resolution = chosen.kind === 'request-placement'
        ? await this.requestPlacement(run, agent, packages, baseline, item, {
          forCapability: task.id, question: chosen.problem, requiredBehavior: plan.need,
          findings: chosen.evidence.map(text => ({ text, citations: [] })),
          candidates: [{ owner: task.provider, note: task.placementReason }], unresolved: [chosen.problem],
          hypotheses: [], localDecisions: [],
        })
        : await this.resolveUnresolved(run, agent, packages, baseline, item, {
          invocation: action.id, conflict: chosen.problem, evidence: chosen.evidence,
        });
      if (resolution === null) return null;
      progress = `Boundary decision returned to capability task ${task.id}: ${JSON.stringify(resolution)}`;
    } else if (chosen.kind === 'request-handback') {
      const result = await this.verifyCapabilityHandback(run, agent, packages, item, task, request, plan, chosen, action, replayed);
      if (result === null) return null;
      if (result.handedBack) return { kind: 'satisfied', guidance: result.guidance };
      progress = `Handback refused for ${task.id}: ${result.guidance}`;
      if (result.coordinator !== undefined) nextCoordinator = result.coordinator;
    } else {
      // Nested delegation is installed with the depth-first recovery path.
      return { kind: 'delegated' };
    }
    coordinatorPoint = nextCoordinator.point;
    coordinatorSession = nextCoordinator.session;
    if ((coordinatorPoint === undefined || coordinatorSession === undefined) && !replayed) {
      await this.fail(run, 'invalid-submission', `The capability architect of ${task.id} lost its continuation point`);
      return null;
    }
    coordinatorBasis = nextCoordinator.invocation;
    await this.write(run, { type: 'capability-coordinator-resumed', data: {
      task: task.id, invocation: coordinatorBasis, session: coordinatorSession ?? action.session,
    } });
    }
    await this.fail(run, 'limit-exceeded', `The capability architect of ${task.id} exhausted its invocation bound`);
    return null;
  }

  /** A question uses the requesting engineer's saved point with read-only
   * equipment. The reply belongs to the task, never to a new A assignment. */
  private async consultCapabilityConsumer(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, task: CapabilityTask,
    request: CapabilityRequest, plan: CapabilityPlan,
    action: Extract<CapabilityAction, { kind: 'consult-consumer' }>, invocation: string,
    consumer: { readonly point: string | null; readonly session: SessionId | undefined },
    existingExchange?: CapabilityExchange,
  ): Promise<{ readonly exchange: CapabilityExchange; readonly point: string; readonly session: SessionId } | null> {
    run.writer.requireSettled('Consumer consultation requires a settled writer');
    const existing = committedRecords(run.log.ledger.replay()).capabilityExchanges.size;
    const id = existingExchange?.id ?? `${task.id}-ex${String(existing + 1).padStart(2, '0')}`;
    const exchange: CapabilityExchange = existingExchange ?? { schema: 'ramify-agent.capability-exchange/1', id,
      task: task.id, request: request.id, planRevision: plan.revision, question: action.question,
      references: [...action.references], answer: null };
    if (existingExchange === undefined) await run.mutex.run(() => commitCapabilityTransition(run.log, {
      type: 'capability-exchange-opened', data: { task: task.id, exchange: id, invocation },
    }, [{ path: capabilityLayout.exchange(task.id, id, 1), id, revision: 1, body: exchange }]));
    if (existingExchange === undefined) await this.afterWrite('capability-exchange-opened', run.record.jobId);
    if (this.ignoring(run)) return null;
    const loaded = packages.get('engineer');
    if (loaded === undefined) { await this.fail(run, 'internal', 'Engineer package is absent for consultation'); return null; }
    const responseSchema = z.object({ answer: z.string().min(1), objections: z.array(z.string()) }).strict();
    if (existingExchange !== undefined) {
      const opened = run.log.all('capability-exchange-opened').find(event => event.data.exchange === id);
      const prior = [...run.log.all('invocation-started')].reverse().find(event =>
        opened !== undefined && event.sequence > opened.sequence && event.data.role === 'engineer' &&
        event.data.work.capabilityTask === task.id && event.data.work.request === request.id);
      const ended = prior === undefined ? undefined : run.log.all('invocation-ended').find(event => event.data.invocation === prior.data.invocation);
      if (prior !== undefined && ended?.data.ended === 'submitted' && ended.data.submission !== null) {
        const bytes = await readIfExists(run.path(runLayout.submission(prior.data.invocation)));
        const outcome = this.committedBody(run, runLayout.outcome(prior.data.invocation)) as InvocationOutcome | null;
        if (bytes === undefined || sha256(bytes) !== ended.data.submission ||
          outcome?.submission?.hash !== ended.data.submission || outcome.disposition !== 'applied' || !outcome.settled.confirmed) {
          await this.fail(run, 'recovery-exhausted', `Consultation ${id} has an unauthenticated submitted answer`);
          return null;
        }
        const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
        const { schema: _schema, ...body } = raw;
        const parsed = responseSchema.safeParse(body);
        if (raw.schema !== 'ramify-agent.capability-consultation/1' || !parsed.success) {
          await this.fail(run, 'recovery-exhausted', `Consultation ${id} has an invalid submitted answer`);
          return null;
        }
        const answered: CapabilityExchange = { ...exchange, answer: { invocation: prior.data.invocation,
          text: parsed.data.answer, objections: parsed.data.objections } };
        await run.mutex.run(() => commitCapabilityTransition(run.log, {
          type: 'capability-exchange-answered', data: { task: task.id, exchange: id, invocation: prior.data.invocation },
        }, [{ path: capabilityLayout.exchange(task.id, id, 2), id, revision: 2, body: answered }]));
        return { exchange: answered, point: consumer.point ?? '', session: consumer.session ?? request.continuation.session as SessionId };
      }
    }
    // Every consultation branches from the ORIGINAL accepted capability
    // request. Neither a prior answer nor the parent's later head is its
    // source; exploration and new role/tool input remain only in the child.
    const source = request.continuation;
    if (source.point !== null && readSessionPointReference(source.point)?.runId !== run.record.jobId) {
      await this.fail(run, 'recovery-exhausted', `Consultation ${id} has an invalid recorded original request point`);
      return null;
    }
    const reconstructed = source.point === null || !await (await this.operations(agent)).hasPoint(run.record.jobId, source.point);
    const response = await this.runInvocation(run, agent, {
      role: 'engineer', task: { kind: 'consultation', modules: [task.consumer], goal: action.question, requirements: [JSON.stringify(plan)], consultationSubmissionSchema: JSON.stringify(z.toJSONSchema(responseSchema)) }, work: { capabilityTask: task.id, request: request.id },
      attempt: run.log.all('invocation-started').filter(event => event.data.role === 'engineer' &&
        event.data.work.capabilityTask === task.id && event.data.work.request === request.id).length + 1,
      loaded, systemPrompt: renderEngineerPrompt(loaded, this.projectRoot, run.record.policy.limits.commandTimeoutMs, this.projectRoot),
      prompt: [`# Read-only consumer consultation ${id}`, `Question: ${action.question}`,
        `Current plan revision ${plan.revision}: ${JSON.stringify(plan)}`,
        `Original request and suspended source: ${JSON.stringify(request)}`,
        `References: ${action.references.join(', ')}`, 'Answer directly; source edits require a separate A-scoped assignment.'].join('\n\n'),
      workingDirectory: this.projectRoot,
      start: reconstructed ? { mode: 'fresh' } : { mode: 'fork', from: source.point! },
      ...(reconstructed ? {
        ...(consumer.session === undefined ? {} : { replaces: { session: consumer.session, reason: 'reconstructed' as const } }),
        degraded: { requested: 'fork' as const, reason: 'The recorded original capability request point is unavailable; current request, suspended source and plan were supplied under the named consumer consultation recovery.' },
      } : { fork: { from: { session: source.session as SessionId, invocation: request.invocation }, reason: 'capability-consultation' as const, briefs: [] } }),
      previewEquipment: { builtinTools: ['read', 'grep', 'ls'], tools: [] },
      toolName: 'answer_capability_consultation', description: 'Answer the question from the preserved A-engineer session.',
      inputSchema: z.toJSONSchema(responseSchema) as JsonSchema,
      submissionSchema: 'ramify-agent.capability-consultation/1', validate: input => validateAgainst(responseSchema, input),
      scope: { write: null, measurement: null, size: null },
      equip: () => ({ builtinTools: ['read', 'grep', 'ls'], tools: [] }),
      keep: () => finished('not-kept'),
    });
    if (this.ignoring(run)) return null;
    if (response.ended !== 'submitted' || response.value === undefined) {
      await this.fail(run, 'invalid-submission', `Consultation ${id} did not fork the original capability request point and answer`);
      return null;
    }
    const answered: CapabilityExchange = { ...exchange, answer: { invocation: response.id,
      text: response.value.answer, objections: response.value.objections } };
    await run.mutex.run(() => commitCapabilityTransition(run.log, {
      type: 'capability-exchange-answered', data: { task: task.id, exchange: id, invocation: response.id },
    }, [{ path: capabilityLayout.exchange(task.id, id, 2), id, revision: 2, body: answered }]));
    await this.afterWrite('capability-exchange-answered', run.record.jobId);
    if (this.ignoring(run)) return null;
    return { exchange: answered, point: consumer.point ?? '', session: consumer.session ?? source.session as SessionId };
  }

  /** A task completion request uses the ordinary project gate and the
   * reviews already requested for its accepted iterations. Its result returns
   * to this architect; failed iteration gates already returned to engineers.
   * The handback is the architect's done reports on the task's obligations,
   * which validation required of the accepted request; the harness checks
   * the non-test workflow boundaries, never a cited file, an executed test
   * or a per-example state. */
  private async verifyCapabilityHandback(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, item: WorkItem, task: CapabilityTask,
    request: CapabilityRequest, plan: CapabilityPlan,
    action: Extract<CapabilityAction, { kind: 'request-handback' }>,
    completion: InvocationResult<CapabilityAction>,
    replayed: boolean,
  ): Promise<{ readonly handedBack: boolean; readonly guidance: string;
    readonly coordinator?: { readonly point: string | undefined; readonly session: SessionId | undefined; readonly invocation: string } } | null> {
    const invocation = completion.id;
    run.writer.requireSettled(`Capability ${task.id} cannot verify an unsettled writer`);
    const state = replayCapabilityState(run.log.events).tasks.get(task.id);
    if (state === undefined || state.status !== 'coordinating' || state.planRevision !== plan.revision || state.activeChild !== null) {
      return { handedBack: false, guidance: 'The task, plan or child dependency is not ready for completion' };
    }
    // Every obligation this architect is responsible for was reported done
    // by the time the request was accepted: validation rejects one that
    // leaves an ID unreported, in the same turn and before any gate.
    const records = committedRecords(run.log.ledger.replay());
    const assignments = [...records.assignments.values()].filter(entry =>
      entry.coordination?.kind === 'capability-task' && entry.coordination.id === task.id)
      .sort((a, b) => (a.coordination?.kind === 'capability-task' ? a.coordination.sequence : 0) -
        (b.coordination?.kind === 'capability-task' ? b.coordination.sequence : 0));
    const results = assignments.map(entry => records.results.get(entry.id));
    const latestAccepted = [...assignments].reverse().find(entry => records.results.get(entry.id)?.outcome === 'accepted');
    const blockers = capabilityCompletionBlockers(replayCapabilityState(run.log.events), task.id,
      new Set(results.filter(result => result?.outcome === 'accepted').map(result => result!.iteration)));
    if (blockers.length > 0 || latestAccepted === undefined || results.some(result => result === undefined) ||
      state.activeAssignment !== null || state.activeChild !== null) {
      return { handedBack: false, guidance: [...blockers, latestAccepted === undefined ? 'No accepted task iteration' : '',
        results.some(result => result === undefined) ? 'An assignment has no ordinary result' : ''].filter(Boolean).join('; ') || 'An assignment is unfinished' };
    }
    const latestResult = records.results.get(latestAccepted.id)!;
    const candidate = (await this.previewCandidateTree()).tree;
    const acceptedGate = latestResult.gate === null ? null
      : gateAttemptSchema.safeParse(this.committedBody(run, runLayout.gate(latestResult.gate)));
    if (acceptedGate?.success !== true || acceptedGate.data.audited === null ||
      await this.candidates.commitTree(this.projectRoot, acceptedGate.data.audited) !== candidate) {
      return { handedBack: false, guidance: `Current source differs from the latest accepted iteration ${latestAccepted.id}; assign a repair and gate it` };
    }
    const correction = this.pendingCorrection(run, task.id);
    if (correction !== undefined) return { handedBack: false,
      guidance: `Reconciliation ${correction} requires an accepted correction assignment before another handback request` };
    const loaded = packages.get('capability-architect');
    if (loaded === undefined) { await this.fail(run, 'internal', 'Capability architect package is absent for reconciliation'); return null; }
    // The capability architect's own session runs from the project root, so its reconciliation fork does too.
    const parent: ParentSession = { session: completion.kept ? completion.session : undefined,
      ref: completion.ref || undefined, undelivered: [], workingDirectory: this.projectRoot };
    const reconciled = await this.reconcileWorkItem(run, agent, loaded, item, parent, {
      id: task.id, role: 'capability-architect', request: request.id, provider: task.provider,
      ...(completion.ref ? { completion: { session: completion.session, ref: completion.ref, invocation } } : {}),
    });
    if (reconciled === null) return null;
    const coordinator = { point: parent.ref, session: parent.session, invocation };
    if (reconciled.kind === 'correct') return { handedBack: false,
      guidance: `Reconciliation ${reconciled.reconciliation} requires a correction assignment. ${JSON.stringify(this.reconciliationBriefing(run, reconciled.reconciliation, parent.undelivered))}`,
      coordinator };
    const reviewStates = [...reviewStateOf(run.log.events).values()].filter(entry => entry.workItem === task.id);
    const failedTaskGates = run.log.all('gate-attempted').flatMap(event => {
      const parsed = gateAttemptSchema.safeParse(this.committedBody(run, runLayout.gate(event.data.gate)));
      return parsed.success && parsed.data.checkpoint === 'work-item' && parsed.data.verdict !== 'passed' &&
        parsed.data.proposedBy !== null && records.invocations.get(parsed.data.proposedBy)?.work.capabilityTask === task.id
        ? [parsed.data] : [];
    });
    const gateLimit = run.record.policy.limits.repairRoundsPerWorkItemGate;
    if (failedTaskGates.length > gateLimit) {
      await this.fail(run, 'repair-exhausted',
        `The ${task.id} gate did not pass after ${gateLimit} repair round${gateLimit === 1 ? '' : 's'}; the first cause was ${failedTaskGates[0]?.cause ?? 'unknown'} at gate ${failedTaskGates[0]?.id ?? 'unknown'}`,
        failedTaskGates.map(attempt => runLayout.gate(attempt.id)));
      return null;
    }
    const gate = await this.gates.workItemGate(run, item, invocation, failedTaskGates.length,
      `Capability ${task.id}: ${action.summary}`, task.id, replayed);
    if (gate === null) return null;
    if (gate.verdict !== 'passed' || gate.audited === null) {
      if (failedTaskGates.length + 1 > gateLimit) {
        await this.fail(run, 'repair-exhausted',
          `The ${task.id} gate did not pass after ${gateLimit} repair round${gateLimit === 1 ? '' : 's'}; the first cause was ${failedTaskGates[0]?.cause ?? gate.cause ?? 'unknown'} at gate ${failedTaskGates[0]?.id ?? gate.id}`,
          [runLayout.gate(failedTaskGates[0]?.id ?? gate.id), runLayout.gate(gate.id)]);
        return null;
      }
      return { handedBack: false, guidance: `Task completion gate ${gate.id} ${gate.verdict}: ${gate.cause ?? 'incomplete evidence'}; report ${runLayout.gate(gate.id)}`, coordinator };
    }
    const currentTree = (await this.previewCandidateTree()).tree;
    const auditedTree = await this.candidates.commitTree(this.projectRoot, gate.audited);
    if (auditedTree !== currentTree) return { handedBack: false, guidance: `Source changed after gate ${gate.id}; verify again`, coordinator };
    const basisRefusal = await this.completionBasisRefusal(run, task.id, gate, reconciled.basis);
    if (basisRefusal !== null) {
      await this.write(run, { type: 'reconciliation-refused', data: { workItem: task.id,
        reconciliation: this.latestBasis(run, task.id)?.id ?? null, stage: 'completion', reason: basisRefusal } });
      return { handedBack: false, guidance: `Completion basis changed: ${basisRefusal}`, coordinator };
    }
    await this.write(run, { type: 'capability-verification-started', data: { task: task.id, invocation, gate: gate.id } });
    await this.afterWrite('capability-verification-started', run.record.jobId);
    if (this.ignoring(run)) return null;
    await this.finishCapabilityHandback(run, task, request, plan, action, invocation, gate, currentTree, reviewStates);
    return { handedBack: true, guidance: `Capability ${task.id} accepted at ${currentTree}. ${action.summary}. Use ${action.interfaces.map(entry => `${entry.symbols.join(', ')} at ${entry.path}: ${entry.use}`).join('; ')}. Continue the original assignment from the current candidate; its remaining goal stays open.` };
  }

  private async finishCapabilityHandback(run: Run, task: CapabilityTask, request: CapabilityRequest,
    plan: CapabilityPlan, action: Extract<CapabilityAction, { kind: 'request-handback' }>, invocation: string,
    gate: GateAttempt, tree: string, reviews: ReturnType<typeof reviewStateOf> extends ReadonlyMap<string, infer R> ? R[] : never,
  ): Promise<void> {
    if (gate.audited === null) throw new Error(`Gate ${gate.id} has no audited commit`);
    const state = replayCapabilityState(run.log.events).tasks.get(task.id);
    if (state === undefined || capabilityHandbackReadiness(task, request, plan, state).length > 0) {
      throw new Error(`Capability ${task.id} lost its completion basis`);
    }
    const delta = await this.candidates.diffNameStatus(this.projectRoot, request.source.tree, gate.audited);
    const reviewRefs = reviews.flatMap(entry => {
      const body = this.committedBody(run, reviewLayout.request(entry.id));
      return body === undefined ? [] : [refOf(entry.id, 1, body)];
    });
    const handback = { schema: 'ramify-agent.capability-handback/1' as const, task: task.id, request: request.id,
      plan: refOf(task.id, plan.revision, plan), sourceRevision: gate.audited, returnedTree: tree,
      deltaFromSuspension: delta.map(change => change.path), summary: action.summary,
      interfaces: action.interfaces, compatibility: [...plan.compatibility],
      checks: [refOf(gate.id, 1, this.committedBody(run, runLayout.gate(gate.id)))],
      reviews: reviewRefs, limitations: [...action.limitations,
        ...this.unresolvedOf(run, task.id, checkFindingStateOf(run.log.ledger),
          run.record.policy.limits.reconciliationRoundsPerWorkItem ?? defaultReconciliationRounds)
          .map(entry => `Unresolved CheckFinding ${entry.checkFinding}: ${entry.reason}`)],
    };
    await run.mutex.run(() => commitCapabilityTransition(run.log, { type: 'capability-handed-back', data: {
      task: task.id, handback: task.id, invocation,
    } }, [{ path: capabilityLayout.handback(task.id), id: task.id, revision: 1, body: handback }]));
    await this.afterWrite('capability-handed-back', run.record.jobId);
  }

  /** A completed task gate is never rerun during recovery. The retained gate
   * and authenticated action produce the same handback once. */
  private async recoverVerifyingHandback(run: Run, task: CapabilityTask, request: CapabilityRequest,
    plan: CapabilityPlan): Promise<boolean> {
    const started = [...run.log.all('capability-verification-started')].reverse().find(event => event.data.task === task.id);
    if (started?.data.gate === undefined) {
      await this.fail(run, 'recovery-exhausted', `Capability ${task.id} has no retained shared completion gate`);
      return false;
    }
    const ended = run.log.all('invocation-ended').find(event => event.data.invocation === started.data.invocation);
    const bytes = await readIfExists(run.path(runLayout.submission(started.data.invocation)));
    const outcome = this.committedBody(run, runLayout.outcome(started.data.invocation)) as InvocationOutcome | null;
    if (ended?.data.ended !== 'submitted' || ended.data.submission === null || bytes === undefined ||
      sha256(bytes) !== ended.data.submission || outcome?.submission?.hash !== ended.data.submission || outcome.disposition !== 'applied') {
      await this.fail(run, 'recovery-exhausted', `Capability ${task.id} has no authenticated handback request`);
      return false;
    }
    const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const { schema: _schema, ...body } = raw;
    const parsed = capabilityActionSchema.safeParse(body);
    const gate = gateAttemptSchema.safeParse(this.committedBody(run, runLayout.gate(started.data.gate)));
    const tree = (await this.previewCandidateTree()).tree;
    if (raw.schema !== 'ramify-agent.capability-action/1' || !parsed.success || parsed.data.kind !== 'request-handback' ||
      parsed.data.task !== task.id || parsed.data.planRevision !== plan.revision || !gate.success ||
      gate.data.verdict !== 'passed' || gate.data.audited === null || await this.candidates.commitTree(this.projectRoot, gate.data.audited) !== tree) {
      await this.fail(run, 'inputs-changed', `Capability ${task.id} completion evidence or candidate changed before handback`);
      return false;
    }
    const records = committedRecords(run.log.ledger.replay());
    const latest = [...records.assignments.values()].reverse().find(entry => entry.coordination?.kind === 'capability-task' &&
      entry.coordination.id === task.id && records.results.get(entry.id)?.outcome === 'accepted');
    const reviews = [...reviewStateOf(run.log.events).values()].filter(entry => entry.iteration === latest?.id);
    if (latest === undefined || reviews.some(entry => entry.settledBy === null ||
      entry.attempts.find(attempt => attempt.id === entry.settledBy)?.finished?.result !== 'complete')) {
      await this.fail(run, 'recovery-exhausted', `Capability ${task.id} lost its accepted iteration or review result`);
      return false;
    }
    await this.finishCapabilityHandback(run, task, request, plan, parsed.data, started.data.invocation, gate.data, tree, reviews);
    return true;
  }

  /** One task-owned writer. Its scope is captured from the real module view;
   * the provisional candidate stays live for the next owner. */
  private async coordinateNestedCapability(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot,
    item: WorkItem, parentTask: CapabilityTask, parentPlan: CapabilityPlan, assignment: IterationAssignment,
    suspended: InvocationResult<EngineerSubmission>,
    coordinator: { readonly point: string | undefined; readonly session: SessionId | undefined },
    existingRequest?: CapabilityRequest,
  ): Promise<{ readonly guidance: string; readonly coordinatorPoint: string; readonly coordinatorSession: SessionId;
    readonly coordinatorInvocation: string } | null> {
    if (suspended.ended !== 'submitted' || suspended.value?.kind !== 'capability-needed' || !suspended.kept || suspended.ref === '') {
      await this.fail(run, 'invalid-submission', `Nested need from ${assignment.id} has no retained requesting engineer`);
      return null;
    }
    const assignmentOwner = 'module' in assignment.scope.base ? assignment.scope.base.module : parentTask.consumer;
    run.writer.requireSettled(`Nested request from ${assignment.id} cannot suspend an unsettled writer`);
    const requestId = existingRequest?.id ?? capabilityRequestId(committedRecords(run.log.ledger.replay()).capabilityRequests.size + 1);
    const source = existingRequest?.source ?? await captureProvisionalSource({ git: this.git, sourceGit: this.options.provisionalSourceGit, projectRoot: this.projectRoot, runDirectory: run.directory,
      request: requestId, acceptedBase: this.accepted(run), writerSettledBy: suspended.id,
      changedPaths: await this.git.changedPaths(this.projectRoot, this.accepted(run)) });
    if (existingRequest === undefined) {
      await this.afterWrite('capability-source-captured', run.record.jobId);
      if (this.ignoring(run)) return null;
    }
    const request: CapabilityRequest = existingRequest ?? { schema: 'ramify-agent.capability-request/1', id: requestId,
      parent: { kind: 'capability-task', id: parentTask.id }, assignment: assignment.id,
      invocation: suspended.id, consumer: assignmentOwner,
      requirementPackage: refOf(parentTask.id, parentPlan.revision, parentPlan),
      continuation: { session: suspended.session, point: suspended.ref }, source,
      summary: suspended.value.summary, original: identifyCapabilityNeed(requestId, suspended.value.request) };
    try {
      if (existingRequest === undefined) {
      await run.mutex.run(() => commitCapabilityTransition(run.log, { type: 'capability-requested', data: {
        request: request.id, parent: parentTask.id, assignment: assignment.id, invocation: suspended.id,
      } }, [{ path: capabilityLayout.request(request.id), id: request.id, revision: 1, body: request }]));
      }
    } catch (error) {
      await this.fail(run, 'unresolvable-requirement', `Nested need ${request.id} could not be recorded: ${message(error)}`);
      return null;
    }
    const loaded = packages.get('capability-architect');
    if (loaded === undefined) { await this.fail(run, 'internal', 'No capability architect package was captured'); return null; }
    const recovered = existingRequest === undefined ? undefined : await this.replayAcceptedCapabilityQualification(run, request, 'capability-architect');
    if (recovered === null) return null;
    let qualification: InvocationResult<QualificationAction> | undefined = recovered;
    let point = coordinator.point;
    let session = coordinator.session;
    let returned = '';
    const priorTurns = run.log.all('invocation-started').filter(event => event.data.role === 'capability-architect' &&
      event.data.work.request === request.id).length;
    for (let count = priorTurns - (recovered === undefined ? 0 : 1);
      count < run.record.policy.limits.maxIterationsPerWorkItem; count += 1) {
    const appended = qualification !== undefined || point === undefined ? { outcome: 'session-lost' as const }
      : await (await this.operations(agent)).append(point, `nested:${request.id}:${count}`, `Qualify nested request ${request.id} from ${assignment.id}`);
    if (appended.outcome === 'conflict') throw new Error(`The capability architect did not take its note: ${appended.reason}`);
    const lost = appended.outcome === 'session-lost' || session === undefined;
    qualification ??= await this.runInvocation<QualificationAction>(run, agent, {
      role: 'capability-architect', task: { kind: 'capability-qualification', goal: request.original.need, requirements: [JSON.stringify(request), JSON.stringify(parentPlan)], modules: [parentTask.provider, parentTask.consumer] }, work: { capabilityTask: parentTask.id, request: request.id },
      attempt: run.log.all('invocation-started').filter(event => event.data.work.capabilityTask === parentTask.id &&
        event.data.work.request === request.id).length + 1,
      loaded, systemPrompt: renderCapabilityArchitectPrompt(loaded, this.projectRoot),
      prompt: [`# Qualify nested request ${request.id}`, `Parent task ${parentTask.id} waits with ${assignment.id} unfinished.`,
        `Original need and source: ${JSON.stringify(request, null, 2)}`,
        `Current parent plan: ${JSON.stringify(parentPlan, null, 2)}`,
        `Use request ${request.id} and invocation ${suspended.id} in the action.`,
        'Inspect the actual API and use. Satisfy with existing behavior or delegate a fresh child; matching module names do not establish reuse.',
        ...(returned === '' ? [] : [`# Boundary decision\n\n${returned}`])].join('\n\n'),
      start: lost ? { mode: 'fresh' } : { mode: 'continue', ref: appended.ref },
      ...(lost ? { ...(session === undefined ? {} : { replaces: { session, reason: 'reconstructed' as const } }),
        degraded: { requested: 'continued' as const, reason: 'The parent capability architect session was lost; its request and current plan were reconstructed.' } }
        : { session: session!, continuing: 'capability-coordination' as const }),
      toolName: 'submit_capability_qualification', description: 'Qualify this nested need under the parent task.',
      inputSchema: z.toJSONSchema(qualificationActionSchema) as JsonSchema,
      submissionSchema: 'ramify-agent.capability-qualification/1',
      validate: input => { const checked = validateAgainst(qualificationActionSchema, input);
        if (!checked.ok) return checked;
        return checked.value.request === request.id && checked.value.invocation === suspended.id ? checked
          : { ok: false, errors: [{ path: 'request', message: 'The nested request basis is stale', expected: `${request.id} and ${suspended.id}` }] }; },
      scope: { write: null, measurement: null, size: null }, keep: () => kept,
      equip: () => ({ builtinTools: ['read', 'grep', 'ls'], tools: [] }),
    });
    if (qualification.ended !== 'submitted' || qualification.value === undefined) {
      await this.fail(run, 'invalid-submission', `The parent architect did not qualify nested request ${request.id}`);
      return null;
    }
    if (qualification.value.kind === 'request-placement' || qualification.value.kind === 'unresolved') {
      const pending = qualification.value;
      const resolution = pending.kind === 'request-placement'
        ? await this.requestPlacement(run, agent, packages, baseline, item, {
          forCapability: request.id, question: pending.problem, requiredBehavior: request.original.need,
          findings: pending.evidence.map(text => ({ text, citations: [] })),
          candidates: [{ owner: parentTask.provider, note: parentTask.placementReason }],
          unresolved: [pending.problem], hypotheses: [], localDecisions: [],
        }, run.log.all('placement-requested').find(event => event.data.capability === request.id)?.data.request)
        : await this.resolveUnresolved(run, agent, packages, baseline, item, {
          invocation: qualification.id, conflict: pending.problem, evidence: pending.evidence,
        }, run.log.all('unresolved-requested').find(event => event.data.invocation === qualification!.id)?.data.request);
      if (resolution === null) return null;
      returned = `The responsible global architect answered the nested boundary request: ${JSON.stringify(resolution)}`;
      point = qualification.ref || undefined;
      session = qualification.kept ? qualification.session : undefined;
      qualification = undefined;
      continue;
    }
    break;
    }
    if (qualification?.value === undefined ||
      (qualification.value.kind !== 'satisfy-with-existing' && qualification.value.kind !== 'delegate-capability')) {
      await this.fail(run, 'limit-exceeded', `Nested qualification of ${request.id} did not settle within the captured bound`);
      return null;
    }
    const decision = qualification.value;
    if (decision.kind === 'satisfy-with-existing') {
      await this.write(run, { type: 'capability-qualified', data: {
        request: request.id, invocation: qualification.id, outcome: 'satisfied', evidence: decision.evidence,
      } });
      return { guidance: `Nested need ${request.id} uses existing ${decision.api.symbol} at ${decision.api.path}. ${decision.guidance}. Verify it in ${assignment.id}.`,
        coordinatorPoint: qualification.ref, coordinatorSession: qualification.session,
        coordinatorInvocation: qualification.id };
    }
    const records = committedRecords(run.log.ledger.replay());
    const taskId = capabilityTaskId(records.capabilityTasks.size + 1);
    const providerItems = records.workItems.filter(entry => entry.module === decision.provider);
    const child: CapabilityTask = { schema: 'ramify-agent.capability-task/1', id: taskId, request: request.id,
      parent: request.parent, originatingAssignment: assignment.id, consumer: assignmentOwner,
      provider: decision.provider, placementReason: decision.placementReason,
      authority: [{ owner: assignmentOwner, reason: 'Requesting consumer integration and task-local architecture' },
        ...(decision.provider === assignmentOwner ? [] : [{ owner: decision.provider, reason: decision.placementReason }])],
      relatedEntries: providerItems.map(entry => ({ entry: entry.id, reason: 'Provider entry remains separate from this task' })),
      deferredWorkItems: providerItems.map(entry => entry.id), source, limits: captureCapabilityLimits(run.record.policy) };
    const plan: CapabilityPlan = { schema: 'ramify-agent.capability-plan/1', task: child.id, revision: 1, basedOn: 0,
      updatedBy: qualification.id, revisionReason: 'Initial nested request', need: request.original.need,
      proposedInterface: 'Undecided; inspect actual source and consumer use',
      useCases: request.original.examples.map(example => ({ id: example.id, expectedBehavior: example.title, derivedFrom: [example.id] })),
      compatibility: [...request.original.constraints],
      outline: ['Review existing behavior and affected owners', 'Coordinate provider and requesting engineer', 'Verify use and hand back'],
      decisions: [{ decision: `Coordinate in ${decision.provider}`, reason: decision.placementReason,
        evidence: [...decision.requirementRefs] }], openQuestions: [], requirementRefs: [...decision.requirementRefs],
      originalExamples: request.original.examples.map(example => example.id) };
    await run.mutex.run(() => commitCapabilityTransition(run.log, { type: 'capability-delegated', data: {
      task: child.id, request: request.id, parent: parentTask.id, invocation: qualification.id, planRevision: 1,
    } }, [
      { path: capabilityLayout.task(child.id), id: child.id, revision: 1, body: child },
      { path: capabilityLayout.plan(child.id, 1), id: child.id, revision: 1, body: plan },
    ]));
    const providerDecisions = [...records.decisions.values()].filter(entry => entry.owner === decision.provider);
    const selected = new TextDecoder().decode(await readFile(run.path(runLayout.capturedPlan)));
    const childItem = records.workItems.find(entry => entry.module === assignmentOwner) ?? item;
    const result = await this.runCapabilityCoordinator(run, agent, packages, baseline, childItem, child, request, plan,
      qualification.id, selected, providerItems, providerDecisions);
    if (result === null || result.kind !== 'satisfied') return null;
    return { guidance: result.guidance, coordinatorPoint: qualification.ref, coordinatorSession: qualification.session,
      coordinatorInvocation: qualification.id };
  }

  /** Capability tasks issue the same durable assignment and use the same
   * engineer executor as work items. The task supplies the design basis and
   * owns its sequence; the parent work item is only the continuation context. */
  private async assignCapabilityWork(
    run: Run, agent: AgentPort, packages: ReadonlyMap<string, LoadedPackage>, baseline: MeasurementSnapshot,
    item: WorkItem, task: CapabilityTask, plan: CapabilityPlan,
    action: Extract<CapabilityAction, { kind: 'assign' }>, invocation: string,
    consumer: { readonly point: string | null; readonly session: SessionId | undefined },
    coordinator: { readonly point: string | undefined; readonly session: SessionId | undefined },
    existingAssignment?: IterationAssignment,
  ): Promise<{ readonly progress: string; readonly point: string | null; readonly session: SessionId | undefined;
    readonly coordinator?: { readonly point: string | undefined; readonly session: SessionId | undefined; readonly invocation: string } } | null> {
    run.writer.requireSettled('Capability assignment requires a settled writer');
    const state = replayCapabilityState(run.log.events).tasks.get(task.id);
    if (state === undefined) { await this.fail(run, 'recovery-exhausted', `Capability task ${task.id} has no state`); return null; }
    const sequence = existingAssignment?.coordination?.kind === 'capability-task'
      ? existingAssignment.coordination.sequence : state.nextAssignmentSequence;
    if (sequence > task.limits.maxAssignments || sequence > (run.record.policy.limits.maxIterationsPerCapabilityTask ?? task.limits.maxAssignments)) {
      await this.fail(run, 'limit-exceeded', `Capability task ${task.id} exhausted its assignment bound`);
      return null;
    }
    const id = existingAssignment?.id ?? capabilityAssignmentId(task.id, sequence);
    const records = committedRecords(run.log.ledger.replay());
    let assignment = existingAssignment;
    if (assignment === undefined) {
      const index = await this.refreshIndex(run);
      const body = action.assignment;
      const problems = [...capabilityAuthorizationErrors(body.authorizations, capabilityGuardedPolicy(this.requiredArtifacts(records))), ...assignmentErrors(body, {
        index, registry: new Map(records.registry.map(entry => [entry.capability, entry])),
        outline: null, capabilityCompatibility: plan.compatibility,
        guardedPaths: capabilityGuardedPolicy(this.requiredArtifacts(records)),
        revising: true, bounds: engineerBoundsOf(run.record.policy.limits),
        // The action's registrations were recorded on acceptance, before it.
        obligations: {
          actor: { kind: 'capability-task', id: task.id, useCases: new Set(plan.useCases.map(useCase => useCase.id)) },
          projection: this.obligationProjection(run),
        },
      })];
      if (problems.length > 0) {
        await this.fail(run, 'invalid-submission', `Capability assignment ${id} is invalid: ${problems.map(entry => `${entry.path}: ${entry.message}`).join('; ')}`);
        return null;
      }
      const scope = await this.preparedScope(run, body, sequence, [], () => resolveWriteScope({ ramify: this.options.ramify, projectRoot: this.projectRoot, index,
        view: run.record.manifest.architectView, revision: sequence,
        base: body.scope.base, extra: body.scope.extra, read: body.scope.read, bootstrap: [],
        rationale: body.scope.rationale }), `Capability assignment ${id}`);
      if (scope === null) return null;
      const planRef = refOf(task.id, plan.revision, plan);
      for (const authorization of body.authorizations ?? []) {
        const target = await resolveRealTarget(this.projectRoot, authorization.path);
        if (target.ok && !scope.resolved.files.includes(target.resolved)) scope.resolved.files.push(target.resolved);
      }
      let source: PackageCitation | undefined;
      try {
        // A capability's selected package may cover newly added owners. The
        // parent work item's selection is narrower, so cite against the
        // frozen run catalog instead of treating the parent's IDs as its set.
        source = await this.citeCurrentDeviations(run, body.citedElements);
      } catch (error) {
        await this.fail(run, 'inputs-changed', `Capability assignment ${id} package is unavailable: ${message(error)}`);
        return null;
      }
      const startingTree = (await this.previewCandidateTree()).tree;
      const startingPaths = await Promise.all((await this.git.changedPaths(this.projectRoot, this.accepted(run)))
        .map(async path => ({ path, hash: await readFile(join(this.projectRoot, path)).then(bytes => sha256(bytes)).catch(error => {
          if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
          throw error;
        }) })));
      assignment = await this.buildIterationAssignment(run, {
        id, item, basis: planRef,
        coordination: { kind: 'capability-task', id: task.id, sequence, plan: planRef, startingTree, startingPaths },
        body, scope, source, evidenceObligations: [],
        guardedPaths: this.requiredArtifacts(records).map(entry => entry.path),
        authorizations: (body.authorizations ?? []).map(entry => ({ ...entry, by: planRef })),
      });
      await this.write(run, { type: 'capability-assigned', data: { task: task.id, assignment: id, sequence, invocation,
        architectRef: coordinator.point === undefined || coordinator.session === undefined ? null : { session: coordinator.session, ref: coordinator.point },
        ...(this.pendingCorrection(run, task.id) === undefined ? {} : { corrects: this.pendingCorrection(run, task.id)! }) } }, [
        { path: iterationLayout.assignment(task.id, sequence), id, revision: 1, body: assignment },
      ]);
      await this.afterWrite('capability-assigned', run.record.jobId);
      if (this.ignoring(run)) return null;
    }
    let coordinatorAfterNested: { point: string | undefined; session: SessionId | undefined; invocation: string } | undefined;
    const committed = committedRecords(run.log.ledger.replay());
    const already = committed.results.get(id);
    let recoveredReturn: { session: SessionId; point: string; priorInvocation: string; guidance: string } | undefined;
    if (already === undefined) {
      // A child can finish while its parent engineer remains suspended. The
      // request and submission are durable, so resume that same assignment
      // rather than opening a second engineer iteration after restart.
      const starts = run.log.all('invocation-started').filter(event => event.data.role === 'engineer' && event.data.work.iteration === id);
      const pending = [...committed.capabilityRequests.values()].reverse().find(request =>
        request.parent.kind === 'capability-task' && request.parent.id === task.id && request.assignment === id &&
        !starts.some(start => start.data.invocation !== request.invocation &&
          run.log.events.findIndex(event => event.type === 'invocation-started' && event.data.invocation === start.data.invocation) >
          run.log.events.findIndex(event => event.type === 'invocation-started' && event.data.invocation === request.invocation)));
      if (pending !== undefined) {
        const raw = await readIfExists(run.path(runLayout.submission(pending.invocation)));
        const parsed = raw === undefined ? null : engineerSubmissionSchema.safeParse((({ schema: _schema, ...body }) => body)(JSON.parse(raw.toString('utf8')) as Record<string, unknown>));
        if (!parsed?.success || parsed.data.kind !== 'capability-needed' || pending.continuation.point === null) {
          await this.fail(run, 'recovery-exhausted', `Nested request ${pending.id} cannot recover its engineer continuation`);
          return null;
        }
        const suspended: InvocationResult<EngineerSubmission> = {
          id: pending.invocation, ended: 'submitted', value: parsed.data,
          ref: pending.continuation.point, session: pending.continuation.session, kept: true, outcomeKind: 'submitted',
        };
        const childId = replayCapabilityState(run.log.events).requests.get(pending.id)?.task;
        const handback = childId === null || childId === undefined ? undefined : committed.capabilityHandbacks.get(childId);
        let guidance: string;
        if (handback !== undefined) {
          guidance = `Nested capability ${childId} handed back at ${handback.returnedTree}. Accepted source ${handback.sourceRevision}; changes since suspension: ${handback.deltaFromSuspension.join(', ') || '(none)'}. Interface use: ${handback.interfaces.map(entry => `${entry.symbols.join(', ')} at ${entry.path}: ${entry.use}`).join('; ')}. Continue ${id} from its current candidate; its assigned goal remains unfinished.`;
        } else {
          const nested = await this.coordinateNestedCapability(run, agent, packages, baseline, item, task, plan,
            assignment, suspended, coordinator, pending);
          if (nested === null) return null;
          coordinatorAfterNested = { point: nested.coordinatorPoint, session: nested.coordinatorSession,
            invocation: nested.coordinatorInvocation };
          guidance = nested.guidance;
        }
        recoveredReturn = { session: suspended.session, point: suspended.ref, priorInvocation: suspended.id, guidance };
      }
    }
    let outcome: IterationOutcome | null = already === undefined
      ? await this.takeIteration(run, agent, packages, baseline, item, assignment, await this.refreshIndex(run), recoveredReturn)
      : { kind: 'closed', result: already };
    while (outcome?.kind === 'capability-needed') {
      const suspended: InvocationResult<EngineerSubmission> = {
        id: outcome.invocation, ended: 'submitted', value: { kind: 'capability-needed', summary: outcome.summary, request: outcome.need },
        ref: outcome.point, session: outcome.session, kept: true, outcomeKind: 'submitted',
      };
      const nested = await this.coordinateNestedCapability(run, agent, packages, baseline, item, task, plan,
        assignment, suspended, coordinatorAfterNested ?? coordinator);
      if (nested === null) return null;
      coordinatorAfterNested = { point: nested.coordinatorPoint, session: nested.coordinatorSession,
        invocation: nested.coordinatorInvocation };
      outcome = await this.takeIteration(run, agent, packages, baseline, item, assignment, await this.refreshIndex(run), {
        session: outcome.session, point: outcome.point, priorInvocation: outcome.invocation, guidance: nested.guidance,
      });
    }
    if (outcome === null) return null;
    if (outcome.kind !== 'closed') throw new Error(`Capability assignment ${id} did not close`);
    const settled = run.log.all('capability-assignment-settled').some(event => event.data.assignment === id);
    if (!settled) {
      const stateOutcome = outcome.result.outcome === 'accepted' ? 'accepted'
        : outcome.result.outcome === 'partial' ? 'partial' : 'failed';
      const completed = committedRecords(run.log.ledger.replay());
      const mutated = new Set<string>();
      const outside = new Set<string>();
      for (const engineer of run.log.all('invocation-started').filter(event => event.data.role === 'engineer' && event.data.work.iteration === id)) {
        const started = completed.invocations.get(engineer.data.invocation);
        const writer = completed.outcomes.get(engineer.data.invocation);
        if (started?.candidateBefore !== undefined && writer?.candidateAfter !== undefined) {
          for (const change of await this.git.diffNameStatus(this.projectRoot, started.candidateBefore, writer.candidateAfter)) mutated.add(change.path);
        }
        for (const path of writer?.outsideScope ?? []) if (mutated.has(path)) outside.add(path);
      }
      await this.write(run, { type: 'capability-assignment-settled', data: {
        task: task.id, assignment: id, outcome: stateOutcome, mutated: [...mutated].sort(), outsideScope: [...outside].sort(),
        endingTree: (await this.previewCandidateTree()).tree,
      } });
      await this.afterWrite('capability-assignment-settled', run.record.jobId);
    }
    return { progress: `Assignment ${id}: ${outcome.result.outcome}; gate ${outcome.result.gate ?? '(none)'}; commit ${outcome.result.commit ?? '(none)'}; result ${iterationLayout.result(task.id, sequence)}. ${outcome.result.findings.join('; ')}`,
      point: consumer.point, session: consumer.session,
      ...(coordinatorAfterNested === undefined ? {} : { coordinator: coordinatorAfterNested }) };
  }

  private async takeIteration(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    baseline: MeasurementSnapshot,
    item: WorkItem,
    assignment: IterationAssignment,
    assignedIndex: ArchitectIndex | null,
    resume?: { readonly session: SessionId; readonly point: string; readonly guidance: string; readonly priorInvocation: string },
  ): Promise<IterationOutcome | null> {
    const savedResult = committedRecords(run.log.ledger.replay()).results.get(assignment.id);
    if (run.restoring && savedResult) {
      for (const invocation of [...savedResult.invocations].reverse()) {
        const outcome = committedRecords(run.log.ledger.replay()).outcomes.get(invocation);
        if (!outcome?.settled.confirmed) throw new Error('Original iteration outcome has no confirmed settlement');
        if (!outcome.submission) continue;
        const bytes = await readIfExists(run.path(runLayout.submission(invocation)));
        if (!bytes || sha256(bytes) !== outcome.submission.hash) throw new Error('Original iteration destination changed');
        const { schema, ...body } = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
        if (schema !== 'ramify-agent.engineer-submission/1') throw new Error('Original iteration destination schema changed');
        const parsed = engineerSubmissionSchema.parse(body);
        if (parsed.kind === 'contract-needed') return { kind: 'closed', result: savedResult, need: { need: parsed.need, suggestedProvider: parsed.suggestedProvider, injectionSites: parsed.injectionSites, invocation } };
      }
      return { kind: 'closed', result: savedResult };
    }
    if (packages.get('engineer') === undefined) {
      await this.fail(run, 'internal', 'No prompt package is loaded for the engineer');
      return null;
    }
    const number = assignment.coordination?.kind === 'capability-task'
      ? assignment.coordination.sequence : Number.parseInt(assignment.id.slice(assignment.id.lastIndexOf('.i') + 2), 10);
    // Every engineer invocation of the iteration, a budget return's too,
    // runs under the bounds its assignment raised, and its prompt states the
    // longest a command may run.
    const bounds = this.engineerBounds(run, assignment);
    const workingDirectory = await engineerWorkingDirectory(this.projectRoot, assignment.scope, run.index, this.git);
    // What the assignment gave it to write: its base modules, included
    // subtrees, bootstrapped modules and extra locations.
    const measurementScope = writeScopeMeasurement(assignment.scope);

    const priorStarts = run.log.all('invocation-started').filter(event =>
      event.data.role === 'engineer' && event.data.work.iteration === assignment.id);
    const invocations: string[] = priorStarts.map(event => event.data.invocation);
    const findings: string[] = [];
    let sessionRef: string | undefined = resume?.point;
    /** The engineer's session while the harness keeps it; `sessionRef` is its executor's point. */
    let session: SessionId | undefined = resume?.session;
    /** A lost session the next one is reconstructed in place of. */
    let replacing: SessionId | undefined;
    let handoff: { done: string[]; unfinished: string[] } | undefined;
    let failedGate: { id: string; cause: string | null; summary: string[] } | undefined;
    let firstCause: { gate: string; cause: string | null } | undefined;
    const priorGates = run.log.all('gate-attempted').flatMap(event => {
      const parsed = gateAttemptSchema.safeParse(this.committedBody(run, runLayout.gate(event.data.gate)));
      return parsed.success && parsed.data.subject.iteration === assignment.id ? [parsed.data] : [];
    });
    let replay: InvocationResult<EngineerSubmission> | undefined;
    const latestStart = priorStarts.at(-1);
    if (latestStart !== undefined && resume?.priorInvocation !== latestStart.data.invocation &&
      !priorGates.some(gate => gate.proposedBy === latestStart.data.invocation)) {
      const ended = run.log.all('invocation-ended').find(event => event.data.invocation === latestStart.data.invocation);
      const recorded = committedRecords(run.log.ledger.replay()).outcomes.get(latestStart.data.invocation);
      if (ended !== undefined && recorded !== undefined && recorded.settled.confirmed) {
        const bytes = recorded.submission === null ? undefined : await readIfExists(run.path(runLayout.submission(latestStart.data.invocation)));
        if (bytes !== undefined && sha256(bytes) !== recorded.submission?.hash) {
          await this.fail(run, 'recovery-exhausted', `Engineer ${latestStart.data.invocation} has changed submission bytes`);
          return null;
        }
        const raw = bytes === undefined ? null : JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
        const parsed = raw === null ? null : engineerSubmissionSchema.safeParse((({ schema: _schema, ...body }) => body)(raw));
        if (recorded.ended === 'submitted' && (raw?.schema !== 'ramify-agent.engineer-submission/1' || !parsed?.success)) {
          await this.fail(run, 'recovery-exhausted', `Engineer ${latestStart.data.invocation} has no valid committed submission`);
          return null;
        }
        replay = { id: latestStart.data.invocation, ended: recorded.ended,
          value: parsed?.success ? parsed.data : undefined,
          ref: recorded.session?.ref ?? '', session: latestStart.data.session, kept: ended.data.kept,
          outcomeKind: recorded.ended, ...(recorded.interruption === undefined ? {} : { interruption: recorded.interruption }),
          ...(recorded.error === undefined ? {} : { error: recorded.error }), elapsedMs: recorded.elapsedMs,
          actual: recorded.session?.mode === 'continued' ? 'continue' : recorded.session?.mode,
          inFlight: [], lastText: null };
      }
    }
    let repairRound = priorGates.filter(gate => gate.next === 'repair').length;
    let attempt = priorStarts.length;
    let guidancePending = resume?.guidance;
    const priorRepair = [...priorGates].reverse().find(gate => gate.next === 'repair');
    if (priorRepair !== undefined) failedGate = await this.diagnosticsOf(run, priorRepair);
    if (priorGates.length > 0) firstCause = { gate: priorGates[0]!.id, cause: priorGates[0]!.cause };

    // Closing the iteration closes the work of a session still kept for it.
    const close = async (outcome: IterationResult['outcome'], extra: Partial<IterationResult> = {}): Promise<ClosedIterationOutcome> => {
      const result = await this.handling.closeIteration(run, item, number, assignment, {
        outcome, invocations, findings, gate: null, commit: null, ...extra,
      });
      await this.finishSession(run, session, 'work-closed');
      return { kind: 'closed', result };
    };

    // A crash after the gate's immutable success and before its iteration
    // result reuses that exact gate. No second engineer or audit runs.
    const passed = [...priorGates].reverse().find(gate => gate.verdict === 'passed' && gate.audited !== null);
    if (passed !== undefined) {
      if (await this.candidates.commitTree(this.projectRoot, passed.audited!) !== (await this.previewCandidateTree()).tree) throw new CandidateDriftError('Original engineer gate candidate changed before handback');
      const closed = await this.handling.closeIteration(run, item, number, assignment, {
        outcome: 'accepted', invocations, findings: [], gate: passed.id, commit: passed.audited,
      });
      if (closed.commit !== null) await this.handling.requestReviews(run, { workItem: assignment.coordination?.kind === 'capability-task'
        ? assignment.coordination.id : item.id, iteration: assignment.id, gate: passed.id, commit: closed.commit });
      await this.finishSession(run, session, 'work-closed');
      if (!await this.dischargeEvidence(run, item, assignment, passed.id, closed)) return null;
      return { kind: 'closed', result: closed };
    }

    for (;;) {
      if (this.ignoring(run)) return null;

      // A session the implementation can no longer read is reconstructed from
      // records rather than continued, and the counters are kept.
      let start: SessionStart = { mode: 'fresh' };
      let degraded: InvocationRequest<EngineerSubmission>['degraded'];
      if (sessionRef !== undefined) {
        const note = `Continuing iteration ${assignment.id}.`;
        const appended = await (await this.operations(agent)).append(sessionRef, `${assignment.id}:${attempt}`, note);
        if (appended.outcome !== 'appended' && appended.outcome !== 'already-present') {
          if (appended.outcome === 'conflict') throw new Error(`The engineer session did not take its note: ${appended.reason}`);
          await this.finishSession(run, session, 'lost');
          degraded = { requested: 'continued', reason: 'The retained engineer session is unavailable; using the ordinary task brief' };
          replacing = undefined;
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
      const beforeTree = assignment.coordination?.kind === 'capability-task'
        ? (await this.previewCandidateTree()).tree : undefined;
      const before = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      // A capability-task iteration is told only the obligations its
      // assignment names; a work item's iteration also sees its scenarios.
      const briefedScenarios = assignment.coordination?.kind === 'capability-task'
        ? undefined : await this.engineerScenarios(run, item);
      const assignedObligations = this.assignedObligations(run, assignment.obligations ?? []);
      // The assignment package reaches a session once: a continued session
      // holds it from its first prompt.
      let assignmentPackage: string | undefined;
      try {
        if (assignment.source !== undefined) assignmentPackage = await this.packageText(run, assignment.source);
      } catch (error) {
        await this.fail(run, 'inputs-changed', `The assignment package of ${assignment.id} cannot be delivered: ${message(error)}`);
        return null;
      }
      const featurePaths = briefedScenarios?.kind === 'entry'
        ? briefedScenarios.scenarios.filter(scenario => (assignment.obligations ?? []).includes(scenario.id)).map(scenario => scenario.file)
        : briefedScenarios?.kind === 'integration' && (assignment.obligations ?? []).includes(briefedScenarios.integration.scenario.id)
          ? [briefedScenarios.integration.scenario.file] : [];
      const focused = await prepareAssignedCucumber({ projectRoot: this.projectRoot, scratchDirectory: join(workingDirectory, 'tmp', 'ramify-focused', assignment.id),
        featurePaths, checks: run.record.auditConfiguration && 'config' in run.record.auditConfiguration ? run.record.auditConfiguration.config.checks : [],
        runner: this.options.commandExecution ?? runCommand });
      const invocationViews = replay === undefined ? await this.iterationViews(run, assignment) : [];

      // The invocation is built from its inputs by the engineer step's own
      // constructor, which `step render` uses too; the inputs are validated
      // here and written beside the invocation before it starts.
      let step: ConstructedEngineerStep;
      try {
        step = constructEngineerStep(await this.engineerStepInputs(run, {
          item, assignment, attempt, workingDirectory, bounds, beforeTree, views: invocationViews, scenarios: briefedScenarios,
          obligations: assignedObligations, assignmentPackage, featurePaths, focused, failedGate,
          handoff: handoff === undefined ? undefined : { ...handoff, returns: this.budgetReturns(run, assignment.id) },
          guidance: guidancePending,
          start: start.mode === 'continue'
            ? { kind: resume === undefined ? 'repair-continuation' : 'resumed-after-handback', session: session ?? '', point: start.ref }
            : { kind: 'fresh', ...(degraded === undefined || degraded.requested !== 'continued' ? {} : { degraded: { requested: 'continued', reason: degraded.reason } }) },
        }), { projectRoot: this.projectRoot, packages });
      } catch (error) {
        await this.fail(run, 'internal', `The engineer of ${assignment.id} cannot be constructed from its inputs: ${message(error)}`);
        return null;
      }
      const guarded = await protectedScopeOf(this.projectRoot, assignment.scope, step.equipment.protectedFiles, this.options.ramify);
      const tools = this.implementationTools(run, {
        workingDirectory: step.equipment.workingDirectory,
        scopeRevision: step.equipment.scopeRevision,
        guarded,
        commandTimeoutMs: step.equipment.commandTimeoutMs,
        submissions: step.equipment.submissions,
        focusedCommands: step.equipment.focusedCommands,
      });

      const result = replay ?? await this.runInvocation<EngineerSubmission>(run, agent, {
        role: step.role,
        originalInvocation: run.restoring && latestStart && !run.log.all('invocation-ended').some(event => event.data.invocation === latestStart.data.invocation) ? latestStart.data.invocation : undefined,
        task: step.task,
        brief: step.brief,
        context: step.context,
        stepInputs: step.before.inputs, consultationPackages: packages,
        workingDirectory: step.equipment.workingDirectory,
        work: step.work,
        attempt: step.attempt,
        loaded: step.loaded,
        systemPrompt: step.systemPrompt,
        prompt: step.prompt,
        start: step.start.mode === 'continue' ? { mode: 'continue', ref: step.start.ref } : { mode: 'fresh' },
        session,
        // The engineer is kept only after a proposed completion, and
        // continued only for the repair its failing gate asks for. The
        // harness point is its previous invocation's end: the note appended
        // before it is the executor's, and no other session starts from it.
        continuing: step.start.mode === 'continue' ? step.start.continuing : resume === undefined ? 'repair' : 'capability-returned',
        ...(replacing === undefined ? {} : { replaces: { session: replacing, reason: 'reconstructed' } }),
        ...(degraded === undefined ? {} : { degraded }),
        // A proposed completion is kept for the repair its gate may ask
        // for; a raw budget limit retains unfinished work and ends this run below.
        keep: (ended, value) => {
          if (ended === 'context-budget-reached') {
            return finished(this.budgetReturns(run, assignment.id) + 1 >= run.record.policy.limits.budgetReturnsPerIteration ? 'work-closed' : 'not-kept');
          }
          if (ended !== 'submitted' || value === undefined) return finished('not-kept');
          return value.kind === 'completion-proposed' || (value.kind === 'capability-needed' && this.workflow !== null)
            ? kept : finished('work-closed');
        },
        toolName: step.submission.toolName,
        description: step.submission.description,
        inputSchema: step.submission.inputSchema,
        submissionSchema: step.submission.submissionSchema,
        // A claimed completion is checked afresh over the write scope
        // before it is judged, because the hook checks saw only the
        // mutations they covered.
        beforeSubmission: async (input, signal) => { await tools.findingsAtCompletion(input, signal); },
        validate: async input => {
          const validated = validateEngineer(input, {
            capabilityWorkflow: step.validator.capabilityWorkflow,
            obligation: step.validator.obligation,
            kind: step.validator.kind,
            openFindings: tools.openFindings(),
            submissions: tools.submissions,
            assigned: step.validator.assigned,
            seams: {
              index: run.index,
              consumer: step.validator.consumer,
              providerOf: capability => committedRecords(run.log.ledger.replay()).registry.find(entry => entry.capability === capability)?.owner,
            },
          });
          // A capability-needed submission captures a provisional candidate
          // immediately after this invocation. Refuse unsafe scratch here so
          // the same engineer session can repair it before a tree is read.
          if (validated.ok && validated.value.kind === 'capability-needed') {
            const safety = await scratchSafetyRule(this.projectRoot, await declaredModuleDirectories(this.projectRoot), this.git);
            if (safety.outcome === 'failed') return { ok: false, errors: safety.violations.map(violation => ({
              path: 'scratch', message: `${violation.path}: ${violation.detail}`,
            })) };
          }
          return validated;
        },
        acceptedText: value => {
          const check = tools.completionCheck();
          return iterationAcceptance(value.kind, check?.kind === 'not-checked' ? check.reason : null);
        },
        scope: {
          write: assignment.scope.revision,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: null,
        },
        measured: { snapshot: baseline, scope: measurementScope, readScope: readScopeMeasurement(assignment.scope) },
        writer: true,
        ...(beforeTree === undefined ? {} : { candidateBefore: beforeTree }),
        guarded,
        readModules: assignment.scope.read,
        equip: tools.equip, previewEquipment: tools.preview,
        bounds: step.bounds,
        endedAs: () => (tools.exhausted() ? 'invalid-submission' : undefined),
      });
      const replayed = replay !== undefined;
      replay = undefined;
      if (!replayed && !invocations.includes(result.id)) invocations.push(result.id);
      guidancePending = undefined;
      sessionRef = result.kept && result.ref !== '' ? result.ref : undefined;
      session = sessionRef === undefined ? undefined : result.session;
      replacing = undefined;

      // The line events of this writer: its net change, from the two
      // snapshots around it. A change made and put back between them,
      // through any tool, delivered nothing and is rightly not counted.
      const after = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      const savedLines = replayed ? await readIfExists(run.path(runLayout.lineEvents(result.id))) : undefined;
      const parsedLines = savedLines === undefined ? null : lineEventSummarySchema.safeParse(JSON.parse(savedLines.toString('utf8')));
      const lines = parsedLines?.success ? parsedLines.data : replayed ? null
        : await this.recordLineEvents(run, result.id, before, after);
      if (this.ignoring(run)) return null;

      if (result.ended === 'context-budget-reached') {
        await this.fail(run, 'limit-exceeded', `Engineer ${result.id} reached its hard context limit without an accepted return; ${assignment.id} remains unfinished`, [runLayout.outcome(result.id)]);
        return null;
      }

      // An engineer that ended without a result, whether a bound, the
      // provider or the adapter ended it, it stopped on its own or its
      // submissions were rejected to the bound, leaves its iteration and not
      // the run: the iteration closes partial, what the session wrote stays
      // uncommitted in the tree as a partial report's does, and the local
      // architect decides what comes next, from the digest and the analysis
      // the harness prepares first. The work item's iteration bound counts
      // it like any other. A writer not confirmed settled blocks every later
      // writer and gate, so that failure still ends the run here.
      if (result.ended !== 'submitted' || result.value === undefined) {
        if (run.writer.isUnsettled) {
          await this.fail(
            run,
            result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
            `The engineer of ${assignment.id} ended without a result (${result.ended})`,
            [runLayout.outcome(result.id)],
          );
          return null;
        }
        findings.push(`${failedWithoutResult('engineer', assignment.id, result)}; nothing of it was committed, and what it wrote stays uncommitted in the tree`);
        const failure = await this.failureOf(run, agent, packages, {
          item, assignment, number, role: 'engineer', result, bounds, lines, after, shellLog: tools.shellLog(),
        });
        if (failure === null) return null;
        return close('partial', { failure });
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
          kind: 'closed',
          result: closed.result,
          need: {
            need,
            ...(result.value.suggestedProvider === undefined ? {} : { suggestedProvider: result.value.suggestedProvider }),
            ...(result.value.injectionSites === undefined ? {} : { injectionSites: result.value.injectionSites }),
            invocation: result.id,
          },
        };
      }

      if (result.value.kind === 'capability-needed') {
        if (this.workflow === null || result.ref === '' || !result.kept || run.writer.isUnsettled) {
          await this.fail(run, 'internal', 'The requesting engineer could not be retained after its writer settled');
          return null;
        }
        return { kind: 'capability-needed', summary: result.value.summary, need: result.value.request,
          invocation: result.id, session: result.session, point: result.ref };
      }

      const proposal = result.value;
      // The proposal's bindings apply at its acceptance, before the gate:
      // that gate's commit drops a bound scenario's pending tag, and the gate
      // selects it by identity. No gate outcome undoes a binding.
      if (!await this.handling.recordBindings(run, result.id, proposal.bindings)) return null;
      let infrastructureAttempt = 0;
      for (;;) {
        const gate = await this.gates.iterationGate(run, item, assignment, result.id, repairRound, infrastructureAttempt, proposal.summary);
        if (gate === null) return null;
        firstCause ??= { gate: gate.id, cause: gate.cause };

        if (gate.verdict === 'passed') {
          findings.push(...proposal.findings);
          const closed = await this.handling.closeIteration(run, item, number, assignment, {
            outcome: 'accepted',
            invocations,
            findings,
            gate: gate.id,
            commit: gate.audited,
            ...(proposal.recommendation === undefined ? {} : { recommendation: proposal.recommendation }),
          });
          // The candidate's reviews are requested before the driver passes
          // it; they run beside the next iteration's writer.
          if (closed.commit !== null) await this.handling.requestReviews(run, { workItem: assignment.coordination?.kind === 'capability-task'
            ? assignment.coordination.id : item.id, iteration: assignment.id, gate: gate.id, commit: closed.commit });
          await this.finishSession(run, session, 'work-closed');
          // The evidence this acceptance discharges: a provider that ran the
          // agreed suite against the real implementation has conformed, and a
          // verification that replaced every fake injection closes its
          // requirement.
          if (!await this.dischargeEvidence(run, item, assignment, gate.id, closed)) return null;
          return { kind: 'closed', result: closed };
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

    return this.runContractSession(run, agent, packages, baseline, item, assignment, loaded, {
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
      readonly injectionSites?: readonly string[] | undefined;
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
    if (run.restoring) {
      const original = run.log.all('contract-requested').find(event => event.data.workItem === item.id && event.data.requestedBy === request.requestedBy && event.data.invocation === request.invocation);
      if (original) {
        const assignment = records.assignments.get(original.data.iteration);
        if (!assignment) throw new Error('Original contract assignment is unavailable');
        const number = Number.parseInt(assignment.id.slice(assignment.id.lastIndexOf('.i') + 2), 10);
        return this.runContractSession(run, agent, packages, baseline, item, assignment, loaded, { need: request.need,
          provider: original.data.provider, capability: original.data.capability, number,
          requestedBy: { invocation: request.invocation, reason: 'contract-needed' } });
      }
    }
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
    // The submission judged each site against the view it had; the owner
    // the registry resolves now is the one the scope opens.
    const misplaced = (request.injectionSites ?? []).filter(site => {
      const owner = index === null ? undefined : moduleOwning(index, site);
      return owner === undefined || (owner.module !== item.module && owner.module !== entry.owner);
    });
    if (misplaced.length > 0) {
      return { findings: [`the injection site${misplaced.length === 1 ? '' : 's'} ${misplaced.map(site => `"${site}"`).join(', ')} ${misplaced.length === 1 ? 'lies' : 'lie'} in neither ${item.module} nor ${entry.owner}, and ${injectionSiteRule}; no contract iteration was started`] };
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

    const base = { module: item.module, included: [] as { directory: string; reason: string; instructions: string }[] };
    const scope = await this.contractScope(run, index, {
      revision: number,
      consumer: item.module,
      provider: entry.owner,
      providerDirectory,
      injectionSites: request.injectionSites ?? [],
      rationale: `The agreement between ${item.module} and ${entry.owner}: the contract, its conformance suite, its fake, the consumer's integration, the files the fake is injected in and the exposure declarations on the path between them. The rest of the provider's implementation is not this iteration's.`,
    });

    const subArtifacts = this.requiredArtifacts(committedRecords(run.log.ledger.replay()));
    const id = iterationId(item.id, number);
    const parentNumber = Number.parseInt(request.requestedBy.slice(request.requestedBy.lastIndexOf('.i') + 2), 10);
    const parentAssignment = iterationAssignmentSchema.safeParse(this.committedBody(run, iterationLayout.assignment(item.id, parentNumber)));
    if (!parentAssignment.success || parentAssignment.data.id !== request.requestedBy) {
      await this.fail(run, 'inputs-changed', `The requesting assignment ${request.requestedBy} cannot be read`);
      return null;
    }
    // A contract iteration inherits its requester's assignment package by
    // record: the same elements, deviations and hash.
    const assignment = iterationAssignmentSchema.parse({
      schema: 'ramify-agent.iteration-assignment/1',
      id,
      workItem: item.id,
      outline: refOf(item.id, outline.revision, outline),
      stage: 0,
      kind: 'contract',
      goal: `Establish the agreement that gives ${item.module} the behavior of "${entry.capability}", which ${entry.owner} owns, and integrate it in ${item.module} against a fake.`,
      approach: `${item.module} stated the need as behavior. Design the interface, write the conformance suite and the fake, integrate the fake at the seam where ${entry.owner}'s real export will act, exposed exactly as that export will be, and leave ${entry.owner} to implement the provider.`,
      scope,
      ...(parentAssignment.data.source === undefined ? {} : { source: parentAssignment.data.source }),
      externalCapabilities: [{ capability: entry.capability, owner: entry.owner, role: 'request' }],
      completionEvidence: `${item.module}'s own tests pass against the fake, and the fake passes the conformance suite.`,
      evidenceObligations: [],
      gate: { checkpoint: 'contract', tests: testPolicyOf('contract', base, []) },
      guarded: await captureGuardedFiles(this.projectRoot, subArtifacts.map(artifact => artifact.path), await this.guardedScenarioFiles(run), [...await this.auditPreparationPaths(run), ...scopeConfigurationPaths(scope)]),
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
    }, [
      { path: iterationLayout.assignment(item.id, number), id, revision: 1, body: assignment },
    ]);
    await this.afterWrite('contract-requested', run.record.jobId);
    if (this.ignoring(run)) return null;

    return this.runContractSession(run, agent, packages, baseline, item, assignment, loaded, {
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
      /** The files the agreement names as holding the fake, on either side. */
      readonly injectionSites: readonly string[];
      readonly rationale: string;
    },
  ) {
    return resolveWriteScope({ ramify: this.options.ramify,
      projectRoot: this.projectRoot,
      index,
      view: run.record.manifest.architectView,
      revision: subject.revision,
      base: { module: subject.consumer, included: [] },
      extra: [
        { path: `${subject.providerDirectory}/src/interfaces`, purpose: 'contract', kind: 'directory' },
        { path: `${subject.providerDirectory}/src/tests`, purpose: 'conformance', kind: 'directory' },
        { path: `${subject.providerDirectory}/src/fakes`, purpose: 'fake', kind: 'directory' },
        ...[...new Set(subject.injectionSites)].map(path => ({ path, purpose: 'fake-injection' as const })),
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
    packages: ReadonlyMap<string, LoadedPackage>,
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
    const savedResult = committedRecords(run.log.ledger.replay()).results.get(assignment.id);
    if (run.restoring && savedResult) return { findings: [...savedResult.findings], result: savedResult };
    // A revision its architect assigned may raise the bounds, as any
    // assignment may; a sub-session an engineer's need opened runs under
    // the policy's.
    const bounds = this.engineerBounds(run, assignment);
    const systemPrompt = renderContractPrompt(loaded, this.projectRoot, bounds.commandTimeoutMs);
    // Its write scope, and the provider whole: the agreement is written on
    // the provider's side of the boundary.
    const measurementScope = writeScopeMeasurement(assignment.scope, [subject.provider]);
    const priorStarts = run.log.all('invocation-started').filter(event => event.data.role === 'contract-engineer' && event.data.work.iteration === assignment.id);
    const priorGates = run.log.all('gate-attempted').flatMap(event => { const parsed = gateAttemptSchema.safeParse(this.committedBody(run, runLayout.gate(event.data.gate))); return parsed.success && parsed.data.subject.iteration === assignment.id ? [parsed.data] : []; });
    const latestStart = priorStarts.at(-1);
    let originalContractInvocation = run.restoring && latestStart && !priorGates.some(gate => gate.proposedBy === latestStart.data.invocation && gate.verdict !== 'passed') ? latestStart.data.invocation : undefined;
    const invocations: string[] = priorStarts.map(event => event.data.invocation);
    const findings: string[] = [];
    let sessionRef: string | undefined;
    /** The contract engineer's session while the harness keeps it; `sessionRef` is its executor's point. */
    let session: SessionId | undefined;
    let failedGate: { id: string; cause: string | null; summary: string[] } | undefined;
    let repairRound = priorGates.filter(gate => gate.next === 'repair').length;
    let attempt = originalContractInvocation ? priorStarts.length - 1 : priorStarts.length;
    const priorRepair = [...priorGates].reverse().find(gate => gate.next === 'repair');
    if (priorRepair) failedGate = await this.diagnosticsOf(run, priorRepair);
    if (latestStart) {
      const outcome = committedRecords(run.log.ledger.replay()).outcomes.get(latestStart.data.invocation);
      const ended = run.log.all('invocation-ended').find(event => event.data.invocation === latestStart.data.invocation);
      if (ended?.data.kept && outcome?.settled.confirmed && outcome.session?.ref) { session = latestStart.data.session; sessionRef = outcome.session.ref; }
    }

    for (;;) {
      if (this.ignoring(run)) return null;
      attempt += 1;
      const before = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      const guarded = await this.engineerGuard(run, assignment);
      const tools = this.implementationTools(run, {
        scopeRevision: assignment.scope.revision,
        guarded,
        commandTimeoutMs: bounds.commandTimeoutMs,
        submissions: { legalOutcomes: ['contract-proposed', 'partial', 'unsuitable'], completionOutcome: null },
      });
      const index = await this.refreshIndex(run);

      // The requester's assignment package reaches the session once.
      let assignmentPackage: string | undefined;
      try {
        if (assignment.source !== undefined) assignmentPackage = await this.packageText(run, assignment.source);
      } catch (error) {
        await this.fail(run, 'inputs-changed', `The assignment package of contract ${assignment.id} cannot be delivered: ${message(error)}`);
        return null;
      }

      const result = await this.runInvocation<ContractSubmission>(run, agent, {
        role: 'contract-engineer',
        originalInvocation: originalContractInvocation,
        task: { kind: 'contract', modules: [item.module, subject.provider, ...this.consumersOf(run, subject.capability, item.module)], goal: assignment.goal, requirements: [assignment.completionEvidence], omit: assignmentPackage === undefined ? [] : [assignmentPackage],
          literalSections: assignmentPackage === undefined ? [] : [{ key: 'support:assignment-package', text: assignmentPackage }] },
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
          ...(assignmentPackage === undefined ? {} : { package: assignmentPackage }),
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
        submissionSchema: 'ramify-agent.contract-submission/2',
        validate: input => validateContract(input, {
          index,
          consumer: item.module,
              exists: (path: string) => stat(join(this.projectRoot, path)).then(found => found.isFile(), () => false),
        }),
        scope: {
          write: assignment.scope.revision,
          measurement: run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null,
          size: null,
        },
        measured: { snapshot: baseline, scope: measurementScope, readScope: readScopeMeasurement(assignment.scope) },
        writer: true,
        guarded,
        readModules: assignment.scope.read,
        equip: tools.equip, previewEquipment: tools.preview,
        bounds: { idleMs: bounds.idleMs, absoluteMs: bounds.absoluteMs, commandTimeoutMs: bounds.commandTimeoutMs },
        endedAs: () => (tools.exhausted() ? 'invalid-submission' : undefined),
      });
      if (!invocations.includes(result.id)) invocations.push(result.id);
      originalContractInvocation = undefined;
      sessionRef = result.kept && result.ref !== '' ? result.ref : undefined;
      session = sessionRef === undefined ? undefined : result.session;

      const after = await takeLineSnapshot(this.projectRoot, this.accepted(run), this.git);
      const lines = await this.recordLineEvents(run, result.id, before, after);
      if (this.ignoring(run)) return null;

      // A hard limit is no accepted incomplete return and establishes no agreement.
      if (result.ended === 'context-budget-reached') {
        await this.fail(run, 'limit-exceeded', `Contract engineer ${result.id} reached its hard context limit without an accepted return; ${assignment.id} remains unfinished`, [runLayout.outcome(result.id)]);
        return null;
      }

      // A contract session that ended without a result is closed as a
      // threshold return is: it established no agreement, and its local
      // architect decides what comes next, from the digest and the analysis
      // prepared first. An unsettled writer still ends the run, as for the
      // engineer.
      if (result.ended !== 'submitted' || result.value === undefined) {
        if (run.writer.isUnsettled) {
          await this.fail(
            run,
            result.ended === 'invalid-submission' ? 'invalid-submission' : result.ended === 'failed' ? 'agent-failed' : 'internal',
            `The contract engineer of ${assignment.id} ended without a result (${result.ended})`,
            [runLayout.outcome(result.id)],
          );
          return null;
        }
        findings.push(`${failedWithoutResult('contract engineer', assignment.id, result)}; nothing was registered`);
        const failure = await this.failureOf(run, agent, packages, {
          item, assignment, number: subject.number, role: 'contract-engineer', result, bounds, lines, after, shellLog: tools.shellLog(),
        });
        if (failure === null) return null;
        const closed = await this.handling.closeIteration(run, item, subject.number, assignment, {
          outcome: 'partial', invocations, findings, gate: null, commit: null, failure,
        });
        await this.finishSession(run, session, 'work-closed');
        return this.ignoring(run) ? null : { findings, result: closed };
      }

      if (result.value.kind === 'incomplete') {
        findings.push(
          `the contract iteration ${assignment.id} did not establish the agreement, and registered nothing`,
          ...result.value.unfinished.map(entry => `unfinished: ${entry}`),
          ...result.value.findings,
        );
        const closed = await this.handling.closeIteration(run, item, subject.number, assignment, {
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
        const closed = await this.handling.closeIteration(run, item, subject.number, assignment, {
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
      const closed = await this.handling.closeIteration(run, item, subject.number, assignment, {
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
   * The contract gate: the project's committed audit of the candidate,
   * whose configured checks run the consumer's tests and the agreement's
   * conformance suite among the project's own, and the fake-naming rule the
   * harness verifies itself over the files this iteration wrote.
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
    if (run.restoring) {
      const original = run.log.all('gate-attempted').flatMap(event => { const parsed = gateAttemptSchema.safeParse(this.committedBody(run, runLayout.gate(event.data.gate))); return parsed.success && parsed.data.subject.iteration === assignment.id && parsed.data.proposedBy === invocation && parsed.data.checkpoint === 'contract' ? [parsed.data] : []; });
      if (original.length > 1) throw new Error('Ambiguous original contract gate');
      if (original[0]) {
        if (original[0].verdict === 'passed' && (original[0].audited === null || await this.candidates.commitTree(this.projectRoot, original[0].audited) !== (await this.previewCandidateTree()).tree)) throw new CandidateDriftError('Original contract gate candidate changed before registration');
        return original[0];
      }
    }
    const gateId = gateAttemptId(this.gates.gateCount(run) + 1);
    const index = await this.refreshIndex(run);

    const writeScope = writeScopePaths(this.projectRoot, assignment);
    // The agreement's own fakes are this gate's to answer; another
    // agreement's fake is judged too, attributed by the write scope. A
    // revision replaces the fakes of the revision in force.
    const declared: StandIn[] = submission.artifacts.fake.flatMap(entry => entry.standsFor.map(standsFor => ({
      contract: 'the agreement under this gate', fakePath: entry.path, standsFor, declaredHere: true,
    })));
    const parity = await this.gates.fakeExposureParityRule(index, [
      ...declared,
      ...this.gates.registeredStandIns(run, assignment.revisesContract?.id)
        .filter(standIn => !declared.some(own => own.fakePath === standIn.fakePath && own.standsFor.fake === standIn.standsFor.fake)),
    ], writeScope);
    const rules = [await this.fakeNamingRule(submission), ...(parity === null ? [] : [parity])];
    const modules = await this.gates.pendingModules(run, assignment.id);
    const attempt = await this.gates.committingCheckpoint(run, {
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
      guarded: this.gates.guardedAtGate(run, assignment.guarded),
      authorizations: assignment.authorizations.map(entry => ({ path: entry.path, by: entry.by })),
      rules,
    }, submission.summary, modules, assignment.goal);

    if (attempt.verdict !== 'passed') {
      return this.ignoring(run) ? null : attempt;
    }
    await this.afterWrite('gate-committed', run.record.jobId);
    if (this.ignoring(run)) return null;
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
    if (run.restoring) {
      const registered = run.log.all('contract-registered').find(event => event.data.iteration === assignment.id);
      const reopened = run.log.all('evidence-reopened').find(event => event.data.iteration === assignment.id);
      if (registered || reopened) {
        const phase = registered ?? reopened!;
        const nextRegistration = [...run.log.all('contract-registered'), ...run.log.all('evidence-reopened')].filter(event => event.sequence > phase.sequence).sort((left, right) => left.sequence - right.sequence)[0]?.sequence ?? Number.POSITIVE_INFINITY;
        const own = phase.data.requirements.map(id => records.requirements.get(id)).find(requirement => requirement?.consumer === item.module);
        const priorCycle = run.log.all('dependency-cycle-detected').find(event => event.sequence > phase.sequence && event.sequence < nextRegistration && event.data.closedBy === item.id && phase.data.requirements.some(id => event.data.requirements.includes(id)));
        const findings = registered ? [registered.data.mode === 'access-only'
          ? `the agreement ${registered.data.contract} establishes access to existing behavior: no obligation and no fake`
          : `the agreement ${registered.data.contract} is registered; ${own?.id ?? '(unavailable)'} is open and ${registered.data.obligation} is owed by ${submission.provider}`]
          : [`the agreement ${reopened!.data.contract} is reopened at revision ${reopened!.data.revision}; ${phase.data.requirements.join(', ')} verify again`,
            ...reopened!.data.bindings.map(binding => { const followUp = reopened!.data.followUps.find(entry => entry.workItem === binding.workItem); return followUp ? `${binding.subject.id} at revision ${binding.subject.revision} goes to ${followUp.workItem}, which follows ${followUp.follows}` : `${binding.subject.id} at revision ${binding.subject.revision} stays with ${binding.workItem}, which has not finished`; }),
            ...reopened!.data.superseded.map(id => `${id} closed as superseded: it was assigned under the previous revision`)];
        if (priorCycle) return { findings, cycle: { members: priorCycle.data.members, requirements: priorCycle.data.requirements, workItems: priorCycle.data.workItems } };
        if (phase.data.obligation === null) return { findings };
        if (!own || own.revision !== phase.data.revision) throw new Error('Original registered requirement identity is unavailable');
        const obligation = records.obligations.get(phase.data.obligation);
        if (!obligation || obligation.revision !== phase.data.revision) throw new Error('Original registered obligation identity is unavailable');
        const cycle = await this.checkDependencyGraph(run, item, { from: own.forCapability, to: obligation.capability, requirement: own.id, workItem: item.id });
        return cycle === undefined ? null : { findings, ...(cycle === null ? {} : { cycle }) };
      }
    }
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
      tests: mine?.evidence.tests ?? testPolicyOf('ordinary', { module: item.module, included: [] }, []),
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
    await this.handling.cleanupClosedScratch(run);
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
    }
    return true;
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

  /** The frozen baseline's snapshot, or null where it cannot be read, which leaves a size unmeasured rather than zero. */
  private async baselineSnapshot(run: Run): Promise<MeasurementSnapshot | null> {
    try {
      return measurementSnapshotSchema.parse(JSON.parse(await readFile(run.path(runLayout.measurement(snapshotId(1))), 'utf8')));
    } catch {
      return null;
    }
  }

  /** The reference to the frozen baseline an invocation records, or null where the run has none. */
  private baselineReference(run: Run): Invocation['scope']['measurement'] {
    return run.record.baseline && 'measurement' in run.record.baseline ? run.record.baseline.measurement : null;
  }

  /** Captures one writer invocation's line events from the two snapshots around it. */
  private async recordLineEvents(
    run: Run,
    invocation: string,
    before: LineSnapshot,
    after: LineSnapshot,
  ): Promise<LineEventSummary | null> {
    // An invocation the run's bounds refused was never started, and has no line events.
    if (invocation === '') return null;
    const summary = lineEvents({ invocation, before, after, index: run.index });
    await writeFileAtomic(run.path(runLayout.lineEvents(invocation)), `${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }

  /**
   * The inputs of one engineer invocation, collected from the run's records
   * and the project as they stand: everything the engineer step is built
   * from, with every path project-relative.
   */
  private async engineerStepInputs(run: Run, collected: {
    readonly item: WorkItem;
    readonly assignment: IterationAssignment;
    readonly attempt: number;
    readonly workingDirectory: string;
    readonly bounds: EngineerBounds;
    readonly beforeTree: string | undefined;
    readonly views: readonly IterationApiViews[];
    readonly scenarios: EngineerScenarios | undefined;
    readonly obligations: readonly AssignedObligation[];
    readonly assignmentPackage: string | undefined;
    readonly featurePaths: readonly string[];
    readonly focused: Awaited<ReturnType<typeof prepareAssignedCucumber>>;
    readonly failedGate: { readonly id: string; readonly cause: string | null; readonly summary: readonly string[] } | undefined;
    readonly handoff: { readonly done: readonly string[]; readonly unfinished: readonly string[]; readonly returns: number } | undefined;
    readonly guidance: string | undefined;
    readonly start: EngineerStepInputs['start'];
  }): Promise<EngineerStepInputs> {
    const { assignment } = collected;
    const record = committedRecords(run.log.ledger.replay()).assignments.get(assignment.id);
    const known = await this.knownProjectFacts(run, 'module' in assignment.scope.base ? [assignment.scope.base.module] : assignment.scope.base.modules);
    return engineerStepInputsOf({
      ...collected,
      consultation: engineerConsultationInputs(run.log.events, { planId: run.record.planId, runId: run.record.jobId }, assignment.id),
      run: { planId: run.record.planId, runId: run.record.jobId },
      base: this.accepted(run),
      capabilityWorkflow: this.workflow !== null,
      capabilityPolicy: run.record.policy.version === capabilityRunPolicyVersion,
      workingDirectory: this.projectRelative(collected.workingDirectory),
      testAreas: await this.ownedTestAreas(run, assignment.gate.tests),
      startingPoints: record === undefined ? null : this.assignmentStartingPoints(run, record),
      known,
      protectedFiles: await this.protectedFiles(run, assignment),
      limits: run.record.policy.limits,
      context: contextPolicyOf(run.record.policy, 'engineer'),
    });
  }

  /** A location beneath the project root as a project-relative path field. */
  private projectRelative(absolute: string): ProjectPath {
    const path = relative(this.projectRoot, absolute).split(sep).join('/');
    if (join(this.projectRoot, path) !== absolute) throw new Error(`${absolute} is not beneath the project root ${this.projectRoot}`);
    return projectPath(path);
  }

  /** The architect view a task names by default: the materialized view of the run, with the modules its index holds now. */
  private architectViewInputs(run: Run): OrientationStepInputs['architectView'] {
    const view = run.record.manifest.architectView;
    return view.status === 'materialized'
      ? [{ path: projectPath('.ramify-architect'), revision: view.revision, modules: [...(run.index?.modules.keys() ?? [])], coverage: [...view.coverageLimits] }]
      : [];
  }

  /** The bounds one iteration's engineers run under: the policy's, and what its assignment raised. */
  private engineerBounds(run: Run, assignment: IterationAssignment): EngineerBounds {
    return engineerBoundsFor(run.record.policy.limits, assignment);
  }

  /**
   * What an engineer that ended without a result leaves its local architect,
   * ready before the architect is briefed: the harness's digest, then the
   * failure analysis. Neither ends the run: what cannot be read is a gap in
   * the digest, and an analysis that fails is unavailable. Null only for a
   * run that is ending.
   */
  private async failureOf(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    subject: {
      readonly item: WorkItem;
      readonly assignment: IterationAssignment;
      readonly number: number;
      readonly role: Role;
      readonly result: InvocationResult<unknown>;
      readonly bounds: EngineerBounds;
      readonly lines: LineEventSummary | null;
      readonly after: LineSnapshot;
      readonly shellLog: readonly ShellCallRecord[];
    },
  ): Promise<NonNullable<IterationResult['failure']> | null> {
    const digest = await this.failureDigestOf(run, subject);
    const analysis = await this.analyzeFailure(run, agent, packages, subject, digest);
    if (this.ignoring(run)) return null;
    return { digest, analysis };
  }

  /** The digest of one failed invocation, from what the harness already holds. */
  private async failureDigestOf(
    run: Run,
    subject: {
      readonly role: Role;
      readonly result: InvocationResult<unknown>;
      readonly bounds: EngineerBounds;
      readonly lines: LineEventSummary | null;
      readonly after: LineSnapshot;
      readonly shellLog: readonly ShellCallRecord[];
    },
  ): Promise<FailureDigest> {
    const { result } = subject;
    const rejections = await ObservationLog.open(run.path(runLayout.observations(result.id)))
      .then(log => log.observations.flatMap(observation => (observation.type === 'rejection' ? [observation.data] : [])))
      .catch(() => []);
    const shellCalls: DigestShellCall[] = subject.shellLog.map(call => ({
      callId: call.callId,
      command: call.command,
      timeoutMs: call.timeoutMs,
      output: relative(run.directory, call.outputFile).split('\\').join('/'),
    }));
    // The complete output of each shell call in flight, which its tail is read from.
    const outputs = new Map<string, string>();
    for (const call of result.inFlight ?? []) {
      const shell = subject.shellLog.find(entry => entry.callId === call.callId);
      if (shell === undefined) continue;
      const text = await readFile(shell.outputFile, 'utf8').catch(() => undefined);
      if (text !== undefined) outputs.set(call.callId, text);
    }
    return failureDigest({
      invocation: result.id,
      role: subject.role,
      ended: result.ended,
      interruption: result.interruption,
      error: result.error,
      elapsedMs: result.elapsedMs ?? 0,
      bounds: subject.bounds,
      rejections,
      inFlight: result.inFlight ?? [],
      shellCalls,
      outputs,
      lines: subject.lines,
      uncommitted: subject.after.available ? subject.after.changes.length : null,
      lastMessage: result.lastText ?? null,
      transcript: runLayout.transcript(result.session),
    });
  }

  /**
   * The failure analysis: a model's account of one failed invocation, in a
   * reader session of its own, before the local architect is briefed. It
   * reads the evidence the harness writes into its working directory and
   * submits once. Whatever happens to it, it never fails the run: a missing
   * package, a refused start, a failed or invalid session and any error of
   * its own are an unavailable analysis with the reason.
   */
  private async analyzeFailure(
    run: Run,
    agent: AgentPort,
    packages: ReadonlyMap<string, LoadedPackage>,
    subject: { readonly item: WorkItem; readonly assignment: IterationAssignment; readonly number: number; readonly result: InvocationResult<unknown> },
    digest: FailureDigest,
  ): Promise<FailureAnalysis> {
    const unavailable = (reason: string, invocation: string | null = null): FailureAnalysis => ({ outcome: 'unavailable', invocation, reason });
    const loaded = packages.get('failure-analyst');
    if (loaded === undefined) return unavailable('no prompt package is loaded for the failure analyst');
    if (run.record.policy.context['failure-analyst'] === undefined) return unavailable(`the run's policy (${run.record.policy.version}) has no context policy for the failure analyst`);
    if (this.ignoring(run)) return unavailable('the run is ending');
    try {
      const recordOwner = subject.assignment.coordination?.kind === 'capability-task'
        ? subject.assignment.coordination.id : subject.item.id;
      const workspace = run.path(join(dirname(iterationLayout.result(recordOwner, subject.number)), 'failure-evidence'));
      const evidence = await this.failureEvidence(run, workspace, subject.result, digest);
      const attempt = run.log.all('invocation-started')
        .filter(event => event.data.role === 'failure-analyst' && event.data.work.iteration === subject.assignment.id).length + 1;
      const result = await this.runInvocation<FailureAnalysisSubmission>(run, agent, {
        role: 'failure-analyst',
        work: { workItem: subject.item.id, iteration: subject.assignment.id },
        attempt,
        loaded,
        systemPrompt: renderFailureAnalystPrompt(loaded, workspace),
        prompt: failureAnalysisMessage({
          iteration: subject.assignment.id,
          goal: subject.assignment.goal,
          projectRoot: this.projectRoot,
          runDirectory: run.directory,
          digest,
          evidence,
        }),
        start: { mode: 'fresh' },
        toolName: failureAnalysisToolName,
        description: failureAnalysisSubmissionDescription,
        inputSchema: failureAnalysisJsonSchema,
        submissionSchema: 'ramify-agent.failure-analysis-submission/1',
        validate: input => validateFailureAnalysis(input),
        keep: () => finished('work-closed'),
        scope: { write: null, measurement: null, size: null },
        reader: true,
        workingDirectory: workspace,
        absoluteMs: failureAnalysisMs,
        equip: () => ({ builtinTools: ['read', 'grep', 'ls'], tools: [] }),
      });
      if (result.id === '') return unavailable('the run\'s bounds refused its invocation');
      if (result.ended === 'submitted' && result.value !== undefined) {
        return { outcome: 'analyzed', invocation: result.id, ...result.value, evidence: [...result.value.evidence] };
      }
      const why = [result.interruption, result.error].filter(part => part !== undefined && part !== '').join(': ');
      return unavailable(`the analysis ended \`${result.ended}\`${why === '' ? '' : ` (${why})`}`, result.id);
    } catch (error) {
      this.warn(`Run ${run.record.jobId}: the failure analysis of ${subject.assignment.id} could not be run: ${message(error)}`);
      return unavailable(`it could not be run: ${message(error)}`);
    }
  }

  /**
   * The analyst's working directory: the digest, the failed invocation's
   * transcript as text, the complete outputs of its shell calls and the
   * patch of the uncommitted work. What cannot be written is named instead.
   */
  private async failureEvidence(run: Run, workspace: string, result: InvocationResult<unknown>, digest: FailureDigest): Promise<FailureEvidence> {
    const files: Array<{ path: string; holds: string }> = [];
    const missing: string[] = [];
    await mkdir(join(workspace, 'outputs'), { recursive: true });
    await writeFileAtomic(join(workspace, 'digest.md'), `${digestLines(digest, run.directory).join('\n')}\n`);
    files.push({ path: 'digest.md', holds: 'the digest above' });
    try {
      await this.transcriptOf(run, result.session).drain();
      const read = await readTranscript(run.path(runLayout.transcript(result.session)));
      const text = await renderTranscript(read.entries, result.id, body => readBody(run.directory, run.store, body));
      await writeFileAtomic(join(workspace, 'transcript.md'), text === '' ? '(the transcript holds no entry of this invocation)\n' : `${text}\n`);
      files.push({ path: 'transcript.md', holds: `the invocation's transcript, numbered as \`${digest.transcript}\` numbers it; a long one keeps its start and its end` });
    } catch (error) {
      missing.push(`the transcript, which could not be read: ${message(error)}`);
    }
    for (const output of digest.outputs) {
      const name = `outputs/${output.split('/').slice(-3).join('-')}`;
      try {
        const text = await readFile(run.path(output), 'utf8');
        await writeFileAtomic(join(workspace, name), text.length <= failureOutputCharacters ? text : `… ${text.length - failureOutputCharacters} characters of its start are left out …\n${text.slice(-failureOutputCharacters)}`);
        files.push({ path: name, holds: `the complete output of \`${output}\`` });
      } catch (error) {
        missing.push(`the output \`${output}\`, which could not be read: ${message(error)}`);
      }
    }
    try {
      const patch = await this.git.worktreePatch(this.projectRoot, this.accepted(run));
      await writeFileAtomic(join(workspace, 'diff.patch'), patch);
      files.push({ path: 'diff.patch', holds: `the patch of the tracked files against the last accepted commit \`${this.accepted(run)}\`${patch === '' ? '; it is empty' : ''}` });
    } catch (error) {
      missing.push(`the patch of the uncommitted work, which Git could not give: ${message(error)}`);
    }
    return { directory: workspace, files, missing };
  }

  /** The API views of the modules one iteration writes, for the engineer's briefing. */
  private async iterationViews(run: Run, assignment: IterationAssignment): Promise<IterationApiViews[]> {
    return iterationApiViews(this.options.ramify, this.projectRoot, run.index, assignment.scope.base);
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

  /** Context-budget returns belong to the durable capability task, including
   * turns reconstructed into fresh coordinator sessions. */
  private capabilityBudgetReturns(run: Run, task: string): number {
    const records = committedRecords(run.log.ledger.replay());
    return run.log.all('invocation-ended')
      .filter(event => event.data.ended === 'context-budget-reached')
      .filter(event => records.invocations.get(event.data.invocation)?.work.capabilityTask === task)
      .length;
  }

  /** How many sessions of this work item were reconstructed, counted over committed history. */
  private reconstructions(run: Run, workItem: string, iteration?: string): number {
    const records = committedRecords(run.log.ledger.replay());
    return [...records.invocations.values()]
      .filter(invocation => (iteration === undefined ? invocation.work.workItem === workItem : invocation.work.iteration === iteration)
        && invocation.session.requested !== invocation.session.actual)
      .length;
  }

  private settleSession(run: Run, id: string, session: AgentSession, reader = false) {
    return this.runner.settleSession(run, id, session, reader);
  }

  private endInvocation(
    run: Run,
    id: string,
    session: SessionId,
    keeping: SessionKeeping,
    body: Omit<InvocationOutcome, 'schema' | 'invocation'>,
    degraded?: DegradeRelation,
    transcript?: InvocationTranscript,
  ): Promise<void> {
    return this.runner.endInvocation(run, id, session, keeping, body, degraded, transcript);
  }

  /**
   * Readiness, with its bounded recovery. A failure a preparation can repair
   * consumes one recovery and the next attempt runs; one it cannot consumes
   * none and ends the run at once with the step that failed.
   */
  private async reachReadiness(run: Run): Promise<boolean> {
    const controller = new AbortController();
    let markSettled!: () => void;
    const settled = new Promise<void>(resolve => { markSettled = resolve; });
    run.readiness = { controller, settled };
    try {
      return await this.reachReadinessOwned(run, controller.signal);
    } finally {
      markSettled();
      if (run.readiness?.controller === controller) run.readiness = undefined;
    }
  }

  private async reachReadinessOwned(run: Run, signal: AbortSignal): Promise<boolean> {
    if (run.log.find('readiness-passed')) return true;
    const bound = run.record.policy.limits.readinessRecoveries;

    for (;;) {
      if (this.ignoring(run)) return false;
      run.writer.requireSettled('Readiness cannot run');

      const attemptNumber = run.log.count('readiness-passed') + run.log.count('readiness-failed') + 1;
      const gateId = gateAttemptId(this.gates.gateCount(run) + 1);
      // Readiness runs on the branch the project is on. Its last step
      // creates the run branch, once the repository is clean and the
      // baseline passed; a branch git refuses fails readiness there.
      const head = await this.git.currentHead(this.projectRoot);
      await this.write(run, { type: 'gate-started', data: { gate: gateId, checkpoint: 'readiness' } });
      let result = await runReadiness(this.options.configuredAudit, {
        runId: run.record.jobId,
        attempt: attemptNumber,
        projectRoot: this.projectRoot,
        gateDirectory: run.path(runLayout.gateOutput(gateId)),
        gateId,
        policy: run.record.policy,
        projectConfig: run.record.projectConfig,
        auditConfiguration: run.record.auditConfiguration,
        index: run.index,
        ramify: this.options.ramify,
        git: this.git,
        head,
        signal,
        commandExecution: this.options.commandExecution,
        started: this.gates.commandStarted(run, gateId, 'readiness'),
        waiting: this.gates.commandWaiting(run, gateId, 'readiness'),
      });

      // A stop can be accepted between the last readiness step and this
      // record. Keep the attempt, but never publish a readiness pass then.
      if ((signal.aborted || this.ignoring(run)) && result.attempt.verdict === 'passed') {
        result = { ...result, attempt: readinessAttemptSchema.parse({ ...result.attempt,
          steps: result.attempt.steps.map(step => step.step === 'run-branch'
            ? { ...step, outcome: 'not-verified', detail: 'readiness was cancelled before publication' } : step),
          verdict: 'failed',
        }) };
      }
      if (this.closed) return false;

      if (result.attempt.verdict === 'passed' && result.gate !== null && !signal.aborted && !this.ignoring(run)) {
        await this.write(run, { type: 'readiness-passed', data: { attempt: attemptNumber, gate: gateId } }, [
          { path: runLayout.gate(gateId), id: gateId, revision: 1, body: result.gate },
          ...readinessAuditOutcome(result.gate),
          { path: runLayout.readiness(attemptNumber), id: String(attemptNumber), revision: 1, body: result.attempt },
        ]);
        await this.afterWrite('readiness-attempted', run.record.jobId);
        return true;
      }

      const step = failingStep(result.attempt);
      const plan = signal.aborted || this.ignoring(run) ? null : recoveryFor(result.attempt, result.gate, run.record.policy);
      const spent = run.log.all('readiness-failed').filter(event => event.data.recovery !== null).length;
      const recoverable = plan !== null && spent < bound && !signal.aborted && !this.ignoring(run);

      let recovery = null;
      if (recoverable) {
        recovery = await performRecovery({
          id: recoveryId(spent + 1),
          attempt: attemptNumber,
          plan,
          projectRoot: this.projectRoot,
          policy: run.record.policy,
          auditConfiguration: run.record.auditConfiguration,
          ramify: this.options.ramify,
          commandExecution: this.options.commandExecution,
          count: spent + 1,
          directory: run.path('recoveries'),
          signal,
        });
      }

      const attempt = withRecovery(result.attempt, recovery?.id ?? null);
      const records = [
        ...(result.gate === null ? [] : [{ path: runLayout.gate(gateId), id: gateId, revision: 1, body: result.gate }, ...readinessAuditOutcome(result.gate)]),
        { path: runLayout.readiness(attemptNumber), id: String(attemptNumber), revision: 1, body: attempt },
        ...(recovery === null ? [] : [{ path: runLayout.recovery(recovery.id), id: recovery.id, revision: 1, body: recovery }]),
      ];
      const final = recovery === null || recovery.outcome === 'failed';
      await this.write(run, {
        type: 'readiness-failed',
        data: { attempt: attemptNumber, gate: gateId, step: step?.step ?? 'unknown', detail: step?.detail ?? '', recovery: recovery?.id ?? null, final },
      }, records);
      await this.afterWrite('readiness-attempted', run.record.jobId);

      if (signal.aborted || this.ignoring(run)) return false;

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
  private async finalGate(run: Run, binding: { candidateId: string; assessment: Assessment }): Promise<void> {
    run.writer.requireSettled('The final gate cannot run');
    const sourceChanges = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (sourceChanges.length > 0) {
      await this.fail(run, 'inputs-changed', `The captured plan evidence changed before final publication: ${sourceChanges.join('; ')}`, [runLayout.documentManifest]);
      return;
    }
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
    const beforeGate = await this.previewCandidateTree();
    if (beforeGate.tree !== binding.assessment.candidate.tree) {
      await this.fail(run, 'inputs-changed', 'The source tree changed after non-functional assessment', [runLayout.assessment(binding.assessment.id)]);
      return;
    }
    const previousFinal = run.log.all('gate-attempted').find(event => event.data.checkpoint === 'final');
    const gateId = previousFinal?.data.gate ?? gateAttemptId(this.gates.gateCount(run) + 1);
    let attempt: GateAttempt;
    if (previousFinal !== undefined) {
      const recorded = await readCommitted(run.log.ledger, runLayout.gate(gateId), runSchemas.gate);
      if (recorded.kind !== 'valid') {
        await this.fail(run, 'recovery-exhausted', `Final gate ${gateId} record is unavailable`);
        return;
      }
      attempt = recorded.value;
    } else {
      const head = await this.git.currentHead(this.projectRoot);
      try {
        attempt = await this.gates.committingCheckpoint(run, {
          id: gateId,
          runId: run.record.jobId,
          checkpoint: 'final',
          projectRoot: this.projectRoot,
          directory: run.path(runLayout.gateOutput(gateId)),
          head,
          policy: run.record.policy,
          proposedBy: null,
        }, undefined, undefined, undefined, binding);
      } catch (error) {
        if (!(error instanceof CandidateDriftError)) throw error;
        await this.fail(run, 'inputs-changed', error.message, [runLayout.assessment(binding.assessment.id)]);
        return;
      }
    }

    if (attempt.audited !== null && attempt.evidence !== null) {
      const auditedTree = await this.candidates.commitTree(this.projectRoot, attempt.audited);
      if (auditedTree !== binding.assessment.candidate.tree) {
        await this.fail(run, 'inputs-changed', `Final gate audited tree ${auditedTree}, not assessed tree ${binding.assessment.candidate.tree}`,
          [runLayout.assessment(binding.assessment.id), runLayout.gate(gateId)]);
        return;
      }
      const existingBinding = run.log.all('candidate-bound-to-gate').find(event => event.data.gate === gateId);
      if (existingBinding !== undefined && (existingBinding.data.assessment !== binding.assessment.id
        || existingBinding.data.candidate !== binding.candidateId || existingBinding.data.tree !== auditedTree
        || existingBinding.data.commit !== attempt.audited)) {
        await this.fail(run, 'recovery-exhausted', `Final gate ${gateId} has a conflicting candidate binding`);
        return;
      }
      if (existingBinding === undefined) await this.write(run, { type: 'candidate-bound-to-gate', data: {
        candidate: binding.candidateId, assessment: binding.assessment.id, gate: gateId,
        commit: attempt.audited, tree: auditedTree,
      } });
    }
    if (attempt.verdict === 'passed' && (attempt.audited === null || attempt.evidence === null
      || run.log.all('candidate-bound-to-gate').at(-1)?.data.gate !== gateId)) {
      await this.fail(run, 'recovery-exhausted', 'The final gate passed without durable candidate-bound audit evidence', [runLayout.gate(gateId)]);
      return;
    }

    if (attempt.verdict !== 'passed') {
      await this.fail(run, attempt.verdict === 'not-verified' ? 'recovery-exhausted' : 'repair-exhausted',
        `The final gate did not pass: ${attempt.verdict}${attempt.cause === null ? '' : ` (${attempt.cause})`}`, [runLayout.gate(gateId)]);
      return;
    }

    if (previousFinal === undefined) await this.afterWrite('gate-committed', run.record.jobId);
    if (this.ignoring(run)) return;
    const lateSourceChanges = await documentChanges(this.projectRoot, run.record.planId, run.directory, run.record.manifest);
    if (lateSourceChanges.length > 0) {
      await this.fail(run, 'inputs-changed', `The captured plan evidence changed during final verification: ${lateSourceChanges.join('; ')}`, [runLayout.documentManifest, runLayout.gate(gateId)]);
      return;
    }
    const afterGate = await this.previewCandidateTree();
    if (afterGate.tree !== binding.assessment.candidate.tree) {
      await this.fail(run, 'inputs-changed', 'The source tree changed during final verification', [runLayout.assessment(binding.assessment.id), runLayout.gate(gateId)]);
      return;
    }
    if (run.record.policy.version === capabilityRunPolicyVersion) {
      const blockers = committedRecords(run.log.ledger.replay()).workItems.flatMap(item =>
        this.capabilityBlockers(run, item.id));
      if (blockers.length > 0) {
        await this.fail(run, 'acceptance-incomplete', `Final completion has unresolved capability work: ${blockers.join('; ')}`);
        return;
      }
    }
    const workItems = run.log.count('work-item-completed');
    // A run that recorded plan deviations completes with them to review,
    // never plainly: the count is of those still awaiting the person.
    const deviations = [
      ...run.log.all('plan-deviation-recorded').map(event => event.data.checkFinding),
      ...run.log.all('nonfunctional-deviation-recorded').map(event => event.data.checkFinding),
    ];
    const findings = checkFindingStateOf(run.log.ledger).findings;
    const toReview = deviations.filter(id => findings.get(id)?.pendingUserDecision != null).length;
    await this.endRun(run, {
      type: 'job-completed',
      data: { gate: gateId, commit: attempt.audited, workItems, ...(deviations.length === 0 ? {} : { planDeviations: toReview }) },
    });
    await this.afterWrite('job-completed', run.record.jobId);
  }

  /** A recoverable setup on the run branch, before feature or iteration files are written. */
  private async setupScratch(run: Run): Promise<void> {
    if (run.log.find('scratch-setup-complete') !== undefined) return;
    run.writer.requireSettled('Scratch setup cannot run');
    try {
      await this.performScratchSetup(run, false);
      await this.afterWrite('scratch-setup-complete', run.record.jobId);
    } catch (error) {
      if (!(error instanceof ScratchSetupRefusal)) throw error;
      await this.fail(run, 'readiness-failed', `Scratch setup failed before work: ${message(error)}`);
    }
  }

  private async performScratchSetup(run: Run, recovering: boolean): Promise<{ commit: string | null; appended: boolean }> {
    const ignoreFile = join(this.projectRoot, '.gitignore');
    const ignoreInfo = await lstat(ignoreFile).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (ignoreInfo?.isSymbolicLink()) throw new ScratchSetupRefusal(`project .gitignore is a symlink: ${ignoreFile}`);
    if (ignoreInfo !== null && !ignoreInfo.isFile()) throw new ScratchSetupRefusal(`project .gitignore is not a file: ${ignoreFile}`);
    const original = recovering
      ? run.log.find('scratch-setting-up')?.data.originalIgnoreBase64
      : await readFile(ignoreFile).then(bytes => bytes.toString('base64'), (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      });
    if (original === undefined) throw new Error('Scratch setup recovery has no original .gitignore');
    return run.mutex.run(() => run.log.ledger.effect<{ commit: string | null; appended: boolean }>({
      key: 'scratch-setup',
      intent: { event: run.log.next({ type: 'scratch-setting-up', data: { originalIgnoreBase64: original } }), records: [] },
      perform: async () => {
        await this.afterWrite('scratch-setting-up', run.record.jobId);
        if (recovering) {
          const committed = await this.git.findCommitByTrailers(this.projectRoot, [
            { key: 'Ramify-Run', value: run.record.jobId },
            { key: 'Ramify-Scratch', value: 'setup' },
          ]);
          if (committed !== null) return { commit: committed, appended: true };
        }
        let committed: string | null = null;
        let appended = false;
        try {
          const modules = await declaredModuleDirectories(this.projectRoot);
          const prepared = await ensureScratchRule(this.projectRoot, modules, this.git);
          if (prepared.appended) await this.afterWrite('scratch-rule-appended', run.record.jobId);
          if (!prepared.appended && !recovering) return { commit: null, appended: false };
          const changed = await this.git.changedPaths(this.projectRoot, this.accepted(run));
          if (changed.some(path => path !== '.gitignore')) {
            throw new ScratchSetupRefusal(`unexpected working-tree changes: ${changed.join(', ')}`);
          }
          appended = prepared.appended || changed.length > 0;
          if (changed.length > 0) {
            await assertScratchSafe(this.projectRoot, modules, this.git);
            committed = await this.git.commitAccepted(this.projectRoot, [
              'Prepare module scratch ignore rule', '',
              `Ramify-Run: ${run.record.jobId}`,
              'Ramify-Scratch: setup', '',
            ].join('\n'));
            if (committed === null) throw new ScratchSetupRefusal('the .gitignore change made no commit');
          }
        } catch (error) {
          if (committed !== null) throw error;
          const restoreInfo = await lstat(ignoreFile).catch((issue: unknown) => {
            if ((issue as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw issue;
          });
          if (restoreInfo?.isSymbolicLink()) throw new ScratchSetupRefusal(`project .gitignore became a symlink: ${ignoreFile}`);
          if (original === null) await rm(ignoreFile, { force: true });
          else await writeFile(ignoreFile, Buffer.from(original, 'base64'));
          throw error instanceof ScratchIgnoreConflictError
            ? new ScratchSetupRefusal(error.message)
            : error;
        }
        if (committed !== null) await this.afterWrite('scratch-committed', run.record.jobId);
        return { commit: committed, appended };
      },
      complete: result => ({ event: run.log.next({ type: 'scratch-setup-complete', data: result }), records: [] }),
    }));
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
    if (this.gates.expectedFeatures(run).length === 0) return;
    run.writer.requireSettled('The feature files cannot be written');
    await this.performMaterialization(run, false);
    await this.afterWrite('scenarios-materialized', run.record.jobId);
  }

  /** The materialization effect, from its intent or, on recovery, from the intent the log holds. */
  private async performMaterialization(run: Run, recovering: boolean): Promise<{ commit: string | null; files: string[] }> {
    const expected = this.gates.expectedFeatures(run);
    const files = expected.map(file => file.path);
    return run.mutex.run(() => run.log.ledger.effect<{ commit: string | null; files: string[] }>({
      key: 'scenarios-materialize',
      intent: { event: run.log.next({ type: 'scenarios-materializing', data: { files } }), records: [] },
      perform: async () => {
        await this.afterWrite('scenarios-materializing', run.record.jobId);
        const message = materializationMessage({
          planId: run.record.planId, runId: run.record.jobId, files, scenarios: trackedScenarios(run.log.ledger.replay()).records.length,
        });
        await assertScratchSafe(this.projectRoot, await declaredModuleDirectories(this.projectRoot), this.git);
        const commit = await commitForMaterialization(this.projectRoot, run.record.jobId, message, recovering, this.git, commit => this.verifyProducerCommit(expected, commit), () => this.renderProducerFeatures(run, expected));
        await this.afterWrite('scenarios-committed', run.record.jobId);
        return { commit, files };
      },
      complete: result => ({ event: run.log.next({ type: 'scenarios-materialized', data: result }), records: [] }),
    }));
  }

  /** Recovery proves producer content from Git objects, not merely matching trailers. */
  private async verifyProducerCommit(files: readonly RenderedFeatureFile[], commit: string): Promise<void> {
    const expected = new Map(files.map(file => [file.path, file.content]));
    const changed = await this.git.commitNameStatus(this.projectRoot, commit, undefined, { requireSingleParent: true });
    if (changed.some(change => !expected.has(change.path) || change.status === 'D')) throw new Error(`Recovered scenario producer commit ${commit} includes unrelated paths`);
    const entries = await this.candidates.treeEntries(this.projectRoot, commit);
    for (const [path, content] of expected) {
      if (!entries.some(entry => entry.path === path && ['file', 'executable'].includes(entry.kind)) ||
          await this.candidates.readBlob(this.projectRoot, commit, path) !== content) throw new Error(`Recovered scenario producer commit ${commit} does not contain exact rendered bytes: ${path}`);
    }
  }

  /** Standalone producer effects refuse all dirt except their exact rendered files. */
  private async renderProducerFeatures(run: Run, expected: readonly RenderedFeatureFile[]): Promise<void> {
    const answer = await this.gates.validateFeatureTargets(expected);
    await rerenderFeatureFiles(this.projectRoot, [...expected]);
    const changed = await this.git.changedPaths(this.projectRoot, await this.git.currentHead(this.projectRoot));
    const hashes = new Map(expectedFeatureHashes(expected).map(file => [file.path, file.hash]));
    const unrelated: string[] = [];
    for (const path of changed) {
      const hash = hashes.get(path);
      if (hash === undefined || !await this.gates.renderedFeatureAllowed(path, hash, answer)) unrelated.push(path);
    }
    if (unrelated.length > 0) throw new Error(`Scenario producer commit refuses unrelated candidate changes: ${unrelated.join('; ')}`);
  }

  /**
   * What an assignment guards of the scenarios: every tracked feature file
   * with the hash of the rendering the harness last wrote, once the files
   * are materialized.
   */
  private async guardedScenarioFiles(run: Run): Promise<GuardedScenarioFiles> {
    const expected = run.log.find('scenarios-materialized') === undefined ? [] : expectedFeatureHashes(this.gates.writtenFeatures(run));
    return { expected };
  }

  /** Every captured source document remains immutable for every writer of the run. */
  /**
   * The guard of one engineer invocation over its assignment's scope. The
   * files only the harness writes and the guarded files no authorization
   * names are refused outright; the latter are marked, so the refusal says
   * that an architect's authorization would open them.
   */
  private async engineerGuard(run: Run, assignment: IterationAssignment) {
    return protectedScopeOf(this.projectRoot, assignment.scope, await this.protectedFiles(run, assignment), this.options.ramify);
  }

  /** The project-relative files one assignment's engineer may never write: the run's own, and the guarded files no authorization opened. */
  private async protectedFiles(run: Run, assignment: IterationAssignment): Promise<{ harness: string[]; unauthorized: string[] }> {
    return { harness: await this.harnessFiles(run),
      unauthorized: unauthorizedGuardedOf(assignment) };
  }

  /** The project-relative files only the harness writes: the tracked feature files and the captured documents. */
  private async harnessFiles(run: Run): Promise<string[]> {
    const features = trackedScenarios(run.log.ledger.replay()).records.map(record => record.file);
    const documents = (await readCapturedDocuments(run.directory, run.record.manifest)).manifest.documents.map(document => document.path);
    return [...features, ...documents];
  }

  private async deniedFiles(run: Run): Promise<string[]> {
    return deniedFiles(this.projectRoot, await this.harnessFiles(run));
  }

  /** Committed audit preparation inputs, converted to paths in this project. */
  private async auditPreparationPaths(run: Run): Promise<string[]> {
    return auditPreparationPathsOf(this.options.ramify, this.projectRoot, run.record.auditConfiguration);
  }

  // Scenario states, architecture §7 to §9

  /** The work item's entry or integration scenario and the run's tracked scenarios, which a declaration is judged against. */
  /** The one obligation projection: scenario records, delegated outcomes and the accepted registrations and reports. */
  private obligationProjection(run: Run): ObligationProjection {
    return obligationProjection(run.log);
  }

  /**
   * What an architect's briefing says about the obligations it reports on:
   * each with its status, binding and last report, and then, separately,
   * the accepted source each report was made against where that source has
   * moved on since. The second part is provenance the architect may inspect;
   * the harness revises, resets or questions no report because of it.
   */
  private obligationBriefing(run: Run, actor: Pick<ObligationActor, 'kind' | 'id'>): string[] {
    const owned = obligationsOwnedBy(this.obligationProjection(run), actor);
    const lines = obligationBriefingLines(owned);
    if (lines.length === 0) return lines;
    const entries = run.log.ledger.replay();
    const source = reportSourceLines(owned, sequence => acceptedCommit(entries.slice(0, sequence), run.base), acceptedCommit(entries, run.base));
    return source.length === 0 ? lines : [...lines, '', ...source];
  }

  /**
   * What each obligation an assignment names is, for the engineer's
   * briefing: a scenario's name, a delegated outcome, a registered case or a
   * registered test's description.
   */
  private assignedObligations(run: Run, ids: readonly string[]): AssignedObligation[] {
    const { obligations } = this.obligationProjection(run);
    const names = new Map(trackedScenarios(run.log.ledger.replay()).records.map(record => [record.id, record.name]));
    return ids.map(id => {
      const obligation = obligations.get(id);
      if (obligation === undefined) return { id, text: null };
      if (obligation.kind === 'scenario') {
        const name = names.get(id);
        return { id, text: name === undefined ? 'scenario' : `scenario "${name}"` };
      }
      if (obligation.kind === 'outcome') return { id, text: obligation.case === null ? 'delegated outcome' : `registered case ${obligation.case}` };
      return { id, text: obligation.description === null ? 'registered test' : `registered test: ${obligation.description}` };
    });
  }

  /**
   * The work item's scenarios not yet `done`: its entry's, or an integration
   * work item's one scenario. A provider or follow-up work item has none.
   */
  private unfinishedScenarios(run: Run, item: WorkItem): Array<{ id: string; state: ScenarioState }> {
    const entry = 'entry' in item.origin ? item.origin.entry : null;
    const integration = integrationScenarioOf(item);
    if (entry === null && integration === null) return [];
    const tracked = trackedScenarios(run.log.ledger.replay());
    return tracked.records
      .filter(record => (integration === null ? record.kind === 'entry' && record.entry === entry : record.id === integration))
      .map(record => ({ id: record.id, state: tracked.states.get(record.id) ?? 'pending' }))
      .filter(scenario => scenario.state !== 'done');
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
    return integrationBriefing(this.projectRoot, record, records);
  }

  /**
   * What an engineer is told of its work item's scenarios: its entry's, or
   * an integration work item's one scenario with its sub-scenarios' step
   * files. Undefined for a provider, follow-up or capability-task
   * iteration, whose briefing says nothing about scenarios beyond the
   * obligations its assignment names.
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
   * The integration work items a done report of one scenario makes due, as
   * the records its `obligation-reported` commits: one per integration
   * scenario whose last sub-scenario this is (architecture §10). Only done
   * reports schedule one; no gate or audit result does. Committed after
   * every earlier work item, it queues behind the current one, since work
   * items run one at a time.
   */
  private integrationItemsDue(run: Run, scenario: string): CommitRecord[] {
    return integrationItemsDue(run.log, scenario);
  }

  /**
   * The last refusal of a completion request the bound allows: the run fails
   * with the requirements as evidence where one is open or owed, and with
   * the unresolved capability work otherwise. A missing done report is no
   * refusal here: validation rejects that request in its own turn.
   */
  private async refuseCompletion(
    run: Run,
    item: WorkItem,
    refusals: number,
    blocked: readonly string[],
    owing: { readonly open: readonly ConsumerRequirement[]; readonly owed: boolean },
  ): Promise<void> {
    if (owing.open.length > 0 || owing.owed) {
      await this.fail(run, 'unresolvable-requirement',
        `${item.id} asked for completion ${refusals} times with evidence still owed: ${blocked.join('; ')}`,
        owing.open.map(requirement => contractsLayout.requirement(requirement.id, requirement.revision)));
      return;
    }
    await this.fail(run, 'acceptance-incomplete', `${item.id} asked for completion ${refusals} times with capability work unresolved: ${blocked.join('; ')}`);
  }

  /**
   * What a failing gate tells its reader: every command that did not pass
   * with what it reported, raw. No cause is inferred and no repair owner is
   * named: what a failure means is the reader's to judge.
   */
  private async diagnosticsOf(run: Run, gate: GateAttempt, audience: GateAudience = 'engineer'): Promise<{ id: string; cause: string | null; summary: string[] }> {
    const { records } = trackedScenarios(run.log.ledger.replay());
    const waiting = new Map(run.log.all('gate-command-waiting')
      .filter(event => event.data.gate === gate.id)
      .map(event => [event.data.position, event.data.line] as const));
    return gateDiagnostics(gate, audience, new Map(records.map(record => [record.id, record.name])), waiting);
  }

  /**
   * The tracked scenarios an accepted iteration's gate audit passed, read
   * from its raw runner output, each with the step definitions that bound
   * it, for the local architect: binding is recorded, not policed, and this
   * is where the architect sees it. Display only.
   */
  private async passedScenarioLines(run: Run, result: IterationResult): Promise<string[]> {
    if (result.outcome !== 'accepted' || result.gate === null) return [];
    const gate = await this.readGate(run, result.gate);
    if (gate === null) return [];
    const { records } = trackedScenarios(run.log.ledger.replay());
    return passedScenarioLines(gate, new Map(records.map(record => [record.id, record.name])));
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
        run.readiness?.controller.abort();
        run.reviews?.close();
        for (const preparation of run.reviewPreparations.values()) preparation.abort();
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
      if (this.sessionOperations && await this.sessionOperations.then(operations => operations.close(), () => true) === false) throw new Error('Session operation settlement is unavailable; its project lock remains held');
      await this.options.lock.release();
    });
  }
}

/**
 * What one unresolved request resolved to: a placement fix, a plan deviation
 * the work item goes on under, or an environment problem the operator
 * answered by resuming the run, with their note.
 */
type UnresolvedResolution =
  | { readonly kind: 'decided'; readonly decision: PlacementDecision }
  | { readonly kind: 'deviation'; readonly deviation: PlanDeviation }
  | { readonly kind: 'environment'; readonly problem: EnvironmentProblem; readonly note: string };

/** What one placement request resolved to, for the local architect that made it. */
/** A work item's package as its local architect holds it: the selection that cites it, the citation and its text. */
interface WorkPackage {
  readonly selection: string;
  readonly citation: PackageCitation;
  readonly text: string;
}

type PlacementResolution =
  | { readonly kind: 'decided'; readonly decision: PlacementDecision }
  | { readonly kind: 'unresolved'; readonly request: string; readonly findings: readonly string[]; readonly gaps: readonly string[] };

/** What the parent append did, as the effect's completion records it, with the session that holds the context. */
type AppendResult =
  | { readonly outcome: 'appended' | 'already-present'; readonly generation: number; readonly session: SessionId; readonly ref: string }
  | { readonly outcome: 'session-lost'; readonly generation: number; readonly session: SessionId | null; readonly reason: string };

/** The records the placement rules are checked against, as the log holds them. */

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

function preparedGate(operation: GateOperation): PreparedGate {
  return {
    checkpoint: operation.checkpoint,
    request: {
      ...operation.request,
      checks: [],
    },
    guardedChanges: [...operation.guardedChanges],
    rules: [...operation.rules],
    unauthorized: operation.unauthorized,
    ruleFailed: operation.ruleFailed,
    decisive: [],
    timeoutMs: operation.timeoutMs,
  };
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

/** How long a failure analysis may run: it reads a bounded set of files and submits once. */
const failureAnalysisMs = 600_000;

/** How much of one command output the analyst is given, from its end. */
const failureOutputCharacters = 400_000;

/**
 * Why one implementation session ended without a result, as its local
 * architect reads it: the bound or fault that ended it, and what its outcome
 * records.
 */
function failedWithoutResult(role: string, iteration: string, result: InvocationResult<unknown>): string {
  const cause = [result.interruption ?? result.ended, result.error].filter(part => part !== undefined && part !== '').join(': ');
  return `the ${role} of ${iteration} ended without a result (${cause}; invocation ${result.id})`;
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
 * The union of caller waits at review stops and fully reached breakpoints.
 * Settlement and model execution are running time; overlapping waits count once.
 */
function callerPauseMs(events: readonly RunEvent[], now: number): number {
  const intervals: Array<[number, number]> = [];
  let review: number | undefined;
  let debug: number | undefined;
  for (const event of events) {
    const at = Date.parse(event.at);
    if (event.type === 'review-requested') review = at;
    if (event.type === 'analysis-approved' && review !== undefined) { intervals.push([review, at]); review = undefined; }
    if (event.type === 'debug-paused' || event.type === 'debug-exchange-settled') debug ??= at;
    if ((event.type === 'debug-resumed' || event.type === 'debug-exchange-admitted') && debug !== undefined) { intervals.push([debug, at]); debug = undefined; }
    if (['job-stopped', 'job-failed', 'job-interrupted', 'job-completed'].includes(event.type)) {
      if (review !== undefined) intervals.push([review, at]);
      if (debug !== undefined) intervals.push([debug, at]);
      review = debug = undefined;
    }
  }
  if (review !== undefined) intervals.push([review, now]);
  if (debug !== undefined) intervals.push([debug, now]);
  intervals.sort(([a], [b]) => a - b);
  let total = 0;
  let end = Number.NEGATIVE_INFINITY;
  for (const [from, to] of intervals) { total += Math.max(0, to - Math.max(from, end)); end = Math.max(end, to); }
  return total;
}

function analysisMessage(record: RunRecord, plan: string, inputs: ExtractionInputs, planScenarios: PlanScenarioExtraction): string {
  const view = record.manifest.architectView;
  const source = record.manifest.source;
  const accompanying = inputs.manifest.documents.filter(document => document.kind === 'plan' && document.id !== inputs.manifest.root);
  return [
    `# Plan "${record.planId}"`,
    '',
    `The plan, as \`plans/${record.planId}/plan.md\` read when this run started (${inputs.manifest.root}):`,
    '',
    '<plan>',
    plan.trim(),
    '</plan>',
    '',
    ...(accompanying.length === 0 ? [] : [
      '# Accompanying plan documents', '',
      'Read each in full at its captured file; its functional and context elements are yours to submit as well:', '',
      ...accompanying.map(document => `- ${document.id}: ${document.path}; captured file ${join(inputs.runDirectory, document.storedAt)}`), '',
    ]),
    ...planScenariosSection(planScenarios),
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
      `The harness extracted ${extraction.scenarios.length === 1 ? 'one scenario' : `${extraction.scenarios.length} scenarios`} from the \`gherkin\` blocks of the plan documents the intake incorporated. Each appears exactly once in your submission. Use one as the origin of an entry scenario, restating its text as written here, or as an integration scenario with its sub-scenarios.`,
      '',
    );
    for (const scenario of extraction.scenarios) {
      lines.push(
        `## ${scenario.id}: ${scenario.name}`,
        '',
        `Lines ${scenario.lines[0]}–${scenario.lines[1]} of ${scenario.document ?? "the plan"}${scenario.outline ? ', a Scenario Outline with its examples' : ''}.`,
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
    if (existing === undefined || !existing.equals(Buffer.from(content))) throw new Error(`${path} already exists with different bytes`);
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



/** Mechanical section identities only; goal/requirements are supplied by their owning records. */

/** Known project facts as step inputs: captured JSON, with every path a project-relative field. */
function taskKindFor(role: Role, tool: string, continuing?: ContinueReason): TaskKind {
  if (tool === 'submit_capability_qualification') return 'capability-qualification';
  if (tool === 'answer_capability_consultation') return 'consultation';
  if (tool === workOrientationToolName) return 'orientation';
  if (tool === orientationToolName) return 'design-orientation';
  if (tool === reconciliationToolName) return 'reconciliation';
  if (tool === intakeToolName) return 'intake';
  if (tool === principleToolName) return 'principles';
  if (tool === checkToolName) return 'check';
  if (role === 'initial-architect') return 'initial-analysis';
  if (role === 'local-architect') return continuing === 'completion-refused' ? 'completion' : continuing === 'repair' ? 'repair' : 'assignment';
  if (role === 'capability-architect') return 'capability';
  if (role === 'engineer') return continuing === 'repair' ? 'repair' : 'engineering';
  if (role === 'contract-engineer') return 'contract';
  if (role === 'context-selector') return 'selection';
  if (role === 'global-fork') return 'placement';
  if (role === 'failure-analyst') return 'failure-analysis';
  if (role === 'nonfunctional-repair-engineer') return 'repair';
  if (tool === coordinatorActionToolName) return 'action';
  if (tool === coordinatorInvestigationToolName) return 'investigation';
  if (tool === coordinatorAssessmentToolName) return 'assessment';
  throw new Error(`Current task kind unavailable for ${role}/${tool}`);
}
