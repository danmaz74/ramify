/*
 * Manual paid Plan 13 tool-start witness. Never run by Vitest. Run only after
 * the repair cwd/scope implementation is committed:
 *
 * npx tsx subs/harness/src/probes/plan13-module-local.probe.ts --output /tmp/plan13-module-local.json
 *
 * This exercises the real pi AgentPort, engineerEquipment, one real shell pwd
 * process and built-in read/write calls. The scratch project is disposable.
 * The Ramify hook is explicitly unavailable, so this is a tool-start and
 * guard witness, not a complete RunService/check/gate witness.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { AgentEvent, AgentSession, ContextPolicy, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';
import type { ArchitectIndex, ModuleEntry } from '../../subs/evidence/src/views.js';
import { RamifyCli, type RamifyRun } from '../../subs/evidence/src/ramify-cli.js';
import { checkCommand } from '../checks/records.js';
import { ObservationLog } from '../run/observations.js';
import { deniedFiles, guardedScopeOf, resolveWriteScope } from '../work/scope.js';
import { engineerWorkingDirectory, repairWorkingDirectory } from '../work/engineer-directory.js';
import { engineerEquipment } from '../work/engineer-equipment.js';
import type { WriteScope } from '../work/iterations.js';

const exec = promisify(execFile);
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const context: ContextPolicy = { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };
const boundMs = 240_000;
const unavailable = JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable', reason: 'module-local probe does not run Ramify checks', exitCode: 2 });

/** The probe measures the pi/tool boundary; its post-write check is explicitly unavailable. */
class ProbeUnavailableRamifyCli extends RamifyCli {
  calls = 0;
  constructor() { super({ executable: '/nonexistent/module-local-probe-ramify', timeoutMs: 0 }); }
  override async run(_args: readonly string[], _cwd: string, _signal?: AbortSignal): Promise<RamifyRun> {
    this.calls += 1;
    return { code: 2, stdout: `${unavailable}\n`, stderr: '' };
  }
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function indexOfProject(): ArchitectIndex {
  const entry = (module: string, dir: string): ModuleEntry => ({ module, dir, parent: null, children: [], tags: [], areas: ['src'] });
  return { revision: 'probe', input: 'probe', symbols: new Map(), modules: new Map([
    ['app/alpha', entry('app/alpha', 'subs/alpha')], ['app/beta', entry('app/beta', 'subs/beta')],
  ]) };
}

async function capturedScope(project: string, kind: 'ordinary' | 'repair'): Promise<WriteScope> {
  return resolveWriteScope({ projectRoot: project, ramify: new RamifyCli(), index: indexOfProject(), view: { status: 'placeholder' }, revision: 1,
    base: kind === 'repair' ? { modules: ['app', 'app/alpha', 'app/beta'], rationale: 'One explicit project-wide probe repair' } : { module: 'app/alpha', included: [] },
    extra: [], read: [], bootstrap: [], rationale: 'Manual tool-start witness; actual installed provider scope' });
}

function usage(events: readonly AgentEvent[]) {
  return events.flatMap(event => event.type === 'message' && event.role === 'assistant'
    ? [{ model: event.detail.model, tokens: event.usage }] : []);
}

async function bounded(session: AgentSession): Promise<{ kind: string; elapsedMs: number }> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const kind = await Promise.race([
    session.outcome.then(outcome => outcome.kind),
    new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), boundMs); }),
  ]);
  clearTimeout(timer);
  if (kind === 'timed-out') await session.stop();
  return { kind, elapsedMs: Date.now() - start };
}

