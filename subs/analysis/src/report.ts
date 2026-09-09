import { randomUUID } from 'node:crypto';
import type { SourceLocation } from '../subs/model/src/interfaces/model.js';
import type { ProjectInventory, ProjectScope, OutsideSourceWarning } from '../subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import type { AnalysisInputs, AnalysisDiagnostic, AnalysisReport, AnalysisSnapshot, Capability, StageExecution, StageId } from './interfaces/analysis.js';
import { detached, diagnostic } from './report-data.js';

export const stageOrder: readonly StageId[] = ['registry', 'acquisition', 'parse', 'catalog', 'link', 'access', 'decide', 'report'];
export const availableCapabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog',
  'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const capabilityStages: Record<Capability, StageId> = {
  registry: 'registry', layout: 'acquisition', metadata: 'acquisition', descriptions: 'parse', 'source-catalog': 'catalog',
  'exposure-linking': 'link', 'static-access': 'decide', 'tags-origin': 'decide', 'namespace-access': 'decide',
  'lazy-access': 'decide', 'symbol-free-access': 'decide', 'resource-access': 'decide', coverage: 'access', 'browser-verification': 'decide',
};
export const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
const locatedOrder = (a: { location: SourceLocation | null; code: string; id: string }, b: typeof a): number =>
  byteOrder(a.location?.file ?? '', b.location?.file ?? '') || (a.location?.start ?? 0) - (b.location?.start ?? 0)
  || byteOrder(a.code, b.code) || byteOrder(a.id, b.id);

export class WorkLimit extends Error {
  readonly code = 'resource-limit';
  constructor(readonly limit: string, readonly maximum: number, readonly observed: number) {
    super(`${limit} limit ${maximum} exceeded (observed ${observed}); collected evidence is incomplete`);
  }
}

/** Count plain JSON data before allocating its serialized representation. */
function reportBytes(value: unknown, budget: number): number {
  let size = 0;
  const ancestors = new Set<object>();
  const add = (bytes: number): void => {
    size += bytes;
    if (size > budget) throw new WorkLimit('maxReportBytes', budget, size);
  };
  const visit = (item: unknown): void => {
    if (item === null) { add(4); return; }
    if (typeof item === 'string') { add(Buffer.byteLength(JSON.stringify(item))); return; }
    if (typeof item === 'number' && Number.isFinite(item)) { add(String(item).length); return; }
    if (typeof item === 'boolean') { add(item ? 4 : 5); return; }
    if (typeof item !== 'object' || ancestors.has(item) || ancestors.size >= 1024) throw new Error('Report contains non-data or cyclic state');
    if (Object.getPrototypeOf(item) !== (Array.isArray(item) ? Array.prototype : Object.prototype)) throw new Error('Report contains a non-data prototype');
    ancestors.add(item);
    if (Array.isArray(item)) {
      add(2 + Math.max(0, item.length - 1));
      for (const child of item) visit(child);
    } else {
      const entries = Object.entries(item).filter(([, child]) => child !== undefined);
      add(2 + Math.max(0, entries.length - 1));
      for (const [key, child] of entries) { add(Buffer.byteLength(JSON.stringify(key)) + 1); visit(child); }
    }
    ancestors.delete(item);
  };
  visit(value);
  return size;
}

