import { artifactSchemaVersion, eventSchemaVersion } from '../../contracts/src/index.js';

/** Formats the web projection reads. Placeholder until the first view exists. */
export function projectedFormats(): { readonly artifact: number; readonly events: number } {
  return { artifact: artifactSchemaVersion, events: eventSchemaVersion };
}
