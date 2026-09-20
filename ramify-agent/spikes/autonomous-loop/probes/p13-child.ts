/*
 * The second process for probe 13: it reopens a session file written by
 * another process and reports what the rebuilt context holds.
 */

import { open, workspace } from '../lib/probe.js';
import { text } from '../lib/scripted-provider.js';

const [file, cwd, sessionDirectory] = process.argv.slice(2);

const space = await workspace([text('a reply in the new process')], {}, { cwd, sessionDirectory });
try {
  const it = await open({ workspace: space, session: { mode: 'open', file: file! }, tools: ['note'] });
  const rendered = JSON.stringify(it.session.messages);
  console.log(JSON.stringify({
    messages: it.session.messages.length,
    entries: it.session.sessionManager.getEntries().length,
    hasToolResult: rendered.includes('noted:'),
    hasBrief: rendered.includes('BRIEF-ACROSS-RESTART'),
    hasAssistantText: rendered.includes('ARBOREAL'),
    contextUsage: it.session.getContextUsage(),
  }));
  it.close();
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
} finally {
  await space.remove();
}
