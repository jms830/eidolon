/**
 * OpenCode Client Service
 * 
 * Connects to a local OpenCode server for AI chat capabilities.
 * Users must run `opencode serve --port=4096` to enable this feature.
 * 
 * API Reference: https://opencode.ai/docs/server/
 * SDK Reference: https://opencode.ai/docs/sdk/
 */

// Import directly from client submodule to avoid server-side Node.js dependencies
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';

// Default connection settings
const DEFAULT_PORT = 4096;
const DEFAULT_HOST = 'localhost';

// Storage key for custom server URL
const STORAGE_KEY = 'eidolon_opencode_server_url';

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

  /**
   * Create a new chat session
   * POST /session with body { title? }
   */
  async createSession(title?: string): Promise<any> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await client.session.create({ 
      body: title ? { title } : {} 
    });
    return (response as any).data || response;
  },

  /**
   * List all available sessions
   */
  async listSessions(): Promise<any[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await client.session.list();
    return (response as any).data || response || [];
  },

  /**
   * Get messages for a session
   * GET /session/:id/message
   */
  async getMessages(sessionId: string): Promise<any[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await client.session.messages({ 
      path: { id: sessionId } 
    });
    return (response as any).data || response || [];
  },

  /**
   * Send a chat message to a session and wait for response
   * POST /session/:id/message
   * 
   * Uses the session.prompt() SDK method which maps to the /message endpoint
   */
  async sendMessage(
    sessionId: string, 
    content: string, 
    options?: {
      providerID?: string;
      modelID?: string;
    }
  ): Promise<any> {
    const url = await getServerUrl();
    const client = createClient(url);
    
    const {
      providerID = 'anthropic',
      modelID = 'claude-sonnet-4-20250514'
    } = options || {};

    const response = await client.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID, modelID },
        parts: [{ type: 'text', text: content }]
      }
    });
    
    return (response as any).data || response;
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
