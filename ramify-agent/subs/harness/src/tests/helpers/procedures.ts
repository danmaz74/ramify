import { validateMapSubmission } from '../../interfaces/map.js';
import {
  mapSubmissionJsonSchema,
  planChanges,
  sha256,
  submissionToolName,
  type MappingProcedure,
} from '../../mapping/procedure.js';

/**
 * A procedure for tests of the job lifecycle, which need no evidence: the
 * plan hash is real, the architect view is a placeholder marked as such, and
 * a submission is validated for its shape only. The architect procedure's
 * own tests run on real views.
 */
export const shapeOnlyProcedure: MappingProcedure = {
  async capture(_projectRoot, capturedPlan) {
    return {
      planHash: sha256(capturedPlan),
      source: null,
      versions: { architectPrompt: null, procedure: null, skill: null, ramify: null },
      architectView: { status: 'placeholder' },
    };
  },
  async forJob(context) {
    return {
      session: {
        role: 'architect',
        systemPrompt: 'You are the architect of a Ramify project.',
        prompt: `Map this plan onto the module tree and submit an implementation map with ${submissionToolName}.\n\n${context.plan}`,
        builtinTools: ['read', 'grep', 'ls'],
        tools: [],
        submission: {
          name: submissionToolName,
          description: 'Submit the implementation map.',
          inputSchema: mapSubmissionJsonSchema,
        },
      },
      validate: async submission => validateMapSubmission(submission),
      changes: () => planChanges(context.projectRoot, context.planId, context.manifest.planHash),
    };
  },
  approvalChanges: (projectRoot, planId, manifest) => planChanges(projectRoot, planId, manifest.planHash, 'since the map was made'),
};
