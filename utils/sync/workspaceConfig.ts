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
 * Store workspace directory handle in IndexedDB
 * Note: FileSystemDirectoryHandle can be stored in IndexedDB for persistence
 */
export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  // Store handle in IndexedDB (not chrome.storage as it can't serialize handles)
  const db = await openHandleDB();
  const tx = db.transaction('handles', 'readwrite');
  const store = tx.objectStore('handles');
  await store.put(handle, WORKSPACE_HANDLE_KEY);
  await tx.done;
}

/**
 * Retrieve workspace directory handle from IndexedDB
 */
export async function getWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const handle = await store.get(WORKSPACE_HANDLE_KEY);
    return handle || null;
  } catch (error) {
    console.error('Failed to get workspace handle:', error);
    return null;
  }
}

/**
 * Clear workspace handle
 */
export async function clearWorkspaceHandle(): Promise<void> {
  const db = await openHandleDB();
  const tx = db.transaction('handles', 'readwrite');
  const store = tx.objectStore('handles');
  await store.delete(WORKSPACE_HANDLE_KEY);
  await tx.done;
}

/**
 * Open IndexedDB for storing file system handles
 */
async function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EidolonHandles', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
  });
}
