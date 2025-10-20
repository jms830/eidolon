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
  verifyPermission,
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
      // Verify permissions
      const hasPermission = await verifyPermission(workspaceHandle, 'readwrite');
      if (!hasPermission) {
        throw new Error('No permission to access workspace directory');
      }

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
   * Get workspace diff - TODO: Phase 2
   */
  async getWorkspaceDiff(
    workspaceHandle: FileSystemDirectoryHandle,
    orgId: string
  ): Promise<any> {
    // TODO: Implement in Phase 2
    throw new Error('Workspace diff not yet implemented');
  }
}
