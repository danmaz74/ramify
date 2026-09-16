import { plan2aAvailabilityHandlers } from './plan2a-availability-cases.js';
import { plan2aCliHandlers } from './plan2a-cli-cases.js';
import { plan2aCompletionHandlers } from './plan2a-completion-cases.js';
import { plan2aDocumentHandlers } from './plan2a-document-cases.js';
import { plan2aGateHandlers } from './plan2a-gate-cases.js';
import { plan2aIsolationHandlers } from './plan2a-isolation-cases.js';
import { plan2aProjectionHandlers } from './plan2a-projection-cases.js';
import { plan2aPublicationHandlers } from './plan2a-publication-cases.js';
import { plan2aScaleHandlers } from './plan2a-scale-cases.js';
import { plan2aServiceHandlers } from './plan2a-service-cases.js';
import { plan2aSessionHandlers } from './plan2a-session-cases.js';
import { plan2aSymbolDetailsHandlers } from './plan2a-symbol-details-cases.js';
import { plan2aWorkflowHandlers } from './plan2a-workflow-cases.js';
import type { HarnessRuntime } from './runner.js';

/** Registration is not execution: every provider is registered, and each still has to run and pass. */
export const plan2aRuntime: HarnessRuntime = {
  capabilities: new Set(['provider-review', 'isolation', 'availability', 'symbol-details', 'projection', 'rendering',
    'publication', 'revision-query', 'service-operation', 'cli-command', 'agent-workflow', 'scale-evidence', 'final-declarations']),
  handlers: new Map([...plan2aDocumentHandlers, ...plan2aGateHandlers, ...plan2aIsolationHandlers, ...plan2aAvailabilityHandlers,
    ...plan2aSymbolDetailsHandlers, ...plan2aProjectionHandlers, ...plan2aPublicationHandlers, ...plan2aSessionHandlers,
    ...plan2aServiceHandlers, ...plan2aCliHandlers, ...plan2aWorkflowHandlers, ...plan2aScaleHandlers, ...plan2aCompletionHandlers]),
};
