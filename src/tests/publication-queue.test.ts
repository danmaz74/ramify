import { describe, expect, it } from 'vitest';
import { createPublicationQueue } from '../publication-queue.js';
import { reportCapacity } from '../report-capacity.js';

describe('bounded CLI publication queue', () => {
  it('admits a complete 70 MiB publication, accounts for in-flight bytes, then releases them', async () => {
    const text = 'x'.repeat(70 * 1024 ** 2);
    const published: string[] = [];
    let release!: () => void;
    const queue = createPublicationQueue(async value => {
      published.push(value);
      await new Promise<void>(resolve => { release = resolve; });
    }, reportCapacity.cliOutputBytes);
    const first = queue.append(text);
    expect(() => queue.append(text)).toThrow('CLI output queue exceeded');
    await Promise.resolve();
    expect(published).toEqual([text]);
    release(); await first;
    const second = queue.append(text);
    await Promise.resolve();
    expect(published).toEqual([text, text]);
    release(); await second;
  });

  it('rejects a single publication beyond the finite allowance before calling the publisher', () => {
    let calls = 0;
    const queue = createPublicationQueue(async () => { calls++; }, reportCapacity.cliOutputBytes);
    expect(() => queue.append('x'.repeat(reportCapacity.cliOutputBytes + 1))).toThrow('CLI output queue exceeded');
    expect(calls).toBe(0);
  });

  it('counts UTF-8 bytes, serializes admitted publications and preserves a write failure', async () => {
    const seen: string[] = [];
    const queue = createPublicationQueue(async value => { seen.push(value); if (value === 'fail') throw new Error('broken pipe'); }, 8);
    const first = queue.append('éé');
    const second = queue.append('fail');
    expect(() => queue.append('x')).toThrow('CLI output queue exceeded');
    await first;
    await expect(second).rejects.toThrow('broken pipe');
    await expect(queue.append('later')).rejects.toThrow('broken pipe');
    expect(seen).toEqual(['éé', 'fail']);
  });
});
