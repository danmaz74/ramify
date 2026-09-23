import { describe, expect, test } from 'vitest';
import {
  buildScenarioProfile,
  scenarioRunName,
  scenarioSelectionSchema,
  scenarioTagExpression,
  type ScenarioRunConfig,
  type ScenarioSelection,
} from '../profiles.js';
import type { ScenarioModule } from '../records.js';

const config: ScenarioRunConfig = {
  support: ['src/tests/support/world.ts', 'src/tests/support/hooks.ts'],
  modes: {
    quick: { command: ['npm', 'run', 'acceptance:quick', '--'] },
    full: { command: ['npm', 'run', 'acceptance:full', '--'] },
  },
};

const customers: ScenarioModule = { module: 'shop/customers', dir: 'subs/customers', testing: false };
const nested: ScenarioModule = { module: 'shop/customers/mail', dir: 'subs/customers/subs/mail', testing: false };
const auditChecks: ScenarioModule = { module: 'shop/audit-checks', dir: 'subs/audit-checks', testing: true };
const root: ScenarioModule = { module: 'shop', dir: '', testing: false };

describe('the tag expression of each selection kind', () => {
  test('identity selects the named scenarios by their identity tags, pending or not', () => {
    expect(scenarioTagExpression({ kind: 'identity', scenarios: ['sc-001', 'sc-003'] })).toBe('@ramify-sc-001 or @ramify-sc-003');
  });

  test('all-untagged leaves out every scenario with the pending tag', () => {
    expect(scenarioTagExpression({ kind: 'all-untagged' })).toBe('not @ramify-pending');
  });

  test('all has no expression', () => {
    expect(scenarioTagExpression({ kind: 'all' })).toBeNull();
  });

  test('an identity selection names at least one scenario ID', () => {
    expect(scenarioSelectionSchema.safeParse({ kind: 'identity', scenarios: [] }).success).toBe(false);
    expect(scenarioSelectionSchema.safeParse({ kind: 'identity', scenarios: ['ps-01'] }).success).toBe(false);
  });
});

