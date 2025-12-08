/**
 * Eidolon OAuth Module
 * 
 * Multi-provider OAuth authentication for Claude, ChatGPT, and Gemini.
 * Uses existing web subscriptions (no API keys required).
 * 
 * @example
 * ```typescript
 * import { startAuthorization, exchangeCodeForTokens, getValidAccessToken } from 'utils/oauth';
 * 
 * // Start OAuth flow for Claude
 * const auth = await startAuthorization('anthropic');
 * console.log('Open this URL:', auth.url);
 * 
 * // After user authorizes and pastes code
 * const result = await exchangeCodeForTokens(code);
 * if (result.type === 'success') {
 *   console.log('Authenticated as:', result.email);
 * }
 * 
 * // Use the token for API calls
 * const token = await getValidAccessToken('anthropic');
 * ```
 */

// Core types
export type { 
  OAuthProviderType,
  OAuthProvider,
  OAuthTokens,
  ApiKeyAuth,
  AuthCredentials,
  PKCEPair,
  OAuthAuthorizationResult,
  OAuthTokenExchangeResult,
  OAuthStorage,
} from './types';

export { 
  OAUTH_PROVIDERS,
  ANTHROPIC_CONFIG,
  OPENAI_CONFIG,
  GOOGLE_CONFIG,
  PROVIDER_API_ENDPOINTS,
} from './types';

// PKCE utilities
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEPair,
  generateState,
  buildAuthorizationUrl,
  parseAuthCallback,
} from './pkce';

// Storage
export {
  storePendingAuth,
  getPendingAuth,
  clearPendingAuth,
  getAllCredentials,
  getCredentials,
  storeTokens,
  storeApiKey,
  removeCredentials,
  clearAllCredentials,
  isTokenExpired,
  getAccessToken,
  updateTokens,
  getProviderStatus,
  getAllProviderStatus,
  importClaudeCodeCredentials,
} from './storage';
export type { PendingAuthState, ProviderStatus, ClaudeCodeCredentials } from './storage';

// OAuth manager
export {
  startAuthorization,
  exchangeCodeForTokens,
  refreshTokens,
  getValidAccessToken,
  handleOAuthCallback,
} from './manager';
export type { RefreshResult } from './manager';

// Provider-specific APIs
export * as anthropic from './providers/anthropic';
export * as openai from './providers/openai';
export * as google from './providers/google';
