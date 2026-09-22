// Run by `npm run render-check` after jsdom-globals.mjs: the packaged canvas
// under the consumer's own React, through Node's resolution of the installed package.
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, HEADER_HEIGHT, nodes, ROW_HEIGHT } from './app';

const errors: unknown[][] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => { errors.push(args); originalError(...args); };

async function mount(onSelect?: (id: string | null) => void): Promise<{ scope: HTMLElement; unmount(): void }> {
  const scope = document.createElement('div');
  document.body.append(scope);
  const root = createRoot(scope);
  await act(async () => { root.render(<App onSelect={onSelect} />); });
  return { scope, unmount: () => { act(() => root.unmount()); scope.remove(); } };
}

const shell = (scope: HTMLElement, id: string) => scope.querySelector<HTMLElement>(`[data-module-id="${id}"]`);
function position(scope: HTMLElement, id: string): { x: number; y: number } {
  const wrapper = scope.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  const match = wrapper?.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  assert.ok(match, `No node position for ${id}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}
const size = (id: string) => nodes.find(node => node.id === id)!;

const cases: Array<[string, () => Promise<void>]> = [
  ['renders hook-using bodies in variable-height nodes without a hook error', async () => {
    const { scope, unmount } = await mount();
    for (const node of nodes) {
      const element = shell(scope, node.id);
      assert.ok(element, node.id);
      assert.equal(element.style.height, `${node.height}px`, node.id);
      assert.ok(element.querySelector(`.consumer-body[data-node="${node.id}"]`), `${node.id} body`);
    }
    assert.equal(new Set(nodes.map(node => node.height)).size, nodes.length);
    assert.equal(size('workspace/beta').height, HEADER_HEIGHT + 8 * ROW_HEIGHT);
    assert.equal(shell(scope, 'workspace/alpha')!.dataset.emphasis, 'muted');
    assert.ok(shell(scope, 'workspace/beta/gamma')!.classList.contains('module-tree__node--provisional'));
    unmount();
  }],
  ['places children below their parents and siblings apart, from the supplied sizes', async () => {
    const { scope, unmount } = await mount();
    for (const node of nodes) if (node.parent) {
      assert.ok(position(scope, node.id).y >= position(scope, node.parent).y + size(node.parent).height, node.id);
    }
    const [alpha, beta] = [position(scope, 'workspace/alpha'), position(scope, 'workspace/beta')];
    assert.ok(Math.abs(alpha.x - beta.x) >= size('workspace/alpha').width);
    unmount();
  }],
  ['keeps body controls stateful and out of node selection', async () => {
    const selections: Array<string | null> = [];
    const { scope, unmount } = await mount(id => selections.push(id));
    const button = [...shell(scope, 'workspace/beta')!.querySelectorAll('button')].find(item => item.textContent === 'two')!;
    assert.ok(button.classList.contains('nodrag') && button.classList.contains('nopan'));
    await act(async () => { button.click(); });
    assert.equal(scope.querySelector('[data-testid="marked-workspace/beta"]')!.textContent, 'marked 1');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(selections, []);
    assert.ok(!shell(scope, 'workspace/beta')!.classList.contains('module-tree__node--selected'));
    await act(async () => { shell(scope, 'workspace/beta')!.click(); });
    assert.deepEqual(selections, ['workspace/beta']);
    assert.ok(shell(scope, 'workspace/beta')!.classList.contains('module-tree__node--selected'));
    unmount();
  }],
  ['collapses through the canvas control with a hidden-descendant count', async () => {
    const { scope, unmount } = await mount();
    await act(async () => { shell(scope, 'workspace/beta')!.querySelector<HTMLButtonElement>('.module-tree__toggle')!.click(); });
    assert.equal(shell(scope, 'workspace/beta/gamma'), null);
    assert.equal(shell(scope, 'workspace/beta')!.querySelector('.module-tree__toggle')!.textContent, '+1');
    unmount();
  }],
];

const results: Array<{ name: string; passed: boolean; error?: string }> = [];
for (const [name, run] of cases) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }); }
}
const hookErrors = errors.map(args => String(args[0])).filter(text => /hook|more than one copy|two copies/i.test(text));
results.push({ name: 'no invalid-hook-call or duplicate-React error', passed: hookErrors.length === 0,
  ...hookErrors.length ? { error: hookErrors.join('\n') } : {} });
console.log(JSON.stringify({ results, consoleErrors: errors.length }));
if (results.some(result => !result.passed)) process.exitCode = 1;
