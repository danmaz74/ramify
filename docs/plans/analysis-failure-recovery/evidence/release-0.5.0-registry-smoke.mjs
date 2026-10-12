import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const repository = resolve('.');
const scratch = await mkdtemp(join(tmpdir(), 'ramify-ownership-pack-'));
const consumer = join(scratch, 'consumer'), project = join(scratch, 'project'), endpoint = join(scratch, 'endpoint');
await mkdir(consumer); await mkdir(join(project, 'src'), { recursive: true });
await mkdir(join(project, 'subs/provider/src'), { recursive: true });
await mkdir(endpoint, { mode: 0o700 });
const exec = promisify(execFile);
const observations = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function run(command, args, cwd = project) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, NODE_OPTIONS: '', RAMIFY_ENDPOINT_DIR: endpoint },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30_000);
    child.stdout.on('data', value => { stdout += String(value); });
    child.stderr.on('data', value => { stderr += String(value); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); timedOut ? reject(new Error(`${command} timed out`))
      : resolveRun({ code, stdout, stderr }); });
  });
}
const file = (path, value) => writeFile(join(project, path), value);
try {
  const packed = JSON.parse((await exec('npm', ['pack', 'ramify.ts@0.5.0', '--registry=https://npm.braimax.com', '--ignore-scripts', '--json', '--pack-destination', scratch],
    { cwd: repository, timeout: 30_000, maxBuffer: 8 * 1024 ** 2 })).stdout)[0];
  assert.equal(packed.version, '0.5.0');
  const published = JSON.parse(await readFile('/tmp/ramify-release-0.5.0/registry-metadata.json', 'utf8'));
  assert.equal(packed.integrity, published.dist.integrity);
  const tarball = join(scratch, packed.filename);
  const tarballSha256 = sha256(await readFile(tarball));
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  await exec('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', tarball],
    { cwd: consumer, timeout: 30_000 });
  await writeFile(join(consumer, 'smoke.ts'), `import { ownershipDocumentSchema } from 'ramify.ts/cli';\nimport type { OwnershipDocument } from 'ramify.ts/cli';\nconst decoded: OwnershipDocument = ownershipDocumentSchema.parse({});\nif (decoded.status === 'answered') { const exit: 0 = decoded.exitCode; void exit; }\nelse { const exit: 1 | 2 = decoded.exitCode; void exit; }\n`);
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext',
    moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: true }, include: ['smoke.ts'] }));
  await exec(join(repository, 'node_modules/.bin/tsc'), ['-p', join(consumer, 'tsconfig.json')], { cwd: consumer, timeout: 30_000 });
  await writeFile(join(consumer, 'runtime-smoke.mjs'),
    "import { ownershipDocumentSchema } from 'ramify.ts/cli'; export { ownershipDocumentSchema };\n");
  const module = await import(join(consumer, 'runtime-smoke.mjs'));
  assert.equal(typeof module.ownershipDocumentSchema.parse, 'function');
  const bin = join(consumer, 'node_modules/.bin/ramify');
  const version = await run(bin, ['--version']);
  assert.equal(version.code, 0);
  assert.match(version.stdout, /0\.5\.0/);
  await file('module.ramify', 'ramify 1\nroot module smoke\nexpose-sub * from provider to descendants\n');
  await file('tsconfig.json', '{"compilerOptions":{"module":"ESNext","moduleResolution":"bundler","types":[]},"include":["src","subs"]}');
  await file('src/index.ts', 'export const value = 1;\n');
  await file('subs/provider/module.ramify', 'ramify 1\nmodule provider\nexpose-src value from "api.ts" to parent\n');
  await file('subs/provider/src/api.ts', 'export const value = 1;\n');
  for (const [name, mutate, status, exit] of [
    ['valid', async () => {}, 'answered', 0],
    ['link-invalid', async () => file('subs/provider/src/api.ts', 'export {};\n'), 'answered', 0],
    ['broken-acquisition', async () => file('subs/provider/module.ramify', 'ramify 1\nmodule provider\nexpose-src\n'), 'invalid', 1],
  ]) {
    await mutate();
    const outcome = await run(bin, ['ownership', '--root', project, '--path', 'subs/provider/src/api.ts', '--format', 'json']);
    assert.equal(outcome.code, exit, `${name}: ${outcome.stderr} ${outcome.stdout}`);
    const document = module.ownershipDocumentSchema.parse(JSON.parse(outcome.stdout));
    assert.equal(document.status, status);
    assert.equal(document.schemaVersion, 'ramify.ownership/1');
    if (status === 'answered') assert.equal(document.scope.ownership.modules.length, 2);
    else { assert.equal('scope' in document, false); assert.equal('inputId' in document, false); }
    assert.deepEqual(await readdir(endpoint), [], `${name}: ownership started daemon state`);
    observations.push({ name, exitCode: outcome.code, status: document.status,
      schemaVersion: document.schemaVersion, diagnostics: document.diagnostics?.map(item => item.code) ?? [] });
  }
  const receipt = { source: 'https://npm.braimax.com/ramify.ts/0.5.0', installedVersionOutput: version.stdout.trim(), registryIntegrityVerified: true, tarball: { filename: packed.filename, sha256: tarballSha256, integrity: packed.integrity,
    packageVersion: packed.version }, publicEntry: 'ramify.ts/cli', typescript: 'passed', runtimeSchema: 'passed',
    observations, endpointState: 'empty after every command' };
  const output = '/tmp/ramify-release-0.5.0/registry-smoke.json';
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
} finally { await rm(scratch, { recursive: true, force: true }); }
