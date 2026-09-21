import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { gateDiagnostics } from '../checks/diagnostics.js';
import { runGate } from '../checks/gate.js';
import { checkCommand, type GateAttempt } from '../checks/records.js';
import type { PlannedCheck } from '../checks/verify.js';
import { runLayout } from '../run/records.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs } from './helpers/iterations.js';
import { initRepository, onlyRun, openRuns, runEventsOnDisk, runPath, startRun, testPolicy } from './helpers/runs.js';

/*
 * What a failing gate says, and who answers it.
 *
 * A cause is not a diagnosis: an architect that received `outside-assignment`
 * and nothing else read it as a write outside the assignment, narrowed the
 * file list, and the same failure came back. So an attempt carries what each
 * failing command reported, a Ramify check's findings are attributed to the
 * files the report itself names, and a module violation goes to the local
 * architect whatever scope it lies in.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const scope = 'subs/workspace/subs/reviews/subs/notes/src';
const source = `${scope}/notes.ts`;

/** A finding exactly as `ramify check --batch --format json` reports one. */
function notVisible(file: string, line: number): Record<string, unknown> {
  return {
    id: `source-diagnostic/1:${file}:${line}`,
    category: 'import',
    code: 'not-visible',
    message: 'collection-review:interfaces/protocol.ts#ToolResult: not-visible',
    location: { file, start: 587, end: 597, line, column: 3 },
    importer: { owner: 'collection-review/workspace/reviews/notes', kind: 'ordinary' },
    original: { kind: 'code', owner: 'collection-review', file: 'interfaces/protocol.ts', binding: 'ToolResult' },
  };
}

function checkReport(findings: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: findings.length === 0 ? 'checked' : 'findings', findings });
}

/** A command that really runs, prints what it is given and answers `code`. */
function prints(text: string, code: number, cwd: string) {
  const program = `process.stdout.write(${JSON.stringify(text)});process.exit(${code});`;
  return checkCommand({ argv: [process.execPath, '-e', program], cwd, timeoutMs: 30_000 });
}

/** One attempt over a temporary directory, with the checks a test names. */
async function attempt(checks: readonly PlannedCheck[], writeScope?: readonly string[]): Promise<GateAttempt> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return runGate('iteration', {
    id: 'ga-0001',
    projectRoot: directory,
    directory: join(directory, 'gate'),
    head: 'HEAD',
    checks,
    limits: { repairRounds: 2, infrastructureRetries: 1 },
    ...(writeScope === undefined ? {} : { writeScope }),
  });
}

describe('a Ramify check that failed at a gate', () => {
  test('its findings attribute the cause, and it returns to the local architect although they are in scope', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));

    const gate = await attempt([
      { kind: 'tests', command: prints('ok 1 - the limit\n', 0, directory), attribution: 'in-scope' },
      { kind: 'type-check', command: prints('', 0, directory), attribution: 'project' },
      { kind: 'ramify-check', command: prints(checkReport([notVisible(source, 13)]), 1, directory), attribution: 'project' },
    ], [scope]);

    expect(gate.verdict).toBe('failed');
    // Every finding lies inside the write scope, so the failure is in scope.
    expect(gate.cause).toBe('in-scope');
    expect(gate.attribution).toEqual({ basis: 'ramify-findings', inScope: [`${source}:13`], outside: [] });
    // And it still goes to the architect: what the module may import is not
    // an engineer's to widen, so no repair round is spent on it.
    expect(gate.next).toBe('return-to-local-architect');

    const briefed = await gateDiagnostics(gate, 'local-architect');
    expect(briefed.summary).toEqual([
      '- `tests`: passed, exit 0',
      '- `type-check`: passed, exit 0',
      '- `ramify-check`: failed, exit 1, 1 finding:',
      `  - ${source}:13 imports \`ToolResult\` from src/interfaces/protocol.ts (module \`collection-review\`), which does not expose it to your module. \`import type\` counts too.`,
      'A module violation is not a repair round: what your module receives is yours to arrange, not an engineer\'s.'
      + ' The imports are owned by `collection-review`. Re-brief the iteration naming what the module already receives'
      + ' and what to use instead, submit `request-placement` where another owner would have to expose a symbol, or'
      + ' re-plan the scope so the work sits with the owner that has what it needs.',
    ]);

    // The engineer's own briefing carries the same findings and not the
    // decision that is the architect's.
    const engineer = await gateDiagnostics(gate, 'engineer');
    expect(engineer.summary.slice(0, 4)).toEqual(briefed.summary.slice(0, 4));
    expect(engineer.summary).toHaveLength(4);
  }, 60_000);

  test('a finding outside the write scope is outside-assignment, read from the report and not from a test', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));

    const gate = await attempt([
      { kind: 'tests', command: prints('ok\n', 0, directory), attribution: 'in-scope' },
      { kind: 'ramify-check', command: prints(checkReport([notVisible('subs/other/src/mcp.ts', 4)]), 1, directory), attribution: 'project' },
    ], [scope]);

    expect(gate.cause).toBe('outside-assignment');
    expect(gate.attribution).toEqual({ basis: 'ramify-findings', inScope: [], outside: ['subs/other/src/mcp.ts:4'] });
    expect(gate.next).toBe('return-to-local-architect');
  }, 60_000);

  test('a failure that is not a Ramify check keeps the rules it had: in scope, and one repair round', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const lines = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n');

    const gate = await attempt([
      { kind: 'tests', command: prints(`${lines}\n`, 1, directory), attribution: 'in-scope' },
      { kind: 'ramify-check', command: prints(checkReport([]), 0, directory), attribution: 'project' },
    ], [scope]);

    expect(gate.cause).toBe('in-scope');
    expect(gate.attribution).toBeUndefined();
    expect(gate.next).toBe('repair');

    // The command has no structured findings, so the end of its own output
    // is carried, bounded, and nothing of it is parsed.
    const briefed = await gateDiagnostics(gate, 'engineer');
    expect(briefed.summary[0]).toBe('- `tests`: failed, exit 1; the end of what it printed:');
    const quoted = briefed.summary.slice(1, -1);
    expect(quoted).toHaveLength(40);
    expect(quoted[0]).toBe('      line 41');
    expect(quoted.at(-1)).toBe('      line 80');
    expect(briefed.summary.at(-1)).toBe('- `ramify-check`: passed, exit 0');
  }, 60_000);
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';

