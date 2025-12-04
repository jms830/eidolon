/**
 * Claude.ai API Client
 * Handles all API interactions with Claude.ai
 */

// ========================================================================
// Account Management Types (for multi-account switching)
// ========================================================================

export interface EidolonAccount {
  id: string;                    // Unique identifier (UUID)
  name: string;                  // Display name (user-editable)
  email?: string;                // Email from Claude.ai account (if available)
  type: 'work' | 'personal';     // Account type badge
  color: string;                 // Avatar/badge color (hex)
  sessionKey: string;            // The sessionKey cookie value
  organizationId?: string;       // Primary organization UUID
  organizationName?: string;     // Organization name for display
  createdAt: string;             // ISO timestamp when account was saved
  lastUsedAt: string;            // ISO timestamp of last use
  isActive: boolean;             // Currently active account
}

export interface AccountsStorage {
  accounts: EidolonAccount[];
  activeAccountId: string | null;
  version: number;               // Schema version for migrations
}

// Default account colors (Claude-inspired palette)
export const ACCOUNT_COLORS = [
  '#E07850', // Claude terracotta (default)
  '#3B82F6', // Blue
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#EF4444', // Red
];

export interface Organization {
  uuid: string;
  name: string;
  capabilities: string[];
}

export interface Project {
  uuid: string;
  name: string;
  description?: string;
  archived_at?: string | null;
  prompt_template?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectFile {
  uuid: string;
  file_name: string;
  content: string;
  created_at: string;
}

export interface Conversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  project_uuid?: string;
}

export interface Message {
  uuid: string;
  text: string;
  sender: 'human' | 'assistant';
  created_at: string;
}

// ========================================================================
// Claude Code Sessions API Types (NEW - v0.7.4+)
// ========================================================================

export interface ClaudeCodeSession {
  id: string;
  title: string;
  session_status: 'running' | 'idle' | 'archived';
  created_at: string;
  updated_at: string;
  session_context: SessionContext;
}

export interface SessionContext {
  model: string;
  sources?: SessionSource[];
  outcomes?: SessionOutcome[];
}

export interface SessionSource {
  type: 'git_repository';
  url: string;
}

export interface SessionOutcome {
  type: 'git_repository';
  git_info: GitInfo;
}

export interface GitInfo {
  type: 'github';
  repo: string;  // "owner/repo"
  branches: string[];
}

export interface ClaudeCodeEnvironment {
  environment_id: string;
  name: string;
  kind: string;
  state: 'active' | 'inactive' | string;
}

export interface CodeRepo {
  repo: {
    name: string;
    owner: {
      login: string;
    };
    default_branch: string;
  };
}

// ========================================================================
// SSE Event Types for Chat Completion (Updated Dec 2025)
// ========================================================================

export interface SSEMessageStart {
  type: 'message_start';
  message: {
    id: string;
    type: string;
    role: string;
    model: string;
    parent_uuid?: string;
    uuid?: string;
    content: any[];
    stop_reason: string | null;
  };
}

export interface SSEContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'thinking_delta' | 'thinking_summary_delta';
    text?: string;
    thinking?: string;
    summary?: { summary: string };
  };
}

export interface SSEMessageDelta {
  type: 'message_delta';
  delta: {
    stop_reason: 'end_turn' | string;
    stop_sequence: string | null;
  };
}

export interface SSEMessageLimit {
  type: 'message_limit';
  message_limit: {
    type: string;
    resetsAt: string | null;
    remaining: number | null;
    windows: Record<string, { status: string; resets_at: number }>;
  };
}

export type SSEEvent = 
  | SSEMessageStart 
  | SSEContentBlockDelta 
  | SSEMessageDelta 
  | SSEMessageLimit
  | { type: 'content_block_start' | 'content_block_stop' | 'message_stop' };

// ========================================================================
// Personalized Styles API Types (Dec 2025)
// ========================================================================

/**
 * Style attribute with name and intensity percentage
 */
export interface StyleAttribute {
  name: string;        // e.g., "Professional", "Strategic", "Analytical"
  percentage: number;  // 0-1 scale (0.9 = 90%)
}

/**
 * Personalized style object - matches Claude.ai's style format
 */
export interface PersonalizedStyle {
  type: 'default' | 'custom';   // 'default' for built-in styles, 'custom' for user-created
  uuid: string;                  // Unique identifier
  key: string;                   // Style key (same as uuid for custom, name for default)
  name: string;                  // Display name (e.g., "Seer Insights", "Explanatory")
  prompt: string;                // The actual style instructions/system prompt
  summary: string;               // Brief description of the style
  isDefault: boolean;            // Whether this is a built-in default style
  attributes: StyleAttribute[];  // Style characteristics with percentages
}

/**
 * Response from GET /api/organizations/{orgId}/list_styles
 */
export interface StylesListResponse {
  default: PersonalizedStyle[];  // Built-in styles (Formal, Concise, Explanatory, etc.)
  custom: PersonalizedStyle[];   // User-created custom styles
}

/**
 * Style selection for message completion - sent in personalized_styles array
 */
export interface StyleSelection extends PersonalizedStyle {
  // Same structure as PersonalizedStyle, included directly in completion request
}
