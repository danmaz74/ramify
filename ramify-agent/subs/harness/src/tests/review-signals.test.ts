import { createHash } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import { reviewMessage } from '../reviews/message.js';
import type { ReviewRequest } from '../reviews/records.js';
import { candidateModuleIndex, concernModules, groundCredibility } from '../reviews/signals.js';
import { openCandidateSnapshot, snapshotToolNames } from '../reviews/snapshot.js';
import { scriptedCandidates, type ScriptedCommit } from './helpers/candidates.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { completionProposed, submit, write } from './helpers/iterations.js';
import { candidates, eventsOf, limit, notes, notesDirectory, plan, reviewRun, reviewTarget, store, tool } from './helpers/reviews.js';
import { onlyRun } from './helpers/runs.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * What the harness binds to a reviewer's concern (Plan 12 iteration 4b):
 * the credibility of the file the reviewer named as its ground, classified
 * by that file's provenance, and the modules that own its locations on the
 * audited candidate's own module tree, else the work item's module. The
 * reviewer supplies the risk level and names the ground; it never states
 * either binding. Git's answers are scripted and no process is started.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const featureFile = `${notesDirectory}/src/tests/features/${plan}/${plan}.feature`;

describe('the credibility of a ground', () => {
  const provenance = { planId: plan, featureFiles: new Set([featureFile]) };

  test('is human-reviewed for a principles document, the run\'s plan document and a feature file the harness wrote', () => {
    expect(groundCredibility('docs/check-findings.principles.md', provenance)).toBe('human-reviewed');
    expect(groundCredibility('check.principles.md', provenance)).toBe('human-reviewed');
    expect(groundCredibility(`plans/${plan}/plan.md`, provenance)).toBe('human-reviewed');
    expect(groundCredibility(featureFile, provenance)).toBe('human-reviewed');
  });

  test('is agent-generated for a test and any other file, and ungrounded without a ground', () => {
    expect(groundCredibility(`${notesDirectory}/src/tests/notes.test.ts`, provenance)).toBe('agent-generated');
    expect(groundCredibility(`${notesDirectory}/README.md`, provenance)).toBe('agent-generated');
    expect(groundCredibility('docs/principles.md', provenance)).toBe('agent-generated');
    // Another plan, the run's own state and a feature file the harness did not write are not the run's reviewed material.
    expect(groundCredibility('plans/other-plan/plan.md', provenance)).toBe('agent-generated');
    expect(groundCredibility(`plans/${plan}/.harness/jobs/run/analysis/entries.json`, provenance)).toBe('agent-generated');
    // Any other file of the plan's directory may have been written by an agent; only the plan document is credited.
    expect(groundCredibility(`plans/${plan}/notes/decision.md`, provenance)).toBe('agent-generated');
    expect(groundCredibility(`plans/${plan}/plan.md.bak`, provenance)).toBe('agent-generated');
    expect(groundCredibility(`${notesDirectory}/src/tests/features/${plan}/extra.feature`, provenance)).toBe('agent-generated');
    expect(groundCredibility(null, provenance)).toBe('ungrounded');
  });
});

