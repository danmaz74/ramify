import { expect } from 'vitest';
import type { CandidateSource } from '../../../subs/evidence/src/git.js';

/** Exact transport observations for the scratch policy paths, with persistent violations. */
export function scratchCandidateReplies(root: string, replies: readonly { operation: keyof CandidateSource; args: readonly unknown[]; answer: unknown }[]) {
  let used = 0;
  const errors: unknown[] = [];
  const operations: (keyof CandidateSource)[] = ['commitTree', 'treeEntries', 'readBlob', 'grepTree', 'diffNameStatus', 'diffPatch'];
  const candidates = Object.fromEntries(operations.map(operation => [operation, async (...args: unknown[]) => {
    try {
      expect(args[0]).toBe(root);
      const reply = replies[used++]; expect(reply, 'undeclared candidate operation').toBeDefined();
      expect(operation).toBe(reply!.operation); expect(args).toEqual(reply!.args); return reply!.answer;
    } catch (error) { errors.push(error); throw error; }
  }])) as unknown as CandidateSource;
  return { candidates, assertComplete() { expect(errors, 'caught candidate violations').toEqual([]); expect(used).toBe(replies.length); } };
}
