/** The default port of `serve`. */
export const defaultPort = 4180;

/** The agents `serve --agent` and `session --agent` accept: pi, with the person's own pi login, and `fake`, the scripted fake. Neither is the default. */
export const agentNames = ['pi', 'fake'] as const;
export type AgentName = typeof agentNames[number];

/** Where a session's prompt comes from: the command line, or a file read when the command runs. */
export type PromptSource = { readonly text: string } | { readonly file: string };

/** The agent one session runs on. */
export type SessionAgent =
  | { readonly name: 'pi'; readonly model: string | undefined }
  | { readonly name: 'fake'; readonly script: string };

export type CommandLine =
  | { readonly command: 'serve'; readonly projectRoot: string; readonly port: number; readonly agent: AgentName | undefined; readonly model: string | undefined }
  | {
      readonly command: 'session';
      readonly projectRoot: string;
      readonly module: string;
      readonly prompt: PromptSource;
      readonly agent: SessionAgent;
      readonly write: readonly string[];
      readonly gate: boolean;
    }
  | { readonly command: 'help' };

/** Thrown for a command line that cannot be run; the message says why. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const usage = [
  'Usage:',
  '  ramify-agent serve --project <root> [--port <n>] [--agent pi [--model <provider/model>] | --agent fake]',
  '  ramify-agent session --project <root> --module <module-path>',
  '                       (--prompt <text> | --prompt-file <file>)',
  '                       (--agent pi [--model <provider/model[:level]>] | --agent fake --script <file>)',
  '                       [--write <project-relative path>]... [--gate]',
].join('\n');

/** Reads `--flag value` and `--flag=value` pairs, one argument at a time. */
function options(rest: readonly string[], take: (flag: string, value: () => string, inline: string | undefined, argument: string) => void): void {
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index]!;
    const [flag, inline] = argument.startsWith('--') && argument.includes('=')
      ? [argument.slice(0, argument.indexOf('=')), argument.slice(argument.indexOf('=') + 1)]
      : [argument, undefined];
    const value = (): string => {
      const next = inline ?? rest[++index];
      if (next === undefined || next === '') throw new UsageError(`${flag} needs a value`);
      return next;
    };
    take(flag, value, inline, argument);
  }
}

function agentName(name: string): AgentName {
  if (!(agentNames as readonly string[]).includes(name)) throw new UsageError(`--agent must be one of ${agentNames.join(', ')}, not "${name}"`);
  return name as AgentName;
}

/** Parses the arguments after the executable and script. */
export function parseCommandLine(argv: readonly string[]): CommandLine {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') return { command: 'help' };
  if (command === 'serve') return parseServe(rest);
  if (command === 'session') return parseSession(rest);
  throw new UsageError(`Unknown command "${command}"`);
}

function parseServe(rest: readonly string[]): CommandLine {
  let projectRoot: string | undefined;
  let port = defaultPort;
  let agent: AgentName | undefined;
  let model: string | undefined;
  options(rest, (flag, value, _inline, argument) => {
    if (flag === '--project') projectRoot = value();
    else if (flag === '--port') {
      const text = value();
      port = Number(text);
      if (!/^\d+$/.test(text) || port > 65535) throw new UsageError(`--port must be a port number, not "${text}"`);
    } else if (flag === '--agent') agent = agentName(value());
    else if (flag === '--model') model = value();
    else throw new UsageError(`Unknown option "${argument}"`);
  });
  if (projectRoot === undefined) throw new UsageError('serve needs --project <root>');
  if (model !== undefined && agent !== 'pi') throw new UsageError('--model applies to --agent pi only');
  return { command: 'serve', projectRoot, port, agent, model };
}

function parseSession(rest: readonly string[]): CommandLine {
  let projectRoot: string | undefined;
  let module: string | undefined;
  let text: string | undefined;
  let file: string | undefined;
  let agent: AgentName | undefined;
  let model: string | undefined;
  let script: string | undefined;
  const write: string[] = [];
  let gate = false;
  options(rest, (flag, value, inline, argument) => {
    if (flag === '--project') projectRoot = value();
    else if (flag === '--module') module = value();
    else if (flag === '--prompt') text = value();
    else if (flag === '--prompt-file') file = value();
    else if (flag === '--agent') agent = agentName(value());
    else if (flag === '--model') model = value();
    else if (flag === '--script') script = value();
    else if (flag === '--write') write.push(value());
    else if (flag === '--gate') {
      if (inline !== undefined) throw new UsageError('--gate takes no value');
      gate = true;
    } else throw new UsageError(`Unknown option "${argument}"`);
  });
  if (projectRoot === undefined) throw new UsageError('session needs --project <root>');
  if (module === undefined) throw new UsageError('session needs --module <module-path>');
  if (text !== undefined && file !== undefined) throw new UsageError('Give the prompt once: --prompt or --prompt-file, not both');
  if (text === undefined && file === undefined) throw new UsageError('session needs a prompt: --prompt <text> or --prompt-file <file>');
  if (text !== undefined && text.trim() === '') throw new UsageError('--prompt needs a value');
  if (agent === undefined) throw new UsageError('session needs --agent pi, or --agent fake with --script <file>');
  if (model !== undefined && agent !== 'pi') throw new UsageError('--model applies to --agent pi only');
  if (script !== undefined && agent !== 'fake') throw new UsageError('--script applies to --agent fake only');
  if (agent === 'fake' && script === undefined) throw new UsageError('--agent fake needs --script <file>');
  return {
    command: 'session',
    projectRoot,
    module,
    prompt: text !== undefined ? { text } : { file: file! },
    agent: agent === 'pi' ? { name: 'pi', model } : { name: 'fake', script: script! },
    write,
    gate,
  };
}
