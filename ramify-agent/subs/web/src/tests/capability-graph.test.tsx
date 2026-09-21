import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { CapabilityProgress } from '../../../harness/src/interfaces/protocol/runs.js';
import { CapabilityGraph, layoutCapabilityGraph } from '../capability-graph.js';

afterEach(cleanup);

const capability = (id: string, dependsOn: CapabilityProgress['dependsOn'] = [], state: CapabilityProgress['state'] = 'todo'): CapabilityProgress => ({
  capability: id,
  owner: `shop/${id}`,
  entry: id === 'consumer',
  tentative: false,
  state,
  reason: `${id} retained reason`,
  dependsOn,
  workItems: id === 'consumer' ? ['wi-001'] : [],
  evidence: state === 'completed' ? ['ga-0001'] : [],
});

test('places consumers before shared dependencies and emits each projected edge once', () => {
  const input = [
    capability('consumer', [{ capability: 'provider', tentative: false }], 'working'),
    capability('second-consumer', [{ capability: 'provider', tentative: false }]),
    capability('provider', [], 'completed'),
  ];
  const layout = layoutCapabilityGraph(input);
  const consumer = layout.nodes.find(node => node.capability.capability === 'consumer')!;
  const provider = layout.nodes.find(node => node.capability.capability === 'provider')!;

  expect(provider.column).toBeGreaterThan(consumer.column);
  expect(layout.nodes.map(node => node.capability.capability).sort()).toEqual(['consumer', 'provider', 'second-consumer']);
  expect(layout.edges).toEqual([
    { from: 'consumer', to: 'provider', tentative: false },
    { from: 'second-consumer', to: 'provider', tentative: false },
  ]);
});

test('grows a node to keep its complete module path visible', () => {
  const short = capability('short');
  const long = { ...capability('long'), owner: 'collection-review/workspace/reviews/a-module-with-a-long-name' };
  const layout = layoutCapabilityGraph([short, long]);
  const shortNode = layout.nodes.find(node => node.capability.capability === 'short')!;
  const longNode = layout.nodes.find(node => node.capability.capability === 'long')!;

  expect(longNode.height).toBeGreaterThan(shortNode.height);
  expect(longNode.y).toBeGreaterThanOrEqual(shortNode.y + shortNode.height);
});

test('offers a line break immediately after every module path separator', () => {
  const input = { ...capability('consumer'), owner: 'collection-review/workspace/reviews' };
  render(<CapabilityGraph capabilities={[input]} total={1} />);
  const node = screen.getByRole('button', { name: 'consumer, todo, entry' });

  expect(node.textContent).toContain('collection-review/workspace/reviews');
  expect(node.querySelectorAll('.capability-node-owner wbr')).toHaveLength(2);
});

test('groups a dependency cycle without dropping its edges', () => {
  const layout = layoutCapabilityGraph([
    capability('a', [{ capability: 'b', tentative: false }]),
    capability('b', [{ capability: 'a', tentative: false }]),
  ]);
  expect(layout.cycles).toHaveLength(1);
  expect(layout.cycles[0]!.capabilities).toEqual(['a', 'b']);
  expect(layout.edges).toHaveLength(2);
});

test('shows explicit response coverage and retained details without inferring missing nodes', () => {
  const consumer = capability('consumer', [
    { capability: 'provider', tentative: false },
    { capability: 'not-in-response', tentative: true },
  ], 'working');
  const provider = capability('provider', [], 'completed');
  render(<CapabilityGraph capabilities={[consumer, provider]} total={3} />);

  expect(screen.getByRole('status').textContent).toContain('showing 2 of 3 capabilities');
  expect(screen.getByRole('status').textContent).toContain('not-in-response');
  fireEvent.click(screen.getByRole('button', { name: 'provider, completed' }));
  expect(screen.getByLabelText('Details for provider').textContent).toContain('ga-0001');
  expect(screen.queryByRole('button', { name: /not-in-response/ })).toBeNull();
});