describe('the modules of a concern', () => {
  const declaration = (name: string) => `ramify 1\nmodule ${name}\n`;
  const tree = (): Record<string, ScriptedCommit> => ({
    c1: {
      tree: 't1',
      base: 'c0',
      changes: [],
      files: {
        'module.ramify': declaration('shop'),
        'src/index.ts': '',
        'subs/cart/module.ramify': declaration('cart'),
        'subs/cart/README.md': '# cart\n',
        'subs/cart/src/cart.ts': '',
        'subs/cart/docs/notes.md': '',
        'subs/cart/subs/pricing/module.ramify': 'ramify 1\n// prices\nmodule "pricing" tagged [browser]\n',
        'subs/cart/subs/pricing/src/price.ts': '',
        // A declaration outside Ramify's layout declares nothing.
        'subs/cart/src/tests/fixtures/module.ramify': declaration('fixture'),
        'docs/module.ramify': declaration('docs'),
      },
    },
  });

  test('come from the candidate\'s own declarations, named by declared-name path', async () => {
    const source = scriptedCandidates('/project', tree());
    const snapshot = await openCandidateSnapshot(source, '/project', { commit: 'c1', base: 'c0' });
    const index = await candidateModuleIndex(source, '/project', snapshot);
    expect([...index.modules.values()].map(entry => [entry.module, entry.dir, entry.parent]).sort()).toEqual([
      ['shop', '', null], ['shop/cart', 'subs/cart', 'shop'], ['shop/cart/pricing', 'subs/cart/subs/pricing', 'shop/cart'],
    ]);
    const at = (...paths: string[]) => paths.map(path => ({ path, startLine: 1, endLine: 1 }));
    expect(concernModules(index, at('subs/cart/subs/pricing/src/price.ts'), 'shop/cart')).toEqual(['shop/cart/pricing']);
    expect(concernModules(index, at('subs/cart/src/cart.ts', 'subs/cart/README.md', 'subs/cart/subs/pricing/src/price.ts'), null))
      .toEqual(['shop/cart', 'shop/cart/pricing']);
    expect(concernModules(index, at('src/index.ts'), 'shop/cart')).toEqual(['shop']);
    // A location no module's own contents hold falls back to the work item's module.
    expect(concernModules(index, at('subs/cart/docs/notes.md', 'docs/module.ramify'), 'shop/cart')).toEqual(['shop/cart']);
    expect(concernModules(index, at('subs/cart/docs/notes.md'), null)).toEqual([]);
    expect(concernModules(null, at('subs/cart/src/cart.ts'), 'shop/cart')).toEqual(['shop/cart']);
  });

  test('are empty of modules for a candidate without a root declaration', async () => {
    const commits = tree();
    const { 'module.ramify': _root, ...rest } = commits.c1!.files;
    const source = scriptedCandidates('/project', { c1: { ...commits.c1!, files: rest } });
    const snapshot = await openCandidateSnapshot(source, '/project', { commit: 'c1', base: 'c0' });
    expect((await candidateModuleIndex(source, '/project', snapshot)).modules.size).toBe(0);
  });
});

