import type { SprintContract, GraderResult, GraderFinding } from '../types.js'

// ─── Prompt Builder ──────────────────────────────────────────────────────────

export function buildCodeReviewPrompt(
  contract: SprintContract,
  devOutput: string,
  round: number
): string {
  return `You are a senior software engineer performing a structured code review.

## Sprint: ${contract.name}

## Original Task
${contract.task}

## Repository
${contract.devBrief.repo}

## Developer's Completion Report (Round ${round})
${devOutput}

---

## Your Job

Read the files mentioned in the developer's report and review the actual code changes. Do not just review the description — inspect the code itself.

Review for:
1. **Bug risks and logic errors** — off-by-one, null dereferences, wrong assumptions
2. **Security vulnerabilities** — XSS, SQL/command injection, auth bypass, secrets in code
3. **Performance issues** — N+1 queries, unnecessary re-renders, large synchronous operations, missing memoization
4. **Code style and consistency** — naming, formatting, patterns inconsistent with the codebase
5. **Missing error handling** — unhandled promise rejections, missing try/catch, unchecked nulls
6. **Unnecessary complexity** — overengineered solutions, dead code, redundant abstractions
7. **Test coverage gaps** — critical paths with no tests, edge cases not covered

## Severity Guide
- **Critical** — will cause crashes, data loss, or security breaches in production
- **Major** — likely to cause bugs or failures under normal usage
- **Minor** — code quality issues, style problems, or minor inefficiencies
- **Info** — observations, suggestions, or positive notes

## Required Output Format

Respond ONLY with a code review report in this exact format:

## Code Review Report
**Verdict:** PASS / CONDITIONAL / FAIL

### Summary
[One paragraph describing the overall code quality and key findings]

### Critical
[List each critical finding as:]
- [CR-XX] file.ext:line — description (Category)
  Suggestion: how to fix it

[If none, write: - None]

### Major
[List each major finding as:]
- [CR-XX] file.ext:line — description (Category)
  Suggestion: how to fix it

[If none, write: - None]

### Minor
[List each minor finding as:]
- [CR-XX] file.ext:line — description (Category)
  Suggestion: how to fix it

[If none, write: - None]

### Info
[List observations or positive notes as:]
- [CR-XX] description

[If none, write: - None]

## Verdict Rules
- Any Critical finding → **FAIL**
- Any Major finding (no Critical) → **CONDITIONAL**
- Only Minor/Info findings → **PASS**
`
}

// ─── Result Parser ───────────────────────────────────────────────────────────

// Matches: - [CR-01] file.tsx:42 — description (Category)
const FINDING_LINE_RE = /^[-\s]*\[CR-(\d+)\]\s*([^—–\n]+?)(?:\s*[—–]\s*(.+?))?(?:\s*\(([^)]+)\))?\s*$/
// Matches: Suggestion: ...
const SUGGESTION_RE = /^\s+Suggestion:\s*(.+)$/

export function parseCodeReviewResult(
  output: string,
  graderId: string,
  graderName: string,
  model: string,
  durationMs: number,
  costEstimate: number
): GraderResult {
  const verdict = detectVerdict(output)
  const findings = parseFindings(output)
  const summary = extractSection(output, 'Summary') ?? extractFirstParagraph(output)

  return {
    graderId,
    graderType: 'code-review',
    graderName,
    verdict,
    findings,
    summary,
    model,
    durationMs,
    costEstimate,
  }
}

function detectVerdict(output: string): GraderResult['verdict'] {
  const verdictPatterns: Array<{ re: RegExp; verdict: GraderResult['verdict'] }> = [
    { re: /\*\*Verdict:\*\*\s*FAIL/i,        verdict: 'fail' },
    { re: /\*\*Verdict:\*\*\s*CONDITIONAL/i,  verdict: 'conditional' },
    { re: /\*\*Verdict:\*\*\s*PASS/i,         verdict: 'pass' },
    { re: /Verdict:\s*FAIL/i,                 verdict: 'fail' },
    { re: /Verdict:\s*CONDITIONAL/i,          verdict: 'conditional' },
    { re: /Verdict:\s*PASS/i,                 verdict: 'pass' },
  ]

  for (const { re, verdict } of verdictPatterns) {
    if (re.test(output)) return verdict
  }

  // Infer from findings if no explicit verdict
  if (/### Critical\n(?![-\s]*None)/i.test(output)) return 'fail'
  if (/### Major\n(?![-\s]*None)/i.test(output)) return 'conditional'
  return 'pass'
}

function parseFindings(output: string): GraderFinding[] {
  const findings: GraderFinding[] = []
  const lines = output.split('\n')

  let currentSeverity: GraderFinding['severity'] = 'info'
  let lastFinding: GraderFinding | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect severity section
    const sectionMatch = line.match(/^###\s+(Critical|Major|Minor|Info)/i)
    if (sectionMatch) {
      currentSeverity = sectionMatch[1].toLowerCase() as GraderFinding['severity']
      lastFinding = null
      continue
    }

    // Skip "None" lines
    if (/^[-\s]*None\s*$/i.test(line)) {
      lastFinding = null
      continue
    }

    // Try to match a suggestion line
    const suggestionMatch = line.match(SUGGESTION_RE)
    if (suggestionMatch && lastFinding) {
      lastFinding.suggestion = suggestionMatch[1].trim()
      continue
    }

    // Try to match a finding line: - [CR-XX] file:line — description (Category)
    const m = line.match(FINDING_LINE_RE)
    if (!m) continue

    const seqNum = m[1]
    const fileOrDesc = m[2]?.trim() ?? ''
    const descPart = m[3]?.trim() ?? ''
    const category = m[4]?.trim() ?? 'general'

    // Parse file:line from fileOrDesc
    let file: string | undefined
    let lineNum: number | undefined
    let description: string

    const fileLineMatch = fileOrDesc.match(/^(.+?):(\d+)$/)
    if (fileLineMatch && descPart) {
      file = fileLineMatch[1].trim()
      lineNum = parseInt(fileLineMatch[2], 10)
      description = descPart
    } else if (descPart) {
      // fileOrDesc is a file without line, descPart is description
      file = fileOrDesc || undefined
      description = descPart
    } else {
      // No separator — fileOrDesc is the description
      description = fileOrDesc
    }

    const finding: GraderFinding = {
      id: `CR-${seqNum.padStart(2, '0')}`,
      severity: currentSeverity,
      category: normalizeCategory(category),
      file,
      line: lineNum,
      description,
    }

    findings.push(finding)
    lastFinding = finding
  }

  return findings
}

function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('security') || lower.includes('xss') || lower.includes('injection')) return 'security'
  if (lower.includes('performance') || lower.includes('n+1') || lower.includes('render')) return 'performance'
  if (lower.includes('bug') || lower.includes('logic') || lower.includes('error')) return 'bug-risk'
  if (lower.includes('style') || lower.includes('naming') || lower.includes('format')) return 'style'
  if (lower.includes('complex') || lower.includes('dead code') || lower.includes('redundant')) return 'complexity'
  if (lower.includes('test') || lower.includes('coverage')) return 'test-coverage'
  if (lower.includes('type') || lower.includes('typescript')) return 'types'
  return raw.toLowerCase() || 'general'
}

function extractSection(text: string, heading: string): string | null {
  const re = new RegExp(`#{1,3}\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i')
  const m = text.match(re)
  return m ? m[1].trim() : null
}

function extractFirstParagraph(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const para = lines.find(l => !l.startsWith('#') && !l.startsWith('**Verdict') && l.length > 20)
  return para ?? ''
}
