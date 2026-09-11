import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { relative, isAbsolute } from 'node:path';
import { parseDescription } from '../subs/descriptions/src/parse.js';
import type { ParsedDescription } from '../subs/descriptions/src/interfaces/syntax.js';
import { linkDescriptions } from '../subs/descriptions/src/link.js';
import { buildModel, deriveSourceAreas, resolveTagRegistry } from '../subs/model/src/index.js';
import type { SourceArea } from '../subs/model/src/interfaces/model.js';
import { readProject } from '../subs/project/src/read-project.js';
import type { RetainedConfiguration, ProjectInputView } from '../subs/project/src/interfaces/project.js';
import { createSourceAnalysis } from '../subs/typescript/src/source-analysis.js';
import type { SourceAnalysis } from '../subs/typescript/src/interfaces/source.js';
import type { AccessResult, AnalysisInputs, AnalysisRun } from './interfaces/analysis.js';
import { evaluateAccessesAsync } from './evaluate-accesses.js';
import { availableCapabilities, byteOrder, ReportDraft, WorkLimit } from './report.js';
import { diagnostic, projectDiagnostics } from './report-data.js';
import { captureReads, dependencyKey, identity, recordProduct, replayReads, sourceDependencies } from './retained-products.js';
import type { RetainedWork, ParseProduct, CatalogProduct, AccessProduct, ReadCall } from './retained-products.js';

