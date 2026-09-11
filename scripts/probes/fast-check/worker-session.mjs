import assert from 'node:assert/strict';
import { Worker, isMainThread, parentPort, workerData, resourceLimits } from 'node:worker_threads';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getHeapStatistics } from 'node:v8';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { acquire, archive, compiler, defaults, identity, sha, stats, median } from './p5-common.mjs';
const tickStats = samples => {
  const sorted=[...samples].sort((a,b)=>a-b);
  const percentile=p=>sorted[Math.ceil(p*sorted.length)-1];
  const bounds=[10,15,20,50,100,250,1000,Infinity];
  return {count:sorted.length,medianMs:median(sorted),p95Ms:percentile(0.95),p99Ms:percentile(0.99),maxMs:sorted.at(-1),
    histogram:bounds.map((upper,i)=>({lowerExclusiveMs:i?bounds[i-1]:0,upperInclusiveMs:Number.isFinite(upper)?upper:null,
      count:sorted.filter(n=>n>(i?bounds[i-1]:0)&&n<=upper).length}))};
};
const rss=pid=>{try{return Number(readFileSync(`/proc/${pid}/status`,'utf8').match(/^VmRSS:\s+(\d+)/m)[1])*1024;}catch{return null;}};
if(isMainThread && process.env.NODE_OPTIONS?.includes('--max-old-space-size')) {
  const w=new Worker(new URL(import.meta.url),{workerData:{mode:'limits'},resourceLimits:{maxOldGenerationSizeMb:16}});
  const [preflight]=await once(w,'message');await once(w,'exit');
  const inherited=process.env.NODE_OPTIONS;
  const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,NODE_OPTIONS:inherited.replace(/--max-old-space-size(?:=|\s+)\d+/g,''),P5_HEAP_PREFLIGHT:JSON.stringify({inherited,requestedMiB:16,observed:preflight})}});
  if(result.error)throw result.error;process.exitCode=result.status??1;
}else if(!isMainThread){
  if(workerData.mode==='limits'){ parentPort.postMessage({reportedResourceLimits:resourceLimits,heapSizeLimitBytes:getHeapStatistics().heap_size_limit});parentPort.close(); }
  else if(workerData.mode==='heap'){
    parentPort.postMessage({ready:true});
    const held=[];for(;;)held.push(new Array(100000).fill('heap-limit-witness'));
  }else{
    const start=performance.now(),data=await acquire(workerData.root);let c;
    try {
      c=compiler(data);
      const {buildCatalog}=await import('../../../dist/subs/analysis/subs/typescript/src/catalog.js');
      const {collectAccesses}=await import('../../../dist/subs/analysis/subs/typescript/src/accesses.js');
      const runtime=new Map(),catalog=buildCatalog(c.project,data,c.host,runtime),accesses=collectAccesses(c.project,data,c.host,catalog,runtime);
      const coldMs=performance.now()-start,compilerPid=c.api.client.channel.child.pid,coldMemory=process.memoryUsage();
      // Actual S1000 inventory, catalog and access objects, repeated as distinct
      // objects to reach the spike's 66 MiB report size. No transfer list.
      const component={inventory:data.inventory,catalog,accesses};
      const bytes=Buffer.byteLength(JSON.stringify(component));
      const payload=Array.from({length:Math.ceil(66*1024**2/bytes)},()=>structuredClone(component));
      const payloadBytes=Buffer.byteLength(JSON.stringify(payload));
      parentPort.postMessage({kind:'opened',coldMs,coldWorkerHeapUsed:coldMemory.heapUsed,coldProcessRss:coldMemory.rss,fixture:identity(data),compilerPid,compilerRss:rss(compilerPid),workerHeapUsed:process.memoryUsage().heapUsed,processRss:process.memoryUsage().rss,payloadBytes,payloadSha256:sha(JSON.stringify(payload))});
      parentPort.on('message',m=>{
        if(m.kind==='clone'){const t=performance.now();parentPort.postMessage({kind:'payload',sentAt:t,payload});parentPort.postMessage({kind:'sent',postMessageMs:performance.now()-t});}
        if(m.kind==='close'){c.dispose();data.view.dispose().then(()=>parentPort.close());}
      });
    }catch(e){c?.dispose();await data.view.dispose();throw e;}
  }
}else{
  const repetitions=3,runs=[];
  const preflight=process.env.P5_HEAP_PREFLIGHT?JSON.parse(process.env.P5_HEAP_PREFLIGHT):null;
  for(let i=0;i<repetitions;i++){
    let last=performance.now(),ticks=0,maxGapMs=0;const gaps=[];
    const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);maxGapMs=Math.max(maxGapMs,now-last);last=now;ticks++;},10);
    const start=performance.now(),w=new Worker(new URL(import.meta.url),{workerData:{root:process.argv[2]??defaults.S1000},resourceLimits:{maxOldGenerationSizeMb:512}});
    let opened;
    try{
      [opened]=await once(w,'message');assert.equal(opened.kind,'opened');
      const openWallMs=performance.now()-start;clearInterval(timer);
      const clone=[],post=[];let receivedHash;
      for(let n=0;n<5;n++){
        const messages=[];const done=new Promise((res,rej)=>{const onError=e=>{w.off('message',onMessage);rej(e);};const onMessage=m=>{messages.push(m);if(messages.length===2){w.off('message',onMessage);w.off('error',onError);res();}};w.on('message',onMessage);w.once('error',onError);});
        w.postMessage({kind:'clone'});await done;
        const payload=messages.find(m=>m.kind==='payload'),sent=messages.find(m=>m.kind==='sent');assert.ok(payload&&sent);
        clone.push(performance.now()-payload.sentAt);post.push(sent.postMessageMs);
        receivedHash=sha(JSON.stringify(payload.payload));assert.equal(receivedHash,opened.payloadSha256);
      }
      const exit=once(w,'exit');w.postMessage({kind:'close'});const [code]=await exit;assert.equal(code,0);
      // The compiler is the only child created by this session; wait for its
      // own close path and record if it failed to exit.
      for(let n=0;n<50&&rss(opened.compilerPid)!==null;n++)await new Promise(r=>setTimeout(r,20));
      assert.equal(rss(opened.compilerPid),null,'Compiler survived session disposal');
      runs.push({...opened,openWallMs,ticks,tickPeriodMs:10,maxGapMs,tickGaps:tickStats(gaps),clone:stats(clone),postMessage:stats(post),receivedHash,exitCode:code,compilerGone:true});
    }finally{clearInterval(timer);await w.terminate();if(opened?.compilerPid&&rss(opened.compilerPid)!==null)process.kill(opened.compilerPid,'SIGTERM');}
  }
  const errors=[];
  for(let i=0;i<3;i++){
    const w=new Worker(new URL(import.meta.url),{workerData:{mode:'heap'},resourceLimits:{maxOldGenerationSizeMb:16,maxYoungGenerationSizeMb:4}});
    let code,ready=false;w.on('message',m=>{ready=!!m.ready;});w.on('error',e=>{code=e.code;});const exit=await new Promise(res=>w.once('exit',res));
    assert.equal(code,'ERR_WORKER_OUT_OF_MEMORY');assert.notEqual(exit,0);assert.equal(ready,true,'Heap witness did not reach its allocation loop');errors.push({code,exit,ready});
  }
  archive('worker-session',{repetitions,preflight,priorAttempt:{outcome:'Terminated by probe author after observing inherited 8192 MiB override during the requested 16 MiB heap witness',signal:'SIGTERM',observedProcessRssBytes:7939100*1024,noCompilerChildAtTermination:true},runs,cold:stats(runs.map(r=>r.coldMs)),openWall:stats(runs.map(r=>r.openWallMs)),heapLimit:{oldGenerationMiB:16,youngGenerationMiB:4,repetitions:3,errors},
    method:'Three independent workers with a 512 MiB old-generation limit cold-acquire S1000 and retain a real compiler snapshot, catalog and access facts. Cold work excludes payload construction; main-thread ticks cover worker launch through payload preparation. Five structured-clone deliveries per worker of a report-sized stand-in made of distinct copies of actual S1000 objects, at least 66 MiB JSON; each hash checked. Separate workers force heap exhaustion by retained JavaScript arrays.',
    limitations:['This branch has no retained-session product. Cold open measures acquisition plus compiler/catalog/access extraction, excluding linking, decisions, observer and publication.','The inherited --max-old-space-size flag overrides resourceLimits. This probe relaunches without that flag after recording effective limits; production must reject or isolate such an environment.','resourceLimits bounds the worker V8 heap, not ArrayBuffer storage, process RSS, or the native compiler child. Compiler PID/RSS must be accounted separately and combined once with process RSS; worker RSS is process-wide.','Heap-limit witness forces allocation independently of the compiler to avoid orphaning a native server; production compiler cleanup after worker failure still needs I5-08.','Large-message clone cost is a report-sized upper workload, not compact-revision latency; report construction and checksum verification are excluded from clone timing.']});
}
