import { readFile, readdir } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseDescription } from '../parse.js';
import type { ExposureStatement } from '../interfaces/syntax.js';

const root = new URL('../../../../../../', import.meta.url);
type Names = '*' | readonly (string | readonly [string, string])[];
function statement(kind: ExposureStatement['kind'], names: Names, from: string,
  destinations: readonly ('parent' | 'descendants')[] = ['parent'], tags: readonly string[] | null = null) {
  return { kind, names: names === '*' ? '*' : names.map((name) => typeof name === 'string' ? [name, name] : name), from, tags, destinations };
}
const src = (names: Names, from: string, tags: readonly string[] | null = null, destinations: readonly ('parent' | 'descendants')[] = ['parent']) =>
  statement('expose-src', names, from, destinations, tags);
const sub = (names: Names, from: string, destinations: readonly ('parent' | 'descendants')[] = ['parent']) =>
  statement('expose-sub', names, from, destinations);
const tree = (kind: 'owned-ignored' | 'external', directory: string) => ({ kind, directory });
const descendants = ['descendants'] as const;
const both = ['parent', 'descendants'] as const;
const browser = ['browser'];
const uiBrowser = ['ui', 'browser'];

// Independent selections from the reference contract map and the reviewed final
// Plan 2 owner contracts. Read the actual authored texts, including their comments.
const modelNames = [
  'ModuleId', 'TagName', 'TagKind', 'TagDefinition', 'ResolvedTagRegistry', 'SourceLocation',
  'ModelIssue', 'ModelResult', 'SourceArea', 'ModuleRecord', 'OriginalId', 'SourceOrigin',
  // Plan 8: `Original` names its signature companions.
  'SignatureCompanions', 'Original', 'Destination', 'Exposure', 'ModelInput', 'Model', 'ExposureHop', 'VisibilityDecision',
  'BindingRequest', 'ImportQuestion', 'TagRequirement', 'ImportReason', 'ImportDecision',
  'resolveTagRegistry', 'createDefaultTagRegistry', 'deriveSourceAreas', 'assignOriginalTags',
  'originalKey', 'buildModel', 'explainVisibility', 'explainImport',
];
// Plan 2A relays from owners.md "Cross-subtree relay additions".
const availabilityNames = ['AvailableForm', 'AvailableOriginal', 'listAvailableOriginals'];
const symbolDetailNames = ['SymbolDetailLimits', 'SymbolDetailRequest', 'SymbolDetail'];
const apiViewNames = ['ApiViewCategory', 'ApiViewEntry', 'ApiViewFile', 'ApiViewAreaProjection', 'ApiViewModuleProjection',
  'ApiViewProjection', 'ApiViewSelection', 'ApiViewQuery', 'ApiViewQueryOutcome'];
// Plan 2B C3/C4: the architect projection, its session query and its rendering.
const architectNames = ['ArchitectModuleFacts', 'ArchitectSymbol', 'ArchitectTestRecord', 'ArchitectViewCounts',
  'ArchitectViewProjection', 'ArchitectViewQuery', 'ArchitectViewQueryOutcome', 'ArchitectDependencyReason',
  'ArchitectDependencies', 'ArchitectViewFile', 'RenderedArchitectView', 'renderArchitectView'];
const measurementNames = ['MeasurementFileSize', 'MeasurementDocumentationSize', 'InventoryMeasurementBuckets',
  'MeasurementViewSize', 'MeasurementBuckets', 'MeasurementViewUnavailableReason', 'MeasurementViews',
  'MeasurementFileRecord', 'InventoryModuleMeasurement', 'ModuleMeasurement', 'SessionMeasurements',
  'SessionMeasurementsOutcome', 'ArchitectMeasurements'];
const linkingNames = ['LinkInputs', 'ExpandedSelection', 'LinkIssue', 'LinkedDescriptions'];
const analysisNames = ['Capability', 'StageId', 'RunControl', 'AnalysisLimits', 'AnalysisInputs',
  'InventoryInputs', 'InventorySnapshot', 'InventoryRun', 'ValidationRun', 'CapabilityExecution',
  'StageExecution', 'AnalysisCode', 'AnalysisDiagnostic', 'AccessResult', 'AnalysisSnapshot',
  'AnalysisSummary', 'AnalysisReport', 'AnalysisRun', 'AnalysisSession', 'SessionLimits', 'SessionInputs',
  'SessionChange', 'RevisionPath', 'CheckedSet', 'FindingDelta', 'RevisionTimings', 'OperationTimings', 'SessionRevision',
  'SessionUpdate', 'VerifyOutcome', 'SessionExplorerDetailsOutcome', 'SessionStatus', 'RetainedSession', 'SessionOpen'];
