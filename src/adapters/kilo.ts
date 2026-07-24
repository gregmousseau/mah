import { spawn, spawnSync } from 'node:child_process'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'

const DEFAULT_ACPX = '/home/greg/.openclaw/npm/node_modules/.bin/acpx'

function resolvedCwd(options: ExecuteOptions): string {
  const raw = options.cwd ?? options.workspace ?? process.cwd()
  return raw.startsWith('~') ? raw.replace('~', process.env.HOME ?? '') : raw
}

export class KiloAdapter implements AgentAdapter {
  private readonly command = process.env.ACPX_CMD ?? DEFAULT_ACPX

  async preflight(): Promise<void> {
    const result = spawnSync(this.command, ['--version'], { encoding: 'utf-8' })
    if (result.status !== 0) {
      throw new Error(`Kilo/acpx preflight failed: ${(result.stderr || result.stdout || 'acpx unavailable').trim()}`)
    }
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    const startMs = Date.now()
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
    const cwd = resolvedCwd(options)
    const args = ['kilocode', 'exec', '--cwd', cwd, '--format', 'quiet', task]
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk.toString() })
      child.stderr.on('data', chunk => { stderr += chunk.toString() })
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000)
        const endMs = Date.now()
        resolve({
          success: false,
          output: stdout || stderr || `[Timeout after ${timeoutMs / 1000}s]`,
          provider: 'kilo',
          timing: { startMs, endMs, durationMs: endMs - startMs },
        })
      }, timeoutMs)
      child.on('close', code => {
        clearTimeout(timer)
        const endMs = Date.now()
        resolve({
          success: code === 0,
          output: stdout || stderr || `[Process exited with code ${code}]`,
          provider: 'kilo',
          timing: { startMs, endMs, durationMs: endMs - startMs },
        })
      })
      child.on('error', err => {
        clearTimeout(timer)
        reject(new Error(`Failed to spawn Kilo/acpx: ${err.message}`))
      })
    })
  }
}
