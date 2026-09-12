import { expect } from 'vitest';
import { createContextManager } from '../context-manager.js';
import { createGenerationId } from '../tokens.js';
import type { CheckRequest, ContextBudgets, ContextStatus, ContextToken } from '../interfaces/contexts.js';
import { createControlledClock, createControlledWatcher } from './controlled-ports.js';
import { createScriptedDriver, flush, testBudgets } from './scripted-driver.js';

export function sessionEnvironment(budgets: Partial<ContextBudgets> = {}) {
  const script = createScriptedDriver();
  const clock = createControlledClock();
  const watcher = createControlledWatcher();
  const manager = createContextManager({ driver: script.driver, clock, watcher,
    budgets: { ...testBudgets, ...budgets }, engine: 'test-engine', generationId: createGenerationId });
  let sequence = 0;
  async function open(root = '/fixture', lease = 'lease', cwd = root) {
    const result = await manager.open({ cwd, root, scope: 'whole-project', configuration: 'discover' },
      { registry: 'default', capabilities: [] }, lease);
    if (result.status !== 'opened') throw new Error(`Expected context, received ${result.status}`);
    return result;
  }
  function check(token: ContextToken, freshness: CheckRequest['freshness'], options: Partial<Pick<CheckRequest, 'scope' | 'since' | 'deadlineMs'>> = {}, lease = 'lease') {
    return manager.check({ token, requestId: `session-${++sequence}`, scope: 'delta', freshness, ...options }, lease);
  }
  const status = (token: ContextToken) => manager.list().find(item => item.token.context === token.context) ?? manager.status(token) as ContextStatus;
  async function dispose() {
    await manager.dispose(); await flush();
    expect(manager.list()).toEqual([]); expect(clock.pending).toBe(0); expect(watcher.active).toBe(0);
    expect(script.disposed).toBe(true);
    expect(script.sessions.every(session => session.disposeCalls === 1)).toBe(true);
  }
  return { manager, script, clock, watcher, open, check, status, dispose };
}