async function implementation() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '../../../..');
  const paths = [
    join(here, 'plan13-module-local.probe.ts'),
    join(here, '../work/engineer-directory.ts'),
    join(here, '../work/engineer-equipment.ts'),
    join(here, '../work/scope.ts'),
    join(here, '../guard/write-guard.ts'),
    join(here, '../run/service.ts'),
    join(root, 'subs/harness/subs/agent/subs/pi/src/pi-agent.ts'),
  ];
  const [head, status, files] = await Promise.all([
    exec('git', ['rev-parse', 'HEAD'], { cwd: root }).then(result => result.stdout.trim()),
    exec('git', ['status', '--porcelain'], { cwd: root }).then(result => result.stdout.trim()),
    Promise.all(paths.map(async path => ({ path: relative(root, path), sha256: sha256(await readFile(path)) }))),
  ]);
  return { head, dirty: status !== '', files };
}

async function oneSession(
  agent: ReturnType<typeof createPiAgent>, scratch: string, project: string,
  kind: 'ordinary' | 'repair', sessions: AgentSession[],
) {
  const captured = await capturedScope(project, kind);
  const view = indexOfProject();
  const cwd = kind === 'repair'
    ? await repairWorkingDirectory(project, 'app/alpha', view)
    : await engineerWorkingDirectory(project, captured, view);
  const directory = join(scratch, kind);
  await mkdir(directory, { recursive: true });
  const observations = await ObservationLog.open(join(directory, 'observations.jsonl'));
  const events: AgentEvent[] = [];
  const latest = new Map<string, string>();
  const ramify = new ProbeUnavailableRamifyCli();
  const command = checkCommand({ argv: ['true'], cwd: project, timeoutMs: 5_000 });
  const denied = await deniedFiles(project, ['features/probe.feature', 'plans/probe/plan.md', 'docs/engineering.principles.md']);
  const guarded = guardedScopeOf(captured, denied);
  const equipment = engineerEquipment({
    projectRoot: project, workingDirectory: cwd, ramify,
    commands: { typeCheck: command, ramifyCheck: command, hookTimeoutMs: 5_000 },
    bounds: { rejectedToolInputsPerTurn: 3 }, refresh: async () => view, index: () => view,
    guarded, scopeRevision: guarded.revision,
    outputPath: (type, invocation, number) => join(directory, `${type}-${invocation}-${number}.log`),
  });
  const equipped = equipment.equip({ invocation: kind, observations,
    callId: tool => latest.get(tool) ?? `${kind}-unknown-${tool}`, reminders: () => [] });
  const own = `${kind}-own.txt`;
  const cross = `${kind}-cross.txt`;
  const prompt = [
    `You are in the ${kind} assignment of a disposable project. Perform EACH tool call below in order, even when a write is refused; never use shell to write.`,
    '1. Call shell with command `pwd`.',
    '2. Call built-in read on `seed.txt`.',
    `3. Call built-in write on ${own} with content "own ${kind}\\n".`,
    `4. Call built-in write on ../../beta/src/${cross} with content "cross ${kind}\\n".`,
    '5. Call built-in write on ../../../plans/probe/plan.md with content "changed plan\\n".',
    '6. Call built-in write on ../../../features/probe.feature with content "changed feature\\n".',
    '7. Call built-in write on ../../../ramify-agent.json with content "changed config\\n".',
    '8. Call built-in write on ../../../docs/engineering.principles.md with content "changed principle\\n".',
    '9. Call built-in write on ../../../../outside.txt with content "changed outside\\n".',
    '10. Call submit_probe with no fields. Do not stop after a refusal; a refused write is an expected observation.',
  ].join('\n');
  const spec: SessionSpec = {
    role: kind === 'repair' ? 'nonfunctional-repair-engineer' : 'engineer', scope: { workingDirectory: cwd },
    systemPrompt: 'Exercise the supplied tools exactly as directed. Treat guard errors as expected and continue.',
    prompt, session: { mode: 'fresh' }, context,
    builtinTools: [...(equipped.builtinTools ?? [])], tools: [...(equipped.tools ?? [])],
    submission: { name: 'submit_probe', description: 'Finish the bounded tool-start probe.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      accept: async () => ({ accepted: true }) },
    sessionDirectory: join(directory, 'session'),
    ...(equipped.guard === undefined ? {} : { guard: equipped.guard }),
    ...(equipped.afterMutation === undefined ? {} : { afterMutation: equipped.afterMutation }),
    onEvent: event => { events.push(event); if (event.type === 'tool-started') latest.set(event.tool, event.callId); },
  };
  await mkdir(spec.sessionDirectory);
  const session = agent.startSession(spec);
  sessions.push(session);
  const outcome = await bounded(session);
  await equipped.settle?.();
  const starts = events.filter(event => event.type === 'tool-started').map(event => ({ tool: event.tool, input: event.input,
    action: event.action, callId: event.callId }));
  const finishes = events.filter(event => event.type === 'tool-finished').map(event => ({ tool: event.tool,
    callId: event.callId, reachedTool: event.reachedTool, isError: event.isError }));
  const readResults = events.flatMap(event => event.type === 'message' && event.role === 'tool-result' && event.tool === 'read'
    ? [{ isError: event.isError, containsSeed: event.blocks.some(block => block.type === 'text' && block.text.includes('seed alpha')) }]
    : []);
  const guards = observations.observations.filter(event => event.type === 'guard').map(event => event.data);
  const shell = equipment.shellLog();
  const pwd = shell[0] === undefined ? null : (await readFile(shell[0].outputFile, 'utf8')).trim();
  const paths = [join(cwd, own), join(project, 'subs/beta/src', cross), join(project, 'plans/probe/plan.md'),
    join(project, 'features/probe.feature'), join(project, 'ramify-agent.json'), join(scratch, 'outside.txt')];
  const actual = await Promise.all(paths.map(async path => ({ path: relative(scratch, path),
    text: await readFile(path, 'utf8').catch(() => null) })));
  return { kind, requestedStart: 'fresh', actualStart: session.start, outcome, cwd, spec: {
    role: spec.role, workingDirectory: spec.scope.workingDirectory, builtinTools: spec.builtinTools,
    tools: spec.tools.map(tool => tool.name), sessionMode: spec.session.mode, context: spec.context,
    systemPromptHash: sha256(spec.systemPrompt), promptHash: sha256(spec.prompt),
  }, guardedScope: { revision: guarded.revision, roots: guarded.roots, files: guarded.files, denied: guarded.denied },
    starts, finishes, readResults, guards, shell, pwd, usage: usage(events), files: actual,
    checks: { pwdIsCwd: pwd === cwd, readStarted: starts.some(entry => entry.tool === 'read'),
      readFinished: finishes.some(entry => entry.tool === 'read' && !entry.isError),
      readContainedSeed: readResults.some(result => !result.isError && result.containsSeed),
      ownWritten: actual[0]?.text === `own ${kind}\n`,
      crossWritten: actual[1]?.text === `cross ${kind}\n`,
      crossAbsent: actual[1]?.text === null,
      ownAllowed: guards.some(entry => entry.requested === own && entry.verdict === 'allowed'),
      crossAllowed: guards.some(entry => entry.requested === `../../beta/src/${cross}` && entry.verdict === 'allowed'),
      crossRefused: guards.some(entry => entry.requested === `../../beta/src/${cross}` && entry.verdict === 'blocked-scope'),
      planRefused: guards.some(entry => entry.requested === '../../../plans/probe/plan.md' && entry.verdict === 'blocked-scope'),
      featureRefused: guards.some(entry => entry.requested === '../../../features/probe.feature' && entry.verdict === 'blocked-scope'),
      configRefused: guards.some(entry => entry.requested === '../../../ramify-agent.json' && entry.verdict === 'blocked-scope'),
      principleRefused: guards.some(entry => entry.requested === '../../../docs/engineering.principles.md' && entry.verdict === 'blocked-scope'),
      outsideRefused: guards.some(entry => entry.requested === '../../../../outside.txt' && entry.verdict === 'blocked-scope') },
    ramifyBoundary: { kind: 'probe-unavailable', calls: ramify.calls } };
}

async function main(): Promise<number> {
  const model = option('--model') ?? 'openai-codex/gpt-6-sol';
  const start = await implementation();
  const readiness = await piReadiness({ model });
  const output = option('--output');
  const report = async (value: unknown) => {
    const json = `${JSON.stringify(value, null, 2)}\n`;
    if (output === undefined) process.stdout.write(json);
    else { await mkdir(dirname(output), { recursive: true }); await writeFile(output, json); process.stdout.write(`${output}\n`); }
  };
  if (!readiness.ready) { await report({ probe: 'plan13-module-local', ran: false, model, gap: readiness.reason, implementation: start }); return 2; }
  const scratch = await mkdtemp(join(tmpdir(), 'ramify-plan13-module-local-'));
  const sessions: AgentSession[] = [];
  try {
    const project = join(scratch, 'project');
    await Promise.all(['subs/alpha/src', 'subs/beta/src', 'plans/probe', 'features', 'docs'].map(path => mkdir(join(project, path), { recursive: true })));
    const originals = new Map([
      ['module.ramify', 'ramify 1\nroot module app\n'], ['subs/alpha/module.ramify', 'ramify 1\nmodule alpha\n'], ['subs/beta/module.ramify', 'ramify 1\nmodule beta\n'],
      ['tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['**/*.ts'] })],
      ['subs/alpha/src/seed.txt', 'seed alpha\n'], ['subs/beta/src/seed.txt', 'seed beta\n'],
      ['plans/probe/plan.md', 'captured plan\n'], ['features/probe.feature', 'Feature: protected\n'],
      ['ramify-agent.json', '{}\n'], ['docs/engineering.principles.md', 'captured principle\n'],
    ]);
    await Promise.all([...originals].map(([path, text]) => writeFile(join(project, path), text)));
    const agent = createPiAgent({ model });
    const ordinary = await oneSession(agent, scratch, project, 'ordinary', sessions);
    const repair = await oneSession(agent, scratch, project, 'repair', sessions);
    const protectedStable = (await Promise.all([...originals].map(async ([path, text]) =>
      ({ path, unchanged: await readFile(join(project, path), 'utf8') === text }))));
    const end = await implementation();
    const sourceStable = start.files.every((entry, index) => end.files[index]?.sha256 === entry.sha256);
    const actualModels = [...new Set([...ordinary.usage, ...repair.usage].map(entry => entry.model))];
    const checks = { ordinary: ordinary.checks, repair: repair.checks, protectedStable,
      sourceStable, actualModels, expectedModelObserved: actualModels.includes(readiness.model) };
    await report({ probe: 'plan13-module-local', ran: true, requestedModel: model, readinessModel: readiness.model,
      ordinary, repair, checks, implementation: { start, end },
      witnessBoundary: 'real pi AgentPort and engineerEquipment with one real shell process; fake unavailable Ramify hook; no full RunService, gate or project audit' });
    return sourceStable && checks.expectedModelObserved && ordinary.outcome.kind === 'submitted' && repair.outcome.kind === 'submitted'
      && ordinary.checks.pwdIsCwd && repair.checks.pwdIsCwd && ordinary.checks.crossRefused && ordinary.checks.crossAbsent
      && repair.checks.crossAllowed && repair.checks.crossWritten
      && [ordinary, repair].every(entry => entry.checks.readStarted && entry.checks.readFinished && entry.checks.readContainedSeed
        && entry.checks.ownAllowed && entry.checks.ownWritten && entry.checks.planRefused && entry.checks.featureRefused
        && entry.checks.configRefused && entry.checks.principleRefused && entry.checks.outsideRefused)
      && protectedStable.every(entry => entry.unchanged) ? 0 : 2;
  } finally {
    await Promise.allSettled(sessions.map(session => session.stop()));
    await rm(scratch, { recursive: true, force: true });
  }
}

process.exitCode = await main();
