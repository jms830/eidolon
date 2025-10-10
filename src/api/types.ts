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