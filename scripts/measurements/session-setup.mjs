import { resolve } from 'node:path';
import { checkedReport, packageRoot, sessionInputs } from './common.mjs';

/** Readiness is a completed real batch with its report and session still reachable. */
export async function setup() {
  const { createAnalysisSession } = await import('ramify.ts/analysis');
  const root = resolve(process.env.RAMIFY_MEASUREMENT_ROOT ?? resolve(packageRoot, 'examples/collection-review'));
  const expectedOwners = Number(process.env.RAMIFY_MEASUREMENT_OWNERS ?? 15);
  const session = createAnalysisSession(await sessionInputs(root));
  try {
    const report = checkedReport(await session.analyze(), expectedOwners);
    return { session, report, async dispose() { await session.dispose(); } };
  } catch (error) { await session.dispose(); throw error; }
}
