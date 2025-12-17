/**
 * Block Service - Manages the block-based Warp-style interface
 * 
 * This service handles:
 * - Block creation and management
 * - Slash command parsing and execution
 * - Input type detection (command vs chat vs slash)
 * - Terminal integration for command blocks
 */

import type {
  ChatBlock,
  CommandBlock,
  SystemBlock,
  ErrorBlock,
  BlocksState,
  BlockAction,
  SlashCommand,
  InputAnalysis,
  SuggestedCommand
} from './types';

// Re-export types for convenience
export * from './types';

// Local type for block without id/timestamp (for creation)
type NewChatBlock = Omit<ChatBlock, 'id' | 'timestamp'>;
type NewCommandBlock = Omit<CommandBlock, 'id' | 'timestamp'>;
type NewSystemBlock = Omit<SystemBlock, 'id' | 'timestamp'>;
type NewErrorBlock = Omit<ErrorBlock, 'id' | 'timestamp'>;
type NewBlock = NewChatBlock | NewCommandBlock | NewSystemBlock | NewErrorBlock;

// ============================================================================
// Block ID Generation
// ============================================================================

let blockIdCounter = 0;

/**
 * Generate a unique block ID
 */
export function generateBlockId(): string {
  return `block-${Date.now()}-${++blockIdCounter}`;
}

// ============================================================================
// Block Creation Helpers
// ============================================================================

/**
 * Create a new chat block
 */
export function createChatBlock(userMessage: string, aiResponse?: string): ChatBlock {
  return {
    id: generateBlockId(),
    type: 'chat',
    timestamp: Date.now(),
    status: aiResponse ? 'success' : 'pending',
    userMessage,
    aiResponse,
    isStreaming: !aiResponse
  };
}

/**
 * Create a new command block
 */
export function createCommandBlock(command: string, cwd: string): CommandBlock {
  return {
    id: generateBlockId(),
    type: 'command',
    timestamp: Date.now(),
    status: 'pending',
    command,
    cwd,
    output: '',
    isRunning: true
  };
}

/**
 * Create a system block
 */
export function createSystemBlock(message: string, icon?: string): SystemBlock {
  return {
    id: generateBlockId(),
    type: 'system',
    timestamp: Date.now(),
    status: 'success',
    message,
    icon
  };
}

/**
 * Create an error block
 */
export function createErrorBlock(title: string, message: string, details?: string): ErrorBlock {
  return {
    id: generateBlockId(),
    type: 'error',
    timestamp: Date.now(),
    status: 'error',
    title,
    message,
    details
  };
}

// ============================================================================
// Input Analysis
// ============================================================================

/**
 * Command patterns for detection
 */
const commandPatterns = [
  /^(cd|ls|pwd|mkdir|rm|cp|mv|cat|grep|find|echo|touch|chmod|chown)\s/i,
  /^(git|npm|yarn|pnpm|bun|node|python|pip|cargo|go|make|docker|kubectl)\s/i,
  /^(curl|wget|ssh|scp|rsync|tar|zip|unzip)\s/i,
  /^(apt|brew|yum|pacman|snap)\s/i,
  /^(vi|vim|nano|code|subl)\s/i,
  /^\.?\//,  // Starts with / or ./
  /^\w+\s+-/,  // command -flag pattern
];

/**
 * Patterns that indicate natural language (not commands)
 */
