import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { implementationMapSchema, type MapSubmission } from '../interfaces/map.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';
import { CommandRejection, type JobService } from '../jobs/service.js';
import { architectProcedure } from '../mapping/architect.js';
import { privateRamify, RamifyCli } from '../mapping/ramify-cli.js';
import { copyFixture } from './helpers/fixture.js';
import { eventsOnDisk, openJobs, start, until } from './helpers/jobs.js';

/*
 * The mapping job on real evidence: the architect procedure materializes the
 * fixture's views through the `ramify` CLI, with a daemon of this file's
 * own, and the scripted fake plays the architect.
 */

const plan = 'review-notes';
const root = 'collection-review';
const reviews = `${root}/workspace/reviews`;
const contracts = `${root}/workspace/contracts`;
const catalog = `${root}/workspace/catalog`;
const vocabularyRecord = 'subs/workspace/subs/reviews/src/.ramify/external/subs/workspace/subs/contracts/src/interfaces/vocabulary.ts.md';

let ramify: Awaited<ReturnType<typeof privateRamify>>;
beforeAll(async () => { ramify = await privateRamify(); });
afterAll(async () => { await ramify.dispose(); });

let fixture: Awaited<ReturnType<typeof copyFixture>>;
const services: JobService[] = [];
beforeEach(async () => { fixture = await copyFixture(); });
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  await fixture.remove();
});

async function open(script: ScriptStep[] | ((spec: SessionSpec) => ScriptStep[]), cli: RamifyCli = ramify.ramify) {
  const opened = await openJobs(fixture.root, script, { procedure: architectProcedure({ ramify: cli, freshContextPerJob: true }) });
  services.push(opened.service);
  return opened;
}

/** A map of the review-notes plan whose every claim holds against the fixture's views. */
function reviewNotesMap(overrides: Partial<MapSubmission> = {}): MapSubmission {
  return {
    summary: { change: 'Reviewers attach notes to a review run; the notes are kept with the review session.', preserves: ['The catalog side does not depend on the review side.'] },
    modulesTouched: [
      { module: reviews, weight: 'heavy', why: 'It owns review sessions and their adapters.' },
      { module: `${root}/workspace/reviews/ui`, weight: 'light', why: 'It shows the notes.' },
    ],
    reuse: [{
      capability: 'Identify the record a note is about',
      symbols: [{ name: 'recordIdSchema', owner: contracts }],
      requester: { module: reviews, area: 'src' },
      availability: { status: 'available', record: vocabularyRecord, importSpelling: "import { recordIdSchema } from '../../contracts/src/interfaces/vocabulary.js';" },
    }],
    newCapabilities: [{ capability: 'Review notes', goal: 'Keep a reviewer\'s notes with the review session.', owner: reviews, consumers: [`${root}/workspace/reviews/ui`] }],
    seams: [],
    entryPoint: { module: reviews, acceptance: 'A note added to a review run is returned with the session.' },
    workItems: [{ title: 'Review notes', subtreeRoot: reviews, capabilities: ['Review notes'] }],
    assumptions: { assumed: [], notFound: [], coverageLimits: ['The API views of reviews report coverage limits.'] },
    evidence: [{ claim: 'recordIdSchema is exposed by contracts.', citations: [{ kind: 'view-record', path: '.ramify-architect/workspace/contracts/behavior.jsonl' }] }],
    ...overrides,
  };
}

const orient: ScriptStep = { kind: 'tool', tool: 'read', input: { path: '.ramify-architect/README.md' } };
const materialize = (module: string): ScriptStep => ({ kind: 'tool', tool: 'materialize_api_view', input: { module } });

/** Every file outside the harness's records and Ramify's generated views, by content hash. */
async function projectFiles(directory: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const name = relative(directory, path).split(sep).join('/');
      if (entry.name === '.harness' || entry.name === '.ramify' || entry.name === '.ramify-architect' || /^plans\/[^/]+\/map$/.test(name)) continue;
      if (entry.isDirectory()) await walk(path);
      else files.set(name, createHash('sha256').update(await readFile(path)).digest('hex'));
    }
  };
  await walk(directory);
  return files;
}

async function rejection(promise: Promise<unknown>): Promise<CommandRejection> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandRejection) return error;
    throw error;
  }
  throw new Error('The command was accepted');
}

