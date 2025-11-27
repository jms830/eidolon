/**
 * Platform detection and configuration
 */

export type Platform = 'claude' | 'chatgpt' | 'gemini';

export interface PlatformConfig {
  name: string;
  hostnames: string[];
  conversationUrlPattern: RegExp;
  enabled: boolean;
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  claude: {
    name: 'Claude',
    hostnames: ['claude.ai'],
    conversationUrlPattern: /\/chat\/([^/?]+)/,
    enabled: true
  },
  chatgpt: {
    name: 'ChatGPT',
    hostnames: ['chat.openai.com', 'chatgpt.com'],
    conversationUrlPattern: /\/c\/([^/?]+)/,
    enabled: true
  },
  gemini: {
    name: 'Gemini',
    hostnames: ['gemini.google.com'],
    conversationUrlPattern: /\/app\/([^/?]+)/,
    enabled: true
  }
};

/**
 * Detect current platform from hostname
 */
export function detectPlatform(): Platform | null {
  if (typeof window === 'undefined') return null;
  
  const hostname = window.location.hostname;
  
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    if (config.hostnames.some(host => hostname.includes(host))) {
      return platform as Platform;
    }
  }
  
  return null;
}

/**
 * Get conversation ID from URL based on platform
 */
export function getConversationId(platform: Platform): string | null {
  if (typeof window === 'undefined') return null;
  
  const config = PLATFORMS[platform];
  const match = window.location.pathname.match(config.conversationUrlPattern);
  return match ? match[1] : null;
}

/**
 * Check if current page is a conversation page
 */
export function isConversationPage(platform: Platform): boolean {
  return !!getConversationId(platform);
}

/**
 * Get platform settings from storage
 */
export async function getPlatformSettings(): Promise<Record<Platform, boolean>> {
  // @ts-ignore - browser global from WXT
  const result = await browser.storage.local.get('exportPlatformSettings');
  return result.exportPlatformSettings || {
    claude: true,
    chatgpt: true,
    gemini: true
  };
}

/**
 * Save platform settings to storage
 */
export async function savePlatformSettings(settings: Record<Platform, boolean>): Promise<void> {
  // @ts-ignore - browser global from WXT
  await browser.storage.local.set({ exportPlatformSettings: settings });
}

/**
 * Check if export is enabled for platform
 */
export async function isExportEnabled(platform: Platform): Promise<boolean> {
  const settings = await getPlatformSettings();
  return settings[platform] ?? true;
}
