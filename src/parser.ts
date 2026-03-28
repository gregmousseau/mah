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

export function parseQAReport(output: string): QAReport {
  const verdict = detectVerdict(output)
  const defects = parseDefects(output)
  const summary = extractSection(output, 'Summary') ?? extractFirstParagraph(output)
  const recommendation = extractSection(output, 'Recommendation') ?? ''

  return { verdict, defects, summary, recommendation }
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

  for (const line of lines) {
    const m = line.match(DEFECT_LINE_RE)
    if (!m) continue

    const severityRaw = m[1].toLowerCase() as 'p0' | 'p1' | 'p2' | 'p3'
    const description = m[3].trim()

    // Skip "None" / "N/A" lines
    if (/^(none|n\/a|no defects?)/i.test(description)) continue

    counters[severityRaw] = (counters[severityRaw] ?? 0) + 1
    const seq = counters[severityRaw].toString().padStart(2, '0')
    const id = m[2] ? `${m[1].toUpperCase()}-${m[2]}` : `${m[1].toUpperCase()}-${seq}`

    defects.push({ id, severity: severityRaw, description, fixed: false })
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
