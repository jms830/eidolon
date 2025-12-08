/**
 * Google/Gemini OAuth Provider
 * 
 * Handles Gemini-specific API interactions using OAuth tokens.
 * Uses Google Cloud Code Assist API with OAuth authentication from
 * Google One AI Premium or Gemini Advanced subscriptions.
 */

import { getValidAccessToken } from '../manager';
import { PROVIDER_API_ENDPOINTS } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

export interface GeminiGenerateRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: GeminiSafetySetting[];
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  index: number;
  safetyRatings: {
    category: string;
    probability: string;
  }[];
}

export interface GeminiGenerateResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface GeminiStreamEvent {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// ============================================================================
// API CLIENT
// ============================================================================

const config = PROVIDER_API_ENDPOINTS.google;

// Gemini uses a different endpoint structure based on model
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Send a generate content request to Gemini using OAuth authentication
 */
export async function generateContent(
  model: string,
  request: GeminiGenerateRequest
): Promise<GeminiGenerateResponse> {
  const accessToken = await getValidAccessToken('google');
  
  if (!accessToken) {
    throw new Error('Not authenticated with Gemini. Please sign in first.');
  }
  
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;
  
  const response = await fetch(url, {
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
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

/**
 * Send a streaming generate content request to Gemini
 * Returns a ReadableStream of GeminiStreamEvent
 */
export async function generateContentStream(
  model: string,
  request: GeminiGenerateRequest
): Promise<ReadableStream<GeminiStreamEvent>> {
  const accessToken = await getValidAccessToken('google');
  
  if (!accessToken) {
    throw new Error('Not authenticated with Gemini. Please sign in first.');
  }
  
  const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...config.headers,
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }
  
  if (!response.body) {
    throw new Error('No response body received');
  }
  
  // Transform the SSE stream into GeminiStreamEvent objects
  return response.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, GeminiStreamEvent>({
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
              const event = JSON.parse(data) as GeminiStreamEvent;
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
 * Get available Gemini models
 * Gemini Advanced / Google One AI Premium users have access to:
 * - gemini-2.0-flash-exp (latest experimental)
 * - gemini-1.5-pro (most capable)
 * - gemini-1.5-flash (fast and efficient)
 * - gemini-1.5-flash-8b (fastest, smallest)
 */
export function getAvailableModels(): { id: string; name: string; description: string }[] {
  return [
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash',
      description: 'Latest experimental model',
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      description: 'Most capable, 2M context',
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      description: 'Fast and efficient',
    },
    {
      id: 'gemini-1.5-flash-8b',
      name: 'Gemini 1.5 Flash-8B',
      description: 'Fastest, smallest model',
    },
  ];
}

/**
 * Simple helper to create user content
 */
export function createUserContent(text: string): GeminiContent {
  return {
    role: 'user',
    parts: [{ text }],
  };
}

/**
 * Simple helper to create model content
 */
export function createModelContent(text: string): GeminiContent {
  return {
    role: 'model',
    parts: [{ text }],
  };
}

/**
 * Check if we have valid Gemini authentication
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getValidAccessToken('google');
  return token !== null;
}

/**
 * Convert a simple chat format to Gemini format
 */
export function convertToGeminiFormat(
  messages: { role: 'user' | 'assistant'; content: string }[]
): GeminiContent[] {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}
