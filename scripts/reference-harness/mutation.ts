import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

export type ProjectFixture =
  | { readonly kind: 'copy'; readonly sourceRoot: string }
  | { readonly kind: 'create'; readonly create: (root: string) => Promise<void> };

export interface IsolatedProject {
  readonly root: string;
  readonly runDirectory: string;
  /** Pass this explicit request to acquisition/session APIs; never infer cwd. */
  readonly request: {
    readonly root: string;
    readonly workingDirectory: string;
    readonly configuration: 'discover';
    readonly scope: 'whole-project';
  };
}

export type IsolatedResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown; readonly preservedDirectory?: string };

const excludedNames = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.reference-work', '.git',
  '.docusaurus', '.vite', '.cache', '.cucumber-viz',
]);

function isWithin(parent: string, path: string): boolean {
  const tail = relative(parent, path);
  return tail === '' || (!tail.startsWith(`..${sep}`) && tail !== '..' && !tail.startsWith(sep));
}

/**
 * Matrix IDs contain a colon. It cannot be part of a fixture's directory:
 * npm puts node_modules/.bin on PATH, where POSIX treats ':' as a separator.
 * Preserved and mutated fixtures share this spelling.
 */
export function instanceDirectoryName(instanceId: string): string {
  return instanceId.replaceAll(':', '-');
}

/** One owned mkdtemp directory per invocation, including concurrent instances. */
export async function runIsolatedProject<T>(options: {
  readonly workRoot: string;
  readonly instanceId: string;
  readonly fixture: ProjectFixture;
  readonly preserveOnFailure?: boolean;
}, operation: (project: IsolatedProject) => Promise<T>): Promise<IsolatedResult<T>> {
  if (!/^I[12]-\d{2}:[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)?$/.test(options.instanceId)) {
    throw new Error(`Invalid instance directory ID: ${options.instanceId}`);
  }
  const workRoot = resolve(options.workRoot);
  await mkdir(workRoot, { recursive: true });
  const runDirectory = await mkdtemp(join(workRoot, 'run-'));
  const root = join(runDirectory, instanceDirectoryName(options.instanceId), 'project');
  let result: IsolatedResult<T>;
  try {
    await mkdir(root, { recursive: true });
    if (options.fixture.kind === 'copy') {
      const sourceRoot = resolve(options.fixture.sourceRoot);
      if (isWithin(workRoot, sourceRoot)) throw new Error('Fixture source cannot be inside the mutation work directory');
      // Descend along the work area's ancestor chain before using fs.cp:
      // toolkit copies have examples/collection-review between source and work.
      async function copyEntries(sourceDirectory: string, destination: string): Promise<void> {
        await mkdir(destination, { recursive: true });
        for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
          const source = join(sourceDirectory, entry.name), target = join(destination, entry.name);
          if (excludedNames.has(entry.name) || isWithin(workRoot, source)) continue;
          if (entry.isDirectory() && isWithin(source, workRoot)) {
            await copyEntries(source, target);
            continue;
          }
          await cp(source, target, {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
          filter: (path) => !excludedNames.has(basename(path)) && !isWithin(workRoot, path),
          });
        }
      }
      await copyEntries(sourceRoot, root);
    } else {
      await options.fixture.create(root);
    }
    const project: IsolatedProject = {
      root, runDirectory,
      request: { root, workingDirectory: root, configuration: 'discover', scope: 'whole-project' },
    };
    result = { ok: true, value: await operation(project) };
  } catch (error) {
    result = { ok: false, error };
  }
  if (!result.ok && options.preserveOnFailure) return { ...result, preservedDirectory: runDirectory };
  try {
    // runDirectory is the exact directory created here, never a caller's root.
    await rm(runDirectory, { recursive: true, force: true });
  } catch (error) {
    return { ok: false, error: new AggregateError(result.ok ? [error] : [result.error, error],
      `Failed to clean owned mutation directory: ${runDirectory}`), preservedDirectory: runDirectory };
  }
  return result;
}

/** Recorded edits fail before writing when their baseline anchor has drifted. */
export async function replaceExactlyOnce(path: string, before: string, after: string): Promise<void> {
  const text = await readFile(path, 'utf8');
  if (!before || text.split(before).length !== 2) {
    throw new Error(`Expected exactly one mutation anchor in ${path}`);
  }
  await writeFile(path, text.replace(before, () => after));
}