describe('one module\'s profile', () => {
  test('architecture\'s example: support in order, the module\'s steps and features, the tags, strict and the message stream', () => {
    const profile = buildScenarioProfile(customers, 'quick', { kind: 'identity', scenarios: ['sc-001', 'sc-003'] }, config, '.ramify-agent/attempt-3');
    expect(profile.profilePath).toBe('.ramify-agent/attempt-3/scenarios/subs-customers.profile.mjs');
    expect(profile.messagesPath).toBe('.ramify-agent/attempt-3/scenarios/subs-customers.ndjson');
    expect(profile.tags).toBe('@ramify-sc-001 or @ramify-sc-003');
    expect(profile.profileText).toBe([
      '// Written by ramify-agent: the quick scenario run of module shop/customers.',
      'export default {',
      '  import: [',
      '    "src/tests/support/world.ts",',
      '    "src/tests/support/hooks.ts",',
      '    "subs/customers/src/tests/steps/**/*.{ts,js}",',
      '  ],',
      '  paths: ["subs/customers/src/tests/features"],',
      '  tags: "@ramify-sc-001 or @ramify-sc-003",',
      '  strict: true,',
      '  format: ["message:.ramify-agent/attempt-3/scenarios/subs-customers.ndjson"],',
      '};',
      '',
    ].join('\n'));
    expect(profile.argv).toEqual(['npm', 'run', 'acceptance:quick', '--', '--config', '.ramify-agent/attempt-3/scenarios/subs-customers.profile.mjs']);
  });

  test('the text evaluates to the profile object cucumber-js reads', () => {
    const profile = buildScenarioProfile(customers, 'quick', { kind: 'all-untagged' }, config, 'attempt');
    expect(profile.profileText.match(/^export default /gm)).toHaveLength(1);
    // The module's one statement is its default export; evaluated as a function body, it returns that object.
    const loaded = new Function(profile.profileText.replace(/^export default /m, 'return ')) as () => unknown;
    expect(loaded()).toEqual({
      import: ['src/tests/support/world.ts', 'src/tests/support/hooks.ts', 'subs/customers/src/tests/steps/**/*.{ts,js}'],
      paths: ['subs/customers/src/tests/features'],
      tags: 'not @ramify-pending',
      strict: true,
      format: ['message:attempt/scenarios/subs-customers.ndjson'],
    });
  });

  const selections: [ScenarioSelection, string | null][] = [
    [{ kind: 'identity', scenarios: ['sc-002'] }, '  tags: "@ramify-sc-002",'],
    [{ kind: 'all-untagged' }, '  tags: "not @ramify-pending",'],
    [{ kind: 'all' }, null],
  ];
  for (const [selection, line] of selections) {
    test(`the ${selection.kind} selection ${line === null ? 'writes no tags line' : 'writes its expression'}`, () => {
      const profile = buildScenarioProfile(customers, 'full', selection, config, 'attempt');
      const tagLines = profile.profileText.split('\n').filter((text) => text.startsWith('  tags:'));
      expect(tagLines).toEqual(line === null ? [] : [line]);
      expect(profile.tags).toBe(scenarioTagExpression(selection));
    });
  }

  test('a testing module\'s steps and features are its src/steps/ and src/features/', () => {
    const profile = buildScenarioProfile(auditChecks, 'quick', { kind: 'all-untagged' }, config, 'attempt');
    expect(profile.profileText).toContain('    "subs/audit-checks/src/steps/**/*.{ts,js}",\n');
    expect(profile.profileText).toContain('  paths: ["subs/audit-checks/src/features"],\n');
    expect(profile.profileText).not.toContain('src/tests/steps');
  });

  test('the root module\'s areas are its own src/tests/, and its files are named root', () => {
    const profile = buildScenarioProfile(root, 'quick', { kind: 'all' }, config, 'attempt/');
    expect(profile.profileText).toContain('    "src/tests/steps/**/*.{ts,js}",\n');
    expect(profile.profileText).toContain('  paths: ["src/tests/features"],\n');
    expect(profile.profilePath).toBe('attempt/scenarios/root.profile.mjs');
    expect(scenarioRunName(root)).toBe('root');
  });

  test('a nested module\'s file name is its directory with / as -', () => {
    expect(scenarioRunName(nested)).toBe('subs-customers-subs-mail');
    expect(buildScenarioProfile(nested, 'quick', { kind: 'all' }, config, 'a').messagesPath).toBe('a/scenarios/subs-customers-subs-mail.ndjson');
  });

  test('each mode runs its own command, and --dry-run follows the config when asked', () => {
    const full = buildScenarioProfile(customers, 'full', { kind: 'all' }, config, 'attempt', { dryRun: true });
    expect(full.argv).toEqual(['npm', 'run', 'acceptance:full', '--', '--config', 'attempt/scenarios/subs-customers.profile.mjs', '--dry-run']);
    expect(full.profileText).toContain('the full scenario run of module shop/customers');
    const quick = buildScenarioProfile(customers, 'quick', { kind: 'all' }, config, 'attempt', { dryRun: false });
    expect(quick.argv).not.toContain('--dry-run');
  });

  test('an absolute attempt directory is named relative to the project root in the argv, since cucumber-js joins its working directory with --config', () => {
    const profile = buildScenarioProfile(customers, 'quick', { kind: 'all' }, config, '/var/runs/run-1/attempt-3', { projectRoot: '/work/project' });
    expect(profile.profilePath).toBe('/var/runs/run-1/attempt-3/scenarios/subs-customers.profile.mjs');
    expect(profile.argv.slice(-2)).toEqual(['--config', '../../var/runs/run-1/attempt-3/scenarios/subs-customers.profile.mjs']);
    expect(profile.profileText).toContain('  format: ["message:/var/runs/run-1/attempt-3/scenarios/subs-customers.ndjson"],\n');
  });

  test('an absolute attempt directory without the project root is a caller\'s error', () => {
    expect(() => buildScenarioProfile(customers, 'quick', { kind: 'all' }, config, '/var/runs/attempt')).toThrow('needs the project root');
  });

  test('support globs and paths with quotes are written as JSON strings', () => {
    const quoted = { ...config, support: ['src/tests/support/*.ts', 'src/tests/support/"odd".ts'] };
    const profile = buildScenarioProfile(customers, 'quick', { kind: 'all' }, quoted, 'attempt');
    expect(profile.profileText).toContain('    "src/tests/support/*.ts",\n    "src/tests/support/\\"odd\\".ts",\n');
  });

  test('is deterministic', () => {
    const selection: ScenarioSelection = { kind: 'identity', scenarios: ['sc-004'] };
    expect(buildScenarioProfile(customers, 'quick', selection, config, 'attempt')).toEqual(buildScenarioProfile(customers, 'quick', selection, config, 'attempt'));
  });
});
