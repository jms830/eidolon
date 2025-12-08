/**
 * OpenCode Client Service
 * 
 * Connects to a local OpenCode server for AI chat capabilities.
 * Users must run `opencode serve --port=4096` to enable this feature.
 */

// Import directly from client submodule to avoid server-side Node.js dependencies
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';

// Default connection settings
const DEFAULT_PORT = 4096;
const DEFAULT_HOST = 'localhost';

// Storage key for custom server URL
const STORAGE_KEY = 'eidolon_opencode_server_url';

// Type for the client with extended methods we use via `as any`
type ExtendedClient = OpencodeClient & {
  app: { agents: () => Promise<any> };
  session: OpencodeClient['session'] & {
    messages: (options: { path: { id: string } }) => Promise<any>;
    prompt: (options: { path: { id: string }; body: any }) => Promise<any>;
  };
  file: { read: (options: { query: { path: string } }) => Promise<any> };
  find: {
    files: (options: { query: { q: string } }) => Promise<any>;
    text: (options: { query: { q: string } }) => Promise<any>;
  };
  global: { event: () => Promise<any> };
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
   */
  async createSession(_name?: string): Promise<any> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await client.session.create();
    return response.data || response;
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
   */
  async getMessages(sessionId: string): Promise<any[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await (client.session as any).messages({ id: sessionId });
    return response.data || response || [];
  },

  /**
   * Send a chat message to a session
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

    const response = await (client.session as any).chat({
      id: sessionId,
      providerID,
      modelID,
      parts: [{ type: 'text', text: content }]
    });
    
    return response.data || response;
  },

  /**
   * Get available models from the server
   */
  async getModels(): Promise<any[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    try {
      // Try to get models - API might vary
      const response = await (client as any).model?.list?.() || [];
      return response.data || response || [];
    } catch {
      // Return default models if API doesn't support listing
      return [
        { id: 'claude-sonnet-4-20250514', provider: 'anthropic', name: 'Claude Sonnet 4' },
        { id: 'claude-3-5-sonnet-20241022', provider: 'anthropic', name: 'Claude 3.5 Sonnet' },
        { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', provider: 'openai', name: 'GPT-4o Mini' },
      ];
    }
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
   */
  async readFile(filePath: string): Promise<string> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await (client.file as any).read({ query: { path: filePath } });
    return response.data?.content || response.content || '';
  },

  /**
   * Search for files in the workspace
   */
  async searchFiles(query: string): Promise<any[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await (client.find as any).files({ query: { q: query } });
    return response.data || response || [];
  },

  /**
   * Search text content in files
   */
  async searchText(query: string): Promise<any[]> {
    const url = await getServerUrl();
    const client = createClient(url);
    const response = await (client.find as any).text({ query: { q: query } });
    return response.data || response || [];
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
