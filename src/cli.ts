#!/usr/bin/env node

import { Command } from 'commander'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import yaml from 'js-yaml'
import chalk from 'chalk'
import { loadConfig, loadNamedAgents } from './config.js'
import { loadSkills, listSkills, importSkill, createSkillFromContent, resolveSkillsForPrompt } from './skills.js'
import { planSprint, formatProposal } from './planner.js'
import { loadArtifacts, formatArtifactList } from './artifacts.js'
import { runChain, formatChainResult } from './chain.js'
import type { SprintContract, SprintMetrics, BuildEvent, SkillType } from './types.js'

const program = new Command()

program
  .name('mah')
  .description('Multi-Agent Harness - orchestrate dev/QA agent sprints')
  .version('0.1.0')

// ─── mah init ───

program
  .command('init')
  .description('Initialize a new MAH project (creates mah.yaml and .mah/ directory)')
  .action(async () => {
    if (existsSync('mah.yaml') || existsSync('mah.yml')) {
      console.log(chalk.yellow('mah.yaml already exists in this directory.'))
      return
    }

    const rl = createInterface({ input: stdin, output: stdout })

    try {
      const name = (await rl.question(chalk.cyan('Project name: '))) || 'My Project'
      const repo = (await rl.question(chalk.cyan('Repo path [.]: '))) || '.'

      console.log()
      console.log(chalk.dim('Priority ordering (1 = highest, each value must be unique 1/2/3):'))
      const speedStr = (await rl.question(chalk.cyan('  Speed priority [1]: '))) || '1'
      const qualityStr = (await rl.question(chalk.cyan('  Quality priority [2]: '))) || '2'
      const costStr = (await rl.question(chalk.cyan('  Cost priority [3]: '))) || '3'

      const speed = parseInt(speedStr, 10)
      const quality = parseInt(qualityStr, 10)
      const cost = parseInt(costStr, 10)

      const config = {
        project: { name, repo },
        priorities: { speed, quality, cost },
        agents: {
          generator: { type: 'openclaw', model: 'sonnet', cwd: repo },
          evaluator: { type: 'openclaw', model: 'sonnet' },
        },
        qa: { defaultTier: 'targeted', maxIterations: 3 },
        human: {
          notificationChannel: '',
          responseTimeoutMinutes: 30,
          onTimeout: 'proceed',
          costThreshold: 40,
        },
        metrics: { output: '.mah/metrics/' },
        sprints: { directory: '.mah/sprints/' },
      }

      writeFileSync('mah.yaml', yaml.dump(config, { lineWidth: 120, noRefs: true }))
      console.log(chalk.green('\n✓ Created mah.yaml'))

      // Create directory structure
      const dirs = ['.mah', '.mah/sprints', '.mah/metrics', '.mah/events']
      for (const dir of dirs) {
        mkdirSync(dir, { recursive: true })
      }
      console.log(chalk.green('✓ Created .mah/ directory structure'))
      console.log(chalk.dim('\nRun `mah status` to verify your config.'))
    } finally {
      rl.close()
    }
  })

// ─── mah status ───

