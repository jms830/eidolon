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
      chats: 0,
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

          stats[result.status]++;
          stats.chats! += result.chatsCount;

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

      // Sync standalone chats (chats without projects) if enabled
      if (config.settings.syncChats) {
        try {
          this.reportProgress({
            phase: 'syncing',
            message: 'Syncing standalone conversations...',
            percentage: 95,
          });

          const standaloneChats = await this.syncConversations(
            workspaceHandle,
            orgId,
            null, // null projectId = standalone chats
            null, // null projectName = standalone chats
            dryRun
          );

          stats.chats! += standaloneChats;
        } catch (error) {
          console.warn('Could not sync standalone conversations:', error);
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
   * Sync only conversations/chats - no file sync
   */
  async chatsOnlySync(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string,
    dryRun: boolean = false
  ): Promise<SyncResult> {
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      chats: 0,
    };
    const errors: string[] = [];

    try {
      this.reportProgress({
        phase: 'fetching',
        message: 'Fetching conversations from Claude.ai...',
        percentage: 0,
      });

      // Fetch all projects to sync their chats
      const projects = await this.apiClient.getProjects(orgId);
      const totalItems = (projects?.length || 0) + 1; // +1 for standalone chats
      let completed = 0;

      const config = await getWorkspaceConfig();

      // Sync chats for each project
      if (projects && projects.length > 0) {
        for (const project of projects) {
          try {
            this.reportProgress({
              phase: 'syncing',
              currentProject: project.name,
              totalProjects: totalItems,
              completedProjects: completed,
              percentage: Math.round((completed / totalItems) * 100),
              message: `Syncing chats for ${project.name}...`,
            });

            const chatCount = await this.syncConversations(
              workspaceHandle,
              orgId,
              project.uuid,
              project.name,
              dryRun
            );

            stats.chats! += chatCount;
            completed++;
          } catch (error) {
            stats.errors++;
            errors.push(`${project.name} chats: ${(error as Error).message}`);
            console.error(`Error syncing chats for ${project.name}:`, error);
          }
        }
      }

      // Sync standalone chats
      try {
        this.reportProgress({
          phase: 'syncing',
          message: 'Syncing standalone conversations...',
          totalProjects: totalItems,
          completedProjects: completed,
          percentage: Math.round((completed / totalItems) * 100),
        });

        const standaloneChats = await this.syncConversations(
          workspaceHandle,
          orgId,
          null,
          null,
          dryRun
        );

        stats.chats! += standaloneChats;
        completed++;
      } catch (error) {
        stats.errors++;
        errors.push(`Standalone chats: ${(error as Error).message}`);
        console.warn('Could not sync standalone conversations:', error);
      }

      if (!dryRun) {
        await updateLastSync();
      }

      this.reportProgress({
        phase: 'complete',
        totalProjects: totalItems,
        completedProjects: completed,
        percentage: 100,
        message: 'Chat sync complete!',
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
        message: `Chat sync failed: ${(error as Error).message}`,
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
  ): Promise<{ status: 'created' | 'updated' | 'skipped'; chatsCount: number }> {
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
      // Just report what would happen - also count chats for dry run
      let chatCount = 0;
      if (config.settings.syncChats) {
        chatCount = await this.syncConversations(
          workspaceHandle,
          orgId,
          projectId,
          projectName,
          true // dry run
        );
      }

      try {
        await workspaceHandle.getDirectoryHandle(folderName);
        return { status: 'updated', chatsCount: chatCount };
      } catch {
        return { status: 'created', chatsCount: chatCount };
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
      // Sync chats even if no files
      let chatsSynced = 0;
      if (config.settings.syncChats) {
        chatsSynced = await this.syncConversations(
          workspaceHandle,
          orgId,
          projectId,
          projectName,
          dryRun
        );
      }

      // Save metadata even if no files
      await this.saveProjectMetadata(projectHandle, {
        id: projectId,
        name: projectName,
        orgId,
        syncedAt: new Date().toISOString(),
      });
      return { status: isNew ? 'created' : 'skipped', chatsCount: chatsSynced };
    }

    // Create context folder for knowledge files
    const contextHandle = await getOrCreateDirectory(projectHandle, 'context');

    // Download files to context folder
    let filesUpdated = 0;
    const fileErrors: string[] = [];
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
        const errorMsg = `${file.file_name}: ${(error as Error).message}`;
        console.error(`Error syncing file ${file.file_name}:`, error);
        fileErrors.push(errorMsg);
      }
    }

    // If any files failed to sync, throw error with details
    if (fileErrors.length > 0) {
      throw new Error(
        `Failed to sync ${fileErrors.length} file(s) in ${projectName}: ${fileErrors.join(', ')}`
      );
    }

    // Sync chat conversations if enabled
    let chatsSynced = 0;
    if (config.settings.syncChats) {
      chatsSynced = await this.syncConversations(
        workspaceHandle,
        orgId,
        projectId,
        projectName,
        dryRun
      );
    }

    // Save project metadata
    await this.saveProjectMetadata(projectHandle, {
      id: projectId,
      name: projectName,
      orgId,
      syncedAt: new Date().toISOString(),
    });

    const status = isNew ? 'created' : filesUpdated > 0 ? 'updated' : 'skipped';
    return { status, chatsCount: chatsSynced };
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
   * Sync conversations for a project or standalone conversations
   * @returns Number of conversations synced
   */
  private async syncConversations(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string,
    projectId: string | null,
    projectName: string | null,
    dryRun: boolean = false
  ): Promise<number> {
    let chatsSynced = 0;

    try {
      // Fetch all conversations for this organization
      const allConversations = await this.apiClient.getConversations(orgId);

      // Filter conversations based on project
      const conversations = projectId
        ? allConversations.filter(conv => conv.project_uuid === projectId)
        : allConversations.filter(conv => !conv.project_uuid);

      if (conversations.length === 0) {
        return 0;
      }

      // Get or create the target directory
      let chatsHandle: FileSystemDirectoryHandle;

      if (projectId && projectName) {
        // Chats belong to a project - save in project/chats/
        const config = await getWorkspaceConfig();
        const folderName = config.projectMap[projectId] || sanitizeProjectName(projectName);
        const projectHandle = await workspaceHandle.getDirectoryHandle(folderName);
        chatsHandle = await getOrCreateDirectory(projectHandle, 'chats');
      } else {
        // Standalone chats - save in Claude/chats/
        const claudeHandle = await getOrCreateDirectory(workspaceHandle, 'Claude');
        chatsHandle = await getOrCreateDirectory(claudeHandle, 'chats');
      }

      if (dryRun) {
        return conversations.length;
      }

      // Download each conversation with full message history
      for (const conversation of conversations) {
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
          chatsSynced++;
        } catch (error) {
          console.error(
            `Error syncing conversation ${conversation.name}:`,
            error
          );
        }
      }
    } catch (error) {
      const target = projectName || 'standalone chats';
      console.warn(`Could not sync conversations for ${target}:`, error);
    }

    return chatsSynced;
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
   * Bidirectional sync - sync changes in both directions
   */
  async bidirectionalSync(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string,
    conflictStrategy: ConflictStrategy,
    dryRun: boolean = false
  ): Promise<SyncResult> {
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      uploaded: 0,
      conflicts: 0,
      chats: 0,
    };
    const errors: string[] = [];

    try {
      this.reportProgress({
        phase: 'fetching',
        message: 'Analyzing differences...',
        percentage: 0,
      });

      // Get workspace diff to identify all changes
      const diff = await this.getWorkspaceDiff(workspaceHandle, orgId);
      const config = await getWorkspaceConfig();

      // Total work: matched projects + remoteOnly projects
      const totalProjects = diff.matched.length + diff.remoteOnly.length;

      this.reportProgress({
        phase: 'syncing',
        totalProjects,
        completedProjects: 0,
        percentage: 0,
        message: `Syncing ${totalProjects} projects...`,
      });

      let completed = 0;

      // Sync matched projects with differences
      for (const projectDiff of diff.matched) {
        if (!projectDiff.hasDifferences) {
          stats.skipped++;
          completed++;
          continue;
        }

        try {
          const projectHandle = await workspaceHandle.getDirectoryHandle(
            projectDiff.folder
          );

          const result = await this.syncProjectBidirectional(
            projectHandle,
            orgId,
            projectDiff,
            conflictStrategy,
            config,
            dryRun
          );

          stats.updated++;
          if (result.uploaded > 0) {
            stats.uploaded = (stats.uploaded || 0) + result.uploaded;
          }
          if (result.conflicts > 0) {
            stats.conflicts = (stats.conflicts || 0) + result.conflicts;
          }
          if (result.chatsCount > 0) {
            stats.chats! += result.chatsCount;
          }

          completed++;
          this.reportProgress({
            phase: 'syncing',
            currentProject: projectDiff.name,
            totalProjects,
            completedProjects: completed,
            percentage: Math.round((completed / totalProjects) * 100),
            message: `Synced ${completed}/${totalProjects} projects`,
          });
        } catch (error) {
          stats.errors++;
          errors.push(`${projectDiff.name}: ${(error as Error).message}`);
          console.error(`Error syncing project ${projectDiff.name}:`, error);
          completed++;
        }
      }

      // Download remote-only projects
      for (const remoteProject of diff.remoteOnly) {
        try {
          const projects = await this.apiClient.getProjects(orgId);
          const project = projects.find(p => p.uuid === remoteProject.id);
          if (project) {
            const result = await this.syncProject(
              workspaceHandle,
              orgId,
              project,
              config,
              dryRun
            );
            stats.created++;
            stats.chats! += result.chatsCount;
          }

          completed++;
          this.reportProgress({
            phase: 'syncing',
            currentProject: remoteProject.name,
            totalProjects,
            completedProjects: completed,
            percentage: Math.round((completed / totalProjects) * 100),
            message: `Synced ${completed}/${totalProjects} projects`,
          });
        } catch (error) {
          stats.errors++;
          errors.push(`${remoteProject.name}: ${(error as Error).message}`);
          console.error(`Error syncing project ${remoteProject.name}:`, error);
          completed++;
        }
      }

      // Sync standalone chats (chats without projects) if enabled
      if (config.settings.syncChats) {
        try {
          this.reportProgress({
            phase: 'syncing',
            message: 'Syncing standalone conversations...',
            percentage: 95,
          });

          const standaloneChats = await this.syncConversations(
            workspaceHandle,
            orgId,
            null,
            null,
            dryRun
          );

          stats.chats! += standaloneChats;
        } catch (error) {
          console.warn('Could not sync standalone conversations:', error);
        }
      }

      // Save updated config
      if (!dryRun) {
        await saveWorkspaceConfig(config);
        await updateLastSync();
      }

      this.reportProgress({
        phase: 'complete',
        totalProjects,
        completedProjects: completed,
        percentage: 100,
        message: 'Bidirectional sync complete!',
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
   * Sync individual project bidirectionally
   */
  private async syncProjectBidirectional(
    projectHandle: FileSystemDirectoryHandle,
    orgId: string,
    projectDiff: ProjectDiff,
    conflictStrategy: ConflictStrategy,
    config: WorkspaceConfig,
    dryRun: boolean
  ): Promise<{ uploaded: number; conflicts: number; chatsCount: number }> {
    const projectId = projectDiff.id;
    let uploaded = 0;
    let conflicts = 0;
    const fileErrors: string[] = [];

    // Get context folder handle
    let contextHandle: FileSystemDirectoryHandle;
    try {
      contextHandle = await projectHandle.getDirectoryHandle('context');
    } catch {
      contextHandle = await getOrCreateDirectory(projectHandle, 'context');
    }

    // 0. Handle renamed files: Delete old remote file, content already local with new name
    if (projectDiff.renamedFiles && projectDiff.renamedFiles.length > 0) {
      for (const rename of projectDiff.renamedFiles) {
        if (dryRun) {
          uploaded++;
          continue;
        }

        try {
          // Delete the old remote file
          if (rename.oldName === 'AGENTS.md') {
            // Clear project instructions
            await this.apiClient.updateProjectInstructions(orgId, projectId, '');
          } else {
            // Find and delete the old file from remote
            const files = await this.apiClient.getProjectFiles(orgId, projectId);
            const oldFile = files.find(f => f.file_name === rename.oldName);
            if (oldFile) {
              await this.apiClient.deleteFile(orgId, projectId, oldFile.uuid);
            }
          }

          // Upload file with new name
          if (rename.newName === 'AGENTS.md') {
            const content = await readTextFile(projectHandle, 'AGENTS.md');
            if (content) {
              await this.apiClient.updateProjectInstructions(orgId, projectId, content);
              uploaded++;
            }
          } else {
            const content = await readTextFile(contextHandle, rename.newName);
            if (content) {
              await this.apiClient.uploadFile(orgId, projectId, rename.newName, content);
              uploaded++;
            }
          }
        } catch (error) {
          const errorMsg = `Rename ${rename.oldName} → ${rename.newName}: ${(error as Error).message}`;
          console.error(`Error handling rename:`, error);
          fileErrors.push(errorMsg);
        }
      }
    }

    // 1. Handle remote-only files: Download them
    for (const fileName of projectDiff.remoteOnlyFiles) {
      if (dryRun) continue;

      try {
        if (fileName === 'AGENTS.md') {
          // Handle AGENTS.md from project instructions
          const instructionsData = await this.apiClient.getProjectInstructions(
            orgId,
            projectId
          );
          if (instructionsData?.content) {
            await writeTextFile(
              projectHandle,
              'AGENTS.md',
              instructionsData.content.trim()
            );
          }
        } else {
          // Handle regular files from project files
          const files = await this.apiClient.getProjectFiles(orgId, projectId);
          const file = files.find(f => f.file_name === fileName);
          if (file) {
            await writeTextFile(contextHandle, fileName, file.content);
          }
        }
      } catch (error) {
        const errorMsg = `Download ${fileName}: ${(error as Error).message}`;
        console.error(`Error downloading file ${fileName}:`, error);
        fileErrors.push(errorMsg);
      }
    }

    // 2. Handle local-only files: Upload them
    for (const fileName of projectDiff.localOnlyFiles) {
      if (dryRun) {
        uploaded++;
        continue;
      }

      try {
        if (fileName === 'AGENTS.md') {
          // Upload AGENTS.md as project instructions
          const content = await readTextFile(projectHandle, 'AGENTS.md');
          if (content) {
            await this.apiClient.updateProjectInstructions(
              orgId,
              projectId,
              content
            );
            uploaded++;
          }
        } else {
          // Upload regular files
          const content = await readTextFile(contextHandle, fileName);
          if (content) {
            await this.apiClient.uploadFile(orgId, projectId, fileName, content);
            uploaded++;
          }
        }
      } catch (error) {
        const errorMsg = `Upload ${fileName}: ${(error as Error).message}`;
        console.error(`Error uploading file ${fileName}:`, error);
        fileErrors.push(errorMsg);
      }
    }

    // 3. Handle modified files: Apply conflict strategy
    for (const fileName of projectDiff.modifiedFiles) {
      conflicts++;

      if (dryRun) continue;

      try {
        // Get local and remote content
        let localContent: string | null = null;
        let remoteContent: string = '';
        let localModifiedTime = 0;
        let remoteModifiedTime = 0;

        if (fileName === 'AGENTS.md') {
          localContent = await readTextFile(projectHandle, 'AGENTS.md');
          const instructionsData = await this.apiClient.getProjectInstructions(
            orgId,
            projectId
          );
          remoteContent = instructionsData?.content?.trim() || '';

          // Get file timestamps
          try {
            const fileHandle = await projectHandle.getFileHandle('AGENTS.md');
            const file = await fileHandle.getFile();
            localModifiedTime = file.lastModified;
          } catch {
            // Couldn't get timestamp
          }
        } else {
          localContent = await readTextFile(contextHandle, fileName);
          const files = await this.apiClient.getProjectFiles(orgId, projectId);
          const remoteFile = files.find(f => f.file_name === fileName);
          remoteContent = remoteFile?.content || '';

          // Get file timestamps
          try {
            const fileHandle = await contextHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            localModifiedTime = file.lastModified;
          } catch {
            // Couldn't get timestamp
          }

          // Remote timestamp from API (if available in updated_at field)
          if (remoteFile && (remoteFile as any).updated_at) {
            remoteModifiedTime = new Date((remoteFile as any).updated_at).getTime();
          }
        }

        if (!localContent) continue;

        // Apply conflict strategy
        let shouldUpload = false;

        switch (conflictStrategy) {
          case 'local':
            // Always keep local version
            shouldUpload = true;
            break;

          case 'remote':
            // Always keep remote version (download)
            if (fileName === 'AGENTS.md') {
              await writeTextFile(projectHandle, 'AGENTS.md', remoteContent);
            } else {
              await writeTextFile(contextHandle, fileName, remoteContent);
            }
            break;

          case 'newer':
            // Keep the newer version based on timestamp
            if (localModifiedTime > remoteModifiedTime) {
              shouldUpload = true;
            } else {
              // Download remote version
              if (fileName === 'AGENTS.md') {
                await writeTextFile(projectHandle, 'AGENTS.md', remoteContent);
              } else {
                await writeTextFile(contextHandle, fileName, remoteContent);
              }
            }
            break;

          case 'prompt':
            // Skip - would require UI interaction
            console.log(
              `Conflict detected for ${fileName} - skipping (prompt strategy not supported)`
            );
            break;
        }

        // Upload if needed
        if (shouldUpload) {
          if (fileName === 'AGENTS.md') {
            await this.apiClient.updateProjectInstructions(
              orgId,
              projectId,
              localContent
            );
          } else {
            await this.apiClient.uploadFile(
              orgId,
              projectId,
              fileName,
              localContent
            );
          }
          uploaded++;
        }
      } catch (error) {
        const errorMsg = `Conflict ${fileName}: ${(error as Error).message}`;
        console.error(`Error resolving conflict for ${fileName}:`, error);
        fileErrors.push(errorMsg);
      }
    }

    // Sync chat conversations if enabled (do this before error check so chats sync even if files fail)
    let chatsSynced = 0;
    if (!dryRun && config.settings.syncChats) {
      // Get workspace handle from project handle
      const workspaceHandle = await projectHandle.getParent();
      if (workspaceHandle) {
        chatsSynced = await this.syncConversations(
          workspaceHandle,
          orgId,
          projectId,
          projectDiff.name,
          dryRun
        );
      }
    }

    // If any files failed to sync, throw error with details
    if (fileErrors.length > 0) {
      throw new Error(
        `Failed to sync ${fileErrors.length} file(s) in ${projectDiff.name}: ${fileErrors.join(', ')}`
      );
    }

    return { uploaded, conflicts, chatsCount: chatsSynced };
  }

  /**
   * Get workspace diff - compare local workspace with remote Claude.ai
   */
  async getWorkspaceDiff(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string
  ): Promise<import('./types').WorkspaceDiff> {
    const config = await getWorkspaceConfig();

    // Report initial progress
    this.reportProgress({
      phase: 'fetching',
      message: 'Fetching remote projects...',
      percentage: 10,
    });

    // Fetch remote projects
    const remoteProjects = await this.apiClient.getProjects(orgId);

    // Get local folders
    this.reportProgress({
      phase: 'fetching',
      message: 'Scanning local workspace...',
      percentage: 20,
    });

    const localFolders = new Set<string>();
    for await (const entry of workspaceHandle.values()) {
      // Exclude system folders (dot-prefixed and "Claude" folder for standalone chats)
      if (entry.kind === 'directory' && !entry.name.startsWith('.') && entry.name !== 'Claude') {
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

    this.reportProgress({
      phase: 'syncing',
      message: `Comparing ${remoteProjects.length} projects...`,
      percentage: 30,
      totalProjects: remoteProjects.length,
      completedProjects: 0,
    });

    // Process remote projects
    for (let i = 0; i < remoteProjects.length; i++) {
      const project = remoteProjects[i];
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

      // Report progress (30% to 90% range)
      const progressPercent = 30 + Math.floor(((i + 1) / remoteProjects.length) * 60);
      this.reportProgress({
        phase: 'syncing',
        message: `Analyzed ${i + 1}/${remoteProjects.length} projects`,
        percentage: progressPercent,
        totalProjects: remoteProjects.length,
        completedProjects: i + 1,
      });
    }

    this.reportProgress({
      phase: 'complete',
      message: 'Diff computation complete',
      percentage: 100,
    });

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
    const modifiedFilesInfo: Record<string, {
      localTime?: number;
      remoteTime?: number;
      isLocalNewer?: boolean;
    }> = {};
    const renamedFiles: Array<{ oldName: string; newName: string }> = [];

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

    // Content-based rename detection: Build hash maps for remote-only and local-only files
    const remoteFileHashes = new Map<string, string>(); // hash -> fileName
    const localFileHashes = new Map<string, string>();  // hash -> fileName

    // Compute hashes for remote-only files
    for (const fileName of remoteOnlyFiles) {
      try {
        let content: string = '';
        if (fileName === 'AGENTS.md') {
          const instructionsData = await this.apiClient.getProjectInstructions(
            orgId,
            remoteProject.uuid
          );
          content = instructionsData?.content?.trim() || '';
        } else {
          const remoteFile = remoteFileMap.get(fileName);
          content = remoteFile?.content || '';
        }

        if (content) {
          const hash = await computeFileHash(content);
          remoteFileHashes.set(hash, fileName);
        }
      } catch (error) {
        console.error(`Error hashing remote file ${fileName}:`, error);
      }
    }

    // Compute hashes for local-only files and detect renames
    for (const fileName of localOnlyFiles) {
      try {
        let content: string | null = null;
        if (fileName === 'AGENTS.md') {
          content = await readTextFile(projectHandle, 'AGENTS.md');
        } else {
          const contextHandle = await projectHandle.getDirectoryHandle('context');
          content = await readTextFile(contextHandle, fileName);
        }

        if (content) {
          const hash = await computeFileHash(content);

          // Check if this hash exists in remote-only files (rename detection)
          if (remoteFileHashes.has(hash)) {
            const oldName = remoteFileHashes.get(hash)!;
            renamedFiles.push({ oldName, newName: fileName });
          } else {
            localFileHashes.set(hash, fileName);
          }
        }
      } catch (error) {
        console.error(`Error hashing local file ${fileName}:`, error);
      }
    }

    // Remove renamed files from remote-only and local-only lists
    if (renamedFiles.length > 0) {
      const renamedOldNames = new Set(renamedFiles.map(r => r.oldName));
      const renamedNewNames = new Set(renamedFiles.map(r => r.newName));

      const filteredRemoteOnly = remoteOnlyFiles.filter(f => !renamedOldNames.has(f));
      const filteredLocalOnly = localOnlyFiles.filter(f => !renamedNewNames.has(f));

      remoteOnlyFiles.length = 0;
      localOnlyFiles.length = 0;
      remoteOnlyFiles.push(...filteredRemoteOnly);
      localOnlyFiles.push(...filteredLocalOnly);
    }

    // Check for modifications in common files
    for (const fileName of localFileSet) {
      if (remoteFileSet.has(fileName)) {
        try {
          let localContent: string | null = null;
          let remoteContent: string = '';
          let localModifiedTime: number | undefined = undefined;
          let remoteModifiedTime: number | undefined = undefined;

          if (fileName === 'AGENTS.md') {
            localContent = await readTextFile(projectHandle, 'AGENTS.md');
            const instructionsData = await this.apiClient.getProjectInstructions(
              orgId,
              remoteProject.uuid
            );
            remoteContent = instructionsData?.content?.trim() || '';

            // Get local file timestamp
            try {
              const fileHandle = await projectHandle.getFileHandle('AGENTS.md');
              const file = await fileHandle.getFile();
              localModifiedTime = file.lastModified;
            } catch {
              // Couldn't get timestamp
            }

            // Remote timestamp for AGENTS.md (if available in instructionsData)
            if (instructionsData && (instructionsData as any).updated_at) {
              remoteModifiedTime = new Date((instructionsData as any).updated_at).getTime();
            }
          } else {
            const contextHandle = await projectHandle.getDirectoryHandle('context');
            localContent = await readTextFile(contextHandle, fileName);
            const remoteFile = remoteFileMap.get(fileName);
            remoteContent = remoteFile?.content || '';

            // Get local file timestamp
            try {
              const fileHandle = await contextHandle.getFileHandle(fileName);
              const file = await fileHandle.getFile();
              localModifiedTime = file.lastModified;
            } catch {
              // Couldn't get timestamp
            }

            // Remote timestamp from API
            if (remoteFile && (remoteFile as any).updated_at) {
              remoteModifiedTime = new Date((remoteFile as any).updated_at).getTime();
            }
          }

          if (localContent !== null) {
            const localHash = await computeFileHash(localContent);
            const remoteHash = await computeFileHash(remoteContent);

            if (localHash !== remoteHash) {
              modifiedFiles.push(fileName);

              // Store timestamp info
              modifiedFilesInfo[fileName] = {
                localTime: localModifiedTime,
                remoteTime: remoteModifiedTime,
                isLocalNewer: localModifiedTime && remoteModifiedTime
                  ? localModifiedTime > remoteModifiedTime
                  : undefined
              };
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
      modifiedFiles.length > 0 ||
      renamedFiles.length > 0;

    return {
      name: remoteProject.name,
      id: remoteProject.uuid,
      folder: config.projectMap[remoteProject.uuid] || sanitizeProjectName(remoteProject.name),
      hasDifferences,
      remoteOnlyFiles,
      localOnlyFiles,
      modifiedFiles,
      modifiedFilesInfo: Object.keys(modifiedFilesInfo).length > 0 ? modifiedFilesInfo : undefined,
      renamedFiles: renamedFiles.length > 0 ? renamedFiles : undefined
    };
  }
}
