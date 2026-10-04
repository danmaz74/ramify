import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSourceAnalysis } from '../../subs/analysis/subs/typescript/src/source-analysis.js';
import { assembleCatalog, describeFiles } from '../../subs/analysis/subs/typescript/src/descriptions.js';
import type { FileDescription } from '../../subs/analysis/subs/typescript/src/interfaces/source.js';
import { materializeSynthetic } from '../measurements/materialize.js';
import { createProjectFixture, put } from './fixtures/plan1/project.js';
import { cssShim, prepareReferenceEdits, referenceRoot } from './fixtures/plan2/reference.js';
import { repositoryRoot } from './plan.js';
import { recordObservation } from './observations.js';
import { runIsolatedProject } from './mutation.js';
import { toolkitFixture } from './plan5-engine-cases.js';
import { withSourceInputs } from './plan5-engine-fixture.js';
import { changedByValue, described, withDescriptions } from './plan5-catalog-fixture.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const handlers = new Map<string, InstanceHandler>();
const interfaces = 'subs/provider/src/interfaces';
const apiFile = `${interfaces}/api.ts`;
const workRoot = join(repositoryRoot, '.reference-work');
const names = (description: FileDescription): readonly string[] => description.exports.exports.map(entry => entry.name);

async function append(root: string, path: string, line: string): Promise<void> {
  const text = await readFile(join(root, path), 'utf8');
  await put(root, path, `${text}${line}`);
}

/** The F recipe with the coordinated files one row adds, never edited in place. */
function fixtureVariant(files: Readonly<Record<string, string>>, anchor: string): Pick<Extract<InstanceHandler, { kind: 'project' }>, 'kind' | 'fixture' | 'baseline' | 'mutate'> {
  return {
    kind: 'project',
    fixture: { kind: 'create', create: createProjectFixture },
    baseline: async ({ root, assertions }) => {
      const text = await readFile(join(root, apiFile), 'utf8');
      assertions.equal('F baseline declares value exactly once', text.split('export const value = 1;').length - 1, 1);
      assertions.ok('F baseline has no variant file yet', !text.includes(anchor));
    },
    mutate: async ({ root }) => {
      for (const [path, content] of Object.entries(files)) await put(root, path, content);
    },
  };
}

handlers.set('I5-03:assembled-equals-whole', {
  kind: 'project',
  fixture: { kind: 'create', create: async root => {
    await mkdir(join(root, 'toolkit'), { recursive: true });
    await toolkitFixture(join(root, 'toolkit'));
    await materializeSynthetic(join(root, 'synthetic'), 'S100');
  } },
  baseline: async ({ root, assertions }) => {
    assertions.ok('pinned toolkit copy is present', (await readFile(join(root, 'toolkit/module.ramify'), 'utf8')).startsWith('ramify 1'));
    assertions.ok('S100 generated its root declaration', (await readFile(join(root, 'synthetic/module.ramify'), 'utf8')).startsWith('ramify 1'));
  },
  mutate: async () => {},
  run: async ({ root, assertions }) => {
    // Project-boundary iteration 8C: R gains its two root configuration files as auxiliary source.
    const expected: Readonly<Record<string, readonly [number, number]>> = { R: [15, 56], T: [11, 229], S100: [100, 1100] };
    const compare = (fixture: string, project: string) => withSourceInputs(project, async inputs => {
      const owned = inputs.inventory.files.map(file => file.path);
      const descriptions = await describeFiles(inputs, owned);
      const analysis = await createSourceAnalysis(inputs);
      try {
        const catalog = await analysis.catalog();
        const [owners, sources] = expected[fixture]!;
        assertions.equal(`${fixture}: recorded owners and source files`, [inputs.inventory.modules.length,
          inputs.inventory.files.filter(file => file.kind === 'source').length], [owners, sources]);
        assertions.equal(`${fixture}: one description per owned file`,
          descriptions.map(description => description.file).sort(), [...owned].sort());
        assertions.equal(`${fixture}: assembled catalog equals the whole build`, assembleCatalog(descriptions), catalog);
        recordObservation('plan5-assembled-catalog', { fixture, files: catalog.files.length,
          originals: catalog.originals.length, coverage: catalog.coverage.length });
      } finally { await analysis.dispose(); }
    });
    const isolated = await runIsolatedProject({ instanceId: 'I5-03:assembled-equals-whole', workRoot,
      fixture: { kind: 'copy', sourceRoot: referenceRoot } }, async project => {
      await prepareReferenceEdits(project.root);
      await compare('R', project.root);
    });
    if (!isolated.ok) throw isolated.error;
    await compare('T', join(root, 'toolkit'));
    await compare('S100', join(root, 'synthetic'));
  },
});

