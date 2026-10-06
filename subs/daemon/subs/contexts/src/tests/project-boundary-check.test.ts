import { describe, expect, it } from 'vitest';
import type { AnalysisDiagnostic } from '../../../../../analysis/src/interfaces/analysis.js';
import type { CapturedInput, ProjectExclusion, ProjectScope } from '../../../../../analysis/subs/project/src/interfaces/project.js';
import type { CheckOutcome, ContextToken, ExpectedContent, PathCheckDisposition } from '../interfaces/contexts.js';
import { sessionEnvironment } from './session-fixture.js';
import { capture, flush, hash } from './scripted-driver.js';

/**
 * Changed-check path dispositions over the written topology of the plan's
 * fixtures.md. The scripted session supplies independently written revisions:
 * their captured inputs and ownership tables. Classification is Project's own
 * classifier, reached through the driver port. Expected dispositions follow the
 * contracts ("Reports, affected queries and freshness") and the CLI invocation
 * specification ("Hook and complete checks"), never the implementation.
 */
const exclusion = (kind: ProjectExclusion['kind'], directory: string, owner: string | null = null): ProjectExclusion => ({ kind, directory, owner });
const modules = [
  { id: 'app', parent: null, directory: '.' },
  { id: 'app/a', parent: 'app', directory: 'subs/a' },
  { id: 'app/a-extra', parent: 'app', directory: 'subs/a-extra' },
  { id: 'app/a/grand', parent: 'app/a', directory: 'subs/a/subs/grand' },
  { id: 'app/b', parent: 'app', directory: 'subs/b' },
];
const exclusions = [
  exclusion('output', 'dist'),
  exclusion('external', 'external-project'),
  exclusion('owned-nested-project', 'fixture-project', 'app'),
  exclusion('scratch', 'src/tmp', 'app'),
  exclusion('scratch', 'subs/a-extra/src/tmp', 'app/a-extra'),
  exclusion('owned-nested-project', 'subs/a/fixtures/sample', 'app/a'),
  exclusion('scratch', 'subs/a/src/tmp', 'app/a'),
  exclusion('scratch', 'subs/a/subs/grand/src/tmp', 'app/a/grand'),
  exclusion('scratch', 'subs/b/src/tmp', 'app/b'),
];
function topology(extra: readonly ProjectExclusion[] = []): ProjectScope {
  return { root: '/fixture', selection: 'given', invokedFrom: '/fixture', configuration: 'tsconfig.json',
    walkedAreas: ['src', 'subs/a-extra/src', 'subs/a/src', 'subs/a/subs/grand/src', 'subs/b/src'],
    ownership: { modules, exclusions: [...exclusions, ...extra].sort((x, y) => x.directory < y.directory ? -1 : 1) } };
}
const text: Readonly<Record<string, string>> = {
  'module.ramify': 'ramify 1\nroot module app tagged [dispatch]\n',
  'tsconfig.json': '{}', 'README.md': '# App\n\nThe app.\n',
  'src/main.ts': 'export const main = 1;\n', 'scripts/check.ts': "import { api } from '../subs/a/src/api.js';\n",
  'subs/a/module.ramify': 'ramify 1\nmodule a\n', 'subs/a/src/api.ts': 'export function api(): number { return 1; }\n',
  'subs/b/module.ramify': 'ramify 1\nmodule b\n', 'subs/b/src/consumer.ts': "import { api } from '../../a/src/api.js';\n",
};
const roles: Readonly<Record<string, CapturedInput['role']>> = { 'module.ramify': 'description', 'tsconfig.json': 'configuration',
  'README.md': 'readme', 'subs/a/module.ramify': 'description', 'subs/b/module.ramify': 'description' };
