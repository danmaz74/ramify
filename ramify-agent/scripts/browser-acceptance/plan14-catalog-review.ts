import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
 * Component-browser witness of the plan context catalog at the review stop,
 * over a real harness analysis projection. The focused fixture test creates
 * the response; the actual PlanAndEntries web component renders it in
 * Chromium. This does not exercise an HTTP server or a live agent workflow.
 *
 *   npx tsx scripts/browser-acceptance/plan14-catalog-review.ts
 */

const here = dirname(fileURLToPath(import.meta.url));
const agent = resolve(here, '../..');
const artifacts = resolve(agent, 'docs/plans/14-unified-evidence-packages/evidence');
const browserPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const temp = await mkdtemp(join(tmpdir(), 'plan14-catalog-review-'));
const fixture = join(temp, 'review-data.json');
const output = join(temp, 'web');
const checks: string[] = [];
const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push(name); };
const run = promisify(execFile);
let screenshots: string[] = [];
let failure: unknown;
const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: agent })).stdout.trim();
const dirtyAtStart = (await run('git', ['status', '--porcelain'], { cwd: agent })).stdout.trim() !== '';

try {
  await mkdir(artifacts, { recursive: true });
  await run(resolve(agent, 'node_modules/.bin/vitest'), [
    'run', 'subs/harness/src/tests/analysis-plan-evidence.test.ts',
    '-t', 'accepts the intake', '--maxWorkers=1', '--testTimeout=10000',
  ], { cwd: agent, env: { ...process.env, CATALOG_REVIEW_EXPORT: fixture }, timeout: 120_000 });
  const projection = JSON.parse(await readFile(fixture, 'utf8')) as {
    analysis: { status: string; planEvidence?: { status: string; elements?: Array<{ id: string; kind: string; text: string }> } };
  };
  check('the fixture came from an accepted harness analysis projection', projection.analysis.status === 'accepted' && projection.analysis.planEvidence?.status === 'available');
  check('the fixture holds the intake\'s non-functional requirement and recommendation', projection.analysis.planEvidence?.elements?.some(item => item.id === 'nfr-001' && item.kind === 'non-functional') &&
    projection.analysis.planEvidence.elements.some(item => item.id === 'rec-001' && item.text === 'Use Redis if practical.'));

  await build({
    configFile: false, root: here, base: '/', plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: output, emptyOutDir: true, rollupOptions: { input: resolve(here, 'plan14-catalog-review.html') } },
    logLevel: 'error',
  });
  await writeFile(join(output, 'review-data.json'), JSON.stringify(projection));

  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = resolve(output, `.${pathname}`);
    if (file !== output && !file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
    try {
      const target = (await stat(file)).isDirectory() ? join(file, 'plan14-catalog-review.html') : file;
      const mime = extname(target) === '.js' ? 'text/javascript' : extname(target) === '.css' ? 'text/css' : extname(target) === '.json' ? 'application/json' : 'text/html';
      response.writeHead(200, { 'content-type': mime }).end(await readFile(target));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Browser witness server has no TCP address');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/plan14-catalog-review.html`, { waitUntil: 'networkidle' });
    const panel = page.getByRole('region', { name: 'The plan context catalog' });
    await panel.getByText('nfr-001').waitFor();
    const text = await panel.innerText();
    check('the element shows its text and source path', text.includes('The service must preserve its 30 second timeout.') && text.includes('plans/review-notes/constraints.md'));
    check('stated and inferred conditions stay labelled', text.includes('stated condition: The service') && text.includes('inferred condition: for the service'));
    const recommendations = panel.getByRole('region', { name: 'Recommendations' });
    check('the recommendation is shown under its own heading with its notice',
      (await recommendations.innerText()).includes('Use Redis if practical.') && (await recommendations.innerText()).includes('nothing assesses them'));
    check('no requirement heading holds the recommendation',
      !(await panel.getByRole('region', { name: 'Non-functional requirements of the plan' }).innerText()).includes('Use Redis'));
    check('the checkers\' findings are shown', (await panel.getByRole('region', { name: 'Checker findings' }).innerText()).includes('found every reading faithful'));
    check('unclear missing reference shows target, source path and exact excerpt', text.includes('plans/review-notes/later.md') && text.includes('plans/review-notes/plan.md') && text.includes('[Optional guide](later.md)'));
    await panel.getByText('Document incorporation').click();
    check('the incorporation judgment is shown', (await panel.innerText()).includes('scenarios not incorporated'));
    await page.screenshot({ path: join(artifacts, 'catalog-review-1440x900.png'), fullPage: true });
    screenshots.push('catalog-review-1440x900.png');
    await page.evaluate(() => window.catalogReview.setMode('empty'));
    await panel.getByText('0 elements', { exact: false }).waitFor();
    check('an empty catalog is distinct from an unavailable one', await panel.getByText(/element catalog is unavailable/u).count() === 0);
    await page.evaluate(() => window.catalogReview.setMode('unavailable'));
    await panel.getByRole('status').getByText(/The accepted catalog file could not be verified/u).waitFor();
    check('an unavailable catalog carries its reason', await panel.getByText('nfr-001').count() === 0);
    await page.setViewportSize({ width: 480, height: 800 });
    await page.evaluate(() => window.catalogReview.setMode('accepted'));
    await panel.getByText('nfr-001').waitFor();
    await page.screenshot({ path: join(artifacts, 'catalog-review-480x800.png'), fullPage: true });
    screenshots.push('catalog-review-480x800.png');
    check('the narrow review remains inside the viewport', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('Chromium reports no page exceptions', errors.length === 0);
  } finally {
    await browser?.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
} catch (error) {
  failure = error;
} finally {
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'catalog-review-browser-results.json'), JSON.stringify({
    revision, dirtyAtStart,
    chromium: browserPath, fixture: 'RunQueries.analysis projection from analysis-plan-evidence.test.ts; actual PlanAndEntries component; local static Vite build',
    checks, screenshots, failure: failure instanceof Error ? failure.stack : failure ?? null,
  }, null, 2) + '\n');
  await rm(temp, { recursive: true, force: true });
}
if (failure) throw failure;
process.stdout.write(`Plan 14 catalog review Chromium witness: ${checks.length} checks passed.\n`);
