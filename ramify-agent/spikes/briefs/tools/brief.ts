/**
 * Spike, throwaway. Assembles work briefs from a map by selection alone.
 *
 * Rule under test: the harness writes no sentence. Every line of a brief is
 * either fixed template text (the role's protocol, the same for every plan)
 * or a value copied from the map. Whatever a brief needs and the map cannot
 * supply is recorded as a gap, never invented.
 *
 * Run from ramify-agent/:  npx tsx spikes/briefs/tools/brief.ts <plan-id>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isWithin,
  validateMapSubmission,
  type MapSubmission,
  type Reuse,
  type WorkItem,
} from '../../../subs/harness/src/interfaces/map.js';

const here = dirname(fileURLToPath(import.meta.url));
const planId = process.argv[2];
if (!planId) throw new Error('usage: brief.ts <plan-id>');
const runDir = resolve(here, '../runs', planId);
const planPath = `ramify-agent/spikes/briefs/plans/${planId}/plan.md`;

const validation = validateMapSubmission(JSON.parse(readFileSync(join(runDir, 'map.json'), 'utf8')));
if (!validation.ok) {
  console.error(`map.json is not a valid submission:\n  ${validation.errors.join('\n  ')}`);
  process.exit(1);
}
const map: MapSubmission = validation.value;
const gaps: string[] = [];

// ------------------------------------------------------------ registry lints
const capabilities = new Map(map.newCapabilities.map(c => [c.capability, c]));
const holders = new Map<string, WorkItem[]>();
for (const item of map.workItems) {
  for (const name of item.capabilities) {
    holders.set(name, [...(holders.get(name) ?? []), item]);
    const capability = capabilities.get(name);
    if (!capability) {
      if (!map.reuse.some(r => r.capability === name)) gaps.push(`work item "${item.title}" holds "${name}", which is neither a new capability nor a reuse: it has no goal to copy`);
    } else if (!isWithin(capability.owner, item.subtreeRoot)) {
      gaps.push(`work item "${item.title}" (root ${item.subtreeRoot}) holds "${name}", whose owner ${capability.owner} is outside that root`);
    }
  }
}
for (const c of map.newCapabilities) {
  const held = holders.get(c.capability) ?? [];
  if (held.length === 0) gaps.push(`capability "${c.capability}" is held by no work item: no item would ever be created for it`);
  if (held.length > 1) gaps.push(`capability "${c.capability}" is held by ${held.length} work items: the expansion cannot choose`);
}
for (const s of map.seams) {
  if (!map.workItems.some(w => isWithin(s.consumer, w.subtreeRoot))) gaps.push(`seam "${s.capability}": its consumer ${s.consumer} lies within no work item, so no item ever reports the need and no contract item is ever created`);
  const provider = (holders.get(s.capability) ?? [])[0];
  if (provider && isWithin(s.consumer, provider.subtreeRoot)) gaps.push(`seam "${s.capability}": consumer and owner are both within work item "${provider.title}"; it is a seam of the tree but not of the work`);
  if (!capabilities.has(s.capability)) gaps.push(`seam "${s.capability}" names no new capability: a contract brief would have no goal`);
}
for (const t of map.modulesTouched) {
  if (!map.workItems.some(w => isWithin(t.module, w.subtreeRoot))) gaps.push(`touched module ${t.module} (${t.weight}) lies within no work item's root: nothing is scoped to change it`);
}
for (const [i, a] of map.workItems.entries()) {
  for (const b of map.workItems.slice(i + 1)) {
    if (isWithin(a.subtreeRoot, b.subtreeRoot) || isWithin(b.subtreeRoot, a.subtreeRoot)) gaps.push(`work items "${a.title}" and "${b.title}" have nested roots: their scopes overlap`);
  }
}
for (const r of map.reuse) {
  if (!map.workItems.some(w => isWithin(r.requester.module, w.subtreeRoot))) gaps.push(`reuse "${r.capability}" is requested by ${r.requester.module}, which lies within no work item's root`);
}

// ------------------------------------------------------------ the spine
const entryItems = map.workItems.filter(w => isWithin(map.entryPoint.module, w.subtreeRoot));
if (entryItems.length !== 1) gaps.push(`the entry point ${map.entryPoint.module} lies within ${entryItems.length} work items' roots; the entry item needs exactly one`);
const entry = entryItems[0];

// ------------------------------------------------------------ rendering
const FIXED = (text: string) => text; // marks template text: identical for every plan
const indent = (text: string, by = '  ') => text.split('\n').map(l => by + l).join('\n');
const wrap = (text: string, width = 76) => {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines.join('\n');
};

function renderReuse(r: Reuse): string {
  const symbols = r.symbols.map(s => `${s.name} (${s.owner})`).join(', ');
  const head = `- ${r.capability}: ${symbols}; for ${r.requester.module} ${r.requester.area}`;
  switch (r.availability.status) {
    case 'available': return `${head}\n    available. Import: ${r.availability.importSpelling}\n    Record: ${r.availability.record}`;
    case 'unavailable': return `${head}\n    NOT available. Needs, per module:\n${r.availability.exposures.map(e => `      ${e.module}: ${e.declaration}`).join('\n')}`;
    case 'unknown': return `${head}\n    availability unknown: ${r.availability.reason}`;
  }
}

function implementBrief(item: WorkItem, opts: { isEntry: boolean }): string {
  const root = item.subtreeRoot;
  const own = item.capabilities.flatMap(n => capabilities.get(n) ?? []);
  const outside = map.newCapabilities.filter(c => !isWithin(c.owner, root));
  const needed = outside.filter(c => c.consumers.some(m => isWithin(m, root)));
  const provides = map.seams.filter(s => isWithin(s.owner, root));
  const touched = map.modulesTouched.filter(t => isWithin(t.module, root));
  const reuse = map.reuse.filter(r => isWithin(r.requester.module, root));
  const exposureBlocked = reuse.filter(r => r.availability.status === 'unavailable');
  if (exposureBlocked.some(r => r.availability.status === 'unavailable' && r.availability.exposures.some(e => !isWithin(e.module, root)))) {
    gaps.push(`"${item.title}": a reuse needs exposure declarations in modules outside its root ${root}; the map assigns them to no work item`);
  }
  if (!opts.isEntry && own.length === 0) gaps.push(`"${item.title}" holds no new capability: its brief has no goal`);

  const out: string[] = [];
  out.push(FIXED(`Role: engineer.  Scope: ${root} and its descendants.`));
  out.push(FIXED(`Map revision: 1.`) + (opts.isEntry ? FIXED(`  Plan: ${planPath} (read it when the goal is unclear).`) : ''));
  out.push('');
  out.push(FIXED('Goal'));
  if (opts.isEntry) out.push(indent(wrap(map.entryPoint.acceptance)) + '            <- map: entryPoint.acceptance');
  for (const c of own) out.push(indent(wrap(`${c.capability}: ${c.goal}`)) + '            <- map: newCapabilities.goal');
  out.push('');
  out.push(FIXED('Modules in your scope that the map expects to change'));
  for (const t of touched) {
    out.push(indent(wrap(`- ${t.module} [${t.weight}]${t.proposed ? ` PROPOSED NEW MODULE under ${t.proposed.parent}, tags [${t.proposed.tags.join(', ')}]: ${t.proposed.purpose}` : ''}: ${t.why}`)));
  }
  out.push('');
  if (provides.length) {
    out.push(FIXED('Obligations: seams you provide'));
    for (const s of provides) out.push(indent(`- ${s.capability}, consumed by ${s.consumer}: conformance tests at <from the contract item's result>`));
    out.push('');
  }
  out.push(FIXED('Planned, outside your scope'));
  if (needed.length === 0) out.push(indent(FIXED('(none)')));
  for (const c of needed) out.push(indent(wrap(`- ${c.capability}   owner: ${c.owner}\n  ${c.goal}`)));
  out.push(indent(FIXED('If you need one of these, write a fake of only what you lack, make your\nbehavioral tests pass against it, and report the need by its identifier.\nAnything else you lack and cannot build within your scope is an unplanned need.')));
  out.push('');
  out.push(FIXED('Known interfaces'));
  if (reuse.length === 0) out.push(indent(FIXED('(none)')));
  for (const r of reuse) out.push(indent(renderReuse(r)));
  out.push('');
  out.push(FIXED('Report one outcome with submit_outcome: goal reached | partial, with needs |\ncontract needs revision | cannot be satisfied as specified | the map is wrong.'));
  return out.join('\n');
}

mkdirSync(join(runDir, 'briefs'), { recursive: true });
if (entry) writeFileSync(join(runDir, 'briefs', 'i3-entry.md'), '```text\n' + implementBrief(entry, { isEntry: true }) + '\n```\n');
for (const [n, item] of map.workItems.filter(w => w !== entry).entries()) {
  writeFileSync(join(runDir, 'briefs', `preview-${n + 1}.md`), `Preview: this item exists only once a consumer reports a need for one of its capabilities.\n\n\`\`\`text\n${implementBrief(item, { isEntry: false })}\n\`\`\`\n`);
}

// ------------------------------------------------------------ the projected run
const spine = [
  'i1 architect:plan      done: map revision 1',
  'i2 decide:approve-map  ready (a person)',
  entry ? `i3 implement:"${entry.title}"  root ${entry.subtreeRoot}; waiting for i2` : 'i3 implement: NO ENTRY ITEM (see gaps)',
  'i4 integrate           waiting for i3',
];
const projected = map.seams.map(s => {
  const provider = (holders.get(s.capability) ?? [])[0];
  return `if ${s.consumer} reports need "${s.capability}": + contract:"${s.capability}" + implement:"${provider?.title ?? '?'}" (root ${provider?.subtreeRoot ?? '?'})`;
});
const nonSeam = map.newCapabilities.filter(c => !map.seams.some(s => s.capability === c.capability));
writeFileSync(join(runDir, 'run.md'), [
  `# Projected run: ${planId}`, '', '## Items at the stop point', '', '```text', ...spine, '```', '',
  '## What the expansion table would add', '', '```text', ...(projected.length ? projected : ['(no seams: the run is the spine alone unless an unplanned need appears)']), '```', '',
  '## New capabilities that are not seams', '', ...(nonSeam.length ? nonSeam.map(c => `- ${c.capability} (owner ${c.owner}; held by ${(holders.get(c.capability) ?? []).map(w => `"${w.title}"`).join(', ') || 'nothing'})`) : ['(none)']), '',
  '## Gaps found mechanically', '', ...(gaps.length ? [...new Set(gaps)].map(g => `- ${g}`) : ['(none)']), '',
].join('\n'));
console.log(`${planId}: ${map.workItems.length} work items, ${map.seams.length} seams, ${new Set(gaps).size} gaps -> ${runDir}`);
