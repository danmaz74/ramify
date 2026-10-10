import { UsageError } from './cli.js';
import type { AttachedOptions } from './debug-client.js';

export type RealSessionOptions = { readonly mode: 'attached'; readonly attached: AttachedOptions }
  | { readonly mode: 'owned'; readonly projectRoot: string | undefined; readonly planId: string; readonly model: string | undefined };

/** Preserve the owned fixture launcher while rejecting ambiguous attachment/model combinations. */
export function parseRealSessionOptions(argv: readonly string[]): RealSessionOptions {
  const values: Record<string, string> = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]!;
    const equals = argument.indexOf('=');
    const flag = equals < 0 ? argument : argument.slice(0, equals);
    if (flag in values || flag === '--json' && json) throw new UsageError(`Give ${flag} once`);
    if (flag === '--json' && equals < 0) { json = true; continue; }
    if (!['--project', '--plan', '--model', '--server', '--break', '--command-id', '--timeout-ms'].includes(flag)) throw new UsageError(`Unknown option "${argument}"`);
    const value = equals < 0 ? argv[++i] : argument.slice(equals + 1);
    if (!value || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    values[flag] = value;
  }
  if (!values['--server']) {
    if (values['--break'] || values['--command-id'] || values['--timeout-ms'] || json) throw new UsageError('--break, --command-id, --timeout-ms and --json require --server attachment');
    return { mode: 'owned', projectRoot: values['--project'], planId: values['--plan'] ?? 'review-notes', model: values['--model'] };
  }
  if (values['--model']) throw new UsageError('Attachment uses the live server model. Configure --model on serve, not real-session --server.');
  for (const flag of ['--project', '--plan', '--break', '--command-id']) if (!values[flag]) throw new UsageError(`Attachment needs explicit ${flag}`);
  if (values['--break'] !== 'before-agent:engineer') throw new UsageError('Only --break before-agent:engineer is supported');
  const timeoutMs = values['--timeout-ms'] === undefined ? 120000 : Number(values['--timeout-ms']);
  if (!/^\d+$/.test(String(values['--timeout-ms'] ?? timeoutMs)) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new UsageError('--timeout-ms needs an integer from 1 to 2147483647');
  return { mode: 'attached', attached: { server: values['--server']!, projectRoot: values['--project']!, planId: values['--plan']!,
    commandId: values['--command-id']!, breakpoint: 'before-agent:engineer', timeoutMs, json } };
}
