import { expect } from 'vitest';
import { childEnvironment, type CommandRunner } from '../../../subs/evidence/src/run-command.js';
import type { DirectCheckStep } from './direct-check-execution.js';
import { commandResult } from './command-result.js';

/** Finite transport replies; the real in-place executor and provider decide the result. */
export function inPlaceReplies(root: string, replies: readonly ({
  readonly argv: readonly string[]; readonly cwd?: string; readonly timeoutMs?: number;
  readonly effect?: () => Promise<void>;
} & DirectCheckStep)[]) {
  let consumed = 0;
  const failures: unknown[] = [];
  const runner: CommandRunner = async request => {
    try {
      const reply = replies[consumed++];
      expect(reply, 'undeclared command request').toBeDefined();
      expect(request.argv).toEqual(reply!.argv);
      expect(request.cwd).toBe(reply!.cwd ?? root);
      expect(request.timeoutMs).toBe(reply!.timeoutMs ?? 30_000);
      expect(request.env).toEqual(childEnvironment());
      expect(request.signal).toBeInstanceOf(AbortSignal);
      expect(request.outputFile).toMatch(/\/\d\d-(setup|type-check|ramify-check)\.log$/u);
      expect(request.stdin).toBeUndefined();
      expect(request.registerProcessGroup).toBeUndefined();
      await reply!.effect?.();
      return await commandResult(request, reply!);
    } catch (error) { failures.push(error); throw error; }
  };
  return { runner, assertComplete() {
    expect(failures, 'caught transport violations').toEqual([]);
    expect(consumed, 'all declared command replies consumed').toBe(replies.length);
  } };
}
