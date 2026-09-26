import type { Role } from '../../harness/src/interfaces/protocol/runs.js';

/** Semantic colors are accents and text; every mark also carries a label or shape. */
export const executionMapVisualTokens = {
  light: {
    background: '#ffffff',
    status: { todo: '#475569', working: '#1d4ed8', completed: '#15803d', attention: '#92400e', failed: '#b91c1c' },
    participation: '#6d28d9',
    role: { 'initial-architect': '#0e7490', 'catalog-extractor': '#155e75', 'global-fork': '#a21caf', 'local-architect': '#0f766e',
      engineer: '#4338ca', 'contract-engineer': '#92400e', reviewer: '#be123c', 'failure-analyst': '#57534e',
      'context-selector': '#1d4ed8', 'nonfunctional-coordinator': '#6d28d9', 'nonfunctional-repair-engineer': '#a16207' },
  },
  dark: {
    background: '#0f172a',
    status: { todo: '#cbd5e1', working: '#93c5fd', completed: '#86efac', attention: '#fcd34d', failed: '#fca5a5' },
    participation: '#c4b5fd',
    role: { 'initial-architect': '#67e8f9', 'catalog-extractor': '#a5f3fc', 'global-fork': '#f0abfc', 'local-architect': '#5eead4',
      engineer: '#a5b4fc', 'contract-engineer': '#fdba74', reviewer: '#fda4af', 'failure-analyst': '#d6d3d1',
      'context-selector': '#93c5fd', 'nonfunctional-coordinator': '#c4b5fd', 'nonfunctional-repair-engineer': '#fcd34d' },
  },
  roleIdentity: {
    'initial-architect': { label: 'Initial architect', icon: 'compass' },
    'catalog-extractor': { label: 'Catalog extractor', icon: 'search' },
    'global-fork': { label: 'Global fork', icon: 'branch' },
    'local-architect': { label: 'Local architect', icon: 'blueprint' },
    engineer: { label: 'Engineer', icon: 'tool' },
    'contract-engineer': { label: 'Contract engineer', icon: 'link' },
    reviewer: { label: 'Reviewer', icon: 'eye' },
    'failure-analyst': { label: 'Failure analyst', icon: 'search' },
    'context-selector': { label: 'Context selector', icon: 'search' },
    'nonfunctional-coordinator': { label: 'Non-functional coordinator', icon: 'compass' },
    'nonfunctional-repair-engineer': { label: 'Non-functional repair engineer', icon: 'tool' },
  } satisfies Record<Role, { label: string; icon: string }>,
  unavailable: { label: 'Unavailable', pattern: 'diagonal-hatch' },
  motion: { livePulseMs: 1600, focusOutlineMs: 900, reducedMotion: 'static-outline' },
} as const;
