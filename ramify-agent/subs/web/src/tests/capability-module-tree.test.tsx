/// <reference types="node" />
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { ModuleTreeCanvas, type ModuleTreeCanvasNode } from 'ramify.ts/module-tree';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  moduleCapabilityComparisonResponseSchema, type ModuleCapabilities, type ModuleCapabilityComparisonResponse,
} from '../../../harness/src/interfaces/protocol/runs.js';
import {
  CapabilityModuleTree, comparisonNodes, nodeHeight, rowHeight, type ModuleCapabilitySelection,
} from '../capability-module-tree.js';

/*
 * Progress → By module on the packaged Ramify canvas, rendered with the real
 * `ramify.ts/module-tree` and React Flow under the web module's React. jsdom
 * has no layout, so only ResizeObserver is stubbed; node sizes and positions
 * are the ones the canvas lays out from the supplied dimensions.
 */

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const at = { revision: 'rev/1:tree:4', input: 'input/1:abc123' };

const tree = {
  status: 'available' as const, ...at,
  modules: [
    { module: 'shop', dir: '', parent: null },
    { module: 'shop/notes', dir: 'subs/notes', parent: 'shop' },
    { module: 'shop/search', dir: 'subs/search', parent: 'shop' },
    { module: 'shop/panel', dir: 'subs/panel', parent: 'shop' },
    { module: 'shop/empty', dir: 'subs/empty', parent: 'shop' },
  ],
};

const noteDrafts = { parent: 'shop/notes', purpose: 'Keeps a reviewer\'s unsent drafts.', tags: ['ui'] };

/** Matching, initial-only, changed placement, implemented-only, all three roles, a proposed module and rowless branches. */
const comparison: ModuleCapabilityComparisonResponse = moduleCapabilityComparisonResponseSchema.parse({
  identityPolicy: 'exact-capability-slug/1',
  runVersion: 46,
  initialView: { status: 'materialized', revision: 'rev/1:view:2', input: 'input/1:def456', coverageLimits: [] },
  tree,
  modules: [
    { module: 'shop', placement: 'declared', proposedAtStart: null, capabilities: [] },
    {
      module: 'shop/notes', placement: 'declared', proposedAtStart: null, capabilities: [
        { capability: 'review-note', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: { reason: 'wi-001 passed its work-item gate ga-0003', evidence: ['ga-0003'] } },
        { capability: 'note-search', initial: [{ role: 'suggested-owner', hypothesis: 'note-search' }], implementedHere: null },
        { capability: 'moved-thing', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: null },
      ],
    },
    {
      module: 'shop/notes/drafts', placement: 'proposed', proposedAtStart: noteDrafts, capabilities: [
        { capability: 'note-drafts', initial: [{ role: 'entry-owner', hypothesis: null }], implementedHere: null },
      ],
    },
    {
      module: 'shop/search', placement: 'declared', proposedAtStart: null, capabilities: [
        { capability: 'note-search', initial: [{ role: 'involved', hypothesis: 'note-search' }], implementedHere: null },
        { capability: 'shared-index', initial: [{ role: 'suggested-owner', hypothesis: 'h-index' }, { role: 'involved', hypothesis: 'h-index' }], implementedHere: null },
      ],
    },
    {
      module: 'shop/panel', placement: 'declared', proposedAtStart: null, capabilities: [
        { capability: 'moved-thing', initial: [], implementedHere: { reason: 'wi-003 passed its work-item gate ga-0009', evidence: ['ga-0009', 'ga-0008'] } },
        { capability: 'format-date', initial: [], implementedHere: { reason: 'Verified reuse (no work item of its own): consumer wi-001 passed its gate', evidence: ['ga-0003'] } },
      ],
    },
    { module: 'shop/empty', placement: 'declared', proposedAtStart: null, capabilities: [] },
  ],
  coverage: { state: 'complete', capabilities: 6, implemented: 3 },
});

