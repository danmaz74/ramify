import { expect } from 'vitest';
import { RamifyCli, type RamifyRun } from '../../ramify-cli.js';

/** An independently declared command reply; no shell text is interpreted. */
export interface CliReply {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly result: RamifyRun;
  readonly times?: number;
}

/** Runs the real check builders/decoders over finite replies, retaining caught refusals. */
export class ScriptedCli extends RamifyCli {
  readonly calls: Array<{ argv: readonly string[]; cwd: string }> = [];
  private readonly failures: string[] = [];
  private readonly replies: Array<{ reply: CliReply; used: number }> = [];
  constructor() { super({ executable: '/nonexistent/scripted-cli-starts-no-process' }); }
  declare(reply: CliReply): void { this.replies.push({ reply, used: 0 }); }
  override async run(argv: readonly string[], cwd: string, _signal?: AbortSignal): Promise<RamifyRun> {
    try {
      const entry = this.replies.find(item => item.used < (item.reply.times ?? 1));
      expect(entry, 'no unconsumed CLI reply declared').toBeDefined();
      expect(argv, 'declared CLI argv').toEqual(entry!.reply.argv);
      expect(cwd, 'declared CLI cwd').toBe(entry!.reply.cwd);
      entry!.used++; this.calls.push({ argv: [...argv], cwd });
      return { ...entry!.reply.result };
    } catch (error) { this.failures.push(String(error)); throw error; }
  }
  assertComplete(): void {
    expect(this.failures, 'persistent caught CLI refusals').toEqual([]);
    for (const { reply, used } of this.replies) expect(used, `required reply ${reply.argv.join(' ')}`).toBe(reply.times ?? 1);
  }
}
