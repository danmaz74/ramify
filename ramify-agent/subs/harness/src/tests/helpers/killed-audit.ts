import { join } from 'node:path';

import { createAuditCheckExecution } from '../../../subs/audit/src/check-execution.js';
import { checkCommand } from '../../checks/records.js';
import { runGate } from '../../checks/gate.js';
import { createAuditWorkspaceOwnership } from '../../run/audit-workspaces.js';
import { runDirectory, runLayout } from '../../run/records.js';

const [mode, projectRoot, sourceCommit, marker] = process.argv.slice(2);
if (mode === undefined || projectRoot === undefined || sourceCommit === undefined || marker === undefined) {
  throw new Error('mode, project root, source commit and marker are required');
}

const runId = '20260921T000000Z-aabbcc';
const attemptId = 'ga-0001';
const stopAfterOwnerDies = `setInterval(() => { try { process.kill(${process.pid}, 0); } catch { process.exit(0); } }, 25)`;
const program = mode === 'pass'
  ? 'process.exit(0)'
  : `${mode === 'during-execution' ? `require('fs').writeFileSync(${JSON.stringify(marker)}, 'running');` : ''}${stopAfterOwnerDies}`;
const attempt = await runGate(
  createAuditCheckExecution({ workspaceOwnership: createAuditWorkspaceOwnership(projectRoot) }),
  'iteration',
  {
    id: attemptId,
    runId,
    projectRoot,
    directory: join(runDirectory(projectRoot, 'plan', runId), runLayout.gateOutput(attemptId)),
    head: sourceCommit,
    checks: [{
      kind: 'tests',
      command: checkCommand({ argv: [process.execPath, '-e', program], cwd: projectRoot, timeoutMs: 60_000 }),
    }],
  },
);
process.stdout.write(`${JSON.stringify(attempt)}\n`);
