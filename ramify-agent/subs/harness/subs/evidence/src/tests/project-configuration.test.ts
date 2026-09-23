import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectConfigurationFile, readProjectConfiguration } from '../project-configuration.js';
import { temporaryDirectory } from './helpers/temporary.js';

/** The project's configuration is read as bytes, and its absence is an answer. */
describe('readProjectConfiguration', () => {
  let directory: { path: string; remove: () => Promise<void> };

  beforeEach(async () => {
    directory = await temporaryDirectory();
  });
  afterEach(async () => {
    await directory.remove();
  });

  it('answers the text and its hash when the file is there', async () => {
    await writeFile(join(directory.path, projectConfigurationFile), '{"schema":"x"}\n');

    const read = await readProjectConfiguration(directory.path);

    expect(read).toEqual({
      status: 'present',
      path: 'ramify-agent.json',
      text: '{"schema":"x"}\n',
      hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
  });

  it('answers missing when there is no file', async () => {
    expect(await readProjectConfiguration(directory.path)).toEqual({ status: 'missing', path: 'ramify-agent.json' });
  });

  it('answers unreadable, with the reason, when the path cannot be read', async () => {
    await mkdir(join(directory.path, projectConfigurationFile));

    const read = await readProjectConfiguration(directory.path);

    expect(read.status).toBe('unreadable');
    expect(read.status === 'unreadable' ? read.message : '').toContain('EISDIR');
  });
});
