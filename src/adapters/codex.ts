import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentAdapter, AgentResult, ExecuteOptions } from '../types.js'

const verifiedModels = new Set<string>()

function resolvedCwd(options: ExecuteOptions): string {
  const raw = options.cwd ?? options.workspace ?? process.cwd()
  return raw.startsWith('~') ? raw.replace('~', process.env.HOME ?? '') : raw
}

export class CodexAdapter implements AgentAdapter {
  async preflight(options: ExecuteOptions): Promise<void> {
    const model = options.model?.trim()
    if (!model) throw new Error('Codex provider requires an explicit model')
    const key = `${model}:${resolvedCwd(options)}`
    if (verifiedModels.has(key)) return
    const result = await this.run('Reply with exactly: MAH_PROVIDER_OK', options, true)
    if (!result.success || !result.output.includes('MAH_PROVIDER_OK')) {
      throw new Error(`Codex provider/model preflight failed for ${model}: ${result.output.slice(0, 300)}`)
    }
    verifiedModels.add(key)
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.run(task, options, false)
  }

  private async run(task: string, options: ExecuteOptions, readOnly: boolean): Promise<AgentResult> {
    const startMs = Date.now()
    const model = options.model?.trim()
    if (!model) throw new Error('Codex provider requires an explicit model')
    const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
    const cwd = resolvedCwd(options)
    const outputDir = mkdtempSync(join(tmpdir(), 'mah-codex-'))
    const outputPath = join(outputDir, 'last-message.txt')
    const args = [
      'exec',
      '--model', model,
      '--cd', cwd,
      '--ephemeral',
      '--color', 'never',
      '--output-last-message', outputPath,
      ...(readOnly
        ? ['--sandbox', 'read-only']
        : ['--dangerously-bypass-approvals-and-sandbox']),
      '-',
    ]

    return new Promise((resolve, reject) => {
      const child = spawn('codex', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk.toString() })
      child.stderr.on('data', chunk => { stderr += chunk.toString() })
      child.stdin.write(task, 'utf-8')
      child.stdin.end()

      const finish = (success: boolean, fallback: string): AgentResult => {
        const endMs = Date.now()
        let output = fallback
        if (existsSync(outputPath)) output = readFileSync(outputPath, 'utf-8')
        rmSync(outputDir, { recursive: true, force: true })
        return {
          success,
          output,
          provider: 'codex',
          model,
          timing: { startMs, endMs, durationMs: endMs - startMs },
        }
      }

      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000)
        resolve(finish(false, stdout || stderr || `[Timeout after ${timeoutMs / 1000}s]`))
      }, timeoutMs)

      child.on('close', code => {
        clearTimeout(timer)
        resolve(finish(code === 0, stdout || stderr || `[Process exited with code ${code}]`))
      })
      child.on('error', err => {
        clearTimeout(timer)
        rmSync(outputDir, { recursive: true, force: true })
        reject(new Error(`Failed to spawn Codex: ${err.message}`))
      })
    })
  }
}
