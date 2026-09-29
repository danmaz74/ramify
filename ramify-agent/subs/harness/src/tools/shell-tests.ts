import { basename, resolve } from 'node:path';

export type ShellTestRun =
  | { readonly kind: 'none' }
  | { readonly kind: 'focused'; readonly segment: string }
  | { readonly kind: 'whole-suite'; readonly segment: string; readonly reason: string };

/** Package scripts are facts supplied by the shell owner, keyed by absolute directory. */
export interface ShellTestFacts {
  readonly workingDirectory: string;
  readonly testScripts: Readonly<Record<string, string | null>>;
}

/** Directories whose package script may matter to classification. */
export function shellTestDirectories(command: string, workingDirectory: string): string[] {
  const directories = new Set([workingDirectory]);
  let cwd = workingDirectory;
  const tokens = tokenize(command);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i]?.value === 'cd' && tokens[i + 1] !== undefined && !tokens[i + 1]!.separator) {
      cwd = resolve(cwd, tokens[i + 1]!.value);
      directories.add(cwd);
    }
  }
  return [...directories];
}

interface Token { readonly value: string; readonly start: number; readonly end: number; readonly separator: boolean }

/** Recognize direct Vitest/Cucumber suite calls without executing any shell syntax. */
export function classifyShellTestRun(command: string, facts: ShellTestFacts): ShellTestRun {
  const tokens = tokenize(command);
  let begin = 0;
  let cwd = facts.workingDirectory;
  let focused: ShellTestRun = { kind: 'none' };
  for (let index = 0; index <= tokens.length; index += 1) {
    if (index < tokens.length && !tokens[index]!.separator) continue;
    const words = tokens.slice(begin, index);
    if (words[0]?.value === 'cd' && words[1] !== undefined && words.length === 2) {
      cwd = resolve(cwd, words[1].value);
    } else if (words.length > 0) {
      const segment = command.slice(words[0]!.start, words.at(-1)!.end);
      const result = classifySegment(words.map(word => word.value), segment, facts.testScripts[cwd] ?? null);
      if (result.kind === 'whole-suite') return result;
      if (result.kind === 'focused') focused = result;
    }
    begin = index + 1;
  }
  return focused;
}

function classifySegment(raw: string[], segment: string, testScript: string | null): ShellTestRun {
  const argv = [...raw];
  while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(argv[0] ?? '')) argv.shift();
  while (true) {
    const wrapper = argv[0];
    if (wrapper === 'env') {
      argv.shift();
      while (argv.length > 0) {
        if (argv[0] === '-u' || argv[0] === '--unset') { argv.splice(0, 2); continue; }
        if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(argv[0] ?? '')) { argv.shift(); continue; }
        break;
      }
      continue;
    }
    if (wrapper === 'time' || wrapper === 'nice' || wrapper === 'ionice') {
      argv.shift();
      while (argv[0]?.startsWith('-')) {
        const option = argv.shift();
        if (option === '-n' || option === '--adjustment' || option === '-c' || option === '--class' || option === '--classdata') argv.shift();
      }
      continue;
    }
    if (wrapper === 'timeout') { argv.splice(0, 2); continue; }
    break;
  }
  let executable = basename(argv.shift() ?? '');
  if (['npx', 'bunx', 'pnpm', 'yarn'].includes(executable) && (argv[0] === 'exec' || argv[0] === 'dlx')) argv.shift();
  if (executable === 'npm' && argv[0] === 'exec') { argv.shift(); if (argv.at(0) === '--') argv.shift(); executable = basename(argv.shift() ?? ''); }
  else if (['npx', 'bunx', 'pnpm', 'yarn'].includes(executable) && ['vitest', 'cucumber-js'].includes(basename(argv[0] ?? ''))) executable = basename(argv.shift()!);
  else if (['npm', 'pnpm', 'yarn'].includes(executable)) {
    let action = argv.shift();
    if (action === 'run') action = argv.shift();
    if (action !== 'test' && action !== 't') return { kind: 'none' };
    if (testScript === null) return { kind: 'none' };
    const script = tokenize(testScript).filter(token => !token.separator).map(token => token.value);
    let head = basename(script[0] ?? '');
    if (['npx', 'bunx', 'pnpm', 'yarn'].includes(head)) {
      if (script[1] === 'exec' || script[1] === 'dlx') script.splice(1, 1);
      head = basename(script[1] ?? '');
      script.shift();
    } else if (head === 'npm' && script[1] === 'exec') {
      script.splice(0, script[2] === '--' ? 3 : 2);
      head = basename(script[0] ?? '');
    }
    if (!['vitest', 'cucumber-js'].includes(head)) return { kind: 'none' };
    executable = head;
    if (argv[0] === '--') argv.shift();
    argv.unshift(...script.slice(1));
  }
  if (executable !== 'vitest' && executable !== 'cucumber-js') return { kind: 'none' };
  if (argv[0] === 'run' || argv[0] === 'exec') argv.shift();
  if (argv[0] === 'related') return argv.length > 1 ? { kind: 'focused', segment } : { kind: 'whole-suite', segment, reason: 'no file or directory was named' };
  let focused = false;
  let watch = argv[0] === 'watch';
  const valued = new Set([
    '-t', '--testNamePattern', '--project', '--reporter', '--shard', '--config', '--environment',
    '--pool', '--maxWorkers', '--minWorkers', '--testTimeout', '--retry', '--include', '--exclude',
    '--tags', '--profile', '--format', '--format-options', '--world-parameters', '--require', '--import', '--name',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]!;
    if (word === 'watch' || word === '--watch' || word.startsWith('--watch=') || word === '-w') { watch = true; continue; }
    if (word === '--changed' || word.startsWith('--changed=')) { focused = true; continue; }
    if (word === '--') continue;
    if (word === '--coverage') continue;
    if (valued.has(word)) { i += 1; continue; }
    if (word.startsWith('-')) continue;
    focused = true;
  }
  if (watch) return { kind: 'whole-suite', segment, reason: 'watch mode never ends on its own' };
  return focused ? { kind: 'focused', segment } : { kind: 'whole-suite', segment, reason: 'no test file or directory was named' };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let value = '';
  let start = -1;
  let quote: string | null = null;
  const flush = (end: number) => { if (start >= 0) tokens.push({ value, start, end, separator: false }); value = ''; start = -1; };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === '\\' && i + 1 < source.length) { if (start < 0) start = i; value += source[++i]; continue; }
    if (quote !== null) { if (char === quote) quote = null; else value += char; continue; }
    if (char === '\'' || char === '"') { if (start < 0) start = i; quote = char; continue; }
    if (/\s/u.test(char)) { flush(i); if (char === '\n') tokens.push({ value: char, start: i, end: i + 1, separator: true }); continue; }
    if (';&|'.includes(char)) { flush(i); const end = source[i + 1] === char ? ++i + 1 : i + 1; tokens.push({ value: source.slice(end - 1, end), start: end - 1, end, separator: true }); continue; }
    if (start < 0) start = i;
    value += char;
  }
  flush(source.length);
  return tokens;
}
