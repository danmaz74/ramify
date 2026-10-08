import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import react from '@vitejs/plugin-react';
import { build, preview } from 'vite';
import { executionCapabilityDetailSchema, executionMapPageSchema, executionScenarioDetailSchema } from '../../subs/harness/src/interfaces/protocol/execution-map.js';

const here = dirname(fileURLToPath(import.meta.url));
const agent = resolve(here, '../..');
const fixtureRoot = resolve(agent, 'subs/web/src/tests/browser-acceptance');
// BROWSER_ACCEPTANCE_ARTIFACTS keeps a later plan's rerun from overwriting Plan 11's recorded evidence.
const artifacts = resolve(agent, process.env.BROWSER_ACCEPTANCE_ARTIFACTS ?? 'docs/plans/11-plan-execution-map/evidence');
const checks: string[] = [];
const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push(name); };
const browserPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const exec = promisify(execFile);

await mkdir(artifacts, { recursive: true });
const buildDir = resolve(agent, 'dist/browser-acceptance');
const durablePath = resolve(agent, 'dist/browser-acceptance-durable.json');
await mkdir(dirname(durablePath), { recursive: true });
await exec(resolve(agent, 'node_modules/.bin/vitest'), ['run', 'subs/harness/src/tests/acceptance-trial.test.ts',
  '-t', 'passes the review stop', '--maxWorkers=1'], { cwd: agent, timeout: 120_000,
  env: { ...process.env, PLAN11_EXECUTION_EXPORT: durablePath } });
const durable = JSON.parse(await readFile(durablePath, 'utf8')) as {
  planId: string; runId: string; pages: unknown[]; capabilities: Record<string, unknown>; scenarios: Record<string, unknown>;
};
const durablePages = durable.pages.map(value => executionMapPageSchema.parse(value));
const durablePayload = { ...durable, pages: durablePages,
  capabilities: Object.fromEntries(Object.entries(durable.capabilities).map(([key, value]) => [key, executionCapabilityDetailSchema.parse(value)])),
  scenarios: Object.fromEntries(Object.entries(durable.scenarios).map(([key, value]) => [key, executionScenarioDetailSchema.parse(value)])) };
check('disk-backed scripted run exported more than one valid protocol page', durablePages.length > 1);
const durableNodes = durablePages.flatMap(page => page.nodes);
check('exported run has two roots, one lower provider and verified consumer requirement',
  durableNodes.filter(node => node.kind === 'capability' && node.level === 'entry').length === 2 &&
  durableNodes.some(node => node.key === 'capability:note-limit') &&
  durableNodes.some(node => node.key === 'requirement:rq-001' && node.kind === 'requirement' && node.state === 'verified'));
await build({ configFile: false, root: fixtureRoot, plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] },
  base: './', build: { outDir: buildDir, emptyOutDir: true }, logLevel: 'error' });
