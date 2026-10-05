import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Installs the built toolkit into the documentation site as a packed candidate.
 *
 * The site imports the toolkit only through its package exports, so it needs the
 * package in `site/node_modules`. This script packs the current build into a
 * temporary directory and installs that tarball into the site with `--no-save`,
 * which writes neither the site's manifest nor its lockfile: they never name the
 * candidate, and no local artifact path or registry integrity is committed. npm
 * still reads the lockfile, so every other site package keeps its locked version;
 * `--no-package-lock` would make npm resolve the site's whole tree again from the
 * registry. Both files are compared before and after. `npm --prefix site ci`
 * therefore removes the candidate again, and `npm run site:build` runs this script
 * first. A checkout without a build is built first; a site without installed
 * dependencies receives `npm ci` first. The toolkit build never depends on the site.
 *
 *     npm run site:prepare
 */

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly bin?: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, string | Readonly<Record<string, string>>>>;
}

interface PackedTarball { readonly filename: string; readonly integrity: string; readonly files: readonly { readonly path: string }[] }

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const site = join(root, 'site');

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Runs npm with an explicit prefix, so an inherited `npm run` environment never redirects it. */
async function npm(args: readonly string[], capture = false): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn('npm', args, { cwd: root, stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'] });
    let stdout = '';
    child.stdout?.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? accept(stdout)
      : reject(new Error(`npm ${args.join(' ')} failed with exit ${code}`)));
  });
}

/** Every file the package's exports and bin name, relative to the package root. */
function packageTargets(manifest: PackageManifest): string[] {
  const targets = Object.values(manifest.bin ?? {});
  for (const entry of Object.values(manifest.exports)) {
    targets.push(...typeof entry === 'string' ? [entry] : Object.values(entry));
  }
  return [...new Set(targets.map(target => target.replace(/^\.\//, '')))].sort();
}

async function missingTargets(manifest: PackageManifest): Promise<string[]> {
  const missing: string[] = [];
  for (const target of packageTargets(manifest)) if (!await exists(join(root, target))) missing.push(target);
  return missing;
}

/** Installed copies of a package beneath a `node_modules` directory, nested ones included. */
async function installedCopies(modules: string, name: string, prefix = 'node_modules'): Promise<string[]> {
  if (!await exists(modules)) return [];
  const copies: string[] = [];
  for (const entry of await readdir(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const packages = entry.name.startsWith('@')
      ? (await readdir(join(modules, entry.name), { withFileTypes: true })).filter(item => item.isDirectory()).map(item => `${entry.name}/${item.name}`)
      : [entry.name];
    for (const pkg of packages) {
      if (pkg === name) copies.push(`${prefix}/${pkg}`);
      copies.push(...await installedCopies(join(modules, pkg, 'node_modules'), name, `${prefix}/${pkg}/node_modules`));
    }
  }
  return copies;
}

async function prepareSiteCandidate(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as PackageManifest;
  const missing = await missingTargets(manifest);
  if (missing.length) {
    process.stdout.write(`The toolkit build lacks ${missing.length} package entry files, such as ${missing[0]}; running npm run build first.\n`);
    await npm(['--prefix', root, 'run', 'build']);
    const still = await missingTargets(manifest);
    if (still.length) throw new Error(`The build did not produce the package entries ${still.join(', ')}`);
  }
  if (!await exists(join(site, 'node_modules'))) {
    process.stdout.write('The site has no installed dependencies; running npm ci in site first.\n');
    await npm(['--prefix', site, 'ci', '--no-audit', '--no-fund']);
  }

  const siteManifest = await readFile(join(site, 'package.json'));
  const siteLock = await readFile(join(site, 'package-lock.json'));
  const work = await mkdtemp(join(tmpdir(), 'ramify-site-candidate-'));
  try {
    const packed = JSON.parse(await npm(['pack', root, '--json', '--ignore-scripts', '--pack-destination', work], true)) as PackedTarball[];
    if (packed.length !== 1) throw new Error(`npm pack produced ${packed.length} archives, expected one`);
    const tarball = join(work, packed[0]!.filename);
    const sha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
    await npm(['--prefix', site, 'install', tarball, '--no-save', '--ignore-scripts',
      '--prefer-offline', '--no-audit', '--no-fund']);

    if (!(await readFile(join(site, 'package.json'))).equals(siteManifest)) throw new Error('Installing the candidate changed site/package.json');
    if (!(await readFile(join(site, 'package-lock.json'))).equals(siteLock)) throw new Error('Installing the candidate changed site/package-lock.json');
    const installed = JSON.parse(await readFile(join(site, 'node_modules', manifest.name, 'package.json'), 'utf8')) as PackageManifest;
    if (installed.version !== manifest.version) throw new Error(`The site holds ${manifest.name}@${installed.version}, expected ${manifest.version}`);
    // The site and the toolkit's presentation entry must share the site's single React runtime.
    for (const name of ['react', 'react-dom']) {
      const copies = await installedCopies(join(site, 'node_modules'), name);
      if (copies.length !== 1 || copies[0] !== `node_modules/${name}`) throw new Error(`The site must hold one ${name}, found ${copies.join(', ') || 'none'}`);
    }
    process.stdout.write(`Installed ${manifest.name}@${manifest.version} into site/node_modules from the packed build: `
      + `${packed[0]!.filename}, ${packed[0]!.files.length} files, sha256 ${sha256}, ${packed[0]!.integrity}.\n`);
  } finally { await rm(work, { recursive: true, force: true }); }
}

try { await prepareSiteCandidate(); }
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
