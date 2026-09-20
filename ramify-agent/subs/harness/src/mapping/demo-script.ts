import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MapSubmission } from '../interfaces/map.js';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';

/** The root module's declared name, read from its `module.ramify`. */
export function rootModuleName(projectRoot: string): string {
  try {
    const text = readFileSync(join(projectRoot, 'module.ramify'), 'utf8');
    const match = /^\s*module\s+(?:"([^"]+)"|([^\s"]+))/m.exec(text);
    return match?.[1] ?? match?.[2] ?? 'root';
  } catch {
    return 'root';
  }
}

/**
 * A map that says what it is: a demonstration from the scripted fake, valid
 * in shape, touching only the root module. It is not an architect's work.
 */
export function demonstrationMap(root: string): MapSubmission {
  return {
    summary: {
      change: 'Demonstration map from the scripted fake agent. It shows the mapping job\'s lifecycle and is not an architecture.',
      preserves: [],
    },
    modulesTouched: [{ module: root, weight: 'light', why: 'The scripted fake names only the root module.' }],
    reuse: [],
    newCapabilities: [],
    seams: [],
    entryPoint: { module: root, acceptance: 'None: this map was not produced by an architect.' },
    workItems: [],
    assumptions: {
      assumed: ['This map was produced by the scripted fake agent, not by an architect.'],
      notFound: [],
      coverageLimits: ['A demonstration: no evidence was weighed.'],
    },
    evidence: [{ claim: `The root module is "${root}".`, citations: [{ kind: 'declaration', path: 'module.ramify', line: 1 }] }],
  };
}

/**
 * The script `serve --agent fake` runs: a few reads and searches with pauses
 * of `paceMs`, token usage, and a valid demonstration map.
 */
export function demonstrationScript(paceMs: number): (spec: SessionSpec) => readonly ScriptStep[] {
  return spec => {
    const root = rootModuleName(spec.scope.workingDirectory);
    const usage = (input: number, output: number) => ({ input, output, cacheRead: 0, cacheWrite: 0, total: input + output });
    return [
      { kind: 'message', text: 'Scripted fake: reading the module tree.', usage: usage(1200, 40) },
      { kind: 'wait', ms: paceMs },
      { kind: 'tool', tool: 'read', input: { path: 'module.ramify' } },
      { kind: 'wait', ms: paceMs },
      { kind: 'tool', tool: 'ls', input: { path: 'subs' } },
      { kind: 'wait', ms: paceMs },
      { kind: 'tool', tool: 'grep', input: { pattern: 'expose-sub', path: '.', glob: '*.ramify' } },
      { kind: 'wait', ms: paceMs },
      { kind: 'tool', tool: 'read', input: { path: 'README.md' } },
      { kind: 'wait', ms: paceMs },
      // Runs for real when the procedure offers it; otherwise it is reported as an unknown tool.
      { kind: 'tool', tool: 'materialize_api_view', input: { module: root } },
      { kind: 'wait', ms: paceMs },
      { kind: 'message', text: 'Scripted fake: submitting a demonstration map.', usage: usage(2400, 900) },
      { kind: 'wait', ms: paceMs },
      { kind: 'submit', input: demonstrationMap(root) },
    ];
  };
}
