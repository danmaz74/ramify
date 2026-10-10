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
import { planListResponseSchema, planResponseSchema } from '../../subs/harness/src/interfaces/protocol/queries.js';
import {
  debugExchangeResponseSchema, debugInspectionResponseSchema, debugStateResponseSchema, projectedRunEventSchema, runCommandSchema, runListResponseSchema,
  type RunCommandInput,
} from '../../subs/harness/src/interfaces/protocol/runs.js';
import { z } from 'zod';

/*
 * Chromium witness for Plan 35 (U13): a person drives the engineer
 * breakpoint through the real web UI. The answers are those one scripted
 * breakpoint run gave through the real route handlers, which
 * `execution-breakpoints-http.test.ts` exports when PLAN35_DEBUG_EXPORT
 * names a file; this runner runs that test to export them and never
 * fabricates an answer. The fixture page renders the real App over a stub
 * client that replays them and advances on each command it receives.
 *
 *   npm run test:browser:breakpoint-debugger
 */

const here = dirname(fileURLToPath(import.meta.url));
const agent = resolve(here, '../..');
const fixtureRoot = resolve(agent, 'subs/web/src/tests/browser-acceptance');
const artifacts = resolve(process.env.PLAN35_BROWSER_ARTIFACTS ?? resolve(agent, 'docs/plans/35-breakpoint-debugger-ui/evidence'));
const browserPath = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const testFile = 'subs/harness/src/tests/execution-breakpoints-http.test.ts';
const testName = 'U13: the actual debug answers of one breakpoint run';
const run = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'plan35-debugger-'));
const exported = join(temp, 'plan35-debug-answers.json');
const output = join(temp, 'web');
const checks: string[] = [];
const screenshots: string[] = [];
const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push(name); };
const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: agent })).stdout.trim();
const dirtyAtStart = (await run('git', ['status', '--porcelain', '--', '.'], { cwd: agent })).stdout.trim() !== '';
const viewport = { width: 1280, height: 900 };

/** The exported answers, each validated by its protocol schema. */
const stepSchema = z.object({ debug: debugStateResponseSchema, events: z.array(projectedRunEventSchema) }).strict();
const exportSchema = z.object({
  source: z.string(), planId: z.string(), runId: z.string(), message: z.string(), resume: z.string(),
  before: z.object({ plans: planListResponseSchema, plan: planResponseSchema, runs: runListResponseSchema }).strict(),
  runs: z.object({ paused: runListResponseSchema, ended: runListResponseSchema }).strict(),
  steps: z.object({ paused: stepSchema, admitted: stepSchema, settled: stepSchema, resumed: stepSchema, ended: stepSchema }).strict(),
  inspection: debugInspectionResponseSchema,
  exchanges: z.object({ admitted: debugExchangeResponseSchema, settled: debugExchangeResponseSchema }).strict(),
}).strict();
let failure: unknown;
let fixtureHash: string | null = null;

