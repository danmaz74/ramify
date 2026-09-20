import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fixture target project, kept as test data at the package root. */
export const fixtureRoot = fileURLToPath(new URL('../../../../../fixtures/collection-review', import.meta.url));

/** A temporary directory, removed by the returned function. */
export async function temporaryDirectory(): Promise<{ path: string; remove: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), 'ramify-agent-'));
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

/** A private copy of the fixture project, so that tests never change it. */
export async function copyFixture(): Promise<{ root: string; remove: () => Promise<void> }> {
  const directory = await temporaryDirectory();
  const root = join(directory.path, 'collection-review');
  await cp(fixtureRoot, root, { recursive: true });
  return { root, remove: directory.remove };
}