const naturalLanguagePatterns = [
  /^(how|what|why|when|where|who|can|could|would|should|is|are|do|does|help|explain|show|tell|find me|give me)/i,
  /\?$/,  // Ends with question mark
  /^(please|i need|i want|i'd like)/i,
];

/**
 * Analyze user input to determine type
 */
export function analyzeInput(input: string): InputAnalysis {
  const trimmed = input.trim();
  
  // Check for slash command first
  if (trimmed.startsWith('/')) {
    const match = trimmed.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (match) {
      return {
        type: 'slash',
        slashCommand: match[1].toLowerCase(),
        slashArgs: match[2] || '',
        confidence: 1.0
      };
    }
  }
  
  // Check for explicit command prefix
  if (trimmed.startsWith('$ ') || trimmed.startsWith('> ')) {
    return {
      type: 'command',
      confidence: 1.0
    };
  }
  
  // Check natural language patterns first (higher priority)
  for (const pattern of naturalLanguagePatterns) {
    if (pattern.test(trimmed)) {
      return {
        type: 'chat',
        confidence: 0.9
      };
    }
  }
  
  // Check command patterns
  for (const pattern of commandPatterns) {
    if (pattern.test(trimmed)) {
      return {
        type: 'command',
        confidence: 0.8
      };
    }
  }
  
  // Default to chat
  return {
    type: 'chat',
    confidence: 0.6
  };
}

// ============================================================================
// Slash Commands Registry
// ============================================================================

const slashCommands: Map<string, SlashCommand> = new Map();

/**
 * Register a slash command
 */
export function registerSlashCommand(command: SlashCommand): void {
  slashCommands.set(command.name.toLowerCase(), command);
  
  // Register aliases
  if (command.aliases) {
    for (const alias of command.aliases) {
      slashCommands.set(alias.toLowerCase(), command);
    }
  }
}

/**
 * Get a slash command by name
 */
export function getSlashCommand(name: string): SlashCommand | undefined {
  return slashCommands.get(name.toLowerCase());
}

/**
 * Get all registered slash commands
 */
export function getAllSlashCommands(): SlashCommand[] {
  const seen = new Set<string>();
  const commands: SlashCommand[] = [];
  
  for (const cmd of slashCommands.values()) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      commands.push(cmd);
    }
  }
  
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Default Slash Commands
// ============================================================================

// Register default commands
registerSlashCommand({
  name: 'run',
  aliases: ['exec', 'x'],
  description: 'Execute a terminal command',
  usage: '/run <command>',
  handler: async (args, ctx) => {
    if (!args.trim()) {
      ctx.addBlock({
        type: 'error',
        status: 'error',
        title: 'Missing command',
        message: 'Usage: /run <command>',
      });
      return;
    }
    
    const block = ctx.addBlock({
      type: 'command',
      status: 'running',
      command: args,
      cwd: ctx.cwd,
      output: '',
      isRunning: true
    }) as CommandBlock;
    
    try {
      const result = await ctx.executeCommand(args);
      ctx.updateBlock(block.id, {
        status: result.success ? 'success' : 'error',
        output: result.output,
        exitCode: result.exitCode,
        duration: result.duration,
        isRunning: false
      });
    } catch (error) {
      ctx.updateBlock(block.id, {
        status: 'error',
        output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isRunning: false
      });
    }
  }
});

registerSlashCommand({
  name: 'cd',
  description: 'Change current directory',
  usage: '/cd <path>',
  handler: async (args, ctx) => {
    const path = args.trim() || '~';
    
    ctx.addBlock({
      type: 'system',
      status: 'success',
      message: `Changed directory to: ${path}`,
      icon: '📂'
    });
    
    // Execute cd command
    await ctx.executeCommand(`cd ${path}`);
  }
});

registerSlashCommand({
  name: 'explain',
  aliases: ['why', 'help'],
  description: 'Ask AI to explain the last output or error',
  usage: '/explain [context]',
  handler: async (args, ctx) => {
    const context = args.trim() || ctx.lastOutput || '';
    const prompt = context 
      ? `Please explain this output or error:\n\n${context}`
      : 'Please explain what just happened and any errors that occurred.';
    
    const block = ctx.addBlock({
      type: 'chat',
      status: 'pending',
      userMessage: prompt,
      isStreaming: true
    }) as ChatBlock;
    
    try {
      const response = await ctx.sendToAI(prompt, ctx.lastOutput);
      ctx.updateBlock(block.id, {
        status: 'success',
        aiResponse: response,
        isStreaming: false
      });
    } catch (error) {
      ctx.updateBlock(block.id, {
        status: 'error',
        aiResponse: `Error: ${error instanceof Error ? error.message : 'Failed to get explanation'}`,
        isStreaming: false
      });
    }
  }
});

registerSlashCommand({
  name: 'clear',
  aliases: ['cls'],
  description: 'Clear all blocks',
  usage: '/clear',
  handler: async (_args, ctx) => {
    // This will be handled by the UI to clear blocks
    ctx.addBlock({
      type: 'system',
      status: 'success',
      message: 'Cleared conversation',
      icon: '🧹'
    });
  }
});

