import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScriptStep, Script } from '../../../subs/agent/src/scripted.js';
import type { SessionSpec } from '../../../subs/agent/src/interfaces/port.js';
import type { RamifyCli } from '../../../subs/evidence/src/ramify-cli.js';
import type { ArchitectIndex, ModuleEntry } from '../../../subs/evidence/src/views.js';
import { architectRunInputs, type RunInputs } from '../../run/inputs.js';
import type { AssignmentBody } from '../../work/assignment.js';
import type { EngineerSubmission } from '../../work/engineer.js';
import type { LocalArchitectSubmission } from '../../work/submission.js';

/*
 * What a test needs to drive an iteration: the submissions a local architect
 * and an engineer make, a script that answers each role in turn, a runner
 * that really runs the files the selection resolved to, and the run inputs
 * that refresh a real architect view.
 *
 * Nothing here simulates a transition. Every submission goes through the
 * same judge, the same schema and the same rules an agent's would, and every
 * command is spawned and its exit code read.
 */

/** The run's inputs on real evidence: the architect view is materialized and refreshed for real. */
export function viewedInputs(ramify: RamifyCli, warn?: (message: string) => void): RunInputs {
  return architectRunInputs({ ramify, ...(warn === undefined ? {} : { warn }) });
}

/** One `assign` submission, with the smallest honest assignment. */
export function assign(
  module: string,
  extra: Partial<AssignmentBody> = {},
  outline?: Extract<LocalArchitectSubmission, { kind: 'request-completion' }>['outline'],
): Extract<LocalArchitectSubmission, { kind: 'assign' }> {
  const scope = extra.scope ?? { base: { module, includedChildren: [] }, extra: [], read: [], rationale: 'The work is in this module.' };
  return {
    kind: 'assign',
    ...(outline === undefined ? {} : { outline }),
    localDecisions: [],
    assignment: {
      stage: 0,
      kind: 'ordinary',
      goal: `Carry out the work in ${module}.`,
      approach: 'Change the source, then the tests that state it.',
      requirementRefs: [{ anchor: 'Request' }],
      externalCapabilities: [],
      completionEvidence: 'The tests this scope owns pass.',
      ...extra,
      scope,
    },
  };
}

/** An outline a test can attach to an assignment or a completion request. */
export function outline(extra: Partial<Extract<LocalArchitectSubmission, { kind: 'request-completion' }>['outline']> = {}) {
  return {
    changes: 'The note has to be added, and its limit stated in a test.',
    decomposition: { kind: 'single-iteration' as const, rationale: 'One piece of work carries the goal.' },
    reuse: [],
    breakingChanges: [],
    stages: [],
    revisionReason: '',
    ...extra,
  };
}

export function completionProposed(summary = 'The note limit is stated where the test asks for it.', extra: Partial<Extract<EngineerSubmission, { kind: 'completion-proposed' }>> = {}): EngineerSubmission {
  return { kind: 'completion-proposed', summary, findings: [], ...extra };
}

export function partialReport(done: readonly string[], unfinished: readonly string[]): EngineerSubmission {
  return { kind: 'partial', done: [...done], unfinished: [...unfinished], findings: [] };
}

export function unsuitableScope(detail = 'What the goal needs is owned by another module.'): EngineerSubmission {
  return { kind: 'unsuitable', reason: 'scope', detail };
}

/** One turn of one role, as the fake plays it. */
export type Turn = readonly ScriptStep[];

/**
 * A script that answers each role in turn: the nth invocation of a role runs
 * that role's nth turn, and the last turn repeats once they are spent.
 */
export function byRole(plan: Readonly<Record<string, readonly Turn[]>>): Script {
  const counts = new Map<string, number>();
  return (spec: SessionSpec): readonly ScriptStep[] => {
    const seen = counts.get(spec.role) ?? 0;
    counts.set(spec.role, seen + 1);
    const turns = plan[spec.role] ?? [];
    if (turns.length === 0) return [{ kind: 'end', message: `no turn scripted for ${spec.role}` }];
    return turns[Math.min(seen, turns.length - 1)]!;
  };
}

