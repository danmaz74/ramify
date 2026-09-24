import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright-core';

/*
 * The browser witness of Plan 12's CheckFinding pages. It serves one live
 * scripted run through the real harness server and the built web client
 * (`subs/harness/src/tests/helpers/serve-check-findings-fixture.ts`), and
 * drives Chromium through it: the overview's per-module counts and decision
 * notice, a work item's review coverage and requests, its CheckFindings in
 * the harness's order, the settled toggle, a person's waiver, the
 * revocation of an agent's waiver and the answer to a pending decision, each
 * through the page's own forms and the real command endpoint; then the run
 * completes and the page shows the settled and unresolved signals and their
 * history. While the decision is pending, the run page's banner, the header,
 * the tab title, the plans list and the plan's run list say the run waits
 * for the person; after the answer every one of those marks is gone. No
 * model is called. Screenshots and the checks go to the plan's
 * evidence directory.
 *
 *   npm run build:web
 *   npm run test:browser:check-findings
 */

const here = dirname(fileURLToPath(import.meta.url));
const agent = resolve(here, '../..');
const artifacts = resolve(agent, 'docs/plans/12-check-findings/evidence');
const browserPath = process.env['CHROMIUM_PATH'] ?? '/usr/bin/chromium';
const checks: string[] = [];
const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push(name); };

if (!existsSync(resolve(agent, 'dist/web/index.html'))) throw new Error('The web client is not built; run `npm run build:web` first.');
await mkdir(artifacts, { recursive: true });
const out = join(tmpdir(), `check-findings-fixture-${process.pid}.json`);
await rm(out, { force: true });
const fixture = spawn(resolve(agent, 'node_modules/.bin/tsx'), ['subs/harness/src/tests/helpers/serve-check-findings-fixture.ts', '--out', out], {
  cwd: agent, stdio: ['ignore', 'ignore', 'inherit'],
});
const served = await (async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (fixture.exitCode !== null) throw new Error(`The fixture server exited with ${fixture.exitCode}`);
    if (existsSync(out)) {
      try {
        return JSON.parse(await readFile(out, 'utf8')) as { url: string; planId: string; runId: string; page: string };
      } catch { /* still being written */ }
    }
    await new Promise(settle => setTimeout(settle, 200));
  }
  throw new Error('The fixture server did not become ready');
})().catch((error: unknown) => { fixture.kill('SIGTERM'); throw error; });

