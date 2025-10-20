/**
 * Workspace configuration management
 * Handles storing/retrieving workspace settings in chrome.storage
 */

import type { WorkspaceConfig, SyncSettings } from './types';

const WORKSPACE_CONFIG_KEY = 'workspaceConfig';
const WORKSPACE_HANDLE_KEY = 'workspaceHandle';

const DEFAULT_SETTINGS: SyncSettings = {
  autoSync: false,
  syncInterval: 15, // 15 minutes
  bidirectional: false,
  syncChats: false,
  conflictStrategy: 'remote',
};

const DEFAULT_CONFIG: WorkspaceConfig = {
  workspacePath: '',
  projectMap: {},
  lastSync: null,
  settings: DEFAULT_SETTINGS,
};

/**
 * Get workspace configuration
 */
export async function getWorkspaceConfig(): Promise<WorkspaceConfig> {
  const result = await browser.storage.local.get(WORKSPACE_CONFIG_KEY);
  return result[WORKSPACE_CONFIG_KEY] || DEFAULT_CONFIG;
}

/**
 * Save workspace configuration
 */
export async function saveWorkspaceConfig(config: WorkspaceConfig): Promise<void> {
  await browser.storage.local.set({ [WORKSPACE_CONFIG_KEY]: config });
}

/**
 * Update workspace path
 */
export async function updateWorkspacePath(path: string): Promise<void> {
  const config = await getWorkspaceConfig();
  config.workspacePath = path;
  await saveWorkspaceConfig(config);
}

/**
 * Update sync settings
 */
export async function updateSyncSettings(settings: Partial<SyncSettings>): Promise<void> {
  const config = await getWorkspaceConfig();
  config.settings = { ...config.settings, ...settings };
  await saveWorkspaceConfig(config);
}

/**
 * Add project to mapping
 */
export async function addProjectMapping(projectId: string, folderName: string): Promise<void> {
  const config = await getWorkspaceConfig();
  config.projectMap[projectId] = folderName;
  await saveWorkspaceConfig(config);
}

/**
 * Update last sync timestamp
 */
export async function updateLastSync(): Promise<void> {
  const config = await getWorkspaceConfig();
  config.lastSync = new Date().toISOString();
  await saveWorkspaceConfig(config);
}

/**
 * Clear workspace configuration
 */
export async function clearWorkspaceConfig(): Promise<void> {
  await browser.storage.local.remove([WORKSPACE_CONFIG_KEY, WORKSPACE_HANDLE_KEY]);
}

/**
 * Check if workspace is configured
 */
export async function isWorkspaceConfigured(): Promise<boolean> {
  const config = await getWorkspaceConfig();
  return !!config.workspacePath;
}

/**
 * Get project folder name from ID
 */
export async function getProjectFolder(projectId: string): Promise<string | null> {
  const config = await getWorkspaceConfig();
  return config.projectMap[projectId] || null;
}

/**
 * Get all project mappings
 */
export async function getAllProjectMappings(): Promise<Record<string, string>> {
  const config = await getWorkspaceConfig();
  return config.projectMap;
}

/**
 * NOTE: FileSystemDirectoryHandle objects CANNOT be reliably persisted.
 * When stored in IndexedDB, they undergo structured cloning which strips
 * all prototype methods. The handles must be re-acquired via user interaction
 * (showDirectoryPicker) each session.
 *
 * These functions are kept for config management only.
 */

/**
 * Store workspace directory handle - NO-OP
 * Handles cannot be persisted. This is kept for backwards compatibility.
 * @deprecated Use session-based handle management instead
 */
export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  // No-op: handles cannot be persisted reliably
  console.warn('saveWorkspaceHandle called but handles cannot be persisted. User will need to re-select directory each session.');
}

/**
 * Retrieve workspace directory handle - always returns null
 * Handles cannot be retrieved. User must re-select via showDirectoryPicker.
 * @deprecated Use session-based handle management instead
 */
export async function getWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  // Always return null - user must re-select directory
  return null;
}

/**
 * Clear workspace handle - NO-OP
 * @deprecated No longer storing handles
 */
export async function clearWorkspaceHandle(): Promise<void> {
  // No-op: not storing handles anymore
}
