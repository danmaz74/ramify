import { writeFileSync } from 'node:fs';

import { createConfiguredAudit } from '../../../subs/audit/src/check-execution.js';
import { createAuditWorkspaceOwnership } from '../../run/audit-workspaces.js';

/*
 * One configured audit in its own process, for a test to kill. The fixture's
 * committed check reads what to do from the environment this process gives
 * it: write the marker and wait (`during-execution`), wait without it
 * (`after-creation`), or pass. A waiting check stops once this process dies.
 */

const [mode, projectRoot, sourceCommit, marker] = process.argv.slice(2);
if (mode === undefined || projectRoot === undefined || sourceCommit === undefined || marker === undefined) {
  throw new Error('mode, project root, source commit and marker are required');
}
writeFileSync(`${projectRoot}.killed-audit.json`, JSON.stringify({ mode, marker, owner: process.pid }));

const audit = createConfiguredAudit({ workspaceOwnership: createAuditWorkspaceOwnership(projectRoot) });
const configuration = await audit.read(projectRoot, sourceCommit);
const result = await audit.run({
  projectRoot, sourceCommit, configuration, mode: 'full', runId: '20260921T000000Z-aabbcc', attemptId: 'ga-0001',
});
process.stdout.write(`${JSON.stringify({ status: result.status, auditedSourceCommit: result.auditedSourceCommit, reportCommit: result.reportCommit, detail: result.detail })}\n`);