handlers.set('I5-03:star-growth-reach', {
  ...fixtureVariant({
    [`${interfaces}/index.ts`]: "export * from './api.js';\n",
    'subs/consumer/src/reader.ts': "import { value } from '../../provider/src/interfaces/index.js'; void value;\n",
  }, 'extra'),
  run: ({ root, assertions }: ProjectContext) => withDescriptions(root, async states => {
    const base = await states.describe();
    assertions.ok('base describes the star target and its re-exporter',
      base.delta.recomputed.includes(apiFile) && base.delta.recomputed.includes(`${interfaces}/index.ts`));
    assertions.ok('base star export carries the provider surface',
      names(described(base.descriptions, `${interfaces}/index.ts`)).includes('value'));
    // The added export is this row's trigger; the base state has to be described
    // before it, because the recomputed set is the claim under test.
    await append(root, apiFile, 'export const extra = 4;\n');
    const { update, whole } = await states.both([apiFile]);
    assertions.equal('recomputed set is the star target and its re-exporter only',
      update.delta.recomputed, [apiFile, `${interfaces}/index.ts`]);
    assertions.ok('the star re-exporter gained extra', names(described(update.descriptions, `${interfaces}/index.ts`)).includes('extra'));
    assertions.equal('every other description keeps its recorded identity',
      states.set.all().filter(description => !update.delta.recomputed.includes(description.file))
        .filter(description => description !== base.descriptions.find(entry => entry.file === description.file)), []);
    assertions.equal('the assembled catalog equals a whole recompute', assembleCatalog(states.set.all()), assembleCatalog(whole));
  }),
});

handlers.set('I5-03:forwarding-chain-reach', {
  ...fixtureVariant({
    [`${interfaces}/mid.ts`]: "export { value as passed } from './api.js';\n",
    [`${interfaces}/top.ts`]: "export * from './mid.js';\n",
  }, 'renamed'),
  run: ({ root, assertions }: ProjectContext) => withDescriptions(root, async states => {
    const base = await states.describe();
    assertions.equal('the chain forwards one name to the top', names(described(base.descriptions, `${interfaces}/top.ts`)), ['passed']);
    await put(root, `${interfaces}/mid.ts`, "export { value as renamed } from './api.js';\n");
    const { update, whole } = await states.both([`${interfaces}/mid.ts`]);
    assertions.equal('exactly the renamed file and its re-exporter are described afresh',
      update.delta.recomputed, [`${interfaces}/mid.ts`, `${interfaces}/top.ts`]);
    assertions.equal('the top of the chain reports the new name', names(described(update.descriptions, `${interfaces}/top.ts`)), ['renamed']);
    assertions.equal('the unchanged provider retains its description',
      states.set.all().find(description => description.file === apiFile),
      base.descriptions.find(description => description.file === apiFile));
    assertions.equal('the renamed export keeps the provider original',
      described(update.descriptions, `${interfaces}/top.ts`).exports.exports[0].original,
      { kind: 'code', owner: 'fixture/provider', file: 'interfaces/api.ts', binding: 'value' });
    assertions.equal('the assembled catalog equals a whole recompute', assembleCatalog(states.set.all()), assembleCatalog(whole));
  }),
});

handlers.set('I5-03:namespace-forwarding-reach', {
  ...fixtureVariant({
    [`${interfaces}/hub.ts`]: "export * as api from './api.js';\n",
    'subs/consumer/src/member.ts': "import * as hub from '../../provider/src/interfaces/hub.js'; void hub.api.value;\n",
  }, 'extra'),
  run: ({ root, assertions }: ProjectContext) => withDescriptions(root, async states => {
    const base = await states.describe();
    const forwarded = (descriptions: readonly FileDescription[]): readonly string[] =>
      described(descriptions, `${interfaces}/hub.ts`).exports.exports[0].namespace?.map(entry => entry.name) ?? [];
    assertions.ok('the namespace description forwards the provider surface', forwarded(base.descriptions).includes('value'));
    await append(root, apiFile, 'export const extra = 5;\n');
    const { update, whole } = await states.both([apiFile]);
    assertions.equal('the namespace target and its re-exporter are recomputed and nothing else',
      update.delta.recomputed, [apiFile, `${interfaces}/hub.ts`]);
    assertions.ok('the namespace description gained the member', forwarded(update.descriptions).includes('extra'));
    assertions.equal('the namespace re-exporter records its target as a dependency',
      described(update.descriptions, `${interfaces}/hub.ts`).dependencies.files, [apiFile]);
    assertions.equal('the assembled catalog equals a whole recompute', assembleCatalog(states.set.all()), assembleCatalog(whole));
  }),
});