/** Invocation-local plain evidence. This object never stores a provider or a callback. */
export class ReportDraft {
  inputId: string | null = null;
  scope: ProjectScope | null = null;
  readonly warnings: OutsideSourceWarning[] = [];
  registry: AnalysisReport['registry'] = null;
  snapshot: AnalysisSnapshot | null = null;
  execution: AnalysisReport['outcome']['execution'] = 'incomplete';
  readonly diagnostics: AnalysisDiagnostic[] = [];
  readonly coverage: SourceLimit[] = [];
  readonly stages: StageExecution[] = stageOrder.map(stage => ({ stage, status: 'blocked', blockedBy: [], diagnosticIds: [] }));
  current: StageId = 'registry';
  private echo: AnalysisInputs;
  constructor(readonly request: AnalysisInputs, readonly runId = randomUUID()) { this.echo = request; }
  stage(stage: StageId, status: StageExecution['status'], diagnostics: readonly AnalysisDiagnostic[] = []): void {
    this.stages[stageOrder.indexOf(stage)] = { stage, status, blockedBy: [], diagnosticIds: diagnostics.map(item => item.id) };
  }
  inventory(inventory: ProjectInventory): void {
    const warnings = [...inventory.warnings];
    this.scope = inventory.scope;
    this.warnings.length = 0;
    this.snapshot = { inventory: { ...inventory, warnings: this.warnings }, areas: [], inputs: [], catalog: null, linked: null, model: null, accesses: [], results: [] };
    for (const warning of warnings) { this.admit(); this.warnings.push(warning); }
  }
  patch(value: Partial<AnalysisSnapshot>): void {
    if (!this.snapshot) throw new Error('Cannot retain analysis facts before inventory');
    this.snapshot = { ...this.snapshot, ...value };
  }
  record(diagnostics: readonly AnalysisDiagnostic[]): void {
    for (const item of diagnostics) { this.admit(); this.diagnostics.push(item); }
  }
  cover(coverage: readonly SourceLimit[]): void {
    const known = new Set(this.coverage.map(item => item.id));
    for (const item of coverage) {
      if (known.has(item.id)) continue;
      this.admit(); this.coverage.push(item); known.add(item.id);
    }
  }
  admit(): void {
    const next = this.diagnostics.length + this.coverage.length + this.warnings.length + 1;
    if (next > this.request.limits.maxDiagnostics) throw new WorkLimit('maxDiagnostics', this.request.limits.maxDiagnostics, next);
  }
  failure(error: unknown, stage = this.current): void {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const recognized = ['resource-limit', 'changed-input', 'read-failure'].includes(code) ? code as 'resource-limit' | 'changed-input' | 'read-failure'
      : code === 'deadline' ? 'resource-limit' : 'internal-error';
    const path = error && typeof error === 'object' && 'path' in error && typeof error.path === 'string' ? error.path : null;
    const item = { ...diagnostic(recognized, error instanceof Error ? error.message : String(error),
      recognized === 'resource-limit' ? 'limit' : recognized === 'read-failure' || recognized === 'changed-input' ? 'acquisition' : 'execution',
      path ? [{ file: path, start: 0, end: 0, line: 1, column: 1 }] : []),
      ...(error instanceof WorkLimit ? { limit: { name: error.limit, maximum: error.maximum, observed: error.observed, collectedPrefix: true as const } } : {}) };
    // The reserved control envelope admits a limit/failure even when the evidence budget is full.
    this.diagnostics.push(item);
    this.stage(stage, 'failed', [item]); this.execution = 'incomplete';
  }
  blockDependents(): void {
    const blockers: StageId[] = [];
    for (const stage of this.stages) {
      if (stage.stage === 'report') continue;
      if (['failed', 'invalid', 'unavailable'].includes(stage.status)) blockers.push(stage.stage);
      if (stage.status === 'blocked') this.stages[stageOrder.indexOf(stage.stage)] = { ...stage, blockedBy: [...blockers] };
    }
  }
  build(): AnalysisReport {
    this.blockDependents();
    const complete = this.execution === 'completed' && this.stages.every(stage => stage.status === 'completed');
    const warnings = [...this.warnings].sort((a, b) => byteOrder(a.entry, b.entry));
    const decisions = this.snapshot?.results.flatMap(result => result.decisions) ?? [];
    const diagnosticIds = new Set(this.diagnostics.map(item => item.id));
    return {
      schemaVersion: 'ramify.analysis/1', runId: this.runId, inputId: this.inputId, request: this.echo,
      scope: this.scope, registry: this.registry,
      capabilities: [...availableCapabilities, 'browser-verification' as const].map(capability => ({ capability,
        available: availableCapabilities.includes(capability), requested: this.request.capabilities.includes(capability),
        executed: availableCapabilities.includes(capability) && this.stages.find(stage => stage.stage === capabilityStages[capability])!.status === 'completed' })),
      stages: this.stages.map(stage => ({ ...stage,
        diagnosticIds: stage.diagnosticIds.filter(id => diagnosticIds.has(id)),
      })),
      outcome: { execution: this.execution, check: this.execution === 'invalid' ? 'failed'
        : complete ? this.diagnostics.length ? 'failed' : 'passed' : 'not-run',
      coverage: this.stages.find(stage => stage.stage === 'access')!.status === 'completed'
        ? complete && !this.coverage.length ? 'complete' : 'partial' : 'not-run' },
      snapshot: this.snapshot, diagnostics: [...this.diagnostics].sort(locatedOrder), warnings,
      coverage: [...this.coverage].sort(locatedOrder),
      summary: { complete, owners: this.snapshot?.inventory.modules.length ?? 0,
        sourceFiles: this.snapshot?.inventory.files.filter(file => file.kind === 'source').length ?? 0,
        resources: this.snapshot?.inventory.files.filter(file => file.kind === 'resource').length ?? 0,
        originals: this.snapshot?.catalog?.originals.length ?? 0, accesses: this.snapshot?.accesses.length ?? 0,
        allowed: decisions.filter(decision => decision.status === 'allowed').length,
        denied: decisions.filter(decision => decision.status === 'denied').length,
        errors: this.diagnostics.length, warnings: warnings.length, coverageNotes: this.coverage.length,
        external: this.snapshot?.results.filter(result => result.outcome === 'external').length ?? 0 },
    };
  }
  finish(): AnalysisReport {
    if (this.stages.find(stage => stage.stage === 'report')!.status !== 'failed') this.stage('report', 'completed');
    let report = this.build();
    const maximum = this.request.limits.maxReportBytes;
    const reserve = 64 * 1024;
    try {
      // Admit evidence separately so the mandatory envelope has its reserved space.
      const evidence = { snapshot: report.snapshot, diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage };
      try { reportBytes(evidence, Math.max(1, maximum - reserve)); }
      catch (error) {
        if (error instanceof WorkLimit) throw new WorkLimit('maxReportBytes', maximum, error.observed + reserve);
        throw error;
      }
      reportBytes(report, maximum);
    } catch (error) {
      this.failure(error, 'report');
      const limitDiagnostic = this.diagnostics[this.diagnostics.length - 1]!;
      const fits = (budget = maximum): boolean => { try { reportBytes(report, budget); return true; } catch { return false; } };
      report = this.build();
      if (!fits()) {
        this.snapshot = null; report = this.build();
        // Drop bounded tails in logarithmic steps rather than serializing a large
        // report after each individual removal. Every removal has explicit limit evidence.
        for (const collection of [this.warnings, this.coverage]) {
          while (!fits() && collection.length) { collection.length = Math.floor(collection.length / 2); report = this.build(); }
        }
        while (!fits() && this.diagnostics.length > 1) {
          this.diagnostics.splice(Math.floor((this.diagnostics.length - 1) / 2), Math.ceil((this.diagnostics.length - 1) / 2));
          report = this.build();
        }
        if (!fits()) {
          this.registry = null;
          // An oversized request cannot be echoed in full in the failure
          // envelope. Keep an explicitly reported prefix of the supplied data;
          // it is not a replacement resolved registry or an executed request.
          this.echo = { ...this.request, registry: { ...this.request.registry, definitions: this.request.registry.definitions.map(({ description: _description, ...definition }) => definition) } };
          this.diagnostics.splice(0, this.diagnostics.length, { ...limitDiagnostic,
            message: `${limitDiagnostic.message}; report data and requested input details are retained only as a bounded prefix` });
          report = this.build();
          while (!fits() && this.echo.registry.definitions.length) {
            this.echo = { ...this.echo, registry: { ...this.echo.registry,
              definitions: this.echo.registry.definitions.slice(0, Math.floor(this.echo.registry.definitions.length / 2)) } };
            report = this.build();
          }
          if (!fits()) {
            const prefix = (value: string): string => value.slice(0, 1024);
            this.echo = { ...this.echo, project: { ...this.echo.project, cwd: prefix(this.echo.project.cwd),
              ...(this.echo.project.root === undefined ? {} : { root: prefix(this.echo.project.root) }) },
            registry: { ...this.echo.registry, id: prefix(this.echo.registry.id), definitions: [] },
            capabilities: [...new Set(this.echo.capabilities)].slice(0, 14) };
            if (this.scope) this.scope = { ...this.scope, root: prefix(this.scope.root), invokedFrom: prefix(this.scope.invokedFrom),
              configuration: prefix(this.scope.configuration), walkedAreas: [], independentScopes: [] };
            // For a caller-supplied limit smaller than the mandatory JSON
            // envelope itself, only the fixed control reserve can be returned.
            this.diagnostics.splice(0, this.diagnostics.length, { ...limitDiagnostic, location: null, related: [],
              message: `Report exceeds maxReportBytes=${maximum}; only a bounded control envelope and requested input prefix are retained` });
            report = this.build();
          }
        }
      }
      // Never return arbitrary large caller metadata after dropping only the snapshot.
      reportBytes(report, Math.max(maximum, reserve));
    }
    return detached(report);
  }
}
