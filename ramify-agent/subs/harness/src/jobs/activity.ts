import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Activity } from '../interfaces/protocol/jobs.js';
import type { AgentEvent } from '../../subs/agent/src/interfaces/port.js';

const searchTools = new Set(['grep', 'find', 'ls']);

/**
 * The activity an agent event shows, or `undefined` when it shows nothing
 * worth recording, such as a tool that finished without error. Paths are
 * resolved against the session's working directory and shown relative to
 * the project root when they lie inside it.
 */
export function activityOf(event: AgentEvent, workingDirectory: string, projectRoot: string): Activity | undefined {
  switch (event.type) {
    case 'tool-started': {
      const input = (typeof event.input === 'object' && event.input !== null ? event.input : {}) as Record<string, unknown>;
      const text = (key: string): string | undefined => (typeof input[key] === 'string' ? input[key] as string : undefined);
      const shown = (path: string) => display(path, workingDirectory, projectRoot);
      if (event.tool === 'read') return { kind: 'read', callId: event.callId, path: shown(text('path') ?? '') };
      if (searchTools.has(event.tool)) {
        const path = text('path');
        const pattern = text('pattern');
        const query = event.tool === 'ls'
          ? shown(path ?? '.')
          : `${pattern ?? ''}${path ? ` in ${shown(path)}` : ''}${text('glob') ? ` (${text('glob')})` : ''}`;
        return { kind: 'search', callId: event.callId, tool: event.tool, query };
      }
      return { kind: 'tool', callId: event.callId, tool: event.tool };
    }
    case 'tool-finished':
      return event.isError
        ? { kind: 'tool-error', callId: event.callId, tool: event.tool, error: shorten(event.errorText ?? 'The tool reported an error', 2000) }
        : undefined;
    case 'message':
      return { kind: 'message', text: shorten(event.text, 500), usage: event.usage ?? null };
  }
}

function display(path: string, workingDirectory: string, projectRoot: string): string {
  const absolute = resolve(workingDirectory, path);
  const inside = relative(projectRoot, absolute);
  if (inside === '') return '.';
  if (inside.startsWith('..') || isAbsolute(inside)) return absolute;
  return inside.split(sep).join('/');
}

function shorten(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
