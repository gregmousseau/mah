import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import type { BuildEvent } from './types.js'

// Valid actor/type/phase values (mirrors BuildEvent type)
type Actor = BuildEvent['actor']
type EventType = BuildEvent['type']
type Phase = BuildEvent['phase']

const ACTOR_COLORS: Record<Actor, (s: string) => string> = {
  moe:    chalk.blue,
  dev:    chalk.green,
  quinn:  chalk.magenta,
  human:  chalk.yellow,
  system: chalk.cyan,
}

const TYPE_ICONS: Record<EventType, string> = {
  spawn:      '🚀',
  output:     '📄',
  decision:   '🔀',
  screenshot: '📸',
  milestone:  '🏁',
  error:      '❌',
}

export class EventLogger {
  private logFile: string

  constructor(eventsDir: string) {
    mkdirSync(eventsDir, { recursive: true })
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    this.logFile = join(eventsDir, `session-${dateStr}.jsonl`)
  }

  log(
    actor: string,
    type: string,
    phase: string,
    summary: string,
    detail?: string
  ): void {
    const now = new Date()
    const ts = now.toISOString()
    const local = now.toLocaleTimeString('en-CA', { hour12: false })

    const event: BuildEvent = {
      ts,
      local,
      actor:   actor  as Actor,
      type:    type   as EventType,
      phase:   phase  as Phase,
      summary,
      detail,
    }

    // Append to JSONL log
    try {
      appendFileSync(this.logFile, JSON.stringify(event) + '\n', 'utf-8')
    } catch {
      // Non-fatal — don't crash the pipeline over logging failures
    }

    // Console output
    const colorFn = ACTOR_COLORS[actor as Actor] ?? chalk.white
    const icon = TYPE_ICONS[type as EventType] ?? '•'
    const actorLabel = colorFn(actor.padEnd(6))
    const phaseTag = chalk.dim(`[${phase}]`)
    const summaryText = type === 'milestone'
      ? chalk.bold(summary)
      : type === 'error'
        ? chalk.red(summary)
        : summary

    console.log(`  ${icon} ${actorLabel} ${phaseTag} ${summaryText}`)

    // If detail is short (< 200 chars) and not a full report, print it dimmed
    if (detail && detail.length < 200) {
      console.log(chalk.dim(`       ${detail.replace(/\n/g, '\n       ')}`))
    }
  }
}
