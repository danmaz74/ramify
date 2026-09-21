/*
 * The quick pi test: ONE real engineer session, started directly with a
 * hand-written assignment on an already prepared project copy. No run, no
 * architects, no gate, no commit: only what an engineer session is given, so
 * that how a real model reacts to one harness text, tool or refusal can be
 * seen in about a minute. It calls a model and costs tokens; it is a
 * development tool and never a test.
 *
 *   npm run quick-pi -- --project <prepared copy> --assignment <file.json> [--model <provider/model[:level]>] [--out <dir>]
 *
 * The assignment file:
 *   { "module": "app/reviews", "moduleDir": "subs/reviews",
 *     "goal": "...", "approach": "...", "completionEvidence": "...",
 *     "roots": ["subs/reviews"], "files": [] }
 *
 * The session gets the engineer's real system prompt and iteration message,
 * the real write guard, the real Ramify hook check after every mutation and
 * the real submission validation, including the refusal of a completion while
 * a violation stands. `run_scope_tests` is a plain `vitest run` of the module.
 * Every tool call, every appended text and every submission answer is
 * printed, and the pi transcript is kept under `--out`.
 *
 * Exit status: 0 when the session submitted, 1 when it ended any other way, 2
 * when it could not start.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';
import type { AgentEvent, ToolDefinition } from '../../subs/agent/src/interfaces/port.js';
import { privateRamify } from '../../subs/evidence/src/ramify-cli.js';
import { blockExplanation, decideWrite, type GuardedScope } from '../guard/write-guard.js';
import { FindingsSeen, runHookCheck } from '../hooks/post-write.js';
import { loadPromptPackages, renderEngineerPrompt } from '../prompts/packages.js';
import { defaultContextPolicies } from '../run/policy.js';
import { rejectionAnswer } from '../run/submissions.js';
import { createShellTool, shellInputSchema, shellToolName } from '../tools/shell.js';
import {
  engineerJsonSchema, engineerToolName, iterationMessage, scopeTestsToolName, validateEngineer, type IterationApiViews,
} from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';

const run = promisify(execFile);

interface QuickAssignment {
  readonly module: string;
  readonly moduleDir: string;
  readonly goal: string;
  readonly approach: string;
  readonly completionEvidence: string;
  readonly roots: readonly string[];
  readonly files?: readonly string[];
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const clip = (text: string, limit = 1500) => (text.length <= limit ? text : `${text.slice(0, limit)}… [${text.length - limit} more characters]`);

async function main(): Promise<number> {
  const projectOption = option('--project');
  const assignmentOption = option('--assignment');
  if (projectOption === undefined || assignmentOption === undefined) {
    console.error('Usage: npm run quick-pi -- --project <prepared copy> --assignment <file.json> [--model <provider/model[:level]>] [--out <dir>]');
    return 2;
  }
  const projectRoot = await realpath(resolve(projectOption));
  const quick = JSON.parse(await readFile(resolve(assignmentOption), 'utf8')) as QuickAssignment;
  const model = option('--model');
  const out = resolve(option('--out') ?? await mkdtemp(join(tmpdir(), 'ramify-agent-quick-pi-')));
  await mkdir(join(out, 'session'), { recursive: true });

  const readiness = await piReadiness({ model });
  if (!readiness.ready) {
    console.error(`pi cannot run: ${readiness.reason}`);
    return 2;
  }
  console.log(`Project: ${projectRoot}\nModel: ${readiness.model}\nRecords: ${out}\n`);

  const guarded: GuardedScope = {
    revision: 1,
    roots: quick.roots.map(root => join(projectRoot, root)),
    files: (quick.files ?? []).map(file => join(projectRoot, file)),
  };
  const assignment = {
    id: 'quick.i01',
    goal: quick.goal,
    approach: quick.approach,
    completionEvidence: quick.completionEvidence,
    scope: { base: { module: quick.module, includedChildren: [] }, bootstrap: [], resolved: { roots: guarded.roots, files: guarded.files } },
    gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: [quick.module], subtrees: [], extraSuites: [] } },
    externalCapabilities: [],
  } as unknown as IterationAssignment;

  const { ramify, dispose } = await privateRamify();
  try {
    const materialized = await ramify.materialize(projectRoot, quick.moduleDir);
    const views: IterationApiViews = {
      module: quick.module,
      views: (['src', 'src/tests'] as const)
        .filter(area => existsSync(join(projectRoot, quick.moduleDir, area, '.ramify', '_meta.json')))
        .map(area => ({ area: area === 'src' ? 'ordinary' : 'testing', path: `${quick.moduleDir}/${area}/.ramify`, coverage: null })),
      unavailable: materialized.ok ? null : `the API view could not be materialized: ${materialized.message}`,
    };

    const { packages } = await loadPromptPackages();
    const systemPrompt = renderEngineerPrompt(packages.get('engineer')!, projectRoot);
    const { stdout: head } = await run('git', ['rev-parse', 'HEAD'], { cwd: projectRoot });
    const prompt = iterationMessage({ assignment, projectRoot, base: head.trim(), views: [views] });
    console.log(`──── iteration message ────\n${prompt}\n───────────────────────────\n`);

    const seen = new FindingsSeen();
    const mutated = new Map<string, string[]>();
    let hookChecks = 0;
    let rejected = 0;

    const shell = createShellTool({
      workingDirectory: projectRoot,
      judge: async input => {
        const parsed = shellInputSchema.safeParse(input);
        return parsed.success ? { ok: true } : { ok: false, text: parsed.error.message };
      },
      outputFile: call => join(out, `shell-${call}.log`),
      starting: async () => undefined,
      ended: async () => undefined,
    });
    const scopeTests: ToolDefinition = {
      name: scopeTestsToolName,
      description: 'Runs the tests this iteration is judged on. It takes no arguments.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async (_input, signal) => {
        const result = await run('npx', ['vitest', 'run', quick.moduleDir], { cwd: projectRoot, signal, maxBuffer: 16 * 1024 * 1024 })
          .then(done => ({ text: `${done.stdout}\n${done.stderr}`, failed: false }), (error: { stdout?: string; stderr?: string; message: string }) => ({ text: `${error.stdout ?? ''}\n${error.stderr ?? error.message}`, failed: true }));
        return { text: result.text.slice(-6000), isError: result.failed };
      },
    };

    const session = createPiAgent({ model }).startSession({
      role: 'engineer',
      scope: { workingDirectory: projectRoot },
      systemPrompt,
      prompt,
      session: { mode: 'fresh' },
      context: defaultContextPolicies.engineer,
      builtinTools: ['read', 'grep', 'ls', 'edit', 'write'],
      tools: [shell.definition, scopeTests],
      sessionDirectory: join(out, 'session'),
      submission: {
        name: engineerToolName,
        description: 'End your turn with the result of this iteration. The harness validates it; an invalid submission is returned with every error and its path, and a valid one ends this invocation.',
        inputSchema: engineerJsonSchema,
        accept: async input => {
          console.log(`\n◆ SUBMISSION\n${JSON.stringify(input, null, 2)}`);
          const verdict = validateEngineer(input, { kind: 'ordinary', openFindings: seen.open() });
          if (verdict.ok) {
            console.log('◆ accepted');
            return { accepted: true };
          }
          rejected += 1;
          const remaining = Math.max(0, 3 - rejected);
          const answer = rejectionAnswer(verdict.errors, remaining);
          console.log(`◆ REJECTED; the model is answered:\n${answer}`);
          return remaining > 0 ? { accepted: false, errors: [answer] } : { accepted: false, final: true, errors: [answer] };
        },
      },
      guard: async call => {
        if (call.tool === shellToolName) return { allow: true };
        const decision = await decideWrite(guarded, projectRoot, call.input);
        if (decision.verdict === 'allowed' && decision.resolved !== null) {
          mutated.set(call.callId, [relative(projectRoot, decision.resolved)]);
          return { allow: true };
        }
        const text = blockExplanation(decision, guarded);
        console.log(`◆ WRITE REFUSED; the model is told:\n${text}`);
        return { allow: false, text };
      },
      afterMutation: async call => {
        const paths = call.tool === shellToolName ? null : mutated.get(call.callId) ?? null;
        const hook = await runHookCheck({
          ramify, projectRoot, paths, hookTimeoutMs: 30_000, seen, ran: hookChecks,
          logFile: check => join(out, `hook-${check}.log`),
        });
        hookChecks += hook.checks.length;
        if (hook.text !== null && hook.text !== '') console.log(`◆ HOOK TEXT appended to ${call.tool}:\n${hook.text}`);
        return hook.text === null || hook.text === '' ? null : { text: hook.text };
      },
      onEvent: (event: AgentEvent) => {
        if (event.type === 'tool-started') console.log(`→ ${event.tool} ${clip(JSON.stringify(event.input), 400)}`);
        else if (event.type === 'tool-finished' && event.isError) console.log(`✗ ${event.tool}: ${clip(event.errorText ?? '', 600)}`);
        else if (event.type === 'message' && event.text.trim() !== '') console.log(`… ${clip(event.text, 800)}`);
      },
    });

    const started = Date.now();
    const outcome = await session.outcome;
    await shell.settle();
    console.log(`\nOutcome: ${outcome.kind}${outcome.kind === 'failed' ? ` (${outcome.error})` : ''} after ${Math.round((Date.now() - started) / 1000)}s.`);
    console.log(`Violations still standing: ${seen.open().length}. Rejected submissions: ${rejected}.`);
    const { stdout: status } = await run('git', ['status', '--short'], { cwd: projectRoot });
    console.log(`Working tree:\n${status || '(clean)'}\nTranscript: ${join(out, 'session')}`);
    return outcome.kind === 'submitted' ? 0 : 1;
  } finally {
    await dispose();
  }
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(error);
  process.exitCode = 2;
});