describe('a driven review binds risk, ground, credibility and modules', () => {
  test('the harness classifies what each concern names, on the candidate\'s own module tree, and refuses a ground the reviewer did not read', async () => {
    const root = await reviewTarget(cleanups);
    const principles = 'docs/notes.principles.md';
    const planDocument = `plans/${plan}/plan.md`;
    const notesTest = `${notesDirectory}/src/tests/notes.test.ts`;
    // The candidate of the second iteration declares a child module the live tree never has.
    const counting = `${notesDirectory}/subs/counting/src/count.ts`;
    const scripted = candidates();
    const second = scripted['revision-02']!;
    const texts: Record<string, string> = {
      'module.ramify': 'ramify 1\nmodule collection-review\n',
      'subs/workspace/module.ramify': 'ramify 1\nmodule workspace\n',
      'subs/workspace/subs/reviews/module.ramify': 'ramify 1\nmodule reviews\n',
      [`${notesDirectory}/module.ramify`]: 'ramify 1\nmodule notes\n',
      [`${notesDirectory}/subs/counting/module.ramify`]: 'ramify 1\nmodule counting\n',
      [counting]: 'export const count = (text: string) => [...text].length;\n',
      [principles]: '# Notes principles\n\nA limit counts characters, never code units.\n',
      [planDocument]: '# Review notes\n\n## Request\n\nNotes hold at most 50 characters.\n',
      [featureFile]: 'Feature: review-notes\n',
      [notesTest]: 'test(\'the note limit\', () => {});\n',
    };
    scripted['revision-02'] = { ...second, files: { ...second.files, ...texts } };
    const concern = (summary: string, risk: string, ground: string | null, ...paths: string[]) => ({
      summary, consequence: `${summary}: a note is refused or kept wrongly`, rationale: 'read the candidate', uncertainty: 'low', remedy: 'a bounded change',
      locations: paths.map(path => ({ path, startLine: 1, endLine: 1 })), suggests: null, risk, ground: ground === null ? null : { path: ground },
    });
    const concerns = [
      concern('The limit counts code units', 'high', principles, limit, counting),
      concern('The limit is not the plan\'s', 'medium', planDocument, limit),
      concern('The scenario\'s limit is not enforced', 'medium', featureFile, limit),
      concern('The test pins the old limit', 'low', notesTest, limit),
      concern('The limit has no name', 'low', null, 'docs/notes.principles.md'),
    ];
    const clean = (path: string): ScriptStep[] => [tool(snapshotToolNames.diff, { path }), { kind: 'submit', input: { inspected: [path], missing: [], concerns: [] } }];
    const run = await reviewRun(root, cleanups, {
      commits: scripted,
      engineer: [
        submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n')),
        submit(completionProposed('Stated the note limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
        submit(completionProposed('Exported the store.'), write(store, 'export const store = new Map(); // v3\n'), write(`${notesDirectory}/src/index.ts`, 'export * from \'./store.js\';\n')),
      ],
      reviewers: {
        'rq-0001': clean(store),
        'rq-0002': [
          tool(snapshotToolNames.diff, { path: limit }),
          ...[principles, planDocument, featureFile].map(path => tool(snapshotToolNames.read, { path })),
          // The test is grounded before it was read: the submission is refused and returned.
          { kind: 'submit', input: { inspected: [limit], missing: [], concerns } },
          tool(snapshotToolNames.read, { path: notesTest }),
          { kind: 'submit', input: { inspected: [limit], missing: [], concerns } },
        ],
        'rq-0003': clean(store),
      },
    });
    const { service, runId, events, agent } = run;
    expect(onlyRun(service, plan).state).toBe('completed');

    const reviewer = agent!.sessions.find(session => session.spec.role === 'reviewer' && session.spec.prompt.includes('rq-0002'))!;
    expect(reviewer.verdicts).toMatchObject([{ accepted: false }, { accepted: true }]);
    // Only the unread ground is refused; the three read ones are accepted as named.
    expect(reviewer.verdicts[0]).toMatchObject({ errors: [expect.stringContaining('"path": "concerns.3.ground.path"')] });
    expect(reviewer.verdicts[0]).toMatchObject({ errors: [expect.not.stringMatching(/concerns\.[0-24]\./u)] });
    expect(eventsOf(events, 'review-attempt-finished').find(event => event.data.attempt === 'rq-0002.a01')?.data).toMatchObject({ result: 'complete', settles: true });

    const hashed = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
    const reports = [1, 2, 3, 4, 5].map(number => {
      const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: `cf-000${number}` });
      if (detail === undefined || !detail.ok || detail.view.kind !== 'detail') throw new Error(`no detail of cf-000${number}`);
      return detail.view.reports.items[0]!;
    });
    expect(reports.map(report => [report.judgment?.risk, report.judgment?.ground, report.credibility, report.modules])).toEqual([
      ['high', { ref: principles, hash: hashed(texts[principles]!) }, 'human-reviewed', [notes, `${notes}/counting`]],
      ['medium', { ref: planDocument, hash: hashed(texts[planDocument]!) }, 'human-reviewed', [notes]],
      ['medium', { ref: featureFile, hash: hashed(texts[featureFile]!) }, 'human-reviewed', [notes]],
      ['low', { ref: notesTest, hash: hashed(texts[notesTest]!) }, 'agent-generated', [notes]],
      // No module owns docs/, so the concern falls back to its work item's module.
      ['low', null, 'ungrounded', [notes]],
    ]);

    // The run's lists order by risk, credibility and recency, and narrow to
    // one module: the two medium, human-reviewed concerns go latest first.
    const ordered = service.checkFindings(plan, runId, { kind: 'list', select: 'all', order: 'attention' });
    expect(ordered).toMatchObject({ ok: true, view: { items: [{ id: 'cf-0001' }, { id: 'cf-0003' }, { id: 'cf-0002' }, { id: 'cf-0004' }, { id: 'cf-0005' }] } });
    const inCounting = service.checkFindings(plan, runId, { kind: 'list', select: 'all', module: `${notes}/counting` });
    expect(inCounting).toMatchObject({ ok: true, view: { total: 1, items: [{ id: 'cf-0001', modules: [notes, `${notes}/counting`] }] } });

    expect(eventsOf(events, 'gate-attempted').every(event => event.data.verdict === 'passed')).toBe(true);
  }, 120_000);
});

