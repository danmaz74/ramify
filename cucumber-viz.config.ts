/**
 * cucumber-viz project configuration.
 *
 * cucumber-viz is installed globally in the devcontainer and loads this file
 * itself; Ramify's own build never reads it and declares no dependency on the
 * tool. The decisions behind each setting are recorded in
 * docs/development/cucumber-viz-setup.md.
 */
export default {
  // The only required key. Ramify's executable scenarios live in the reference
  // example's testing module.
  featurePaths: ['examples/collection-review/subs/integration-tests/src/features/**/*.viz.feature'],
  componentPaths: {},

  // Runs from the project root; the example's runner needs an absolute path.
  testCommand: 'npm --prefix examples/collection-review run test:cucumber -- "$(realpath "{file}")"',

  agentBackend: 'codex',
  reviewPeerBackend: 'claude',
  workflowIterationExecuteVariant: 'codex',

  // Keep the nodejs-react profile for its worktree preparation (node_modules
  // link and build) and replace the two command checks whose scripts Ramify
  // does not have. Prepare the independent packages in each execution/audit
  // checkout before checking it. An override replaces the whole executor.
  // The reference gate (reference:verify) and the self-check are never workflow
  // checks before their iterations pass.
  checks: {
    profile: 'nodejs-react',
    overrides: {
      static: {
        executor: {
          kind: 'command',
          commands: [
            { name: 'worktree-dependencies', cmd: 'npm', args: ['run', 'worktree:prepare'] },
            { name: 'type-check', cmd: 'npm', args: ['run', 'type-check'] },
          ],
          parallel: false,
        },
      },
      regression: {
        executor: {
          kind: 'command',
          commands: [{ name: 'vitest', cmd: 'npm', args: ['test'] }],
          parallel: false,
          mutex: true,
        },
      },
    },
  },

  // The default prunes date-prefixed files under docs/analysis/ after 30 days
  // and docs/plans/done/ after 7; Ramify keeps its analyses.
  documentRetention: { enabled: false },

  // Distinct from the cucumber-viz devcontainer's 8080 on the same host.
  port: 4080,
};
