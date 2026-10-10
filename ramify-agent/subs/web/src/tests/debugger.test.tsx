import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { RunCommandInput } from '../../../harness/src/interfaces/protocol/runs.js';
import { ClientError } from '../client.js';
import { RunPage } from '../run-page.js';
import {
  answerDebug, debugClient, debugPlanId, debugRunId, debugSnapshot, debugState, exchange, inspection, messageEntry, pause, resumeEntry,
} from './helpers/debugger.js';
import type { StubClient } from './helpers/stub-client.js';

afterEach(() => { cleanup(); vi.useRealTimers(); });

async function openDebugger(client: StubClient, interval = 60_000): Promise<HTMLElement> {
  render(<RunPage client={client} planId={debugPlanId} runId={debugRunId} interval={interval} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Debugger' }));
  return screen.findByLabelText('Debugger');
}

const debugReads = (client: StubClient) => client.calls.filter(call => call.startsWith('getDebugState')).length;
const textarea = (area: HTMLElement) => within(area).getByRole('textbox', { name: 'Message to the engineer' }) as HTMLTextAreaElement;
const button = (area: HTMLElement, name: string) => within(area).getByRole('button', { name }) as HTMLButtonElement;
const withoutId = (command: RunCommandInput) => { const { commandId: _id, ...rest } = command; return rest; };

test('U05/U06: the state panel names the pausing and exchanging states, with the harness summary and no paused badge or banner', async () => {
  const pausing = pause({ state: 'pausing', summary: 'Admitted work settles before the pause.' });
  let area = await openDebugger(debugClient(debugState(pausing)));
  expect(await within(area).findByText('The run is pausing: admitted work settles before the pause.')).toBeTruthy();
  expect(within(area).getByLabelText('Harness summary').textContent).toBe('Admitted work settles before the pause.');
  expect(screen.queryByRole('status', { name: 'Paused at a breakpoint' })).toBeNull();
  cleanup();

  area = await openDebugger(debugClient(debugState(pause({ state: 'exchanging', revision: 2, summary: 'The engineer answers message c-1.' }))));
  expect(await within(area).findByText('An exchange is in progress: the engineer is answering a message.')).toBeTruthy();
  expect(within(area).getByLabelText('Harness summary').textContent).toBe('The engineer answers message c-1.');
  expect(document.querySelector('.badge.debug-paused')).toBeNull();
  expect(button(area, 'Send message').disabled).toBe(true);
  expect(button(area, 'Resume').disabled).toBe(true);
});

test('U07: the prepared input is read once on request, bound to the pause ID and revision read, and marked historical once the pause moves on', async () => {
  const first = pause();
  const client = debugClient(debugState(first), { inspections: { 'bp-0001': inspection(first) } });
  const area = await openDebugger(client, 20);
  await within(area).findByText('The run is paused before the engineer starts.');
  const inspections = () => client.calls.filter(call => call.startsWith('getDebugInspection'));
  expect(inspections()).toEqual([]);
  expect(area.textContent).toContain('A preview of the input the harness prepared for the engineer, read only on request. It is not evidence of what the engineer received.');

  fireEvent.click(button(area, 'Read the prepared input'));
  const preview = await within(area).findByLabelText('Prepared input preview');
  expect(preview.textContent).toContain('Read at pause bp-0001, revision 1.');
  expect(preview.textContent).not.toContain('historical');
  expect(inspections()).toEqual([`getDebugInspection:${debugRunId}:bp-0001`]);
  expect([...preview.querySelectorAll('summary')].map(summary => summary.textContent)).toEqual([
    'Role instructions', 'Task message', 'Inherited blocks (1)', 'Current additions (1)', 'Effective blocks (1)', 'Tools (2)',
    'Continuity', 'Source point', 'Scope', 'Bounds',
  ]);
  const section = (name: string) => [...preview.querySelectorAll('details')].find(details => details.querySelector('summary')!.textContent!.startsWith(name))!;
  expect(section('Role instructions').querySelector('pre')!.textContent).toBe('You are the engineer of this iteration.');
  expect(section('Task message').querySelector('pre')!.textContent).toBe('Implement wi-001.i01 at revision 1.');
  expect(section('Current additions').textContent).toContain('gate-failure');
  expect(section('Current additions').textContent).toContain('The last gate failed.');
  expect([...section('Tools').querySelectorAll('li')].map(item => item.textContent)).toEqual(['edit mutating Edits a file in scope', 'read read-only Reads a file']);
  expect(section('Continuity').textContent).toContain('retained: continues the iteration session');
  expect(section('Source point').textContent).toContain('ses-0002/inv-0002');
  expect(JSON.parse(section('Scope').querySelector('pre')!.textContent!)).toEqual({ writable: ['subs/notes/src'] });
  expect(JSON.parse(section('Bounds').querySelector('pre')!.textContent!)).toEqual({ maxTurns: 40 });

  // A later pause with another ID at revision 1: the same revision, another occurrence.
  const second = pause({ pauseId: 'bp-0002', cursor: 30, work: { workItem: 'wi-001', iteration: 'wi-001.i02' } });
  answerDebug(client, debugState(second));
  await within(area).findByText(/This preview is historical: the current pause is bp-0002 at revision 1/);
  expect(button(area, 'Read the prepared input again').disabled).toBe(false);

  client.runs.get(debugRunId)!.inspections = { 'bp-0002': inspection(second) };
  fireEvent.click(button(area, 'Read the prepared input again'));
  await waitFor(() => expect(within(area).getByLabelText('Prepared input preview').textContent).toContain('Read at pause bp-0002, revision 1.'));
  expect(within(area).queryByText(/historical/)).toBeNull();

  // The revision moves.
  answerDebug(client, debugState(pause({ ...second, revision: 2 })));
  await within(area).findByText(/This preview is historical: the current pause is bp-0002 at revision 2/);

  // Resumed: no current pause.
  answerDebug(client, debugState(null));
  await within(area).findByText(/This preview is historical: there is no current pause/);
  expect(within(area).getByLabelText('Prepared input preview').textContent).toContain('Read at pause bp-0002, revision 1.');
  expect(button(area, 'Read the prepared input again').disabled).toBe(true);
  expect(inspections()).toHaveLength(2);
});

test('U07: an inspection refusal is shown with the harness\'s message', async () => {
  const client = debugClient(debugState(pause()));
  client.getDebugInspection = async () => { throw new ClientError('protocol', 'This is not a live breakpoint occurrence', 'conflict'); };
  const area = await openDebugger(client);
  await within(area).findByText('The run is paused before the engineer starts.');
  fireEvent.click(button(area, 'Read the prepared input'));
  expect((await within(area).findByRole('alert')).textContent).toBe('The prepared input could not be read: This is not a live breakpoint occurrence');
  expect(within(area).queryByLabelText('Prepared input preview')).toBeNull();
});

test('U08: Send posts one debug-message with a fresh command ID, the current pause and revision and the verbatim text, clears the text and reads the state again', async () => {
  const paused = pause();
  const client = debugClient(debugState(paused));
  const area = await openDebugger(client);
  await within(area).findByText('The run is paused before the engineer starts.');
  const text = 'Why this file?\n  Explain the  plan.';
  fireEvent.change(textarea(area), { target: { value: text } });
  // The harness admits the message: an exchange begins.
  const exchanging = pause({ state: 'exchanging', revision: 2 });
  answerDebug(client, debugState(exchanging, [messageEntry(15, 'c-1', text, exchange(paused, 'c-1'))]));
  const reads = debugReads(client);
  fireEvent.click(button(area, 'Send message'));
  await waitFor(() => expect(client.commands).toHaveLength(1));
  const [command] = client.commands as [RunCommandInput];
  expect(command.commandId).toMatch(/\S/);
  expect(withoutId(command)).toEqual({
    expectedVersion: 0, type: 'debug-message',
    payload: { planId: debugPlanId, jobId: debugRunId, pauseId: 'bp-0001', expectedRevision: 1, message: text },
  });
  await waitFor(() => expect(debugReads(client)).toBeGreaterThan(reads));
  await waitFor(() => expect(textarea(area).value).toBe(''));
  const entry = (await within(area).findByText('The engineer is answering.')).closest('li')!;
  expect(entry.querySelector('.debug-person')!.textContent).toBe(text);
  expect(within(area).getByText('An exchange is in progress: the engineer is answering a message.')).toBeTruthy();
  expect(screen.queryByRole('status', { name: 'Paused at a breakpoint' })).toBeNull();
  expect(within(area).queryByRole('alert')).toBeNull();
});

test('U09: a settled exchange shows the text, the answer, its verdicts, outcome, error, continuity loss and settlement, and links its transcript chapter', async () => {
  const paused = pause({ revision: 3, taskState: 'accepted' });
  const settled = exchange(pause(), 'c-1', {
    status: 'settled', answer: 'Because the note\n  belongs to the review.', invocation: 'inv-0007', session: 'ses-0003', point: 'pt-1',
    outcome: 'returned', error: 'one tool call failed', continuityLoss: 'the session was compacted', settlementConfirmed: true,
    verdicts: [{ accepted: true, answer: 'The task is complete.' }, { accepted: false, answer: 'A file outside scope.' }],
  });
  const bare = exchange(pause({ revision: 2 }), 'c-2', { status: 'settled', answer: 'Yes.' });
  const area = await openDebugger(debugClient(debugState(paused, [
    messageEntry(15, 'c-1', 'Why this file?', settled), messageEntry(18, 'c-2', 'Is it done?', bare),
  ])));
  const entries = (await within(area).findAllByRole('listitem')).filter(item => item.classList.contains('debug-entry'));
  expect(entries).toHaveLength(2);
  const [first, second] = entries as [HTMLElement, HTMLElement];
  expect(first.querySelector('.debug-person')!.textContent).toBe('Why this file?');
  expect(first.querySelector('.debug-answer')!.textContent).toBe('Because the note\n  belongs to the review.');
  expect(within(first).getByLabelText('Verdicts').textContent).toBe('accepted The task is complete.rejected A file outside scope.');
  expect([...first.querySelectorAll('.facts div')].map(row => row.textContent)).toEqual([
    'Outcomereturned', 'Errorone tool call failed', 'Continuity lossthe session was compacted', 'Settlement confirmedyes',
  ]);
  expect(within(first).getByRole('link', { name: 'Open the transcript chapter (inv-0007)' }).getAttribute('href'))
    .toBe(`#/plans/${debugPlanId}/runs/${debugRunId}/sessions/ses-0003/chapters/inv-0007`);
  expect(second.querySelector('.debug-answer')!.textContent).toBe('Yes.');
  expect(within(second).queryByRole('link')).toBeNull();
  expect(second.querySelector('.facts')!.children).toHaveLength(0);
});

test('U10: Resume carries the text as its message, or no message without text; after a held accepted or terminal outcome Send is disabled and Resume enabled', async () => {
  const client = debugClient(debugState(pause()));
  const area = await openDebugger(client);
  await within(area).findByText('The run is paused before the engineer starts.');
  fireEvent.change(textarea(area), { target: { value: 'Go on, and keep\n the tests.' } });
  fireEvent.click(button(area, 'Resume'));
  await waitFor(() => expect(client.commands).toHaveLength(1));
  await waitFor(() => expect(textarea(area).value).toBe(''));
  fireEvent.change(textarea(area), { target: { value: '  \n ' } });
  fireEvent.click(button(area, 'Resume'));
  await waitFor(() => expect(client.commands).toHaveLength(2));
  const identity = { planId: debugPlanId, jobId: debugRunId, pauseId: 'bp-0001', expectedRevision: 1 };
  expect(client.commands.map(withoutId)).toEqual([
    { expectedVersion: 0, type: 'debug-resume', payload: { ...identity, message: 'Go on, and keep\n the tests.' } },
    { expectedVersion: 0, type: 'debug-resume', payload: identity },
  ]);
  expect(client.commands[0]!.commandId).not.toBe(client.commands[1]!.commandId);
  cleanup();

  for (const taskState of ['accepted', 'terminal'] as const) {
    const held = await openDebugger(debugClient(debugState(pause({ revision: 2, taskState }))));
    await within(held).findByText('The run is paused before the engineer starts.');
    expect(button(held, 'Send message').disabled).toBe(true);
    expect(button(held, 'Resume').disabled).toBe(false);
    cleanup();
  }
});

test('U11: a refusal at an unchanged run version shows the harness\'s message and reads the state again, so the next click names the current revision', async () => {
  const client = debugClient(debugState(pause()));
  const area = await openDebugger(client);
  await within(area).findByText('The run is paused before the engineer starts.');
  // Another client's exchange settled: the interaction is now at revision 2, the run version unchanged.
  answerDebug(client, debugState(pause({ revision: 2 })));
  client.commandRefusals = [new ClientError('protocol', 'The interaction is at revision 2, not 1', 'conflict')];
  fireEvent.change(textarea(area), { target: { value: 'Explain.' } });
  const reads = debugReads(client);
  fireEvent.click(button(area, 'Send message'));
  expect((await within(area).findByRole('alert')).textContent).toBe('The message was refused: The interaction is at revision 2, not 1');
  await waitFor(() => expect(debugReads(client)).toBeGreaterThan(reads));
  await waitFor(() => expect(within(within(area).getByLabelText('Pause facts')).getByText('2')).toBeTruthy());
  expect(textarea(area).value).toBe('Explain.');
  fireEvent.click(button(area, 'Send message'));
  await waitFor(() => expect(client.commands).toHaveLength(2));
  expect(client.commands[1]!.payload).toMatchObject({ pauseId: 'bp-0001', expectedRevision: 2, message: 'Explain.' });
  expect(client.commands[0]!.commandId).not.toBe(client.commands[1]!.commandId);
});

test('U11: a lost reply names the command ID and says it may have been admitted; the next interval read shows the admitted message', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const paused = pause();
  const client = debugClient(debugState(paused));
  const area = await openDebugger(client, 5000);
  await within(area).findByText('The run is paused before the engineer starts.');
  client.commandRefusals = [new ClientError('connection', 'The harness did not answer: fetch failed')];
  fireEvent.change(textarea(area), { target: { value: 'Did this arrive?' } });
  fireEvent.click(button(area, 'Send message'));
  const alert = await within(area).findByRole('alert');
  const [command] = client.commands as [RunCommandInput];
  expect(alert.textContent).toBe(`No reply arrived for the message, command ${command.commandId}. The command may have been admitted; the next read shows it.`);
  expect(textarea(area).value).toBe('Did this arrive?');
  expect(within(area).getByText('No message or resume yet.')).toBeTruthy();

  // It was admitted: the next interval read lists it.
  answerDebug(client, debugState(pause({ state: 'exchanging', revision: 2 }), [messageEntry(15, command.commandId, 'Did this arrive?', exchange(paused, command.commandId))]));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  const entry = (await within(area).findByText('The engineer is answering.')).closest('li')!;
  expect(entry.querySelector('.debug-person')!.textContent).toBe('Did this arrive?');
});

