import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { planListResponseSchema, planResponseSchema, projectResponseSchema } from '../interfaces/protocol/queries.js';
import { ProjectRootError, startServer, type RunningServer } from '../http/server.js';
import { copyFixture, temporaryDirectory } from './helpers/fixture.js';

// A plain Node client: `fetch` and the protocol's schemas, nothing from the web client.
async function query(server: RunningServer, path: string): Promise<{ status: number; body: unknown; type: string | null }> {
  const response = await fetch(`${server.url}${path}`);
  const type = response.headers.get('content-type');
  return { status: response.status, type, body: type?.startsWith('application/json') ? await response.json() : await response.text() };
}

describe('the protocol over HTTP, with the web assets absent', () => {
  let fixture: Awaited<ReturnType<typeof copyFixture>>;
  let server: RunningServer;

  beforeAll(async () => {
    fixture = await copyFixture();
    await mkdir(join(fixture.root, 'plans', 'broken', 'plan.md'), { recursive: true });
    await mkdir(join(fixture.root, 'plans', '.harness', 'jobs'), { recursive: true });
    server = await startServer({ projectRoot: fixture.root, port: 0, assetsDirectory: join(fixture.root, 'no-such-build') });
  });
  afterAll(async () => {
    await server.close();
    await fixture.remove();
  });

  test('the project query', async () => {
    const { status, body } = await query(server, protocolPaths.project);
    expect(status).toBe(200);
    expect(projectResponseSchema.parse(body).project).toEqual({
      name: 'collection-review', root: fixture.root, planPattern: 'plans/<plan-id>/plan.md',
    });
    expect(server.servesWebClient).toBe(false);
  });

  test('the plan list has the fixture plans and an error entry', async () => {
    const { status, body } = await query(server, protocolPaths.plans);
    expect(status).toBe(200);
    expect(planListResponseSchema.parse(body).plans).toEqual([
      { status: 'unreadable', id: 'broken', path: 'plans/broken/plan.md', message: 'plan.md is a directory, not a file' },
      { status: 'readable', id: 'review-notes', title: 'Reviewer notes on a review run', path: 'plans/review-notes/plan.md' },
      { status: 'readable', id: 'reviewer-identity', title: 'Who reviewed a record', path: 'plans/reviewer-identity/plan.md' },
      { status: 'readable', id: 'revision-diff', title: 'Compare two revisions of a record', path: 'plans/revision-diff/plan.md' },
      { status: 'readable', id: 'status-badge-tone', title: 'A tone for the status badge', path: 'plans/status-badge-tone/plan.md' },
    ]);
  });

  test('a plan with its Markdown', async () => {
    const { status, body } = await query(server, protocolPaths.plan('revision-diff'));
    expect(status).toBe(200);
    const { plan } = planResponseSchema.parse(body);
    expect(plan).toMatchObject({ id: 'revision-diff', title: 'Compare two revisions of a record' });
    expect(plan.markdown).toMatch(/^# Compare two revisions of a record\n/);
  });

  test('errors use the protocol shape and status', async () => {
    const cases: Array<[string, number, string]> = [
      [protocolPaths.plan('missing'), 404, 'not-found'],
      [protocolPaths.plan('.harness'), 404, 'not-found'],
      [protocolPaths.plan('../package.json'), 404, 'not-found'],
      [protocolPaths.plan('broken'), 422, 'unreadable'],
      ['/api/v1/nothing', 404, 'not-found'],
    ];
    for (const [path, expectedStatus, code] of cases) {
      const { status, body } = await query(server, path);
      expect([path, status, errorResponseSchema.parse(body).error.code]).toEqual([path, expectedStatus, code]);
    }
  });

  test('the root page says the client is not built', async () => {
    const { status, body } = await query(server, '/');
    expect(status).toBe(404);
    expect(body).toMatch(/npm run build:web/);
  });
});

describe('the web assets, when built', () => {
  test('are served, with the index for other pages', async () => {
    const fixture = await copyFixture();
    const assets = join(fixture.root, '..', 'web');
    await mkdir(assets);
    await writeFile(join(assets, 'index.html'), '<!doctype html><title>client</title>');
    const server = await startServer({ projectRoot: fixture.root, port: 0, assetsDirectory: assets });
    try {
      expect(server.servesWebClient).toBe(true);
      for (const path of ['/', '/index.html', '/elsewhere']) {
        const { status, body } = await query(server, path);
        expect([path, status, body]).toEqual([path, 200, '<!doctype html><title>client</title>']);
      }
      expect((await query(server, protocolPaths.plans)).status).toBe(200);
    } finally {
      await server.close();
      await fixture.remove();
    }
  });
});

describe('startServer', () => {
  test('refuses a directory that is not a Ramify project', async () => {
    const directory = await temporaryDirectory();
    try {
      await expect(startServer({ projectRoot: directory.path, port: 0 })).rejects.toThrow(ProjectRootError);
      await expect(startServer({ projectRoot: join(directory.path, 'missing'), port: 0 })).rejects.toThrow(/not a directory/);
    } finally {
      await directory.remove();
    }
  });
});
