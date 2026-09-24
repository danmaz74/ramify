import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  standaloneSessionResponseSchema, type SessionCursor, type SessionUpdatesResponse,
} from '../../../harness/src/interfaces/protocol/sessions.js';
import { SessionPage } from '../session-page.js';
import {
  architect, at, engineerEntries, entries, evaluation, globalFork, inline, liveEngineer, page, planId, reply, runId, sessionView, update,
} from './helpers/sessions.js';
import { StubClient } from './helpers/stub-client.js';

afterEach(cleanup);

test('the full-page transcript opens a run session beyond the bounded session list', async () => {
  const client = new StubClient();
  const id = 'ses-0501';
  client.runSessions.set(runId, { version: 30, sessions: [], total: 501 });
  client.runSessionDetails.set(`${runId}:${id}`, { version: 30, session: sessionView(id) });
  client.transcripts.set(`${id}@0`, { session: { source: 'run', planId, runId, session: id }, page: page([], { file: 'missing' }) });
  render(<SessionPage client={client} session={{ source: 'run', planId, runId, session: id }} anchor={null} />);
  expect(await screen.findByRole('heading', { name: `Session ${id}` })).toBeTruthy();
  expect(await screen.findByText(/The transcript file of this session is missing/)).toBeTruthy();
  expect(client.calls).toContain(`getRunSession:${runId}:${id}`);
});

/** A stub whose poll, once its given answers are spent, answers nothing new, as a harness does between entries. */
class QuietClient extends StubClient {
  private version = 20;

  override async pollSessions(planId: string, runId: string, version: number, cursors: readonly SessionCursor[]): Promise<SessionUpdatesResponse> {
    if (this.polls.length > 0) {
      const answer = await super.pollSessions(planId, runId, version, cursors);
      this.version = answer.version;
      return answer;
    }
    this.calls.push(`pollSessions:${runId}:${version}:${cursors.map(cursor => `${cursor.session}:${cursor.after}`).join(',')}`);
    return { version: this.version, sessions: [], transcripts: cursors.map(cursor => ({ session: cursor.session, page: page([], { cursor: cursor.after }) })) };
  }
}

const ses2 = { source: 'run', planId, runId, session: 'ses-0002' } as const;

function clientWith(ses0002 = liveEngineer(), transcript = page(engineerEntries)): StubClient {
  const client = new QuietClient();
  client.runSessions.set(runId, { version: 20, sessions: [architect, ses0002, globalFork], total: 3 });
  client.transcripts.set('ses-0002@0', { session: ses2, page: transcript });
  return client;
}

function finishedEngineer() {
  return liveEngineer({ state: 'finished', finished: 'work-closed', awaiting: null });
}

function toggle(name: RegExp) {
  return screen.getAllByRole('button', { name }).filter(button => button.hasAttribute('aria-expanded'));
}

test('ST10: thinking, files, tool input and output, the system prompt and appended text are collapsed by default; text is shown', async () => {
  render(<SessionPage client={clientWith(finishedEngineer())} session={ses2} anchor={null} interval={60_000} />);
  await screen.findByRole('heading', { name: /Chapter 1: inv-0002/ });
  for (const name of [/^Thinking/, /^Input/, /^File src\/app\.ts/, /^System prompt/, /^Prompt/, /^Note/, /^Complete output/]) {
    const buttons = toggle(name);
    expect(buttons.length, String(name)).toBeGreaterThan(0);
    for (const button of buttons) expect(button.getAttribute('aria-expanded'), String(name)).toBe('false');
  }
  // No body is in the page until it is opened.
  expect(screen.queryByText('I should read the app first.')).toBeNull();
  expect(screen.queryByText('Continuing iteration wi-001.i02.')).toBeNull();
  // Text is the conversation, shown as it is.
  expect(screen.getByText('Reading the app.')).toBeTruthy();
  expect(screen.getAllByText('Implement the iteration wi-001.i01.').length).toBe(1);
  // A tool call's header is its neutral action; the blob's header carries its first line and size.
  expect([...document.querySelectorAll('.tool-call-header')].map(node => node.textContent)).toEqual([
    'tool call read src/app.ts, lines 10–12 · read · answered',
    'tool call command npm test · bash · answered',
  ]);
  expect(toggle(/^File src\/app\.ts/)[0]!.textContent).toContain('8.8 KiB');
  expect(toggle(/^System prompt/)[0]!.textContent).toContain('You are the engineer of shop/reviews.');
});

