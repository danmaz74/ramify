import { strictEqual } from 'node:assert';
import { rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { completes } from '../descriptions.js';
import { createRetainedSourceAnalysis, retainedCompilerEvidence } from '../retained-source-analysis.js';
import type { FileDescription, MembershipReach, RetainedSourceAnalysis, SourceAccess } from '../interfaces/source.js';
import type { ObservationSink, ProjectInputView } from '../../../project/src/interfaces/project.js';
import { acquire, areasFor, drop, fixture, put, sourceLimits } from './fixtures.js';

/** Unlike deleting a file created after opening, deleting an original root
 * exercises the configured fileNames retained at compiler startup. */
export async function retainedMembershipWitness(): Promise<void> {
  const root = await fixture({ 'src/keep.ts': 'export const keep = 1;\n', 'src/remove.ts': 'export const remove = 2;\n' });
  let adapter: RetainedSourceAnalysis | undefined;
  const views: ProjectInputView[] = [];
  try {
    const initial = await acquire(root);
    views.push(initial);
    adapter = await createRetainedSourceAnalysis({ root, configuration: join(root, 'tsconfig.json'), inventory: initial.inventory,
      areas: areasFor(initial), limits: sourceLimits, sink: { file() {}, directory() {}, absent() {}, probe() {} } });
    await adapter.describe([]);
    const before = retainedCompilerEvidence(adapter);
    strictEqual(before.programHas('src/remove.ts'), true);
    await drop(root, 'src/remove.ts');
    const current = await acquire(root);
    views.push(current);
    await adapter.update({ changed: [], created: [], deleted: ['src/remove.ts'], inventory: current.inventory, invalidateAll: false });
    const after = retainedCompilerEvidence(adapter);
    strictEqual(after.syntheticConfiguration!.includes(join(root, 'src/remove.ts')), false, 'deleted original root leaves the synthetic configuration');
    strictEqual(after.programHas('src/remove.ts'), false);
    strictEqual(after.programHas('src/keep.ts'), true);
    strictEqual(after.serverPid, before.serverPid, 'membership update keeps the warm compiler server');
    strictEqual(after.liveSnapshots, 1);
  } finally {
    await adapter?.dispose();
    for (const view of views) await view.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

/** The owned files and dependency package every membership case starts from. */
export const membershipProject: Readonly<Record<string, string>> = {
  'src/api.ts': 'export const value = 1;\n',
  'src/consumer.ts': 'import { value } from "./api.js";\nimport { later } from "./later.js";\nexport const sum = value + later;\n',
  'src/hub.ts': 'export { later } from "./later.js";\nexport { remove } from "./remove.js";\n',
  'src/user.ts': 'import { remove } from "./remove.js";\nexport const used = remove;\n',
  'src/remove.ts': 'import { value } from "./api.js";\nimport { ghost } from "./ghost.js";\nexport const remove = value + ghost;\n',
  'src/lonely.ts': 'import { pkg } from "pkg";\nexport const lonely = pkg;\n',
  'src/bare.ts': 'import { soon } from "./soon";\nexport const early = soon;\n',
  'src/barehub.ts': 'export * from "./soon";\n',
  'node_modules/pkg/package.json': '{"name":"pkg","types":"index.d.ts"}\n',
  'node_modules/pkg/index.d.ts': 'export * from "./other.js";\n',
  'node_modules/pkg/other.d.ts': 'export declare const pkg: number;\n',
};

export interface MembershipCase {
  readonly change: 'created' | 'deleted';
  readonly file: string;
  readonly text?: string;
}
export const membershipCases = {
  'created unreferenced': { change: 'created', file: 'src/fresh.ts', text: 'import { value } from "./api.js";\nexport const fresh = value;\n' },
  'created satisfying a probed specifier': { change: 'created', file: 'src/later.ts', text: 'export const later = 5;\n' },
  'created satisfying an extensionless specifier': { change: 'created', file: 'src/soon.ts', text: 'export const soon = 6;\n' },
  'deleted referenced': { change: 'deleted', file: 'src/remove.ts' },
  'deleted unreferenced': { change: 'deleted', file: 'src/lonely.ts' },
} as const satisfies Readonly<Record<string, MembershipCase>>;

interface Reported { readonly shape: 'file' | 'directory' | 'absent' | 'probe'; readonly path: string }
function recorder(): { readonly sink: ObservationSink; readonly events: Reported[] } {
  const events: Reported[] = [];
  return { events, sink: {
    file: path => { events.push({ shape: 'file', path }); },
    directory: path => { events.push({ shape: 'directory', path }); },
    absent: path => { events.push({ shape: 'absent', path }); },
    probe: path => { events.push({ shape: 'probe', path }); },
  } };
}

/** What one adapter says about its described state, as comparable JSON. */
interface Described {
  readonly descriptions: string;
  readonly catalog: string;
  readonly accesses: string;
  readonly program: Readonly<Record<string, boolean>>;
  readonly records: readonly FileDescription[];
  readonly candidates: readonly { readonly file: string; readonly paths: readonly string[] }[];
  readonly accessList: readonly SourceAccess[];
}
async function described(adapter: RetainedSourceAnalysis, descriptions: readonly FileDescription[], owned: readonly string[],
  probed: readonly string[]): Promise<Described> {
  const catalog = adapter.catalog();
  const interpreted = await adapter.interpreter().interpret(owned);
  const evidence = retainedCompilerEvidence(adapter);
  const records = [...descriptions].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return { descriptions: JSON.stringify(records), catalog: JSON.stringify(catalog),
    accesses: JSON.stringify({ accesses: interpreted.accesses, coverage: interpreted.coverage }),
    program: Object.fromEntries([...new Set(probed)].sort().map(path => [path, evidence.programHas(path)])),
    records, candidates: interpreted.candidates, accessList: interpreted.accesses };
}

/** Every path one file contributes: itself, its candidates and its description dependencies, relative to the root. */
function contributions(root: string, description: FileDescription | undefined,
  candidates: readonly { readonly file: string; readonly paths: readonly string[] }[], file: string): string[] {
  const local = (path: string): string => path.startsWith('external:') ? relative(root, path.slice('external:'.length)) : path;
  const dependencies = description?.dependencies;
  return [file, ...(candidates.find(entry => entry.file === file)?.paths ?? []),
    ...[...dependencies?.files ?? [], ...dependencies?.resources ?? [], ...dependencies?.shims ?? [], ...dependencies?.absent ?? []].map(local)];
}

export interface MembershipEvidence {
  /** The incremental adapter after one update with `invalidateAll: false`, and a fresh adapter over the same disk. */
  readonly incremental: Described;
  readonly fresh: Described;
  readonly sameServer: boolean;
  readonly liveSnapshots: number;
  /** Descriptions the update's `describe([file])` recomputed. */
  readonly recomputed: readonly string[];
  /** Files the compiler read, rather than probed, during the update. */
  readonly reread: readonly string[];
  /** The changed file, the files whose retained records name it, and the importers of recomputed descriptions. */
  readonly affected: readonly string[];
  /** Paths the affected files contribute after the change that a fresh adapter observes. */
  readonly contributed: readonly string[];
  /** Of those, the paths the sink did not receive during the update. */
  readonly unreported: readonly string[];
  /** Contributed paths that neither adapter ever reports: specifier spellings, not observations. */
  readonly unobserved: readonly string[];
  /** How the sink received the changed file during the update. */
  readonly changedFile: readonly Reported['shape'][];
  /** Paths inside the root a fresh adapter observes that the update did not report, with the fresh report shapes. */
  readonly freshNotReported: Readonly<Record<string, readonly Reported['shape'][]>>;
  /** Paths inside the root the incremental adapter reported before the change, that a fresh adapter
   * does not observe, and that no pre-change contribution of an affected file names, with their shapes. */
  readonly obsoleteUnattributed: Readonly<Record<string, readonly Reported['shape'][]>>;
  /** What the update reports it changed beyond the named file. */
  readonly reach: MembershipReach | undefined;
}

/**
 * One created or deleted owned file delivered by one incremental update,
 * compared with a fresh adapter over the same disk, with the sink's reports.
 */
export async function membershipWitness(change: MembershipCase): Promise<MembershipEvidence> {
  const root = await fixture(membershipProject);
  const views: ProjectInputView[] = [];
  const adapters: RetainedSourceAnalysis[] = [];
  const open = async (sink: ObservationSink): Promise<{ adapter: RetainedSourceAnalysis; owned: string[] }> => {
    const view = await acquire(root);
    views.push(view);
    const adapter = await createRetainedSourceAnalysis({ root, configuration: join(root, 'tsconfig.json'), inventory: view.inventory,
      areas: areasFor(view), limits: sourceLimits, sink });
    adapters.push(adapter);
    return { adapter, owned: view.inventory.files.map(file => file.path) };
  };
  const local = (events: readonly Reported[]): Set<string> => new Set(events.map(event => relative(root, event.path)));
  const shapes = (events: readonly Reported[], paths: Iterable<string>): Record<string, Reported['shape'][]> => {
    const selected = new Set(paths);
    const found = new Map<string, Set<Reported['shape']>>();
    for (const event of events) {
      const path = relative(root, event.path);
      if (selected.has(path)) found.set(path, (found.get(path) ?? new Set()).add(event.shape));
    }
    return Object.fromEntries([...found].sort(([a], [b]) => a < b ? -1 : 1).map(([path, kinds]) => [path, [...kinds].sort()]));
  };
  try {
    const recorded = recorder();
    const { adapter, owned: before } = await open(recorded.sink);
    const cold = await adapter.describe(before);
    const prior = await described(adapter, cold.descriptions, before, []);
    const priorEvents = recorded.events.splice(0);
    const reportedBefore = local(priorEvents);
    const server = retainedCompilerEvidence(adapter).serverPid;

    if (change.change === 'created') await put(root, change.file, change.text ?? '');
    else await drop(root, change.file);
    const current = await acquire(root);
    views.push(current);
    const after = current.inventory.files.map(file => file.path);
    recorded.events.length = 0;
    const { reach } = await adapter.update({ changed: [], created: change.change === 'created' ? [change.file] : [],
      deleted: change.change === 'deleted' ? [change.file] : [], inventory: current.inventory, invalidateAll: false });
    const updateEvents = recorded.events.splice(0);
    const reported = local(updateEvents);
    const evidence = retainedCompilerEvidence(adapter);
    const update = await adapter.describe([change.file]);
    const retained = new Map(prior.records.map(record => [record.file, record]));
    for (const record of update.descriptions) retained.set(record.file, record);
    const probed = [...new Set([...before, ...after, change.file, 'node_modules/pkg/index.d.ts', 'node_modules/pkg/other.d.ts'])];
    const incremental = await described(adapter, [...retained].filter(([file]) => after.includes(file)).map(([, record]) => record), after, probed);
    const reportedEver = new Set([...reportedBefore, ...reported, ...local(recorded.events)]);

    const freshRecorded = recorder();
    const { adapter: other } = await open(freshRecorded.sink);
    const fresh = await described(other, (await other.describe(after)).descriptions, after, probed);
    const observed = local(freshRecorded.events);

    const names = (path: string): boolean => change.change === 'created' ? completes(path, change.file) : path === change.file;
    const affected = new Set<string>([change.file]);
    for (const file of before) {
      if (contributions(root, prior.records.find(record => record.file === file), prior.candidates, file)
        .slice(1).some(names)) affected.add(file);
    }
    for (const target of update.delta.recomputed) {
      for (const access of prior.accessList) {
        const targets = [access.target.kind === 'application' ? access.target.origin.file : null,
          ...access.selections.flatMap(selection => selection.forwarding.map(origin => origin.file))];
        if (targets.includes(target)) affected.add(access.location.file);
      }
    }
    const contributedAll = new Set([...affected].filter(file => after.includes(file)).flatMap(file =>
      contributions(root, incremental.records.find(record => record.file === file), incremental.candidates, file)));
    const priorIndex = new Set([...affected].filter(file => before.includes(file)).flatMap(file =>
      contributions(root, prior.records.find(record => record.file === file), prior.candidates, file)));
    const inside = (path: string): boolean => !path.startsWith('..');
    const sorted = (paths: Iterable<string>): string[] => [...paths].sort();
    return {
      incremental, fresh,
      sameServer: evidence.serverPid === server && server !== undefined,
      liveSnapshots: evidence.liveSnapshots,
      recomputed: update.delta.recomputed,
      reread: sorted(new Set(updateEvents.filter(event => event.shape === 'file').map(event => relative(root, event.path)))),
      affected: sorted(affected),
      contributed: sorted([...contributedAll].filter(path => observed.has(path))),
      unreported: sorted([...contributedAll].filter(path => observed.has(path) && !reported.has(path))),
      unobserved: sorted([...contributedAll].filter(path => !observed.has(path) && !reportedEver.has(path))),
      changedFile: [...new Set(updateEvents.filter(event => relative(root, event.path) === change.file).map(event => event.shape))].sort(),
      freshNotReported: shapes(freshRecorded.events, [...observed].filter(path => inside(path) && !reported.has(path))),
      obsoleteUnattributed: shapes(priorEvents, [...reportedBefore].filter(path => inside(path) && !observed.has(path) && !priorIndex.has(path))),
      reach,
    };
  } finally {
    for (const adapter of adapters) await adapter.dispose();
    for (const view of views) await view.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
