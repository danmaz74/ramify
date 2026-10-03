import type { MaterializeViewId } from '../../../src/interfaces/service.js';

export const help = `Usage: ramify check [--root <dir>] [--format json [--no-snapshot]] [--batch]
                    [--changed <path>...] [--since <revision>] [--deadline <ms>]
       ramify watch [--root <dir>] [--format json]
       ramify materialize [--from <path>] [--all] [--root <dir>]
       ramify materialize --view <api|architect>... [--from <path> | --all] [--root <dir>]
       ramify measure [--root <dir>] [--format json]
       ramify affected [<module-id>...] [--path <path>]... [--root <dir>] [--batch]
                       [--format human|json]
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
  --no-snapshot    Leave the snapshot of every evaluated import out of a
                   complete check's JSON report. The report keeps its schema
                   and sets "snapshot": null; its summary, outcome and findings
                   are unchanged.
--since and --deadline require --changed; --changed cannot accompany --batch.
--no-snapshot requires --format json and cannot accompany --changed.
Watch streams revisions until interrupted. Status and stop never start a daemon.

materialize refreshes one module's or the whole project's generated .ramify
catalogs from one synchronized revision, then safely replaces them. --from
names the module to refresh, resolved relative to the working directory;
absence uses that directory. --all refreshes every module; --all and --from
are mutually exclusive. There is no --batch, --changed or --format for
materialize, and it never falls back to batch.
--view selects the generated views, each at most once: api, the .ramify
catalogs, and architect, the whole project's .ramify-architect view with its
dependency facts. Without --view, materialize refreshes the API view alone.
--from and --all apply to the API view only and require --view api when
--view is given. Every requested view comes from one revision and is published
in one transaction.

measure prints revision-bound context-size buckets for every module and the
owned file inventory. --format json prints the ramify.measure/1 document;
without it, measure prints a short exact/subtree table. It is a synchronized,
whole-project daemon query: it writes nothing and never falls back to batch.

affected selects the modules whose tests a change calls for. Seeds are module
IDs and --path paths relative to the root, as the inventory spells them; give at
least one. The answer lists the changed modules, the modules that depend on
them, and the test modules, from one revision's dependency facts. A path
outside every module widens the answer to all modules, as does partial
coverage; the widening reasons are printed. Without --batch it is a
synchronized resident query that never falls back to batch; --batch answers
from a fresh session that trusts no daemon state. --format json prints one
ramify.affected-cli/2 document. --changed, --since and --deadline do not apply.

explore selects one project through the resident daemon, starts or reuses that
project's resident explorer server, prints its /analysis/latest URL, opens it in
the platform browser and exits. The server keeps running after explore exits,
also when the browser cannot be opened; stop it with a signal. explore never
falls back to batch analysis.

Exit codes: 0 completed, 1 violations or invalid input, 2 unable to complete,
130 interrupted. Warnings and analysis limits alone do not fail a check.
Changed checks: 0 checked with no findings, 1 findings or invalid revision,
2 not checked (including cold, deadline, unobserved or superseded content, and a
named configuration file).
materialize: 0 every requested target complete, 1 the project is invalid,
2 unavailable, partial/rollback failure, deadline, supersession or incompatible
service, 130 interrupted.
measure: 0 one complete document, 1 the project is invalid, 2 unavailable,
pending, cold, deadline, supersession, resource refusal or incompatible service,
130 interrupted.
affected: 0 one complete answer, including an all-modules answer, 1 the project
is invalid, a module ID is unknown or a seed is invalid, 2 unavailable (including
a project that cannot be found), pending, cold, supersession or incompatible
service, 130 interrupted.
`;

type Arguments = { readonly command: 'help' | 'version' }
  | { readonly command: 'check'; readonly root?: string; readonly format: 'human' | 'json'; readonly batch: boolean;
      readonly changed?: readonly string[]; readonly since?: string; readonly deadlineMs?: number;
      /** Present only when `--no-snapshot` was given. */
      readonly snapshot?: false }
  | { readonly command: 'watch'; readonly root?: string; readonly format: 'human' | 'json' }
  | { readonly command: 'daemon'; readonly action: 'status' | 'stop'; readonly format: 'human' | 'json' }
  | { readonly command: 'materialize'; readonly root?: string; readonly from?: string; readonly all: boolean;
      /** Present only when `--view` was given, in the order given. */
      readonly views?: readonly MaterializeViewId[] }
  | { readonly command: 'measure'; readonly root?: string; readonly format: 'human' | 'json' }
  | { readonly command: 'affected'; readonly root?: string; readonly format: 'human' | 'json'; readonly batch: boolean;
      readonly modules: readonly string[]; readonly paths: readonly string[] }
  | { readonly command: 'explore'; readonly root?: string };

