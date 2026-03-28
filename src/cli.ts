#!/usr/bin/env node

import { Command } from 'commander'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import yaml from 'js-yaml'
import chalk from 'chalk'
import { loadConfig } from './config.js'
import type { SprintContract, SprintMetrics, BuildEvent } from './types.js'

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
  .action((task: string) => {
    console.log(chalk.yellow(`\nTask: "${task}"`))
    console.log(chalk.dim('Pipeline executor not yet implemented.'))
    console.log(chalk.dim('This will be built in Sprint 003.\n'))
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

program.parse()