const syntaxNames = ['TextSpan', 'DescriptionToken', 'DescriptionIssue', 'NamedSelection',
  'DescriptionSelection', 'ExposureStatement', 'NestedTreeStatement', 'DescriptionStatement', 'DescriptionDocument',
  'ParsedDescription', 'DescriptionParser', 'RootMarkerReader'];

// Phase 1 project boundaries, iteration 8: `ProjectWarning` replaces the
// relayed `OutsideSourceWarning` in the same position.
const projectNames = ['ProjectRequest', 'ProjectScope', 'PathOwner', 'ProjectExclusion', 'ProjectOwnership', 'PathOwnership', 'CapturedInput', 'InventoryArea', 'ModulePurpose',
  'InventoryModule', 'InventoryFile', 'ExactReference', 'ProjectWarning', 'ProjectInventory',
  'ProjectIssue', 'AcquisitionLimits', 'ProjectInputView', 'ProjectReadOptions', 'ProjectRead', 'ProjectResolution', 'RetainedConfiguration'];
// Plan 8: the observer's signature companions travel with it, so the root relays the sink too.
const observerNames = ['ObservationSink', 'ObservationRetirement', 'InputChangeKind', 'ObservedChange', 'InventoryUpdate', 'ProjectObserver', 'ProjectObserve'];

// Independent literal selections from Plan 2 owners.md R7 and N5.
const contextNames = ['ContextId', 'GenerationId', 'RevisionId', 'LeaseId', 'ContextToken', 'ContextSetup',
  'ContextSelection', 'InputFingerprints', 'RevisionCause', 'ContextRevision', 'ContextState', 'SynchronizationState',
  'ContextStatus', 'ExpectedContent', 'Freshness', 'FreshnessRecord', 'CheckRequest', 'CheckDelta', 'UnavailableReason', 'Unavailable',
  // Phase 1 project boundaries (path dispositions): `PathCheckDisposition` travels with `CheckOutcome`.
  'CheckOutcome', 'PathCheckDisposition', 'ExplorerDetailsRequest', 'ContextExplorerDetailsOutcome', 'DependencyDiagramRequest', 'ContextDependencyDiagramOutcome', 'ReplyTimings', 'OpenOutcome', 'ContextEvent', 'SubscriptionHandle', 'WatchEvent', 'WatcherHandle', 'WatcherPort',
  'ClockPort', 'ContextBudgets'];
const controlledNames = ['createControlledWatcher', 'createControlledClock', 'ControlledWatcher', 'ControlledClock'];
const residentNames = ['DaemonInstance', 'LogEntry', 'DaemonBudgets', 'EndpointSelection', 'DaemonRecord',
  'StopDisposition', 'Handshake', 'Welcome', 'ConnectTimeouts', 'ConnectOptions', 'ConnectionState', 'DisconnectReason',
  'RecoveryOutcome', 'ServiceConnection', 'ConnectOutcome', 'ServiceConnector', 'WireMessage'];

const sourceNames = ['CatalogOriginal', 'CatalogExport', 'FileExports', 'SourceCatalog', 'SourceTarget', 'WrittenForm', 'AccessSelection', 'SourceAccess', 'SourceLimit',
  'SourceWorkLimits', 'SourceAnalysisInputs', 'SuppliedAccesses', 'SourceAnalysis',
  // Plan 8: the dependency-behavior facts `SourceAnalysis` names.
  'DependencyBehaviorFacts', 'DependencyBehaviorFact', 'DependencyBehaviorAccessFact', 'BehaviorClassification', 'BehaviorEvidence',
  'BehaviorLimit'];

// Plan 8: the definition and props vocabulary the relayed signatures name.
const presentationVocabulary = ['WhatIfNote', 'NodeContentOptions', 'DecisionPolicy', 'LegendGroup', 'LegendEntry',
  'TracedSymbol', 'TracedColorKey', 'ChordSpec'];
const presentationNames = ['DiagramDefinition', 'TreeDiagramDefinition', 'FocusDiagramDefinition',
  'TreeFocus', ...presentationVocabulary, 'Theme', 'SymbolName', 'ViewRect',
  'ModelDiagramProps', 'ModelDiagramInteractiveProps', 'TreeDiagramProps', 'FocusDiagramProps',
  'ModelDiagram', 'ModelDiagramSvg', 'TreeDiagram', 'TreeDiagramSvg', 'FocusDiagram', 'FocusDiagramSvg',
  'shopDiagram', 'example1Diagram', 'example1aDiagram', 'example1bDiagram', 'example2Diagram',
  'example3Diagram', 'example4Diagram', 'shopTreeDiagram', 'shopFocusDiagram'];
