/**
 * OAuth Token Storage Service
 * 
 * Manages secure storage of OAuth tokens in chrome.storage.local.
 * Handles token persistence, retrieval, and cleanup.
 */

import type { 
  OAuthProviderType, 
  OAuthTokens, 
  AuthCredentials,
  OAuthStorage 
} from './types';

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEY = 'eidolon_oauth_tokens';
const PENDING_AUTH_KEY = 'eidolon_oauth_pending';

// ============================================================================
// PENDING AUTH STATE (for PKCE flow)
// ============================================================================

export interface PendingAuthState {
  provider: OAuthProviderType;
  verifier: string;
  state: string;
  startedAt: number;
}

/**
 * Store pending OAuth authorization state (verifier, state param)
 * Used to complete the PKCE flow when callback is received
 */
export async function storePendingAuth(pending: PendingAuthState): Promise<void> {
  await chrome.storage.local.set({ [PENDING_AUTH_KEY]: pending });
}

/**
 * Retrieve pending OAuth authorization state
 */
export async function getPendingAuth(): Promise<PendingAuthState | null> {
  const result = await chrome.storage.local.get(PENDING_AUTH_KEY);
  return result[PENDING_AUTH_KEY] || null;
}

/**
 * Clear pending OAuth authorization state
 */
export async function clearPendingAuth(): Promise<void> {
  await chrome.storage.local.remove(PENDING_AUTH_KEY);
}

// ============================================================================
// TOKEN STORAGE
// ============================================================================

/**
 * Get all stored OAuth credentials
 */
export async function getAllCredentials(): Promise<OAuthStorage> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

/**
 * Get credentials for a specific provider
 */
export async function getCredentials(provider: OAuthProviderType): Promise<AuthCredentials | null> {
  const storage = await getAllCredentials();
  return storage[provider] || null;
}

/**
 * Store OAuth tokens for a provider
 */
export async function storeTokens(tokens: OAuthTokens): Promise<void> {
  const storage = await getAllCredentials();
  storage[tokens.provider] = tokens;
  await chrome.storage.local.set({ [STORAGE_KEY]: storage });
}

/**
 * Store API key for a provider (fallback auth method)
 */
export async function storeApiKey(provider: OAuthProviderType, key: string): Promise<void> {
  const storage = await getAllCredentials();
  storage[provider] = {
    type: 'api',
    provider,
    key,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: storage });
}

/**
 * Remove credentials for a provider (logout)
 */
export async function removeCredentials(provider: OAuthProviderType): Promise<void> {
  const storage = await getAllCredentials();
  delete storage[provider];
  await chrome.storage.local.set({ [STORAGE_KEY]: storage });
}

/**
 * Clear all OAuth credentials (full logout)
 */
