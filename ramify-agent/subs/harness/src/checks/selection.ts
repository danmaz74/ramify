import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { isTestingModule, type ArchitectIndex, type ModuleEntry } from '../../subs/evidence/src/views.js';
import type { TestSelection, TestSelectionPolicy } from './records.js';

/*
 * Resolving a test-selection policy against the current tree.
 *
 * An assignment captures a policy, never a file list. Every gate attempt,
 * including a repair, and every call of the engineer's own test tool resolve
 * it again from the tree as it stands, so a test the iteration created runs
 * before acceptance and a test it broke fails the attempt that follows.
 *
 * The selection never shrinks to the files that changed and never expands
 * through an inferred impact graph. A discovery that fails is not verified;
 * it never falls back to an earlier list.
 */

/** Which file names the project's runner treats as test files. */
const testFile = /\.(test|spec)\.([cm]?[jt]sx?)$/;

/** Directories no discovery enters, as the project's runner excludes them. */
const excludedDirectories = new Set(['node_modules', 'dist', 'coverage', '.git', '.reference-work']);

/** What the resolution was asked for. */
export interface SelectionRequest {
  readonly projectRoot: string;
  /** The refreshed architect view. Owner-to-directory mapping comes from it, and from nothing else. */
  readonly index: ArchitectIndex | null;
  readonly policy: TestSelectionPolicy;
}

/** Why a resolution could not answer a selection the checkpoint can rely on. */
export interface SelectionFailure {
  readonly failed: 'discovery-error' | 'required-suite-missing';
  readonly detail: string;
}

/** A resolved selection, and the reason it cannot be relied on where there is one. */
export interface SelectionResult {
  readonly selection: TestSelection;
  readonly failure: SelectionFailure | null;
  /**
   * The selected suites beneath the policy's `outside-modules` paths, which
   * are also in `extraSuites`. The runner is given each on its own, so one
   * it does not select cannot pass unnoticed beside the others.
   */
  readonly outside?: readonly string[] | undefined;
}

/**
 * The test files one policy selects from the current tree: each exact
 * owner's own test area, every descendant owner's for an included subtree,
 * the ordinary source of a testing module inside the selection, the test
 * files beneath its `outside-modules` paths and the suites a registered
 * evidence obligation requires.
 */
export async function resolveTestSelection(request: SelectionRequest): Promise<SelectionResult> {
  const { policy } = request;
  const empty: TestSelection = {
    policy: policy.policy, exactOwners: [...policy.exactOwners], subtrees: [...policy.subtrees], extraSuites: [...policy.extraSuites], resolved: [],
  };
  if (policy.policy === 'all-project') return { selection: empty, failure: null };

  if (request.index === null) {
    return {
      selection: empty,
      failure: { failed: 'discovery-error', detail: 'the architect view could not be refreshed, so no owner can be mapped to a directory' },
    };
  }
  const index = request.index;

  const selected = new Set<string>();
  const areas: Array<{ readonly module: string; readonly directory: string }> = [];
  for (const owner of policy.exactOwners) {
    const entry = index.modules.get(owner);
    if (entry === undefined) {
      return { selection: empty, failure: { failed: 'discovery-error', detail: `the refreshed architect view has no module "${owner}"` } };
    }
    areas.push({ module: entry.module, directory: testArea(entry) });
  }
  for (const subtree of policy.subtrees) {
    const entry = index.modules.get(subtree);
    if (entry === undefined) {
      return { selection: empty, failure: { failed: 'discovery-error', detail: `the refreshed architect view has no module "${subtree}"` } };
    }
    for (const owner of modulesWithin(index, entry.dir)) areas.push({ module: owner.module, directory: testArea(owner) });
  }

  for (const area of areas) {
    let found: string[];
    try {
      found = await discover(request.projectRoot, area.directory);
    } catch (error) {
      return {
        selection: empty,
        failure: { failed: 'discovery-error', detail: `${area.directory} of "${area.module}" could not be read: ${message(error)}` },
      };
    }
    for (const file of found) selected.add(file);
  }

  // A test file named as an `outside-modules` path is required like an
  // obligation's suite; a directory contributes the test files it holds now.
  const outside: string[] = [];
  for (const path of policy.outsideModules ?? []) {
    const entry = await stat(join(request.projectRoot, path)).catch(() => null);
    if (entry?.isDirectory() === true) {
      try {
        outside.push(...await discover(request.projectRoot, path));
      } catch (error) {
        return { selection: empty, failure: { failed: 'discovery-error', detail: `${path} could not be read: ${message(error)}` } };
      }
    } else if (testFile.test(basename(path))) {
      outside.push(toPosix(path));
    }
  }
  const extraSuites = [...new Set([...policy.extraSuites, ...outside])];
  const required: TestSelection = { ...empty, extraSuites };

  for (const suite of extraSuites) {
    if (selected.has(suite)) continue;
    const exists = await stat(join(request.projectRoot, suite)).then(entry => entry.isFile(), () => false);
    if (!exists) {
      return {
        selection: { ...required, resolved: [...selected].sort() },
        failure: { failed: 'required-suite-missing', detail: `the required suite ${suite} is not in the tree` },
      };
    }
    selected.add(suite);
  }

  return {
    selection: { ...required, resolved: [...selected].sort() },
    failure: null,
    ...(outside.length === 0 ? {} : { outside: [...new Set(outside)].sort() }),
  };
}

/**
 * Where one owner keeps the tests a gate runs: `src/tests/` for ordinary
 * source, and the ordinary `src/` of a separately declared testing module,
 * whose whole source area is test code.
 */
export function testArea(entry: ModuleEntry): string {
  const own = entry.dir === '' ? '' : `${toPosix(entry.dir)}/`;
  return isTestingModule(entry) ? `${own}src` : `${own}src/tests`;
}

/** Every module of the view at or beneath one project-relative directory. */
export function modulesWithin(index: ArchitectIndex, dir: string): ModuleEntry[] {
  const root = toPosix(dir);
  return [...index.modules.values()]
    .filter(entry => {
      const candidate = toPosix(entry.dir);
      return root === '' || candidate === root || candidate.startsWith(`${root}/`);
    })
    .sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
}

/** The test files beneath one project-relative directory, as the runner discovers them. */
async function discover(projectRoot: string, directory: string): Promise<string[]> {
  const found: string[] = [];
  await walk(join(projectRoot, directory));
  return found;

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (await isStateDirectory(current)) return;
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (excludedDirectories.has(entry.name) || entry.name.startsWith('.') ||
          (entry.name === 'tmp' && basename(current) === 'src')) continue;
        await walk(path);
      } else if (entry.isFile() && testFile.test(entry.name)) {
        found.push(toPosix(relative(projectRoot, path)));
      }
    }
  }
}

/** A directory whose `tsconfig.json` selects no files is the harness's own, and holds no test of the project. */
async function isStateDirectory(directory: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(join(directory, 'tsconfig.json'), 'utf8')) as { files?: unknown };
    return Array.isArray(parsed.files) && parsed.files.length === 0;
  } catch {
    return false;
  }
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
