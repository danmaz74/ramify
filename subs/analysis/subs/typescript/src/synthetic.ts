import { dirname, relative, resolve } from 'node:path';
import { classifyProjectPath } from '../../project/src/ownership.js';
import type { ProjectInventory } from '../../project/src/interfaces/project.js';
import { FILE_BYTES, SourceFailure, encode } from './wire.js';

/** The virtual compiler inputs one project state generates: a synthetic
 * configuration extending the selected one with every owned source as an
 * explicit root, and a witness importing every owned resource. Shared by the
 * finite helper and the retained adapter so both regenerate the same bytes. */
export interface SyntheticInputs {
  readonly configuration: string;
  readonly configurationBytes: number;
  readonly witness: string;
  /** The import statements plus the module marker, as accounted by the helper. */
  readonly witnessBytes: number;
}

// Inspect only solution-style metadata. The compiler owns option/configuration
// inheritance and file selection; this never interprets compiler settings.
export function referencesOnly(text: string, selectedFiles: readonly string[]): boolean {
  const clean = text.replace(/^\uFEFF/, '').replace(/("(?:[^"\\]|\\.)*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (match, string: string | undefined) => string ?? match.replace(/[^\r\n]/g, ' '));
  let metadata: Record<string, unknown>;
  try { metadata = JSON.parse(clean.replace(/("(?:[^"\\]|\\.)*")|,\s*(?=[}\]])/g, (_match, string: string | undefined) => string ?? '')); }
  catch { throw new SourceFailure('unavailable', 'The selected compiler configuration could not be parsed'); }
  return !!(Array.isArray(metadata.references) && metadata.references.length && !selectedFiles.length);
}

/** The candidate virtual paths beside the configuration, in probe order. */
export function syntheticCandidate(configuration: string, candidate: number): { readonly configuration: string; readonly witness: string } {
  return {
    configuration: resolve(dirname(configuration), `.ramify-source-inputs-${candidate}.json`),
    witness: resolve(dirname(configuration), `.ramify-source-inputs-${candidate}.ts`),
  };
}

/**
 * Whether a configuration-selected file lies in a declared nested tree or a
 * module scratch directory. Discovery never enters those, so the synthetic
 * configuration never roots their files, whatever the configuration selects.
 */
function unanalyzedSelection(inventory: ProjectInventory, file: string): boolean {
  const path = relative(inventory.scope.root, file);
  if (path === '') return false;
  const owned = classifyProjectPath(inventory.scope, path);
  const exclusion = owned.status === 'owned' || owned.status === 'excluded' ? owned.exclusion : null;
  return exclusion?.kind === 'owned-ignored' || exclusion?.kind === 'external' || exclusion?.kind === 'scratch';
}

export function syntheticInputs(inventory: ProjectInventory, configuration: string, selectedFiles: readonly string[],
  resourceWitness: string): SyntheticInputs {
  const root = inventory.scope.root;
  const roots = new Set(selectedFiles.filter(file => !unanalyzedSelection(inventory, file)));
  for (const file of inventory.files) if (file.kind === 'source') roots.add(resolve(root, file.path));
  roots.add(resourceWitness);
  const configurationBytes = encode({ extends: configuration, files: [...roots].sort(), include: [], exclude: [] }, FILE_BYTES);
  const imports: string[] = [];
  let witnessBytes = 0;
  for (const file of inventory.files) {
    if (file.kind !== 'resource') continue;
    let specifier = relative(dirname(resourceWitness), resolve(root, file.path));
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    const statement = `import * as ramifyResource${imports.length} from ${JSON.stringify(specifier)};\n`;
    if (witnessBytes + Buffer.byteLength(statement) > FILE_BYTES) throw new SourceFailure('resource-limit', 'Resource witness exceeds the source file byte limit');
    witnessBytes += Buffer.byteLength(statement); imports.push(statement);
  }
  // A module marker also keeps an empty witness independent of shared globals.
  if (witnessBytes + 11 > FILE_BYTES) throw new SourceFailure('resource-limit', 'Resource witness exceeds the source file byte limit');
  return { configuration: configurationBytes.toString('utf8'), configurationBytes: configurationBytes.length,
    witness: `${imports.join('')}export {};\n`, witnessBytes: witnessBytes + 11 };
}
