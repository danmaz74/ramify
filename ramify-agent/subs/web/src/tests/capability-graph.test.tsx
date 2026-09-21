import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { capabilityListResponseSchema, type CapabilityProgress } from '../../../harness/src/interfaces/protocol/runs.js';
import { CapabilityDependencyGraph, layoutCapabilityGraph } from '../capability-graph.js';

afterEach(cleanup);

type Link = CapabilityProgress['dependsOn'][number];

const capability = (id: string, extra: Partial<CapabilityProgress> = {}): CapabilityProgress => ({
  capability: id,
  owner: `shop/${id}`,
  entry: false,
  tentative: false,
  state: 'todo',
  reason: `${id} retained reason`,
  dependsOn: [],
  workItems: [],
  evidence: [],
  ...extra,
});
const on = (...ids: string[]): Link[] => ids.map(id => ({ capability: id, tentative: false }));

/** The answer as the harness sends it: validated by the protocol schema. */
const response = (capabilities: CapabilityProgress[], total = capabilities.length) =>
  capabilityListResponseSchema.parse({ capabilities, total });

const column = (layout: ReturnType<typeof layoutCapabilityGraph>, id: string) =>
  layout.nodes.find(node => node.capability.capability === id)!.column;

describe('CM17: layout by longest dependency depth', () => {
  test('consumers precede dependencies by their longest depth, and a direct link may skip columns', () => {
    const layout = layoutCapabilityGraph(response([
      capability('panel', { entry: true, dependsOn: on('form', 'store') }),
      capability('form', { dependsOn: on('store') }),
      capability('store'),
    ]).capabilities);
    expect([column(layout, 'panel'), column(layout, 'form'), column(layout, 'store')]).toEqual([0, 1, 2]);
    expect(layout.columns).toBe(3);
    for (const edge of layout.edges) expect(column(layout, edge.from)).toBeLessThan(column(layout, edge.to));
  });

  test('an entry that another entry depends on moves right of its consumer and keeps its entry marker', () => {
    const input = response([
      capability('outer', { entry: true, dependsOn: on('inner') }),
      capability('inner', { entry: true }),
    ]);
    const layout = layoutCapabilityGraph(input.capabilities);
    expect(column(layout, 'inner')).toBe(1);
    render(<CapabilityDependencyGraph {...input} />);
    expect(screen.getByRole('button', { name: 'inner, todo, entry' })).toBeTruthy();
  });

  test('a shared dependency is one node with every incoming edge', () => {
    const input = response([
      capability('consumer', { dependsOn: on('provider'), state: 'working' }),
      capability('second-consumer', { dependsOn: on('provider') }),
      capability('provider', { state: 'completed' }),
    ]);
    const layout = layoutCapabilityGraph(input.capabilities);
    expect(layout.nodes.filter(node => node.capability.capability === 'provider')).toHaveLength(1);
    expect(layout.edges).toEqual([
      { from: 'consumer', to: 'provider', tentative: false },
      { from: 'second-consumer', to: 'provider', tentative: false },
    ]);
    render(<CapabilityDependencyGraph {...input} />);
    expect(screen.getAllByRole('button', { name: /^provider,/ })).toHaveLength(1);
    const edges = document.querySelectorAll('path.capability-edge[data-to="provider"]');
    expect([...edges].map(edge => edge.getAttribute('data-from'))).toEqual(['consumer', 'second-consumer']);
    // Counted once in the returned-set counts.
    expect(screen.getByText(/State counts of the 3 returned capabilities/)).toBeTruthy();
  });

  test('a cycle is one explicit group with its internal edges, beside a consumer that enters it', () => {
    const input = response([
      capability('consumer', { dependsOn: on('a') }),
      capability('a', { dependsOn: on('b') }),
      capability('b', { dependsOn: on('a', 'leaf') }),
      capability('leaf'),
    ]);
    const layout = layoutCapabilityGraph(input.capabilities);
    expect(layout.cycles).toHaveLength(1);
    expect(layout.cycles[0]!.capabilities).toEqual(['a', 'b']);
    // Both members share one column: the group implies no order between them.
    expect(column(layout, 'a')).toBe(column(layout, 'b'));
    expect(column(layout, 'consumer')).toBeLessThan(column(layout, 'a'));
    expect(column(layout, 'leaf')).toBeGreaterThan(column(layout, 'b'));
    const internal = layout.edges.filter(edge => ['a', 'b'].includes(edge.from) && ['a', 'b'].includes(edge.to));
    expect(internal).toEqual([{ from: 'a', to: 'b', tentative: false }, { from: 'b', to: 'a', tentative: false }]);
    // Every member lies inside its outline.
    for (const node of layout.nodes.filter(entry => ['a', 'b'].includes(entry.capability.capability))) {
      const group = layout.cycles[0]!;
      expect(node.y).toBeGreaterThan(group.y);
      expect(node.y + node.height).toBeLessThan(group.y + group.height);
    }
    // The label starts 6 px inside the outline and wraps to two lines at the
    // node width in Chromium; the first member starts below both lines
    // (0.72rem at the page's 1.5 line height).
    const firstMember = Math.min(...layout.nodes.filter(entry => ['a', 'b'].includes(entry.capability.capability)).map(entry => entry.y));
    expect(firstMember - (layout.cycles[0]!.y + 6)).toBeGreaterThanOrEqual(2 * 0.72 * 16 * 1.5);

    render(<CapabilityDependencyGraph {...input} />);
    expect(screen.getByText('Dependency cycle: no order among these')).toBeTruthy();
    expect(document.querySelectorAll('rect.capability-cycle')).toHaveLength(1);
    expect(document.querySelector('path.capability-edge[data-from="a"][data-to="b"]')).toBeTruthy();
    expect(document.querySelector('path.capability-edge[data-from="b"][data-to="a"]')).toBeTruthy();
    fireEvent.click(screen.getByText('Dependency list'));
    expect(within(screen.getByLabelText('Dependency cycles')).getByRole('listitem').textContent).toBe('a, b: a → b; b → a');
  });

  test('the layout is deterministic for one response', () => {
    const input = response([
      capability('x', { dependsOn: on('y', 'z') }),
      capability('y', { dependsOn: on('z') }),
      capability('z', { dependsOn: on('y') }),
      capability('w', { dependsOn: on('z') }),
    ]).capabilities;
    expect(layoutCapabilityGraph(input)).toEqual(layoutCapabilityGraph(structuredClone(input)));
  });

  test('columns are labelled as depth, never as an order to start work in', () => {
    render(<CapabilityDependencyGraph {...response([capability('a', { dependsOn: on('b') }), capability('b')])} />);
    expect(screen.getByText('Depth 0')).toBeTruthy();
    expect(screen.getByText('Depth 1')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/starting|first|next|schedule/i);
  });

  test('a node grows to keep its complete module path visible', () => {
    const layout = layoutCapabilityGraph([
      capability('short'),
      capability('long', { owner: 'collection-review/workspace/reviews/a-module-with-a-long-name' }),
    ]);
    const short = layout.nodes.find(node => node.capability.capability === 'short')!;
    const long = layout.nodes.find(node => node.capability.capability === 'long')!;
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.y).toBeGreaterThanOrEqual(short.y + short.height);
  });
});

