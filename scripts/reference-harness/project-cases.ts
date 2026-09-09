import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseDescription } from '../../subs/analysis/subs/descriptions/src/parse.js';
import { readProject } from '../../subs/analysis/subs/project/src/read-project.js';
import type { ProjectInventory, ProjectRequest } from '../../subs/analysis/src/validation-entry.js';
import type { AcquisitionLimits, ProjectRead, ProjectInputView } from '../../subs/analysis/subs/project/src/interfaces/project.js';
import { createProjectFixture, projectFixtureFiles, put } from './fixtures/plan1/project.js';
import { replaceExactlyOnce } from './mutation.js';
import { repositoryRoot } from './plan.js';
import type { Assertions, InstanceHandler, ProjectContext } from './runner.js';

const limits: AcquisitionLimits = { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
  maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
  maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 };
const provider = 'subs/provider/module.ramify';
const api = 'subs/provider/src/interfaces/api.ts';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
async function read(root: string, request: Partial<ProjectRequest> = {}): Promise<ProjectRead> {
  return readProject({ request: { cwd: root, root, scope: 'whole-project', configuration: 'discover', ...request }, parse: parseDescription, limits });
}
async function acquired(context: ProjectContext, run: (view: ProjectInputView) => Promise<void> | void, request: Partial<ProjectRequest> = {}): Promise<void> {
  const result = await read(context.root, request);
  context.assertions.equal('acquisition outcome', result.status, 'acquired');
  if (result.status !== 'acquired') throw new Error(JSON.stringify(result));
  try { await run(result.view); }
  finally { await result.view.dispose(); }
}
function base(assertions: Assertions, inventory: ProjectInventory): void {
  assertions.equal('declared IDs', inventory.modules.map(module => module.id), ['fixture', 'fixture/consumer', 'fixture/provider']);
  assertions.equal('owned files', inventory.files.map(file => [file.path, file.owner, file.area, file.kind]), [
    ['subs/consumer/src/probe.ts', 'fixture/consumer', 'ordinary', 'source'], [api, 'fixture/provider', 'ordinary', 'source'],
  ]);
  assertions.equal('warnings', inventory.warnings, []);
  assertions.equal('exact references', inventory.references.map(reference => [reference.normalized, reference.status, reference.interfaceEligible]),
    [[api, 'file', true], [api, 'file', true]]);
  assertions.equal('provider purpose', inventory.modules[2]!.purpose,
    { state: 'present', readme: 'subs/provider/README.md', paragraph: 'Purpose of provider.' });
}
async function include(root: string, ...paths: string[]): Promise<void> {
  const config = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
  config.include.push(...paths);
  await put(root, 'tsconfig.json', JSON.stringify(config));
}
async function changedReference(root: string, value: string): Promise<void> {
  // Two reviewed exposures select the same file. Mutate only the value statement.
  await replaceExactlyOnce(join(root, provider), 'expose-src value from "interfaces/api.ts"', `expose-src value from ${JSON.stringify(value)}`);
}
function warning(assertions: Assertions, inventory: ProjectInventory, entry: string, paths: string[]): void {
  assertions.equal('outside warning', inventory.warnings, [{ code: 'outside-module-source', entry, count: paths.length, files: paths }]);
  assertions.equal('outside source selection', inventory.outsideModuleFiles, paths);
  assertions.ok('outside files have no owner or profile', paths.every(path => !inventory.files.some(file => file.path === path)));
}
async function invalid(context: ProjectContext, code: string, path: string, request: Partial<ProjectRequest> = {}): Promise<ProjectRead> {
  const result = await read(context.root, request);
  if (result.status === 'acquired') await result.view.dispose();
  context.assertions.equal('invalid outcome', result.status, 'invalid');
  if (result.status !== 'invalid') throw new Error(JSON.stringify(result));
  context.assertions.ok('located responsible issue', result.issues.some(issue => issue.code === code && issue.path === path));
  return result;
}
interface Case {
  mutate?: (context: Omit<ProjectContext, 'assertions'>) => Promise<void>;
  run: (context: ProjectContext) => Promise<void>;
}
const cases: Record<string, Case> = {
  'I1-02:missing-root': { mutate: c => rm(join(c.root, 'module.ramify')), run: async c => { await invalid(c, 'missing-root-description', 'module.ramify'); } },
  'I1-02:invalid-child': {
    mutate: c => put(c.root, provider, 'ramify 1\nmodule Bad_Name\n'),
    run: async c => {
      const r = await invalid(c, 'invalid-description', provider);
      if (r.status !== 'invalid') return;
      c.assertions.ok('parser code and location retained', r.issues.some(issue => issue.message.includes('invalid-name') && issue.message.startsWith('2:')));
      c.assertions.ok('no guessed parent ownership', !r.inventory?.files.some(file => file.path === api));
    },
  },
  'I1-02:duplicate-name': {
    mutate: c => put(c.root, 'subs/consumer/module.ramify', 'ramify 1\nmodule provider\n'),
    run: async c => {
      const r = await invalid(c, 'duplicate-name', provider);
      if (r.status === 'invalid') c.assertions.equal('both declarations located', r.issues.filter(i => i.code === 'duplicate-name').map(i => i.path), ['subs/consumer/module.ramify', provider]);
    },
  },
  'I1-02:description-in-src': {
    mutate: c => put(c.root, 'subs/consumer/src/hidden/module.ramify', 'ramify 1\nmodule hidden\n'),
    run: async c => { await invalid(c, 'description-in-src', 'subs/consumer/src/hidden/module.ramify'); },
  },
  'I1-02:stray-description': {
    mutate: async c => { await put(c.root, 'tests/helper.ts', 'export {};\n'); await include(c.root, 'tests'); await put(c.root, 'tests/module.ramify', 'ramify 1\nmodule hidden\n'); },
    run: async c => {
      const r = await invalid(c, 'stray-description', 'tests/module.ramify');
      if (r.status === 'invalid' && r.inventory) warning(c.assertions, r.inventory, 'tests', ['tests/helper.ts']);
      // The earlier reviewed loose-directory spelling also remains an error.
      await rename(join(c.root, 'tests'), join(c.root, 'loose'));
      await include(c.root, 'loose');
      const loose = await read(c.root);
      c.assertions.equal('reviewed loose variant invalid', loose.status, 'invalid');
      if (loose.status === 'acquired') await loose.view.dispose();
      if (loose.status === 'invalid') c.assertions.ok('reviewed loose marker located', loose.issues.some(i => i.code === 'stray-description' && i.path === 'loose/module.ramify'));
    },
  },
  'I1-03:empty-owner': {
    mutate: c => put(c.root, 'subs/empty/module.ramify', 'ramify 1\nmodule empty\n'),
    run: c => acquired(c, async view => {
      c.assertions.equal('four owners', view.inventory.modules.length, 4);
      c.assertions.equal('absent intended source area', view.inventory.modules.find(m => m.name === 'empty')?.areas,
        [{ owner: 'fixture/empty', kind: 'ordinary', root: 'subs/empty/src', present: false }, { owner: 'fixture/empty', kind: 'tests', root: 'subs/empty/src/tests', present: false }]);
      c.assertions.equal('acquisition creates nothing', await readdir(join(c.root, 'subs/empty')), ['module.ramify']);
      c.assertions.equal('header bytes unchanged', await readFile(join(c.root, 'subs/empty/module.ramify'), 'utf8'), 'ramify 1\nmodule empty\n');
    }),
  },
  'I1-03:grouping-move': {
    mutate: async c => { await mkdir(join(c.root, 'subs/group')); await rename(join(c.root, 'subs/provider'), join(c.root, 'subs/group/provider')); },
    run: c => acquired(c, view => { c.assertions.equal('stable declared ID', view.inventory.modules.find(m => m.name === 'provider')?.id, 'fixture/provider'); c.assertions.equal('physical source moved', view.inventory.files.find(f => f.owner === 'fixture/provider')?.path, 'subs/group/provider/src/interfaces/api.ts'); }),
  },
  'I1-03:rename': {
    mutate: c => replaceExactlyOnce(join(c.root, provider), 'module provider', 'module renamed'),
    run: c => acquired(c, view => { c.assertions.equal('renamed ID', view.inventory.modules.find(m => m.name === 'renamed')?.id, 'fixture/renamed'); c.assertions.ok('old ID absent', !view.inventory.modules.some(m => m.id === 'fixture/provider')); }),
  },
  'I1-03:reparent': {
    mutate: async c => { await mkdir(join(c.root, 'subs/consumer/subs')); await rename(join(c.root, 'subs/provider'), join(c.root, 'subs/consumer/subs/provider')); },
    run: c => acquired(c, view => { const m = view.inventory.modules.find(m => m.name === 'provider'); c.assertions.equal('reparented declared identity', [m?.id, m?.parent], ['fixture/consumer/provider', 'fixture/consumer']); c.assertions.ok('old ID absent', !view.inventory.modules.some(m => m.id === 'fixture/provider')); }),
  },
  'I1-04:symlink-root': {
    mutate: c => symlink(c.root, join(c.runDirectory, 'project-link')),
    run: async c => { const r = await read(c.root, { root: join(c.runDirectory, 'project-link') }); c.assertions.equal('symlink root rejected', r.status, 'invalid'); if (r.status === 'acquired') await r.view.dispose(); if (r.status === 'invalid') c.assertions.equal('root symlink reason', r.issues.map(i => i.code), ['symlink-root']); },
  },
  'I1-04:symlink-description': {
    mutate: async c => { const target = join(c.runDirectory, 'real-description'); await cp(join(c.root, provider), target); await rm(join(c.root, provider)); await symlink(target, join(c.root, provider)); },
    run: async c => { await invalid(c, 'symlink-description', provider); },
  },
  'I1-04:symlink-reference': {
    mutate: async c => { const target = join(c.runDirectory, 'outside.ts'); await cp(join(c.root, api), target); await rm(join(c.root, api)); await symlink(target, join(c.root, api)); },
    run: async c => { await invalid(c, 'symlink-reference', provider); },
  },
  'I1-04:symlink-directory': {
    mutate: async c => { await put(c.runDirectory, 'external/module.ramify', 'ramify 1\nmodule linked\n'); await put(c.runDirectory, 'external/src/linked.ts', 'export const linked = 1;\n'); await symlink(join(c.runDirectory, 'external'), join(c.root, 'subs/linked')); },
    run: c => acquired(c, view => { base(c.assertions, view.inventory); c.assertions.ok('linked subtree was never observed', !view.inputs.some(input => input.path.startsWith('subs/linked/'))); }),
  },
  'I1-25:purpose': {
    mutate: c => put(c.root, 'subs/provider/README.md', '# Provider\n\n- List\n\n| Column |\n| --- |\n| cell |\n\n```ts\nconst ignored = 1;\n```\n\nProvider purpose.\n\nSecond paragraph.\n'),
    run: c => acquired(c, view => c.assertions.equal('first top-level prose', view.inventory.modules[2]!.purpose, { state: 'present', readme: 'subs/provider/README.md', paragraph: 'Provider purpose.' })),
  },
  'I1-25:missing-readme': {
    mutate: c => rm(join(c.root, 'subs/provider/README.md')),
    run: c => acquired(c, view => c.assertions.equal('explicit absent documentation', view.inventory.modules[2]!.purpose, { state: 'missing-file', readme: 'subs/provider/README.md' })),
  },
  'I1-25:no-paragraph': {
    mutate: c => put(c.root, 'subs/provider/README.md', '# Provider\n\n- Only list\n'),
    run: c => acquired(c, view => c.assertions.equal('explicit no paragraph', view.inventory.modules[2]!.purpose, { state: 'no-paragraph', readme: 'subs/provider/README.md' })),
  },
  'I1-25:readme-edit': {
    mutate: c => put(c.root, 'subs/provider/README.md', '# provider\n\nUpdated provider purpose.\n'),
    run: c => acquired(c, view => {
      c.assertions.equal('new purpose', view.inventory.modules[2]!.purpose, { state: 'present', readme: 'subs/provider/README.md', paragraph: 'Updated provider purpose.' });
      c.assertions.ok('README captured identity changed', view.inputs.find(i => i.path === 'subs/provider/README.md')?.sha256 !== digest(projectFixtureFiles['subs/provider/README.md']!));
      c.assertions.equal('source and exposure bytes unchanged', [view.inputs.find(i => i.path === api)?.sha256, view.inputs.find(i => i.path === provider)?.sha256], [digest(projectFixtureFiles[api]!), digest(projectFixtureFiles[provider]!)]);
    }),
  },
  'I1-29:explicit-root': {
    mutate: c => put(c.runDirectory, 'module.ramify', 'invalid ancestor\n'),
    run: c => acquired(c, view => { base(c.assertions, view.inventory); c.assertions.equal('given root', [view.inventory.scope.root, view.inventory.scope.selection], [c.root, 'given']); c.assertions.ok('ancestor description not read', !view.inputs.some(i => i.role === 'description' && i.path.startsWith('external:'))); }),
  },
  'I1-29:root-from-subdirectory': {
    run: c => acquired(c, view => { base(c.assertions, view.inventory); c.assertions.equal('whole root discovered', [view.inventory.scope.root, view.inventory.scope.selection], [c.root, 'found']); }, { root: undefined, cwd: join(c.root, 'subs/consumer/src') }),
  },
  'I1-29:root-from-grouped-subdirectory': {
    mutate: async c => { await mkdir(join(c.root, 'subs/one/two/three'), { recursive: true }); await rename(join(c.root, 'subs/consumer'), join(c.root, 'subs/one/two/three/consumer')); },
    run: c => acquired(c, view => { c.assertions.equal('climb crosses all grouping levels', [view.inventory.scope.root, view.inventory.scope.selection], [c.root, 'found']); c.assertions.equal('grouping leaves IDs unchanged', view.inventory.modules.map(m => m.id), ['fixture', 'fixture/consumer', 'fixture/provider']); }, { root: undefined, cwd: join(c.root, 'subs/one/two/three/consumer/src') }),
  },
  'I1-29:root-outside': {
    run: async c => {
      // A no-project ancestry cannot exist under the ramified harness checkout.
      // This sole discovery fixture owns an OS temporary directory and cleans it.
      const outside = await mkdtemp(join(tmpdir(), 'ramify-outside-'));
      try {
        await createProjectFixture(join(outside, 'project'));
        const result = await read(c.root, { root: undefined, cwd: outside });
        if (result.status === 'acquired') await result.view.dispose();
        c.assertions.equal('outside invocation unavailable', result.status, 'unavailable');
        if (result.status === 'unavailable') { c.assertions.equal('no-project reason', result.issues.map(i => i.code), ['root-not-found']); c.assertions.ok('names cwd', result.issues[0]!.message.includes(outside)); c.assertions.equal('no downward discovery', result.inventory, null); }
      } finally { await rm(outside, { recursive: true, force: true }); }
    },
  },
  'I1-29:stray-files': {
    mutate: async c => { for (const path of ['config-extra.ts', 'tests/a.ts', 'tests/b.ts', 'ignored/c.ts']) await put(c.root, path, 'export {};\n'); await include(c.root, 'config-extra.ts', 'tests'); },
    run: c => acquired(c, view => {
      c.assertions.equal('per-entry aggregation and counts', view.inventory.warnings, [
        { code: 'outside-module-source', entry: 'config-extra.ts', count: 1, files: ['config-extra.ts'] },
        { code: 'outside-module-source', entry: 'tests', count: 2, files: ['tests/a.ts', 'tests/b.ts'] },
      ]);
      c.assertions.equal('selected outside files only', view.inventory.outsideModuleFiles, ['config-extra.ts', 'tests/a.ts', 'tests/b.ts']);
      c.assertions.equal('outside files receive no source areas', view.inventory.files.map(f => f.path), ['subs/consumer/src/probe.ts', api]);
      c.assertions.ok('unselected outside source bytes not read', !view.inputs.some(i => i.path === 'ignored/c.ts' && i.bytes > 0));
    }),
  },
};
for (const [id, path, entry] of [
  ['loose-subs-source', 'subs/loose.ts', 'subs'], ['sibling-tests', 'tests/probe.ts', 'tests'], ['sibling-interfaces', 'interfaces/probe.ts', 'interfaces'],
] as const) cases[`I1-02:${id}`] = {
  mutate: async c => { await put(c.root, path, 'export {};\n'); await include(c.root, path); },
  run: c => acquired(c, view => warning(c.assertions, view.inventory, entry, [path])),
};
for (const [id, target, status, code] of [
  ['exact-path/js-extension', 'interfaces/api.js', 'missing', 'missing-file'],
  ['exact-path/extensionless', 'interfaces/api', 'missing', 'missing-file'],
  ['exact-path/configured-alias', '@provider/interfaces/api.ts', 'missing', 'missing-file'],
  ['case-mismatch', 'interfaces/Api.ts', 'case-mismatch', 'case-mismatch'],
  ['escape/parent', '../outside.ts', 'escape', 'invalid-path'],
  ['escape/absolute', null, 'invalid-path', 'invalid-path'],
] as const) cases[`I1-04:${id}`] = {
  mutate: async c => { if (id === 'escape/parent') await put(c.root, 'subs/provider/outside.ts', 'export const value = 1;\n'); await changedReference(c.root, target ?? join(c.root, api)); },
  run: async c => {
    const r = await invalid(c, code, provider);
    if (r.status === 'invalid') {
      c.assertions.equal('exact path status and independent valid reference', r.inventory?.references.map(ref => ref.status), [status, 'file']);
      c.assertions.ok('located authored path', r.issues.some(issue => issue.message.startsWith('3:') && issue.message.includes('source reference')));
    }
  },
};
for (const [suffix, directory] of [['root-example', 'examples/demo'], ['child-example', 'subs/consumer/examples/demo']] as const) cases[`I1-29:nested-project-root/${suffix}`] = {
  mutate: c => createProjectFixture(join(c.root, directory)),
  run: c => acquired(c, view => {
    c.assertions.equal('nearest independent boundary', [view.inventory.scope.root, view.inventory.scope.selection], [join(c.root, directory), 'found']);
    base(c.assertions, view.inventory);
  }, { root: undefined, cwd: join(c.root, directory, 'src') }),
};

