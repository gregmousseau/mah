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
])

const SPIKE_CATEGORIES = new Set([
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

  if (config.falsePositiveIds?.includes(finding.id)) {
    return {
      classification: 'false-positive',
      provenance: {
        reason: 'Finding id is on the deterministic false-positive allowlist.',
        inRepairScope: false,
        sourceGraderId,
      },
    }
  }

  if (HARNESS_CATEGORIES.has(category)) {
    return {
      classification: 'harness-defect',
      provenance: {
        reason: `Category "${finding.category}" identifies harness/infra work.`,
        inRepairScope: false,
        sourceGraderId,
      },
    }
  }

  const inScope = isInCurrentPrScope(finding, config.currentPrPaths)
  if (inScope.matched) {
    const material = finding.severity === 'critical' || finding.severity === 'major'
    return {
      classification: material ? 'current-pr-blocker' : 'follow-up',
      provenance: {
        reason: material
          ? `Material finding on PR-touched path "${inScope.matchedPath}".`
          : `Non-material finding on PR-touched path "${inScope.matchedPath}".`,
        inRepairScope: material,
        matchedPath: inScope.matchedPath,
        sourceGraderId,
      },
    }
  }

  if (SPIKE_CATEGORIES.has(category) || finding.severity === 'info') {
    return {
      classification: 'spike-candidate',
      provenance: {
        reason: 'Finding is outside PR scope and is exploratory/informational.',
        inRepairScope: false,
        sourceGraderId,
      },
    }
  }

  return {
    classification: 'follow-up',
    provenance: {
      reason: 'Finding is on a path not touched by the current PR.',
      inRepairScope: false,
      matchedPath: finding.file,
      sourceGraderId,
    },
  }
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
