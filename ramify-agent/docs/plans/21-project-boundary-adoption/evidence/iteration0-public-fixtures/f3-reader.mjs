import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { requestFromCommittedConfiguration, createNodeGitExecutor } from 'ramify-audit';

const repositoryPath = process.argv[2];
if (!repositoryPath) throw new Error('Pass the restored F3 repository path.');
const git = (...args) => execFileSync('git', args, { cwd: repositoryPath, encoding: 'utf8' }).trim();
const commits = {
  A: 'e33eac4917f962e60e0e74f0b3bdbc250971e923',
  B: '743f8894bf464cb2b4a1cc2d464a7f173da66473',
  missing: 'd5ec80b0e2b8c4d280f477cb388652aa3624a5d8',
  nonregular: '735fab14b9369c3f281b56ad24d229d37867914b',
  malformed: '94edcf25944a03bfaf85b365b365714df632f2f2',
  invalidSchema: '18f34add842e596276b93f74103c974dcb9f5a1d',
};
const definition = `${repositoryPath}/ramify-audit.json`;
const original = readFileSync(definition);
const refsBefore = git('show-ref');
const request = (sourceCommit, projectRoot = '.', nested = false) =>
  requestFromCommittedConfiguration({ git: createNodeGitExecutor(), repositoryPath,
    sourceCommit, projectRoot, full: true, force: false, nested });
try {
  writeFileSync(definition, '{"checks": [malformed working C');
  const positive = {
    A: await request(commits.A), B: await request(commits.B),
    nestedAtA: await request(commits.A, 'nested', true),
  };
  const negative = {};
  for (const name of ['missing', 'nonregular', 'malformed', 'invalidSchema']) {
    try { await request(commits[name]); negative[name] = { unexpectedSuccess: true }; }
    catch (error) { negative[name] = { error: String(error.message) }; }
  }
  console.log(JSON.stringify({ positive, negative, refsUnchanged: refsBefore === git('show-ref') }, null, 2));
} finally {
  writeFileSync(definition, original);
}
