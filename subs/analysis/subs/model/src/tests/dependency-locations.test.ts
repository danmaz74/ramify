import { describe, expect, it } from 'vitest';
import { buildModel, createDefaultTagRegistry } from '../index.js';
import { moduleRecord, original, location } from './fixtures.js';

const root = moduleRecord('app');
const resource = original(root, 'default', { kind: 'resource', file: 'theme.css' });
const input = { registry: createDefaultTagRegistry(), modules: [root], originals: [resource], exposures: [] };

describe('dependency declaration evidence for owned resources', () => {
  it.each(['../node_modules/vite/client.d.ts', '../../../../node_modules/vite/client.d.ts'])('retains normalized root-relative external declaration %s', file => {
    const result = buildModel({ ...input, originals: [{ ...resource, declarations: [location(file)] }] });
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.value.originals[0]!.declarations[0]!.file).toBe(file);
      expect(result.value.originals[0]!.id.owner).toBe('app');
      expect(result.value.originals[0]!.origin).toEqual(resource.origin);
    }
  });
  it.each(['/external.d.ts', '../a/../external.d.ts', '..//external.d.ts', '../', '../C:/external.d.ts'])('rejects noncanonical evidence %s', file => {
    expect(buildModel({ ...input, originals: [{ ...resource, declarations: [location(file)] }] }).status).toBe('invalid');
  });
  it('still rejects escaped ownership, source origins and exposure/tag evidence', () => {
    expect(buildModel({ ...input, originals: [{ ...resource, id: { ...resource.id, file: '../theme.css' } }] }).status).toBe('invalid');
    expect(buildModel({ ...input, originals: [{ ...resource, origin: { ...resource.origin, file: '../theme.css' } }] }).status).toBe('invalid');
    expect(buildModel({ ...input, originals: [{ ...resource, tagEvidence: [location('../module.ramify')] }] }).status).toBe('invalid');
  });
});
