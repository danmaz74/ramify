import { rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../index.js';
import type { SessionInputs, SessionRevision } from '../index.js';
import { membershipRefusal, reachRefusal } from '../session-revision.js';
import type { SessionState } from '../session-revision.js';
import { audited, equalToBatch, fixture, fixtureFiles, instrumentCompiler, instrumentObserver, opened, paths, put, revised,
  timeout } from './session-test-fixture.js';

/**
 * A differential comparison of the membership path with batch over generated
 * create, delete, restore and edit sequences. The hand-written cases fix the
 * shapes they name; these sequences ask whether the retirement rule and its
 * fallbacks keep an arbitrary sequence byte-identical to a fresh batch run.
 * Part of the steps are labelled `unknown`, the label a watched rename carries,
 * so the sequences also cover an event the caller makes no claim about.
 *
 * Every choice comes from a seeded generator, so a reported seed reproduces its
 * whole sequence. `RAMIFY_DIFF_SEEDS`, `RAMIFY_DIFF_SEED_START` and
 * `RAMIFY_DIFF_STEPS` widen a run; `RAMIFY_DIFF_REPORT=1` prints the path each
 * step took.
 */
const seedCount = Number(process.env.RAMIFY_DIFF_SEEDS ?? 1);
const firstSeed = Number(process.env.RAMIFY_DIFF_SEED_START ?? 1);
const stepCount = Number(process.env.RAMIFY_DIFF_STEPS ?? 6);
const reporting = process.env.RAMIFY_DIFF_REPORT === '1';
/** One sequence of the default size stays well inside the fixture timeout; a wide run scales with what it asks for. */
const runTimeout = Math.max(timeout, seedCount * (20_000 + stepCount * 15_000));

/** mulberry32: a small deterministic generator, so a seed names one sequence. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}
const pick = <T>(rng: () => number, values: readonly T[]): T => values[Math.floor(rng() * values.length)]!;
const chance = (rng: () => number, probability: number): boolean => rng() < probability;

type StepKind = 'create' | 'delete' | 'restore' | 'edit';
interface Step { readonly kind: StepKind; readonly path: string; readonly text?: string; readonly note: string }
/** The generator's view of the tree: the owned sources on disk, the deleted ones and the paths a live import names in vain. */
interface Tree { readonly live: Map<string, string>; readonly gone: Map<string, string>; readonly wanted: string[]; counter: number }

const sourceFile = (path: string): boolean => /\.tsx?$/.test(path) && !path.endsWith('.d.ts');
const directories = (tree: Tree): string[] => [...new Set([...tree.live.keys()].filter(sourceFile).map(dirname))].sort();

/** A specifier for `target` from `fromDirectory`: the `.js` spelling, the extensionless one, or a directory naming its index. */
function spell(rng: () => number, fromDirectory: string, target: string): string {
  let path = relative(fromDirectory, target).split('\\').join('/');
  if (!path.startsWith('.')) path = `./${path}`;
  const base = path.replace(/\.tsx?$/, '');
  const spellings = [`${base}.js`, base];
  if (base.endsWith('/index')) {
    const directory = base.slice(0, -'/index'.length);
    if (directory && directory !== '.') spellings.push(directory);
  }
  return pick(rng, spellings);
}

/** One import of `specifier`, written so that it needs no knowledge of the target's exports. */
function importLine(rng: () => number, specifier: string, id: number): string {
  const forms = [
    `import '${specifier}';`,
    `import * as bound${id} from '${specifier}';\nvoid bound${id};`,
    `export * from '${specifier}';`,
    `import type * as type${id} from '${specifier}';\nexport type Seen${id} = typeof type${id};`,
  ];
  return pick(rng, forms);
}

/** The contents of a generated file: up to three imports of live or absent files, then one export of its own. */
function contents(rng: () => number, tree: Tree, path: string): string {
  const id = ++tree.counter;
  const targets = [...tree.live.keys()].filter(candidate => sourceFile(candidate) && candidate !== path);
  const lines: string[] = [];
  for (let index = 0; index <= Math.floor(rng() * 3); index++) {
    if (!targets.length || chance(rng, 0.25)) {
      // An import of a file that does not exist yet, so a later step can create it and satisfy the probe.
      const absent = `${dirname(path)}/absent${++tree.counter}.ts`;
      const stem = `./${absent.slice(dirname(path).length + 1, -'.ts'.length)}`;
      lines.push(importLine(rng, chance(rng, 0.5) ? `${stem}.js` : stem, ++tree.counter));
      tree.wanted.push(absent);
      continue;
    }
    lines.push(importLine(rng, spell(rng, dirname(path), pick(rng, targets)), ++tree.counter));
  }
  lines.push(`export const generated${id} = ${id};`);
  return `${lines.join('\n')}\n`;
}

/** The next step of a sequence, chosen from the generator and the tree it has produced so far. */
function nextStep(rng: () => number, tree: Tree): Step {
  const roll = rng();
  const editable = [...tree.live.keys()].filter(sourceFile).sort();
  if (roll < 0.3 && tree.live.size > 1) {
    const live = [...tree.live.keys()].sort();
    const last = (path: string): boolean => !live.some(other => other !== path && dirname(other) === dirname(path));
    // Most directories of these fixtures hold one source, so a uniform choice would rarely leave one behind.
    const shared = live.filter(path => !last(path));
    const path = pick(rng, shared.length && chance(rng, 0.6) ? shared : live);
    return { kind: 'delete', path, note: last(path) ? 'last source in its directory' : 'one of several in its directory' };
  }
  if (roll < 0.48 && tree.gone.size) {
    const path = pick(rng, [...tree.gone.keys()].sort());
    const same = !sourceFile(path) || chance(rng, 0.5);
    return { kind: 'restore', path, text: same ? tree.gone.get(path)! : contents(rng, tree, path),
      note: same ? 'the deleted contents' : 'different contents' };
  }
  if (roll >= 0.48 && roll < 0.6 && editable.length) {
    const path = pick(rng, editable);
    return { kind: 'edit', path, text: `${tree.live.get(path)!}export const edit${++tree.counter} = ${tree.counter};\n`,
      note: 'control: a content edit of a live file' };
  }
  if (tree.wanted.length && chance(rng, 0.4)) {
    const path = tree.wanted.splice(Math.floor(rng() * tree.wanted.length), 1)[0]!;
    return { kind: 'create', path, text: contents(rng, tree, path), note: 'satisfies an import of an absent file' };
  }
  const directory = chance(rng, 0.15) ? `${pick(rng, directories(tree))}/nested${++tree.counter}` : pick(rng, directories(tree));
  const extension = chance(rng, 0.15) ? 'tsx' : 'ts';
  const name = chance(rng, 0.1) ? 'index' : `created${++tree.counter}`;
  const path = `${directory}/${name}.${extension}`;
  return { kind: 'create', path, text: contents(rng, tree, path), note: `a new ${extension} file` };
}

/** The published inputs against the batch ones, row by row, for a divergence message. */
function inputRows(session: SessionRevision['inputs'], batch: SessionRevision['inputs']): string[] {
  const rows = (inputs: SessionRevision['inputs']): Map<string, string> =>
    new Map(inputs.map(input => [input.path, JSON.stringify(input)]));
  const published = rows(session), fresh = rows(batch);
  const differing: string[] = [];
  for (const [path, value] of published) {
    const other = fresh.get(path);
    if (other === undefined) differing.push(`  session only: ${value}`);
    else if (other !== value) differing.push(`  session: ${value}\n  batch:   ${other}`);
  }
  for (const [path, value] of fresh) if (!published.has(path)) differing.push(`  batch only:   ${value}`);
  return differing;
}

/** The path a revision took, and for a broad one the refusal that sent it there. */
function classify(revision: SessionRevision, before: SessionState['facts'], state: SessionState,
  retirements: readonly string[], reach: unknown, created: readonly string[], deleted: readonly string[]): string {
  if (revision.checked.path !== 'broad') return revision.checked.path;
  if (revision.outcome.execution === 'invalid') return 'invalid-acquisition';
  if (retirements.join(',') === 'probes,all') {
    return `reach:${reachRefusal(reach as Parameters<typeof reachRefusal>[0], created.length > 0) ?? 'none'}`;
  }
  const inventory = state.facts?.inventory;
  if (!before || !inventory) return 'broad:unknown';
  const refusal = membershipRefusal(before, inventory, { kind: 'local', inventory, descriptions: [], readmes: [],
    created, deleted, changed: [] }, state.observer?.inputs ?? []);
  return `refusal:${refusal ?? 'other-broad'}`;
}

interface Outcome { readonly paths: Map<string, number>; readonly steps: number }

/** One seeded sequence: every step is delivered as a local update and compared with a fresh batch run over the same tree. */
async function sequence(root: string, inputs: SessionInputs, files: Record<string, string>, seed: number,
  label: string, tally: Map<string, number>): Promise<void> {
  const rng = generator(seed);
  const tree: Tree = { live: new Map(Object.entries(files).filter(([path]) => /^(src|subs)\//.test(path) && /\.(tsx?|css)$/.test(path))),
    gone: new Map(), wanted: [], counter: 0 };
  const { handle, state } = await opened(inputs);
  const history: string[] = [];
  try {
    let compiler = instrumentCompiler(state), watched = instrumentObserver(state), observed = state.observer;
    for (let index = 1; index <= stepCount; index++) {
      if (state.adapter !== compiler.adapter) compiler = instrumentCompiler(state);
      if (state.observer !== observed) { watched = instrumentObserver(state); observed = state.observer; }
      compiler.update.mockClear();
      watched.retire.mockClear();
      const step = nextStep(rng, tree);
      const created = step.kind === 'delete' ? [] : [step.path], deleted = step.kind === 'delete' ? [step.path] : [];
      const before = state.facts;
      if (step.kind === 'delete') {
        tree.gone.set(step.path, tree.live.get(step.path)!);
        tree.live.delete(step.path);
        await rm(join(root, step.path));
      } else {
        tree.gone.delete(step.path);
        tree.live.set(step.path, step.text!);
        await put(root, step.path, step.text!);
      }
      // A watcher reports every created, deleted and atomically replaced file as a
      // rename, which the context manager labels `unknown`, so part of the sequence
      // makes no claim about its event and leaves it to the observer.
      const told = step.kind === 'edit' ? 'changed' : step.kind === 'delete' ? 'deleted' : 'created';
      const kind = chance(rng, 0.4) ? 'unknown' : told;
      const revision = await revised(handle, [step.path], kind);
      const retirements = watched.retire.mock.calls.map(call => call[0].kind);
      const first = compiler.update.mock.results[0];
      // The compiler's reach names the refusal only where the session retired the probes and then everything.
      const reach = retirements.join(',') === 'probes,all' && first?.type === 'return'
        ? (await (first.value as Promise<{ reach?: unknown }>)).reach : undefined;
      const taken = classify(revision, before, state, retirements, reach,
        step.kind === 'edit' ? [] : created, step.kind === 'edit' ? [] : deleted);
      tally.set(taken, (tally.get(taken) ?? 0) + 1);
      history.push(`  ${index}. ${step.kind} ${step.path} [${kind}] (${step.note}) -> ${taken}`);
      try {
        const report = await equalToBatch(handle, inputs);
        // An invalid projection publishes no input list of its own: batch leaves
        // `inputId` null and the snapshot inputs empty, while the revision still
        // carries the capture the session observed. The reports still equal.
        if (report.inputId === null) expect(revision.inputs.length, 'an invalid revision keeps its own inputs').toBeGreaterThan(0);
        else {
          expect(revision.inputs).toEqual(report.snapshot!.inputs);
          expect(revision.inputId).toBe(report.inputId);
        }
        await audited(handle);
      } catch (failure) {
        const { session: _session, ...request } = inputs;
        const fresh = await analyzeProject(request);
        const rows = fresh.status === 'reported' && fresh.report.snapshot
          ? inputRows(revision.inputs, fresh.report.snapshot.inputs) : ['  (a fresh batch run did not report)'];
        const listed = rows.length ? rows.slice(0, 20) : ['  none; the reports differ elsewhere'];
        if (rows.length > listed.length) listed.push(`  ... ${rows.length - listed.length} further rows`);
        const context = [`Session and batch diverged on the ${label} fixture at step ${index} of ${stepCount}.`,
          `Seed ${seed}. Reproduce with:`,
          `  RAMIFY_DIFF_SEEDS=1 RAMIFY_DIFF_SEED_START=${seed} RAMIFY_DIFF_STEPS=${index} npx vitest run subs/analysis/src/tests/membership-differential.test.ts`,
          'Steps:', ...history, `Differing input rows (${rows.length}):`, ...listed].join('\n');
        if (failure instanceof Error) failure.message = `${context}\n\n${failure.message}`;
        throw failure;
      }
    }
  } finally {
    if (reporting) console.info(`[differential] ${label} seed ${seed}\n${history.join('\n')}`);
    await handle.dispose();
  }
}

/** Every seed of one fixture, with the path each step took counted across the run. */
async function sequences(files: Record<string, string>, label: string): Promise<Outcome> {
  const tally = new Map<string, number>();
  for (let index = 0; index < seedCount; index++) {
    const seed = firstSeed + index;
    await fixture(async (root, inputs) => { await sequence(root, inputs, { ...fixtureFiles, ...files }, seed, label, tally); }, files);
  }
  if (reporting) {
    console.info(`[differential] ${label}: ${seedCount} seeds of ${stepCount} steps; `
      + [...tally].sort(([a], [b]) => a.localeCompare(b)).map(([path, count]) => `${path}=${count}`).join(', '));
  }
  return { paths: tally, steps: seedCount * stepCount };
}

const branch = 'subs/branch/src';
/** The session fixture with the absent and extensionless probes the membership cases use. */
const probed: Record<string, string> = {
  [`${branch}/consumer.ts`]: "import { later } from './later.js';\nexport const sum = later;\n",
  [`${branch}/bare.ts`]: "export * from './soon';\n",
  [`${branch}/lonely.ts`]: 'export const lonely = 1;\n',
};
/** A richer shape: an owned test area, a re-export, a directory index, a resolved package import, a `.tsx` file and a shim over a resource. */
const richer: Record<string, string> = {
  ...probed,
  'module.ramify': `${fixtureFiles['module.ramify']}expose-src default from "style.css" to descendants\n`,
  [paths.local]: `${fixtureFiles[paths.local]}import styles from '../../../src/style.css';\nvoid styles;\n`,
  'src/styles.d.ts': 'declare module "*.css" { const styles: Record<string, string>; export default styles; }\n',
  'src/style.css': '.root { color: red; }\n',
  [`${branch}/tests/branch.test.ts`]: "import { value } from '../provider.js';\nexport const spec = value;\n",
  [`${branch}/dir/index.ts`]: 'export const inDirectory = 1;\n',
  [`${branch}/index-user.ts`]: "export * from './dir';\n",
  [`${branch}/view.tsx`]: 'export const view = 1;\n',
  [`${branch}/package-user.ts`]: "import type { DependencyShape } from 'fixture-dependency';\nexport type Used = DependencyShape;\n",
  'node_modules/fixture-dependency/package.json': '{"name":"fixture-dependency","version":"1.0.0","types":"index.d.ts"}',
  'node_modules/fixture-dependency/index.d.ts': 'export interface DependencyShape { readonly n: number }\n',
};

describe('membership differential', () => {
  /** A run whose every step took the broad path would prove nothing about the membership path. */
  const expectMembership = (outcome: Outcome): void => {
    expect(outcome.paths.get('membership') ?? 0,
      `membership steps out of ${outcome.steps}: ${[...outcome.paths].map(([path, count]) => `${path}=${count}`).join(', ')}`).toBeGreaterThan(0);
  };

  it('membership-identity-equals-batch: seeded create, delete, restore and edit sequences on the session fixture publish the batch inputs and report',
    async () => { expectMembership(await sequences(probed, 'session')); }, runTimeout);

  it('membership-identity-equals-batch: seeded sequences on a fixture with an owned test area, a directory index, a package import, a shim and a .tsx file equal batch',
    async () => { expectMembership(await sequences(richer, 'richer')); }, runTimeout);
});
