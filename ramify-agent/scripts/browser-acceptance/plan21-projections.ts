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
import { chromium, type Page } from 'playwright-core';
import { build } from 'vite';
import { gateViewSchema } from '../../subs/harness/src/interfaces/protocol/runs.js';

/*
 * Component-browser witness for Plan 21 iteration 10: the run page's nested
 * final audit (failing, passing, reused and cancelled F4 attempts), the
 * scenario three-state view, the capability task page and a transcript's
 * post-write check dispositions, at desktop and narrow widths. The gate
 * views are the run projection of real F4 attempts that
 * `project-boundary-audit.integration.test.ts` exports; without
 * PLAN21_ITERATION10_GATE_VIEWS naming an exported directory, this runner
 * runs that test to export them. It never fabricates a gate view.
 *
 *   npx tsx scripts/browser-acceptance/plan21-projections.ts
 */

const here = dirname(fileURLToPath(import.meta.url));
const agent = resolve(here, '../..');
const fixtureRoot = resolve(agent, 'subs/web/src/tests/browser-acceptance');
const artifacts = resolve(process.env.PLAN21_ITERATION10_BROWSER_ARTIFACTS
  ?? resolve(agent, 'docs/plans/21-project-boundary-adoption/evidence/iteration10-browser'));
const browserPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const run = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'plan21-projections-'));
const exported = process.env.PLAN21_ITERATION10_GATE_VIEWS ?? join(temp, 'export');
const output = join(temp, 'web');
const checks: string[] = [];
const screenshots: string[] = [];
const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push(name); };
const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: agent })).stdout.trim();
const dirtyAtStart = (await run('git', ['status', '--porcelain', '--', '.'], { cwd: agent })).stdout.trim() !== '';
let failure: unknown;
let fixtureHash: string | null = null;

const viewports = { desktop: { width: 1440, height: 900 }, narrow: { width: 480, height: 700 } } as const;

