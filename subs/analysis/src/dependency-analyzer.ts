import { isAbsolute, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseDescription } from '../subs/descriptions/src/parse.js';
import { deriveSourceAreas } from '../subs/model/src/index.js';
import type { SourceArea } from '../subs/model/src/interfaces/model.js';
import { readProject } from '../subs/project/src/read-project.js';
import type { CapturedInput, ProjectInputView, ProjectInventory } from '../subs/project/src/interfaces/project.js';
import { createSourceAnalysis } from '../subs/typescript/src/source-analysis.js';
import type { SourceAnalysis } from '../subs/typescript/src/interfaces/source.js';
import type { AnalysisReport, RunControl } from './interfaces/analysis.js';
import type { DependencyAnalyzerInput, DependencyAnalyzerOutcome } from './interfaces/dependency-analyzer.js';
import type { TestReferenceFacts } from './interfaces/dependency-diagram.js';
import { projectDependencyDiagram } from './dependency-diagram.js';
import { completeReport, sorted } from './modularity-context.js';
import { projectTestReferences } from './test-references.js';

/** Supplied behavior facts share the compiler helper's result bound. */
const maxFactBytes = 32 * 1024 * 1024 - 64 * 1024;

class InputsChanged extends Error {
  constructor(readonly paths: readonly string[]) { super(`Inputs changed: ${paths.join(', ')}`); }
}
class Unavailable extends Error {
  constructor(readonly reason: Extract<DependencyAnalyzerOutcome, { status: 'unavailable' }>['reason'], message: string) { super(message); }
}

const errorCode = (error: unknown): string => error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Captured inputs whose path, role, SHA-256 or bytes the report did not record. */
function differingInputs(captured: readonly CapturedInput[], recorded: readonly CapturedInput[]): string[] {
  const known = new Map<string, CapturedInput[]>();
  for (const input of recorded) known.set(input.path, [...known.get(input.path) ?? [], input]);
  return sorted(captured.filter(input => !known.get(input.path)?.some(item => item.role === input.role
    && item.sha256 === input.sha256 && item.bytes === input.bytes)).map(input => input.path));
}

/**
 * The inventory without the invocation's root selection. One context serves invocations from other
 * working directories that name or find the same root, and its published report can record another
 * invocation than the request the analyzer acquires with; neither field is a project input.
 */
function inputInventory(inventory: ProjectInventory): ProjectInventory {
  return { ...inventory, scope: { ...inventory.scope, selection: 'given', invokedFrom: '' } };
}

/** Owned files and module descriptions that differ between two inventories, and the root when their scopes differ. */
function inventoryPaths(current: ProjectInventory, recorded: ProjectInventory): string[] {
  const files = (inventory: ProjectInventory) => new Map(inventory.files.map(file => [file.path, JSON.stringify(file)]));
  const modules = (inventory: ProjectInventory) => new Map(inventory.modules.map(module => [module.description.status === 'valid'
    ? module.description.document.file : `${module.directory ? `${module.directory}/` : ''}module.ramify`, JSON.stringify(module)]));
  const paths: string[] = JSON.stringify(inputInventory(current).scope) === JSON.stringify(inputInventory(recorded).scope) ? [] : ['.'];
  for (const [left, right] of [[files(current), files(recorded)], [modules(current), modules(recorded)]]) {
    for (const path of new Set([...left!.keys(), ...right!.keys()])) if (left!.get(path) !== right!.get(path)) paths.push(path);
  }
  return sorted(paths);
}

function areasOf(report: AnalysisReport, inventory: ProjectInventory): readonly SourceArea[] | null {
  const areas: SourceArea[] = [];
  for (const module of inventory.modules) {
    const ordinary = module.areas.find(area => area.kind === 'ordinary');
    if (!ordinary) return null;
    const profiles = deriveSourceAreas(report.registry!, module.id, ordinary.root, module.headerTags);
    if (profiles.status !== 'valid') return null;
    areas.push(...profiles.value);
  }
  return areas;
}

/**
 * The dependency diagram of one completed report. Acquires the project again and
 * verifies it against the report, classifies the report's recorded accesses in a
 * compiler helper without the export catalog or import interpretation, verifies
 * every input that run read, and projects the diagram and, from the same facts,
 * the test references. Performs no description linking or evaluation and opens
 * no retained session. Only a ready outcome carries a diagram; its test
 * references are null when only they were refused.
 */
