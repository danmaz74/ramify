import { describe, expect, it } from 'vitest';

import type { CheckCommand } from '../../../../src/checks/records.js';
import type { PlannedCheck } from '../../../../src/checks/verify.js';
import { workspacePreparationOf } from '../check-execution.js';

/*
 * The workspace preparation every audit request names: ramify-audit's
 * built-in `nodejs` preparation, with the project's dependency directories
 * and its declared setup commands. The harness registers none of its own.
 */

const projectRoot = '/repository/apps/web';

function command(argv: string[], cwd: string, timeoutMs: number, envAdditions: Record<string, string> = {}): CheckCommand {
  return { argv, cwd, env: [], envAdditions, timeoutMs };
}

describe('the audit request\'s workspace preparation', () => {
  it('links the root and every nested package, and forwards each setup command in order, relative to the project', () => {
    const setup: PlannedCheck[] = [
      { kind: 'setup', name: 'build', command: command(['npm', 'run', 'build'], projectRoot, 900_000), attribution: 'project' },
      { kind: 'setup', command: command(['npm', 'run', 'build'], `${projectRoot}/packages/ui`, 600_000, { NODE_ENV: 'production' }), attribution: 'project' },
    ];

    expect(workspacePreparationOf({
      projectRoot,
      projectPrefix: 'apps/web',
      dependencyDirectories: ['packages/ui', 'packages/ui'],
      directory: '/runs/r1/gates/ga-0004',
      setup,
    })).toEqual({
      preparationId: 'nodejs',
      options: {
        projectPrefix: 'apps/web',
        packageDirectories: ['', 'packages/ui'],
        build: false,
        setupCommands: [
          { name: 'build', cmd: 'npm', args: ['run', 'build'], timeoutMs: 900_000 },
          { cmd: 'npm', args: ['run', 'build'], timeoutMs: 600_000, cwd: 'packages/ui', env: { NODE_ENV: 'production' } },
        ],
      },
    });
  });

  it('declares no setup command and runs no build where the project declares none', () => {
    const preparation = workspacePreparationOf({ projectRoot, projectPrefix: '', dependencyDirectories: [], directory: '/runs/r1/gates/ga-0001', setup: [] });
    expect(preparation.options).toMatchObject({ packageDirectories: [''], build: false, setupCommands: [] });
  });

  it('refuses a setup command whose directory lies outside the project', () => {
    expect(() => workspacePreparationOf({
      projectRoot,
      projectPrefix: 'apps/web',
      dependencyDirectories: [],
      directory: '/runs/r1/gates/ga-0002',
      setup: [{ kind: 'setup', command: command(['make'], '/repository/apps', 60_000) }],
    })).toThrow(/outside project/u);
  });
});
