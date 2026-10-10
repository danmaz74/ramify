import { expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AffectedDocument } from 'ramify.ts/cli';
import type { CandidateSource } from '../../../subs/evidence/src/git.js';
import type { ConfiguredAuditPort } from '../../../subs/audit/src/check-execution.js';
import { childEnvironment, type CommandRunner } from '../../../subs/evidence/src/run-command.js';
import { shellDefaultTimeoutMs } from '../../tools/shell.js';
import { mockGit } from './mock-git.js';
import { commandResult } from './command-result.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { shapeOnlyInputs } from './runs.js';

const modules = [
  {
    "id": "collection-review",
    "parent": null,
    "directory": ".",
    "tags": [
      "dispatch"
    ]
  },
  {
    "id": "collection-review/integration-tests",
    "parent": "collection-review",
    "directory": "subs/integration-tests",
    "tags": [
      "testing",
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace",
    "parent": "collection-review",
    "directory": "subs/workspace",
    "tags": [
      "ui",
      "browser",
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/catalog",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/catalog",
    "tags": [
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/contracts",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/contracts",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/reviews",
    "tags": [
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/shared-ui",
    "parent": "collection-review/workspace",
    "directory": "subs/workspace/subs/shared-ui",
    "tags": [
      "ui",
      "browser"
    ]
  },
  {
    "id": "collection-review/workspace/catalog/core",
    "parent": "collection-review/workspace/catalog",
    "directory": "subs/workspace/subs/catalog/subs/core",
    "tags": []
  },
  {
    "id": "collection-review/workspace/catalog/ui",
    "parent": "collection-review/workspace/catalog",
    "directory": "subs/workspace/subs/catalog/subs/ui",
    "tags": [
      "ui",
      "browser"
    ]
  },
  {
    "id": "collection-review/workspace/reviews/core",
    "parent": "collection-review/workspace/reviews",
    "directory": "subs/workspace/subs/reviews/subs/core",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/ui",
    "parent": "collection-review/workspace/reviews",
    "directory": "subs/workspace/subs/reviews/subs/ui",
    "tags": [
      "ui",
      "browser",
      "dispatch"
    ]
  },
  {
    "id": "collection-review/workspace/reviews/validation",
    "parent": "collection-review/workspace/reviews",
    "directory": "subs/workspace/subs/reviews/subs/validation",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/core/controller",
    "parent": "collection-review/workspace/reviews/core",
    "directory": "subs/workspace/subs/reviews/subs/core/subs/controller",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/core/tasks",
    "parent": "collection-review/workspace/reviews/core",
    "directory": "subs/workspace/subs/reviews/subs/core/subs/tasks",
    "tags": []
  },
  {
    "id": "collection-review/workspace/reviews/ui/pure-ui",
    "parent": "collection-review/workspace/reviews/ui",
    "directory": "subs/workspace/subs/reviews/subs/ui/subs/pure-ui",
    "tags": [
      "ui",
      "browser"
    ]
  }
] as const;

/** Independently declared source paths of this copied fixture and the explicitly added note module. */
export const sessionHookPaths = [
  "cucumber.js",
  "src/assembly.ts",
  "src/interfaces/protocol.ts",
  "src/main.ts",
  "src/protocol.ts",
  "src/server.ts",
  "src/tests/assembly.test.ts",
  "src/tests/http.test.ts",
  "src/tests/protocol-typing.test.ts",
  "src/tests/setup.ts",
  "subs/integration-tests/src/steps/collection-review.steps.ts",
  "subs/integration-tests/src/support/hooks.ts",
  "subs/integration-tests/src/support/initialization.ts",
  "subs/integration-tests/src/support/mode.ts",
  "subs/integration-tests/src/support/world.ts",
  "subs/workspace/src/app.tsx",
  "subs/workspace/src/client.ts",
  "subs/workspace/src/main.tsx",
  "subs/workspace/src/tests/shell.test.tsx",
  "subs/workspace/subs/catalog/src/mcp.ts",
  "subs/workspace/subs/catalog/src/router.ts",
  "subs/workspace/subs/catalog/src/tests/adapters.test.ts",
  "subs/workspace/subs/catalog/subs/core/src/catalog.ts",
  "subs/workspace/subs/catalog/subs/core/src/history.ts",
  "subs/workspace/subs/catalog/subs/core/src/records.ts",
  "subs/workspace/subs/catalog/subs/core/src/tests/catalog.test.ts",
  "subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts",
  "subs/workspace/subs/catalog/subs/ui/src/catalog-card.tsx",
  "subs/workspace/subs/catalog/subs/ui/src/tests/catalog-card.test.tsx",
  "subs/workspace/subs/contracts/src/interfaces/vocabulary.ts",
  "subs/workspace/subs/contracts/src/tests/vocabulary.test.ts",
  "subs/workspace/subs/reviews/src/mcp.ts",
  "subs/workspace/subs/reviews/src/router.ts",
  "subs/workspace/subs/reviews/src/session.ts",
  "subs/workspace/subs/reviews/src/tests/router.test.ts",
  "subs/workspace/subs/reviews/src/tests/sessions.test.ts",
  "subs/workspace/subs/reviews/src/tests/typing.test.ts",
  "subs/workspace/subs/reviews/subs/core/src/interfaces/port.ts",
  "subs/workspace/subs/reviews/subs/core/src/runtime.ts",
  "subs/workspace/subs/reviews/subs/core/src/tests/runtime.test.ts",
  "subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts",
  "subs/workspace/subs/reviews/subs/core/subs/controller/src/tests/controller.test.ts",
  "subs/workspace/subs/reviews/subs/core/subs/tasks/src/inspection-task.ts",
  "subs/workspace/subs/reviews/subs/core/subs/tasks/src/result.ts",
  "subs/workspace/subs/reviews/subs/core/subs/tasks/src/tests/inspection-task.test.ts",
  "subs/workspace/subs/reviews/subs/core/subs/tasks/src/tests/result.test.ts",
  "subs/workspace/subs/reviews/subs/ui/src/review-panel.tsx",
  "subs/workspace/subs/reviews/subs/ui/src/tests/review-panel.test.tsx",
  "subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts",
  "subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx",
  "subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/tests/format.test.ts",
  "subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/tests/review-result.test.tsx",
  "subs/workspace/subs/reviews/subs/validation/src/tests/validate.test.ts",
  "subs/workspace/subs/reviews/subs/validation/src/validate.ts",
  "subs/workspace/subs/shared-ui/src/status-badge.tsx",
  "subs/workspace/subs/shared-ui/src/tests/status-badge.test.tsx",
  "vite.config.ts",
  "vitest.config.ts",
  "subs/workspace/subs/reviews/subs/notes/src/notes.ts",
  "subs/workspace/subs/reviews/subs/notes/src/tests/notes.test.ts",
  "subs/workspace/subs/reviews/subs/notes/src/new.ts",
  "src/root.ts"
] as const;

/** Literal ownership of this declared fixture, independent of files on disk. */
export function literalOwnershipRamify(root: string, withNotes = false, replies: { readonly materializeFrom?: string; readonly measurement?: boolean } = {}) {
  const failures: string[] = []; let materialized = 0, measured = 0;
  const declared = [...modules, ...(withNotes ? [{ id: 'collection-review/workspace/reviews/notes', parent: 'collection-review/workspace/reviews', directory: 'subs/workspace/subs/reviews/subs/notes', tags: [] }] : [])];
  const noteOwner = 'collection-review/workspace/reviews/notes';
  const owners: Record<string, string> = Object.fromEntries(declared.map(module => [module.directory, module.id]));
  Object.assign(owners, {
    'docs/notes.md': 'collection-review',
    'subs/workspace/subs/reviews/subs/notes/src': noteOwner,
    'subs/workspace/subs/reviews/subs/notes/src/notes.ts': noteOwner,
    'subs/workspace/subs/reviews/subs/notes/src/new.ts': noteOwner,
    'subs/workspace/subs/reviews/src/stray.ts': 'collection-review/workspace/reviews',
    'src/root.ts': 'collection-review', 'ramify-audit.json': 'collection-review',
    'plans/plan/.harness/jobs/run/unsafe.json': 'collection-review',
  });
  const refused = (operation: string): never => { failures.push(`Undeclared Ramify ${operation}`); throw new Error(failures.at(-1)); };
  class LiteralRamify extends FakeRamifyCli {
    override async run(argv: readonly string[], cwd: string, signal?: AbortSignal) {
      try {
        if (!replies.measurement) return refused('run');
        expect(cwd).toBe(root); expect(argv).toEqual(['measure', '--root', root, '--format', 'json']);
        expect(measured, 'exhausted measurement').toBe(0); measured++;
        return super.run(argv, cwd, signal);
      } catch (error) { failures.push(String(error)); throw error; }
    }
    override async materialize(project: string, from?: string, signal?: AbortSignal) {
      try {
        if (replies.materializeFrom === undefined) return refused('materialize');
        expect(project).toBe(root); expect(from).toBe(replies.materializeFrom);
        expect(materialized, 'exhausted materialization').toBe(0); materialized++;
        return super.materialize(project, from, signal);
      } catch (error) { failures.push(String(error)); throw error; }
    }
    override async stopDaemon(): Promise<never> { return refused('stopDaemon'); }
    override async queryOwnership(project: string, paths: readonly string[] = ['.']): Promise<AffectedDocument> {
      try {
        expect(project).toBe(root); for (const path of paths) expect(Object.hasOwn(owners, path), `unstated ownership path ${path}`).toBe(true);
        return { schemaVersion: 'ramify.affected-cli/4', root, mode: 'batch', ramifyVersion: 'scripted-settlement-only', revision: { sequence: null, inputId: 'settlement' },
          selection: { schemaVersion: 'ramify.affected/4', inputId: 'settlement', paths: paths.map(path => ({ path, status: 'owned', module: owners[path], basis: 'containment', exclusion: null, kind: 'inert', selects: [] })),
            scope: { root, selection: 'given', configuration: 'tsconfig.json', invokedFrom: root, walkedAreas: [], ownership: { modules: declared.map(({ id, parent, directory }) => ({ id, parent, directory })), exclusions: [] } },
            changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' } } as unknown as AffectedDocument;
      } catch (error) { failures.push(String(error)); throw error; }
    }
  }
  const index = { revision: 'scripted-settlement/1', input: 'scripted-settlement/1', symbols: new Map(),
    modules: new Map(declared.map(module => [module.id, { module: module.id, dir: module.directory === '.' ? '' : module.directory, parent: module.parent,
      children: declared.filter(child => child.parent === module.id).map(child => child.id), tags: [...module.tags], areas: ['src', 'src/tests'] }])) };
  return { ramify: new LiteralRamify(), async refresh(project: string) {
    try { expect(project).toBe(root); return index; }
    catch (error) { failures.push(String(error)); throw error; }
  }, assertComplete() { expect(failures, `caught ownership violations: ${JSON.stringify(failures)}`).toEqual([]); expect(materialized, 'required materialization').toBe(replies.materializeFrom === undefined ? 0 : 1); expect(measured, 'required measurement').toBe(replies.measurement ? 1 : 0); } };
}

/** The run stops before readiness: no candidate, gate, command or provisional source is declared. */
export function settlementBoundaries(root: string) {
  const failures: string[] = [], counts = new Map<string, number>();
  const head = 'a'.repeat(40);
  function read(name: string) { counts.set(name, (counts.get(name) ?? 0) + 1); }
  function refuse(name: string): never { failures.push(`Undeclared ${name}`); throw new Error(failures.at(-1)); }
  const git = mockGit({
    async currentHead(project) { expect(project).toBe(root); read('head'); return head; },
    async changedPaths(project, base = 'HEAD') { expect(project).toBe(root); expect(base).toBe(head); read('changes'); return []; },
  });
  const ownership = literalOwnershipRamify(root, false, { measurement: true });
  const ramify = ownership.ramify;
  const candidates: CandidateSource = {
    commitTree: async () => refuse('candidate tree'), treeEntries: async () => refuse('candidate entries'), readBlob: async () => refuse('candidate blob'),
    grepTree: async () => refuse('candidate grep'), diffNameStatus: async () => refuse('candidate diff'), diffPatch: async () => refuse('candidate patch'),
  };
  const configuredAudit: ConfiguredAuditPort = {
    async read(project, commit, signal) {
      try { expect(project).toBe(root); expect(commit).toBe(head); read('audit configuration'); return {
        sourceCommit: head, path: 'ramify-audit.json', blob: 'scripted-settlement-configuration', projectRoot: '.',
        checks: [{ id: 'tests' }, { id: 'type-check' }, { id: 'ramify-check' }], ignorePaths: [], undetectedConfigFilesForcingFullAudit: [],
        workspace: { preparationId: 'nodejs', packageDirectoriesDeclared: false, linkNodeModules: true, packageDirectories: [''], setupCommands: [] },
      }; }
      catch (error) { failures.push(String(error)); throw error; }
    }, run: async () => refuse('audit execution'),
  };
  const options = { git, candidates, ramify, configuredAudit, scratchGit: 'provided' as const,
    inputs: { ...shapeOnlyInputs, async capture(...args: Parameters<typeof shapeOnlyInputs.capture>) {
      try { expect(args[0]).toBe(root); expect(counts.get('capture') ?? 0, 'exhausted captured inputs').toBe(0); read('capture'); return await shapeOnlyInputs.capture(...args); }
      catch (error) { failures.push(String(error)); throw error; }
    } },
    provisionalSourceGit: { stagedPaths: async () => refuse('provisional index'), readBlob: async () => refuse('provisional bytes') },
    commandExecution: async () => refuse('command execution'),
  };
  return { options, assertComplete() {
    expect(git.unexpected, 'caught Git violations').toEqual([]); expect(failures, 'caught external violations').toEqual([]); ownership.assertComplete();
    expect(counts.get('capture') ?? 0, 'required captured inputs').toBe(1);
    for (const operation of ['head', 'audit configuration']) expect(counts.get(operation) ?? 0, `required ${operation}, observed ${JSON.stringify([...counts])}`).toBeGreaterThan(0);
  } };
}

/** One literal accepted schema correction and declared fixture effect; no shell interpretation. */
export function strictMarkerCommand(directory: string, marker?: string) {
  let used = 0; const failures: string[] = [];
  const run: CommandRunner = async request => {
    try {
      expect(marker, 'no command declared').toBeDefined(); expect(used, 'exhausted marker command').toBe(0);
      expect(request.argv).toEqual(['bash', '-c', `touch ${marker}`]); expect(request.cwd).toBe(directory);
      expect(request.timeoutMs).toBe(shellDefaultTimeoutMs); expect(request.env).toEqual(childEnvironment());
      expect(request.outputFile).toBe(join(directory, 'output/1.log')); used++;
      await writeFile(marker!, ''); return commandResult(request, {});
    } catch (error) { failures.push(String(error)); throw error; }
  };
  return { run, assertComplete() { expect(failures, 'caught command violations').toEqual([]); expect(used, 'required marker command').toBe(marker === undefined ? 0 : 1); } };
}

/** A caught boundary error remains visible to teardown; control tests get an isolated recorder. */
export function externalResponseRecorder() {
  const failures: string[] = [];
  return {
    async answer<T>(work: () => Promise<T>): Promise<T> { try { return await work(); } catch (error) { failures.push(String(error)); throw error; } },
    assertComplete() { expect(failures, `caught session boundary violations: ${JSON.stringify(failures)}`).toEqual([]); },
  };
}

/** Explicit command input, exact one response, and independently checked harness request fields. */
export function strictSessionCommand(root: string, cwd: string, command: string | undefined, response: CommandRunner | undefined) {
  const recorder = externalResponseRecorder(); let used = 0;
  const run: CommandRunner = request => recorder.answer(async () => {
    expect(command, 'no session command declared').toBeDefined(); expect(response, 'no session response declared').toBeDefined();
    expect(used, 'exhausted session command').toBe(0);
    expect(request.argv).toEqual(['bash', '-c', command]); expect(request.cwd).toBe(cwd);
    expect(request.env).toEqual(childEnvironment()); expect(request.timeoutMs).toBe(shellDefaultTimeoutMs);
    expect(request.outputFile?.startsWith(join(root, 'plans/sessions/.harness/jobs/'))).toBe(true);
    expect(request.outputFile).toMatch(/\/shell\/001\.log$/u); used++;
    return response!(request);
  });
  return { run, assertComplete() { recorder.assertComplete(); expect(used, 'required session command').toBe(command === undefined ? 0 : 1); } };
}
