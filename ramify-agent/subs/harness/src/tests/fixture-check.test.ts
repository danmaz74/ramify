import { afterEach, describe, expect, test } from 'vitest';
import { findingsOf } from '../hooks/post-write.js';
import { copyFixture } from './helpers/fixture.js';
import { realRamify } from './helpers/runs.js';

/*
 * The fixture guard.
 *
 * `fixtures/collection-review` is the target project 49 test files copy, and
 * every one of them assumes it satisfies Ramify's own rules. Nothing asserted
 * that on its own: the tests that ran the real checker over it did so on the
 * way to another assertion, so the signature-companion rule could land and
 * leave the fixture failing unnoticed. This is the one test whose whole
 * subject is the fixture.
 *
 * It copies a fresh fixture, runs the complete check a gate runs -- `ramify
 * check --batch --root <copy> --format json`, through the installed command
 * line and a daemon of its own -- and requires the check to pass with no
 * error. On failure it names every finding's code and location, so a drift is
 * diagnosable from the failure message alone.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** As much of `ramify.analysis/1` as the guard reads. */
interface CheckReport {
  readonly outcome?: { readonly execution?: unknown; readonly check?: unknown; readonly coverage?: unknown };
  readonly warnings?: readonly { readonly code?: unknown; readonly files?: readonly unknown[] }[];
  readonly summary?: { readonly errors?: unknown; readonly warnings?: unknown; readonly denied?: unknown };
}

/**
 * The two warnings the fixture's own compiler configuration entails: it
 * includes `vite.config.ts` and `vitest.config.ts`, which lie outside every
 * module's `src/`. Ramify warns about compiler-selected source outside a
 * module without failing the check. They are named rather than counted, so
 * that any other warning fails this guard.
 */
const configurationWarnings = [
  'outside-module-source vite.config.ts',
  'outside-module-source vitest.config.ts',
];

describe('the collection-review fixture satisfies Ramify\'s rules', () => {
  test('a fresh copy checks with no error and no warning beyond its configuration files', async () => {
    const daemon = await realRamify();
    cleanups.push(() => daemon.dispose());
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);

    const result = await daemon.ramify.checkComplete(fixture.root);
    const report = (result.report ?? {}) as CheckReport;

    // Every error the check reported, by code and location, so that a drift
    // names itself here rather than in a rerun.
    const errors = findingsOf(report).map(finding => [
      finding.code,
      finding.file === null ? '(no file)' : `${finding.file}${finding.line === null ? '' : `:${finding.line}`}`,
      finding.message,
    ].join(' '));
    expect(errors).toEqual([]);
    expect(report.summary?.errors).toBe(0);
    expect(report.summary?.denied).toBe(0);

    // The check itself ran and passed. Exit 2 is not checked, and is never a
    // pass; a report the guard cannot read is not one either.
    expect([result.outcome, result.exitCode, report.outcome?.execution, report.outcome?.check])
      .toEqual(['checked', 0, 'completed', 'passed']);

    // No warning the fixture's compiler configuration does not entail.
    const warnings = (report.warnings ?? []).map(warning => `${String(warning.code)} ${(warning.files ?? []).join(', ')}`);
    expect(warnings.sort()).toEqual(configurationWarnings);
    expect(report.summary?.warnings).toBe(configurationWarnings.length);
  }, 300_000);
});
