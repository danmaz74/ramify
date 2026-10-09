import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AgentSession as PiSession } from '@earendil-works/pi-coding-agent';

export type PiTranscriptMessage = PiSession['agent']['state']['messages'][number];
export type PiChosenModel = NonNullable<PiSession['model']>;
export type PiTranscriptTool = { name: string; description: string; parameters: Record<string, unknown> };
export interface NativePrefix { readonly instructions: string; readonly tools: readonly unknown[]; readonly input: readonly unknown[] }
/** The credential-free final request artifact, not evidence that HTTP dispatch
 * passed the later liveness fence. Input items remain opaque JSON; callers
 * retain the original payload bytes separately when recording byte evidence.
 * `packageVersion`, `transport` and `maxRetries` are observations: the
 * installed pi package and the stream options actually handed to it at the
 * final fence. Qualification compares them with its own expected values.
 */
export interface PiNativeRequestArtifact {
  readonly schema: 'ramify.pi-native-request/1';
  readonly packageVersion: string;
  readonly transport: string;
  readonly maxRetries: number;
  readonly model: 'openai-codex/gpt-5.6-sol';
  readonly instructions: string;
  readonly tools: readonly unknown[];
  readonly input: readonly unknown[];
  readonly request: Readonly<Record<string, unknown>>;
}
/** The stream options whose transport and retry fields the artifact records. */
export interface RecordedStreamOptions { readonly transport: string; readonly maxRetries: number }

/** Builds the request artifact from what was actually passed: the stream
 * options handed to the installed stream function, the installed package
 * version, the validated native prefix and the complete final body.
 */
export function nativeRequestArtifact(options: RecordedStreamOptions, packageVersion: string, model: string, native: NativePrefix, body: unknown): PiNativeRequestArtifact {
  return { schema: 'ramify.pi-native-request/1', packageVersion, transport: options.transport, maxRetries: options.maxRetries, model: model as PiNativeRequestArtifact['model'], ...native, request: copy(body) as Record<string, unknown> };
}

/** Reads only this owner's final-request artifact. Other JSON artifacts,
 * including opaque provider transcripts, are neither validated nor exposed.
 * Claimed request artifacts must agree with their complete original body,
 * including field order in every native tool and input item. Recorded
 * transport, retries and package version are returned as recorded.
 */
export function readPiNativeRequestArtifact(bytes: Uint8Array): PiNativeRequestArtifact | null {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Malformed pi request artifact JSON or UTF-8'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const artifact = parsed as Record<string, unknown>;
  if (typeof artifact['schema'] !== 'string' || !artifact['schema'].startsWith('ramify.pi-native-request')) return null;
  if (artifact['schema'] !== 'ramify.pi-native-request/1' || artifact['model'] !== 'openai-codex/gpt-5.6-sol') {
    throw new Error('Unsupported pi native request artifact identity');
  }
  const body = artifact['request'];
  if (typeof artifact['packageVersion'] !== 'string' || artifact['packageVersion'].length === 0 ||
    typeof artifact['transport'] !== 'string' || artifact['transport'].length === 0 ||
    typeof artifact['maxRetries'] !== 'number' || !Number.isInteger(artifact['maxRetries']) || artifact['maxRetries'] < 0 ||
    typeof artifact['instructions'] !== 'string' || artifact['instructions'].length === 0 ||
    !Array.isArray(artifact['tools']) || !Array.isArray(artifact['input']) ||
    body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Malformed pi native request artifact body');
  }
  const request = body as Record<string, unknown>;
  if (request['model'] !== 'gpt-5.6-sol' || request['instructions'] !== artifact['instructions'] ||
    !Array.isArray(request['input']) ||
    (request['tools'] !== undefined && !Array.isArray(request['tools'])) ||
    !sameNative(request['tools'] ?? [], artifact['tools']) || !sameNative(request['input'], artifact['input'])) {
    throw new Error('Pi native request artifact differs from its original request');
  }
  return artifact as unknown as PiNativeRequestArtifact;
}
export interface PreservedPiTranscript {
  readonly schema: 'ramify.pi-transcript/1'; readonly packageVersion: '0.87.1'; readonly transport: 'sse'; readonly model: string;
  readonly messages: readonly PiTranscriptMessage[]; readonly appliedAgentKeys: readonly string[];
  readonly declarations: readonly PiTranscriptTool[]; readonly additionKeys: readonly string[]; readonly activeTools: readonly string[];
  readonly native: NativePrefix; readonly sequence: number; readonly preparedOperationId: string;
}
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
/** Native fields retain their actual serialized key order as well as values. */
export const sameNative = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