/**
 * A script that answers each turn by the work item the prompt names, and
 * then in order: the nth invocation of a role for one work item runs that
 * key's nth turn, and the last repeats once they are spent.
 *
 * A key is `role:wi-004`, taken from the identifier the first line of the
 * message carries, or the role alone for a turn that names no work item. It
 * is how a test of several work items says what each one does without
 * predicting the order the scheduler takes them in.
 */
export function byWork(plan: Readonly<Record<string, readonly Turn[]>>): Script {
  const counts = new Map<string, number>();
  return (spec: SessionSpec): readonly ScriptStep[] => {
    const named = /\bwi-\d+/.exec(spec.prompt.split('\n')[0] ?? '')?.[0];
    const key = named === undefined ? spec.role : `${spec.role}:${named}`;
    const turns = plan[key] ?? plan[spec.role] ?? [];
    if (turns.length === 0) return [{ kind: 'end', message: `no turn scripted for ${key}` }];
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    return turns[Math.min(seen, turns.length - 1)]!;
  };
}

/** The steps of one turn that ends in a submission. */
export function submit(input: unknown, ...before: ScriptStep[]): Turn {
  return [...before, { kind: 'submit', input }];
}

/** A `write` call, as the implementation's built-in takes it. */
export function write(path: string, content: string): ScriptStep {
  return { kind: 'tool', tool: 'write', input: { path, content } };
}

/** An `edit` call, as the implementation's built-in takes it. */
export function edit(path: string, oldText: string, newText: string): ScriptStep {
  return { kind: 'tool', tool: 'edit', input: { path, edits: [{ oldText, newText }] } };
}

/** A call of the engineer's own test tool. */
export function runScopeTests(input: unknown = {}): ScriptStep {
  return { kind: 'tool', tool: 'run_scope_tests', input };
}

/** A call of the engineer's shell, whose writes pass no guard. */
export function shell(command: string, extra: Record<string, unknown> = {}): ScriptStep {
  return { kind: 'tool', tool: 'shell', input: { command, ...extra } };
}

/** A `read` call, as the implementation's built-in takes it. */
export function read(path: string): ScriptStep {
  return { kind: 'tool', tool: 'read', input: { path } };
}

/**
 * A test runner that really runs the files it is given: a `vitest` command
 * that imports each selected file, runs the tests it registered and exits
 * non-zero when one of them throws. It is the project's own runner as far as
 * the harness is concerned; what it is not is the real Vitest, which the
 * fixture's dependencies are not installed for.
 */
export async function installMiniRunner(root: string): Promise<void> {
  const shim = join(root, 'node_modules', 'vitest');
  await mkdir(shim, { recursive: true });
  await writeFile(join(shim, 'package.json'), JSON.stringify({ name: 'vitest', version: '0.0.0', type: 'module', main: 'index.js' }));
  await writeFile(join(shim, 'index.js'), SHIM);

  const bin = join(root, 'node_modules', '.bin');
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'mini-runner.mjs'), RUNNER);
  const executable = join(bin, 'vitest');
  await writeFile(executable, `#!/bin/sh\nshift\nexec node "${join(bin, 'mini-runner.mjs')}" "$@"\n`);
  await chmod(executable, 0o755);
  // The scenario runner readiness's `acceptance-runner` step looks for. No
  // gate runs it before the scenarios check kind exists.
  const cucumber = join(bin, 'cucumber-js');
  await writeFile(cucumber, '#!/bin/sh\nexit 0\n');
  await chmod(cucumber, 0o755);
}

const SHIM = `export const __queue = [];
export function describe(name, fn) { fn(); }
export function test(name, fn) { __queue.push({ name, fn }); }
export const it = test;
export function expect(actual) {
  return {
    toBe(expected) {
      if (!Object.is(actual, expected)) throw new Error(\`expected \${String(actual)} to be \${String(expected)}\`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('values are not equal');
    },
  };
}
`;

