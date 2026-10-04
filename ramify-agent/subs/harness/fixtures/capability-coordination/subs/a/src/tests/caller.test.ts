import { expect, test } from 'vitest';
import { renderA } from '../caller.js';
test('A renders a fact', () => expect(renderA('old')).toBe('Fact: old'));
