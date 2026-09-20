/*
 * Copied from cucumber-viz 0.7.0,
 * src/domain-sub-apps/implementation-studio/core/runtime/check-execution/check-runner.ts, lines 92-100.
 * Same author; licensed here under GPL-3.0 with ramify-agent. Reference copy.
 */
/**
 * Build a clean env for child processes: strip NODE_OPTIONS to prevent the
 * parent's flags (e.g. --import tsx from the dev/test harness) from leaking
 * into subprocess npm invocations where those packages may not be installed.
 */
function cleanEnv(): NodeJS.ProcessEnv {
  const { NODE_OPTIONS: _stripped, ...env } = process.env;
  return env;
}
