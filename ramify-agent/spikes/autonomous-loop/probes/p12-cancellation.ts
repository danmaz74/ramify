/*
 * Probe 12: cancellation and settlement.
 *
 * Two shapes of abandoned work. In the first a tool ignores its abort signal
 * and keeps running in process. In the second a tool spawns a detached child
 * that writes a file after the tool itself has returned. The probe reports
 * when `abort()` and `waitForIdle()` resolve, whether `agent_settled` fires,
 * and whether either leaves a writer behind after the session reports idle.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attempt, Log, open, result, workspace, type Probe } from '../lib/probe.js';
import { call, hold } from '../lib/scripted-provider.js';

const wait = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms); });

export const probe: Probe = {
  number: 12,
  title: 'Cancellation and settlement',
  async run() {
    const log = new Log();
    // The first prompt aborts during `slow`, so its continuation request never happens.
    const space = await workspace([call('slow', {}), call('detach', {}), hold, hold]);
    const lateFile = join(space.cwd, 'late-writer.txt');
    const detachedFile = join(space.cwd, 'detached-writer.txt');
    let toolSawAbort = false;
    let lateWriteDone = false;
    let detachedPid: number | undefined;

    const slow = defineTool({
      name: 'slow',
      label: 'slow',
      description: 'Takes a long time and ignores cancellation.',
      parameters: { type: 'object', properties: {} } as never,
      async execute(_callId, _params, signal) {
        signal?.addEventListener('abort', () => { toolSawAbort = true; }, { once: true });
        await wait(2_000); // Deliberately ignores the signal.
        writeFileSync(lateFile, 'written by a tool that ignored its signal');
        lateWriteDone = true;
        return { content: [{ type: 'text', text: 'finished late' }], details: {} };
      },
    });
    const detach = defineTool({
      name: 'detach',
      label: 'detach',
      description: 'Leaves a descendant process running and returns at once.',
      parameters: { type: 'object', properties: {} } as never,
      async execute() {
        const child = spawn('sh', ['-c', `sleep 2; echo late > ${JSON.stringify(detachedFile)}`], { detached: true, stdio: 'ignore' });
        child.unref();
        detachedPid = child.pid;
        return { content: [{ type: 'text', text: `spawned ${String(child.pid)}` }], details: {} };
      },
    });

    try {
      let settled = 0;
      const it = await open({
        workspace: space,
        session: { mode: 'create' },
        tools: ['slow', 'detach'],
        customTools: [slow, detach],
        onEvent: event => { if (event.type === 'agent_settled') settled += 1; },
      });

      // A tool that ignores its signal.
      const running = it.session.prompt('start the slow work');
      await wait(300);
      log.show('isStreamingBeforeAbort', it.session.isStreaming);
      const started = Date.now();
      await it.session.abort();
      const abortMs = Date.now() - started;
      log.show('abortWaitedForTheRunningToolMs', abortMs >= 1_000);
      log.show('toolSawTheAbortSignal', toolSawAbort);
      log.show('inProcessWriteHadAlreadyLandedWhenAbortResolved', lateWriteDone && existsSync(lateFile));
      log.show('isIdleAfterAbort', it.session.isIdle);
      log.show('agentSettledAfterFirstAbort', settled);
      await it.session.waitForIdle();
      await running.catch(() => undefined);

      // A tool that leaves a descendant behind.
      const second = it.session.prompt('start the detaching work');
      await wait(600);
      await it.session.abort();
      await it.session.waitForIdle();
      const idleAt = existsSync(detachedFile);
      log.show('detachToolRan', detachedPid !== undefined);
      log.show('isIdleAfterSecondAbort', it.session.isIdle);
      log.show('agentSettledAtEnd', settled);
      log.show('detachedFileExistsWhenTheSessionReportsIdle', idleAt);
      await wait(2_500);
      const landedLater = existsSync(detachedFile);
      log.show('detachedFileExistsTwoSecondsLater', landedLater);
      await second.catch(() => undefined);
      it.close();

      if (settled === 0) {
        return result(probe, 'verified-with-limitation', log, '`abort()` resolved and the session reported idle, but no `agent_settled` event arrived.');
      }
      const leftAWriter = !idleAt && landedLater;
      return result(probe, 'verified-with-limitation', log,
        `\`abort()\` waits for an in-process tool even when that tool ignores its signal, and \`agent_settled\` fires (${settled} times). It does not wait for a descendant process: a detached child wrote its file after the session reported idle: ${leftAWriter}. The SDK therefore cannot confirm that no writer remains, and the harness must confirm settlement itself by process group and a stable tree, as the plan assumes.`);
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
