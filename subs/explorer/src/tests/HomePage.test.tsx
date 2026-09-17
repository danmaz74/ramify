/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerStatusResult } from '../../../service-api/src/interfaces/explorer-service.js';
import { HomePage } from '../HomePage.js';
import { selectBrowserPage, selectInitialModule } from '../browser-app.js';

afterEach(() => { cleanup(); });

describe('RS11/MT10: home page', () => {
  it('lists the module explorer link with the project root, binding state and daemon PID', async () => {
    const status: ServerStatusResult = { root: '/work/project', binding: 'ready', message: null, published: null, daemonPid: 4242 };
    render(<HomePage client={{ async serverStatus() { return status; } }} pollIntervalMs={60_000} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ramify' })).toBeInTheDocument();
    expect(await screen.findByText('/work/project')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toHaveAttribute('data-binding', 'ready');
    expect(screen.getByText('4242')).toBeInTheDocument();
    const links = within(screen.getByRole('navigation', { name: 'Pages' })).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Module explorer');
    expect(links[0]).toHaveAttribute('href', '/analysis/latest');
    expect(links[1]).toHaveTextContent('Module tree');
    expect(links[1]).toHaveAttribute('href', '/modules/latest');
  });

  it('shows a binding that is not ready with its message and no daemon PID', async () => {
    let status: ServerStatusResult = { root: '/work/project', binding: 'connecting', message: null, published: null, daemonPid: null };
    render(<HomePage client={{ async serverStatus() { return status; } }} pollIntervalMs={10} />);
    expect(await screen.findByText('Connecting to the project')).toHaveAttribute('data-binding', 'connecting');
    expect(screen.getByText('none')).toBeInTheDocument();
    status = { ...status, binding: 'project-unavailable', message: 'No module.ramify found' };
    expect(await screen.findByText('The project is unavailable: No module.ramify found')).toBeInTheDocument();
  });

  it('selects the page by pathname', () => {
    expect(selectBrowserPage('/')).toBe('home');
    expect(selectBrowserPage('/analysis/latest')).toBe('explorer');
    expect(selectBrowserPage('/modules/latest')).toBe('tree');
    expect(selectBrowserPage('/analysis/other')).toBe('home');
    expect(selectBrowserPage('/explore/a/b')).toBe('home');
  });
});

describe('MT13: module query parameter', () => {
  it('decodes the module parameter and ignores an empty one', () => {
    expect(selectInitialModule('?module=ramify%2Fanalysis%2Fmodel')).toBe('ramify/analysis/model');
    expect(selectInitialModule('?module=')).toBeNull();
    expect(selectInitialModule('')).toBeNull();
  });
});
