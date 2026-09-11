import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { performance } from 'node:perf_hooks';
import { acquire, archive, compiler, defaults, identity, sha, stats } from './p5-common.mjs';
import { buildCatalog } from '../../../dist/subs/analysis/subs/typescript/src/catalog.js';
// Change only the loaded module text. No source or dist file is written.
let transformedSha256,originalSha256;
const hook=registerHooks({load(url,context,next){const result=next(url,context);if(!url.endsWith('/typescript/src/accesses.js'))return result;
  let text=String(result.source);originalSha256=sha(text);
  const replace=(from,to)=>{assert.equal(text.split(from).length,2,`Expected one anchor: ${from}`);text=text.replace(from,to);};
  replace('export function collectAccesses(project, inputs, host, catalog, runtime) {','export function collectAccesses(project, inputs, host, catalog, runtime, only, maintained) {');
  replace('const resolution = new Resolution(project, inputs.inventory, host);',`const start = performance.now();
    const setup = maintained ?? {
      resolution: new Resolution(project, inputs.inventory, host),
      files: new Map(catalog.files.map(file => [file.file, file])),
      originals: new Map(catalog.originals.map(original => [originalKey(original.id), original])),
      ordered: [...inputs.inventory.files].sort((a,b) => order(a.path,b.path)),
      inventory: new Map(inputs.inventory.files.map(file => [file.path,file]))
    };
    globalThis.__p5Setup = { setup, elapsedMs: performance.now()-start };
    const resolution = setup.resolution;`);
  replace('const files = new Map(catalog.files.map(file => [file.file, file]));','const files = setup.files;');
  replace('const originals = new Map(catalog.originals.map(original => [originalKey(original.id), original]));','const originals = setup.originals;');
  replace('for (const file of [...inputs.inventory.files].sort((a, b) => order(a.path, b.path))) {',`for (const file of (maintained && only ? [...only].sort(order).map(path => setup.inventory.get(path)) : setup.ordered)) {\n        if (only && !only.has(file.path)) continue;`);
  transformedSha256=sha(text);return {...result,source:text};}});
const {collectAccesses}=await import('../../../dist/subs/analysis/subs/typescript/src/accesses.js');hook.deregister();
const data=await acquire(process.argv[2]??defaults.S1000);let c;
try {
  c=compiler(data);const runtime=new Map(),catalog=buildCatalog(c.project,data,c.host,runtime);
  const path=data.inventory.files.find(f=>f.kind==='source'&&!f.path.includes('/tests/')).path,only=new Set([path]);
  const perCall=[],setup=[],hoisted=[],hoistedSetup=[],patch=[],repetitions=20;
  let maintained,expected;
  for(let i=0;i<repetitions;i++){
    const t=performance.now();const result=collectAccesses(c.project,data,c.host,catalog,runtime,only);perCall.push(performance.now()-t);setup.push(globalThis.__p5Setup.elapsedMs);
    if(i===0){maintained=globalThis.__p5Setup.setup;expected=result;}else assert.deepEqual(result,expected);
    const p=performance.now();const file=catalog.files.find(f=>f.file===path);maintained.files.set(path,file);patch.push(performance.now()-p);
    const h=performance.now();const got=collectAccesses(c.project,data,c.host,catalog,runtime,only,maintained);hoisted.push(performance.now()-h);hoistedSetup.push(globalThis.__p5Setup.elapsedMs);assert.deepEqual(got,expected);
  }
  archive('interpreter-setup',{fixture:identity(data),repetitions,target:path,originalSha256,transformedSha256,accesses:expected.accesses.length,
    perCall:stats(perCall),setup:stats(setup),hoisted:stats(hoisted),hoistedSetup:stats(hoistedSetup),singleDescriptionReplacement:stats(patch),
    method:'Probe-local Node load hook adds spike-style only filtering to current collectAccesses, instruments setup, and hoists Resolution/catalog/original/sorted inventory maps. The hoisted path iterates selected paths only. Paired real interpreter calls, twenty each, same snapshot, outputs deeply equal; no warmup removed. NamespaceUses and all semantic extraction remain unchanged. Setup also includes a path-to-inventory map for maintained selection.',
    limitations:['No maintained interpreter exists in this branch. This is feasibility measurement on a fixed snapshot, not I5-01 acceptance or incremental maintenance correctness.','Single replacement measures locating and replacing one unchanged catalog entry; changed originals, deletions and compiler snapshot replacement still require implementation and equivalence checks.']});
}finally{c?.dispose();await data.view.dispose();delete globalThis.__p5Setup;}
