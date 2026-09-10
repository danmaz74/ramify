import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/compiler-api');
const config = resolve(root, 'tsconfig.json');
const outcomes = ['explicit-dispose', 'early-failure'].map(mode => {
  const api = new API({ cwd: root });
  let snapshot: ReturnType<API['updateSnapshot']> | undefined;
  let expectedFailureObserved = false;
  try {
    snapshot = api.updateSnapshot({ openProjects: [config] });
    assert.ok(snapshot.getProject(config));
    if (mode === 'early-failure') throw new Error('probe-controlled-failure');
    snapshot.dispose();
    snapshot.dispose();
    assert.equal(snapshot.isDisposed(), true);
    assert.throws(() => snapshot!.getProjects(), /disposed/);
  } catch (error) {
    assert.equal(mode, 'early-failure');
    assert.ok(error instanceof Error && error.message === 'probe-controlled-failure');
    expectedFailureObserved = true;
  } finally {
    // API.close also disposes outstanding snapshots on the failure path.
    api.close();
  }
  assert.ok(snapshot);
  assert.equal(snapshot.isDisposed(), true);
  assert.throws(() => snapshot.getProjects(), /disposed/);
  assert.throws(() => api.parseConfigFile(config), /closed/);
  api.close();
  return {
    mode,
    expectedFailureObserved,
    snapshotDisposed: snapshot.isDisposed(),
    closedClientRejectsRequest: true,
    repeatedCloseAccepted: true,
  };
});
console.log(JSON.stringify({
  probe: 'compiler-lifecycle',
  api: 'typescript/unstable/sync',
  outcomes,
  ramifySessionCancellationMeasured: false,
  nativeProcessPeakMemoryMeasured: false,
}, null, 2));
