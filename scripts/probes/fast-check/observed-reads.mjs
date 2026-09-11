import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Capture } from '../../../dist/subs/analysis/subs/project/src/capture.js';
import { createSourceAnalysis } from '../../../dist/subs/analysis/subs/typescript/src/source-analysis.js';
import { buildCatalog } from '../../../dist/subs/analysis/subs/typescript/src/catalog.js';
import { collectAccesses } from '../../../dist/subs/analysis/subs/typescript/src/accesses.js';
import { acquire, acquisitionLimits, archive, compiler, defaults, identity, inputId, replay, sha, stats, repo, order } from './p5-common.mjs';
function difference(expected,actual){const left=new Map(expected.map(x=>[x.path,x])),right=new Map(actual.map(x=>[x.path,x]));return {
  missing:expected.filter(x=>!right.has(x.path)),extra:actual.filter(x=>!left.has(x.path)),changed:expected.filter(x=>right.has(x.path)&&JSON.stringify(x)!==JSON.stringify(right.get(x.path))).map(x=>({expected:x,actual:right.get(x.path)}))};}
const equal=d=>!d.missing.length&&!d.extra.length&&!d.changed.length;
// Canonical JSON fixes field order and sorts observations by UTF-8 path/role.
const canonical = inputs => inputs.map(({path,role,sha256,bytes})=>({path,role,sha256,bytes}))
  .sort((a,b)=>order(a.path,b.path)||order(a.role,b.role));
const roleCounts = inputs => Object.fromEntries([...new Set(inputs.map(x=>x.role))].sort(order)
  .map(role=>[role,inputs.filter(x=>x.role===role).length]));
