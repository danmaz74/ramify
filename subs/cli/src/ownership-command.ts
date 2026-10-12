import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { CliEnvironment, CliExitCode, OwnershipDocument } from './interfaces/cli.js';
import { CliFailure, withFailureOutput } from './errors.js';

interface OwnershipArguments {
  readonly root?: string;
  readonly format: 'human' | 'json';
  readonly paths: readonly string[];
}

function formatOwnership(document: OwnershipDocument): string {
  if (document.status !== 'answered') return `Ownership ${document.status}.\n`
    + document.diagnostics.map(item => `${item.location ? `${item.location.file}:${item.location.line}:${item.location.column}: ` : ''}[${item.code}] ${item.message}\n`).join('') + `Root: ${document.root ?? 'unavailable'}\nNo ownership answer claimed.\n`;
  return `Root: ${document.root}\nInput: ${document.inputId}\nConfiguration: ${document.scope.configuration}\n`
    + document.paths.map(({ path, ownership }) => {
      if (ownership.status === 'owned') return `Path ${path}: owned by ${ownership.module} (${ownership.directory})`
        + (ownership.exclusion ? `, ${ownership.exclusion.kind} ${ownership.exclusion.directory}` : '') + '\n';
      if (ownership.status === 'excluded') return `Path ${path}: excluded (${ownership.exclusion.kind} ${ownership.exclusion.directory})\n`;
      if (ownership.status === 'outside-project') return `Path ${path}: outside the project\n`;
      return `Path ${path}: ${ownership.message}\n`;
    }).join('') + document.warnings.map(item => `Warning [${item.code}] ${item.path}: ${item.message}\n`).join('');
}

export async function ownershipCommand(args: OwnershipArguments, environment: CliEnvironment, control: RunControl): Promise<CliExitCode> {
  control.signal?.throwIfAborted();
  if (!environment.ownershipBatch) throw new CliFailure('unavailable', 'This client has no ownership batch operation', null);
  const result = await environment.ownershipBatch({ cwd: environment.cwd,
    ...(args.root === undefined ? {} : { root: args.root }), paths: args.paths }, control);
  if (control.signal?.aborted || result.status === 'cancelled') {
    environment.stderr('Interrupted; no result claimed.\n');
    return 130;
  }
  const document: OwnershipDocument = { schemaVersion: 'ramify.ownership/1', ramifyVersion: environment.version, ...result };
  const output = (): void => environment.stdout(args.format === 'json' ? JSON.stringify(document) + '\n' : formatOwnership(document));
  if (result.status === 'answered') output();
  else withFailureOutput({ ...result, reason: `ownership-${result.status}`, message: `Ownership ${result.status}` }, output);
  return document.exitCode;
}
