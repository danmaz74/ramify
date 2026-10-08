import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collectTrialScratchSetup, recordedTrialScratch, trialReportDestination, runTrialAttributionCommand, trialAttributionExitCode, type TrialGitCommand, type TrialScratchSetupRecord } from '../../scripts/trial-attribution.js';

const B = 'b'.repeat(40); const S = 'c'.repeat(40); const F = 'f'.repeat(40);
const bytes = (text: string) => Buffer.from(text);
const old = bytes('dist/\n'); const setup = bytes('dist/\n**/src/tmp/\n'); const agent = bytes('dist/\n**/src/tmp/\nsecret-source.ts\n');
const record: TrialScratchSetupRecord = { id: 'scratch-setup:2', runId: 'run-1', originalIgnoreBase64: old.toString('base64'), commit: S, appended: true };
const delta = '@@ -1,0 +2 @@\n+**/src/tmp/\n';
const row = (commit: string, source: number, final: number, text: string) => `${commit} ${source} ${final} 1\nfilename .gitignore\n\t${text}\n`;
function tree(content: Uint8Array | null, objectPath = '.gitignore', mode = '100644') {
  if (content === null) return Buffer.alloc(0);
  const sha = createHash('sha1').update(Buffer.from(`blob ${content.length}\0`)).update(content).digest('hex');
  return bytes(`${mode} blob ${sha}\t${objectPath}\0`);
}
function scripted(answers: readonly (readonly [readonly string[], Uint8Array])[]) {
  const pending = [...answers]; const failures: string[] = [];
  const command: TrialGitCommand = async (project, args) => {
    const answer = pending.shift();
    if (project !== '/fixture' || !answer || JSON.stringify(args) !== JSON.stringify(answer[0])) { failures.push(`Unexpected command ${JSON.stringify(args)}; expected ${JSON.stringify(answer?.[0])}`); throw new Error(failures.at(-1)); }
    return answer[1];
  };
  return { command, verify() { expect(failures).toEqual([]); expect(pending).toEqual([]); } };
}
function plan(options: { original?: Uint8Array | null; after?: Uint8Array; final?: Uint8Array; current?: Uint8Array | null; patch?: string; origins?: string; setupPatch?: string; prefix?: string; finalMode?: string } = {}) {
  const original = options.original === undefined ? old : options.original;
  const after = options.after ?? setup; const final = options.final ?? after; const prefix = options.prefix ?? '';
  const objectPath = `${prefix}.gitignore`;
  const answers: Array<readonly [readonly string[], Uint8Array]> = [
    [['rev-parse', '--show-prefix'], bytes(`${prefix}\n`)], [['rev-list', '--first-parent', '--reverse', F], bytes(`${B}\n${S}\n${F}\n`)],
  ];
  for (const [revision, content] of [[B, original], [S, after], [B, original], [F, final]] as const) {
    answers.push([['ls-tree', '-rz', '--full-tree', revision], tree(content, objectPath, revision === F ? options.finalMode ?? '100644' : '100644')]);
    if (content !== null) answers.push([['cat-file', 'blob', `${revision}:${objectPath}`], content]);
  }
  const diff = (from: string, to: string) => ['diff', '--no-ext-diff', '--no-textconv', '--unified=0', '--no-renames', from, to, '--', '.gitignore'];
  answers.push([diff(B, S), bytes(options.setupPatch ?? delta)], [diff(B, F), bytes(options.patch ?? delta)]);
  const patch = options.patch ?? delta;
  if (patch !== '') {
    const extra = patch.includes('+2,2') ? ['-L', '3,3'] : [];
    answers.push([['blame', '--line-porcelain', '-L', '2,2', ...extra, F, '--', '.gitignore'], bytes(options.origins ?? row(S, 2, 2, '**/src/tmp/'))]);
  }
  const actualRecord = { ...record, originalIgnoreBase64: original === null ? null : Buffer.from(original).toString('base64') };
  return { answers, input: { project: '/fixture', runId: 'run-1', base: B, final: F, record: actualRecord, currentIgnoreBytes: options.current === undefined ? final : options.current, currentIgnoreMode: '100644' as const } };
}
async function run(data = plan()) {
  const script = scripted(data.answers); const result = await collectTrialScratchSetup(data.input, script.command); script.verify(); return result;
}