const projectViewModelNames = ['ProjectExplorerModel', 'ExplorerModule', 'ExplorerFile', 'ExplorerMetrics',
  'ExplorerEdge', 'ExplorerAccess', 'ExplorerSelection', 'ExplorerExport',
  'ExplorerExposure', 'ExplorerCoverage', 'ExplorerSummary'];
const projectViewProps = ['ProjectExplorerViewProps', 'ExplorerDiscussionProps', 'ExplorerDiscussionSelection', 'ExportDetailState'];
const dependencyViewNames = ['DependencyGraphCount', 'DependencyGraphImportedCount', 'DependencyGraphModule',
  'DependencyGraphEvidence', 'DependencyGraphImportedEdge', 'DependencyGraphOriginalEdge', 'DependencyGraphEdge',
  'DependencyGraphModel', 'DependencyDepthMode', 'DependencySettings', 'DependencyPhase', 'DependencyGraphState'];
const explorerServiceNames = ['ExplorerProjectionInput', 'ProjectViewInput', 'ExplorerDetailsInput',
  'ExplorerDetailsResult', 'ServerBindingKind', 'ServerStatusResult', 'ExplorerProcessRecord'];
const explorerDependencyNames = ['ExplorerDependencyModelInput', 'ExplorerDependencyCount', 'ExplorerImportedCount',
  'ExplorerDependencyModule', 'ExplorerDependencyEvidence', 'ExplorerImportedDependencyEdge', 'ExplorerOriginalDependencyEdge',
  'ExplorerDependencyModel', 'ExplorerDependencyModelOutcome', 'DependencyViewInput', 'DependencyViewResult'];
const presentationStatements = [
  src(['ModelDiagram', 'ModelDiagramSvg'], 'ModelDiagram.tsx', uiBrowser),
  src(['TreeDiagram', 'TreeDiagramSvg'], 'TreeDiagram.tsx', uiBrowser),
  src(['FocusDiagram', 'FocusDiagramSvg'], 'FocusDiagram.tsx', uiBrowser),
  src(['ModelDiagramProps', 'ModelDiagramInteractiveProps'], 'ModelDiagram.tsx'),
  src(['TreeDiagramProps'], 'TreeDiagram.tsx'), src(['FocusDiagramProps'], 'FocusDiagram.tsx'),
  src(['DiagramDefinition'], 'diagram-definition.ts'), src(['TreeDiagramDefinition'], 'tree-diagram.ts'),
  src(['FocusDiagramDefinition'], 'focus-diagram.ts'),
  src(['TreeFocus'], 'tree-diagram.ts'), src(presentationVocabulary, 'diagram-definition.ts'),
  src(['Theme'], 'theme.ts'), src(['SymbolName'], 'model-access.ts'), sub(['ViewRect'], 'layout'),
  ...['shop', 'example1', 'example1a', 'example1b', 'example2', 'example3', 'example4']
    .map((name) => src([`${name}Diagram`], `diagrams/${name}.ts`, uiBrowser)),
  src(['shopTreeDiagram', 'shopFocusDiagram'], 'diagrams/shop-tree.ts', uiBrowser),
  sub(projectViewModelNames, 'project-view'), sub(['ModuleGraphRadial'], 'project-view'),
  sub(['ModuleGraphProps', 'GraphSelection'], 'project-view'), sub(['ProjectExplorerView'], 'project-view'),
  sub(projectViewProps, 'project-view'),
  sub(['ModuleTreeView'], 'project-view'), sub(['ModuleTreeViewProps'], 'project-view'),
  sub(['indexModuleTree', 'collapsibleAtDepth', 'ancestorsOf', 'ModuleTreeIndex'], 'project-view'),
  sub(['ModuleTreeCanvas'], 'project-view'),
  sub(['ModuleTreeCanvasProps', 'ModuleTreeCanvasNode', 'ModuleTreeCanvasEmphasis'], 'project-view'),
  sub([...dependencyViewNames, 'ActiveDependencyEdge', 'ScopeNodeId'], 'project-view'),
  sub(['defaultDependencySettings', 'ownSourceNodeId', 'ownSourceNodeModule'], 'project-view'),
  sub(['placeTree', 'Point', 'LayoutGraphInput', 'LayoutNodeInput', 'LayoutEdgeInput', 'LayoutOptions', 'LayoutResult',
    'LayoutNode', 'LayoutEdge', 'Box'], 'layout', descendants),
];
const layoutStatements = [
  src('*', 'interfaces/layout.ts'),
  ...(['Nodes', 'Lanes', 'Chords', 'Legend', 'Tree', 'Focus'] as const)
    .map((name, index) => src([`place${name}`], `${['node', 'lane', 'chord', 'legend', 'tree', 'focus'][index]}-placement.ts`, browser)),
  src(['measureBounds'], 'bounds.ts', browser),
  src(['LAYOUT', 'headerBandHeight', 'r', 'polyline', 'textWidth', 'rowLabelDx', 'wrapText'], 'geometry.ts', browser),
  src(['LayoutGeometry'], 'geometry.ts'),
  src(['CENTER', 'DRAG_THRESHOLD', 'MAX_SCALE', 'MIN_SCALE', 'clampPan', 'isReset', 'normalizeWheelDelta',
    'panBy', 'scaleOf', 'wheelFactor', 'zoomAt'], 'viewport.ts', browser),
];

