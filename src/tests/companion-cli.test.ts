import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../../subs/analysis/src/interfaces/analysis.js';
import type { CheckDocument } from '../../subs/cli/src/interfaces/cli.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import { fixture, invoke, put } from './fixture.js';
import { createQuickEnvironment } from './quick-environment.js';
import type { QuickEnvironment } from './quick-environment.js';

/** The public CLI over the real resident service; batch is never used. */
async function resident(quick: QuickEnvironment, cwd: string, argv: readonly string[]): Promise<{ exitCode: number; stdout: string }> {
  const stdout: string[] = [], stderr: string[] = [];
  const exitCode = await runCli(argv, { cwd, version: '0.0.0', stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
    batch: async () => { throw new Error('Resident command unexpectedly invoked batch'); }, connect: options => quick.connect(options) });
  expect(stderr.join('')).toBe('');
  return { exitCode, stdout: stdout.join('') };
}

/** Plan 8 iteration 3: the pinned text and JSON forms of the companion finding and its notes. */
const api = 'export const value: number = 1; export const privateValue = 2;\n'
  + 'export interface Shape { readonly n: number }\n'
  + 'export function area(shape: Shape): number { return shape.n; }\n'
  + 'export function label(n: number) { return String(n); }\n';

describe('signature-companion forms of the batch and resident CLI', () => {
  it('pins the finding and the inference note in text and JSON, and passes once the companion is exposed', async () => fixture(async root => {
    await put(root, 'module.ramify', 'ramify 1\nmodule fixture\nexpose-src value, area, label from "interfaces/api.ts" to descendants\n');
    await put(root, 'src/interfaces/api.ts', api);
    const message = '`area` is exposed to descendants without `Shape`, which its signature names (src/interfaces/api.ts:3:29). '
      + 'Expose `Shape` to descendants, or remove it from the signature.';
    const note = '`label` is exposed and its declared signature leaves a type to inference; the companions of an inferred type are not verified';

    const human = await invoke(root, ['check', '--batch']);
    expect([human.exitCode, human.stderr]).toEqual([1, '']);
    const lines = human.stdout.split('\n');
    const first = lines.findIndex(line => line.startsWith('Error '));
    expect(lines.slice(first, first + 3)).toEqual([
      `Error [exposed-without-companion] module.ramify:3:1: ${message}`,
      '  Original: fixture/interfaces/api.ts#area',
      '  Related: src/interfaces/api.ts:3:29',
    ]);
    expect(lines.filter(line => line.startsWith('Error '))).toHaveLength(1);
    expect(lines.filter(line => line.startsWith('Analysis limit '))).toEqual([`Analysis limit [signature-inferred] src/interfaces/api.ts:4:1: ${note}`]);
    expect(lines).toContain('Execution: completed; check: failed; coverage: partial');
    expect(lines.find(line => line.startsWith('Findings:'))).toBe('Findings: 1 errors, 0 warnings, 1 analysis limits; 1 allowed, 0 denied, 0 external');

    const json = await invoke(root, ['check', '--batch', '--format', 'json']);
    expect(json.exitCode).toBe(1);
    const report = JSON.parse(json.stdout) as AnalysisReport;
    expect(report.diagnostics).toEqual([{ id: expect.stringMatching(/^companion-diagnostic\/1:[0-9a-f]{64}$/), category: 'exposure',
      code: 'exposed-without-companion', message,
      location: { file: 'module.ramify', start: 24, end: 93, line: 3, column: 1 },
      related: [{ file: 'src/interfaces/api.ts', start: 137, end: 142, line: 3, column: 29 }],
      importer: null, original: { kind: 'code', owner: 'fixture', file: 'interfaces/api.ts', binding: 'area' }, accessId: null }]);
    expect(report.coverage).toEqual([{ id: expect.stringMatching(/^companion-limit\/1:[0-9a-f]{64}$/), code: 'signature-inferred',
      location: { file: 'src/interfaces/api.ts', start: 172, end: 226, line: 4, column: 1 }, message: note, related: [] }]);
    expect(report.stages.find(stage => stage.stage === 'decide')).toEqual({ stage: 'decide', status: 'completed', blockedBy: [],
      diagnosticIds: [report.diagnostics[0]!.id] });

    await put(root, 'module.ramify', 'ramify 1\nmodule fixture\nexpose-src value, area, label, Shape from "interfaces/api.ts" to descendants\n');
    const fixed = await invoke(root, ['check', '--batch', '--format', 'json']);
    expect(fixed.exitCode).toBe(0);
    const passed = JSON.parse(fixed.stdout) as AnalysisReport;
    expect(passed.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'partial' });
    expect(passed.diagnostics).toEqual([]);
    expect(passed.coverage.map(item => [item.code, item.message])).toEqual([['signature-inferred', note]]);
  }), 20_000);

  it('SC19: marks the finding new after the causing edit, refreshes its location after a move and lists it as removed after the fix', () => fixture(async root => {
    const quick = await createQuickEnvironment();
    try {
      const source = 'src/interfaces/api.ts';
      const header = 'export const value: number = 1; export const privateValue = 2;\nexport interface Shape { readonly n: number }\n';
      await put(root, 'module.ramify', 'ramify 1\nmodule fixture\nexpose-src value, area from "interfaces/api.ts" to descendants\n');
      await put(root, source, `${header}export function area(n: number): number { return n; }\n`);
      const changed = ['check', '--changed', source, '--deadline', '30000'];
      expect((await resident(quick, root, changed)).exitCode).toBe(0);
      const message = (line: number): string => `\`area\` is exposed to descendants without \`Shape\`, which its signature names (${source}:${line}:29). `
        + 'Expose `Shape` to descendants, or remove it from the signature.';

      await put(root, source, `${header}export function area(shape: Shape): number { return shape.n; }\n`);
      const caused = await resident(quick, root, changed);
      expect(caused.exitCode).toBe(1);
      expect(caused.stdout.split('\n').filter(line => line.startsWith('Error'))).toEqual([`Error [new] [exposed-without-companion] module.ramify:3:1: ${message(3)}`]);
      const repeated = await resident(quick, root, [...changed, '--format', 'json']);
      const first = JSON.parse(repeated.stdout) as CheckDocument;
      expect([repeated.exitCode, first.exitCode, first.revision?.path]).toEqual([1, 1, 'source']);
      expect(first.findings).toEqual([expect.objectContaining({ code: 'exposed-without-companion', category: 'exposure', new: true, message: message(3),
        location: expect.objectContaining({ file: 'module.ramify', line: 3, column: 1 }),
        related: [expect.objectContaining({ file: source, line: 3, column: 29 })] })]);

      // A position-only edit keeps the violation and refreshes the displayed signature location.
      await put(root, source, `${header}\nexport function area(shape: Shape): number { return shape.n; }\n`);
      const moved = await resident(quick, root, [...changed, '--format', 'json']);
      const shifted = JSON.parse(moved.stdout) as CheckDocument;
      expect([moved.exitCode, shifted.revision?.path]).toEqual([1, 'unchanged-surface']);
      expect(shifted.findings).toEqual([expect.objectContaining({ message: message(4), related: [expect.objectContaining({ file: source, line: 4, column: 29 })] })]);
      // The identity carries the moved evidence, so the move replaces the earlier finding in the delta.
      expect(shifted.findings[0]!.new).toBe(true);
      expect(shifted.removed).toEqual([first.findings[0]!.id]);
      // Without --since the covering revision is compared with its predecessor, so the moved finding is still new.
      const text = await resident(quick, root, changed);
      expect(text.stdout.split('\n').filter(line => line.startsWith('Error'))).toEqual([`Error [new] [exposed-without-companion] module.ramify:3:1: ${message(4)}`]);

      await put(root, 'module.ramify', 'ramify 1\nmodule fixture\nexpose-src value, area, Shape from "interfaces/api.ts" to descendants\n');
      const fixed = await resident(quick, root, ['check', '--changed', 'module.ramify', '--deadline', '30000', '--format', 'json']);
      const passed = JSON.parse(fixed.stdout) as CheckDocument;
      expect([fixed.exitCode, passed.revision?.path, passed.findings]).toEqual([0, 'description', []]);
      expect(passed.removed).toEqual([shifted.findings[0]!.id]);
    } finally { await quick.dispose(); }
  }), 60_000);
});
