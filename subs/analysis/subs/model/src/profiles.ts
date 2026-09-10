import type { ModelIssue, ModelResult, ModuleId, ResolvedTagRegistry, SourceArea, SourceLocation, TagName } from './interfaces/model.js';
import { immutable, issue, locations, sortedNames, validLocation, validPath } from './data.js';
import { validModuleId } from './identity.js';
import { validateRegistry } from './registry.js';

export function tagIssues(registry: ResolvedTagRegistry, tags: readonly string[], context: string,
  evidence: readonly SourceLocation[] = []): ModelIssue[] {
  if (!Array.isArray(tags)) return [issue('unknown-tag', `Invalid tag set in ${context}`, evidence)];
  return tags.filter((tag) => !registry.definitions.some(({ name }) => name === tag))
    .map((tag) => issue('unknown-tag', `Unknown tag "${String(tag)}" in ${context}`, evidence));
}

export function requiredImporterTags(registry: ResolvedTagRegistry, tags: readonly string[]): string[] {
  return registry.definitions.filter(({ name, kind }) => kind === 'required-importer' && tags.includes(name))
    .map(({ name }) => name);
}

export function deriveSourceAreas(registry: ResolvedTagRegistry, owner: ModuleId, sourceRoot: string,
  headerTags: readonly string[]): ModelResult<readonly SourceArea[]> {
  const checked = validateRegistry(registry);
  if (checked.status === 'invalid') return checked;
  const issues = tagIssues(checked.value, headerTags, `module "${owner}" at ${sourceRoot}`);
  if (!validModuleId(owner)) issues.push(issue('invalid-module-id', `Invalid module identity "${owner}"`));
  if (!validPath(sourceRoot) || (sourceRoot !== 'src' && !sourceRoot.endsWith('/src'))) {
    issues.push(issue('invalid-tree', `Invalid source root "${sourceRoot}" for module "${owner}"`));
  }
  if (issues.length) return immutable({ status: 'invalid', issues });
  return immutable({ status: 'valid', value: [
    { owner, kind: 'ordinary', root: sourceRoot, profile: sortedNames(headerTags) },
    { owner, kind: 'tests', root: `${sourceRoot}/tests`,
      profile: sortedNames(['testing', ...requiredImporterTags(checked.value, headerTags)]) },
  ] });
}

export function assignOriginalTags(registry: ResolvedTagRegistry, area: SourceArea,
  assignments: readonly { readonly tags: readonly string[]; readonly location: SourceLocation }[],
): ModelResult<{ readonly tags: readonly TagName[]; readonly evidence: readonly SourceLocation[] }> {
  const checked = validateRegistry(registry);
  if (checked.status === 'invalid') return checked;
  const issues = tagIssues(checked.value, area.profile, `source area "${area.root}"`);
  if (!validModuleId(area.owner) || !validPath(area.root) || !['ordinary', 'tests'].includes(area.kind)
    || (area.kind === 'tests' && (!area.profile.includes('testing')
      || checked.value.definitions.some(({ name, kind }) => kind === 'required-symbol' && area.profile.includes(name))))) {
    issues.push(issue('invalid-original', 'Invalid defining source area'));
  }
  if (!Array.isArray(assignments) || assignments.some((assignment) => !validLocation(assignment.location))) {
    return immutable({ status: 'invalid', issues: [...issues, issue('invalid-original', 'Invalid tag assignment evidence')] });
  }
  const required = requiredImporterTags(checked.value, area.profile);
  let explicit: string[] | undefined;
  for (const assignment of assignments) {
    const invalidTags = tagIssues(checked.value, assignment.tags, `original in ${area.root}`, [assignment.location]);
    issues.push(...invalidTags);
    if (invalidTags.length) continue;
    const tags = sortedNames(assignment.tags);
    const missing = required.filter((tag) => !tags.includes(tag));
    if (missing.length) issues.push(issue('missing-required-tag', `Original in ${area.root} must retain: ${missing.join(', ')}`, [assignment.location]));
    if (explicit && JSON.stringify(explicit) !== JSON.stringify(tags)) {
      issues.push(issue('conflicting-tags', `Explicit assignments disagree for original in ${area.root}`, assignments.map(({ location }) => location)));
    }
    explicit ??= tags;
  }
  if (issues.length) return immutable({ status: 'invalid', issues });
  return immutable({ status: 'valid', value: {
    tags: explicit ?? required, evidence: locations(assignments.map(({ location }) => location)),
  } });
}
