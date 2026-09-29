import { readFact } from '../../b/src/fact.js';
export function legacyLabel(): string { return readFact().toUpperCase(); }
