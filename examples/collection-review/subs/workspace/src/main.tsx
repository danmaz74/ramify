import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('The shell needs an element with id "root" to mount into.');
}

createRoot(container).render(
  <StrictMode>
    <main className="shell">
      <h1 className="shell__title">Collection Review</h1>
      <p className="shell__lead">
        The record list and the review panel arrive with the feature views.
      </p>
    </main>
  </StrictMode>,
);
