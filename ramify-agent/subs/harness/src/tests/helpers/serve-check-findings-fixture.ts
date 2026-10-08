import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createScriptedAgent, type ScriptStep } from '../../../subs/agent/src/scripted.js';
import { startServerWith } from '../../http/server.js';
import { protocolPaths } from '../../interfaces/protocol/paths.js';
import { commandResponseSchema } from '../../interfaces/protocol/jobs.js';
import { checkFindingDetailSchema } from '../../interfaces/protocol/check-findings.js';
import { snapshotToolNames } from '../../reviews/snapshot.js';
import { scriptedCandidates, testReviewPolicy, type ScriptedCommit } from './candidates.js';
import { concern, disposition, reconcile, review, submission } from './check-findings-composition.js';
import { declaringScenarios } from './declarations.js';
import { createPassingCheckExecution } from './direct-check-execution.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { gateGit, scenariosCommit } from './gate-git.js';
import { completionProposed, submit, treeInputs, write } from './iterations.js';
import {
  base, candidates, limit, materialized, notesDirectory, plan, reviewScript, reviewTarget, revisionGates, store, tool, unchanged,
} from './reviews.js';
import { startRun, testPolicy, until } from './runs.js';
import { passingAudit } from './direct-check-execution.js';

/*
 * Serves one live CheckFinding run to the built web client, for the browser
 * witness of Plan 12 iteration 8. The run is the review tests' work item of
 * three iterations, each reviewed by code, scope and design readers, driven
 * by the scripted fake through the real harness server: its readers raise
 * three concerns and one scope review is partial; the reconciliation asks
 * the person about the first concern, defers the second and waives the
 * third as a reported material choice, and the work item waits for the
 * answer. Once the person answers, the next round settles the answered
 * concern and leaves what is below its floor, and the run completes.
 *
 *   npm run build:web
 *   npx tsx subs/harness/src/tests/helpers/serve-check-findings-fixture.ts [--port 4190] [--out run.json]
 *
 * It prints, and writes to `--out`, the origin, the run's page and its IDs
 * once the decision is pending. SIGINT or SIGTERM closes the server and
 * removes the project copy. It never calls a model.
 */

const assetsDirectory = fileURLToPath(new URL('../../../../../dist/web', import.meta.url));
const option = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};

const cleanups: Array<() => Promise<void>> = [];
// The run service's waits hold no handle of their own: this keeps the process alive until a signal stops it.
const alive = setInterval(() => undefined, 60_000);
const root = await reviewTarget(cleanups);

const principles = 'docs/notes.principles.md';
const readme = `${notesDirectory}/README.md`;
const index = `${notesDirectory}/src/index.ts`;
/** The review tests' candidates, with a principles document and the module's README as design guidance. */
function commits(): Record<string, ScriptedCommit> {
  const scripted = candidates();
  const guidance = { [principles]: 'A note belongs to exactly one review run.\n', [readme]: 'Notes keep one note per review run.\n' };
  return Object.fromEntries(Object.entries(scripted).map(([commit, entry]) => [commit, { ...entry, files: { ...entry.files, ...guidance } }]));
}