const referenceRoot = resolve(repositoryRoot, 'examples/collection-review');
async function referenceInventory(c: ProjectContext, view: ProjectInputView, selection: 'given' | 'found'): Promise<void> {
  const inventory = view.inventory;
  c.assertions.equal('all fifteen owners', inventory.modules.length, 15);
  c.assertions.equal('reference owned file count', inventory.files.length, 59);
  c.assertions.equal('two CSS-module resources', inventory.files.filter(f => f.path.endsWith('.module.css')).map(f => [f.path, f.owner, f.area, f.kind]), [
    ['subs/workspace/subs/catalog/subs/ui/src/catalog-card.module.css', 'collection-review/workspace/catalog/ui', 'ordinary', 'resource'],
    ['subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.module.css', 'collection-review/workspace/reviews/ui/pure-ui', 'ordinary', 'resource'],
  ]);
  c.assertions.equal('scope root/config/selection', [inventory.scope.root, inventory.scope.configuration, inventory.scope.selection], [c.root, join(c.root, 'tsconfig.json'), selection]);
  c.assertions.equal('all ordinary and testing roots reported', inventory.scope.walkedAreas.length, 30);
  c.assertions.equal('no other walked area', [...inventory.scope.walkedAreas].sort(), inventory.modules.flatMap(m => m.areas.map(a => a.root)).sort());
  c.assertions.equal('two configuration-source warnings', inventory.warnings.map(w => [w.entry, w.count]), [['vite.config.ts', 1], ['vitest.config.ts', 1]]);
  c.assertions.ok('compiler configuration captured', view.inputs.some(i => i.path === 'tsconfig.json' && i.role === 'configuration' && i.sha256 === digest(projectFixtureText(c.root))));
  c.assertions.ok('standalone testing owner ordinary source', inventory.files.some(f => f.owner === 'collection-review/integration-tests' && f.area === 'ordinary'));
  c.assertions.ok('all references exact', inventory.references.every(r => r.status === 'file'));
}
// Read the expected authored config independently of the capture under test.
function projectFixtureText(root: string): string { return readFileSync(join(root, 'tsconfig.json'), 'utf8'); }

