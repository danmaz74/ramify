import type { Role } from '../../harness/src/interfaces/protocol/runs.js';

/** One role glyph shared by map markers, shelf rows and transcript headers. */
export function RoleIcon({ role }: { role: Role }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  if (role === 'initial-architect') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>;
  if (role === 'global-fork') return <svg {...common}><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v3c0 3 6 2 6 7M18 7v3c0 3-6 2-6 7" /></svg>;
  if (role === 'local-architect') return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>;
  if (role === 'reviewer') return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
  if (role === 'engineer') return <svg {...common}><path d="M14 4a6 6 0 0 0-6 7L3 16l5 5 5-5a6 6 0 0 0 7-7l-4 4-4-4z" /></svg>;
  return <svg {...common}><path d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-2 2M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l2-2" /></svg>;
}
