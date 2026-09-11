import { lstat, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { replaceExactlyOnce } from './mutation.js';
import { consumerProbe, laterFile, laterImport, laterSource, providerApi } from './fixtures/plan2/project.js';
import { coreDescription, coreDirectory, cssShim, vocabulary, workspaceDescription } from './fixtures/plan2/reference.js';

export interface TextMutation {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

const w2 = 'expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent';
const k1 = 'expose-src getRecord, inspect, CatalogSummary from "catalog.ts" to parent';
const callback = 'export type ObservationCallback = (observation: Observation) => void;';

/** Authored causes only. Returned paths are edit hints, never driver evidence. */
export const residentTextMutations = {
  'remove-hop': { path: workspaceDescription, before: w2,
    after: 'expose-sub createCatalogTools, inspectRecord from catalog to parent' },
  'tag-change': { path: coreDescription, before: '\nmodule core\n', after: '\nmodule core tagged [ui]\n' },
  'wildcard-add': { path: vocabulary, before: callback,
    after: `${callback}\nexport interface ResidentVocabulary { readonly revision: number }` },
  'wildcard-remove': { path: vocabulary, before: 'export type RecordId = z.infer<typeof recordIdSchema>;',
    after: 'type RecordId = z.infer<typeof recordIdSchema>;' },
  'foreign-wildcard-invalid': { path: vocabulary, before: callback,
    after: `${callback}\nexport { inspect } from '../../../catalog/subs/core/src/catalog.js';` },
  'type-to-runtime-merge': { path: providerApi, before: 'export interface Type { readonly value: number }',
    after: 'export interface Type { readonly value: number }\nexport const Type = 1;' },
  'alias-identity': { path: providerApi, before: 'export default value;', after: 'export { value as default };' },
  'config-change': { path: 'tsconfig.json',
    before: '"paths": {\n      "@provider/*": [\n        "./subs/provider/src/*"\n      ]\n    }', after: '"paths": {}' },
  'shim-change': { path: cssShim,
    before: "declare module '*.module.css' {\n  const classes: CSSModuleClasses\n  export default classes\n}",
    after: "declare module '*.module.css' {\n  const classes: CSSModuleClasses\n  export { classes }\n}" },
  'readme-edit': { path: 'subs/workspace/README.md', before: 'Workspace is the browser shell.',
    after: 'Workspace is the browser shell for the current project.' },
  'invalid-description': { path: coreDescription, before: k1,
    after: `${k1}\nexpose-src Missing from "nowhere.ts" to parent` },
} as const satisfies Readonly<Record<string, TextMutation>>;

/** Reverse the same guarded edit for restore-hop, recovery and revert controls. */
export async function applyTextMutation(root: string, mutation: TextMutation, reverse = false): Promise<readonly string[]> {
  if (mutation.path === cssShim && await realpath(join(root, cssShim)) !== join(await realpath(root), cssShim)) {
    throw new Error('CSS shim mutation requires a private Vite copy');
  }
  await replaceExactlyOnce(join(root, mutation.path), reverse ? mutation.after : mutation.before,
    reverse ? mutation.before : mutation.after);
  return [mutation.path];
}

function replaceAnchor(text: string, before: string, after: string, path: string): string {
  if (!before || text.split(before).length !== 2) throw new Error(`Expected exactly one mutation anchor in ${path}`);
  return text.replace(before, () => after);
}

async function requireAbsent(path: string): Promise<void> {
  try { await lstat(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Expected absent mutation destination: ${path}`);
}

export async function createLaterFile(root: string): Promise<readonly string[]> {
  const probe = await readFile(join(root, consumerProbe), 'utf8');
  replaceAnchor(probe, laterImport, laterImport, consumerProbe);
  // Exclusive creation refuses existing files and dangling symlinks alike.
  await writeFile(join(root, laterFile), laterSource, { flag: 'wx' });
  return [laterFile];
}

/** One source-area move, with relative imports repaired for the new depth. */
export async function moveHistoryToTesting(root: string, reverse = false): Promise<readonly string[]> {
  const original = `${coreDirectory}/src/history.ts`;
  const moved = `${coreDirectory}/src/tests/history.ts`;
  const from = reverse ? moved : original, to = reverse ? original : moved;
  const imports: readonly TextMutation[] = [
    { path: `${coreDirectory}/src/catalog.ts`, before: "from './history.js'", after: "from './tests/history.js'" },
    { path: `${coreDirectory}/src/tests/catalog.test.ts`, before: "from '../history.js'", after: "from './history.js'" },
  ];
  const before = "from '../../../../contracts/src/interfaces/vocabulary.js'";
  const after = "from '../../../../../contracts/src/interfaces/vocabulary.js'";
  const helper = replaceAnchor(await readFile(join(root, from), 'utf8'), reverse ? after : before,
    reverse ? before : after, from);
  // Check every anchor and destination before the first write. A drifted
  // importer must not leave half a move for a later analysis to interpret.
  const changed = await Promise.all(imports.map(async edit => ({ path: edit.path,
    text: replaceAnchor(await readFile(join(root, edit.path), 'utf8'), reverse ? edit.after : edit.before,
      reverse ? edit.before : edit.after, edit.path) })));
  await requireAbsent(join(root, to));
  await writeFile(join(root, to), helper, { flag: 'wx' });
  for (const edit of changed) await writeFile(join(root, edit.path), edit.text);
  await unlink(join(root, from));
  return [original, moved, ...imports.map(edit => edit.path)].sort();
}
