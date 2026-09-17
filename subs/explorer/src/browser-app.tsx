import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { ExplorerRouter } from '../../service-api/src/router.js';
import { HomePage } from './HomePage.js';
import { ProjectExplorerPage, type ExplorerClient } from './ProjectExplorerPage.js';

export interface ProjectExplorerBrowserApp {
  unmount(): void;
}

export type BrowserPage = 'home' | 'explorer';

/** `/analysis/latest` shows the explorer; every other path shows the home page. */
export function selectBrowserPage(pathname: string): BrowserPage {
  return pathname === '/analysis/latest' ? 'explorer' : 'home';
}

export function createProjectExplorerBrowserApp(container: HTMLElement, page: BrowserPage,
  client?: ExplorerClient): ProjectExplorerBrowserApp {
  const transport = client ?? browserClient();
  const root: Root = createRoot(container);
  root.render(page === 'explorer' ? <ProjectExplorerPage client={transport} /> : <HomePage client={transport} />);
  return { unmount: () => root.unmount() };
}

function browserClient(): ExplorerClient {
  const client = createTRPCClient<ExplorerRouter>({ links: [httpBatchLink({ url: '/trpc', methodOverride: 'POST' })] });
  return {
    projectView: input => client.projectView.query(input),
    explorerDetails: input => client.explorerDetails.query({ ...input, requests: [...input.requests] }),
    serverStatus: () => client.serverStatus.query(),
  };
}
