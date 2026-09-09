import { relative, resolve } from 'node:path';
import { acquireInventory } from '../subs/analysis/src/inventory-entry.js';
import type { AcquisitionLimits, InventorySnapshot } from '../subs/analysis/src/inventory-entry.js';
import { createDefaultTagRegistry } from '../subs/analysis/subs/model/src/index.js';

export interface ProductionFiles {
  readonly schemaVersion: 'ramify.production-files/1';
  readonly root: '.';
  readonly configuration: string;
  readonly files: readonly string[];
}

const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };

/** Selection consumes resolved areas; it never infers ownership or testing from paths. */
export function selectProductionFiles(snapshot: InventorySnapshot): ProductionFiles {
  const profiles = new Map(snapshot.areas.map(area => [`${area.owner}:${area.kind}`, area]));
  if (profiles.size !== snapshot.areas.length) throw new Error('Inventory contains duplicate source profiles');
  const retained = new Set<string>();
  for (const file of snapshot.inventory.files) {
    const area = profiles.get(`${file.owner}:${file.area}`);
    if (!area) throw new Error(`No resolved source profile for ${file.path}`);
    if (!area.profile.includes('testing')) retained.add(file.path);
  }
  return { schemaVersion: 'ramify.production-files/1', root: '.',
    configuration: relative(snapshot.inventory.scope.root, snapshot.inventory.scope.configuration).split('\\').join('/'),
    files: [...retained].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))) };
}

export async function acquireProductionSelection(root: string): Promise<{ document: ProductionFiles; snapshot: InventorySnapshot }> {
  const selectedRoot = resolve(root);
  const result = await acquireInventory({ project: { cwd: selectedRoot, root: selectedRoot,
    scope: 'whole-project', configuration: 'discover' }, registry: createDefaultTagRegistry(), limits });
  if (result.status !== 'completed') {
    throw new Error(result.status === 'cancelled' ? 'Production selection was cancelled'
      : `Production selection ${result.status}:\n${result.diagnostics.map(item =>
        `${item.location?.file ?? '.'}: ${item.code}: ${item.message}`).join('\n')}`);
  }
  return { document: selectProductionFiles(result.snapshot), snapshot: result.snapshot };
}
