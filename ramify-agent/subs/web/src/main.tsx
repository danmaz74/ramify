import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { createProtocolClient } from './client.js';

const container = document.getElementById('root');
if (!container) throw new Error('The page has no #root element');

const example = (import.meta as ImportMeta & { readonly env: { readonly DEV: boolean } }).env.DEV
  ? new URLSearchParams(window.location.search).get('example')
  : null;
if (example === 'capability-module') {
  const { CapabilityModuleExample } = await import('./examples/capability-module-example.js');
  createRoot(container).render(<StrictMode><CapabilityModuleExample /></StrictMode>);
} else if (example === 'capability-graph') {
  const { CapabilityGraphExample } = await import('./examples/capability-graph-example.js');
  createRoot(container).render(<StrictMode><CapabilityGraphExample /></StrictMode>);
} else {
  createRoot(container).render(
    <StrictMode>
      <App client={createProtocolClient()} />
    </StrictMode>,
  );
}
