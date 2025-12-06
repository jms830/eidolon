/**
 * Shared Settings Service
 * 
 * Single source of truth for all extension settings.
 * Provides bidirectional sync between dashboard and sidepanel via chrome.storage.
 * 
 * Usage:
 *   import { settingsService } from '@/utils/settings/settingsService';
 *   
 *   // Get settings
 *   const platforms = await settingsService.getExportPlatforms();
 *   
 *   // Update settings
 *   await settingsService.setExportPlatforms({ claude: true, chatgpt: false });
 *   
 *   // Listen for changes
 *   settingsService.subscribe((event) => {
 *     console.log('Settings changed:', event.type, event.newValue);
 *   });
 */

import type {
  ExportPlatformSettings,
  UISettings,
  AgentSettings,
  DebugSettings,
  AccountInfo,
  AllSettings,
  SettingsChangeEvent,
  SettingsChangeListener,
  SettingsChangeType,
} from './types';

import {
  DEFAULT_EXPORT_PLATFORMS,
  DEFAULT_UI_SETTINGS,
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_DEBUG_SETTINGS,
  DEFAULT_ALL_SETTINGS,
  STORAGE_KEYS,
} from './types';

// ============================================================================
// Settings Service Class
// ============================================================================

class SettingsService {
  private listeners: Set<SettingsChangeListener> = new Set();
  private context: 'dashboard' | 'sidepanel' | 'background' | 'unknown' = 'unknown';
  private initialized = false;

