import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import { RamifyCli, type RamifyRun } from '../../../subs/evidence/src/ramify-cli.js';
import { architectViewDirectory } from '../../../subs/evidence/src/views.js';
import { mockGit } from './mock-git.js';
import { scriptedCandidates } from './candidates.js';
import { mappedAudit } from './direct-check-execution.js';
import { shapeOnlyInputs } from './runs.js';
import type { RunInputs } from '../../run/inputs.js';

const head = 'a'.repeat(40), tree = '1'.repeat(40);
const exact = {
  production: { sourceFiles: 2, sourceBytes: 131, resourceFiles: 1, resourceBytes: 17 },
  tests: { sourceFiles: 1, sourceBytes: 89, resourceFiles: 0, resourceBytes: 0 },
  documentation: { files: 1, bytes: 53 }, views: { ordinaryBytes: 31, testsBytes: 23 },
};
const subtree = {
  production: { sourceFiles: 4, sourceBytes: 313, resourceFiles: 1, resourceBytes: 17 },
  tests: { sourceFiles: 2, sourceBytes: 179, resourceFiles: 0, resourceBytes: 0 },
  documentation: { files: 2, bytes: 103 }, views: { ordinaryBytes: 61, testsBytes: 43 },
};
/** Independent, literal producer facts. They are not calculated from the fixture tree. */
export function measurementDocument(root: string) {
  return { schema: 'ramify.measure/2', revision: 'rev/scripted-measurement:1', root,
    ownershipRule: 'Synthetic measurement fixture; no provider conformance claim', views: 'measured', files: [],
    modules: [
      { id: 'collection-review', dir: '.', parent: null, exact, subtree },
      { id: 'collection-review/workspace', dir: 'subs/workspace', parent: 'collection-review', exact, subtree: exact },
    ] };
}

/** Fixed file bytes; captureSnapshot/directoryBytes still measure the actual published directory. */
export async function publishMeasurementView(root: string): Promise<void> {
  await mkdir(join(root, architectViewDirectory, 'module'), { recursive: true });
  await writeFile(join(root, architectViewDirectory, 'README.md'), 'Synthetic published view bytes.\n');
  await writeFile(join(root, architectViewDirectory, 'module', 'behavior.jsonl'), '{"synthetic":true}\n');
}

