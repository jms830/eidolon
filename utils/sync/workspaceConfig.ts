/**
 * Workspace configuration management
 * Handles storing/retrieving workspace settings in chrome.storage
 */

import type { WorkspaceConfig, SyncSettings } from './types';
import {
  saveWorkspaceHandle as saveHandleToIDB,
  getWorkspaceHandle as getHandleFromIDB,
  clearWorkspaceHandle as clearHandleFromIDB,
  verifyHandlePermission
} from './handleStorage';

const WORKSPACE_CONFIG_KEY = 'workspaceConfig';
const WORKSPACE_HANDLE_KEY = 'workspaceHandle';

const DEFAULT_SETTINGS: SyncSettings = {
  autoSync: false,
  syncInterval: 15, // 15 minutes
  bidirectional: false,
  syncChats: false,
  autoAddMdExtension: true, // Automatically add .md extension to files without extensions
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
 * NOTE: FileSystemDirectoryHandle objects CAN be persisted in IndexedDB.
 * They are stored directly in IndexedDB (not chrome.storage) which preserves
 * the handle properly. Permission must be re-verified on retrieval.
 */

/**
 * Store workspace directory handle in IndexedDB
 */
export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return saveHandleToIDB(handle);
}

/**
 * Retrieve workspace directory handle from IndexedDB
 * Returns null if not stored or permission denied
 */
export async function getWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getHandleFromIDB();

  if (!handle) {
    return null;
  }

  // Verify permission still valid
  const hasPermission = await verifyHandlePermission(handle);
  if (!hasPermission) {
    // Permission lost, clear the handle
    await clearHandleFromIDB();
    return null;
  }

  return handle;
}

/**
 * Clear workspace handle from IndexedDB
 */
export async function clearWorkspaceHandle(): Promise<void> {
  return clearHandleFromIDB();
}