describe('Plan23 root trial collector scripted command boundary', () => {
  it('authenticates raw before/containing/final blobs and excludes only the exact established scratch append', async () => {
    expect(await run()).toEqual({ state: 'verified', reason: null, identities: { base: B, final: F, entries: [{ commit: S, path: '.gitignore', added: [2], deleted: [] }] }, setupOnly: true, added: 1, deleted: 0, nonSetup: { added: 0, deleted: 0, bytesChanged: false, modeChanged: false } });
  });
  it('retains later agent edit to SAME ignore file as unauthorized change', async () => {
    const result = await run(plan({ final: agent, patch: '@@ -1,0 +2,2 @@\n+**/src/tmp/\n+secret-source.ts\n', origins: row(S, 2, 2, '**/src/tmp/') + row(F, 3, 3, 'secret-source.ts') }));
    expect(result).toMatchObject({ state: 'verified', setupOnly: false, added: 1, deleted: 0 });
    expect(result.identities?.entries).toEqual([{ commit: S, path: '.gitignore', added: [2], deleted: [] }, { commit: F, path: '.gitignore', added: [], deleted: [] }]);
  });
  it('does not exempt dirty uncommitted agent edit beyond verified FINAL setup', async () => {
    expect(await run(plan({ current: agent }))).toMatchObject({ state: 'verified', setupOnly: false, added: 1 });
  });
  it('uncommitted executable-bit change cannot hide behind identical current file bytes', async () => {
    const data = plan(); const script = scripted(data.answers);
    expect(await collectTrialScratchSetup({ ...data.input, currentIgnoreMode: '100755' }, script.command)).toMatchObject({ state: 'verified', setupOnly: false }); script.verify();
  });
  it('fully reverted setup yields verified zero surviving lines and no exemption', async () => {
    expect(await run(plan({ final: old, patch: '' }))).toEqual({ state: 'verified', reason: null, identities: { base: B, final: F, entries: [] }, setupOnly: false, added: 0, deleted: 0, nonSetup: { added: 0, deleted: 0, bytesChanged: false, modeChanged: false } });
  });
  it('exact missing EOF newline setup authenticates both replaced BASE line and surviving FINAL lines', async () => {
    const data = plan({ original: bytes('dist/'), after: bytes('dist/\n**/src/tmp/\n'), patch: '@@ -1 +1,2 @@\n-dist/\n\\ No newline at end of file\n+dist/\n+**/src/tmp/\n', setupPatch: '@@ -1 +1,2 @@\n-dist/\n\\ No newline at end of file\n+dist/\n+**/src/tmp/\n' });
    data.answers[data.answers.length - 1] = [['blame', '--line-porcelain', '-L', '1,1', '-L', '2,2', F, '--', '.gitignore'], bytes(row(S, 1, 1, 'dist/') + row(S, 2, 2, '**/src/tmp/'))];
    data.answers.push([['blame', '--line-porcelain', '--reverse', '-L', '1,1', `${B}..${F}`, '--', '.gitignore'], bytes(row(B, 1, 1, 'dist/'))]);
    expect(await run(data)).toMatchObject({ state: 'verified', setupOnly: true, added: 2, deleted: 1 });
  });
  it('actual arbitrary setup-before boundary maps BASE deletion to shifted setup-before position', async () => {
    const I = 'd'.repeat(40); const base = bytes('old'); const before = bytes('agent\nold'); const after = bytes('agent\nold\n**/src/tmp/\n');
    const answers: Array<readonly [readonly string[], Uint8Array]> = [[['rev-parse', '--show-prefix'], bytes('\n')], [['rev-list', '--first-parent', '--reverse', F], bytes(`${B}\n${I}\n${S}\n${F}\n`)]];
    for (const [revision, content] of [[I, before], [S, after], [B, base], [F, after]] as const) answers.push([['ls-tree', '-rz', '--full-tree', revision], tree(content)], [['cat-file', 'blob', `${revision}:.gitignore`], content]);
    answers.push([['diff', '--no-ext-diff', '--no-textconv', '--unified=0', '--no-renames', I, S, '--', '.gitignore'], bytes('@@ -2 +2,2 @@\n-old\n\\ No newline at end of file\n+old\n+**/src/tmp/\n')], [['diff', '--no-ext-diff', '--no-textconv', '--unified=0', '--no-renames', B, F, '--', '.gitignore'], bytes('@@ -1 +1,3 @@\n-old\n\\ No newline at end of file\n+agent\n+old\n+**/src/tmp/\n')], [['blame', '--line-porcelain', '-L', '1,1', '-L', '2,2', '-L', '3,3', F, '--', '.gitignore'], bytes(row(I, 1, 1, 'agent') + row(S, 2, 2, 'old') + row(S, 3, 3, '**/src/tmp/'))], [['blame', '--line-porcelain', '--reverse', '-L', '1,1', `${B}..${F}`, '--', '.gitignore'], bytes(row(I, 2, 1, 'old'))], [['blame', '--line-porcelain', '--reverse', '-L', '1,1', `${B}..${I}`, '--', '.gitignore'], bytes(row(I, 2, 1, 'old'))]);
    const script = scripted(answers); const result = await collectTrialScratchSetup({ ...plan().input, record: { ...record, originalIgnoreBase64: before.toString('base64') }, currentIgnoreBytes: after }, script.command); script.verify();
    expect(result).toMatchObject({ state: 'verified', setupOnly: false, added: 2, deleted: 1 });
    expect(result.identities?.entries.find(entry => entry.commit === S)).toEqual({ commit: S, path: '.gitignore', added: [2, 3], deleted: [1] });
  });
  it('known object mode change prevents a whole-path setup exemption', async () => {
    expect(await run(plan({ finalMode: '100755' }))).toMatchObject({ state: 'verified', setupOnly: false });
  });
  it('same-commit extra agent bytes cannot gain setup ownership from a trailer or original bytes', async () => {
    const data = plan({ after: agent, final: agent }); data.answers.splice(10);
    expect(await run(data)).toMatchObject({ state: 'unavailable', setupOnly: false, identities: null, reason: expect.stringContaining('unrecorded changes') });
  });
  it('authenticates originally absent ignore file by exact tree absence before trusting its creation', async () => {
    const data = plan({ original: null, after: bytes('**/src/tmp/\n'), final: bytes('**/src/tmp/\n'), setupPatch: '@@ -0,0 +1 @@\n+**/src/tmp/\n', patch: '@@ -0,0 +1 @@\n+**/src/tmp/\n', origins: row(S, 1, 1, '**/src/tmp/') });
    data.answers[data.answers.length - 1] = [['blame', '--line-porcelain', '-L', '1,1', F, '--', '.gitignore'], bytes(row(S, 1, 1, '**/src/tmp/'))];
    expect(await run(data)).toMatchObject({ state: 'verified', setupOnly: true, added: 1 });
  });
  it('rejects raw blob corruption even if text can still decode', async () => {
    const data = plan(); data.answers[3] = [data.answers[3]![0], bytes('wrong\n')]; data.answers.splice(4);
    expect(await run(data)).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('object identity'), setupOnly: false });
  });
  it('invalid UTF8 bytes remain unavailable without replacing them into invented text', async () => {
    const data = plan({ original: new Uint8Array([0xff, 10]) }); data.answers.splice(2);
    expect(await run(data)).toMatchObject({ state: 'unavailable', setupOnly: false });
  });
  it('legitimate U+FFFD bytes remain valid authenticated UTF8 proof', async () => {
    const original = bytes('�\n'); expect(await run(plan({ original, after: bytes('�\n**/src/tmp/\n') }))).toMatchObject({ state: 'verified', setupOnly: true });
  });
  it('binary NUL blob remains unavailable', async () => {
    const data = plan({ original: new Uint8Array([0, 10]) }); data.answers.splice(2);
    expect(await run(data)).toMatchObject({ state: 'unavailable', setupOnly: false, reason: expect.stringContaining('Binary') });
  });
  it('BASE absent from real first-parent history cannot be appended to invent a chain', async () => {
    const data = plan(); data.answers[1] = [data.answers[1]![0], bytes(`${S}\n${F}\n`)]; data.answers.splice(2);
    expect(await run(data)).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('first-parent'), setupOnly: false });
  });
  it('outside repository source path cannot become project-relative scratch proof', async () => {
    expect(await run(plan({ origins: row(S, 2, 2, '**/src/tmp/').replace('filename .gitignore', 'filename other/.gitignore') }))).toMatchObject({ state: 'unavailable', setupOnly: false, added: null });
  });
  it('incomplete blame coverage cannot prove no surviving setup', async () => {
    expect(await run(plan({ origins: '' }))).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('coverage'), setupOnly: false });
  });
  it('truncated direct patch cannot fabricate verified zero surviving setup', async () => {
    const data = plan({ patch: '' });
    expect(await run(data)).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('coverage'), setupOnly: false, added: null });
  });
  it('diff header without original full body cannot authorize a line exemption', async () => {
    const data = plan({ patch: '@@ -1,0 +2 @@\n' }); data.answers.splice(data.answers.length - 1);
    expect(await run(data)).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('body'), setupOnly: false });
  });
  it('canonical nested repository prefix binds object paths and source metadata without guessing', async () => {
    expect(await run(plan({ prefix: 'nested/', origins: row(S, 2, 2, '**/src/tmp/').replace('filename .gitignore', 'filename nested/.gitignore') }))).toMatchObject({ state: 'verified', setupOnly: true, added: 1 });
  });
  it('no recorded setup and explicit unchanged effect dispatch no Git commands or exemptions', async () => {
    const command = async () => { throw new Error('Unexpected dispatch'); };
    const data = plan().input;
    expect(await collectTrialScratchSetup({ ...data, record: null }, command)).toMatchObject({ state: 'verified', setupOnly: false, added: 0 });
    expect(await collectTrialScratchSetup({ ...data, record: { ...record, commit: null, appended: false } }, command)).toMatchObject({ state: 'verified', setupOnly: false, added: 0 });
  });
  it('missing or wrong owning setup commit remains unavailable before command dispatch', async () => {
    const command = async () => { throw new Error('Unexpected dispatch'); }; const data = plan().input;
    expect(await collectTrialScratchSetup({ ...data, record: { ...record, commit: null } }, command)).toMatchObject({ state: 'unavailable', setupOnly: false });
    expect(await collectTrialScratchSetup({ ...data, record: { ...record, runId: 'other' } }, command)).toMatchObject({ state: 'unavailable', setupOnly: false });
  });
  it('extracts a single correlated durable intent/completion rather than trusting only appended flag', () => {
    const events = [{ type: 'scratch-setting-up', jobId: 'run-1', sequence: 2, data: { originalIgnoreBase64: old.toString('base64') } }, { type: 'scratch-setup-complete', jobId: 'run-1', sequence: 3, data: { commit: S, appended: true } }];
    expect(recordedTrialScratch(events, 'run-1')).toEqual(record); expect(recordedTrialScratch([], 'run-1')).toBeNull();
    expect(() => recordedTrialScratch([events[0], events[0], events[1]], 'run-1')).toThrow('Ambiguous');
    expect(() => recordedTrialScratch(events, 'other')).toThrow('owning');
    expect(() => recordedTrialScratch([events[1]], 'run-1')).toThrow('Ambiguous');
  });
});

