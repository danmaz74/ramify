import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AffectedDocument } from 'ramify.ts/cli';
import { treeInputs } from './iterations.js';
import { RamifyCli, type MaterializeResult, type RamifyRun } from '../../../subs/evidence/src/ramify-cli.js';

/*
 * The toolkit's command line, without the command line.
 *
 * `stubRamify` installs a real executable that answers its version and
 * nothing else, and a run then spawns it: once for readiness, once for each
 * guarded write's hook check, and four times for each materialization, whose
 * repeats wait 300, 900 and 2,000 ms before the adapter reports the view
 * unavailable. A lifecycle scenario pays all of that to reach a result it
 * already knows.
 *
 * This fake answers the same results at once. It is not a Ramify: it
 * materializes nothing and checks nothing, and it says so in the message the
 * run records, so a run's evidence stays unavailable rather than becoming a
 * synthetic pass. Tests whose subject is the adapter itself — its retry
 * policy, its exit-code reading, its daemon — keep the real command line.
 */

/** One call a run made at this boundary. */
export interface RamifyCall {
  readonly operation: 'run' | 'materialize' | 'stop-daemon';
  readonly argv: readonly string[];
  readonly answer: string;
}

/** The version the fake answers, in the form `ramify --version` prints. */
const version = 'ramify 0.0.0 (the boundary spike\'s fake command line)';

/** What the real stub executable prints for anything but its version. */
const unavailable = JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable', reason: 'stub', exitCode: 2 });

/**
 * A `RamifyCli` that starts no process.
 *
 * `run` answers what the run tests' stub executable answers, so the real
 * adapter's exit-code reading still decides what `checkChanged` and
 * `checkComplete` mean. `materialize` is answered directly, because the real
 * adapter would repeat a result this fake already knows and wait between the
 * repeats.
 */
export class FakeRamifyCli extends RamifyCli {
  readonly calls: RamifyCall[] = [];

  constructor() {
    super({ executable: '/nonexistent/the-boundary-spike-starts-no-ramify', timeoutMs: 0 });
  }

  override async run(args: readonly string[], _cwd: string, _signal?: AbortSignal): Promise<RamifyRun> {
    const answer: RamifyRun = args[0] === '--version'
      ? { code: 0, stdout: `${version}\n`, stderr: '' }
      : { code: 2, stdout: `${unavailable}\n`, stderr: '' };
    this.calls.push({ operation: 'run', argv: [...args], answer: `exit ${answer.code}` });
    return answer;
  }

  /** Explicitly scripted lifecycle placement; real installed F1 tests establish provider conformance. */
  override async queryOwnership(projectRoot: string, paths: readonly string[] = ['.']): Promise<AffectedDocument> {
    const index = await treeInputs().refresh(projectRoot);
    if (index === null) throw new Error('Scripted lifecycle fixture has no topology');
    const modules = [...index.modules.values()].map(module => ({ id: module.module, parent: module.parent, directory: module.dir || '.' }));
    const exclusions: Array<{ kind: 'owned-unwired' | 'owned-nested-project' | 'external' | 'scratch'; directory: string; owner: string | null }> = [];
    for (const module of modules) {
      const text = await readFile(join(projectRoot, module.directory, 'module.ramify'), 'utf8');
      for (const match of text.matchAll(/(owned-unwired|owned-nested-project|external)\s+"([^"]+)"/gu)) {
        exclusions.push({ kind: match[1] as 'external', directory: join(module.directory === '.' ? '' : module.directory, match[2]!).replaceAll('\\', '/'), owner: match[1] === 'external' ? null : module.id });
      }
      exclusions.push({ kind: 'scratch', directory: join(module.directory === '.' ? '' : module.directory, 'src/tmp'), owner: module.id });
    }
    const seeds = paths.map(path => {
      const exclusion = exclusions.filter(entry => path === entry.directory || path.startsWith(`${entry.directory}/`)).sort((a, b) => b.directory.length - a.directory.length)[0] ?? null;
      const owner = modules.filter(module => module.directory === '.' || path === module.directory || path.startsWith(`${module.directory}/`)).sort((a, b) => b.directory.length - a.directory.length)[0];
      if (path.startsWith('../')) return { path, status: 'outside-project', module: null, basis: 'none', exclusion: null, kind: null, selects: [] };
      if (exclusion?.owner === null) return { path, status: 'excluded', module: null, basis: 'excluded', exclusion, kind: null, selects: [] };
      return { path, status: 'owned', module: exclusion?.owner ?? owner!.id, basis: 'containment', exclusion, kind: exclusion === null ? 'inert' : 'ignored', selects: [] };
    });
    return { schemaVersion: 'ramify.affected-cli/4', root: projectRoot, mode: 'batch', ramifyVersion: 'scripted-lifecycle-only',
      revision: { sequence: null, inputId: 'scripted-lifecycle' }, selection: { schemaVersion: 'ramify.affected/4', inputId: 'scripted-lifecycle', paths: seeds,
        scope: { root: projectRoot, selection: 'given', configuration: 'tsconfig.json', invokedFrom: projectRoot, walkedAreas: [], ownership: { modules, exclusions } },
        changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } } as AffectedDocument;
  }

  override async materialize(projectRoot: string, apiFrom?: string, _signal?: AbortSignal): Promise<MaterializeResult> {
    const argv = ['materialize', '--view', 'architect', ...(apiFrom === undefined ? [] : ['--view', 'api', '--from', apiFrom === '' ? '.' : apiFrom]), '--root', projectRoot];
    const result: MaterializeResult = {
      ok: false,
      message: `\`ramify ${argv.join(' ')}\` was not run: this test's fake command line materializes no view (status unavailable, reason "stub")`,
    };
    this.calls.push({ operation: 'materialize', argv, answer: 'unavailable' });
    return result;
  }

  override async stopDaemon(): Promise<void> {
    this.calls.push({ operation: 'stop-daemon', argv: ['daemon', 'stop'], answer: 'no daemon' });
  }

  /** How many times one operation was asked for. */
  count(operation: RamifyCall['operation']): number {
    return this.calls.filter(call => call.operation === operation).length;
  }
}
