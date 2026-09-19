import { harnessFormats } from '../subs/harness/src/index.js';
import { projectedFormats } from '../subs/web/src/index.js';

/** True when the writer and the reader agree on both formats. */
export function formatsAgree(): boolean {
  const written = harnessFormats(), read = projectedFormats();
  return written.artifact === read.artifact && written.events === read.events;
}
