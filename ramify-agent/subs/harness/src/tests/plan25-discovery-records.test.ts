import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { workOrientationJsonSchema, workOrientationSubmissionSchema, orientationPacket } from '../context-selection/submissions.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { assignmentBodySchema, assignmentErrors } from '../work/assignment.js';
import { capabilityEngineerSubmissionSchema, engineerSubmissionSchema, validateEngineer } from '../work/engineer.js';
import { iterationAssignmentSchema, iterationResultSchema, iterationLayout } from '../work/iterations.js';
import { startingPointSchema } from '../work/starting-points.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { assertUnchangedGit, openUnchangedRuns } from './helpers/unchanged-run.js';
import { installTestRunner, openRuns, runEventsOnDisk, runPath, staleCrashLock, startRun, until, freeze } from './helpers/runs.js';
import { scriptedCandidates } from './helpers/candidates.js';
import type { Role } from '../interfaces/protocol/runs.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { declaringScenarios } from './helpers/declarations.js';
import { scenariosCommit } from './helpers/scripted-git.js';

const points = [
  { path: 'subs/foreign/src/caller.ts', note: 'Existing caller; inspect compatibility.' },
  { path: 'src/tests/.ramify/external', note: 'Testing API view; preserve its coverage qualification.' },
  { path: 'missing/source.ts', note: 'Previously observed; inspect the current candidate.' },
];
const orientation = { focus: 'The caller', currentUnderstanding: 'It omits tone.', questions: [] };
const partial = { kind: 'partial' as const, done: ['Inspected the caller'], unfinished: ['Implement tone'], findings: [] };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); assertUnchangedGit(); });

function digest(text: string) { return createHash('sha256').update(text, 'utf8').digest('hex'); }