describe('a mapping job on real evidence', () => {
  test('materializes the architect view into the manifest, gives the architect its prompt and tools, and saves a valid map', async () => {
    const before = await projectFiles(fixture.root);
    const { service, agent } = await open([orient, materialize(reviews), { kind: 'submit', input: reviewNotesMap() }]);
    const receipt = await service.execute(start(plan));
    await service.settled(plan, receipt.jobId);
    const job = service.getJob(plan, receipt.jobId)!;
    expect(job).toMatchObject({ state: 'completed', revision: 1, failure: null, inputs: { architectView: 'materialized' } });

    // The manifest names the view the job worked from, written before the first event.
    const meta = JSON.parse(await readFile(join(fixture.root, '.ramify-architect', '_meta.json'), 'utf8')) as { revision: string; input: string };
    const record = JSON.parse(await readFile(join(fixture.root, 'plans', plan, '.harness', 'jobs', receipt.jobId, 'job.json'), 'utf8'));
    expect(record.manifest.architectView).toEqual({
      status: 'materialized', revision: meta.revision, input: meta.input,
      coverageLimits: expect.arrayContaining([expect.stringMatching(/^unknownShapes: \d+$/)]),
    });
    expect(record.manifest.versions).toEqual({
      architectPrompt: expect.stringMatching(/^1\+sha256:[0-9a-f]{16}$/),
      procedure: expect.stringMatching(/^1\+sha256:[0-9a-f]{16}$/),
      skill: expect.stringMatching(/^sha256:[0-9a-f]{16}$/),
      ramify: expect.any(String),
    });

    // The architect's session: the skill with the bridge for its materialize step, the plan and the tools.
    const spec = agent!.sessions[0]!.spec;
    expect(spec.role).toBe('architect');
    expect(spec.scope.workingDirectory).toBe(fixture.root);
    expect(spec.systemPrompt).toContain('# Module architect');
    expect(spec.systemPrompt).toContain('`materialize_api_view` with the requester\'s module replaces');
    expect(spec.systemPrompt).toContain('## The feature-mapping procedure');
    expect(spec.systemPrompt).toContain('"modulesTouched"');
    expect(spec.systemPrompt).not.toMatch(/\{\{\w+\}\}|<!--/);
    expect(spec.prompt).toContain(await readFile(join(fixture.root, 'plans', plan, 'plan.md'), 'utf8').then(text => text.trim()));
    expect(spec.prompt).toContain(meta.revision);
    expect(spec.builtinTools).toEqual(['read', 'grep', 'ls']);
    expect(spec.tools.map(tool => tool.name)).toEqual(['materialize_api_view']);
    expect(spec.submission.name).toBe('submit_implementation_map');

    // The API views the architect asked for are recorded as evidence.
    const events = await eventsOnDisk(fixture.root, plan, receipt.jobId);
    const evidence = events.find(event => event.type === 'api-view-materialized');
    expect(evidence?.data).toEqual({
      module: reviews,
      views: [
        { area: 'src', path: 'subs/workspace/subs/reviews/src/.ramify', revision: meta.revision, coverage: expect.any(Number) },
        { area: 'src/tests', path: 'subs/workspace/subs/reviews/src/tests/.ramify', revision: meta.revision, coverage: expect.any(Number) },
      ],
    });
    expect(events.map(event => event.type)).toEqual([
      'job-started', 'activity', 'activity', 'api-view-materialized', 'activity', 'submission-accepted', 'map-validated', 'job-completed',
    ]);

    const saved = implementationMapSchema.parse(JSON.parse(await readFile(join(fixture.root, 'plans', plan, 'map', '001.json'), 'utf8')));
    expect(saved.identity.manifest).toEqual(record.manifest);
    expect(saved.reuse).toEqual(reviewNotesMap().reuse);

    // Mapping changed no source, declaration or plan.
    expect(await projectFiles(fixture.root)).toEqual(before);
    // The harness's records and the saved map are kept out of Ramify's inputs: materializing
    // again after publication gives the manifest's input identity, as an approval will need.
    for (const directory of ['plans/.harness', `plans/${plan}/.harness`, `plans/${plan}/map`]) {
      expect(existsSync(join(fixture.root, directory, 'tsconfig.json'))).toBe(true);
    }
    expect(await ramify.ramify.materialize(fixture.root)).toMatchObject({ ok: true });
    const again = JSON.parse(await readFile(join(fixture.root, '.ramify-architect', '_meta.json'), 'utf8')) as { input: string; dependencies: string };
    expect(again).toMatchObject({ input: record.manifest.architectView.input, dependencies: 'measured' });
  }, 120_000);

  test('an invalid submission is corrected once', async () => {
    const invalid = reviewNotesMap({
      modulesTouched: [{ module: reviews, weight: 'heavy', why: 'w' }, { module: `${root}/workspace/notes`, weight: 'light', why: 'w' }],
      reuse: [{ ...reviewNotesMap().reuse[0]!, symbols: [{ name: 'recordIdSchema', owner: catalog }] }],
    });
    const { service, agent } = await open([materialize(reviews), { kind: 'submit', input: invalid }, { kind: 'submit', input: reviewNotesMap() }]);
    const receipt = await service.execute(start(plan));
    await service.settled(plan, receipt.jobId);
    expect(service.getJob(plan, receipt.jobId)).toMatchObject({ state: 'completed', revision: 1, totals: { rejectedSubmissions: 1 } });
    const events = await eventsOnDisk(fixture.root, plan, receipt.jobId);
    const rejected = events.find(event => event.type === 'submission-rejected');
    expect(rejected?.data).toEqual({
      attempt: 1,
      errors: [
        `modulesTouched.1.module: "${root}/workspace/notes" is not a module of the architect view and is not marked proposed in modulesTouched`,
        `reuse.0.symbols.0: the architect view records no exported "recordIdSchema" owned by "${catalog}"`,
      ],
    });
    expect(events.find(event => event.type === 'submission-accepted')?.data).toEqual({ attempt: 2 });
    expect(agent!.sessions[0]!.verdicts).toEqual([{ accepted: false, errors: rejected!.data.errors }, { accepted: true }]);
  }, 120_000);

  test('an availability the requester\'s API view contradicts is rejected, and the job fails after the bound', async () => {
    const claimsCatalogRouter = reviewNotesMap({
      reuse: [{
        capability: 'Route catalog calls', symbols: [{ name: 'createCatalogRouter', owner: catalog }], requester: { module: reviews, area: 'src' },
        availability: { status: 'available', record: vocabularyRecord, importSpelling: 'import { createCatalogRouter } from …' },
      }],
    });
    const deniesVocabulary = reviewNotesMap({
      reuse: [{ ...reviewNotesMap().reuse[0]!, availability: { status: 'unavailable', exposures: [{ module: contracts, declaration: 'expose-src recordIdSchema from "interfaces/vocabulary.ts" to parent' }] } }],
    });
    const { service } = await open([
      materialize(reviews),
      { kind: 'submit', input: claimsCatalogRouter },
      { kind: 'submit', input: deniesVocabulary },
      { kind: 'submit', input: claimsCatalogRouter },
      { kind: 'submit', input: reviewNotesMap() },
    ]);
    const receipt = await service.execute(start(plan));
    await service.settled(plan, receipt.jobId);

    const job = service.getJob(plan, receipt.jobId)!;
    expect(job).toMatchObject({ state: 'failed', failure: { reason: 'invalid-submission' }, totals: { rejectedSubmissions: 3 } });
    const rejections = (await eventsOnDisk(fixture.root, plan, receipt.jobId)).filter(event => event.type === 'submission-rejected');
    expect(rejections.map(event => event.data.errors)).toEqual([
      [
        expect.stringMatching(/^reuse\.0\.availability: "createCatalogRouter" of collection-review\/workspace\/catalog is not in subs\/workspace\/subs\/reviews\/src\/\.ramify, the API view of collection-review\/workspace\/reviews \(src\), so the view does not show it available/),
        `reuse.0.availability.record: ${vocabularyRecord} lists none of the reused symbols`,
      ],
      [
        `reuse.0.availability: "recordIdSchema" of ${contracts} is listed in ${vocabularyRecord}, so it is available to ${reviews} (src), not unavailable`,
        expect.stringMatching(/^reuse\.0\.availability: subs\/workspace\/subs\/reviews\/src\/\.ramify reports coverage limits \(\d+\); absence from an incomplete view does not establish "unavailable"/),
      ],
      expect.any(Array),
    ]);
    expect(existsSync(join(fixture.root, 'plans', plan, 'map', '001.json'))).toBe(false);
  }, 120_000);

  test('an availability stated for a requester whose view the job never materialized is rejected', async () => {
    const neverMaterialized = reviewNotesMap({
      reuse: [{ ...reviewNotesMap().reuse[0]!, requester: { module: catalog, area: 'src' } }],
    });
    const { service } = await open([materialize(reviews), { kind: 'submit', input: neverMaterialized }, { kind: 'submit', input: reviewNotesMap() }]);
    const receipt = await service.execute(start(plan));
    await service.settled(plan, receipt.jobId);
    expect(service.getJob(plan, receipt.jobId)).toMatchObject({ state: 'completed' });
    const rejected = (await eventsOnDisk(fixture.root, plan, receipt.jobId)).find(event => event.type === 'submission-rejected');
    expect(rejected?.data.errors).toEqual([
      expect.stringMatching(new RegExp(`^reuse\\.0\\.availability: "available" is stated for ${catalog} \\(src\\), whose API view this job never materialized`)),
    ]);
  }, 120_000);

  test('a source change seen by a materialization during the job fails it as inputs changed and saves nothing', async () => {
    const { service } = await open([orient, { kind: 'wait', ms: 1500 }, materialize(reviews), { kind: 'submit', input: reviewNotesMap() }]);
    const receipt = await service.execute(start(plan));
    await until(async () => (await eventsOnDisk(fixture.root, plan, receipt.jobId)).some(event => event.type === 'activity'), 20_000);
    await appendFile(join(fixture.root, 'subs/workspace/subs/reviews/src/router.ts'), '\n// changed during the job\n');
    await service.settled(plan, receipt.jobId);

    const job = service.getJob(plan, receipt.jobId)!;
    expect(job).toMatchObject({ state: 'failed', failure: { reason: 'inputs-changed' }, revision: null });
    const failed = (await eventsOnDisk(fixture.root, plan, receipt.jobId)).find(event => event.type === 'job-failed');
    expect(failed?.data.diagnostics).toEqual([expect.stringMatching(/^The architect view's input identity is now input\/1:\w+, not input\/1:\w+/)]);
    expect((await eventsOnDisk(fixture.root, plan, receipt.jobId)).some(event => event.type === 'submission-accepted')).toBe(false);
    expect(existsSync(join(fixture.root, 'plans', plan, 'map', '001.json'))).toBe(false);
    expect(existsSync(join(fixture.root, 'plans', plan, '.harness', 'jobs', receipt.jobId, 'output', 'map.json'))).toBe(false);
  }, 120_000);

  test('a source change found by the check before publication fails the job as inputs changed and saves nothing', async () => {
    const { service } = await open([materialize(reviews), orient, { kind: 'wait', ms: 1500 }, { kind: 'submit', input: reviewNotesMap() }]);
    const receipt = await service.execute(start(plan));
    await until(async () => (await eventsOnDisk(fixture.root, plan, receipt.jobId)).some(event => event.type === 'activity' && event.data.activity.kind === 'read'), 20_000);
    await appendFile(join(fixture.root, 'subs/workspace/subs/contracts/src/interfaces/vocabulary.ts'), '\n// changed during the job\n');
    await service.settled(plan, receipt.jobId);

    expect(service.getJob(plan, receipt.jobId)).toMatchObject({ state: 'failed', failure: { reason: 'inputs-changed' }, revision: null });
    const events = await eventsOnDisk(fixture.root, plan, receipt.jobId);
    expect(events.map(event => event.type).slice(-2)).toEqual(['submission-accepted', 'job-failed']);
    expect(existsSync(join(fixture.root, 'plans', plan, 'map', '001.json'))).toBe(false);
  }, 120_000);

  test('a start whose evidence cannot be materialized is refused and creates no job', async () => {
    const { service } = await open([{ kind: 'submit', input: reviewNotesMap() }], new RamifyCli({ executable: join(fixture.root, 'no-such-ramify') }));
    const refused = await rejection(service.execute(start(plan)));
    expect(refused.code).toBe('unavailable');
    expect(refused.message).toMatch(/^The architect view could not be materialized/);
    expect(service.listJobs(plan)).toEqual([]);
    expect(await readdir(join(fixture.root, 'plans', plan, '.harness'))).toEqual(['tsconfig.json']);
  }, 60_000);
});
