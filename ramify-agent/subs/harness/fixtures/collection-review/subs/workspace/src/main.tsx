import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app.js';
import './styles.css';

/**
 * The browser entry: it mounts the application and does nothing else. The
 * stylesheet beside it is plain CSS this owner loads for its side effect; the
 * two feature views style themselves with CSS modules of their own.
 */

const container = document.getElementById('root');

if (!container) {
  throw new Error('The shell needs an element with id "root" to mount into.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
