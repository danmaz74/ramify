/*
 * Probe 3: fork from an oriented point.
 *
 * The parent runs three turns. A fork is taken at the entry that ends the
 * first turn. The probe reports whether the fork starts from that point, does
 * not inherit the parent's later entries, and leaves the parent's file and
 * leaf untouched.
 */

import { SessionManager } from '@earendil-works/pi-coding-agent';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attempt, Log, open, requestText, result, workspace, type Probe } from '../lib/probe.js';
import { text } from '../lib/scripted-provider.js';

const hash = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);

export const probe: Probe = {
  number: 3,
  title: 'Fork from an oriented point',
  async run() {
    const log = new Log();
    const space = await workspace([text('reply ALPHA'), text('reply BETA'), text('reply GAMMA'), text('reply from the fork')]);
    try {
      const parent = await open({ workspace: space, session: { mode: 'create' }, tools: [] });
      await parent.session.prompt('turn one mentions ALPHA');
      const afterFirstTurn = parent.session.sessionManager.getLeafId();
      await parent.session.prompt('turn two mentions BETA');
      await parent.session.prompt('turn three mentions GAMMA');
      const file = parent.session.sessionFile!;
      const parentLeaf = parent.session.sessionManager.getLeafId();
      const parentEntries = parent.session.sessionManager.getEntries().length;
      const before = hash(file);
      log.show('forkPointEntryId', afterFirstTurn !== null);
      log.show('parentEntries', parentEntries);
      parent.close();

      // The fork: a new session file holding only root to the chosen entry.
      const source = SessionManager.open(file, space.sessionDirectory);
      const forkFile = source.createBranchedSession(afterFirstTurn!);
      log.show('forkFileCreated', forkFile !== undefined && forkFile !== file);
      if (forkFile === undefined) return result(probe, 'unavailable', log, 'createBranchedSession returned no file.');

      const fork = await open({ workspace: space, session: { mode: 'open', file: forkFile }, tools: [] });
      log.show('forkEntries', fork.session.sessionManager.getEntries().length);
      await fork.session.prompt('what do you remember?');
      const sent = requestText(space.scripted, 3);
      const hasAlpha = sent.includes('ALPHA');
      const hasBeta = sent.includes('BETA');
      const hasGamma = sent.includes('GAMMA');
      log.show('forkRequestHas', { ALPHA: hasAlpha, BETA: hasBeta, GAMMA: hasGamma });
      fork.close();

      // The parent, reopened, is unchanged.
      const after = hash(file);
      const reopened = SessionManager.open(file, space.sessionDirectory);
      log.show('parentFileUnchanged', before === after);
      log.show('parentLeafUnchanged', reopened.getLeafId() === parentLeaf);
      log.show('parentEntriesUnchanged', reopened.getEntries().length === parentEntries);

      if (!hasAlpha) return result(probe, 'unavailable', log, 'The fork did not start from the chosen entry.');
      if (hasBeta || hasGamma) return result(probe, 'unavailable', log, 'The fork inherited the parent’s later entries.');
      if (before !== after || reopened.getLeafId() !== parentLeaf) {
        return result(probe, 'verified-with-limitation', log, 'The fork mutated the parent session file.');
      }
      return result(probe, 'verified', log, 'The fork is `SessionManager.open(parent).createBranchedSession(entryId)`, which writes a new file. `AgentSessionRuntime.fork` was not used: it replaces the runtime’s current session rather than producing a second one, so it does not fit a harness that keeps the parent open.');
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
