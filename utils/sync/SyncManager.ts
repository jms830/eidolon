/**
 * Main sync manager - orchestrates workspace synchronization
 */

import type { ClaudeAPIClient } from '../api/client';
import type {
  WorkspaceConfig,
  SyncStats,
  SyncResult,
  ProjectMetadata,
  SyncProgress,
  ConflictStrategy,
} from './types';
import { computeFileHash } from './hashUtils';
import {
  getOrCreateDirectory,
  writeTextFile,
  readTextFile,
  listFiles,
  sanitizeProjectName,
} from './fileSystem';
import {
  getWorkspaceConfig,
  saveWorkspaceConfig,
  addProjectMapping,
  updateLastSync,
} from './workspaceConfig';

export class SyncManager {
  private apiClient: ClaudeAPIClient;
  private progressCallback?: (progress: SyncProgress) => void;

  constructor(apiClient: ClaudeAPIClient) {
    this.apiClient = apiClient;
  }

  /**
   * Set progress callback for UI updates
   */
  setProgressCallback(callback: (progress: SyncProgress) => void) {
    this.progressCallback = callback;
  }

  /**
   * Report progress
   */
  private reportProgress(progress: Partial<SyncProgress>) {
    if (this.progressCallback) {
      const fullProgress: SyncProgress = {
        phase: 'syncing',
        totalProjects: 0,
        completedProjects: 0,
        percentage: 0,
        message: '',
        ...progress,
      };
      this.progressCallback(fullProgress);
    }
  }

  /**
   * Download sync - pull all projects from Claude.ai to local workspace
   */
  async downloadSync(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string,
    dryRun: boolean = false
  ): Promise<SyncResult> {
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };
    const errors: string[] = [];

    try {
      this.reportProgress({
        phase: 'fetching',
        message: 'Fetching projects from Claude.ai...',
        percentage: 0,
      });

      // Fetch all projects
      const projects = await this.apiClient.getProjects(orgId);
      if (!projects || projects.length === 0) {
        return {
          success: true,
          stats,
          errors: ['No projects found'],
        };
      }

      this.reportProgress({
        phase: 'syncing',
        totalProjects: projects.length,
        completedProjects: 0,
        percentage: 0,
        message: `Syncing ${projects.length} projects...`,
      });

      const config = await getWorkspaceConfig();

      // Sync each project
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        try {
          const result = await this.syncProject(
            workspaceHandle,
            orgId,
            project,
            config,
            dryRun
          );

          stats[result]++;

          this.reportProgress({
            phase: 'syncing',
            currentProject: project.name,
            totalProjects: projects.length,
            completedProjects: i + 1,
            percentage: Math.round(((i + 1) / projects.length) * 100),
            message: `Synced ${i + 1}/${projects.length} projects`,
          });
        } catch (error) {
          stats.errors++;
          errors.push(`${project.name}: ${(error as Error).message}`);
          console.error(`Error syncing project ${project.name}:`, error);
        }
      }

      // Save updated config
      if (!dryRun) {
        await saveWorkspaceConfig(config);
        await updateLastSync();
      }

      this.reportProgress({
        phase: 'complete',
        totalProjects: projects.length,
        completedProjects: projects.length,
        percentage: 100,
        message: 'Sync complete!',
      });

