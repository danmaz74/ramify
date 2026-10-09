import { describe, expect, it } from 'vitest';
import { nativeRequestArtifact, readPiNativeRequestArtifact } from '../preservation.js';

// Independently authored wire fields and their duplicate native snapshot. No
// serializer, SDK request builder or transcript decoder supplies expectations.
const golden = '{"schema":"ramify.pi-native-request/1","packageVersion":"0.87.1","transport":"sse","maxRetries":0,"model":"openai-codex/gpt-5.6-sol","instructions":"Role A\\nPreserve exactly.","tools":[{"type":"function","name":"submit_A","description":"Submit A","parameters":{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}}}}],"input":[{"type":"reasoning","id":"opaque-r1","encrypted_content":"opaque-signed-blob","summary":[]},{"type":"function_call","call_id":"call_7","name":"read","arguments":"{\\"path\\":\\"a.ts\\"}"},{"type":"function_call_output","call_id":"call_7","output":"exact\\nfile"}],"request":{"model":"gpt-5.6-sol","instructions":"Role A\\nPreserve exactly.","tools":[{"type":"function","name":"submit_A","description":"Submit A","parameters":{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}}}}],"input":[{"type":"reasoning","id":"opaque-r1","encrypted_content":"opaque-signed-blob","summary":[]},{"type":"function_call","call_id":"call_7","name":"read","arguments":"{\\"path\\":\\"a.ts\\"}"},{"type":"function_call_output","call_id":"call_7","output":"exact\\nfile"}],"prompt_cache_key":"child-L","stream":true,"reasoning":{"effort":"high","summary":"auto"},"unknown_future_option":{"z":1,"a":2}}}';
const encode = (text: string) => new TextEncoder().encode(text);
const changed = (mutate: (value: Record<string, unknown>) => void) => {
  const value = JSON.parse(golden) as Record<string, unknown>; mutate(value); return encode(JSON.stringify(value));
};

describe('Pi native request artifact builder', () => {
  const parsed = JSON.parse(golden) as { instructions: string; tools: unknown[]; input: unknown[]; request: Record<string, unknown> };
  const native = { instructions: parsed.instructions, tools: parsed.tools, input: parsed.input };
  it('records the stream options actually handed over and the given package version, in the golden field order', () => {
    const artifact = nativeRequestArtifact({ transport: 'sse', maxRetries: 0 }, '0.87.1', 'openai-codex/gpt-5.6-sol', native, parsed.request);
    expect(artifact.transport).toBe('sse'); expect(artifact.maxRetries).toBe(0); expect(artifact.packageVersion).toBe('0.87.1');
    expect(JSON.stringify(artifact)).toBe(golden);
  });
  it('records different forced options and package version as they were, so the artifact can disagree with the qualified values', () => {
    // A fake options object standing in for what the adapter would hand to pi if its forcing changed.
    const fake = { transport: 'websocket', maxRetries: 2, onPayload: async () => undefined, signal: new AbortController().signal };
    const artifact = nativeRequestArtifact(fake, '0.88.0', 'openai-codex/gpt-5.6-sol', native, parsed.request);
    expect(artifact.transport).toBe('websocket'); expect(artifact.maxRetries).toBe(2); expect(artifact.packageVersion).toBe('0.88.0');
    expect(JSON.stringify(artifact)).toBe(golden.replace('"packageVersion":"0.87.1","transport":"sse","maxRetries":0', '"packageVersion":"0.88.0","transport":"websocket","maxRetries":2'));
    expect(Object.keys(artifact)).not.toContain('onPayload'); expect(Object.keys(artifact)).not.toContain('signal');
    const reread = readPiNativeRequestArtifact(encode(JSON.stringify(artifact)))!;
    expect([reread.transport, reread.maxRetries, reread.packageVersion]).toEqual(['websocket', 2, '0.88.0']);
  });
});

describe('Pi native request artifact public accessor', () => {
  it('returns the complete original final request, ordered native fields and opaque input JSON without reconstructing history', () => {
    const bytes = encode(golden); const before = new Uint8Array(bytes);
    const artifact = readPiNativeRequestArtifact(bytes)!;
    expect(artifact.schema).toBe('ramify.pi-native-request/1');
    expect(artifact.instructions).toBe('Role A\nPreserve exactly.');
    expect(artifact.model).toBe('openai-codex/gpt-5.6-sol');
    expect(artifact.packageVersion).toBe('0.87.1'); expect(artifact.transport).toBe('sse'); expect(artifact.maxRetries).toBe(0);
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
    ['schema', 'ramify.pi-native-request/2'], ['schema', 'ramify.pi-native-request'], ['model', 'another-provider/gpt-5.6-sol'],
  ])('rejects unsupported claimed request %s identity %s', (field, value) => {
    expect(() => readPiNativeRequestArtifact(changed(artifact => { artifact[field] = value; }))).toThrow(/Unsupported/);
  });
  it.each([
    ['packageVersion', '0.87.2', 'packageVersion'], ['transport', 'websocket-cached', 'transport'], ['maxRetries', 2, 'maxRetries'],
  ] as const)('returns a recorded %s of %j as recorded rather than rejecting it; qualification compares it', (field, value, property) => {
    expect(readPiNativeRequestArtifact(changed(artifact => { artifact[field] = value; }))![property]).toBe(value);
  });
  it.each([
    ['instructions', ''], ['instructions', 123], ['tools', null], ['input', {}], ['request', null], ['request', []],
    ['packageVersion', ''], ['packageVersion', 87], ['packageVersion', undefined], ['transport', ''], ['transport', 5], ['transport', undefined],
    ['maxRetries', '0'], ['maxRetries', -1], ['maxRetries', 1.5], ['maxRetries', null], ['maxRetries', undefined],
  ])('rejects malformed claimed native field %s=%j', (field, value) => {
    expect(() => readPiNativeRequestArtifact(changed(artifact => { if (value === undefined) delete artifact[String(field)]; else artifact[String(field)] = value; }))).toThrow(/Malformed/);
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
