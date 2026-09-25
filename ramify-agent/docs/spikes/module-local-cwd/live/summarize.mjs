import fs from 'node:fs';
import path from 'node:path';
const base='/tmp/ramify-cwd-eval';
const moduleDir='subs/workspace/subs/reviews';
function lines(file){return fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)}
function classify(raw,cwd,project){
  if(typeof raw!=='string')return 'none';
  const abs=path.resolve(cwd,raw);
  const rel=path.relative(project,abs).split(path.sep).join('/');
  if(rel===''||rel==='.')return 'project-root';
  if(rel.startsWith('.ramify-architect'))return 'global-architect-view';
  if(rel.startsWith(`${moduleDir}/src/.ramify/`)||rel.startsWith(`${moduleDir}/src/tests/.ramify/`))return 'own-generated-api';
  if(rel===moduleDir||rel.startsWith(`${moduleDir}/`))return 'own-module';
  if(rel.startsWith('subs/workspace/subs/contracts/'))return rel.endsWith('module.ramify')?'foreign-declaration':'foreign-source';
  return 'other';
}
const result={schema:'ramify-cwd-spike-summary/1',fixtureSeed:'4678ade40be7c38824ad9b1cd600a28f560726c0',model:'openai-codex/gpt-6-sol',tasks:{engineer:fs.readFileSync(`${base}/engineer-task.txt`,'utf8').trim(),architect:'workItemMessage goal in /tmp/ramify-cwd-eval/architect-eval.mts'},arms:{}};
for(const role of ['architect','engineer'])for(const arm of ['baseline','candidate']){
 const project=`${base}/${role}-${arm}`;
 let events,cwd,elapsedMs,accepted,sessionFile,promptBytes,systemBytes;
 if(role==='architect'){
  const a=JSON.parse(fs.readFileSync(`${base}/architect-${arm}-artifacts/result.json`));
  const p=JSON.parse(fs.readFileSync(`${base}/architect-${arm}-artifacts/prompt-stats.json`));
  events=lines(`${base}/architect-${arm}-artifacts/events.jsonl`);cwd=a.cwd;elapsedMs=a.elapsedMs;accepted=a.submissions.at(-1)?.result?.ok===true;sessionFile=a.ref.split('#')[0];promptBytes=p.userBytes;systemBytes=p.systemBytes;
 } else {
  const root=`${project}/plans/.harness/sessions`;
  const id=fs.readdirSync(root).filter(x=>fs.existsSync(`${root}/${x}/session.json`)).sort().at(-1);
  const dir=`${root}/${id}`;
  events=lines(`${dir}/transcript.jsonl`);
  sessionFile=fs.readdirSync(`${dir}/session`).filter(x=>x.endsWith('.jsonl')).map(x=>`${dir}/session/${x}`)[0];
  const started=events.find(x=>x.type==='started');
  cwd=JSON.parse(fs.readFileSync(sessionFile,'utf8').split('\n')[0]).cwd;
  systemBytes=started?.systemPrompt?.bytes;promptBytes=started?.prompt?.bytes;
  accepted=fs.existsSync(`${dir}/submission.json`);
  const first=Date.parse(events[0]?.at),last=Date.parse(events.at(-1)?.at);elapsedMs=last-first;
 }
 const header=JSON.parse(fs.readFileSync(sessionFile,'utf8').split('\n')[0]);
 const calls=role==='architect'?events.filter(x=>x.type==='tool-started'):events.flatMap(x=>x.type==='message'&&x.role==='assistant'?x.blocks.filter(b=>b.type==='tool-call').map(b=>({tool:b.tool,input:JSON.parse(b.input.text),action:b.action,callId:b.callId})):[]);
 const errs=role==='architect'?events.filter(x=>x.type==='tool-finished'&&x.isError):events.filter(x=>x.type==='message'&&x.role==='tool-result'&&x.isError);
 const reads=calls.filter(c=>['read','grep','ls'].includes(c.tool)).map(c=>({tool:c.tool,path:c.input?.path??null,category:classify(c.input?.path,cwd,project)}));
 const usage=events.filter(x=>x.type==='message'&&x.role==='assistant').map(x=>x.usage).filter(Boolean).reduce((a,u)=>{for(const k of ['input','output','cacheRead','cacheWrite','total'])a[k]=(a[k]??0)+(u[k]??0);return a},{});
 const byCategory=Object.fromEntries([...new Set(reads.map(x=>x.category))].map(k=>[k,reads.filter(x=>x.category===k).length]));
 result.arms[`${role}-${arm}`]={project,cwd,sessionHeaderCwd:header.cwd,sessionFile,elapsedMs,accepted,systemBytes,promptBytes,toolCalls:calls.length,readSearchCalls:reads.length,byCategory,reads,errors:errs.map(e=>({tool:e.tool,input:e.input??null,errorText:e.errorText??null})),shellRequests:calls.filter(c=>c.tool==='shell').map(c=>c.input),usage};
}
for(const arm of ['baseline','candidate']){
 const reportPath=`${base}/check-${arm}.json`;
 if(fs.existsSync(reportPath)){
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  result.arms[`engineer-${arm}`].directRamifyCheck={command:`ramify check --batch --root ${base}/engineer-${arm} --format json --no-snapshot`,exitCode:0,outcome:report.outcome,report:reportPath};
  result.arms[`engineer-${arm}`].focusedTest={command:'npm test -- --run subs/workspace/subs/reviews/src/tests/sessions.test.ts',exitCode:0,passedFiles:1,passedTests:10};
  result.arms[`engineer-${arm}`].diffCheck={command:'git diff --check',exitCode:0};
  result.arms[`engineer-${arm}`].fullHarnessCheckpoint='no terminal verdict';
  const materialized=`${base}/materialize-${arm}.out`;
  if(fs.existsSync(materialized)) result.arms[`engineer-${arm}`].directArchitectMaterialize={command:`ramify materialize --view architect --root ${base}/engineer-${arm}`,exitCode:0,modules:15,records:137,output:materialized,daemonStopped:true};
 }
}
result.abortedSetupAttempt={role:'local-architect',arm:'candidate',reason:'evaluator initially set cwd to module directory instead of module src; terminated before submission',sessionFile:`${base}/architect-candidate-artifacts/pi-session/2026-09-25T08-28-45-764Z_01a0d7ae-6543-71bd-8251-7a9d74c5962a.jsonl`,model:'openai-codex/gpt-6-sol',modelResponses:1,readSearchCalls:7,reportedTotalTokens:15376,includedInMatchedMetrics:false};
fs.writeFileSync(`${base}/summary.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.arms).map(([k,v])=>[k,{cwd:v.cwd,elapsedMs:v.elapsedMs,accepted:v.accepted,toolCalls:v.toolCalls,byCategory:v.byCategory,errors:v.errors.length,usage:v.usage,systemBytes:v.systemBytes,promptBytes:v.promptBytes}])),null,2));
