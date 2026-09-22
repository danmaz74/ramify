// The consumer's single stylesheet import: canvas rules and React Flow base rules.
import 'ramify.ts/module-tree.css';
import { createRoot } from 'react-dom/client';
import { App } from './app';

createRoot(document.getElementById('root')!).render(<App />);
