import { describe, expect, test } from 'vitest';
import { classifyShellTestRun } from '../tools/shell-tests.js';

const facts = { workingDirectory: '/project', testScripts: { '/project': 'vitest run', '/project/pkg': 'cucumber-js', '/project/npx': 'npx vitest run' } };
const kind = (command: string) => classifyShellTestRun(command, facts).kind;

describe('shell suite classification', () => {
  test.each([
    'npm test', 'npm t', 'npm run test', 'npx vitest run', 'vitest run -t one',
    'vitest run --project node', 'vitest watch a.test.ts', 'npm test -- --watch a.test.ts',
    'echo first && npx vitest run', 'FOO=x env BAR=y npx vitest run',
    'env -u CI npm test', 'nice -n 5 npm test', 'cd npx && npm test',
    'cucumber-js --tags @smoke',
    'cd pkg && cucumber-js',
  ])('refuses a whole suite: %s', command => { expect(kind(command)).toBe('whole-suite'); });

  test.each([
    'npm test -- src/a.test.ts', 'npx vitest run src/tests',
    'npx vitest run a.test.ts b.test.ts', 'vitest related src/a.ts',
    'vitest run --changed', 'vitest run --changed=HEAD~1',
    'vitest run --coverage src/a.test.ts', 'echo done; npx vitest run src/tests',
  ])('allows a focused run: %s', command => { expect(kind(command)).toBe('focused'); });

  test.each([
    'bash -c "npx vitest run"', 'eval "npm test"', 'npm run custom',
    'echo "a && npx vitest run"', 'echo $(npx vitest run)',
  ])('leaves an indirect command alone: %s', command => { expect(kind(command)).toBe('none'); });

  test('reports the whole segment before anything can run', () => {
    expect(classifyShellTestRun('echo first && npm test; echo last', facts)).toMatchObject({
      kind: 'whole-suite', segment: 'npm test', reason: 'no test file or directory was named',
    });
  });
});