export async function clearAllCredentials(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

/**
 * Check if OAuth tokens are expired or about to expire
 * Returns true if tokens expire within the buffer time (default 5 minutes)
 */
export function isTokenExpired(tokens: OAuthTokens, bufferMs: number = 5 * 60 * 1000): boolean {
  return Date.now() >= (tokens.expiresAt - bufferMs);
}

/**
 * Get access token for a provider, checking expiration
 * Returns null if not authenticated or tokens expired
 */
export async function getAccessToken(provider: OAuthProviderType): Promise<string | null> {
  const credentials = await getCredentials(provider);
  
  if (!credentials) {
    return null;
  }
  
  if (credentials.type === 'api') {
    return credentials.key;
  }
  
  // OAuth tokens - check expiration
  if (isTokenExpired(credentials)) {
    // Token expired - caller should trigger refresh
    return null;
  }
  
  return credentials.accessToken;
}

/**
 * Update tokens after a refresh
 */
export async function updateTokens(
  provider: OAuthProviderType,
  accessToken: string,
  expiresIn: number,
  refreshToken?: string
): Promise<void> {
  const credentials = await getCredentials(provider);
  
  if (!credentials || credentials.type !== 'oauth') {
    throw new Error(`No OAuth tokens found for provider: ${provider}`);
  }
  
  const updated: OAuthTokens = {
    ...credentials,
    accessToken,
    expiresAt: Date.now() + (expiresIn * 1000),
  };
  
  // Only update refresh token if provided (some providers don't return it on refresh)
  if (refreshToken) {
    updated.refreshToken = refreshToken;
  }
  
  await storeTokens(updated);
}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

export interface ProviderStatus {
  provider: OAuthProviderType;
  connected: boolean;
  authType: 'oauth' | 'api' | null;
  email?: string;
  expiresAt?: number;
  isExpired?: boolean;
}

/**
 * Get connection status for a specific provider
 */
export async function getProviderStatus(provider: OAuthProviderType): Promise<ProviderStatus> {
  const credentials = await getCredentials(provider);
  
  if (!credentials) {
    return { provider, connected: false, authType: null };
  }
  
  if (credentials.type === 'api') {
    return { 
      provider, 
      connected: true, 
      authType: 'api' 
    };
  }
  
  return {
    provider,
    connected: true,
    authType: 'oauth',
    email: credentials.email,
    expiresAt: credentials.expiresAt,
    isExpired: isTokenExpired(credentials),
  };
}

/**
 * Get connection status for all providers
 */
export async function getAllProviderStatus(): Promise<ProviderStatus[]> {
  const providers: OAuthProviderType[] = ['anthropic', 'openai', 'google'];
  return Promise.all(providers.map(getProviderStatus));
}

// ============================================================================
// CLI CREDENTIALS IMPORT
// ============================================================================

/**
 * Claude Code credentials file format
 * Located at ~/.claude/.credentials.json
 */
export interface ClaudeCodeCredentials {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

/**
 * OpenCode credentials file format
 * Located at ~/.local/share/opencode/auth.json
 */
export interface OpenCodeCredentials {
  anthropic?: {
    type: 'oauth';
    access: string;
    refresh: string;
    expires: number;
  };
  google?: {
    type: 'oauth';
    access: string;
    refresh: string;
    expires: number;
  };
  openai?: {
    type: 'oauth';
    access: string;
    refresh: string;
    expires: number;
  };
}

/**
 * Import credentials from Claude Code CLI or OpenCode
 * Supports both formats:
 * - Claude Code: ~/.claude/.credentials.json
 * - OpenCode: ~/.local/share/opencode/auth.json
 * 
 * If tokens are expired, they will still be stored but needsRefresh will be true
 */
export async function importClaudeCodeCredentials(
  credentialsJson: string
): Promise<{ success: boolean; error?: string; needsRefresh?: boolean; source?: string }> {
  try {
    const data = JSON.parse(credentialsJson);
    
    // Try to detect the format
    let accessToken: string;
    let refreshToken: string;
    let expiresAt: number;
    let source: string;
    
    if (data.claudeAiOauth) {
      // Claude Code format
      const oauth = data.claudeAiOauth;
      if (!oauth.accessToken || !oauth.refreshToken || !oauth.expiresAt) {
        return { success: false, error: 'Invalid Claude Code credentials: missing accessToken, refreshToken, or expiresAt.' };
      }
      accessToken = oauth.accessToken;
      refreshToken = oauth.refreshToken;
      expiresAt = oauth.expiresAt;
      source = 'Claude Code CLI';
    } else if (data.anthropic) {
      // OpenCode format
      const oauth = data.anthropic;
      if (oauth.type !== 'oauth' || !oauth.access || !oauth.refresh || !oauth.expires) {
        return { success: false, error: 'Invalid OpenCode credentials: missing access, refresh, or expires for anthropic.' };
      }
      accessToken = oauth.access;
      refreshToken = oauth.refresh;
      expiresAt = oauth.expires;
      source = 'OpenCode';
    } else {
      return { 
        success: false, 
        error: 'Unrecognized credentials format. Expected Claude Code (.credentials.json) or OpenCode (auth.json) format.' 
      };
    }
    
    // Check if tokens are expired - we'll still import but flag for refresh
    const isExpired = Date.now() >= expiresAt;
    
    // Store as OAuth tokens (even if expired, we can try to refresh)
    const tokens: OAuthTokens = {
      type: 'oauth',
      provider: 'anthropic',
      accessToken,
      refreshToken,
      expiresAt,
    };
    
    await storeTokens(tokens);
    
    return { success: true, needsRefresh: isExpired, source };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof SyntaxError 
        ? 'Invalid JSON format. Please paste the entire contents of your credentials file.'
        : `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
