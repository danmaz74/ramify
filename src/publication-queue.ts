/** Serialize complete CLI publications with finite byte admission, including the
 * publication currently flushing to stdout. A failed publication stops later ones. */
export function createPublicationQueue(publish: (text: string) => Promise<void>, maximumBytes: number) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new RangeError('Invalid CLI output queue bound');
  let publication = Promise.resolve(), queuedBytes = 0;
  return {
    append(text: string): Promise<void> {
      const bytes = Buffer.byteLength(text);
      if (bytes > maximumBytes - queuedBytes) throw new Error(`CLI output queue exceeded ${maximumBytes} bytes`);
      queuedBytes += bytes;
      publication = publication.then(() => publish(text)).finally(() => { queuedBytes -= bytes; });
      return publication;
    },
  };
}
