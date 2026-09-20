/** The default port of `serve`. */
export const defaultPort = 4180;

/** The agents `serve --agent` accepts: pi, with the person's own pi login, and `fake`, the scripted fake. Neither is the default. */
export const agentNames = ['pi', 'fake'] as const;
export type AgentName = typeof agentNames[number];

export type CommandLine =
  | { readonly command: 'serve'; readonly projectRoot: string; readonly port: number; readonly agent: AgentName | undefined; readonly model: string | undefined }
  | { readonly command: 'help' };

/** Thrown for a command line that cannot be run; the message says why. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const usage = 'Usage: ramify-agent serve --project <root> [--port <n>] [--agent pi [--model <provider/model>] | --agent fake]';

/** Parses the arguments after the executable and script. */
export function parseCommandLine(argv: readonly string[]): CommandLine {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') return { command: 'help' };
  if (command !== 'serve') throw new UsageError(`Unknown command "${command}"`);
  let projectRoot: string | undefined;
  let port = defaultPort;
  let agent: AgentName | undefined;
  let model: string | undefined;
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
    if (flag === '--project') projectRoot = value();
    else if (flag === '--port') {
      const text = value();
      port = Number(text);
      if (!/^\d+$/.test(text) || port > 65535) throw new UsageError(`--port must be a port number, not "${text}"`);
    } else if (flag === '--agent') {
      const name = value();
      if (!(agentNames as readonly string[]).includes(name)) throw new UsageError(`--agent must be one of ${agentNames.join(', ')}, not "${name}"`);
      agent = name as AgentName;
    } else if (flag === '--model') model = value();
    else throw new UsageError(`Unknown option "${argument}"`);
  }
  if (projectRoot === undefined) throw new UsageError('serve needs --project <root>');
  if (model !== undefined && agent !== 'pi') throw new UsageError('--model applies to --agent pi only');
  return { command: 'serve', projectRoot, port, agent, model };
}