      return {
        success: stats.errors === 0,
        stats,
        errors,
      };
    } catch (error) {
      this.reportProgress({
        phase: 'error',
        totalProjects: 0,
        completedProjects: 0,
        percentage: 0,
        message: `Sync failed: ${(error as Error).message}`,
      });

      return {
        success: false,
        stats,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Sync individual project
   */
  private async syncProject(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string,
    project: any,
    config: WorkspaceConfig,
    dryRun: boolean
  ): Promise<'created' | 'updated' | 'skipped'> {
    const projectId = project.uuid;
    const projectName = project.name;

    // Determine folder name
    let folderName = config.projectMap[projectId];
    if (!folderName) {
      folderName = sanitizeProjectName(projectName);

      // Check for naming conflicts
      const reverseMap = Object.fromEntries(
        Object.entries(config.projectMap).map(([k, v]) => [v, k])
      );
      if (reverseMap[folderName] && reverseMap[folderName] !== projectId) {
        // Conflict - append counter
        let counter = 1;
        let uniqueName = `${folderName}_${counter}`;
        while (reverseMap[uniqueName]) {
          counter++;
          uniqueName = `${folderName}_${counter}`;
        }
        folderName = uniqueName;
      }
    }

    if (dryRun) {
      // Just report what would happen
      try {
        await workspaceHandle.getDirectoryHandle(folderName);
        return 'updated';
      } catch {
        return 'created';
      }
    }

    // Create project folder
    const projectHandle = await getOrCreateDirectory(workspaceHandle, folderName);
    const isNew = !config.projectMap[projectId];

    // Update project mapping
    config.projectMap[projectId] = folderName;

    // Sync project instructions to AGENTS.md
    try {
      const instructionsData = await this.apiClient.getProjectInstructions(orgId, projectId);
      if (instructionsData && instructionsData.content) {
        const instructions = instructionsData.content.trim();
        if (instructions) {
          const existingInstructions = await readTextFile(projectHandle, 'AGENTS.md');
          if (existingInstructions !== instructions) {
            await writeTextFile(projectHandle, 'AGENTS.md', instructions);
          }
        }
      }
    } catch (error) {
      console.warn(`Could not sync instructions for ${projectName}:`, error);
    }

    // Fetch project files
    const files = await this.apiClient.getProjectFiles(orgId, projectId);
    if (!files || files.length === 0) {
      // Save metadata even if no files
      await this.saveProjectMetadata(projectHandle, {
        id: projectId,
        name: projectName,
        orgId,
        syncedAt: new Date().toISOString(),
      });
      return isNew ? 'created' : 'skipped';
    }

    // Create context folder for knowledge files
    const contextHandle = await getOrCreateDirectory(projectHandle, 'context');

    // Download files to context folder
    let filesUpdated = 0;
    for (const file of files) {
      // Skip AGENTS.md (already handled above)
      if (file.file_name === 'AGENTS.md') {
        continue;
      }

      try {
        const existingContent = await readTextFile(contextHandle, file.file_name);
        const remoteContent = file.content;

        // Check if content changed
        if (existingContent !== null) {
          const localHash = await computeFileHash(existingContent);
          const remoteHash = await computeFileHash(remoteContent);
          if (localHash === remoteHash) {
            continue; // No change
          }
        }

        // Write file
        await writeTextFile(contextHandle, file.file_name, remoteContent);
        filesUpdated++;
      } catch (error) {
        console.error(`Error syncing file ${file.file_name}:`, error);
      }
    }

    // Sync chat conversations if enabled
    if (config.settings.syncChats) {
      try {
        // Fetch all conversations for this organization
        const allConversations = await this.apiClient.getConversations(orgId);

        // Filter conversations that belong to this project
        const projectConversations = allConversations.filter(
          conv => conv.project_uuid === projectId
        );

        if (projectConversations.length > 0) {
          // Create chats folder
          const chatsHandle = await getOrCreateDirectory(projectHandle, 'chats');

          // Download each conversation with full message history
          for (const conversation of projectConversations) {
            try {
              // Fetch full conversation with messages
              const fullConversation = await this.apiClient.getConversation(
                orgId,
                conversation.uuid
              );

              // Format conversation as markdown
              const markdown = this.formatConversationAsMarkdown(fullConversation);

              // Sanitize conversation name for filename
              const fileName = this.sanitizeFileName(conversation.name) + '.md';

              // Write to chats folder
              await writeTextFile(chatsHandle, fileName, markdown);
            } catch (error) {
              console.error(
                `Error syncing conversation ${conversation.name}:`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.warn(`Could not sync conversations for ${projectName}:`, error);
      }
    }

    // Save project metadata
    await this.saveProjectMetadata(projectHandle, {
      id: projectId,
      name: projectName,
      orgId,
      syncedAt: new Date().toISOString(),
    });

    return isNew ? 'created' : filesUpdated > 0 ? 'updated' : 'skipped';
  }

  /**
   * Save project metadata to .claudesync/project.json
   */
  private async saveProjectMetadata(
    projectHandle: FileSystemDirectoryHandle,
    metadata: ProjectMetadata
  ): Promise<void> {
    const metadataHandle = await getOrCreateDirectory(projectHandle, '.claudesync');
    const metadataJson = JSON.stringify(metadata, null, 2);
    await writeTextFile(metadataHandle, 'project.json', metadataJson);
  }

  /**
   * Read project metadata from .claudesync/project.json
   */
  private async readProjectMetadata(
    projectHandle: FileSystemDirectoryHandle
  ): Promise<ProjectMetadata | null> {
    try {
      const metadataHandle = await projectHandle.getDirectoryHandle('.claudesync');
      const metadataJson = await readTextFile(metadataHandle, 'project.json');
      if (!metadataJson) return null;
      return JSON.parse(metadataJson);
    } catch {
      return null;
    }
  }

  /**
   * Format conversation with messages as markdown
   */
  private formatConversationAsMarkdown(
    conversation: any & { chat_messages: any[] }
  ): string {
    const lines: string[] = [];

    // Title and metadata
    lines.push(`# ${conversation.name}\n`);
    lines.push(`**Created:** ${new Date(conversation.created_at).toLocaleString()}`);
    lines.push(`**Updated:** ${new Date(conversation.updated_at).toLocaleString()}`);
    lines.push(`**Conversation ID:** ${conversation.uuid}\n`);
    lines.push('---\n');

    // Messages
    if (conversation.chat_messages && conversation.chat_messages.length > 0) {
      for (const message of conversation.chat_messages) {
        const sender = message.sender === 'human' ? '👤 **You**' : '🤖 **Claude**';
        const timestamp = new Date(message.created_at).toLocaleString();

        lines.push(`## ${sender}`);
        lines.push(`*${timestamp}*\n`);
        lines.push(message.text);
        lines.push('\n---\n');
      }
    } else {
      lines.push('*No messages in this conversation*\n');
    }

    return lines.join('\n');
  }

  /**
   * Sanitize conversation name for use as filename
   */
  private sanitizeFileName(name: string): string {
    // Replace invalid filename characters with underscores
    return name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 200); // Limit length
  }

  /**
   * Bidirectional sync - TODO: Phase 2
   */
  async bidirectionalSync(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string,
    conflictStrategy: ConflictStrategy,
    dryRun: boolean = false
  ): Promise<SyncResult> {
    // TODO: Implement in Phase 2
    throw new Error('Bidirectional sync not yet implemented');
  }

  /**
   * Get workspace diff - compare local workspace with remote Claude.ai
   */
  async getWorkspaceDiff(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string
  ): Promise<import('./types').WorkspaceDiff> {
    const config = await getWorkspaceConfig();

    // Fetch remote projects
    const remoteProjects = await this.apiClient.getProjects(orgId);

    // Get local folders
    const localFolders = new Set<string>();
    for await (const entry of workspaceHandle.values()) {
      if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
        localFolders.add(entry.name);
      }
    }

    // Build reverse map: folderName → projectId
    const reverseMap = Object.fromEntries(
      Object.entries(config.projectMap).map(([id, folder]) => [folder, id])
    );

    const remoteOnly: Array<{ id: string; name: string; sanitizedName: string; fileCount?: number }> = [];
    const matched: import('./types').ProjectDiff[] = [];
    const localOnlyFolders = new Set(localFolders);

    // Process remote projects
    for (const project of remoteProjects) {
      const folderName = config.projectMap[project.uuid] || sanitizeProjectName(project.name);

      if (localFolders.has(folderName)) {
        // Project exists both remotely and locally
        localOnlyFolders.delete(folderName);

        try {
          const projectHandle = await workspaceHandle.getDirectoryHandle(folderName);
          const diff = await this.compareProject(projectHandle, orgId, project);
          matched.push(diff);
        } catch (error) {
          console.error(`Error comparing project ${project.name}:`, error);
        }
      } else {
        // Project only exists remotely
        const files = await this.apiClient.getProjectFiles(orgId, project.uuid);
        remoteOnly.push({
          id: project.uuid,
          name: project.name,
          sanitizedName: folderName,
          fileCount: files?.length || 0
        });
      }
    }

    return {
      summary: {
        remoteProjects: remoteProjects.length,
        localFolders: localFolders.size,
        matched: matched.length,
        remoteOnly: remoteOnly.length,
        localOnly: localOnlyFolders.size
      },
      remoteOnly,
      localOnly: Array.from(localOnlyFolders),
      matched
    };
  }

  /**
   * Compare single project between local and remote
   */
  private async compareProject(
    projectHandle: FileSystemDirectoryHandle,
    orgId: string,
    remoteProject: any
  ): Promise<import('./types').ProjectDiff> {
    const metadata = await this.readProjectMetadata(projectHandle);
    const config = await getWorkspaceConfig();

    // Fetch remote files
    const remoteFiles = await this.apiClient.getProjectFiles(orgId, remoteProject.uuid);
    const remoteFileMap = new Map(
      remoteFiles.map(f => [f.file_name, f])
    );

    // Get local files from context folder
    let localFiles: string[] = [];
    try {
      const contextHandle = await projectHandle.getDirectoryHandle('context');
      localFiles = await listFiles(contextHandle);
    } catch {
      // No context folder yet
    }

    const localFileSet = new Set(localFiles);
    const remoteFileSet = new Set(remoteFiles.map(f => f.file_name));

    // Check for AGENTS.md separately (lives in project root, not context/)
    const hasLocalAgents = await readTextFile(projectHandle, 'AGENTS.md') !== null;
    if (hasLocalAgents) {
      localFileSet.add('AGENTS.md');
    }

    // Fetch remote instructions
    let hasRemoteAgents = false;
    try {
      const instructionsData = await this.apiClient.getProjectInstructions(orgId, remoteProject.uuid);
      if (instructionsData && instructionsData.content && instructionsData.content.trim()) {
        hasRemoteAgents = true;
        remoteFileSet.add('AGENTS.md');
      }
    } catch {
      // No instructions
    }

    // Compute differences
    const remoteOnlyFiles: string[] = [];
    const localOnlyFiles: string[] = [];
    const modifiedFiles: string[] = [];

    // Files only in remote
    for (const fileName of remoteFileSet) {
      if (!localFileSet.has(fileName)) {
        remoteOnlyFiles.push(fileName);
      }
    }

    // Files only locally
    for (const fileName of localFileSet) {
      if (!remoteFileSet.has(fileName)) {
        localOnlyFiles.push(fileName);
      }
    }

    // Check for modifications in common files
    for (const fileName of localFileSet) {
      if (remoteFileSet.has(fileName)) {
        try {
          let localContent: string | null = null;
          let remoteContent: string = '';

          if (fileName === 'AGENTS.md') {
            localContent = await readTextFile(projectHandle, 'AGENTS.md');
            const instructionsData = await this.apiClient.getProjectInstructions(
              orgId,
              remoteProject.uuid
            );
            remoteContent = instructionsData?.content?.trim() || '';
          } else {
            const contextHandle = await projectHandle.getDirectoryHandle('context');
            localContent = await readTextFile(contextHandle, fileName);
            const remoteFile = remoteFileMap.get(fileName);
            remoteContent = remoteFile?.content || '';
          }

          if (localContent !== null) {
            const localHash = await computeFileHash(localContent);
            const remoteHash = await computeFileHash(remoteContent);

            if (localHash !== remoteHash) {
              modifiedFiles.push(fileName);
            }
          }
        } catch (error) {
          console.error(`Error comparing file ${fileName}:`, error);
        }
      }
    }

    const hasDifferences =
      remoteOnlyFiles.length > 0 ||
      localOnlyFiles.length > 0 ||
      modifiedFiles.length > 0;

    return {
      name: remoteProject.name,
      id: remoteProject.uuid,
      folder: config.projectMap[remoteProject.uuid] || sanitizeProjectName(remoteProject.name),
      hasDifferences,
      remoteOnlyFiles,
      localOnlyFiles,
      modifiedFiles
    };
  }
}
