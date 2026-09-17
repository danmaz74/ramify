import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { ExplorerRouter } from '../../service-api/src/router.js';
import { HomePage } from './HomePage.js';
import { ModuleTreePage } from './ModuleTreePage.js';
import { ProjectExplorerPage } from './ProjectExplorerPage.js';
import type { ExplorerClient } from './published-project-view.js';

export interface ProjectExplorerBrowserApp {
  unmount(): void;
}

export type BrowserPage = 'home' | 'explorer' | 'tree';

/** `/analysis/latest` shows the explorer and `/modules/latest` the module tree; every other path shows the home page. */
export function selectBrowserPage(pathname: string): BrowserPage {
  if (pathname === '/analysis/latest') return 'explorer';
  return pathname === '/modules/latest' ? 'tree' : 'home';
}

/** The module a page focuses first, from the `module` query parameter. */
export function selectInitialModule(search: string): string | null {
  const value = new URLSearchParams(search).get('module');
  return value === null || value === '' ? null : value;
}

export function createProjectExplorerBrowserApp(container: HTMLElement, page: BrowserPage,
  client?: ExplorerClient, initialModuleId: string | null = null): ProjectExplorerBrowserApp {
  const transport = client ?? browserClient();
  const root: Root = createRoot(container);
  root.render(page === 'explorer' ? <ProjectExplorerPage client={transport} initialModuleId={initialModuleId} />
    : page === 'tree' ? <ModuleTreePage client={transport} initialModuleId={initialModuleId} /> : <HomePage client={transport} />);
  return { unmount: () => root.unmount() };
}

function browserClient(): ExplorerClient {
  const client = createTRPCClient<ExplorerRouter>({ links: [httpBatchLink({ url: '/trpc', methodOverride: 'POST' })] });
  return {
    projectView: input => client.projectView.query(input),
    explorerDetails: input => client.explorerDetails.query({ ...input, requests: [...input.requests] }),
    serverStatus: () => client.serverStatus.query(),
    dependencyView: input => client.dependencyView.query(input),
  };
}
