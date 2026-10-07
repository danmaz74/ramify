import { finalCandidate } from './final-candidate.js';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import { scenariosCommit, scriptedGit } from './scripted-git.js';
import { fixtureScratchGit } from './mock-git.js';
import { commandResult } from './command-result.js';
import { scriptedConfiguredAudit } from './runs.js';
import { createMappedCheckExecution } from './direct-check-execution.js';
import { protocolScript, notesDirectory, draftsDirectory, outsidePath, longOutputBytes } from './protocol.js';
import type { CommandRequest } from '../../../subs/evidence/src/run-command.js';
import type { SessionSpec } from '../../../subs/agent/src/interfaces/port.js';

/** External responses for the two-work-item HTTP fixture. HTTP itself stays real. */
export function protocolPorts(root: string) {
  const final = finalCandidate(root, 'drafts-revision');
  const raw = fixtureScratchGit(scriptedGit(root, { previews: final.previews, head: 'protocol-base', checkpoints: [
    scenariosCommit('review-notes', 'scenarios-revision'),
    { gate: 'ga-0003', subject: 'wi-001.i02', commit: 'notes-revision', changes: [
      { status: 'M', path: `${notesDirectory}/src/notes.ts` },
    ] },
    { gate: 'ga-0004', subject: 'wi-001', commit: null, changes: [] },
    { gate: 'ga-0005', subject: 'wi-002.i01', commit: 'drafts-revision', changes: [
      'module.ramify', 'README.md', 'src/drafts.ts', 'src/tests/drafts.test.ts',
    ].map(path => ({ status: 'A', path: `${draftsDirectory}/${path}` })) },
    { gate: 'ga-0006', subject: 'wi-002', commit: null, changes: [] },
    { gate: 'ga-0007', subject: 'final verification of plan "review-notes"', commit: null, changes: [] },
  ] }));
  let outsidePresent = false;
  const git = Object.assign(Object.create(raw), {
    changedPaths: async (project: string, base?: string) => [...await raw.changedPaths(project, base), ...(outsidePresent ? [outsidePath] : [])],
    changedEntries: async (project: string, base?: string) => [...await raw.changedEntries(project, base), ...(outsidePresent ? [{ status: 'A', path: outsidePath }] : [])],
  }) as typeof raw;
  const script = protocolScript(root);
  return {
    git, candidates: final.candidates,
    configuredAudit: scriptedConfiguredAudit(root, {}),
    script: (spec: SessionSpec) => {
      const steps = typeof script === 'function' ? script(spec) : script;
      if (steps.some(step => step.kind === 'tool' && ['write', 'edit'].includes(step.tool))) git.givenWrites();
      return steps;
    },

    checkExecution: createMappedCheckExecution({ script: ({ check, context }) =>
      context.checkpoint === 'final' && check.kind === 'tests'
        ? { stdout: 'x'.repeat(longOutputBytes - 12) + '\nall passed\n' } : {} }),
    commandExecution: async (request: CommandRequest) => {
      if (request.argv[2]!.startsWith('printf ')) {
        expect(request.cwd).toBe(join(root, notesDirectory, 'src'));
        expect(request.argv).toEqual(['bash', '-c', `printf 'export const outside = true;\\n' > '${join(root, outsidePath)}'`]);
        await writeFile(join(root, outsidePath), 'export const outside = true;\n');
        outsidePresent = true;
      } else {
        expect(request.cwd).toBe(join(root, 'subs/workspace/subs/reviews/src'));
        expect(request.argv).toEqual(['bash', '-c', `rm '${join(root, outsidePath)}'`]);
        await rm(join(root, outsidePath));
        outsidePresent = false;
      }
      return commandResult(request, { outcome: { kind: 'completed', exitCode: 0 } });
    },
  };
}
