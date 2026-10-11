import { createRoot } from 'react-dom/client';
import type { Receipt } from '../../../../harness/src/interfaces/protocol/jobs.js';
import type { PlanListResponse, PlanResponse } from '../../../../harness/src/interfaces/protocol/queries.js';
import type {
  DebugExchangeResponse, DebugInspectionResponse, DebugStateResponse, ProjectedRunEvent, RunCommandInput, RunListResponse,
} from '../../../../harness/src/interfaces/protocol/runs.js';
import { App } from '../../app.js';
import { StubClient } from '../helpers/stub-client.js';
import '../../styles.css';

/*
 * Browser witness for Plan 35: the real App over a stub client that replays
 * the debug answers one scripted breakpoint run exported through the real
 * route handlers (`plan35-debug-answers.json`). The stub advances on each
 * command it receives: start-run shows the paused run, debug-message the
 * admitted exchange and, after it has been read `held` times, the settled
 * one, debug-resume the resumed run and then the completed one.
 */

type StepName = 'paused' | 'admitted' | 'settled' | 'resumed' | 'ended';
interface Step { readonly debug: DebugStateResponse; readonly events: ProjectedRunEvent[] }
interface Export {
  readonly planId: string;
  readonly runId: string;
  readonly before: { readonly plans: PlanListResponse; readonly plan: PlanResponse; readonly runs: RunListResponse };
  readonly runs: { readonly paused: RunListResponse; readonly ended: RunListResponse };
  readonly steps: Record<StepName, Step>;
  readonly inspection: DebugInspectionResponse;
  readonly exchanges: { readonly admitted: DebugExchangeResponse; readonly settled: DebugExchangeResponse };
}

const data = await fetch('/plan35-debug-answers.json').then(async response => {
  if (!response.ok) throw new Error(`Debug answers returned ${response.status}`);
  return await response.json() as Export;
});

/** Debug-state reads an intermediate answer receives before the next one replaces it. */
const held = 3;

class ReplayClient extends StubClient {
  shown: StepName | 'none' = 'none';
  private next: StepName | undefined;
  private reads = 0;

  show(step: StepName, next?: StepName): void {
    const { debug, events } = data.steps[step];
    const { pauseId } = data.inspection.inspection;
    this.runs.set(data.runId, {
      snapshot: debug.run, events, debug,
      inspections: { [pauseId]: data.inspection },
      exchanges: { [data.exchanges.settled.exchange!.commandId]: step === 'admitted' ? data.exchanges.admitted : data.exchanges.settled },
    });
    if (step === 'paused') this.runList = data.runs.paused;
    if (step === 'ended') this.runList = data.runs.ended;
    this.shown = step;
    this.next = next;
    this.reads = 0;
  }

  override async getDebugState(planId: string, runId: string): Promise<DebugStateResponse> {
    const answer = await super.getDebugState(planId, runId);
    this.reads += 1;
    if (this.next !== undefined && this.reads >= held) this.show(this.next);
    return answer;
  }

  override async sendCommand(command: RunCommandInput): Promise<Receipt> {
    const receipt = await super.sendCommand(command);
    if (command.type === 'start-run') this.show('paused');
    if (command.type === 'debug-message') this.show('admitted', 'settled');
    if (command.type === 'debug-resume') this.show('resumed', 'ended');
    return receipt;
  }
}

const client = new ReplayClient();
client.plans = data.before.plans.plans;
client.documents.set(data.planId, data.before.plan.plan);
client.runList = data.before.runs;
client.receipt = { ...client.receipt, jobId: data.runId };

window.plan35 = { commands: () => client.commands, calls: () => client.calls, shown: () => client.shown };
declare global {
  interface Window { plan35: { commands: () => RunCommandInput[]; calls: () => string[]; shown: () => string } }
}

createRoot(document.getElementById('root')!).render(<App client={client} />);