it('trial reports stay external even through canonical project aliases and existing symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ramify-trial-output-'));
  try {
    const project = join(root, 'project'); await mkdir(join(project, 'plans'), { recursive: true });
    expect(await trialReportDestination(project, join(root, 'report.json'))).toBe(join(root, 'report.json'));
    await expect(trialReportDestination(project, join(project, 'plans/report.json'))).rejects.toThrow('outside');
    await symlink(join(project, 'plans'), join(root, 'alias'), 'dir');
    await expect(trialReportDestination(project, join(root, 'alias/report.json'))).rejects.toThrow('outside');
    await writeFile(join(root, 'real-report.json'), 'before'); await symlink(join(root, 'real-report.json'), join(root, 'linked-report.json'));
    await expect(trialReportDestination(project, join(root, 'linked-report.json'))).rejects.toThrow('symlink');
    expect(await readFile(join(root, 'real-report.json'), 'utf8')).toBe('before');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('prepared fixture keeps complete configured checks and explicitly declares plan/run records unwired', async () => {
  const fixture = new URL('../../subs/harness/fixtures/collection-review/', import.meta.url);
  const declaration = await readFile(new URL('module.ramify', fixture), 'utf8');
  expect(declaration).toContain('owned-unwired "plans"');
  const packageJson = JSON.parse(await readFile(new URL('package.json', fixture), 'utf8')) as { scripts: Record<string, string> };
  expect(packageJson.scripts['test']).toBe('vitest run');
  expect(packageJson.scripts['test:cucumber']).toContain('cucumber');
  expect(packageJson.scripts['type-check']).toContain('tsc');
  const readme = await readFile(new URL('README.md', fixture), 'utf8');
  expect(readme).not.toContain('Nothing checks them yet');
  expect(readme).not.toContain('../../docs/plans/reference-project');
  expect(readme).not.toContain('their step file renders the badge');
  expect(readme).toContain('not\nqualification of a new prepared copy');
  const ignore = await readFile(new URL('.gitignore', fixture), 'utf8');
  expect(ignore).not.toContain('/ramify/'); expect(ignore).not.toContain('secret-source.ts');
});

it('versioned root command input invokes the real collector recipe behind scripted raw command answers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ramify-trial-command-'));
  try {
    const project = join(root, 'project'); await mkdir(project); await writeFile(join(project, '.gitignore'), setup, { mode: 0o644 });
    const eventsFile = join(root, 'events.jsonl');
    await writeFile(eventsFile, [{ event: { type: 'scratch-setting-up', jobId: 'run-1', sequence: 2, data: { originalIgnoreBase64: old.toString('base64') } } }, { event: { type: 'scratch-setup-complete', jobId: 'run-1', sequence: 3, data: { commit: S, appended: true } } }].map(event => JSON.stringify(event)).join('\n') + '\n');
    const inputFile = join(root, 'input.json'); await writeFile(inputFile, JSON.stringify({ schema: 'ramify-agent.trial-attribution-input/1', project, runId: 'run-1', base: B, final: F, eventsFile }));
    const script = scripted(plan().answers);
    const result = await runTrialAttributionCommand(inputFile, async (actualProject, args) => { expect(actualProject).toBe(project); return script.command('/fixture', args); }); script.verify();
    expect(result).toMatchObject({ state: 'verified', setupOnly: true, nonSetup: { added: 0, deleted: 0, bytesChanged: false, modeChanged: false } });
    await writeFile(inputFile, JSON.stringify({ schema: 'ramify-agent.trial-attribution-input/2', project, runId: 'run-1', base: B, final: F, eventsFile }));
    await expect(runTrialAttributionCommand(inputFile, script.command)).rejects.toThrow('Invalid trial attribution command input');
    await writeFile(inputFile, 'null'); await expect(runTrialAttributionCommand(inputFile, script.command)).rejects.toThrow('Invalid trial attribution command input');
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('root CLI exit separates verified setup-only or zero from non-setup changes and unavailable evidence', async () => {
  expect(trialAttributionExitCode(await run())).toBe(0);
  expect(trialAttributionExitCode(await run(plan({ final: old, patch: '' })))).toBe(0);
  expect(trialAttributionExitCode(await run(plan({ current: agent })))).toBe(1);
  const data = plan(); const script = scripted(data.answers); const modeChanged = await collectTrialScratchSetup({ ...data.input, currentIgnoreMode: '100755' }, script.command); script.verify(); expect(trialAttributionExitCode(modeChanged)).toBe(1);
  const noFacts = await collectTrialScratchSetup({ ...data.input, record: null }, async () => { throw new Error('Unexpected dispatch'); });
  expect(trialAttributionExitCode(noFacts)).toBe(2);
  expect(trialAttributionExitCode(await run(plan({ origins: '' })))).toBe(2);
});
