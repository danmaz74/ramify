import { readdir } from 'node:fs/promises';
import { expect } from 'vitest';
import {
  assistantText, type AgentEvent, type AssistantBlock, type ContentBlock,
} from '../../../subs/agent/src/interfaces/port.js';
import type { TranscriptBody, TranscriptEntry } from '../../interfaces/protocol/transcripts.js';
import type { ContentStore } from '../../transcripts/store.js';
import { readBody } from '../../transcripts/writer.js';

/*
 * Reading a transcript back into the port events it was written from, for
 * tests that compare the two. Only the events a transcript keeps come back:
 * messages, compactions and retries.
 */

/** The port events a transcript records: its messages, compactions and retries. */
export function transcribed(events: readonly AgentEvent[]): AgentEvent[] {
  return events.filter(event => event.type === 'message' || event.type === 'compaction' || event.type === 'retry');
}

/** The port events the entries were written from, with every body read back. */
export async function portEventsOf(entries: readonly TranscriptEntry[], root: string, store: ContentStore): Promise<AgentEvent[]> {
  const body = async (stored: TranscriptBody): Promise<string> => {
    const content = await readBody(root, store, stored);
    expect(content, `the body ${JSON.stringify(stored)} can be read`).not.toBeNull();
    return content!;
  };
  const content = async (blocks: Extract<TranscriptEntry, { role: 'user' }>['blocks']): Promise<ContentBlock[]> => {
    const read: ContentBlock[] = [];
    for (const block of blocks) {
      read.push(block.type === 'text' ? { type: 'text', text: await body(block.body) } : block);
    }
    return read;
  };
  const events: AgentEvent[] = [];
  for (const entry of entries) {
    if (entry.type === 'message') {
      if (entry.role === 'user') {
        events.push({ type: 'message', role: 'user', blocks: await content(entry.blocks) });
      } else if (entry.role === 'tool-result') {
        events.push({
          type: 'message', role: 'tool-result', callId: entry.callId, tool: entry.tool, isError: entry.isError,
          blocks: await content(entry.blocks),
        });
      } else {
        const blocks: AssistantBlock[] = [];
        for (const block of entry.blocks) {
          if (block.type === 'text') blocks.push({ type: 'text', text: await body(block.body) });
          else if (block.type === 'thinking') blocks.push({ type: 'thinking', visibility: block.visibility, text: await body(block.body) });
          else if (block.type === 'tool-call') {
            blocks.push({ type: 'tool-call', callId: block.callId, tool: block.tool, action: block.action, input: JSON.parse(await body(block.input)) as unknown });
          } else blocks.push(block);
        }
        events.push({ type: 'message', role: 'assistant', blocks, text: assistantText(blocks), usage: entry.usage, detail: entry.detail });
      }
    } else if (entry.type === 'compaction' || entry.type === 'retry') {
      const { n: _n, at: _at, invocation: _invocation, ...event } = entry;
      events.push(event as AgentEvent);
    }
  }
  return events;
}

/** The blobs a content store holds. */
export async function blobsIn(directory: string): Promise<string[]> {
  return readdir(directory).then(names => names.filter(name => /^[0-9a-f]{64}$/.test(name)).sort(), () => []);
}
