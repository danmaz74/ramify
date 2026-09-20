import { expect, test } from 'vitest';
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
