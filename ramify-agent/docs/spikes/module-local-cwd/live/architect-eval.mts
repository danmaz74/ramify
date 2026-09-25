import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout, projectRoot, output, arm] = process.argv.slice(2);
if (!checkout || !projectRoot || !output || !arm) throw new Error('usage: <checkout> <project> <output> <baseline|candidate>');
const mod = async (relative: string) => import(pathToFileURL(join(checkout, 'ramify-agent', relative)).href);
const { createPiAgent, piReadiness } = await mod('subs/harness/subs/agent/subs/pi/src/pi-agent.ts');
const { privateRamify } = await mod('subs/harness/subs/evidence/src/ramify-cli.ts');
const { architectRunInputs } = await mod('subs/harness/src/run/inputs.ts');
const { onboardingOf, apiViewsOf, workItemMessage } = await mod('subs/harness/src/work/session.ts');
const { loadPromptPackages, renderLocalArchitectPrompt } = await mod('subs/harness/src/prompts/packages.ts');
const { localArchitectToolName, localArchitectJsonSchema, validateLocalArchitect } = await mod('subs/harness/src/work/submission.ts');
const model = 'openai-codex/gpt-6-sol';
const ready = await piReadiness({model});
if (!ready.ready) throw new Error(`pi unavailable: ${ready.reason}`);
const moduleDir = 'subs/workspace/subs/reviews';
const cwd = arm === 'candidate' ? join(projectRoot, moduleDir, 'src') : projectRoot;
await mkdir(output, { recursive: true });
const { ramify, dispose } = await privateRamify();
let index: any;
try {
  index = await architectRunInputs({ramify}).refresh(projectRoot);
  if (!index) throw new Error('architect view unavailable');
  const onboarding = await onboardingOf(projectRoot, moduleDir);
  const views = await apiViewsOf(ramify, projectRoot, index, 'collection-review/workspace/reviews');
  const { packages } = await loadPromptPackages();
  const loaded = packages.get('local-architect');
  if (!loaded) throw new Error('local architect package unavailable');
  const systemPrompt = renderLocalArchitectPrompt(loaded, projectRoot, cwd);
  const goal = 'Plan one engineer iteration in Reviews to add `SessionTable.bindFromJson(sessionId: string | null, scope: unknown): SessionBinding`. It must validate with the existing shared `revisionScopeSchema` before changing a binding; valid input behaves like bind, while invalid input throws and leaves the binding and counter unchanged. Include focused tests in Reviews `src/tests/sessions.test.ts`. Determine the exact writable scope and whether the shared schema is exposed from the generated API view. Submit a valid assignment with concrete completion evidence.';
  const item = { schema:'ramify-agent.work-item/1', id:'wi-001', module:'collection-review/workspace/reviews', origin:{entry:'json-session-binding'}, goal, requirementRefs:[], acceptanceRefs:[], startedFor:null };
  const prompt = workItemMessage({item, projectRoot, workingDirectory: cwd, plan:'# JSON session binding\n\n'+goal, onboarding, views, hypotheses:[], registry:[], decisions:[], outlines:[]});
  await writeFile(join(output,'prompt-stats.json'), JSON.stringify({arm,model,cwd,systemChars:systemPrompt.length,systemBytes:Buffer.byteLength(systemPrompt),userChars:prompt.length,userBytes:Buffer.byteLength(prompt),package:loaded.package,packageHash:loaded.hash,view:views.evidence},null,2));
  const events: any[] = [];
  const calls: any[] = [];
  const submissions: any[] = [];
  const agent = createPiAgent({model});
  const sessionDirectory = join(output,'pi-session');
  await mkdir(sessionDirectory,{recursive:true});
  const spec = {
    role:'local-architect', scope:{workingDirectory:cwd}, systemPrompt,prompt,session:{mode:'fresh'},
    context:{compaction:'forbidden',budgetTokens:null,budgetFraction:null,reportReserveTokens:0},
    builtinTools:['read','grep','ls'],tools:[],
    submission:{name:localArchitectToolName,description:'End this turn with the work item result; invalid submissions return errors.',inputSchema:localArchitectJsonSchema,
      accept:async(input:any)=>{ const result=validateLocalArchitect(input,{index,registry:new Map()}); submissions.push({input,result}); return result.ok?{accepted:true}:{accepted:false,errors:result.errors.map((e:any)=>`${e.path}: ${e.message}`)}; }},
    sessionDirectory,onEvent:(event:any)=>{events.push(event); if(event.type==='tool-started'||event.type==='tool-finished') calls.push(event);},
  };
  const startedAt=Date.now();
  const session=agent.startSession(spec);
  const timer=setTimeout(()=>session.stop(),180_000);
  const outcome=await session.outcome;
  clearTimeout(timer);
  await writeFile(join(output,'events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  await writeFile(join(output,'result.json'),JSON.stringify({arm,model,cwd,startedAt,elapsedMs:Date.now()-startedAt,start:session.start,ref:session.ref,outcome,submissions,toolEvents:calls},null,2));
  console.log(JSON.stringify({arm,model,cwd,elapsedMs:Date.now()-startedAt,outcome:outcome.kind,submission:submissions.at(-1)?.input?.kind,accepted:submissions.at(-1)?.result?.ok,toolEvents:calls.length,output},null,2));
} finally { await dispose(); }
