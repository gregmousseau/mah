// AWC-249: Deterministic classification of grader findings.
//
// Given a grader finding, produce a classification + scope provenance
// that will steer the finding into (or out of) the current PR repair
// loop. Classification is a pure function of the inputs so the same
// finding always sorts the same way — a safety-critical property for
// the shadow rollout.

import type { GraderFinding } from '../types.js'
import type {
  FindingClassification,
  RegistrarConfig,
  ScopeProvenance,
} from './types.js'

const HARNESS_CATEGORIES = new Set([
  'harness',
  'infrastructure',
  'infra',
  'ci',
  'tooling',
  'environment',
  'credentials',
  'credential',
  'preflight',
  'evaluation',
  'grader',
])

const LEGACY_SPIKE_CATEGORIES = new Set([
  'spike',
  'design',
  'architecture',
  'exploration',
])

export interface ClassifiedFinding {
  classification: FindingClassification
  provenance: ScopeProvenance
}

export function classifyFinding(
  finding: GraderFinding,
  config: Pick<RegistrarConfig, 'currentPrPaths' | 'falsePositiveIds'>,
  sourceGraderId?: string,
): ClassifiedFinding {
  const category = (finding.category ?? '').trim().toLowerCase()
  const relationship = normalizeRelationship(finding.scopeRelationship)
  const releaseImpact = normalizeReleaseImpact(finding.releaseImpact)
  const evidenceConfidence = normalizeConfidence(finding.evidenceConfidence)
  const baseProvenance = {
    relationship,
    releaseImpact,
    evidenceConfidence,
    sourceGraderId,
  }

  if (config.falsePositiveIds?.includes(finding.id)) {
    return {
      classification: 'false-positive',
      provenance: {
        reason: 'Finding id is on the deterministic false-positive allowlist.',
        inRepairScope: false,
        ...baseProvenance,
      },
    }
  }

  if (isHarnessCategory(category)) {
    return {
      classification: 'harness-defect',
      provenance: {
        reason: `Category "${finding.category}" identifies harness/infra work.`,
        inRepairScope: false,
        ...baseProvenance,
      },
    }
  }

  const inScope = isInCurrentPrScope(finding, config.currentPrPaths)
  const candidateCaused = relationship === 'introduced'
    || relationship === 'worsened'
    || relationship === 'activated'
  const releaseSafety = releaseImpact === 'required-for-release-safety'

  if (candidateCaused || releaseSafety) {
    return {
      classification: 'current-pr-blocker',
      provenance: {
        reason: candidateCaused
          ? `Finding was ${relationship} by the candidate change.`
          : 'Finding is required for release safety.',
        inRepairScope: true,
        matchedPath: inScope.matchedPath,
        ...baseProvenance,
      },
    }
  }

  if (
    evidenceConfidence === 'insufficient'
    || evidenceConfidence === 'plausible'
    // Older graders used an explicit spike-like category before they
    // emitted evidenceConfidence. Preserve that signal without turning a
    // confirmed architecture/design improvement into an investigation.
    || (finding.evidenceConfidence === undefined && LEGACY_SPIKE_CATEGORIES.has(category))
  ) {
    return {
      classification: 'spike-candidate',
      provenance: {
        reason: 'Material risk is plausible but evidence is insufficient for implementation.',
        inRepairScope: false,
        matchedPath: inScope.matchedPath ?? finding.file,
        ...baseProvenance,
      },
    }
  }

  if (relationship === 'pre-existing') {
    return {
      classification: 'follow-up',
      provenance: {
        reason: 'Finding is explicitly pre-existing and was not worsened or activated by the candidate.',
        inRepairScope: false,
        matchedPath: inScope.matchedPath ?? finding.file,
        ...baseProvenance,
      },
    }
  }

  // Backward-compatible fail-closed behavior for older grader output:
  // an unproven relationship on a cumulatively touched path stays in the
  // repair loop regardless of severity. Severity controls urgency only.
  if (inScope.matched) {
    return {
      classification: 'current-pr-blocker',
      provenance: {
        reason: `Candidate relationship is unknown on PR-touched path "${inScope.matchedPath}".`,
        inRepairScope: true,
        matchedPath: inScope.matchedPath,
        ...baseProvenance,
      },
    }
  }

  return {
    classification: 'follow-up',
    provenance: {
      reason: 'Finding is on a path not touched by the current PR.',
      inRepairScope: false,
      matchedPath: finding.file,
      ...baseProvenance,
    },
  }
}

function normalizeRelationship(
  value: GraderFinding['scopeRelationship'],
): NonNullable<GraderFinding['scopeRelationship']> {
  return value === 'introduced'
    || value === 'worsened'
    || value === 'activated'
    || value === 'pre-existing'
    ? value
    : 'unknown'
}

function normalizeReleaseImpact(
  value: GraderFinding['releaseImpact'],
): NonNullable<GraderFinding['releaseImpact']> {
  return value === 'required-for-release-safety' || value === 'not-release-blocking'
    ? value
    : 'unknown'
}

function normalizeConfidence(
  value: GraderFinding['evidenceConfidence'],
): NonNullable<GraderFinding['evidenceConfidence']> {
  return value === 'confirmed' || value === 'plausible' || value === 'insufficient'
    ? value
    : 'confirmed'
}

function isInCurrentPrScope(
  finding: GraderFinding,
  currentPrPaths: string[] | undefined,
): { matched: boolean; matchedPath?: string } {
  if (!finding.file) {
    // Without a file, we can't prove adjacency — treat as in-scope so a
    // real blocker cannot be silently routed out of the repair loop.
    return { matched: true, matchedPath: '(no file — treated as in-scope)' }
  }
  if (!currentPrPaths || currentPrPaths.length === 0) {
    // Same rationale: no scope info → default to in-scope.
    return { matched: true, matchedPath: finding.file }
  }
  const normalized = normalizePath(finding.file)
  for (const path of currentPrPaths) {
    if (normalizePath(path) === normalized) return { matched: true, matchedPath: finding.file }
  }
  return { matched: false }
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

function isHarnessCategory(category: string): boolean {
  if (HARNESS_CATEGORIES.has(category)) return true
  return category
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .some((part) => HARNESS_CATEGORIES.has(part))
}