const server = await preview({ configFile: false, root: fixtureRoot, build: { outDir: buildDir },
  preview: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
const address = server.httpServer?.address();
if (!address || typeof address === 'string') throw new Error('Vite did not bind a TCP port');
const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
let failure: unknown;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
  const canvas = page.getByLabel('Zoomable execution canvas');
  try { await canvas.waitFor({ timeout: 5_000 }); }
  catch (error) {
    throw new Error(`Execution canvas did not render; page: ${(await page.content()).slice(0, 3000)}; page errors: ${errors.join('; ')}`, { cause: error });
  }
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  check('desktop 1440x900: two entry roots and one canonical provider',
    await canvas.getByRole('button', { name: /status-badge, capability/ }).count() === 1 &&
    await canvas.getByRole('button', { name: /accessible-tone, capability/ }).count() === 1 &&
    await canvas.getByRole('button', { name: /theme-tokens, capability/ }).count() === 1);
  check('all five session roles and both gates are reachable in the shelf',
    await page.getByLabel('All sessions').getByRole('listitem').count() === 5 &&
    await page.getByLabel('All gates').getByRole('listitem').count() === 2);
  // Every card of a column is measured, and its extent meets no other card's: a gate's audit line is not under the next card.
  const overlappingCards = async () => await page.evaluate(`[...document.querySelectorAll('.execution-viewport .react-flow__node')]
    .map(node => ({ id: node.getAttribute('data-id'), box: node.getBoundingClientRect() }))
    .flatMap((a, i, all) => all.slice(i + 1).filter(b => a.box.left < b.box.right && b.box.left < a.box.right && a.box.top < b.box.bottom && b.box.top < a.box.bottom)
      .map(b => a.id + ' meets ' + b.id))`) as string[];
  check('no two execution map cards overlap', (await overlappingCards()).length === 0);
  check('cycle is a finite reference', await page.getByLabel('References').getByText(/theme-tokens → capability:status-badge/).count() === 1);
  await page.screenshot({ path: resolve(artifacts, 'desktop-initial-1440x900.png'), fullPage: true });
  const transform = async (scope: typeof canvas) => scope.locator('.react-flow__viewport').getAttribute('style');
  const dragPane = async (scope: typeof canvas) => {
    await scope.scrollIntoViewIfNeeded();
    const box = await scope.boundingBox();
    if (!box) throw new Error('Canvas has no bounds');
    await page.mouse.move(box.x + box.width - 32, box.y + box.height - 32);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 100, box.y + box.height - 80, { steps: 8 });
    await page.mouse.up();
  };
  const mainBeforePan = await transform(canvas);
  await dragPane(canvas);
  check('real pointer pans the execution map', (await transform(canvas)) !== mainBeforePan);
  const beforeZoom = await transform(canvas);
  const mainBox = await canvas.boundingBox();
  if (!mainBox) throw new Error('Execution canvas has no bounds');
  await page.mouse.move(mainBox.x + mainBox.width / 2, mainBox.y + mainBox.height / 2);
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(150);
  check('real wheel zooms the execution map', (await transform(canvas)) !== beforeZoom);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await canvas.getByRole('button', { name: /status-badge, capability/ }).click();
  await page.getByText(/Render a status badge whose tone uses the shared theme contract/).waitFor();
  check('full capability description opens', true);
  await canvas.getByRole('button', { name: /Renders the status badge, scenario/ }).click();
  await page.getByText(/Given a valid status/).waitFor();
  check('full frozen scenario opens', true);
  check('scenario detail lists each result with the configured check that ran it',
    await page.getByText(/ga-001: passed in scenarios; gate passed/).count() === 1 &&
    await page.getByText(/ga-005: failed/).count() === 1 && await page.getByText(/ga-006: passed/).count() === 1);
  await page.getByLabel('All gates').getByRole('button', { name: /Status iteration gate, failed/ }).click();
  check('failed verdict with passing audit remain distinct',
    await canvas.getByLabel('Verdict failed; audit passed').count() === 1);
  await page.getByLabel('All gates').getByRole('button', { name: /Status iteration gate, repaired/ }).click();
  check('repair chain and incomplete audit remain distinct',
    (await canvas.getByRole('button', { name: /Status iteration gate, repaired, gate/ }).innerText()).includes('✗ → ✓') &&
    await canvas.getByLabel('Verdict passed; audit incomplete').count() === 1);
  await page.getByRole('button', { name: 'Now' }).click();
  check('Now targets the recorded live engineer', await canvas.locator('.execution-live').count() === 1);
  check('reduced motion disables live pulse', await canvas.locator('.execution-live').evaluate(el => getComputedStyle(el).animationName === 'none'));
  const moduleCanvas = page.getByLabel('Zoomable modules canvas');
  await moduleCanvas.waitFor();
  check('module hierarchy shows direct violet and uninvolved parent',
    await page.getByText('2 involved descendants').count() > 0 &&
    await moduleCanvas.getByText('Worked in · direct').count() >= 2);
  check('partial LOC and proportional bars are visible',
    await moduleCanvas.getByText(/\+18 \/ −7 · partial subtotal/).count() === 1 &&
    await moduleCanvas.locator('.execution-line-bars').count() >= 2);
  await page.screenshot({ path: resolve(artifacts, 'desktop-after-now-1440x900.png'), fullPage: true });
  const mainBeforeModuleMove = await transform(canvas);
  const moduleBeforePan = await transform(moduleCanvas);
  await dragPane(moduleCanvas);
  check('real pointer pans modules without moving execution map',
    (await transform(moduleCanvas)) !== moduleBeforePan && (await transform(canvas)) === mainBeforeModuleMove);
  const moduleBeforeZoom = await transform(moduleCanvas);
  const moduleBox = await moduleCanvas.boundingBox();
  if (!moduleBox) throw new Error('Modules canvas has no bounds');
  await page.mouse.move(moduleBox.x + moduleBox.width / 2, moduleBox.y + moduleBox.height / 2);
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(150);
  check('real wheel zooms modules independently',
    (await transform(moduleCanvas)) !== moduleBeforeZoom && (await transform(canvas)) === mainBeforeModuleMove);
  const uiModule = moduleCanvas.getByRole('treeitem', { name: /project\/ui, current module/ });
  await uiModule.focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Details for module project/ui').waitFor();
  check('module selection works from the keyboard', true);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await canvas.getByRole('button', { name: 'Collapse status-badge' }).click();
  await uiModule.click();
  check('module click marks hidden matches on the collapsed branch',
    await canvas.getByRole('button', { name: /Expand status-badge, [1-9] matches inside/ }).count() === 1 &&
    await page.getByLabel('Direct execution matches').getByText(/hidden; reveal/).count() > 0);
  await page.getByLabel('Direct execution matches').getByRole('button', { name: /Implement status badge.*hidden; reveal/ }).click();
  check('hidden-match jump reveals its execution node',
    await canvas.getByRole('button', { name: /Implement status badge, work-item/ }).count() === 1);
  check('after a branch is revealed no two execution map cards overlap', (await overlappingCards()).length === 0);
  await page.evaluate(() => window.acceptance.setScenarioCount(20));
  await canvas.getByRole('button', { name: 'Collapse status-badge' }).click();
  check('20 collapsed scenarios display dots', await canvas.locator('.execution-capability').first().locator('.execution-dots i').count() === 20);
  await page.evaluate(() => window.acceptance.setScenarioCount(21));
  await canvas.locator('.execution-capability').first().locator('.execution-segments').waitFor({ state: 'attached' });
  check('21 collapsed scenarios display a bar', await canvas.locator('.execution-capability').first().locator('.execution-dots').count() === 0);
  await page.evaluate(() => window.acceptance.setRequirementVerified(true));
  await canvas.locator('.execution-capability.execution-state-completed').first().waitFor({ state: 'attached' });
  check('capability turns green when current requirement verifies',
    await canvas.locator('.execution-capability.execution-state-completed').count() >= 1);
  await page.evaluate(() => window.acceptance.setRequirementVerified(false));
  await canvas.locator('.execution-capability.execution-state-working').first().waitFor({ state: 'attached' });
  check('reopened requirement clears capability green',
    await canvas.locator('.execution-capability.execution-state-working').count() >= 1);
  check('after live version updates change card content no two execution map cards overlap', (await overlappingCards()).length === 0);
  await page.evaluate(() => window.acceptance.setScenarioCount(1));
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await moduleCanvas.locator('.react-flow__controls-fitview').click();
  await page.screenshot({ path: resolve(artifacts, 'desktop-1440x900.png'), fullPage: true });
  const local = page.getByLabel('All sessions').getByRole('listitem').filter({ hasText: 'Status local architect' });
  await local.getByRole('button', { name: 'Transcript' }).click();
  const first = page.getByLabel('Transcript window ses-0002');
  await first.waitFor();
  check('local architect transcript shows full module path', (await first.innerText()).includes('project/ui'));
  await page.getByLabel('All sessions').getByRole('listitem').filter({ hasText: 'Status engineer' }).getByRole('button', { name: 'Transcript' }).click();
  const second = page.getByLabel('Transcript window ses-0003');
  await second.waitFor();
  await first.getByText('Transcript for ses-0002').waitFor();
  await second.getByText('Transcript for ses-0003').waitFor();
  check('two independent transcript windows display bodies', await first.getByText('Transcript for ses-0002').count() === 1 &&
    await second.getByText('Transcript for ses-0003').count() === 1);
  await page.evaluate(() => window.acceptance.appendLive('Live appended browser entry'));
  await second.getByText('Live appended browser entry').waitFor({ timeout: 5000 });
  check('live transcript receives appended entry', true);
  const before = await second.boundingBox();
  if (!before) throw new Error('Engineer window has no bounds');
  await page.mouse.move(before.x + 150, before.y + 20);
  await page.mouse.down(); await page.mouse.move(before.x + 210, before.y + 60, { steps: 8 }); await page.mouse.up();
  const moved = await second.boundingBox();
  check('real pointer moves a window', !!moved && moved.x > before.x + 25 && moved.y > before.y + 15);
  if (!moved) throw new Error('Moved window has no bounds');
  await page.mouse.move(moved.x + moved.width - 8, moved.y + moved.height - 8);
  await page.mouse.down(); await page.mouse.move(moved.x + moved.width + 64, moved.y + moved.height + 44, { steps: 8 }); await page.mouse.up();
  const resized = await second.boundingBox();
  check('real pointer resizes a window', !!resized && resized.width > moved.width + 30 && resized.height > moved.height + 20);
  const header = second.getByLabel('Move or resize transcript ses-0003');
  await header.focus();
  await page.keyboard.press('ArrowRight');
  const keyboardMoved = await second.boundingBox();
  check('keyboard moves and resets a window', !!resized && !!keyboardMoved && keyboardMoved.x >= resized.x + 19);
  await page.keyboard.press('Home');
  await second.getByRole('button', { name: 'Focus on map' }).click();
  check('window focus marks its session', await canvas.locator('.execution-flash').count() === 1);
  await second.getByRole('button', { name: 'Close ses-0003' }).click();
  check('closing one window leaves the other', await first.count() === 1 && await second.count() === 0);
  await page.evaluate(() => window.acceptance.setUnavailable(true));
  await page.getByRole('alert').filter({ hasText: 'Could not refresh execution map' }).waitFor();
  check('connection loss retains the last complete canvas', await canvas.count() === 1);
  await page.evaluate(() => window.acceptance.setUnavailable(false));
  await page.getByLabel('Zoomable execution canvas').waitFor();
  check('reconnection reloads a coherent canvas', true);
  const versionLine = page.locator('.execution-area > p.muted');
  const beforeVersion = Number((await versionLine.textContent())?.match(/Version (\d+)/)?.[1]);
  await page.evaluate(() => window.acceptance.restartVersion());
  await page.waitForFunction(expected => document.querySelector('.execution-area > p.muted')?.textContent?.includes(`Version ${expected}`), beforeVersion + 1);
  check('browser version restart displays one complete new map',
    (await versionLine.textContent())?.includes(`Version ${beforeVersion + 1}`) &&
    await canvas.locator('.execution-capability').count() === 3 &&
    await page.getByLabel('All gates').getByRole('listitem').count() === 2);
  await page.screenshot({ path: resolve(artifacts, 'desktop-windows-1440x900.png'), fullPage: true });
  await first.getByRole('button', { name: 'Close ses-0002' }).click();

  await page.setViewportSize({ width: 480, height: 700 });
  await page.getByRole('button', { name: 'Open modules' }).click();
  await moduleCanvas.waitFor();
  check('narrow 480x700: modules drawer opens', await moduleCanvas.isVisible());
  await page.screenshot({ path: resolve(artifacts, 'narrow-map-480x700.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('All sessions').getByRole('listitem').filter({ hasText: 'Status local architect' }).getByRole('button', { name: 'Transcript' }).click();
  await page.getByLabel('All sessions').getByRole('listitem').filter({ hasText: 'Status engineer' }).getByRole('button', { name: 'Transcript' }).click();
  await page.setViewportSize({ width: 480, height: 700 });
  await page.getByLabel('Open transcripts').waitFor();
  await page.locator('.transcript-window-panel:visible').first().waitFor();
  check('narrow view uses transcript panels and a switcher',
    await page.getByLabel('Open transcripts').isVisible() && await page.locator('.transcript-window-panel').count() >= 2);
  await page.screenshot({ path: resolve(artifacts, 'narrow-480x700.png'), fullPage: true });
  check('no browser exceptions', errors.length === 0);

  const durablePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const durableErrors: string[] = [];
  durablePage.on('pageerror', error => durableErrors.push(error.message));
  await durablePage.addInitScript(value => { window.plan11Durable = value; }, durablePayload);
  await durablePage.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
  const durableCanvas = durablePage.getByLabel('Zoomable execution canvas');
  await durableCanvas.waitFor();
  // Every gate of the scripted run, the readiness baseline included, now
  // keeps its configured audit outcome, so the run has none of Plan 11's
  // historical audit gaps. The many-gap collapse and expansion are witnessed
  // by execution-map.test.tsx's fourteen-gap fixture.
  const exportedGaps = durablePages.reduce((total, value) => total + value.coverage.gaps.length, 0);
  check('a run whose gates all retain their audit outcomes shows no coverage gap',
    exportedGaps === 0 && await durablePage.locator('.execution-coverage-gaps').count() === 0 &&
    !/Coverage gaps/u.test(await durablePage.locator('.execution-area > p.muted').first().textContent() ?? ''));
  check('the same disk-backed run renders in Chromium through its bounded pages',
    await durableCanvas.locator('.execution-capability').count() >= 3 &&
    await durablePage.getByLabel('All sessions').getByRole('listitem').count() > 0 &&
    await durablePage.getByLabel('All gates').getByRole('listitem').count() > 1);
  await durablePage.getByRole('button', { name: 'Fit', exact: true }).click();
  await durableCanvas.getByRole('button', { name: /review-note, capability/ }).focus();
  await durablePage.keyboard.press('Enter');
  await durablePage.getByLabel('Details for review-note').waitFor();
  check('durable capability detail opens at the exported run version',
    (await durablePage.getByLabel('Details for review-note').innerText()).includes('capability:review-note'));
  await durablePage.screenshot({ path: resolve(artifacts, 'durable-scripted-run-1440x900.png'), fullPage: true });
  check('durable browser page has no exceptions', durableErrors.length === 0);
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  await server.close();
  await writeFile(resolve(artifacts, 'browser-results.json'), JSON.stringify({
    chromium: browserPath, viewports: ['1440x900', '480x700'], checks, failure: failure instanceof Error ? failure.stack : failure ?? null,
    screenshots: ['desktop-initial-1440x900.png', 'desktop-after-now-1440x900.png', 'desktop-1440x900.png', 'desktop-windows-1440x900.png', 'narrow-map-480x700.png', 'narrow-480x700.png', 'durable-scripted-run-1440x900.png'],
    fixtures: { static: 'browser-safe synthetic visual edge cases', durable: { planId: durable.planId, runId: durable.runId,
      pages: durablePages.length, nodes: durableNodes.length, links: durablePages.flatMap(page => page.links).length,
      source: 'scripted agents and Git; exported directly from the completed run protocol query' } },
  }, null, 2) + '\n');
  await rm(durablePath, { force: true });
}
if (failure) throw failure;
process.stdout.write(`Chromium browser acceptance: ${checks.length} checks passed.\n`);
