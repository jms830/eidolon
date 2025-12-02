/**
 * Claude.ai API Client
 * Handles all API interactions with Claude.ai
 */

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