/**
 * A complete Ramify check that passes at readiness and reports one module
 * violation at the iteration gate that follows, in the engineer's own file.
 */
function failingRamifyCheck(projectRoot: string, counter: string, failOn: number) {
  const report = checkReport([notVisible(`${notesDirectory}/src/notes.ts`, 13)]);
  const program = [
    'const fs = require("fs");',
    `const p = ${JSON.stringify(counter)};`,
    'const n = (fs.existsSync(p) ? Number(fs.readFileSync(p, "utf8")) : 0) + 1;',
    'fs.writeFileSync(p, String(n));',
    `if (n === ${failOn}) { process.stdout.write(${JSON.stringify(report)}); process.exit(1); }`,
    `process.stdout.write(${JSON.stringify(checkReport([]))}); process.exit(0);`,
  ].join('');
  return checkCommand({ argv: [process.execPath, '-e', program], cwd: projectRoot, timeoutMs: 30_000 });
}

describe('a module violation at the iteration gate, over a run', () => {
  test('the iteration returns to the local architect, whose briefing carries the finding itself', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const root = fixture.root;
    const counter = join(await mkdtemp(join(tmpdir(), 'ramify-agent-count-')), 'runs');
    cleanups.push(() => rm(counter, { force: true }));
    await addModule(root, notesDirectory, 'notes', {
      'src/notes.ts': 'export const noteLimit = 400;\n',
      'src/tests/notes.test.ts': [
        'import { test, expect } from \'vitest\';',
        'import { noteLimit } from \'../notes.ts\';',
        '',
        'test(\'the limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
        '',
      ].join('\n'),
    });
    await installMiniRunner(root);
    await initRepository(root);

    const opened = await openRuns(root, {
      inputs: treeInputs(),
      // Readiness runs the complete check first; the iteration gate's run is
      // the one that reports the violation.
      policy: projectRoot => {
        const base = testPolicy(projectRoot);
        return { ...base, commands: { ...base.commands, ramifyCheck: failingRamifyCheck(projectRoot, counter, 2) } };
      },
      script: byRole({
        'initial-architect': [submit(analysis([entry('review-note', notes)]))],
        'local-architect': [
          submit(assign(notes, {}, outline())),
          // The finding came back here, not to the engineer. This architect
          // assigns the work again, and the check passes from now on.
          submit(assign(notes, { kind: 'repair', goal: 'Use what the module receives instead of the refused import.' })),
          submit(requestCompletion()),
        ],
        engineer: [
          submit(completionProposed('Raised the limit to 500.'), edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500')),
          submit(completionProposed('Used what the module receives.')),
        ],
      }),
    });
    cleanups.push(() => opened.service.close());
    const receipt = await opened.service.execute(startRun('review-notes'));
    await opened.service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;
    expect(onlyRun(opened.service, 'review-notes').state).toBe('completed');

    // The attempt: attributed from the finding's own location, and returned.
    const events = await runEventsOnDisk(root, 'review-notes', runId);
    const ids = [...new Set(events.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
    const attempts = await Promise.all(ids.map(async id =>
      JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt));
    const returned = attempts.find(gate => gate.subject.iteration === 'wi-001.i01')!;
    expect(returned.cause).toBe('in-scope');
    expect(returned.next).toBe('return-to-local-architect');
    expect(returned.attribution).toEqual({
      basis: 'ramify-findings', inScope: [`${notesDirectory}/src/notes.ts:13`], outside: [],
    });

    // The iteration closed on it, and no repair round was spent.
    const result = JSON.parse(await readFile(
      runPath(root, 'review-notes', runId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
    expect(result.outcome).toBe('unsuitable');
    expect(result.invocations).toHaveLength(1);

    // What the architect was given: the failing command, the finding itself,
    // and what it leaves the architect to decide.
    const architects = opened.agent!.sessions.filter(session => session.spec.role === 'local-architect');
    expect(architects).toHaveLength(3);
    const briefing = architects[1]!.spec.prompt;
    expect(briefing).toContain('## The iteration you last assigned');
    expect(briefing).toContain(`Its gate \`${returned.id}\` did not pass (in-scope). What ran, and what it reported:`);
    expect(briefing).toContain('- `ramify-check`: failed, exit 1, 1 finding:');
    expect(briefing).toContain(`${notesDirectory}/src/notes.ts:13 imports \`ToolResult\` from src/interfaces/protocol.ts (module \`collection-review\`)`);
    expect(briefing).toContain('submit `request-placement` where another owner would have to expose a symbol');
  }, 300_000);
});
