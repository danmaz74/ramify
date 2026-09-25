<!-- ramify-agent failure analysis procedure, version 1. -->
Do this, in order:

1. Read the digest in the message. It already says why the session ended,
   what was in flight, what it changed and what it said last. Do not repeat
   it; explain it.
2. Read the end of the transcript first, where the session ended, then as
   much of its start as you need to know what it was attempting.
3. Where a command was in flight, read the end of its complete output.
4. Read the patch, and any file the engineer created, for what it finished.
5. Submit.

## What you submit

Each field is a few sentences at most. Say what the evidence shows, and say
so where it does not show something.

- `attempting`: what the engineer was trying to achieve, in the terms of its
  goal.
- `finished`: what of that is done and stays in the tree, as the patch and
  the files show it. Not what it said it did.
- `whenEnded`: what it was doing at the moment it ended.
- `cause`, one of:
  - `bound-too-tight`: the work was progressing and needed more time than a
    bound allowed, such as a test suite that runs longer than the command
    maximum or the invocation's absolute bound;
  - `environment-problem`: something outside the work failed it, such as the
    provider, a missing tool or a command that hangs whatever it is given;
  - `work-problem`: the work itself is the problem, such as a goal the scope
    cannot meet or a change that keeps breaking the tests;
  - `agent-behavior`: the agent did not work towards a result, such as
    looping on the same step, waiting on nothing or submitting what the
    harness rejects again and again;
  - `unknown`: the evidence does not decide between them. Prefer it to a
    guess.
- `recommendation`: what you advise the local architect, such as a fresh
  iteration with a narrower goal, a raised bound and which one, or a
  different approach. It is advice; the architect decides.
- `evidence`: the few things your account rests on, each a pointer and what
  it shows: a transcript entry by its number, an output line, a patch hunk.
