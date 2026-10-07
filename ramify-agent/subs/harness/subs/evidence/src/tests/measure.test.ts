import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { measureSchemaVersion, readMeasurement } from '../measure.js';
import { RamifyCli } from '../ramify-cli.js';
import { temporaryDirectory } from './helpers/temporary.js';

/**
 * The measurement document's format stays in this module, and a producer that
 * cannot be run or answers a document this reader does not support is
 * unavailable with its reason. None of those is a zero.
 */
describe('readMeasurement', () => {
  let directory: { path: string; remove: () => Promise<void> };

  beforeEach(async () => {
    directory = await temporaryDirectory();
  });
  afterEach(async () => {
    await directory.remove();
  });

  /** A stand-in for the CLI: it records the arguments it was given and prints what the test wants. */
  const producer = async (body: string, exitCode = 0): Promise<RamifyCli> => {
    const executable = join(directory.path, 'ramify-stub.sh');
    await writeFile(executable, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > ${join(directory.path, 'argv.txt')}\ncat <<'DOCUMENT'\n${body}\nDOCUMENT\nexit ${exitCode}\n`);
    await chmod(executable, 0o755);
    return new RamifyCli({ executable });
  };

  const document = {
    schema: measureSchemaVersion,
    revision: 'rev/1:28de61c9-1d3d-46c2-a462-630be6d5ae6a:4',
    root: '/project',
    views: 'measured',
    ownershipRule: 'kept verbatim',
    files: [],
    modules: [{
      id: 'project/harness',
      dir: 'subs/harness',
      parent: 'project',
      exact: {
        production: { sourceFiles: 26, sourceBytes: 144432, resourceFiles: 2, resourceBytes: 7469 },
        tests: { sourceFiles: 18, sourceBytes: 128386, resourceFiles: 0, resourceBytes: 0 },
        documentation: { files: 2, bytes: 14495 },
        views: { ordinaryBytes: 17208, testsBytes: 17205 },
      },
      subtree: {
        production: { sourceFiles: 36, sourceBytes: 212057, resourceFiles: 2, resourceBytes: 7469 },
        tests: { sourceFiles: 33, sourceBytes: 205299, resourceFiles: 0, resourceBytes: 0 },
        documentation: { files: 10, bytes: 29343 },
        views: { ordinaryBytes: 132245, testsBytes: 104580 },
      },
    }],
  };

  it('answers the per-module buckets of a valid document, with the producer\'s own bytes', async () => {
    const ramify = await producer(JSON.stringify(document));

    const read = await readMeasurement(ramify, directory.path);

    expect(read.available).toBe(true);
    if (!read.available) return;
    expect(read.document.revision).toBe(document.revision);
    expect(read.document.modules[0]?.exact.production.sourceBytes).toBe(144432);
    expect(read.document.modules[0]?.subtree.tests.sourceFiles).toBe(33);
    expect(JSON.parse(read.raw)).toEqual(document);
    expect((await readFile(join(directory.path, 'argv.txt'), 'utf8')).trim().split('\n'))
      .toEqual(['measure', '--root', directory.path, '--format', 'json']);
  });

  it('keeps unavailable API-view bytes unavailable in the current document', async () => {
    const module = document.modules[0]!;
    const exact = { production: module.exact.production, tests: module.exact.tests, documentation: module.exact.documentation };
    const subtree = { production: module.subtree.production, tests: module.subtree.tests, documentation: module.subtree.documentation };
    const ramify = await producer(JSON.stringify({
      ...document,
      views: { state: 'unavailable', reason: 'analysis-failed' },
      modules: [{ ...module, exact, subtree }],
    }));
    const read = await readMeasurement(ramify, directory.path);
    expect(read.available).toBe(true);
    if (!read.available) return;
    expect(read.document.views).toEqual({ state: 'unavailable', reason: 'analysis-failed' });
    expect(read.document.modules[0]?.exact.views).toBeUndefined();
  });

  it('is unavailable with its reason when the producer cannot be run', async () => {
    const ramify = await producer('no measurement here', 2);

    const read = await readMeasurement(ramify, directory.path);

    expect(read.available).toBe(false);
    if (read.available) return;
    expect(read.unavailable).toContain('exited with 2');
    expect(read.unavailable).toContain('no measurement here');
  });

  it('is unavailable when the producer prints no JSON document', async () => {
    const ramify = await producer('ramify: not a document');

    const read = await readMeasurement(ramify, directory.path);

    expect(read.available).toBe(false);
    if (read.available) return;
    expect(read.unavailable).toContain('did not print a JSON document');
  });

  it('is unavailable when the document declares another version', async () => {
    const ramify = await producer(JSON.stringify({ ...document, schema: 'ramify.measure/1' }));

    const read = await readMeasurement(ramify, directory.path);

    expect(read.available).toBe(false);
    if (read.available) return;
    expect(read.unavailable).toContain('ramify.measure/1');
    expect(read.unavailable).toContain(measureSchemaVersion);
  });

  it('is unavailable, naming the path, when the document does not hold the buckets', async () => {
    const [module] = document.modules;
    const incomplete = { ...document, modules: [{ ...module, exact: { ...module?.exact, production: { sourceFiles: 1 } } }] };
    const ramify = await producer(JSON.stringify(incomplete));

    const read = await readMeasurement(ramify, directory.path);

    expect(read.available).toBe(false);
    if (read.available) return;
    expect(read.unavailable).toContain('modules.0.exact.production.sourceBytes');
  });
});
