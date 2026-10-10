import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ConfiguredAuditPort } from '../../subs/audit/src/check-execution.js';
import type { CandidateSource, GitService } from '../../subs/evidence/src/git.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import type { Transaction } from '../../subs/ledger/src/ledger.js';
import type { RenderedFeatureFile } from '../../subs/scenarios/src/rendering.js';
import { acceptedCommit } from '../checks/accepted.js';
import type { GateCommandStarted } from '../checks/execution.js';
import { executeConfiguredGate, type ConfiguredGateAudit, type GateRequest, type PreparedGate } from '../checks/gate.js';
import type { Checkpoint, GateAttempt, GateRuleRecord } from '../checks/records.js';
import { placementPaths } from '../guard/write-guard.js';
import { isContained, resolveRealTarget } from '../guard/resolve-contained-path.js';
import type { RecordRef as CommitRecord } from '../jobs/commit.js';
import type { Mutex } from '../jobs/mutex.js';
import { sha256 } from '../prompts/packages.js';
import { committedRecords, refOf } from '../work/committed.js';
import { scopePaths } from '../work/scope.js';
import { moduleNoticeSchema, type IterationAssignment, type ModuleNotice, type WriteScope } from '../work/iterations.js';
import { deniedFiles, guardedScopeOf } from '../work/scope.js';
import { assertScratchSafe, scratchSafetyRule } from '../work/scratch.js';
import type { Assessment } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { expectedFeatureFiles, expectedFeatureHashes, rerenderFeatureFiles, trackedScenarios, writtenScenarios, type FeatureRerendering } from './feature-files.js';
import { fakeExposureParity, type StandIn } from '../contracts/parity.js';
import { committedBody } from '../steps/runner.js';
import type { WorkItem } from '../work/records.js';
import { commitForGate, commitMessage, prepareCheckpoint, type CheckpointRequest } from './gates.js';
import type { RunEvent, RunEventInput, RunLog } from './log.js';
import { outsideScope } from './mutations.js';
import { nonfunctionalRepairAssignmentSchema } from './nonfunctional-records.js';
import { declaredModuleDirectories } from './project-config.js';
import { gateAttemptId, gateAttemptSchema, runLayout, type GateOperation, type RecordRef, type RunPolicy } from './records.js';
import type { RunWrite } from './service.js';
import type { WriterOwnership } from './writer.js';

/*
 * The committing gate: verify a candidate before any effect, commit it on
 * the run branch and request the project's configured audit, then write the
 * complete attempt once. An implementation run and a manual run share it;
 * each names, through its host, how it writes, what files only the harness
 * writes and which committed audit definition its gates run.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A drift of the candidate between its assessment and its commit. */
export class CandidateDriftError extends Error {}

/** What a committing gate reads and writes of a run. */
export interface GateRun {
  readonly jobId: string;
  readonly planId: string;
  readonly directory: string;
  /** The run's original source boundary, which the accepted commit starts from. */
  readonly base: string;
  readonly policy: RunPolicy;
  readonly log: RunLog;
  readonly mutex: Mutex;
  readonly writer: WriterOwnership;
  index: ArchitectIndex | null;
  /** The commit-and-audit effect in flight. */
  gating: Promise<unknown> | undefined;
  path(relative: string): string;
}

/** What a run supplies to its committing gates. */
export interface GateHost<R extends GateRun> {
  readonly projectRoot: string;
  readonly git: GitService;
  readonly ramify: RamifyCli;
  readonly configuredAudit: ConfiguredAuditPort;
  write(run: R, input: RunEventInput, records?: readonly CommitRecord[]): Promise<'committed' | 'already-committed' | 'ended'>;
  afterWrite(write: RunWrite, runId: string): Promise<void>;
  warn(text: string): void;
  /** The project-relative files only the harness writes. */
  harnessFiles(run: R): Promise<string[]>;
  /** The committed audit definition a gate of this run runs at its candidate commit; throws where there is none. */
  auditDefinition(run: R, sourceCommit: string): Promise<Parameters<ConfiguredAuditPort['run']>[0]['configuration']>;
  previewCandidateTree(): Promise<{ readonly tree: string }>;
  readonly candidates: Pick<CandidateSource, 'commitTree'>;
  /** The module inventory as the project stands now, or null when it cannot be refreshed. */
  refreshIndex(run: R): Promise<ArchitectIndex | null>;
  /** Whether the run accepts nothing more: it is stopping, closing or has ended. */
  ignoring(run: R): boolean;
}

/** The committing gates of one kind of run. */
export class CommittingGates<R extends GateRun> {
  constructor(private readonly host: GateHost<R>) {}

