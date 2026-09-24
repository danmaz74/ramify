import type { ModuleTree } from '../interfaces/protocol/evidence.js';
import type {
  ExecutionLineSummary, ExecutionModuleMap, ExecutionModuleRelation, ExecutionNode, ExecutionSourceRef,
} from '../interfaces/protocol/execution-map.js';
import { invocationSchema, lineEventSummarySchema, runLayout, type LineEventSummary } from '../run/records.js';
import { readRunFile, type RunView } from './inputs.js';

const methodLimit = 'Two worktree snapshots can miss edits reverted before the second snapshot.' as const;
type Totals = ExecutionLineSummary['totals'];
type Bucket = { totals: Totals; binary: ExecutionLineSummary['binary'] };
const bucket = (): Bucket => ({ totals: { added: 0, deleted: 0, textPaths: 0, invocationIds: [] },
  binary: { paths: 0, invocationIds: [] } });
const addId = (ids: string[], id: string) => { if (!ids.includes(id)) ids.push(id); };

function addPath(target: Bucket, path: LineEventSummary['paths'][number], invocation: string): void {
  if (path.binary) {
    target.binary.paths++;
    addId(target.binary.invocationIds, invocation);
  } else {
    target.totals.added += path.added;
    target.totals.deleted += path.deleted;
    target.totals.textPaths++;
    addId(target.totals.invocationIds, invocation);
  }
}

/** All writer records, including failed and repair invocations, are expected to have a settled snapshot. */
export async function capturedLinesOf(view: RunView): Promise<{
  byOwner: ReadonlyMap<string, Bucket>; unmapped: Bucket; all: Bucket;
  coverage: ExecutionLineSummary['coverage']; gaps: string[];
}> {
  const writers = new Set<string>();
  const recorded = new Set<string>();
  for (const line of view.entries) for (const record of line.transaction.records) {
    if ((record.body as { schema?: unknown } | null)?.schema !== 'ramify-agent.invocation/1') continue;
    const parsed = invocationSchema.safeParse(record.body);
    if (parsed.success) {
      recorded.add(parsed.data.id);
      if (parsed.data.writer) writers.add(parsed.data.id);
    }
  }
  const ended = new Set(view.events.filter(event => event.type === 'invocation-ended').map(event => event.data.invocation));
  const terminal = view.events.some(event => ['job-completed', 'job-failed', 'job-interrupted', 'job-stopped'].includes(event.type));
  const byOwner = new Map<string, Bucket>();
  const unmapped = bucket(), all = bucket();
  const gaps: string[] = [];
  for (const event of view.events) if (event.type === 'invocation-started' && !recorded.has(event.data.invocation)) {
    gaps.push(`Invocation ${event.data.invocation} has no retained invocation record; writer status is unknown.`);
  }
  let pending = false;
  for (const invocation of writers) {
    if (!ended.has(invocation)) {
      if (terminal) gaps.push(`Writer ${invocation} ended without a settled invocation event; its line coverage is unavailable.`);
      else { pending = true; gaps.push(`Writer ${invocation} has not settled; its line snapshot is pending.`); }
      continue;
    }
    let raw: string | null;
    try { raw = await readRunFile(view, runLayout.lineEvents(invocation)); }
    catch (error) { gaps.push(`Writer ${invocation} lines.json cannot be read: ${error instanceof Error ? error.message : String(error)}`); continue; }
    if (raw === null) { gaps.push(`Settled writer ${invocation} has no lines.json record.`); continue; }
    let value: unknown;
    try { value = JSON.parse(raw) as unknown; }
    catch { gaps.push(`Writer ${invocation} has unreadable lines.json JSON.`); continue; }
    const parsed = lineEventSummarySchema.safeParse(value);
    if (!parsed.success || parsed.data.invocation !== invocation) {
      gaps.push(`Writer ${invocation} has an invalid or mismatched lines.json record.`); continue;
    }
    const summary = parsed.data;
    if (summary.coverage === 'partial') gaps.push(...(summary.gaps.length ? summary.gaps.map(gap => `Writer ${invocation}: ${gap}`) :
      [`Writer ${invocation} reports partial line coverage.`]));
    for (const path of summary.paths) {
      addPath(all, path, invocation);
      if (path.owner === null) addPath(unmapped, path, invocation);
      else {
        const target = byOwner.get(path.owner) ?? bucket();
        addPath(target, path, invocation);
        byOwner.set(path.owner, target);
      }
    }
  }
  return { byOwner, unmapped, all, coverage: pending ? 'pending' : gaps.length ? 'partial' : 'complete', gaps };
}

const lineSummary = (value: Bucket, coverage: ExecutionLineSummary['coverage'], gaps: string[]): ExecutionLineSummary =>
  ({ totals: value.totals, coverage, gaps, binary: value.binary, methodLimit });