describe('CM15 and CM16: literal state, tentative forecasts and owners', () => {
  test('each returned capability appears once with the harness\'s literal state text', () => {
    const input = response([
      capability('a', { state: 'todo' }),
      capability('b', { state: 'working' }),
      capability('c', { state: 'completed', evidence: ['ga-0001'] }),
    ]);
    render(<CapabilityDependencyGraph {...input} />);
    for (const [id, state] of [['a', 'todo'], ['b', 'working'], ['c', 'completed']] as const) {
      const node = screen.getByRole('button', { name: `${id}, ${state}` });
      expect(node.querySelector('.capability-node-badges .badge')!.textContent).toBe(state);
    }
    expect(screen.getAllByRole('button', { name: /^[abc],/ })).toHaveLength(3);
    const counts = screen.getByLabelText('State counts of the 3 returned capabilities');
    expect([...counts.querySelectorAll('dt')].map(term => term.textContent)).toEqual(['todo', 'working', 'completed']);
    expect(document.body.textContent).not.toContain('working on');
  });

  test('the state is never derived from the reason: a reason naming another state changes nothing', () => {
    render(<CapabilityDependencyGraph {...response([
      capability('misleading', { state: 'working', reason: 'completed? todo? failed earlier and was repaired' }),
    ])} />);
    const node = screen.getByRole('button', { name: 'misleading, working' });
    expect(node.querySelector('.state-working')!.textContent).toBe('working');
    expect(node.querySelector('.state-completed, .state-todo')).toBeNull();
    fireEvent.click(node);
    // The reason is shown verbatim as the harness retained it.
    expect(within(screen.getByLabelText('Details for misleading')).getByText('completed? todo? failed earlier and was repaired')).toBeTruthy();
  });

  test('a registered todo and a tentative forecast-only todo stay distinct; owners are current or suggested', () => {
    const input = response([
      capability('committed', { dependsOn: [{ capability: 'forecast', tentative: true }] }),
      capability('forecast', { tentative: true, owner: 'shop/maybe' }),
    ]);
    render(<CapabilityDependencyGraph {...input} />);
    const committed = screen.getByRole('button', { name: 'committed, todo' });
    const forecast = screen.getByRole('button', { name: 'forecast, todo, forecast only' });
    expect(committed.className).not.toContain('capability-node-tentative');
    expect(forecast.className).toContain('capability-node-tentative');
    expect(committed.textContent).toContain('current owner');
    expect(committed.textContent).not.toContain('forecast only');
    expect(forecast.textContent).toContain('suggested owner');
    expect(forecast.textContent).toContain('forecast only');
    expect(forecast.textContent).not.toContain('current owner');
    // The tentative link is dashed, separately from the node.
    expect(document.querySelector('path.capability-edge[data-to="forecast"]')!.getAttribute('class')).toContain('capability-edge-tentative');

    fireEvent.click(forecast);
    const detail = screen.getByLabelText('Details for forecast');
    expect(detail.textContent).toContain('suggested owner');
    expect(detail.textContent).toContain('shop/maybe');
    fireEvent.click(committed);
    expect(screen.getByLabelText('Details for committed').textContent).toContain('current owner');
    expect(screen.getByLabelText('Details for committed').textContent).toContain('forecast (tentative)');
  });

  test('a confirmed link is solid even when a forecast repeats it', () => {
    const layout = layoutCapabilityGraph([
      capability('a', { dependsOn: [{ capability: 'b', tentative: true }, { capability: 'b', tentative: false }] }),
      capability('b'),
    ]);
    expect(layout.edges).toEqual([{ from: 'a', to: 'b', tentative: false }]);
  });

  test('selected detail shows the reason, dependencies, dependents, work items and evidence', () => {
    const opened: string[] = [];
    render(<CapabilityDependencyGraph {...response([
      capability('consumer', { entry: true, state: 'working', dependsOn: on('provider'), workItems: ['wi-001'] }),
      capability('provider', { state: 'completed', workItems: ['wi-002', 'wi-003'], evidence: ['ga-0007', 'ga-0006'] }),
    ])} onOpenWorkItem={id => opened.push(id)} />);
    expect(screen.getByText('No capability is selected.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'provider, completed' }));
    const detail = screen.getByLabelText('Details for provider');
    expect(detail.textContent).toContain('provider retained reason');
    expect(detail.textContent).toContain('ga-0007, ga-0006');
    expect(within(detail).getByText('Depended on by').nextElementSibling!.textContent).toBe('consumer');
    fireEvent.click(within(detail).getByRole('button', { name: 'Open the history of work item wi-003' }));
    expect(opened).toEqual(['wi-003']);
  });
});

describe('CM18: a bounded response', () => {
  test('reports shown versus total, labels counts as of the returned set and lists omitted targets without nodes', () => {
    const input = response([
      capability('consumer', { state: 'working', dependsOn: [{ capability: 'provider', tentative: false }, { capability: 'not-in-response', tentative: true }] }),
      capability('provider', { state: 'completed', evidence: ['ga-0001'], dependsOn: on('also-missing') }),
    ], 7);
    render(<CapabilityDependencyGraph {...input} />);
    const coverage = screen.getByLabelText('Response coverage');
    expect(coverage.textContent).toContain('Showing 2 / 7 capabilities');
    expect(coverage.textContent).toContain('Every count here is of the returned set');
    expect(within(screen.getByLabelText('Unavailable dependency targets')).getAllByRole('listitem').map(item => item.textContent))
      .toEqual(['not-in-response', 'also-missing']);
    expect(screen.getByText('State counts of the 2 returned capabilities')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /not-in-response|also-missing/ })).toBeNull();
    expect(layoutCapabilityGraph(input.capabilities).nodes).toHaveLength(2);
    expect(document.querySelectorAll('path.capability-edge')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'consumer, working' }));
    expect(screen.getByLabelText('Details for consumer').textContent).toContain('not-in-response (tentative) (not in this response)');
  });

  test('a complete response states no coverage gap', () => {
    render(<CapabilityDependencyGraph {...response([capability('a')])} />);
    expect(screen.queryByLabelText('Response coverage')).toBeNull();
  });

  test('an empty response says so and shows no counts; an empty bounded one reports its total', () => {
    render(<CapabilityDependencyGraph {...response([])} />);
    expect(screen.getByRole('status').textContent).toBe('The run has no registered or forecast capability yet.');
    expect(screen.queryByText(/State counts/)).toBeNull();
    expect(document.body.textContent).not.toContain('todo');
    cleanup();
    render(<CapabilityDependencyGraph {...response([], 3)} />);
    expect(screen.getByLabelText('Response coverage').textContent).toContain('Showing 0 / 3 capabilities');
    expect(document.body.textContent).not.toContain('todo');
  });
});