registerSlashCommand({
  name: 'new',
  description: 'Start a new session',
  usage: '/new [session name]',
  handler: async (args, ctx) => {
    const name = args.trim() || `Session ${new Date().toLocaleString()}`;
    ctx.addBlock({
      type: 'system',
      status: 'success',
      message: `Started new session: ${name}`,
      icon: '✨'
    });
  }
});

registerSlashCommand({
  name: 'commands',
  aliases: ['?', 'cmds'],
  description: 'Show available slash commands',
  usage: '/commands',
  handler: async (_args, ctx) => {
    const commands = getAllSlashCommands();
    const list = commands.map(cmd => {
      const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => '/' + a).join(', ')})` : '';
      return `**/${cmd.name}**${aliases}\n  ${cmd.description}\n  Usage: \`${cmd.usage}\``;
    }).join('\n\n');
    
    ctx.addBlock({
      type: 'chat',
      status: 'success',
      userMessage: '/commands',
      aiResponse: `## Available Commands\n\n${list}`
    });
  }
});

// ============================================================================
// Block State Reducer
// ============================================================================

/**
 * Initial blocks state
 */
export function createInitialBlocksState(): BlocksState {
  return {
    blocks: [],
    isProcessing: false,
    currentCwd: '~',
    selectedBlockId: undefined
  };
}

/**
 * Blocks state reducer
 */
export function blocksReducer(state: BlocksState, action: BlockAction): BlocksState {
  switch (action.type) {
    case 'ADD_BLOCK':
      return {
        ...state,
        blocks: [...state.blocks, action.block]
      };
    
    case 'UPDATE_BLOCK':
      return {
        ...state,
        blocks: state.blocks.map(block =>
          block.id === action.id ? { ...block, ...action.updates } : block
        )
      };
    
    case 'REMOVE_BLOCK':
      return {
        ...state,
        blocks: state.blocks.filter(block => block.id !== action.id)
      };
    
    case 'CLEAR_BLOCKS':
      return {
        ...state,
        blocks: []
      };
    
    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.isProcessing
      };
    
    case 'SET_CWD':
      return {
        ...state,
        currentCwd: action.cwd
      };
    
    case 'SELECT_BLOCK':
      return {
        ...state,
        selectedBlockId: action.id
      };
    
    default:
      return state;
  }
}

// ============================================================================
// Command Extraction from AI Responses
// ============================================================================

/**
 * Extract executable commands from AI response
 */
export function extractSuggestedCommands(response: string): SuggestedCommand[] {
  const commands: SuggestedCommand[] = [];
  
  // Match code blocks with shell/bash/zsh language
  const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\n([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const code = match[1].trim();
    // Split by newlines and filter comments
    const lines = code.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    for (const line of lines) {
      // Skip if it looks like output rather than command
      if (line.match(/^[a-zA-Z0-9_\-./]+:/) || line.includes('>>>')) continue;
      
      commands.push({
        command: line,
        confidence: 0.9
      });
    }
  }
  
  // Match inline code that looks like commands
  const inlineCodeRegex = /`([^`]+)`/g;
  while ((match = inlineCodeRegex.exec(response)) !== null) {
    const code = match[1].trim();
    // Check if it looks like a command
    if (analyzeInput(code).type === 'command') {
      commands.push({
        command: code,
        confidence: 0.7
      });
    }
  }
  
  return commands;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format command output for display
 */
export function formatCommandOutput(output: string): string {
  // Escape HTML
  let formatted = output
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Add ANSI color support (basic)
  formatted = formatted
    .replace(/\x1b\[0m/g, '</span>')
    .replace(/\x1b\[31m/g, '<span class="ansi-red">')
    .replace(/\x1b\[32m/g, '<span class="ansi-green">')
    .replace(/\x1b\[33m/g, '<span class="ansi-yellow">')
    .replace(/\x1b\[34m/g, '<span class="ansi-blue">')
    .replace(/\x1b\[35m/g, '<span class="ansi-magenta">')
    .replace(/\x1b\[36m/g, '<span class="ansi-cyan">')
    .replace(/\x1b\[1m/g, '<span class="ansi-bold">')
    // Remove other ANSI codes
    .replace(/\x1b\[[0-9;]*m/g, '');
  
  return formatted;
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

/**
 * Format timestamp for display
 */
export function formatBlockTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
