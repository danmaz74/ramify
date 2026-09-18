import { SymbolFlags, type Project } from 'typescript/unstable/sync';
import { SyntaxKind } from 'typescript/unstable/ast';
import { BehaviorShapes } from './behavior-shapes.js';
import type { ExportKind, ExportShape, ExportShapeRequest } from './interfaces/source.js';
import { declarationContext, resolveDeclaration, validRequest, type DeclarationContext,
  type DeclarationInputs } from './symbol-details.js';
import { SourceFailure, freezeData } from './wire.js';

let runs = 0;
/** `describeExportShapes` calls in this process, the witness that only an explicit request classifies exports. */
export function shapeRuns(): number { return runs; }

/** Declarations that name their own kind; any other declaration is a `value`. */
const declarationKinds: ReadonlyMap<SyntaxKind, ExportKind> = new Map([
  [SyntaxKind.ClassDeclaration, 'class'],
  [SyntaxKind.FunctionDeclaration, 'function'],
  [SyntaxKind.InterfaceDeclaration, 'interface'],
  [SyntaxKind.TypeAliasDeclaration, 'type'],
  [SyntaxKind.JSDocTypedefTag, 'type'],
  [SyntaxKind.JSDocCallbackTag, 'type'],
  [SyntaxKind.EnumDeclaration, 'enum'],
  [SyntaxKind.ModuleDeclaration, 'namespace'],
]);

function shapeOf(project: Project, context: DeclarationContext, shapes: BehaviorShapes, request: ExportShapeRequest): ExportShape {
  const { original, exportName } = request;
  if (original.kind === 'resource') return { original, exportName, kind: 'resource', behavior: null };
  const resolved = resolveDeclaration(project, context, request);
  if (resolved.status === 'unavailable') return { original, exportName, kind: 'value', behavior: 'unknown' };
  const { target, primary } = resolved;
  const kind = declarationKinds.get(primary.kind) ?? 'value';
  // The catalog's `hasValue` reads the same flag of the same symbol.
  if (!(target.flags & SymbolFlags.Value)) return { original, exportName, kind, behavior: null };
  const type = project.checker.getTypeOfSymbol(target);
  const shape = type ? shapes.shape(type) : 'unknown';
  return { original, exportName, kind, behavior: shape === 'data' ? null : shape };
}

/**
 * Classify each requested defining-file export by the kind of its primary
 * declaration and the behavior shape of its value's type, with the rule the
 * consumer dependency classifier uses. Pure and synchronous over an
 * already-open `Project`; one result per request, in request order. A resource
 * original is a `resource` with no behavior and no compiler query; an export
 * the compiler cannot resolve to the requested original is a `value` of
 * `unknown` behavior. A structurally invalid request or cancellation throws
 * `SourceFailure` with no partial result.
 */
export function describeExportShapes(project: Project, inputs: DeclarationInputs, requests: readonly ExportShapeRequest[],
  signal?: AbortSignal): readonly ExportShape[] {
  runs++;
  if (signal?.aborted) throw new SourceFailure('cancelled', 'Export shapes were cancelled before execution');
  for (const request of requests) {
    if (!validRequest(request)) throw new SourceFailure('protocol-error', 'Invalid export shape request');
  }
  const context = declarationContext(inputs);
  const shapes = new BehaviorShapes(project);
  const output: ExportShape[] = [];
  for (const request of requests) {
    if (output.length % 25 === 24 && signal?.aborted) throw new SourceFailure('cancelled', 'Export shapes were cancelled');
    output.push(shapeOf(project, context, shapes, request));
  }
  if (signal?.aborted) throw new SourceFailure('cancelled', 'Export shapes were cancelled');
  return freezeData(output);
}
