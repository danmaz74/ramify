/*
 * Manual, paid real-agent witness for Plan 13 context selection. Never run by
 * Vitest. Run only after the context-selection implementation is committed:
 *
 *   npx tsx subs/harness/src/probes/plan13-context.probe.ts [--model openai-codex/gpt-6-sol] [--output /tmp/context-witness.json]
 *
 * One disposable captured plan/catalog/principle, an oriented parent, a
 * selector fork, a keyed package append, and a parent continuation. The
 * report records actual modes, usage and evidence; it does not print a full
 * transcript or turn a degraded fresh start into a successful fork witness.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { AgentEvent, AgentSession, ContextPolicy, SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { createPiAgent, piReadiness } from '../../subs/agent/subs/pi/src/pi-agent.js';
import { catalogSchema, documentManifestSchema, type PassageReference } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { contextSelectorMessage, workOrientationMessage } from '../context-selection/prompts.js';
import {
  contextSelectorJsonSchema, contextSelectorToolName, orientationPacket, prepareContextSelection,
  workOrientationJsonSchema, workOrientationSubmissionSchema, workOrientationToolName,
  type PreparedSelection,
} from '../context-selection/submissions.js';
import { validateContextSelection } from '../context-selection/selection.js';

const exec = promisify(execFile);
const boundMs = 180_000;
const context: ContextPolicy = { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 };
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (text: string) => Buffer.byteLength(text, 'utf8');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd: root, env: {
    ...process.env, GIT_AUTHOR_NAME: 'probe', GIT_AUTHOR_EMAIL: 'probe@example.com',
    GIT_COMMITTER_NAME: 'probe', GIT_COMMITTER_EMAIL: 'probe@example.com',
  } });
  return stdout.trim();
}

function passage(document: string, source: string, quote: string): PassageReference {
  const all = Buffer.from(source, 'utf8');
  const selected = Buffer.from(quote, 'utf8');
  const start = all.indexOf(selected);
  if (start < 0) throw new Error(`The ${document} passage is absent from captured bytes`);
  return { document, sha256: sha256(all), start, end: start + selected.length, quote };
}

function usage(events: readonly AgentEvent[]) {
  return events.flatMap(event => event.type === 'message' && event.role === 'assistant'
    ? [{ model: event.detail.model, tokens: event.usage }]
    : []);
}

async function bounded(session: AgentSession): Promise<{ readonly kind: string; readonly elapsedMs: number }> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const result = await Promise.race([
    session.outcome.then(outcome => outcome.kind),
    new Promise<'timed-out'>(resolve => { timer = setTimeout(() => resolve('timed-out'), boundMs); }),
  ]);
  clearTimeout(timer);
  if (result === 'timed-out') await session.stop();
  return { kind: result, elapsedMs: Date.now() - started };
}

async function sourceHashes() {
  const here = dirname(fileURLToPath(import.meta.url));
  const implementationRoot = resolve(here, '../../../..');
  const files = [
    join(here, 'plan13-context.probe.ts'),
    join(here, '..', 'context-selection', 'submissions.ts'),
    join(here, '..', 'context-selection', 'selection.ts'),
    join(here, '..', 'context-selection', 'prompts.ts'),
    join(implementationRoot, 'subs', 'harness', 'subs', 'agent', 'subs', 'pi', 'src', 'pi-agent.ts'),
    join(implementationRoot, 'package.json'),
  ];
  return Promise.all(files.map(async path => ({ file: relative(implementationRoot, path), sha256: sha256(await readFile(path)) })));
}

async function implementationRevision() {
  const implementationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const [head, status] = await Promise.all([
    git(implementationRoot, 'rev-parse', 'HEAD'),
    git(implementationRoot, 'status', '--porcelain'),
  ]);
  return { head, dirty: status !== '', files: await sourceHashes() };
}

async function report(value: unknown): Promise<void> {
  const output = option('--output');
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (output === undefined) process.stdout.write(json);
  else {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, json);
    process.stdout.write(`${output}\n`);
  }
}

async function main(): Promise<number> {
  const requestedModel = option('--model') ?? 'openai-codex/gpt-6-sol';
  const implementationStart = await implementationRevision();
  const implementationWitness = async () => {
    const end = await implementationRevision();
    return {
      start: implementationStart,
      end,
      sourceStable: implementationStart.files.every((entry, index) =>
        end.files[index]?.file === entry.file && end.files[index]?.sha256 === entry.sha256),
    };
  };
  const readiness = await piReadiness({ model: requestedModel });
  if (!readiness.ready) {
    await report({ probe: 'plan13-context', ran: false, requestedModel, gap: readiness.reason,
      implementation: await implementationWitness() });
    return 2;
  }
  const scratch = await mkdtemp(join(tmpdir(), 'ramify-plan13-context-probe-'));
  const sessions: AgentSession[] = [];
  try {
    const project = join(scratch, 'project');
    const runDirectory = join(scratch, 'captured-run');
    const planText = '# Probe plan\n\nNFR: Keep audit lookup below 100 ms at p95.\nAdvice: Prefer a local cache.\n';
    const principleText = '# Engineering principle\n\nPrefer source-derived evidence to claims.\n';
    const nfrQuote = 'Keep audit lookup below 100 ms at p95.';
    const adviceQuote = 'Prefer a local cache.';
    const principleQuote = 'Prefer source-derived evidence to claims.';
    await mkdir(join(project, 'plans', 'probe'), { recursive: true });
    await mkdir(join(project, 'docs'), { recursive: true });
    await mkdir(join(runDirectory, 'input', 'documents'), { recursive: true });
    await writeFile(join(project, 'plans', 'probe', 'plan.md'), planText);
    await writeFile(join(project, 'docs', 'engineering.principles.md'), principleText);
    await git(project, 'init', '-q', '-b', 'main');
    await git(project, 'add', '--all');
    await git(project, 'commit', '-q', '-m', 'probe source');
    const sourceCommit = await git(project, 'rev-parse', 'HEAD');
    await writeFile(join(runDirectory, 'input', 'plan.md'), planText);
    await writeFile(join(runDirectory, 'input', 'documents', 'doc-002.bin'), principleText);
    const manifest = documentManifestSchema.parse({
      schema: 'ramify-agent.document-manifest/1', root: 'doc-001', missing: [],
      principlesScan: { status: 'complete', unreadable: [] },
      documents: [
        { id: 'doc-001', path: 'plans/probe/plan.md', kind: 'plan', sha256: sha256(planText), bytes: bytesOf(planText),
          storedAt: 'input/plan.md', revision: { commit: sourceCommit, dirty: false } },
        { id: 'doc-002', path: 'docs/engineering.principles.md', kind: 'principle', sha256: sha256(principleText), bytes: bytesOf(principleText),
          storedAt: 'input/documents/doc-002.bin', revision: { commit: sourceCommit, dirty: false } },
      ],
    });
    const manifestText = `${JSON.stringify(manifest)}\n`;
    await writeFile(join(runDirectory, 'input', 'documents.json'), manifestText);
    const catalog = catalogSchema.parse({
      schema: 'ramify-agent.nonfunctional-catalog/1', manifestHash: sha256(manifestText),
      items: [
        { id: 'nfr-001', classification: 'non-functional-requirement', passage: passage('doc-001', planText, nfrQuote),
          conditions: [{ source: 'stated', text: 'At p95' }], uncertainty: '' },
        { id: 'adv-001', classification: 'advice', passage: passage('doc-001', planText, adviceQuote),
          conditions: [], uncertainty: '' },
      ],
    });
    const capturedBytes = new Map([['doc-001', Buffer.from(planText, 'utf8')], ['doc-002', Buffer.from(principleText, 'utf8')]]);

    const agent = createPiAgent({ model: requestedModel });
    const parentEvents: AgentEvent[] = [];
    const briefing = [
      'Work item wi-001: implement audit lookup behavior in module app/api.',
      `Exact candidate source revision: ${sourceCommit}.`,
      'Orient before any assignment. The plan and principle passages will be selected separately.',
    ].join('\n');
    let orientation: ReturnType<typeof workOrientationSubmissionSchema.parse> | null = null;
    const parentPrompt = workOrientationMessage(briefing);
    const parentSpec: SessionSpec = {
      role: 'local-architect', scope: { workingDirectory: project },
      systemPrompt: 'Orient to the work item. Submit only an orientation through the supplied tool.',
      prompt: parentPrompt, session: { mode: 'fresh' }, context,
      builtinTools: [], tools: [],
      submission: { name: workOrientationToolName, description: 'Submit the orientation.', inputSchema: workOrientationJsonSchema,
        accept: async input => {
          const parsed = workOrientationSubmissionSchema.safeParse(input);
          if (!parsed.success) return { accepted: false, errors: parsed.error.issues.map(issue => issue.message) };
          orientation = parsed.data;
          return { accepted: true };
        } },
      sessionDirectory: join(scratch, 'parent-session'), onEvent: event => parentEvents.push(event),
    };
    await mkdir(parentSpec.sessionDirectory);
    const parent = agent.startSession(parentSpec);
    sessions.push(parent);
    const parentResult = await bounded(parent);
    if (parentResult.kind !== 'submitted' || orientation === null) {
      await report({ probe: 'plan13-context', ran: true, requestedModel, readinessModel: readiness.model,
        gap: 'Parent orientation did not submit', parent: { start: parent.start, ...parentResult, usage: usage(parentEvents) },
        implementation: await implementationWitness() });
      return 2;
    }
    const parentPoint = parent.ref;
    const packet = orientationPacket({ workItem: 'wi-001', briefing, submission: orientation });
    const selectorEvents: AgentEvent[] = [];
    const selectorPrompt = contextSelectorMessage(packet.text, catalog, manifest, runDirectory)
      + '\n\nFor this bounded probe, examine and select nfr-001, adv-001, and captured principle doc-002. Read the immutable principle file and quote its complete principle sentence with exact UTF-8 byte offsets. Submit all three exact passages.';
    let selected: PreparedSelection | null = null;
    let rejectedSubmissions = 0;
    const selectorDirectory = join(scratch, 'selector-workspace');
    const selectorSessionDirectory = join(scratch, 'selector-session');
    await mkdir(selectorDirectory);
    await mkdir(selectorSessionDirectory);
    let selectorActualMode: 'fresh' | 'fork' | 'continue' = 'fresh';
    const selectorSpec: SessionSpec = {
      role: 'context-selector', scope: { workingDirectory: selectorDirectory },
      systemPrompt: 'Select exact captured evidence for the oriented work item. Read only. Preserve classifications and source wording.',
      prompt: selectorPrompt, session: { mode: 'fork', from: parentPoint }, context,
      builtinTools: ['read'], tools: [],
      submission: { name: contextSelectorToolName, description: 'Submit examined, selected and unavailable source items.', inputSchema: contextSelectorJsonSchema,
        accept: async input => {
          const prepared = prepareContextSelection(input, {
            workItem: 'wi-001', orientationInvocation: 'inv-0001', orientationPoint: parentPoint,
            selectorInvocation: 'inv-0002', degraded: selectorActualMode !== 'fork',
          }, catalog, manifest, capturedBytes);
          if (prepared.status === 'unavailable') {
            rejectedSubmissions += 1;
            return rejectedSubmissions >= 3
              ? { accepted: false, final: true, errors: [...prepared.errors] }
              : { accepted: false, errors: [...prepared.errors] };
          }
          selected = prepared;
          return { accepted: true };
        } },
      sessionDirectory: selectorSessionDirectory, onEvent: event => selectorEvents.push(event),
    };
    const selector = agent.startSession(selectorSpec);
    sessions.push(selector);
    selectorActualMode = selector.start.mode;
    const selectorResult = await bounded(selector);
    const selectedPackage = selected as PreparedSelection | null;
    if (selectorResult.kind !== 'submitted' || selectedPackage === null || selectedPackage.status !== 'available') {
      await report({ probe: 'plan13-context', ran: true, requestedModel, readinessModel: readiness.model,
        gap: 'Selector did not produce a validated package', sourceCommit,
        parent: { start: parent.start, ...parentResult, usage: usage(parentEvents) },
        selector: { requested: 'fork', actual: selector.start, ...selectorResult, usage: usage(selectorEvents), rejectedSubmissions },
        implementation: await implementationWitness() });
      return 2;
    }
    const packageCheck = validateContextSelection(selectedPackage.selection, catalog, manifest, capturedBytes);
    const selectedIds = new Set(selectedPackage.selection.selected.map(entry => entry.item));
    const selectedAll = ['nfr-001', 'adv-001', 'doc-002'].every(id => selectedIds.has(id));
    if (packageCheck.status !== 'available' || !selectedAll || !selectedPackage.package.complete) {
      await report({ probe: 'plan13-context', ran: true, requestedModel, readinessModel: readiness.model,
        gap: 'Package did not contain all exact required probe passages', selectedIds: [...selectedIds],
        validation: packageCheck.status, implementation: await implementationWitness() });
      return 2;
    }
    const appendKey = `probe:wi-001:${selectedPackage.package.hash}`;
    const firstAppend = await agent.appendContext(parentPoint, appendKey, selectedPackage.package.text);
    const repeatedAppend = await agent.appendContext(parentPoint, appendKey, selectedPackage.package.text);
    if (firstAppend.outcome === 'session-lost') {
      await report({ probe: 'plan13-context', ran: true, requestedModel, gap: 'Parent session was lost before package append',
        append: { first: firstAppend.outcome, repeated: repeatedAppend.outcome }, implementation: await implementationWitness() });
      return 2;
    }
    const continuationEvents: AgentEvent[] = [];
    let quoted: { quote: string; classification: string } | null = null;
    const continueSpec: SessionSpec = {
      ...parentSpec,
      prompt: 'From the context package just appended to this session, submit the exact captured source passage for nfr-001 and its accepted classification. Do not paraphrase.',
      session: { mode: 'continue', ref: firstAppend.ref },
      sessionDirectory: join(scratch, 'continued-parent'),
      submission: { name: 'submit_context_quote', description: 'Report the source passage observed in appended context.',
        inputSchema: { type: 'object', properties: { quote: { type: 'string' }, classification: { type: 'string' } },
          required: ['quote', 'classification'], additionalProperties: false },
        accept: async input => {
          if (typeof input !== 'object' || input === null || typeof (input as { quote?: unknown }).quote !== 'string'
            || typeof (input as { classification?: unknown }).classification !== 'string') {
            return { accepted: false, errors: ['quote and classification must be strings'] };
          }
          quoted = input as { quote: string; classification: string };
          return { accepted: true };
        } },
      onEvent: event => continuationEvents.push(event),
    };
    await mkdir(continueSpec.sessionDirectory);
    const continued = agent.startSession(continueSpec);
    sessions.push(continued);
    const continuedResult = await bounded(continued);
    const observedQuote = quoted as { quote: string; classification: string } | null;
    const quoteMatches = observedQuote?.quote === nfrQuote && observedQuote.classification === 'non-functional-requirement';
    const actualFork = selector.start.mode === 'fork';
    const degradedMatchesActual = selectedPackage.selection.degraded === !actualFork;
    const actualContinuation = continued.start.mode === 'continue';
    const appendIdempotent = firstAppend.outcome === 'appended' && repeatedAppend.outcome === 'already-present';
    const implementation = await implementationWitness();
    const reportBody = {
      probe: 'plan13-context', ran: true, requestedModel, readinessModel: readiness.model,
      actualModels: [...new Set([...usage(parentEvents), ...usage(selectorEvents), ...usage(continuationEvents)].map(entry => entry.model))],
      source: { commit: sourceCommit, manifestHash: catalog.manifestHash,
        documents: manifest.documents.map(document => ({ id: document.id, path: document.path, sha256: document.sha256, revision: document.revision })),
        passageHashes: { nfr: sha256(nfrQuote), advice: sha256(adviceQuote), principle: sha256(principleQuote) } },
      contextBytes: { briefing: bytesOf(briefing), parentPrompt: bytesOf(parentPrompt), orientationPacket: bytesOf(packet.text),
        selectorPrompt: bytesOf(selectorPrompt), package: bytesOf(selectedPackage.package.text), continuationPrompt: bytesOf(continueSpec.prompt) },
      parent: { requested: 'fresh', actual: parent.start, ...parentResult, usage: usage(parentEvents), orientationHash: packet.hash },
      selector: { requested: 'fork', actual: selector.start, ...selectorResult, usage: usage(selectorEvents), rejectedSubmissions,
        selectionHash: selectedPackage.selection.packageHash, selected: selectedPackage.selection.selected.map(entry => ({
          item: entry.item, document: entry.passage.document, start: entry.passage.start, end: entry.passage.end,
          sha256: entry.passage.sha256,
        })) },
      append: { key: appendKey, first: firstAppend.outcome, repeated: repeatedAppend.outcome },
      continuedParent: { requested: 'continue', actual: continued.start, ...continuedResult, usage: usage(continuationEvents),
        submitted: observedQuote, quoteMatches },
      checks: { actualFork, degradedMatchesActual, actualContinuation, selectedAll, packageValidated: packageCheck.status === 'available', appendIdempotent, quoteMatches },
      implementation,
      witnessBoundary: 'actual pi AgentPort sessions and context-selection helpers; not full RunService orchestration',
    };
    await report(reportBody);
    return implementation.sourceStable && actualFork && degradedMatchesActual && actualContinuation
      && appendIdempotent && quoteMatches && continuedResult.kind === 'submitted' ? 0 : 2;
  } finally {
    await Promise.allSettled(sessions.map(session => session.stop()));
    await rm(scratch, { recursive: true, force: true });
  }
}

process.exitCode = await main();