/** The page's own width holds its content: nothing scrolls sideways. */
async function noSidewaysScroll(page: Page): Promise<boolean> {
  return await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

try {
  if (!process.env.PLAN21_ITERATION10_GATE_VIEWS) {
    await mkdir(exported, { recursive: true });
    await run(resolve(agent, 'node_modules/.bin/vitest'), ['run', 'subs/harness/src/tests/project-boundary-audit.integration.test.ts',
      '-t', 'audits every eligible project|cancellation during a nested project', '--maxWorkers=1'], {
      cwd: agent, env: { ...process.env, PLAN21_ITERATION10_EVIDENCE: exported }, maxBuffer: 8 * 1024 * 1024, timeout: 600_000,
    });
  }
  const read = async (name: string) => JSON.parse(await readFile(join(exported, name), 'utf8')) as { source: string; gates: Record<string, unknown> };
  const final = await read('iteration10-gate-views-final.json');
  const cancellation = await read('iteration10-gate-views-cancellation.json');
  const parse = (gates: Record<string, unknown>) => Object.fromEntries(Object.entries(gates).map(([label, gate]) => [label, gateViewSchema.parse(gate)]));
  const fixture = { final: { gates: parse(final.gates) }, cancellation: { gates: parse(cancellation.gates) } };
  check('the export holds the real F4 failing, passing, reused, cancelled and replacement gate views',
    ['failing', 'passing', 'reused'].every(label => fixture.final.gates[label]?.audit?.nested === true)
    && ['cancelled', 'replacement'].every(label => fixture.cancellation.gates[label]?.audit?.nested === true));
  const fixtureBytes = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`);
  fixtureHash = createHash('sha256').update(fixtureBytes).digest('hex');
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'plan21-gate-views.json'), fixtureBytes);
  await build({ configFile: false, root: fixtureRoot, base: '/', plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: output, emptyOutDir: true, rollupOptions: { input: resolve(fixtureRoot, 'plan21-projections.html') } }, logLevel: 'error' });
  await writeFile(join(output, 'plan21-gate-views.json'), fixtureBytes);

  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = resolve(output, `.${pathname}`);
    if (file !== output && !file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
    try {
      const target = (await stat(file)).isDirectory() ? join(file, 'plan21-projections.html') : file;
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
    for (const [width, viewport] of Object.entries(viewports)) {
      const size = `${viewport.width}x${viewport.height}`;
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/plan21-projections.html`, { waitUntil: 'networkidle' });
      const shot = async (name: string) => {
        const file = `iteration10-${name}-${width}-${size}.png`;
        await page.screenshot({ path: join(artifacts, file), fullPage: true });
        screenshots.push(file);
      };
      const view = async (value: string) => { await page.evaluate(selected => window.plan21.setView(selected as 'gate'), value); };
      const openGate = async (gate: string) => {
        await page.getByRole('tab', { name: 'Checks' }).click();
        await page.getByRole('button', { name: gate, exact: true }).click();
        const panel = page.getByLabel(`Gate ${gate}`);
        await panel.getByLabel('Configured audit').waitFor({ timeout: 10_000 });
        return panel;
      };
      const projectLines = async (panel: ReturnType<Page['getByLabel']>) =>
        await panel.getByLabel('Audited projects').locator(':scope > li > p:first-child').allInnerTexts();

      // The failing final gate: a passing root above a failing grandchild.
      await view('gate');
      await page.getByRole('tab', { name: 'Checks' }).waitFor({ timeout: 10_000 });
      let panel = await openGate(fixture.final.gates['failing']!.id);
      let audit = panel.getByLabel('Configured audit');
      check(`${width}: the failing gate's invocation verdict is fail with the failed project named`,
        (await audit.innerText()).includes('fail: invocation fail over 3 projects; failed: engine/tools'));
      check(`${width}: each project keeps its own verdict and execution`,
        JSON.stringify(await projectLines(panel)) === JSON.stringify(['.: pass, ran, executed full', 'engine: pass, ran, executed full', 'engine/tools: fail, ran, executed full']));
      check(`${width}: the failing project's failure and record are shown`,
        (await panel.getByLabel('Failures of engine/tools').innerText()).includes('engine-tools-check')
        && (await audit.innerText()).includes(fixture.final.gates['failing']!.audit!.projects![2]!.evidence!.reportCommit));
      check(`${width}: the skipped external definition is shown with its reason`,
        (await panel.getByLabel('Skipped projects').innerText()).includes('Not audited: vendor/lib, beneath external vendor of .'));
      check(`${width}: the audit facts fit the page width`, await noSidewaysScroll(page));
      await audit.scrollIntoViewIfNeeded();
      await shot('gate-failing');

      panel = await openGate(fixture.final.gates['reused']!.id);
      check(`${width}: the documentation change reuses the nested project's record and runs the rest`,
        JSON.stringify(await projectLines(panel)) === JSON.stringify(['.: pass, ran, executed full', 'engine: pass, reused, executed full', 'engine/tools: pass, ran, executed full'])
        && (await panel.getByLabel('Configured audit').innerText()).includes('ignored changes: engine/docs/notes.md'));
      await shot('gate-reused');

      await view('gate-cancellation');
      panel = await openGate(fixture.cancellation.gates['cancelled']!.id);
      check(`${width}: a cancelled nested project is indeterminate and not run, and the gate is not verified`,
        (await panel.getByRole('heading').first().innerText()).includes('not-verified')
        && JSON.stringify(await projectLines(panel)) === JSON.stringify(['.: pass, ran, executed full', 'engine: pass, ran, executed full', 'engine/tools: indeterminate, not-run (cancelled: engine-tools: CANCELLED)']));
      await shot('gate-cancelled');

      await view('scenarios');
      await page.getByRole('tab', { name: 'Scenarios' }).click();
      const scenarios = page.getByLabel('Scenarios', { exact: true });
      await scenarios.getByText('sc-004').first().waitFor({ timeout: 10_000 });
      const scenarioText = await scenarios.innerText();
      check(`${width}: the scenario view shows the three states`,
        ['pending', 'bound', 'done'].every(state => scenarioText.includes(state)));
      const badgeHeights = await scenarios.locator('tbody td:nth-child(2)').evaluateAll(cells => cells.map(cell => {
        const badge = cell.firstElementChild as HTMLElement | null;
        return badge === null ? 0 : badge.getBoundingClientRect().height;
      }));
      check(`${width}: each scenario state badge stays on one line, and the table fits the page width`,
        badgeHeights.length === 4 && badgeHeights.every(height => height > 0 && height < 30) && await noSidewaysScroll(page));
      await shot('scenarios');

      for (const stage of ['repair', 'handed-back'] as const) {
        await view(`tasks-${stage}`);
        const tasks = page.getByLabel('Capability tasks');
        await tasks.getByText(stage === 'repair' ? 'Type check failed in D' : 'B source is usable by A').first().waitFor({ timeout: 10_000 });
        check(`${width}: the capability task page shows the ${stage} task`, true);
        check(`${width}: the ${stage} task page fits the page width`, await noSidewaysScroll(page));
        await shot(`capability-tasks-${stage}`);
      }

      await view('transcript');
      const dispositions = page.getByLabel('Path dispositions');
      await dispositions.waitFor({ timeout: 10_000 });
      const rows = await dispositions.locator(':scope > li').allInnerTexts();
      check(`${width}: each named path keeps its disposition, and a not-analyzed path has no passing label`,
        rows.length === 3 && rows[0]!.startsWith('checked src/app.ts')
        && rows.slice(1).every(row => row.startsWith('not-analyzed') && !/pass/u.test(row)));
      check(`${width}: the check's badge is the project's verdict`, await page.getByText('project passed', { exact: true }).count() === 1);
      await dispositions.scrollIntoViewIfNeeded();
      await shot('transcript-dispositions');
      check(`${width}: Chromium reports no page exceptions`, errors.length === 0);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
} catch (error) {
  failure = error;
} finally {
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'iteration10-browser-results.json'), JSON.stringify({
    revision, dirtyAtStart, chromium: browserPath, viewports: Object.values(viewports).map(size => `${size.width}x${size.height}`),
    fixture: fixtureHash === null ? null : { path: 'plan21-gate-views.json', sha256: fixtureHash,
      source: 'project-boundary-audit.integration.test.ts: real F4 gate attempts through the installed provider, projected by gateOf' },
    staticFixtures: 'scenario list, capability tasks and transcript entries from the web tests\' schema-checked protocol fixtures',
    checks, screenshots, failure: failure instanceof Error ? failure.stack : failure ?? null,
  }, null, 2) + '\n');
  await rm(temp, { recursive: true, force: true });
}
if (failure) throw failure;
process.stdout.write(`Plan 21 iteration 10 Chromium witness: ${checks.length} checks passed.\n`);