const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
const screenshots: string[] = [];
const shoot = async (page: Page, name: string) => { await page.screenshot({ path: resolve(artifacts, name), fullPage: true }); screenshots.push(name); };
let failure: unknown;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const plans = `${served.url}/#/`;
  const plan = `${served.url}/#/plans/${encodeURIComponent(served.planId)}`;
  const waitingLabel = 'Waiting for your decision';

  // Before the run page: the plans list and the plan's run list say the run waits for the person.
  await page.goto(plans, { waitUntil: 'networkidle' });
  const planWaits = page.getByRole('list', { name: `Runs of ${served.planId} waiting for your decision` });
  await planWaits.waitFor();
  check('the plans list marks the plan whose run waits for the person\'s decision, linking the run',
    await planWaits.getByRole('link', { name: `run ${served.runId}` }).count() === 1 && await planWaits.getByText(waitingLabel).count() === 1);
  const headerWait = page.getByRole('status', { name: waitingLabel });
  await headerWait.waitFor();
  check('the header names the waiting run on every page, and the tab title says so',
    (await headerWait.innerText()).includes(served.runId) && (await page.title()).startsWith(`${waitingLabel} · `));
  await page.goto(plan, { waitUntil: 'networkidle' });
  const runRow = page.locator('.run-list li').filter({ hasText: served.runId });
  await runRow.waitFor();
  check('the plan\'s run list gives the waiting run its own badge beside its running state',
    await runRow.locator('.badge.awaiting-decision').innerText() === waitingLabel && await runRow.locator('.run-state').innerText() === 'running');
  await shoot(page, 'plan-waiting-1440x900.png');

  await page.goto(served.page, { waitUntil: 'networkidle' });
  const banner = page.locator('.run-page').getByRole('status', { name: waitingLabel });
  await banner.waitFor();
  check('the run page\'s banner, above every area, names the held work item and its request',
    (await banner.innerText()).includes('Work item wi-001') && (await banner.innerText()).includes('There is no time limit.'));

  // The overview: per-module counts and the notice that a decision is requested.
  const modules = page.getByRole('table', { name: 'CheckFindings by module' });
  await modules.waitFor();
  check('the overview lists the notes module with its unsettled CheckFindings',
    (await modules.innerText()).includes('collection-review/workspace/reviews/notes'));
  check('the overview says a decision is requested of the person',
    await page.getByText('A decision is requested of you.').count() === 1);
  await shoot(page, 'overview-1440x900.png');

  // The banner opens the work item and brings the request into view: its review coverage and requests.
  await banner.getByRole('button', { name: /^answer cfd-/u }).click();
  const itemMark = page.locator('.run-list li').filter({ hasText: 'wi-001' }).locator('.badge.awaiting-decision');
  await itemMark.waitFor();
  check('the banner opens the Work items area with the waiting work item marked',
    await page.getByRole('tab', { name: 'Work items' }).getAttribute('aria-selected') === 'true' && await itemMark.innerText() === waitingLabel);
  const right = async (selector: string) => { const box = await page.locator(selector).boundingBox(); return box ? box.x + box.width : 0; };
  check('the run\'s header and tab bar span at least the broad Work items area, so its state badge is not mid-page',
    await right('.run-page > .page-header') >= await right('.run-page > .area-broad') &&
    await right('.run-page > .tabs') >= await right('.run-page > .area-broad'));
  const item = page.getByRole('region', { name: 'CheckFindings of wi-001' });
  const coverage = item.getByLabel('Review coverage');
  await coverage.waitFor();
  check('review coverage is partial, never clean, with its counts',
    (await coverage.innerText()).includes('Review coverage partial: 8 complete, 1 partial, 0 not verified, 0 pending, of 9 requested'));
  // The section is not styled as a failure (it once shared the class of a transcript's hook-check badge).
  check('the work item\'s CheckFinding section is not painted as a failure',
    await item.evaluate(section => getComputedStyle(section).backgroundColor) === 'rgba(0, 0, 0, 0)');
  const requests = item.getByRole('table', { name: 'Review requests' });
  check('nine review requests, three questions per candidate', await requests.locator('tbody tr').count() === 9);
  check('the partial scope review names what it did not inspect',
    (await requests.locator('tbody tr').filter({ hasText: 'rq-0005' }).innerText()).includes('partial: 1 path not inspected'));
  check('a concern-raising review is complete with its concern',
    (await requests.locator('tbody tr').filter({ hasText: 'rq-0001' }).innerText()).includes('complete, 1 concern'));

  // The CheckFindings: the open one and the reported material choice by default.
  const card = (id: string): Locator => item.getByRole('listitem', { name: `CheckFinding ${id}` });
  await card('cf-0001').waitFor();
  check('by default: the open signal and the reported material choice, not the deferral',
    await card('cf-0001').count() === 1 && await card('cf-0003').count() === 1 && await card('cf-0002').count() === 0);
  const decision = card('cf-0001').getByRole('group', { name: 'Decision requested' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Decision requested', null, { timeout: 5_000 });
  check('the banner\'s request takes the focus', await decision.evaluate(element => element === document.activeElement));
  await shoot(page, 'run-waiting-1440x900.png');
  check('the decision request quotes the conflicting plan text with its revision',
    (await decision.getByRole('list', { name: 'Conflicting text' }).innerText()).match(/A note belongs to exactly one review run\.\s*plan at sha256:/u) !== null);
  check('a risk level is a badge, not a decision request',
    await card('cf-0003').getByText('low risk').count() === 1 && await card('cf-0003').getByRole('group', { name: 'Decision requested' }).count() === 0);
  check('the material choice and the agent\'s waiver are separate elements',
    (await card('cf-0003').getByRole('group', { name: 'Material choice' }).innerText()).includes('The store stays a Map.') &&
    (await card('cf-0003').getByRole('group', { name: 'Waiver' }).innerText()).includes('Waived by local-architect'));
  await item.getByLabel('Show settled signals').check();
  await card('cf-0002').waitFor();
  check('the settled toggle shows the deferral with its revisit condition',
    (await card('cf-0002').getByRole('group', { name: 'Deferral' }).innerText()).includes('Revisit: When a caller needs a byte limit.'));
  check('the list is in attention order: high, medium, low',
    (await item.getByRole('listitem').filter({ hasText: /^.*cf-000\d/u }).allInnerTexts()).map(text => /cf-000\d/u.exec(text)?.[0]).join(',') === 'cf-0001,cf-0002,cf-0003');
  await shoot(page, 'work-item-waiting-1440x900.png');

  // A person waives the deferred signal through the page's form.
  await card('cf-0002').getByRole('button', { name: 'Waive…' }).click();
  const waive = card('cf-0002').getByRole('form', { name: 'Waive of cf-0002' });
  await waive.getByLabel('Your name').fill('dana');
  await waive.getByLabel('Reason').fill('Byte limits are outside this plan.');
  await waive.getByRole('button', { name: 'Waive', exact: true }).click();
  await card('cf-0002').getByRole('group', { name: 'Waiver' }).getByText('Waived by dana').waitFor({ timeout: 15_000 });
  check('the person\'s waiver is recorded with the person as its actor', true);

  // The person revokes the agent's waiver, which opens the signal again.
  await card('cf-0003').getByRole('button', { name: 'Revoke the waiver…' }).click();
  const revoke = card('cf-0003').getByRole('form', { name: 'Revoke the waiver of cf-0003' });
  await revoke.getByLabel('Your name').fill('dana');
  await revoke.getByLabel('Reason').fill('A Map is not what the plan describes.');
  await revoke.getByRole('button', { name: 'Revoke the waiver', exact: true }).click();
  await card('cf-0003').getByLabel('Standing').getByText(/^Open/u).waitFor({ timeout: 15_000 });
  check('the revoked waiver opens the signal again, and the history keeps it', true);

  // The person answers the decision; the next round assesses the answer and the run completes.
  await decision.getByLabel(/Keep one note per review run/u).check();
  await decision.getByLabel('Your name').fill('dana');
  await decision.getByLabel('Note (optional)').fill('The plan stands.');
  await decision.getByRole('button', { name: 'Answer' }).click();
  await page.getByText('completed', { exact: true }).first().waitFor({ timeout: 30_000 });
  await banner.waitFor({ state: 'detached', timeout: 15_000 });
  check('after the answer the run page shows no banner and no waiting mark',
    await page.locator('.awaiting-decision').count() === 0);
  await card('cf-0001').getByRole('group', { name: 'Waiver' }).waitFor({ timeout: 15_000 });
  check('the answered decision is settled by the next round under the person\'s choice',
    (await card('cf-0001').getByLabel('Standing').innerText()).startsWith('Waived') &&
    await card('cf-0001').getByRole('group', { name: 'Decision requested' }).count() === 0);
  const unresolved = card('cf-0003').getByLabel('Unresolved');
  await unresolved.waitFor({ timeout: 15_000 });
  check('the reopened low-risk signal is left unresolved below the floor, without the latest-review marker',
    (await unresolved.innerText()).includes('below the last round\'s floor') && await card('cf-0003').locator('.unresolved-latest').count() === 0);
  check('a completed run offers no command', await item.getByRole('button', { name: /Waive…|Revoke the waiver…/u }).count() === 0);
  await card('cf-0001').getByRole('button', { name: 'History' }).click();
  const history = card('cf-0001').getByLabel('History of cf-0001');
  await history.waitFor();
  const historyText = await history.innerText();
  check('the history shows the report, the request, the person\'s answer and the waiver with their actors',
    historyText.includes('A review run should keep several notes') && historyText.includes('by dana') && historyText.includes('by local-architect'));
  const attempt = await history.locator('.attempt-link').first().innerText();
  check('the report names its review attempt, request, iteration and candidate diff, and links the reader\'s session',
    attempt.includes('Review rq-0001.a01 of request rq-0001 on iteration wi-001.i01') && attempt.includes('Candidate diff:') &&
    await history.locator('.attempt-link').first().getByRole('link', { name: /^ses-/u }).count() === 1);
  await shoot(page, 'work-item-completed-1440x900.png');

  // Every other mark goes as well: the header, the tab title, the plans list and the run list.
  await page.goto(plans, { waitUntil: 'networkidle' });
  await page.locator('.plan-list').waitFor();
  await page.waitForFunction(label => !document.title.startsWith(label), waitingLabel, { timeout: 15_000 });
  check('after the answer the plans list, the header and the tab title no longer say the run waits',
    await page.getByRole('status', { name: waitingLabel }).count() === 0 && await page.locator('.plan-waits').count() === 0);
  await page.goto(plan, { waitUntil: 'networkidle' });
  await page.locator('.run-list li').filter({ hasText: served.runId }).waitFor();
  check('after the answer the plan\'s run list shows the completed run without the badge',
    await page.locator('.run-list li').filter({ hasText: served.runId }).locator('.badge.awaiting-decision').count() === 0);
  await page.goto(served.page, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Work items' }).click();
  await page.getByRole('button', { name: 'wi-001', exact: true }).click();
  await card('cf-0003').waitFor();

  await page.setViewportSize({ width: 480, height: 800 });
  await card('cf-0003').scrollIntoViewIfNeeded();
  check('narrow 480x800: the cards fit the viewport', (await card('cf-0003').boundingBox())!.width <= 480);
  await shoot(page, 'work-item-narrow-480x800.png');
  check('no browser exceptions', errors.length === 0);
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  fixture.kill('SIGTERM');
  await rm(out, { force: true });
  await writeFile(resolve(artifacts, 'browser-results.json'), JSON.stringify({
    chromium: browserPath, viewports: ['1440x900', '480x800'], checks, screenshots,
    failure: failure instanceof Error ? failure.stack : failure ?? null,
    fixture: { planId: served.planId, runId: served.runId,
      source: 'one live run of scripted agents, scripted Git answers and scripted candidates, served by the real harness server with the built web client; commands sent through the page\'s own forms' },
  }, null, 2) + '\n');
}
if (failure) throw failure;
process.stdout.write(`Chromium CheckFinding acceptance: ${checks.length} checks passed.\n`);
