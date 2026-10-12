import type { ContextRevision, RecoveryEvidence } from './interfaces/contexts.js';

type Gap = 'context-restarted' | 'context-evicted' | 'watcher-loss' | 'path-overflow' | 'byte-pressure';
const gapOrder: readonly Gap[] = ['context-restarted', 'context-evicted', 'watcher-loss', 'path-overflow', 'byte-pressure'];
const byteOrder = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const size = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** Compact observations owned by one live context. Sequence numbers describe receipt, not
 * session revisions: a path seen on both sides of a capture survives its publication. */
export class RecoveryHistory {
  private readonly paths = new Map<string, number>();
  private readonly gaps = new Map<Gap, number>();
  private baseline: RecoveryEvidence['lastCompleted'] = null;
  private sequence = 0;
  private retainedBytes = 0;

  constructor(private readonly maxPaths: number, private readonly fits: () => boolean) {
    this.retainedBytes = size({ baseline: null, sequence: 0, paths: [], gaps: [] });
  }

  get capturedSequence(): number { return this.sequence; }
  get pathCount(): number { return this.paths.size; }
  get bytes(): number { return this.retainedBytes; }

  /** Each map serializes as an array of `[name, sequence]` entries. A comma is
   * present between entries only, so these deltas equal the full JSON size. */
  private entryBytes(name: string, sequence: number): number { return size([name, sequence]); }

  private nextSequence(): number {
    const previous = this.sequence;
    this.sequence++;
    this.retainedBytes += String(this.sequence).length - String(previous).length;
    return this.sequence;
  }

  private setEntry(map: Map<string, number>, name: string, sequence: number): void {
    const previous = map.get(name);
    map.set(name, sequence);
    this.retainedBytes += this.entryBytes(name, sequence)
      - (previous === undefined ? 0 : this.entryBytes(name, previous))
      + (previous === undefined && map.size > 1 ? 1 : 0);
  }

  private deleteEntry(map: Map<string, number>, name: string): void {
    const previous = map.get(name);
    if (previous === undefined) return;
    const comma = map.size > 1 ? 1 : 0;
    map.delete(name);
    this.retainedBytes -= this.entryBytes(name, previous) + comma;
  }

  private gap(code: Gap): boolean {
    const prior = this.gaps.get(code);
    this.setEntry(this.gaps, code, this.nextSequence());
    if (!this.fits()) {
      // Drop recently admitted observations before dropping a gap marker.
      for (const path of [...this.paths.keys()].reverse()) {
        if (this.fits()) break;
        this.deleteEntry(this.paths, path);
      }
    }
    if (this.fits()) return true;
    if (prior === undefined) this.deleteEntry(this.gaps, code);
    else this.setEntry(this.gaps, code, prior);
    return false;
  }

  observe(path: string): boolean {
    if (!path) return true;
    const previous = this.paths.get(path);
    if (previous !== undefined) {
      this.setEntry(this.paths, path, this.nextSequence());
      return this.fits();
    }
    if (this.paths.size >= this.maxPaths) return this.gap('path-overflow');
    this.setEntry(this.paths, path, this.nextSequence());
    if (this.fits()) return true;
    this.deleteEntry(this.paths, path);
    return this.gap('byte-pressure');
  }

  watcherLost(): boolean { return this.gap('watcher-loss'); }
  contextEvicted(): boolean { return this.gap('context-evicted'); }
  pathOverflow(): boolean { return this.gap('path-overflow'); }
  bytePressure(): boolean { return this.gap('byte-pressure'); }

  completedBytes(revision: ContextRevision, capturedSequence: number): number {
    const baseline = { context: revision.token.context, generation: revision.token.generation,
      revision: revision.revision, inputId: revision.fingerprints.inputId };
    return size({ baseline, sequence: this.sequence,
      paths: [...this.paths].filter(([, sequence]) => sequence > capturedSequence),
      gaps: [...this.gaps].filter(([, sequence]) => sequence > capturedSequence) });
  }

  /** Only a completed publication establishes a baseline. Capture's receipt boundary
   * excludes later observations, including another observation of an earlier path. */
  complete(revision: ContextRevision, capturedSequence: number): void {
    for (const [path, sequence] of this.paths) if (sequence <= capturedSequence) this.deleteEntry(this.paths, path);
    for (const [gap, sequence] of this.gaps) if (sequence <= capturedSequence) this.deleteEntry(this.gaps, gap);
    const previous = this.baseline;
    this.baseline = Object.freeze({ context: revision.token.context, generation: revision.token.generation,
      revision: revision.revision, inputId: revision.fingerprints.inputId });
    this.retainedBytes += size(this.baseline) - size(previous);
  }

  snapshot(): RecoveryEvidence {
    const gaps = [...gapOrder.filter(gap => this.gaps.has(gap))];
    const reasons = this.baseline ? gaps : ['no-completed-baseline', ...gaps];
    const paths = Object.freeze([...this.paths.keys()].sort(byteOrder));
    return Object.freeze({ schemaVersion: 'ramify.recovery/1', lastCompleted: this.baseline,
      changes: Object.freeze({ paths, coverage: this.baseline && (paths.length || !gaps.length) ? 'observed' : 'unavailable',
        reason: reasons.length ? reasons.join('; ') : null }) });
  }

  dispose(): void { this.paths.clear(); this.gaps.clear(); this.baseline = null; this.sequence = 0; this.retainedBytes = 0; }
}
