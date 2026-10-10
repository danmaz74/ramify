/** The default port of `serve`. */
export const defaultPort = 4180;

/** The agents `serve --agent` and `session --agent` accept: pi, with the person's own pi login, and `fake`, the scripted fake. `serve` has no default; `session` defaults to pi. */
export const agentNames = ['pi', 'fake'] as const;
export type AgentName = typeof agentNames[number];

/** Where a session's prompt comes from: the command line, or a file read when the command runs. */
export type PromptSource = { readonly text: string } | { readonly file: string };

/** The files `step inputs` reads in place of parts of the recorded inputs, by the option that names each. */
export interface AuthoredFiles {
  readonly workItem?: string;
  readonly outline?: string;
  readonly assignment?: string;
  readonly selection?: string;
  readonly reviewRequest?: string;
}

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
  | {
      readonly command: 'step';
      readonly step:
        | { readonly command: 'inputs'; readonly role: string; readonly fromRun: string | undefined; readonly invocation: string | undefined; readonly out: string | undefined;
            readonly projectRoot: string | undefined; readonly authored: AuthoredFiles }
        | { readonly command: 'render'; readonly inputs: string; readonly projectRoot: string; readonly invocation: string | undefined }
        | { readonly command: 'run'; readonly inputs: string; readonly run: string; readonly agent: SessionAgent };
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
  '                       [--agent pi [--model <provider/model[:level]>] | --agent fake --script <file>]',
  '                       [--write <project-relative path>]... [--gate]',
  '  ramify-agent step inputs --role <engineer|local-architect|context-selector|reviewer> --from-run <run dir> --invocation <id>',
  '                       [--work-item <file>] [--outline <file>] [--assignment <file>] [--selection <file>] [--review-request <file>] [--out <file>]',
  '                       Imports one invocation\'s recorded inputs as a fresh start; compares the delivery as a diagnostic.',
  '                       Authored files replace parts of them, each judged as its producing role\'s output with the run\'s context.',
  '  ramify-agent step inputs --role engineer --project <root> --work-item <file> [--outline <file>] --assignment <file> [--out <file>]',
  '                       Authors engineer inputs with no run: the assignment is judged as the local architect\'s first work turn',
  '                       of the work item against the project and its materialized architect view, which is never materialized.',
  '  ramify-agent step render --inputs <file> [--project <root>] [--invocation <id>]',
  '                       Prints what the step\'s session receives. Takes no lock and writes nothing.',
  '  ramify-agent step run --inputs <file> --run <project>/plans/<plan>/.harness/jobs/<run>',
  '                       [--agent pi [--model <provider/model[:level]>] | --agent fake --script <file>]',
  '                       Runs one invocation from the inputs in a manual run, created where it does not exist, under the project lock.',
  '                       Uses the tree as it stands and records its base commit and whether it was dirty; never commits.',
  '                       Exits 0 for an accepted submission, 1 for any other ending, 2 when refused or not started.',
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
  if (command === 'step') return parseStep(rest);
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
  if (model !== undefined && agent === 'fake') throw new UsageError('--model applies to --agent pi only');
  if (script !== undefined && agent !== 'fake') throw new UsageError('--script applies to --agent fake only');
  if (agent === 'fake' && script === undefined) throw new UsageError('--agent fake needs --script <file>');
  return {
    command: 'session',
    projectRoot,
    module,
    prompt: text !== undefined ? { text } : { file: file! },
    agent: agent === 'fake' ? { name: 'fake', script: script! } : { name: 'pi', model },
    write,
    gate,
  };
}

function parseStep(rest: readonly string[]): CommandLine {
  const [subcommand, ...flags] = rest;
  if (subcommand === 'inputs') {
    let role: string | undefined;
    let fromRun: string | undefined;
    let invocation: string | undefined;
    let out: string | undefined;
    let projectRoot: string | undefined;
    const authored: { -readonly [K in keyof AuthoredFiles]: AuthoredFiles[K] } = {};
    const files = { '--work-item': 'workItem', '--outline': 'outline', '--assignment': 'assignment', '--selection': 'selection', '--review-request': 'reviewRequest' } as const;
    options(flags, (flag, value, _inline, argument) => {
      if (flag === '--role') role = value();
      else if (flag === '--from-run') fromRun = value();
      else if (flag === '--invocation') invocation = value();
      else if (flag === '--out') out = value();
      else if (flag === '--project') projectRoot = value();
      else if (flag in files) authored[files[flag as keyof typeof files]] = value();
      else throw new UsageError(`Unknown option "${argument}"`);
    });
    if (role === undefined) throw new UsageError('step inputs needs --role <role>');
    // Authored files without a run are judged against the project by the
    // command, which refuses those that need a run's context with what they lack.
    if (fromRun === undefined && Object.keys(authored).length === 0) throw new UsageError('step inputs needs --from-run <run dir>, or --project <root> with authored files');
    if (fromRun !== undefined && invocation === undefined) throw new UsageError('step inputs --from-run needs --invocation <id>');
    if (fromRun !== undefined && projectRoot !== undefined) throw new UsageError('step inputs takes its project from the run named by --from-run; --project is for inputs authored without one');
    return { command: 'step', step: { command: 'inputs', role, fromRun, invocation, out, projectRoot, authored } };
  }
  if (subcommand === 'render') {
    let inputs: string | undefined;
    let projectRoot: string | undefined;
    let invocation: string | undefined;
    options(flags, (flag, value, _inline, argument) => {
      if (flag === '--inputs') inputs = value();
      else if (flag === '--project') projectRoot = value();
      else if (flag === '--invocation') invocation = value();
      else throw new UsageError(`Unknown option "${argument}"`);
    });
    if (inputs === undefined) throw new UsageError('step render needs --inputs <file>');
    return { command: 'step', step: { command: 'render', inputs, projectRoot: projectRoot ?? '.', invocation } };
  }
  if (subcommand === 'run') {
    let inputs: string | undefined;
    let run: string | undefined;
    let agent: AgentName | undefined;
    let model: string | undefined;
    let script: string | undefined;
    options(flags, (flag, value, _inline, argument) => {
      if (flag === '--inputs') inputs = value();
      else if (flag === '--run') run = value();
      else if (flag === '--agent') agent = agentName(value());
      else if (flag === '--model') model = value();
      else if (flag === '--script') script = value();
      else throw new UsageError(`Unknown option "${argument}"`);
    });
    if (inputs === undefined) throw new UsageError('step run needs --inputs <file>');
    if (run === undefined) throw new UsageError('step run needs --run <manual run dir>');
    if (model !== undefined && agent === 'fake') throw new UsageError('--model applies to --agent pi only');
    if (script !== undefined && agent !== 'fake') throw new UsageError('--script applies to --agent fake only');
    if (agent === 'fake' && script === undefined) throw new UsageError('--agent fake needs --script <file>');
    return { command: 'step', step: { command: 'run', inputs, run, agent: agent === 'fake' ? { name: 'fake', script: script! } : { name: 'pi', model } } };
  }
  throw new UsageError(subcommand === undefined ? 'step needs a subcommand: inputs, render or run' : `Unknown step subcommand "${subcommand}"`);
}
