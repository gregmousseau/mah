/**
 * MAH Planner — Analyzes tasks and proposes agent+skill combos
 * Decides whether a task is 1 sprint or a chain of sprints
 */

import { readFileSync } from 'node:fs'
import type { Skill, AgentAssignment, SprintArtifact } from './types.js'
import type { NamedAgentConfig } from './config.js'

// ─── Types ───

export interface SprintProposal {
  sprints: ProposedSprint[]
  isChain: boolean
  reasoning: string
  totalCostEstimate: { min: number; max: number }
  totalTimeEstimate: { minMinutes: number; maxMinutes: number }
}

export interface ProposedSprint {
  name: string
  task: string
  agents: AgentAssignment[]
  humanCheckpoint: boolean
  qaTier: 'smoke' | 'targeted' | 'full'
  expectedOutputs?: { id: string; description: string }[]
  inputsFrom?: string[]  // names of upstream sprints
}

// ─── Planner ───

export function planSprint(
  task: string,
  availableSkills: Map<string, Skill>,
  namedAgents: Map<string, NamedAgentConfig>,
): SprintProposal {
  // Analyze the task to determine structure
  const analysis = analyzeTask(task)
  const skillList = Array.from(availableSkills.values())

  if (analysis.isMultiPhase) {
    return planChain(task, analysis, skillList, namedAgents)
  }

  return planSingleSprint(task, analysis, skillList, namedAgents)
}

// ─── Task Analysis ───

interface TaskAnalysis {
  isMultiPhase: boolean
  phases: string[]
  category: 'frontend' | 'backend' | 'fullstack' | 'content' | 'research' | 'mixed'
  complexity: 'low' | 'medium' | 'high'
  needsResearch: boolean
  needsContent: boolean
  needsCode: boolean
  needsPublish: boolean
  needsHumanReview: boolean
}

const CHAIN_INDICATORS = [
  /\b(?:then|and then|after that|next|finally)\b/i,
  /\b(?:research|investigate|analyze)\b.*\b(?:write|draft|create|build)\b/i,
  /\b(?:write|draft|create)\b.*\b(?:publish|deploy|post|push)\b/i,
  /\b(?:build|implement)\b.*\b(?:test|review|qa)\b.*\b(?:deploy|ship)\b/i,
]

const RESEARCH_INDICATORS = [
  /\b(?:research|investigate|analyze|study|explore|compare|find out)\b/i,
  /\b(?:competitive|landscape|market|industry)\b/i,
]

const CONTENT_INDICATORS = [
  /\b(?:write|draft|blog|article|post|essay|content|copy)\b/i,
  /\b(?:linkedin|twitter|x\.com|social)\b/i,
]

const FRONTEND_INDICATORS = [
  /\b(?:ui|ux|component|page|layout|form|button|modal|sidebar|dashboard|responsive|css|tailwind|react|next\.?js)\b/i,
]

const BACKEND_INDICATORS = [
  /\b(?:api|endpoint|database|migration|rls|auth|server|supabase|prisma|postgres|webhook|stripe|payment|cron|queue|worker)\b/i,
]

const PUBLISH_INDICATORS = [
  /\b(?:publish|deploy|post to|push to|ship|go live)\b/i,
]

