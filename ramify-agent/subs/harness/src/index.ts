import { artifactSchemaVersion, eventSchemaVersion } from '../../contracts/src/index.js';

/** Formats the harness writes. Placeholder until the run store exists. */
export function harnessFormats(): { readonly artifact: number; readonly events: number } {
  return { artifact: artifactSchemaVersion, events: eventSchemaVersion };
}
