import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InitialAnalysisSubmission } from '../../analysis/submission.js';
import { extractPlanScenarios } from '../../../subs/scenarios/src/extraction.js';
import { analysis, entry } from './analysis.js';
import { fixtureRoot } from './fixture.js';

/*
 * The collection-review fixture's `status-badge-tone` plan and its two plan
 * scenarios, as a run binds them.
 *
 * The badge's owner is `shared-ui`, tagged `[ui, browser]`; its test area's
 * profile is `[testing, ui]`. The fixture's World is in `integration-tests`,
 * tagged `[testing, dispatch]`, so no badge step can import it, and none
 * needs to: the badge is a presentation primitive, and its step file renders
 * it to static markup with `react-dom/server`, as its unit tests do. It
 * keeps what a scenario rendered in its own module scope, which each
 * scenario's first step resets. Cucumber still constructs the configured
 * World for every scenario, since the support files load in every module's
 * run; its constructor starts nothing, so it costs the badge nothing.
 */

export const badgePlan = 'status-badge-tone';
export const sharedUi = 'collection-review/workspace/shared-ui';
export const sharedUiDirectory = 'subs/workspace/subs/shared-ui';
export const badgeFeature = `${sharedUiDirectory}/src/tests/features/${badgePlan}/${badgePlan}.feature`;
export const badgeSteps = `${sharedUiDirectory}/src/tests/steps/${badgePlan}.steps.ts`;
export const badgeDeclaration = `${sharedUiDirectory}/module.ramify`;

/** The plan's text, as the fixture holds it. */
export async function badgePlanText(): Promise<string> {
  return readFile(join(fixtureRoot, 'plans', badgePlan, 'plan.md'), 'utf8');
}

/**
 * The initial analysis of the plan: one entry at the badge's owner, whose
 * two scenarios are the plan's, restated verbatim with the plan as origin.
 */
export async function badgeAnalysis(): Promise<InitialAnalysisSubmission> {
  const { scenarios } = extractPlanScenarios(await badgePlanText());
  return analysis([entry(badgePlan, sharedUi, 'The status badge takes a tone and carries it in its markup.')], [], [],
    scenarios.map((scenario, index) => ({
      key: `badge-tone-${index + 1}`,
      entry: badgePlan,
      origin: { kind: 'plan' as const, planScenario: scenario.id },
      gherkin: scenario.source.join('\n'),
    })));
}

/** The step file that binds both scenarios. It imports the badge from its own owner and nothing from another. */
export const badgeStepFile = [
  "import assert from 'node:assert/strict';",
  '',
  "import { Given, Then, When } from '@cucumber/cucumber';",
  "import { createElement } from 'react';",
  "import { renderToStaticMarkup } from 'react-dom/server';",
  '',
  "import { StatusBadge, type StatusBadgeProps } from '../../status-badge.js';",
  '',
  '/*',
  ' * The badge\'s acceptance scenarios, rendered to static markup as its unit',
  ' * tests render it. No World: what a scenario rendered stays in this file,',
  ' * and each scenario\'s first step replaces it.',
  ' */',
  '',
  'let props: StatusBadgeProps | null = null;',
  "let markup = '';",
  '',
  "Given('a badge for a {word} review with the tone {string}', (status: string, tone: string) => {",
  "  props = { status: status as StatusBadgeProps['status'], tone: tone as NonNullable<StatusBadgeProps['tone']> };",
  '});',
  '',
  "Given('a badge for a {word} review with no tone', (status: string) => {",
  "  props = { status: status as StatusBadgeProps['status'] };",
  '});',
  '',
  "When('the badge is rendered', () => {",
  "  assert.ok(props, 'no badge was given');",
  '  markup = renderToStaticMarkup(createElement(StatusBadge, props));',
  '});',
  '',
  "Then('its markup carries the tone {string}', (tone: string) => {",
  '  assert.ok(markup.includes(`data-tone="${tone}"`), markup);',
  '});',
  '',
  "Then('it still reads {string}', (label: string) => {",
  '  assert.ok(markup.includes(`>${label}<`), markup);',
  '});',
  '',
].join('\n');

/**
 * The plan's implementation: the source Plan 3's trial recorded, the badge
 * with its tone and the tone's own tests, and the owner's declaration, which
 * now exposes the new tone type beside the props whose signature names it.
 * Ramify has required that companion since Plan 3's trial was recorded.
 */
export async function badgeImplementation(): Promise<Record<string, string>> {
  const recorded = fileURLToPath(new URL('../../../../../docs/plans/03-autonomous-implementation-loop/trial/status-badge-tone/stages.json', import.meta.url));
  const { stages } = JSON.parse(await readFile(recorded, 'utf8')) as { stages: Array<{ files: Record<string, string> }> };
  const declaration = await readFile(join(fixtureRoot, badgeDeclaration), 'utf8');
  const exposed = 'expose-src StatusBadge, StatusBadgeProps from "status-badge.tsx"';
  if (!declaration.includes(exposed)) throw new Error(`${badgeDeclaration} no longer exposes the badge as this helper expects`);
  return {
    ...stages[0]!.files,
    [badgeDeclaration]: declaration.replace(exposed, 'expose-src StatusBadge, StatusBadgeProps, StatusBadgeTone from "status-badge.tsx"'),
  };
}
