import { describe, expect, it } from 'vitest';
import type { ServiceConnection } from '../../../daemon/src/interfaces/daemon.js';
import { runCli } from '../run-cli.js';

function connection(open: ServiceConnection['openContext'], closed: string[]): ServiceConnection {
  return {
    state: 'connected', reason: null,
    daemon: { protocol: 'ramify.ipc/1', instance: { instanceId: 'daemon', pid: 1, version: '1', engine: 'engine', buildKey: '0123456789abcdef' },
      capabilities: ['contexts'], limits: { maxRequestBytes: 1, maxResponseBytes: 1, leaseMs: 1, pingMs: 1 } },
    openContext: open,
    closeContext: async (params: { readonly token: { readonly context: string } }) => {
      closed.push(`context:${params.token.context}`); return { ok: true, value: null };
    },
    close: async () => { closed.push('connection'); },
  } as unknown as ServiceConnection;
}

describe('explore command', () => {
  it('selects the requested root, launches from an opaque token and opens once', async () => {
    const calls: unknown[] = [], closed: string[] = [], output: string[] = [];
    const token = { context: 'ctx/1:opaque', generation: 'gen/1:opaque' } as const;
    const service = connection(async params => {
      calls.push(params);
      return { ok: true, value: { status: 'opened', token, current: { selection: { root: '/canonical/project' } } } } as never;
    }, closed);
    const result = await runCli(['explore', '--root', '../project'], {
      cwd: '/working/subdir', version: '1', stdout: text => output.push(text), stderr: text => { throw new Error(text); },
      batch: async () => { throw new Error('Explore must not invoke batch'); },
      connect: async options => { expect(options.start).toBe('if-needed'); return { status: 'connected', connection: service, started: true }; },
      explore: async input => { calls.push(input); return { url: 'http://127.0.0.1:4321/explore/ctx%2F1%3Aopaque/gen%2F1%3Aopaque',
        started: true, cleanup: async () => { throw new Error('Successful launch must remain running'); } }; },
      openBrowser: async url => { calls.push(url); },
    });
    expect(result).toBe(0);
    expect(calls[0]).toMatchObject({ project: { cwd: '/working/subdir', root: '../project', scope: 'whole-project', configuration: 'discover' } });
    expect(calls.slice(1)).toEqual([{ token }, 'http://127.0.0.1:4321/explore/ctx%2F1%3Aopaque/gen%2F1%3Aopaque']);
    expect(output).toEqual(['Explorer: http://127.0.0.1:4321/explore/ctx%2F1%3Aopaque/gen%2F1%3Aopaque\n']);
    expect(closed).toEqual(['context:ctx/1:opaque', 'connection']);
  });

  it('reports daemon unavailability without launch, opener or batch fallback', async () => {
    let otherCalls = 0;
    const stderr: string[] = [];
    const result = await runCli(['explore'], { cwd: '/project', version: '1', stdout: () => {}, stderr: text => stderr.push(text),
      connect: async () => ({ status: 'unavailable', attempts: 1, message: 'daemon unavailable',
        reason: { kind: 'failure', message: 'daemon unavailable' } }),
      batch: async () => { otherCalls++; throw new Error('Unexpected batch'); },
      explore: async () => { otherCalls++; throw new Error('Unexpected launch'); },
      openBrowser: async () => { otherCalls++; },
    });
    expect([result, otherCalls]).toEqual([2, 0]);
    expect(stderr.join('')).toContain('daemon unavailable');
  });

  it('cleans up an owned first launch when the browser opener fails', async () => {
    const closed: string[] = [];
    const token = { context: 'ctx', generation: 'gen' } as const;
    let cleanups = 0, batchCalls = 0;
    const service = connection(async () => ({ ok: true,
      value: { status: 'opened', token, current: { selection: { root: '/project' } } } } as never), closed);
    const stderr: string[] = [];
    const result = await runCli(['explore'], { cwd: '/project', version: '1', stdout: () => {}, stderr: text => stderr.push(text),
      connect: async () => ({ status: 'connected', connection: service, started: false }),
      batch: async () => { batchCalls++; throw new Error('Unexpected batch'); },
      explore: async () => ({ url: 'http://127.0.0.1:1/explore/ctx/gen', started: true,
        cleanup: async () => { cleanups++; } }),
      openBrowser: async () => { throw new Error('controlled opener refusal'); },
    });
    expect([result, cleanups, batchCalls]).toEqual([2, 1, 0]);
    expect(stderr.join('')).toContain('Could not open the browser: controlled opener refusal');
    expect(closed).toEqual(['context:ctx', 'connection']);
  });
});
