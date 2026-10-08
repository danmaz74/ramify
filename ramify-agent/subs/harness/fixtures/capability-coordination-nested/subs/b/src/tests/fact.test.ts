import { expect, test } from 'vitest';
import { readFact } from '../fact.js';
test('B retains its existing fact', () => expect(readFact()).toBe('old'));
