import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';
import { build } from 'vite';

/*
 * Component-browser witness for iteration 8. The input must be exported by a
 * real run/ledger integration test as PLAN13_READINESS_FIXTURE. Without that
 * override, this runner generates the fixture by running the integration test.
 * It never fabricates readiness or CheckFinding projections.
 *
 *   PLAN13_READINESS_FIXTURE=/absolute/path/to/export.json npx tsx scripts/browser-acceptance/plan13-readiness.ts
 */

const here = dirname(fileURLToPath(import.meta.url));
const agent = resolve(here, '../..');
const artifacts = resolve(agent, 'docs/plans/13-plan-evidence-and-nonfunctional-work/evidence');
const browserPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const run = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'plan13-readiness-'));
const sourcePath = process.env.PLAN13_READINESS_FIXTURE ?? join(temp, 'projection.json');
const output = join(temp, 'web');
const checks: string[] = [];
const screenshots: string[] = [];
const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push(name); };
const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: agent })).stdout.trim();
const dirtyAtStart = (await run('git', ['status', '--porcelain'], { cwd: agent })).stdout.trim() !== '';
let failure: unknown;
let trial: Record<string, unknown> | null = null;
let fixtureHash: string | null = null;

try {
  if (!process.env.PLAN13_READINESS_FIXTURE) {
    await run('npx', ['vitest', 'run', 'subs/harness/src/tests/nonfunctional-deviation-runtime.test.ts', '--maxWorkers=1'], {
      cwd: agent, env: { ...process.env, PLAN13_READINESS_EXPORT: sourcePath }, maxBuffer: 8 * 1024 * 1024,
    });
  }
  const fixtureBytes = await readFile(sourcePath);
  fixtureHash = createHash('sha256').update(fixtureBytes).digest('hex');
  const fixture = JSON.parse(fixtureBytes.toString('utf8')) as {
    source: { kind: string; test: string };
    expected: { quote: string; sourcePath: string };
    trial: Record<string, unknown>;
    cases: Record<string, { readiness: { readiness: { status: string } } }>;
  };
  trial = fixture.trial;
  check('fixture identifies a real ledger integration test', fixture.source.kind === 'run-ledger-projection' && fixture.source.test.length > 0);
  for (const [mode, status] of Object.entries({ pending: 'pending-review', accepted: 'ready', rejected: 'rejected',
    'gate-failed': 'gate-failed', 'source-unavailable': 'unavailable' })) {
    check(`${mode} has the projected ${status} verdict`, fixture.cases[mode]?.readiness.readiness.status === status);
  }
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'plan13-readiness-fixture.json'), fixtureBytes);
  await build({ configFile: false, root: here, base: '/', plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: output, emptyOutDir: true, rollupOptions: { input: resolve(here, 'plan13-readiness.html') } }, logLevel: 'error' });
  await writeFile(join(output, 'readiness-data.json'), JSON.stringify(fixture));

  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = resolve(output, `.${pathname}`);
    if (file !== output && !file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
    try {
      const target = (await stat(file)).isDirectory() ? join(file, 'plan13-readiness.html') : file;
      const mime = extname(target) === '.js' ? 'text/javascript' : extname(target) === '.css' ? 'text/css'
        : extname(target) === '.json' ? 'application/json' : 'text/html';
      response.writeHead(200, { 'content-type': mime }).end(await readFile(target));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Browser witness server has no TCP address');
    browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/plan13-readiness.html`, { waitUntil: 'networkidle' });
    for (const [mode, status] of Object.entries({ pending: 'Completed, pending user review', accepted: 'Ready to merge',
      rejected: 'Deviation rejected', 'gate-failed': 'Final gate failed', 'source-unavailable': 'Readiness unavailable' })) {
      await page.evaluate(value => window.plan13Readiness.setMode(value as 'pending'), mode);
      const panel = page.getByRole('heading', { name: 'Merge readiness' }).locator('..');
      await panel.getByText(status, { exact: true }).waitFor();
      check(`${mode} renders its authoritative verdict`, (await panel.innerText()).includes(status));
      if (mode === 'pending') {
        const deviation = page.getByRole('group', { name: /^Non-functional deviation / });
        await deviation.waitFor();
        const text = await deviation.innerText();
        check('the NFR CheckFinding keeps the exact captured quote and source path',
          text.includes(fixture.expected.quote) && text.includes(fixture.expected.sourcePath));
        const card = deviation.locator('xpath=ancestor::li[1]');
        await card.getByRole('button', { name: 'History' }).click();
        const history = card.locator('.check-finding-history');
        await history.waitFor();
        check('the actual CheckFinding detail projection opens with its report history',
          (await history.innerText()).includes('Reports'));
      }
      await page.screenshot({ path: join(artifacts, `plan13-readiness-${mode}.png`), fullPage: true });
      screenshots.push(`plan13-readiness-${mode}.png`);
    }
    check('Chromium reports no page exceptions', errors.length === 0);
  } finally {
    await browser?.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
} catch (error) {
  failure = error;
} finally {
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'plan13-readiness-browser-results.json'), JSON.stringify({
    revision, dirtyAtStart, chromium: browserPath,
    fixture: fixtureHash === null ? null : { path: 'plan13-readiness-fixture.json', sha256: fixtureHash },
    trial, checks, screenshots,
    failure: failure instanceof Error ? failure.stack : failure ?? null,
  }, null, 2) + '\n');
  await rm(temp, { recursive: true, force: true });
}
if (failure) throw failure;
process.stdout.write(`Plan 13 readiness Chromium witness: ${checks.length} checks passed.\n`);
