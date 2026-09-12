import { deepStrictEqual, strictEqual } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Capture } from '../capture.js';
import { limits, put } from './fixtures.js';

/** A shared path can be an acquisition probe and a later compiler byte read. */
export async function captureRetirementWitness(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-capture-retirement-'));
  const capture = new Capture(root, limits, performance.now() + 30_000);
  try {
    await put(root, 'src/value.ts', 'export const value = 1;\n');
    await put(root, 'package.json', '{"type":"module"}');
    await capture.application('src/value.ts', 'source');
    await capture.hasExactEntry(join(root, 'package.json'));
    await capture.directoryExists('src');
    const acquired = capture.inputs;
    capture.retainAcquisition();
    await capture.reported(async () => {
      await capture.readFile('package.json');
      await capture.readDirectory('src');
      await capture.fileExists('gone/package.json');
    });
    strictEqual(capture.inputs.find(input => input.path === 'package.json')!.bytes > 0, true);
    strictEqual(capture.inputs.some(input => input.path === 'gone/package.json'), true);
    await capture.retireReported();
    deepStrictEqual(capture.inputs, acquired, 'retirement restores acquisition roles, exact names, bytes and probe-only directories');
    // A later acquired source is retained while a historical compiler probe retires.
    await put(root, 'src/extra.ts', 'export const extra = 2;\n');
    await capture.application('src/extra.ts', 'source');
    await capture.reported(() => capture.fileExists('another/package.json'));
    await capture.retireReported();
    deepStrictEqual(capture.inputs.map(input => input.path), ['package.json', 'src', 'src/extra.ts', 'src/value.ts']);
  } finally { await capture.dispose(); await rm(root, { recursive: true, force: true }); }
}