interface Serializer {
  convertResponsesMessages(model: PiChosenModel, context: { messages: readonly PiTranscriptMessage[] }, providers: ReadonlySet<string>, options: Record<string, unknown>): unknown[];
  convertResponsesTools(tools: readonly PiTranscriptTool[], options: Record<string, unknown>): unknown[];
}
interface TranscriptUtilities { getDeclaredTools(messages: readonly PiTranscriptMessage[]): PiTranscriptTool[]; resolveTranscriptTools(messages: readonly PiTranscriptMessage[], additive: boolean): { requestTools: PiTranscriptTool[] } }
interface GrammarUtilities { createGrammarToolInputProperties(tools: readonly PiTranscriptTool[], enabled: boolean): ReadonlyMap<string, string> }
const packageEntry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
/** Resolve only import exports declared by the SDK's nested pi-ai package. */
export async function installedPiPublicExport(subpath: string): Promise<string> {
  const directory = join(dirname(packageEntry), '..', 'node_modules', '@earendil-works/pi-ai');
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as { version: string; exports: Record<string, { import?: string }> };
  if (manifest.version !== '0.87.1') throw new Error(`Unsupported pi-ai ${manifest.version}`);
  for (const [pattern, target] of Object.entries(manifest.exports)) {
    if (!target.import) continue;
    const [before, after] = pattern.split('*');
    if (after === undefined ? subpath !== before : !subpath.startsWith(before!) || !subpath.endsWith(after)) continue;
    const middle = after === undefined ? '' : subpath.slice(before!.length, subpath.length - after.length);
    if (middle.includes('..') || middle.includes('/')) throw new Error('Invalid public pi export');
    return pathToFileURL(join(directory, target.import.replace('*', middle))).href;
  }
  throw new Error(`Installed pi-ai does not export ${subpath}`);
}
/** The version the installed pi package declares; read, never assumed. */
export async function installedPiPackageVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(join(dirname(packageEntry), '..', 'package.json'), 'utf8')) as { version?: string };
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) throw new Error('Installed pi package declares no version');
  return manifest.version;
}
let serialization: Promise<{ serializer: Serializer; transcript: TranscriptUtilities; grammar: GrammarUtilities }> | undefined;
/** Installed, publicly exported package seams; version changes require qualification. */
export function installedPiSerialization() {
  serialization ??= (async () => {
    const version = await installedPiPackageVersion().catch(() => 'unknown');
    if (version !== '0.87.1') throw new Error(`Unsupported pi package ${version}`);
    const load = async (subpath: string) => import(await installedPiPublicExport(subpath)) as Promise<unknown>;
    const [serializer, transcript, grammar] = await Promise.all([
      load('./api/openai-responses-shared'),
      load('./utils/transcript'),
      load('./api/constrained-sampling'),
    ]);
    return { serializer: serializer as Serializer, transcript: transcript as TranscriptUtilities, grammar: grammar as GrammarUtilities };
  })();
  return serialization;
}
export function supportedPreservingModel(model: PiChosenModel): string | null {
  if (model.provider !== 'openai-codex' || model.id !== 'gpt-5.6-sol' || model.api !== 'openai-codex-responses') return 'Session preservation supports only openai-codex/gpt-5.6-sol on openai-codex-responses';
  const compat = model.compat as { supportsAdditionalTools?: boolean; supportsMidConvoSystemMessages?: boolean } | undefined;
  if (compat?.supportsAdditionalTools !== true || compat.supportsMidConvoSystemMessages !== true) return 'Model does not declare native appended tools and later system messages';
  return null;
}
/** Expected representation comes from immutable messages before extension/context mutation. */
export async function serializeNativePrefix(model: PiChosenModel, messages: readonly PiTranscriptMessage[]): Promise<NativePrefix> {
  const { serializer, transcript, grammar } = await installedPiSerialization();
  const compat = model.compat as Record<string, unknown> | undefined;
  const toolOptions = { strict: null, supportsStrictMode: compat?.['supportsStrictMode'] ?? true, supportsOpenAIGrammarTools: compat?.['supportsOpenAIGrammarTools'] ?? false };
  const head = messages[0] as { role?: string; content?: string } | undefined;
  if (head?.role !== 'system' || typeof head.content !== 'string' || head.content === '') throw new Error('Initial role instructions are missing; default prompt substitution is forbidden');
  return {
    instructions: head.content,
    tools: serializer.convertResponsesTools(transcript.resolveTranscriptTools(messages, true).requestTools, toolOptions),
    input: serializer.convertResponsesMessages(model, { messages: copy(messages) }, new Set(['openai', 'openai-codex', 'opencode']), {
      includeSystemPrompt: false,
      grammarToolInputProperties: grammar.createGrammarToolInputProperties(transcript.getDeclaredTools(messages), compat?.['supportsOpenAIGrammarTools'] === true),
      supportsMidConvoSystemMessages: true, supportsAdditionalTools: true, supportsToolSearch: compat?.['supportsToolSearch'] ?? false, toolOptions,
    }),
  };
}
export function validateNativeRequest(payload: unknown, expected: NativePrefix, inherited: NativePrefix | null): NativePrefix {
  if (payload === null || typeof payload !== 'object') throw new Error('Provider payload is not a request object');
  const body = payload as Record<string, unknown>;
  const actual: NativePrefix = { instructions: body['instructions'] as string, tools: (body['tools'] ?? []) as unknown[], input: body['input'] as unknown[] };
  if (!sameNative(actual, expected)) throw new Error('Final native request changed immutable instructions, tools or ordered provider input');
  if (inherited && (actual.instructions !== inherited.instructions || !sameNative(actual.tools, inherited.tools) || !sameNative(actual.input.slice(0, inherited.input.length), inherited.input))) throw new Error('Final native request failed inherited prefix equality');
  return copy(actual);
}
export function decodePreservedTranscript(bytes: Uint8Array): PreservedPiTranscript {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as PreservedPiTranscript;
  if (value.schema !== 'ramify.pi-transcript/1' || value.packageVersion !== '0.87.1' || value.transport !== 'sse' || !Array.isArray(value.messages) || !Array.isArray(value.appliedAgentKeys) || !Array.isArray(value.declarations) || !value.native || !Array.isArray(value.native.input)) throw new Error('Unsupported or corrupt opaque pi transcript');
  return value;
}
