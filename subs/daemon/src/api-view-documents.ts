import type {
  ApiViewAreaProjection, ApiViewEntry, ApiViewFile, ApiViewProjection,
} from '../../analysis/src/interfaces/session.js';
import type { MeasurementViewSize } from '../../analysis/src/interfaces/measurements.js';
import { setImmediate } from 'node:timers/promises';
import type { RenderedApiViewArea as RenderedArea, RenderedApiViewDocument as RenderedDocument } from './interfaces/daemon.js';
export type { RenderedApiViewArea as RenderedArea, RenderedApiViewDocument as RenderedDocument } from './interfaces/daemon.js';

/**
 * Pure Markdown/`_meta.json` rendering for one materialized API-view
 * projection. Never touches the filesystem, a compiler or the network; the
 * publisher (`api-view-publisher.ts`) calls this module to obtain the exact
 * bytes it stages. Byte-for-byte determinism is required: the same
 * projection (module order aside — callers already receive a byte-ordered
 * `ApiViewProjection`) always renders identical output, with no absolute
 * path, timestamp, PID or request ID anywhere in the result.
 *
 * Document rules (docs/plans/iteration-2a-materialized-api-view/scope.md
 * "Documents"): a described entry has exactly a heading, a `ts` code fence
 * with the signature, and optionally one prose paragraph. Marker order, when
 * several apply, is `[type-only]` then `[truncated]` or `[details-unavailable]`
 * (an entry never carries both of the latter two: they come from the single
 * `SymbolDetail.state` discriminant). An unavailable entry has no fence.
 * `_meta.json` is one line, `schema`/`module`/`area`/`revision` always
 * present, then `coverage`/`detailsUnavailable`/`truncated` only when nonzero,
 * in that order.
 */

/** Bounds and interruption controls for an in-memory whole-project render. */
export interface BoundedApiViewRenderOptions {
  readonly maxAreaBytes: number;
  readonly maxInvocationBytes: number;
  readonly signal?: AbortSignal;
  /** Keep buffers only for areas selected for publication. */
  readonly keep?: (module: string, area: 'ordinary' | 'tests') => boolean;
  /** A revision guard supplied by the caller at asynchronous checkpoints. */
  readonly current?: () => boolean;
}
export type BoundedApiViewRenderOutcome =
  | { readonly status: 'rendered'; readonly views: Readonly<Record<string, MeasurementViewSize>>;
      readonly areas: readonly RenderedArea[] }
  | { readonly status: 'cancelled' }
  | { readonly status: 'superseded' }
  | { readonly status: 'unavailable'; readonly reason: 'resource-unavailable' | 'analysis-failed'; readonly message: string };

/** A code span delimiter longer than the longest backtick run inside
 * `content`, padded with a single space on each side when `content` starts or
 * ends with a backtick (CommonMark's own disambiguation rule), so the
 * rendered name is never misparsed and remains searchable by its literal
 * text. */
export function renderCodeSpan(content: string): string {
  let longest = 0, run = 0;
  for (const char of content) {
    if (char === '`') { run++; longest = Math.max(longest, run); } else run = 0;
  }
  const delimiter = '`'.repeat(longest + 1);
  const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : '';
  return `${delimiter}${pad}${content}${pad}${delimiter}`;
}

/** A fenced code block whose fence is longer than any backtick run at the
 * start of a line inside `content` (never confusable with a closing fence),
 * at least three backticks. */
