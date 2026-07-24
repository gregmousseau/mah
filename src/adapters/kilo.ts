import { spawn } from 'node:child_process'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'

const verifiedModels = new Set<string>()

function resolvedCwd(options: ExecuteOptions): string {
  const raw = options.cwd ?? options.workspace ?? process.cwd()
  return raw.startsWith('~') ? raw.replace('~', process.env.HOME ?? '') : raw
}

function command(): { executable: string; prefix: string[] } {
  if (process.env.KILO_CMD) return { executable: process.env.KILO_CMD, prefix: [] }
  return { executable: 'npx', prefix: ['-y', '@kilocode/cli'] }
}

export class KiloAdapter implements AgentAdapter {
  async preflight(options: ExecuteOptions): Promise<void> {
    const model = options.model?.trim()
    if (!model) throw new Error('Kilo provider requires an explicit model')
    const key = `${model}:${resolvedCwd(options)}`
    if (verifiedModels.has(key)) return
    const result = await this.run('Reply with exactly: MAH_PROVIDER_OK', options, false)
    if (!result.success || !result.output.includes('MAH_PROVIDER_OK')) {
      throw new Error(`Kilo provider/model preflight failed for ${model}: ${result.output.slice(0, 300)}`)
    }
    verifiedModels.add(key)
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.run(task, options, true)
  }

  private async run(task: string, options: ExecuteOptions, approveWrites: boolean): Promise<AgentResult> {
    const startMs = Date.now()
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
    const cwd = resolvedCwd(options)
    const model = options.model?.trim()
    if (!model) throw new Error('Kilo provider requires an explicit model')
    const cli = command()
    const args = [
      ...cli.prefix,
      'run',
      '--model', model,
      '--dir', cwd,
      '--format', 'default',
      ...(approveWrites ? ['--auto'] : []),
      task,
    ]

    return new Promise((resolve, reject) => {
      const child = spawn(cli.executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
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
        reject(new Error(`Failed to spawn Kilo: ${err.message}`))
      })
    })
  }
}