const read = (path: string, content = text[path]!): CapturedInput => ({ path, role: roles[path] ?? 'source', sha256: hash(content), bytes: content.length });
/** The compiler's zero-byte existence probe of an inert file: identified by kind and path, no bytes read. */
const probe = (path: string): CapturedInput => ({ path, role: 'dependency', sha256: hash(`file:${path}`), bytes: 0 });
const baseInputs = (): CapturedInput[] => [...Object.keys(text).map(path => read(path)), probe('notes/design.md'), probe('src/tmp/throwaway.test.ts')];
function revision(version: number, inputs: readonly CapturedInput[] = baseInputs(), scope: ProjectScope | null = topology(),
  options: { readonly execution?: 'completed' | 'invalid'; readonly diagnostics?: readonly AnalysisDiagnostic[] } = {}) {
  const scripted = capture(version, options.execution ?? 'completed', inputs, scope);
  const diagnostics = options.diagnostics ?? [];
  return { ...scripted, report: { ...scripted.report, diagnostics }, revision: { ...scripted.revision, diagnostics } };
}
const content = (path: string, value = text[path]!): ExpectedContent => ({ path, sha256: hash(value) });
const finding: AnalysisDiagnostic = { id: 'access:b-consumer', category: 'import', code: 'not-visible', message: 'api is not visible',
  location: { file: 'subs/b/src/consumer.ts', start: 9, end: 12, line: 1, column: 10 }, related: [], importer: null, original: null, accessId: null };

function environment() {
  const e = sessionEnvironment();
  let classified = 0;
  const classify = e.script.driver.classify;
  e.script.driver.classify = (scope, path) => { classified++; return classify(scope, path); };
  let id = 0;
  const check = (token: ContextToken, paths: readonly string[], expect: readonly ExpectedContent[], classification: number | null,
    deadlineMs?: number) => e.manager.check({ token, requestId: `boundary-${++id}`, scope: 'delta', paths, classification,
    freshness: { mode: 'synchronized', expect }, ...(deadlineMs === undefined ? {} : { deadlineMs }) }, 'lease');
  async function open(initial = revision(1)) {
    e.script.pending.push(() => initial);
    const opened = await e.open(); await flush();
    expect(e.status(opened.token)).toMatchObject({ synchronization: 'synchronized', published: { sequence: 1 } });
    return opened.token;
  }
  return { ...e, check, open, get classified() { return classified; } };
}
function paths(outcome: CheckOutcome): readonly PathCheckDisposition[] {
  if (outcome.status === 'reported' && outcome.published) return outcome.paths;
  if (outcome.status === 'classification-changed') return outcome.paths;
  throw new Error(`Expected dispositions, received ${JSON.stringify(outcome)}`);
}

