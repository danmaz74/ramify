import { finalCandidate } from './final-candidate.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import { scenariosCommit, scriptedGit } from './scripted-git.js';
import { fixtureScratchGit } from './mock-git.js';
import { commandResult } from './command-result.js';
import { createMappedCheckExecution } from './direct-check-execution.js';
import { protocolScript, notesDirectory, draftsDirectory, outsidePath, longOutputBytes } from './protocol.js';
import type { CommandRequest } from '../../../subs/evidence/src/run-command.js';
import type { SessionSpec } from '../../../subs/agent/src/interfaces/port.js';

/** External responses for the two-work-item HTTP fixture. HTTP itself stays real. */
export function protocolPorts(root: string) {
  const final = finalCandidate(root, 'drafts-revision');
  const git = fixtureScratchGit(scriptedGit(root, { previews: final.previews, head: 'protocol-base', checkpoints: [
    scenariosCommit('review-notes', 'scenarios-revision'),
    { subject: 'wi-001.i01', commit: 'notes-revision', changes: [
      { status: 'M', path: `${notesDirectory}/src/notes.ts` }, { status: 'A', path: outsidePath },
    ] },
    { subject: 'wi-001', commit: null, changes: [] },
    { subject: 'wi-002.i01', commit: 'drafts-revision', changes: [
      'module.ramify', 'README.md', 'src/drafts.ts', 'src/tests/drafts.test.ts',
    ].map(path => ({ status: 'A', path: `${draftsDirectory}/${path}` })) },
    { subject: 'wi-002', commit: null, changes: [] },
    { subject: 'final verification of plan "review-notes"', commit: null, changes: [] },
  ] }));
  const script = protocolScript(root);
  return {
    git, candidates: final.candidates,
    script: (spec: SessionSpec) => {
      const steps = typeof script === 'function' ? script(spec) : script;
      if (steps.some(step => step.kind === 'tool' && ['write', 'edit'].includes(step.tool))) git.givenWrites();
      return steps;
    },

    checkExecution: createMappedCheckExecution({ script: ({ check, context }) =>
      context.checkpoint === 'final' && check.kind === 'tests'
        ? { stdout: 'x'.repeat(longOutputBytes - 12) + '\nall passed\n' } : {} }),
    commandExecution: async (request: CommandRequest) => {
      expect(request.cwd).toBe(join(root, notesDirectory, 'src'));
      expect(request.argv).toEqual(['bash', '-c', `printf 'export const outside = true;\\n' > '${join(root, outsidePath)}'`]);
      // Explicit fixture effect of this one external command, no shell interpretation.
      await writeFile(join(root, outsidePath), 'export const outside = true;\n');
      return commandResult(request, { outcome: { kind: 'completed', exitCode: 0 } });
    },
  };
}
