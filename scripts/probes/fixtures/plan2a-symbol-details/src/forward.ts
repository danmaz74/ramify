// A forwarding/re-export file: detail lookup for `forwardedTotal` must
// resolve back to `total`'s defining file (originals.ts), never claim
// forward.ts as the defining file.
export { total as forwardedTotal, Widget as ExportedWidget } from './originals.js';