/** Match a current tree entry by its directory. This is an association, not proof of a write. */
function moduleAtPath(tree: Extract<ModuleTree, { status: 'available' }>, path: string): string | null {
  return [...tree.modules].filter(entry => entry.dir !== '' && (path === entry.dir || path.startsWith(`${entry.dir}/`)))
    .sort((a, b) => b.dir.length - a.dir.length)[0]?.module ?? null;
}

/** The current hierarchy and direct run relations; parent counts never turn on direct participation. */
export function executionModuleMapOf(
  view: RunView, tree: ModuleTree, nodes: readonly ExecutionNode[], captured: Awaited<ReturnType<typeof capturedLinesOf>>,
): ExecutionModuleMap {
  const direct = new Map<string, ExecutionModuleMap['modules'][number]['direct']>();
  const worked = new Set<string>();
  const add = (module: string, element: string, relation: ExecutionModuleRelation) => {
    const list = direct.get(module) ?? [];
    if (!list.some(entry => entry.element === element && entry.role === relation.role))
      list.push({ element, role: relation.role, source: relation.source });
    direct.set(module, list);
  };
  const startedWork = new Set(view.events.flatMap(event => event.type === 'work-item-started' ? [event.data.workItem]
    : event.type === 'invocation-started' && event.data.work.workItem !== undefined ? [event.data.work.workItem] : []));
  const startedIterations = new Set(view.events.flatMap(event => event.type === 'invocation-started' && event.data.work.iteration !== undefined
    ? [event.data.work.iteration] : []));
  for (const node of nodes) {
    for (const relation of node.modules) {
      add(relation.module, node.key, relation);
      if (node.kind === 'work-item' && startedWork.has(node.key.slice('work-item:'.length)) ||
          node.kind === 'iteration' && startedIterations.has(node.key.slice('iteration:'.length)) ||
          node.kind === 'session' && (node.role === 'local-architect' || node.role === 'engineer' || node.role === 'contract-engineer')) {
        worked.add(relation.module);
      }
    }
  }
  if (tree.status === 'available') for (const assignment of view.assignments) {
    const source: ExecutionSourceRef = { kind: 'iteration-assignment', id: assignment.body.id,
      sequence: assignment.sequence, revision: assignment.body.outline.revision };
    for (const extra of assignment.body.scope.extra) {
      const module = moduleAtPath(tree, extra.path);
      if (module !== null) add(module, `iteration:${assignment.body.id}`, { module, role: 'authorized-scope', source });
    }
  }
  for (const [owner, value] of captured.byOwner) {
    if (value.totals.textPaths === 0 && value.binary.paths === 0) continue;
    worked.add(owner);
    const source: ExecutionSourceRef = { kind: 'line-event', id: value.totals.invocationIds[0] ?? value.binary.invocationIds[0]!, sequence: null, revision: null };
    for (const id of [...value.totals.invocationIds, ...value.binary.invocationIds]) {
      const writer = view.events.find(event => event.type === 'invocation-started' && event.data.invocation === id);
      const element = writer?.type === 'invocation-started' && writer.data.work.iteration !== undefined ? `iteration:${writer.data.work.iteration}` :
        writer?.type === 'invocation-started' && writer.data.work.workItem !== undefined ? `work-item:${writer.data.work.workItem}` : null;
      if (element !== null && nodes.some(node => node.key === element)) add(owner, element, { module: owner, role: 'observed-write', source: { ...source, id } });
    }
  }
  const proposed = nodes.flatMap(node => node.kind === 'capability' && node.proposed !== null && node.owner !== null &&
    (tree.status !== 'available' || !tree.modules.some(entry => entry.module === node.owner)) ? [{ module: node.owner,
    parent: node.proposed.parent, directory: node.proposed.directory, element: node.key }] : []);
  const unplaced = nodes.flatMap(node => node.kind === 'work-item' && node.module === null ?
    [{ element: node.key, reason: 'The work item has no retained module placement.' }] : []);
  const modules = tree.status === 'available' ? tree.modules.map(entry => ({
    module: entry.module, parent: entry.parent, dir: entry.dir,
    direct: direct.get(entry.module) ?? [], workedIn: worked.has(entry.module),
    involvedDescendants: tree.modules.filter(child => child.module !== entry.module && worked.has(child.module) &&
      child.module.startsWith(`${entry.module}/`)).length,
    lines: lineSummary(captured.byOwner.get(entry.module) ?? bucket(), captured.coverage, captured.gaps),
  })) : [];
  const current = new Set(tree.status === 'available' ? tree.modules.map(entry => entry.module) : []);
  const outsideTree = tree.status === 'available' ? [...new Set([...direct.keys(), ...captured.byOwner.keys()])]
    .filter(module => !current.has(module)).sort().map(module => ({ module, direct: direct.get(module) ?? [],
      workedIn: worked.has(module), lines: lineSummary(captured.byOwner.get(module) ?? bucket(), captured.coverage, captured.gaps) })) : [];
  return { tree, modules, outsideTree, proposed, unplaced,
    unmapped: lineSummary(captured.unmapped, captured.coverage, captured.gaps),
    lines: lineSummary(captured.all, captured.coverage, captured.gaps) };
}
