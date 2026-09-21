import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { ModuleTree } from '../../../harness/src/interfaces/protocol/evidence.js';
import { ModuleActivityTree, type ModuleCapabilityComparison } from '../module-activity-tree.js';

afterEach(cleanup);

const tree: ModuleTree = {
  status: 'available', revision: 'current-rev', input: 'input-1',
  modules: [
    { module: 'shop', dir: '', parent: null },
    { module: 'shop/notes', dir: 'subs/notes', parent: 'shop' },
    { module: 'shop/search', dir: 'subs/search', parent: 'shop' },
    { module: 'shop/unused', dir: 'subs/unused', parent: 'shop' },
  ],
};

const modules: ModuleCapabilityComparison[] = [
  {
    module: 'shop/notes',
    capabilities: [
      {
        capability: 'save-draft',
        initial: [{ role: 'entry-owner', hypothesis: null }],
        completedHere: { reason: 'Current verification passed.', evidence: ['ga-0004'] },
      },
      {
        capability: 'find-notes',
        initial: [
          { role: 'suggested-owner', hypothesis: 'note-search' },
          { role: 'involved', hypothesis: 'note-search' },
        ],
        completedHere: null,
      },
    ],
  },
  {
    module: 'shop/search',
    capabilities: [{
      capability: 'find-notes',
      initial: [],
      completedHere: { reason: 'Search owns the completed capability.', evidence: ['ga-0008'] },
    }],
  },
  {
    module: 'shop',
    capabilities: [{
      capability: 'send-email',
      initial: [],
      completedHere: { reason: 'Discovered and verified during the run.', evidence: ['ga-0010'] },
    }],
  },
];

function view(extra: Partial<Parameters<typeof ModuleActivityTree>[0]> = {}) {
  return <ModuleActivityTree
    tree={tree}
    modules={modules}
    total={{ capabilities: 3, completed: 3 }}
    coverage="complete"
    gaps={[]}
    analysisIdentity="revision 1 / input-1"
    {...extra}
  />;
}

test('shows the initial and implemented layers without acceptance or ongoing-work concepts', () => {
  render(view());
  expect(screen.getByText('Capability placement by module')).toBeTruthy();
  expect(screen.getByText('3 of 3')).toBeTruthy();
  expect(screen.getByText('both 1')).toBeTruthy();
  expect(screen.getByText('initial 1')).toBeTruthy();
  const detail = screen.getByLabelText('Details for shop/notes');
  expect(detail.textContent).toContain('save-draft');
  expect(detail.textContent).toContain('entry owner');
  expect(detail.textContent).toContain('find-notes');
  expect(detail.textContent).toContain('suggested owner · note-search');
  expect(detail.textContent).toContain('involved · note-search');
  expect(detail.textContent).toContain('implemented');
  expect(document.body.textContent).not.toMatch(/accepted|unaccepted|working|commit|changed path/i);
});

test('makes a placement difference visible through the same stable capability in two modules', () => {
  render(view());
  const notes = screen.getByLabelText('Details for shop/notes');
  expect(within(notes).getByText('find-notes')).toBeTruthy();
  expect(notes.textContent).toContain('Initial hypothesis');

  fireEvent.click(screen.getByRole('button', { name: 'search' }));
  const search = screen.getByLabelText('Details for shop/search');
  expect(within(search).getByText('find-notes')).toBeTruthy();
  expect(search.textContent).toContain('No initial association with this module.');
  expect(search.textContent).toContain('Search owns the completed capability.');
  expect(document.body.textContent).not.toMatch(/implemented elsewhere|unexpected implementation/i);
});

test('keeps the complete current tree visible and mutes modules without either layer', () => {
  render(view());
  const unused = screen.getByRole('button', { name: 'unused' });
  expect(unused.hasAttribute('disabled')).toBe(true);
  expect(unused.closest('li')?.className).toContain('activity-node-muted');
  expect(screen.getByRole('button', { name: 'notes' }).hasAttribute('disabled')).toBe(false);
});

test('states incomplete comparison coverage instead of treating missing evidence as empty', () => {
  render(view({ coverage: 'partial', gaps: ['Initial analysis was truncated.'] }));
  const notice = screen.getByRole('status');
  expect(notice.textContent).toContain('Partial comparison.');
  expect(notice.textContent).toContain('Initial analysis was truncated.');
});

test('falls back to the comparison list when the module tree is unavailable', () => {
  render(view({ tree: { status: 'unavailable', message: 'materialization failed' } }));
  const fallback = screen.getByLabelText('Capability placement module tree');
  expect(fallback.textContent).toContain('materialization failed');
  expect(within(fallback).getByRole('button', { name: 'shop/notes' })).toBeTruthy();
});
