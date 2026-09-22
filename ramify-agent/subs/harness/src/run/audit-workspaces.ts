import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { childEnvironment } from '../../subs/evidence/src/run-command.js';
import type {
  AuditWorkspaceOwnershipRecorder,
  IntendedAuditWorkspace,
} from '../../subs/audit/src/check-execution.js';
import { listJobDirectories } from '../jobs/records.js';
import { writeFileAtomic } from '../../subs/ledger/src/atomic.js';
import { runDirectory, runLayout } from './records.js';

const exec = promisify(execFile);
const workspaceSchema = z.object({
  schema: z.literal('ramify-agent.audit-workspace/1'),
  state: z.enum(['intended', 'cleaned']),
  repositoryRoot: z.string().min(1),
  gitCommonDirectory: z.string().min(1),
  repositoryId: z.string().min(1),
  temporaryDirectory: z.string().min(1),
  worktreePath: z.string().min(1),
  sourceCommit: z.string().min(1),
  runId: z.string().min(1),
  attemptId: z.string().min(1),
  process: z.object({ id: z.int().positive(), startMarker: z.string().min(1) }).strict(),
  recordedAt: z.iso.datetime(),
  cleanedAt: z.iso.datetime().optional(),
}).strict();
type WorkspaceRecord = z.infer<typeof workspaceSchema>;

/** Harness-owned persistence and conservative cleanup for audit worktrees. */
export function createAuditWorkspaceOwnership(projectRoot: string): AuditWorkspaceOwnershipRecorder {
  return {
    async recordIntendedWorkspace(workspace) {
      const path = await recordPath(projectRoot, workspace.runId, workspace.attemptId);
      await mkdir(dirname(path), { recursive: true });
      await writeRecord(path, { schema: 'ramify-agent.audit-workspace/1', state: 'intended', ...workspace, recordedAt: new Date().toISOString() });
    },

    async recordWorkspaceCleaned(workspace) {
      const path = await recordPath(projectRoot, workspace.runId, workspace.attemptId);
      const current = await readRecord(path);
      if (current === null || !sameWorkspace(current, workspace)) return;
      await writeRecord(path, { ...current, state: 'cleaned', cleanedAt: new Date().toISOString() });
    },

    async recoverAbandonedWorkspaces(repository) {
      const registered = await worktrees(repository.repositoryRoot);
      for (const { planId, jobId } of await listJobDirectories(projectRoot)) {
        const gates = join(runDirectory(projectRoot, planId, jobId), 'gates');
        const attempts = await directories(gates);
        for (const attemptId of attempts) {
          const path = join(gates, attemptId, 'audit-workspace.json');
          const record = await readRecord(path);
          if (record === null || record.state === 'cleaned') continue;
          if (record.repositoryId !== repository.repositoryId
            || resolve(record.gitCommonDirectory) !== resolve(repository.gitCommonDirectory)
            || resolve(record.repositoryRoot) !== resolve(repository.repositoryRoot)) continue;
          const activity = await processActivity(record.process);
          if (activity !== 'inactive') continue;
          await cleanupOwnedWorkspace(record, registered);
          await writeRecord(path, { ...record, state: 'cleaned', cleanedAt: new Date().toISOString() });
        }
      }
    },
  };
}

async function recordPath(projectRoot: string, runId: string, attemptId: string): Promise<string> {
  const matches = (await listJobDirectories(projectRoot)).filter(entry => entry.jobId === runId);
  if (matches.length !== 1) throw new Error(`Audit workspace owner cannot resolve run ${runId}`);
  return join(runDirectory(projectRoot, matches[0]!.planId, runId), runLayout.gateOutput(attemptId), 'audit-workspace.json');
}

async function writeRecord(path: string, record: WorkspaceRecord): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(workspaceSchema.parse(record), null, 2)}\n`);
}

async function readRecord(path: string): Promise<WorkspaceRecord | null> {
  try {
    return workspaceSchema.parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function sameWorkspace(record: WorkspaceRecord, workspace: IntendedAuditWorkspace): boolean {
  return record.runId === workspace.runId && record.attemptId === workspace.attemptId
    && resolve(record.worktreePath) === resolve(workspace.worktreePath)
    && record.sourceCommit === workspace.sourceCommit;
}

async function processActivity(process: WorkspaceRecord['process']): Promise<'active' | 'inactive' | 'unknown'> {
  try {
    globalThis.process.kill(process.id, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return 'inactive';
    return 'unknown';
  }
  const marker = await linuxStartMarker(process.id);
  if (marker === null) return 'unknown';
  return marker === process.startMarker ? 'active' : 'inactive';
}

async function linuxStartMarker(processId: number): Promise<string | null> {
  try {
    const [raw, boot] = await Promise.all([
      readFile(`/proc/${processId}/stat`, 'utf8'),
      readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    ]);
    const close = raw.lastIndexOf(')');
    if (close < 0) return null;
    const ticks = raw.slice(close + 2).trim().split(/\s+/u)[19];
    return ticks === undefined ? null : `linux:${boot.trim()}:${ticks}`;
  } catch {
    return null;
  }
}

interface RegisteredWorktree { readonly path: string; readonly commit: string | null }

async function worktrees(repositoryRoot: string): Promise<Map<string, RegisteredWorktree>> {
  const { stdout } = await exec('git', ['worktree', 'list', '--porcelain'], {
    cwd: repositoryRoot,
    env: childEnvironment({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }),
  });
  const found = new Map<string, RegisteredWorktree>();
  for (const block of stdout.split(/\n\n/u)) {
    const lines = block.split('\n');
    const path = lines.find(line => line.startsWith('worktree '))?.slice('worktree '.length);
    if (path === undefined) continue;
    const commit = lines.find(line => line.startsWith('HEAD '))?.slice('HEAD '.length) ?? null;
    found.set(resolve(path), { path, commit });
  }
  return found;
}

async function cleanupOwnedWorkspace(record: WorkspaceRecord, registered: Map<string, RegisteredWorktree>): Promise<void> {
  const worktree = resolve(record.worktreePath);
  const temporary = resolve(record.temporaryDirectory);
  const temporaryParent = dirname(temporary);
  const temporaryName = basename(temporary);
  if (temporaryParent !== resolve(tmpdir()) || !/^ramify-audit-worktree-[A-Za-z0-9]{6}$/u.test(temporaryName)) {
    throw new Error(`Refusing non-audit temporary directory ${record.temporaryDirectory}`);
  }
  if (temporary === resolve(record.repositoryRoot) || temporary === resolve(record.gitCommonDirectory)) {
    throw new Error(`Refusing repository path as an audit temporary directory ${record.temporaryDirectory}`);
  }
  if (worktree !== resolve(temporary, 'source')) throw new Error(`Refusing malformed owned audit path ${record.worktreePath}`);
  const registration = registered.get(worktree);
  if (registration !== undefined) {
    if (registration.commit !== record.sourceCommit) {
      throw new Error(`Refusing to remove audit worktree ${worktree}: its registered commit changed`);
    }
    await exec('git', ['worktree', 'remove', '--force', '--', worktree], {
      cwd: record.repositoryRoot,
      env: childEnvironment({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }),
    });
  }
  await rm(temporary, { recursive: true, force: true });
}

async function directories(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