// Retain every differing field and both exact values, grouping identical
// changes across explicit paths. Unlisted fields are equal, not omitted changes.
function compactDifference(diff) {
  const groups=new Map();
  for(const {expected,actual} of diff.changed) {
    const fields=Object.keys(expected).filter(k=>k!=='role'&&expected[k]!==actual[k]);
    const roles=expected.role===actual.role?null:{expected:expected.role,actual:actual.role};
    const key=JSON.stringify({fields,roles});
    if(!groups.has(key))groups.set(key,{roles,
      columns:['path',...fields.flatMap(k=>[`${k}.expected`,`${k}.actual`])],rows:[]});
    groups.get(key).rows.push([expected.path,...fields.flatMap(k=>[expected[k],actual[k]])]);
  }
  const changed=[...groups.values()];
  // Verify that the table encoding recovers all differences exactly.
  const originals=new Map(diff.changed.map(d=>[d.expected.path,d]));
  let count=0;
  for(const group of changed)for(const row of group.rows) {
    const {expected,actual}=originals.get(row[0]),reconstructed={...expected};
    if(group.roles){assert.equal(expected.role,group.roles.expected);reconstructed.role=group.roles.actual;}
    for(let i=1;i<group.columns.length;i+=2) {
      const field=group.columns[i].split('.')[0];
      assert.equal(expected[field],row[i]);reconstructed[field]=row[i+1];
    }
    assert.deepEqual(reconstructed,actual);count++;
  }
  assert.equal(count,diff.changed.length);
  return {missing:diff.missing,extra:diff.extra,changedCount:count,changed};
}
const fixtures=[];
for(const [name,arg] of [['R',process.argv[2]??defaults.R],['S100',process.argv[3]??defaults.S100]]){
  const runs=[];
  for(let i=0;i<3;i++){
    const start=performance.now(),batch=await acquire(arg);let source,direct,c;
    const callbacks=new Capture(batch.root,acquisitionLimits,performance.now()+120000);
    try{
      source=await createSourceAnalysis({view:batch.view,inventory:batch.inventory,areas:batch.areas,limits:batch.limits});
      await source.catalog();await source.accesses();await source.dispose();source=undefined;
      const sealed=await batch.view.seal();assert.equal(sealed.status,'coherent');
      direct=await acquire(arg);const events=[];c=compiler(direct,e=>events.push(e));
      const runtime=new Map(),catalog=buildCatalog(c.project,direct,c.host,runtime);collectAccesses(c.project,direct,c.host,catalog,runtime);
      const coldEvents=events.length;
      // Re-notification of an unchanged file checks callback retention across
      // updates without modifying owner source or saved batch fixture bytes.
      c.update({fileChanges:{changed:[c.project.program.getSourceFileNames()[0]]}});
      buildCatalog(c.project,direct,c.host,new Map());
      c.dispose();c=undefined;
      await replay(direct.view,events);await replay(callbacks,events);
      const observed=await direct.view.seal(),only=await callbacks.seal();assert.equal(observed.status,'coherent');assert.equal(only.status,'coherent');
      const mergedDifference=difference(sealed.inputs,observed.inputs),callbackDifference=difference(sealed.inputs,only.inputs);
      runs.push({elapsedMs:performance.now()-start,fixture:identity(batch),coldEvents,updateEvents:events.length-coldEvents,
        callbackCounts:Object.fromEntries([...new Set(events.map(e=>e.method))].map(method=>[method,events.filter(e=>e.method===method).length])),
        batchInputId:inputId(batch,sealed.inputs),mergedInputId:inputId(direct,observed.inputs),batchCount:sealed.inputs.length,mergedCount:observed.inputs.length,callbackOnlyCount:only.inputs.length,
        mergedEqual:equal(mergedDifference),callbackOnlyEqual:equal(callbackDifference),mergedDifference,callbackOnlyDifference:callbackDifference,
        callbackOnlyInputId:inputId(direct,only.inputs),
        batchInputs:canonical(sealed.inputs),mergedInputs:canonical(observed.inputs),callbackOnlyInputs:canonical(only.inputs)});
    }finally{await source?.dispose();c?.dispose();await batch.view.dispose();await direct?.view.dispose();await callbacks.dispose();}
  }
  const shared={},observations={};
  for(const key of ['batchInputs','mergedInputs','callbackOnlyInputs','mergedDifference','callbackOnlyDifference']) {
    shared[key]=runs[0][key];
    for(const run of runs){assert.deepEqual(run[key],shared[key],`Repeated ${key} differs`);if(key.endsWith('Inputs'))run[key+'Sha256']=sha(JSON.stringify(run[key]));delete run[key];}
    if(key.endsWith('Inputs'))observations[key]={count:shared[key].length,roles:roleCounts(shared[key]),canonicalSha256:sha(JSON.stringify(shared[key]))};
  }
  const path=`.reference-work/probe-details/observed-reads/${name}.json`;
  const details=JSON.stringify(shared)+'\n';
  mkdirSync(resolve(repo,'.reference-work/probe-details/observed-reads'),{recursive:true});
  writeFileSync(resolve(repo,path),details);
  const inputIds=Object.fromEntries(['batchInputId','mergedInputId','callbackOnlyInputId'].map(key=>[key,runs[0][key]]));
  for(const run of runs)for(const [key,value] of Object.entries(inputIds))assert.equal(run[key],value);
  const fixture=runs[0].fixture;
  for(const run of runs) {
    assert.deepEqual(run.fixture,fixture);delete run.fixture;
    run.inputIdsEqual=run.batchInputId===run.mergedInputId;
    for(const key of Object.keys(inputIds))delete run[key];
  }
  fixtures.push({name,fixture,repetitions:3,timing:stats(runs.map(x=>x.elapsedMs)),inputIds,observations,
    details:{path,sha256:sha(details)},
    differences:{merged:compactDifference(shared.mergedDifference),callbacksOnly:compactDifference(shared.callbackOnlyDifference)},runs});
}
archive('observed-reads',{method:'Independent production batch capture: readProject, createSourceAnalysis.catalog/accesses, seal. Direct compiler uses a sink to record every callback plus synthetic-name occupancy enumeration; replay uses the unchanged Capture recipe, both alone and merged into a separate readProject acquisition. Compare exact path/role/hash/bytes and batch inputId recipe on unchanged same-root inputs. Cold plus one unchanged-file notification. No observations copied from the batch result; all differences retained.',
  observationEncoding:'Canonical UTF-8 path/role sort; JSON object fields path, role, sha256, bytes. Changed differences use tables grouped by changed fields and role pair; columns name every expected and actual value. Each row names an exact path. Unlisted fields are equal. Missing/extra entries are complete. Full observations and full difference records are in the hashed ignored details file.',
  limitations:['Callback-only equality is not expected to cover descriptions, READMEs, exact-name/layout discovery and acquisition roles. Merged equality, if established, requires that project acquisition and capture-compatible observation semantics remain part of the observer.','Replay on quiescent inputs proves observation feasibility, not concurrent capture coherence or changed-file identity equality. Later iterations must implement the synchronous sink and validate inputs before publication.'],fixtures});

// Compact JSON whitespace as well as evidence; differences remain plain JSON.
const resultPath=resolve(repo,'scripts/probes/results/observed-reads.json');
writeFileSync(resultPath,JSON.stringify(JSON.parse(readFileSync(resultPath,'utf8')))+'\n');
