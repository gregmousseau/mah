/**
 * MAH Artifacts — Extract, save, load, and inject sprint output artifacts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { SprintArtifact, SprintInput } from './types.js'

// ─── Extract artifacts from dev completion report ───

export function extractArtifacts(devOutput: string, sprintId: string): SprintArtifact[] {
  const artifacts: SprintArtifact[] = []

  // Look for "Files Changed" or "What Was Done" sections
  const filePatterns = [
    // Markdown list items with file paths
    /[-*]\s+`([^`]+)`\s*[:\u2014\u2013]\s*(.+)/g,
    // "path/to/file: description" format
    /[-*]\s+([\w/.]+\.\w+)\s*[:\u2014\u2013]\s*(.+)/g,
    // Backtick-wrapped paths on their own
    /[-*]\s+`([^`]+\.\w+)`\s*$/gm,
  ]

  const seen = new Set<string>()

  for (const pattern of filePatterns) {
    let match
    while ((match = pattern.exec(devOutput)) !== null) {
      const path = match[1].trim()
      if (seen.has(path)) continue
      seen.add(path)

      const description = match[2]?.trim() ?? `Modified file: ${path}`
      const ext = path.split('.').pop()?.toLowerCase() ?? ''

      // Determine type
      let type: SprintArtifact['type'] = 'file'
      if (['md', 'txt', 'json'].includes(ext)) type = 'file'

      artifacts.push({
        id: `${sprintId}-${path.replace(/[/\\]/g, '-').replace(/\./g, '-')}`,
        type,
        path,
        description,
      })
    }
  }

  // Also extract any summary sections as summary artifacts
  const summaryMatch = devOutput.match(/## (?:What Was Done|Summary)\n([\s\S]*?)(?=\n## |\n---|\Z)/i)
  if (summaryMatch) {
    artifacts.push({
      id: `${sprintId}-summary`,
      type: 'summary',
      content: summaryMatch[1].trim(),
      description: 'Sprint completion summary',
    })
  }

  return artifacts
}

// ─── Save/Load artifacts ───

export function saveArtifacts(artifacts: SprintArtifact[], sprintDir: string): void {
  mkdirSync(sprintDir, { recursive: true })
  const path = join(sprintDir, 'artifacts.json')
  writeFileSync(path, JSON.stringify(artifacts, null, 2) + '\n')
}

export function loadArtifacts(sprintDir: string): SprintArtifact[] {
  const path = join(sprintDir, 'artifacts.json')
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return []
  }
}

// ─── Resolve sprint inputs (artifact injection) ───

export function resolveInputs(
  inputs: SprintInput[],
  sprintsBaseDir: string,
): SprintInput[] {
  return inputs.map(input => {
    const [sprintRef, artifactId] = input.from.split('.')
    if (!sprintRef || !artifactId) {
      return { ...input, resolved: `[unresolved: invalid reference "${input.from}"]` }
    }

    // Find the sprint directory
    const sprintDir = findSprintDir(sprintsBaseDir, sprintRef)
    if (!sprintDir) {
      return { ...input, resolved: `[unresolved: sprint "${sprintRef}" not found]` }
    }

    // Load artifacts
    const artifacts = loadArtifacts(sprintDir)
    const artifact = artifacts.find(a => a.id.endsWith(artifactId) || a.id === artifactId)

    if (!artifact) {
      return { ...input, resolved: `[unresolved: artifact "${artifactId}" not found in ${sprintRef}]` }
    }

    // Resolve based on type
    if (artifact.content) {
      return { ...input, resolved: artifact.content }
    } else if (artifact.path) {
      if (input.injectAs === 'reference') {
        return { ...input, resolved: `File: ${artifact.path} — ${artifact.description}` }
      }
      // For context injection, try to read the file
      const fullPath = resolve(sprintDir, '..', '..', artifact.path)
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, 'utf-8')
          return { ...input, resolved: `// ${artifact.path}\n${content}` }
        } catch {
          return { ...input, resolved: `File: ${artifact.path} — ${artifact.description}` }
        }
      }
      return { ...input, resolved: `File: ${artifact.path} — ${artifact.description}` }
    }

    return { ...input, resolved: `[unresolved: artifact "${artifactId}" has no content or path]` }
  })
}

// ─── Build input context for agent prompt ───

export function buildInputContext(resolvedInputs: SprintInput[]): string {
  if (resolvedInputs.length === 0) return ''

  const blocks = resolvedInputs
    .filter(i => i.resolved)
    .map(i => {
      const label = i.from.split('.').pop() ?? i.from
      return `## Input: ${label} (from ${i.from})\n${i.resolved}`
    })

  if (blocks.length === 0) return ''

  return `\n# Upstream Sprint Artifacts\n\n${blocks.join('\n\n---\n\n')}\n\n---\n\n`
}

// ─── List artifacts for CLI ───

export function formatArtifactList(artifacts: SprintArtifact[]): string {
  if (artifacts.length === 0) return 'No artifacts found.'

  return artifacts.map(a => {
    const type = a.type === 'file' ? '📄' : a.type === 'snippet' ? '📋' : '📝'
    const path = a.path ? ` (${a.path})` : ''
    return `${type} ${a.id}${path}\n   ${a.description}`
  }).join('\n\n')
}

// ─── Helpers ───

function findSprintDir(baseDir: string, sprintRef: string): string | null {
  // sprintRef could be "sprint-001" or a full sprint ID
  if (!existsSync(baseDir)) return null

  const { readdirSync } = require('node:fs')
  const entries = readdirSync(baseDir, { withFileTypes: true })

  // Exact match
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.includes(sprintRef)) {
      return join(baseDir, entry.name)
    }
  }

  // Partial match (sprint-001 might match sprint-20260402-...)
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(sprintRef)) {
      return join(baseDir, entry.name)
    }
  }

  return null
}