  /** Verify before effects, then commit and audit before writing the complete attempt once. */
  async committingCheckpoint(
    run: R,
    request: CheckpointRequest,
    summary?: string,
    modules?: readonly ModuleNotice[],
    goal?: string,
    binding?: { candidateId: string; assessment: Assessment },
  ): Promise<GateAttempt> {
    const scratch = await scratchSafetyRule(this.host.projectRoot, await declaredModuleDirectories(this.host.projectRoot), this.host.git);
    const { rules: scopeRules, ownership } = await this.candidateAuthority(run, request);
    const prepared = await prepareCheckpoint({
      ...request,
      rules: [...(request.rules ?? []), scratch, ...scopeRules],
    });
    if ('schema' in prepared) {
      await this.host.write(run, {
        type: 'gate-attempted',
        data: { gate: prepared.id, checkpoint: prepared.checkpoint, verdict: prepared.verdict, next: prepared.next },
      }, [{ path: runLayout.gate(prepared.id), id: prepared.id, revision: 1, body: prepared }]);
      await this.host.afterWrite('gate-committed', run.jobId);
      return prepared;
    }
    return this.commitGate(run, prepared, summary, modules, goal, undefined, binding, ownership);
  }

  /** The same captured/current origin authority guards live and restarted candidate commits. */
  async candidateAuthority(run: R, request: Pick<CheckpointRequest, 'checkpoint' | 'subject'>) {
    const ledger = run.log.ledger.replay();
    const committed = committedRecords(ledger);
    const assignments = request.subject?.iteration !== undefined
      ? [committed.assignments.get(request.subject.iteration)].filter((entry): entry is IterationAssignment => entry !== undefined)
      : [...committed.assignments.values()].filter(entry => request.subject?.workItem === undefined || entry.workItem === request.subject.workItem || (entry.coordination?.kind === 'capability-task' && entry.coordination.id === request.subject.workItem));
    const capabilityAssigned = run.log.all('capability-assigned');
    const assignmentOrder = new Map([
      ...run.log.all('iteration-assigned').map(event => [event.data.iteration, event.sequence] as const),
      ...capabilityAssigned.map(event => [event.data.assignment, event.sequence] as const),
    ]);
    // Only authority co-committed with actual run assignments can cover a
    // later checkpoint. A rejected iteration's dirty files get no shortcut.
    const origins: Array<{ scope: WriteScope; guarded: readonly { path: string; hash: string | null }[];
      authorizations: readonly { path: string }[]; inherited: readonly { path: string; hash: string | null }[];
      predecessors: readonly { assignment: IterationAssignment; paths?: readonly string[];
        continuity: readonly (readonly { path: string; hash: string | null }[])[] }[] }> = assignments.map(assignment => {
        const predecessors: Array<{ assignment: IterationAssignment; paths?: readonly string[];
          continuity: readonly (readonly { path: string; hash: string | null }[])[] }> = [];
        const continuity: Array<readonly { path: string; hash: string | null }[]> = [];
        const visited = new Set<string>();
        let ancestor = assignment;
        while (ancestor.coordination?.kind === 'capability-task' && !visited.has(ancestor.id)) {
          visited.add(ancestor.id);
          const coordination = ancestor.coordination;
          if (ancestor !== assignment) continuity.push(coordination.startingPaths);
          const assigned = capabilityAssigned.find(event => event.data.assignment === ancestor.id
            && event.data.task === coordination.id && event.data.sequence === coordination.sequence);
          if (assigned === undefined) { predecessors.length = 0; break; }
          // A settled partial writer of this exact task owns its unchanged
          // inherited effects. Failed or unavailable settlement is no proof.
          for (const event of run.log.all('capability-assignment-settled')) {
            if (event.data.task !== coordination.id || event.sequence >= assigned.sequence || !['accepted', 'partial'].includes(event.data.outcome)
              || event.data.mutated === undefined || event.data.outsideScope === undefined) continue;
            const prior = committed.assignments.get(event.data.assignment);
            if (prior?.coordination?.kind !== 'capability-task' || prior.coordination.id !== coordination.id
              || prior.coordination.sequence >= coordination.sequence) continue;
            const priorCoordination = prior.coordination;
            const priorAssigned = capabilityAssigned.find(entry => entry.data.assignment === prior.id && entry.data.task === coordination.id
              && entry.data.sequence === priorCoordination.sequence);
            if (priorAssigned === undefined || priorAssigned.sequence >= event.sequence) continue;
            predecessors.push({ assignment: prior, paths: event.data.mutated.filter(path => !event.data.outsideScope!.includes(path)), continuity: [...continuity] });
          }
          const task = committed.capabilityTasks.get(coordination.id);
          const parent = task === undefined ? undefined : committed.assignments.get(task.originatingAssignment);
          const related = task !== undefined && parent !== undefined && (task.parent.kind === 'work-item'
            ? parent.workItem === task.parent.id && parent.coordination?.kind !== 'capability-task'
            : parent.coordination?.kind === 'capability-task' && parent.coordination.id === task.parent.id);
          if (!related || parent === undefined || (assignmentOrder.get(parent.id) ?? Infinity) >= assigned.sequence
            || visited.has(parent.id)) { predecessors.length = 0; break; }
          predecessors.push({ assignment: parent, continuity: [...continuity] });
          ancestor = parent;
        }
        return ({
        scope: assignment.scope, guarded: assignment.guarded, authorizations: assignment.authorizations,
        inherited: assignment.coordination?.kind === 'capability-task' ? assignment.coordination.startingPaths : [],
        predecessors,
      }); });
    if (request.checkpoint === 'final') {
      for (const entry of ledger) {
        if (entry.transaction.event.type !== 'nonfunctional-repair-assigned') continue;
        const event = entry.transaction.event;
        const records = entry.transaction.records.filter(record => record.path === runLayout.nonfunctionalRepairAssignment(event.data.assignment)
          && record.id === event.data.assignment && record.revision === 1);
        if (records.length !== 1) throw new Error('Final checkpoint has an unavailable committed repair authority');
        const repair = nonfunctionalRepairAssignmentSchema.parse(records[0]!.body);
        origins.push({ scope: repair.scope, guarded: repair.guarded, authorizations: [], inherited: [], predecessors: [] });
      }
    }
    const scopeRules: GateRuleRecord[] = [];
    let ownership: Awaited<ReturnType<RamifyCli['queryOwnership']>> | undefined;
    try {
      const changed = await this.host.git.changedPaths(this.host.projectRoot, acceptedCommit(run.log.ledger.replay(), run.base));
      const paths = await placementPaths(this.host.projectRoot, [...changed, ...this.expectedFeatures(run).map(file => file.path)]);
      // One decoded answer and input identity for the entire gate, including
      // logical aliases and their real targets across every captured origin.
      const current = paths.length === 0 ? undefined : await this.host.ramify.queryOwnership(this.host.projectRoot, paths);
      ownership = current;
      await this.validateFeatureTargets(this.expectedFeatures(run), current);
      const permitted = new Set<string>();
      // Only exact regular canonical bytes from the ledger's last producer
      // rendering are harness effects; arbitrary feature edits remain denied.
      const rendered = new Map(expectedFeatureHashes(this.writtenFeatures(run)).map(file => [file.path, file.hash]));
      for (const path of changed) {
        const expected = rendered.get(path);
        if (expected !== undefined && await this.renderedFeatureAllowed(path, expected, current)) permitted.add(path);
      }
      const harnessDenied = await deniedFiles(this.host.projectRoot, await this.host.harnessFiles(run));
      for (const origin of origins) {
        const guard = guardedScopeOf(origin.scope, await deniedFiles(this.host.projectRoot,
          [...harnessDenied, ...origin.guarded.filter(file => !origin.authorizations.some(entry => entry.path === file.path)).map(file => file.path)]), this.host.ramify, current);
        const candidate: string[] = [];
        for (const path of changed) {
          const prior = origin.inherited.find(entry => entry.path === path);
          const capturedFile = origin.guarded.find(entry => entry.path === path);
          const hash = prior === undefined && capturedFile === undefined ? undefined : await readFile(join(this.host.projectRoot, path)).then(bytes => sha256(bytes)).catch(error => {
            if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
            throw error;
          });
          // Exact unchanged captured harness effects and related inherited bytes
          // are not this writer's changes; null means actual absence only.
          const unchangedBytes = (prior !== undefined && hash === prior.hash) || (capturedFile !== undefined && hash === capturedFile.hash);
          const physical = unchangedBytes ? await resolveRealTarget(this.host.projectRoot, path) : undefined;
          const info = unchangedBytes ? await lstat(join(this.host.projectRoot, path)).catch(error => {
            if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
            throw error;
          }) : undefined;
          const unchangedIdentity = unchangedBytes && physical?.ok && physical.resolved === resolve(this.host.projectRoot, path)
            && (hash === null ? info === null : info?.isFile() === true);
          let unchangedAuthority = false;
          if (unchangedIdentity && capturedFile !== undefined && hash === capturedFile.hash) {
            // The exact captured input is a harness effect, while current
            // nested/excluded topology still narrows that file's permission.
            const input = { ...origin.scope, resolved: { ...origin.scope.resolved, files: [...origin.scope.resolved.files, resolve(this.host.projectRoot, path)] } };
            unchangedAuthority = (await outsideScope(this.host.projectRoot, guardedScopeOf(input, [], this.host.ramify, current), [path])).length === 0;
          }
          if (unchangedIdentity && !unchangedAuthority && prior !== undefined && hash === prior.hash) {
            for (const predecessor of origin.predecessors) {
              if (predecessor.paths !== undefined && !predecessor.paths.includes(path)) continue;
              if (!predecessor.continuity.every(snapshot => snapshot.some(entry => entry.path === path && entry.hash === hash))) continue;
              const parent = predecessor.assignment;
              const parentGuard = guardedScopeOf(parent.scope, await deniedFiles(this.host.projectRoot, [...harnessDenied, ...parent.guarded.filter(file => !parent.authorizations.some(entry => entry.path === file.path)).map(file => file.path)]), this.host.ramify, current);
              if ((await outsideScope(this.host.projectRoot, parentGuard, [path])).length === 0) { unchangedAuthority = true; break; }
            }
          }
          if (unchangedAuthority) permitted.add(path);
          else candidate.push(path);
        }
        const outside = new Set(await outsideScope(this.host.projectRoot, guard, candidate));
        for (const path of candidate) if (!outside.has(path)) permitted.add(path);
      }
      const outside = changed.filter(path => !permitted.has(path));
      scopeRules.push({ rule: 'write-scope', outcome: outside.length === 0 ? 'passed' : 'failed',
        violations: outside.map(path => ({ rule: 'write-scope', path, detail: 'Candidate change has no originating captured and current write authority' })) });
    } catch (error) {
      scopeRules.push({ rule: 'write-scope', outcome: 'failed', violations: [{ rule: 'write-scope', path: '.', detail: `Candidate ownership is unavailable: ${message(error)}` }] });
    }
    return { rules: scopeRules, ownership };
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
  async commitGate(
    run: R,
    prepared: PreparedGate,
    summary?: string,
    modules?: readonly ModuleNotice[],
    goal?: string,
    recordedMessage?: string,
    binding?: { candidateId: string; assessment: Assessment },
    ownership?: Awaited<ReturnType<RamifyCli['queryOwnership']>>,
  ): Promise<GateAttempt> {
    const identity = prepared.request;
    // A reader, a reviewer or a failure analyst, contributed nothing to the
    // source this commit holds.
    const invocations = run.log.all('invocation-started')
      .filter(event => event.data.role !== 'reviewer' && event.data.role !== 'failure-analyst')
      .map(event => event.data.invocation);
    const message = recordedMessage ?? commitMessage({
      runId: run.jobId, planId: run.planId,
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
    const effect = run.log.ledger.effect<{ readonly attempt: GateAttempt }>({
      key: `gate-commit:${identity.id}`,
      serialize: work => run.mutex.run(work),
      intent: () => ({
        event: run.log.next({ type: 'gate-committing', data: { gate: identity.id, checkpoint: prepared.checkpoint } }),
        records: [{ path: runLayout.gateOperation(identity.id), id: identity.id, revision: 1, body: operation }],
      }),
      perform: async () => {
        await this.host.afterWrite('gate-attempted', run.jobId);
        // The feature files go into the gate's commit as the states now
        // render them; the guarded comparison before this effect judged the
        // tree against the rendering the assignment captured.
        const commit = await commitForGate(this.host.projectRoot, run.jobId, identity.id, message, undefined, this.host.git, async () => {
          let currentOwnership = ownership;
          if (recordedMessage !== undefined) {
            const candidate = await this.candidateAuthority(run, { checkpoint: prepared.checkpoint, subject: identity.subject });
            const refusal = candidate.rules.find(rule => rule.outcome !== 'passed');
            if (refusal !== undefined) throw new Error(`Recovered gate candidate has no current captured authority: ${refusal.violations.map(entry => `${entry.path}: ${entry.detail}`).join('; ')}`);
            currentOwnership = candidate.ownership;
          }
          const rendering = await this.rerenderScenarios(run, currentOwnership);
          if (binding !== undefined) {
            if (rendering.written.length > 0) throw new CandidateDriftError('Final gate rendering changed the assessed candidate');
            const current = await this.host.previewCandidateTree();
            if (current.tree !== binding.assessment.candidate.tree) throw new CandidateDriftError('Final gate source changed after assessment');
          }
          await assertScratchSafe(this.host.projectRoot, await declaredModuleDirectories(this.host.projectRoot), this.host.git);
        });
        await this.host.afterWrite('gate-committing', run.jobId);
        const sourceCommit = commit ?? identity.head;
        const attempt = await executeConfiguredGate(this.configuredGateAudit(run), prepared, sourceCommit, commit,
          this.commandStarted(run, identity.id, prepared.checkpoint), this.commandWaiting(run, identity.id, prepared.checkpoint));
        if (attempt.audited !== null && attempt.audited !== sourceCommit) {
          throw new Error(`Gate ${attempt.id} audited ${attempt.audited}, expected ${sourceCommit}`);
        }
        if (attempt.evidence !== null && attempt.audited !== sourceCommit) {
          throw new Error(`Gate ${attempt.id} published evidence without the expected audited commit ${sourceCommit}`);
        }
        if (attempt.verdict === 'passed' && (attempt.audited !== sourceCommit || attempt.evidence === null)) {
          throw new Error(`Gate ${attempt.id} passed without published evidence for ${sourceCommit}`);
        }
        return { attempt };
      },
      complete: ({ attempt }) => {
        const { auditOverall, ...durableAttempt } = attempt;
        if (auditOverall != null && (attempt.audited === null || attempt.evidence === null)) {
          throw new Error(`Gate ${attempt.id} has an audit outcome without its published commit`);
        }
        return this.gateAttempted(run, attempt, [
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
   * The committed configured audit a committing gate asks for: the
   * provider's definition the host names for the run at the gate's candidate
   * commit, under the request identity of the run and the attempt. A run
   * without a valid definition has none to carry, and its gate is not
   * verified.
   */
  configuredGateAudit(run: R): ConfiguredGateAudit {
    return async request => {
      const configuration = await this.host.auditDefinition(run, request.sourceCommit);
      return this.host.configuredAudit.run({
        projectRoot: request.projectRoot,
        sourceCommit: request.sourceCommit,
        configuration,
        mode: request.mode,
        nested: request.nested,
        runId: request.runId,
        attemptId: request.attemptId,
        signal: request.signal,
        ...(request.started === undefined ? {} : { started: request.started }),
        ...(request.waiting === undefined ? {} : { waiting: request.waiting }),
        ...(request.lockAcquired === undefined ? {} : { lockAcquired: request.lockAcquired }),
      });
    };
  }

  /**
   * The `gate-attempted` line of a committing gate: its attempt and records.
   * Its per-scenario results are display only and decide no CheckFinding.
   */
  gateAttempted(run: R, attempt: GateAttempt, records: CommitRecord[]): Transaction<RunEvent> {
    return {
      event: run.log.next({ type: 'gate-attempted', data: { gate: attempt.id, checkpoint: attempt.checkpoint, verdict: attempt.verdict, next: attempt.next } }),
      records,
    };
  }

  /**
   * What a gate's executor calls as each command starts: a
   * `gate-command-started` line, written before the command runs. It is
   * progress only, so a write that fails is a warning and never fails the
   * gate.
   */
  commandStarted(run: R, gate: string, checkpoint: Checkpoint): GateCommandStarted {
    return async command => {
      try {
        await this.host.write(run, { type: 'gate-command-started', data: { gate, checkpoint, ...command } });
      } catch (error) {
        this.host.warn(`Run ${run.jobId}: the start of command ${command.position} of gate ${gate} was not recorded: ${message(error)}`);
      }
    };
  }

  commandWaiting(run: R, gate: string, checkpoint: Checkpoint): NonNullable<GateRequest['waiting']> {
    return async (command, line) => {
      if (command.kind !== 'configured') return;
      try {
        await this.host.write(run, { type: 'gate-command-waiting', data: {
          gate, checkpoint, kind: command.kind, position: command.position, total: command.total, line,
        } });
      } catch (error) {
        this.host.warn(`Run ${run.jobId}: the wait of command ${command.position} of gate ${gate} was not recorded: ${message(error)}`);
      }
    };
  }

  /** The count of committed gate attempts: every readiness and every checkpoint. */
  gateCount(run: R): number {
    return run.log.count('readiness-passed') + run.log.all('readiness-failed').length + run.log.count('gate-attempted');
  }

  /** Exact ledger-owned feature bytes cannot borrow authority through an alias. */
  async renderedFeatureAllowed(path: string, hash: string, answer?: Awaited<ReturnType<RamifyCli['queryOwnership']>>): Promise<boolean> {
    const logical = resolve(this.host.projectRoot, path);
    const target = await resolveRealTarget(this.host.projectRoot, path);
    if (!target.ok || target.resolved !== logical || !(await lstat(logical).catch(() => null))?.isFile()) return false;
    const seed = answer?.selection.paths.find(seed => seed.path === path);
    if (seed?.status !== 'owned' || seed.exclusion !== null) return false;
    return sha256(await readFile(logical)) === hash;
  }

  /** Every producer write uses canonical ordinary targets from one coherent public answer. */
  async validateFeatureTargets(expected: readonly RenderedFeatureFile[], ownership?: Awaited<ReturnType<RamifyCli['queryOwnership']>>) {
    const paths = expected.map(file => file.path);
    const answer = ownership ?? (paths.length === 0 ? undefined : await this.host.ramify.queryOwnership(this.host.projectRoot, await placementPaths(this.host.projectRoot, paths)));
    for (const path of paths) {
      const target = await resolveRealTarget(this.host.projectRoot, path);
      const seed = answer?.selection.paths.find(seed => seed.path === path);
      const info = await lstat(resolve(this.host.projectRoot, path)).catch(error => {
        if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
        throw error;
      });
      if (!target.ok || target.resolved !== resolve(this.host.projectRoot, path) || (info !== null && !info.isFile()) || seed?.status !== 'owned' || seed.exclusion !== null) {
        throw new Error(`Scenario producer target is unavailable or outside ordinary ownership: ${path}`);
      }
    }
    return answer;
  }

  /** Every tracked feature file's expected content under the states the ledger holds now. */
  expectedFeatures(run: R): RenderedFeatureFile[] {
    return expectedFeatureFiles(trackedScenarios(run.log.ledger.replay()), { planId: run.planId, runId: run.jobId });
  }

  /**
   * Re-renders the tracked feature files once they are materialized: writes
   * those that differ from the states' rendering and reports whether a
   * commit is needed. Before materialization it writes nothing.
   */
  async rerenderScenarios(run: R, ownership?: Awaited<ReturnType<RamifyCli['queryOwnership']>>): Promise<FeatureRerendering> {
    if (run.log.find('scenarios-materialized') === undefined) return { files: [], written: [], commitNeeded: false };
    const expected = this.expectedFeatures(run);
    await this.validateFeatureTargets(expected, ownership);
    return rerenderFeatureFiles(this.host.projectRoot, expected);
  }

  /** Every tracked feature file as the harness last rendered it into the tree. */
  writtenFeatures(run: R): RenderedFeatureFile[] {
    return expectedFeatureFiles(writtenScenarios(run.log.ledger.replay()), { planId: run.planId, runId: run.jobId });
  }

  /**
   * The fake-exposure-parity rule over the given fakes, on the architect
   * view refreshed for this gate: each fake is exactly as importable as the
   * real export it stands for. No rule where no fake is registered.
   */
  async fakeExposureParityRule(
    index: ArchitectIndex | null,
    standIns: readonly StandIn[],
    writeScope: readonly string[],
  ): Promise<GateRuleRecord | null> {
    if (standIns.length === 0) return null;
    return fakeExposureParity({
      index,
      standIns,
      writeScope,
      read: path => readFile(join(this.host.projectRoot, path), 'utf8').catch(() => null),
    });
  }

  /** Every fake the registered agreements name, at the revision in force, except those of `except`. */
  registeredStandIns(run: R, except?: string): StandIn[] {
    const records = committedRecords(run.log.ledger.replay());
    return [...records.contracts.values()]
      .filter(contract => contract.mode === 'fake-backed' && contract.id !== except)
      .flatMap(contract => contract.artifacts.fake.flatMap(entry => entry.standsFor.map(standsFor => ({
        contract: contract.id, fakePath: entry.path, standsFor, declaredHere: false,
      }))));
  }

  /**
   * The iteration's gate: the project's committed audit of the candidate the
   * gate commits, in the project's default mode, and the harness's own rules
   * over the tree. The provider selects the configured checks; the harness
   * names no test.
   */
  async iterationGate(
    run: R,
    item: WorkItem,
    assignment: IterationAssignment,
    invocation: string,
    repairRound: number,
    infrastructureAttempt: number,
    summary: string,
  ): Promise<GateAttempt | null> {
    run.writer.requireSettled(`The ${assignment.id} gate cannot run`);
    const gateId = gateAttemptId(this.gateCount(run) + 1);
    const index = await this.host.refreshIndex(run);

    // While an agreement's fake is registered, a write of this iteration
    // that makes it more or less importable than its real export fails the
    // gate; what no file of its scope decides is not this iteration's.
    const writeScope = writeScopePaths(this.host.projectRoot, assignment);
    const parity = await this.fakeExposureParityRule(index, this.registeredStandIns(run), writeScope);
    const modules = await this.pendingModules(run, assignment.id);
    const attempt = await this.committingCheckpoint(run, {
      id: gateId,
      runId: run.jobId,
      checkpoint: assignment.gate.checkpoint,
      projectRoot: this.host.projectRoot,
      directory: run.path(runLayout.gateOutput(gateId)),
      head: await this.host.git.currentHead(this.host.projectRoot),
      policy: run.policy,
      proposedBy: invocation,
      repairRound,
      infrastructureAttempt,
      subject: { workItem: item.id, iteration: assignment.id },
      guarded: this.guardedAtGate(run, assignment.guarded),
      authorizations: assignment.authorizations.map(entry => ({ path: entry.path, by: entry.by })),
      ...(parity === null ? {} : { rules: [parity] }),
    }, summary, modules, assignment.goal);

    if (attempt.verdict !== 'passed') {
      return this.host.ignoring(run) ? null : attempt;
    }
    await this.host.afterWrite('gate-committed', run.jobId);
    if (this.host.ignoring(run)) return null;
    return attempt;
  }

  /**
   * The module declarations the commit about to be made adds or removes,
   * read from the working directory rather than from what an agent said.
   */
  async pendingModules(run: R, iteration: string): Promise<ModuleNotice[]> {
    let entries: Array<{ status: string; path: string }>;
    try {
      entries = await this.host.git.changedEntries(this.host.projectRoot, acceptedCommit(run.log.ledger.replay(), run.base));
    } catch (error) {
      this.host.warn(`Run ${run.jobId}: the pending module declarations could not be read: ${message(error)}`);
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
  proposedBy(run: R): Map<string, RecordRef | null> {
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
  async committedModules(run: R, commit: string | null, iteration: string, gate: string | null): Promise<ModuleNotice[]> {
    if (commit === null || gate === null) return [];
    let changes: Array<{ status: string; path: string }>;
    try {
      changes = await this.host.git.diffNameStatus(this.host.projectRoot, this.acceptedBefore(run, gate), commit);
    } catch (error) {
      this.host.warn(`Run ${run.jobId}: the commit's module declarations could not be read: ${message(error)}`);
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
  acceptedBefore(run: R, gate: string): string {
    const entries = run.log.ledger.replay();
    const index = entries.findIndex(entry => {
      const event = entry.transaction.event;
      return event.type === 'gate-attempted' && event.data.gate === gate;
    });
    if (index < 0) throw new Error(`Gate ${gate} is not committed in run ${run.jobId}`);
    return acceptedCommit(entries.slice(0, index), run.base);
  }

  /** The common completion gate: all project tests, type check and Ramify
   * check. A delegated task supplies its own identity and scenario set. */
  async workItemGate(
    run: R,
    item: WorkItem,
    invocation: string,
    repairRound: number,
    summary: string,
    taskOwner?: string,
    replayed = false,
  ): Promise<GateAttempt | null> {
    run.writer.requireSettled(`The ${item.id} gate cannot run`);
    // A crash after the attempt was recorded may replay the exact completion
    // action. Reuse only that action's durable gate; another proposal can
    // change scenario obligations even when the source tree is unchanged.
    if (replayed) {
      let candidate: string | undefined;
      const owner = taskOwner ?? item.id;
      for (const event of [...run.log.all('gate-attempted')].reverse()) {
        const recorded = gateAttemptSchema.safeParse(committedBody(run, runLayout.gate(event.data.gate)));
        if (!recorded.success || recorded.data.checkpoint !== 'work-item' ||
          recorded.data.subject?.workItem !== owner || recorded.data.proposedBy !== invocation ||
          recorded.data.verdict !== 'passed' || recorded.data.audited === null) continue;
        candidate ??= (await this.host.previewCandidateTree()).tree;
        if (await this.host.candidates.commitTree(this.host.projectRoot, recorded.data.audited) !== candidate) continue;
        return recorded.data;
      }
    }
    const gateId = gateAttemptId(this.gateCount(run) + 1);
    const attempt = await this.committingCheckpoint(run, {
      id: gateId,
      runId: run.jobId,
      checkpoint: 'work-item',
      projectRoot: this.host.projectRoot,
      directory: run.path(runLayout.gateOutput(gateId)),
      head: await this.host.git.currentHead(this.host.projectRoot),
      policy: run.policy,
      proposedBy: invocation,
      repairRound,
      subject: { workItem: taskOwner ?? item.id },
    }, summary);
    const subject = attempt;

    if (subject.verdict !== 'passed') {
      return this.host.ignoring(run) ? null : subject;
    }
    await this.host.afterWrite('gate-committed', run.jobId);
    if (this.host.ignoring(run)) return null;
    // A pass moves no obligation: only an accepted submission does.
    return subject;
  }

  /**
   * The guarded files a gate compares: what the assignment captured, with
   * each tracked feature file at the hash of the rendering the harness last
   * wrote. A gate's commit in an earlier repair round may have rewritten one
   * since the capture, and only an agent's change is a guarded change.
   */
  guardedAtGate(run: R, guarded: IterationAssignment['guarded']): IterationAssignment['guarded'] {
    if (run.log.find('scenarios-materialized') === undefined) return guarded;
    const written = new Map(expectedFeatureHashes(this.writtenFeatures(run)).map(file => [file.path, file.hash]));
    return guarded.map(file => (written.has(file.path) ? { ...file, hash: written.get(file.path)! } : file));
  }
}

/**
 * The earlier attempts at the same subject, newest last, as the accepted
 * commit's message states them. It reads the log and nothing else.
 */
function earlierAttempts(run: Pick<GateRun, 'log'>, attemptId: string, attemptSubject: GateAttempt['subject']): Array<{ id: string; verdict: string; cause: string | null }> {
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

/** One gate attempt as the log committed it, without reading the file again. */
function gateBodyOf(run: Pick<GateRun, 'log'>, id: string): GateAttempt | undefined {
  for (const entry of run.log.ledger.replay()) {
    for (const record of entry.transaction.records) {
      const body = record.body as { schema?: unknown; id?: unknown };
      if (body?.schema === 'ramify-agent.gate-attempt/3' && body.id === id) return record.body as GateAttempt;
    }
  }
  return undefined;
}

export function gateOperation(prepared: PreparedGate, message: string): GateOperation {
  const request = prepared.request;
  if (request.runId === undefined) throw new Error('A committing gate requires its durable run ID');
  if (request.audit === undefined || request.checks.length > 0) {
    throw new Error(`Gate ${request.id} is not a configured audit request; a committing gate plans no command of its own`);
  }
  if (prepared.decisive.length > 0) throw new Error(`Gate ${request.id} was not completely verified before its operation was recorded`);
  return {
    schema: 'ramify-agent.gate-operation/2',
    checkpoint: prepared.checkpoint as GateOperation['checkpoint'],
    request: {
      id: request.id,
      runId: request.runId,
      projectRoot: request.projectRoot,
      directory: request.directory,
      head: request.head,
      audit: { mode: request.audit.mode, ...(request.audit.nested === true ? { nested: true } : {}), timeoutMs: request.audit.timeoutMs },
      subject: request.subject ?? {},
      proposedBy: request.proposedBy ?? null,
      repairRound: request.repairRound ?? 0,
      infrastructureAttempt: request.infrastructureAttempt ?? 0,
      limits: {
        repairRounds: request.limits?.repairRounds ?? 1,
        infrastructureRetries: request.limits?.infrastructureRetries ?? 1,
      },
    },
    guardedChanges: [...prepared.guardedChanges],
    rules: prepared.rules.map(({ limits, ...rule }) => ({
      ...rule,
      violations: rule.violations.map(violation => ({ ...violation })),
      ...(limits === undefined ? {} : { limits: [...limits] }),
    })),
    unauthorized: prepared.unauthorized,
    ruleFailed: prepared.ruleFailed,
    timeoutMs: prepared.timeoutMs,
    message,
  };
}

/**
 * The readiness baseline's audit outcome, beside its gate as a committing
 * gate's is: recorded only for an answered request with its published
 * record, so the execution map projects the baseline's outcome rather than a
 * publication without one.
 */
export function readinessAuditOutcome(gate: GateAttempt) {
  const overall = gate.audit?.verdict ?? null;
  if (overall === null || gate.audited === null || gate.evidence === null) return [];
  return [{ path: runLayout.gateAuditOutcome(gate.id), id: gate.id, revision: 1,
    body: { schema: 'ramify-agent.gate-audit-outcome/1', gate: gate.id, overall, audited: gate.audited } }];
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

/** The write scope of one assignment, project-relative, as a gate attributes findings against it. */
export function writeScopePaths(projectRoot: string, assignment: IterationAssignment): string[] {
  const paths = scopePaths(projectRoot, assignment.scope);
  return [...paths.roots, ...paths.files];
}