describe('D1–D3: optional explicit discovery records', () => {
  test('literal syntax is enforced in both the validator and actual tool JSON schema, without filesystem probes', () => {
    const delivered = z.toJSONSchema(startingPointSchema) as unknown as { properties: { path: { pattern: string } } };
    const pattern = new RegExp(delivered.properties.path.pattern, 'u');
    for (const path of ['.', 'src', 'subs/foreign/src/caller.ts', 'src/tests/.ramify/external', 'missing/source.ts', 'a file.ts']) {
      expect(startingPointSchema.safeParse({ path, note: 'Inspect here' }).success, path).toBe(true);
      expect(pattern.test(path), path).toBe(true);
    }
    for (const path of ['', '~/secret', '~user/file', '/tmp/a', '//host/a', 'C:/a', 'C:a', 'C:\\a', '../a', 'a/../b', 'a/./b', './a', 'a//b', 'a/', 'a/*', 'a/?', 'a/[xy]', 'a/{b,c}', 'a/@(b|c)', 'a/!(b)', 'a\nb']) {
      expect(startingPointSchema.safeParse({ path, note: 'Inspect here' }).success, path).toBe(false);
      expect(pattern.test(path), path).toBe(false);
      expect(workOrientationSubmissionSchema.safeParse({ ...orientation, startingPoints: [{ path, note: 'Inspect here' }] }).success).toBe(false);
      expect(assignmentBodySchema.safeParse({ ...assign('app').assignment, startingPoints: [{ path, note: 'Inspect here' }] }).success).toBe(false);
      expect(engineerSubmissionSchema.safeParse({ ...partial, startingPoints: [{ path, note: 'Inspect here' }] }).success).toBe(false);
    }
    for (const point of [{ path: 'src', note: '' }, { path: 'src', note: '  ' }, { path: 'src', note: 'Inspect', authority: 'write' }, { path: 1, note: 'Inspect' }]) expect(startingPointSchema.safeParse(point).success).toBe(false);
    expect(workOrientationSubmissionSchema.parse({ ...orientation, startingPoints: points }).startingPoints).toEqual(points);
    expect(JSON.stringify(workOrientationJsonSchema)).toContain('startingPoints');
  });

  test('omitted legacy orientation bytes and hash are unchanged, while explicit pairs are retained in its existing packet', () => {
    const text = '# Work orientation wi-001\n\n## Local architect briefing\n\nLegacy briefing\n\n## Local architect orientation\n\nFocus: The caller\nCurrent understanding: It omits tone.\nOpen questions:\nNone recorded.';
    expect(orientationPacket({ workItem: 'wi-001', briefing: 'Legacy briefing', submission: orientation })).toEqual({ text, hash: digest(text) });
    const packet = orientationPacket({ workItem: 'wi-001', briefing: 'Legacy briefing', submission: { ...orientation, startingPoints: points } });
    for (const point of points) expect(packet.text).toContain(JSON.stringify(point));
    expect(packet.hash).toBe(digest(packet.text));
    expect(packet.hash).not.toBe(digest(text));
  });

  test('ordinary/capability schemas share optional pairs without changing scope rules, obligations or completion', () => {
    for (const report of [completionProposed(), partial]) {
      expect(engineerSubmissionSchema.parse(report)).not.toHaveProperty('startingPoints');
      expect(capabilityEngineerSubmissionSchema.parse(report)).not.toHaveProperty('startingPoints');
      expect(engineerSubmissionSchema.parse({ ...report, startingPoints: points })).toHaveProperty('startingPoints', points);
      expect(capabilityEngineerSubmissionSchema.parse({ ...report, startingPoints: points })).toHaveProperty('startingPoints', points);
    }
    const body = assignmentBodySchema.parse(assign('app').assignment);
    const evidence = { index: null, registry: new Map(), outline: null };
    expect(assignmentErrors({ ...body, startingPoints: points }, evidence)).toEqual(assignmentErrors(body, evidence));
    expect(body).not.toHaveProperty('startingPoints');
    // A completion hint cannot substitute for an obligation binding or a partial report.
    expect(validateEngineer({ ...completionProposed(), startingPoints: points }, { assigned: ['ob-001'] }).ok).toBe(false);
    expect(validateEngineer({ ...partial, done: [], unfinished: [], startingPoints: points }).ok).toBe(false);
    expect(validateEngineer({ kind: 'unsuitable', reason: 'scope', detail: 'Outside scope', startingPoints: points }).ok).toBe(false);
  });

  test.each([false, true])('new captured packages carry schema and producer prose together (capability=%s)', async capabilityWorkflow => {
    const { packages } = await loadPromptPackages({ capabilityWorkflow });
    for (const role of ['local-architect', 'engineer', ...(capabilityWorkflow ? ['capability-architect'] : [])] as Role[]) {
      const loaded = packages.get(role)!;
      expect(loaded.submissionSchema).toContain('startingPoints');
      expect(loaded.procedure).toContain('startingPoints');
      expect(loaded.procedure).toContain('authorize no writes');
      expect(loaded.procedure).toContain('No extra discovery turn');
    }
    const local = packages.get('local-architect')!;
    expect(local.workOrientation?.submissionSchema).toContain('startingPoints');
    expect(local.workOrientation?.procedure).toContain('startingPoints');
  });

  test.each([['partial', 'submission'], ['completion-proposed', 'submission'], ['completion-proposed', 'passed-gate']] as const)('ordinary %s (%s) retains exact pairs through submission, crash recovery and result', async (kind, crash) => {
    const fixture = await copyFixture(); cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    let reached = false;
    const checks = [scenariosCommit('review-notes'), ...(kind === 'completion-proposed' ? ['wi-001.i01'] : []), 'wi-001', 'final verification of plan "review-notes"'];
    const fixed = { tree: 'a'.repeat(40), files: {}, base: 'scenarios-of-review-notes', changes: [] };
    const candidates = scriptedCandidates(fixture.root, { 'scenarios-of-review-notes': fixed, 'unchanged-fixture-revision': fixed, ['a'.repeat(40)]: fixed });
    const turns = byRole({
        'initial-architect': [submit(analysis([entry('review-note', 'collection-review/workspace/reviews')]))],
        'local-architect': [submit(assign('collection-review/workspace/reviews', { startingPoints: points }, outline())), submit(requestCompletion())],
        engineer: [submit({ ...(kind === 'partial' ? partial : completionProposed()), startingPoints: points })],
      });
    const wrapped = declaringScenarios(turns);
    const agent = createScriptedAgent(spec => spec.submission.name === 'submit_work_orientation'
      ? submit({ ...orientation, startingPoints: points }) : (typeof wrapped === 'function' ? wrapped(spec) : wrapped));
    const opened = await openUnchangedRuns(fixture.root, {
      unchangedCheckpoints: checks, previewCount: crash === 'passed-gate' ? 5 : 4, inputs: treeInputs(), candidates, agent,
      afterWrite: async (event, runId) => {
        if (crash === 'passed-gate') {
          const latest = (await runEventsOnDisk(fixture.root, 'review-notes', runId)).at(-1);
          if (event === 'gate-attempted' && latest?.type === 'gate-attempted' && latest.data.checkpoint === 'iteration') { reached = true; await freeze(); }
          return;
        }
        if (event !== 'invocation-ended') return;
        const events = await runEventsOnDisk(fixture.root, 'review-notes', runId);
        const ended = events.at(-1);
        if (ended?.type === 'invocation-ended' && events.some(e => e.type === 'invocation-started' && e.data.invocation === ended.data.invocation && e.data.role === 'engineer')) { reached = true; await freeze(); }
      },
    });
    // The frozen old service models the crashed process; it is never allowed to resume.
    const receipt = await opened.service.execute(startRun('review-notes'));
    await until(() => reached, 20_000);
    const assignmentPath = runPath(fixture.root, 'review-notes', receipt.jobId, iterationLayout.assignment('wi-001', 1));
    const assignmentBytes = await readFile(assignmentPath, 'utf8');
    expect(iterationAssignmentSchema.parse(JSON.parse(assignmentBytes)).startingPoints).toEqual(points);
    const originalEvents = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
    const oriented = originalEvents.find(event => event.type === 'work-orientation-recorded')!;
    if (oriented.type !== 'work-orientation-recorded' || oriented.data.packet === undefined) throw new Error('Missing orientation');
    const packetPath = runPath(fixture.root, 'review-notes', receipt.jobId, oriented.data.packet);
    const packetBytes = await readFile(packetPath, 'utf8');
    expect(digest(packetBytes)).toBe(oriented.data.packetHash);
    for (const point of points) expect(packetBytes).toContain(JSON.stringify(point));
    await staleCrashLock(fixture.root);
    const restored = await openRuns(fixture.root, {
      git: opened.git, candidates, inputs: treeInputs(),
      script: byRole({ 'local-architect': [submit(requestCompletion())] }),
    });
    cleanups.push(() => restored.service.close());
    await restored.service.settled('review-notes', receipt.jobId);
    expect(restored.service.getRun('review-notes', receipt.jobId)?.state, JSON.stringify((await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId)).slice(-5)) + restored.warnings.join('\n')).toBe('completed');
    const result = iterationResultSchema.parse(JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, iterationLayout.result('wi-001', 1)), 'utf8')));
    expect(result.startingPoints).toEqual(points);
    expect(result.outcome).toBe(kind === 'partial' ? 'partial' : 'accepted');
    expect(result.invocations).toHaveLength(1);
    expect(await readFile(assignmentPath, 'utf8')).toBe(assignmentBytes);
    expect(await readFile(packetPath, 'utf8')).toBe(packetBytes);
    // Historical committed shapes without the optional field remain strict readers' exact input.
    for (const [schema, current] of [[iterationAssignmentSchema, JSON.parse(assignmentBytes)], [iterationResultSchema, result]] as const) {
      const { startingPoints: _points, ...legacy } = current;
      const bytes = JSON.stringify(legacy);
      expect(schema.parse(JSON.parse(bytes))).toEqual(legacy);
      expect(digest(JSON.stringify(schema.parse(JSON.parse(bytes))))).toBe(digest(bytes));
    }
    expect(restored.agent?.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(0);
  }, 60_000);
});
