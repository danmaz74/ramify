import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { repositoryRoot } from './plan.js';
import type { VerificationReport } from './runner.js';
import { plan2Instances } from './plan2-instances.js';
import { plan1Instances, referenceCases } from './cases.js';

async function treeFiles(root: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await treeFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}
async function hashFiles(root: string, files: readonly string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    hash.update(file).update('\0').update(await readFile(join(root, file))).update('\0');
  }
  return hash.digest('hex');
}

/** Revision describes the checkout; hashes also identify uncommitted source/build bytes. */
export async function executionIdentity() {
  const git = (args: string[]) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const inputs = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'src', 'subs', 'scripts',
    'module.ramify', 'README.md', 'package.json', 'package-lock.json', 'tsconfig*.json', 'vitest.config.ts', 'examples/collection-review',
    'docs/plans/done/iteration-1-project-verifier/main-plan.md', 'docs/plans/done/iteration-1-project-verifier/subcases.md',
    'docs/plans/done/iteration-1-project-verifier/iterations/manifest.json',
    'docs/plans/iteration-2-resident-verification/main-plan.md', 'docs/plans/iteration-2-resident-verification/subcases.md'])
    .split('\0').filter(Boolean);
  const files = [...new Set(inputs)].filter(file => !file.includes('/node_modules/') && !file.includes('/.reference-work/'));
  const packageData = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
  const compiler = JSON.parse(await readFile(join(repositoryRoot, 'node_modules/typescript/package.json'), 'utf8'));
  const dist = join(repositoryRoot, 'dist');
  return { revision: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0,
    sourceSha256: await hashFiles(repositoryRoot, files), buildSha256: await hashFiles(dist, await treeFiles(dist)),
    packageVersion: packageData.version as string, nodeVersion: process.version, typescriptVersion: compiler.version as string };
}

/** Preserve useful relative source paths while removing machine and scratch locations. */
export function portableValue<T>(value: T, roots: readonly (readonly [string, string])[]): T {
  const ordered = roots.map(([root, label]) => [root.replace(/\/+$/, ''), label] as const)
    .filter(([root]) => root.length > 1).sort(([a], [b]) => b.length - a.length);
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== 'string') return item;
    let text = item;
    for (const [root, label] of ordered) text = text.replaceAll(root, label);
    return text.replace(/\.reference-work\/run-[^/\s"']+/g, '.reference-work/<run>');
  })) as T;
}

export function pendingWork(report: VerificationReport) {
  if (report.plan === 2) return {
    instances: report.instances.filter(instance => instance.status !== 'passed').map(instance => ({
      id: instance.id, iteration: instance.iteration, status: instance.status, reason: instance.reason ?? null,
    })),
    families: [...new Set(plan2Instances.flatMap(instance => instance.families))].map(id => ({
      id, matrixInstances: plan2Instances.filter(instance => instance.families.includes(id)).map(instance => instance.id),
      wholeFamilyClaim: 'not-established' as const,
    })),
    nextPlan: 'Plan 3: inspection over the resident service',
    completionObligations: [
      'Every Plan 2 instance with its reviewed evidence kind and independent expectation',
      'Architecture acceptance of the iteration 1 contract revisions before iteration 3',
      'Resident budgets, macOS process evidence, Plan 1 regression and completion review',
    ],
  };
  return {
    instances: report.instances.filter(instance => instance.status !== 'passed').map(instance => ({ id: instance.id,
      iteration: instance.iteration, status: instance.status, reason: instance.reason ?? null })),
    // A matrix slice never claims an entire family. Keep its larger declared scope.
    families: referenceCases.map(family => ({ id: family.id, authority: family.authority,
      scope: family.expected, matrixInstances: plan1Instances.filter(instance => instance.families.includes(family.id)).map(instance => instance.id),
      wholeFamilyClaim: 'not-established' as const })),
    nextPlan: 'Plan 2: resident daemon, IPC, watching, incremental invalidation and retained history',
    completionObligations: [
      ...(!['I1-27:self-check', 'I1-27:self-negative'].every(id => report.instances.some(item => item.id === id && item.status === 'passed'))
        ? ['Toolkit self-check and independent negative'] : []),
      ...(!report.instances.some(item => item.id === 'I1-28:relocated-package' && item.status === 'passed')
        ? ['Relocated build, installation and executable'] : []),
      'Review separate reference and 100-owner measurement evidence against scope.md budgets',
    ],
  };
}

export async function persistGateReport(report: VerificationReport, context: {
  readonly identity: Awaited<ReturnType<typeof executionIdentity>>;
  readonly command: readonly string[];
  readonly startedAt: string;
  readonly durationMs: number;
}) {
  const path = `.reference-work/reports/plan${report.plan}-${report.iteration === null ? 'full' : `iteration${report.iteration}`}-${randomUUID()}.json`;
  const roots: Array<readonly [string, string]> = [
    [resolve(repositoryRoot, 'examples/collection-review'), '<reference>'], [resolve(repositoryRoot), '<toolkit>'],
    [await realpath(join(repositoryRoot, 'node_modules')), '<toolkit-dependencies>'],
    [tmpdir(), '<temporary>'], [homedir(), '<home>'], [process.execPath, 'node'],
  ];
  const artifact = portableValue({ ...report, evidence: { ...context, completedAt: new Date().toISOString(),
    completionScope: 'Reviewed source matrix only; resource budgets and overall milestone acceptance require the completion report',
    requiredScope: `Reviewed Plan ${report.plan} matrix; whole-project fixtures; all owned source and testing areas`,
    instances: report.plan === 2 ? plan2Instances : plan1Instances, pending: pendingWork(report) }, artifact: path }, roots);
  const text = JSON.stringify(artifact);
  if (Buffer.byteLength(text) > 32 * 1024 ** 2) throw new Error('Portable gate report exceeds 32 MiB; no complete report published');
  await mkdir(dirname(join(repositoryRoot, path)), { recursive: true });
  await writeFile(join(repositoryRoot, path), `${text}\n`, { flag: 'wx' });
  return artifact;
}