function analyzeTask(task: string): TaskAnalysis {
  const lower = task.toLowerCase()

  const needsResearch = RESEARCH_INDICATORS.some(r => r.test(task))
  const needsContent = CONTENT_INDICATORS.some(r => r.test(task))
  const needsCode = FRONTEND_INDICATORS.some(r => r.test(task)) || BACKEND_INDICATORS.some(r => r.test(task))
  const needsPublish = PUBLISH_INDICATORS.some(r => r.test(task))
  const needsHumanReview = needsContent || needsPublish

  // Determine if multi-phase
  const hasChainIndicators = CHAIN_INDICATORS.some(r => r.test(task))
  const phaseCount = [needsResearch, needsContent, needsCode, needsPublish].filter(Boolean).length

  // Multi-phase if: explicit chain language OR 2+ distinct phases
  const isMultiPhase = hasChainIndicators || phaseCount >= 2

  // Determine phases
  const phases: string[] = []
  if (needsResearch) phases.push('research')
  if (needsContent) phases.push('content')
  if (needsCode) phases.push('code')
  if (needsPublish) phases.push('publish')
  if (phases.length === 0) phases.push('code') // default

  // Determine category
  let category: TaskAnalysis['category'] = 'mixed'
  if (phases.length === 1) {
    if (phases[0] === 'research') category = 'research'
    else if (phases[0] === 'content') category = 'content'
    else if (FRONTEND_INDICATORS.some(r => r.test(task)) && !BACKEND_INDICATORS.some(r => r.test(task))) category = 'frontend'
    else if (BACKEND_INDICATORS.some(r => r.test(task)) && !FRONTEND_INDICATORS.some(r => r.test(task))) category = 'backend'
    else category = 'fullstack'
  }

  // Determine complexity
  const wordCount = task.split(/\s+/).length
  let complexity: TaskAnalysis['complexity'] = 'low'
  if (wordCount > 50 || phaseCount >= 3) complexity = 'high'
  else if (wordCount > 20 || phaseCount >= 2) complexity = 'medium'

  return {
    isMultiPhase,
    phases,
    category,
    complexity,
    needsResearch,
    needsContent,
    needsCode,
    needsPublish,
    needsHumanReview,
  }
}

// ─── Single Sprint Planning ───

function planSingleSprint(
  task: string,
  analysis: TaskAnalysis,
  skills: Skill[],
  namedAgents: Map<string, NamedAgentConfig>,
): SprintProposal {
  const agent = selectAgent(analysis.category, namedAgents)
  const agentSkills = selectSkills(analysis, skills, agent.config.role)
  const qaTier = analysis.complexity === 'high' ? 'targeted' : 'smoke'

  const assignment: AgentAssignment = {
    agentId: agent.id,
    role: agent.config.role,
    skills: agentSkills.map(s => s.name),
    reasoning: `${agent.config.specialty ?? agent.config.role} agent best suited for ${analysis.category} task`,
  }

  return {
    sprints: [{
      name: task.slice(0, 60),
      task,
      agents: [assignment],
      humanCheckpoint: false,
      qaTier,
    }],
    isChain: false,
    reasoning: `Single sprint: ${analysis.category} task, ${analysis.complexity} complexity`,
    totalCostEstimate: costEstimate(qaTier, 1),
    totalTimeEstimate: timeEstimate(qaTier, 1),
  }
}

// ─── Chain Planning ───

