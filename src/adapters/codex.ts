import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  boundTranscriptResponse,
  resolveAdapterExecutionPolicy,
} from '../execution-policy.js'
import type {
  AgentAdapter,
  AgentResult,
  ExecuteOptions,
} from '../types.js'
import { runActivityAwareProcess } from './activity-aware-process.js'
import { AdapterPreflightError } from './errors.js'

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
      throw new AdapterPreflightError(
        `Codex provider/model preflight failed for ${model}: ${result.output.slice(0, 300)}`,
        result,
      )
    }
    verifiedModels.add(key)
  }

  async execute(task: string, options: ExecuteOptions): Promise<AgentResult> {
    return this.run(task, options, false)
  }

  private async run(task: string, options: ExecuteOptions, readOnly: boolean): Promise<AgentResult> {
    const model = options.model?.trim()
    if (!model) throw new Error('Codex provider requires an explicit model')
    const policy = resolveAdapterExecutionPolicy(options)
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

    const execution = await runActivityAwareProcess({
      command: 'codex',
      args,
      cwd,
      env: { ...process.env },
      stdin: task,
      execution: options,
      terminationGraceMs: options.terminationGraceMs,
    })
    let output = execution.stdout || execution.stderr || (
      execution.termination.reason === 'idle-timeout'
      || execution.termination.reason === 'absolute-timeout'
        ? `[${execution.termination.reason}; last activity ${execution.termination.lastActivityAt}]`
        : `[Process exited with code ${execution.code}]`
    )
    if (existsSync(outputPath)) output = readFileSync(outputPath, 'utf8')
    rmSync(outputDir, { recursive: true, force: true })
    return {
      success:
        execution.termination.reason === 'completed'
        && execution.code === 0,
      output: boundTranscriptResponse(output, policy.transcriptMaxChars),
      provider: 'codex',
      model,
      rawActivityPath: execution.rawActivityPath,
      termination: execution.termination,
      timing: execution.timing,
      costEstimate: 0,
    }
  }
}
