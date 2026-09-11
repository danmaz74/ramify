import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { isExportDeclaration, isImportDeclaration, isStringLiteral, isNamedExports, isNamespaceExport, isNamedImports } from 'typescript/unstable/ast';
import { Resolution } from '../../../dist/subs/analysis/subs/typescript/src/resolution.js';
import { acquire, archive, compiler, defaults, identity, median, stats, sha, repo, order } from './p5-common.mjs';
const fixtures=[];
for(const [name,arg] of [['R',process.argv[2]??defaults.R],['T',process.argv[3]??defaults.T],['S100',process.argv[4]??defaults.S100],['S1000',process.argv[5]??defaults.S1000]]){
  const data=await acquire(arg);let c;
  try {
    c=compiler(data);const resolution=new Resolution(c.project,data.inventory,c.host);
    const paths=data.inventory.files.filter(f=>f.kind==='source').map(f=>f.path),reverse=new Map(paths.map(p=>[p,new Set()])),edges=[],unresolved=[];
    for(const path of paths){
      const source=c.project.program.getSourceFile(resolve(data.root,path));assert.ok(source);
      const imports=new Map();
      for(const s of source.statements)if(isImportDeclaration(s)&&isStringLiteral(s.moduleSpecifier)){
        const clause=s.importClause;if(clause?.name)imports.set(clause.name.text,s.moduleSpecifier);
        const bindings=clause?.namedBindings;if(bindings){if(isNamedImports(bindings))for(const b of bindings.elements)imports.set(b.name.text,s.moduleSpecifier);else imports.set(bindings.name.text,s.moduleSpecifier);}
      }
      const add=(node,kind)=>{const r=resolution.module(node);if(r.kind==='application'&&r.file&&reverse.has(r.file)){reverse.get(r.file).add(path);edges.push({from:path,to:r.file,kind});}else if(r.kind==='unresolved')unresolved.push({file:path,specifier:node.text,kind});};
      for(const s of source.statements)if(isExportDeclaration(s)){
        if(s.moduleSpecifier&&isStringLiteral(s.moduleSpecifier))add(s.moduleSpecifier,!s.exportClause?'star':isNamespaceExport(s.exportClause)?'namespace':'forwarding');
        else if(s.exportClause&&isNamedExports(s.exportClause))for(const e of s.exportClause.elements){const node=imports.get((e.propertyName??e.name).text);if(node)add(node,'forwarding');}
      }
    }
    const runs=[],sizes=[];
    for(let i=0;i<3;i++){const start=performance.now();const current=[];
      for(const path of paths){const seen=new Set([path]),queue=[path];for(let at=0;at<queue.length;at++)for(const next of reverse.get(queue[at])??[])if(!seen.has(next)){seen.add(next);queue.push(next);}current.push({file:path,size:seen.size});}
      runs.push(performance.now()-start);if(i===0)sizes.push(...current);else assert.deepEqual(current,sizes);
    }
    const sorted=[...sizes].sort((a,b)=>b.size-a.size||order(a.file,b.file));
    const values=sizes.map(x=>x.size).sort((a,b)=>a-b),largest=values.at(-1);
    const percentile=p=>values[Math.ceil(p*values.length)-1];
    const path=`.reference-work/probe-details/description-closure/${name}.json`;
    const details=JSON.stringify(sorted)+'\n';
    mkdirSync(resolve(repo,'.reference-work/probe-details/description-closure'),{recursive:true});
    writeFileSync(resolve(repo,path),details);
    fixtures.push({name,...identity(data),repetitions:3,edgeCounts:Object.fromEntries(['star','forwarding','namespace'].map(k=>[k,edges.filter(e=>e.kind===k).length])),
      edges,unresolved,medianClosure:median(sizes.map(x=>x.size)),largestClosure:largest,p90Closure:percentile(0.90),p99Closure:percentile(0.99),top50:sorted.slice(0,50),details:{path,sha256:sha(details)},closureHistogram:Object.fromEntries([...new Set(sizes.map(x=>x.size))].sort((a,b)=>a-b).map(n=>[n,sizes.filter(x=>x.size===n).length])),timing:stats(runs)});
  }finally{c?.dispose();await data.view.dispose();}
}
archive('description-closure',{method:'Direct compiler AST scan of explicit star, named and namespace export declarations plus locally re-exported imported bindings; configured Resolution resolves each module target. Reverse transitive reach includes the changed file, counts all source files (including isolated ones). Three graph traversals; source scan once. This measures forwarding graph reach, not the future dynamic dependency recorder; shim/absence, type-inference and ambiguity dependencies need I5-03 closure-superset.',fixtures});
