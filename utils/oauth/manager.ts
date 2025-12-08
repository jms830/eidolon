/**
 * OAuth Manager
 * 
 * Orchestrates OAuth flows for all providers (Anthropic, OpenAI, Google).
 * Handles authorization initiation, token exchange, and token refresh.
 */

import type { 
  OAuthProviderType, 
  OAuthProvider,
  OAuthTokens,
  OAuthAuthorizationResult,
  OAuthTokenExchangeResult,
} from './types';
import { OAUTH_PROVIDERS } from './types';
import { 
  generatePKCEPair, 
  generateState, 
  buildAuthorizationUrl, 
  parseAuthCallback 
} from './pkce';
import { 
  storePendingAuth, 
  getPendingAuth, 
  clearPendingAuth,
  storeTokens,
  getCredentials,
  updateTokens,
  isTokenExpired,
} from './storage';

// ============================================================================
// AUTHORIZATION INITIATION
// ============================================================================

/**
 * Start OAuth authorization flow for a provider
 * Returns the authorization URL and instructions for the user
 */
export async function startAuthorization(
  providerType: OAuthProviderType
): Promise<OAuthAuthorizationResult> {
  const provider = OAUTH_PROVIDERS[providerType];
  
  // Generate PKCE pair and state
  const pkce = await generatePKCEPair();
  const state = generateState();
  
  // Store pending auth state for callback verification
  await storePendingAuth({
    provider: providerType,
    verifier: pkce.verifier,
    state,
    startedAt: Date.now(),
  });
  
  // Build authorization URL with provider-specific extras
  const extras = getProviderExtras(providerType);
  const url = buildAuthorizationUrl({
    authUrl: provider.authUrl,
    clientId: provider.clientId,
    redirectUri: provider.redirectUri,
    scopes: provider.scopes,
    challenge: pkce.challenge,
    state,
    extras,
  });
  
  return {
    url,
    verifier: pkce.verifier,
    state,
    method: 'code',
    instructions: getAuthInstructions(providerType),
  };
}

/**
 * Get provider-specific OAuth URL parameters
 * Based on: https://github.com/numman-ali/opencode-openai-codex-auth
 *           https://github.com/jenslys/opencode-gemini-auth
 */
function getProviderExtras(providerType: OAuthProviderType): Record<string, string> {
  switch (providerType) {
    case 'anthropic':
      // Anthropic OAuth doesn't use extra parameters like Google's access_type
      // The scopes determine offline access capability
      return {};
    case 'openai':
      // Extra params from Codex CLI OAuth flow
      return {
        'id_token_add_organizations': 'true',
        'codex_cli_simplified_flow': 'true',
        'originator': 'codex_cli_rs',
      };
    case 'google':
      return {
        'access_type': 'offline',
        'prompt': 'consent',
      };
    default:
      return {};
  }
}

/**
 * Get user-facing instructions for completing OAuth
 */
function getAuthInstructions(providerType: OAuthProviderType): string {
  switch (providerType) {
    case 'anthropic':
      return 'Sign in with your Claude Pro or Max account. After authorizing, copy the code shown on the page and paste it below.';
    case 'openai':
      return 'Sign in with your ChatGPT account. After authorizing, you\'ll see an error page - this is expected! Copy the "code" value from the URL bar (after "code=" and before "&") and paste it below.';
    case 'google':
      return 'Sign in with your Google account. After authorizing, you\'ll see an error page - this is expected! Copy the "code" value from the URL bar (after "code=" and before "&") and paste it below.';
    default:
      return 'Sign in and authorize access. Copy the code and paste it below.';
  }
}

// ============================================================================
// TOKEN EXCHANGE
// ============================================================================

/**
 * Exchange authorization code for tokens
 * Call this after user completes OAuth and provides the code
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<OAuthTokenExchangeResult> {
  // Get pending auth state
  const pending = await getPendingAuth();
  if (!pending) {
    return { type: 'failed', error: 'No pending authorization found. Please start the OAuth flow again.' };
  }
  
  const provider = OAUTH_PROVIDERS[pending.provider];
  
  try {
    const tokens = await performTokenExchange(provider, code, pending.verifier);
    
    // Store the tokens
    await storeTokens(tokens);
    
    // Clear pending state
    await clearPendingAuth();
    
    return {
      type: 'success',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: Math.floor((tokens.expiresAt - Date.now()) / 1000),
      email: tokens.email,
    };
  } catch (error) {
    await clearPendingAuth();
    return { 
      type: 'failed', 
      error: error instanceof Error ? error.message : 'Token exchange failed' 
    };
  }
}

/**
 * Perform the actual token exchange request
 */
async function performTokenExchange(
  provider: OAuthProvider,
  code: string,
  verifier: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: provider.redirectUri,
    client_id: provider.clientId,
    code_verifier: verifier,
  });
  
  // Google requires client_secret
  if (provider.clientSecret) {
    body.set('client_secret', provider.clientSecret);
  }
  
  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // Extract email if available (varies by provider)
  const email = await extractEmail(provider.id, data.access_token);
  
  return {
    type: 'oauth',
    provider: provider.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
    email,
  };
}

