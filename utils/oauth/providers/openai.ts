/**
 * OpenAI/ChatGPT OAuth Provider
 * 
 * Handles ChatGPT-specific API interactions using OAuth tokens.
 * Uses the OpenAI API with OAuth authentication from ChatGPT Plus/Pro/Team subscriptions.
 */

import { getValidAccessToken } from '../manager';
import { PROVIDER_API_ENDPOINTS } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatGPTMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatGPTCompletionRequest {
  model: string;
  messages: ChatGPTMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatGPTChoice {
  index: number;
  message: ChatGPTMessage;
  finish_reason: string;
}

export interface ChatGPTCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatGPTChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatGPTStreamDelta {
  role?: string;
  content?: string;
}

export interface ChatGPTStreamChoice {
  index: number;
  delta: ChatGPTStreamDelta;
  finish_reason: string | null;
}

export interface ChatGPTStreamEvent {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatGPTStreamChoice[];
}

// ============================================================================
// API CLIENT
// ============================================================================

const config = PROVIDER_API_ENDPOINTS.openai;

/**
 * Send a chat completion request to ChatGPT using OAuth authentication
 */
export async function sendChatCompletion(
  request: ChatGPTCompletionRequest
): Promise<ChatGPTCompletionResponse> {
  const accessToken = await getValidAccessToken('openai');
  
  if (!accessToken) {
    throw new Error('Not authenticated with ChatGPT. Please sign in first.');
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
    throw new Error(`ChatGPT API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

/**
 * Send a streaming chat completion request to ChatGPT
 * Returns a ReadableStream of ChatGPTStreamEvent
 */
export async function sendChatCompletionStream(
  request: ChatGPTCompletionRequest
): Promise<ReadableStream<ChatGPTStreamEvent>> {
  const accessToken = await getValidAccessToken('openai');
  
  if (!accessToken) {
    throw new Error('Not authenticated with ChatGPT. Please sign in first.');
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
    throw new Error(`ChatGPT API error: ${response.status} - ${error}`);
  }
  
  if (!response.body) {
    throw new Error('No response body received');
  }
  
  // Transform the SSE stream into ChatGPTStreamEvent objects
  return response.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, ChatGPTStreamEvent>({
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
              const event = JSON.parse(data) as ChatGPTStreamEvent;
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
 * Get available ChatGPT models
 * ChatGPT Plus/Pro/Team users have access to:
 * - gpt-4o (latest flagship)
 * - gpt-4o-mini (faster, cheaper)
 * - gpt-4-turbo (previous generation)
 * - o1 / o1-mini (reasoning models, Pro only)
 */
export function getAvailableModels(): { id: string; name: string; description: string }[] {
  return [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: 'Latest flagship model',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Faster and more efficient',
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      description: 'Previous generation flagship',
    },
    {
      id: 'o1',
      name: 'o1',
      description: 'Advanced reasoning (Pro only)',
    },
    {
      id: 'o1-mini',
      name: 'o1 Mini',
      description: 'Fast reasoning model',
    },
  ];
}

/**
 * Simple helper to create a user message
 */
export function createUserMessage(content: string): ChatGPTMessage {
  return { role: 'user', content };
}

/**
 * Simple helper to create a system message
 */
export function createSystemMessage(content: string): ChatGPTMessage {
  return { role: 'system', content };
}

/**
 * Check if we have valid ChatGPT authentication
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getValidAccessToken('openai');
  return token !== null;
}