describe('the scope question\'s message', () => {
  test('names the plan document a concern can be grounded in only where the candidate holds it', async () => {
    const source = scriptedCandidates('/project', { c1: { tree: 't1', base: 'c0', changes: [], files: { [`plans/${plan}/plan.md`]: '# Plan\n' } } });
    const snapshot = await openCandidateSnapshot(source, '/project', { commit: 'c1', base: 'c0' });
    const request: ReviewRequest = {
      schema: 'ramify-agent.review-request/1', id: 'rq-0002', key: { iteration: 'wi-001.i01', candidate: 'c1', kind: 'scope', policy: 'review-policy/1' },
      workItem: 'wi-001', assignment: 'a.json', base: 'c0', gate: 'ga-0001', tree: 't1', requirements: [], guidance: [], forkPoint: { kind: 'none' },
    };
    const message = (planDocument: string | null) => reviewMessage({ request, snapshot, assignment: null, checkFindings: [], requirements: [], planDocument });
    expect(message(`plans/${plan}/plan.md`)).toContain(`The candidate holds the plan as \`plans/${plan}/plan.md\`. To name it as a concern's ground, read it with \`snapshot_read\`.`);
    expect(message(null)).toContain('The candidate holds no copy of the plan');
  });

  test('lists every plan deviation in force apart from the excerpts, to be judged as the plan amended', async () => {
    const source = scriptedCandidates('/project', { c1: { tree: 't1', base: 'c0', changes: [], files: {} } });
    const snapshot = await openCandidateSnapshot(source, '/project', { commit: 'c1', base: 'c0' });
    const request: ReviewRequest = {
      schema: 'ramify-agent.review-request/1', id: 'rq-0002', key: { iteration: 'wi-001.i01', candidate: 'c1', kind: 'scope', policy: 'review-policy/1' },
      workItem: 'wi-001', assignment: 'a.json', base: 'c0', gate: 'ga-0001', tree: 't1', requirements: [], guidance: [], forkPoint: { kind: 'none' },
    };
    const message = reviewMessage({
      request, snapshot, assignment: null, checkFindings: [], planDocument: null,
      requirements: [
        { ref: 'plan#request', hash: 'a'.repeat(64), text: '## Request\n- Serve it over tRPC and MCP.' },
        { ref: 'deviation:pd-001', hash: 'b'.repeat(64), text: 'Plan deviation pd-001 ... What the run does instead: tRPC only.' },
      ],
    });
    const [excerpts, deviations] = message.split('## Plan deviations in force');
    expect(excerpts).toContain('### plan#request');
    expect(excerpts).not.toContain('deviation:pd-001');
    expect(deviations).toContain('judge the candidate against that requirement as the deviation amends it');
    expect(deviations).toContain('### deviation:pd-001 (sha256 bbbbbbbbbbbb)');
    expect(deviations).toContain('What the run does instead: tRPC only.');
  });
});