export const projectHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ...Object.entries(cases).map(([id, test]): [string, InstanceHandler] => [id, {
    kind: 'project', fixture: { kind: 'create', create: createProjectFixture },
    baseline: c => acquired(c, view => base(c.assertions, view.inventory)),
    mutate: async c => { if (test.mutate) await test.mutate(c); },
    run: test.run,
  }]),
  ...(['given', 'found'] as const).map((selection): [string, InstanceHandler] => [`I1-29:scope-report/${selection}`, {
    kind: 'project', fixture: { kind: 'copy', sourceRoot: referenceRoot },
    baseline: c => acquired(c, view => referenceInventory(c, view, 'given')),
    mutate: async () => {},
    run: c => acquired(c, async view => {
      await referenceInventory(c, view, selection);
      const toolkit = await read(repositoryRoot);
      c.assertions.equal('toolkit acquired', toolkit.status, 'acquired');
      if (toolkit.status === 'acquired') {
        try { c.assertions.equal('nine toolkit skeleton owners', toolkit.view.inventory.modules.length, 9); c.assertions.equal('toolkit independent scopes silent', toolkit.view.inventory.warnings, []); }
        finally { await toolkit.view.dispose(); }
      }
    }, selection === 'found' ? { root: undefined, cwd: join(c.root, 'subs/workspace/src') } : {}),
  }]),
]);