/** The session owns composition and disposal; children keep compiler/filesystem mechanics. */
export async function runAnalysis(inputs: AnalysisInputs, cancellation: AbortSignal, retained?: RetainedWork): Promise<AnalysisRun> {
  let draft = new ReportDraft(inputs);
  if (cancellation.aborted) return { status: 'cancelled' };
  const abort = new AbortController();
  const cancel = (): void => abort.abort();
  cancellation.addEventListener('abort', cancel, { once: true });
  const deadline = performance.now() + inputs.limits.deadlineMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = (): void => {
    if (cancellation.aborted) throw Object.assign(new Error('Analysis cancelled'), { code: 'cancelled' });
    if (abort.signal.aborted || performance.now() >= deadline) throw new WorkLimit('deadlineMs', inputs.limits.deadlineMs, Math.max(inputs.limits.deadlineMs + 1, Math.ceil(performance.now() - deadline + inputs.limits.deadlineMs)));
  };
  const remaining = (maximum: number): number => Math.max(1, Math.ceil(Math.min(maximum, deadline - performance.now())));
  let acquisitionElapsed = 0;
  let permitSourceReuse = retained?.changes !== null;
  try {
    if (Object.values(inputs.limits).flatMap(value => typeof value === 'object' ? Object.values(value) : [value])
      .some(value => !Number.isSafeInteger(value) || value <= 0) || inputs.limits.acquisition.attempts > 3) {
      const item = diagnostic('invalid-invocation', 'Analysis limits must be positive safe integers; acquisition permits at most three attempts', 'invocation');
      draft.diagnostics.push(item); draft.stage('acquisition', 'unavailable', [item]); draft.execution = 'unavailable';
    } else {
      timer = setTimeout(cancel, inputs.limits.deadlineMs);
      const registry = resolveTagRegistry(inputs.registry?.definitions);
      if (registry.status === 'invalid') {
        draft.record(registry.issues.map(issue => diagnostic(issue.code, issue.message, 'registry', issue.locations)));
        draft.stage('registry', 'invalid', draft.diagnostics); draft.execution = 'invalid';
      } else if (registry.value.id !== inputs.registry.id || registry.value.isDefault !== inputs.registry.isDefault) {
        draft.record([diagnostic('invalid-registry', 'Resolved registry identity does not match its definitions', 'registry')]);
        draft.stage('registry', 'invalid', draft.diagnostics); draft.execution = 'invalid';
      } else {
        draft.registry = registry.value; draft.stage('registry', 'completed');
        const unsupported = inputs.capabilities.filter(capability => !availableCapabilities.includes(capability));
        if (unsupported.length) {
          draft.record([diagnostic('unavailable-capability', `Analysis cannot execute: ${unsupported.join(', ')}`, 'unavailable')]);
          draft.stage('access', 'unavailable', draft.diagnostics); draft.execution = 'unavailable';
        } else {
          for (let attempt = 0; attempt < inputs.limits.acquisition.attempts; attempt++) {
            if (attempt) {
              // No facts or diagnostics from discarded bytes enter a subsequent attempt.
              const next = new ReportDraft(inputs, draft.runId);
              draft = next; draft.registry = registry.value; draft.stage('registry', 'completed');
            }
            if (retained) { retained.products = {}; retained.keys = {}; retained.reused = []; retained.sealed = null; }
            let view: ProjectInputView | undefined;
            let source: SourceAnalysis | undefined;
            let sourceDisposalMs = 0;
            let retry = false;
            try {
              check(); draft.current = 'acquisition';
              if (acquisitionElapsed >= inputs.limits.acquisition.deadlineMs) throw new WorkLimit('acquisition.deadlineMs', inputs.limits.acquisition.deadlineMs, Math.ceil(acquisitionElapsed));
              const parsed = new Map<string, ParsedDescription>();
              const parseProducts: ParseProduct = {};
              const previousConfiguration = retained?.previous?.products.configuration as RetainedConfiguration | undefined;
              const sameRegistry = !previousConfiguration || previousConfiguration.product.analysisRegistry === registry.value.id;
              const oldParse = sameRegistry ? retained?.previous?.products.parse as ParseProduct | undefined : undefined;
              let parseReused = true;
              const oldConfiguration = sameRegistry ? previousConfiguration : undefined;
              const acquisitionStart = performance.now();
              const acquired = await readProject({ request: inputs.project,
                parse: (file, text) => {
                  const hash = identity(text), old = oldParse?.[file];
                  const result = old?.hash === hash ? old.value : parseDescription(file, text);
                  if (old?.hash !== hash) parseReused = false;
                  parseProducts[file] = { hash, value: result }; parsed.set(file, result); return result;
                },
                retained: oldConfiguration && (retained?.changes === null ? { ...oldConfiguration, key: '' } : oldConfiguration),
                limits: { ...inputs.limits.acquisition, attempts: 1, deadlineMs: remaining(inputs.limits.acquisition.deadlineMs - acquisitionElapsed) }, signal: abort.signal });
              acquisitionElapsed += performance.now() - acquisitionStart;
              recordProduct(retained, 'parse', identity(Object.entries(parseProducts).map(([path, product]) => [path, product.hash])), parseProducts, parseReused && Object.keys(parseProducts).length > 0);
              check();
              if (acquired.status === 'cancelled') throw Object.assign(new Error('Project acquisition was cancelled'), { code: 'cancelled' });
              if (acquired.status !== 'acquired') {
                if (retained) retained.sealed = acquired.sealedInputs;
                if (acquired.inventory) draft.inventory(acquired.inventory);
                draft.record(projectDiagnostics(acquired.inventory, acquired.issues, parsed));
                draft.stage('acquisition', acquired.status === 'incomplete' ? 'failed' : acquired.status, draft.diagnostics);
                if ([...parsed.values()].some(description => description.status === 'invalid')) draft.stage('parse', 'invalid', draft.diagnostics.filter(item => item.category === 'description'));
                draft.execution = acquired.status;
                retry = acquired.issues.some(issue => issue.code === 'changed-input');
              } else {
                view = acquired.view;
                const configurationProduct = { ...acquired.configuration.product, analysisRegistry: registry.value.id };
                recordProduct(retained, 'configuration', acquired.configuration.key, { ...acquired.configuration, product: configurationProduct,
                  bytes: Buffer.byteLength(JSON.stringify(configurationProduct)) }, acquired.reusedConfiguration);
                recordProduct(retained, 'metadata', identity(acquired.configuration.product.metadata), acquired.configuration.product.metadata, acquired.configuration.product.metadataReused === true);
                draft.inventory(view.inventory);
                draft.stage('acquisition', 'completed'); draft.stage('parse', 'completed'); draft.current = 'parse';
                const areas: SourceArea[] = [];
                for (const module of view.inventory.modules) {
                  check();
                  const profiles = deriveSourceAreas(registry.value, module.id, module.areas.find(area => area.kind === 'ordinary')!.root, module.headerTags);
                  if (profiles.status === 'valid') areas.push(...profiles.value);
                  else draft.record(profiles.issues.map(issue => diagnostic(issue.code, issue.message, 'registry', module.description.status === 'valid'
                    ? [{ file: module.description.document.file, ...module.description.document.module.span }] : [])));
                }
                draft.patch({ areas });
                if (draft.diagnostics.length) {
                  draft.stage('parse', 'invalid', draft.diagnostics); draft.execution = 'invalid';
                } else {
                  draft.current = 'catalog';
                  const context = identity({ registry: registry.value.id, areas,
                    root: view.inventory.scope.root, configuration: view.inventory.scope.configuration,
                    files: view.inventory.files.map(({ path, owner, area, kind }) => ({ path, owner, area, kind })),
                    limits: inputs.limits, capabilities: inputs.capabilities });
                  const oldCatalog = retained?.previous?.products.catalog as CatalogProduct | undefined;
                  const oldAccess = retained?.previous?.products.access as AccessProduct | undefined;
                  const calls: ReadCall[] = [];
                  let reusedSource = false;
                  if (permitSourceReuse && acquired.reusedConfiguration && oldCatalog?.context === context && oldAccess) {
                    await replayReads(view, oldCatalog.calls);
                    const fresh = sourceDependencies(view.inputs);
                    if (dependencyKey(fresh) === dependencyKey(oldCatalog.dependencies)) {
                      reusedSource = true; calls.push(...oldCatalog.calls);
                    } else {
                      // Old imports may no longer be dependencies. Discard their
                      // preflight capture before recomputing the batch pipeline.
                      permitSourceReuse = false;
                      throw Object.assign(new Error('Retained source dependencies changed'), { code: 'retained-changed' });
                    }
                  }
                  if (!reusedSource) source = await createSourceAnalysis({ view: captureReads(view, calls), inventory: view.inventory, areas,
                    limits: { ...inputs.limits.source, deadlineMs: remaining(inputs.limits.source.deadlineMs) }, signal: abort.signal });
                  check();
                  const catalog = reusedSource ? oldCatalog!.value : await source!.catalog(abort.signal);
                  check(); draft.patch({ catalog });
                  let catalogKey = identity([context, sourceDependencies(view.inputs)]);
                  const catalogProduct: CatalogProduct = { value: catalog, calls, dependencies: sourceDependencies(view.inputs), context };
                  recordProduct(retained, 'catalog', catalogKey, catalogProduct, reusedSource);
                  // Opaque inventoried resources (HTML, feature files) need no export
                  // interpretation until an import or declaration selects them. Their
                  // catalog state remains retained; accesses report any relevant gap.
                  draft.cover(catalog.coverage.filter(note => note.code !== 'resource-description'
                    || view!.inventory.references.some(reference => reference.normalized === note.location.file)));
                  draft.stage('catalog', 'completed');
                  draft.current = 'link';
                  const linkKey = identity([catalogKey, dependencyKey(view.inputs.filter(input => input.role === 'description')), registry.value.id]);
                  const oldLink = retained?.previous?.products.link as { linked: ReturnType<typeof linkDescriptions>; model: ReturnType<typeof buildModel> } | undefined;
                  const reuseLink = reusedSource && retained?.previous?.stages.some(stage => stage.stage === 'link' && stage.key === linkKey) && oldLink;
                  const linked = reuseLink ? oldLink!.linked : linkDescriptions({ registry: registry.value, inventory: view.inventory, catalog });
                  check();
                  if (linked.status === 'invalid') {
                    draft.patch({ linked });
                    draft.record(linked.issues.map(issue => diagnostic(issue.code, issue.message,
                      issue.code === 'missing-export' ? 'missing-export' : 'description', issue.locations)));
                    draft.stage('link', 'invalid', draft.diagnostics); draft.execution = 'invalid';
                  } else {
                    let pairs = 0;
                    for (const selection of linked.selections) {
                      pairs += selection.pairs.length;
                      if (pairs > inputs.limits.maxExposurePairs) throw new WorkLimit('maxExposurePairs', inputs.limits.maxExposurePairs, pairs);
                    }
                    draft.patch({ linked });
                    const model = reuseLink ? oldLink!.model : buildModel(linked.modelInput);
                    check();
                    if (model.status === 'invalid') {
                      draft.record(model.issues.map(issue => diagnostic(issue.code, issue.message, 'description', issue.locations)));
                      draft.stage('link', 'invalid', draft.diagnostics); draft.execution = 'invalid';
                    } else {
                      draft.patch({ model: model.value }); draft.stage('link', 'completed'); draft.current = 'access';
                      recordProduct(retained, 'link', linkKey, { linked, model }, Boolean(reuseLink));
                      const accesses = reusedSource ? oldAccess! : await source!.accesses(abort.signal);
                      // Facts are detached at the adapter boundary. The compiler
                      // is no longer needed during decisions or input sealing.
                      const releaseStart = performance.now();
                      await source?.dispose(); source = undefined;
                      // Access extraction may observe additional resolver inputs.
                      // Catalog and access share their cumulative final dependencies.
                      catalogKey = identity([context, sourceDependencies(view.inputs)]);
                      recordProduct(retained, 'catalog', catalogKey, { ...catalogProduct, dependencies: sourceDependencies(view.inputs) }, reusedSource);
                      recordProduct(retained, 'access', catalogKey, accesses, reusedSource);
                      const finalLinkKey = identity([catalogKey, dependencyKey(view.inputs.filter(input => input.role === 'description')), registry.value.id]);
                      recordProduct(retained, 'link', finalLinkKey, { linked, model }, Boolean(reuseLink));
                      sourceDisposalMs = performance.now() - releaseStart;
                      if (sourceDisposalMs > inputs.limits.disposeTimeoutMs) throw new WorkLimit('disposeTimeoutMs', inputs.limits.disposeTimeoutMs, Math.ceil(sourceDisposalMs));
                      check(); draft.patch({ accesses: accesses.accesses }); draft.cover(accesses.coverage); draft.stage('access', 'completed');
                      draft.current = 'decide';
                      const results: AccessResult[] = [];
                      draft.patch({ results });
                      const oldDecide = retained?.previous?.products.decide as { results: AccessResult[]; diagnostics: typeof draft.diagnostics } | undefined;
                      const reuseDecide = reuseLink && oldDecide && retained?.previous?.stages.some(stage => stage.stage === 'decide' && stage.key === finalLinkKey);
                      if (reuseDecide) { results.push(...oldDecide!.results); draft.record(oldDecide!.diagnostics); }
                      else await evaluateAccessesAsync(model.value, accesses.accesses, inputs.limits.maxDiagnostics, {
                        diagnostic: item => draft.record([item]), result: item => results.push(item), checkpoint: check,
                      });
                      recordProduct(retained, 'decide', finalLinkKey, { results, diagnostics: [...draft.diagnostics] }, Boolean(reuseDecide));
                      draft.stage('decide', 'completed', draft.diagnostics); draft.execution = 'completed';
                    }
                  }
                }
                draft.current = 'acquisition';
                const sealStart = performance.now();
                const seal = await view.seal();
                acquisitionElapsed += performance.now() - sealStart;
                check();
                if (acquisitionElapsed > inputs.limits.acquisition.deadlineMs) throw new WorkLimit('acquisition.deadlineMs', inputs.limits.acquisition.deadlineMs, Math.ceil(acquisitionElapsed));
                if (seal.status === 'changed') {
                  throw Object.assign(new Error(`Inputs changed during analysis: ${seal.paths.join(', ')}`), { code: 'changed-input' });
                }
                if (retained) retained.sealed = seal.inputs;
                const captured = [...seal.inputs].sort((a, b) => byteOrder(a.path, b.path) || byteOrder(a.role, b.role));
                draft.patch({ inputs: captured });
                draft.inputId = `input/1:${createHash('sha256').update(JSON.stringify({ scope: view.inventory.scope,
                  registry: registry.value.id, integration: 'typescript/7.0.2/captured-source/1',
                  recipe: 'adjacent-absent-config/extends/files-all-owned-and-configured/empty-include-exclude/resource-witness/1',
                  roots: view.inventory.files.filter(file => file.kind === 'source').map(file => file.path).sort(byteOrder), inputs: captured,
                })).digest('hex')}`;
              }
            } catch (error) {
              const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
              if (code === 'retained-changed') { attempt--; retry = true; }
              else retry = code === 'changed-input';
              if (view) draft.patch({ inputs: [...view.inputs] });
              if (retry) {
                // An incoherent candidate is never a valid graph or a checked source prefix.
                if (draft.snapshot) draft.inventory(draft.snapshot.inventory);
                for (const stage of ['parse', 'catalog', 'link', 'access', 'decide'] as const) draft.stage(stage, 'blocked');
                draft.diagnostics.length = 0; draft.coverage.length = 0; draft.inputId = null;
              }
              if (error && typeof error === 'object' && 'path' in error && typeof error.path === 'string' && draft.snapshot) {
                const path = relative(draft.snapshot.inventory.scope.root, error.path);
                if (!isAbsolute(path) && !path.startsWith('../')) Object.assign(error, { path });
              }
              if (code !== 'retained-changed') draft.failure(error, retry ? 'acquisition' : draft.current);
            } finally {
              draft.current = 'report';
              const disposalStart = performance.now();
              try { await source?.dispose(); }
              finally { await view?.dispose(); }
              source = undefined; view = undefined;
              const disposalMs = sourceDisposalMs + performance.now() - disposalStart;
              if (disposalMs > inputs.limits.disposeTimeoutMs) throw new WorkLimit('disposeTimeoutMs', inputs.limits.disposeTimeoutMs, Math.ceil(disposalMs));
            }
            if (!retry) break;
          }
        }
      }
    }
  } catch (error) { draft.failure(error); }
  finally { clearTimeout(timer); cancellation.removeEventListener('abort', cancel); }
  if (cancellation.aborted) return { status: 'cancelled' };
  if (abort.signal.aborted || (timer && performance.now() >= deadline)) {
    if (!draft.diagnostics.some(item => item.limit?.name === 'deadlineMs')) draft.failure(new WorkLimit('deadlineMs', inputs.limits.deadlineMs, Math.ceil(performance.now() - deadline + inputs.limits.deadlineMs)));
  }
  let report = draft.finish();
  if (timer && performance.now() >= deadline && report.stages.find(stage => stage.stage === 'report')!.status === 'completed') {
    draft.failure(new WorkLimit('deadlineMs', inputs.limits.deadlineMs,
      Math.ceil(performance.now() - deadline + inputs.limits.deadlineMs)), 'report');
    report = draft.finish();
  }
  if (cancellation.aborted) return { status: 'cancelled' };
  return { status: 'reported', report };
}
