import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright-core';
import { startCliServer, type CliServer } from '../../subs/harness/src/http/server.js';
import { protocolPaths } from '../../subs/harness/src/interfaces/protocol/paths.js';
import { gateViewSchema, type GateView, type ObligationView } from '../../subs/harness/src/interfaces/protocol/runs.js';

/*
 * Browser witness for Plan 21 iteration 11: the real web client served by
 * the harness server, started as `ramify-agent serve` starts it, over the
 * projects that the F5 workflows in `plan21-workflows.integration.test.ts`
 * leave behind. Nothing here is a
 * fixture: each run, gate, obligation, capability task and transcript was
 * produced by production wiring with scripted agents and the installed
 * providers. At desktop and narrow widths it reads the ordinary run's failing
 * nested final audit and its repaired passing one, the registered obligations
 * with their reports and where hints, an architect's brief, an engineer's
 * post-write dispositions, the capability task's handback report and the
 * standalone session's refused write and dispositions, and compares each
 * projection with the harness's own protocol answer.
 *
 *   npm run build:web
 *   npx tsx scripts/browser-acceptance/plan21-workflows.ts
 *
 * Without PLAN21_ITERATION11_PROJECTS naming kept projects (w1, w2, w3), it
 * runs the workflow test to keep them.
 */

const here = dirname(fileURLToPath(import.meta.url));
const agent = resolve(here, '../..');
const artifacts = resolve(process.env['PLAN21_ITERATION11_BROWSER_ARTIFACTS']
  ?? resolve(agent, 'docs/plans/21-project-boundary-adoption/evidence/iteration11-browser'));
const assets = resolve(agent, 'dist/web');
const browserPath = process.env['CHROMIUM_PATH'] ?? '/usr/bin/chromium';
const run = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'plan21-workflows-'));
const projects = process.env['PLAN21_ITERATION11_PROJECTS'] ?? join(temp, 'projects');
const checks: string[] = [];
const screenshots: string[] = [];
const observed: Record<string, unknown> = {};
const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push(name); };
const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: agent })).stdout.trim();
const dirtyAtStart = (await run('git', ['status', '--porcelain', '--', '.'], { cwd: agent })).stdout.trim() !== '';
const viewports = { desktop: { width: 1440, height: 900 }, narrow: { width: 480, height: 700 } } as const;
let failure: unknown;

interface JobFacts { readonly plan: string; readonly run: string; readonly finalGate: string; readonly terminal: string; readonly directory: string }

/** A kept project's runs of one plan, oldest first, with each one's final gate and terminal event. */
async function jobsOf(root: string, plan: string): Promise<JobFacts[]> {
  const base = join(root, 'plans', plan, '.harness', 'jobs');
  const facts: JobFacts[] = [];
  for (const id of (await readdir(base)).sort()) {
    const events = (await readFile(join(base, id, 'events.jsonl'), 'utf8')).trim().split('\n')
      .map(line => (JSON.parse(line) as { event: { type: string; data: Record<string, unknown> } }).event);
    const final = events.filter(event => event.type === 'gate-attempted' && event.data['checkpoint'] === 'final').at(-1);
    const terminal = events.filter(event => event.type === 'job-completed' || event.type === 'job-failed').at(-1);
    assert.ok(final && terminal, `run ${id} has a final gate and a terminal event`);
    facts.push({ plan, run: id, finalGate: String(final.data['gate']), terminal: terminal.type, directory: join(base, id) });
  }
  return facts;
}

/** The first session of a run whose stored transcript names every given text. */
async function sessionNaming(job: JobFacts, ...texts: string[]): Promise<string> {
  for (const file of (await readdir(join(job.directory, 'transcripts'))).sort()) {
    const body = await readFile(join(job.directory, 'transcripts', file), 'utf8');
    if (texts.every(text => body.includes(text))) return file.replace(/\.jsonl$/u, '');
  }
  throw new Error(`No session of ${job.run} names ${texts.join(', ')}`);
}

