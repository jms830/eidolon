/**
 * Shared settings types for dashboard and sidepanel integration
 */

// ============================================================================
// Platform Export Settings
// ============================================================================

export interface ExportPlatformSettings {
  claude: boolean;
  chatgpt: boolean;
  gemini: boolean;
  perplexity: boolean;
  copilot: boolean;
}

export const DEFAULT_EXPORT_PLATFORMS: ExportPlatformSettings = {
  claude: true,
  chatgpt: true,
  gemini: true,
  perplexity: true,
  copilot: true,
};

// ============================================================================
// UI Settings
// ============================================================================

export interface UISettings {
  darkMode: boolean;
  sidebarCollapsed: boolean;
  showTimestamps: boolean;
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  darkMode: false,
  sidebarCollapsed: false,
  showTimestamps: true,
};

// ============================================================================
// Agent Mode Settings
// ============================================================================

export interface AgentSettings {
  enabled: boolean;
  model: string;
  customApiUrl: string | null;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  model: 'claude-sonnet-4-20250514',
  customApiUrl: null,
};

// ============================================================================
// Debug Settings
// ============================================================================

export interface DebugSettings {
  enabled: boolean;
  verboseLogging: boolean;
}

export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  enabled: false,
  verboseLogging: false,
};

// ============================================================================
// Account Settings
// ============================================================================

export interface AccountInfo {
  id: string;
  email: string;
  name: string;
  isDefault: boolean;
  lastUsed?: string;
}

// ============================================================================
// All Settings Combined
// ============================================================================

export interface AllSettings {
  exportPlatforms: ExportPlatformSettings;
  ui: UISettings;
  agent: AgentSettings;
  debug: DebugSettings;
  currentAccountId: string | null;
}

export const DEFAULT_ALL_SETTINGS: AllSettings = {
  exportPlatforms: { ...DEFAULT_EXPORT_PLATFORMS },
  ui: { ...DEFAULT_UI_SETTINGS },
  agent: { ...DEFAULT_AGENT_SETTINGS },
  debug: { ...DEFAULT_DEBUG_SETTINGS },
  currentAccountId: null,
};

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  EXPORT_PLATFORMS: 'eidolon_export_settings',
  UI_SETTINGS: 'eidolon_ui_settings',
  AGENT_SETTINGS: 'eidolon_agent_settings',
  DEBUG_SETTINGS: 'eidolon_debug_settings',
  CURRENT_ACCOUNT: 'eidolon_current_account',
  ACCOUNTS: 'eidolon_accounts',
  WORKSPACE_CONFIG: 'workspaceConfig',
} as const;

// ============================================================================
// Change Events
// ============================================================================

export type SettingsChangeType = 
  | 'exportPlatforms'
  | 'ui'
  | 'agent'
  | 'debug'
  | 'account'
  | 'workspace';

export interface SettingsChangeEvent {
  type: SettingsChangeType;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  source: 'dashboard' | 'sidepanel' | 'background' | 'unknown';
}

export type SettingsChangeListener = (event: SettingsChangeEvent) => void;
