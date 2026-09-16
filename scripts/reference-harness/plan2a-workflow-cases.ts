import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { withSequenceProcess } from './equivalence-process.js';
import type { SequenceProcess } from './equivalence-process.js';
import { repositoryRoot } from './plan.js';
import type { InstanceHandler } from './runner.js';

/**
 * I2A-11: the documented agent `rg` workflow and repository integration, on
 * the installed CLI and the real production daemon. Isolated, git-tracked
 * copies of the reference example (R) and the toolkit (T) prove Git status
 * stays clean; two real, independently transcribed R modules
 * (`subs/workspace/subs/reviews` and its child `subs/workspace/subs/reviews/
 * subs/core`) supply the independently expected names/signatures/docs, hand-
 * picked from the real source below rather than the generated output.
 */

const excludedTopLevel = new Set(['node_modules', 'dist', '.git', '.reference-work', 'site', 'examples',
  '.cucumber-viz', '.claude', '.agents', '.devcontainer', '.github', '.vite']);
/** Reserved generated-output names, excluded at every depth: a source tree
 * (including the checked-out `examples/collection-review`) can carry real,
 * gitignored `.ramify` output on disk from an earlier materialize run, and
 * an "isolated" copy must never inherit it as pre-existing content. */
const generatedNamePattern = /^\.ramify(?:\.(?:tmp|old)-[0-9a-f]+)?$/;

async function copyTree(sourceRoot: string, destinationRoot: string, excluded: ReadonlySet<string>): Promise<void> {
  await mkdir(destinationRoot, { recursive: true });
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (excluded.has(entry.name) || generatedNamePattern.test(entry.name) || entry.isSymbolicLink()) continue;
    const from = join(sourceRoot, entry.name), to = join(destinationRoot, entry.name);
    if (entry.isDirectory()) await copyTree(from, to, excluded);
    else await import('node:fs/promises').then(fs => fs.copyFile(from, to));
  }
}

interface GitProject { readonly root: string; readonly kind: 'R' | 'T'; dispose(): Promise<void>; }

/** An isolated, `git init`-and-committed copy, so "Git status unchanged" is
 * meaningful. `node_modules` is symlinked from the real checkout (matching
 * the measurement fixtures' own convention): faster than copying, and never
 * a tracked file, so it never affects `git status`. */
async function isolatedGitProject(kind: 'R' | 'T', scratchRoot: string): Promise<GitProject> {
  await mkdir(scratchRoot, { recursive: true });
  const root = await mkdtemp(join(scratchRoot, `${kind.toLowerCase()}-`));
  const source = kind === 'R' ? join(repositoryRoot, 'examples/collection-review') : repositoryRoot;
  await copyTree(source, root, kind === 'R' ? new Set(['node_modules', 'dist', '.reference-work', '.git', '.vite']) : excludedTopLevel);
  await symlink(join(source, 'node_modules'), join(root, 'node_modules'));
  const git = (args: readonly string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'plan2a-harness', GIT_AUTHOR_EMAIL: 'plan2a-harness@example.invalid',
      GIT_COMMITTER_NAME: 'plan2a-harness', GIT_COMMITTER_EMAIL: 'plan2a-harness@example.invalid' } });
  git(['init', '-q']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'isolated copy for Plan 2A I2A-11 evidence']);
  return { root, kind, dispose: () => rm(root, { recursive: true, force: true }) };
}
function gitStatus(root: string): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
}

/** `rg`'s own exit code distinguishes "matched" (0) from "found nothing"
 * (1); anything else is a real invocation error the test must not swallow. */
function rg(args: readonly string[], cwd: string): { readonly matched: boolean; readonly stdout: string } {
  try { return { matched: true, stdout: execFileSync('rg', args, { cwd, encoding: 'utf8' }) }; }
  catch (error) {
    const failure = error as { status?: number; stdout?: string };
    if (failure.status === 1) return { matched: false, stdout: '' };
    throw error;
  }
}

const reviewsModule = 'subs/workspace/subs/reviews';
// Hand-picked, independently transcribed from the real R source (not from
// generated output): a real exported function with JSDoc owned by a child
// (`reviews/subs/core/src/runtime.ts`) and a real exported interface with
// JSDoc owned by an ancestor (the root's `src/interfaces/protocol.ts`).
const childName = 'createReviewRuntime';
const childDoc = 'Builds a runtime over one port';
const childDefiningFile = 'subs/workspace/subs/reviews/subs/core/src/runtime.ts';
const externalName = 'InvocationContext';
const externalDoc = 'What every request knows about itself';
const externalDefiningFile = 'src/interfaces/protocol.ts';
// A real test-only name (`createTestSystem`, root `expose-test ... to
// descendants`) and confirmation that a shared, ordinary-visible name
// (`createReviewRuntime`) repeats in the independently computed tests view.
const testOnlyName = 'createTestSystem';

