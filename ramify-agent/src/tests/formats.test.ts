import { expect, test } from 'vitest';
import { formatsAgree } from '../index.js';

test('the harness and the web projection agree on the shared formats', () => {
  expect(formatsAgree()).toBe(true);
});