try {
  await run(resolve(agent, 'node_modules/.bin/vitest'), ['run', testFile, '-t', testName, '--maxWorkers=1'], {
    cwd: agent, env: { ...process.env, PLAN35_DEBUG_EXPORT: exported }, maxBuffer: 8 * 1024 * 1024, timeout: 300_000,
  });
  const fixture = exportSchema.parse(JSON.parse(await readFile(exported, 'utf8')));
  const { planId, runId, steps } = fixture;
  const pause = steps.paused.debug.current!;
  const answer = steps.settled.debug.interventions[0]!.exchange!.answer!;
  check('the export holds the actual paused, admitted, settled, resumed and completed debug answers of one run, each valid',
    pause.state === 'paused' && steps.admitted.debug.current?.state === 'exchanging'
    && steps.settled.debug.interventions[0]?.exchange?.status === 'settled' && steps.resumed.debug.current === null
    && steps.resumed.debug.run.state === 'running' && steps.ended.debug.run.state === 'completed'
    && Object.values(steps).every(entry => entry.debug.run.jobId === runId && entry.debug.run.breakpoint === 'before-agent:engineer'));
  check('the export holds the inspection at the pause and the exchange answers',
    fixture.inspection.inspection.pauseId === pause.pauseId && fixture.inspection.inspection.revision === pause.revision
    && fixture.exchanges.admitted.exchange?.status === 'admitted' && fixture.exchanges.settled.exchange?.answer === answer);
  check('the run list names the breakpoint the run was started with, and was empty before the start',
    fixture.before.runs.runs.length === 0 && fixture.runs.paused.runs.find(entry => entry.jobId === runId)?.breakpoint === 'before-agent:engineer');

  const fixtureBytes = Buffer.from(`${JSON.stringify(fixture, null, 2)}\n`);
  fixtureHash = createHash('sha256').update(fixtureBytes).digest('hex');
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'plan35-debug-answers.json'), fixtureBytes);
  await build({ configFile: false, root: fixtureRoot, base: '/', plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: output, emptyOutDir: true, rollupOptions: { input: resolve(fixtureRoot, 'plan35-debugger.html') } }, logLevel: 'error' });
  await writeFile(join(output, 'plan35-debug-answers.json'), fixtureBytes);

  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = resolve(output, `.${pathname}`);
    if (file !== output && !file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
    try {
      const target = (await stat(file)).isDirectory() ? join(file, 'plan35-debugger.html') : file;
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
    const page: Page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const shot = async (name: string, fullPage = true) => {
      const file = `${name}-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: join(artifacts, file), fullPage });
      screenshots.push(file);
    };
    const commands = async () => await page.evaluate(() => window.plan35.commands()) as RunCommandInput[];
    const calls = async () => await page.evaluate(() => window.plan35.calls());
    const stateLine = page.locator('.debug-state-line');
    const send = page.getByRole('button', { name: 'Send message' });
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    const composer = page.getByLabel('Message to the engineer');
    const identity = { planId, jobId: runId, pauseId: pause.pauseId };

    // The Plan page: check the breakpoint and start.
    await page.goto(`http://127.0.0.1:${address.port}/plan35-debugger.html#/plans/${planId}`, { waitUntil: 'networkidle' });
    await page.locator('.plan-header').getByRole('heading', { level: 1, name: fixture.before.plan.plan.title }).waitFor({ timeout: 10_000 });
    const breakpointBox = page.getByLabel(/Stop before each engineer starts/u);
    check('the Plan page offers the breakpoint unchecked beside the review stop, and the plan has no run yet',
      !(await breakpointBox.isChecked()) && await page.getByText('This plan has no run yet.').isVisible());
    await breakpointBox.check();
    await shot('01-plan-breakpoint-checked');
    await page.getByRole('button', { name: 'Start a run' }).click();
    await page.waitForURL(`**#/plans/${planId}/runs/${runId}`, { timeout: 10_000 });
    let sent = await commands();
    check('Start sends one start-run carrying the breakpoint selector',
      sent.length === 1 && runCommandSchema.safeParse(sent[0]).success && sent[0]!.type === 'start-run'
      && JSON.stringify(sent[0]!.payload) === JSON.stringify({ planId, agent: fixture.before.runs.agent, reviewStop: false, breakpoint: 'before-agent:engineer' }));

    // The Run page: the pause banner and badge.
    const banner = page.getByRole('status', { name: 'Paused at a breakpoint' });
    await banner.waitFor({ timeout: 10_000 });
    const bannerText = await banner.innerText();
    check('the banner names the pause with the harness summary, its pause ID and revision',
      bannerText.includes(pause.summary) && bannerText.includes(`pause ${pause.pauseId}, revision ${pause.revision}`));
    check('the header shows the paused badge and the run page offers a Debugger tab',
      await page.locator('.page-header .badge.debug-paused').innerText() === 'Paused at a breakpoint'
      && await page.getByRole('tab', { name: 'Debugger' }).isVisible());
    await shot('02-paused-banner');

    // The Debugger area: the state and the prepared input.
    await banner.getByRole('button', { name: 'Open the Debugger' }).click();
    check('Open the Debugger selects the Debugger tab', await page.getByRole('tab', { name: 'Debugger' }).getAttribute('aria-selected') === 'true');
    await stateLine.filter({ hasText: 'The run is paused before the engineer starts.' }).waitFor({ timeout: 10_000 });
    const facts = await page.getByLabel('Pause facts').innerText();
    check('the state panel shows the paused state, role, work item, iteration, goal, next action, task state, pause ID and revision with the harness summary',
      [pause.role, pause.work.workItem!, pause.work.iteration!, pause.goal, pause.nextAction, pause.taskState, pause.pauseId].every(text => facts.includes(text))
      && await page.getByLabel('Harness summary').innerText() === pause.summary);
    check('the prepared input is not read before it is requested', !(await calls()).some(call => call.startsWith('getDebugInspection')));
    await page.getByRole('button', { name: 'Read the prepared input' }).click();
    const preview = page.getByLabel('Prepared input preview');
    await preview.getByText(`Read at pause ${pause.pauseId}, revision ${pause.revision}.`).waitFor({ timeout: 10_000 });
    await preview.locator('summary', { hasText: 'Task message' }).click();
    await preview.locator('summary', { hasText: /^Tools/u }).click();
    const { input } = fixture.inspection.inspection;
    const previewText = await preview.innerText();
    check('the prepared input shows the task message and the tools of the actual inspection, read once, as a preview',
      previewText.includes(input.message.split('\n').find(line => line.trim() !== '')!.trim())
      && input.tools.every(tool => previewText.includes(tool.name))
      && (await calls()).filter(call => call === `getDebugInspection:${runId}:${pause.pauseId}`).length === 1
      && await page.getByText('It is not evidence of what the engineer received.', { exact: false }).isVisible());
    await page.getByRole('heading', { name: 'Prepared input' }).scrollIntoViewIfNeeded();
    await shot('03-prepared-input', false);
    // Close the long sections again, so the later full-page screenshots stay readable.
    await preview.locator('summary', { hasText: 'Task message' }).click();
    await preview.locator('summary', { hasText: /^Tools/u }).click();

    // Converse: send a message and read the answer.
    check('Send and Resume are enabled at the paused pending task', await send.isEnabled() && await resume.isEnabled());
    await composer.fill(fixture.message);
    await send.click();
    await page.getByText('The engineer is answering.').waitFor({ timeout: 10_000 });
    sent = await commands();
    check('Send posts one debug-message with a fresh command ID, the current pause ID and revision and the verbatim text',
      sent.length === 2 && runCommandSchema.safeParse(sent[1]).success && sent[1]!.type === 'debug-message' && sent[1]!.commandId !== sent[0]!.commandId
      && JSON.stringify(sent[1]!.payload) === JSON.stringify({ ...identity, expectedRevision: pause.revision, message: fixture.message }));
    check('the admitted message shows in the conversation, the composer is cleared and Send is disabled while the engineer answers',
      (await page.getByLabel('Interventions').innerText()).includes(fixture.message) && await composer.inputValue() === '' && !(await send.isEnabled()));
    await page.getByText('The engineer answered:').waitFor({ timeout: 15_000 });
    const settled = steps.settled.debug.current!;
    await stateLine.filter({ hasText: 'The run is paused before the engineer starts.' }).waitFor({ timeout: 10_000 });
    const conversation = await page.getByLabel('Interventions').innerText();
    check('the settled exchange shows the person\'s text, the engineer\'s actual answer and its transcript chapter link',
      conversation.includes(fixture.message) && conversation.includes(answer)
      && await page.getByRole('link', { name: `Open the transcript chapter (${steps.settled.debug.interventions[0]!.exchange!.invocation})` }).isVisible());
    check('after the answer the pause is at its next revision and the earlier preview is historical',
      (await page.getByLabel('Pause facts').innerText()).includes(String(settled.revision))
      && (await preview.innerText()).includes(`This preview is historical: the current pause is ${settled.pauseId} at revision ${settled.revision}.`));
    await page.getByRole('heading', { name: 'Conversation' }).scrollIntoViewIfNeeded();
    await shot('04-conversation-answer');

    // Resume with a message.
    await composer.fill(fixture.resume);
    await resume.click();
    await stateLine.filter({ hasText: 'The run is working toward its next breakpoint.' }).waitFor({ timeout: 10_000 });
    sent = await commands();
    check('Resume posts one debug-resume with the current pause ID and revision and the text as its message',
      sent.length === 3 && runCommandSchema.safeParse(sent[2]).success && sent[2]!.type === 'debug-resume' && new Set(sent.map(command => command.commandId)).size === 3
      && JSON.stringify(sent[2]!.payload) === JSON.stringify({ ...identity, expectedRevision: settled.revision, message: fixture.resume }));
    const resumeEntry = page.locator('.debug-entry-resume');
    check('after the resume the banner and badge are gone, the resume is listed with its message, and both commands are disabled',
      await banner.count() === 0 && await page.locator('.badge.debug-paused').count() === 0
      && (await resumeEntry.innerText()).includes('Resumed, with this message:') && await resumeEntry.locator('.debug-person').innerText() === fixture.resume
      && !(await send.isEnabled()) && !(await resume.isEnabled()));
    await shot('05-after-resume');

    // The run ends.
    await stateLine.filter({ hasText: 'The run has ended: it is completed.' }).waitFor({ timeout: 15_000 });
    const ended = await page.getByLabel('Interventions').innerText();
    check('the terminal state is shown and the conversation stays readable with Send and Resume disabled',
      ended.includes(fixture.message) && ended.includes(answer) && ended.includes(fixture.resume)
      && !(await send.isEnabled()) && !(await resume.isEnabled()) && await composer.isDisabled());
    const reads = (await calls()).filter(call => call.startsWith('getDebugState')).length;
    await page.waitForTimeout(2_500);
    check('the debugger reads nothing after the run ended, and no other command was sent',
      (await calls()).filter(call => call.startsWith('getDebugState')).length === reads && (await commands()).length === 3);
    await shot('06-terminal');
    check('Chromium reports no page exceptions', errors.length === 0);
    await page.close();
  } finally {
    await browser?.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
} catch (error) {
  failure = error;
} finally {
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'browser-results.json'), JSON.stringify({
    revision, dirtyAtStart, chromium: browserPath, viewport: `${viewport.width}x${viewport.height}`,
    export: { command: `PLAN35_DEBUG_EXPORT=<file> node_modules/.bin/vitest run ${testFile} -t '${testName}' --maxWorkers=1` },
    fixture: fixtureHash === null ? null : { path: 'plan35-debug-answers.json', sha256: fixtureHash,
      source: `${testFile}: one scripted breakpoint run read through the real route handlers, each answer validated by its protocol schema` },
    checks, screenshots, failure: failure instanceof Error ? failure.stack : failure ?? null,
  }, null, 2) + '\n');
  await rm(temp, { recursive: true, force: true });
}
if (failure) throw failure;
process.stdout.write(`Plan 35 breakpoint debugger Chromium witness: ${checks.length} checks passed.\n`);
