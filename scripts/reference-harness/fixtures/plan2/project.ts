import { join } from 'node:path';
import { createProjectFixture, projectFixtureFiles } from '../plan1/project.js';
import { replaceExactlyOnce } from '../../mutation.js';

export const providerApi = 'subs/provider/src/interfaces/api.ts';
export const consumerProbe = 'subs/consumer/src/probe.ts';
export const laterFile = 'subs/consumer/src/later.ts';
export const laterImport = "import { later } from './later.js'; void later;\n";
export const laterSource = 'export const later = 1;\n';

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
