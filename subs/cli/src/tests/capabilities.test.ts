import { describe, expect, it } from 'vitest';
import { capabilities } from '../command-support.js';

describe('shared command capability list', () => {
  it('requests exactly the check capabilities, never the opt-in dependency-behavior evidence', () => {
    // check, check --changed, watch, materialize and explore all send this list.
    expect(capabilities).toEqual(['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
      'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage']);
    expect(capabilities).not.toContain('dependency-behavior');
  });
});
