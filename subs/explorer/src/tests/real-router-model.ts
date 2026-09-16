import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import { createExplorerRouter } from '../../../service-api/src/router.js';

const root = process.argv[2];
if (!root) throw new Error('Expected fixture root');
const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'] as const;
const environment = await createQuickEnvironment();
try {
  const opened = await environment.service.openContext({ project: { cwd: root, root, scope: 'whole-project', configuration: 'discover' },
    setup: { registry: 'default', capabilities } });
  if (!opened.ok || opened.value.status !== 'opened') throw new Error(JSON.stringify(opened));
  const published = await environment.service.check({ token: opened.value.token, requestId: 'connected-page-open', scope: 'report',
    freshness: { mode: 'published', wait: true } });
  if (!published.ok || published.value.status !== 'reported') throw new Error(JSON.stringify(published));
  const caller = createExplorerRouter({ service: environment.service }).createCaller({});
  const view = await caller.projectView({ token: opened.value.token });
  const status = await caller.contextStatus({ token: opened.value.token });
  process.stdout.write(JSON.stringify({ token: opened.value.token, view, status }));
} finally {
  await environment.dispose();
}