  /**
   * Initialize the service and set up storage change listeners
   */
  async init(context: 'dashboard' | 'sidepanel' | 'background'): Promise<void> {
    if (this.initialized) return;
    
    this.context = context;
    this.initialized = true;

    // Listen for storage changes from other contexts
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      this.handleStorageChanges(changes);
    });
  }

  /**
   * Handle storage changes and notify listeners
   */
  private handleStorageChanges(changes: { [key: string]: browser.storage.StorageChange }): void {
    for (const [key, change] of Object.entries(changes)) {
      const type = this.keyToChangeType(key);
      if (!type) continue;

      const event: SettingsChangeEvent = {
        type,
        key,
        oldValue: change.oldValue,
        newValue: change.newValue,
        source: 'unknown', // We can't know the source from storage API
      };

      this.notifyListeners(event);
    }
  }

  /**
   * Map storage key to change type
   */
  private keyToChangeType(key: string): SettingsChangeType | null {
    switch (key) {
      case STORAGE_KEYS.EXPORT_PLATFORMS:
        return 'exportPlatforms';
      case STORAGE_KEYS.UI_SETTINGS:
        return 'ui';
      case STORAGE_KEYS.AGENT_SETTINGS:
        return 'agent';
      case STORAGE_KEYS.DEBUG_SETTINGS:
        return 'debug';
      case STORAGE_KEYS.CURRENT_ACCOUNT:
      case STORAGE_KEYS.ACCOUNTS:
        return 'account';
      case STORAGE_KEYS.WORKSPACE_CONFIG:
        return 'workspace';
      default:
        return null;
    }
  }

  /**
   * Notify all listeners of a change
   */
  private notifyListeners(event: SettingsChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[SettingsService] Listener error:', error);
      }
    }
  }

  /**
   * Subscribe to settings changes
   */
  subscribe(listener: SettingsChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Unsubscribe from settings changes
   */
  unsubscribe(listener: SettingsChangeListener): void {
    this.listeners.delete(listener);
  }

  // ==========================================================================
  // Export Platform Settings
  // ==========================================================================

  async getExportPlatforms(): Promise<ExportPlatformSettings> {
    const result = await browser.storage.local.get(STORAGE_KEYS.EXPORT_PLATFORMS);
    const stored = result[STORAGE_KEYS.EXPORT_PLATFORMS];
    return { ...DEFAULT_EXPORT_PLATFORMS, ...stored };
  }

  async setExportPlatforms(settings: Partial<ExportPlatformSettings>): Promise<void> {
    const current = await this.getExportPlatforms();
    const updated = { ...current, ...settings };
    await browser.storage.local.set({ [STORAGE_KEYS.EXPORT_PLATFORMS]: updated });
  }

  async toggleExportPlatform(platform: keyof ExportPlatformSettings): Promise<boolean> {
    const current = await this.getExportPlatforms();
    const newValue = !current[platform];
    await this.setExportPlatforms({ [platform]: newValue });
    return newValue;
  }

  // ==========================================================================
  // UI Settings
  // ==========================================================================

  async getUISettings(): Promise<UISettings> {
    const result = await browser.storage.local.get(STORAGE_KEYS.UI_SETTINGS);
    const stored = result[STORAGE_KEYS.UI_SETTINGS];
    return { ...DEFAULT_UI_SETTINGS, ...stored };
  }

  async setUISettings(settings: Partial<UISettings>): Promise<void> {
    const current = await this.getUISettings();
    const updated = { ...current, ...settings };
    await browser.storage.local.set({ [STORAGE_KEYS.UI_SETTINGS]: updated });
  }

  async toggleDarkMode(): Promise<boolean> {
    const current = await this.getUISettings();
    const newValue = !current.darkMode;
    await this.setUISettings({ darkMode: newValue });
    return newValue;
  }

  // ==========================================================================
  // Agent Settings
  // ==========================================================================

  async getAgentSettings(): Promise<AgentSettings> {
    const result = await browser.storage.local.get(STORAGE_KEYS.AGENT_SETTINGS);
    const stored = result[STORAGE_KEYS.AGENT_SETTINGS];
    return { ...DEFAULT_AGENT_SETTINGS, ...stored };
  }

  async setAgentSettings(settings: Partial<AgentSettings>): Promise<void> {
    const current = await this.getAgentSettings();
    const updated = { ...current, ...settings };
    await browser.storage.local.set({ [STORAGE_KEYS.AGENT_SETTINGS]: updated });
  }

  async toggleAgentMode(): Promise<boolean> {
    const current = await this.getAgentSettings();
    const newValue = !current.enabled;
    await this.setAgentSettings({ enabled: newValue });
    return newValue;
  }

  // ==========================================================================
  // Debug Settings
  // ==========================================================================

  async getDebugSettings(): Promise<DebugSettings> {
    const result = await browser.storage.local.get(STORAGE_KEYS.DEBUG_SETTINGS);
    const stored = result[STORAGE_KEYS.DEBUG_SETTINGS];
    return { ...DEFAULT_DEBUG_SETTINGS, ...stored };
  }

  async setDebugSettings(settings: Partial<DebugSettings>): Promise<void> {
    const current = await this.getDebugSettings();
    const updated = { ...current, ...settings };
    await browser.storage.local.set({ [STORAGE_KEYS.DEBUG_SETTINGS]: updated });
  }

  async toggleDebugMode(): Promise<boolean> {
    const current = await this.getDebugSettings();
    const newValue = !current.enabled;
    await this.setDebugSettings({ enabled: newValue });
    return newValue;
  }

  // ==========================================================================
  // Account Settings
  // ==========================================================================

  async getAccounts(): Promise<AccountInfo[]> {
    const result = await browser.storage.local.get(STORAGE_KEYS.ACCOUNTS);
    return result[STORAGE_KEYS.ACCOUNTS] || [];
  }

  async saveAccount(account: AccountInfo): Promise<void> {
    const accounts = await this.getAccounts();
    const index = accounts.findIndex(a => a.id === account.id);
    if (index >= 0) {
      accounts[index] = account;
    } else {
      accounts.push(account);
    }
    await browser.storage.local.set({ [STORAGE_KEYS.ACCOUNTS]: accounts });
  }

  async removeAccount(accountId: string): Promise<void> {
    const accounts = await this.getAccounts();
    const filtered = accounts.filter(a => a.id !== accountId);
    await browser.storage.local.set({ [STORAGE_KEYS.ACCOUNTS]: filtered });
  }

  async getCurrentAccountId(): Promise<string | null> {
    const result = await browser.storage.local.get(STORAGE_KEYS.CURRENT_ACCOUNT);
    return result[STORAGE_KEYS.CURRENT_ACCOUNT] || null;
  }

  async setCurrentAccount(accountId: string): Promise<void> {
    await browser.storage.local.set({ [STORAGE_KEYS.CURRENT_ACCOUNT]: accountId });
  }

  async getCurrentAccount(): Promise<AccountInfo | null> {
    const accountId = await this.getCurrentAccountId();
    if (!accountId) return null;
    
    const accounts = await this.getAccounts();
    return accounts.find(a => a.id === accountId) || null;
  }

  // ==========================================================================
  // All Settings
  // ==========================================================================

  async getAllSettings(): Promise<AllSettings> {
    const [exportPlatforms, ui, agent, debug, currentAccountId] = await Promise.all([
      this.getExportPlatforms(),
      this.getUISettings(),
      this.getAgentSettings(),
      this.getDebugSettings(),
      this.getCurrentAccountId(),
    ]);

    return {
      exportPlatforms,
      ui,
      agent,
      debug,
      currentAccountId,
    };
  }

  async resetAllSettings(): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEYS.EXPORT_PLATFORMS]: { ...DEFAULT_EXPORT_PLATFORMS },
      [STORAGE_KEYS.UI_SETTINGS]: { ...DEFAULT_UI_SETTINGS },
      [STORAGE_KEYS.AGENT_SETTINGS]: { ...DEFAULT_AGENT_SETTINGS },
      [STORAGE_KEYS.DEBUG_SETTINGS]: { ...DEFAULT_DEBUG_SETTINGS },
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const settingsService = new SettingsService();

// Re-export types for convenience
export type {
  ExportPlatformSettings,
  UISettings,
  AgentSettings,
  DebugSettings,
  AccountInfo,
  AllSettings,
  SettingsChangeEvent,
  SettingsChangeListener,
} from './types';