/** The external declaration this row replaces, as Vite ships it. */
const viteDeclaration = ["declare module '*.module.css' {", '  const classes: CSSModuleClasses', '  export default classes', '}'].join('\n');
const projectShim = 'subs/workspace/src/resources.d.ts';
const projectDeclaration = ["declare module '*.module.css' {",
  '  const classes: { readonly [key: string]: string }', '  export default classes', '}', ''].join('\n');

handlers.set('I5-03:resource-shim-reach', {
  kind: 'project',
  fixture: { kind: 'copy', sourceRoot: referenceRoot },
  prepare: ({ root }) => prepareReferenceEdits(root, true),
  baseline: async ({ root, assertions }) => {
    const text = await readFile(join(root, cssShim), 'utf8');
    assertions.equal('the external shim declares the CSS-module pattern exactly once',
      text.split(viteDeclaration).length - 1, 1);
    assertions.ok('the reference has no project-local shim yet', !(await readFile(join(root, 'subs/workspace/module.ramify'), 'utf8')).includes('resources.d.ts'));
  },
  mutate: async ({ root }) => {
    const text = await readFile(join(root, cssShim), 'utf8');
    await writeFile(join(root, cssShim), text.replace(viteDeclaration, ''));
    await put(root, projectShim, projectDeclaration);
  },
  run: ({ root, assertions }: ProjectContext) => withDescriptions(root, async states => {
    const base = await states.describe();
    const modules = base.descriptions.filter(description => description.file.endsWith('.module.css')).map(description => description.file);
    assertions.equal('both CSS-module resources are described', modules, [
      'subs/workspace/subs/catalog/subs/ui/src/catalog-card.module.css',
      'subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.module.css',
    ]);
    assertions.equal('each records the project-local shim that described it',
      modules.map(path => described(base.descriptions, path).dependencies.shims), [[projectShim], [projectShim]]);
    assertions.equal('each resource has the shim default export',
      modules.map(path => names(described(base.descriptions, path))), [['default'], ['default']]);
    // Change the shim's default binding, which no description of the shim file
    // itself can record: its content identity is the edge that must be followed.
    await put(root, projectShim, ["declare module '*.module.css' {",
      '  const classes: { readonly [key: string]: string }',
      '  const fallback: string',
      '  export default fallback',
      '  export { classes as styles }', '}', ''].join('\n'));
    const { update, whole } = await states.both([projectShim]);
    assertions.equal('both resource descriptions are recomputed',
      modules.filter(path => update.delta.recomputed.includes(path)), modules);
    assertions.equal('both resource descriptions changed by value',
      modules.filter(path => update.delta.changed.includes(path)), modules);
    assertions.equal('each resource follows the new shim', modules.map(path => names(described(update.descriptions, path))),
      [['default', 'styles'], ['default', 'styles']]);
    assertions.equal('no file that describes no resource is recomputed',
      update.delta.recomputed.filter(path => path !== projectShim && !path.endsWith('.module.css')
        && !described(update.descriptions, path).dependencies.resources.length), []);
    assertions.equal('the assembled catalog equals a whole recompute', assembleCatalog(states.set.all()), assembleCatalog(whole));
    recordObservation('plan5-resource-shim', { shim: projectShim, recomputed: update.delta.recomputed, changed: update.delta.changed });
  }),
});

