import { mkdtemp, rm, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Capture } from '../capture.js';
import { limits, put } from './fixtures.js';

let root: string;
let capture: Capture;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'ramify-capture-')); capture = new Capture(root, limits, performance.now() + 30_000); });
afterEach(async () => { await capture.dispose(); await rm(root, { recursive: true, force: true }); });

describe('one captured filesystem view', () => {
  it('returns captured bytes after an edit and reports changed input at seal', async () => {
    await put(root, 'value.ts', 'before');
    expect(await capture.readFile('value.ts')).toBe('before');
    await put(root, 'value.ts', 'after!');
    expect(await capture.readFile('value.ts')).toBe('before');
    expect(await capture.seal()).toEqual({ status: 'changed', paths: ['value.ts'] });
  });
  it('captures absence across all read methods and notices a newly created candidate', async () => {
    expect(await capture.readFile('missing.ts')).toBeUndefined();
    expect(await capture.fileExists('missing.ts')).toBe(false);
    expect(await capture.realPath('missing.ts')).toBeUndefined();
    await put(root, 'missing.ts', 'new');
    expect(await capture.fileExists('missing.ts')).toBe(false);
    expect(await capture.seal()).toEqual({ status: 'changed', paths: ['missing.ts'] });
  });
  it('does not invalidate a named ancestor-marker lookup when unrelated entries change', async () => {
    expect(await capture.hasExactEntry(join(root, 'module.ramify'))).toBe(false);
    await put(root, 'unrelated.tmp', 'changed');
    expect((await capture.seal()).status).toBe('coherent');
    expect(capture.inputs.map(input => input.path)).toEqual(['module.ramify']);
  });
  it('ignores membership changes in a directory whose contents were never read', async () => {
    await put(root, '.reference-work/existing.txt', 'existing');
    expect(await capture.directoryExists('.reference-work')).toBe(true);
    const before = capture.inputs;
    await put(root, '.reference-work/new-run/trace.txt', 'new');
    expect(await capture.seal()).toEqual({ status: 'coherent', inputs: before });
  });
  it('still detects replacement of an unenumerated directory by a file', async () => {
    await put(root, '.reference-work/existing.txt', 'existing');
    expect(await capture.directoryExists('.reference-work')).toBe(true);
    await rm(join(root, '.reference-work'), { recursive: true });
    await put(root, '.reference-work', 'replacement');
    expect(await capture.seal()).toEqual({ status: 'changed', paths: ['.reference-work'] });
  });
  it('retains directory membership and detects growth without reading new source', async () => {
    await put(root, 'src/a.ts', 'a');
    expect(await capture.readDirectory('src')).toEqual([join(root, 'src/a.ts')]);
    await put(root, 'src/b.ts', 'b');
    expect(await capture.readDirectory('src')).toEqual([join(root, 'src/a.ts')]);
    expect(await capture.seal()).toEqual({ status: 'changed', paths: ['src'] });
  });
  it('rejects new observations and unread bytes after sealing; known reads stay available', async () => {
    await put(root, 'known.ts', 'known'); await put(root, 'unread.ts', 'unread');
    await capture.readFile('known.ts'); await capture.fileExists('unread.ts');
    expect((await capture.seal()).status).toBe('coherent');
    expect(await capture.readFile('known.ts')).toBe('known');
    await expect(capture.readFile('unread.ts')).rejects.toThrow('after sealing');
    await expect(capture.fileExists('new.ts')).rejects.toThrow('after sealing');
  });
  it('hashes original binary bytes but requires UTF-8 for compiler text', async () => {
    await put(root, 'image.bin', new Uint8Array([0xff, 0x80, 0x00]));
    expect(await capture.application('image.bin', 'resource')).toMatchObject({ bytes: 3, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    await expect(capture.readFile('image.bin')).rejects.toThrow('UTF-8');
  });
  it('retains a BOM for parser source offsets', async () => {
    await put(root, 'module.ramify', '\uFEFFramify 1\nmodule fixture\n');
    expect(await capture.readFile('module.ramify')).toMatch(/^\uFEFF/);
  });
  it('shares concurrent first reads and releases its data idempotently', async () => {
    await put(root, 'value.ts', 'value');
    expect(await Promise.all([capture.readFile('value.ts'), capture.readFile('value.ts')])).toEqual(['value', 'value']);
    const inputs = capture.inputs;
    expect(inputs).toHaveLength(1); expect(Object.isFrozen(inputs)).toBe(true);
    await capture.dispose(); await capture.dispose();
    expect(capture.inputs).toEqual([]); expect(inputs).toHaveLength(1);
    await expect(capture.readFile('value.ts')).rejects.toThrow('disposed');
  });
  it('rejects a file replaced by a symlink between observation and byte capture', async () => {
    await put(root, 'value.ts', 'original'); await put(root, 'target.ts', 'target');
    expect(await capture.fileExists('value.ts')).toBe(true);
    await unlink(join(root, 'value.ts')); await symlink(join(root, 'target.ts'), join(root, 'value.ts'));
    await expect(capture.readFile('value.ts')).rejects.toMatchObject({ code: 'read-failure' });
  });
  it('captures dependency symlinks and detects retargeting', async () => {
    await put(root, 'a.json', '"a"'); await put(root, 'b.json', '"b"');
    await symlink(join(root, 'a.json'), join(root, 'link.json'));
    expect(await capture.readFile('link.json')).toBe('"a"');
    await unlink(join(root, 'link.json')); await symlink(join(root, 'b.json'), join(root, 'link.json'));
    expect(await capture.readFile('link.json')).toBe('"a"');
    expect((await capture.seal())).toMatchObject({ status: 'changed', paths: ['link.json'] });
  });
  it.each([
    ['maxFileBytes', 2], ['maxInputBytes', 16], ['maxApplicationBytes', 2],
  ] as const)('enforces %s before a successful application result', async (key, value) => {
    await capture.dispose(); capture = new Capture(root, { ...limits, [key]: value }, performance.now() + 30_000);
    await put(root, 'value.ts', 'large');
    await expect(capture.application('value.ts', 'source')).rejects.toMatchObject({ code: 'resource-limit' });
  });
  it('checks cancellation before observing a path', async () => {
    const controller = new AbortController(); controller.abort();
    await capture.dispose(); capture = new Capture(root, limits, performance.now() + 30_000, controller.signal);
    await expect(capture.fileExists('anything')).rejects.toThrow(); expect(capture.inputs).toEqual([]);
  });
});
