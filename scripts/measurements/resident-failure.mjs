import { reportCommand } from './resident-driver.mjs';

/** A cleanup failure remains binding without replacing the original failure. */
export async function withResident(host, operation) {
  let primary;
  try { return await operation(); }
  catch (error) { primary = error; throw error; }
  finally {
    try { await host.close(); }
    catch (cleanup) {
      if (primary !== undefined) throw new AggregateError([primary, cleanup], 'Resident workload and cleanup both failed');
      throw cleanup;
    }
  }
}

/** Retain failed command bytes only, under command()'s existing output bound. */
export async function coldCommand(host, project, measurements) {
  const sample = await host.cli(project);
  let connectionFailure;
  // Cold CLI startup owns a daemon even when its first report is incomplete.
  // Establish its cleanup connection before checking that report.
  try { await host.connect('never'); } catch (error) { connectionFailure = error; }
  try {
    const report = reportCommand(sample, project.owners);
    if (connectionFailure !== undefined) throw connectionFailure;
    return { sample, report };
  } catch (error) {
    (measurements.failedCommands ??= []).push({ pid: sample.pid, durationMs: sample.durationMs,
      code: sample.code, signal: sample.signal, failure: sample.failure, stdout: sample.stdout, stderr: sample.stderr });
    if (connectionFailure !== undefined && error !== connectionFailure) {
      throw new AggregateError([error, connectionFailure], 'Cold report and cleanup connection both failed');
    }
    throw error;
  }
}

export function failureText(error) {
  const text = error?.stack ?? String(error);
  return error instanceof AggregateError
    ? `${text}\n${error.errors.map((cause, index) => `Cause ${index + 1}: ${failureText(cause)}`).join('\n')}` : text;
}