handlers.set('I5-03:ambiguity-propagation', {
  ...fixtureVariant({
    [`${interfaces}/left.ts`]: "export const clash = 'left';\n",
    [`${interfaces}/right.ts`]: "export const clash = 'right';\n",
    [`${interfaces}/left-star.ts`]: "export * from './left.js';\n",
    [`${interfaces}/right-star.ts`]: "export * from './right.js';\n",
    [`${interfaces}/index.ts`]: "export * from './left-star.js';\nexport * from './right-star.js';\n",
  }, 'left-star'),
  run: ({ root, assertions }: ProjectContext) => withDescriptions(root, async states => {
    const index = `${interfaces}/index.ts`;
    const first = await states.both();
    const ambiguous = described(first.update.descriptions, index);
    assertions.equal('the index records the ambiguous selection', [ambiguous.exports.state,
      ambiguous.exports.exports.find(entry => entry.name === 'clash')?.original,
      ambiguous.coverage.map(issue => issue.code)], ['ambiguous', null, ['ambiguous-original']]);
    assertions.equal('the ambiguity settles into the same catalog as a whole recompute',
      assembleCatalog(states.set.all()), assembleCatalog(first.whole));
    // Removing the re-exporter deletes its file and the statement reaching it.
    await rm(join(root, `${interfaces}/right-star.ts`));
    await put(root, `${interfaces}/index.ts`, "export * from './left-star.js';\n");
    const { update, whole } = await states.both([`${interfaces}/right-star.ts`, index]);
    assertions.equal('removing one re-exporter recomputes the dependent index in a bounded set',
      update.delta.recomputed, [index]);
    const settled = described(update.descriptions, index);
    assertions.equal('the settled index selects the remaining original', [settled.exports.state,
      settled.exports.exports.find(entry => entry.name === 'clash')?.original?.file, settled.coverage],
    ['complete', 'interfaces/left.ts', []]);
    assertions.equal('the removed re-exporter is no longer described',
      states.set.all().filter(description => description.file === `${interfaces}/right-star.ts`), []);
    assertions.equal('the assembled catalog equals a whole recompute without the ambiguity',
      assembleCatalog(states.set.all()), assembleCatalog(whole));
  }),
});

/** Thirty single-file edits: alternating an added export, which changes the file's
 * surface, and an appended comment, which moves the declarations below it. */
async function closureEdits(root: string, assertions: Assertions, fixture: string): Promise<void> {
  await withDescriptions(root, async states => {
    let previous = (await states.both()).whole;
    const targets = previous.filter(description => /\.[cm]?[jt]sx?$/.test(description.file)
      && !description.file.endsWith('.d.ts') && description.originals.length)
      .map(description => description.file).sort().slice(0, 30);
    assert.equal(targets.length, 30, `${fixture} needs thirty editable source files`);
    const outside: string[] = [];
    const unequal: string[] = [];
    for (const [index, target] of targets.entries()) {
      await append(root, target, index % 2 === 0
        ? `\nexport const ramifyClosureProbe${index} = ${index};\n`
        : `\n// Ramify closure probe ${index}.\n`);
      const { update, whole } = await states.both([target]);
      const recomputed = new Set(update.delta.recomputed);
      outside.push(...changedByValue(previous, whole).filter(path => !recomputed.has(path)).map(path => `${index}:${path}`));
      if (JSON.stringify(assembleCatalog(states.set.all())) !== JSON.stringify(assembleCatalog(whole))) unequal.push(`${index}:${target}`);
      previous = whole;
    }
    assertions.equal(`${fixture}: every description that changed by value lies inside the recomputed set`, outside, []);
    assertions.equal(`${fixture}: the retained descriptions assemble the whole catalog after every edit`, unequal, []);
    assertions.equal(`${fixture}: thirty single-file edits applied`, targets.length, 30);
    recordObservation('plan5-closure-superset', { fixture, edits: targets.length, files: previous.length });
  });
}

handlers.set('I5-03:closure-superset', {
  kind: 'project',
  fixture: { kind: 'create', create: async root => {
    await mkdir(join(root, 'toolkit'), { recursive: true });
    await toolkitFixture(join(root, 'toolkit'));
    await materializeSynthetic(join(root, 'synthetic'), 'S100');
  } },
  baseline: async ({ root, assertions }) => {
    assertions.ok('pinned toolkit copy is present', (await readFile(join(root, 'toolkit/module.ramify'), 'utf8')).startsWith('ramify 1'));
    assertions.ok('S100 generated its root declaration', (await readFile(join(root, 'synthetic/module.ramify'), 'utf8')).startsWith('ramify 1'));
  },
  mutate: async () => {},
  run: async ({ root, assertions }) => {
    const isolated = await runIsolatedProject({ instanceId: 'I5-03:closure-superset', workRoot,
      fixture: { kind: 'copy', sourceRoot: referenceRoot } }, async project => {
      await prepareReferenceEdits(project.root);
      await closureEdits(project.root, assertions, 'R');
    });
    if (!isolated.ok) throw isolated.error;
    await closureEdits(join(root, 'toolkit'), assertions, 'T');
    await closureEdits(join(root, 'synthetic'), assertions, 'S100');
  },
});

export const plan5CatalogHandlers: ReadonlyMap<string, InstanceHandler> = handlers;
