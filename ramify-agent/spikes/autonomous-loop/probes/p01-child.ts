/*
 * The second process for probes 1 and 13: it opens a session file written by
 * another process and reports whether the rebuilt context carries the earlier
 * turn into the model request.
 */

import { open, requestText, workspace } from '../lib/probe.js';
import { text } from '../lib/scripted-provider.js';

const [file, cwd, sessionDirectory] = process.argv.slice(2);

const space = await workspace([text('reply in the new process')], {}, { cwd, sessionDirectory });
try {
  const session = await open({ workspace: space, session: { mode: 'open', file: file! }, tools: [] });
  const before = session.session.messages.length;
  await session.session.prompt('what was the word?');
  const sent = requestText(space.scripted, 0);
  session.close();
  console.log(JSON.stringify({
    messages: before,
    carried: sent.includes('ARBOREAL') && sent.includes('first reply'),
    requestMessages: space.scripted.requests[0]?.messages.length ?? 0,
  }));
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
} finally {
  await space.remove();
}
