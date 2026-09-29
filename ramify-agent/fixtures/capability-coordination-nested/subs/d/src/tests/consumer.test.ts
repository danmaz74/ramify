import { expect, test } from 'vitest';
import { legacyLabel } from '../consumer.js';
test('D keeps the old text contract', () => expect(legacyLabel()).toBe('OLD'));
