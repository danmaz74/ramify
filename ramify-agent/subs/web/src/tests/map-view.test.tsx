import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { ImplementationMap } from '../../../harness/src/interfaces/map.js';
import type { JobSnapshot } from '../../../harness/src/interfaces/protocol/jobs.js';
import type { MapRevision } from '../../../harness/src/interfaces/protocol/maps.js';
import { ClientError } from '../client.js';
import { PlanPage } from '../plan-page.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(cleanup);

const root = 'shop';
const hash = (digit: string) => digit.repeat(64);

function map(revision: number, jobId: string, overrides: Partial<ImplementationMap> = {}): ImplementationMap {
  return {
    schema: 'ramify-agent.implementation-map/1',
    identity: {
      planId: 'p', revision, jobId,
      manifest: {
        planHash: hash('a'), source: { commit: '0123456789abcdef', dirty: false },
        versions: { architectPrompt: '1+sha256:1', procedure: '1+sha256:2', skill: 'sha256:3', ramify: '0.0.0' },
        architectView: { status: 'materialized', revision: 'rev-1', input: 'input/1:abc', coverageLimits: ['unknownShapes: 2'] },
      },
    },
    summary: { change: `Orders get a discount code (revision ${revision}).`, preserves: ['Pricing stays pure.'] },
    modulesTouched: [
      { module: `${root}/orders`, weight: 'heavy', why: 'It applies the code at checkout.' },
      { module: `${root}/orders/discounts`, weight: 'light', why: 'It validates codes.', proposed: { parent: `${root}/orders`, purpose: 'Discount codes.', tags: [] } },
      { module: `${root}/ui`, weight: 'exposure-only', why: 'It receives the new field.' },
    ],
    reuse: [{
      capability: 'Money arithmetic', symbols: [{ name: 'addMoney', owner: `${root}/pricing` }],
      requester: { module: `${root}/orders`, area: 'src' },
      availability: { status: 'available', record: 'subs/orders/src/.ramify/external/subs/pricing/src/money.ts.md', importSpelling: "import { addMoney } from '../../pricing/src/money.js';" },
    }, {
      capability: 'Customer lookup', symbols: [{ name: 'findCustomer', owner: `${root}/customers` }],
      requester: { module: `${root}/orders`, area: 'src' },
      availability: { status: 'unknown', reason: 'The view reports coverage limits.' },
    }],
    newCapabilities: [{ capability: 'Discount codes', goal: 'Validate and apply a code.', owner: `${root}/orders/discounts`, consumers: [`${root}/orders`] }],
    seams: [{ capability: 'Discount field', owner: `${root}/orders`, consumer: `${root}/ui` }],
    entryPoint: { module: `${root}/orders`, acceptance: 'A checkout with a valid code is discounted.' },
    workItems: [{ title: 'Discounts', subtreeRoot: `${root}/orders`, capabilities: ['Discount codes'] }],
    assumptions: { assumed: ['Codes are case-insensitive.'], notFound: [], coverageLimits: ['unknownShapes: 2'] },
    evidence: [{ claim: 'addMoney is exposed to orders.', citations: [{ kind: 'view-record', path: '.ramify-architect/pricing/behavior.jsonl', line: 3 }] }],
    ...overrides,
  };
}

function saved(revision: number, jobId: string, approved = false): MapRevision {
  return {
    revision, path: `plans/p/map/00${revision}.json`, mapHash: hash(String(revision)), map: map(revision, jobId),
    approval: approved
      ? { schema: 'ramify-agent.map-approval/1', planId: 'p', revision, mapHash: hash(String(revision)), planHash: hash('a'), input: 'input/1:abc', approvedAt: '2026-09-19T13:00:00.000Z' }
      : null,
  };
}

