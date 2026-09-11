/** Bounded dispatch capacity for complete reports from the reviewed 1,000-owner fixture.
 * Keep the report shape and finite admission checks across batch, history and IPC. */
export const reportCapacity = Object.freeze({
  reportBytes: 96 * 1024 ** 2,
  responseBytes: 96 * 1024 ** 2 + 64 * 1024,
  cliOutputBytes: 128 * 1024 ** 2,
  outboundBytes: 128 * 1024 ** 2,
  historyBytes: 128 * 1024 ** 2,
});
