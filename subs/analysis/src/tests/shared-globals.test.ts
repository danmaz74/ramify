import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../index.js';
import type { AnalysisInputs } from '../index.js';
import { createDefaultTagRegistry } from '../../subs/model/src/index.js';

/** One owner's script binds a global that another owner's module reads with
 * no import. The reader's side has nothing to interpret, so only the script's
 * declaration keeps the check from claiming complete coverage. */
const fixtureFiles = {
  'module.ramify': 'ramify 1\nmodule fixture\n',
  'README.md': '# Fixture\n\nA script shares a global with a child owner.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
    types: [], skipLibCheck: true }, include: ['src', 'subs'] }),
  'src/globals.ts': 'var sharedSecret = 1;\n',
  'subs/reader/module.ramify': 'ramify 1\nmodule reader\n',
  'subs/reader/README.md': '# Reader\n\nReads the shared global.\n',
  'subs/reader/src/read.ts': 'export const read = (): number => sharedSecret;\n',
};

describe('shared globals through the public batch session', () => {
  it.each([
    { kind: 'script', source: fixtureFiles['src/globals.ts'], line: 1 },
    { kind: 'module augmentation', source: 'export {};\ndeclare global { var sharedSecret: number; }\n', line: 2 },
  ])('reports a cross-owner $kind as partial coverage', async ({ source, line }) => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-shared-globals-'));
    try {
      for (const [path, text] of Object.entries({ ...fixtureFiles, 'src/globals.ts': source })) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
      }
      const inputs: AnalysisInputs = {
        project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
        registry: createDefaultTagRegistry(), capabilities: ['static-access'],
        limits: {
          acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
            maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
          source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
          maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
        },
      };
      const run = await analyzeProject(inputs);
      expect(run.status).toBe('reported');
      if (run.status !== 'reported') throw new Error('Expected an analysis report');
      expect(run.report.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
      expect(run.report.summary).toMatchObject({ owners: 2, accesses: 0, denied: 0, errors: 0, warnings: 0, coverageNotes: 1 });
      expect(run.report.coverage).toEqual([expect.objectContaining({ code: 'shared-global',
        location: expect.objectContaining({ file: 'src/globals.ts', line, column: 1 }), related: [] })]);
      expect(run.report.stages.every(stage => stage.status === 'completed')).toBe(true);
      expect(run.report.snapshot!.catalog!.files.find(entry => entry.file === 'src/globals.ts')).toMatchObject({ state: 'incomplete', exports: [] });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 20_000);
});
