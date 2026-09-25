import type { Role } from '../../harness/src/interfaces/protocol/runs.js';

/** Semantic colors are accents and text; every mark also carries a label or shape. */
export const executionMapVisualTokens = {
  light: {
    background: '#ffffff',
    status: { todo: '#475569', working: '#1d4ed8', completed: '#15803d', attention: '#92400e', failed: '#b91c1c' },
    participation: '#6d28d9',
    role: { 'initial-architect': '#0e7490', 'global-fork': '#a21caf', 'local-architect': '#0f766e',
      engineer: '#4338ca', 'contract-engineer': '#92400e', reviewer: '#be123c', 'failure-analyst': '#57534e' },
  },
  dark: {
    background: '#0f172a',
    status: { todo: '#cbd5e1', working: '#93c5fd', completed: '#86efac', attention: '#fcd34d', failed: '#fca5a5' },
    participation: '#c4b5fd',
    role: { 'initial-architect': '#67e8f9', 'global-fork': '#f0abfc', 'local-architect': '#5eead4',
      engineer: '#a5b4fc', 'contract-engineer': '#fdba74', reviewer: '#fda4af', 'failure-analyst': '#d6d3d1' },
  },
  roleIdentity: {
    'initial-architect': { label: 'Initial architect', icon: 'compass' },
    'global-fork': { label: 'Global fork', icon: 'branch' },
    'local-architect': { label: 'Local architect', icon: 'blueprint' },
    engineer: { label: 'Engineer', icon: 'tool' },
    'contract-engineer': { label: 'Contract engineer', icon: 'link' },
    reviewer: { label: 'Reviewer', icon: 'eye' },
    'failure-analyst': { label: 'Failure analyst', icon: 'search' },
  } satisfies Record<Role, { label: string; icon: string }>,
  unavailable: { label: 'Unavailable', pattern: 'diagonal-hatch' },
  motion: { livePulseMs: 1600, focusOutlineMs: 900, reducedMotion: 'static-outline' },
} as const;