test('ST10: the thinking visibility and every absent optional detail are shown', async () => {
  render(<SessionPage client={clientWith(finishedEngineer())} session={ses2} anchor={null} interval={60_000} />);
  const thinking = (await screen.findAllByRole('button', { name: /^Thinking/ }))[0]!;
  expect(thinking.textContent).toContain('full');
  expect(screen.getByText(/Thinking, redacted by the provider/)).toBeTruthy();
  const details = [...document.querySelectorAll('.message-detail')].map(node => node.textContent);
  expect(details[0]).toContain('model model-a');
  expect(details[0]).toContain('stop reason tool-use');
  expect(details[0]).toContain('not reported: thinking level, reasoning tokens, cost, cache writes by retention');
  expect(details[1]).toContain('usage not reported');
  expect(details[1]).toContain('not reported: model, thinking level, stop reason, reasoning tokens, cost, cache writes by retention');
});

test('ST10: a body is fetched on its first expansion only, and an inline body needs no request; a read is a file with its range and line numbers', async () => {
  const client = clientWith(finishedEngineer());
  client.bodies.set('b'.repeat(64), { content: 'const a = 1;\nconst b = 2;\nconst c = 3;\n\n[Showing lines 10-12 of 40. Use offset=13 to continue.]', bytes: 9000, truncated: false });
  client.bodies.set('a'.repeat(64), { content: 'You are the engineer of shop/reviews.\nKeep to the scope.', bytes: 12000, truncated: false });
  render(<SessionPage client={client} session={ses2} anchor={null} interval={60_000} />);
  const file = (await screen.findAllByRole('button', { name: /^File src\/app\.ts/ }))[0]!;
  const bodyCalls = () => client.calls.filter(call => call.startsWith('getBody'));
  expect(bodyCalls()).toEqual([]);

  fireEvent.click(file);
  expect(file.getAttribute('aria-expanded')).toBe('true');
  const figure = await screen.findByRole('figure');
  expect(figure.textContent).toContain('src/app.ts');
  expect(figure.textContent).toContain('lines 10–12');
  const lines = within(figure).getByRole('list', { name: 'src/app.ts, from line 10' });
  expect(lines.getAttribute('start')).toBe('10');
  expect(within(lines).getAllByRole('listitem').map(item => item.textContent)).toEqual(['const a = 1;', 'const b = 2;', 'const c = 3;']);
  expect(figure.textContent).toContain('[Showing lines 10-12 of 40. Use offset=13 to continue.]');
  expect(bodyCalls()).toEqual([`getBody:${'b'.repeat(64)}`]);

  // Closed and opened again, it is not requested again.
  fireEvent.click(file);
  fireEvent.click(file);
  await screen.findByRole('figure');
  expect(bodyCalls()).toEqual([`getBody:${'b'.repeat(64)}`]);

  // Inline: shown at once, without a request.
  fireEvent.click(screen.getAllByRole('button', { name: /^Thinking/ })[0]!);
  expect(screen.getByText('I should read the app first.')).toBeTruthy();
  expect(bodyCalls()).toHaveLength(1);

  // The system prompt both invocations share is one blob, requested once.
  for (const prompt of screen.getAllByRole('button', { name: /^System prompt/ })) fireEvent.click(prompt);
  expect(await screen.findAllByText(/Keep to the scope\./)).toHaveLength(2);
  expect(bodyCalls()).toEqual([`getBody:${'b'.repeat(64)}`, `getBody:${'a'.repeat(64)}`]);
});

