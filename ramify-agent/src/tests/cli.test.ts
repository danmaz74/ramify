import { describe, expect, test } from 'vitest';
import { defaultPort, parseCommandLine, usage, UsageError } from '../cli.js';

test('serve takes a project and an optional port', () => {
  expect(parseCommandLine(['serve', '--project', 'fixtures/x'])).toEqual({ command: 'serve', projectRoot: 'fixtures/x', port: defaultPort, agent: undefined, model: undefined });
  expect(parseCommandLine(['serve', '--port=0', '--project=/p'])).toEqual({ command: 'serve', projectRoot: '/p', port: 0, agent: undefined, model: undefined });
});

test('an agent is chosen only explicitly', () => {
  expect(parseCommandLine(['serve', '--project', 'p', '--agent', 'fake'])).toMatchObject({ agent: 'fake' });
  expect(parseCommandLine(['serve', '--project', 'p', '--agent', 'pi'])).toMatchObject({ agent: 'pi', model: undefined });
  expect(parseCommandLine(['serve', '--project', 'p', '--agent', 'pi', '--model', 'anthropic/claude-opus-4-5'])).toMatchObject({ agent: 'pi', model: 'anthropic/claude-opus-4-5' });
  expect(() => parseCommandLine(['serve', '--project', 'p', '--agent', 'fake', '--model', 'x/y'])).toThrow(/--agent pi only/);
  expect(() => parseCommandLine(['serve', '--project', 'p', '--agent', 'claude'])).toThrow(UsageError);
});

test('help without a command', () => {
  expect(parseCommandLine([])).toEqual({ command: 'help' });
  expect(parseCommandLine(['--help'])).toEqual({ command: 'help' });
});

test('usage errors', () => {
  for (const argv of [['map'], ['serve'], ['serve', '--project'], ['serve', '--project', 'p', '--port', 'x'],
    ['serve', '--project', 'p', '--port', '70000'], ['serve', '--project', 'p', '--verbose']]) {
    expect(() => parseCommandLine(argv)).toThrow(UsageError);
  }
});

describe('session', () => {
  const base = ['session', '--project', 'p', '--module', 'app/reviews'];

  test('takes a project, a module, a prompt and an agent, pi by default', () => {
    expect(parseCommandLine([...base, '--prompt', 'Raise the limit.', '--agent', 'pi'])).toEqual({
      command: 'session', projectRoot: 'p', module: 'app/reviews', prompt: { text: 'Raise the limit.' },
      agent: { name: 'pi', model: undefined }, write: [], gate: false,
    });
    expect(parseCommandLine([...base, '--prompt-file=goal.md', '--agent', 'pi', '--model', 'openai-codex/gpt-5.6-luna:low',
      '--write', 'docs/notes.md', '--write', 'subs/shared/', '--gate'])).toEqual({
      command: 'session', projectRoot: 'p', module: 'app/reviews', prompt: { file: 'goal.md' },
      agent: { name: 'pi', model: 'openai-codex/gpt-5.6-luna:low' }, write: ['docs/notes.md', 'subs/shared/'], gate: true,
    });
    expect(parseCommandLine([...base, '--prompt', 'x'])).toMatchObject({ agent: { name: 'pi', model: undefined } });
    expect(parseCommandLine([...base, '--prompt', 'x', '--model', 'x/y'])).toMatchObject({ agent: { name: 'pi', model: 'x/y' } });
    expect(parseCommandLine([...base, '--prompt', 'x', '--agent', 'fake', '--script', 'steps.json'])).toMatchObject({
      agent: { name: 'fake', script: 'steps.json' },
    });
  });

  test('needs exactly one prompt', () => {
    expect(() => parseCommandLine([...base, '--agent', 'pi'])).toThrow(/needs a prompt/);
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--prompt-file', 'f', '--agent', 'pi'])).toThrow(/not both/);
    expect(() => parseCommandLine([...base, '--prompt', '  ', '--agent', 'pi'])).toThrow(UsageError);
  });

  test('--model applies to pi only, and --script to --agent fake only', () => {
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--agent', 'fake', '--script', 's.json', '--model', 'x/y'])).toThrow(/--agent pi only/);
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--agent', 'pi', '--script', 's.json'])).toThrow(/--agent fake only/);
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--agent', 'fake'])).toThrow(/needs --script/);
  });

  test('gate takes a manual run, a checkpoint, an optional invocation and --no-commit', () => {
    expect(parseCommandLine(['step', 'gate', '--run', 'r', '--checkpoint', 'iteration', '--invocation', 'inv-0002'])).toEqual({
      command: 'step', step: { command: 'gate', run: 'r', checkpoint: 'iteration', invocation: 'inv-0002', noCommit: false },
    });
    expect(parseCommandLine(['step', 'gate', '--run=r', '--checkpoint=readiness', '--no-commit'])).toEqual({
      command: 'step', step: { command: 'gate', run: 'r', checkpoint: 'readiness', invocation: undefined, noCommit: true },
    });
  });

  test('after takes a manual run and an invocation; inputs composes a review from a recorded request', () => {
    expect(parseCommandLine(['step', 'after', '--run', 'r', '--invocation', 'inv-0003'])).toEqual({
      command: 'step', step: { command: 'after', run: 'r', invocation: 'inv-0003' },
    });
    expect(parseCommandLine(['step', 'inputs', '--role', 'reviewer', '--from-run', 'r', '--request', 'rq-0001', '--out', 'q.json'])).toEqual({
      command: 'step', step: { command: 'inputs', role: 'reviewer', fromRun: 'r', invocation: undefined, out: 'q.json', request: 'rq-0001', authored: {} },
    });
  });

  test('usage errors', () => {
    for (const argv of [
      ['session', '--module', 'm', '--prompt', 'x', '--agent', 'pi'],
      ['session', '--project', 'p', '--prompt', 'x', '--agent', 'pi'],
      [...base, '--prompt', 'x', '--agent', 'claude'],
      [...base, '--prompt', 'x', '--agent', 'pi', '--verbose'],
      [...base, '--prompt', 'x', '--agent', 'pi', '--gate=yes'],
      [...base, '--prompt', 'x', '--agent', 'pi', '--port', '1'],
      [...base, '--prompt'],
    ]) {
      expect(() => parseCommandLine(argv)).toThrow(UsageError);
    }
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--agent', 'pi', '--verbose'])).toThrow(/Unknown option "--verbose"/);
  });
});