/**
 * Extract user email from provider (for display purposes)
 */
async function extractEmail(
  providerType: OAuthProviderType, 
  accessToken: string
): Promise<string | undefined> {
  try {
    switch (providerType) {
      case 'anthropic': {
        // Anthropic doesn't have a standard userinfo endpoint
        // Email might be in the token response or we skip it
        return undefined;
      }
      case 'openai': {
        const response = await fetch('https://api.openai.com/v1/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          return data.email;
        }
        return undefined;
      }
      case 'google': {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          return data.email;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Result of a token refresh attempt
 */
export interface RefreshResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  hint?: string;
}

/**
 * Refresh expired tokens for a provider
 * Returns detailed result with error information
 */
export async function refreshTokens(providerType: OAuthProviderType): Promise<RefreshResult> {
  const credentials = await getCredentials(providerType);
  
  if (!credentials || credentials.type !== 'oauth') {
    return { 
      success: false, 
      error: 'No OAuth credentials found',
      hint: 'Please connect your account first'
    };
  }
  
  const provider = OAUTH_PROVIDERS[providerType];
  
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: provider.clientId,
    });
    
    // Google requires client_secret for refresh too
    if (provider.clientSecret) {
      body.set('client_secret', provider.clientSecret);
    }
    
    console.log(`[OAuth] Refreshing tokens for ${providerType} at ${provider.tokenUrl}`);
    
    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      let errorCode = 'http_error';
      let hint = '';
      
      try {
        const errorData = await response.json();
        console.error(`[OAuth] Token refresh failed:`, errorData);
        
        errorCode = errorData.error || errorCode;
        errorMessage = errorData.error_description || errorData.message || errorMessage;
        
        // Provide helpful hints based on error type
        if (errorCode === 'invalid_grant') {
          hint = 'Your refresh token has expired or been revoked. Please re-authenticate in Claude Code CLI by running: claude';
        } else if (errorCode === 'invalid_client') {
          hint = 'The OAuth client is not authorized. This may be a configuration issue.';
        } else if (response.status === 400) {
          hint = 'The token refresh request was rejected. Try re-authenticating in Claude Code.';
        } else if (response.status === 401) {
          hint = 'Authentication failed. Your credentials may have been revoked.';
        }
      } catch {
        // Response wasn't JSON
        errorMessage = `Server returned ${response.status} ${response.statusText}`;
      }
      
      return { success: false, error: errorMessage, errorCode, hint };
    }
    
    const data = await response.json();
    
    if (!data.access_token) {
      return { 
        success: false, 
        error: 'Server response missing access_token',
        hint: 'Unexpected response from authentication server'
      };
    }
    
    await updateTokens(
      providerType,
      data.access_token,
      data.expires_in,
      data.refresh_token // May or may not be returned
    );
    
    console.log(`[OAuth] Successfully refreshed tokens for ${providerType}`);
    return { success: true };
  } catch (error) {
    console.error(`[OAuth] Token refresh error for ${providerType}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let hint = '';
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      hint = 'Network error. Check your internet connection.';
    } else if (errorMessage.includes('CORS')) {
      hint = 'Cross-origin request blocked. This is a browser security restriction.';
    }
    
    return { success: false, error: errorMessage, hint };
  }
}

/**
 * Get a valid access token, refreshing if necessary
 * Returns null if not authenticated or refresh failed
 */
export async function getValidAccessToken(
  providerType: OAuthProviderType
): Promise<string | null> {
  const credentials = await getCredentials(providerType);
  
  if (!credentials) {
    return null;
  }
  
  if (credentials.type === 'api') {
    return credentials.key;
  }
  
  // Check if token needs refresh
  if (isTokenExpired(credentials)) {
    const refreshResult = await refreshTokens(providerType);
    if (!refreshResult.success) {
      console.error(`[OAuth] Token refresh failed: ${refreshResult.error}`);
      return null;
    }
    // Re-fetch credentials after refresh
    const updated = await getCredentials(providerType);
    if (!updated || updated.type !== 'oauth') {
      return null;
    }
    return updated.accessToken;
  }
  
  return credentials.accessToken;
}

// ============================================================================
// CALLBACK HANDLING (for extension redirect)
// ============================================================================

/**
 * Handle OAuth callback URL (when using chrome.identity or similar)
 * Extracts code and verifies state
 */
export async function handleOAuthCallback(
  callbackUrl: string
): Promise<OAuthTokenExchangeResult> {
  const { code, state, error } = parseAuthCallback(callbackUrl);
  
  if (error) {
    return { type: 'failed', error };
  }
  
  if (!code) {
    return { type: 'failed', error: 'No authorization code in callback' };
  }
  
  // Verify state matches pending auth
  const pending = await getPendingAuth();
  if (!pending) {
    return { type: 'failed', error: 'No pending authorization found' };
  }
  
  if (state && state !== pending.state) {
    await clearPendingAuth();
    return { type: 'failed', error: 'State mismatch - possible CSRF attack' };
  }
  
  return exchangeCodeForTokens(code);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { OAUTH_PROVIDERS } from './types';