test('U11: a failed read of the debug state keeps the last state shown with the failure, and the next interval read recovers', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const client = debugClient(debugState(pause()));
  const area = await openDebugger(client, 5000);
  await within(area).findByText('The run is paused before the engineer starts.');
  client.failure = new ClientError('connection', 'The harness did not answer: fetch failed');
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect((await within(area).findByRole('alert')).textContent)
    .toBe('The debugger state could not be read: The harness did not answer: fetch failed. What is shown is the last state read. The next interval reads it again.');
  expect(within(area).getByText('The run is paused before the engineer starts.')).toBeTruthy();
  expect(within(within(area).getByLabelText('Pause facts')).getByText('bp-0001')).toBeTruthy();
  expect(screen.getByRole('status', { name: 'Paused at a breakpoint' })).toBeTruthy();

  client.failure = undefined;
  answerDebug(client, debugState(pause({ revision: 2, taskState: 'accepted' })));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  await waitFor(() => expect(within(area).queryByRole('alert')).toBeNull());
  expect(within(within(area).getByLabelText('Pause facts')).getByText('accepted')).toBeTruthy();
});

test('U09/U12: the conversation lists admitted, stopped, interrupted and resume entries in order and stays readable after the run ends, with both commands disabled', async () => {
  const first = pause();
  const second = pause({ pauseId: 'bp-0002', cursor: 40 });
  const ended = debugSnapshot({ state: 'stopped' });
  const client = debugClient(debugState(null, [
    messageEntry(15, 'c-1', 'First question.', exchange(first, 'c-1', { status: 'settled', answer: 'First answer.' })),
    resumeEntry(17, 'c-2', pause({ revision: 2 }), 'Carry on,\n  carefully.'),
    messageEntry(31, 'c-3', 'Second question.', exchange(second, 'c-3', { status: 'interrupted', error: 'The harness stopped before the answer settled' })),
    resumeEntry(33, 'c-4', pause({ pauseId: 'bp-0002', revision: 2 }), null),
    messageEntry(41, 'c-5', 'Third question.', exchange(pause({ pauseId: 'bp-0003' }), 'c-5', { status: 'stopped', error: 'The run was stopped' })),
  ], ended));
  const area = await openDebugger(client, 20);
  expect(await within(area).findByText('The run has ended: it is stopped. The conversation below stays readable.')).toBeTruthy();
  expect(within(area).getByText('Terminal state:').querySelector('.run-state-stopped')!.textContent).toBe('stopped');
  const entries = within(area).getAllByRole('listitem').filter(item => item.classList.contains('debug-entry'));
  expect(entries.map(item => item.className)).toEqual([
    'debug-entry debug-entry-message', 'debug-entry debug-entry-resume', 'debug-entry debug-entry-message', 'debug-entry debug-entry-resume', 'debug-entry debug-entry-message',
  ]);
  expect(entries[0]!.querySelector('.debug-answer')!.textContent).toBe('First answer.');
  expect(entries[1]!.textContent).toContain('Resumed, with this message:');
  expect(entries[1]!.querySelector('.debug-person')!.textContent).toBe('Carry on,\n  carefully.');
  expect(entries[2]!.querySelector('.debug-exchange')!.textContent).toBe('The exchange was interrupted: The harness stopped before the answer settled');
  expect(entries[3]!.textContent).toContain('Resumed without a message.');
  expect(entries[4]!.querySelector('.debug-exchange')!.textContent).toBe('The exchange was stopped: The run was stopped');
  expect(button(area, 'Send message').disabled).toBe(true);
  expect(button(area, 'Resume').disabled).toBe(true);
  expect(textarea(area).disabled).toBe(true);
  expect(button(area, 'Read the prepared input').disabled).toBe(true);
  // An ended run's debug state is read once; nothing polls it.
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(debugReads(client)).toBe(1);
  expect(screen.queryByRole('status', { name: 'Paused at a breakpoint' })).toBeNull();
});
