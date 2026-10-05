import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionMeasurements } from '../../../analysis/src/interfaces/measurements.js';
import { createFilesystemApiViewPublisher } from '../api-view-publisher.js';
import { architectMeasurements, measureApiViewBytes } from '../measurements.js';
import { area, described, entry, file, moduleProjection, projection } from './api-view-fixtures.js';

const limits = { maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2 };
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const bucket = (sourceFiles: number) => ({ production: { sourceFiles, sourceBytes: sourceFiles * 10,
  resourceFiles: 0, resourceBytes: 0 }, tests: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 },
documentation: { files: 1, bytes: 20 } });
const inventory: SessionMeasurements = { sequence: 1, inputId: 'input-1', modules: [
  { id: 'root', dir: '', parent: null, exact: bucket(1), subtree: bucket(2) },
  { id: 'root/child', dir: 'subs/child', parent: 'root', exact: bucket(1), subtree: bucket(1) },
], files: [] };

describe('daemon module measurements (MM05, MM07)', () => {
  it('measures publication bytes in memory, joins exact/subtree values and reuses selected buffers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-measurements-')); roots.push(root);
    await mkdir(join(root, 'src/tests'), { recursive: true });
    await mkdir(join(root, 'subs/child/src'), { recursive: true });
    const api = projection([
      moduleProjection('root', '', area('ordinary', 'src', [file('external', 'child.ts', [
        entry('child', 'value', described('child', 'function child(): void;'))])]), area('tests', 'src/tests', [])),
      moduleProjection('root/child', 'subs/child', area('ordinary', 'subs/child/src', [])),
    ]);
    const rendered = await measureApiViewBytes(api, 'rev-1', { ...limits, keep: () => true });
    if (rendered.status !== 'rendered') throw new Error(JSON.stringify(rendered));
    await expect(access(join(root, 'src/.ramify'))).rejects.toMatchObject({ code: 'ENOENT' });
    const measurements = architectMeasurements(inventory, 'measured', rendered.views);
    if (measurements.state !== 'measured') throw new Error('Expected measured values');
    const parent = measurements.modules[0]!, child = measurements.modules[1]!;
    expect(parent.subtree.views).toEqual({
      ordinaryBytes: parent.exact.views!.ordinaryBytes + child.exact.views!.ordinaryBytes,
      testsBytes: parent.exact.views!.testsBytes + child.exact.views!.testsBytes,
    });
    const selected = await measureApiViewBytes(api, 'rev-1', { ...limits, keep: module => module === 'root/child' });
    if (selected.status !== 'rendered') throw new Error(JSON.stringify(selected));
    expect(Object.keys(selected.views)).toEqual(['root', 'root/child']);
    expect(new Set(selected.areas.map(value => value.module))).toEqual(new Set(['root/child']));

    const publisher = createFilesystemApiViewPublisher({ ...limits, maxArchitectBytes: 64 * 1024 ** 2,
      maxStagedBytes: 256 * 1024 ** 2 });
    const published = await publisher.publish(root, 'rev-1',
      { api: null, renderedApi: rendered.areas, architect: null }, 'measurement-test');
    if (published.status !== 'published') throw new Error(JSON.stringify(published));
    for (const target of published.targets) {
      const expected = rendered.views[target.module!]![target.area === 'ordinary' ? 'ordinaryBytes' : 'testsBytes'];
      expect(target.bytes).toBe(expected);
      expect(JSON.parse((await readFile(join(root, target.path, '_meta.json'))).toString('utf8')).revision).toBe('rev-1');
    }
  });

  it('keeps unavailable view bytes uniform and omits every bucket view field', () => {
    const measurements = architectMeasurements(inventory, { state: 'unavailable', reason: 'resource-unavailable' });
    expect(measurements.state).toBe('measured');
    if (measurements.state === 'measured') {
      expect(measurements.views).toEqual({ state: 'unavailable', reason: 'resource-unavailable' });
      for (const module of measurements.modules) {
        expect(module.exact).not.toHaveProperty('views');
        expect(module.subtree).not.toHaveProperty('views');
      }
    }
  });
});
