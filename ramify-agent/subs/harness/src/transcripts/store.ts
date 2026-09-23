import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileExclusive } from '../../subs/ledger/src/atomic.js';

/*
 * The content store of a run or a standalone session: `blobs/<sha256>`, one
 * file per body, named by the SHA-256 of its UTF-8 bytes. Content is stored
 * once, however many entries and sessions name it: the same file read twice,
 * or the system prompt every invocation of a role shares.
 *
 * A blob is written whole or not at all, and never rewritten. It is raw
 * output, as the transcripts that name it are, and no record names it.
 */

/** Where a body went, and its size. */
export interface StoredContent {
  readonly hash: string;
  readonly bytes: number;
}

export class ContentStore {
  /** The blobs this process has stored or found, so a repeat touches nothing. */
  private readonly known = new Set<string>();

  constructor(readonly directory: string) {}

  /** Stores one body, unless it is already there, and answers its hash and size. */
  async put(content: string): Promise<StoredContent> {
    const bytes = Buffer.from(content, 'utf8');
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!this.known.has(hash)) {
      await mkdir(this.directory, { recursive: true });
      await writeFileExclusive(this.path(hash), bytes);
      this.known.add(hash);
    }
    return { hash, bytes: bytes.length };
  }

  path(hash: string): string {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`"${hash}" is not a content hash`);
    return join(this.directory, hash);
  }

  /** One body by its hash, or null where the store does not hold it. */
  async read(hash: string): Promise<string | null> {
    try {
      return await readFile(this.path(hash), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
