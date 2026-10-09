import { afterEach, describe, expect, test, vi } from 'vitest';
import { appendJsonLine, withJsonLineAppender } from '../jsonl.js';

const fs = vi.hoisted(() => ({
  open: vi.fn(), append: vi.fn(), sync: vi.fn(), close: vi.fn(),
}));
vi.mock('node:fs/promises', async original => ({
  ...await original<typeof import('node:fs/promises')>(),
  open: fs.open,
}));
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function prepare() {
  const events: string[] = [];
  fs.open.mockImplementation(async (path: string, mode: string) => {
    events.push(`open:${path}:${mode}`);
    return { appendFile: fs.append, datasync: fs.sync, close: fs.close };
  });
  fs.append.mockImplementation(async (line: string) => { events.push(`append:${line}`); });
  fs.sync.mockImplementation(async () => { events.push('sync'); });
  fs.close.mockImplementation(async () => { events.push('close'); });
  return events;
}
afterEach(() => { vi.resetAllMocks(); });

describe('an ordered scoped JSON line appender', () => {
  test('retains literal native JSON bytes and individually flushes every row before close', async () => {
    const events = prepare();
    const result = await withJsonLineAppender('rows', async append => {
      await append({ text: 'é\n', n: -0 });
      await append(['second', null]);
      return 'done';
    });
    expect(result).toBe('done');
    expect(events).toEqual(['open:rows:a', 'append:{"text":"é\\n","n":0}\n', 'sync', 'append:["second",null]\n', 'sync', 'close']);
  });

  test('captures concurrent input synchronously and drains it in order even when use returns', async () => {
    const events = prepare();
    const blocked = gate();
    fs.sync.mockImplementationOnce(async () => { events.push('sync:first'); await blocked.promise; });
    const entered = gate();
    let first!: Promise<void>; let second!: Promise<void>;
    const input = { nested: { value: 'original' } };
    const scope = withJsonLineAppender('rows', async append => {
      first = append(input); second = append({ value: 'next' });
      input.nested.value = 'changed'; entered.resolve();
    });
    await entered.promise;
    await vi.waitFor(() => expect(fs.sync).toHaveBeenCalledTimes(1));
    expect(fs.append).toHaveBeenCalledTimes(1);
    expect(fs.close).not.toHaveBeenCalled();
    blocked.resolve();
    await scope; await first; await second;
    expect(events).toEqual(['open:rows:a', 'append:{"nested":{"value":"original"}}\n', 'sync:first', 'append:{"value":"next"}\n', 'sync', 'close']);
  });

  test('the scope result includes actual close and the captured capability expires', async () => {
    prepare(); const closing = gate(); const entered = gate();
    fs.close.mockImplementation(async () => { entered.resolve(); await closing.promise; });
    let appendLater!: (record: unknown) => Promise<void>;
    let finished = false;
    const scope = withJsonLineAppender('rows', async append => { appendLater = append; await append({ n: 1 }); });
    void scope.then(() => { finished = true; });
    await entered.promise;
    expect(finished).toBe(false);
    await expect(appendLater({ n: 2 })).rejects.toThrow('scope is closed');
    expect(fs.append).toHaveBeenCalledTimes(1);
    closing.resolve(); await scope;
    expect(finished).toBe(true);
  });

  test('callback failure still drains already admitted work and closes once', async () => {
    const events = prepare(); const error = new Error('builder failed');
    const scope = withJsonLineAppender('rows', async append => { void append({ n: 1 }); throw error; });
    await expect(scope).rejects.toBe(error);
    expect(events).toEqual(['open:rows:a', 'append:{"n":1}\n', 'sync', 'close']);
  });

  test('an append failure refuses subsequent writes even if use catches the error', async () => {
    prepare(); const error = new Error('partial write');
    fs.append.mockRejectedValueOnce(error);
    const scope = withJsonLineAppender('rows', async append => {
      await expect(append({ n: 1 })).rejects.toBe(error);
      await expect(append({ n: 2 })).rejects.toBe(error);
    });
    await expect(scope).rejects.toBe(error);
    expect(fs.append).toHaveBeenCalledTimes(1);
    expect(fs.sync).not.toHaveBeenCalled();
    expect(fs.close).toHaveBeenCalledTimes(1);
  });

  test('an undefined sync failure remains a failure and blocks queued later lines', async () => {
    prepare(); fs.sync.mockRejectedValueOnce(undefined);
    let rows!: PromiseSettledResult<void>[];
    const scope = withJsonLineAppender('rows', async append => {
      rows = await Promise.allSettled([append({ n: 1 }), append({ n: 2 })]);
    });
    await expect(scope).rejects.toBeUndefined();
    expect(rows).toEqual([{ status: 'rejected', reason: undefined }, { status: 'rejected', reason: undefined }]);
    expect(fs.append).toHaveBeenCalledTimes(1);
    expect(fs.close).toHaveBeenCalledTimes(1);
  });

  test('invalid JSON representation rejects without writes and still closes', async () => {
    prepare();
    await expect(withJsonLineAppender('rows', async append => { await append(undefined); })).rejects.toThrow('no JSON representation');
    expect(fs.append).not.toHaveBeenCalled();
    expect(fs.close).toHaveBeenCalledTimes(1);
  });

  test('close failure rejects the scope after actual individual flushes', async () => {
    prepare(); const error = new Error('close failed'); fs.close.mockRejectedValueOnce(error);
    await expect(withJsonLineAppender('rows', async append => { await append({ n: 1 }); })).rejects.toBe(error);
    expect(fs.sync).toHaveBeenCalledTimes(1);
  });

  test('ordinary append retains its separate open, flush, close and close-error behavior', async () => {
    const events = prepare(); await appendJsonLine('rows', { n: 1 });
    expect(events).toEqual(['open:rows:a', 'append:{"n":1}\n', 'sync', 'close']);
    fs.close.mockRejectedValueOnce(new Error('close failed'));
    await expect(appendJsonLine('rows', { n: 2 })).rejects.toThrow('close failed');
    expect(fs.open).toHaveBeenCalledTimes(2);
  });
});
