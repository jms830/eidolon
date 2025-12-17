/**
 * Block Types for Warp-style Unified Command Interface
 * 
 * Blocks are the fundamental unit of the chat/terminal hybrid interface.
 * Each block represents either a chat exchange, command execution, or system message.
 */

// ============================================================================
// Block Types
// ============================================================================

export type BlockType = 'chat' | 'command' | 'system' | 'error';

export type BlockStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

/**
 * Base block interface - all blocks share these properties
 */
export interface BaseBlock {
  id: string;
  type: BlockType;
  timestamp: number;
  status: BlockStatus;
}

/**
 * Chat block - user message + AI response
 */
export interface ChatBlock extends BaseBlock {
  type: 'chat';
  userMessage: string;
  aiResponse?: string;
  attachments?: BlockAttachment[];
  suggestedCommands?: SuggestedCommand[];
  isStreaming?: boolean;
}

/**
 * Command block - terminal command + output
 */
export interface CommandBlock extends BaseBlock {
  type: 'command';
  command: string;
  cwd: string;
  output: string;
  exitCode?: number;
  duration?: number; // ms
  isRunning?: boolean;
}

/**
 * System block - informational messages
 */
export interface SystemBlock extends BaseBlock {
  type: 'system';
  message: string;
  icon?: string;
}

/**
 * Error block - error messages with context
 */
export interface ErrorBlock extends BaseBlock {
  type: 'error';
  title: string;
  message: string;
  details?: string;
  recoveryAction?: {
    label: string;
    action: string;
  };
}

/**
 * Union type for all block types
 */
export type Block = ChatBlock | CommandBlock | SystemBlock | ErrorBlock;

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * File or context attachment
 */
export interface BlockAttachment {
  type: 'file' | 'image' | 'url' | 'selection';
  name: string;
  content?: string;
  preview?: string;
  path?: string;
  url?: string;
}

/**
 * AI-suggested command that can be executed
 */
export interface SuggestedCommand {
  command: string;
  description?: string;
  confidence?: number; // 0-1
}

/**
 * Slash command definition
 */
export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  handler: (args: string, context: SlashCommandContext) => Promise<void>;
}

/**
 * Context passed to slash command handlers
 */
export interface SlashCommandContext {
  cwd: string;
  projectDir?: string;
  lastBlock?: Block;
  lastOutput?: string;
  addBlock: (block: Omit<Block, 'id' | 'timestamp'>) => Block;
  updateBlock: (id: string, updates: Partial<Block>) => void;
  executeCommand: (command: string) => Promise<CommandResult>;
  sendToAI: (message: string, context?: string) => Promise<string>;
}

/**
 * Result from command execution
 */
export interface CommandResult {
  success: boolean;
  output: string;
  exitCode: number;
  duration: number;
}

// ============================================================================
// Block State
// ============================================================================

/**
 * State for managing blocks in the UI
 */
export interface BlocksState {
  blocks: Block[];
  isProcessing: boolean;
  currentCwd: string;
  selectedBlockId?: string;
}

/**
 * Block action types for reducer pattern
 */
export type BlockAction =
  | { type: 'ADD_BLOCK'; block: Block }
  | { type: 'UPDATE_BLOCK'; id: string; updates: Partial<Block> }
  | { type: 'REMOVE_BLOCK'; id: string }
  | { type: 'CLEAR_BLOCKS' }
  | { type: 'SET_PROCESSING'; isProcessing: boolean }
  | { type: 'SET_CWD'; cwd: string }
  | { type: 'SELECT_BLOCK'; id: string | undefined };

// ============================================================================
// Input Detection
// ============================================================================

/**
 * Input type detection result
 */
export interface InputAnalysis {
  type: 'chat' | 'command' | 'slash';
  slashCommand?: string;
  slashArgs?: string;
  confidence: number;
}

/**
 * Common command patterns for detection
 */
export const COMMAND_PATTERNS = [
  /^(cd|ls|pwd|mkdir|rm|cp|mv|cat|grep|find|echo|touch|chmod|chown)\s/i,
  /^(git|npm|yarn|pnpm|node|python|pip|cargo|go|make|docker|kubectl)\s/i,
  /^(curl|wget|ssh|scp|rsync|tar|zip|unzip)\s/i,
  /^(apt|brew|yum|pacman|snap)\s/i,
  /^(vi|vim|nano|code|subl)\s/i,
  /^\.?\//,  // Starts with / or ./
  /^\w+\s+-/,  // command -flag pattern
];

/**
 * Patterns that indicate natural language (not commands)
 */
export const NATURAL_LANGUAGE_PATTERNS = [
  /^(how|what|why|when|where|who|can|could|would|should|is|are|do|does|help|explain|show|tell|find me|give me)/i,
  /\?$/,  // Ends with question mark
  /^(please|i need|i want|i'd like)/i,
];
