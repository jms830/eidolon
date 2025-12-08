/**
 * Anthropic/Claude OAuth Provider
 * 
 * Handles Claude-specific API interactions using OAuth tokens.
 * Uses the same API as Claude Code CLI with OAuth authentication.
 */

import { getValidAccessToken } from '../manager';
import { PROVIDER_API_ENDPOINTS } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: 'text' | 'thinking';
  text?: string;
  thinking?: string;
}

export interface ClaudeMessagesRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  stream?: boolean;
  temperature?: number;
}

export interface ClaudeMessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
  };
  message?: ClaudeMessagesResponse;
}

// ============================================================================
// API CLIENT
// ============================================================================

const config = PROVIDER_API_ENDPOINTS.anthropic;

/**
 * Send a message to Claude using OAuth authentication
 */
export async function sendMessage(
  request: ClaudeMessagesRequest
): Promise<ClaudeMessagesResponse> {
  const accessToken = await getValidAccessToken('anthropic');
  
  if (!accessToken) {
    throw new Error('Not authenticated with Claude. Please sign in first.');
  }
  
  const response = await fetch(`${config.baseUrl}${config.messagesPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

/**
 * Send a streaming message to Claude using OAuth authentication
 * Returns a ReadableStream of ClaudeStreamEvent
 */
export async function sendMessageStream(
  request: ClaudeMessagesRequest
): Promise<ReadableStream<ClaudeStreamEvent>> {
  const accessToken = await getValidAccessToken('anthropic');
  
  if (!accessToken) {
    throw new Error('Not authenticated with Claude. Please sign in first.');
  }
  
  const response = await fetch(`${config.baseUrl}${config.messagesPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...config.headers,
    },
    body: JSON.stringify({ ...request, stream: true }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  if (!response.body) {
    throw new Error('No response body received');
  }
  
  // Transform the SSE stream into ClaudeStreamEvent objects
  return response.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, ClaudeStreamEvent>({
      transform(chunk, controller) {
        // Parse SSE format: "data: {...}\n\n"
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const event = JSON.parse(data) as ClaudeStreamEvent;
              controller.enqueue(event);
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      },
    })
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get available Claude models
 * Claude Pro/Max users have access to:
 * - claude-sonnet-4-20250514 (latest Sonnet)
 * - claude-3-5-sonnet-20241022 (previous Sonnet)
 * - claude-3-5-haiku-20241022 (fast model)
 * - claude-3-opus-20240229 (most capable, Pro/Max only)
 */
export function getAvailableModels(): { id: string; name: string; description: string }[] {
  return [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      description: 'Latest and most balanced model',
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'Previous generation Sonnet',
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      description: 'Fast and efficient',
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      description: 'Most capable (Pro/Max only)',
    },
  ];
}

/**
 * Simple helper to create a user message
 */
export function createUserMessage(content: string): ClaudeMessage {
  return { role: 'user', content };
}

/**
 * Check if we have valid Claude authentication
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getValidAccessToken('anthropic');
  return token !== null;
}
