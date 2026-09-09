/** Private wire vocabulary; compiler objects never cross the helper pipe. */
export interface ConfigurationData {
  options: Record<string, unknown>;
  files: string[];
  references: string[];
  exclusions: { directory: string; patterns: string[] }[];
}
export const FRAME_BYTES = 1024 * 1024;
export const CHUNK_BYTES = 192 * 1024;