export function measurementBoundaries(root: string, unavailable = false) {
  const failures: string[] = [], calls: string[] = [];
  let runId: string | undefined;
  const consumed = new Map<string, number>();
  function once(operation: string): void { expect(consumed.get(operation) ?? 0, `exhausted ${operation} answer`).toBe(0); consumed.set(operation, 1); calls.push(operation); }
  function retain<T extends object>(port: T): T {
    return new Proxy(port, { get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try { return await value.apply(target, args); }
        catch (error) { failures.push(`${String(property)}: ${String(error)}`); throw error; }
      };
    } });
  }
  const git = mockGit({
    async currentHead(project) { expect(project).toBe(root); calls.push('head'); return head; },
    async isCleanRepository(project) { expect(project).toBe(root); calls.push('clean'); return true; },
    async createRunBranch(project, run) { expect(project).toBe(root); expect(run).toMatch(/^\d{8}T\d{6}Z-[0-9a-f]{6}$/u); expect(runId ?? run).toBe(run); runId = run; once('branch'); return { branch: `ramify-agent-run/${run}`, created: true }; },
    async trackedPaths(project, directories) { expect(project).toBe(root); expect(directories.every(path => /(?:^|\/)src\/tmp$/u.test(path))).toBe(true); return []; },
    async ignoreStatus(project, paths) { expect(project).toBe(root); expect(paths.every(path => /(?:^|\/)src\/tmp\//u.test(path))).toBe(true); return paths.map(path => ({ path, ignored: true, rule: { source: '.gitignore', line: 3, pattern: '**/src/tmp/' } })); },
    async findCommitByTrailers(project, trailers) {
      expect(project).toBe(root); expect(trailers, JSON.stringify(trailers)).toEqual([{ key: 'Ramify-Run', value: expect.stringMatching(/^\d{8}T\d{6}Z-[0-9a-f]{6}$/u) }, { key: 'Ramify-Gate', value: 'ga-0002' }]);
      expect(runId ?? trailers[0]!.value).toBe(trailers[0]!.value); runId = trailers[0]!.value; once('trailer'); return null;
    },
    async commitAccepted(project, message) { expect(project).toBe(root); expect(message).toContain(`Ramify-Run: ${runId}`); expect(message).toContain('Ramify-Gate: ga-0002'); once('commit'); return null; },
    async previewCandidateTree(project) { expect(project).toBe(root); return { repositoryRoot: root, head, tree }; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); expect([head, 'HEAD']).toContain(base); return []; },
    async changedEntries(project, base = 'HEAD') { expect(project).toBe(root); expect([head, 'HEAD']).toContain(base); return []; },
    async worktreeLineChanges(project, base = 'HEAD') { expect(project).toBe(root); expect([head, 'HEAD']).toContain(base); throw new Error('Measurement fixture explicitly leaves line changes unavailable'); },
    async worktreePatch(project, base = 'HEAD') { expect(project).toBe(root); expect([head, 'HEAD']).toContain(base); throw new Error('Measurement fixture explicitly leaves patch unavailable'); },
  });
  const candidates = retain(scriptedCandidates(root, { [head]: { tree, files: {}, base: head, changes: [] } }));
  const auditAnswers = mappedAudit(({ check, context }) => {
    expect(context.projectRoot).toBe(root); expect(context.sourceCommit).toBe(head); expect(['readiness', 'final']).toContain(context.checkpoint);
    expect(['tests', 'type-check', 'ramify-check']).toContain(check.kind);
    return { stdout: 'Synthetic measurement lifecycle readiness evidence' };
  }, { scenarios: false });
  const audit = retain({ ...auditAnswers,
    async read(project: string, commit: string) { expect(project).toBe(root); expect(commit).toBe(head); return auditAnswers.read(project, commit); },
    async run(input: Parameters<typeof auditAnswers.run>[0]) { expect(input.projectRoot).toBe(root); expect(input.mode).toBe('full'); expect(input.nested).toBe(true); return auditAnswers.run(input); },
  });
  class MeasurementRamify extends RamifyCli {
    constructor() { super({ executable: '/measurement-fixture-starts-no-process' }); }
    override async run(argv: readonly string[], cwd: string): Promise<RamifyRun> {
      expect(cwd).toBe(root); calls.push(argv[0]!);
      if (argv[0] === 'measure') {
        expect(argv).toEqual(['measure', '--root', root, '--format', 'json']);
        return unavailable ? { code: 2, stdout: '', stderr: 'scripted producer cannot be run' }
          : { code: 0, stdout: `${JSON.stringify(measurementDocument(root))}\n`, stderr: '' };
      }
      expect(argv).toEqual(['--version']);
      return unavailable ? { code: 2, stdout: '', stderr: 'scripted Ramify readiness command did not run' }
        : { code: 0, stdout: 'ramify 0.0.0 (synthetic measurement answers)', stderr: '' };
    }
    override async materialize(project: string, from?: string) {
      expect(project).toBe(root); expect(from).toBeUndefined(); once('materialize');
      await publishMeasurementView(root);
      return { ok: true as const, output: 'Synthetic fixture artifact bytes, no installed producer claim' };
    }
    override async queryOwnership(): Promise<never> { throw new Error('No ownership answer declared for measurement fixture'); }
    override async stopDaemon(): Promise<void> { expect(unavailable).toBe(true); once('stop-daemon'); }
  }
  const ramify = retain(new MeasurementRamify());
  const inputs: RunInputs = retain({ ...shapeOnlyInputs,
    async capture(project, plan, packages) {
      expect(project).toBe(root); await publishMeasurementView(root); once('capture');
      return shapeOnlyInputs.capture(project, plan, packages);
    },
  });
  return { ramify, inputs, options: { git, candidates, configuredAudit: audit, scratchGit: 'provided' as const }, calls,
    assertAnswered() { expect(git.unexpected, `caught or unstated Git operations: ${JSON.stringify(git.unexpected)}`).toEqual([]); expect(failures, `caught external answer failures: ${JSON.stringify(failures)}`).toEqual([]); },
    assertComplete(required: readonly string[]) {
      this.assertAnswered(); for (const operation of required) {
        if (['branch', 'materialize', 'capture', 'trailer', 'commit', 'stop-daemon'].includes(operation)) expect(consumed.get(operation), `required ${operation} answer consumed exactly once`).toBe(1);
        else expect(calls, `required repeatable ${operation} consumed`).toContain(operation);
      }
      expect(auditAnswers.requests, 'required configured audit requests').toHaveLength(required.includes('branch') ? 2 : 0);
      auditAnswers.assertComplete();
    },
  };
}
