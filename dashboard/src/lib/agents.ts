/**
 * Centralized Agent Registry
 * Single source of truth for all agent definitions across the MAH system
 */

export type AgentPlatform = 'openclaw' | 'claude-code' | 'codex';

export interface ContextFolder {
  type: 'local' | 'gdrive' | 'url';
  path: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string; // One-liner description
  description: string; // Detailed description
  platform: AgentPlatform;
  skills: string[];
  contextFolders: ContextFolder[];
  workspace: string; // Path to agent workspace
  color: string; // Hex color for UI
  icon: string; // Emoji icon
  isEvaluator: boolean;
}

/**
 * Agent Registry Map
 * All 5 agents with complete metadata
 */
export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  'frontend-dev': {
    id: 'frontend-dev',
    name: 'Frankie',
    role: 'Frontend UI specialist',
    description: 'Frontend UI specialist. Has the Impeccable design skill for beautiful, production-grade UIs. Use for any visual/UI work.',
    platform: 'openclaw',
    skills: ['Impeccable design skill'],
    contextFolders: [],
    workspace: '/home/greg/.openclaw/workspace-frontend-dev',
    color: '#f97316',
    icon: '🎨',
    isEvaluator: false,
  },
  dev: {
    id: 'dev',
    name: 'Devin',
    role: 'Backend/general developer',
    description: 'General-purpose developer. Backend logic, bug fixes, API work, database changes, non-UI code.',
    platform: 'openclaw',
    skills: [],
    contextFolders: [],
    workspace: '/home/greg/.openclaw/workspace-dev',
    color: '#3b82f6',
    icon: '⚙️',
    isEvaluator: false,
  },
  qa: {
    id: 'qa',
    name: 'Quinn',
    role: 'QA evaluator',
    description: 'QA evaluator. Always use as the evaluator for all sprints.',
    platform: 'openclaw',
    skills: [],
    contextFolders: [],
    workspace: '/home/greg/.openclaw/workspace-qa',
    color: '#fb923c',
    icon: '🧪',
    isEvaluator: true,
  },
  research: {
    id: 'research',
    name: 'Reese',
    role: 'Research & analysis',
    description: 'Research and analysis. Use for gathering information, writing technical specs, competitive analysis, documentation.',
    platform: 'openclaw',
    skills: [],
    contextFolders: [],
    workspace: '/home/greg/.openclaw/workspace-research',
    color: '#10b981',
    icon: '🔬',
    isEvaluator: false,
  },
  content: {
    id: 'content',
    name: 'Connie',
    role: 'Content & writing',
    description: 'Content and writing. Use for copy, blog posts, marketing text, user-facing strings, README updates.',
    platform: 'openclaw',
    skills: [],
    contextFolders: [],
    workspace: '/home/greg/.openclaw/workspace-content',
    color: '#ec4899',
    icon: '✍️',
    isEvaluator: false,
  },
};

/**
 * Helper: Get all agents
 */
export function getAllAgents(): AgentDefinition[] {
  return Object.values(AGENT_REGISTRY);
}

/**
 * Helper: Get agent by ID
 */
export function getAgent(id: string): AgentDefinition | undefined {
  return AGENT_REGISTRY[id];
}

/**
 * Helper: Get all non-evaluator agents (for selection dropdowns)
 */
export function getGeneratorAgents(): AgentDefinition[] {
  return getAllAgents().filter(a => !a.isEvaluator);
}

/**
 * Helper: Get all evaluator agents
 */
export function getEvaluatorAgents(): AgentDefinition[] {
  return getAllAgents().filter(a => a.isEvaluator);
}

/**
 * Helper: Get agent workspace path
 */
export function getAgentWorkspace(agentId: string): string | undefined {
  return AGENT_REGISTRY[agentId]?.workspace;
}

/**
 * Helper: Get agent name
 */
export function getAgentName(agentId: string): string | undefined {
  return AGENT_REGISTRY[agentId]?.name;
}

/**
 * Helper: Get agent color
 */
export function getAgentColor(agentId: string): string {
  return AGENT_REGISTRY[agentId]?.color || '#9ca3af';
}

/**
 * Helper: Get agent icon
 */
export function getAgentIcon(agentId: string): string {
  return AGENT_REGISTRY[agentId]?.icon || '🤖';
}

/**
 * Helper: Build AGENTS_INFO string for planner prompt
 */
export function buildAgentsInfoString(): string {
  const lines = ['Available agents:'];

  for (const agent of getAllAgents()) {
    if (agent.isEvaluator) {
      lines.push(`- **${agent.name}** (id: "${agent.id}"): ${agent.description}`);
    } else {
      const skillsNote = agent.skills.length > 0
        ? ` Has the ${agent.skills.join(', ')} for ${agent.skills.join(', ').toLowerCase()}.`
        : '';
      lines.push(`- **${agent.name}** (id: "${agent.id}"): ${agent.description.split('.')[0]}.${skillsNote}`);
    }
  }

  return lines.join('\n');
}