async function api<T>(server: CliServer, path: string): Promise<T> {
  const response = await fetch(`${server.url}${path}`);
  assert.equal(response.status, 200, `${path} answers 200`);
  return await response.json() as T;
}

/** The page's own width holds its content: nothing scrolls sideways. */
async function noSidewaysScroll(page: Page): Promise<boolean> {
  return await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** The line the gate panel prints for one recorded project. */
function projectLine(project: NonNullable<NonNullable<GateView['audit']>['projects']>[number]): string {
  return `${project.projectRoot}: ${project.verdict}, ${project.execution}${project.executedMode === null ? '' : `, executed ${project.executedMode}`}`
    + `${project.status === 'completed' ? '' : ` (${project.status}: ${project.detail})`}`;
}

try {
  if (!existsSync(join(assets, 'index.html'))) throw new Error('The web client is not built; run `npm run build:web` first.');
  if (process.env['PLAN21_ITERATION11_PROJECTS'] === undefined) {
    await run(resolve(agent, 'node_modules/.bin/vitest'), ['run', 'subs/harness/src/tests/plan21-workflows.integration.test.ts', '--maxWorkers=1'], {
      cwd: agent, env: { ...process.env, PLAN21_ITERATION11_PROJECTS: projects }, maxBuffer: 16 * 1024 * 1024, timeout: 1_200_000,
    });
  }
  await mkdir(artifacts, { recursive: true });
  const w1 = await jobsOf(join(projects, 'w1'), 'review-notes');
  const w2 = await jobsOf(join(projects, 'w2'), 'need');
  check('the kept projects hold the failed and the repaired ordinary runs and the completed capability run',
    w1.length === 2 && w1[0]!.terminal === 'job-failed' && w1[1]!.terminal === 'job-completed'
    && w2.length === 1 && w2[0]!.terminal === 'job-completed');
  const [failed, repaired] = [w1[0]!, w1[1]!];
  const capability = w2[0]!;
  const engineerSession = await sessionNaming(failed, '"role":"engineer"', 'tmp/draft.txt', 'not-analyzed');
  const architectSession = await sessionNaming(repaired, '"role":"local-architect"', '(scenario): bound, revision');
  const standaloneDirectory = join(projects, 'w3', 'plans', '.harness', 'sessions');
  const standalone = existsSync(standaloneDirectory) ? (await readdir(standaloneDirectory)).sort().at(-1) : undefined;
  if (standalone === undefined) throw new Error(`The standalone project keeps no session under ${standaloneDirectory}`);
  observed['runs'] = { failed: failed.run, repaired: repaired.run, capability: capability.run, engineerSession, architectSession, standalone };

  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  const servers: Record<string, CliServer> = {};
  try {
    for (const name of ['w1', 'w2', 'w3']) servers[name] = await startCliServer({ projectRoot: join(projects, name), port: 0, assetsDirectory: assets });
    const gateOf = async (server: CliServer, job: JobFacts) =>
      gateViewSchema.parse((await api<{ gate: unknown }>(server, protocolPaths.runGate(job.plan, job.run, job.finalGate))).gate);
    const obligationsOf = async (server: CliServer, job: JobFacts) =>
      (await api<{ obligations: ObligationView[] }>(server, protocolPaths.runScenarios(job.plan, job.run))).obligations;
    const recorded = {
      failedGate: await gateOf(servers['w1']!, failed), repairedGate: await gateOf(servers['w1']!, repaired),
      capabilityGate: await gateOf(servers['w2']!, capability),
      failedObligations: await obligationsOf(servers['w1']!, failed), repairedObligations: await obligationsOf(servers['w1']!, repaired),
      capabilityObligations: await obligationsOf(servers['w2']!, capability),
    };
    observed['recorded'] = {
      gates: Object.fromEntries((['failedGate', 'repairedGate', 'capabilityGate'] as const).map(key => [key,
        { id: recorded[key].id, verdict: recorded[key].verdict, nested: recorded[key].audit?.nested ?? null, projects: (recorded[key].audit?.projects ?? []).map(projectLine) }])),
      obligations: Object.fromEntries((['failedObligations', 'repairedObligations', 'capabilityObligations'] as const).map(key => [key,
        recorded[key].map(item => ({ id: item.id, status: item.status, fakes: item.binding?.fakes ?? null, report: item.report?.judgment ?? null, where: item.report?.where ?? null }))])),
    };
    check('the failing final audit is nested with a passing root and a failing report project',
      recorded.failedGate.audit?.nested === true && recorded.failedGate.verdict === 'failed'
      && recorded.failedGate.audit.projects?.some(project => project.projectRoot === '.' && project.verdict === 'pass') === true
      && recorded.failedGate.audit.projects?.some(project => project.projectRoot.endsWith('/report') && project.verdict === 'fail') === true);
    check('the repaired and the capability final audits pass every project',
      [recorded.repairedGate, recorded.capabilityGate].every(gate => gate.verdict === 'passed' && gate.audit?.nested === true
        && (gate.audit.projects ?? []).length > 0 && (gate.audit.projects ?? []).every(project => project.verdict === 'pass')));

    for (const [width, viewport] of Object.entries(viewports)) {
      const size = `${viewport.width}x${viewport.height}`;
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const shot = async (name: string, target?: Locator) => {
        const file = `iteration11-${name}-${width}-${size}.png`;
        await target?.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(artifacts, file), fullPage: true });
        screenshots.push(file);
      };
      const openRun = async (server: CliServer, job: JobFacts) => {
        await page.goto(`${server.url}/#/plans/${encodeURIComponent(job.plan)}/runs/${encodeURIComponent(job.run)}`, { waitUntil: 'networkidle' });
        await page.getByRole('tab', { name: 'Checks' }).waitFor({ timeout: 15_000 });
      };
      const openGate = async (gate: GateView) => {
        await page.getByRole('tab', { name: 'Checks' }).click();
        await page.getByRole('button', { name: gate.id, exact: true }).click();
        const panel = page.getByLabel(`Gate ${gate.id}`);
        await panel.getByLabel('Audited projects').waitFor({ timeout: 15_000 });
        return panel;
      };
      const projectLines = async (panel: Locator) =>
        (await panel.getByLabel('Audited projects').locator(':scope > li > p:first-child').allInnerTexts()).map(line => line.trim());
      const obligationRows = async (obligations: readonly ObligationView[]) => {
        await page.getByRole('tab', { name: 'Scenarios' }).click();
        const list = page.getByLabel('Registered obligations');
        await list.waitFor({ timeout: 15_000 });
        const rows: Record<string, string> = {};
        for (const obligation of obligations) rows[obligation.id] = await list.getByLabel(`Obligation ${obligation.id}`).innerText();
        return { list, rows, outstanding: await list.getByLabel('Outstanding reports').innerText() };
      };
      /** Each obligation's row says its recorded status, fakes, report and where hint, and nothing else claims done. */
      const matches = (obligation: ObligationView, row: string) =>
        row.startsWith(obligation.id) && row.includes(` ${obligation.status} `)
        && (obligation.binding === null ? row.includes('not bound') : obligation.binding.fakes.every(fake => row.includes(fake)))
        && (obligation.report === null ? row.includes('no architect report yet')
          : row.includes(`architect report ${obligation.report.judgment} by ${obligation.report.invocation}`)
            && (obligation.report.where === null ? !row.includes('where:') : row.includes(`where: ${obligation.report.where}`)));

      // W1, first run: the iteration repaired, then the nested final audit failed on the report project.
      await openRun(servers['w1']!, failed);
      let panel = await openGate(recorded.failedGate);
      let lines = await projectLines(panel);
      check(`${width}: the failing final audit shows each recorded project's own verdict and execution`,
        JSON.stringify(lines) === JSON.stringify((recorded.failedGate.audit?.projects ?? []).map(projectLine)));
      const failedProject = recorded.failedGate.audit!.projects!.find(project => project.verdict === 'fail')!;
      check(`${width}: the failing project's failures and record are shown`,
        (await panel.getByLabel(`Failures of ${failedProject.projectRoot}`).innerText()).includes('report-limit')
        && failedProject.evidence !== null && (await panel.getByLabel('Configured audit').innerText()).includes(failedProject.evidence.reportCommit));
      check(`${width}: the failing audit fits the page width`, await noSidewaysScroll(page));
      await shot('w1-failed-final-gate', panel.getByLabel('Audited projects'));
      let obligations = await obligationRows(recorded.failedObligations);
      check(`${width}: the failed run lists its registered test and scenario with their done reports and where hints`,
        recorded.failedObligations.length === 2 && recorded.failedObligations.every(item => matches(item, obligations.rows[item.id]!))
        && obligations.outstanding === "Every obligation has its architect's done report.");
      check(`${width}: the declarations stay done although the final audit failed`,
        recorded.failedObligations.every(item => item.status === 'done') && recorded.failedGate.verdict === 'failed');
      check(`${width}: the obligation list fits the page width`, await noSidewaysScroll(page));
      await shot('w1-failed-obligations', obligations.list);

      // The engineer's post-write dispositions in the failed run.
      await page.goto(`${servers['w1']!.url}/#/plans/review-notes/runs/${encodeURIComponent(failed.run)}/sessions/${engineerSession}`, { waitUntil: 'networkidle' });
      const dispositions = page.getByLabel('Path dispositions');
      await dispositions.first().waitFor({ timeout: 15_000 });
      const rows = (await dispositions.locator(':scope > li').allInnerTexts()).map(row => row.trim());
      observed[`${width}-engineer-dispositions`] = rows;
      check(`${width}: the engineer's writes keep their dispositions: source checked, scratch not analyzed without a passing label`,
        rows.some(row => row.startsWith('checked ') && row.includes('notes'))
        && rows.some(row => row.startsWith('not-analyzed ') && row.includes('tmp/draft.txt') && row.includes('scratch'))
        && rows.filter(row => row.startsWith('not-analyzed')).every(row => !/pass/u.test(row)));
      check(`${width}: the transcript fits the page width`, await noSidewaysScroll(page));
      await shot('w1-engineer-dispositions', dispositions.first());

      // W1, repaired run: the brief an architect read, and the passing nested audit.
      await page.goto(`${servers['w1']!.url}/#/plans/review-notes/runs/${encodeURIComponent(repaired.run)}/sessions/${architectSession}`, { waitUntil: 'networkidle' });
      // Each brief is a user message, collapsed to its first line until opened.
      const briefs = page.getByRole('button', { name: /^User text/u });
      await briefs.first().waitFor({ timeout: 15_000 });
      for (const header of await briefs.all()) if (await header.getAttribute('aria-expanded') === 'false') await header.click();
      const brief = page.locator('.block-body').filter({ hasText: /sc-001 \(scenario\): bound, revision \d+;/u }).first();
      await brief.waitFor({ timeout: 15_000 });
      const briefText = await brief.innerText();
      observed[`${width}-architect-brief`] = briefText.split('\n').filter(line => /^- (sc|test)-\d+ /u.test(line));
      check(`${width}: the architect's brief lists each obligation with its state and report revision`,
        /- sc-001 \(scenario\): bound, revision \d+;/u.test(briefText) && /- test-001 \(registered test: The notes test states the plan limit\): \w+, revision \d+;/u.test(briefText));
      check(`${width}: the brief fits the page width`, await noSidewaysScroll(page));
      await shot('w1-architect-brief', brief);
      await openRun(servers['w1']!, repaired);
      panel = await openGate(recorded.repairedGate);
      lines = await projectLines(panel);
      check(`${width}: the repaired final audit passes the root and the report project`,
        JSON.stringify(lines) === JSON.stringify((recorded.repairedGate.audit?.projects ?? []).map(projectLine))
        && lines.some(line => /report: pass, (ran|reused)/u.test(line)));
      await shot('w1-repaired-final-gate', panel.getByLabel('Audited projects'));
      obligations = await obligationRows(recorded.repairedObligations);
      check(`${width}: the repaired run's obligations match the recorded bindings and reports`,
        recorded.repairedObligations.every(item => matches(item, obligations.rows[item.id]!)));

      // W2: the capability task's handback report and the consumer's own report.
      await openRun(servers['w2']!, capability);
      await page.getByRole('tab', { name: 'Capability tasks' }).click();
      const task = page.getByLabel('Capability task cap-001');
      await task.waitFor({ timeout: 15_000 });
      const reports = await task.getByLabel('Architect reports of cap-001').innerText();
      const taskText = await task.innerText();
      check(`${width}: the capability task shows the coordinator's done report with its where hint and the accepted handback`,
        reports.includes('done') && reports.includes('where: subs/b/src/tests/fact.test.ts')
        && taskText.includes("Handed back on the architect's report: cap-001 done by"));
      check(`${width}: the capability task fits the page width`, await noSidewaysScroll(page));
      await shot('w2-capability-task', task);
      obligations = await obligationRows(recorded.capabilityObligations);
      check(`${width}: the capability run lists the delegated outcome and the consumer scenario, both done with where hints`,
        ['cap-001', 'sc-001'].every(id => recorded.capabilityObligations.some(item => item.id === id && item.status === 'done' && item.report?.where !== null))
        && recorded.capabilityObligations.every(item => matches(item, obligations.rows[item.id]!)));
      await shot('w2-obligations', obligations.list);
      panel = await openGate(recorded.capabilityGate);
      check(`${width}: the capability run's final audit is the root project's nested audit`,
        JSON.stringify(await projectLines(panel)) === JSON.stringify((recorded.capabilityGate.audit?.projects ?? []).map(projectLine)));

      // W3: the standalone session's refused write and dispositions.
      await page.goto(`${servers['w3']!.url}/#/sessions/standalone/${encodeURIComponent(standalone)}`, { waitUntil: 'networkidle' });
      const standaloneDispositions = page.getByLabel('Path dispositions');
      await standaloneDispositions.first().waitFor({ timeout: 15_000 });
      const standaloneRows = (await standaloneDispositions.locator(':scope > li').allInnerTexts()).map(row => row.trim());
      observed[`${width}-standalone-dispositions`] = standaloneRows;
      check(`${width}: the standalone session checks its source write and leaves its scratch write not analyzed`,
        standaloneRows.some(row => row.startsWith('checked ') && row.includes('fact.ts'))
        && standaloneRows.some(row => row.startsWith('not-analyzed ') && row.includes('tmp/notes.txt') && row.includes('scratch')));
      check(`${width}: the standalone session shows the write refused inside the nested project`,
        await page.getByText(/subs\/b\/report/u).count() > 0);
      check(`${width}: the standalone transcript fits the page width`, await noSidewaysScroll(page));
      await shot('w3-standalone-dispositions', standaloneDispositions.first());
      check(`${width}: Chromium reports no page exceptions`, errors.length === 0);
      await page.close();
    }
  } finally {
    await browser.close();
    for (const server of Object.values(servers)) await server.close();
  }
} catch (error) {
  failure = error;
} finally {
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'iteration11-browser-results.json'), JSON.stringify({
    revision, dirtyAtStart, chromium: browserPath, viewports: Object.values(viewports).map(size => `${size.width}x${size.height}`),
    source: 'projects kept by plan21-workflows.integration.test.ts (production wiring, scripted agents, installed providers), served by startCliServer, as `ramify-agent serve` starts it',
    observed, checks, screenshots, failure: failure instanceof Error ? failure.stack : failure ?? null,
  }, null, 2) + '\n');
  await rm(temp, { recursive: true, force: true });
}
if (failure !== undefined) process.exitCode = 1;
