import type {
  CheckFindingCredibility, CheckFindingDecision, CheckFindingReport, CheckFindingRisk,
} from './interfaces/check-findings.js';

/*
 * What a CheckFinding signals, derived from its reports and decisions: its
 * current risk, its credibility and the modules it concerns. Replay derives
 * them after every event, so the views and a rebuilt projection agree. None
 * of them forms identity: they order attention, narrow a list and bound a
 * waiver's authority.
 */

/** Most urgent first. */
const riskOrder: readonly CheckFindingRisk[] = ['high', 'medium', 'low'];
/** Most credible first. */
const credibilityOrder: readonly CheckFindingCredibility[] = ['objective-reproduced', 'objective', 'human-reviewed', 'agent-generated', 'ungrounded'];

/** 0 for the most urgent risk. */
export function riskRank(risk: CheckFindingRisk): number {
  return riskOrder.indexOf(risk);
}

/** 0 for the most credible signal. */
export function credibilityRank(credibility: CheckFindingCredibility): number {
  return credibilityOrder.indexOf(credibility);
}

/**
 * The risk one report proposes: its judgment's, or for a failed check that
 * carries no judgment, `high` when a required check observed it and
 * `medium` otherwise.
 */
export function reportRisk(report: CheckFindingReport): CheckFindingRisk {
  if (report.judgment !== null) return report.judgment.risk;
  return report.verification.kind === 'check' && report.verification.required ? 'high' : 'medium';
}

/** The latest risk correction a decision made, else the latest report's risk. */
export function currentRisk(reports: readonly CheckFindingReport[], decisions: readonly CheckFindingDecision[]): CheckFindingRisk {
  const corrected = [...decisions].reverse().find(decision => decision.risk !== undefined)?.risk;
  if (corrected !== undefined) return corrected;
  const latest = reports.at(-1);
  if (latest === undefined) throw new Error('A CheckFinding holds at least one report');
  return reportRisk(latest);
}

/** `objective-reproduced` for two or more objective reports, else the most credible report's. */
export function currentCredibility(reports: readonly CheckFindingReport[]): CheckFindingCredibility {
  if (reports.filter(report => report.credibility === 'objective').length >= 2) return 'objective-reproduced';
  return reports
    .map(report => report.credibility as CheckFindingCredibility)
    .reduce((best, next) => (credibilityRank(next) < credibilityRank(best) ? next : best), 'ungrounded');
}

/** Every module a report names, once, in the order the reports first name it. */
export function modulesOf(reports: readonly CheckFindingReport[]): string[] {
  return [...new Set(reports.flatMap(report => report.modules))];
}
