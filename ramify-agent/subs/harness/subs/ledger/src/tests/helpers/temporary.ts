import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A temporary directory, removed by the returned function. */
export async function temporaryDirectory(): Promise<{ path: string; remove: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), 'ramify-ledger-'));
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}