test('a body the harness does not serve is reported, and can be asked for again', async () => {
  const client = clientWith(finishedEngineer());
  render(<SessionPage client={client} session={ses2} anchor={null} interval={60_000} />);
  fireEvent.click((await screen.findAllByRole('button', { name: /^Complete output/ }))[0]!);
  expect((await screen.findByRole('alert')).textContent).toContain('No body invocations/inv-0002/shell/001.log');
  client.bodies.set('invocations/inv-0002/shell/001.log', { content: '> npm test\nall passed', bytes: 120, truncated: false });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/> npm test/)).toBeTruthy();
});

test('ST10: entries that arrive in separate polls are appended in order, each poll after the last entry received', async () => {
  const client = clientWith();
  render(<SessionPage client={client} session={ses2} anchor={null} interval={10} />);
  await screen.findByRole('heading', { name: /Chapter 2: inv-0004/ });
  expect(screen.getByRole('status', { name: 'Following' }).textContent).toContain('Following its transcript');

  client.polls.push(update(21, [], 'ses-0002', [reply(11, 'First reply.')], 10));
  await screen.findByText('First reply.');
  client.polls.push(update(22, [], 'ses-0002', [reply(12, 'Second reply.'), reply(13, 'Third reply.')], 11));
  await screen.findByText('Third reply.');

  const polls = client.calls.filter(call => call.startsWith('pollSessions') );
  expect(polls[0]).toBe(`pollSessions:${runId}:20:ses-0002:10`);
  expect(polls).toContain(`pollSessions:${runId}:21:ses-0002:11`);
  expect(polls).toContain(`pollSessions:${runId}:22:ses-0002:13`);
  const numbers = [...document.querySelectorAll('.entry')].map(node => Number(node.getAttribute('data-n')));
  expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  // The new entries belong to the chapter of their invocation.
  const chapter = screen.getByRole('heading', { name: /Chapter 2: inv-0004/ }).closest('section')!;
  expect(within(chapter).getByText('Third reply.')).toBeTruthy();
  // A poll answer repeated after a restart of the page's cursor adds nothing twice.
  client.polls.push(update(22, [], 'ses-0002', [reply(13, 'Third reply.')], 13));
  await waitFor(() => expect(client.polls).toHaveLength(0));
  expect(screen.getAllByText('Third reply.')).toHaveLength(1);
});

test('ST10: a state change while open is shown, and following stops once the transcript is complete', async () => {
  const client = clientWith();
  render(<SessionPage client={client} session={ses2} anchor={null} interval={10} />);
  await screen.findByRole('heading', { name: /Chapter 2: inv-0004/ });
  expect(document.querySelector('.page-header .session-state')!.textContent).toBe('live');

  const finished = liveEngineer({
    state: 'finished', finished: 'work-closed', awaiting: null, changed: { sequence: 22, at: at(22) },
    invocations: [liveEngineer().invocations[0]!, { ...liveEngineer().invocations[1]!, ended: { sequence: 22, at: at(22) }, outcome: 'submitted', kept: false, point: { session: 'ses-0002', invocation: 'inv-0004' } }],
  });
  // The state arrives before the end's entries, as the harness allows: here two polls before them.
  client.polls.push(
    update(22, [finished], 'ses-0002', [reply(11, 'Done.')], 10),
    update(22, [], 'ses-0002', [], 11),
    update(22, [], 'ses-0002', entries([
      { n: 12, at: at(22), type: 'ended', invocation: 'inv-0004', ended: 'submitted', interruption: null, error: null, actual: { mode: 'continue', degradedReason: null } },
      { n: 13, at: at(22), type: 'point', invocation: 'inv-0004', point: { session: 'ses-0002', invocation: 'inv-0004' } },
    ]), 11),
  );
  await screen.findByText('inv-0004 ended: submitted');
  expect(document.querySelector('.page-header .session-state')!.textContent).toBe('finished');
  expect(screen.getByRole('heading', { name: /Chapter 2: inv-0004/ }).textContent).toContain('submitted');
  await waitFor(() => expect(screen.getByRole('status', { name: 'Following' }).textContent).toContain('Its transcript is complete as read.'));
  expect(screen.getByRole('status', { name: 'Following' }).textContent).toContain('It became finished while this page was open. The session is finished (work-closed)');
  const asked = client.calls.filter(call => call.startsWith('pollSessions'));
  expect(asked.slice(-3)).toEqual([`pollSessions:${runId}:20:ses-0002:10`, `pollSessions:${runId}:22:ses-0002:11`, `pollSessions:${runId}:22:ses-0002:11`]);
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(client.calls.filter(call => call.startsWith('pollSessions'))).toHaveLength(asked.length);
});

