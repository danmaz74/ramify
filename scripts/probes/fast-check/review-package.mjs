// Document validation only: no harness or acceptance instance is executed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDescription } from '../../../dist/subs/analysis/subs/descriptions/src/parse.js';
const plan='docs/plans/iteration-5-fast-incremental-checks';
const read=path=>readFileSync(path,'utf8');
const subcases=read(`${plan}/subcases.md`),main=read(`${plan}/main-plan.md`),owners=read(`${plan}/owners.md`);
const rows=subcases.split('\n').filter(line=>line.startsWith('| I5-')).map(line=>line.split('|').map(s=>s.trim()));
assert.equal(rows.length,103);assert.equal(new Set(rows.map(row=>row[1])).size,103);
const counts={};
for(const row of rows){counts[row[2]]=(counts[row[2]]??0)+1;const [group,variant]=row[1].split(':');const matrix=main.split('\n').find(line=>line.startsWith(`| ${group} |`));assert.ok(matrix?.includes('`'+variant+'`'),`Missing matrix variant ${row[1]}`);}
assert.deepEqual(counts,{'2':10,'3':7,'4':8,'5':7,'6':10,'7':11,'8':8,'9':13,'10':9,'11':5,'12':9,'13':6});
for(const [iteration,count] of Object.entries(counts))assert.ok(subcases.includes(`| ${iteration} | ${count} |`));
const paths=['.','subs/analysis','subs/analysis/subs/project','subs/analysis/subs/typescript','subs/daemon','subs/daemon/subs/contexts','subs/cli'];
const blocks=[...owners.matchAll(/```ramify\n([\s\S]*?)```/g)].map(m=>m[1]);assert.equal(blocks.length,7);
const normalize=text=>text.split('\n').map(line=>line.replace(/\/\/.*$/,'').trim()).filter(line=>line.startsWith('expose-'));
const added=[],removed=[],revised=[];
for(let i=0;i<paths.length;i++){
  const actual=read(resolve(paths[i],'module.ramify')),before=normalize(actual);
  const expanded=blocks[i].split('\n').map(line=>{
    if(!line.includes('…'))return line;
    const prefix=line.slice(0,line.indexOf('…')).trimEnd();
    const match=before.filter(item=>item.startsWith(prefix));assert.equal(match.length,1,`Cannot expand ${line}`);return match[0];
  }).join('\n');
  const parsed=parseDescription(`${paths[i]}/module.ramify`,expanded);assert.equal(parsed.status,'valid',JSON.stringify(parsed));
  const after=normalize(expanded);
  const key=line=>line.startsWith('expose-sub')?line.match(/ from ([^ ]+)/)[1]+':'+line.match(/^expose-sub ([^, ]+)/)[1]:line;
  for(const line of after)if(!before.includes(line)){
    const previous=before.find(old=>key(old)===key(line));
    (previous?revised:added).push({owner:paths[i],line,...(previous?{previous}:{})});
  }
  for(const line of before)if(!after.includes(line)&&!after.some(now=>key(now)===key(line)))removed.push({owner:paths[i],line});
}
assert.equal(added.length,6);assert.equal(removed.length,1);assert.ok(removed[0].line.includes('analyzeIncrement'));assert.equal(revised.length,5);
for(const path of ['subs/analysis/subs/model','subs/analysis/subs/descriptions','subs/presentation','subs/presentation/subs/layout'])assert.equal(parseDescription(`${path}/module.ramify`,read(`${path}/module.ramify`)).status,'valid');
console.log(JSON.stringify({instances:rows.length,counts,parsedDeclarations:11,added,removed,revised},null,2));
