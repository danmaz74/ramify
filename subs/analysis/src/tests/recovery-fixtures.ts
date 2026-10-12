import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDefaultTagRegistry } from '../../subs/model/src/registry.js';
import type { AnalysisInputs, InventoryInputs } from '../interfaces/analysis.js';

export const recoverySmallPaths: { readonly provider: string; readonly consumer: string; readonly providerDescription: string } = {
  provider: 'subs/provider/src/api.ts', consumer: 'subs/consumer/src/use.ts',
  providerDescription: 'subs/provider/module.ramify' } as const;
const providerSource = 'export const first: number = 1;\nexport const second: number = 2;\n';
/** Fresh file maps prevent negative mutations from contaminating the positive control. */
export function recoverySmallFiles(): Record<string, string> {
  return {
    'module.ramify': 'ramify 1\nroot module recovery\nexpose-sub * from provider to descendants\n',
    'README.md': '# Recovery\n\nA small recovery fixture.\n',
    'package.json': '{"type":"module"}',
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
      types: [], outDir: 'dist' }, include: ['src', 'subs'] }),
    'src/root.ts': 'export const rootValue = 0;\n',
    'subs/provider/module.ramify': 'ramify 1\nmodule provider\nexpose-src first, second from "api.ts" to parent\n',
    'subs/provider/README.md': '# Provider\n\nSupplies two numbers.\n',
    [recoverySmallPaths.provider]: providerSource,
    'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
    'subs/consumer/README.md': '# Consumer\n\nUses the first number.\n',
    [recoverySmallPaths.consumer]: "import { first } from '../../provider/src/api.js';\nvoid first;\n",
  };
}
export interface RecoverySmallFixture {
  readonly root: string;
  readonly inventoryInputs: InventoryInputs;
  readonly analysisInputs: AnalysisInputs;
  write(path: string, text: string): Promise<void>;
  removeExports(): Promise<void>;
  repair(): Promise<void>;
}
/** Owns one temporary mutable project; always releases it after the callback. */
export async function withRecoverySmall<T>(run: (fixture: RecoverySmallFixture) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-recovery-small-'));
  const write = async (path: string, text: string): Promise<void> => {
    await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text);
  };
  try {
    for (const [path, text] of Object.entries(recoverySmallFiles())) await write(path, text);
    const inventoryInputs: InventoryInputs = { project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      registry: createDefaultTagRegistry(), limits: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
        maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
        maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 } };
    const analysisInputs: AnalysisInputs = { project: inventoryInputs.project, registry: inventoryInputs.registry,
      capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access',
        'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'],
      limits: { acquisition: inventoryInputs.limits, source: { maxExports: 250_000, maxAccesses: 250_000,
        maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 }, maxExposurePairs: 1_000_000,
        maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000 } };
    return await run({ root, inventoryInputs, analysisInputs, write,
      removeExports: () => write(recoverySmallPaths.provider, 'export {};\n'),
      repair: () => write(recoverySmallPaths.provider, providerSource) });
  } finally { await rm(root, { recursive: true, force: true }); }
}