test('a session interrupted while open stops being followed after two polls bring nothing', async () => {
  const client = clientWith();
  render(<SessionPage client={client} session={ses2} anchor={null} interval={10} />);
  await screen.findByRole('heading', { name: /Chapter 2: inv-0004/ });
  client.polls.push(update(22, [liveEngineer({ state: 'interrupted', changed: { sequence: 22, at: at(22) } })], 'ses-0002', [], 10));
  await waitFor(() => expect(screen.getByRole('status', { name: 'Following' }).textContent).toContain('Its transcript is complete as read.'));
  expect(screen.getByRole('status', { name: 'Following' }).textContent).toContain('It became interrupted while this page was open.');
  expect(screen.getByRole('heading', { name: /Chapter 2: inv-0004/ }).textContent).toContain('not ended');
  const asked = client.calls.filter(call => call.startsWith('pollSessions')).length;
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(client.calls.filter(call => call.startsWith('pollSessions'))).toHaveLength(asked);
});

test('ST10: the view keeps to the bottom within a small margin, and otherwise offers the new entries', async () => {
  const client = clientWith();
  render(<SessionPage client={client} session={ses2} anchor={null} interval={10} />);
  const transcript = await screen.findByRole('region', { name: 'Transcript of ses-0002' });
  let top = 0;
  Object.defineProperty(transcript, 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(transcript, 'clientHeight', { configurable: true, get: () => 200 });
  Object.defineProperty(transcript, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => { top = value; } });

  // Read above: new entries are counted, not scrolled to.
  top = 100;
  fireEvent.scroll(transcript);
  client.polls.push(update(21, [], 'ses-0002', [reply(11, 'First reply.')], 10));
  const control = await screen.findByRole('button', { name: '1 new entry below' });
  expect(top).toBe(100);
  client.polls.push(update(22, [], 'ses-0002', [reply(12, 'Second reply.')], 11));
  await screen.findByRole('button', { name: '2 new entries below' });
  fireEvent.click(screen.getByRole('button', { name: '2 new entries below' }));
  expect(top).toBe(1000);
  expect(screen.queryByRole('button', { name: /new entr/ })).toBeNull();
  expect(control.isConnected).toBe(false);

  // Within the margin of the bottom: the view follows.
  top = 1000 - 200 - 40;
  fireEvent.scroll(transcript);
  client.polls.push(update(23, [], 'ses-0002', [reply(13, 'Third reply.')], 12));
  await screen.findByText('Third reply.');
  expect(top).toBe(1000);
  expect(screen.queryByRole('button', { name: /new entr/ })).toBeNull();
});

test('ST10: a session whose transcript file is missing shows its chapters and evaluations, without entries, and is not followed', async () => {
  const client = clientWith(finishedEngineer(), page([], { file: 'missing' }));
  render(<SessionPage client={client} session={ses2} anchor={null} interval={10} />);
  expect((await screen.findByRole('alert')).textContent).toContain('The transcript file of this session is missing');
  const chapters = screen.getAllByRole('heading', { level: 2 });
  expect(chapters.map(heading => heading.textContent)).toEqual([expect.stringMatching(/^Chapter 1: inv-0002/), expect.stringMatching(/^Chapter 2: inv-0004/)]);
  const first = chapters[0]!.closest('section')!;
  expect(within(first).getByText('No entries of this invocation are in the transcript.')).toBeTruthy();
  const facts = within(first).getByLabelText('Evaluation of inv-0002');
  expect(facts.textContent).toContain('Guardingpartial');
  expect(facts.textContent).toContain('2 passed, 1 with findings, 0 not checked');
  expect(facts.textContent).toContain('shop/search');
  expect(facts.textContent).toContain('+12 −3 (complete)');
  expect(facts.textContent).toContain('in 100 · cache read 50 · cache write 10 · out 40');
  expect(within(chapters[1]!.closest('section')!).getByLabelText('Evaluation of inv-0004').textContent).toContain('unavailable: the invocation has not ended');
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(client.calls.filter(call => call.startsWith('pollSessions'))).toEqual([]);
});

