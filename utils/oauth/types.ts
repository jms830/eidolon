/**
 * OAuth Types for Eidolon Multi-Provider Authentication
 * 
 * Supports OAuth flows for Claude, ChatGPT, and Gemini using their 
 * respective subscription plans (no API key required).
 */

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export type OAuthProviderType = 'anthropic' | 'openai' | 'google';

export interface OAuthProvider {
  id: OAuthProviderType;
  name: string;
  description: string;
  icon: string;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
  redirectUri: string;
  // Some providers need client secret (Google)
  clientSecret?: string;
}

// ============================================================================
// TOKEN TYPES
// ============================================================================

export interface OAuthTokens {
  type: 'oauth';
  provider: OAuthProviderType;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  // Provider-specific metadata
  email?: string;
  projectId?: string; // For Google Cloud
  enterpriseUrl?: string; // For GitHub Enterprise
}

export interface ApiKeyAuth {
  type: 'api';
  provider: OAuthProviderType;
  key: string;
}

export type AuthCredentials = OAuthTokens | ApiKeyAuth;

// ============================================================================
// OAUTH FLOW TYPES
// ============================================================================

export interface PKCEPair {
  challenge: string;
  verifier: string;
}

export interface OAuthAuthorizationResult {
  url: string;
  verifier: string;
  state: string;
  method: 'code' | 'auto'; // 'code' = user pastes code, 'auto' = device flow polling
  instructions: string;
}

export interface OAuthTokenExchangeSuccess {
  type: 'success';
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  email?: string;
}

export interface OAuthTokenExchangeFailure {
  type: 'failed';
  error: string;
}

export type OAuthTokenExchangeResult = OAuthTokenExchangeSuccess | OAuthTokenExchangeFailure;

// ============================================================================
// STORAGE TYPES
// ============================================================================

export interface OAuthStorage {
  [providerId: string]: AuthCredentials;
}

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

/**
 * Claude/Anthropic OAuth Configuration
 * Uses Claude Pro/Max subscription via console.anthropic.com OAuth
 */
export const ANTHROPIC_CONFIG: OAuthProvider = {
  id: 'anthropic',
  name: 'Claude',
  description: 'Use your Claude Pro or Max subscription',
  icon: 'claude',
  // Use console.anthropic.com - same as Claude Code CLI binary
  authUrl: 'https://console.anthropic.com/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  // Client ID from Claude Code CLI (works with subscription OAuth)
  clientId: 'REDACTED_ANTHROPIC_CLIENT_ID',
  // Minimal scopes for API access:
  // - user:inference - make API calls using subscription
  // - user:profile - get user info
  // Note: user:sessions:claude_code causes 400 errors when authorizing
  scopes: ['user:inference', 'user:profile'],
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
};

/**
 * OpenAI/ChatGPT OAuth Configuration
 * Uses ChatGPT Plus/Pro/Team subscription via auth.openai.com
 */
export const OPENAI_CONFIG: OAuthProvider = {
  id: 'openai',
  name: 'ChatGPT',
  description: 'Use your ChatGPT Plus, Pro, or Team subscription',
  icon: 'chatgpt',
  authUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  clientId: 'REDACTED_OPENAI_CLIENT_ID',
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  redirectUri: 'http://localhost:1455/auth/callback',
};

/**
 * Google/Gemini OAuth Configuration  
 * Uses Gemini Advanced subscription via Google OAuth
 * Credentials from: https://github.com/jenslys/opencode-gemini-auth
 */
export const GOOGLE_CONFIG: OAuthProvider = {
  id: 'google',
  name: 'Gemini',
  description: 'Use your Google One AI Premium or Gemini Advanced subscription',
  icon: 'gemini',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  clientId: 'REDACTED_GOOGLE_CLIENT_ID',
  clientSecret: 'REDACTED_GOOGLE_CLIENT_SECRET', // Fixed: Cu5 not Cu3
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  redirectUri: 'http://localhost:8085/oauth2callback',
};

export const OAUTH_PROVIDERS: Record<OAuthProviderType, OAuthProvider> = {
  anthropic: ANTHROPIC_CONFIG,
  openai: OPENAI_CONFIG,
  google: GOOGLE_CONFIG,
};

// ============================================================================
// API ENDPOINTS FOR EACH PROVIDER
// ============================================================================

export const PROVIDER_API_ENDPOINTS = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    messagesPath: '/v1/messages',
    headers: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14',
    },
  },
  openai: {
    baseUrl: 'https://api.openai.com',
    messagesPath: '/v1/chat/completions',
    // Uses /v1/responses for Codex models
    responsesPath: '/v1/responses',
    headers: {},
  },
  google: {
    // Gemini uses Cloud Code Assist API
    baseUrl: 'https://cloudcode-pa.googleapis.com',
    headers: {
      'User-Agent': 'google-api-nodejs-client/9.15.1',
      'X-Goog-Api-Client': 'gl-node/22.17.0',
      'Client-Metadata': 'ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI',
    },
  },
} as const;