interface Fixture {
  path: string;
  name: string;
  tags: readonly string[];
  statements: readonly (ReturnType<typeof statement> | ReturnType<typeof tree>)[];
}
const toolkit: readonly Fixture[] = [
  { path: '', name: 'ramify', tags: ['dispatch'], statements: [
    // The toolkit's nested trees, decided by the user on 2026-10-03.
    ...['docs', 'examples/collection-review', 'scripts/probes/fixtures/compiler-api', 'scripts/probes/fixtures/plan2a-symbol-details',
      'scripts/reference-harness', 'site'].map((directory) => tree('owned-ignored', directory)),
    ...['.cucumber-viz', '.history', '.playwright-mcp', '.reference-work', 'ramify-agent'].map((directory) => tree('external', directory)),
    src('*', 'interfaces/batch.ts', null, descendants), src('*', 'interfaces/service.ts', null, descendants),
    statement('expose-test', ['createQuickEnvironment', 'QuickEnvironment'], 'quick-environment.ts', descendants),
    sub([...modelNames, ...availabilityNames], 'analysis', descendants), sub([...syntaxNames, ...linkingNames], 'analysis', descendants),
    sub([...projectNames, ...observerNames, 'isRamifyGeneratedPath', 'classifyProjectPath'], 'analysis', descendants),
    sub([...sourceNames, ...symbolDetailNames], 'analysis', descendants),
    sub([...analysisNames, ...apiViewNames], 'analysis', descendants),
    sub(measurementNames, 'analysis', descendants),
    sub(['AffectedQuery', 'AffectedModule', 'AffectedPathBasis', 'AffectedPathSeed', 'AffectedWideningReason', 'AffectedSelection',
      'AffectedUnavailableReason', 'SessionAffectedOutcome'], 'analysis', descendants),
    sub(['DependencyBoundaryFact', 'DependencyDiagramFacts', 'DependencyDiagramOutcome', 'BehavioralDependencyMetrics', 'TestFileReferences',
      'TestReferenceFacts'], 'analysis', descendants),
    sub(['DependencyDiagramRunner', 'DependencyAnalyzerOutcome', 'DependencyAnalyzerTimings'], 'analysis', descendants),
    sub([...architectNames, 'ExportKind', 'ExportBehavior', 'TestTitleLimits'], 'analysis', descendants),
    sub(presentationNames, 'presentation', descendants),
    sub([...projectViewModelNames, 'ModuleGraphProps', 'GraphSelection'], 'presentation', descendants),
    sub(['ModuleGraphRadial'], 'presentation', descendants), sub(projectViewProps, 'presentation', descendants),
    sub(['ProjectExplorerView'], 'presentation', descendants),
    sub(['ModuleTreeView', 'ModuleTreeViewProps', 'indexModuleTree', 'collapsibleAtDepth', 'ancestorsOf', 'ModuleTreeIndex'],
      'presentation', descendants),
    sub([...dependencyViewNames, 'ActiveDependencyEdge', 'ScopeNodeId', 'defaultDependencySettings',
      'ownSourceNodeId', 'ownSourceNodeModule'], 'presentation', descendants),
    sub(explorerServiceNames, 'service-api', descendants), sub(['createProjectExplorerModel', 'ExplorerProjectionResult'], 'service-api', descendants),
    sub(explorerDependencyNames, 'service-api', descendants),
    sub(['createExplorerRouter', 'ExplorerRouter', 'ExplorerProcedures', 'startExplorerWebProcess', 'ExplorerWebProcess', 'ExplorerRouterOptions',
      'ExplorerWebProcessOptions', 'DependencyViews', 'DependencyViewsStatus', 'DependencyViewCounters'], 'service-api', descendants),
    sub(['createProjectBinding', 'ProjectBinding', 'BindingState', 'ProjectBindingOptions', 'ProjectBindingConnector',
      'ProjectBindingLogEntry'], 'service-api', descendants),
    sub(['selectExplorerEndpoint', 'readExplorerProcessRecord', 'reusableExplorerProcess', 'probeExplorerReadiness',
      'explorerProjectUrl', 'explorerProjectKey', 'ExplorerEndpointSelection', 'ensureExplorerWebProcess', 'ExplorerLaunchOptions',
      'ExplorerProcessLaunch'], 'service-api', descendants),
    sub(['ProjectExplorerPage', 'createProjectExplorerBrowserApp', 'ProjectExplorerPageProps', 'BrowserPage',
      'ProjectExplorerBrowserApp', 'ExplorerClient', 'ProjectViewResult'], 'explorer', descendants),
    sub([...contextNames, ...residentNames, ...controlledNames, 'MaterializedTarget', 'MaterializedViewId', 'DaemonService',
      'ServiceLease', 'ApiViewPublisher', 'PublishInput', 'RenderedApiViewArea', 'RenderedApiViewDocument', 'PublishApiViewOutcome',
      'AnalysisDriver', 'WatchBatch', 'CaptureTimings', 'CaptureWork', 'AffectedRequest', 'ContextAffectedOutcome'], 'daemon', descendants),
    sub(['connectDaemon', 'selectEndpoint', 'readDaemonRecord'], 'daemon', descendants),
  ] },
  { path: 'subs/analysis/', name: 'analysis', tags: [], statements: [sub('*', 'model', both), sub([...syntaxNames, ...linkingNames], 'descriptions', both), sub([...projectNames, ...observerNames, 'isRamifyGeneratedPath', 'classifyProjectPath'], 'project', both), sub([...sourceNames, ...symbolDetailNames], 'typescript', both), src(['validateProject'], 'validation.ts'), src('*', 'interfaces/analysis.ts'), src(['acquireInventory'], 'inventory.ts'), src(['createAnalysisSession'], 'session.ts'), src(['analyzeProject'], 'analyze-project.ts'), src(['resolveProject'], 'resolve-project.ts'), src('*', 'interfaces/session.ts'), src(['openRetainedSession'], 'retained-session.ts'),
    src('*', 'interfaces/measurements.ts'),
    src('*', 'interfaces/affected.ts'),
    src('*', 'interfaces/architect-view.ts'), sub(['ExportKind', 'ExportBehavior', 'TestTitleLimits'], 'typescript'),
    src(['renderArchitectView'], 'architect-render.ts'),
    src(['DependencyBoundaryFact', 'DependencyDiagramFacts', 'DependencyDiagramOutcome', 'TestFileReferences', 'TestReferenceFacts',
      'TestReferenceOutcome'], 'interfaces/dependency-diagram.ts'),
    src(['BehavioralDependencyMetrics'], 'interfaces/modularity.ts'),
    src(['analyzeDependencyDiagram'], 'dependency-analyzer.ts'), src('*', 'interfaces/dependency-analyzer.ts'),
    sub(['parseDescription'], 'descriptions'), sub(['readPurpose'], 'project')] },
  { path: 'subs/analysis/subs/descriptions/', name: 'descriptions', tags: browser, statements: [src(['parseDescription'], 'parse.ts', browser), src('*', 'interfaces/syntax.ts'), src(['readRootMarker'], 'parse.ts'), src(['linkDescriptions'], 'link.ts', browser), src('*', 'interfaces/linking.ts')] },
  { path: 'subs/analysis/subs/model/', name: 'model', tags: browser, statements: [
    src('*', 'interfaces/model.ts'), src(['resolveTagRegistry', 'createDefaultTagRegistry'], 'registry.ts', browser),
    src(['deriveSourceAreas', 'assignOriginalTags'], 'profiles.ts', browser), src(['originalKey'], 'identity.ts', browser),
    src(['buildModel'], 'model.ts', browser), src(['explainVisibility', 'explainImport'], 'decisions.ts', browser),
    src(['listAvailableOriginals'], 'availability.ts', browser),
    src(['listCompanionViolations'], 'companions.ts', browser),
  ] },
  { path: 'subs/analysis/subs/project/', name: 'project', tags: [], statements: [src(['readProject'], 'read-project.ts'), src('*', 'interfaces/project.ts'), src(['resolveProjectRoot'], 'resolve-root.ts'), src(['observeProject'], 'observer.ts'), src(['isRamifyGeneratedPath'], 'generated-path.ts'), src(['classifyProjectPath'], 'ownership.ts'), src(['readPurpose'], 'purpose.ts')] },
  { path: 'subs/analysis/subs/typescript/', name: 'typescript', tags: [], statements: [src(['createSourceAnalysis'], 'source-analysis.ts'), src('*', 'interfaces/source.ts'), src(['createAccessInterpreter'], 'access-interpreter.ts'),
      src(['describeFiles', 'assembleCatalog'], 'descriptions.ts'), src(['createRetainedSourceAnalysis'], 'retained-source-analysis.ts'),
      src(['describeSymbolDetails', 'DeclarationInputs'], 'symbol-details.ts'), src('*', 'interfaces/dependency-behavior.ts')] },
  { path: 'subs/cli/', name: 'cli', tags: ['dispatch'], statements: [src(['runCli'], 'run-cli.ts'), src('*', 'interfaces/cli.ts'),
    src(['capabilities'], 'command-support.ts')] },
  { path: 'subs/daemon/', name: 'daemon', tags: ['dispatch'], statements: [
    src(['createDaemonService', 'dispatchServiceRequest'], 'service.ts'),
    src(['createFilesystemWatcher'], 'filesystem-watcher.ts'),
    src(['createFilesystemApiViewPublisher'], 'api-view-publisher.ts'),
    src(['createSystemClock'], 'system-clock.ts'),
    src(['connectDaemon'], 'connect-daemon.ts'),
    src(['encodeMessage', 'decodeMessage'], 'codec.ts'),
    src(['selectEndpoint', 'readDaemonRecord'], 'discovery.ts'),
    src(['startDaemon'], 'start-daemon.ts'),
    src('*', 'interfaces/daemon.ts'),
    sub(['AnalysisDriver', ...contextNames, 'ContextManagerOptions', 'ContextManager', 'ApiViewQueryLimits', 'WatchBatch',
      'ApiViewRequest', 'ContextApiViewOutcome', 'ContextDependencyFactsOutcome', 'CaptureTimings', 'CaptureWork', 'AffectedRequest',
      'ContextAffectedOutcome', ...controlledNames], 'contexts'),
    src(['describeRuntime', 'runtimeIdentityPath', 'RuntimeIdentity'], 'discovery.ts'),
    src(['dependencyWait'], 'service.ts'),
  ] },
  { path: 'subs/daemon/subs/contexts/', name: 'contexts', tags: [], statements: [
    src(['createContextManager'], 'context-manager.ts'),
    src('*', 'interfaces/contexts.ts'),
    statement('expose-test', controlledNames, 'controlled-ports.ts'),
  ] },
  { path: 'subs/explorer/', name: 'explorer', tags: ['ui', 'browser', 'dispatch'], statements: [
    src(['ProjectExplorerPage'], 'ProjectExplorerPage.tsx', ['ui', 'browser', 'dispatch']),
    src(['createProjectExplorerBrowserApp'], 'browser-app.tsx', ['ui', 'browser', 'dispatch']),
    src(['ProjectExplorerPageProps'], 'ProjectExplorerPage.tsx'), src(['BrowserPage', 'ProjectExplorerBrowserApp'], 'browser-app.tsx'),
    src(['ExplorerClient', 'ProjectViewResult'], 'published-project-view.ts'),
  ] },
  { path: 'subs/integration-tests/', name: 'integration-tests', tags: ['testing', 'ui', 'dispatch'], statements: [] },
  { path: 'subs/presentation/', name: 'presentation', tags: uiBrowser, statements: presentationStatements },
  { path: 'subs/presentation/subs/layout/', name: 'layout', tags: browser, statements: layoutStatements },
  { path: 'subs/presentation/subs/project-view/', name: 'project-view', tags: uiBrowser, statements: [
    src('*', 'interfaces/project-view.ts'), src('*', 'interfaces/dependency-view.ts'),
    src(['ActiveDependencyEdge', 'ScopeNodeId'], 'dependency-graph.ts'),
    src(['ownSourceNodeId', 'ownSourceNodeModule'], 'dependency-graph.ts', uiBrowser),
    src(['defaultDependencySettings'], 'dependency-graph.ts', uiBrowser),
    src(['ModuleGraphRadial'], 'ModuleGraphRadial.tsx', uiBrowser),
    src(['ModuleGraphProps', 'GraphSelection'], 'moduleGraphShared.ts'),
    src(['ProjectExplorerView'], 'ProjectExplorerView.tsx', uiBrowser),
    src(['ProjectExplorerViewProps', 'ExplorerDiscussionProps', 'ExplorerDiscussionSelection'], 'ProjectExplorerView.tsx'),
    src(['ExportDetailState'], 'ExportList.tsx'),
    src(['ModuleTreeView'], 'ModuleTreeView.tsx', uiBrowser), src(['ModuleTreeViewProps'], 'ModuleTreeView.tsx'),
    src(['ModuleTreeCanvas'], 'ModuleTreeCanvas.tsx', uiBrowser),
    src(['ModuleTreeCanvasProps', 'ModuleTreeCanvasNode', 'ModuleTreeCanvasEmphasis'], 'ModuleTreeCanvas.tsx'),
    src(['indexModuleTree', 'collapsibleAtDepth', 'ancestorsOf'], 'module-tree.ts', uiBrowser),
    src(['ModuleTreeIndex'], 'module-tree.ts'),
  ] },
  { path: 'subs/service-api/', name: 'service-api', tags: ['dispatch'], statements: [
    src('*', 'interfaces/explorer-service.ts'), src('*', 'interfaces/explorer-dependencies.ts'),
    src(['createProjectExplorerModel', 'ExplorerProjectionResult'], 'project-view.ts'),
    src(['DependencyViews', 'DependencyViewsStatus', 'DependencyViewCounters'], 'dependency-view.ts'),
    src(['createExplorerRouter', 'ExplorerRouter', 'ExplorerProcedures', 'ExplorerRouterOptions'], 'router.ts'),
    src(['startExplorerWebProcess', 'ExplorerWebProcess', 'ExplorerWebProcessOptions'], 'web-process.ts'),
    src(['selectExplorerEndpoint', 'readExplorerProcessRecord', 'reusableExplorerProcess', 'probeExplorerReadiness',
      'explorerProjectUrl', 'explorerProjectKey', 'ExplorerEndpointSelection'], 'web-discovery.ts'),
    src(['ensureExplorerWebProcess', 'ExplorerLaunchOptions', 'ExplorerProcessLaunch'], 'web-launcher.ts'),
    src(['createProjectBinding', 'ProjectBinding', 'BindingState', 'ProjectBindingOptions', 'ProjectBindingConnector',
      'ProjectBindingLogEntry'], 'project-binding.ts'),
  ] },
];
const workspace = 'subs/workspace/';
const catalog = `${workspace}subs/catalog/`;
const reviews = `${workspace}subs/reviews/`;
const core = `${reviews}subs/core/`;
const reference: readonly Fixture[] = [
  { path: '', name: 'collection-review', tags: ['dispatch'], statements: [
    src(['InvocationContext', 'ProtocolFacilities', 'McpToolContribution', 'ToolInvocation', 'ToolInputSchema', 'ToolResult'],
      'interfaces/protocol.ts', null, descendants), // R1
    statement('expose-test', ['createTestSystem', 'TestSystem', 'McpSession'], 'setup.ts', descendants), // R2
    src(['AppRouter', 'assembleRouter', 'ProtocolRouter'], 'interfaces/protocol.ts', null, descendants), // R3
    sub(['CatalogProcedures', 'ReviewsProcedures', 'RecordId', 'recordIdSchema', 'revisionScopeSchema', 'ReviewStatus',
      'reviewStatusSchema', 'Finding', 'findingSchema', 'Observation', 'observationSchema'], 'workspace', descendants), // R4
    // The reference harness's work directory inside the example, declared external (iteration 8A).
    tree('external', '.reference-work'),
  ] },
  { path: 'subs/integration-tests/', name: 'integration-tests', tags: ['testing', 'dispatch'], statements: [] },
  { path: workspace, name: 'workspace', tags: ['ui', 'browser', 'dispatch'], statements: [
    sub('*', 'contracts', both), // W1
    sub(['createCatalogRouter', 'CatalogProcedures', 'createCatalogTools', 'inspectRecord'], 'catalog'), // W2
    sub(['createReviewsRouter', 'ReviewsProcedures', 'createReviewsTools', 'InspectionPort'], 'reviews'), // W4 precedes W3 in the authored file.
    sub(['makeCatalogFixture', 'CatalogFixtureRecord'], 'catalog', descendants), // W3
    sub('*', 'shared-ui', descendants), // W5
  ] },
  { path: catalog, name: 'catalog', tags: ['dispatch'], statements: [
    src(['createCatalogRouter', 'CatalogProcedures'], 'router.ts'), src(['createCatalogTools'], 'mcp.ts'), // A1-A2
    sub([['inspect', 'inspectRecord']], 'core'), sub(['makeCatalogFixture', 'CatalogFixtureRecord'], 'core'), // A3-A4
    sub(['CatalogSummary'], 'core', both), sub(['CatalogCard', 'CatalogCardProps'], 'ui'), // A5-A6
  ] },
  { path: `${catalog}subs/core/`, name: 'core', tags: [], statements: [
    src(['getRecord', 'inspect', 'CatalogSummary'], 'catalog.ts'), statement('expose-test', ['makeCatalogFixture', 'CatalogFixtureRecord'], 'fixture.ts'), // K1-K2
  ] },
  { path: `${catalog}subs/ui/`, name: 'ui', tags: uiBrowser, statements: [src(['CatalogCard', 'CatalogCardProps'], 'catalog-card.tsx', uiBrowser)] }, // KU1
  { path: `${workspace}subs/contracts/`, name: 'contracts', tags: [], statements: [src('*', 'interfaces/vocabulary.ts', browser)] }, // C1
  { path: reviews, name: 'reviews', tags: ['dispatch'], statements: [
    src(['createReviewsRouter', 'ReviewsProcedures'], 'router.ts'), src(['createReviewsTools'], 'mcp.ts'), // RV1-RV2
    sub(['InspectionPort'], 'core'), sub(['validateRevisionChain'], 'validation', descendants), sub(['ReviewPanel', 'ReviewPanelProps'], 'ui'), // RV3-RV5
  ] },
  { path: core, name: 'core', tags: [], statements: [
    src(['InspectionPort'], 'interfaces/port.ts', null, both), // RC1
    src(['createReviewRuntime', 'ReviewRuntime', 'ReviewOutcome'], 'runtime.ts'), // RC2
    sub(['runInspectionTask', 'summarizeTaskResult', 'InspectionTaskInput', 'InspectionTaskResult', 'TaskSummary'], 'tasks', descendants), // RC3
  ] },
  { path: `${core}subs/controller/`, name: 'controller', tags: [], statements: [src(['tick'], 'controller.ts')] }, // CT1
  { path: `${core}subs/tasks/`, name: 'tasks', tags: [], statements: [src(['runInspectionTask', 'InspectionTaskInput', 'InspectionTaskResult'], 'inspection-task.ts'),
    src(['summarizeTaskResult', 'TaskSummary'], 'result.ts')] }, // TK1-TK2
  { path: `${reviews}subs/ui/`, name: 'ui', tags: ['ui', 'browser', 'dispatch'], statements: [src(['ReviewPanel', 'ReviewPanelProps'], 'review-panel.tsx', ['ui', 'dispatch', 'browser'])] }, // RU1
  { path: `${reviews}subs/ui/subs/pure-ui/`, name: 'pure-ui', tags: uiBrowser, statements: [src(['ReviewResult', 'ReviewResultProps'], 'review-result.tsx', uiBrowser)] }, // PU1
  { path: `${reviews}subs/validation/`, name: 'validation', tags: [], statements: [src(['validateRevisionChain'], 'validate.ts')] }, // VL1
  { path: `${workspace}subs/shared-ui/`, name: 'shared-ui', tags: uiBrowser, statements: [src(['StatusBadge', 'StatusBadgeProps'], 'status-badge.tsx', uiBrowser)] }, // SU1
];

