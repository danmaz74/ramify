import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateProject } from '../subs/analysis/src/validation-entry.js';
import { parseDescription } from '../subs/analysis/subs/descriptions/src/parse.js';
import type { DescriptionDocument } from '../subs/analysis/subs/descriptions/src/interfaces/syntax.js';
import { readPurpose } from '../subs/analysis/subs/project/src/purpose.js';
import { validationInputs } from './validation-inputs.js';

interface SelectionManifest { readonly name: string; readonly tags: readonly string[]; readonly selections: readonly string[] }
/** Compare atomic selections so grouping named statements creates no false drift. */
function manifest(document: DescriptionDocument): SelectionManifest {
  return { name: document.module.name, tags: [...document.module.tags].sort(),
    selections: document.statements.flatMap(statement => 'directory' in statement
      ? [JSON.stringify({ kind: statement.kind, directory: statement.directory.value })]
      : statement.destinations.flatMap(destination =>
      (statement.selection.kind === 'wildcard' ? [{ name: '*', alias: '*', wildcard: true }]
        : statement.selection.names.map(({ name, alias }) => ({ name, alias, wildcard: false })))
        .map(selection => JSON.stringify({ kind: statement.kind, from: statement.from.value, destination,
          tags: statement.tags ? [...statement.tags.values].sort() : null, ...selection })))).sort() };
}

const plan1 = 'docs/plans/done/iteration-1-project-verifier';
const plan2 = 'docs/plans/done/iteration-2-resident-verification';
const plan2a = 'docs/plans/iteration-2a-materialized-api-view';
/** One named layer over an archived declaration: the plan that reviewed it,
 * and the selections it added or withdrew. Layers are applied in the order
 * their plans landed, and never edit an archived list. */
interface ReviewedLayer { readonly plan: string; readonly added?: DescriptionDocument; readonly withdrawn?: DescriptionDocument }
/** One named layer over an archived README purpose: the plan that reviewed the
 * change, and the sentence it appended or the exact phrase it replaced. */
interface ReviewedPurposeLayer { readonly plan: string; readonly appended?: string; readonly replaced?: readonly [string, string] }
interface ReviewedOwner { readonly directory: string; readonly purpose: string; readonly document: DescriptionDocument;
  readonly layers?: readonly ReviewedLayer[]; readonly purposeLayers?: readonly ReviewedPurposeLayer[] }
/** An entry target is a runtime and type pair, or a string naming one packed
 * file, such as a stylesheet, that is resolved and read but never imported. */
type EntryPair = { readonly types: string; readonly import: string };
type EntryTarget = EntryPair | string;
interface PackageMetadata {
  readonly type: string; readonly main: string; readonly types: string;
  readonly bin: { readonly ramify: string };
  readonly exports: Readonly<Record<string, EntryTarget>>;
}
/** Reviewed metadata after the compiled-client packaging: `nodeEntry` is the reviewed bin target.
 * Its `exports` are the reviewed eight only; later entries arrive as `reviewedAdditions`. */
interface ExpectedPackage extends PackageMetadata { readonly nodeEntry: string;
  readonly exports: Readonly<Record<string, EntryPair>> }

// The reviewed bin target stays the Node entry. The installed `ramify` became a POSIX sh
// launcher beside it, which execs the host compiled client when present, else that entry.
const reviewedNodeEntry = 'dist/src/cli-entry.js';
const launcher = 'dist/src/ramify';

// Independent entry expectations: Plan 1's portable entry witnesses plus
// the analysis and client exports required by Plan 2's activation contract.
const entryFunctions = {
  '.': ['createAnalysisSession', 'analyzeProject', 'validateProject', 'acquireInventory', 'openRetainedSession', 'resolveProject'],
  './analysis': ['createAnalysisSession', 'analyzeProject', 'validateProject', 'acquireInventory', 'openRetainedSession', 'resolveProject'],
  './analysis/inventory': ['acquireInventory'], './model': ['createDefaultTagRegistry'],
  './presentation': ['ModelDiagram'], './layout': ['placeNodes'], './cli': ['runCli'],
  './client': ['connectDaemon', 'selectEndpoint', 'readDaemonRecord', 'encodeMessage', 'decodeMessage'],
};

// A named, reviewed layer over the reviewed eight: the module-tree canvas entry
// and its stylesheet, reviewed with the package surface that
// `scripts/reference-harness/module-tree-consumer.ts` records and that
// `scripts/reference-harness/README.md` documents. Nothing else may appear.
const reviewedAdditions: Readonly<Record<string, EntryTarget>> = {
  './module-tree': { types: './dist/subs/presentation/src/module-tree-entry.d.ts',
    import: './dist/subs/presentation/src/module-tree-entry.js' },
  './module-tree.css': './dist/subs/presentation/src/module-tree-entry.css',
};
/** Witnesses for the added runtime entries. The stylesheet has none: it is read, never imported. */
const additionFunctions = { './module-tree': ['ModuleTreeCanvas'] };

function description(text: string): DescriptionDocument {
  const parsed = parseDescription('reviewed module.ramify', text);
  assert.equal(parsed.status, 'valid', 'Reviewed declaration must parse without abbreviations');
  if (parsed.status !== 'valid') throw new Error('Invalid reviewed declaration');
  return parsed.document;
}

/** Plan 2 abbreviates unchanged named lists. Expand only from the archived
 * Plan 1 review, never from the implementation being checked. */