test('chapters carry their start relation and reason; points and the fork source are links', async () => {
  const client = clientWith(finishedEngineer());
  render(<SessionPage client={client} session={ses2} anchor={null} interval={60_000} />);
  const second = (await screen.findByRole('heading', { name: /Chapter 2: inv-0004/ })).closest('section')!;
  const start = second.querySelector('.chapter-start')!;
  expect(start.textContent).toContain('Continued from the end of inv-0002, because iteration-closed');
  expect(within(start as HTMLElement).getByRole('link', { name: 'the end of inv-0002' }).getAttribute('href'))
    .toBe(`#/plans/${planId}/runs/${runId}/sessions/ses-0002/points/inv-0002`);
  const first = screen.getByRole('heading', { name: /Chapter 1: inv-0002/ }).closest('section')!;
  expect(first.querySelector('.chapter-start')!.textContent).toContain('Opened fresh');
  expect(first.querySelector('.chapter-moments')!.textContent).toContain('it kept the session');
  // The note between the chapters stands between them.
  expect(screen.getByLabelText('Between invocations').textContent).toContain('Note appended');
  cleanup();

  const fork = clientWith();
  fork.transcripts.set('ses-0003@0', { session: { ...ses2, session: 'ses-0003' }, page: page([]) });
  render(<SessionPage client={fork} session={{ ...ses2, session: 'ses-0003' }} anchor={null} interval={60_000} />);
  const chapter = (await screen.findByRole('heading', { name: /Chapter 1: inv-0003/ })).closest('section')!;
  expect(chapter.querySelector('.chapter-start')!.textContent).toContain('Forked from the end of inv-0001 in ses-0001, because placement-request (context generation 1)');
  expect(chapter.querySelector('.chapter-start')!.textContent).toContain('degraded: fork was requested and fresh was made (the source session file is gone)');
  const source = screen.getAllByRole('link', { name: 'the end of inv-0001 in ses-0001' });
  expect(source.map(link => link.getAttribute('href'))).toContain(`#/plans/${planId}/runs/${runId}/sessions/ses-0001/points/inv-0001`);
  expect(screen.getByText(/Forked from/, { selector: 'li' }).textContent).toContain('placement-request, context generation 1');
});