describe('step', () => {
  test('inputs imports one invocation of a run by role', () => {
    expect(parseCommandLine(['step', 'inputs', '--role', 'engineer', '--from-run', 'plans/p/.harness/jobs/r', '--invocation', 'inv-0007', '--out', 'inputs.json'])).toEqual({
      command: 'step', step: { command: 'inputs', role: 'engineer', fromRun: 'plans/p/.harness/jobs/r', invocation: 'inv-0007', out: 'inputs.json', projectRoot: undefined, authored: {} },
    });
    expect(parseCommandLine(['step', 'inputs', '--role=engineer', '--from-run=run', '--invocation=inv-0001'])).toEqual({
      command: 'step', step: { command: 'inputs', role: 'engineer', fromRun: 'run', invocation: 'inv-0001', out: undefined, projectRoot: undefined, authored: {} },
    });
  });

  test('inputs takes authored files, from a run or against a project', () => {
    expect(parseCommandLine(['step', 'inputs', '--role', 'engineer', '--from-run', 'r', '--invocation', 'inv-0003', '--assignment', 'a.json', '--work-item=w.json',
      '--outline', 'o.json', '--selection', 's.json', '--review-request', 'q.json'])).toEqual({
      command: 'step', step: { command: 'inputs', role: 'engineer', fromRun: 'r', invocation: 'inv-0003', out: undefined, projectRoot: undefined,
        authored: { assignment: 'a.json', workItem: 'w.json', outline: 'o.json', selection: 's.json', reviewRequest: 'q.json' } },
    });
    expect(parseCommandLine(['step', 'inputs', '--role', 'engineer', '--project', '/p', '--work-item', 'wi.json', '--assignment', 'assignment.json'])).toEqual({
      command: 'step', step: { command: 'inputs', role: 'engineer', fromRun: undefined, invocation: undefined, out: undefined, projectRoot: '/p',
        authored: { workItem: 'wi.json', assignment: 'assignment.json' } },
    });
  });

  test('render takes an inputs file, the project defaulting to the current directory', () => {
    expect(parseCommandLine(['step', 'render', '--inputs', 'inputs.json'])).toEqual({
      command: 'step', step: { command: 'render', inputs: 'inputs.json', projectRoot: '.', invocation: undefined },
    });
    expect(parseCommandLine(['step', 'render', '--inputs', 'i.json', '--project', '/p', '--invocation', 'inv-0002'])).toEqual({
      command: 'step', step: { command: 'render', inputs: 'i.json', projectRoot: '/p', invocation: 'inv-0002' },
    });
  });

  test('run takes an inputs file, a manual run directory and the agent, pi by default', () => {
    expect(parseCommandLine(['step', 'run', '--inputs', 'i.json', '--run', 'plans/p/.harness/jobs/m-1'])).toEqual({
      command: 'step', step: { command: 'run', inputs: 'i.json', run: 'plans/p/.harness/jobs/m-1', agent: { name: 'pi', model: undefined } },
    });
    expect(parseCommandLine(['step', 'run', '--inputs=i.json', '--run=r', '--agent', 'pi', '--model', 'openai/x'])).toMatchObject({
      step: { agent: { name: 'pi', model: 'openai/x' } },
    });
    expect(parseCommandLine(['step', 'run', '--inputs', 'i.json', '--run', 'r', '--agent', 'fake', '--script', 's.json'])).toMatchObject({
      step: { agent: { name: 'fake', script: 's.json' } },
    });
  });

  test('gate takes a manual run, a checkpoint, an optional invocation and --no-commit', () => {
    expect(parseCommandLine(['step', 'gate', '--run', 'r', '--checkpoint', 'iteration', '--invocation', 'inv-0002'])).toEqual({
      command: 'step', step: { command: 'gate', run: 'r', checkpoint: 'iteration', invocation: 'inv-0002', noCommit: false },
    });
    expect(parseCommandLine(['step', 'gate', '--run=r', '--checkpoint=readiness', '--no-commit'])).toEqual({
      command: 'step', step: { command: 'gate', run: 'r', checkpoint: 'readiness', invocation: undefined, noCommit: true },
    });
  });

  test('after takes a manual run and an invocation; inputs composes a review from a recorded request', () => {
    expect(parseCommandLine(['step', 'after', '--run', 'r', '--invocation', 'inv-0003'])).toEqual({
      command: 'step', step: { command: 'after', run: 'r', invocation: 'inv-0003' },
    });
    expect(parseCommandLine(['step', 'inputs', '--role', 'reviewer', '--from-run', 'r', '--request', 'rq-0001', '--out', 'q.json'])).toEqual({
      command: 'step', step: { command: 'inputs', role: 'reviewer', fromRun: 'r', invocation: undefined, out: 'q.json', request: 'rq-0001', authored: {} },
    });
  });

  test('usage errors', () => {
    for (const [argv, message] of [
      [['step'], /needs a subcommand: inputs, render, run, gate or after/],
      [['step', 'gate', '--checkpoint', 'final'], /step gate needs --run/],
      [['step', 'gate', '--run', 'r'], /step gate needs --checkpoint/],
      [['step', 'gate', '--run', 'r', '--checkpoint', 'nightly'], /Unknown checkpoint "nightly"/],
      [['step', 'gate', '--run', 'r', '--checkpoint', 'final', '--no-commit=yes'], /Unknown option "--no-commit=yes"/],
      [['step', 'after', '--run', 'r'], /step after needs --invocation/],
      [['step', 'after', '--invocation', 'i'], /step after needs --run/],
      [['step', 'inputs', '--role', 'reviewer', '--request', 'rq-0001'], /--request needs --from-run/],
      [['step', 'inputs', '--role', 'reviewer', '--from-run', 'r', '--request', 'rq-0001', '--invocation', 'i'], /takes no --invocation/],
      [['step', 'nothing'], /Unknown step subcommand "nothing"/],
      [['step', 'run', '--run', 'r'], /step run needs --inputs/],
      [['step', 'run', '--inputs', 'i.json'], /step run needs --run/],
      [['step', 'run', '--inputs', 'i.json', '--run', 'r', '--agent', 'fake'], /--agent fake needs --script/],
      [['step', 'run', '--inputs', 'i.json', '--run', 'r', '--script', 's.json'], /--script applies to --agent fake only/],
      [['step', 'run', '--inputs', 'i.json', '--run', 'r', '--agent', 'fake', '--script', 's.json', '--model', 'm'], /--model applies to --agent pi only/],
      [['step', 'inputs', '--from-run', 'r', '--invocation', 'i'], /needs --role/],
      [['step', 'inputs', '--role', 'engineer', '--invocation', 'i'], /needs --from-run/],
      [['step', 'inputs', '--role', 'engineer', '--from-run', 'r'], /needs --invocation/],
      [['step', 'inputs', '--role', 'engineer', '--from-run', 'r', '--invocation', 'i', '--project', '/p'], /takes its project from the run/],
      [['step', 'inputs', '--role', 'engineer', '--from-run', 'r', '--invocation', 'i', '--agent', 'pi'], /Unknown option "--agent"/],
      [['step', 'render'], /needs --inputs/],
      [['step', 'render', '--inputs'], /--inputs needs a value/],
    ] as const) {
      expect(() => parseCommandLine(argv), argv.join(' ')).toThrow(message);
    }
  });

  test('usage names the step commands', () => {
    expect(usage).toContain('ramify-agent step inputs --role <engineer|local-architect|context-selector|reviewer> --from-run <run dir> --invocation <id>');
    expect(usage).toContain('[--work-item <file>] [--outline <file>] [--assignment <file>] [--selection <file>] [--review-request <file>] [--out <file>]');
    expect(usage).toContain('ramify-agent step inputs --role engineer --project <root> --work-item <file> [--outline <file>] --assignment <file> [--out <file>]');
    expect(usage).toContain('ramify-agent step render --inputs <file> [--project <root>] [--invocation <id>]');
    expect(usage).toContain('ramify-agent step run --inputs <file> --run <project>/plans/<plan>/.harness/jobs/<run>');
    expect(usage).toContain('ramify-agent step inputs --role reviewer --from-run <manual run dir> --request <review request id> [--out <file>]');
    expect(usage).toContain('ramify-agent step gate --run <manual run dir> --checkpoint <iteration|work-item|readiness|final> [--invocation <id>] [--no-commit]');
    expect(usage).toContain('ramify-agent step after --run <manual run dir> --invocation <id>');
  });
});