program
  .command('status')
  .description('Show project config and sprint history summary')
  .action(() => {
    try {
      const config = loadConfig()

      console.log(chalk.bold.white(`\n  ${config.project.name}`))
      console.log(chalk.dim(`  ${config.project.repo}\n`))

      // Priority display
      const priorityLabels: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
      console.log(chalk.bold('  Priorities'))
      console.log(`    Speed:   ${priorityLabels[config.priorities.speed]} (${config.priorities.speed})`)
      console.log(`    Quality: ${priorityLabels[config.priorities.quality]} (${config.priorities.quality})`)
      console.log(`    Cost:    ${priorityLabels[config.priorities.cost]} (${config.priorities.cost})`)

      // Agents
      console.log(chalk.bold('\n  Agents'))
      console.log(`    Generator: ${config.agents.generator.type} / ${config.agents.generator.model}`)
      console.log(`    Evaluator: ${config.agents.evaluator.type} / ${config.agents.evaluator.model}`)

      // QA settings
      console.log(chalk.bold('\n  QA'))
      console.log(`    Default tier:    ${config.qa.defaultTier}`)
      console.log(`    Max iterations:  ${config.qa.maxIterations}`)

      // Sprint history
      const sprintDir = resolve(process.cwd(), config.sprints.directory)
      let sprintCount = 0
      let lastSprint: SprintContract | null = null

      if (existsSync(sprintDir)) {
        const entries = readdirSync(sprintDir, { withFileTypes: true })
        const sprintDirs = entries.filter(e => e.isDirectory())
        sprintCount = sprintDirs.length

        // Try to load the last sprint's contract
        if (sprintDirs.length > 0) {
          const lastDir = sprintDirs.sort((a, b) => a.name.localeCompare(b.name)).pop()!
          const contractPath = join(sprintDir, lastDir.name, 'contract.json')
          if (existsSync(contractPath)) {
            lastSprint = JSON.parse(readFileSync(contractPath, 'utf-8'))
          }
        }
      }

      console.log(chalk.bold('\n  Sprints'))
      console.log(`    Total: ${sprintCount}`)
      if (lastSprint) {
        const statusColor = lastSprint.status === 'passed' ? chalk.green : 
                           lastSprint.status === 'failed' ? chalk.red : chalk.yellow
        console.log(`    Last:  ${lastSprint.name} ${statusColor(`[${lastSprint.status.toUpperCase()}]`)}`)
      }

      // Cost totals from metrics
      const metricsDir = resolve(process.cwd(), config.metrics.output)
      let totalCost = 0
      if (existsSync(metricsDir)) {
        // Also check sprint dirs for metrics.json
        if (existsSync(sprintDir)) {
          const entries = readdirSync(sprintDir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const metricsPath = join(sprintDir, entry.name, 'metrics.json')
              if (existsSync(metricsPath)) {
                try {
                  const metrics: SprintMetrics = JSON.parse(readFileSync(metricsPath, 'utf-8'))
                  totalCost += metrics.totals.estimatedCost
                } catch { /* skip malformed */ }
              }
            }
          }
        }
      }

      if (totalCost > 0) {
        console.log(chalk.bold('\n  Cost'))
        console.log(`    Total estimated: $${totalCost.toFixed(2)}`)
      }

      console.log()
    } catch (err) {
      console.error(chalk.red((err as Error).message))
      process.exit(1)
    }
  })

// ─── mah run ───

program
  .command('run')
  .description('Run a sprint pipeline for a task')
  .argument('<task>', 'Task description for the sprint')
  .option('--dry-run', 'Generate and print the sprint contract without executing agents')
  .action(async (task: string, opts: { dryRun?: boolean }) => {
    const { runSprint, printSprintSummary } = await import('./pipeline.js')
    const { EventLogger } = await import('./events.js')
    const { resolve } = await import('node:path')

    try {
      const config = loadConfig()
      const eventsDir = resolve(process.cwd(), '.mah/events')
      const events = new EventLogger(eventsDir)

      console.log()
      if (opts.dryRun) {
        console.log(chalk.bold.cyan('  MAH — Dry Run'))
      } else {
        console.log(chalk.bold.cyan('  MAH — Sprint Starting'))
      }
      console.log(chalk.dim(`  Task: "${task}"\n`))

      const { contract, metrics } = await runSprint(task, config, events, {
        dryRun: opts.dryRun,
      })

      if (!opts.dryRun) {
        printSprintSummary(contract, metrics)
      }
    } catch (err) {
      console.error(chalk.red(`\nError: ${(err as Error).message}`))
      process.exit(1)
    }
  })

// ─── mah events ───

