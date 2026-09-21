import { describe, expect, test } from 'vitest';
import { defaultPort, parseCommandLine, UsageError } from '../cli.js';

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

  test('takes a project, a module, a prompt and an agent', () => {
    expect(parseCommandLine([...base, '--prompt', 'Raise the limit.', '--agent', 'pi'])).toEqual({
      command: 'session', projectRoot: 'p', module: 'app/reviews', prompt: { text: 'Raise the limit.' },
      agent: { name: 'pi', model: undefined }, write: [], gate: false,
    });
    expect(parseCommandLine([...base, '--prompt-file=goal.md', '--agent', 'pi', '--model', 'openai-codex/gpt-5.6-luna:low',
      '--write', 'docs/notes.md', '--write', 'subs/shared/', '--gate'])).toEqual({
      command: 'session', projectRoot: 'p', module: 'app/reviews', prompt: { file: 'goal.md' },
      agent: { name: 'pi', model: 'openai-codex/gpt-5.6-luna:low' }, write: ['docs/notes.md', 'subs/shared/'], gate: true,
    });
    expect(parseCommandLine([...base, '--prompt', 'x', '--agent', 'fake', '--script', 'steps.json'])).toMatchObject({
      agent: { name: 'fake', script: 'steps.json' },
    });
  });

  test('needs exactly one prompt', () => {
    expect(() => parseCommandLine([...base, '--agent', 'pi'])).toThrow(/needs a prompt/);
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--prompt-file', 'f', '--agent', 'pi'])).toThrow(/not both/);
    expect(() => parseCommandLine([...base, '--prompt', '  ', '--agent', 'pi'])).toThrow(UsageError);
  });

  test('--model applies to --agent pi only, and --script to --agent fake only', () => {
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--model', 'x/y'])).toThrow(UsageError);
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--agent', 'fake', '--script', 's.json', '--model', 'x/y'])).toThrow(/--agent pi only/);
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--agent', 'pi', '--script', 's.json'])).toThrow(/--agent fake only/);
    expect(() => parseCommandLine([...base, '--prompt', 'x', '--agent', 'fake'])).toThrow(/needs --script/);
  });

  test('usage errors', () => {
    for (const argv of [
      ['session', '--module', 'm', '--prompt', 'x', '--agent', 'pi'],
      ['session', '--project', 'p', '--prompt', 'x', '--agent', 'pi'],
      [...base, '--prompt', 'x'],
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
