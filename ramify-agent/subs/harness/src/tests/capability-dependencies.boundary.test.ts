import { test } from 'vitest';
import { runDependencyGate } from './helpers/dependency-flow.js';

test('CA19 CA21 CA32: actual nested C child gate, review and handback to B', () => runDependencyGate(false, true), 180_000);