function planChain(
  task: string,
  analysis: TaskAnalysis,
  skills: Skill[],
  namedAgents: Map<string, NamedAgentConfig>,
): SprintProposal {
  const sprints: ProposedSprint[] = []

  if (analysis.needsResearch) {
    const agent = selectAgent('research', namedAgents)
    const agentSkills = selectSkills(analysis, skills, 'researcher')
    sprints.push({
      name: `Research: ${task.slice(0, 40)}`,
      task: `Research and compile findings on: ${task}`,
      agents: [{
        agentId: agent.id,
        role: 'researcher',
        skills: agentSkills.map(s => s.name),
        reasoning: 'Research phase needs deep investigation',
      }],
      humanCheckpoint: false,
      qaTier: 'smoke',
      expectedOutputs: [{ id: 'research-findings', description: 'Structured research findings' }],
    })
  }

  if (analysis.needsContent) {
    const agent = selectAgent('content', namedAgents)
    const agentSkills = selectSkills(analysis, skills, 'generator')
    const contentSkills = agentSkills.filter(s =>
      s.tags?.some(t => ['content', 'writing', 'seo'].includes(t)) || s.name.includes('blog') || s.name.includes('writing')
    )
    sprints.push({
      name: `Draft: ${task.slice(0, 40)}`,
      task: `Draft content based on research findings for: ${task}`,
      agents: [{
        agentId: agent.id,
        role: 'generator',
        skills: contentSkills.map(s => s.name),
        reasoning: 'Content generation from research findings',
      }],
      humanCheckpoint: true, // content needs review before publishing
      qaTier: 'smoke',
      inputsFrom: analysis.needsResearch ? [sprints[sprints.length - 1]?.name ?? ''] : undefined,
      expectedOutputs: [{ id: 'content-draft', description: 'Draft content ready for review' }],
    })
  }

  if (analysis.needsCode && !analysis.needsContent) {
    // Code-only chain step (e.g., build and deploy)
    const isFrontend = FRONTEND_INDICATORS.some(r => r.test(task))
    const agent = selectAgent(isFrontend ? 'frontend' : 'backend', namedAgents)
    const agentSkills = selectSkills(analysis, skills, 'generator')
    sprints.push({
      name: `Build: ${task.slice(0, 40)}`,
      task,
      agents: [{
        agentId: agent.id,
        role: 'generator',
        skills: agentSkills.map(s => s.name),
        reasoning: `${agent.config.specialty ?? 'dev'} agent for implementation`,
      }],
      humanCheckpoint: false,
      qaTier: analysis.complexity === 'high' ? 'targeted' : 'smoke',
    })
  }

  if (analysis.needsPublish) {
    const isFrontend = FRONTEND_INDICATORS.some(r => r.test(task))
    const agent = selectAgent(isFrontend ? 'frontend' : 'fullstack', namedAgents)
    sprints.push({
      name: `Publish: ${task.slice(0, 40)}`,
      task: `Publish/deploy the content or code from previous step for: ${task}`,
      agents: [{
        agentId: agent.id,
        role: 'generator',
        skills: [],
        reasoning: 'Deployment/publishing step',
      }],
      humanCheckpoint: false,
      qaTier: 'smoke',
      inputsFrom: sprints.length > 0 ? [sprints[sprints.length - 1].name] : undefined,
    })
  }

  // If we ended up with only 1 sprint, don't call it a chain
  if (sprints.length <= 1) {
    return planSingleSprint(task, analysis, skills, namedAgents)
  }

  const totalSprints = sprints.length
  return {
    sprints,
    isChain: true,
    reasoning: `Chain of ${totalSprints} sprints: ${analysis.phases.join(' → ')}. ` +
      `${analysis.needsHumanReview ? 'Human review checkpoint after content draft.' : ''}`,
    totalCostEstimate: costEstimate('targeted', totalSprints),
    totalTimeEstimate: timeEstimate('targeted', totalSprints),
  }
}

// ─── Agent Selection ───

function selectAgent(
  category: string,
  namedAgents: Map<string, NamedAgentConfig>,
): { id: string; config: NamedAgentConfig } {
  // Try to match by specialty
  for (const [id, config] of namedAgents) {
    if (config.specialty === category) return { id, config }
  }

  // Fallback mappings
  const fallbackMap: Record<string, string> = {
    frontend: 'frontend-dev',
    backend: 'dev',
    fullstack: 'dev',
    content: 'content',
    research: 'research',
    mixed: 'dev',
  }

  const fallbackId = fallbackMap[category]
  if (fallbackId && namedAgents.has(fallbackId)) {
    return { id: fallbackId, config: namedAgents.get(fallbackId)! }
  }

  // Last resort: first generator agent
  for (const [id, config] of namedAgents) {
    if (config.role === 'generator') return { id, config }
  }

  // Absolute fallback
  return {
    id: 'dev',
    config: { role: 'generator', model: 'sonnet' },
  }
}

// ─── Skill Selection ───

