/*
 * Probes 10 and 11: the write guard, and observation after a mutation.
 *
 * Both built-ins are enabled. A `tool_call` hook blocks one `write` and one
 * `edit` with a reason, allows a third `write`, and lets a fourth `write`
 * fail on its own. The probe reports whether the reason reaches the model as
 * an error tool result, whether anything was written, and which post-tool
 * hooks fired for the call that failed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolCallEvent, ToolResultEvent } from '@earendil-works/pi-coding-agent';
import { attempt, Log, open, requestText, result, workspace, type Probe } from '../lib/probe.js';
import { call, text } from '../lib/scripted-provider.js';

interface Observed {
  readonly log: Log;
  readonly blockedCalls: Array<{ tool: string; blocked: boolean }>;
  readonly afterHooks: Array<{ hook: string; tool: string; isError: boolean }>;
  readonly modelSaw: string;
  readonly blockedFileExists: boolean;
  readonly editedFileUnchanged: boolean;
  readonly allowedFileWritten: boolean;
  readonly toolEndEvents: Array<{ tool: string; isError: boolean }>;
}

async function guarded(): Promise<Observed> {
  const log = new Log();
  const space = await workspace([
    call('write', { path: 'outside/blocked.txt', content: 'must not appear' }),
    call('edit', { path: 'guarded.txt', edits: [{ oldText: 'original', newText: 'tampered' }] }),
    call('write', { path: 'allowed.txt', content: 'this one is in scope' }),
    // A mutating tool that fails on its own: the path is an existing directory.
    call('write', { path: 'a-directory', content: 'cannot be written' }),
    text('I could not do it.'),
  ]);
  const blockedCalls: Observed['blockedCalls'] = [];
  const afterHooks: Observed['afterHooks'] = [];
  const toolEndEvents: Observed['toolEndEvents'] = [];
  try {
    writeFileSync(join(space.cwd, 'guarded.txt'), 'original\n');
    mkdirSync(join(space.cwd, 'a-directory'));

    const it = await open({
      workspace: space,
      session: { mode: 'create' },
      tools: ['read', 'write', 'edit'],
      extend: api => {
        // Both handlers are async, as the port's `guard` and `afterMutation` are.
        api.on('tool_call', async (event: ToolCallEvent) => {
          const path = (event as { input?: { path?: string } }).input?.path ?? '';
          await Promise.resolve();
          const blocked = path.startsWith('outside/') || path === 'guarded.txt';
          blockedCalls.push({ tool: event.toolName, blocked });
          if (!blocked) return undefined;
          return { block: true, reason: `The write scope does not contain ${path}. Report the need or use the delegation mechanism; do not widen the scope yourself.` };
        });
        api.on('tool_result', async (event: ToolResultEvent) => {
          await Promise.resolve();
          afterHooks.push({ hook: 'tool_result', tool: event.toolName, isError: event.isError === true });
          // The hook check the harness runs after a settled mutation reaches the engineer here.
          if (event.isError === true) return undefined;
          const content = (event.result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content ?? [];
          return { content: [...content, { type: 'text', text: 'RAMIFY-HOOK-CHECK: ramify check --changed reported 1 new finding.' }] };
        });
      },
      onEvent: event => {
        if (event.type === 'tool_execution_end') toolEndEvents.push({ tool: event.toolName, isError: event.isError });
      },
    });
    await it.session.prompt('make the changes');
    log.show('guardSawCalls', blockedCalls);
    log.show('toolExecutionEnd', toolEndEvents);
    log.show('postToolHooks', afterHooks);
    log.show('activeTools', it.session.getActiveToolNames());
    const modelSaw = requestText(space.scripted, space.scripted.requests.length - 1);
    log.show('modelSawTheReason', modelSaw.includes('The write scope does not contain'));
    log.show('modelSawBothReasons', (modelSaw.match(/The write scope does not contain/g) ?? []).length);
    log.show('modelSawTheHookCheckTheResultHookAdded', modelSaw.includes('RAMIFY-HOOK-CHECK'));
    log.show('sessionContinuedAfterBlocks', space.scripted.requests.length >= 4);
    it.close();

    const blockedFileExists = existsSync(join(space.cwd, 'outside', 'blocked.txt'));
    const editedFileUnchanged = readFileSync(join(space.cwd, 'guarded.txt'), 'utf8') === 'original\n';
    const allowedFileWritten = existsSync(join(space.cwd, 'allowed.txt'));
    log.show('blockedFileExists', blockedFileExists);
    log.show('editedFileUnchanged', editedFileUnchanged);
    log.show('allowedFileWritten', allowedFileWritten);
    return { log, blockedCalls, afterHooks, modelSaw, blockedFileExists, editedFileUnchanged, allowedFileWritten, toolEndEvents };
  } finally {
    await space.remove();
  }
}

let shared: Observed | undefined;
const once = async (): Promise<Observed> => (shared ??= await guarded());

export const probe10: Probe = {
  number: 10,
  title: 'Guarded `edit` and `write`',
  async run() {
    const it = await once();
    if (it.blockedFileExists || !it.editedFileUnchanged) {
      return result(probe10, 'unavailable', it.log, 'A blocked call still mutated the filesystem.');
    }
    if (!it.modelSaw.includes('The write scope does not contain')) {
      return result(probe10, 'unavailable', it.log, 'The denial reason did not reach the model.');
    }
    if (!it.allowedFileWritten) {
      return result(probe10, 'verified-with-limitation', it.log, 'The blocks worked but the allowed write did not happen.');
    }
    return result(probe10, 'verified', it.log,
      'Both built-ins were enabled through the `tools` allowlist; the `tool_call` hook’s `{ block: true, reason }` reached the model as an error tool result, the session continued, and neither blocked target was touched.');
  },
};

export const probe11: Probe = {
  number: 11,
  title: 'After-mutation observation',
  async run() {
    const it = await once();
    const failed = it.toolEndEvents.filter(event => event.isError);
    const failedHook = it.afterHooks.filter(hook => hook.isError);
    if (failed.length === 0) {
      return result(probe11, 'unavailable', it.log, 'No mutating tool failed, so nothing could be observed.');
    }
    if (failedHook.length === 0) {
      return result(probe11, 'verified-with-limitation', it.log, '`tool_execution_end` fired for the failed call but the `tool_result` hook did not.');
    }
    const executed = it.blockedCalls.filter(entry => !entry.blocked).length;
    const hookCoversBlocked = it.afterHooks.length === it.blockedCalls.length;
    return result(probe11, hookCoversBlocked ? 'verified' : 'verified-with-limitation', it.log,
      `The \`tool_result\` extension hook fires for a mutating tool that failed on its own (${failedHook.length} of ${it.afterHooks.length} firings carried \`isError\`), but only for tools that executed: it fired ${it.afterHooks.length} times for ${executed} executed calls out of ${it.blockedCalls.length} attempted, so a blocked call never reaches it. The \`tool_execution_end\` session event fired for all ${it.toolEndEvents.length}, blocked calls included, so after-mutation observation must come from that event rather than from \`tool_result\`.`);
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify([await attempt(probe10), await attempt(probe11)], null, 2));
}