/** Validate the entire invocation before dispatch, including duplicate flags. */
export function parseArguments(argv: readonly string[]): Arguments {
  if ((argv.length === 1 && argv[0] === '--help') || (argv.length === 2 && argv[0] === 'check' && argv[1] === '--help')) return { command: 'help' };
  if (argv.length === 1 && argv[0] === '--version') return { command: 'version' };
  const command = argv[0];
  if (command !== 'check' && command !== 'watch' && command !== 'daemon' && command !== 'materialize' && command !== 'measure'
    && command !== 'explore' && command !== 'affected') {
    throw new Error(argv.length ? `Unavailable command: ${command}.` : 'Specify a command. Use ramify --help.');
  }
  const action = argv[1];
  if (command === 'daemon' && action !== 'status' && action !== 'stop') throw new Error('Specify daemon status or daemon stop.');
  let root: string | undefined;
  let format: 'human' | 'json' = 'human';
  let batch = false, noSnapshot = false;
  let changed: string[] | undefined, since: string | undefined, deadlineMs: number | undefined;
  let from: string | undefined, all = false, views: MaterializeViewId[] | undefined;
  const modules: string[] = [], paths: string[] = [];
  const flags = command === 'check' ? ['--root', '--format', '--batch', '--no-snapshot', '--changed', '--since', '--deadline']
    : command === 'affected' ? ['--root', '--format', '--batch', '--path']
    : command === 'watch' || command === 'measure' ? ['--root', '--format'] : command === 'materialize' ? ['--root', '--from', '--all', '--view']
    : command === 'explore' ? ['--root'] : ['--format'];
  const seen = new Set<string>();
  for (let index = command === 'daemon' ? 2 : 1; index < argv.length; index++) {
    const flag = argv[index];
    // An affected module ID is any operand that is not an option.
    if (command === 'affected' && flag && !flag.startsWith('-')) { modules.push(flag); continue; }
    if (!flags.includes(flag)) throw new Error(`Unsupported argument: ${flag}`);
    // --path repeats, once per path seed.
    if (flag === '--path') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --path');
      paths.push(value);
      continue;
    }
    // --view repeats, once per view.
    if (flag === '--view') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --view');
      if (value !== 'api' && value !== 'architect') throw new Error(`Unsupported view: ${value}. Use --view api or --view architect.`);
      views ??= [];
      if (views.includes(value)) throw new Error(`Duplicate view: ${value}`);
      views.push(value);
      continue;
    }
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--batch') { batch = true; continue; }
    if (flag === '--no-snapshot') { noSnapshot = true; continue; }
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
      if (command === 'affected' && value === 'human') { format = 'human'; continue; }
      if (value !== 'json') throw new Error(command === 'affected'
        ? `Unsupported format: ${value}. Use --format json or --format human, or omit it for human output.`
        : `Unsupported format: ${value}. Use --format json or omit it for human output.`);
      format = 'json';
    }
  }
  const project = { ...(root === undefined ? {} : { root }), format };
  if (command === 'check') {
    if (changed && batch) throw new Error('--changed cannot be combined with --batch');
    if (!changed && (since !== undefined || deadlineMs !== undefined)) throw new Error('--since and --deadline require --changed');
    // A changed check's ramify.check/1 document has no snapshot to leave out.
    if (changed && noSnapshot) throw new Error('--no-snapshot cannot be combined with --changed');
    if (noSnapshot && format !== 'json') throw new Error('--no-snapshot requires --format json');
    return { command, ...project, batch, ...(changed ? { changed } : {}),
      ...(since === undefined ? {} : { since }), ...(deadlineMs === undefined ? {} : { deadlineMs }),
      ...(noSnapshot ? { snapshot: false as const } : {}) };
  }
  if (command === 'watch') return { command, ...project };
  if (command === 'measure') return { command, ...project };
  if (command === 'affected') {
    if (!modules.length && !paths.length) throw new Error('affected requires at least one module ID or --path');
    return { command, ...project, batch, modules, paths };
  }
  if (command === 'materialize') {
    if (all && from !== undefined) throw new Error('--all cannot be combined with --from');
    if (views && !views.includes('api') && (all || from !== undefined)) throw new Error('--from and --all select the API view; add --view api');
    return { command, ...(root === undefined ? {} : { root }), ...(from === undefined ? {} : { from }), all, ...(views ? { views } : {}) };
  }
  if (command === 'explore') return { command, ...(root === undefined ? {} : { root }) };
  if (action === 'status' || action === 'stop') return { command, action, format };
  throw new Error('Specify daemon status or daemon stop.');
}