export function reviewedOwners(baseline: string, resident: string, retained?: string, retainedIteration = 10, materialized?: string): ReadonlyMap<string, ReviewedOwner> {
  const owners = new Map<string, ReviewedOwner>();
  function add(review: string, abbreviations: boolean): number {
    let count = 0;
    for (const section of review.split(/^## /m)) {
      const block = /```ramify\n([\s\S]*?)\n```/.exec(section)?.[1];
      if (!block) continue;
      const directory = /\*\*Directory:\*\* `([^`]+)`/.exec(section)?.[1];
      const purpose = /^> (.+)$/m.exec(section)?.[1];
      assert.ok(directory && purpose, 'Each reviewed owner needs its directory and purpose');
      const name = /^module "?([\w-]+)"?/m.exec(block)?.[1];
      assert.ok(name);
      const previous = owners.get(name);
      const expanded = block.split('\n').map(line => {
        if (!line.includes('…')) return line;
        assert.ok(abbreviations && previous, `No archived declaration for ${name}`);
        const range = /^expose-sub (\w+), … , (\w+) from (\w+) to (.+)$/.exec(line);
        assert.ok(range, `Unrecognized abbreviation: ${line}`);
        const [, first, last, child, destinations] = range;
        const candidates = previous.document.statements.flatMap(statement => {
          if (statement.kind !== 'expose-sub' || statement.from.value !== child
            || statement.destinations.join(', ') !== destinations || statement.selection.kind !== 'named') return [];
          const names = statement.selection.names;
          const start = names.findIndex(item => item.name === first), end = names.findIndex(item => item.name === last);
          return start < 0 || end < start ? [] : [names.slice(start, end + 1)];
        });
        assert.equal(candidates.length, 1, `Abbreviation must match exactly one archived list: ${line}`);
        return `expose-sub ${candidates[0].map(item => item.name === item.alias ? item.name : `${item.name} as ${item.alias}`).join(', ')} from ${child} to ${destinations}`;
      }).join('\n');
      owners.set(name, { directory, purpose, document: description(expanded) });
      count++;
    }
    return count;
  }
  assert.equal(add(baseline, false), 9, 'All nine archived Plan 1 owners must be present');
  assert.equal(add(resident, true), 6, 'All six Plan 2 owner declarations must be present');
  if (retained) {
    const previousCli = owners.get('cli')!;
    assert.equal(add(retained, true), 7, 'All seven Plan 5 declaration texts must be present');
    // CLI's purpose describes --changed and its document, activated in iteration
    // 10. Do not claim that future behavior while validating iteration 9.
    if (retainedIteration < 10) owners.set('cli', { ...owners.get('cli')!, purpose: previousCli.purpose });
  }
  if (materialized) assert.equal(add(materialized, true), 6, 'All six Plan 2A final declaration owners must be present');
  assert.equal(owners.size, 11, 'All eleven final owners must be present');
  return owners;
}

/** A named layer over the archived declarations: the Ramify plan that reviewed
 * the selections, keyed by owner directory. Nothing here is a blanket
 * allowance, and no archived list is rewritten. */
interface DeclarationLayer {
  readonly plan: string;
  readonly added?: Readonly<Record<string, string>>;
  readonly withdrawn?: Readonly<Record<string, string>>;
}

/** Owners added below the archived eleven, with the reviewed header and README
 * purpose each arrived with. The selections they hold arrive through the named
 * layers below, one per plan. */
const addedOwners = [
  { plan: 'Plan 6 (project explorer)', name: 'project-view', directory: 'subs/presentation/subs/project-view/', tags: ['ui', 'browser'],
    purpose: "Project view renders Ramify's revision-bound explorer compatibility model as a pure browser-facing behavioral dependency diagram with a detail panel, and as a collapsible module tree with a module detail panel." },
  { plan: 'Plan 6 (project explorer)', name: 'explorer', directory: 'subs/explorer/', tags: ['ui', 'browser', 'dispatch'],
    purpose: "Provides the resident explorer server's browser pages: a home page, the project explorer view and the module tree, all served through the token-free browser service." },
  { plan: 'Plan 6 (project explorer)', name: 'service-api', directory: 'subs/service-api/', tags: ['dispatch'],
    purpose: 'Projects retained analysis reports into the bounded project-explorer service model and hosts a resident, token-free local web server for one project: its four tRPC procedures read the project binding for each request. The dependencyView procedure relays an on-demand dependency diagram request to the daemon and maps the ready result into the browser dependency model. The binding opens one project\'s resident context through an injected daemon connector, subscribes to it and keeps it current across evictions, daemon failures and explicit stops. The owner does not scan files or run an analyzer.' },
  { plan: 'Plan 6 (project explorer)', name: 'integration-tests', directory: 'subs/integration-tests/', tags: ['testing', 'ui', 'dispatch'],
    purpose: "Verifies contracts that cross Ramify's presentation and dispatch owners." },
] as const;

const declarationLayers: readonly DeclarationLayer[] = [
  { plan: 'Plan 6 (project explorer)',
    added: {
      './': [
        'expose-sub SessionExplorerDetailsOutcome from analysis to descendants',
        'expose-sub ContextExplorerDetailsOutcome, ExplorerDetailsRequest, connectDaemon, selectEndpoint from daemon to descendants',
        'expose-sub ProjectExplorerPage, createProjectExplorerBrowserApp from explorer to descendants',
        'expose-sub ExplorerAccess, ExplorerCoverage, ExplorerDiscussionProps, ExplorerDiscussionSelection, ExplorerEdge, ExplorerExport, ExplorerExposure, ExplorerFile, ExplorerMetrics, ExplorerModule, ExplorerSelection, ExplorerSummary, ExportDetailState, GraphSelection, ModuleGraphProps, ModuleGraphRadial, ProjectExplorerModel, ProjectExplorerView, ProjectExplorerViewProps from presentation to descendants',
        'expose-sub ExplorerDetailsInput, ExplorerDetailsResult, ExplorerEndpointSelection, ExplorerLaunchOptions, ExplorerProcessLaunch, ExplorerProcessRecord, ExplorerProjectionInput, ExplorerRouter, ProjectViewInput, createExplorerRouter, createProjectExplorerModel, ensureExplorerWebProcess, explorerProjectUrl, probeExplorerReadiness, readExplorerProcessRecord, reusableExplorerProcess, selectExplorerEndpoint, startExplorerWebProcess from service-api to descendants',
      ].join('\n'),
      'subs/presentation/': [
        'expose-sub ExplorerAccess, ExplorerCoverage, ExplorerDiscussionProps, ExplorerDiscussionSelection, ExplorerEdge, ExplorerExport, ExplorerExposure, ExplorerFile, ExplorerMetrics, ExplorerModule, ExplorerSelection, ExplorerSummary, ExportDetailState, GraphSelection, ModuleGraphProps, ModuleGraphRadial, ProjectExplorerModel, ProjectExplorerView, ProjectExplorerViewProps from project-view to parent',
      ].join('\n'),
      'subs/daemon/': [
        'expose-sub ContextExplorerDetailsOutcome, ExplorerDetailsRequest from contexts to parent',
      ].join('\n'),
      'subs/explorer/': [
        'expose-src ProjectExplorerPage from "ProjectExplorerPage.tsx" tagged [browser, dispatch, ui] to parent',
        'expose-src createProjectExplorerBrowserApp from "browser-app.tsx" tagged [browser, dispatch, ui] to parent',
      ].join('\n'),
      'subs/service-api/': [
        'expose-src * from "interfaces/explorer-service.ts" to parent',
        'expose-src createProjectExplorerModel from "project-view.ts" to parent',
        'expose-src ExplorerRouter, createExplorerRouter from "router.ts" to parent',
        'expose-src ExplorerEndpointSelection, explorerProjectUrl, probeExplorerReadiness, readExplorerProcessRecord, reusableExplorerProcess, selectExplorerEndpoint from "web-discovery.ts" to parent',
        'expose-src ExplorerLaunchOptions, ExplorerProcessLaunch, ensureExplorerWebProcess from "web-launcher.ts" to parent',
        'expose-src ExplorerWebProcess, startExplorerWebProcess from "web-process.ts" to parent',
      ].join('\n'),
      'subs/presentation/subs/project-view/': [
        'expose-src ExportDetailState from "ExportList.tsx" to parent',
        'expose-src ModuleGraphRadial from "ModuleGraphRadial.tsx" tagged [browser, ui] to parent',
        'expose-src ProjectExplorerView from "ProjectExplorerView.tsx" tagged [browser, ui] to parent',
        'expose-src ExplorerDiscussionProps, ExplorerDiscussionSelection, ProjectExplorerViewProps from "ProjectExplorerView.tsx" to parent',
        'expose-src * from "interfaces/project-view.ts" to parent',
        'expose-src GraphSelection, ModuleGraphProps from "moduleGraphShared.ts" to parent',
      ].join('\n'),
    },
  },
  { plan: 'Plan 6B (resident explorer server)',
    added: {
      './': [
        'expose-sub readDaemonRecord from daemon to descendants',
        'expose-sub BindingState, ProjectBinding, ServerBindingKind, ServerStatusResult, createProjectBinding, explorerProjectKey from service-api to descendants',
      ].join('\n'),
      'subs/cli/': [
        'expose-src capabilities from "command-support.ts" to parent',
      ].join('\n'),
      'subs/service-api/': [
        'expose-src BindingState, ProjectBinding, createProjectBinding from "project-binding.ts" to parent',
        'expose-src explorerProjectKey from "web-discovery.ts" to parent',
      ].join('\n'),
    },
  },
  { plan: 'Plan 6C (module tree view)',
    added: {
      './': [
        'expose-sub ModuleTreeView, ModuleTreeViewProps, ancestorsOf, collapsibleAtDepth, indexModuleTree from presentation to descendants',
      ].join('\n'),
      'subs/presentation/': [
        'expose-sub Point, placeTree from layout to descendants',
        'expose-sub ModuleTreeView, ModuleTreeViewProps, ancestorsOf, collapsibleAtDepth, indexModuleTree from project-view to parent',
      ].join('\n'),
      'subs/presentation/subs/project-view/': [
        'expose-src ModuleTreeView from "ModuleTreeView.tsx" tagged [browser, ui] to parent',
        'expose-src ModuleTreeViewProps from "ModuleTreeView.tsx" to parent',
        'expose-src ancestorsOf, collapsibleAtDepth, indexModuleTree from "module-tree.ts" tagged [browser, ui] to parent',
      ].join('\n'),
    },
  },
  { plan: 'Plan 6D (behavioral dependency diagram)',
    added: {
      './': [
        'expose-sub BehavioralDependencyMetrics, DependencyAnalyzerOutcome, DependencyBoundaryFact, DependencyDiagramFacts, DependencyDiagramOutcome, DependencyDiagramRunner from analysis to descendants',
        'expose-sub ContextDependencyDiagramOutcome, DependencyDiagramRequest from daemon to descendants',
        'expose-sub ActiveDependencyEdge, DependencyDepthMode, DependencyGraphCount, DependencyGraphEdge, DependencyGraphEvidence, DependencyGraphImportedCount, DependencyGraphImportedEdge, DependencyGraphModel, DependencyGraphModule, DependencyGraphOriginalEdge, DependencyGraphState, DependencyPhase, DependencySettings, ScopeNodeId, defaultDependencySettings, ownSourceNodeId, ownSourceNodeModule from presentation to descendants',
        'expose-sub DependencyViewInput, DependencyViewResult, ExplorerDependencyCount, ExplorerDependencyEvidence, ExplorerDependencyModel, ExplorerDependencyModelInput, ExplorerDependencyModelOutcome, ExplorerDependencyModule, ExplorerImportedCount, ExplorerImportedDependencyEdge, ExplorerOriginalDependencyEdge from service-api to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-src analyzeDependencyDiagram from "dependency-analyzer.ts" to parent',
        'expose-src * from "interfaces/dependency-analyzer.ts" to parent',
        'expose-src DependencyBoundaryFact, DependencyDiagramFacts, DependencyDiagramOutcome from "interfaces/dependency-diagram.ts" to parent',
        'expose-src BehavioralDependencyMetrics from "interfaces/modularity.ts" to parent',
      ].join('\n'),
      'subs/analysis/subs/typescript/': [
        'expose-src * from "interfaces/dependency-behavior.ts" to parent',
      ].join('\n'),
      'subs/presentation/': [
        'expose-sub ActiveDependencyEdge, DependencyDepthMode, DependencyGraphCount, DependencyGraphEdge, DependencyGraphEvidence, DependencyGraphImportedCount, DependencyGraphImportedEdge, DependencyGraphModel, DependencyGraphModule, DependencyGraphOriginalEdge, DependencyGraphState, DependencyPhase, DependencySettings, ScopeNodeId, defaultDependencySettings, ownSourceNodeId, ownSourceNodeModule from project-view to parent',
      ].join('\n'),
      'subs/daemon/': [
        'expose-sub ContextDependencyDiagramOutcome, DependencyDiagramRequest from contexts to parent',
      ].join('\n'),
      'subs/service-api/': [
        'expose-src * from "interfaces/explorer-dependencies.ts" to parent',
      ].join('\n'),
      'subs/presentation/subs/project-view/': [
        'expose-src defaultDependencySettings, ownSourceNodeId, ownSourceNodeModule from "dependency-graph.ts" tagged [browser, ui] to parent',
        'expose-src ActiveDependencyEdge, ScopeNodeId from "dependency-graph.ts" to parent',
        'expose-src * from "interfaces/dependency-view.ts" to parent',
      ].join('\n'),
    },
  },
  { plan: 'Plan 2B (generated views)',
    added: {
      './': [
        'expose-sub ArchitectDependencies, ArchitectDependencyReason, ArchitectModuleFacts, ArchitectSymbol, ArchitectTestRecord, ArchitectViewCounts, ArchitectViewFile, ArchitectViewProjection, ArchitectViewQuery, ArchitectViewQueryOutcome, ExportBehavior, ExportKind, RenderedArchitectView, TestFileReferences, TestReferenceFacts, TestTitleLimits, renderArchitectView from analysis to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-src renderArchitectView from "architect-render.ts" to parent',
        'expose-src * from "interfaces/architect-view.ts" to parent',
        'expose-src TestFileReferences, TestReferenceFacts, TestReferenceOutcome from "interfaces/dependency-diagram.ts" to parent',
        'expose-sub ExportBehavior, ExportKind, TestTitleLimits from typescript to parent',
      ].join('\n'),
    },
  },
  { plan: 'Plan 2C (module measurements)',
    added: {
      './': [
        'expose-sub ArchitectMeasurements, InventoryMeasurementBuckets, InventoryModuleMeasurement, MeasurementBuckets, MeasurementDocumentationSize, MeasurementFileRecord, MeasurementFileSize, MeasurementViewSize, MeasurementViewUnavailableReason, MeasurementViews, ModuleMeasurement, SessionMeasurements, SessionMeasurementsOutcome from analysis to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-src * from "interfaces/measurements.ts" to parent',
      ].join('\n'),
    },
  },
  { plan: 'Plan 8 (signature companions)',
    added: {
      './': [
        'expose-sub BehaviorClassification, BehaviorEvidence, BehaviorLimit, DependencyAnalyzerTimings, DependencyBehaviorAccessFact, DependencyBehaviorFact, DependencyBehaviorFacts, ObservationRetirement, ObservationSink, SignatureCompanions, SuppliedAccesses from analysis to descendants',
        'expose-sub AnalysisDriver, ApiViewPublisher, CaptureTimings, CaptureWork, DaemonService, MaterializedViewId, PublishApiViewOutcome, PublishInput, RenderedApiViewArea, RenderedApiViewDocument, ServiceLease, WatchBatch from daemon to descendants',
        'expose-sub BrowserPage, ExplorerClient, ProjectExplorerBrowserApp, ProjectExplorerPageProps, ProjectViewResult from explorer to descendants',
        'expose-sub ChordSpec, DecisionPolicy, LegendEntry, LegendGroup, ModuleTreeIndex, NodeContentOptions, SymbolName, Theme, TracedColorKey, TracedSymbol, TreeFocus, ViewRect, WhatIfNote from presentation to descendants',
        'expose-sub DependencyViewCounters, DependencyViews, DependencyViewsStatus, ExplorerRouterOptions, ExplorerWebProcess, ExplorerWebProcessOptions, ProjectBindingConnector, ProjectBindingLogEntry, ProjectBindingOptions from service-api to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-sub ObservationRetirement from project to parent, descendants',
        'expose-sub BehaviorClassification, BehaviorEvidence, BehaviorLimit, DependencyBehaviorAccessFact, DependencyBehaviorFact, DependencyBehaviorFacts, SuppliedAccesses from typescript to parent, descendants',
      ].join('\n'),
      'subs/analysis/subs/model/': [
        'expose-src listCompanionViolations from "companions.ts" tagged [browser] to parent',
      ].join('\n'),
      'subs/analysis/subs/typescript/': [
        'expose-src DeclarationInputs from "symbol-details.ts" to parent',
      ].join('\n'),
      'subs/presentation/': [
        'expose-src ChordSpec, DecisionPolicy, LegendEntry, LegendGroup, NodeContentOptions, TracedColorKey, TracedSymbol, WhatIfNote from "diagram-definition.ts" to parent',
        'expose-src SymbolName from "model-access.ts" to parent',
        'expose-src Theme from "theme.ts" to parent',
        'expose-src TreeFocus from "tree-diagram.ts" to parent',
        'expose-sub Box, LayoutEdge, LayoutEdgeInput, LayoutGraphInput, LayoutNode, LayoutNodeInput, LayoutOptions, LayoutResult from layout to descendants',
        'expose-sub ViewRect from layout to parent',
        'expose-sub ModuleTreeIndex from project-view to parent',
      ].join('\n'),
      'subs/daemon/': [
        'expose-sub ApiViewQueryLimits, ApiViewRequest, CaptureTimings, CaptureWork, ContextApiViewOutcome, ContextDependencyFactsOutcome, WatchBatch from contexts to parent',
      ].join('\n'),
      'subs/explorer/': [
        'expose-src ProjectExplorerPageProps from "ProjectExplorerPage.tsx" to parent',
        'expose-src BrowserPage, ProjectExplorerBrowserApp from "browser-app.tsx" to parent',
        'expose-src ExplorerClient, ProjectViewResult from "published-project-view.ts" to parent',
      ].join('\n'),
      'subs/service-api/': [
        'expose-src DependencyViewCounters, DependencyViews, DependencyViewsStatus from "dependency-view.ts" to parent',
        'expose-src ProjectBindingConnector, ProjectBindingLogEntry, ProjectBindingOptions from "project-binding.ts" to parent',
        'expose-src ExplorerRouterOptions from "router.ts" to parent',
        'expose-src ExplorerWebProcessOptions from "web-process.ts" to parent',
      ].join('\n'),
      'subs/presentation/subs/project-view/': [
        'expose-src ModuleTreeIndex from "module-tree.ts" to parent',
      ].join('\n'),
    },
    withdrawn: {
      'subs/analysis/': [
        'expose-src planApiViewRequests from "api-view.ts" to parent',
        'expose-src projectApiView from "api-view.ts" to parent',
      ].join('\n'),
    },
  },
  { plan: 'the module-tree canvas entry',
    added: {
      'subs/presentation/': [
        'expose-sub ModuleTreeCanvas, ModuleTreeCanvasEmphasis, ModuleTreeCanvasNode, ModuleTreeCanvasProps from project-view to parent',
      ].join('\n'),
      'subs/presentation/subs/project-view/': [
        'expose-src ModuleTreeCanvas from "ModuleTreeCanvas.tsx" tagged [browser, ui] to parent',
        'expose-src ModuleTreeCanvasEmphasis, ModuleTreeCanvasNode, ModuleTreeCanvasProps from "ModuleTreeCanvas.tsx" to parent',
      ].join('\n'),
    },
  },
  // The toolkit's own inferred signatures, written out so its check reports
  // complete coverage. Each declared type is a signature companion, so it is
  // exposed wherever the symbol it accompanies is. Reviewed with the
  // declarations themselves: `subs/presentation/subs/layout/src/geometry.ts`
  // (`LayoutGeometry`), `subs/service-api/src/project-view.ts`
  // (`ExplorerProjectionResult`) and `subs/service-api/src/router.ts`
  // (`ExplorerProcedures`), whose identity is restated by
  // `subs/service-api/src/tests/router-typing.test.ts`.
  { plan: 'the declared toolkit signatures',
    added: {
      './': [
        'expose-sub ExplorerProjectionResult, ExplorerProcedures from service-api to descendants',
      ].join('\n'),
      'subs/presentation/subs/layout/': [
        'expose-src LayoutGeometry from "geometry.ts" to parent',
      ].join('\n'),
      'subs/service-api/': [
        'expose-src ExplorerProjectionResult from "project-view.ts" to parent',
        'expose-src ExplorerProcedures from "router.ts" to parent',
      ].join('\n'),
    },
  },
  // Plan 7's reviewed manifest additions (`docs/plans/iteration-7-affected-modules/owners.md`,
  // "Manifest additions"): analysis exposes its affected-module vocabulary by
  // an interface wildcard, the root relays it with the R3 analysis vocabulary,
  // and daemon and the root relay the two context types beside the N5 and R7
  // context vocabulary. Contexts' own wildcard already selects those two.
  { plan: 'Plan 7 (affected modules)',
    added: {
      './': [
        'expose-sub AffectedQuery, AffectedModule, AffectedPathBasis, AffectedPathSeed, AffectedWideningReason, AffectedSelection, AffectedUnavailableReason, SessionAffectedOutcome from analysis to descendants',
        'expose-sub AffectedRequest, ContextAffectedOutcome from daemon to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-src * from "interfaces/affected.ts" to parent',
      ].join('\n'),
      'subs/daemon/': [
        'expose-sub AffectedRequest, ContextAffectedOutcome from contexts to parent',
      ].join('\n'),
    },
  },
  // Phase 1 project boundaries, iteration 2: the description statement union
  // names its two members, which travel with it as signature companions.
  { plan: 'Phase 1 project boundaries (nested-tree statements)',
    added: {
      './': [
        'expose-sub ExposureStatement, NestedTreeStatement from analysis to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-sub ExposureStatement, NestedTreeStatement from descriptions to parent, descendants',
      ].join('\n'),
    },
  },
  // Phase 1 project boundaries, iteration 3: the scope's ownership table names
  // its module, exclusion and result types, which travel with `ProjectScope`
  // as signature companions, beside the one classifier over that table.
  { plan: 'Phase 1 project boundaries (path ownership)',
    added: {
      './': [
        'expose-sub PathOwner, ProjectExclusion, ProjectOwnership, PathOwnership, classifyProjectPath from analysis to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-sub PathOwner, ProjectExclusion, ProjectOwnership, PathOwnership, classifyProjectPath from project to parent, descendants',
      ].join('\n'),
      'subs/analysis/subs/project/': [
        'expose-src classifyProjectPath from "ownership.ts" to parent',
      ].join('\n'),
    },
  },
  // Phase 1 project boundaries, iteration 3B: the root-marker reader that
  // analysis supplies to project selection, and its type, which travels with
  // `ProjectReadOptions` as a signature companion.
  { plan: 'Phase 1 project boundaries (root marker)',
    added: {
      './': [
        'expose-sub RootMarkerReader from analysis to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-sub RootMarkerReader from descriptions to parent, descendants',
      ].join('\n'),
      'subs/analysis/subs/descriptions/': [
        'expose-src readRootMarker from "parse.ts" to parent',
      ].join('\n'),
    },
  },
  // Phase 1 project boundaries, iteration 5: what the root's scripts import
  // from other owners. Daemon exposes the runtime identity the production
  // build writes and the dependency wait the Plan 2B measurement records;
  // analysis re-exposes this script's description parser and README purpose
  // reader to the root. Root re-exposes none of them.
  { plan: 'Phase 1 project boundaries (root tooling access)',
    added: {
      'subs/analysis/': [
        'expose-sub parseDescription from descriptions to parent',
        'expose-sub readPurpose from project to parent',
      ].join('\n'),
      'subs/analysis/subs/project/': [
        'expose-src readPurpose from "purpose.ts" to parent',
      ].join('\n'),
      'subs/daemon/': [
        'expose-src describeRuntime, runtimeIdentityPath, RuntimeIdentity from "discovery.ts" to parent',
        'expose-src dependencyWait from "service.ts" to parent',
      ].join('\n'),
    },
  },
  // Phase 1 project boundaries, iteration 7: the toolkit's nested trees, as
  // the user decided them on 2026-10-03.
  { plan: 'Phase 1 project boundaries (toolkit nested trees)',
    added: {
      './': [
        'owned-ignored "docs"',
        'owned-ignored "examples/collection-review"',
        'owned-ignored "scripts/probes/fixtures/compiler-api"',
        'owned-ignored "scripts/probes/fixtures/plan2a-symbol-details"',
        'owned-ignored "scripts/reference-harness"',
        'owned-ignored "site"',
        'external ".cucumber-viz"',
        'external ".history"',
        'external ".playwright-mcp"',
        'external ".reference-work"',
        'external "ramify-agent"',
      ].join('\n'),
    },
  },
  // Phase 1 project boundaries, iteration 8: `ProjectWarning` replaces
  // `OutsideSourceWarning` as the inventory's and the reports' warning type,
  // so the relays that carried the old type carry the new one. Project's
  // wildcard interface exposure already selects it.
  { plan: 'Phase 1 project boundaries (project warnings)',
    added: {
      './': [
        'expose-sub ProjectWarning from analysis to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-sub ProjectWarning from project to parent, descendants',
      ].join('\n'),
    },
    withdrawn: {
      './': [
        'expose-sub OutsideSourceWarning from analysis to descendants',
      ].join('\n'),
      'subs/analysis/': [
        'expose-sub OutsideSourceWarning from project to parent, descendants',
      ].join('\n'),
    },
  },
  // Phase 1 project boundaries, iteration 15: a changed check's reply gives each
  // named path a `PathCheckDisposition`, which travels with `CheckOutcome` as a
  // signature companion, so the relays that carry the outcome carry it too.
  // Contexts' wildcard interface exposure already selects it.
  { plan: 'Phase 1 project boundaries (path dispositions)',
    added: {
      './': [
        'expose-sub PathCheckDisposition from daemon to descendants',
      ].join('\n'),
      'subs/daemon/': [
        'expose-sub PathCheckDisposition from contexts to parent',
      ].join('\n'),
    },
  },
];

/** A named layer over the archived README purposes, keyed by owner directory:
 * a sentence a plan appended, or one exact phrase it replaced. */
interface PurposeLayer {
  readonly plan: string;
  readonly appended?: Readonly<Record<string, string>>;
  readonly replaced?: Readonly<Record<string, readonly [string, string]>>;
}

const purposeLayers: readonly PurposeLayer[] = [
  // Plan 7's reviewed purpose additions (`docs/plans/iteration-7-affected-modules/owners.md`,
  // "Purpose paragraph additions"), each appended to the existing paragraph.
  // The user accepted the CLI and contexts paragraphs with these sentences as
  // their reviewed purposes on 2026-10-04.
  { plan: 'Plan 7 (affected modules)',
    appended: {
      './': 'It assembles the affected-module service and its batch form.',
      'subs/analysis/': 'It also selects the modules affected by changed paths or modules on demand from one revision\'s retained dependency facts.',
      'subs/cli/': 'Its affected command prints module test selections from the resident service or a fresh batch session.',
      'subs/daemon/': 'It exposes the affected-module query through the same bounded service and lightweight client connection.',
      'subs/daemon/subs/contexts/': 'It schedules affected-module queries against the covering revision with explicit freshness and unavailable outcomes.',
    },
  },
  // Phase 1 project boundaries, iteration 8: owned compiler source outside
  // `src/` is its owner's auxiliary source, and the outside-module warnings it
  // replaced are retired; Project records the compiler-selection warnings.
  { plan: 'Phase 1 project boundaries (auxiliary source)',
    replaced: {
      'subs/analysis/subs/project/': ['records raw source areas, configuration selection, outside-module warnings and README purpose metadata',
        'records raw source areas, auxiliary source, configuration selection, project warnings and README purpose metadata'],
    },
  },
];

/** The expected purpose: the archived paragraph, then each named layer in turn.
 * A layer that restates an appended sentence, or whose replaced phrase does not
 * occur exactly once, is itself an error, so a layer cannot hide archived drift. */
function expectedPurpose(owner: ReviewedOwner): string {
  let purpose = owner.purpose;
  for (const layer of owner.purposeLayers ?? []) {
    if (layer.appended !== undefined) {
      assert.ok(!purpose.includes(layer.appended), `${layer.plan} restates a reviewed purpose sentence: ${owner.directory}`);
      purpose = `${purpose} ${layer.appended}`;
    }
    if (layer.replaced !== undefined) {
      const [before, after] = layer.replaced;
      assert.equal(purpose.split(before).length, 2, `${layer.plan} replaces a phrase the reviewed purpose does not hold once: ${owner.directory}`);
      purpose = purpose.replace(before, () => after);
    }
  }
  return purpose;
}

/** The expected selections: the archived list, then each named layer in turn.
 * A layer that restates or withdraws a selection the reviewed declaration does
 * not hold is itself an error, so a layer cannot hide archived drift. */
function expectedManifest(owner: ReviewedOwner): SelectionManifest {
  const base = manifest(owner.document);
  const selections = [...base.selections];
  for (const layer of owner.layers ?? []) {
    for (const selection of layer.withdrawn ? manifest(layer.withdrawn).selections : []) {
      const at = selections.indexOf(selection);
      assert.ok(at >= 0, `${layer.plan} withdraws a selection the reviewed declaration does not hold: ${selection}`);
      selections.splice(at, 1);
    }
    for (const selection of layer.added ? manifest(layer.added).selections : []) {
      assert.ok(!selections.includes(selection), `${layer.plan} restates a reviewed selection: ${selection}`);
      selections.push(selection);
    }
  }
  return { ...base, selections: selections.sort() };
}

/** Apply the named layers to the archived owners. The archived documents stay
 * as their plans reviewed them; every later change is attached as a layer that
 * names its plan. */
export function layeredOwners(archived: ReadonlyMap<string, ReviewedOwner>): ReadonlyMap<string, ReviewedOwner> {
  // Only the project root, at `./`, carries the root marker; manifests compare names, tags and selections.
  const header = (name: string, tags: readonly string[], directory: string) =>
    `ramify 1\n${directory === './' ? 'root ' : ''}module "${name}"${tags.length ? ` tagged [${[...tags].join(', ')}]` : ''}\n`;
  const owners = new Map(archived);
  for (const owner of addedOwners) {
    assert.ok(!owners.has(owner.name), `${owner.plan} adds an owner the archived review already holds: ${owner.name}`);
    owners.set(owner.name, { directory: owner.directory, purpose: owner.purpose, document: description(header(owner.name, owner.tags, owner.directory)) });
  }
  const byDirectory = new Map([...owners].map(([name, owner]) => [owner.directory, name]));
  for (const layer of declarationLayers) {
    for (const directory of new Set([...Object.keys(layer.added ?? {}), ...Object.keys(layer.withdrawn ?? {})])) {
      const name = byDirectory.get(directory);
      assert.ok(name, `${layer.plan} layers onto an owner no review declares: ${directory}`);
      const owner = owners.get(name)!;
      const statements = (text: string | undefined) => text === undefined ? undefined
        : description(header(owner.document.module.name, [...owner.document.module.tags], owner.directory) + '\n' + text + '\n');
      owners.set(name, { ...owner, layers: [...owner.layers ?? [],
        { plan: layer.plan, added: statements(layer.added?.[directory]), withdrawn: statements(layer.withdrawn?.[directory]) }] });
    }
  }
  for (const layer of purposeLayers) {
    for (const directory of new Set([...Object.keys(layer.appended ?? {}), ...Object.keys(layer.replaced ?? {})])) {
      const name = byDirectory.get(directory);
      assert.ok(name, `${layer.plan} layers a purpose onto an owner no review declares: ${directory}`);
      const owner = owners.get(name)!;
      owners.set(name, { ...owner, purposeLayers: [...owner.purposeLayers ?? [],
        { plan: layer.plan, appended: layer.appended?.[directory], replaced: layer.replaced?.[directory] }] });
    }
  }
  assert.equal(owners.size, 15, 'All fifteen final owners must be present');
  return owners;
}

export function reviewedPackage(baseline: string, resident: string): ExpectedPackage {
  const metadata = (text: string): PackageMetadata & { readonly exports: Readonly<Record<string, EntryPair>> } => {
    const block = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => match[1]).find(value => value.includes('"bin"'));
    assert.ok(block, 'Reviewed package metadata must be present');
    return JSON.parse(block) as PackageMetadata & { readonly exports: Readonly<Record<string, EntryPair>> };
  };
  const original = metadata(baseline), addition = metadata(resident);
  assert.deepEqual(addition.bin, original.bin, 'Plan 2 keeps the bin target');
  assert.deepEqual(Object.keys(addition.exports), ['./client'], 'Plan 2 adds only the client entry');
  assert.deepEqual(original.bin, { ramify: reviewedNodeEntry }, 'Reviewed bin targets the Node entry');
  const expected = { ...original, bin: { ramify: launcher }, nodeEntry: reviewedNodeEntry,
    exports: { ...original.exports, ...addition.exports } };
  assert.equal(Object.keys(expected.exports).length, 8);
  return expected;
}

export function assertOwner(actual: string, readme: string, expected: ReviewedOwner): void {
  // Comments, line wrapping and grouping of equivalent selections are prose;
  // names, paths, tags, destinations and wildcard/named spelling are contracts.
  assert.deepEqual(manifest(description(actual)), expectedManifest(expected), `Final selections differ: ${expected.directory}module.ramify`);
  const purpose = readPurpose(`${expected.directory}README.md`, readme);
  assert.equal(purpose.state, 'present', `Missing README prose paragraph: ${expected.directory}`);
  if (purpose.state === 'present') assert.equal(purpose.paragraph, expectedPurpose(expected), `Final README purpose differs: ${expected.directory}`);
}

export async function validatePackageEntries(root: string, expected: ExpectedPackage): Promise<number> {
  const actual = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const key of ['type', 'main', 'types', 'bin'] as const) assert.deepEqual(actual[key], expected[key], `Final package ${key}`);
  // The reviewed eight stay present and unchanged; every remaining key must be
  // one of the recorded additions, so a new entry is accepted only as the named
  // layer above, never as a bare superset. Key order was never a contract.
  const entries = (actual.exports ?? {}) as Readonly<Record<string, EntryTarget>>;
  const keys = Object.keys(entries);
  assert.deepEqual(keys.filter(key => key in expected.exports).sort(), Object.keys(expected.exports).sort(), 'Final package exports');
  for (const [key, entry] of Object.entries(expected.exports)) assert.deepEqual(entries[key], entry, `Final package exports ${key}`);
  assert.deepEqual(keys.filter(key => !(key in expected.exports)).sort(), Object.keys(reviewedAdditions).sort(), 'Final package exports beyond the reviewed entries');
  for (const [key, entry] of Object.entries(reviewedAdditions)) assert.deepEqual(entries[key], entry, `Reviewed package entry addition ${key}`);
  for (const entry of Object.values(entries)) {
    // A string target names one packed file: it is read, never imported.
    for (const target of typeof entry === 'string' ? [entry] : [entry.types, entry.import]) {
      assert.ok((await stat(resolve(root, target))).isFile(), `Entry target is not a file: ${target}`);
    }
  }
  // Resolve from the supplied package, including relocated packages. Resolving
  // from this script would accidentally validate this checkout instead.
  const probe = `import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const metadata = JSON.parse(process.argv[1]);
const condition = process.argv[2];
const required = JSON.parse(process.argv[3]);
for (const [name, entry] of Object.entries(metadata.exports)) {
  const specifier = name === '.' ? metadata.name : metadata.name + name.slice(1);
  const url = import.meta.resolve(specifier);
  if (typeof entry === 'string') {
    // A string target resolves to one packed file under both conditions. It is
    // read here and never imported, because Node cannot evaluate it.
    assert.equal(fileURLToPath(url), resolve(entry), specifier + ' file target');
    assert.ok(statSync(fileURLToPath(url)).isFile(), 'Entry target is not a file: ' + specifier);
    continue;
  }
  assert.equal(fileURLToPath(url), resolve(entry[condition]), specifier + ' ' + condition + ' target');
  if (condition === 'import') {
    const values = await import(url);
    for (const binding of required[name]) assert.equal(typeof values[binding], 'function', 'Missing callable export: ' + specifier + '#' + binding);
  }
}`;
  for (const condition of ['import', 'types']) {
    // Type targets are resolved, never executed. In particular, putting an
    // import condition before types must not silently select the JS target.
    await promisify(execFile)(process.execPath, [...condition === 'types' ? ['--conditions=types'] : [],
      '--input-type=module', '--eval', probe, JSON.stringify(actual), condition, JSON.stringify({ ...entryFunctions, ...additionFunctions })],
    { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 });
  }
  for (const [file, shebang] of [[actual.bin.ramify, '#!/bin/sh\n'], [expected.nodeEntry, '#!/usr/bin/env node\n']]) {
    assert.ok((await readFile(resolve(root, file), 'utf8')).startsWith(shebang), `${file} must start with ${shebang.trim()}`);
    assert.ok(((await stat(resolve(root, file))).mode & 0o111) !== 0, `${file} must be executable`);
  }
  return Object.keys(expected.exports).length;
}

export async function validateFinalContracts(root: string) {
  const read = (path: string) => readFile(resolve(root, path), 'utf8');
  // Plan 5's own completion gate (I5-14:declarations-final) greps this file
  // for the literal path below to confirm it reads Plan 5's owners.md as its
  // third reviewed layer; keep this exact literal, not the `plan5` constant.
  const expected = layeredOwners(reviewedOwners(await read(`${plan1}/owners.md`), await read(`${plan2}/owners.md`),
    await read('docs/plans/iteration-5-fast-incremental-checks/owners.md'), 10, await read(`${plan2a}/owners.md`)));
  const metadata = reviewedPackage(await read(`${plan1}/contracts.md`), await read(`${plan2}/contracts.md`));
  const errors: Error[] = [];
  for (const owner of expected.values()) {
    try { assertOwner(await read(`${owner.directory}/module.ramify`), await read(`${owner.directory}/README.md`), owner); }
    catch (error) { errors.push(new Error((error as Error).message.split('\n')[0])); }
  }
  let packageEntries = 0;
  try { packageEntries = await validatePackageEntries(root, metadata); }
  catch (error) { errors.push(new Error((error as Error).message.split('\n')[0])); }
  // Real linking checks every exposure's original export, even when the
  // declaration comparison has already found missing final selections.
  const result = await validateProject(validationInputs(root));
  if (result.status !== 'valid') errors.push(new Error(`Final declarations do not link: ${JSON.stringify(result)}`));
  else {
    const actual = result.input.inventory.modules.map(module => module.description.status === 'valid' ? module.description.document.module.name : '').sort();
    try { assert.deepEqual(actual, [...expected.keys()].sort(), 'Exact fifteen final owners'); }
    catch { errors.push(new Error('Exact fifteen final owners differ')); }
  }
  if (errors.length) throw new AggregateError(errors, 'Plan 2 final contracts are incomplete');
  assert.equal(result.status, 'valid');
  if (result.status !== 'valid') throw new Error('Final declarations do not link');
  return { owners: result.input.inventory.modules.length, files: result.input.inventory.files.length,
    expandedStatements: result.linked.selections.length, packageEntries, bin: metadata.bin.ramify };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await validateFinalContracts(process.cwd()))); }
  catch (error) {
    console.error(error instanceof AggregateError ? [error.message, ...error.errors.map(item => `- ${(item as Error).message}`)].join('\n') : error);
    process.exitCode = 1;
  }
}