describe('all current project descriptions as exact-text parser fixtures', () => {
  for (const [prefix, fixtures] of [['', toolkit], ['examples/collection-review/', reference]] as const) {
    for (const fixture of fixtures) {
      const file = `${prefix}${fixture.path}module.ramify`;
      it(`parses ${file} to the reviewed statements`, async () => {
        const text = await readFile(new URL(file, root), 'utf8');
        const result = parseDescription(file, text);
        expect(result.status, JSON.stringify(result)).toBe('valid');
        if (result.status !== 'valid') throw new Error('Invalid authored description');
        const document = result.document;
        expect([document.file, document.version, document.module.name, document.module.tags]).toEqual([file, 1, fixture.name, fixture.tags]);
        // Exactly the two project roots carry the marker, and the header span begins at it.
        const { root: marker, span } = document.module;
        expect(marker && text.slice(marker.start, marker.end)).toBe(fixture.path === '' ? 'root' : null);
        expect(text.slice(span.start, span.end)).toMatch(fixture.path === '' ? /^root module / : /^module /);
        // A nested-tree statement compares by its kind and decoded directory.
        expect(document.statements.map((item) => 'directory' in item ? { kind: item.kind, directory: item.directory.value } : {
          kind: item.kind, names: item.selection.kind === 'wildcard' ? '*' : item.selection.names.map(({ name, alias }) => [name, alias]),
          from: item.from.value, tags: item.tags?.values ?? null, destinations: item.destinations,
        })).toEqual(fixture.statements);
        expect(document.statements.map(({ index }) => index)).toEqual(fixture.statements.map((_, index) => index));
        for (const token of document.tokens) expect(text.slice(token.span.start, token.span.end)).toBe(token.raw);
      });
    }
  }

  it('covers exactly fifteen toolkit and fifteen reference descriptions without omitting an owner', async () => {
    // This fixture inventory walk is not application acquisition or an ownership implementation.
    async function nestedDescriptions(directory: URL): Promise<string[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      const nested = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
        const path = `${entry.name}/`;
        return (await nestedDescriptions(new URL(path, directory))).map((file) => `${path}${file}`);
      }));
      return [...entries.filter((entry) => entry.isFile() && entry.name === 'module.ramify').map((entry) => entry.name), ...nested.flat()];
    }
    expect(toolkit).toHaveLength(15);
    expect(reference).toHaveLength(15);
    for (const [prefix, fixtures] of [['', toolkit], ['examples/collection-review/', reference]] as const) {
      const actual = ['module.ramify', ...(await nestedDescriptions(new URL(`${prefix}subs/`, root))).map((path) => `subs/${path}`)];
      expect(actual.sort()).toEqual(fixtures.map(({ path }) => `${path}module.ramify`).sort());
    }
  });
});