const RUNNER = `import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.log('no test file was given');
  process.exit(1);
}
const vitest = await import('vitest');
let failures = 0;
for (const file of files) {
  await import(pathToFileURL(resolve(file)).href);
  for (const entry of vitest.__queue.splice(0)) {
    try {
      await entry.fn();
      console.log('ok ' + file + ' ' + entry.name);
    } catch (error) {
      failures += 1;
      console.log('not ok ' + file + ' ' + entry.name + ': ' + error.message);
    }
  }
}
process.exit(failures === 0 ? 0 : 1);
`;

/** A module of the fixture copy a test owns: its declaration, its README and its own source. */
export async function addModule(root: string, directory: string, name: string, files: Readonly<Record<string, string>>): Promise<void> {
  await mkdir(join(root, directory, 'src', 'tests'), { recursive: true });
  await writeFile(join(root, directory, 'module.ramify'), `ramify 1\nmodule ${name}\n`);
  await writeFile(join(root, directory, 'README.md'), `# ${name}\n\nA module this test owns, so that an iteration has somewhere real to work.\n`);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, directory, path, '..'), { recursive: true });
    await writeFile(join(root, directory, path), content);
  }
}

/*
 * A module inventory read from the project's own declarations.
 *
 * `viewedInputs` is the production path and the tests that must prove the
 * refresh use it. It costs a full analysis on every refresh, and a test that
 * only needs to know which directory an owner is in does not need one: this
 * reads the same fact from the same tree, from the `module.ramify` files
 * Ramify itself reads the layout from.
 */

/** The `RunInputs` of a test that needs the owner-to-directory mapping and no analysis. */
export function treeInputs(): RunInputs {
  return {
    async capture(_projectRoot, capturedPlan) {
      return {
        planHash: createHash('sha256').update(capturedPlan).digest('hex'),
        source: null,
        versions: { architectPrompt: null, procedure: null, skill: null, ramify: null },
        architectView: { status: 'placeholder' },
      };
    },
    index: projectRoot => readDeclaredTree(projectRoot),
    changes: async () => [],
    refresh: projectRoot => readDeclaredTree(projectRoot),
  };
}

/** The module tree the project's own `module.ramify` declarations describe. */
export async function readDeclaredTree(projectRoot: string): Promise<ArchitectIndex> {
  const directories: string[] = [];
  await walk(projectRoot, '');
  directories.sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1));

  const names = new Map<string, string>();
  const modules = new Map<string, ModuleEntry>();
  const children = new Map<string, string[]>();
  for (const directory of directories) {
    const declaration = await readFile(join(projectRoot, directory, 'module.ramify'), 'utf8');
    const matched = /^module\s+(?:"([^"]+)"|(\S+))/m.exec(declaration);
    const name = matched?.[1] ?? matched?.[2];
    if (name === undefined) continue;
    const tags = /^module\s+\S+.*tagged\s*\[([^\]]*)\]/m.exec(declaration)?.[1]?.split(',').map(tag => tag.trim()).filter(Boolean) ?? [];
    const parentDirectory = directories.filter(candidate => candidate !== directory && within(directory, candidate)).at(-1);
    const parent = parentDirectory === undefined ? null : names.get(parentDirectory) ?? null;
    const path = parent === null ? name : `${parent}/${name}`;
    names.set(directory, path);
    modules.set(path, { module: path, dir: directory, parent, children: [], tags, areas: ['src', 'src/tests'] });
    if (parent !== null) children.set(parent, [...(children.get(parent) ?? []), path]);
  }
  for (const [parent, list] of children) {
    const entry = modules.get(parent);
    if (entry !== undefined) modules.set(parent, { ...entry, children: list });
  }
  return { revision: 'declared/1', input: `declared/1:${directories.length}`, modules, symbols: new Map() };

  async function walk(absolute: string, relative: string): Promise<void> {
    const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
    if (entries.some(item => item.isFile() && item.name === 'module.ramify')) directories.push(relative);
    for (const item of entries) {
      if (!item.isDirectory() || item.name === 'node_modules' || item.name.startsWith('.')) continue;
      await walk(join(absolute, item.name), relative === '' ? item.name : `${relative}/${item.name}`);
    }
  }
}

function within(path: string, directory: string): boolean {
  return directory === '' || path === directory || path.startsWith(`${directory}/`);
}
