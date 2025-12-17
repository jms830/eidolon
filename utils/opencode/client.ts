/**
 * OpenCode Client Service
 * 
 * Connects to a local OpenCode server for AI chat capabilities.
 * Users must run `opencode serve --port=4096` to enable this feature.
 * 
 * API Reference: https://opencode.ai/docs/server/
 * SDK Reference: https://opencode.ai/docs/sdk/
 * 
 * Project Switching:
 * All API calls support an optional `directory` parameter to switch project context.
 * This allows working with multiple projects from a single server instance.
 */

// Import directly from client submodule to avoid server-side Node.js dependencies
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';

// Default connection settings
const DEFAULT_PORT = 4096;
const DEFAULT_HOST = 'localhost';

// Storage keys
const STORAGE_KEY = 'eidolon_opencode_server_url';
const PROJECT_DIR_KEY = 'eidolon_opencode_project_dir';

// ====================================================================
// OpenCode Project Types
// ====================================================================

export interface OpenCodeProject {
  path: string;        // Full path to project directory
  name: string;        // Project name (derived from path or config)
  lastUsed?: number;   // Timestamp of last use
}

// ====================================================================
// Type Extensions for SDK
// The SDK types are auto-generated from OpenAPI, but we add helpers
// ====================================================================

interface SessionCreateBody {
  title?: string;
  parentID?: string;
}

interface MessagePart {
  type: 'text' | 'image';
  text?: string;
  image?: string;
  mimeType?: string;
}

interface PromptBody {
  model?: {
    providerID: string;
    modelID: string;
  };
  parts: MessagePart[];
  noReply?: boolean;
  system?: string;
  agent?: string;
}

interface MessageResponse {
  info: {
    id: string;
    role: 'user' | 'assistant';
    time: { created: number };
  };
  parts: MessagePart[];
}

// Extended client type with proper method signatures
type ExtendedClient = OpencodeClient & {
  app: { agents: () => Promise<any> };
  config: { 
    get: () => Promise<any>;
    providers: () => Promise<{ providers: any[]; default: Record<string, string> }>;
  };
  session: OpencodeClient['session'] & {
    messages: (options: { path: { id: string } }) => Promise<MessageResponse[]>;
    prompt: (options: { path: { id: string }; body: PromptBody }) => Promise<MessageResponse>;
  };
  file: { 
    read: (options: { query: { path: string } }) => Promise<{ type: string; content: string }>;
    status: (options?: { query?: any }) => Promise<any[]>;
  };
  find: {
    files: (options: { query: { query: string } }) => Promise<string[]>;
    text: (options: { query: { pattern: string } }) => Promise<any[]>;
  };
};

/**
 * Get the OpenCode server URL from storage or use default
 */