program
  .command('events')
  .description('Show recent events from the JSONL event stream')
  .option('-n, --limit <count>', 'Number of events to show', '20')
  .action((opts: { limit: string }) => {
    const limit = parseInt(opts.limit, 10)
    const eventsDir = resolve(process.cwd(), '.mah/events')

    if (!existsSync(eventsDir)) {
      console.log(chalk.dim('No events directory found. Run a sprint first.'))
      return
    }

    // Find JSONL files
    const files = readdirSync(eventsDir)
      .filter(f => f.endsWith('.jsonl'))
      .sort()

    if (files.length === 0) {
      console.log(chalk.dim('No event files found.'))
      return
    }

    // Read latest file
    const latestFile = files[files.length - 1]
    const content = readFileSync(join(eventsDir, latestFile), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const events: BuildEvent[] = lines.slice(-limit).map(l => JSON.parse(l))

    const actorColors: Record<string, (s: string) => string> = {
      moe: chalk.blue,
      dev: chalk.green,
      quinn: chalk.magenta,
      human: chalk.yellow,
      system: chalk.dim,
    }

    console.log(chalk.bold(`\n  Events (${latestFile})\n`))
    for (const event of events) {
      const colorFn = actorColors[event.actor] ?? chalk.white
      const prefix = colorFn(`[${event.local}] ${event.actor.padEnd(6)}`)
      const phaseTag = chalk.dim(`(${event.phase})`)
      console.log(`  ${prefix} ${phaseTag} ${event.summary}`)
    }
    console.log()
  })

// ─── mah project ───

const projectCmd = program
  .command('project')
  .description('Manage projects')

projectCmd
  .command('list')
  .description('List all projects')
  .action(() => {
    const projectsDir = resolve(process.cwd(), '.mah', 'projects')
    if (!existsSync(projectsDir)) {
      console.log(chalk.dim('\n  No projects found.\n'))
      return
    }

    const files = readdirSync(projectsDir).filter(f => f.endsWith('.json'))
    if (files.length === 0) {
      console.log(chalk.dim('\n  No projects found.\n'))
      return
    }

    console.log(chalk.bold(`\n  Projects (${files.length})\n`))

    for (const file of files) {
      try {
        const project = JSON.parse(readFileSync(join(projectsDir, file), 'utf-8'))
        const skills = project.config?.skills ?? []
        const skillStr = skills.length > 0 ? chalk.dim(` [${skills.join(', ')}]`) : ''
        console.log(`  ${chalk.bold(project.name)} ${chalk.dim(`(${project.id})`)}`)
        console.log(`    ${chalk.dim('Repo:')} ${project.repo ?? '—'}${skillStr}`)
        if (project.description) {
          console.log(`    ${chalk.dim(project.description)}`)
        }
        console.log()
      } catch { /* skip */ }
    }
  })

projectCmd
  .command('create')
  .description('Create a new project')
  .action(async () => {
    const rl = createInterface({ input: stdin, output: stdout })

    try {
      const name = await rl.question(chalk.cyan('Project name: '))
      if (!name) { console.log(chalk.red('Name required.')); return }

      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const repo = (await rl.question(chalk.cyan('Repo path [.]: '))) || '.'
      const description = await rl.question(chalk.cyan('Description (optional): '))

      const project = {
        id,
        name,
        description: description || undefined,
        repo,
        createdAt: new Date().toISOString(),
        config: {
          priorities: { speed: 2, quality: 1, cost: 3 },
          defaultAgents: {
            generator: { type: 'openclaw', model: 'sonnet' },
            evaluator: { type: 'openclaw', model: 'sonnet' },
          },
          qa: { defaultTier: 'targeted', maxIterations: 3 },
          skills: [],
        },
      }

      const projectsDir = resolve(process.cwd(), '.mah', 'projects')
      mkdirSync(projectsDir, { recursive: true })
      const savePath = join(projectsDir, `${id}.json`)
      writeFileSync(savePath, JSON.stringify(project, null, 2) + '\n')

      console.log(chalk.green(`\n  ✓ Created project: ${name}`))
      console.log(chalk.dim(`    Saved to: ${savePath}\n`))
    } finally {
      rl.close()
    }
  })

// ─── mah dashboard ───

program
  .command('dashboard')
  .description('Start the MAH dashboard (Next.js dev server)')
  .option('-p, --port <port>', 'Port number', '3000')
  .action((opts: { port: string }) => {
    const { execSync } = require('node:child_process')
    const dashboardDir = resolve(process.cwd(), 'dashboard')

    if (!existsSync(dashboardDir)) {
      console.error(chalk.red(`Dashboard not found at ${dashboardDir}`))
      process.exit(1)
    }

    console.log(chalk.bold.cyan(`\n  MAH Dashboard starting on port ${opts.port}...\n`))
    try {
      execSync(`npx next dev --port ${opts.port}`, {
        cwd: dashboardDir,
        stdio: 'inherit',
      })
    } catch {
      // User killed with Ctrl+C
    }
  })

// ─── mah sprints ───

program
  .command('sprints')
  .description('List all sprints with status, cost, and duration')
  .option('-s, --status <status>', 'Filter by status (passed|failed|escalated)')
  .option('-n, --limit <count>', 'Show last N sprints', '20')
  .action((opts: { status?: string; limit: string }) => {
    try {
      const config = loadConfig()
      const sprintDir = resolve(process.cwd(), config.sprints.directory)

      if (!existsSync(sprintDir)) {
        console.log(chalk.dim('\n  No sprints found.\n'))
        return
      }

      const entries = readdirSync(sprintDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))

      let sprints: { dir: string; name: string; status: string; iterations: number; cost: number; duration: string; agent: string }[] = []

      for (const entry of entries) {
        const contractPath = join(sprintDir, entry.name, 'contract.json')
        if (!existsSync(contractPath)) continue

        try {
          const contract: SprintContract = JSON.parse(readFileSync(contractPath, 'utf-8'))
          const metricsPath = join(sprintDir, entry.name, 'metrics.json')
          let cost = 0
          let duration = ''
          if (existsSync(metricsPath)) {
            const metrics = JSON.parse(readFileSync(metricsPath, 'utf-8'))
            cost = metrics.totals?.estimatedCost ?? 0
            const ms = metrics.totals?.durationMs ?? 0
            duration = ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m`
          }

          if (opts.status && contract.status !== opts.status) continue

          sprints.push({
            dir: entry.name,
            name: contract.name ?? entry.name,
            status: contract.status ?? 'unknown',
            iterations: contract.iterations?.length ?? 0,
            cost,
            duration,
            agent: contract.agentConfig?.generator?.agentName ?? '',
          })
        } catch { /* skip */ }
      }

      // Apply limit
      const limit = parseInt(opts.limit, 10)
      if (sprints.length > limit) {
        sprints = sprints.slice(-limit)
      }

      if (sprints.length === 0) {
        console.log(chalk.dim('\n  No matching sprints found.\n'))
        return
      }

      const statusColor = (s: string) =>
        s === 'passed' ? chalk.green : s === 'failed' ? chalk.red : s === 'escalated' ? chalk.yellow : chalk.dim

      console.log(chalk.bold(`\n  Sprints (${sprints.length})\n`))

      for (const sprint of sprints) {
        const sc = statusColor(sprint.status)
        const costStr = sprint.cost > 0 ? chalk.dim(`$${sprint.cost.toFixed(2)}`) : ''
        const agentStr = sprint.agent ? chalk.dim(sprint.agent) : ''
        console.log(
          `  ${sc(sprint.status.toUpperCase().padEnd(10))} ` +
          `R${sprint.iterations} ` +
          `${sprint.duration.padStart(5)} ` +
          `${costStr.padStart(8)} ` +
          `${agentStr.padStart(8)} ` +
          `${sprint.name}`
        )
      }

      const totalCost = sprints.reduce((sum, s) => sum + s.cost, 0)
      const passRate = sprints.filter(s => s.status === 'passed').length / sprints.length * 100
      console.log(chalk.dim(`\n  Total: $${totalCost.toFixed(2)} · Pass rate: ${passRate.toFixed(0)}%\n`))
    } catch (err) {
      console.error(chalk.red((err as Error).message))
      process.exit(1)
    }
  })

// ─── mah chain ───

program
  .command('chain')
  .description('Plan and execute a chained multi-sprint pipeline')
  .argument('<task>', 'Task description (planner auto-detects chain structure)')
  .option('--auto', 'Auto-approve human checkpoints')
  .option('--dry-run', 'Show plan without executing')
  .action(async (task: string, opts: { auto?: boolean; dryRun?: boolean }) => {
    const mahRoot = process.cwd()
    const allSkills = loadSkills(mahRoot)
    const namedAgents = loadNamedAgents()

    // Plan the chain
    const proposal = planSprint(task, allSkills, namedAgents)
    const formatted = formatProposal(proposal)

    console.log()
    console.log(chalk.bold.cyan('  MAH — Chain Proposal'))
    console.log(chalk.dim(`  Task: "${task}"\n`))
    console.log(formatted.split('\n').map(l => `  ${l}`).join('\n'))

    if (!proposal.isChain) {
      console.log(chalk.dim('  (Single sprint detected — use `mah run` for single sprints)\n'))
      if (!opts.dryRun) {
        console.log(chalk.dim('  Running as single sprint...\n'))
        // Delegate to regular run
        const { runSprint, printSprintSummary } = await import('./pipeline.js')
        const { EventLogger } = await import('./events.js')
        const config = loadConfig()
        const eventsDir = resolve(process.cwd(), '.mah/events')
        const events = new EventLogger(eventsDir)
        const { contract, metrics } = await runSprint(task, config, events)
        printSprintSummary(contract, metrics)
      }
      return
    }

    if (opts.dryRun) {
      console.log(chalk.dim('  (Dry run — no execution)\n'))
      return
    }

    // Execute the chain
    const config = loadConfig()
    const { EventLogger } = await import('./events.js')
    const eventsDir = resolve(process.cwd(), '.mah/events')
    const events = new EventLogger(eventsDir)

    try {
      const result = await runChain(proposal, config, events, {
        autoApproveCheckpoints: opts.auto,
      })

      console.log()
      console.log(chalk.bold.white('  ─── Chain Complete ────────────────────────────────'))
      console.log(formatChainResult(result).split('\n').map(l => `  ${l}`).join('\n'))
      console.log()
    } catch (err) {
      console.error(chalk.red(`\nChain error: ${(err as Error).message}`))
      process.exit(1)
    }
  })

// ─── mah artifacts ───

program
  .command('artifacts')
  .description('List artifacts produced by a sprint')
  .argument('<sprint-id>', 'Sprint ID or partial match')
  .action((sprintId: string) => {
    try {
      const config = loadConfig()
      const sprintDir = resolve(process.cwd(), config.sprints.directory)

      // Find matching sprint directory
      if (!existsSync(sprintDir)) {
        console.log(chalk.dim('\n  No sprints directory found.\n'))
        return
      }

      const entries = readdirSync(sprintDir, { withFileTypes: true })
      const match = entries.find(e => e.isDirectory() && e.name.includes(sprintId))

      if (!match) {
        console.error(chalk.red(`\n  Sprint "${sprintId}" not found.\n`))
        process.exit(1)
      }

      const artifacts = loadArtifacts(join(sprintDir, match.name))
      console.log(chalk.bold(`\n  Artifacts: ${match.name}\n`))
      console.log(formatArtifactList(artifacts).split('\n').map(l => `  ${l}`).join('\n'))
      console.log()
    } catch (err) {
      console.error(chalk.red((err as Error).message))
      process.exit(1)
    }
  })

// ─── mah plan ───

program
  .command('plan')
  .description('Analyze a task and propose agent+skill assignments')
  .argument('<task>', 'Task description to plan')
  .action((task: string) => {
    const mahRoot = process.cwd()
    const allSkills = loadSkills(mahRoot)
    const namedAgents = loadNamedAgents()

    const proposal = planSprint(task, allSkills, namedAgents)
    const formatted = formatProposal(proposal)

    console.log()
    console.log(chalk.bold.cyan('  MAH — Sprint Proposal'))
    console.log(chalk.dim(`  Task: "${task}"\n`))
    console.log(formatted.split('\n').map(l => `  ${l}`).join('\n'))
  })

// ─── mah skill ───

const skillCmd = program
  .command('skill')
  .description('Manage agent skills')

skillCmd
  .command('list')
  .description('List all available skills')
  .option('-t, --type <type>', 'Filter by type (capability|behavioral|workflow)')
  .option('--tag <tag>', 'Filter by tag')
  .action((opts: { type?: string; tag?: string }) => {
    const mahRoot = process.cwd()
    const skills = listSkills(mahRoot)

    let filtered = skills
    if (opts.type) {
      filtered = filtered.filter(s => s.type === opts.type)
    }
    if (opts.tag) {
      filtered = filtered.filter(s => s.tags.includes(opts.tag!))
    }

    if (filtered.length === 0) {
      console.log(chalk.dim('\n  No skills found.\n'))
      return
    }

    const typeIcons: Record<string, string> = {
      capability: '🔧',
      behavioral: '🎭',
      workflow: '🔗',
    }

    console.log(chalk.bold('\n  Agent Skills\n'))
    for (const skill of filtered) {
      const icon = typeIcons[skill.type] ?? '📦'
      console.log(`  ${icon} ${chalk.bold(skill.name)} ${chalk.dim(`(${skill.type})`)}`)
      console.log(`     ${skill.description}`)
      if (skill.tags.length > 0) {
        console.log(`     ${chalk.dim(skill.tags.map(t => `#${t}`).join(' '))}`)
      }
      console.log()
    }
  })

skillCmd
  .command('show')
  .description('Show details of a specific skill')
  .argument('<name>', 'Skill name')
  .action((name: string) => {
    const mahRoot = process.cwd()
    const allSkills = loadSkills(mahRoot)
    const skill = allSkills.get(name)

    if (!skill) {
      console.error(chalk.red(`Skill "${name}" not found.`))
      process.exit(1)
    }

    const resolved = resolveSkillsForPrompt([name], allSkills, mahRoot)
    if (resolved.length === 0) {
      console.error(chalk.red(`Could not resolve skill "${name}".`))
      process.exit(1)
    }

    console.log(chalk.bold(`\n  Skill: ${skill.name}\n`))
    console.log(chalk.dim(`  Type: ${skill.type}`))
    console.log(chalk.dim(`  Agents: ${skill.agentTypes.join(', ')}`))
    if (skill.tags) console.log(chalk.dim(`  Tags: ${skill.tags.join(', ')}`))
    if (skill.source) {
      console.log(chalk.dim(`  Source: ${skill.source.type}${skill.source.uri ? ` (${skill.source.uri})` : ''}`))
    }

    console.log(chalk.bold('\n  Prompt block preview:\n'))
    console.log(chalk.dim('  ─'.repeat(30)))
    const lines = resolved[0].promptBlock.split('\n')
    for (const line of lines) {
      console.log(`  ${line}`)
    }
    console.log(chalk.dim('  ─'.repeat(30)))
    console.log()
  })

skillCmd
  .command('import')
  .description('Import a skill from a file (YAML, CLAUDE.md, SKILL.md, etc.)')
  .argument('<source>', 'Path to the skill source file')
  .action((source: string) => {
    const mahRoot = process.cwd()
    try {
      const result = importSkill(source, mahRoot)
      console.log(chalk.green(`\n  ✓ Imported skill: ${result.skill.name}`))
      console.log(chalk.dim(`    Type: ${result.skill.type}`))
      console.log(chalk.dim(`    Saved to: ${result.savedTo}`))
      if (result.skill.gotchas && result.skill.gotchas.length > 0) {
        console.log(chalk.dim(`    Gotchas: ${result.skill.gotchas.length}`))
      }
      console.log()
    } catch (err) {
      console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`))
      process.exit(1)
    }
  })

skillCmd
  .command('create')
  .description('Create a new skill interactively')
  .option('--paste', 'Paste raw content to convert into a skill')
  .action(async (opts: { paste?: boolean }) => {
    const mahRoot = process.cwd()
    const rl = createInterface({ input: stdin, output: stdout })

    try {
      const name = (await rl.question(chalk.cyan('Skill name (lowercase, dashes): ')))
      if (!name) { console.log(chalk.red('Name required.')); return }

      const typeStr = (await rl.question(chalk.cyan('Type (capability/behavioral/workflow) [capability]: '))) || 'capability'
      const type = typeStr as SkillType

      const description = (await rl.question(chalk.cyan('Description: ')))

      if (opts.paste) {
        console.log(chalk.dim('\nPaste your content (end with an empty line):\n'))
        const lines: string[] = []
        let emptyCount = 0
        for await (const line of rl) {
          if (line === '') {
            emptyCount++
            if (emptyCount >= 2) break
          } else {
            emptyCount = 0
          }
          lines.push(line)
        }
        const content = lines.join('\n')
        const savePath = createSkillFromContent(name, type, description, content, mahRoot)
        console.log(chalk.green(`\n  ✓ Created skill: ${name}`))
        console.log(chalk.dim(`    Saved to: ${savePath}\n`))
      } else {
        // Create a template
        const skillDir = resolve(mahRoot, '.mah', 'skills')
        mkdirSync(skillDir, { recursive: true })
        const template = {
          name,
          type,
          description,
          agent_types: ['generator'],
          gotchas: ['TODO: add failure patterns you discover'],
          constraints: ['TODO: add rules specific to this skill'],
          tags: ['TODO'],
        }
        const savePath = join(skillDir, `${name}.yaml`)
        writeFileSync(savePath, yaml.dump(template, { lineWidth: 120, noRefs: true }))
        console.log(chalk.green(`\n  ✓ Created skill template: ${name}`))
        console.log(chalk.dim(`    Edit: ${savePath}\n`))
      }
    } finally {
      rl.close()
    }
  })

program.parse()
