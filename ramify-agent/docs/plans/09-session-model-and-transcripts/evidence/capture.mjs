// Plan 9 browser evidence (iteration 11): serves the session fixture, drives
// Chromium through playwright-core, saves the screenshots beside this file and
// writes browser-evidence.json. It never calls a model.
//
// From ramify-agent/, after `npm run build:web`:
//
//   node docs/plans/09-session-model-and-transcripts/evidence/capture.mjs
//
// playwright-core is resolved from the repository root's dependencies, and
// Chromium from RAMIFY_CHROMIUM or /usr/bin/chromium. The script starts
// serve-progress-fixture.ts on free ports, releases the live engineer's steps
// with POST <control>/step from this process (never from the page), and stops
// the server it started by its pid. It fails on any console error or warning,
// any page error, and any page-level horizontal overflow.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../../../..');
const chromiumPath = process.env.RAMIFY_CHROMIUM ?? '/usr/bin/chromium';
const viewports = { desktop: { width: 1440, height: 1000 }, narrow: { width: 390, height: 844 } };

const sleep = ms => new Promise(accept => setTimeout(accept, ms));

async function serveFixture() {
  const scratch = await mkdtemp(join(tmpdir(), 'plan9-evidence-'));
  const out = join(scratch, 'fixture.json');
  const child = spawn(join(packageRoot, 'node_modules/.bin/tsx'),
    ['subs/harness/src/tests/helpers/serve-progress-fixture.ts', '--port', '0', '--control-port', '0', '--out', out],
    { cwd: packageRoot, stdio: ['ignore', 'ignore', 'inherit'] });
  const exited = new Promise(accept => child.once('exit', accept));
  for (let waited = 0; ; waited += 250) {
    const text = await readFile(out, 'utf8').catch(() => null);
    if (text !== null) {
      const fixture = JSON.parse(text);
      const stop = async () => {
        process.kill(fixture.pid, 'SIGTERM');
        const done = await Promise.race([exited.then(() => true), sleep(20_000).then(() => false)]);
        if (!done) child.kill('SIGTERM');
        await rm(scratch, { recursive: true, force: true });
      };
      return { fixture, stop };
    }
    if (child.exitCode !== null || waited > 180_000) throw new Error('the fixture server did not start');
    await sleep(250);
  }
}

/** An element's text, with its text nodes separated by spaces. */
const wordsOf = locator => locator.evaluateAll(elements => elements.map(element => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const words = [];
  while (walker.nextNode()) if (walker.currentNode.textContent.trim() !== '') words.push(walker.currentNode.textContent.trim());
  return words.join(' ');
}));

const controlUrl = (fixture, name) => fixture.control[name].replace(/^(GET|POST) /, '');

async function step(fixture) {
  const response = await fetch(controlUrl(fixture, 'step'), { method: 'POST' });
  const answer = await response.json();
  assert.equal(answer.stepped, true, 'the live engineer has a step left');
  return answer;
}

const { fixture, stop } = await serveFixture();
const browser = await chromium.launch({ executablePath: chromiumPath });
const evidence = {
  schema: 'ramify-agent.session-browser-evidence/1',
  date: new Date().toISOString().slice(0, 10),
  plan: 'Plan 9 session model and transcripts, iteration 11 (acceptance)',
  browser: `Chromium ${browser.version()} via playwright-core`,
  server: 'subs/harness/src/tests/helpers/serve-progress-fixture.ts, serving dist/web',
  viewports,
  console: { errors: [], warnings: [], pageErrors: [] },
  captures: [],
};

