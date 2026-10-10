import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
const run = promisify(execFile);
const projectRoot = process.cwd();
const cli = join(projectRoot, 'node_modules/vitest/vitest.mjs');
const setup = join(projectRoot, 'src/tests/vitest-process-guard.ts');
const nativeSetup = join(projectRoot, 'src/tests/vitest-boundary-processes.ts');
const facade = join(projectRoot, 'subs/harness/src/tests/helpers/process-guard.ts');
const cases: Array<{ name: string; code: string; diagnostic: string }> = [
  { name: 'builtin state cannot grant caller supplied native permission', code: `import {createRequire} from 'node:module'; import {execFileSync} from 'node:child_process'; test('caught',()=>{const builtin=createRequire(import.meta.url)('child_process'); const state=builtin[Symbol.for('ramify-agent.ordinary-test-process-enforcement')]; expect(Object.isFrozen(state)).toBe(true); state.begin('src/tests/fake-native.test.ts',true); try{execFileSync('git',['--version'])}catch{} });`, diagnostic: 'execFileSync git --version' },
  { name: 'root reinstall cannot erase a caught refusal', code: `import { installProcessGuard } from ${JSON.stringify(join(projectRoot, 'src/tests/helpers/process-guard.ts'))}; import {execFileSync} from 'node:child_process'; test('caught',()=>{try{execFileSync('git',['--version'])}catch{} installProcessGuard();});`, diagnostic: 'execFileSync git --version' },
  { name: 'all seven native/default/CommonJS APIs are refused', code: `import cp from 'node:child_process'; import {createRequire} from 'node:module'; test('caught',()=>{const require=createRequire(import.meta.url); for(const source of [cp,require('child_process'),require('node:child_process')]) for(const api of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) expect(()=>source[api]('git',['--version'])).toThrow('process guard');});`, diagnostic: 'fork git --version' },

  { name: 'caught named Git refusal', code: `import { execFileSync } from 'node:child_process'; test('caught',()=>{try { execFileSync('git',['--version']) } catch {} });`, diagnostic: 'execFileSync git --version' },
  { name: 'default export', code: `import cp from 'node:child_process'; test('caught',()=>{try { cp.spawnSync('git',['--version']) } catch {} });`, diagnostic: 'spawnSync git --version' },
  { name: 'promisified export', code: `import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process'; import { promisify } from 'node:util'; test('caught',async()=>{try { await promisify(execFile)('git',['--version']) } catch {} });`, diagnostic: 'execFile git --version' },
  { name: 'CommonJS node spelling', code: `import { createRequire } from 'node:module'; test('caught',()=>{try { createRequire(import.meta.url)('node:child_process').execSync('git --version') } catch {} });`, diagnostic: 'execSync git --version' },
  { name: 'CommonJS bare spelling', code: `import { createRequire } from 'node:module'; test('caught',()=>{try { createRequire(import.meta.url)('child_process').spawn('git',['--version']) } catch {} });`, diagnostic: 'spawn git --version' },
  { name: 'ESM bare spelling', code: `import { execSync } from 'child_process'; test('caught',()=>{try { execSync('git --version') } catch {} });`, diagnostic: 'execSync git --version' },
  { name: 'importActual', code: `test('caught',async()=>{const cp=await vi.importActual('node:child_process'); try { cp.execFileSync('git',['--version']) } catch {} });`, diagnostic: 'execFileSync git --version' },
  { name: 'module setup', code: `import { execFileSync } from 'node:child_process'; try { execFileSync('git',['--version']) } catch {} test('still registers',()=>{});`, diagnostic: 'execFileSync git --version' },
  { name: 'beforeAll setup', code: `import { execFileSync } from 'node:child_process'; beforeAll(()=>{try {execFileSync('git',['--version'])}catch{}}); test('registered',()=>{});`, diagnostic: 'execFileSync git --version' },
  { name: 'afterAll failure retains refusal', code: `import { execFileSync } from 'node:child_process'; afterAll(()=>{try{execFileSync('git',['--version'])}catch{} throw new Error('original-teardown-failure');}); test('registered',()=>{});`, diagnostic: 'original-teardown-failure' },
  { name: 'afterAll teardown', code: `import { execFileSync } from 'node:child_process'; afterAll(()=>{try{execFileSync('git',['--version'])}catch{}}); test('registered',()=>{});`, diagnostic: 'execFileSync git --version' },
  { name: 'compatibility reset cannot erase', code: `import { guardedChildProcess, resetSpawnAttempts } from ${JSON.stringify(facade)}; import cp from 'node:child_process'; test('caught',()=>{try{guardedChildProcess(cp).execFileSync('git',['--version'])}catch{} resetSpawnAttempts(); vi.resetModules(); });`, diagnostic: 'execFileSync git --version' },
  { name: 'default Git adapter', code: `import { gitService } from ${JSON.stringify(join(projectRoot, 'subs/harness/subs/evidence/src/git.ts'))}; test('caught',async()=>{try{await gitService.currentHead(process.cwd())}catch{}});`, diagnostic: 'git rev-parse HEAD' },
  { name: 'missing candidate injection', code: `import { gitCandidateSource } from ${JSON.stringify(join(projectRoot, 'subs/harness/subs/evidence/src/git.ts'))}; test('caught',async()=>{try{await gitCandidateSource.readBlob(process.cwd(),'tree','src/missing.ts')}catch{}});`, diagnostic: 'git cat-file blob tree:./src/missing.ts' },
  { name: 'real Ramify adapter', code: `import { RamifyCli } from ${JSON.stringify(join(projectRoot, 'subs/harness/subs/evidence/src/ramify-cli.ts'))}; test('caught',async()=>{try{await new RamifyCli().run(['--version'],process.cwd())}catch{}});`, diagnostic: 'execFile' },
];
async function fixture(): Promise<{ root: string; remove(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'ramify-ordinary-guard-'));
  await mkdir(join(root, 'src/tests'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  await symlink(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  const config = (await readFile(join(projectRoot, 'vitest.config.ts'), 'utf8'))
    .replaceAll("'src/tests/vitest-test-lock.ts'", JSON.stringify(join(projectRoot, 'src/tests/vitest-test-lock.ts')))
    .replaceAll("'src/tests/vitest-process-guard.ts'", JSON.stringify(setup))
    .replaceAll("'src/tests/vitest-boundary-processes.ts'", JSON.stringify(nativeSetup))
    .replaceAll("'subs/harness/src/tests/helpers/mock-session-store.setup.ts'", JSON.stringify(join(projectRoot, 'subs/harness/src/tests/helpers/mock-session-store.setup.ts')));
  await writeFile(join(root, 'vitest.config.ts'), config);
  await writeFile(join(root, 'src/tests/test-boundaries.json'), JSON.stringify({ schema: 'ramify-agent.test-boundaries/1', boundaries: [] }));
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}
async function launch(root: string, args: string[]): Promise<{ code: number; text: string; stdout: string }> {
  try {
    const result = await run(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 4 * 1024 * 1024 });
    return { code: 0, text: result.stdout + result.stderr, stdout: result.stdout };
  } catch (error) {
    const failed = error as Error & { code?: number; stdout?: string; stderr?: string };
    if (typeof failed.code !== 'number') throw error;
    return { code: failed.code, text: (failed.stdout ?? '') + (failed.stderr ?? ''), stdout: failed.stdout ?? '' };
  }
}
async function observationsFor(root: string): Promise<Array<{ native: boolean; allowed: unknown[]; refused: unknown[] }>> {
  const directory = join(projectRoot, 'node_modules/.cache/ramify-agent-test-processes', createHash('sha256').update(root).digest('hex'));
  return Promise.all((await readdir(directory)).map(async file => JSON.parse(await readFile(join(directory, file), 'utf8'))));
}
describe('automatic ordinary runtime process boundary', () => {
  for (const row of cases) test(row.name, async () => {
    const directory = await fixture();
    try {
      await writeFile(join(directory.root, 'src/tests/new-ordinary.test.ts'), `import { test, expect, vi, beforeAll, afterAll } from 'vitest';\n${row.code}\n`);
      const result = await launch(directory.root, ['run', '--project', 'node', '--project', 'web', 'new-ordinary.test.ts']);
      expect(result.code).toBe(1);
      expect(result.text, result.text).toContain('Ordinary test attempted external processes');
      expect(result.text).toContain(row.diagnostic);
      const observations = await observationsFor(directory.root);
      expect(observations).toHaveLength(1);
      expect(observations[0]!.native).toBe(false);
      expect(observations[0]!.allowed).toEqual([]);
      expect(observations[0]!.refused.length).toBeGreaterThan(0);
    } finally { await directory.remove(); }
  });
  test('the complete configured invocation enforces a caught attempt too', async () => {
    const directory = await fixture();
    try {
      await writeFile(join(directory.root, 'src/tests/new-ordinary.test.ts'), `import { test } from 'vitest'; import { fork } from 'node:child_process'; test('caught',()=>{try{fork('git')}catch{}});`);
      const result = await launch(directory.root, ['run', '--maxWorkers', '4', 'new-ordinary.test.ts']);
      expect(result.code).toBe(1); expect(result.text).toContain('fork git');
    } finally { await directory.remove(); }
  });
  test('a newly discovered ordinary scripted case passes without attempted launches', async () => {
    const directory = await fixture();
    try {
      await writeFile(join(directory.root, 'src/tests/new-ordinary.test.ts'), `import { test, expect } from 'vitest'; test('scripted',async()=>expect(await Promise.resolve({head:'declared-head'})).toEqual({head:'declared-head'}));`);
      const result = await launch(directory.root, ['run', '--project', 'node', '--project', 'web', 'new-ordinary.test.ts']);
      expect(result.code).toBe(0);
    } finally { await directory.remove(); }
  });
});


describe('configured partition validation', () => {
  test('public configured discovery is a disjoint complete union and preserves fixture/scratch exclusions', async () => {
    const directory = await fixture();
    try {
      for (const file of ['src/tests/ordinary.test.ts', 'src/tests/native.test.ts', 'subs/web/src/added.test.tsx', 'subs/harness/fixtures/example/src/tests/excluded.test.ts', 'src/tmp/excluded.test.ts']) {
        await mkdir(dirname(join(directory.root, file)), { recursive: true });
        await writeFile(join(directory.root, file), "import { test } from 'vitest'; test('discovered',()=>{});\n");
      }
      await writeFile(join(directory.root, 'src/tests/test-boundaries.json'), JSON.stringify({schema:'ramify-agent.test-boundaries/1',boundaries:[{file:'src/tests/native.test.ts',boundary:'Runner positive control',whyFakeCannotProve:'Actual worker control',owningCases:['discovered']}]}));
      const aggregate = await launch(directory.root, ['list', '--filesOnly', '--json']);
      expect(aggregate.code).toBe(0);
      const rows = JSON.parse(aggregate.stdout) as Array<{file:string;projectName:string}>;
      expect(rows.map(row=>({file:relative(directory.root,row.file),projectName:row.projectName})).sort((a,b)=>a.file.localeCompare(b.file))).toEqual([
        {file:'src/tests/native.test.ts',projectName:'boundaries'}, {file:'src/tests/ordinary.test.ts',projectName:'node'}, {file:'subs/web/src/added.test.tsx',projectName:'web'},
      ]);
      const union: string[] = [];
      for (const project of ['node','web','boundaries']) {
        const result = await launch(directory.root, ['list','--filesOnly','--json','--project',project]);
        expect(result.code).toBe(0);
        const selected = JSON.parse(result.stdout) as Array<{file:string;projectName:string}>;
        expect(selected.every(row=>row.projectName===project)).toBe(true);
        union.push(...selected.map(row=>row.file));
      }
      expect(new Set(union).size).toBe(union.length);
      expect([...union].sort()).toEqual(rows.map(row=>row.file).sort());
    } finally { await directory.remove(); }
  });
  for (const defect of ['missing manifest','missing file','duplicate path','bad path','excluded fixture','excluded scratch','web boundary']) test(`fails configuration for ${defect}`, async () => {
    const directory = await fixture();
    try {
      const entry = {file:'src/tests/native.test.ts',boundary:'Native worker',whyFakeCannotProve:'Actual worker',owningCases:['case']};
      await writeFile(join(directory.root,entry.file), "import { test } from 'vitest'; test('case',()=>{});");
      let entries = [entry];
      if(defect==='missing manifest') await rm(join(directory.root,'src/tests/test-boundaries.json'));
      else {
        if(defect==='missing file') entry.file='src/tests/absent.test.ts';
        if(defect==='duplicate path') entries=[entry,entry];
        if(defect==='bad path') entry.file='../escape.test.ts';
        if(defect==='excluded fixture') entry.file='subs/harness/fixtures/example/src/tests/excluded.test.ts';
        if(defect==='excluded scratch') entry.file='src/tmp/excluded.test.ts';
        if(defect==='web boundary') entry.file='subs/web/src/native.test.ts';
        if(['excluded fixture','excluded scratch','web boundary'].includes(defect)) { await mkdir(dirname(join(directory.root,entry.file)),{recursive:true}); await writeFile(join(directory.root,entry.file),''); }
        await writeFile(join(directory.root,'src/tests/test-boundaries.json'),JSON.stringify({schema:'ramify-agent.test-boundaries/1',boundaries:entries}));
      }
      const result=await launch(directory.root,['list','--filesOnly','--json']);
      expect(result.code).not.toBe(0);
      expect(result.text).toMatch(/test boundar|test-boundaries|ENOENT/i);
    } finally { await directory.remove(); }
  });
});

describe('builtin functions captured across a reused worker',()=>{
  for (const nativeFirst of [false,true]) test(nativeFirst?'native then ordinary then native':'ordinary then native then ordinary',async()=>{
    const directory=await fixture();
    try {
      const files=['src/tests/a.test.ts','src/tests/b.test.ts','src/tests/c.test.ts'];
      const natives=nativeFirst?[files[0]!,files[2]!]:[files[1]!];
      await writeFile(join(directory.root,'src/tests/test-boundaries.json'),JSON.stringify({schema:'ramify-agent.test-boundaries/1',boundaries:natives.map(file=>({file,boundary:'Actual cached builtin positive control',whyFakeCannotProve:'Same worker native adapter execution',owningCases:['native']}))}));
      await writeFile(join(directory.root,'cached.cjs'),"const cp=require('child_process'); const util=require('node:util'); module.exports={sync:cp.execFileSync,async:util.promisify(cp.execFile)};\n");
      const observations=join(directory.root,'observations.jsonl');
      const marker=join(directory.root,'unexpected-launch');
      for(const file of files) {
        const native=natives.includes(file);
        const body=native?`expect(cached.sync(process.execPath,['-e','process.stdout.write("native-sync")'],{encoding:'utf8'})).toBe('native-sync'); expect((await cached.async(process.execPath,['-e','process.stdout.write("native-async")'])).stdout).toBe('native-async');`:`try{cached.sync(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`)}])}catch{} try{await cached.async('git',['--version'])}catch{} expect(existsSync(${JSON.stringify(marker)})).toBe(false);`;
        await writeFile(join(directory.root,file),`import {test,expect} from 'vitest'; import {createRequire} from 'node:module'; import {appendFileSync,existsSync} from 'node:fs'; const cached=createRequire(import.meta.url)('../../cached.cjs'); test(${JSON.stringify(native?'native':'ordinary')},async()=>{appendFileSync(${JSON.stringify(observations)},JSON.stringify({file:${JSON.stringify(file)},pid:process.pid})+'\\n'); ${body}});`);
      }
      // This deliberate worker-lifetime experiment uses the production guard
      // setup and exact registry in one shared project, so all three files must
      // reuse the same process and cached CJS exports, in a proven order.
      await writeFile(join(directory.root,'reuse.config.ts'),`import {defineConfig} from 'vitest/config'; import {BaseSequencer} from 'vitest/node'; class Ordered extends BaseSequencer {async sort(files){return [...files].sort((a,b)=>a.moduleId.localeCompare(b.moduleId))}} export default defineConfig({test:{name:'reuse',include:['src/tests/*.test.ts'],setupFiles:[${JSON.stringify(setup)}],isolate:false,fileParallelism:false,maxWorkers:1,sequence:{sequencer:Ordered}}});`);
      const result=await launch(directory.root,['run','--config','reuse.config.ts']);
      expect(result.code).toBe(1); expect(result.text, result.text).toContain('Ordinary test attempted external processes');
      const rows=(await readFile(observations,'utf8')).trim().split('\n').map(line=>JSON.parse(line) as {file:string;pid:number});
      expect(rows.map(row=>row.file)).toEqual(files);
      expect(new Set(rows.map(row=>row.pid)).size).toBe(1);
      expect(result.text).toContain(`${natives.length} passed`);
    } finally { await directory.remove(); }
  });
});

describe('forwarded guards captured across a reused worker', () => {
  for (const nativeFirst of [false, true]) test(nativeFirst ? 'native/ordinary/native forwarding preserves command results and refused observations' : 'ordinary/native/ordinary forwarding preserves command results and refused observations', async () => {
    const directory = await fixture();
    try {
      const files = ['src/tests/a.test.ts', 'src/tests/b.test.ts', 'src/tests/c.test.ts'];
      const natives = nativeFirst ? [files[0]!, files[2]!] : [files[1]!];
      await writeFile(join(directory.root, 'src/tests/test-boundaries.json'), JSON.stringify({ schema: 'ramify-agent.test-boundaries/1', boundaries: natives.map(file => ({ file, boundary: 'Forwarding adapter native positive control', whyFakeCannotProve: 'Actual promisified stdout/stderr and worker cache lifetime', owningCases: ['native'] })) }));
      const rootHelper = join(projectRoot, 'src/tests/helpers/process-guard.ts');
      await writeFile(join(directory.root, 'forwarded.ts'), `import cp from 'node:child_process'; import {promisify} from 'node:util'; import {randomUUID} from 'node:crypto'; import {guardedChildProcess as rootGuarded} from ${JSON.stringify(rootHelper)}; import {guardedChildProcess,spawnAttempts,resetSpawnAttempts} from ${JSON.stringify(facade)}; export const token=randomUUID(); export {spawnAttempts,resetSpawnAttempts}; export const ports=[rootGuarded(cp),guardedChildProcess(cp)].map(port=>({sync:port.execFileSync,async:promisify(port.execFile),exec:promisify(port.exec)}));`);
      const observations = join(directory.root, 'observations.jsonl');
      const marker = join(directory.root, 'unexpected-forwarded-launch');
      const nativeCode = `for(const port of ports){expect(port.sync(process.execPath,['-e',"process.stdout.write('sync-out')"],{encoding:'utf8'})).toBe('sync-out'); expect(await port.async(process.execPath,['-e',"process.stdout.write('async-out');process.stderr.write('async-err')"])).toEqual({stdout:'async-out',stderr:'async-err'}); expect(await port.exec(JSON.stringify(process.execPath)+' -e '+JSON.stringify("process.stdout.write('exec-out');process.stderr.write('exec-err')"))).toEqual({stdout:'exec-out',stderr:'exec-err'}); await expect(port.async('/absent-native-executable')).rejects.toMatchObject({code:'ENOENT'});} expect(spawnAttempts()).toEqual([]); expect(rootAttempts()).toEqual([]);`;
      const ordinaryCode = `for(const port of ports){try{port.sync(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'started')`)}])}catch{} try{await port.async('git',['--version'])}catch{} try{await port.exec('git --version')}catch{}} expect(spawnAttempts()).toHaveLength(3); expect(rootAttempts()).toHaveLength(6); resetSpawnAttempts(); expect(spawnAttempts()).toEqual([]); expect(rootAttempts()).toHaveLength(6); expect(existsSync(${JSON.stringify(marker)})).toBe(false);`;
      for (const file of files) await writeFile(join(directory.root, file), `import {test,expect} from 'vitest'; import {appendFileSync,existsSync} from 'node:fs'; import {ports,token,spawnAttempts,resetSpawnAttempts} from '../../forwarded.ts'; import {spawnAttempts as rootAttempts} from ${JSON.stringify(rootHelper)}; test(${JSON.stringify(natives.includes(file) ? 'native' : 'ordinary')},async()=>{resetSpawnAttempts(); appendFileSync(${JSON.stringify(observations)},JSON.stringify({file:${JSON.stringify(file)},pid:process.pid,token})+'\\n'); ${natives.includes(file) ? nativeCode : ordinaryCode}});`);
      await writeFile(join(directory.root, 'reuse.config.ts'), `import {defineConfig} from 'vitest/config'; import {BaseSequencer} from 'vitest/node'; class Ordered extends BaseSequencer {async sort(files){return [...files].sort((a,b)=>a.moduleId.localeCompare(b.moduleId))}} export default defineConfig({test:{name:'reuse',include:['src/tests/*.test.ts'],setupFiles:[${JSON.stringify(setup)}],isolate:false,fileParallelism:false,maxWorkers:1,sequence:{sequencer:Ordered}}});`);
      const result = await launch(directory.root, ['run', '--config', 'reuse.config.ts']);
      expect(result.code).toBe(1);
      expect(result.text, result.text).toContain('Ordinary test attempted external processes');
      expect(result.text).toContain(`${natives.length} passed`);
      const rows = (await readFile(observations, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { file: string; pid: number; token: string });
      expect(rows.map(row => row.file)).toEqual(files);
      expect(new Set(rows.map(row => row.pid)).size).toBe(1);
      expect(new Set(rows.map(row => row.token)).size).toBe(1);
      const telemetry = await observationsFor(directory.root);
      expect(telemetry).toHaveLength(3);
      for (const record of telemetry) {
        // Each native exec calls Node's exported execFile internally: two API observations, one command.
        if (record.native) { expect(record.allowed).toHaveLength(10); expect(record.refused).toEqual([]); }
        else { expect(record.allowed).toEqual([]); expect(record.refused).toHaveLength(6); }
      }
    } finally { await directory.remove(); }
  });
});
