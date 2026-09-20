import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { createProtocolClient } from './client.js';

const container = document.getElementById('root');
if (!container) throw new Error('The page has no #root element');
createRoot(container).render(
  <StrictMode>
    <App client={createProtocolClient()} />
  </StrictMode>,
);
