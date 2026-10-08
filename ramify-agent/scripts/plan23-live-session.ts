import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trialReportDestination } from './trial-attribution.js';
import { runPlan23LiveSession, type Plan23LiveSessionOptions, type Plan23LiveSessionResult } from '../subs/harness/src/qualification/live-session.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = promisify(execFile);
/** Separate processes are part of qualification; there is no SDK/private transcript access here. */
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--trial-report-destination' && args.length === 3) { process.stdout.write(JSON.stringify({ destination: await trialReportDestination(args[1]!, args[2]!) }) + '\n'); return; }
  if (args[0] === '--phase-input' && args.length === 2) {
    const input = JSON.parse(await readFile(args[1]!, 'utf8')) as Plan23LiveSessionOptions;
    const phaseHead = (await command('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(); const phaseStatus = (await command('git', ['status', '--porcelain'], { cwd: root })).stdout; if (phaseHead !== input.sourceCandidate || phaseStatus.trim()) throw new Error('Exact clean candidate required in phase process');
    const checkout = (await command('git', ['rev-parse', '--show-toplevel'], { cwd: root })).stdout.trim(); const evidence = await realpath(input.evidenceDirectory); if (evidence === checkout || evidence.startsWith(checkout + '/')) throw new Error('Phase evidence must be outside entire analyzed checkout');
    const result = await runPlan23LiveSession(input); process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.status === 'completed' ? 0 : 1; return;
  }
  if (args.length !== 4 || args[0] !== '--source-candidate' || args[2] !== '--evidence-directory' || !/^[0-9a-f]{40}$/u.test(args[1]!)) throw new Error('Usage: tsx scripts/plan23-live-session.ts --source-candidate <clean-head> --evidence-directory <external-directory>');
  const sourceCandidate = args[1]!; const evidenceDirectory = resolve(args[3]!);
  const checkout = (await command('git', ['rev-parse', '--show-toplevel'], { cwd: root })).stdout.trim();
  await mkdir(evidenceDirectory, { recursive: true }); const external = await realpath(evidenceDirectory); if (external === checkout || external.startsWith(checkout + '/')) throw new Error('Qualification evidence must be outside entire analyzed checkout');
  if ((await readdir(external)).length) throw new Error('Fresh empty qualification evidence directory required');
  const actual = (await command('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(); const status = (await command('git', ['status', '--porcelain'], { cwd: root })).stdout;
  if (actual !== sourceCandidate || status.trim()) throw new Error('Exact clean committed candidate required');
  const workingDirectory = join(external, 'fixture'); await mkdir(workingDirectory, { recursive: true });
  const common = { runId: `plan23-live-${sourceCandidate.slice(0, 12)}`, sourceCandidate, workingDirectory, storeDirectory: join(external, 'store'), evidenceDirectory: external, handoffFile: join(external, 'handoff.json'), operationTimeoutMs: 180_000, settlementTimeoutMs: 30_000 };
  const results: Plan23LiveSessionResult[] = [];
  for (const phase of ['initial', 'restore'] as const) {
    const inputFile = join(external, `${phase}-input.json`); await writeFile(inputFile, JSON.stringify({ ...common, phase }));
    // Child stdin/stdout contains only public plain input/result; credentials stay Pi-owned.
    const phaseHead = (await command('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(); const phaseStatus = (await command('git', ['status', '--porcelain'], { cwd: root })).stdout; if (phaseHead !== sourceCandidate || phaseStatus.trim()) throw new Error('Clean candidate changed before live phase');
    let child;
    try { child = await command(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--phase-input', inputFile], { cwd: root, env: process.env, timeout: 900_000, maxBuffer: 1024 * 1024 }); } catch (error) { const failure = error as Error & { stdout?: string; stderr?: string }; await writeFile(join(external, `${phase}-process-failure.json`), JSON.stringify({ status: 'failed', phase, sourceCandidate, reason: failure.message, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' })); throw new Error(`Live ${phase} failed; original partial evidence retained at ${external}`); }
    const result = JSON.parse(child.stdout.trim().split('\n').at(-1)!) as Plan23LiveSessionResult; if (result.status !== 'completed' || result.sourceCandidate !== sourceCandidate) throw new Error(`Live ${phase} did not complete`); results.push(result);
  }
  const finalHead = (await command('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(); const finalStatus = (await command('git', ['status', '--porcelain'], { cwd: root })).stdout; if (finalHead !== sourceCandidate || finalStatus.trim()) throw new Error('Clean candidate changed during live qualification');
  const initial = JSON.parse(await readFile(results[0]!.evidenceFile, 'utf8')) as { pid: number }; const restored = JSON.parse(await readFile(results[1]!.evidenceFile, 'utf8')) as { pid: number };
  if (initial.pid === restored.pid) throw new Error('Actual NEW process restoration required');
  await writeFile(join(external, 'manifest.json'), JSON.stringify({ schema: 'ramify-agent.plan23-live-evidence/1', sourceCandidate, results, processIds: [initial.pid, restored.pid] }, null, 2));
  process.stdout.write(JSON.stringify({ status: 'completed', sourceCandidate, evidenceDirectory: external, processIds: [initial.pid, restored.pid] }) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