try {
  for (const [name, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') evidence.console.errors.push(`${name}: ${message.text()}`);
      if (message.type() === 'warning') evidence.console.warnings.push(`${name}: ${message.text()}`);
    });
    page.on('pageerror', error => evidence.console.pageErrors.push(`${name}: ${error.message}`));
    const bodyRequests = [];
    page.on('request', request => { if (/\/(bodies|files)\b/.test(request.url())) bodyRequests.push(request.url()); });

    async function capture(file, facts, target) {
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert.ok(overflow.scrollWidth <= overflow.clientWidth, `${file}: the page scrolls sideways (${overflow.scrollWidth} > ${overflow.clientWidth})`);
      const path = join(here, `${file}-${name}.png`);
      if (target === undefined) await page.screenshot({ path });
      else await target.screenshot({ path });
      evidence.captures.push({ file: `${file}-${name}.png`, viewport: name, url: page.url().replace(fixture.url, ''), pageWidth: overflow.scrollWidth, ...facts });
    }

    // 1. The Sessions page: live and suspended first, across runs.
    await page.goto(fixture.sessionsPage);
    const live = page.getByRole('region', { name: 'Live and suspended' });
    await live.getByRole('link', { name: 'ses-0004 engineer' }).waitFor();
    const liveEntries = await wordsOf(live.getByRole('listitem'));
    assert.match(liveEntries[0], /ses-0004[\s\S]*live/);
    const finished = page.getByRole('region', { name: 'Finished and interrupted' });
    assert.ok((await finished.getByText('interrupted', { exact: true }).count()) >= 1);
    await capture('sessions-page', { liveAndSuspended: liveEntries.length, total: await page.getByText(/^\d+ sessions\.$/).innerText() });

    // 2. A transcript with a block open: the system prompt, a stored body
    //    fetched on its first expansion.
    await page.goto(`${fixture.sessionRuns.lineage.page}/sessions/ses-0001`);
    const prompt = page.getByRole('button', { name: /^System prompt/ }).first();
    await prompt.waitFor();
    const before = bodyRequests.length;
    assert.equal(await prompt.getAttribute('aria-expanded'), 'false');
    await prompt.click();
    await page.getByText('You are the architect of a Ramify project').first().waitFor();
    assert.equal(await prompt.getAttribute('aria-expanded'), 'true');
    assert.ok(bodyRequests.length > before, 'the body was fetched on expansion');
    await prompt.scrollIntoViewIfNeeded();
    await capture('transcript-block-open', { session: 'lineage ses-0001', opened: 'System prompt', bodyRequests: bodyRequests.length - before });

    // 3. A live transcript receiving entries, before and after two steps.
    await page.goto(fixture.sessionRuns.live.transcript);
    const transcript = page.getByRole('region', { name: 'Transcript of ses-0004' });
    await transcript.getByRole('listitem').first().waitFor();
    await page.getByRole('status', { name: 'Following' }).waitFor();
    await transcript.scrollIntoViewIfNeeded();
    const entriesBefore = await transcript.getByRole('listitem').count();
    await capture('live-transcript-before', { entries: entriesBefore });
    const released = [await step(fixture), await step(fixture)].at(-1).released;
    await page.waitForFunction(count => document.querySelectorAll('.transcript li').length > count, entriesBefore, { timeout: 10_000 });
    await sleep(1500);
    const entriesAfter = await transcript.getByRole('listitem').count();
    await capture('live-transcript-after', { entries: entriesAfter, stepsReleased: released });

    // 4. Both progress diagrams on the live run, with marks, the side panel's
    //    session list and the run-level strip.
    await page.goto(fixture.sessionRuns.live.page);
    await page.getByRole('tab', { name: 'Progress' }).click();
    await page.getByRole('tab', { name: 'By module' }).click();
    const shared = page.getByRole('treeitem', { name: /shared-ui, 2 capability rows, sessions: 1 live \(engineer\), 1 suspended/ });
    await shared.waitFor();
    const strip = page.getByRole('region', { name: 'Sessions without an element here' });
    assert.ok(await strip.getByRole('link', { name: 'ses-0001 initial-architect' }).isVisible());
    await shared.locator('.capability-module-heading').click();
    const moduleSessions = page.getByRole('region', { name: /^Sessions of / });
    await moduleSessions.waitFor();
    const moduleList = await wordsOf(moduleSessions.getByRole('listitem'));
    assert.match(moduleList[0], /ses-0004[\s\S]*live[\s\S]*inv-0005/);
    // The tree is fitted to its canvas; zoom in at the marked module and
    // drag it to the middle, as a person would, so its marks can be read.
    const canvas = page.locator('.capability-module-canvas');
    await canvas.scrollIntoViewIfNeeded();
    for (let times = 0; times < 20; times += 1) {
      const box = await shared.boundingBox();
      if (box.width >= Math.min(360, viewport.width * 0.8)) break;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -100);
      await sleep(200);
    }
    const frame = await canvas.boundingBox();
    const node = await shared.boundingBox();
    const grip = { x: frame.x + 12, y: frame.y + 12 };
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x + frame.x + frame.width / 2 - (node.x + node.width / 2), grip.y + frame.y + frame.height / 2 - (node.y + node.height / 2), { steps: 10 });
    await page.mouse.up();
    await sleep(300);
    await capture('progress-by-module', { marked: await shared.getAttribute('aria-label'), strip: 'ses-0001 suspended' });
    await capture('progress-by-module-panel', { sessions: moduleList }, page.getByRole('complementary'));

    await page.getByRole('tab', { name: 'Dependencies' }).click();
    const badge = page.getByRole('button', { name: /^badge-tone, working, entry, sessions: 1 live \(engineer\), 1 suspended/ });
    await badge.waitFor();
    await badge.click();
    const capabilitySessions = page.getByRole('region', { name: /^Sessions of / });
    await capabilitySessions.waitFor();
    const capabilityList = await wordsOf(capabilitySessions.getByRole('listitem'));
    assert.match(capabilityList[0], /ses-0004[\s\S]*live/);
    await badge.scrollIntoViewIfNeeded();
    await capture('progress-dependencies', { marked: await badge.getAttribute('aria-label') });
    await capabilitySessions.scrollIntoViewIfNeeded();
    await capture('progress-dependencies-panel', { sessions: capabilityList });

    // 5. The lineage timeline: the lineage run, then the live run.
    await page.goto(fixture.sessionRuns.lineage.page);
    await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
    const lanes = page.getByRole('group', { name: /^ses-\d{4} / });
    await lanes.first().waitFor();
    const drawn = {
      lanes: await lanes.count(),
      segments: await page.locator('.timeline-surface a[href*="/chapters/"]').count(),
      appends: await page.locator('.timeline-surface a[href*="/appends/"]').count(),
      forks: await page.locator('.timeline-link-fork').count(),
      replacements: await page.locator('.timeline-link-replace').count(),
      requests: await page.locator('.timeline-link-request').count(),
      degraded: await page.locator('.timeline-segment-degraded').count(),
    };
    for (const [key, count] of Object.entries(drawn)) assert.ok(count > 0, `the lineage timeline draws ${key}`);
    await page.getByRole('region', { name: 'Session timeline' }).scrollIntoViewIfNeeded();
    await capture('timeline-lineage', drawn);
    // The replacement lies further along the run: scroll the timeline's own
    // frame to it.
    const scrolled = await page.locator('.timeline-scroll').evaluate(frame => {
      const link = frame.querySelector('.timeline-link-replace').getBBox();
      frame.scrollLeft = Math.max(0, link.x - frame.clientWidth / 3);
      return { from: link.x, scrollLeft: frame.scrollLeft };
    });
    await sleep(200);
    await capture('timeline-lineage-replacement', scrolled);

    await page.goto(fixture.sessionRuns.live.page);
    await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
    const awaited = page.getByRole('link', { name: /^Chapter 1 of ses-0004: inv-0005, opened fresh, awaited/ });
    await awaited.waitFor();
    await page.getByRole('region', { name: 'Session timeline' }).scrollIntoViewIfNeeded();
    await capture('timeline-live', { lanes: await lanes.count(), awaited: await awaited.getAttribute('aria-label') ?? await awaited.innerText() });

    await context.close();
  }

  assert.deepEqual(evidence.console, { errors: [], warnings: [], pageErrors: [] }, 'no console error, warning or page error');
  await writeFile(join(here, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${evidence.captures.length} captures, no console error or warning, no page-level horizontal overflow.`);
} finally {
  await browser.close();
  await stop();
}