const options = [
  { id: 'one-note', summary: 'Keep one note per review run', consequence: 'The plan stands; the reviewer\'s request is declined.' },
  { id: 'many-notes', summary: 'Allow several notes', consequence: 'The plan\'s constraint changes, which a person must approve.' },
];
const orientation: ScriptStep[] = [{ kind: 'submit', input: { read: [principles, readme], summary: 'A note belongs to one review run.' } }];
const script = reviewScript({
  engineer: [
    submit(completionProposed('Added the note store.'), write(store, 'export const store = new Map(); // v1\n')),
    submit(completionProposed('Stated the note limit.'), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')),
    submit(completionProposed('Exported the store.'), write(store, 'export const store = new Map(); // v3\n'), write(index, 'export * from \'./store.js\';\n')),
  ],
  reviewers: {
    'orientation': orientation,
    'rq-0001': review([store], [concern(store, 'A review run should keep several notes', 'high')]),
    'rq-0002': review([store]),
    'rq-0003': review([store]),
    'rq-0004': review([limit], [concern(limit, 'The limit should count bytes', 'medium')]),
    // A partial scope review: the limit was not inspected.
    'rq-0005': [tool(snapshotToolNames.list, { path: `${notesDirectory}/src` }), { kind: 'submit', input: { inspected: [], missing: [{ path: limit, reason: 'The reader ran out of its time budget' }], concerns: [] } }],
    'rq-0006': review([limit]),
    'rq-0007': review([store, index], [concern(store, 'The store could be a plain object', 'low')]),
    'rq-0008': review([store, index]),
    'rq-0009': review([store, index]),
  },
  reconcilers: {
    'wi-001.rc01': reconcile(submission([
      disposition('cf-0001', { action: 'request-user-decision', conflicts: [{ document: 'plan', text: 'A note belongs to exactly one review run.' }], options }),
      disposition('cf-0002', { action: 'defer', revisit: 'When a caller needs a byte limit.' }),
      disposition('cf-0003', { action: 'waive', uncertainty: 'A plain object would serve as well.' }, {
        communication: { mode: 'report', choice: 'The store stays a Map.', uncertainty: 'A plain object would serve as well.', reason: 'It departs from the reviewer\'s suggestion.' },
      }),
    ], { kind: 'await-user' })),
    // After the answer: the answered concern is waived under the person's
    // choice, and a signal whose waiver the person revoked is left below the floor.
    'wi-001.rc02': reconcile(
      submission([
        disposition('cf-0001', { action: 'waive', uncertainty: 'None: the person chose one note per run.' }),
        disposition('cf-0003', { action: 'leave' }),
      ], { kind: 'unresolved' }),
      submission([disposition('cf-0001', { action: 'waive', uncertainty: 'None: the person chose one note per run.' })], { kind: 'complete' }),
    ),
  },
});
const git = gateGit(root, { head: base, commits: [scenariosCommit(plan, materialized, base), ...revisionGates, unchanged, unchanged] });
const agent = createScriptedAgent(declaringScenarios(script));
const server = await startServerWith({
  projectRoot: root,
  port: Number(option('--port') ?? 0),
  assetsDirectory,
  ramify: new FakeRamifyCli(),
  agent,
  runs: {
    inputs: treeInputs(),
    git: git.git,
    candidates: scriptedCandidates(root, commits()),

    configuredAudit: passingAudit(),
    policy: projectRoot => testPolicy(projectRoot, { reviews: testReviewPolicy({ kinds: ['code', 'scope', 'design'], concurrency: 1, settleMs: 120_000 }) }),
    stopGraceMs: 500,
    warn: () => undefined,
  },
});
if (!server.servesWebClient) console.warn(`The web client is not built in ${assetsDirectory}; run \`npm run build:web\`.`);

const started = await fetch(`${server.url}${protocolPaths.commands}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(startRun(plan, 'scripted', `check-findings-fixture-${Date.now()}`)),
});
if (started.status !== 202) throw new Error(`The run was not started: ${started.status} ${await started.text()}`);
const { receipt: { jobId: runId } } = commandResponseSchema.parse(await started.json());
// The fixture is ready once the person's decision is pending.
await until(async () => {
  const response = await fetch(`${server.url}${protocolPaths.runCheckFinding(plan, runId, 'cf-0001')}`);
  if (response.status !== 200) return false;
  return checkFindingDetailSchema.parse(await response.json()).summary.pendingUserDecision !== null;
}, 60_000);

const description = {
  url: server.url,
  root,
  pid: process.pid,
  planId: plan,
  runId,
  page: `${server.url}/#/plans/${encodeURIComponent(plan)}/runs/${encodeURIComponent(runId)}`,
};
console.log(JSON.stringify(description, null, 2));
const out = option('--out');
if (out !== undefined) await writeFile(out, JSON.stringify(description, null, 2));

let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  clearInterval(alive);
  void server.close()
    .then(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); })
    .then(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
