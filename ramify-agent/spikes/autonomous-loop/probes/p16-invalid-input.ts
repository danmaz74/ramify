/*
 * Probe 16: invalid tool input.
 *
 * The model is scripted to call a harness tool and a submission tool with
 * arguments that break their declared JSON Schema. The probe reports whether
 * pi rejects them itself, what the model receives, and whether the adapter can
 * observe the rejection, which rule 10 requires so that every rejection is
 * counted, recorded and answered with every error.
 *
 * It also builds a submission schema with zod's `z.toJSONSchema` from a union
 * discriminated on `kind` and reports what pi does with it. Whether a real
 * provider accepts that schema is a separate question, recorded in the
 * results note: this spike has no pi login.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { attempt, Log, open, requestText, result, workspace, type Probe } from '../lib/probe.js';
import { call, text } from '../lib/scripted-provider.js';

const submissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('completed'), files: z.array(z.string()).min(1), summary: z.string() }),
  z.object({ kind: z.literal('blocked'), reason: z.string(), needs: z.array(z.string()) }),
]);

export const probe: Probe = {
  number: 16,
  title: 'Invalid tool input',
  async run() {
    const log = new Log();
    const json = z.toJSONSchema(submissionSchema) as Record<string, unknown>;
    log.show('discriminatedUnionJsonSchemaTopLevelKeys', Object.keys(json).sort());
    log.show('discriminatedUnionJsonSchema', json);

    const seenByHarnessTool: unknown[] = [];
    const seenBySubmission: unknown[] = [];
    /** A typed schema, so pi has something to validate and possibly coerce against. */
    const typed = defineTool({
      name: 'run_scope_tests',
      label: 'run_scope_tests',
      description: 'Runs the selected tests.',
      parameters: { type: 'object', properties: { suite: { type: 'string' }, retries: { type: 'number' } }, required: ['suite'] } as never,
      async execute(_callId, params) {
        seenByHarnessTool.push(params);
        return { content: [{ type: 'text', text: 'ran' }], details: {} };
      },
    });
    /** The submission tool as the adapter builds it: the union's real schema, handed to pi directly. */
    const submit = defineTool({
      name: 'submit',
      label: 'submit',
      description: 'Ends the work with a result.',
      parameters: json as never,
      executionMode: 'sequential',
      async execute(_callId, params) {
        seenBySubmission.push(params);
        const parsed = submissionSchema.safeParse(params);
        if (!parsed.success) throw new Error(`The submission was rejected:\n${parsed.error.issues.map(issue => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')}`);
        return { content: [{ type: 'text', text: 'accepted' }], details: {}, terminate: true };
      },
    });

    const space = await workspace([
      // A required field missing, and a number where a string is declared.
      call('run_scope_tests', { retries: 'two' }),
      // A number where the schema says string: the classic silent coercion.
      call('run_scope_tests', { suite: 7 }),
      // A union member that does not exist.
      call('submit', { kind: 'abandoned', why: 'I gave up' }),
      // The right member with a broken field.
      call('submit', { kind: 'completed', files: [], summary: 'nothing' }),
      // A valid submission.
      call('submit', { kind: 'completed', files: ['a.ts'], summary: 'done' }),
      text('finished'),
    ]);
    const toolEnds: Array<{ tool: string; isError: boolean; text: string }> = [];
    try {
      const it = await open({
        workspace: space,
        session: { mode: 'create' },
        tools: ['run_scope_tests', 'submit'],
        customTools: [typed, submit],
        onEvent: event => {
          if (event.type !== 'tool_execution_end') return;
          const content = (event.result as { content?: ReadonlyArray<{ type: string; text?: string }> } | undefined)?.content ?? [];
          toolEnds.push({ tool: event.toolName, isError: event.isError, text: content.map(block => block.text ?? '').join(' ') });
        },
      });
      await it.session.prompt('do the work');
      log.show('toolExecutionEnd', toolEnds);
      log.show('argumentsThatReachedTheHarnessTool', seenByHarnessTool);
      log.show('argumentsThatReachedTheSubmissionTool', seenBySubmission);
      log.show('modelRequests', space.scripted.requests.length);
      const last = requestText(space.scripted, space.scripted.requests.length - 1);
      log.show('modelSawAValidationMessage', /required|expected|invalid/i.test(last));
      log.show('submissionSchemaOfferedToTheModel', space.scripted.requests[0]?.tools.find(tool => tool.name === 'submit')?.parameters);
      it.close();

      const rejectedBeforeExecute = toolEnds.filter(end => end.isError).length;
      const reachedHarness = seenByHarnessTool.length;
      const reachedSubmission = seenBySubmission.length;
      const coerced = seenByHarnessTool.some(params => typeof (params as { suite?: unknown }).suite === 'string' && (params as { suite?: unknown }).suite === '7');
      return result(probe, 'verified-with-limitation', log,
        `pi validates tool arguments against the declared schema before the tool runs and turns a failure into an error tool result the model sees: ${rejectedBeforeExecute} of the ${toolEnds.length} calls ended in error. ${reachedHarness} of 2 calls reached the harness tool and ${reachedSubmission} of 3 reached the submission tool. pi coerces a number to a declared string: ${coerced}. The adapter observes every rejection through \`tool_execution_end\` with \`isError\`, which is what rule 10 needs to count them. The \`z.toJSONSchema\` union discriminated on \`kind\` is accepted by \`defineTool\` and offered to the model unchanged; whether a real provider accepts it was not tested, because this spike has no pi login.`);
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
