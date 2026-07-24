// AWC-249: Sanitization helpers for registrar packets.
//
// The registrar must never emit credentials, PHI, raw Jane responses,
// Gmail bodies, cookies, or tokens. These helpers scrub free-text
// evidence before it lands in a packet.

const REDACTION_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'aws-key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'bearer-token', pattern: /Bearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi },
  { name: 'basic-auth', pattern: /Basic\s+[A-Za-z0-9+/]{16,}=*/gi },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'openai-key', pattern: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'linear-key', pattern: /lin_(api|oauth)_[A-Za-z0-9_-]{16,}/gi },
  { name: 'cookie-header', pattern: /(cookie|set-cookie)\s*[:=]\s*[^\n]+/gi },
  { name: 'authorization-header', pattern: /authorization\s*[:=]\s*[^\n]+/gi },
  {
    name: 'credential',
    pattern: /\b(password|passwd|pwd|secret|client[-_ ]?secret|api[-_ ]?key|access[-_ ]?key|private[-_ ]?key|token)\b["']?\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,;&}\n]+)/gi,
  },
  {
    name: 'sensitive-query',
    pattern: /([?&](?:password|passwd|pwd|secret|api_key|apikey|access_token|token)=)[^&#\s]+/gi,
  },
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'phone', pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { name: 'credit-card', pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  { name: 'calendar-date', pattern: /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g },
  {
    name: 'street-address',
    pattern: /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,5}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b(?:[.,]?\s*(?:Apt|Unit|Suite|#)\s*\w+)?/gi,
  },
  {
    name: 'patient-name',
    pattern: /\b(?:[Pp]atient(?:[-_ ]?[Nn]ame)?|[Mm]ember[-_ ]?[Nn]ame|[Ff]ull[-_ ]?[Nn]ame)\s*(?:is\s+)?[:=]?\s*[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,3}/g,
  },
  // Health identifiers we do not carry across registrar boundaries.
  {
    name: 'phi-dob',
    pattern: /\b(dob|date[-_ ]of[-_ ]birth)\b["']?\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,}\n]+)/gi,
  },
  {
    name: 'phi-mrn',
    pattern: /\b(mrn|patient[-_ ]id)\b["']?\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,}\n]+)/gi,
  },
  // Explicit markers used in fixtures to prove nothing raw leaks through.
  { name: 'jane-raw', pattern: /<jane-raw>[\s\S]*?<\/jane-raw>/gi },
  { name: 'gmail-body', pattern: /<gmail-body>[\s\S]*?<\/gmail-body>/gi },
  // Conservative fallback for unlabelled first/last names. Over-redaction
  // is preferable to persisting a plausible patient identity.
  { name: 'person-name', pattern: /\b[A-Z][a-z'’-]{1,30}\s+[A-Z][a-z'’-]{1,30}\b/g },
]

const MAX_EVIDENCE_LEN = 800

export function sanitizeEvidence(raw: string): string {
  if (!raw) return ''
  let out = raw
  for (const { name, pattern } of REDACTION_PATTERNS) {
    out = out.replace(pattern, `[REDACTED:${name}]`)
  }
  out = out.replace(/\r?\n{3,}/g, '\n\n').trim()
  if (out.length > MAX_EVIDENCE_LEN) {
    out = `${out.slice(0, MAX_EVIDENCE_LEN)}…[truncated]`
  }
  return out
}

export function sanitizeShortField(raw: string, max = 240): string {
  const sanitized = sanitizeEvidence(raw)
  return sanitized.length > max ? `${sanitized.slice(0, max)}…` : sanitized
}

export function sanitizeIdentifier(raw: string, fallback = 'unknown'): string {
  const sanitized = sanitizeShortField(raw, 120)
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
  return sanitized || fallback
}

export function sanitizeForPersistence<T>(value: T): T {
  if (typeof value === 'string') return sanitizeEvidence(value) as T
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForPersistence(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, sanitizeForPersistence(item)]),
    ) as T
  }
  return value
}
