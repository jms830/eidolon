/**
 * IndexedDB storage for FileSystemDirectoryHandle
 * Handles CAN be persisted in IndexedDB (not chrome.storage due to structured cloning)
 */

const DB_NAME = 'EidolonHandles';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const WORKSPACE_HANDLE_KEY = 'workspaceHandle';

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Save workspace directory handle to IndexedDB
 */
export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    store.put(handle, WORKSPACE_HANDLE_KEY);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Failed to save workspace handle:', error);
    throw error;
  }
}

/**
 * Retrieve workspace directory handle from IndexedDB
 */
export async function getWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(WORKSPACE_HANDLE_KEY);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Failed to get workspace handle:', error);
    return null;
  }
}

/**
 * Clear workspace handle from IndexedDB
 */
export async function clearWorkspaceHandle(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    store.delete(WORKSPACE_HANDLE_KEY);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Failed to clear workspace handle:', error);
    throw error;
  }
}

/**
 * Verify that a stored handle still has permission
 */
export async function verifyHandlePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      return true;
    }

    // Try to request permission
    const requestedPermission = await handle.requestPermission({ mode: 'readwrite' });
    return requestedPermission === 'granted';
  } catch (error) {
    console.error('Failed to verify handle permission:', error);
    return false;
  }
}
