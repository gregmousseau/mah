import type { QAReport, Defect } from './types.js'

// Verdict patterns (order matters — check conditional before pass)
const VERDICT_PATTERNS = [
  { re: /verdict\s*:\s*fail/i,              verdict: 'fail'        as const },
  { re: /verdict\s*:\s*conditional\s*pass/i, verdict: 'conditional' as const },
  { re: /verdict\s*:\s*pass/i,              verdict: 'pass'        as const },
  // Looser fallbacks in the body text
  { re: /\bfail\b/i,                         verdict: 'fail'        as const },
  { re: /\bconditional\s*pass\b/i,           verdict: 'conditional' as const },
  { re: /\bpass\b/i,                         verdict: 'pass'        as const },
]

// Defect line patterns:
//   **P1-01:** description
//   P1-01: description
//   **P1:** description
//   - P2: description
const DEFECT_LINE_RE = /(?:\*\*)?(?:[-\s]*)?(P[0-3])(?:-(\d+))?(?:\*\*)?\s*[:–—]\s*(.+)/i
const SCOPE_RE = /^\s+Scope(?:\s+relationship)?\s*:\s*(introduced|worsened|activated|pre-existing|unknown)\s*$/i
const RELEASE_RE = /^\s+Release\s+impact\s*:\s*(required-for-release-safety|not-release-blocking|unknown)\s*$/i
const CONFIDENCE_RE = /^\s+Evidence\s+confidence\s*:\s*(confirmed|plausible|insufficient)\s*$/i
const INVESTIGATION_RE = /^\s+Investigation\s+question\s*:\s*(.+)\s*$/i
const EXIT_RE = /^\s+Exit\s+criterion\s*:\s*(.+)\s*$/i

export function parseQAReport(output: string): QAReport {
  const verdict = detectVerdict(output)
  const defects = parseDefects(output)
  const summary = extractSection(output, 'Summary') ?? extractFirstParagraph(output)
  const recommendation = extractSection(output, 'Recommendation') ?? ''

  return { verdict, defects, summary, recommendation }
}

export function hasExplicitQAVerdict(output: string): boolean {
  return /^[ \t]*(?:#{1,3}[ \t]+)?(?:\*\*)?verdict[ \t]*:(?:\*\*)?[ \t]*(?:✅|⚠️|❌)?[ \t]*(?:conditional[ \t]+pass|pass|fail)[ \t]*(?:\*\*)?[ \t]*$/im.test(output)
}

function detectVerdict(output: string): QAReport['verdict'] {
  for (const { re, verdict } of VERDICT_PATTERNS) {
    if (re.test(output)) return verdict
  }
  // Default to fail if we can't determine
  return 'fail'
}

export function parseDefects(output: string): Defect[] {
  const defects: Defect[] = []
  const lines = output.split('\n')
  const counters: Record<string, number> = {}
  let lastDefect: Defect | undefined

  for (const line of lines) {
    const scopeMatch = line.match(SCOPE_RE)
    if (scopeMatch && lastDefect) {
      lastDefect.scopeRelationship = scopeMatch[1].toLowerCase() as NonNullable<Defect['scopeRelationship']>
      continue
    }
    const releaseMatch = line.match(RELEASE_RE)
    if (releaseMatch && lastDefect) {
      lastDefect.releaseImpact = releaseMatch[1].toLowerCase() as NonNullable<Defect['releaseImpact']>
      continue
    }
    const confidenceMatch = line.match(CONFIDENCE_RE)
    if (confidenceMatch && lastDefect) {
      lastDefect.evidenceConfidence = confidenceMatch[1].toLowerCase() as NonNullable<Defect['evidenceConfidence']>
      continue
    }
    const investigationMatch = line.match(INVESTIGATION_RE)
    if (investigationMatch && lastDefect) {
      lastDefect.investigationQuestion = investigationMatch[1].trim()
      continue
    }
    const exitMatch = line.match(EXIT_RE)
    if (exitMatch && lastDefect) {
      lastDefect.exitCriterion = exitMatch[1].trim()
      continue
    }

    const m = line.match(DEFECT_LINE_RE)
    if (!m) continue

    const severityRaw = m[1].toLowerCase() as 'p0' | 'p1' | 'p2' | 'p3'
    const description = m[3].trim()

    // Skip "None" / "N/A" lines
    if (/^(none|n\/a|no defects?)/i.test(description)) continue

    counters[severityRaw] = (counters[severityRaw] ?? 0) + 1
    const seq = counters[severityRaw].toString().padStart(2, '0')
    const id = m[2] ? `${m[1].toUpperCase()}-${m[2]}` : `${m[1].toUpperCase()}-${seq}`

    lastDefect = { id, severity: severityRaw, description, fixed: false }
    defects.push(lastDefect)
  }

  return defects
}

// Extract a markdown section by heading name
function extractSection(text: string, heading: string): string | null {
  const re = new RegExp(`#{1,3}\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i')
  const m = text.match(re)
  return m ? m[1].trim() : null
}

function extractFirstParagraph(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  // Skip heading lines
  const para = lines.find(l => !l.startsWith('#') && l.length > 20)
  return para ?? ''
}
