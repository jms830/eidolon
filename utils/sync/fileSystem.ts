/**
 * File System Access API utilities for workspace management
 */

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

/**
 * Request user to select workspace directory
 */
export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'eidolon-workspace', // Browser uses this ID to remember the last location
      // Removed startIn to let browser remember last selection
    });
    return dirHandle;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      // User cancelled
      return null;
    }
    throw error;
  }
}

/**
 * Create a directory (or get existing)
 */
export async function getOrCreateDirectory(
  parentHandle: FileSystemDirectoryHandle,
  dirName: string
): Promise<FileSystemDirectoryHandle> {
  return await parentHandle.getDirectoryHandle(dirName, { create: true });
}

/**
 * Write text file
 */
export async function writeTextFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Read text file
 */
export async function readTextFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<string | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (error) {
    if ((error as Error).name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if file exists
 */
export async function fileExists(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(fileName);
    return true;
  } catch (error) {
    if ((error as Error).name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * List all files in directory
 */
export async function listFiles(
  dirHandle: FileSystemDirectoryHandle
): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      files.push(entry.name);
    }
  }
  return files;
}

/**
 * List all subdirectories
 */
export async function listDirectories(
  dirHandle: FileSystemDirectoryHandle
): Promise<string[]> {
  const dirs: string[] = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      dirs.push(entry.name);
    }
  }
  return dirs;
}

/**
 * Delete file
 */
export async function deleteFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<void> {
  await dirHandle.removeEntry(fileName);
}

/**
 * Get file modification time
 */
export async function getFileModifiedTime(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<number | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.lastModified;
  } catch (error) {
    if ((error as Error).name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

/**
 * Sanitize project name for filesystem (remove unsafe characters)
 */
export function sanitizeProjectName(name: string): string {
  // Remove filesystem-unsafe characters: < > : " | ? * / \
  // Preserve emojis and Unicode
  const sanitized = name.replace(/[<>:"|?*/\\]+/g, '').trim();
  return sanitized || 'unnamed_project';
}

/**
 * Request permission for directory handle (if needed)
 * Based on Chrome's official File System Access API example
 */
export async function verifyPermission(
  dirHandle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  const options: FileSystemHandlePermissionDescriptor = { mode };

  // Check if permission was already granted. If so, return true.
  if ((await dirHandle.queryPermission(options)) === 'granted') {
    return true;
  }

  // Request permission. If the user grants permission, return true.
  if ((await dirHandle.requestPermission(options)) === 'granted') {
    return true;
  }

  // The user didn't grant permission, so return false.
  return false;
}
