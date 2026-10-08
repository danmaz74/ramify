import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  createConfiguredAudit,
  type AuditInvocationReceipt,
  type AuditWorkspaceOwnershipRecorder,
  type ConfiguredAuditMode,
  type ConfiguredAuditPort,
  type IntendedAuditWorkspace,
} from '../../../subs/audit/src/check-execution.js';
import type { GateCommandStart } from '../../checks/execution.js';
import { executeConfiguredGate, prepareGate } from '../../checks/gate.js';
import type { Checkpoint, GateAttempt, GateRuleRecord } from '../../checks/records.js';

/*
 * A real Git project audited by the installed provider through the
 * harness's configured audit port. Its `node_modules` is a link to the
 * agent's own, so its committed commands find the pinned Vitest, Cucumber,
 * tsx and `ramify` without an install. Each audit takes a private test lock,
 * never the machine's.
 */

const exec = promisify(execFile);
const agentModules = fileURLToPath(new URL('../../../../../node_modules', import.meta.url));
const gitEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

export interface ConfiguredRepository {
  readonly root: string;
  /** Writes the files (null deletes one), commits them all and answers the commit. */
  commit(message: string, files?: Readonly<Record<string, string | null>>): Promise<string>;
  git(...args: string[]): Promise<string>;
  remove(): Promise<void>;
}

/** One configured command of a check, as `ramify-audit.json` declares it. */
export interface DefinedCommand {
  readonly name: string;
  readonly cmd: string;
  readonly args: readonly string[];
  readonly parser?: 'vitest' | 'cucumber' | 'none';
  readonly timeoutMs?: number;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

/** A command check of the committed definition. */
export function commandCheck(id: string, commands: readonly DefinedCommand[], options: { readonly dependsOn?: readonly string[] } = {}) {
  return {
    id, name: id, description: `Configured ${id}`, scope: 'both', category: 'deterministic', onFailure: 'record',
    executor: { kind: 'command', commands: commands.map(command => ({ parser: 'none', timeoutMs: 120_000, ...command })), continueOnFailure: true },
    ...(options.dependsOn === undefined ? {} : { dependsOn: options.dependsOn }),
  };
}

/** The text of a committed `ramify-audit.json`. */
export function auditDefinition(checks: readonly unknown[], options: {
  readonly ignorePaths?: readonly string[];
  readonly setupCommands?: readonly unknown[];
  readonly packageDirectories?: readonly string[];
} = {}): string {
  return `${JSON.stringify({
    ...(options.ignorePaths === undefined ? {} : { ignorePaths: options.ignorePaths }),
    checks,
    workspace: { preparation: 'nodejs', options: {
      packageDirectories: options.packageDirectories ?? [''],
      setupCommands: options.setupCommands ?? [],
    } },
  }, null, 2)}\n`;
}

/** A temporary repository with the given files committed on `main`, its `node_modules` linked to the agent's. */
export async function configuredRepository(files: Readonly<Record<string, string>>, prefix = 'ramify-agent-configured-'): Promise<ConfiguredRepository & { readonly head: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const git = async (...args: string[]) => (await exec('git', args, { cwd: root, env: gitEnvironment })).stdout.trim();
  await git('init', '--quiet', '--initial-branch=main');
  await symlink(agentModules, join(root, 'node_modules'), 'dir');
  const write = async (changes: Readonly<Record<string, string | null>>) => {
    for (const [path, content] of Object.entries(changes)) {
      const target = join(root, path);
      if (content === null) { await rm(target, { force: true }); continue; }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  };
  const commit = async (message: string, changes: Readonly<Record<string, string | null>> = {}) => {
    await write(changes);
    await git('add', '--all');
    await git('-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '--no-gpg-sign', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const head = await commit('fixture', { '.gitignore': 'node_modules\n', ...files });
  return { root, head, commit, git, remove: () => rm(root, { recursive: true, force: true }) };
}

/** Ownership that records what the audit intended and cleaned, without durable files. */
export function recordingOwnership(): AuditWorkspaceOwnershipRecorder & {
  readonly intended: IntendedAuditWorkspace[];
  readonly cleaned: IntendedAuditWorkspace[];
  readonly invocations: Map<string, AuditInvocationReceipt>;
} {
  const intended: IntendedAuditWorkspace[] = [];
  const cleaned: IntendedAuditWorkspace[] = [];
  const invocations = new Map<string, AuditInvocationReceipt>();
  return {
    intended, cleaned, invocations,
    async recordIntendedWorkspace(workspace) { intended.push(workspace); },
    async recoverAbandonedWorkspaces() {},
    async recordWorkspaceCleaned(workspace) { cleaned.push(workspace); },
    async recordAuditInvocation(receipt) { invocations.set(`${receipt.runId}:${receipt.attemptId}`, structuredClone(receipt)); },
    async auditInvocation(runId, attemptId) { return structuredClone(invocations.get(`${runId}:${attemptId}`) ?? null); },
  };
}

/** The production configured audit port with a private test lock beside the repository. */
export async function privateConfiguredAudit(ownership: AuditWorkspaceOwnershipRecorder = recordingOwnership()): Promise<{ readonly audit: ConfiguredAuditPort; readonly remove: () => Promise<void> }> {
  const lockDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-private-lock-'));
  return {
    audit: createConfiguredAudit({ workspaceOwnership: ownership, testLock: { lockPath: join(lockDirectory, 'machine-test.lock') } }),
    remove: () => rm(lockDirectory, { recursive: true, force: true }),
  };
}

/**
 * One committing gate over `sourceCommit`, asked of the definition the run
 * captured at `captured` (the readiness head), as the run service asks it.
 */
export async function configuredGate(audit: ConfiguredAuditPort, repository: { readonly root: string }, options: {
  readonly captured: string;
  readonly sourceCommit: string;
  readonly mode?: ConfiguredAuditMode;
  readonly nested?: boolean;
  readonly checkpoint?: Checkpoint;
  readonly runId?: string;
  readonly attemptId: string;
  readonly rules?: readonly GateRuleRecord[];
  readonly signal?: AbortSignal;
  readonly started?: GateCommandStart[];
  readonly timeoutMs?: number;
}): Promise<GateAttempt> {
  const configuration = await audit.read(repository.root, options.captured);
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-configured-gate-'));
  try {
    const checkpoint = options.checkpoint ?? 'iteration';
    const prepared = await prepareGate(checkpoint, {
      id: options.attemptId as GateAttempt['id'],
      runId: options.runId ?? 'run-configured-witness',
      projectRoot: repository.root,
      directory,
      head: options.sourceCommit as GateAttempt['head'],
      checks: [],
      audit: { mode: options.mode ?? 'project-default', ...(options.nested === true ? { nested: true } : {}), timeoutMs: options.timeoutMs ?? 300_000 },
      ...(options.rules === undefined ? {} : { rules: options.rules }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if ('schema' in prepared) return prepared;
    const runId = options.runId ?? 'run-configured-witness';
    return await executeConfiguredGate(request => audit.run({
      projectRoot: request.projectRoot, sourceCommit: request.sourceCommit, configuration, mode: request.mode, nested: request.nested,
      runId, attemptId: request.attemptId, signal: request.signal,
      ...(options.started === undefined ? {} : { started: async (command: GateCommandStart) => { options.started!.push(command); } }),
    }), prepared, options.sourceCommit, options.sourceCommit);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
