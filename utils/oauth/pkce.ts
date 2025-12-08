/**
 * PKCE (Proof Key for Code Exchange) Utilities
 * 
 * Implements RFC 7636 for secure OAuth 2.0 authorization code flow.
 * Used by Anthropic and OpenAI OAuth providers.
 */

import type { PKCEPair } from './types';

// ============================================================================
// CRYPTO UTILITIES
// ============================================================================

/**
 * Generate cryptographically secure random bytes
 */
function getRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Base64URL encode (RFC 4648) - no padding, URL-safe characters
 */
function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * SHA-256 hash using Web Crypto API
 */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

// ============================================================================
// PKCE FUNCTIONS
// ============================================================================

/**
 * Generate a code verifier (43-128 characters, RFC 7636 compliant)
 * Uses 32 random bytes encoded as base64url = 43 characters
 */
export function generateCodeVerifier(): string {
  // 32 bytes = 256 bits of entropy, produces 43-character base64url string
  const randomBytes = getRandomBytes(32);
  return base64UrlEncode(randomBytes);
}

/**
 * Generate a code challenge from a verifier using S256 method
 * challenge = BASE64URL(SHA256(verifier))
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await sha256(verifier);
  return base64UrlEncode(hash);
}

/**
 * Generate a complete PKCE pair (verifier + challenge)
 */
export async function generatePKCEPair(): Promise<PKCEPair> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  return { verifier, challenge };
}

/**
 * Generate a random state parameter for CSRF protection
 * Returns a 16-byte random string encoded as base64url
 */
export function generateState(): string {
  const randomBytes = getRandomBytes(16);
  return base64UrlEncode(randomBytes);
}

// ============================================================================
// URL BUILDERS
// ============================================================================

export interface AuthUrlParams {
  authUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  challenge: string;
  state: string;
  // Provider-specific extras
  extras?: Record<string, string>;
}

/**
 * Build an OAuth authorization URL with PKCE parameters
 */
export function buildAuthorizationUrl(params: AuthUrlParams): string {
  const url = new URL(params.authUrl);
  
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  
  // Add any provider-specific extras
  if (params.extras) {
    for (const [key, value] of Object.entries(params.extras)) {
      url.searchParams.set(key, value);
    }
  }
  
  return url.toString();
}

/**
 * Parse authorization code from callback URL
 */
export function parseAuthCallback(callbackUrl: string): { code?: string; state?: string; error?: string } {
  const url = new URL(callbackUrl);
  return {
    code: url.searchParams.get('code') || undefined,
    state: url.searchParams.get('state') || undefined,
    error: url.searchParams.get('error') || url.searchParams.get('error_description') || undefined,
  };
}
