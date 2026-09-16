export const help = `Usage: ramify check [--root <dir>] [--format json] [--batch]
                    [--changed <path>...] [--since <revision>] [--deadline <ms>]
       ramify watch [--root <dir>] [--format json]
       ramify materialize [--from <path>] [--all] [--root <dir>]
       ramify explore [--root <dir>]
       ramify daemon status|stop [--format json]
       ramify --help
       ramify --version

Check every owned source area in one project. The root and tsconfig.json
are discovered from the working directory; --root gives an explicit root.

  check            Complete check through the resident daemon. Waits, with no
                   deadline, for a revision covering every current input,
                   configuration changes included.
  check --batch    Independent complete check in a fresh session that trusts no
                   daemon state.
  check --changed  Bounded hook check. Hashes the named paths relative to the
                   root and waits for a daemon revision covering them; it never
                   falls back to batch. A named configuration file, such as
                   tsconfig.json, a file it extends or a package manifest, is
                   answered at once as not checked while the daemon verifies it.
                   --deadline bounds the wait (default 2000 ms; maximum
                   600000 ms) but does not delay that reply. --since marks
                   findings added since that revision.
--since and --deadline require --changed; --changed cannot accompany --batch.
Watch streams revisions until interrupted. Status and stop never start a daemon.

materialize refreshes one module's or the whole project's generated .ramify
catalogs from one synchronized revision, then safely replaces them. --from
names the module to refresh, resolved relative to the working directory;
absence uses that directory. --all refreshes every module; --all and --from
are mutually exclusive. There is no --batch, --changed or --format for
materialize, and it never falls back to batch.

explore selects one project through the resident daemon, starts or reuses the
local explorer process, opens its opaque context URL in the platform browser
and exits. It never falls back to batch analysis.

Exit codes: 0 completed, 1 violations or invalid input, 2 unable to complete,
130 interrupted. Warnings and analysis limits alone do not fail a check.
Changed checks: 0 checked with no findings, 1 findings or invalid revision,
2 not checked (including cold, deadline, unobserved or superseded content, and a
named configuration file).
materialize: 0 every requested target complete, 1 the project is invalid,
2 unavailable, partial/rollback failure, deadline or supersession, 130 interrupted.
`;

type Arguments = { readonly command: 'help' | 'version' }
  | { readonly command: 'check'; readonly root?: string; readonly format: 'human' | 'json'; readonly batch: boolean;
      readonly changed?: readonly string[]; readonly since?: string; readonly deadlineMs?: number }
  | { readonly command: 'watch'; readonly root?: string; readonly format: 'human' | 'json' }
  | { readonly command: 'daemon'; readonly action: 'status' | 'stop'; readonly format: 'human' | 'json' }
  | { readonly command: 'materialize'; readonly root?: string; readonly from?: string; readonly all: boolean }
  | { readonly command: 'explore'; readonly root?: string };

/** Validate the entire invocation before dispatch, including duplicate flags. */
export function parseArguments(argv: readonly string[]): Arguments {
  if ((argv.length === 1 && argv[0] === '--help') || (argv.length === 2 && argv[0] === 'check' && argv[1] === '--help')) return { command: 'help' };
  if (argv.length === 1 && argv[0] === '--version') return { command: 'version' };
  const command = argv[0];
  if (command !== 'check' && command !== 'watch' && command !== 'daemon' && command !== 'materialize' && command !== 'explore') {
    throw new Error(argv.length ? `Unavailable command: ${command}.` : 'Specify a command. Use ramify --help.');
  }
  const action = argv[1];
  if (command === 'daemon' && action !== 'status' && action !== 'stop') throw new Error('Specify daemon status or daemon stop.');
  let root: string | undefined;
  let format: 'human' | 'json' = 'human';
  let batch = false;
  let changed: string[] | undefined, since: string | undefined, deadlineMs: number | undefined;
  let from: string | undefined, all = false;
  const flags = command === 'check' ? ['--root', '--format', '--batch', '--changed', '--since', '--deadline']
    : command === 'watch' ? ['--root', '--format'] : command === 'materialize' ? ['--root', '--from', '--all']
    : command === 'explore' ? ['--root'] : ['--format'];
  const seen = new Set<string>();
  for (let index = command === 'daemon' ? 2 : 1; index < argv.length; index++) {
    const flag = argv[index];
    if (!flags.includes(flag)) throw new Error(`Unsupported argument: ${flag}`);
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--batch') { batch = true; continue; }
    if (flag === '--all') { all = true; continue; }
    if (flag === '--changed') {
      changed = [];
      while (index + 1 < argv.length && !argv[index + 1].startsWith('-')) {
        const path = argv[++index];
        if (!path) throw new Error('Empty path for --changed');
        changed.push(path);
      }
      if (!changed.length) throw new Error('Missing value for --changed');
      continue;
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--root') root = value;
    else if (flag === '--from') from = value;
    else if (flag === '--since') {
      if (value.match(/^rev\/1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*$/)?.[0] !== value) {
        throw new Error('Invalid revision for --since; expected rev/1:<generation>:<sequence>');
      }
      since = value;
    } else if (flag === '--deadline') {
      const parsed = Number(value);
      if (value.match(/^\d+$/)?.[0] !== value || !Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 600_000) {
        throw new Error('Invalid --deadline; expected a positive integer at most 600000 ms');
      }
      deadlineMs = parsed;
    }
    else {
      if (value !== 'json') throw new Error(`Unsupported format: ${value}. Use --format json or omit it for human output.`);
      format = 'json';
    }
  }
  const project = { ...(root === undefined ? {} : { root }), format };
  if (command === 'check') {
    if (changed && batch) throw new Error('--changed cannot be combined with --batch');
    if (!changed && (since !== undefined || deadlineMs !== undefined)) throw new Error('--since and --deadline require --changed');
    return { command, ...project, batch, ...(changed ? { changed } : {}),
      ...(since === undefined ? {} : { since }), ...(deadlineMs === undefined ? {} : { deadlineMs }) };
  }
  if (command === 'watch') return { command, ...project };
  if (command === 'materialize') {
    if (all && from !== undefined) throw new Error('--all cannot be combined with --from');
    return { command, ...(root === undefined ? {} : { root }), ...(from === undefined ? {} : { from }), all };
  }
  if (command === 'explore') return { command, ...(root === undefined ? {} : { root }) };
  if (action === 'status' || action === 'stop') return { command, action, format };
  throw new Error('Specify daemon status or daemon stop.');
}
