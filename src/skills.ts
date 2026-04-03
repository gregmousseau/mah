/**
 * MAH Skill System
 * Load, validate, list, import, and resolve skills for agent prompts.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { resolve, join, basename, extname, dirname } from 'node:path'
import yaml from 'js-yaml'
import type { Skill, SkillSource, SkillType } from './types.js'

// ─── Constants ───

const SKILL_DIRS = ['skills', 'global-skills', 'imported'] as const
const VALID_TYPES: SkillType[] = ['capability', 'behavioral', 'workflow']
const MANIFEST_FILE = 'source-manifest.json'

// ─── Load Skills ───

export function loadSkills(mahRoot: string): Map<string, Skill> {
  const skills = new Map<string, Skill>()

  for (const dir of SKILL_DIRS) {
    const fullDir = resolve(mahRoot, '.mah', dir)
    if (!existsSync(fullDir)) continue

    const files = readdirSync(fullDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    for (const file of files) {
      try {
        const skill = loadSkillFile(join(fullDir, file))
        if (skill) {
          skills.set(skill.name, skill)
        }
      } catch (err) {
        console.error(`Warning: failed to load skill ${file}: ${(err as Error).message}`)
      }
    }
  }

  return skills
}

export function loadSkillFile(path: string): Skill | null {
  const raw = readFileSync(path, 'utf-8')
  const parsed = yaml.load(raw) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object') return null
  return validateSkill(parsed)
}

// ─── Validate ───

function validateSkill(raw: Record<string, unknown>): Skill {
  const name = raw.name as string
  if (!name || typeof name !== 'string') {
    throw new Error('Skill must have a "name" field')
  }

  const type = (raw.type as SkillType) ?? 'capability'
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Skill type must be one of: ${VALID_TYPES.join(', ')}. Got: ${type}`)
  }

  const description = (raw.description as string) ?? ''
  const agentTypes = (raw.agent_types as string[]) ?? (raw.agentTypes as string[]) ?? []

  const skill: Skill = {
    name,
    type,
    description,
    agentTypes,
  }

  if (raw.context_files || raw.contextFiles) {
    skill.contextFiles = (raw.context_files as string[]) ?? (raw.contextFiles as string[])
  }
  if (raw.gotchas) skill.gotchas = raw.gotchas as string[]
  if (raw.constraints) skill.constraints = raw.constraints as string[]
  if (raw.persona) skill.persona = raw.persona as string
  if (raw.steps) skill.steps = raw.steps as Skill['steps']
  if (raw.tags) skill.tags = raw.tags as string[]
  if (raw.source) skill.source = raw.source as SkillSource

  return skill
}

// ─── List ───

export function listSkills(mahRoot: string): { name: string; type: SkillType; description: string; tags: string[]; dir: string }[] {
  const skills = loadSkills(mahRoot)
  const result: { name: string; type: SkillType; description: string; tags: string[]; dir: string }[] = []

  for (const [, skill] of skills) {
    result.push({
      name: skill.name,
      type: skill.type,
      description: skill.description,
      tags: skill.tags ?? [],
      dir: resolveSkillDir(mahRoot, skill.name),
    })
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}

function resolveSkillDir(mahRoot: string, skillName: string): string {
  for (const dir of SKILL_DIRS) {
    const fullDir = resolve(mahRoot, '.mah', dir)
    if (!existsSync(fullDir)) continue
    const files = readdirSync(fullDir)
    if (files.some(f => f.startsWith(skillName))) return dir
  }
  return 'skills'
}

// ─── Resolve Skills for Prompt Injection ───

export interface ResolvedSkill {
  name: string
  type: SkillType
  promptBlock: string   // ready to inject into agent prompt
}

export function resolveSkillsForPrompt(
  skillNames: string[],
  allSkills: Map<string, Skill>,
  mahRoot: string
): ResolvedSkill[] {
  const resolved: ResolvedSkill[] = []

  for (const name of skillNames) {
    const skill = allSkills.get(name)
    if (!skill) {
      console.error(`Warning: skill "${name}" not found, skipping`)
      continue
    }

    const blocks: string[] = []
    blocks.push(`## Skill: ${skill.name} (${skill.type})`)
    blocks.push(skill.description)

    // Persona (behavioral skills)
    if (skill.persona) {
      blocks.push(`\n### Persona\n${skill.persona}`)
    }

    // Context files
    if (skill.contextFiles && skill.contextFiles.length > 0) {
      for (const cf of skill.contextFiles) {
        const fullPath = resolve(mahRoot, '.mah', 'skills', cf)
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, 'utf-8')
          blocks.push(`\n### Reference: ${cf}\n${content}`)
        }
      }
    }

    // Gotchas
    if (skill.gotchas && skill.gotchas.length > 0) {
      blocks.push(`\n### Gotchas (read carefully)\n${skill.gotchas.map(g => `- ${g}`).join('\n')}`)
    }

    // Constraints
    if (skill.constraints && skill.constraints.length > 0) {
      blocks.push(`\n### Constraints\n${skill.constraints.map(c => `- ${c}`).join('\n')}`)
    }

    // Workflow steps (workflow skills)
    if (skill.steps && skill.steps.length > 0) {
      const stepLines = skill.steps.map((s, i) =>
        `${i + 1}. [${s.agent}] ${s.action}${s.input ? ` (input: ${s.input})` : ''}${s.output ? ` → ${s.output}` : ''}`
      )
      blocks.push(`\n### Workflow Steps\n${stepLines.join('\n')}`)
    }

    resolved.push({
      name: skill.name,
      type: skill.type,
      promptBlock: blocks.join('\n'),
    })
  }

  return resolved
}

// ─── Import ───

export interface ImportResult {
  skill: Skill
  savedTo: string
}

export function importSkill(source: string, mahRoot: string): ImportResult {
  const importDir = resolve(mahRoot, '.mah', 'imported')
  mkdirSync(importDir, { recursive: true })

  let content: string
  let sourceType: SkillSource['type']
  let sourceUri: string = source

  // Detect source type
  if (source.startsWith('http://') || source.startsWith('https://')) {
    // URL import is handled by the CLI (needs fetch), we just handle the content
    throw new Error('URL import must be handled via CLI with --content flag. Use: mah skill import <url>')
  } else if (existsSync(source)) {
    content = readFileSync(source, 'utf-8')
    const ext = extname(source).toLowerCase()

    if (source.includes('CLAUDE.md') || source.includes('.claude/')) {
      sourceType = 'claude-code'
    } else if (source.includes('SKILL.md') || source.includes('skills/')) {
      sourceType = 'openclaw'
    } else if (ext === '.yaml' || ext === '.yml') {
      sourceType = 'local'
    } else {
      sourceType = 'local'
    }
  } else {
    throw new Error(`Source not found: ${source}`)
  }

  let skill: Skill

  const ext = extname(source).toLowerCase()
  if (ext === '.yaml' || ext === '.yml') {
    // Already a MAH skill YAML
    const parsed = yaml.load(content) as Record<string, unknown>
    skill = validateSkill(parsed)
  } else {
    // Convert from other format (markdown)
    skill = convertMarkdownToSkill(content, basename(source, extname(source)), source)
  }

  skill.source = {
    type: sourceType,
    uri: sourceUri,
    importedAt: new Date().toISOString(),
  }

  // Save
  const filename = `${skill.name}.yaml`
  const savePath = join(importDir, filename)
  writeFileSync(savePath, yaml.dump(skill, { lineWidth: 120, noRefs: true }))

  // Update manifest
  updateManifest(importDir, skill.name, skill.source)

  return { skill, savedTo: savePath }
}

function convertMarkdownToSkill(markdown: string, fallbackName: string, sourcePath?: string): Skill {
  // Extract meaningful content from markdown and build a skill
  const lines = markdown.split('\n')

  // Try to derive name from source path (e.g., ~/skills/humanizer/SKILL.md → humanizer)
  let name = fallbackName
  if (sourcePath) {
    const parts = sourcePath.split('/')
    const skillIdx = parts.findIndex(p => p === 'SKILL.md' || p === 'CLAUDE.md')
    if (skillIdx > 0) {
      name = parts[skillIdx - 1] // parent directory name
    }
  }
  name = name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  // Try to find a title
  const titleLine = lines.find(l => l.startsWith('# '))
  const description = titleLine ? titleLine.replace(/^#\s+/, '') : `Imported from ${fallbackName}`

  // Extract gotchas/constraints from bullet points
  const gotchas: string[] = []
  const constraints: string[] = []

  let inSection = ''
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.includes('gotcha') || lower.includes('warning') || lower.includes('avoid') || lower.includes("don't")) {
      inSection = 'gotchas'
    } else if (lower.includes('constraint') || lower.includes('rule') || lower.includes('must')) {
      inSection = 'constraints'
    }

    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const text = line.trim().replace(/^[-*]\s+/, '')
      if (inSection === 'gotchas') gotchas.push(text)
      else if (inSection === 'constraints') constraints.push(text)
    }
  }

  return {
    name,
    type: 'capability',
    description,
    agentTypes: ['generator'],
    gotchas: gotchas.length > 0 ? gotchas : undefined,
    constraints: constraints.length > 0 ? constraints : undefined,
    tags: ['imported'],
  }
}

// ─── Manifest ───

interface SourceManifest {
  [skillName: string]: SkillSource
}

function updateManifest(importDir: string, skillName: string, source: SkillSource): void {
  const manifestPath = join(importDir, MANIFEST_FILE)
  let manifest: SourceManifest = {}

  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch { /* start fresh */ }
  }

  manifest[skillName] = source
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}

// ─── Create from paste ───

export function createSkillFromContent(
  name: string,
  type: SkillType,
  description: string,
  content: string,
  mahRoot: string
): string {
  const skillDir = resolve(mahRoot, '.mah', 'skills')
  mkdirSync(skillDir, { recursive: true })

  const skill: Skill = {
    name,
    type,
    description,
    agentTypes: ['generator'],
    source: {
      type: 'paste',
      importedAt: new Date().toISOString(),
    },
  }

  // Parse the content for gotchas and constraints
  const lines = content.split('\n')
  const gotchas: string[] = []
  const constraints: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const text = trimmed.replace(/^[-*]\s+/, '')
      if (text.toLowerCase().includes("don't") || text.toLowerCase().includes('avoid') || text.toLowerCase().includes('never')) {
        gotchas.push(text)
      } else {
        constraints.push(text)
      }
    }
  }

  if (gotchas.length > 0) skill.gotchas = gotchas
  if (constraints.length > 0) skill.constraints = constraints

  const savePath = join(skillDir, `${name}.yaml`)
  writeFileSync(savePath, yaml.dump(skill, { lineWidth: 120, noRefs: true }))
  return savePath
}