export async function analyzeDependencyDiagram(input: DependencyAnalyzerInput, control: RunControl = {}): Promise<DependencyAnalyzerOutcome> {
  const started = performance.now();
  const { report, limits } = input;
  if (control.signal?.aborted) return { status: 'cancelled' };
  if (![limits.maxResultBytes, limits.deadlineMs, ...Object.values(limits.source)].every(value => Number.isSafeInteger(value) && value > 0)) {
    return { status: 'unavailable', reason: 'resource-limit', message: 'Dependency analyzer limits must be positive safe integers' };
  }
  if (!completeReport(report) || !report.request?.limits?.acquisition) {
    return { status: 'unavailable', reason: 'invalid-report', message: 'The dependency analyzer requires a completed analysis report' };
  }
  const abort = new AbortController();
  const cancel = (): void => abort.abort();
  let timedOut = false;
  control.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort.abort(); }, limits.deadlineMs);
  const remaining = (maximum: number): number => Math.max(1, Math.ceil(Math.min(maximum, started + limits.deadlineMs - performance.now())));
  const check = (): void => {
    if (abort.signal.aborted) throw Object.assign(new Error('Dependency analysis was cancelled'), { code: 'cancelled' });
  };
  const root = report.snapshot.inventory.scope.root;
  const local = (path: string): string => {
    if (!isAbsolute(path)) return path;
    const within = relative(root, path);
    return within.startsWith('..') || isAbsolute(within) ? path : within || '.';
  };
  let view: ProjectInputView | undefined;
  let source: SourceAnalysis | undefined;
  let acquireMs = 0, classifyMs = 0;
  try {
    const acquisitionStart = performance.now();
    const acquisition = report.request.limits.acquisition;
    const acquired = await readProject({ request: input.project, parse: parseDescription, signal: abort.signal,
      limits: { ...acquisition, attempts: 1, deadlineMs: remaining(acquisition.deadlineMs) } });
    check();
    if (acquired.status === 'cancelled') throw Object.assign(new Error('Project acquisition was cancelled'), { code: 'cancelled' });
    if (acquired.status !== 'acquired') {
      // The report completed over valid inputs, so a project that no longer acquires changed,
      // unless acquisition met a work limit or read failure of its own.
      const changed = acquired.issues.filter(issue => issue.code !== 'resource-limit' && issue.code !== 'read-failure');
      if (!changed.length) throw new Unavailable(acquired.issues.some(issue => issue.code === 'resource-limit') ? 'resource-limit' : 'analysis-failed',
        `Project acquisition was ${acquired.status}: ${acquired.issues.map(issue => issue.message).join('; ')}`);
      throw new InputsChanged(sorted(changed.map(issue => local(issue.path))));
    }
    view = acquired.view;
    const areas = areasOf(report, view.inventory);
    if (!areas || JSON.stringify(inputInventory(view.inventory)) !== JSON.stringify(inputInventory(report.snapshot.inventory))
      || JSON.stringify(areas) !== JSON.stringify(report.snapshot.areas)) {
      const paths = sorted([...differingInputs(view.inputs, report.snapshot.inputs), ...inventoryPaths(view.inventory, report.snapshot.inventory)]);
      throw new InputsChanged(paths.length ? paths : ['.']);
    }
    acquireMs += performance.now() - acquisitionStart;

    const classifyStart = performance.now();
    source = await createSourceAnalysis({ view, inventory: view.inventory, areas,
      limits: { ...limits.source, deadlineMs: remaining(limits.source.deadlineMs) }, signal: abort.signal });
    check();
    const facts = await source.dependencyBehavior(abort.signal, { accesses: report.snapshot.accesses, limits: { maxFactBytes } });
    const behaviorRuns = source.behaviorRuns();
    await source.dispose(); source = undefined;
    classifyMs = performance.now() - classifyStart;
    check();
    if (facts.status !== 'completed') throw new Unavailable('analysis-failed', 'Dependency behavior classification failed');

    const sealStart = performance.now();
    const seal = await view.seal();
    check();
    if (seal.status === 'changed') throw new InputsChanged(sorted(seal.paths.map(local)));
    const differing = differingInputs(seal.inputs, report.snapshot.inputs);
    if (differing.length) throw new InputsChanged(differing);
    await view.dispose(); view = undefined;
    acquireMs += performance.now() - sealStart;

    const projectStart = performance.now();
    const capabilities = report.request.capabilities.includes('dependency-behavior') ? report.request.capabilities
      : [...report.request.capabilities, 'dependency-behavior' as const];
    const projection = { revision: report.inputId, limits: { maxResultBytes: limits.maxResultBytes },
      report: { ...report, request: { ...report.request, capabilities }, snapshot: { ...report.snapshot, dependencyBehavior: facts } } };
    let outcome: ReturnType<typeof projectDependencyDiagram>;
    try { outcome = projectDependencyDiagram(projection); }
    catch (error) { throw new Unavailable('analysis-failed', `Dependency diagram projection failed: ${errorMessage(error)}`); }
    check();
    if (outcome.status !== 'projected') {
      throw outcome.reason === 'resource-limit'
        ? new Unavailable('resource-limit', `The dependency diagram has ${outcome.observedBytes} encoded bytes; the maximum is ${outcome.maximumBytes}`)
        : new Unavailable('analysis-failed', `The dependency diagram projection was refused: ${outcome.reason}`);
    }
    // The references never withhold the diagram: a refused or failed projection of them alone gives null.
    let testReferences: TestReferenceFacts | null;
    try {
      const references = projectTestReferences(projection);
      testReferences = references.status === 'projected' ? references.references : null;
    } catch { testReferences = null; }
    check();
    const projectMs = performance.now() - projectStart;
    return { status: 'ready', diagram: outcome.diagram, testReferences, behaviorRuns,
      timings: { acquireMs, classifyMs, projectMs, totalMs: performance.now() - started } };
  } catch (error) {
    if (control.signal?.aborted) return { status: 'cancelled' };
    if (timedOut) return { status: 'unavailable', reason: 'resource-limit', message: `Dependency analysis exceeded its ${limits.deadlineMs} ms deadline` };
    if (error instanceof InputsChanged) return { status: 'inputs-changed', paths: error.paths };
    if (error instanceof Unavailable) return { status: 'unavailable', reason: error.reason, message: error.message };
    const code = errorCode(error);
    if (code === 'changed-input') return { status: 'inputs-changed', paths: sorted([local(String((error as { path?: unknown }).path ?? root))]) };
    return { status: 'unavailable', reason: code === 'resource-limit' ? 'resource-limit' : 'analysis-failed',
      message: `Dependency analysis failed: ${errorMessage(error)}` };
  } finally {
    clearTimeout(timer);
    control.signal?.removeEventListener('abort', cancel);
    try { await source?.dispose(); }
    finally { await view?.dispose(); }
  }
}