function job(jobId: string, version: number): JobSnapshot {
  return {
    jobId, planId: 'p', agent: 'scripted', version, state: 'completed', stopRequested: false,
    startedAt: '2026-09-19T12:00:00.000Z', updatedAt: '2026-09-19T12:01:00.000Z', endedAt: '2026-09-19T12:01:00.000Z',
    inputs: { planHash: hash('a'), source: null, architectView: 'materialized' },
    revision: Number(jobId.slice(1)), failure: null,
    totals: { filesRead: 0, searches: 0, rejectedSubmissions: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
}

/** A plan with two saved revisions, 2 the latest, from jobs j1 and j2. */
function mappedClient(): StubClient {
  const client = new StubClient();
  client.documents.set('p', { id: 'p', title: 'P', path: 'plans/p/plan.md', markdown: '# P', mapping: { state: 'completed', jobId: 'j2', latestRevision: 2 } });
  client.revisions.set('p', [saved(2, 'j2'), saved(1, 'j1', true)]);
  client.jobs.set('p/j1', { job: job('j1', 7), events: [] });
  client.jobs.set('p/j2', { job: job('j2', 9), events: [] });
  client.tree = {
    status: 'available', revision: 'rev-1', input: 'input/1:abc',
    modules: [
      { module: root, dir: '', parent: null },
      { module: `${root}/customers`, dir: 'subs/customers', parent: root },
      { module: `${root}/orders`, dir: 'subs/orders', parent: root },
      { module: `${root}/pricing`, dir: 'subs/pricing', parent: root },
      { module: `${root}/pricing/rates`, dir: 'subs/pricing/subs/rates', parent: `${root}/pricing` },
      { module: `${root}/ui`, dir: 'subs/ui', parent: root },
    ],
  };
  return client;
}

describe('the Map page', () => {
  test('shows the latest revision: its summary, the modules touched on the tree, and every section', async () => {
    render(<PlanPage client={mappedClient()} planId="p" view="map" />);
    expect(await screen.findByText('Orders get a discount code (revision 2).')).toBeTruthy();
    const revisions = screen.getByRole('navigation', { name: 'Map revisions' });
    expect([...revisions.querySelectorAll('a')].map(link => [link.textContent, link.getAttribute('aria-current')])).toEqual([
      ['Revision 002 (latest) · not approved', 'page'],
      ['Revision 001 · approved', null],
    ]);
    expect(revisions.querySelector('a:last-child')?.getAttribute('href')).toBe('#/plans/p/map/1');

    const tree = await screen.findByLabelText('Module tree');
    await waitFor(() => expect(tree.querySelector('[data-module="shop/orders"]')).toBeTruthy());
    const node = (module: string) => tree.querySelector(`[data-module="${module}"]`)!;
    expect(node('shop/orders').className).toBe('tree-touched');
    expect(node('shop/orders').querySelector('.weight')?.textContent).toBe('heavy');
    expect(node('shop/ui').querySelector('.weight')?.textContent).toBe('exposure only');
    // The proposed module is drawn under its parent.
    expect(node('shop/orders').querySelector('[data-module="shop/orders/discounts"] .proposed')?.textContent).toBe('proposed');
    // Untouched branches are closed, with a count of what lies beneath.
    expect(node('shop/pricing').className).toBe('tree-other');
    expect(node('shop/pricing').textContent).toContain('+1 beneath');
    expect(tree.querySelector('[data-module="shop/pricing/rates"]')).toBeNull();

    for (const section of ['Reuse', 'New capabilities', 'Seams', 'Entry point and acceptance', 'Proposed work items', 'Assumptions and limits', 'Evidence', 'Identity']) {
      expect(screen.getByRole('region', { name: section })).toBeTruthy();
    }
    const reuse = screen.getByRole('region', { name: 'Reuse' });
    expect(reuse.textContent).toContain("import { addMoney } from '../../pricing/src/money.js';");
    expect(reuse.textContent).toContain('unknown The view reports coverage limits.');
    expect(screen.getByRole('region', { name: 'Seams' }).textContent).toBe('SeamsDiscount field: shop/orders → shop/ui');
    expect(screen.getByRole('region', { name: 'Evidence' }).textContent).toContain('.ramify-architect/pricing/behavior.jsonl:3');
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
  });

  test('an earlier revision stays selectable and shows its approval', async () => {
    const client = mappedClient();
    render(<PlanPage client={client} planId="p" view="map" revision={1} />);
    expect(await screen.findByText('Orders get a discount code (revision 1).')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Approval' }).textContent).toMatch(/^Approved /);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(client.calls).toContain('getRevision:p/1');
  });

  test('Approve sends approve-map at the version of the job that saved the revision, then shows the approval', async () => {
    const client = mappedClient();
    client.onCommand = command => {
      const revisions = client.revisions.get('p')!;
      client.revisions.set('p', [saved(2, 'j2', true), revisions[1]!]);
      return { commandId: command.commandId, jobId: 'j2', sequence: 10, acceptedAt: '2026-09-19T13:00:00.000Z' };
    };
    render(<PlanPage client={client} planId="p" view="map" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Approval' }).textContent).toMatch(/^Approved /));
    expect(client.commands).toEqual([expect.objectContaining({ type: 'approve-map', expectedVersion: 9, payload: { planId: 'p', jobId: 'j2', revision: 2 } })]);
    const revisions = screen.getByRole('navigation', { name: 'Map revisions' });
    await waitFor(() => expect(within(revisions).getByText('Revision 002 (latest) · approved')).toBeTruthy());
  });

  test('a stale approval is refused and says why', async () => {
    const client = mappedClient();
    client.onCommand = () => {
      throw new ClientError('protocol', 'Revision 2 is stale and cannot be approved: plans/p/plan.md changed since the map was made. Regenerate the map.', 'inputs-changed');
    };
    render(<PlanPage client={client} planId="p" view="map" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Approval refused: the plan or the source changed since this map was made.');
    expect(alert.textContent).toContain('plans/p/plan.md changed since the map was made');
    expect(screen.getByRole('status', { name: 'Approval' }).textContent).toBe('Not approved');
  });

  test('Regenerate starts a new mapping job', async () => {
    const client = mappedClient();
    render(<PlanPage client={client} planId="p" view="map" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));
    await waitFor(() => expect(client.commands).toEqual([expect.objectContaining({ type: 'start-mapping', expectedVersion: 0, payload: { planId: 'p' } })]));
  });

  test('without a module tree, the modules touched are listed with their weights', async () => {
    const client = mappedClient();
    client.tree = { status: 'unavailable', message: 'The architect view has not been materialized yet.' };
    render(<PlanPage client={client} planId="p" view="map" />);
    const touched = await screen.findByLabelText('Module tree');
    expect(touched.textContent).toContain('The module tree is not available');
    expect([...touched.querySelectorAll('.weight')].map(badge => badge.textContent)).toEqual(['heavy', 'light', 'exposure only']);
  });

  test('a revision that does not exist is reported', async () => {
    render(<PlanPage client={mappedClient()} planId="p" view="map" revision={7} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Plan “p” has no revision 7.');
  });
});

test('a revision is addressed in the Map view\'s fragment', async () => {
  const { parseRoute, routeHref } = await import('../routes.js');
  expect(parseRoute('#/plans/p/map/12')).toEqual({ page: 'plan', planId: 'p', view: 'map', revision: 12 });
  expect(parseRoute('#/plans/p/map')).toEqual({ page: 'plan', planId: 'p', view: 'map' });
  expect(parseRoute('#/plans/p/map/0')).toEqual({ page: 'plans' });
  expect(routeHref({ page: 'plan', planId: 'p', view: 'map', revision: 3 })).toBe('#/plans/p/map/3');
});
