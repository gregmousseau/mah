import type { AgentResult } from '../types.js'

export class AdapterPreflightError extends Error {
  constructor(message: string, readonly result: AgentResult) {
    super(message)
    this.name = 'AdapterPreflightError'
  }
}
