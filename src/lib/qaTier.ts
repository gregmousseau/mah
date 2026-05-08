import type { SprintContract } from '../types.js'

export type QATier = 'smoke' | 'targeted' | 'full'

export interface QATierBudget {
  timeoutMs: number
  maxScenarios: number
  scopeHint: string
}

const BUDGETS: Record<QATier, QATierBudget> = {
  smoke: {
    timeoutMs: 90_000,
    maxScenarios: 1,
    scopeHint: 'One quick smoke check: does the change load without crashing and does the headline acceptance criterion hold? Skip exhaustive flows.',
  },
  targeted: {
    timeoutMs: 5 * 60_000,
    maxScenarios: 3,
    scopeHint: 'Up to 3 focused scenarios on the changed surface area. No full regression sweep.',
  },
  full: {
    timeoutMs: 15 * 60_000,
    maxScenarios: 8,
    scopeHint: 'Full UX scenarios across the changed surface and adjacent flows. Cover happy path, error states, and a representative regression check.',
  },
}

export function budgetForTier(tier: QATier | undefined): QATierBudget {
  return BUDGETS[tier ?? 'targeted']
}

export function budgetForContract(contract: SprintContract): QATierBudget {
  return budgetForTier(contract.qaBrief.tier)
}

export function bumpTier(current: QATier, target: QATier): QATier {
  const order: QATier[] = ['smoke', 'targeted', 'full']
  return order[Math.max(order.indexOf(current), order.indexOf(target))]
}

export interface QAEscalation {
  tierRequest: QATier
  reason: string
}

/**
 * Parse a "## QA Escalation" block out of a dev agent's completion report.
 * Recognized formats:
 *
 *   ## QA Escalation
 *   tier: full
 *   reason: touched auth flow, needs login regression
 *
 * Returns null if no block is found or if the tier is invalid.
 */
export function parseDevEscalation(devOutput: string): QAEscalation | null {
  const headingMatch = devOutput.match(/^[#]{1,6}\s*QA Escalation\s*$/im)
  if (!headingMatch) return null
  const after = devOutput.slice((headingMatch.index ?? 0) + headingMatch[0].length)
  // Limit scan to the next heading or 1000 chars, whichever comes first.
  const nextHeading = after.search(/^[#]{1,6}\s+\S/m)
  const block = nextHeading >= 0 ? after.slice(0, nextHeading) : after.slice(0, 1000)

  const tierMatch = block.match(/tier(?:[_-]?request)?\s*[:=]\s*['"]?(smoke|targeted|full)['"]?/i)
  const reasonMatch = block.match(/reason\s*[:=]\s*(.+)/i)
  if (!tierMatch) return null

  const tier = tierMatch[1].toLowerCase() as QATier
  const reason = (reasonMatch?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '')
  return { tierRequest: tier, reason }
}
