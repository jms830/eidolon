/**
 * Hashing utilities for file change detection
 */

/**
 * Compute SHA-256 hash of text content
 * Note: Web Crypto API doesn't support MD5, using SHA-256 instead
 */
export async function computeSHA256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Compute file hash (using SHA-256)
 */
export async function computeFileHash(content: string): Promise<string> {
  return await computeSHA256Hash(content);
}
