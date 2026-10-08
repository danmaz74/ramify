import { describe, expect, it } from 'vitest';
import { readPiNativeRequestArtifact } from '../preservation.js';

// Independently authored wire fields and their duplicate native snapshot. No
// serializer, SDK request builder or transcript decoder supplies expectations.
const golden = '{"schema":"ramify.pi-native-request/1","packageVersion":"0.87.1","transport":"sse","model":"openai-codex/gpt-5.6-sol","instructions":"Role A\\nPreserve exactly.","tools":[{"type":"function","name":"submit_A","description":"Submit A","parameters":{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}}}}],"input":[{"type":"reasoning","id":"opaque-r1","encrypted_content":"opaque-signed-blob","summary":[]},{"type":"function_call","call_id":"call_7","name":"read","arguments":"{\\"path\\":\\"a.ts\\"}"},{"type":"function_call_output","call_id":"call_7","output":"exact\\nfile"}],"request":{"model":"gpt-5.6-sol","instructions":"Role A\\nPreserve exactly.","tools":[{"type":"function","name":"submit_A","description":"Submit A","parameters":{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}}}}],"input":[{"type":"reasoning","id":"opaque-r1","encrypted_content":"opaque-signed-blob","summary":[]},{"type":"function_call","call_id":"call_7","name":"read","arguments":"{\\"path\\":\\"a.ts\\"}"},{"type":"function_call_output","call_id":"call_7","output":"exact\\nfile"}],"prompt_cache_key":"child-L","stream":true,"reasoning":{"effort":"high","summary":"auto"},"unknown_future_option":{"z":1,"a":2}}}';
const encode = (text: string) => new TextEncoder().encode(text);
const changed = (mutate: (value: Record<string, unknown>) => void) => {
  const value = JSON.parse(golden) as Record<string, unknown>; mutate(value); return encode(JSON.stringify(value));
};

describe('Pi native request artifact public accessor', () => {
  it('returns the complete original final request, ordered native fields and opaque input JSON without reconstructing history', () => {
    const bytes = encode(golden); const before = new Uint8Array(bytes);
    const artifact = readPiNativeRequestArtifact(bytes)!;
    expect(artifact.schema).toBe('ramify.pi-native-request/1');
    expect(artifact.instructions).toBe('Role A\nPreserve exactly.');
    expect(artifact.model).toBe('openai-codex/gpt-5.6-sol');
    expect(JSON.stringify(artifact)).toBe(golden);
    expect(Object.keys(artifact.request)).toEqual(['model', 'instructions', 'tools', 'input', 'prompt_cache_key', 'stream', 'reasoning', 'unknown_future_option']);
    expect(JSON.stringify(artifact.request['unknown_future_option'])).toBe('{"z":1,"a":2}');
    expect(artifact.input).toEqual([
      { type: 'reasoning', id: 'opaque-r1', encrypted_content: 'opaque-signed-blob', summary: [] },
      { type: 'function_call', call_id: 'call_7', name: 'read', arguments: '{"path":"a.ts"}' },
      { type: 'function_call_output', call_id: 'call_7', output: 'exact\nfile' },
    ]);
    expect(bytes).toEqual(before);
  });
  it.each([
    ['schema', 'ramify.pi-native-request/2'], ['schema', 'ramify.pi-native-request'],
    ['packageVersion', '0.87.2'], ['transport', 'websocket'], ['model', 'another-provider/gpt-5.6-sol'],
  ])('rejects unsupported claimed request %s identity %s', (field, value) => {
    expect(() => readPiNativeRequestArtifact(changed(artifact => { artifact[field] = value; }))).toThrow(/Unsupported/);
  });
  it.each([
    ['instructions', ''], ['instructions', 123], ['tools', null], ['input', {}], ['request', null], ['request', []],
  ])('rejects malformed claimed native field %s=%j', (field, value) => {
    expect(() => readPiNativeRequestArtifact(changed(artifact => { artifact[String(field)] = value; }))).toThrow(/Malformed/);
  });
  it.each(['model', 'instructions', 'tools', 'input'] as const)('rejects %s disagreement between snapshot and complete request', field => {
    expect(() => readPiNativeRequestArtifact(changed(artifact => {
      const request = artifact['request'] as Record<string, unknown>;
      request[field] = field === 'model' ? 'other-model' : field === 'instructions' ? 'Changed head' : [];
    }))).toThrow(/differs/);
  });
  it.each(['tools', 'input'] as const)('rejects reordered keys inside native %s, even when JSON values agree', field => {
    expect(() => readPiNativeRequestArtifact(changed(artifact => {
      const request = artifact['request'] as Record<string, unknown>;
      const entries = request[field] as Record<string, unknown>[];
      entries[0] = Object.fromEntries(Object.entries(entries[0]!).reverse());
    }))).toThrow(/differs/);
  });
  it.each(['input', 'tools'] as const)('rejects malformed request %s rather than substituting a default', field => {
    expect(() => readPiNativeRequestArtifact(changed(artifact => { (artifact['request'] as Record<string, unknown>)[field] = null; }))).toThrow(/differs/);
  });
  it('accepts an original omitted tool field only with a verified empty native tool snapshot', () => {
    const artifact = readPiNativeRequestArtifact(changed(value => {
      value['tools'] = []; delete (value['request'] as Record<string, unknown>)['tools'];
    }))!;
    expect(artifact.tools).toEqual([]); expect(Object.hasOwn(artifact.request, 'tools')).toBe(false);
  });
  it.each([
    '{"schema":"ramify.pi-transcript/1","messages":"opaque malformed transcript","native":null,"model":"never inspect"}',
    '{"schema":"ramify.pi-builtin-result/1","result":{"content":"opaque"}}',
    '{"schema":"unrelated/1","request":{"model":"not our request"}}', 'null', '[]', '"opaque"', '{}',
  ])('returns null for non-request artifact %s without exposing or validating provider transcript data', raw => {
    expect(readPiNativeRequestArtifact(encode(raw))).toBeNull();
  });
  it.each(['{"schema":"ramify.pi-native-request/1",', '{"schema":"ramify.pi-native-request/1","input":NaN}'])('rejects malformed claimed JSON %s', raw => {
    expect(() => readPiNativeRequestArtifact(encode(raw))).toThrow(/Malformed/);
  });
  it('rejects invalid UTF8 instead of comparing replacement-character request bytes', () => {
    expect(() => readPiNativeRequestArtifact(new Uint8Array([0xff]))).toThrow(/UTF-8/);
  });
});
