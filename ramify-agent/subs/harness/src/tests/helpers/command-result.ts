import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { outputTailBytes, type CommandRequest, type CommandRun } from '../../../subs/evidence/src/run-command.js';
import type { DirectCheckStep } from './direct-check-execution.js';

/** The command's declared response, with real output-file persistence where requested. */
export async function commandResult(request: CommandRequest, step: DirectCheckStep): Promise<CommandRun> {
  const stdout = step.stdout ?? '';
  const stderr = step.stderr ?? '';
  const bytes = Buffer.from(stdout + stderr);
  if (request.outputFile !== undefined) {
    await mkdir(dirname(request.outputFile), { recursive: true });
    await writeFile(request.outputFile, bytes);
  }
  return {
    outcome: step.outcome ?? { kind: 'completed', exitCode: 0 },
    startedAt: '2000-01-01T00:00:00.000Z', elapsedMs: step.elapsedMs ?? 0,
    output: { path: request.outputFile ?? null, bytes: bytes.length, truncated: step.truncated ?? false,
      tail: bytes.subarray(Math.max(0, bytes.length - outputTailBytes)).toString('utf8') },
    stdout, stderr,
  };
}
