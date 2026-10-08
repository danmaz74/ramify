import { aroundAll } from 'vitest';
import { installProcessGuard, verifyProcessGuard } from './helpers/process-guard.js';
installProcessGuard();
aroundAll(async runSuite => {
  let failure: unknown;
  try { await runSuite(); } catch (error) { failure = error; }
  try { verifyProcessGuard(); } catch (error) {
    if (failure !== undefined) throw new AggregateError([failure, error], 'Suite and process boundary both failed');
    throw error;
  }
  if (failure !== undefined) throw failure;
});