describe('changed-check path dispositions from revision-bound project scope', () => {
  it('classifies by containment before any content rule and answers excluded and inert paths without their content', async () => {
    const e = environment();
    try {
      const token = await e.open();
      const named = ['src/main.ts', 'notes/design.md', 'fixture-project/package.json', 'subs/a/fixtures/sample/src/world.ts',
        'external-project/file.ts', 'node_modules/sample/index.ts', 'dist/output.ts', 'src/tmp/throwaway.test.ts', 'subs/a/src/tmp/new.ts'];
      const notAnalyzed: PathCheckDisposition[] = [
        { path: 'fixture-project/package.json', disposition: 'not-analyzed', module: 'app', exclusion: exclusion('owned-nested-project', 'fixture-project', 'app'), reason: 'owned-nested-project' },
        { path: 'subs/a/fixtures/sample/src/world.ts', disposition: 'not-analyzed', module: 'app/a', exclusion: exclusion('owned-nested-project', 'subs/a/fixtures/sample', 'app/a'), reason: 'owned-nested-project' },
        { path: 'external-project/file.ts', disposition: 'not-analyzed', module: null, exclusion: exclusion('external', 'external-project'), reason: 'external' },
        { path: 'node_modules/sample/index.ts', disposition: 'not-analyzed', module: null, exclusion: exclusion('packages', 'node_modules'), reason: 'reserved' },
        { path: 'dist/output.ts', disposition: 'not-analyzed', module: null, exclusion: exclusion('output', 'dist'), reason: 'reserved' },
        { path: 'src/tmp/throwaway.test.ts', disposition: 'not-analyzed', module: 'app', exclusion: exclusion('scratch', 'src/tmp', 'app'), reason: 'scratch' },
        { path: 'subs/a/src/tmp/new.ts', disposition: 'not-analyzed', module: 'app/a', exclusion: exclusion('scratch', 'subs/a/src/tmp', 'app/a'), reason: 'scratch' },
      ];
      // Without a classification the client sends no content; the published revision's
      // ownership answers at once which paths need it, and nothing is queued or analyzed.
      const updates = e.script.updateCalls.length;
      const classification = await e.check(token, named, [], null);
      expect(classification).toMatchObject({ status: 'classification-changed', revision: { sequence: 1 } });
      expect(paths(classification)).toEqual([
        { path: 'src/main.ts', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'classification-changed' },
        { path: 'notes/design.md', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'classification-changed' },
        ...notAnalyzed,
      ]);
      await flush();
      expect([e.script.updateCalls.length, e.status(token).pending.changedPaths]).toEqual([updates, 0]);
      // The analyzed paths' content follows; the inert file is re-observed by one capture.
      const answered = await e.check(token, named, [content('src/main.ts'), { path: 'notes/design.md', sha256: hash('# Design\n') }], 1);
      expect(answered).toMatchObject({ status: 'reported', published: true, revision: { sequence: 1, outcome: { execution: 'completed' } },
        freshness: { verified: true } });
      expect(paths(answered)).toEqual([
        { path: 'src/main.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'content', sha256: hash(text['src/main.ts']!) },
        { path: 'notes/design.md', disposition: 'not-analyzed', module: 'app', exclusion: null, reason: 'owned-non-source' },
        ...notAnalyzed,
      ]);
      // Every named path is a re-observation hint; only analyzed paths carried content.
      expect(e.script.updateCalls.slice(updates).map(call => call.inputs.changes.map(change => change.path).sort())).toEqual([[...named].sort()]);
      // One classifier call per path at arrival, coverage and delivery.
      expect(e.classified).toBeLessThanOrEqual(named.length * 5);
    } finally { await e.dispose(); }
  });

  it('answers a request naming only not-analyzed paths from the published revision with no content, capture or sweep', async () => {
    const e = environment();
    try {
      const token = await e.open();
      const calls = e.script.calls.length;
      const answer = await e.check(token, ['subs/a/fixtures/sample/package.json', 'external-project/package.json'], [], null);
      expect(answer).toMatchObject({ status: 'reported', published: true, revision: { sequence: 1 },
        freshness: { verified: true, reusedRevision: true, captureStarted: null } });
      expect(paths(answer).map(item => [item.path, item.disposition, item.module, item.reason])).toEqual([
        ['subs/a/fixtures/sample/package.json', 'not-analyzed', 'app/a', 'owned-nested-project'],
        ['external-project/package.json', 'not-analyzed', null, 'external']]);
      expect(e.script.calls.length).toBe(calls);
      // With findings in the covering revision the same request reports them: the not-analyzed
      // paths leave the complete check's verdict as it is.
      e.script.pending.push(() => revision(2, baseInputs(), topology(), { diagnostics: [finding] }));
      e.watcher.emit('/fixture', [{ path: 'subs/b/src/consumer.ts', kind: 'changed' }]);
      const failing = await e.check(token, ['subs/a/fixtures/sample/package.json'], [], null);
      expect(failing).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 },
        delta: { findings: [{ id: finding.id, new: true }] } });
      expect(paths(failing)).toEqual([{ path: 'subs/a/fixtures/sample/package.json', disposition: 'not-analyzed', module: 'app/a',
        exclusion: exclusion('owned-nested-project', 'subs/a/fixtures/sample', 'app/a'), reason: 'owned-nested-project' }]);
      expect(e.script.sweepCalls).toHaveLength(0);
    } finally { await e.dispose(); }
  });

  it('treats a package manifest or compiler configuration inside an owned-unwired tree as no configuration change', async () => {
    const e = environment();
    try {
      const token = await e.open();
      // Hook: not analyzed, answered with the revision's verdict, never configuration-changed.
      for (const path of ['subs/a/fixtures/sample/package.json', 'fixture-project/tsconfig.json', 'fixture-project/package-lock.json']) {
        const answer = await e.check(token, [path], [], null);
        expect([answer.status, paths(answer)[0]?.disposition, paths(answer)[0]?.reason]).toEqual(['reported', 'not-analyzed', 'owned-nested-project']);
      }
      // The root's own configuration stays a configuration change, answered at once.
      const first = await e.check(token, ['tsconfig.json'], [], null);
      expect(paths(first)).toEqual([{ path: 'tsconfig.json', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'classification-changed' }]);
      const configuration = await e.check(token, ['tsconfig.json'], [content('tsconfig.json', '{"strict":true}')], 1);
      expect(configuration).toMatchObject({ status: 'unavailable', reason: 'configuration-changed' });
      await flush(); e.clock.advance(100); await flush();
      // A watcher event for a manifest inside the ignored tree requires no sweep; the root's does.
      const sweeps = e.script.sweepCalls.length;
      e.watcher.emit('/fixture', [{ path: 'subs/a/fixtures/sample/package.json', kind: 'changed' }]);
      e.clock.advance(100); await flush();
      expect(e.script.sweepCalls.length).toBe(sweeps);
      e.watcher.emit('/fixture', [{ path: 'package.json', kind: 'changed' }]);
      e.clock.advance(100); await flush();
      expect(e.script.sweepCalls.length).toBe(sweeps + 1);
      // The containment rule holds for a request without paths too: its expectation is not configuration.
      const plain = await e.manager.check({ token, requestId: 'plain', scope: 'delta',
        freshness: { mode: 'synchronized', expect: [{ path: 'subs/a/fixtures/sample/package.json', sha256: hash('{}') }] } }, 'lease');
      expect(plain).toMatchObject({ status: 'unavailable', reason: 'unobserved-input' });
    } finally { await e.dispose(); }
  });

  it('never admits excluded bytes as content expectations', async () => {
    const e = environment();
    try {
      const token = await e.open();
      const updates = e.script.updateCalls.length;
      // An expectation naming an excluded path does not follow the classification: refused at
      // once, with nothing queued and no update, whatever its hash.
      const refused = await e.check(token, ['src/main.ts', 'fixture-project/src/index.ts'],
        [content('src/main.ts'), { path: 'fixture-project/src/index.ts', sha256: hash('excluded bytes') }], 1);
      expect(refused).toMatchObject({ status: 'classification-changed', revision: { sequence: 1 } });
      expect(paths(refused).map(item => [item.path, item.disposition, item.reason])).toEqual([
        ['src/main.ts', 'not-checked', 'classification-changed'], ['fixture-project/src/index.ts', 'not-analyzed', 'owned-nested-project']]);
      await flush();
      expect([e.script.updateCalls.length, e.status(token).pending.changedPaths]).toEqual([updates, 0]);
      // Following the classification, the analyzed path alone carries content and is covered.
      const covered = await e.check(token, ['src/main.ts', 'fixture-project/src/index.ts'], [content('src/main.ts')], 1);
      expect(covered).toMatchObject({ status: 'reported', freshness: { reusedRevision: true, captureStarted: null } });
      expect(paths(covered).map(item => [item.path, item.disposition])).toEqual([['src/main.ts', 'checked'], ['fixture-project/src/index.ts', 'not-analyzed']]);
      expect(paths(covered)[1]).not.toHaveProperty('sha256');
    } finally { await e.dispose(); }
  });

  it('checks the deletion of a previously analyzed source after membership removal, whenever the removal published', async () => {
    const e = environment();
    try {
      const token = await e.open();
      const without = (...removed: string[]) => baseInputs().filter(input => !removed.includes(input.path));
      // The hook names the deletion first: the capture removes the file, which no probe records.
      e.script.pending.push(() => revision(2, without('subs/b/src/consumer.ts')));
      const deleted = await e.check(token, ['subs/b/src/consumer.ts', 'subs/b/src/never.ts'],
        [{ path: 'subs/b/src/consumer.ts', sha256: null }, { path: 'subs/b/src/never.ts', sha256: null }], 1);
      expect(deleted).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 } });
      expect(paths(deleted)).toEqual([
        { path: 'subs/b/src/consumer.ts', disposition: 'checked', module: 'app/b', exclusion: null, reason: 'deleted', sha256: null },
        // An owned path never analyzed and absent is no file the complete check reads.
        { path: 'subs/b/src/never.ts', disposition: 'not-analyzed', module: 'app/b', exclusion: null, reason: 'owned-non-source' },
      ]);
      // The watcher publishes the next removal before the hook arrives: still checked by its removal.
      e.script.pending.push(() => revision(3, without('subs/b/src/consumer.ts', 'scripts/check.ts')));
      e.watcher.emit('/fixture', [{ path: 'scripts/check.ts', kind: 'deleted' }]);
      e.clock.advance(100); await flush();
      expect(e.status(token).published?.sequence).toBe(3);
      const late = await e.check(token, ['scripts/check.ts'], [{ path: 'scripts/check.ts', sha256: null }], 3);
      expect(paths(late)).toEqual([{ path: 'scripts/check.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'deleted', sha256: null }]);
      // A compiler probe of the absent path is deletion evidence in the revision itself: covered at once.
      e.script.pending.push(() => revision(4, [...without('subs/b/src/consumer.ts', 'scripts/check.ts', 'subs/a/src/api.ts'),
        { path: 'subs/a/src/api.ts', role: 'absent', sha256: hash('absent:subs/a/src/api.ts'), bytes: 0 }]));
      e.watcher.emit('/fixture', [{ path: 'subs/a/src/api.ts', kind: 'deleted' }]);
      e.clock.advance(100); await flush();
      const probed = await e.check(token, ['subs/a/src/api.ts'], [{ path: 'subs/a/src/api.ts', sha256: null }], 4);
      expect(probed).toMatchObject({ status: 'reported', freshness: { reusedRevision: true, captureStarted: null } });
      expect(paths(probed)).toEqual([{ path: 'subs/a/src/api.ts', disposition: 'checked', module: 'app/a', exclusion: null, reason: 'deleted', sha256: null }]);
      // A file that exists is not checked as deleted: an absent expectation of analyzed content is superseded.
      const existing = await e.check(token, ['src/main.ts'], [{ path: 'src/main.ts', sha256: null }], 4);
      expect(paths(existing)).toEqual([{ path: 'src/main.ts', disposition: 'not-checked', module: 'app', exclusion: null, reason: 'superseded' }]);
    } finally { await e.dispose(); }
  });

  it('retains checked path and finding evidence in a mixed request with a path it could not check', async () => {
    const e = environment();
    try {
      const token = await e.open();
      e.script.pending.push(() => revision(2, baseInputs().map(input => input.path === 'subs/b/src/consumer.ts'
        ? read(input.path, '// rewritten after the client hashed\n') : input), topology(), { diagnostics: [finding] }));
      const mixed = await e.check(token, ['src/main.ts', 'subs/b/src/consumer.ts', 'notes/design.md', 'subs/a/fixtures/sample/README.md'],
        [content('src/main.ts'), content('subs/b/src/consumer.ts', '// the client saw this\n'), { path: 'notes/design.md', sha256: hash('# Design\n') }], 1);
      expect(mixed).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2 },
        delta: { findings: [{ id: finding.id, new: true }] } });
      expect(paths(mixed)).toEqual([
        { path: 'src/main.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'content', sha256: hash(text['src/main.ts']!) },
        { path: 'subs/b/src/consumer.ts', disposition: 'not-checked', module: 'app/b', exclusion: null, reason: 'superseded' },
        { path: 'notes/design.md', disposition: 'not-analyzed', module: 'app', exclusion: null, reason: 'owned-non-source' },
        { path: 'subs/a/fixtures/sample/README.md', disposition: 'not-analyzed', module: 'app/a',
          exclusion: exclusion('owned-nested-project', 'subs/a/fixtures/sample', 'app/a'), reason: 'owned-nested-project' },
      ]);
    } finally { await e.dispose(); }
  });

  it('answers classification-changed when a declaration change races the client, then checks the reclassified request', async () => {
    const e = environment();
    try {
      const token = await e.open();
      const data = topology([exclusion('owned-unwired', 'subs/b/data', 'app/b')]);
      const declared = 'ramify 1\nmodule b\nowned-unwired "data"\n';
      const named = ['subs/b/module.ramify', 'subs/b/data/x.json'];
      const declaredInputs = baseInputs().map(input => input.path === 'subs/b/module.ramify' ? read(input.path, declared) : input);
      // The client classified at revision 1, where `data` was b's ordinary territory, and
      // hashed both paths. The capture its request joins publishes the declaration.
      e.script.pending.push(() => revision(2, declaredInputs, data));
      const raced = await e.check(token, named, [content('subs/b/module.ramify', declared), { path: 'subs/b/data/x.json', sha256: hash('{"x":1}') }], 1);
      expect(raced).toMatchObject({ status: 'classification-changed', revision: { sequence: 2 } });
      expect(paths(raced)).toEqual([
        { path: 'subs/b/module.ramify', disposition: 'not-checked', module: 'app/b', exclusion: null, reason: 'classification-changed' },
        { path: 'subs/b/data/x.json', disposition: 'not-analyzed', module: 'app/b', exclusion: exclusion('owned-unwired', 'subs/b/data', 'app/b'), reason: 'owned-unwired' },
      ]);
      const retried = await e.check(token, named, [content('subs/b/module.ramify', declared)], 2);
      expect(retried).toMatchObject({ status: 'reported', revision: { sequence: 2 }, freshness: { reusedRevision: true } });
      expect(paths(retried).map(item => [item.path, item.disposition, item.reason])).toEqual([
        ['subs/b/module.ramify', 'checked', 'content'], ['subs/b/data/x.json', 'not-analyzed', 'owned-unwired']]);
      // A client still classifying at revision 1 meets the published declaration at arrival.
      const stale = await e.check(token, named, [content('subs/b/module.ramify', declared), { path: 'subs/b/data/x.json', sha256: hash('{"x":1}') }], 1);
      expect(stale).toMatchObject({ status: 'classification-changed', revision: { sequence: 2 } });
      // Removing the declaration makes the path analyzed again: a request without its
      // content no longer follows the classification at the revision that removes it.
      e.script.pending.push(() => revision(3, [...baseInputs(), read('subs/b/data/x.json', '{"x":2}')], topology()));
      const removed = await e.check(token, named, [content('subs/b/module.ramify')], 2);
      expect(removed).toMatchObject({ status: 'classification-changed', revision: { sequence: 3 } });
      expect(paths(removed).map(item => [item.path, item.disposition, item.reason])).toEqual([
        ['subs/b/module.ramify', 'not-checked', 'classification-changed'], ['subs/b/data/x.json', 'not-checked', 'classification-changed']]);
      const reincluded = await e.check(token, named, [content('subs/b/module.ramify'), { path: 'subs/b/data/x.json', sha256: hash('{"x":2}') }], 3);
      expect(paths(reincluded).map(item => [item.path, item.disposition, item.reason])).toEqual([
        ['subs/b/module.ramify', 'checked', 'content'], ['subs/b/data/x.json', 'checked', 'content']]);
    } finally { await e.dispose(); }
  });

  it('classifies an invalid deciding revision by the latest completed ownership table', async () => {
    const e = environment();
    try {
      const token = await e.open();
      const broken = 'ramify 1\nroot module app tagged [dispatch]\nexpose-src\n';
      // The invalid acquisition has no ownership of its own: its broken root owns nothing.
      e.script.pending.push(() => revision(2, baseInputs().map(input => input.path === 'module.ramify' ? read(input.path, broken) : input),
        null, { execution: 'invalid' }));
      const invalid = await e.check(token, ['module.ramify', 'fixture-project/module.ramify'],
        [content('module.ramify', broken)], 1);
      expect(invalid).toMatchObject({ status: 'reported', published: true, revision: { sequence: 2, outcome: { execution: 'invalid' } } });
      expect(paths(invalid).map(item => [item.path, item.disposition, item.module, item.reason])).toEqual([
        ['module.ramify', 'checked', 'app', 'content'], ['fixture-project/module.ramify', 'not-analyzed', 'app', 'owned-nested-project']]);
    } finally { await e.dispose(); }
  });

  it('classifies nothing before the first revision: a deadline answers cold, and the open supplies the classification', async () => {
    const f = environment();
    let release!: (value: ReturnType<typeof revision>) => void;
    try {
      f.script.pending.push(() => new Promise(resolve => { release = resolve; }));
      const opened = await f.manager.open({ cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
        { registry: 'default', capabilities: [] }, 'lease');
      if (opened.status !== 'opened') throw new Error(opened.status);
      // No revision has classified anything: the request waits, and its deadline answers cold.
      const cold = f.check(opened.token, ['src/main.ts'], [], null, 10);
      await flush(); f.clock.advance(10); await flush();
      expect(await cold).toMatchObject({ status: 'cold' });
      // Once the open publishes, a waiting request without a classification receives one.
      const waiting = f.check(opened.token, ['src/main.ts', 'fixture-project/x.ts'], [], null);
      await flush(); release(revision(1)); await flush();
      const answer = await waiting;
      expect(answer).toMatchObject({ status: 'classification-changed', revision: { sequence: 1 } });
      expect(paths(answer).map(item => [item.path, item.disposition])).toEqual([['src/main.ts', 'not-checked'], ['fixture-project/x.ts', 'not-analyzed']]);
    } finally { await flush(); await f.dispose(); }
  });
});