function Harness({ value, onSelect }: { readonly value: ModuleCapabilityComparisonResponse; readonly onSelect?: (selection: ModuleCapabilitySelection | null) => void }) {
  const [selection, setSelection] = useState<ModuleCapabilitySelection | null>(null);
  return (
    <div style={{ width: 1200, height: 800 }}>
      <CapabilityModuleTree comparison={value} selection={selection} onSelect={next => { onSelect?.(next); setSelection(next); }} />
    </div>
  );
}

const shell = (module: string) => document.querySelector<HTMLElement>(`[data-module-id="${module}"]`);
function position(module: string): { x: number; y: number } {
  const wrapper = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${module}"]`);
  const match = wrapper?.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  if (!match) throw new Error(`No position for ${module}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}
const rowsOf = (module: string) => [...shell(module)!.querySelectorAll<HTMLButtonElement>('button.capability-row')];

function HookRow({ label }: { readonly label: string }) {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(value => value + 1)}>{label} {count}</button>;
}

test('CM10: a hook-using row renders in the packaged canvas under the web module\'s single React', async () => {
  const errors: unknown[][] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args); });
  const nodes: ModuleTreeCanvasNode[] = [
    { id: 'shop', name: 'shop', parent: null, children: ['shop/notes'], color: '#2f5fa7', width: 220, height: 64 },
    { id: 'shop/notes', name: 'notes', parent: 'shop', children: [], color: '#2f5fa7', width: 220, height: 120 },
  ];
  render(
    <div style={{ width: 960, height: 720 }}>
      <ModuleTreeCanvas nodes={nodes} selectedNodeId={null} collapsedNodeIds={new Set()} ariaLabel="Probe"
        renderNodeBody={node => <HookRow label={node.name} />} onSelectNode={() => undefined} onToggleCollapsed={() => undefined} />
    </div>,
  );
  const row = await screen.findByText('notes 0');
  await act(async () => { fireEvent.click(row); });
  expect(row.textContent).toBe('notes 1');
  spy.mockRestore();
  expect(errors.map(args => String(args[0]))).not.toContainEqual(expect.stringMatching(/Invalid hook call|more than one copy of React/));
});

test('CM02: every returned capability ID is a row of its module node, sized so that every row is visible', () => {
  render(<Harness value={comparison} />);
  for (const entry of comparison.modules) {
    const node = shell(entry.module)!;
    expect(node, entry.module).toBeTruthy();
    expect(rowsOf(entry.module).map(row => row.querySelector('.capability-row-id')!.textContent)).toEqual(entry.capabilities.map(row => row.capability));
    expect(node.style.height).toBe(`${nodeHeight(entry)}px`);
  }
  // Rows, not summary counts: no "+N", no count markers, and nothing truncated.
  const bodies = [...document.querySelectorAll('.capability-module')].map(body => body.textContent);
  expect(bodies.join(' ')).not.toMatch(/\+\d|initial \d|both \d|…/);
  expect(nodeHeight(comparison.modules[1]!)).toBe(14 + 18 + 4 + 3 * rowHeight + 2 * 3);
});

test('CM03–CM06: Initial and Implemented are independent text indications on one row, with the initial roles distinct', () => {
  render(<Harness value={comparison} />);
  const text = (module: string, capability: string) => rowsOf(module).find(row => row.querySelector('.capability-row-id')!.textContent === capability)!;
  const marks = (row: HTMLElement) => [...row.querySelectorAll('.capability-mark')].map(mark => [mark.className.replace('capability-mark ', ''), mark.textContent]);

  // Both facts hold: one row with both indications.
  expect(marks(text('shop/notes', 'review-note'))).toEqual([['capability-mark-initial', 'Initial: entry owner'], ['capability-mark-implemented', 'Implemented']]);
  // Initial only, in each role, and both roles of one hypothesis on one row.
  expect(marks(text('shop/notes', 'note-search'))).toEqual([['capability-mark-initial', 'Initial: suggested owner']]);
  expect(marks(text('shop/search', 'note-search'))).toEqual([['capability-mark-initial', 'Initial: involved']]);
  expect(marks(text('shop/search', 'shared-index'))).toEqual([['capability-mark-initial', 'Initial: suggested owner, involved']]);
  // Changed placement: Initial in one module and Implemented in the other, with no mismatch status.
  expect(marks(text('shop/notes', 'moved-thing'))).toEqual([['capability-mark-initial', 'Initial: entry owner']]);
  expect(marks(text('shop/panel', 'moved-thing'))).toEqual([['capability-mark-implemented', 'Implemented']]);
  // Absent from revision 1: Implemented only.
  expect(marks(text('shop/panel', 'format-date'))).toEqual([['capability-mark-implemented', 'Implemented']]);
  expect(document.body.textContent).not.toMatch(/mismatch|elsewhere|unexpected|moved to/i);
  expect(text('shop/panel', 'format-date').getAttribute('aria-label')).toBe('format-date, Implemented');
});

test('CM04: only an implementedHere row shows Implemented; a row without it never does', () => {
  render(<Harness value={comparison} />);
  for (const entry of comparison.modules) {
    for (const [index, row] of entry.capabilities.entries()) {
      const implemented = rowsOf(entry.module)[index]!.querySelector('.capability-mark-implemented');
      expect(implemented !== null, `${entry.module} ${row.capability}`).toBe(row.implementedHere !== null);
    }
  }
});

test('CM07: shells follow the harness placement: proposed is provisional under its recorded parent, rowless modules are muted', () => {
  render(<Harness value={comparison} />);
  expect(shell('shop/notes/drafts')!.dataset.emphasis).toBe('provisional');
  expect(shell('shop/notes/drafts')!.classList.contains('module-tree__node--provisional')).toBe(true);
  expect(shell('shop/notes/drafts')!.textContent).toContain('proposed at start');
  expect(shell('shop/notes/drafts')!.getAttribute('aria-label')).toBe('shop/notes/drafts, proposed at start, 1 capability row');
  expect(position('shop/notes/drafts').y).toBeGreaterThanOrEqual(position('shop/notes').y + nodeHeight(comparison.modules[1]!));
  expect(shell('shop')!.dataset.emphasis).toBe('muted');
  expect(shell('shop/empty')!.dataset.emphasis).toBe('muted');
  expect(shell('shop/notes')!.dataset.emphasis).toBe('normal');

  // The nodes are the harness's answer: tree parents for declared modules, the recorded parent for a proposed one.
  const nodes = comparisonNodes(comparison);
  expect(nodes.map(node => [node.id, node.parent, node.emphasis])).toEqual([
    ['shop', null, 'muted'], ['shop/notes', 'shop', 'normal'], ['shop/notes/drafts', 'shop/notes', 'provisional'],
    ['shop/search', 'shop', 'normal'], ['shop/panel', 'shop', 'normal'], ['shop/empty', 'shop', 'muted'],
  ]);
  expect(nodes.find(node => node.id === 'shop/notes')!.children).toEqual(['shop/notes/drafts']);

  // A declared module that was proposed at start keeps its tree position and its label, with a normal shell.
  const declared = moduleCapabilityComparisonResponseSchema.parse({
    ...comparison,
    tree: { ...tree, modules: [...tree.modules, { module: 'shop/notes/drafts', dir: 'subs/notes/subs/drafts', parent: 'shop/panel' }] },
    modules: comparison.modules.map(entry => entry.module === 'shop/notes/drafts' ? { ...entry, placement: 'declared' } : entry),
  });
  expect(comparisonNodes(declared).find(node => node.id === 'shop/notes/drafts')).toMatchObject({ parent: 'shop/panel', emphasis: 'normal' });
});

test('CM07: unplaced modules are listed with their rows beside the canvas and never drawn', () => {
  const partial = moduleCapabilityComparisonResponseSchema.parse({
    ...comparison,
    modules: [
      ...comparison.modules,
      { module: 'shop/ghost', placement: 'unplaced', proposedAtStart: null, capabilities: [{ capability: 'ghost-thing', initial: [{ role: 'involved', hypothesis: 'h-ghost' }], implementedHere: null }] },
    ],
    coverage: { state: 'partial', knownCapabilities: 7, knownImplemented: 3, totalCapabilities: null, gaps: ['Module shop/ghost is not in the current tree and no proposal places it'] },
  });
  render(<Harness value={partial} />);
  expect(shell('shop/ghost')).toBeNull();
  const list = screen.getByLabelText('Modules not placed in the tree');
  expect(within(list).getByRole('button', { name: 'shop/ghost' })).toBeTruthy();
  expect(within(list).getByRole('button', { name: 'ghost-thing, Initial: involved' })).toBeTruthy();
});

test('CM08: a complete count reads "N of M"; a partial one shows known subtotals and gaps, never a ratio or zero', () => {
  render(<Harness value={comparison} />);
  expect(screen.getByLabelText('Coverage').textContent).toBe('Coverage complete: 3 of 6 capabilities implemented.');
  cleanup();

  const bounded = moduleCapabilityComparisonResponseSchema.parse({
    ...comparison,
    coverage: { state: 'partial', knownCapabilities: 6, knownImplemented: 3, totalCapabilities: 502, gaps: ['The capabilities bound kept 6 of 502 capabilities; knownImplemented is a lower bound'] },
  });
  render(<Harness value={bounded} />);
  const coverage = screen.getByLabelText('Coverage');
  expect(coverage.textContent).toContain('Coverage partial');
  expect([...coverage.querySelectorAll('.facts div')].map(item => item.textContent)).toEqual(['Known capabilities6', 'Known implemented3', 'Capabilities in total502']);
  expect(within(screen.getByLabelText('Coverage gaps')).getByText(/lower bound/)).toBeTruthy();
  // The view's own statement is subtotals only; a gap is the harness's text, shown as it is.
  const own = [...coverage.children].filter(child => child.getAttribute('aria-label') !== 'Coverage gaps').map(child => child.textContent).join(' ');
  expect(own).not.toMatch(/\d+ of \d+|%|\/ ?\d/);
  cleanup();

  // An unavailable tree: every module unplaced and listed; no canvas and no zero.
  const noTree = moduleCapabilityComparisonResponseSchema.parse({
    ...comparison,
    tree: { status: 'unavailable', message: 'The architect view has not been materialized yet.' },
    modules: comparison.modules.filter(entry => entry.capabilities.length > 0).map(entry => ({ ...entry, placement: 'unplaced' })),
    coverage: { state: 'partial', knownCapabilities: 6, knownImplemented: 3, totalCapabilities: null, gaps: ['The current module tree is unavailable, so no module is placed: The architect view has not been materialized yet.'] },
  });
  render(<Harness value={noTree} />);
  expect(document.querySelector('.module-tree__canvas')).toBeNull();
  expect(screen.getByText(/No module is drawn: The architect view has not been materialized yet/)).toBeTruthy();
  expect(within(screen.getByLabelText('Modules not placed in the tree')).getAllByRole('button', { name: /^shop\// })).toHaveLength(4);
  expect(screen.getByLabelText('Compared states').textContent).toContain('Current module treeunavailable: The architect view has not been materialized yet.');
  cleanup();

  // A pending initial analysis: the reason only, nothing converted into absence or zero.
  const unavailable = moduleCapabilityComparisonResponseSchema.parse({
    ...comparison, initialView: null, modules: [], coverage: { state: 'unavailable', reason: 'The initial analysis has not been accepted yet' },
  });
  render(<Harness value={unavailable} />);
  expect(screen.getByRole('alert').textContent).toBe('The comparison is unavailable: The initial analysis has not been accepted yet');
  expect(document.querySelector('.module-tree__canvas')).toBeNull();
  expect(document.body.textContent).not.toMatch(/\b0\b/);
});

test('the compared states are named: initial view, current tree and run version', () => {
  render(<Harness value={comparison} />);
  const states = [...screen.getByLabelText('Compared states').querySelectorAll('div')].map(item => item.textContent);
  expect(states).toEqual([
    'Initial analysisarchitect view revision rev/1:view:2, input input/1:def456',
    'Current module treerevision rev/1:tree:4, input input/1:abc123',
    'Run version46',
    'Identity policyexact-capability-slug/1',
  ]);
});

test('CM09: By module renders no activity, commit, changed, lines or deployed wording and no % sign', () => {
  render(<Harness value={comparison} />);
  fireEvent.click(rowsOf('shop/panel')[0]!);
  const text = document.body.textContent!;
  expect(text).not.toMatch(/\b(activity|commits?|changed|lines|deployed)\b|%/i);
});

test('CM11: a row selects by click, Enter or Space, shows its roles and evidence, and never selects its module', () => {
  const selections: Array<ModuleCapabilitySelection | null> = [];
  render(<Harness value={comparison} onSelect={selection => selections.push(selection)} />);
  const row = rowsOf('shop/panel')[0]!;
  expect(row.classList.contains('nodrag') && row.classList.contains('nopan')).toBe(true);

  fireEvent.click(row);
  expect(selections).toEqual([{ kind: 'row', module: 'shop/panel', capability: 'moved-thing' }]);
  expect(shell('shop/panel')!.getAttribute('aria-selected')).toBe('false');
  expect(row.getAttribute('aria-pressed')).toBe('true');
  const detail = screen.getByLabelText('Details for moved-thing in shop/panel');
  expect(detail.textContent).toContain('Verified in this run: wi-003 passed its work-item gate ga-0009');
  expect(within(detail).getByLabelText('Evidence').textContent).toBe('ga-0009ga-0008');
  expect(detail.textContent).toContain('No revision-1 association with this module.');

  const shared = rowsOf('shop/search')[1]!;
  fireEvent.keyDown(shared, { key: 'Enter' });
  fireEvent.keyDown(rowsOf('shop/notes')[1]!, { key: ' ' });
  expect(selections.slice(1)).toEqual([
    { kind: 'row', module: 'shop/search', capability: 'shared-index' },
    { kind: 'row', module: 'shop/notes', capability: 'note-search' },
  ]);
  const search = screen.getByLabelText('Details for note-search in shop/notes');
  expect(search.textContent).toContain('suggested owner: hypothesis note-search');
  expect(search.textContent).toContain('Not implemented in this module now.');
  expect(document.querySelectorAll('.module-tree__node--selected')).toHaveLength(0);
});

test('CM11: the shell selects its module and shows its capability list; the pane clears it', () => {
  const selections: Array<ModuleCapabilitySelection | null> = [];
  render(<Harness value={comparison} onSelect={selection => selections.push(selection)} />);
  fireEvent.click(shell('shop/notes/drafts')!);
  expect(selections).toEqual([{ kind: 'module', module: 'shop/notes/drafts' }]);
  expect(shell('shop/notes/drafts')!.getAttribute('aria-selected')).toBe('true');
  const detail = screen.getByLabelText('Details for module shop/notes/drafts');
  expect(detail.textContent).toContain('not in the current module tree; placed under its recorded parent shop/notes');
  expect(detail.textContent).toContain('Proposed at start under shop/notes: Keeps a reviewer\'s unsent drafts.');
  expect(within(within(detail).getByLabelText('Capabilities of shop/notes/drafts')).getByRole('button', { name: 'note-drafts' })).toBeTruthy();

  fireEvent.click(document.querySelector('.react-flow__pane')!);
  expect(selections.at(-1)).toBeNull();
});

test('CM11: collapse hides descendants behind the canvas control; focus runs shell, rows, then the control', () => {
  render(<Harness value={comparison} />);
  const notes = shell('shop/notes')!;
  const focusable = [notes, ...notes.querySelectorAll<HTMLElement>('button')];
  expect(focusable.map(element => element.className.split(' ')[0])).toEqual(['module-tree__node', 'capability-row', 'capability-row', 'capability-row', 'module-tree__toggle']);
  fireEvent.click(within(notes).getByRole('button', { name: /^Collapse shop\/notes/ }));
  expect(shell('shop/notes/drafts')).toBeNull();
  expect(within(shell('shop/notes')!).getByRole('button', { name: /^Expand shop\/notes/ }).textContent).toBe('+1');
});

test('CM12: a 60-row module keeps every row, in a node tall enough for them all, without overlapping its neighbours', () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({
    capability: `capability-${String(index + 1).padStart(2, '0')}`,
    initial: [{ role: 'entry-owner' as const, hypothesis: null }],
    implementedHere: index % 3 === 0 ? { reason: `wi-${index} passed its work-item gate`, evidence: [`ga-${index}`] } : null,
  }));
  const large = moduleCapabilityComparisonResponseSchema.parse({
    ...comparison,
    modules: comparison.modules.map((entry): ModuleCapabilities => entry.module === 'shop/search' ? { ...entry, capabilities: rows } : entry),
    coverage: {
      state: 'complete',
      capabilities: new Set(comparison.modules.flatMap(entry => entry.module === 'shop/search' ? rows : entry.capabilities).map(row => row.capability)).size,
      implemented: 3 + 20,
    },
  });
  render(<Harness value={large} />);
  expect(rowsOf('shop/search')).toHaveLength(60);
  const height = 14 + 18 + 4 + 60 * rowHeight + 59 * 3;
  expect(shell('shop/search')!.style.height).toBe(`${height}px`);

  const nodes = comparisonNodes(large);
  const boxes = nodes.map(node => ({ id: node.id, ...position(node.id), width: node.width, height: node.height }));
  for (const [index, a] of boxes.entries()) {
    for (const b of boxes.slice(index + 1)) {
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
    }
  }
  // Pan, zoom and the minimap stay available for the tall node.
  expect(document.querySelector('.react-flow__minimap')).toBeTruthy();
  expect(document.querySelector('.react-flow__controls')).toBeTruthy();
});

// CM01: the capability view uses the packaged canvas only. Every source of
// the web module outside its tests, read as text.
const webSource = join(dirname(fileURLToPath(import.meta.url)), '..');
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sources(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}
const webFiles = sources(webSource).map(path => ({ path: relative(webSource, path), text: readFileSync(path, 'utf8') }));

/** Whether a relative import of a web source leaves the project, whose src/ is subs/web/src. */
function leavesProject(from: string, target: string): boolean {
  return target.startsWith('.') && !new URL(target, `file:///project/subs/web/src/${from}`).pathname.startsWith('/project/');
}

test('CM01: the web module imports the canvas and its styles only from the package, and copies no tree or React Flow code', () => {
  const files = webFiles;
  expect(files.map(file => file.path)).toEqual(expect.arrayContaining(['capability-module-tree.tsx', 'run-page.tsx', 'styles.css', 'examples/capability-module-example.tsx']));
  expect(files.some(file => file.path.startsWith('tests/'))).toBe(false);
  const imports = files.flatMap(file => [...file.text.matchAll(/(?:from|import|@import)\s+['"]([^'"]+)['"]/g)].map(match => [file.path, match[1]!] as const));
  expect(imports.filter(([path, target]) => leavesProject(path, target))).toEqual([]);
  expect(leavesProject('capability-module-tree.tsx', '../../../../subs/presentation/src/module-tree-entry.js')).toBe(true);
  expect(imports.filter(([, target]) => /ramify\.ts\/(dist|subs|src)|presentation|project-view/.test(target!))).toEqual([]);
  expect(imports.filter(([, target]) => target!.startsWith('ramify.ts'))).toEqual([
    ['capability-module-tree.tsx', 'ramify.ts/module-tree'],
    ['styles.css', 'ramify.ts/module-tree.css'],
  ]);
  expect(imports.filter(([, target]) => target!.startsWith('@xyflow'))).toEqual([]);
  // No shell CSS, no React Flow class names, no explorer model, no rejected prototype.
  for (const file of files) {
    expect(file.text, file.path).not.toMatch(/\.module-tree__|react-flow__|\bnodrag\b|\bnopan\b|ProjectExplorerModel|module-activity|ModuleActivity/);
  }
});
