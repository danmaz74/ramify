import { readFileSync } from 'node:fs';
import type { RamifyCheckResult } from '../../../subs/evidence/src/ramify-cli.js';

/*
 * Real `ramify check --changed` payloads, and scripted results in the same
 * shape.
 *
 * `ramify-check-payloads.json` holds what the installed CLI printed for each
 * case of the evidence owner's provider fixture (`project-boundary.test.ts`,
 * written with `PLAN21_HOOK_PAYLOADS=<file>`), without timings and with its
 * temporary root replaced by `<root>`. A test replays a payload through an
 * executable of its own, under its own root, so the real adapter decodes it.
 */

/** One captured case: the paths it named, the CLI's exit code and the document it printed. */
export interface CapturedCheck {
  readonly paths: readonly string[];
  readonly exitCode: number;
  readonly document: Record<string, unknown>;
}

const captured = JSON.parse(readFileSync(new URL('./ramify-check-payloads.json', import.meta.url), 'utf8')) as {
  readonly provider: string;
  readonly cases: Record<string, CapturedCheck>;
};

/** The `ramify --version` the payloads were captured with. */
export const capturedProvider = captured.provider;

/** A captured case, placed under `root`. */
export function capturedCheck(name: string, root: string): CapturedCheck {
  const found = captured.cases[name];
  if (found === undefined) throw new Error(`No captured Ramify payload is named ${name}`);
  return { ...found, document: JSON.parse(JSON.stringify(found.document).replaceAll('<root>', root)) as Record<string, unknown> };
}

/** The finding a captured case reported, by position. */
export function capturedFinding(name: string, index = 0): Record<string, unknown> {
  const findings = captured.cases[name]?.document['findings'] as Record<string, unknown>[] | undefined;
  const finding = findings?.[index];
  if (finding === undefined) throw new Error(`The captured Ramify payload ${name} has no finding ${index}`);
  return structuredClone(finding);
}

/**
 * A `ramify.check/3` document for scripted answers: every named path checked
 * with a content identity, and the findings given. Exit 1 with findings,
 * exit 0 without.
 */
export function changedDocument(root: string, paths: readonly string[], findings: readonly Record<string, unknown>[] = [], fields: {
  readonly removed?: readonly string[];
  readonly execution?: string;
  readonly warnings?: readonly unknown[];
  readonly coverage?: readonly unknown[];
} = {}): Record<string, unknown> {
  return {
    schemaVersion: 'ramify.check/3', root, revision: { id: 'rev/1:scripted:1', sequence: 1, path: 'source' }, since: null,
    paths: paths.map(path => ({ path, disposition: 'checked', module: 'scripted', exclusion: null, reason: 'content', sha256: '0'.repeat(64) })),
    outcome: 'checked', reason: null, execution: fields.execution ?? 'completed',
    findings: findings.map(finding => ({ new: true, related: [], accessId: null, ...finding })),
    removed: fields.removed ?? [], warnings: fields.warnings ?? [], coverage: fields.coverage ?? [],
    checked: { path: 'source', files: [...paths], accesses: 0, modelRebuilt: false },
    exitCode: findings.length > 0 || (fields.execution ?? 'completed') !== 'completed' ? 1 : 0,
  };
}

/** A scripted changed-check result, decoded as the real adapter decodes a `ramify.check/3` document. */
export function changedResult(root: string, paths: readonly string[], findings: readonly Record<string, unknown>[] = []): RamifyCheckResult {
  const document = changedDocument(root, paths, findings);
  return {
    form: 'changed', exitCode: document['exitCode'] as number, outcome: findings.length > 0 ? 'findings' : 'checked', reason: null,
    report: document, stdout: JSON.stringify(document), stderr: '',
    provider: { schema: 'ramify.check/3', revision: 'rev/1:scripted:1' }, execution: 'completed',
    paths: (document['paths'] as RamifyCheckResult['paths']), removed: [], unsupported: null,
  };
}
