import { readConsultations, consultationText } from '../projections/consultations.js';

/** The root parses these options; consultation meaning and retained-record reading belong to harness. */
export interface ConsultationCommandOptions {
  readonly run: string;
  readonly session?: string;
  readonly id?: string;
  readonly format?: 'text' | 'json';
}
export interface ConsultationCommandResult { readonly stdout: string; readonly stderr: string; readonly exitStatus: number }
export async function runConsultationsCommand(options: ConsultationCommandOptions): Promise<ConsultationCommandResult> {
  try {
    if (options.id !== undefined && options.session !== undefined) throw new Error('Choose --id or --session, not both');
    if (options.format !== undefined && options.format !== 'text' && options.format !== 'json') throw new Error('--format must be text or json');
    const view = await readConsultations(options);
    return { stdout: options.format === 'json' ? `${JSON.stringify(view, null, 2)}\n` : consultationText(view, options.id !== undefined), stderr: '', exitStatus: 0 };
  } catch (error) {
    return { stdout: '', stderr: `Cannot read consultations from ${options.run}: ${error instanceof Error ? error.message : String(error)}\n`, exitStatus: 2 };
  }
}