export function renderCodeFence(content: string, info: string): string {
  let longestLeadingRun = 0;
  for (const line of content.split('\n')) {
    const match = /^`+/.exec(line);
    if (match) longestLeadingRun = Math.max(longestLeadingRun, match[0].length);
  }
  const fence = '`'.repeat(Math.max(longestLeadingRun + 1, 3));
  return `${fence}${info}\n${content}\n${fence}`;
}

/** One entry's rendered Markdown block: heading, optional fence, optional
 * paragraph — no trailing newline (callers join blocks with one blank line
 * between them). */
export function renderEntry(entry: ApiViewEntry): string {
  let heading = `## ${renderCodeSpan(entry.name)}`;
  if (entry.form === 'type-only') heading += ' [type-only]';
  const { detail } = entry;
  if (detail.state === 'truncated') heading += ' [truncated]';
  if (detail.state === 'unavailable') return `${heading} [details-unavailable]`;
  const fence = renderCodeFence(detail.signature, 'ts');
  return detail.documentation === undefined ? `${heading}\n\n${fence}` : `${heading}\n\n${fence}\n\n${detail.documentation}`;
}

/** The rendered Markdown bytes for one available original's defining file:
 * entries separated by exactly one blank line, with one final newline and no
 * other trailing whitespace. */
export function renderDocument(file: ApiViewFile): Buffer {
  const body = file.entries.map(renderEntry).join('\n\n');
  return Buffer.from(`${body}\n`, 'utf8');
}

/** `_meta.json`: one line plus a final newline, with only the exceptional
 * counts that are nonzero. */
export function renderMeta(module: string, revision: string, area: ApiViewAreaProjection): Buffer {
  const record: Record<string, unknown> = { schema: 'ramify.api-view/1', module, area: area.area, revision };
  if (area.coverage !== 0) record.coverage = area.coverage;
  if (area.detailsUnavailable !== 0) record.detailsUnavailable = area.detailsUnavailable;
  if (area.truncated !== 0) record.truncated = area.truncated;
  return Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
}

function documentPath(file: ApiViewFile): string {
  return `${file.category}/${file.definingFile}.md`;
}

/** Every rendered document plus `_meta.json` (written last) for one source
 * area. Files stay in the projection's own byte order (category, then
 * defining file); `_meta.json` is appended after them so a caller that stages
 * files in array order writes it last, matching the publication contract. */
function renderArea(module: string, revision: string, area: ApiViewAreaProjection): RenderedArea {
  const documents = area.files.map(file => ({ relativePath: documentPath(file), bytes: renderDocument(file) }));
  const meta = { relativePath: '_meta.json', bytes: renderMeta(module, revision, area) };
  const entries = area.files.reduce((total, file) => total + file.entries.length, 0);
  return { module, area: area.area, root: area.root, files: [...documents, meta], entries };
}

/** Every requested module's ordinary area when present, plus its testing area
 * when present, rendered as independent `RenderedArea` targets in the
 * projection's own module order (ordinary before testing within one module).
 * A module with neither area present (no `src/`, so no `src/tests/` either)
 * contributes no targets: it is silently omitted from publication rather than
 * rendered as an empty directory, since materialization never creates `src/`
 * or `src/tests/`. */
export function renderApiView(projection: ApiViewProjection, revision: string): readonly RenderedArea[] {
  const targets: RenderedArea[] = [];
  for (const module of projection.modules) {
    if (module.ordinary) targets.push(renderArea(module.module, revision, module.ordinary));
    if (module.tests) targets.push(renderArea(module.module, revision, module.tests));
  }
  return targets;
}

/**
 * Render every API area through the publication encoder while enforcing exact
 * encoded-byte ceilings before accepting a chunk. Measurement-only area
 * buffers are released after their counts have been recorded; selected areas
 * retain those same buffers for publication.
 */
export async function renderApiViewBounded(projection: ApiViewProjection, revision: string,
  options: BoundedApiViewRenderOptions): Promise<BoundedApiViewRenderOutcome> {
  const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
  if (!positive(options.maxAreaBytes) || !positive(options.maxInvocationBytes)) {
    return { status: 'unavailable', reason: 'analysis-failed', message: 'API view render limits must be positive safe integers' };
  }
  const interrupted = (): 'cancelled' | 'superseded' | null => options.signal?.aborted ? 'cancelled'
    : options.current && !options.current() ? 'superseded' : null;
  const views: Record<string, MeasurementViewSize> = {};
  const retained: RenderedArea[] = [];
  let total = 0, sinceYieldBytes = 0, sinceYieldRecords = 0;
  const checkpoint = async (): Promise<'cancelled' | 'superseded' | null> => {
    const stopped = interrupted();
    if (stopped) return stopped;
    if (sinceYieldRecords < 256 && sinceYieldBytes < 1024 * 1024) return null;
    sinceYieldBytes = 0; sinceYieldRecords = 0;
    await setImmediate();
    return interrupted();
  };
  try {
    for (const module of projection.modules) {
      const initial = interrupted();
      if (initial) return { status: initial };
      const measured: { ordinaryBytes: number; testsBytes: number } = { ordinaryBytes: 0, testsBytes: 0 };
      for (const area of [module.ordinary, module.tests]) {
        if (!area) continue;
        const files: RenderedDocument[] = [];
        let areaBytes = 0, entries = 0;
        const accept = async (bytes: Buffer, records: number): Promise<BoundedApiViewRenderOutcome | null> => {
          if (areaBytes + bytes.byteLength > options.maxAreaBytes) {
            return { status: 'unavailable', reason: 'resource-unavailable',
              message: `Rendered API area ${module.module} ${area.area} exceeds ${options.maxAreaBytes} bytes` };
          }
          if (total + bytes.byteLength > options.maxInvocationBytes) {
            return { status: 'unavailable', reason: 'resource-unavailable',
              message: `Rendered API views exceed ${options.maxInvocationBytes} bytes` };
          }
          areaBytes += bytes.byteLength; total += bytes.byteLength;
          sinceYieldBytes += bytes.byteLength; sinceYieldRecords += Math.max(records, 1);
          const stopped = await checkpoint();
          return stopped ? { status: stopped } : null;
        };
        for (const file of area.files) {
          const chunks: Buffer[] = [];
          const blocks = file.entries.length ? file.entries.map((entry, index) =>
            `${index ? '\n\n' : ''}${renderEntry(entry)}${index === file.entries.length - 1 ? '\n' : ''}`) : ['\n'];
          for (const [index, block] of blocks.entries()) {
            const encoded = Buffer.from(block, 'utf8');
            for (let offset = 0; offset < encoded.byteLength; offset += 1024 * 1024) {
              const chunk = encoded.subarray(offset, Math.min(offset + 1024 * 1024, encoded.byteLength));
              const stopped = await accept(chunk, offset === 0 && file.entries.length ? 1 : 0);
              if (stopped) return stopped;
              if (options.keep?.(module.module, area.area)) chunks.push(chunk);
            }
          }
          if (options.keep?.(module.module, area.area)) {
            files.push({ relativePath: documentPath(file), bytes: Buffer.concat(chunks) });
          }
          entries += file.entries.length;
        }
        const meta = renderMeta(module.module, revision, area);
        const stopped = await accept(meta, 1);
        if (stopped) return stopped;
        if (options.keep?.(module.module, area.area)) files.push({ relativePath: '_meta.json', bytes: meta });
        measured[area.area === 'ordinary' ? 'ordinaryBytes' : 'testsBytes'] = areaBytes;
        if (options.keep?.(module.module, area.area)) {
          retained.push({ module: module.module, area: area.area, root: area.root, files, entries });
        }
      }
      views[module.module] = measured;
    }
    const final = interrupted();
    return final ? { status: final } : { status: 'rendered', views, areas: retained };
  } catch (error) {
    return { status: 'unavailable', reason: 'analysis-failed',
      message: `Rendering API views failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