async function materializeReviews(processes: Pick<SequenceProcess, 'run'>, root: string): Promise<void> {
  const outcome = await processes.run(root, ['materialize', '--all']);
  assert.equal(outcome.code, 0, `materialize --all failed: ${outcome.stderr}`);
}

export const plan2aWorkflowHandlers: ReadonlyMap<string, InstanceHandler> = new Map<string, InstanceHandler>([
  ['I2A-11:agent-instructions', { kind: 'memory', run: async ({ assertions: a }) => {
    const text = await readFile(join(repositoryRoot, 'AGENTS.md'), 'utf8');
    a.ok('states the catalogs are generated', /generated/i.test(text));
    a.ok('states the catalogs are gitignored', /gitignored/i.test(text));
    a.ok('states never edit or import from them', /[Nn]ever edit or import/.test(text));
    a.ok('states the exact ordinary-source command', text.includes("rg -n -i -C 6 '<terms>' src/.ramify/{external,children}"));
    a.ok('states the exact testing-source command', text.includes("rg -n -i -C 6 '<terms>' src/tests/.ramify/{external,children}"));
    a.ok('states each view is complete for its own area and the two must not be combined', /complete[^.]*; do not combine them/i.test(text));
    a.ok('states the refresh command', text.includes('ramify materialize --from <path>'));
    a.ok('states the coverage-limit caveat', /coverage limits[^.]*absence is not proof/i.test(text));
  } }],

  ['I2A-11:gitignored', { kind: 'memory', run: async ({ assertions: a }) => {
    const scratch = await mkdtemp(join(tmpdir(), 'plan2a-i11-gitignored-'));
    try {
      // One daemon session per isolated copy (never sharing a session across
      // R and T): a shared daemon's per-root configuration helper is spawned
      // with that root as its OS working directory, so removing an earlier
      // root's directory while the same daemon later serves a different root
      // is its own, separate concern (recorded under "Required follow-up"),
      // not what this leaf is evidencing.
      for (const kind of ['R', 'T'] as const) {
        await withSequenceProcess(async processes => {
          const project = await isolatedGitProject(kind, scratch);
          try {
            const beforeStatus = gitStatus(project.root);
            a.equal(`${kind}: the isolated copy starts with a clean tree after its own commit`, beforeStatus, '');
            await materializeReviews(processes, project.root);
            const afterStatus = gitStatus(project.root);
            a.equal(`${kind}: a complete materialization leaves no tracked or untracked Git status change`, afterStatus, '');
            // Final, stage and rollback names are all ignored, independent of
            // whether this particular run happened to create a stage/rollback
            // sibling: even the always-present final `.ramify` directories
            // must never appear in `git status --porcelain` output.
            a.ok(`${kind}: git status never mentions a .ramify path even though real .ramify directories now exist on disk`,
              !afterStatus.includes('.ramify'));
          } finally { await project.dispose(); }
        });
      }
    } finally { await rm(scratch, { recursive: true, force: true }); }
  } }],

  ['I2A-11:ordinary-hidden', { kind: 'memory', run: async ({ assertions: a }) => {
    const scratch = await mkdtemp(join(tmpdir(), 'plan2a-i11-ordinary-'));
    try {
      await withSequenceProcess(async processes => {
        const project = await isolatedGitProject('R', scratch);
        try {
          await materializeReviews(processes, project.root);
          const moduleRoot = join(project.root, reviewsModule);
          const plain = rg(['-n', externalName], moduleRoot);
          a.equal('an ordinary recursive rg from the module omits the generated .ramify view entirely', plain.matched, false);
          const explicit = rg(['-n', '-i', '-C', '6', externalName, 'src/.ramify/external', 'src/.ramify/children'], moduleRoot);
          a.equal('the documented explicit ordinary path finds the independently named API', explicit.matched, true);
          a.ok('the same search surfaces the real signature', explicit.stdout.includes('interface InvocationContext'));
          a.ok('the same search surfaces the real first documentation paragraph', explicit.stdout.includes(externalDoc));
          a.ok('the entry is marked type-only, matching the real interface-only original', explicit.stdout.includes(`\`${externalName}\` [type-only]`));
        } finally { await project.dispose(); }
      });
    } finally { await rm(scratch, { recursive: true, force: true }); }
  } }],

  ['I2A-11:tests-self-contained', { kind: 'memory', run: async ({ assertions: a }) => {
    const scratch = await mkdtemp(join(tmpdir(), 'plan2a-i11-tests-'));
    try {
      await withSequenceProcess(async processes => {
        const project = await isolatedGitProject('R', scratch);
        try {
          await materializeReviews(processes, project.root);
          const moduleRoot = join(project.root, reviewsModule);
          const shared = rg(['-n', '-i', '-C', '6', childName, 'src/tests/.ramify/external', 'src/tests/.ramify/children'], moduleRoot);
          a.equal('the documented test path alone finds an API shared with ordinary source', shared.matched, true);
          const unique = rg(['-n', '-i', '-C', '6', testOnlyName, 'src/tests/.ramify/external', 'src/tests/.ramify/children'], moduleRoot);
          a.equal('the documented test path alone finds a test-only API (a real expose-test binding)', unique.matched, true);
          // `createTestSystem` itself carries no directly attached JSDoc in
          // the real source (the nearby "configured system" comment
          // documents the file, not this specific symbol), so the real,
          // independently expected rendering is the signature with no
          // documentation paragraph and no placeholder - not a defect in
          // the search, the fixture, or this test.
          a.ok('the test-only entry carries its real signature', unique.stdout.includes('function createTestSystem(): TestSystem;'));
          // Independent confirmation of "test-only" (not part of the agent's
          // own documented workflow, which never consults the ordinary view
          // from tests source): the same name is genuinely absent there.
          const absentFromOrdinary = rg(['-n', '-i', testOnlyName, 'src/.ramify/external', 'src/.ramify/children'], moduleRoot);
          a.equal('independent check: the test-only API is genuinely absent from the ordinary view', absentFromOrdinary.matched, false);
        } finally { await project.dispose(); }
      });
    } finally { await rm(scratch, { recursive: true, force: true }); }
  } }],

  ['I2A-11:category-search', { kind: 'memory', run: async ({ assertions: a }) => {
    const scratch = await mkdtemp(join(tmpdir(), 'plan2a-i11-category-'));
    try {
      await withSequenceProcess(async processes => {
        const project = await isolatedGitProject('R', scratch);
        try {
          await materializeReviews(processes, project.root);
          const moduleRoot = join(project.root, reviewsModule);
          const childHit = rg(['-n', '-i', '-C', '6', childName, 'src/.ramify/children'], moduleRoot);
          a.equal('a real descendant-owned original is found explicitly under children', childHit.matched, true);
          a.ok('the children hit names the real defining file', childHit.stdout.includes(`${childDefiningFile}.md`));
          a.ok('the children hit surfaces the real documentation paragraph', childHit.stdout.includes(childDoc));
          const externalHit = rg(['-n', '-i', externalName, 'src/.ramify/external'], moduleRoot);
          a.equal('a real ancestor-owned original is found explicitly under external', externalHit.matched, true);
          a.ok('the external hit names the real defining file', externalHit.stdout.includes(`${externalDefiningFile}.md`));
          a.equal('the descendant original never appears under external', rg(['-n', '-i', childName, 'src/.ramify/external'], moduleRoot).matched, false);
          a.equal('the ancestor original never appears under children', rg(['-n', '-i', externalName, 'src/.ramify/children'], moduleRoot).matched, false);
          for (const npmName of ['@trpc/server', '@modelcontextprotocol', 'zod/', 'node_modules']) {
            a.equal(`no npm package or built-in output appears anywhere in the view ("${npmName}")`,
              rg(['-n', '-i', npmName, 'src/.ramify/external', 'src/.ramify/children'], moduleRoot).matched, false);
          }
        } finally { await project.dispose(); }
      });
    } finally { await rm(scratch, { recursive: true, force: true }); }
  } }],

  ['I2A-11:derived-import-check', { kind: 'memory', run: async ({ assertions: a }) => {
    const scratch = await mkdtemp(join(tmpdir(), 'plan2a-i11-derived-'));
    try {
      await withSequenceProcess(async processes => {
        const project = await isolatedGitProject('R', scratch);
        try {
          await materializeReviews(processes, project.root);
          const moduleRoot = join(project.root, reviewsModule);
          // The agent's own derivation: read the generated defining-file
          // path (never hand-written), strip ".md", and compute a real
          // relative TypeScript specifier from the new consuming file.
          const catalogHit = rg(['-i', '-l', childName, 'src/.ramify/children'], moduleRoot);
          if (!catalogHit.matched) throw new Error('Expected the children catalog to name the defining file');
          const generatedPath = catalogHit.stdout.trim().split('\n')[0]!;
          assert.ok(generatedPath.endsWith('.md'), generatedPath);
          const definingFile = generatedPath.slice(0, -'.md'.length); // project-relative, e.g. subs/workspace/subs/reviews/subs/core/src/runtime.ts
          const consumingFile = join(reviewsModule, 'src/derived-usage.ts');
          const relativeSpecifier = relativeImportSpecifier(dirname(join(project.root, consumingFile)), join(project.root, definingFile));
          await writeFile(join(project.root, consumingFile),
            `import { ${childName} } from '${relativeSpecifier}';\nexport const derivedUsage = ${childName};\n`);
          const checked = await processes.run(project.root, ['check', '--batch', '--format', 'json']);
          const report = JSON.parse(checked.stdout) as { summary: { denied: number }; diagnostics: readonly { code: string; location?: { file: string } }[] };
          a.equal('a real relative import derived from a generated defining path passes ramify check', [checked.code, report.summary.denied], [0, 0]);
          a.ok('no diagnostic names the newly derived file', !report.diagnostics.some(d => d.location?.file === consumingFile));
        } finally { await project.dispose(); }
      });

      // R's only real type-only originals are pure TypeScript interfaces
      // (e.g. InvocationContext), which have no runtime value at all: there
      // is no way to write a TypeScript "value import" of one that would
      // even compile, so R alone cannot independently exercise the denial.
      // A small purpose-built module tree supplies a real value-and-type
      // original (a class) that is genuinely type-only to one consumer
      // through the real `browser` required-symbol rule.
      const root = await mkdtemp(join(tmpdir(), 'plan2a-i11-negative-'));
      try {
        await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true } }));
        await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule f-root\n\nexpose-sub Widget from provider to descendants\n');
        await mkdir(join(root, 'subs/provider/src'), { recursive: true });
        await writeFile(join(root, 'subs/provider/module.ramify'), 'ramify 1\nmodule provider\n\nexpose-src Widget from "api.ts" to parent\n');
        await writeFile(join(root, 'subs/provider/src/api.ts'), 'export class Widget {\n  greet(): string { return \'hi\'; }\n}\n');
        await mkdir(join(root, 'subs/consumer/src'), { recursive: true });
        await writeFile(join(root, 'subs/consumer/module.ramify'), 'ramify 1\nmodule consumer tagged [browser]\n');
        // Widget is not browser-tagged at its origin, and `consumer` is
        // browser-classified, so the real required-symbol-tag rule makes
        // Widget type-only here (it has a real type binding: the class).
        await writeFile(join(root, 'subs/consumer/src/positive.ts'), `import type { Widget } from '../../provider/src/api.js';\nexport type Alias = Widget;\n`);
        await writeFile(join(root, 'subs/consumer/src/negative.ts'), `import { Widget } from '../../provider/src/api.js';\nexport const w = new Widget();\n`);
        const checked = await withSequenceProcess(async processes => processes.run(root, ['check', '--batch', '--format', 'json']));
        const report = JSON.parse(checked.stdout) as { summary: { denied: number };
          diagnostics: readonly { code: string; location?: { file: string } }[] };
        a.equal('a type-only entry imported as a value is denied, exactly once, for the negative file only',
          [report.summary.denied, report.diagnostics.length, report.diagnostics[0]?.code, report.diagnostics[0]?.location?.file],
          [1, 1, 'required-symbol-tag', 'subs/consumer/src/negative.ts']);
        a.ok('the type-only positive import of the same original is not itself denied',
          !report.diagnostics.some(d => d.location?.file === 'subs/consumer/src/positive.ts'));
      } finally { await rm(root, { recursive: true, force: true }); }
    } finally { await rm(scratch, { recursive: true, force: true }); }
  } }],
]);

/** A plain relative TypeScript specifier (posix separators, .js extension,
 * a leading "./" when the target is not further up the tree) — the same
 * derivation an agent performs by hand from a generated defining path. */
function relativeImportSpecifier(fromDirectory: string, toFile: string): string {
  let specifier = relative(fromDirectory, toFile).split(sep).join('/').replace(/\.ts$/, '.js');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}
