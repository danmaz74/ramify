/** Exact duplicate detection has a finite connection lifetime. The host closes
 * the connection on exhaustion; it never evicts old IDs and accepts them again. */
export function createRequestIdentities(maximum = 100_000) {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('Invalid request identity limit');
  const used = new Set<string>();
  return {
    admit(id: string): 'accepted' | 'duplicate' | 'exhausted' {
      if (used.has(id)) return 'duplicate';
      if (used.size >= maximum) return 'exhausted';
      used.add(id); return 'accepted';
    },
    clear(): void { used.clear(); },
  };
}
