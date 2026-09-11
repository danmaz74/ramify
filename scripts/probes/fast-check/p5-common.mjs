// Probe-only composition of the installed compiler and unchanged batch owners.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, realpathSync } from 'node:fs';
import { hostname, platform, arch, release, cpus } from 'node:os';
import { dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import { readProject } from '../../../dist/subs/analysis/subs/project/src/read-project.js';
import { parseDescription } from '../../../dist/subs/analysis/subs/descriptions/src/parse.js';
import { createDefaultTagRegistry, deriveSourceAreas } from '../../../dist/subs/analysis/subs/model/src/index.js';
export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const sha = value => createHash('sha256').update(value).digest('hex');
export const order = (a,b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const median = values => { const v = [...values].sort((a,b)=>a-b); return v.length % 2 ? v[(v.length-1)/2] : (v[v.length/2-1]+v[v.length/2])/2; };
export const stats = samples => ({ samples, medianMs: median(samples), minMs: Math.min(...samples), maxMs: Math.max(...samples) });
export const acquisitionLimits = { attempts: 1, maxFiles: 100000, maxApplicationFiles: 30000, maxFileBytes: 8*1024**2, maxInputBytes: 512*1024**2, maxApplicationBytes: 128*1024**2, maxOwners: 1100, maxDepth: 128, deadlineMs: 120000 };
export const limits = { maxExports: 1000000, maxAccesses: 1000000, maxSelections: 2000000, maxForwardingDepth: 256, deadlineMs: 180000 };
export const defaults = { R: 'examples/collection-review', T: '.', S100: '.reference-work/P5-S100', S1000: '.reference-work/P5-S1000' };
export function rootOf(argument) { const p=resolve(argument); return statSync(p).isDirectory() ? p : JSON.parse(readFileSync(p,'utf8')).scope.root; }
export async function acquire(argument) {
  const root=rootOf(argument);
  const result=await readProject({ request:{cwd:repo,root,scope:'whole-project',configuration:'discover'},parse:parseDescription,limits:acquisitionLimits });
  assert.equal(result.status,'acquired',JSON.stringify(result.issues));
  const inventory=result.view.inventory, registry=createDefaultTagRegistry();
  const areas=inventory.modules.flatMap(m=>{const r=deriveSourceAreas(registry,m.id,m.areas.find(a=>a.kind==='ordinary').root,m.headerTags);assert.equal(r.status,'valid');return r.value;});
  return { root, inventory, areas, limits, view:result.view, registry };
}
export function identity(data) {
  return {root:data.root, owners:data.inventory.modules.length, sourceFiles:data.inventory.files.filter(f=>f.kind==='source').length,
    ownedContentSha256:sha(JSON.stringify(data.inventory.files.map(f=>[f.path,f.sha256]).sort(([a],[b])=>order(a,b)))),
    configurationSha256:sha(readFileSync(resolve(data.root,data.inventory.scope.configuration)))};
}
export function archive(name, data) {
  const value={probe:name, recordedAt:new Date().toISOString(), host:{hostname:hostname(),platform:platform(),arch:arch(),release:release(),cpu:cpus()[0]?.model}, node:process.version,
    typescript:JSON.parse(readFileSync(resolve(repo,'node_modules/typescript/package.json'),'utf8')).version,
    scriptSha256:sha(readFileSync(resolve(repo,`scripts/probes/fast-check/${name}.mjs`))), commonSha256:sha(readFileSync(fileURLToPath(import.meta.url))), ...data};
  mkdirSync(resolve(repo,'scripts/probes/results'),{recursive:true});
  writeFileSync(resolve(repo,`scripts/probes/results/${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({probe:name, result:`scripts/probes/results/${name}.json`}));
}
export function compiler(data, sink = () => {}) {
  const configuration=resolve(data.root,data.inventory.scope.configuration), virtual=new Map(), overrides=new Map();
  let synthetic, witness;
  const event=(method,path)=>sink({method,path:resolve(path)});
  const readFile=path=>{path=resolve(path);if(virtual.has(path))return virtual.get(path);if(overrides.has(path))return overrides.get(path);event('readFile',path);try{return readFileSync(path,'utf8');}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return null;throw e;}};
  const fileExists=path=>{path=resolve(path);if(virtual.has(path)||overrides.has(path))return true;event('fileExists',path);try{return statSync(path).isFile();}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return false;throw e;}};
  const directoryExists=path=>{event('directoryExists',path);try{return statSync(path).isDirectory();}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return false;throw e;}};
  const realpath=path=>{path=resolve(path);if(virtual.has(path)||overrides.has(path))return path;event('realPath',path);try{return realpathSync(path);}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return path;throw e;}};
  const getAccessibleEntries=path=>{event('readDirectory',path);let names;try{names=readdirSync(path).sort(order);}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return {files:[],directories:[]};throw e;}
    const files=[],directories=[];for(const name of names){const p=resolve(path,name);if(fileExists(p))files.push(name);else if(directoryExists(p))directories.push(name);}return {files,directories};};
  const api=new API({cwd:data.root,fs:{readFile,fileExists,directoryExists,getAccessibleEntries,realpath}});
  let snapshot;
  try {
    const parsed=api.parseConfigFile(configuration); readFile(configuration);
    for(let n=0;n<1000;n++){const c=resolve(dirname(configuration),`.ramify-source-inputs-${n}.json`),w=resolve(dirname(configuration),`.ramify-source-inputs-${n}.ts`);
      event('readDirectory',dirname(configuration));const names=readdirSync(dirname(configuration));
      if(!names.includes(basename(c))&&!names.includes(basename(w))){synthetic=c;witness=w;break;}}
    assert.ok(synthetic);
    const roots=new Set([...parsed.fileNames,...data.inventory.files.filter(f=>f.kind==='source').map(f=>resolve(data.root,f.path)),witness]);
    const regenerate=()=>virtual.set(synthetic,JSON.stringify({extends:configuration,files:[...roots].sort(),include:[],exclude:[]}));
    virtual.set(witness,data.inventory.files.filter(f=>f.kind==='resource').map((f,i)=>{let p=relative(dirname(witness),resolve(data.root,f.path));if(!p.startsWith('.'))p='./'+p;return `import * as ramifyResource${i} from ${JSON.stringify(p)};\n`;}).join('')+'export {};\n');
    regenerate(); snapshot=api.updateSnapshot({openProjects:[synthetic]});
    return {api,synthetic,witness,virtual,overrides,roots,regenerate,host:{readFile,fileExists,resourceWitness:witness},get project(){return snapshot.getProject(synthetic);},
      update(changes){const previous=snapshot;snapshot=api.updateSnapshot(changes);previous.dispose();assert.ok(previous.isDisposed());return snapshot.getProject(synthetic);},
      dispose(){snapshot?.dispose();api.close();}};
  }catch(e){snapshot?.dispose();api.close();throw e;}
}
export async function replay(view, events) {
  for(const {method,path} of events){if(method==='readFile'){const text=await view.readFile(path);if(text!==undefined)await view.realPath(path);}else if(method==='readDirectory')await view.readDirectory(path);else await view[method](path);}
}
export function inputId(data, inputs) {
  const captured=[...inputs].sort((a,b)=>order(a.path,b.path)||order(a.role,b.role));
  return 'input/1:'+sha(JSON.stringify({scope:data.inventory.scope,registry:data.registry.id,integration:'typescript/7.0.2/captured-source/1',recipe:'adjacent-absent-config/extends/files-all-owned-and-configured/empty-include-exclude/resource-witness/1',roots:data.inventory.files.filter(f=>f.kind==='source').map(f=>f.path).sort(order),inputs:captured}));
}
