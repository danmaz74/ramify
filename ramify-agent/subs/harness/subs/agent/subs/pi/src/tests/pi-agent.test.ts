import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { AgentEvent, SessionOutcome, SessionSpec, SubmissionVerdict, ToolDefinition } from '../../../../src/interfaces/port.js';
import { createPiAgentOn, permissiveSchema } from '../pi-agent.js';
import { call, calls, scriptedProvider, scriptedRuntime, text, type ReplyStep, type ScriptedProvider } from './helpers/scripted-provider.js';

// No test here may reach a network or the person's pi directory.
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
const hadPiDirectory = existsSync(join(homedir(), '.pi'));

const submissionSchema = {
  type: 'object',
  properties: { summary: { type: 'string' }, modules: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'modules'],
  additionalProperties: false,
};

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

interface Harness {
  readonly spec: SessionSpec;
  readonly events: AgentEvent[];
  readonly judged: unknown[];
  readonly scripted: ScriptedProvider;
  readonly workingDirectory: string;
  readonly sessionDirectory: string;
  readonly outcome: Promise<SessionOutcome>;
  stop(): Promise<void>;
}

async function run(steps: readonly ReplyStep[], options: {
  verdicts?: SubmissionVerdict[];
  tools?: ToolDefinition[];
  systemPrompt?: string;
  session?: SessionSpec['session'];
  context?: SessionSpec['context'];
} = {}): Promise<Harness> {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'ramify-agent-pi-cwd-'));
  cleanups.push(() => rm(workingDirectory, { recursive: true, force: true }));
  await writeFile(join(workingDirectory, 'module.ramify'), 'ramify 1\nmodule demo\n');
  await mkdir(join(workingDirectory, 'subs'));
  await writeFile(join(workingDirectory, 'subs', 'notes.md'), 'expose-sub appears here\n');
  const sessionDirectory = join(workingDirectory, 'session');
  await mkdir(sessionDirectory);

  const scripted = scriptedProvider(steps);
  const isolated = await scriptedRuntime(scripted);
  cleanups.push(isolated.remove);
  const agent = createPiAgentOn({ agentDirectory: isolated.agentDirectory, model: 'scripted/scripted-1', runtime: async () => isolated.runtime });

  const events: AgentEvent[] = [];
  const judged: unknown[] = [];
  const verdicts = [...(options.verdicts ?? [])];
  const spec: SessionSpec = {
    role: 'architect',
    scope: { workingDirectory },
    systemPrompt: options.systemPrompt ?? 'You are the architect. Exactly this prompt.',
    prompt: 'Map the plan.',
    session: options.session ?? { mode: 'fresh' },
    context: options.context ?? { compaction: 'allowed', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 },
    builtinTools: ['read', 'grep', 'ls'],
    tools: options.tools ?? [],
    submission: {
      name: 'submit_implementation_map',
      description: 'Submit the map.',
      inputSchema: submissionSchema,
      accept: async input => {
        judged.push(input);
        return verdicts.shift() ?? { accepted: true };
      },
    },
    sessionDirectory,
    onEvent: event => events.push(event),
  };
  const session = agent.startSession(spec);
  cleanups.push(async () => { await Promise.race([session.stop(), new Promise(resolve => setTimeout(resolve, 2000))]); });
  return { spec, events, judged, scripted, workingDirectory, sessionDirectory, outcome: session.outcome, stop: () => session.stop() };
}

const validMap = { summary: 'A change', modules: ['demo'] };

