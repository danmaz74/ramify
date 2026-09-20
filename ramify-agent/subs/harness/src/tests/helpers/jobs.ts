import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createScriptedAgent, type Script } from '../../../subs/agent/src/scripted.js';
import type { MapSubmission } from '../../interfaces/map.js';
import type { Command, JobEvent } from '../../interfaces/protocol/jobs.js';
import { JobService, type JobServiceOptions } from '../../jobs/service.js';
import { demonstrationMap } from '../../mapping/demo-script.js';
import { acquireProjectLock, lockPath } from '../../store/lock.js';
import { shapeOnlyProcedure } from './procedures.js';

/** A valid submission for the fixture. */
export function validMap(): MapSubmission {
  return demonstrationMap('collection-review');
}

/** Opens a job service on `root` with the lock, the given script, quiet warnings and, unless given another, the shape-only procedure. */
export async function openJobs(root: string, script?: Script, options: Partial<JobServiceOptions> = {}) {
  const lock = await acquireProjectLock(root);
  const agent = script === undefined ? undefined : createScriptedAgent(script);
  const warnings: string[] = [];
  const { service, recovery } = await JobService.open({
    projectRoot: root, lock, agent, stopGraceMs: 200, warn: message => warnings.push(message), procedure: shapeOnlyProcedure, ...options,
  });
  return { service, recovery, agent, lock, warnings };
}

let commandCount = 0;
export function start(planId: string, commandId = `start-${++commandCount}`): Command {
  return { commandId, expectedVersion: 0, type: 'start-mapping', payload: { planId } };
}

export function stop(planId: string, jobId: string, expectedVersion: number, commandId = `stop-${++commandCount}`): Command {
  return { commandId, expectedVersion, type: 'stop-job', payload: { planId, jobId } };
}

/** The job's events as written in its `events.jsonl`. */
export async function eventsOnDisk(root: string, planId: string, jobId: string): Promise<JobEvent[]> {
  const text = await readFile(join(root, 'plans', planId, '.harness', 'jobs', jobId, 'events.jsonl'), 'utf8');
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as JobEvent);
}

/** The process ID of a process that has exited. */
export function deadPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', () => resolve(child.pid!));
  });
}

/**
 * What a crash leaves: the lock file of a process that is gone. The crashed
 * service is abandoned, never closed, so it writes nothing more.
 */
export async function crashLock(root: string): Promise<void> {
  const record = { pid: await deadPid(), startedAt: new Date().toISOString(), processStart: null, token: 'crashed' };
  await writeFile(join(root, lockPath), `${JSON.stringify(record)}\n`);
}

/** Waits until `condition` holds, polling. */
export async function until(condition: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** A promise that never settles: a job frozen here writes nothing more, as after a crash. */
export const freeze = (): Promise<void> => new Promise(() => undefined);
