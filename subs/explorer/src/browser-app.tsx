import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { ContextToken } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { ExplorerRouter } from '../../service-api/src/router.js';
import { ProjectExplorerPage, type ExplorerClient } from './ProjectExplorerPage.js';

export interface ProjectExplorerBrowserApp {
  unmount(): void;
}

export function createProjectExplorerBrowserApp(container: HTMLElement, token: ContextToken,
  client?: ExplorerClient): ProjectExplorerBrowserApp {
  const transport = client ?? browserClient();
  const root: Root = createRoot(container);
  root.render(<ProjectExplorerPage token={token} client={transport} />);
  return { unmount: () => root.unmount() };
}

function browserClient(): ExplorerClient {
  const client = createTRPCClient<ExplorerRouter>({ links: [httpBatchLink({ url: '/trpc', methodOverride: 'POST' })] });
  return {
    projectView: input => client.projectView.query(input),
    explorerDetails: input => client.explorerDetails.query({ ...input, requests: [...input.requests] }),
    contextStatus: input => client.contextStatus.query(input),
  };
}
