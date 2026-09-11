import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { acquire, archive, compiler, defaults, identity, stats } from './p5-common.mjs';
const repetitions=5, fixtures=[];
for(const [name,arg] of [['R',process.argv[2]??defaults.R],['S100',process.argv[3]??defaults.S100],['S1000',process.argv[4]??defaults.S1000]]) {
  const data=await acquire(arg);let c;
  try {
    c=compiler(data);
    const sources=data.inventory.files.filter(f=>f.kind==='source');
    const target=sources.find(f=>/function\s+\w+\s*\([^)]*\)[^{]*\{/.test(readFileSync(resolve(data.root,f.path),'utf8')));
    assert.ok(target,'A function body is required');
    const path=resolve(data.root,target.path),original=readFileSync(path,'utf8');
    const body=original.replace(/(function\s+\w+\s*\([^)]*\)[^{]*\{)/,'$1\n void 0;');assert.notEqual(body,original);
    const provider=resolve(data.root,sources.find(f=>f.path!==target.path).path);
    let specifier=relative(dirname(path),provider).replace(/\.tsx?$/,'.js');if(!specifier.startsWith('.'))specifier='./'+specifier;
    const imported=original+`\nimport ${JSON.stringify(specifier)};\n`;
    const created=resolve(dirname(path),'__p5_created.ts');
    const times={body:[],importList:[],createdWithConfiguration:[],invalidateAll:[]};
    const measure=changes=>{const start=performance.now();c.update(changes);return performance.now()-start;};
    const membership=[];
    for(let i=0;i<repetitions;i++) {
      for(const [key,text] of [['body',body],['importList',imported]]){
        c.overrides.set(path,text);times[key].push(measure({fileChanges:{changed:[path]}}));
        assert.equal(c.project.program.getSourceFile(path).text,text);
        c.overrides.delete(path);c.update({fileChanges:{changed:[path]}});
      }
      c.overrides.set(created,'export const p5Created = 1;\n');
      c.update({fileChanges:{created:[created]}});
      membership.push(!!c.project.program.getSourceFile(created));
      c.roots.add(created);c.regenerate();
      times.createdWithConfiguration.push(measure({fileChanges:{created:[created],changed:[c.synthetic]}}));
      assert.ok(c.project.program.getSourceFile(created),'Regenerated roots must include the created file');
      c.roots.delete(created);c.overrides.delete(created);c.regenerate();c.update({fileChanges:{deleted:[created],changed:[c.synthetic]}});
      assert.equal(c.project.program.getSourceFile(created),undefined);
      times.invalidateAll.push(measure({fileChanges:{invalidateAll:true}}));
    }
    // A newly imported file can enter through resolution without becoming an
    // explicit root. Keep this separate from the unreferenced creation case.
    c.overrides.set(created,'export const p5Created = 1;\n');
    c.overrides.set(path,original+"\nimport './__p5_created.js';\n");
    c.update({fileChanges:{created:[created],changed:[path]}});
    const createdReferencedWithoutRegeneration=!!c.project.program.getSourceFile(created);
    assert.equal(createdReferencedWithoutRegeneration,true);
    c.overrides.delete(created);c.overrides.delete(path);c.update({fileChanges:{deleted:[created],changed:[path]}});
    fixtures.push({name,...identity(data),target:target.path,importSpecifier:specifier,repetitions,createdWithoutRegeneration:membership,createdReferencedWithoutRegeneration,
      timing:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,stats(v)]))});
  }finally{c?.dispose();await data.view.dispose();}
}
archive('snapshot-update-costs',{repetitions,method:'Virtual body insertion and added import; updateSnapshot plus previous snapshot disposal timed, source query outside timing. Created-file trials first notify creation without root regeneration, then regenerate explicit roots; cleanup between samples. invalidateAll uses unchanged disk. Acquisition and cold open excluded; no warmup discarded.',fixtures});