test('a degraded start is noticed above the session\'s facts, with a link to its chapter; a session without one has no notice', async () => {
  const client = clientWith();
  const ses3 = { ...ses2, session: 'ses-0003' };
  client.transcripts.set('ses-0003@0', { session: ses3, page: page([]) });
  render(<SessionPage client={client} session={ses3} anchor={null} interval={60_000} />);
  const notice = await screen.findByRole('region', { name: 'Degraded starts' });
  expect(notice.textContent).toContain('A degraded start.');
  expect(notice.textContent).toContain('fork was requested and fresh was made (the source session file is gone)');
  expect(within(notice).getByRole('link', { name: 'Chapter 1: inv-0003' }).getAttribute('href'))
    .toBe(`#/plans/${planId}/runs/${runId}/sessions/ses-0003/chapters/inv-0003`);
  // It comes before the facts, so it is read before scrolling.
  expect(notice.compareDocumentPosition(document.querySelector('.facts')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  cleanup();

  render(<SessionPage client={clientWith(finishedEngineer())} session={ses2} anchor={null} interval={60_000} />);
  await screen.findByRole('heading', { name: /Chapter 1: inv-0002/ });
  expect(screen.queryByRole('region', { name: 'Degraded starts' })).toBeNull();
});

test('a point lists the sessions forked from it; a link to a chapter opens that chapter', async () => {
  const client = new StubClient();
  client.runSessions.set(runId, { version: 20, sessions: [architect, finishedEngineer(), globalFork], total: 3 });
  const ses1 = { ...ses2, session: 'ses-0001' };
  client.transcripts.set('ses-0001@0', {
    session: ses1,
    page: page(entries([
      { n: 1, at: at(2), type: 'ended', invocation: 'inv-0001', ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } },
      { n: 2, at: at(2), type: 'point', invocation: 'inv-0001', point: { session: 'ses-0001', invocation: 'inv-0001' } },
    ])),
  });
  render(<SessionPage client={client} session={ses1} anchor={{ kind: 'point', invocation: 'inv-0001' }} interval={60_000} />);
  const point = await screen.findByText(/a later start may continue or fork from here/);
  const entry = point.closest('.point')!;
  expect(within(entry as HTMLElement).getByRole('link', { name: 'ses-0003' }).getAttribute('href')).toBe(`#/plans/${planId}/runs/${runId}/sessions/ses-0003`);
  await waitFor(() => expect(document.activeElement).toBe(entry));
  cleanup();

  render(<SessionPage client={clientWith(finishedEngineer())} session={ses2} anchor={{ kind: 'chapter', invocation: 'inv-0004' }} interval={60_000} />);
  const heading = await screen.findByRole('heading', { name: /Chapter 2: inv-0004/ });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(heading.closest('section')!.className).toContain('chapter-selected');
});

test('a standalone session is one chapter with its evaluation and outcome, and is never polled', async () => {
  const client = new StubClient();
  const id = '20260921T101500Z-a1b2c3';
  client.standalone.set(id, standaloneSessionResponseSchema.parse({
    session: {
      ref: { source: 'standalone', session: id }, state: 'interrupted', finished: null, role: 'engineer', work: {}, executor: 'scripted', model: null,
      invocations: 1, degradedStarts: 0, reaches: { kind: 'module', module: 'shop/reviews' }, startedAt: at(1), changedAt: at(3),
    },
    prompt: 'Add the send button.',
    outcome: null,
    evaluation: evaluation(id, { workItem: null, iteration: null, lines: { coverage: 'partial', paths: 0, added: 0, deleted: 0, gaps: ['a standalone session records no line events'] } }),
  }));
  client.transcripts.set(`${id}@0`, {
    session: { source: 'standalone', session: id },
    page: page(entries([{ n: 1, at: at(1), type: 'message', invocation: id, role: 'user', blocks: [{ type: 'text', body: inline('Add the send button.') }] }])),
  });
  render(<SessionPage client={client} session={{ source: 'standalone', session: id }} anchor={null} interval={10} />);
  const chapter = (await screen.findByRole('heading', { name: new RegExp(`Chapter 1: ${id}`) })).closest('section')!;
  expect(within(chapter).getByLabelText(`Evaluation of ${id}`).textContent).toContain('+0 −0 (partial)');
  expect(screen.getByText('none recorded: the session was interrupted before it ended')).toBeTruthy();
  expect(screen.getByRole('status', { name: 'Following' }).textContent).toContain('interrupted');
  expect(screen.getByRole('link', { name: '← Sessions' }).getAttribute('href')).toBe('#/sessions');
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(client.calls.filter(call => call.startsWith('pollSessions'))).toEqual([]);
});

test('an unknown session is reported, and not asked for again', async () => {
  const client = clientWith();
  render(<SessionPage client={client} session={{ ...ses2, session: 'ses-0009' }} anchor={null} interval={10} />);
  expect((await screen.findByRole('alert')).textContent).toContain('The run has no session ses-0009');
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(client.calls.filter(call => call.startsWith('getRunSessions'))).toHaveLength(1);
});

test('the blocks are operated from the keyboard: each header is a button with its state', async () => {
  render(<SessionPage client={clientWith(finishedEngineer())} session={ses2} anchor={null} interval={60_000} />);
  const thinking = (await screen.findAllByRole('button', { name: /^Thinking/ }))[0]!;
  const body = document.getElementById(thinking.getAttribute('aria-controls')!)!;
  expect(body.hidden).toBe(true);
  thinking.focus();
  act(() => { thinking.click(); });
  expect(body.hidden).toBe(false);
  expect(within(body).getByText('I should read the app first.')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Transcript of ses-0002' }).tabIndex).toBe(0);
});
