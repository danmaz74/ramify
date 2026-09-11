export const help = `Usage: ramify check [--root <dir>] [--format json] [--batch]
       ramify --help
       ramify --version

Check every owned source area in one project. The root and tsconfig.json
are discovered from the working directory; --root gives an explicit root.
--batch is accepted; each check currently uses a fresh analysis session.

Exit codes: 0 completed, 1 violations or invalid input, 2 unable to complete,
130 interrupted. Warnings and analysis limits alone do not fail a check.
Only check, help and version are available in this release.
`;

type Arguments = { readonly command: 'help' | 'version' }
  | { readonly command: 'check'; readonly root?: string; readonly format: 'human' | 'json'; readonly batch: boolean }
  | { readonly command: 'watch'; readonly root?: string; readonly format: 'human' | 'json' }
  | { readonly command: 'daemon'; readonly action: 'status' | 'stop'; readonly format: 'human' | 'json' };

/** Validate the entire invocation before dispatch, including duplicate flags. */
export function parseArguments(argv: readonly string[]): Arguments {
  if ((argv.length === 1 && argv[0] === '--help') || (argv.length === 2 && argv[0] === 'check' && argv[1] === '--help')) return { command: 'help' };
  if (argv.length === 1 && argv[0] === '--version') return { command: 'version' };
  const command = argv[0];
  if (command !== 'check' && command !== 'watch' && command !== 'daemon') {
    throw new Error(argv.length ? `Unavailable command: ${command}.` : 'Specify a command. Use ramify --help.');
  }
  const action = argv[1];
  if (command === 'daemon' && action !== 'status' && action !== 'stop') throw new Error('Specify daemon status or daemon stop.');
  let root: string | undefined;
  let format: 'human' | 'json' = 'human';
  let batch = false;
  const flags = command === 'check' ? ['--root', '--format', '--batch']
    : command === 'watch' ? ['--root', '--format'] : ['--format'];
  const seen = new Set<string>();
  for (let index = command === 'daemon' ? 2 : 1; index < argv.length; index++) {
    const flag = argv[index];
    if (!flags.includes(flag)) throw new Error(`Unsupported argument: ${flag}`);
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--batch') { batch = true; continue; }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--root') root = value;
    else {
      if (value !== 'json') throw new Error(`Unsupported format: ${value}. Use --format json or omit it for human output.`);
      format = 'json';
    }
  }
  const project = { ...(root === undefined ? {} : { root }), format };
  if (command === 'check') return { command, ...project, batch };
  if (command === 'watch') return { command, ...project };
  if (action === 'status' || action === 'stop') return { command, action, format };
  throw new Error('Specify daemon status or daemon stop.');
}
