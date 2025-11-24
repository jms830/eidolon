/**
 * Sync-related type definitions
 */

export interface WorkspaceConfig {
  /** Path to workspace root (for display only) */
  workspacePath: string;
  /** Project ID to folder name mapping */
  projectMap: Record<string, string>; // projectId → folderName
  /** Last successful sync timestamp */
  lastSync: string | null; // ISO timestamp
  /** Sync settings */
  settings: SyncSettings;
}

export interface SyncSettings {
  /** Enable automatic background sync */
  autoSync: boolean;
  /** Sync interval in minutes (0 = disabled) */
  syncInterval: number;
  /** Enable bidirectional sync (upload local changes) */
  bidirectional: boolean;
  /** Include chat conversations in sync */
  syncChats: boolean;
  /** Automatically add .md extension to files without extensions */
  autoAddMdExtension: boolean;
  /** Ensure AGENTS.md files include Agent Skills YAML frontmatter */
  ensureAgentsFrontmatter: boolean;
  /** Conflict resolution strategy */
  conflictStrategy: ConflictStrategy;
}

export type ConflictStrategy = 'remote' | 'local' | 'newer' | 'prompt';

export interface ProjectMetadata {
  /** Claude.ai project ID */
  id: string;
  /** Project name */
  name: string;
  /** Organization ID */
  orgId: string;
  /** Last sync timestamp */
  syncedAt: string; // ISO timestamp
  /** File hashes for change detection */
  fileHashes?: Record<string, string>; // fileName → hash
}

export interface SyncStats {
  /** Number of projects created locally */
  created: number;
  /** Number of projects updated */
  updated: number;
  /** Number of projects skipped (no changes) */
  skipped: number;
  /** Number of errors */
  errors: number;
  /** Number of files uploaded (bidirectional only) */
  uploaded?: number;
  /** Number of conflicts detected */
  conflicts?: number;
  /** Number of chats synced */
  chats?: number;
}

export interface SyncResult {
  success: boolean;
  stats: SyncStats;
  errors: string[];
}

export interface FileDiff {
  /** File name */
  name: string;
  /** Diff status */
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  /** Local file hash (if exists) */
  localHash?: string;
  /** Remote file hash (if exists) */
  remoteHash?: string;
}

export interface ProjectDiff {
  /** Project name */
  name: string;
  /** Project ID */
  id: string;
  /** Folder name */
  folder: string;
  /** Has any differences */
  hasDifferences: boolean;
  /** Files only on remote */
  remoteOnlyFiles: string[];
  /** Files only locally */
  localOnlyFiles: string[];
  /** Modified files */
  modifiedFiles: string[];
  /** Modified files with timestamp info */
  modifiedFilesInfo?: Record<string, {
    localTime?: number;   // Local file timestamp (ms since epoch)
    remoteTime?: number;  // Remote file timestamp (ms since epoch)
    isLocalNewer?: boolean; // True if local is newer than remote
  }>;
  /** Renamed files (old name -> new name) */
  renamedFiles?: Array<{ oldName: string; newName: string }>;
}

export interface WorkspaceDiff {
  /** Summary statistics */
  summary: {
    remoteProjects: number;
    localFolders: number;
    matched: number;
    remoteOnly: number;
    localOnly: number;
  };
  /** Projects only on remote */
  remoteOnly: Array<{ id: string; name: string; sanitizedName: string; fileCount?: number }>;
  /** Folders only locally */
  localOnly: string[];
  /** Matched projects with details */
  matched: ProjectDiff[];
}

export interface SyncProgress {
  /** Current phase */
  phase: 'initializing' | 'fetching' | 'syncing' | 'complete' | 'error';
  /** Current project being synced */
  currentProject?: string;
  /** Total projects */
  totalProjects: number;
  /** Projects completed */
  completedProjects: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Status message */
  message: string;
}
