export type * from './interfaces/model.js';
export { resolveTagRegistry, createDefaultTagRegistry } from './registry.js';
export { deriveSourceAreas, assignOriginalTags } from './profiles.js';
export { originalKey } from './identity.js';
export { buildModel } from './model.js';
export { explainVisibility, explainImport } from './decisions.js';
