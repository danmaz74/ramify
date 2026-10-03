import { join } from 'node:path';
import { createProjectFixture, projectFixtureFiles } from '../plan1/project.js';
import { replaceExactlyOnce } from '../../mutation.js';

export const providerApi = 'subs/provider/src/interfaces/api.ts';
export const consumerProbe = 'subs/consumer/src/probe.ts';
export const laterFile = 'subs/consumer/src/later.ts';
export const laterImport = "import { later } from './later.js'; void later;\n";
export const laterSource = 'export const later = 1;\n';

/** A signature note as code, file, line and the original its message names. */
export type SignatureNoteKey = readonly [code: string, file: string, line: number, binding: string | null];
export const isSignatureNote = (note: { readonly code: string }): boolean => note.code.startsWith('signature-');
export const signatureNoteKey = (note: { readonly code: string; readonly message: string; readonly location: { readonly file: string; readonly line: number } }): SignatureNoteKey =>
  [note.code, note.location.file, note.location.line, /^`([^`]+)`/.exec(note.message)?.[1] ?? null];
/** Plan 8's companion rule notes once each exposed original whose declared
 * signature leaves a type to inference. The frozen F recipe exposes
 * `export const value = 1;`, line 1 of the provider API: no annotation and no
 * directly assigned callable, so its type is inferred. Every other exposed F
 * original is an interface, an empty class or an annotated function. */
export const providerValueNote: SignatureNoteKey = ['signature-inferred', providerApi, 1, 'value'];

export type EditFixtureVariant = 'type-to-runtime-merge' | 'alias-identity'
  | 'config-change' | 'missing-file-appears';

/** Prepare F before opening a context. The frozen Plan 1 recipe is unchanged. */
export async function createEditFixture(root: string, variant: EditFixtureVariant): Promise<void> {
  await createProjectFixture(root);
  const probes: Record<EditFixtureVariant, string> = {
    'type-to-runtime-merge': "import { Type } from '../../provider/src/interfaces/api.js';\nexport type Observed = Type;\n",
    'alias-identity': "import chosen from '../../provider/src/interfaces/api.js'; void chosen;\n",
    'config-change': "import { value } from '@provider/interfaces/api.js'; void value;\n",
    'missing-file-appears': laterImport,
  };
  await replaceExactlyOnce(join(root, consumerProbe), projectFixtureFiles[consumerProbe], probes[variant]);
  if (variant === 'alias-identity') {
    // Both default spellings must select value, rather than replacing the
    // recipe's distinct defaultValue original and calling that preservation.
    await replaceExactlyOnce(join(root, providerApi),
      'export default function defaultValue(): number { return 3; }', 'export default value;');
    // The named and default selections of value must agree on its browser tag.
    await replaceExactlyOnce(join(root, 'subs/provider/module.ramify'),
      'expose-src Type, Runtime, Merged, default from "interfaces/api.ts" to parent',
      'expose-src Type, Runtime, Merged from "interfaces/api.ts" to parent\n'
        + 'expose-src default from "interfaces/api.ts" tagged [browser] to parent');
  }
}