describe('the pi adapter', () => {
  test('sends exactly the spec\'s system prompt and only the spec\'s tools', async () => {
    const harness = await run([call('submit_implementation_map', validMap)], { systemPrompt: 'Line one.\nLine two, exact.' });
    await expect(harness.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });
    expect(harness.scripted.requests).toHaveLength(1);
    const [request] = harness.scripted.requests;
    expect(request!.systemPrompt).toBe('Line one.\nLine two, exact.');
    expect(request!.tools.map(tool => tool.name).sort()).toEqual(['grep', 'ls', 'read', 'submit_implementation_map']);
    const submission = request!.tools.find(tool => tool.name === 'submit_implementation_map')!;
    expect(submission.parameters).toEqual({ type: 'object', properties: { summary: {}, modules: {} } });
    expect(submission.description).toContain(JSON.stringify(submissionSchema));
  });

  test('translates tool calls by call ID and assistant messages with their usage', async () => {
    const echo: ToolDefinition = {
      name: 'echo', description: 'Echoes', inputSchema: { type: 'object', properties: { word: { type: 'string' } } },
      execute: async input => ({ text: `echo ${(input as { word: string }).word}` }),
    };
    const harness = await run([
      calls(
        { type: 'toolCall', name: 'read', arguments: { path: 'module.ramify' }, id: 'c-read' },
        { type: 'toolCall', name: 'grep', arguments: { pattern: 'expose-sub', path: 'subs' }, id: 'c-grep' },
      ),
      call('echo', { word: 'hello' }, 'c-echo'),
      text('I have what I need.', { input: 1200, output: 30 }),
    ], { tools: [echo] });
    const outcome = await harness.outcome;
    expect(outcome).toEqual({ kind: 'ended', message: 'I have what I need.' });

    const started = harness.events.filter(event => event.type === 'tool-started');
    expect(started).toEqual([
      { type: 'tool-started', callId: 'c-read', tool: 'read', input: { path: 'module.ramify' }, mutating: false },
      { type: 'tool-started', callId: 'c-grep', tool: 'grep', input: { pattern: 'expose-sub', path: 'subs' }, mutating: false },
      { type: 'tool-started', callId: 'c-echo', tool: 'echo', input: { word: 'hello' }, mutating: false },
    ]);
    const finished = harness.events.filter(event => event.type === 'tool-finished');
    expect(finished.map(event => [event.callId, event.isError]).sort()).toEqual([['c-echo', false], ['c-grep', false], ['c-read', false]]);
    const messages = harness.events.filter(event => event.type === 'message');
    expect(messages.map(event => event.text)).toEqual(['(calls read, grep)', '(calls echo)', 'I have what I need.']);
    expect(messages[2]!.usage).toEqual({ input: 1200, output: 30, cacheRead: 0, cacheWrite: 0, total: 1230 });

    // The built-in read ran for real on the working directory, and the echo tool's result reached the model.
    const toolResults = harness.scripted.requests[2]!.messages.filter(message => message.role === 'toolResult');
    expect(JSON.stringify(toolResults)).toContain('echo hello');
    expect(JSON.stringify(harness.scripted.requests[1]!.messages)).toContain('module demo');
  });

  test('returns a rejection to the same session, which corrects its submission', async () => {
    const invalid = { summary: 3, extra: true };
    const harness = await run([
      call('submit_implementation_map', invalid, 'c-1'),
      call('submit_implementation_map', validMap, 'c-2'),
    ], { verdicts: [{ accepted: false, errors: ['summary: expected a string', 'extra: not allowed'] }, { accepted: true }] });
    await expect(harness.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });
    // The schema-invalid call reached the harness: pi validated nothing the harness would count.
    expect(harness.judged).toEqual([invalid, validMap]);
    const result = harness.scripted.requests[1]!.messages.find(message => message.role === 'toolResult') as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('summary: expected a string');
    expect(harness.events).toContainEqual(expect.objectContaining({ type: 'tool-finished', callId: 'c-1', isError: true }));
    expect(harness.scripted.requests).toHaveLength(2);
  });

  test('unwraps an array field pi delivered as a JSON-encoded string', async () => {
    const stringified = { summary: 'A change', modules: '["demo"]' };
    const harness = await run([call('submit_implementation_map', stringified)]);
    await expect(harness.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });
    // The harness judged the parsed array, not the string pi delivered.
    expect(harness.judged).toEqual([validMap]);
  });

  test('leaves a field that is not valid JSON, or parses to the wrong shape, as pi delivered it', async () => {
    const notJson = { summary: 'A change', modules: 'not json' };
    const wrongShape = { summary: 'A change', modules: '{"not":"an array"}' };
    const harness = await run([
      call('submit_implementation_map', notJson, 'c-1'),
      call('submit_implementation_map', wrongShape, 'c-2'),
      call('submit_implementation_map', validMap, 'c-3'),
    ], { verdicts: [{ accepted: false, errors: ['modules: expected an array'] }, { accepted: false, errors: ['modules: expected an array'] }, { accepted: true }] });
    await expect(harness.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });
    expect(harness.judged).toEqual([notJson, wrongShape, validMap]);
  });

  test('ends the session on a final rejection without asking the model again', async () => {
    const harness = await run([
      call('submit_implementation_map', { summary: 'x' }, 'c-1'),
      text('must never be requested'),
    ], { verdicts: [{ accepted: false, final: true, errors: ['modules: required', 'No further submissions are accepted'] }] });
    await expect(harness.outcome).resolves.toEqual({ kind: 'ended', message: 'modules: required\nNo further submissions are accepted' });
    expect(harness.scripted.requests).toHaveLength(1);
    expect(harness.scripted.pending()).toBe(1);
    expect(harness.events).toContainEqual(expect.objectContaining({ type: 'tool-finished', callId: 'c-1', isError: true }));
  });

  test('stops a loop that continues after an accepted submission', async () => {
    const harness = await run([
      calls(
        { type: 'toolCall', name: 'submit_implementation_map', arguments: validMap, id: 'c-1' },
        { type: 'toolCall', name: 'ls', arguments: { path: '.' }, id: 'c-2' },
      ),
      { kind: 'hold' },
    ]);
    await expect(harness.outcome).resolves.toEqual({ kind: 'submitted', input: validMap });
  });

  test('reports a harness tool error to the model as an error result', async () => {
    const failing: ToolDefinition = {
      name: 'materialize_api_view', description: 'Materializes', inputSchema: { type: 'object', properties: { module: { type: 'string' } } },
      execute: async () => ({ text: 'Unknown module "nope"', isError: true }),
    };
    const harness = await run([call('materialize_api_view', { module: 'nope' }, 'c-1'), call('submit_implementation_map', validMap)], { tools: [failing] });
    await expect(harness.outcome).resolves.toMatchObject({ kind: 'submitted' });
    expect(harness.events).toContainEqual({ type: 'tool-finished', callId: 'c-1', tool: 'materialize_api_view', isError: true, errorText: 'Unknown module "nope"', reachedTool: true });
  });

  test('a provider error fails the session once pi\'s retries are spent', async () => {
    const overloaded = { kind: 'error', message: 'overloaded' } as const;
    const harness = await run([overloaded, overloaded, overloaded]);
    const outcome = await harness.outcome;
    expect(outcome.kind).toBe('failed');
    expect(outcome.kind === 'failed' && outcome.error).toContain('overloaded');
    expect(harness.scripted.requests).toHaveLength(3);
  }, 20_000);

  test('stop ends a session whose model is still replying, and nothing is reported afterwards', async () => {
    const harness = await run([call('ls', { path: '.' }, 'c-1'), { kind: 'hold' }]);
    await until(() => harness.scripted.requests.length === 2);
    const before = harness.events.length;
    const started = Date.now();
    await harness.stop();
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(harness.outcome).resolves.toEqual({ kind: 'stopped' });
    expect(harness.events.length).toBe(before);
  });

  test('stop waits for a tool that ignores its signal, and the model is not asked again', async () => {
    const stubborn: ToolDefinition = {
      name: 'slow', description: 'Ignores abort', inputSchema: { type: 'object' },
      execute: () => new Promise(resolve => setTimeout(() => resolve({ text: 'done' }), 400)),
    };
    const harness = await run([call('slow', {}, 'c-1'), text('must never be requested')], { tools: [stubborn] });
    await until(() => harness.events.some(event => event.type === 'tool-started'));
    const started = Date.now();
    await harness.stop();
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    await expect(harness.outcome).resolves.toEqual({ kind: 'stopped' });
    expect(harness.scripted.requests).toHaveLength(1);
  });

  test('writes pi\'s session record into the session directory', async () => {
    const harness = await run([text('hello', { input: 10, output: 2 }), call('submit_implementation_map', validMap)]);
    await harness.outcome;
    const files = readdirSync(harness.sessionDirectory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.jsonl$/);
    const entries = readFileSync(join(harness.sessionDirectory, files[0]!), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { type: string });
    expect(entries[0]).toMatchObject({ type: 'session', cwd: harness.workingDirectory });
    expect(entries.some(entry => entry.type === 'message')).toBe(true);
  });

  test('fails a session when pi has no model with credentials', async () => {
    const scripted = scriptedProvider([]);
    const isolated = await scriptedRuntime(scripted);
    cleanups.push(isolated.remove);
    isolated.runtime.unregisterProvider('scripted');
    const agent = createPiAgentOn({ agentDirectory: isolated.agentDirectory, runtime: async () => isolated.runtime });
    const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-pi-cwd-'));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const session = agent.startSession({
      role: 'architect', scope: { workingDirectory: directory }, systemPrompt: 's', prompt: 'p',
      session: { mode: 'fresh' },
      context: { compaction: 'allowed', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 },
      builtinTools: [], tools: [],
      submission: { name: 'submit', description: 'd', inputSchema: { type: 'object' }, accept: async () => ({ accepted: true }) },
      sessionDirectory: directory, onEvent: () => undefined,
    });
    const outcome = await session.outcome;
    expect(outcome).toMatchObject({ kind: 'failed' });
    expect(outcome.kind === 'failed' && outcome.error).toMatch(/log in/i);
  });

  test('the permissive schema keeps only the top-level field names', () => {
    expect(permissiveSchema(submissionSchema)).toEqual({ type: 'object', properties: { summary: {}, modules: {} } });
    expect(permissiveSchema({ type: 'object' })).toEqual({ type: 'object', properties: {} });
  });

  test('leaves the person\'s pi directory alone', () => {
    expect(existsSync(join(homedir(), '.pi'))).toBe(hadPiDirectory);
  });
});

async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for a condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
