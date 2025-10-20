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
      startIn: 'documents',
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
 */
export async function verifyPermission(
  dirHandle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  // Test actual access by trying to enumerate the directory
  // This is more reliable than queryPermission which may not be available
  try {
    // Try to iterate the directory - this will fail if we don't have permission
    const iterator = dirHandle.values();
    await iterator.next();

    // If we need write permission, try to verify we can write
    if (mode === 'readwrite') {
      // Try to create a temporary test file to verify write access
      try {
        const testFile = await dirHandle.getFileHandle('.eidolon-test', { create: true });
        const writable = await testFile.createWritable();
        await writable.write('test');
        await writable.close();
        // Clean up test file
        await dirHandle.removeEntry('.eidolon-test').catch(() => {});
        return true;
      } catch (writeError) {
        console.warn('Write permission test failed:', writeError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Permission verification failed:', error);
    return false;
  }
}