function selectSkills(
  analysis: TaskAnalysis,
  allSkills: Skill[],
  agentRole: string,
): Skill[] {
  // Filter skills that match this agent role
  const eligible = allSkills.filter(s =>
    s.agentTypes.includes(agentRole) || s.agentTypes.includes('generator')
  )

  const selected: Skill[] = []

  // Match by category — only add relevant skills, not all code skills
  if (analysis.category === 'frontend' || (analysis.category === 'fullstack' && analysis.needsCode)) {
    selected.push(...eligible.filter(s => s.tags?.some(t => ['frontend', 'forms', 'css', 'react'].includes(t))))
  }
  if (analysis.category === 'backend' || (analysis.category === 'fullstack' && analysis.needsCode)) {
    selected.push(...eligible.filter(s => s.tags?.some(t => ['backend', 'database', 'security', 'api'].includes(t))))
  }
  if (analysis.needsContent) {
    selected.push(...eligible.filter(s => s.tags?.some(t => ['content', 'writing', 'seo'].includes(t))))
  }
  if (analysis.needsResearch) {
    selected.push(...eligible.filter(s => s.tags?.some(t => ['research', 'analysis'].includes(t))))
  }

  // Always include behavioral skills for evaluators
  if (agentRole === 'evaluator') {
    selected.push(...eligible.filter(s => s.type === 'behavioral'))
  }

  // Deduplicate
  const unique = new Map<string, Skill>()
  for (const s of selected) unique.set(s.name, s)

  return Array.from(unique.values())
}

// ─── Cost & Time Estimates ───

function costEstimate(tier: string, sprintCount: number): { min: number; max: number } {
  const perSprint: Record<string, { min: number; max: number }> = {
    smoke: { min: 0.15, max: 0.45 },
    targeted: { min: 0.60, max: 1.80 },
    full: { min: 2.20, max: 5.50 },
  }
  const base = perSprint[tier] ?? perSprint.targeted
  return {
    min: +(base.min * sprintCount).toFixed(2),
    max: +(base.max * sprintCount * 1.5).toFixed(2), // 1.5x for potential retries
  }
}

function timeEstimate(tier: string, sprintCount: number): { minMinutes: number; maxMinutes: number } {
  const perSprint: Record<string, { min: number; max: number }> = {
    smoke: { min: 5, max: 15 },
    targeted: { min: 15, max: 40 },
    full: { min: 30, max: 90 },
  }
  const base = perSprint[tier] ?? perSprint.targeted
  return {
    minMinutes: base.min * sprintCount,
    maxMinutes: base.max * sprintCount,
  }
}

// ─── Proposal Formatting ───

export function formatProposal(proposal: SprintProposal): string {
  const lines: string[] = []

  if (proposal.isChain) {
    lines.push(`Proposed Plan: ${proposal.sprints.length} chained sprints`)
  } else {
    lines.push(`Proposed Plan: single sprint`)
  }
  lines.push(`Reasoning: ${proposal.reasoning}`)
  lines.push(`Estimated cost: $${proposal.totalCostEstimate.min}–$${proposal.totalCostEstimate.max}`)
  lines.push(`Estimated time: ${proposal.totalTimeEstimate.minMinutes}–${proposal.totalTimeEstimate.maxMinutes} min`)
  lines.push('')

  for (let i = 0; i < proposal.sprints.length; i++) {
    const sprint = proposal.sprints[i]
    lines.push(`Sprint ${i + 1}: ${sprint.name}`)

    for (const agent of sprint.agents) {
      const skillStr = agent.skills.length > 0 ? agent.skills.join(', ') : '(none)'
      lines.push(`  Agent: ${agent.agentId} (${agent.role})`)
      lines.push(`  Skills: ${skillStr}`)
      lines.push(`  Reason: ${agent.reasoning}`)
    }

    lines.push(`  QA Tier: ${sprint.qaTier}`)
    if (sprint.humanCheckpoint) lines.push(`  ⏸ Human review checkpoint`)
    if (sprint.inputsFrom?.length) lines.push(`  Input from: ${sprint.inputsFrom.join(', ')}`)
    if (sprint.expectedOutputs?.length) {
      lines.push(`  Outputs: ${sprint.expectedOutputs.map(o => o.id).join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
