import {
  AUDIT_PROTOCOL_VERSION,
  FULL_SELECTOR_ID,
  FULL_SELECTOR_VERSION,
  createAuditService,
  createInProcessRegisteredExecutorBridge,
  createNodeGitExecutor,
  createNodeRepositoryExecutionLease,
  type GitExecutorPort,
} from 'ramify-audit';

const [mode, repositoryPath, sourceCommit] = process.argv.slice(2);

if (repositoryPath === undefined) throw new Error('repository path is required');

if (mode === 'lease') {
  const lease = createNodeRepositoryExecutionLease();
  const ownership = await lease.acquire({
    repositoryPath,
    operation: 'conformance-holder',
    metadata: { fixture: 'other-process' },
  });
  process.stdout.write(`${JSON.stringify({ type: 'lease-acquired', owner: ownership.owner })}\n`);
  await new Promise(() => { setInterval(() => undefined, 1_000); });
} else if (mode === 'audit') {
  if (sourceCommit === undefined) throw new Error('source commit is required');
  const baseGit = createNodeGitExecutor();
  const git: GitExecutorPort = {
    execute: (request, signal) => baseGit.execute({
      ...request,
      environment: {
        ...request.environment,
        GIT_AUTHOR_NAME: 'ramify-agent',
        GIT_AUTHOR_EMAIL: 'ramify-agent@localhost',
        GIT_COMMITTER_NAME: 'ramify-agent',
        GIT_COMMITTER_EMAIL: 'ramify-agent@localhost',
      },
    }, signal),
  };
  const result = await createAuditService({
    git,
    eventSink: { emit: event => { process.stdout.write(`${JSON.stringify(event)}\n`); } },
    registeredExecutors: createInProcessRegisteredExecutorBridge({
      'host.block': async () => await new Promise(() => { setInterval(() => undefined, 1_000); }),
    }),
  }).run({
    protocolVersion: AUDIT_PROTOCOL_VERSION,
    requestId: 'killed-audit',
    repositoryPath,
    source: { kind: 'existing-commit', revision: sourceCommit },
    checks: [{
      id: 'block',
      name: 'Block',
      description: 'Wait until the fixture process is killed',
      scope: 'both',
      category: 'registered',
      executor: { kind: 'registered', executorId: 'host.block' },
      onFailure: 'record',
    }],
    selector: { id: FULL_SELECTOR_ID, version: FULL_SELECTOR_VERSION, config: {} },
    registeredExecutorIds: ['host.block'],
  });
  process.stdout.write(`${JSON.stringify({ type: 'result', result })}\n`);
} else {
  throw new Error(`unknown fixture mode: ${String(mode)}`);
}