export async function getServerUrl(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
  } catch {
    return `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
  }
}

/**
 * Save a custom server URL
 */
export async function setServerUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: url });
}

/**
 * Create an OpenCode client instance
 */
export function createClient(baseUrl: string): ExtendedClient {
  return createOpencodeClient({ baseUrl }) as ExtendedClient;
}

/**
 * OpenCode service with all available operations
 */
export const openCodeService = {
  /**
   * Check if the OpenCode server is running and reachable
   */
  async checkConnection(baseUrl?: string): Promise<{ connected: boolean; info?: any; error?: string }> {
    try {
      const url = baseUrl || await getServerUrl();
      const client = createClient(url);
      // Use app.agents() as a health check - it's a simple GET endpoint
      const response = await client.app.agents();
      return { connected: true, info: response.data || response };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { connected: false, error: message };
    }
  },

  // ====================================================================
  // Project Management
  // OpenCode tracks all known projects. Use ?directory= to switch context.
  // ====================================================================

  /**
   * List all known projects from OpenCode
   * GET /project
   */
  async listProjects(): Promise<OpenCodeProject[]> {
    const url = await getServerUrl();
    try {
      const response = await fetch(`${url}/project`);
      if (!response.ok) {
        throw new Error(`Failed to list projects: ${response.statusText}`);
      }
      const data = await response.json();
      // API returns array of project objects with: id, worktree, vcsDir?, vcs, time
      if (Array.isArray(data)) {
        return data.map((item: string | { path?: string; worktree?: string; name?: string; id?: string }) => {
          if (typeof item === 'string') {
            return {
              path: item,
              name: item.split('/').pop() || item
            };
          }
          // Handle both 'path' and 'worktree' fields (OpenCode API uses 'worktree')
          const projectPath = item.path || item.worktree || '';
          return {
            path: projectPath,
            name: item.name || projectPath.split('/').pop() || projectPath || 'Unknown'
          };
        });
      }
      return [];
    } catch (error) {
      console.error('Failed to list projects:', error);
      return [];
    }
  },

  /**
   * Get current project info
   * GET /project/current with optional ?directory= to get info for a specific project
   */
  async getCurrentProject(directory?: string): Promise<OpenCodeProject | null> {
    const url = await getServerUrl();
    try {
      const params = directory ? `?directory=${encodeURIComponent(directory)}` : '';
      const response = await fetch(`${url}/project/current${params}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to get current project: ${response.statusText}`);
      }
      const data = await response.json();
      return {
        path: data.path || data.directory || directory || '',
        name: data.name || (data.path || directory || '').split('/').pop() || 'Unknown'
      };
    } catch (error) {
      console.error('Failed to get current project:', error);
      return null;
    }
  },

  /**
   * Get/set the saved project directory from storage
   */
  async getSelectedProjectDir(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(PROJECT_DIR_KEY);
      return result[PROJECT_DIR_KEY] || null;
    } catch {
      return null;
    }
  },

  async setSelectedProjectDir(directory: string | null): Promise<void> {
    if (directory) {
      await chrome.storage.local.set({ [PROJECT_DIR_KEY]: directory });
    } else {
      await chrome.storage.local.remove(PROJECT_DIR_KEY);
    }
  },

  // ====================================================================
  // Session Management (with project directory support)
  // ====================================================================

  /**
   * Create a new chat session
   * POST /session with body { title? }
   * Supports optional directory parameter for project context
   */
  async createSession(title?: string, directory?: string): Promise<any> {
    const url = await getServerUrl();
    const params = directory ? `?directory=${encodeURIComponent(directory)}` : '';
    
    const response = await fetch(`${url}/session${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(title ? { title } : {})
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * List all available sessions
   * Supports optional directory parameter for project context
   */
  async listSessions(directory?: string): Promise<any[]> {
    const url = await getServerUrl();
    const params = directory ? `?directory=${encodeURIComponent(directory)}` : '';
    
    const response = await fetch(`${url}/session${params}`);
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get messages for a session
   * GET /session/:id/message
   * Supports optional directory parameter for project context
   */
  async getMessages(sessionId: string, directory?: string): Promise<any[]> {
    const url = await getServerUrl();
    const params = directory ? `?directory=${encodeURIComponent(directory)}` : '';
    
    const response = await fetch(`${url}/session/${sessionId}/message${params}`);
    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Send a chat message to a session and wait for response
   * POST /session/:id/message
   * 
   * Supports optional directory parameter for project context
   */
  async sendMessage(
    sessionId: string, 
    content: string, 
    options?: {
      providerID?: string;
      modelID?: string;
      directory?: string;
    }
  ): Promise<any> {
    const url = await getServerUrl();
    
    const {
      providerID = 'anthropic',
      modelID = 'claude-sonnet-4-20250514',
      directory
    } = options || {};

    const params = directory ? `?directory=${encodeURIComponent(directory)}` : '';
    
    const response = await fetch(`${url}/session/${sessionId}/message${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: { providerID, modelID },
        parts: [{ type: 'text', text: content }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get available providers and models from the server
   * GET /config/providers returns { providers, default }
   */
  async getProviders(): Promise<{ providers: any[]; defaults: Record<string, string> }> {
    const url = await getServerUrl();
    const client = createClient(url);
    try {
      const response = await client.config.providers();
      const data = (response as any).data || response;
      return {
        providers: data.providers || [],
        defaults: data.default || {}
      };
    } catch {
      // Return empty if API fails
      return { providers: [], defaults: {} };
    }
  },

  /**
   * Get available models from all connected providers
   * Extracts models from providers list
   */
  async getModels(): Promise<any[]> {
    try {
      const { providers } = await this.getProviders();
      // Flatten models from all providers
      const models: any[] = [];
      for (const provider of providers) {
        if (provider.models) {
          for (const model of provider.models) {
            models.push({
              id: model.id,
              provider: provider.id,
              name: model.name || model.id,
              ...model
            });
          }
        }
      }
      return models.length > 0 ? models : this.getDefaultModels();
    } catch {
      return this.getDefaultModels();
    }
  },

  // ====================================================================
  // TUI (Terminal UI) helpers
  // ====================================================================

  async openModelsInTui(): Promise<void> {
    await callTuiEndpoint('open-models');
  },

  async openSessionsInTui(): Promise<void> {
    await callTuiEndpoint('open-sessions');
  },

  async openHelpInTui(): Promise<void> {
    await callTuiEndpoint('open-help');
  },

  async openThemesInTui(): Promise<void> {
    await callTuiEndpoint('open-themes');
  },

  /**
   * Create a new session in the TUI (equivalent to /new command)
   */
  async newSessionInTui(): Promise<void> {
    await callTuiEndpoint('execute-command', { command: 'new' });
  },

  async appendPrompt(prompt: string): Promise<void> {
    if (!prompt) return;
    await callTuiEndpoint('append-prompt', { prompt });
  },

  async clearPrompt(): Promise<void> {
    await callTuiEndpoint('clear-prompt');
  },

  async submitPrompt(): Promise<void> {
    await callTuiEndpoint('submit-prompt');
  },

  async executeTuiCommand(command: string): Promise<void> {
    if (!command) return;
    await callTuiEndpoint('execute-command', { command });
  },

  /**
   * Default models list for fallback
   */
  getDefaultModels(): any[] {
    return [
      { id: 'claude-sonnet-4-20250514', provider: 'anthropic', name: 'Claude Sonnet 4' },
      { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', name: 'Claude 3.5 Sonnet' },
      { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', provider: 'openai', name: 'GPT-4o Mini' },
    ];
  },

  /**
   * Subscribe to real-time events from the server
   * Returns a cleanup function to close the connection
   */
  subscribeToEvents(onEvent: (event: any) => void): () => void {
    let eventSource: EventSource | null = null;
    let isClosed = false;
    
    getServerUrl().then(url => {
      if (isClosed) return;
      
      try {
        // Connect to SSE endpoint directly
        eventSource = new EventSource(`${url}/event`);
        
        eventSource.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            onEvent(data);
          } catch {
            onEvent({ raw: event.data });
          }
        };

        eventSource.onerror = () => {
          onEvent({ type: 'error', message: 'Connection lost' });
        };
      } catch (error) {
        console.error('Failed to subscribe to events:', error);
      }
    });

    // Return cleanup function
    return () => {
      isClosed = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  },

  /**
   * Read a file from the workspace
   * GET /file/content?path=<path>
   */
  async readFile(filePath: string): Promise<string> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await client.file.read({ query: { path: filePath } });
    const data = (response as any).data || response;
    return data?.content || '';
  },

  /**
   * Search for files in the workspace by name
   * GET /find/file?query=<query>
   */
  async searchFiles(query: string): Promise<string[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await client.find.files({ query: { query } });
    return (response as any).data || response || [];
  },

  /**
   * Search text content in files
   * GET /find?pattern=<pattern>
   */
  async searchText(pattern: string): Promise<any[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await client.find.text({ query: { pattern } });
    return (response as any).data || response || [];
  }
};

async function callTuiEndpoint(endpoint: string, body?: any): Promise<void> {
  const url = await getServerUrl();
  const response = await fetch(`${url}/tui/${endpoint}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to call ${endpoint}: ${response.statusText}`);
  }
}


// ====================================================================
// PTY (Terminal) Types
// ====================================================================

export interface PtyInfo {
  id: string;
  title: string;
  command: string;
  args: string[];
  cwd: string;
  status: 'running' | 'exited';
  pid: number;
}

export interface PtyCreateOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  title?: string;
  env?: Record<string, string>;
}

export interface PtyUpdateOptions {
  title?: string;
  size?: {
    rows: number;
    cols: number;
  };
}

/**
 * PTY (Terminal) service for managing terminal sessions
 * Requires OpenCode server to be running
 */
export const ptyService = {
  /**
   * Create a new PTY session
   * POST /pty
   */
  async create(options: PtyCreateOptions = {}): Promise<PtyInfo> {
    const url = await getServerUrl();
    const response = await fetch(`${url}/pty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!response.ok) {
      throw new Error(`Failed to create PTY: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * List all PTY sessions
   * GET /pty
   */
  async list(): Promise<PtyInfo[]> {
    const url = await getServerUrl();
    const response = await fetch(`${url}/pty`);
    if (!response.ok) {
      throw new Error(`Failed to list PTYs: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get PTY session info
   * GET /pty/:id
   */
  async get(id: string): Promise<PtyInfo | null> {
    const url = await getServerUrl();
    const response = await fetch(`${url}/pty/${id}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to get PTY: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Update PTY session (resize, rename)
   * PATCH /pty/:id
   */
  async update(id: string, options: PtyUpdateOptions): Promise<PtyInfo> {
    const url = await getServerUrl();
    const response = await fetch(`${url}/pty/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!response.ok) {
      throw new Error(`Failed to update PTY: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Remove PTY session
   * DELETE /pty/:id
   */
  async remove(id: string): Promise<void> {
    const url = await getServerUrl();
    const response = await fetch(`${url}/pty/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`Failed to remove PTY: ${response.statusText}`);
    }
  },

  /**
   * Get WebSocket URL for PTY connection
   * Used to connect terminal to PTY I/O
   */
  async getWebSocketUrl(id: string, directory?: string): Promise<string> {
    const url = await getServerUrl();
    // Convert http:// to ws:// or https:// to wss://
    const wsUrl = url.replace(/^http/, 'ws');
    const params = directory ? `?directory=${encodeURIComponent(directory)}` : '';
    return `${wsUrl}/pty/${id}/connect${params}`;
  },

  /**
   * Connect to PTY via WebSocket
   * Returns WebSocket instance for bidirectional communication
   */
  async connect(id: string, directory?: string): Promise<WebSocket> {
    const wsUrl = await this.getWebSocketUrl(id, directory);
    return new WebSocket(wsUrl);
  }
};

/**
 * Helper to format OpenCode errors for display
 */
export function formatOpencodeError(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('status' in error) {
      const apiError = error as { status: number; message?: string };
      if (apiError.status === 404) {
        return 'OpenCode server not found. Is it running?';
      }
      return `API Error (${apiError.status}): ${apiError.message || 'Unknown error'}`;
    }
    if ('code' in error && (error as any).code === 'ECONNREFUSED') {
      return 'Cannot connect to OpenCode server. Run: opencode serve --port=4096';
    }
    if ('message' in error) {
      return (error as { message: string }).message;
    }
  }
  return 'Unknown error occurred';
}

/**
 * Connection status type
 */
export interface OpenCodeConnectionStatus {
  connected: boolean;
  serverUrl: string;
  info?: {
    version?: string;
    cwd?: string;
  };
  error?: string;
}

/**
 * Check connection and return detailed status
 */
export async function getConnectionStatus(): Promise<OpenCodeConnectionStatus> {
  const serverUrl = await getServerUrl();
  const result = await openCodeService.checkConnection(serverUrl);
  
  return {
    connected: result.connected,
    serverUrl,
    info: result.info,
    error: result.error
  };
}
