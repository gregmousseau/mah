/**
 * Agent Registry for TypeScript pipeline
 * Mirrors the dashboard registry for use in the main pipeline code
 */

export interface AgentRegistryEntry {
  id: string
  name: string
  workspace: string
  color: string
  icon: string
}

export const AGENT_REGISTRY: Record<string, AgentRegistryEntry> = {
  'frontend-dev': {
    id: 'frontend-dev',
    name: 'Frankie',
    workspace: '/home/greg/.openclaw/workspace-frontend-dev',
    color: '#f97316',
    icon: '🎨',
  },
  dev: {
    id: 'dev',
    name: 'Devin',
    workspace: '/home/greg/.openclaw/workspace-dev',
    color: '#3b82f6',
    icon: '⚙️',
  },
  qa: {
    id: 'qa',
    name: 'Quinn',
    workspace: '/home/greg/.openclaw/workspace-qa',
    color: '#a855f7',
    icon: '🧪',
  },
  research: {
    id: 'research',
    name: 'Reese',
    workspace: '/home/greg/.openclaw/workspace-research',
    color: '#10b981',
    icon: '🔬',
  },
  content: {
    id: 'content',
    name: 'Connie',
    workspace: '/home/greg/.openclaw/workspace-content',
    color: '#ec4899',
    icon: '✍️',
  },
}

export function getAgentWorkspace(agentId: string): string | undefined {
  return AGENT_REGISTRY[agentId]?.workspace
}

export function getAgentName(agentId: string): string | undefined {
  return AGENT_REGISTRY[agentId]?.name
}
