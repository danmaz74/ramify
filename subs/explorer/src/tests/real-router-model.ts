import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import { createProjectBinding } from '../../../service-api/src/project-binding.js';
import { createExplorerRouter } from '../../../service-api/src/router.js';

const root = process.argv[2];
if (!root) throw new Error('Expected fixture root');
const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;
const environment = await createQuickEnvironment();
const binding = createProjectBinding({ root, setup: { registry: 'default', capabilities }, clock: environment.clock,
  connect: ({ start }) => environment.connect({ start }) });
try {
  const deadline = Date.now() + 60_000;
  while (binding.state().kind !== 'ready') {
    if (Date.now() > deadline) throw new Error(`Binding not ready: ${JSON.stringify(binding.state())}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const state = binding.state();
  if (state.kind !== 'ready') throw new Error(JSON.stringify(state));
  const published = await environment.service.check({ token: state.token, requestId: 'connected-page-open', scope: 'report',
    freshness: { mode: 'published', wait: true } });
  if (!published.ok || published.value.status !== 'reported') throw new Error(JSON.stringify(published));
  const caller = createExplorerRouter({ binding }).createCaller({});
  const view = await caller.projectView({});
  const status = await caller.serverStatus();
  process.stdout.write(JSON.stringify({ view, status }));
} finally {
  await binding.close();
  await environment.dispose();
}
