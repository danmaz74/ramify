import { writeFile } from 'node:fs/promises';
import { describeTestLockWait, withMachineTestLock } from 'ramify-audit';
import { outputTailBytes } from '../../evidence/src/run-command.js';
import type { CommandRun, CommandRunner } from '../../evidence/src/run-command.js';

/** The harness's own identity for a suite command. */
export interface TestLockOwner {
  readonly repositoryPath: string;
  readonly runId?: string;
  readonly checkId?: string;
  readonly command: string;
}

/** Wait lifecycle; `settled` closes every wait, including cancellation and errors. */
export interface TestLockHooks {
  readonly waiting?: (line: string) => void | Promise<void>;
  readonly acquired?: (waitedMs: number) => void | Promise<void>;
  readonly settled?: () => void | Promise<void>;
}

/** Test-only replacements for the fixed machine lock. Never a run setting. */
export interface TestLockOverride {
  readonly lockPath?: string;
  readonly findFlock?: () => Promise<string | undefined>;
  readonly held?: boolean;
  readonly waitTimeoutMs?: number;
}

/** A runner whose command timeout begins after lock acquisition. */
export function testLockedRunner(
  runner: CommandRunner, owner: TestLockOwner, hooks: TestLockHooks = {}, override?: TestLockOverride,
): CommandRunner {
  return async request => {
    let waiting = false;
    let waitStartedAt: number | undefined;
    let waitEndedAt: number | undefined;
    let acquiredWaitMs: number | undefined;
    const measuredWait = () => acquiredWaitMs ?? (waitStartedAt === undefined
      ? undefined : Math.max(0, (waitEndedAt ?? Date.now()) - waitStartedAt));
    const onAbort = () => { if (waitStartedAt !== undefined && waitEndedAt === undefined) waitEndedAt = Date.now(); };
    request.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await withMachineTestLock(
        async environment => {
          const env = { ...request.env, ...environment };
          const run = await runner({ ...request, env });
          return { ...run, receivedEnvironment: Object.keys(env).sort() };
        },
        {
          owner,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
          onWaiting: async wait => {
            waiting = true;
            waitStartedAt ??= Date.now();
            await hooks.waiting?.(describeTestLockWait(wait));
          },
          onAcquired: async acquired => {
            waitEndedAt = Date.now();
            acquiredWaitMs = acquired.waitedMs;
            await hooks.acquired?.(acquired.waitedMs);
          },
        },
        override,
      );
      if (result.status === 'cancelled') return emptyRun(request.outputFile, { kind: 'cancelled' }, measuredWait());
      if (result.status === 'wait-exceeded') return emptyRun(request.outputFile, {
        kind: 'runner-error', error: {
          kind: 'test-lock-wait-exceeded', message: `Waited ${result.waitedMs} ms for the machine test lock${result.holder ? ` held by pid ${result.holder.pid} for ${result.holder.repositoryPath}` : ''}`,
        },
      }, result.waitedMs);
      const run = result.value;
      if (result.lock === 'unavailable') {
        const stdout = `${result.note}\n${run.stdout}`;
        const complete = Buffer.from(`${stdout}${run.stderr}`, 'utf8');
        if (request.outputFile !== undefined) await writeFile(request.outputFile, complete);
        const tail = `${result.note}\n${run.output.tail}`;
        return { ...run, stdout, output: {
          ...run.output, bytes: complete.byteLength,
          tail: Buffer.from(tail, 'utf8').subarray(0, outputTailBytes).toString('utf8'),
        } };
      }
      return { ...run, ...(result.lock === 'held' && result.waitedMs > 0 ? { lockWaitMs: result.waitedMs } : {}) };
    } catch (error) {
      if (request.signal?.aborted) return emptyRun(request.outputFile, { kind: 'cancelled' }, measuredWait());
      return emptyRun(request.outputFile, {
        kind: 'runner-error', error: { kind: 'test-lock', message: error instanceof Error ? error.message : String(error) },
      }, measuredWait());
    } finally {
      request.signal?.removeEventListener('abort', onAbort);
      if (waiting) await hooks.settled?.();
    }
  };
}

async function emptyRun(outputFile: string | undefined, outcome: CommandRun['outcome'], lockWaitMs?: number): Promise<CommandRun> {
  if (outputFile !== undefined) await writeFile(outputFile, '');
  return {
    outcome, startedAt: new Date().toISOString(), elapsedMs: 0,
    output: { path: outputFile ?? null, bytes: 0, truncated: false, tail: '' },
    stdout: '', stderr: '', ...(lockWaitMs === undefined ? {} : { lockWaitMs }),
  };
}
