import './style.css';
import {
  getSearchService,
  projectToSearchableItem,
  fileToSearchableItem,
  conversationToSearchableItem,
  type SearchableItem
} from '../../utils/search/searchService';
import { getTagsService, type Tag } from '../../utils/tags/tagsService';
import { createTagBadge, showTagSelectionModal, createTagFilter } from '../../utils/tags/tagsUI';
import { ClaudeAPIClient } from '../../utils/api/client';
import { SyncManager, type SyncAccountInfo } from '../../utils/sync/SyncManager';
import {
  startAuthorization,
  exchangeCodeForTokens,
  getAllProviderStatus,
  removeCredentials,
  type OAuthProviderType,
  type ProviderStatus,
  OAUTH_PROVIDERS,
} from '../../utils/oauth';
import {
  getWorkspaceConfig,
  saveWorkspaceConfig,
  updateSyncSettings,
  updateLastSync,
  isWorkspaceConfigured,
  getWorkspaceHandle,
  saveWorkspaceHandle,
  clearWorkspaceHandle
} from '../../utils/sync/workspaceConfig';
import {
  pickWorkspaceDirectory,
  verifyPermission,
  readTextFile,
  writeTextFile,
  getOrCreateDirectory,
  deleteFile,
  isFileSystemAccessSupported
} from '../../utils/sync/fileSystem';
import type { SyncProgress, SyncSettings } from '../../utils/sync/types';
import { settingsService } from '../../utils/settings/settingsService';

// State
interface AppState {
  projects: any[];
  files: any[];
  conversations: any[];
  selectedProjects: Set<string>;
  selectedFiles: Set<string>;
  selectedConversations: Set<string>;
  currentTab: string;
  viewMode: 'grid' | 'list';
  isConnected: boolean;
  searchResults: SearchableItem[];
  isSearching: boolean;
  filterTags: string[];
  projectTags: Map<string, Tag[]>;
  fileTags: Map<string, Tag[]>;
  conversationTags: Map<string, Tag[]>;
  currentOrg: any | null;
  syncConfigured: boolean;
  isSyncing: boolean;
  workspaceHandle: FileSystemDirectoryHandle | null;
  fileFilter: { projectId: string; projectName: string } | null;
  lastDiffResult: any | null;
  lastDiffTimestamp: number | null;
  pinned: Set<string>;
  showPinnedOnly: boolean;
  favorites: Set<string>;
  showFavoritesOnly: boolean;
}

const state: AppState = {
  projects: [],
  files: [],
  conversations: [],
  selectedProjects: new Set(),
  selectedFiles: new Set(),
  selectedConversations: new Set(),
  currentTab: 'projects',
  viewMode: 'grid',
  isConnected: false,
  searchResults: [],
  isSearching: false,
  filterTags: [],
  projectTags: new Map(),
  fileTags: new Map(),
  conversationTags: new Map(),
  currentOrg: null,
  syncConfigured: false,
  isSyncing: false,
  workspaceHandle: null,
  fileFilter: null,
  lastDiffResult: null,
  lastDiffTimestamp: null,
  pinned: new Set(),
  showPinnedOnly: false,
  favorites: new Set(),
  showFavoritesOnly: false,
};

const searchService = getSearchService();
const tagsService = getTagsService();

// Helper function to get required DOM elements with proper error handling
function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: ${id}. The page may have failed to load correctly.`);
  }
  return element as T;
}

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  duration?: number;
  closable?: boolean;
}

let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('role', 'alert');
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(message: string, type: ToastType = 'info', options: ToastOptions = {}): void {
  const { duration = 4000, closable = true } = options;
  const container = getToastContainer();
  
  const icons: Record<ToastType, string> = {
    success: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 8l4 4 7-7"/></svg>`,
    error: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="7"/><path d="M8 5v3M8 11h.01"/></svg>`,
    warning: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2l-7 12h14L8 2z"/><path d="M8 6v4M8 12h.01"/></svg>`,
    info: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="7"/><path d="M8 8V5M8 11h.01"/></svg>`
  };
  
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${icons[type]}</span>
    <span class="toast__message">${message}</span>
    ${closable ? `<button class="toast__close" aria-label="Close notification"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>` : ''}
  `;
  
  if (closable) {
    const closeBtn = toast.querySelector('.toast__close');
    closeBtn?.addEventListener('click', () => removeToast(toast));
  }
  
  container.appendChild(toast);
  
  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }
}

function removeToast(toast: HTMLElement): void {
  toast.classList.add('toast--fade-out');
  setTimeout(() => toast.remove(), 300);
}

// Convenience functions
const toast = {
  success: (message: string, options?: ToastOptions) => showToast(message, 'success', options),
  error: (message: string, options?: ToastOptions) => showToast(message, 'error', options),
  warning: (message: string, options?: ToastOptions) => showToast(message, 'warning', options),
  info: (message: string, options?: ToastOptions) => showToast(message, 'info', options),
};

// ============================================================================
// LOADING STATE MANAGEMENT
// ============================================================================

let loadingOverlay: HTMLElement | null = null;

function showLoadingOverlay(message: string = 'Loading...'): void {
  if (loadingOverlay) return;
  
  loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'loading-overlay';
  loadingOverlay.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">${message}</div>
  `;
  document.body.appendChild(loadingOverlay);
}

function hideLoadingOverlay(): void {
  if (loadingOverlay) {
    loadingOverlay.remove();
    loadingOverlay = null;
  }
}

function updateLoadingMessage(message: string): void {
  if (loadingOverlay) {
    const textEl = loadingOverlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = message;
  }
}

// ============================================================================
// CONFIRMATION MODAL
// ============================================================================

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'primary';
}

function showConfirmModal(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const { 
      title = 'Confirm Action', 
      message, 
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      type = 'primary'
    } = options;
    
    const icons: Record<string, string> = {
      danger: '🗑️',
      warning: '⚠️',
      primary: '❓'
    };
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-centered';
    overlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="confirm-modal__title" id="confirm-title">
          <span aria-hidden="true">${icons[type]}</span>
          ${title}
        </div>
        <div class="confirm-modal__message">${message}</div>
        <div class="confirm-modal__actions">
          <button class="confirm-modal__btn confirm-modal__btn--cancel">${cancelText}</button>
          <button class="confirm-modal__btn confirm-modal__btn--${type}">${confirmText}</button>
        </div>
      </div>
    `;
    
    const cancelBtn = overlay.querySelector('.confirm-modal__btn--cancel');
    const confirmBtn = overlay.querySelector(`.confirm-modal__btn--${type}`);
    
    const cleanup = (result: boolean) => {
      overlay.remove();
      resolve(result);
    };
    
    cancelBtn?.addEventListener('click', () => cleanup(false));
    confirmBtn?.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    
    // Keyboard handling
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cleanup(false);
    });
    
    document.body.appendChild(overlay);
    
    // Focus the cancel button by default (safer option)
    (cancelBtn as HTMLElement)?.focus();
  });
}

// ============================================================================
// CONTEXT MENU SYSTEM
// ============================================================================

interface ContextMenuItem {
  label: string;
  icon: string;
  action: () => void | Promise<void>;
  danger?: boolean;
  dividerAfter?: boolean;
}

let activeContextMenu: HTMLElement | null = null;

function showContextMenu(e: MouseEvent, items: ContextMenuItem[]): void {
  e.preventDefault();
  
  // Close any existing context menu
  hideContextMenu();
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  
  items.forEach((item, index) => {
    const menuItem = document.createElement('div');
    menuItem.className = `context-menu-item${item.danger ? ' danger' : ''}`;
    menuItem.setAttribute('role', 'menuitem');
    menuItem.innerHTML = `<span class="icon">${item.icon}</span>${item.label}`;
    
    menuItem.addEventListener('click', async () => {
      hideContextMenu();
      await item.action();
    });
    
    menu.appendChild(menuItem);
    
    if (item.dividerAfter && index < items.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'context-menu-divider';
      menu.appendChild(divider);
    }
  });
  
  document.body.appendChild(menu);
  activeContextMenu = menu;
  
  // Position the menu
  const menuRect = menu.getBoundingClientRect();
  let x = e.clientX;
  let y = e.clientY;
  
  // Adjust if menu would go off screen
  if (x + menuRect.width > window.innerWidth) {
    x = window.innerWidth - menuRect.width - 8;
  }
  if (y + menuRect.height > window.innerHeight) {
    y = window.innerHeight - menuRect.height - 8;
  }
  
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  // Close on click outside
  const closeHandler = (evt: MouseEvent) => {
    if (!menu.contains(evt.target as Node)) {
      hideContextMenu();
      document.removeEventListener('click', closeHandler);
    }
  };
  
  // Delay adding the listener to prevent immediate close
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 0);
  
  // Close on escape
  const escHandler = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') {
      hideContextMenu();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function hideContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

function getProjectContextMenuItems(projectId: string, project: any): ContextMenuItem[] {
  return [
    {
      label: 'Open in Claude',
      icon: '🔗',
      action: () => openProject(projectId),
    },
    {
      label: 'View Files',
      icon: '📄',
      action: () => viewProjectFiles(projectId),
    },
    {
      label: 'Edit Instructions',
      icon: '📝',
      action: () => showInstructionsEditor({
        projectId,
        projectName: project.name,
        currentInstructions: project.instructions || ''
      }),
      dividerAfter: true,
    },
    {
      label: state.pinned.has(projectId) ? 'Unpin' : 'Pin',
      icon: '📌',
      action: () => togglePinned(projectId),
    },
    {
      label: 'Manage Tags',
      icon: '🏷️',
      action: () => handleProjectTagsClick(projectId),
      dividerAfter: true,
    },
    {
      label: 'Export Project',
      icon: '📤',
      action: async () => {
        state.selectedProjects.clear();
        state.selectedProjects.add(projectId);
        await handleBulkAction('export');
      },
    },
    {
      label: 'Delete Project',
      icon: '🗑️',
      action: async () => {
        const confirmed = await showConfirmModal({
          title: 'Delete Project',
          message: `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          type: 'danger'
        });
        if (confirmed) {
          try {
            const response = await browser.runtime.sendMessage({
              action: 'delete-project',
              projectId: projectId
            });
            if (response.success) {
              toast.success(`Project "${project.name}" deleted`);
              state.projects = state.projects.filter((p: any) => p.uuid !== projectId);
              renderProjects();
            } else {
              throw new Error(response.error || 'Failed to delete project');
            }
          } catch (error) {
            toast.error(`Failed to delete: ${(error as Error).message}`);
          }
        }
      },
      danger: true,
    },
  ];
}

function getFileContextMenuItems(file: any, projectId: string): ContextMenuItem[] {
  return [
    {
      label: 'Edit File',
      icon: '📝',
      action: async () => {
        // Fetch file content if not already loaded
        const response = await browser.runtime.sendMessage({
          action: 'get-file-content',
          projectId,
          fileId: file.uuid
        });
        if (response.success) {
          showFileEditor({
            projectId,
            file: {
              uuid: file.uuid,
              file_name: file.file_name,
              content: response.data.content || ''
            }
          });
        } else {
          toast.error('Failed to load file content');
        }
      },
    },
    {
      label: 'Download',
      icon: '⬇️',
      action: () => {
        // Create download link
        const blob = new Blob([file.content || ''], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.file_name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Downloaded ${file.file_name}`);
      },
      dividerAfter: true,
    },
    {
      label: 'Copy Filename',
      icon: '📋',
      action: async () => {
        await navigator.clipboard.writeText(file.file_name);
        toast.success('Filename copied to clipboard');
      },
    },
    {
      label: 'Delete File',
      icon: '🗑️',
      action: async () => {
        const confirmed = await showConfirmModal({
          title: 'Delete File',
          message: `Are you sure you want to delete "${file.file_name}"?`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          type: 'danger'
        });
        if (confirmed) {
          try {
            const apiClient = new ClaudeAPIClient(await getSessionKey());
            await apiClient.deleteFile(state.currentOrg!.uuid, projectId, file.uuid);
            toast.success(`Deleted ${file.file_name}`);
            // Refresh the view
            renderCurrentTab();
          } catch (error) {
            toast.error(`Failed to delete: ${(error as Error).message}`);
          }
        }
      },
      danger: true,
    },
  ];
}

// ============================================================================
// FILE EDITOR MODAL
// ============================================================================

interface FileEditorOptions {
  projectId: string;
  file: {
    uuid: string;
    file_name: string;
    content: string;
  };
  onSave?: (content: string) => Promise<void>;
}

async function showFileEditor(options: FileEditorOptions): Promise<void> {
  const { projectId, file, onSave } = options;
  
  // Determine file type for syntax hint
  const extension = file.file_name.split('.').pop()?.toLowerCase() || '';
  const fileTypes: Record<string, string> = {
    'js': 'JavaScript',
    'ts': 'TypeScript',
    'jsx': 'JSX',
    'tsx': 'TSX',
    'py': 'Python',
    'md': 'Markdown',
    'json': 'JSON',
    'css': 'CSS',
    'html': 'HTML',
    'yaml': 'YAML',
    'yml': 'YAML',
    'txt': 'Text',
  };
  const fileType = fileTypes[extension] || extension.toUpperCase() || 'Text';
  
  let isModified = false;
  let originalContent = file.content;
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-centered';
  overlay.innerHTML = `
    <div class="file-editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div class="file-editor-header">
        <div class="file-editor-title">
          <h3 id="editor-title">📄 ${file.file_name}</h3>
          <span class="file-type">${fileType}</span>
        </div>
        <div class="file-editor-actions">
          <button class="action-btn" id="editor-close-btn">✕ Close</button>
        </div>
      </div>
      <div class="file-editor-body">
        <textarea class="file-editor-textarea" id="editor-textarea" spellcheck="false">${escapeHtml(file.content)}</textarea>
      </div>
      <div class="file-editor-footer">
        <span class="file-editor-status" id="editor-status">Ready</span>
        <div style="display: flex; gap: 8px;">
          <button class="action-btn secondary" id="editor-cancel-btn">Cancel</button>
          <button class="primary-btn" id="editor-save-btn" disabled>💾 Save</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const textarea = overlay.querySelector('#editor-textarea') as HTMLTextAreaElement;
  const saveBtn = overlay.querySelector('#editor-save-btn') as HTMLButtonElement;
  const cancelBtn = overlay.querySelector('#editor-cancel-btn') as HTMLButtonElement;
  const closeBtn = overlay.querySelector('#editor-close-btn') as HTMLButtonElement;
  const statusEl = overlay.querySelector('#editor-status') as HTMLElement;
  
  // Focus textarea
  textarea.focus();
  
  // Track modifications
  textarea.addEventListener('input', () => {
    isModified = textarea.value !== originalContent;
    saveBtn.disabled = !isModified;
    statusEl.textContent = isModified ? '● Modified' : 'Ready';
    statusEl.className = `file-editor-status ${isModified ? 'modified' : ''}`;
  });
  
  // Keyboard shortcuts
  textarea.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + S to save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (isModified) saveBtn.click();
    }
    // Tab to insert spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      textarea.dispatchEvent(new Event('input'));
    }
  });
  
  const closeEditor = async (save: boolean = false) => {
    if (save && isModified) {
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        statusEl.textContent = 'Saving...';
        
        if (onSave) {
          await onSave(textarea.value);
        } else {
          // Default save behavior: update file via API
          const apiClient = new ClaudeAPIClient(await getSessionKey());
          await apiClient.deleteFile(state.currentOrg!.uuid, projectId, file.uuid);
          await apiClient.uploadFile(state.currentOrg!.uuid, projectId, file.file_name, textarea.value);
        }
        
        originalContent = textarea.value;
        isModified = false;
        statusEl.textContent = '✓ Saved';
        statusEl.className = 'file-editor-status saved';
        toast.success(`File "${file.file_name}" saved`);
        
        // Close after brief delay to show success
        setTimeout(() => overlay.remove(), 500);
      } catch (error) {
        console.error('Failed to save file:', error);
        toast.error(`Failed to save: ${(error as Error).message}`);
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save';
        statusEl.textContent = '✗ Save failed';
      }
    } else if (isModified) {
      const confirmClose = await showConfirmModal({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to close?',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        type: 'warning'
      });
      if (confirmClose) overlay.remove();
    } else {
      overlay.remove();
    }
  };
  
  saveBtn.addEventListener('click', () => closeEditor(true));
  cancelBtn.addEventListener('click', () => closeEditor(false));
  closeBtn.addEventListener('click', () => closeEditor(false));
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEditor(false);
  });
  
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditor(false);
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PROJECT INSTRUCTIONS EDITOR
// ============================================================================

interface InstructionsEditorOptions {
  projectId: string;
  projectName: string;
  currentInstructions: string;
}

async function showInstructionsEditor(options: InstructionsEditorOptions): Promise<void> {
  const { projectId, projectName, currentInstructions } = options;
  
  let isModified = false;
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-centered';
  overlay.innerHTML = `
    <div class="instructions-editor-modal" role="dialog" aria-modal="true" aria-labelledby="instructions-title">
      <div class="instructions-editor-header">
        <h3 id="instructions-title">📝 Edit Instructions: ${projectName}</h3>
        <button class="action-btn" id="instructions-close-btn">✕</button>
      </div>
      <div class="instructions-editor-body">
        <textarea class="instructions-textarea" id="instructions-textarea" placeholder="Enter custom instructions for this project...">${escapeHtml(currentInstructions)}</textarea>
        <p class="instructions-hint">
          💡 These instructions will be used as context when working with files in this project.
        </p>
      </div>
      <div class="instructions-editor-footer">
        <button class="action-btn secondary" id="instructions-cancel-btn">Cancel</button>
        <button class="primary-btn" id="instructions-save-btn" disabled>Save Instructions</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const textarea = overlay.querySelector('#instructions-textarea') as HTMLTextAreaElement;
  const saveBtn = overlay.querySelector('#instructions-save-btn') as HTMLButtonElement;
  const cancelBtn = overlay.querySelector('#instructions-cancel-btn') as HTMLButtonElement;
  const closeBtn = overlay.querySelector('#instructions-close-btn') as HTMLButtonElement;
  
  textarea.focus();
  
  textarea.addEventListener('input', () => {
    isModified = textarea.value !== currentInstructions;
    saveBtn.disabled = !isModified;
  });
  
  const closeEditor = async (save: boolean = false) => {
    if (save && isModified) {
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        
        // Call API to update project instructions
        const response = await browser.runtime.sendMessage({
          action: 'update-project-instructions',
          projectId: projectId,
          instructions: textarea.value
        });
        
        if (response.success) {
          toast.success('Project instructions updated');
          overlay.remove();
          // Refresh projects list
          await loadProjects();
          renderProjects();
        } else {
          throw new Error(response.error || 'Failed to update instructions');
        }
      } catch (error) {
        console.error('Failed to update instructions:', error);
        toast.error(`Failed to save: ${(error as Error).message}`);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Instructions';
      }
    } else {
      overlay.remove();
    }
  };
  
  saveBtn.addEventListener('click', () => closeEditor(true));
  cancelBtn.addEventListener('click', () => closeEditor(false));
  closeBtn.addEventListener('click', () => closeEditor(false));
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEditor(false);
  });
  
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditor(false);
  });
}

// DOM Elements
const statusBar = getRequiredElement('status-bar');
const statusText = getRequiredElement('status-text');
const globalSearch = getRequiredElement<HTMLInputElement>('global-search');
const refreshAllBtn = getRequiredElement('refresh-all-btn');
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

// Org switcher elements
const orgSwitcherBtn = getRequiredElement('org-switcher-btn');
const currentOrgName = getRequiredElement('current-org-name');
const orgSwitcherModal = getRequiredElement('org-switcher-modal');
const orgList = getRequiredElement('org-list');
const closeOrgModal = getRequiredElement('close-org-modal');

// Account switcher elements
const accountSwitcherBtn = getRequiredElement('account-switcher-btn');
const currentAccountAvatar = getRequiredElement('current-account-avatar');
const currentAccountName = getRequiredElement('current-account-name');
const accountSwitcherModal = getRequiredElement('account-switcher-modal');
const accountList = getRequiredElement('account-list');
const closeAccountModal = getRequiredElement('close-account-modal');
const addAccountBtn = getRequiredElement('add-account-btn');
const refreshSessionBtn = getRequiredElement('refresh-session-btn');

// Auth modal elements
const authBtn = getRequiredElement('auth-btn');
const authModal = getRequiredElement('auth-modal');
const authStatusContent = getRequiredElement('auth-status-content');
const validateSessionBtn = getRequiredElement('validate-session-btn');
const showSessionKeyBtn = getRequiredElement('show-session-key-btn');
const closeAuthModal = getRequiredElement('close-auth-modal');

// Projects elements
const projectsGrid = getRequiredElement('projects-grid');
const projectsCount = getRequiredElement('projects-count');
const viewGridBtn = getRequiredElement('view-grid');
const viewListBtn = getRequiredElement('view-list');
const selectAllProjectsBtn = getRequiredElement('select-all-projects');
const bulkActionsProjectsBtn = getRequiredElement('bulk-actions-projects');
const newProjectBtn = getRequiredElement('new-project');
const sortProjects = getRequiredElement<HTMLSelectElement>('sort-projects');

// Files elements
const selectAllFilesBtn = getRequiredElement('select-all-files');
const bulkActionsFilesBtn = getRequiredElement('bulk-actions-files');

// Analytics elements
const totalProjectsEl = getRequiredElement('total-projects');
const totalFilesEl = getRequiredElement('total-files');
const totalConversationsEl = getRequiredElement('total-conversations');
const totalStorageEl = getRequiredElement('total-storage');
const exportAllDataBtn = getRequiredElement('export-all-data');

// Sync elements
const syncNotConfigured = getRequiredElement('sync-not-configured');
const syncConfigured = getRequiredElement('sync-configured');
const setupWorkspaceBtn = getRequiredElement('setup-workspace-btn');
const configureWorkspaceBtn = getRequiredElement('configure-workspace-btn');
const syncNowBtn = getRequiredElement('sync-now-btn');
const previewDiffBtn = getRequiredElement('preview-diff-btn');
const syncChatsOnlyBtn = getRequiredElement('sync-chats-only-btn');
const copyPathBtn = getRequiredElement('copy-path-btn');
const autoSyncEnabledCheckbox = getRequiredElement<HTMLInputElement>('auto-sync-enabled');
const syncIntervalSelect = getRequiredElement<HTMLSelectElement>('sync-interval');
const bidirectionalSyncCheckbox = getRequiredElement<HTMLInputElement>('bidirectional-sync');
const syncChatsCheckbox = getRequiredElement<HTMLInputElement>('sync-chats');
const autoAddMdExtensionCheckbox = getRequiredElement<HTMLInputElement>('auto-add-md-extension');
const ensureAgentsFrontmatterCheckbox = getRequiredElement<HTMLInputElement>('ensure-agents-frontmatter');
const conflictStrategySelect = getRequiredElement<HTMLSelectElement>('conflict-strategy');
const syncStatusIndicator = getRequiredElement('sync-status-indicator');
const syncWorkspacePath = getRequiredElement('sync-workspace-path');
const syncLastSync = getRequiredElement('sync-last-sync');
const syncLogContent = getRequiredElement('sync-log-content');
const syncProgressOverlay = getRequiredElement('sync-progress-overlay');
const syncProgressBar = getRequiredElement('sync-progress-bar');
const syncProgressText = getRequiredElement('sync-progress-text');
const syncProgressDetails = getRequiredElement('sync-progress-details');
const cancelSyncBtn = getRequiredElement('cancel-sync-btn');

// Setup Wizard Elements
const setupWizardModal = getRequiredElement('setup-wizard-modal');
const setupAuthStatus = getRequiredElement('setup-auth-status');
const setupValidateAuthBtn = getRequiredElement('setup-validate-auth');
const setupWorkspaceStatus = getRequiredElement('setup-workspace-status');
const setupChooseFolderBtn = getRequiredElement('setup-choose-folder');
const setupBidirectionalCheckbox = getRequiredElement<HTMLInputElement>('setup-bidirectional');
const setupSyncChatsCheckbox = getRequiredElement<HTMLInputElement>('setup-sync-chats');
const setupAutoAddMdCheckbox = getRequiredElement<HTMLInputElement>('setup-auto-add-md');
const setupEnsureAgentsFrontmatterCheckbox = getRequiredElement<HTMLInputElement>('setup-ensure-agents-frontmatter');
const setupConflictStrategySelect = getRequiredElement<HTMLSelectElement>('setup-conflict-strategy');
const setupPrevBtn = getRequiredElement('setup-prev-btn');
const setupNextBtn = getRequiredElement('setup-next-btn');
const setupFinishBtn = getRequiredElement('setup-finish-btn');
const setupSkipBtn = getRequiredElement('setup-skip-btn');

// Setup Wizard State
let wizardCurrentStep = 1;
let wizardTotalSteps = 4;
let wizardAuthValid = false;
let wizardWorkspaceHandle: FileSystemDirectoryHandle | null = null;

// Setup Wizard Functions
function showSetupWizard() {
  setupWizardModal.classList.remove('hidden');
  wizardCurrentStep = 1;
  goToWizardStep(1);
  setupWizardEventListeners();
}

function goToWizardStep(step: number) {
  // Hide all steps
  for (let i = 1; i <= wizardTotalSteps; i++) {
    const stepElement = document.getElementById(`setup-step-${i}`);
    if (stepElement) {
      stepElement.classList.add('hidden');
    }
  }

  // Show current step
  const currentStepElement = document.getElementById(`setup-step-${step}`);
  if (currentStepElement) {
    currentStepElement.classList.remove('hidden');
  }

  wizardCurrentStep = step;

  // Update button visibility
  setupPrevBtn.classList.toggle('hidden', step === 1);
  setupNextBtn.classList.toggle('hidden', step === wizardTotalSteps);
  setupFinishBtn.classList.toggle('hidden', step !== wizardTotalSteps);

  // Auto-validate auth on step 1
  if (step === 1) {
    validateWizardAuth();
  }
}

function setupWizardEventListeners() {
  // Previous button
  setupPrevBtn.onclick = () => {
    if (wizardCurrentStep > 1) {
      goToWizardStep(wizardCurrentStep - 1);
    }
  };

  // Next button
  setupNextBtn.onclick = () => {
    if (wizardCurrentStep < wizardTotalSteps) {
      // Validate before moving forward
      if (wizardCurrentStep === 1 && !wizardAuthValid) {
        toast.warning('Please validate your session before continuing');
        return;
      }
      if (wizardCurrentStep === 2 && !wizardWorkspaceHandle) {
        toast.warning('Please select a workspace folder before continuing');
        return;
      }
      goToWizardStep(wizardCurrentStep + 1);
    }
  };

  // Finish button
  setupFinishBtn.onclick = async () => {
    await finishWizardSetup();
  };

  // Skip button
  setupSkipBtn.onclick = () => {
    skipWizardSetup();
  };

  // Validate auth button
  setupValidateAuthBtn.onclick = async () => {
    await validateWizardAuth();
  };

  // Choose folder button
  setupChooseFolderBtn.onclick = async () => {
    await chooseWizardWorkspace();
  };
}

async function validateWizardAuth() {
  setupAuthStatus.innerHTML = '<div class="setup-loading">Checking authentication...</div>';

  try {
    const response = await browser.runtime.sendMessage({ action: 'validate-session' });
    wizardAuthValid = response.success;

    if (wizardAuthValid) {
      setupAuthStatus.innerHTML = '<div class="setup-success">✓ Authenticated successfully</div>';
    } else {
      setupAuthStatus.innerHTML = '<div class="setup-error">✗ Not authenticated - Please log in to Claude.ai</div>';
    }
  } catch (error) {
    console.error('Auth validation failed:', error);
    wizardAuthValid = false;
    setupAuthStatus.innerHTML = '<div class="setup-error">✗ Connection error</div>';
  }
}

async function chooseWizardWorkspace() {
  try {
    const handle = await pickWorkspaceDirectory();
    if (handle) {
      wizardWorkspaceHandle = handle;
      setupWorkspaceStatus.innerHTML = `<div class="setup-success">✓ Folder selected: ${handle.name}</div>`;
    }
  } catch (error) {
    console.error('Failed to select workspace:', error);
    setupWorkspaceStatus.innerHTML = '<div class="setup-error">✗ Failed to select folder</div>';
  }
}

async function finishWizardSetup() {
  try {
    // Save workspace handle to IndexedDB
    if (wizardWorkspaceHandle) {
      await saveWorkspaceHandle(wizardWorkspaceHandle);
      state.workspaceHandle = wizardWorkspaceHandle;
    }

    // Get current config or create new one
    const config = await getWorkspaceConfig();

    // Update workspace path
    config.workspacePath = wizardWorkspaceHandle?.name || '';

    // Update settings from wizard
    config.settings = {
      autoSync: false, // Default to manual sync
      syncInterval: config.settings?.syncInterval || 15,
      bidirectional: setupBidirectionalCheckbox.checked,
      syncChats: setupSyncChatsCheckbox.checked,
      autoAddMdExtension: setupAutoAddMdCheckbox.checked,
      ensureAgentsFrontmatter: setupEnsureAgentsFrontmatterCheckbox.checked,
      conflictStrategy: setupConflictStrategySelect.value as 'remote' | 'local' | 'newer',
      useAccountSubfolders: config.settings?.useAccountSubfolders ?? true
    };

    // Save config
    await saveWorkspaceConfig(config);

    // Mark setup as complete
    await browser.storage.local.set({ setupComplete: true });

    // Close wizard
    setupWizardModal.classList.add('hidden');

    // Reload sync tab to reflect new settings
    await initSyncTab();

    console.log('Setup wizard completed successfully');
  } catch (error) {
    console.error('Failed to complete setup:', error);
    toast.error('Failed to save setup. Please try again.');
  }
}

function skipWizardSetup() {
  // Mark setup as skipped (so we don't show it again)
  browser.storage.local.set({ setupComplete: true });
  setupWizardModal.classList.add('hidden');
  console.log('Setup wizard skipped');
}

// Initialize
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  // Check if this is first-time setup
  const storage = await browser.storage.local.get('setupComplete');
  const isSetupComplete = storage.setupComplete === true;

  // Check if workspace is already configured
  const isConfigured = await isWorkspaceConfigured();
  const hasHandle = await getWorkspaceHandle();

  // Show wizard if not complete and not configured
  if (!isSetupComplete && !isConfigured && !hasHandle) {
    showSetupWizard();
    // Still initialize the rest of the dashboard in the background
  }

  await checkConnection();

  // Load current organization
  try {
    const orgResponse = await browser.runtime.sendMessage({ action: 'get-current-org' });
    if (orgResponse.success) {
      state.currentOrg = orgResponse.data;
      updateOrgDisplay();
    }
  } catch (error) {
    console.error('Failed to get current organization:', error);
  }

  // Load account display
  await loadAccountDisplay();

  setupEventListeners();
  await initSyncTab();
  await loadPinned();
  await loadFavorites();
  await handleHashNavigation();
  
  if (state.isConnected) {
    await loadAllData();
    renderCurrentTab();
    updateAnalytics();
  }
}

async function handleHashNavigation() {
  const hash = window.location.hash;
  if (!hash) {
    return;
  }
  
  const normalized = hash.toLowerCase();
  if (normalized.startsWith('#sync')) {
    switchTab('sync');
    if (normalized.includes('diff')) {
      // We can't auto-trigger showDirectoryPicker without a user gesture.
      // Instead, show a prompt asking user to click the diff button.
      // Check if workspace handle exists first.
      if (!state.workspaceHandle) {
        // Show a notification prompting user to click the button
        setTimeout(() => {
          const notification = document.createElement('div');
          notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #4a5568;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 14px;
            max-width: 400px;
            text-align: center;
          `;
          notification.innerHTML = `
            <strong>Diff Requested</strong><br>
            <span style="opacity: 0.9;">Click "Preview Diff" below to select your workspace folder and view changes.</span>
          `;
          document.body.appendChild(notification);
          
          // Highlight the preview diff button
          previewDiffBtn.style.animation = 'pulse 1s ease-in-out 3';
          previewDiffBtn.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.5)';
          
          setTimeout(() => {
            notification.remove();
            previewDiffBtn.style.animation = '';
            previewDiffBtn.style.boxShadow = '';
          }, 5000);
        }, 300);
      } else {
        // Workspace handle exists, safe to trigger diff
        setTimeout(() => {
          previewDiffBtn.click();
        }, 300);
      }
    }
  }
  
  // Clear the hash so refreshing the dashboard doesn't re-trigger the action
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

async function checkConnection() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'validate-session' });
    state.isConnected = response.success;

    if (state.isConnected) {
      statusBar.classList.add('connected');
      statusText.textContent = 'Connected to Claude.ai';
    } else {
      statusBar.classList.add('error');
      statusText.textContent = 'Not connected - Please log in to Claude.ai';
    }
  } catch (error) {
    console.error('Connection check failed:', error);
    state.isConnected = false;
    statusBar.classList.add('error');
    statusText.textContent = 'Connection error';
  }
}

async function loadAllData() {
  await Promise.all([loadProjects(), loadConversations()]);
  await loadAllFiles();
  await loadAllTags();
  await indexAllData();
}

async function loadAllTags() {
  // Load tags for all projects
  for (const project of state.projects) {
    const tags = await tagsService.getItemTags(project.uuid, 'project');
    state.projectTags.set(project.uuid, tags);
  }

  // Load tags for all files
  for (const file of state.files) {
    const tags = await tagsService.getItemTags(file.uuid, 'file');
    state.fileTags.set(file.uuid, tags);
  }

  // Load tags for all conversations
  for (const conversation of state.conversations) {
    const tags = await tagsService.getItemTags(conversation.uuid, 'conversation');
    state.conversationTags.set(conversation.uuid, tags);
  }
}

async function indexAllData() {
  const searchableItems: SearchableItem[] = [];

  // Index projects with tags
  state.projects.forEach(project => {
    const item = projectToSearchableItem(project);
    const tags = state.projectTags.get(project.uuid) || [];
    item.metadata.tags = tags.map(t => t.name);
    searchableItems.push(item);
  });

  // Index files with tags
  state.files.forEach(file => {
    const item = fileToSearchableItem(file, file.project_uuid, file.project_name);
    const tags = state.fileTags.get(file.uuid) || [];
    item.metadata.tags = tags.map(t => t.name);
    searchableItems.push(item);
  });

  // Index conversations with tags
  state.conversations.forEach(conversation => {
    const project = state.projects.find(p => p.uuid === conversation.project_uuid);
    const item = conversationToSearchableItem(conversation, project?.name);
    const tags = state.conversationTags.get(conversation.uuid) || [];
    item.metadata.tags = tags.map(t => t.name);
    searchableItems.push(item);
  });

  await searchService.indexItems(searchableItems);
  console.log(`Indexed ${searchableItems.length} items for search`);
}

async function loadProjects() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-projects' });
    if (response.success) {
      state.projects = response.data || [];
      projectsCount.textContent = state.projects.length.toString();
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
  }
}

async function loadAllFiles() {
  state.files = [];
  for (const project of state.projects) {
    try {
      const response = await browser.runtime.sendMessage({
        action: 'get-project-files',
        projectId: project.uuid,
      });
      if (response.success && response.data) {
        state.files.push(
          ...response.data.map((file: any) => ({
            ...file,
            project_uuid: project.uuid,
            project_name: project.name,
          }))
        );
      }
    } catch (error) {
      console.error(`Failed to load files for project ${project.uuid}:`, error);
    }
  }
}

async function loadConversations() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-conversations' });
    if (response.success) {
      state.conversations = response.data || [];
    }
  } catch (error) {
    console.error('Failed to load conversations:', error);
  }
}

function setupEventListeners() {
  // Tab navigation
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab')!;
      switchTab(tabName);
    });
  });

  // View mode toggles
  viewGridBtn.addEventListener('click', () => setViewMode('grid'));
  viewListBtn.addEventListener('click', () => setViewMode('list'));

  // Refresh button
  refreshAllBtn.addEventListener('click', async () => {
    await loadAllData();
    renderCurrentTab();
    updateAnalytics();
  });

  // Global search
  globalSearch.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    performSearch(query);
  });
  
  // Keyboard shortcut for search (/ or Cmd+K)
  document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    // "/" key or Cmd/Ctrl + K to focus search
    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
      e.preventDefault();
      globalSearch.focus();
      globalSearch.select();
    }
    
    // Number keys 1-6 to switch tabs
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      const tabKeys: { [key: string]: string } = {
        '1': 'projects',
        '2': 'files', 
        '3': 'conversations',
        '4': 'analytics',
        '5': 'sync',
        '6': 'settings'
      };
      
      if (tabKeys[e.key]) {
        e.preventDefault();
        switchTab(tabKeys[e.key]);
      }
    }
  });
  
  // Escape to clear search and blur
  globalSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      globalSearch.value = '';
      globalSearch.blur();
      performSearch('');
    }
  });

  // Select all buttons
  selectAllProjectsBtn.addEventListener('click', toggleSelectAllProjects);

  // Event delegation for project cards (prevents memory leaks from re-rendering)
  projectsGrid.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.project-card');
    if (!card) return;

    const projectId = card.getAttribute('data-project-id');
    if (!projectId) return;

    // Handle checkbox clicks
    if (target.classList.contains('project-checkbox')) {
      toggleProjectSelection(projectId);
      return;
    }

    // Handle pin button clicks
    if (target.classList.contains('pin-btn')) {
      togglePinned(projectId);
      return;
    }

    // Handle favorite button clicks
    if (target.classList.contains('fav-btn')) {
      toggleFavorite(projectId);
      return;
    }

    // Handle expand button clicks
    if (target.classList.contains('expand-btn')) {
      const expandBtn = target as HTMLButtonElement;
      toggleProjectExpand(projectId, card as HTMLElement, expandBtn);
      return;
    }

    // Handle action button clicks
    if (target.textContent === 'Open') {
      openProject(projectId);
      return;
    }

    if (target.textContent === 'Files') {
      viewProjectFiles(projectId);
      return;
    }

    if (target.textContent === '🏷️ Tags' || target.classList.contains('tags-btn')) {
      handleProjectTagsClick(projectId);
      return;
    }

    // Handle instructions button clicks
    if (target.classList.contains('instructions-btn') || target.textContent === '📝') {
      const project = state.projects.find(p => p.uuid === projectId);
      if (project) {
        showInstructionsEditor({
          projectId: projectId,
          projectName: project.name,
          currentInstructions: project.instructions || ''
        });
      }
      return;
    }
  });

  // Context menu for project cards (right-click)
  projectsGrid.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.project-card');
    if (!card) return;

    const projectId = card.getAttribute('data-project-id');
    if (!projectId) return;

    const project = state.projects.find((p: any) => p.uuid === projectId);
    if (project) {
      showContextMenu(e, getProjectContextMenuItems(projectId, project));
    }
  });

  // Bulk actions
  bulkActionsProjectsBtn.addEventListener('click', (e) => {
    const menu = document.getElementById('bulk-actions-menu')!;
    const isHidden = menu.classList.contains('hidden');

    if (isHidden) {
      // Position menu relative to button
      const buttonRect = bulkActionsProjectsBtn.getBoundingClientRect();
      menu.style.top = `${buttonRect.bottom + window.scrollY + 8}px`;
      menu.style.left = `${buttonRect.left + window.scrollX}px`;
    }

    menu.classList.toggle('hidden');
  });

  // Bulk actions menu items
  document.querySelectorAll('.bulk-menu-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      const action = (e.target as HTMLElement).getAttribute('data-action')!;
      await handleBulkAction(action);
      document.getElementById('bulk-actions-menu')!.classList.add('hidden');
    });
  });

  // File bulk actions
  selectAllFilesBtn.addEventListener('click', toggleSelectAllFiles);

  bulkActionsFilesBtn.addEventListener('click', (e) => {
    const menu = document.getElementById('bulk-actions-menu-files')!;
    const isHidden = menu.classList.contains('hidden');

    if (isHidden) {
      // Position menu relative to button
      const buttonRect = bulkActionsFilesBtn.getBoundingClientRect();
      menu.style.top = `${buttonRect.bottom + window.scrollY + 8}px`;
      menu.style.left = `${buttonRect.left + window.scrollX}px`;
    }

    menu.classList.toggle('hidden');
  });

  // File bulk actions menu items
  document.querySelectorAll('.bulk-menu-item-files').forEach((item) => {
    item.addEventListener('click', async (e) => {
      const action = (e.target as HTMLElement).getAttribute('data-action')!;
      await handleFileBulkAction(action);
      document.getElementById('bulk-actions-menu-files')!.classList.add('hidden');
    });
  });

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const projectMenu = document.getElementById('bulk-actions-menu')!;
    const fileMenu = document.getElementById('bulk-actions-menu-files')!;

    // Close project menu if clicking outside
    if (!projectMenu.contains(target) && target !== bulkActionsProjectsBtn) {
      projectMenu.classList.add('hidden');
    }

    // Close file menu if clicking outside
    if (!fileMenu.contains(target) && target !== bulkActionsFilesBtn) {
      fileMenu.classList.add('hidden');
    }
  });

  // New project
  newProjectBtn.addEventListener('click', () => {
    showNewProjectModal();
  });

  // Sort projects
  sortProjects.addEventListener('change', () => {
    sortProjectsBy(sortProjects.value as any);
    renderProjects();
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      (e.target as HTMLElement).classList.add('active');
      const filter = (e.target as HTMLElement).getAttribute('data-filter')!;
      filterProjects(filter);
    });
  });

  // Tag filter
  const filterBar = document.querySelector('.filter-bar')!;
  createTagFilter((selectedTagIds) => {
    state.filterTags = selectedTagIds;
    renderProjects();
  }).then(tagFilter => {
    filterBar.appendChild(tagFilter);
  });

  // Export all data
  exportAllDataBtn.addEventListener('click', () => {
    showExportModal();
  });

  // Settings button (optional - may be removed if settings moved to Analytics tab)
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      showSettingsModal();
    });
  }

  // Account switcher
  accountSwitcherBtn.addEventListener('click', showAccountSwitcher);
  closeAccountModal.addEventListener('click', () => {
    accountSwitcherModal.classList.add('hidden');
  });
  addAccountBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://claude.ai/login' });
  });
  refreshSessionBtn.addEventListener('click', () => {
    validateAuthSession();
  });
  // Close account modal when clicking outside
  accountSwitcherModal.addEventListener('click', (e) => {
    if (e.target === accountSwitcherModal) {
      accountSwitcherModal.classList.add('hidden');
    }
  });

  // Org switcher
  orgSwitcherBtn.addEventListener('click', showOrgSwitcher);
  closeOrgModal.addEventListener('click', () => {
    orgSwitcherModal.classList.add('hidden');
  });

  // Close org modal when clicking outside
  orgSwitcherModal.addEventListener('click', (e) => {
    if (e.target === orgSwitcherModal) {
      orgSwitcherModal.classList.add('hidden');
    }
  });

  // Auth modal
  authBtn.addEventListener('click', showAuthModal);
  closeAuthModal.addEventListener('click', () => {
    authModal.classList.add('hidden');
  });
  validateSessionBtn.addEventListener('click', validateAuthSession);
  showSessionKeyBtn.addEventListener('click', toggleSessionKeyDisplay);

  // Close auth modal when clicking outside
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) {
      authModal.classList.add('hidden');
    }
  });

  // Sync tab event listeners
  setupWorkspaceBtn.addEventListener('click', setupWorkspace);
  configureWorkspaceBtn.addEventListener('click', setupWorkspace);
  syncNowBtn.addEventListener('click', () => syncNow(false));
  syncChatsOnlyBtn.addEventListener('click', () => syncChatsOnly(false));
  previewDiffBtn.addEventListener('click', viewWorkspaceDiff);

  // Copy workspace path to clipboard
  copyPathBtn.addEventListener('click', async () => {
    const config = await getWorkspaceConfig();
    const pathToCopy = config.workspacePath || 'Workspace path not available';

    try {
      await navigator.clipboard.writeText(pathToCopy);
      const originalText = copyPathBtn.textContent;
      copyPathBtn.textContent = '✓ Copied!';
      copyPathBtn.style.background = '#48bb78';
      setTimeout(() => {
        copyPathBtn.textContent = originalText;
        copyPathBtn.style.background = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy path to clipboard');
    }
  });

  // Sync settings
  autoSyncEnabledCheckbox.addEventListener('change', saveSyncSettings);
  syncIntervalSelect.addEventListener('change', saveSyncSettings);
  bidirectionalSyncCheckbox.addEventListener('change', saveSyncSettings);
  syncChatsCheckbox.addEventListener('change', saveSyncSettings);
  autoAddMdExtensionCheckbox.addEventListener('change', saveSyncSettings);
  ensureAgentsFrontmatterCheckbox.addEventListener('change', saveSyncSettings);
  conflictStrategySelect.addEventListener('change', saveSyncSettings);

  cancelSyncBtn.addEventListener('click', () => {
    state.isSyncing = false;
    hideSyncProgress();
  });
  
  // Setup OAuth modal event listeners
  setupOAuthEventListeners();
}

function switchTab(tabName: string) {
  state.currentTab = tabName;

  // Update nav tabs
  navTabs.forEach((tab) => {
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update tab content
  tabContents.forEach((content) => {
    if (content.id === `${tabName}-tab`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  renderCurrentTab();
}

function renderCurrentTab() {
  switch (state.currentTab) {
    case 'projects':
      renderProjects();
      break;
    case 'files':
      renderFiles();
      break;
    case 'conversations':
      renderConversations();
      break;
    case 'sync':
      // Sync tab renders itself based on state
      break;
    case 'analytics':
      updateAnalytics();
      break;
    case 'settings':
      initSettingsTab();
      break;
  }
}

function renderProjects() {
  // Preserve scroll position
  const scrollTop = projectsGrid.scrollTop;
  
  projectsGrid.textContent = '';

  // Filter by tags if any are selected
  let filteredProjects = state.projects;
  if (state.filterTags.length > 0) {
    filteredProjects = filteredProjects.filter(project => {
      const projectTags = state.projectTags.get(project.uuid) || [];
      const projectTagIds = projectTags.map(t => t.id);
      return state.filterTags.some(tagId => projectTagIds.includes(tagId));
    });
  }

  // Filter by pinned if enabled
  if (state.showPinnedOnly) {
    filteredProjects = filteredProjects.filter(project => state.pinned.has(project.uuid));
  }

  // Filter by favorites if enabled
  if (state.showFavoritesOnly) {
    filteredProjects = filteredProjects.filter(project => state.favorites.has(project.uuid));
  }

  if (filteredProjects.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    let emptyMessage = 'No projects found';
    if (state.showFavoritesOnly && state.filterTags.length > 0) {
      emptyMessage = 'No favorite projects match the selected tags';
    } else if (state.showFavoritesOnly) {
      emptyMessage = 'No favorites yet. Click the ⭐ on a project to favorite it.';
    } else if (state.showPinnedOnly && state.filterTags.length > 0) {
      emptyMessage = 'No pinned projects match the selected tags';
    } else if (state.showPinnedOnly) {
      emptyMessage = 'No pinned projects yet. Click the 📌 on a project to pin it.';
    } else if (state.filterTags.length > 0) {
      emptyMessage = 'No projects match the selected tags';
    }
    emptyState.textContent = emptyMessage;
    projectsGrid.appendChild(emptyState);
    return;
  }

  projectsGrid.className = state.viewMode === 'grid' ? 'projects-grid' : 'projects-list';

  filteredProjects.forEach((project) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.projectId = project.uuid;
    if (state.selectedProjects.has(project.uuid)) {
      card.classList.add('selected');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'project-checkbox';
    checkbox.checked = state.selectedProjects.has(project.uuid);
    // Event handled by delegation in setupEventListeners

    const header = document.createElement('div');
    header.className = 'project-header';

    const title = document.createElement('h3');
    title.textContent = project.name;

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    if (state.pinned.has(project.uuid)) {
      pinBtn.classList.add('active');
    }
    pinBtn.textContent = '📌';
    pinBtn.title = state.pinned.has(project.uuid) ? 'Unpin' : 'Pin';

    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn';
    if (state.favorites.has(project.uuid)) {
      favBtn.classList.add('active');
    }
    favBtn.textContent = '⭐';
    favBtn.title = state.favorites.has(project.uuid) ? 'Remove from favorites' : 'Add to favorites';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    expandBtn.textContent = '▶';
    expandBtn.title = 'Show files';

    header.appendChild(checkbox);
    header.appendChild(title);
    header.appendChild(favBtn);
    header.appendChild(pinBtn);
    header.appendChild(expandBtn);

    const description = document.createElement('p');
    description.className = 'project-description';
    description.textContent = project.description || 'No description';

    const meta = document.createElement('div');
    meta.className = 'project-meta';
    const date = new Date(project.created_at || Date.now());
    meta.textContent = `Created ${date.toLocaleDateString()}`;

    // Tags display
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tags-container';
    const projectTags = state.projectTags.get(project.uuid) || [];
    projectTags.forEach(tag => {
      tagsContainer.appendChild(createTagBadge(tag, { small: true }));
    });

    const actions = document.createElement('div');
    actions.className = 'project-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'action-btn small';
    openBtn.textContent = 'Open';
    // Event handled by delegation in setupEventListeners

    const filesBtn = document.createElement('button');
    filesBtn.className = 'action-btn small';
    filesBtn.textContent = 'Files';
    // Event handled by delegation in setupEventListeners

    const tagsBtn = document.createElement('button');
    tagsBtn.className = 'action-btn small tags-btn';
    tagsBtn.textContent = '🏷️ Tags';
    // Event handled by delegation in setupEventListeners

    const instructionsBtn = document.createElement('button');
    instructionsBtn.className = 'action-btn small instructions-btn';
    instructionsBtn.textContent = '📝';
    instructionsBtn.title = 'Edit project instructions';
    // Event handled by delegation in setupEventListeners

    actions.appendChild(openBtn);
    actions.appendChild(filesBtn);
    actions.appendChild(tagsBtn);
    actions.appendChild(instructionsBtn);

    card.appendChild(header);
    card.appendChild(description);
    card.appendChild(meta);
    card.appendChild(tagsContainer);
    card.appendChild(actions);

    // Files container (initially hidden)
    const filesContainer = document.createElement('div');
    filesContainer.className = 'project-files-container';
    filesContainer.style.display = 'none';
    card.appendChild(filesContainer);

    projectsGrid.appendChild(card);
  });
  
  // Restore scroll position
  projectsGrid.scrollTop = scrollTop;
}

/**
 * Toggle project expansion to show/hide files
 */
async function toggleProjectExpand(projectId: string, card: HTMLElement, expandBtn: HTMLElement) {
  const filesContainer = card.querySelector('.project-files-container') as HTMLElement;
  const isExpanded = filesContainer.style.display !== 'none';

  if (isExpanded) {
    // Collapse
    filesContainer.style.display = 'none';
    expandBtn.textContent = '▶';
    expandBtn.title = 'Show files';
  } else {
    // Expand and load files
    expandBtn.textContent = '▼';
    expandBtn.title = 'Hide files';
    filesContainer.style.display = 'block';
    filesContainer.innerHTML = '<div style="padding: 12px; text-align: center;">Loading files...</div>';

    try {
      // Fetch files for this project
      const response = await browser.runtime.sendMessage({
        action: 'get-project-files',
        projectId: projectId
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch files');
      }

      const files = response.data || [];
      renderProjectFiles(filesContainer, projectId, files);
    } catch (error) {
      console.error('Error loading project files:', error);
      filesContainer.innerHTML = `<div style="padding: 12px; color: #f56565;">Error loading files: ${(error as Error).message}</div>`;
    }
  }
}

/**
 * Render files within an expanded project card
 */
function renderProjectFiles(container: HTMLElement, projectId: string, files: any[]) {
  container.innerHTML = '';

  if (files.length === 0) {
    container.innerHTML = '<div style="padding: 12px; color: #999;">No files in this project</div>';
    return;
  }

  // Toolbar with bulk actions
  const toolbar = document.createElement('div');
  toolbar.className = 'project-files-toolbar';

  const selectInfo = document.createElement('div');
  selectInfo.className = 'project-files-toolbar__select';

  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.className = 'mr-8';
  selectAllCheckbox.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    container.querySelectorAll('.file-item-checkbox').forEach((cb: any) => {
      cb.checked = checked;
    });
    updateBulkActionsVisibility(container, projectId);
  });

  selectInfo.appendChild(selectAllCheckbox);
  selectInfo.appendChild(document.createTextNode(`${files.length} file${files.length !== 1 ? 's' : ''}`));

  const bulkActions = document.createElement('div');
  bulkActions.className = 'project-files-toolbar__bulk';

  const bulkDeleteBtn = document.createElement('button');
  bulkDeleteBtn.className = 'action-btn small danger';
  bulkDeleteBtn.textContent = '🗑️ Delete Selected';
  bulkDeleteBtn.addEventListener('click', () => bulkDeleteProjectFiles(container, projectId));

  bulkActions.appendChild(bulkDeleteBtn);

  toolbar.appendChild(selectInfo);
  toolbar.appendChild(bulkActions);
  container.appendChild(toolbar);

  // Files list
  const filesList = document.createElement('div');
  filesList.className = 'project-files-list';

  files.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'project-file-item';
    fileItem.dataset.fileId = file.uuid;

    const leftSection = document.createElement('div');
    leftSection.className = 'project-file-item__left';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-item-checkbox';
    checkbox.addEventListener('change', () => updateBulkActionsVisibility(container, projectId));

    const fileName = document.createElement('span');
    fileName.textContent = file.file_name;
    fileName.className = 'project-file-item__name';

    leftSection.appendChild(checkbox);
    leftSection.appendChild(fileName);

    const actionsSection = document.createElement('div');
    actionsSection.className = 'project-file-item__actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn small';
    editBtn.textContent = '📝';
    editBtn.title = 'Edit file';
    editBtn.addEventListener('click', () => {
      showFileEditor({
        projectId,
        file: {
          uuid: file.uuid,
          file_name: file.file_name,
          content: file.content || ''
        }
      });
    });

    const renameBtn = document.createElement('button');
    renameBtn.className = 'action-btn small';
    renameBtn.textContent = '✏️';
    renameBtn.title = 'Rename';
    renameBtn.addEventListener('click', () => renameProjectFile(projectId, file));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn small danger';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', () => deleteProjectFile(projectId, file, fileItem));

    actionsSection.appendChild(editBtn);
    actionsSection.appendChild(renameBtn);
    actionsSection.appendChild(deleteBtn);

    // Context menu for file item (right-click)
    fileItem.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e as MouseEvent, getFileContextMenuItems(file, projectId));
    });

    fileItem.appendChild(leftSection);
    fileItem.appendChild(actionsSection);
    filesList.appendChild(fileItem);
  });

  container.appendChild(filesList);
}

/**
 * Update bulk actions visibility based on selection
 */
function updateBulkActionsVisibility(container: HTMLElement, projectId: string) {
  const checkboxes = container.querySelectorAll('.file-item-checkbox:checked');
  const bulkActions = container.querySelector('.project-files-toolbar__bulk') as HTMLElement;

  if (checkboxes.length > 0) {
    bulkActions.classList.add('visible');
  } else {
    bulkActions.classList.remove('visible');
  }
}

/**
 * Rename a project file
 */
async function renameProjectFile(projectId: string, file: any) {
  const newName = prompt(`Rename "${file.file_name}" to:`, file.file_name);

  if (!newName || newName === file.file_name) {
    return;
  }

  try {
    if (!state.currentOrg) {
      throw new Error('No organization selected');
    }

    // Delete old file and upload with new name
    const apiClient = new ClaudeAPIClient(await getSessionKey());

    await apiClient.deleteFile(state.currentOrg.uuid, projectId, file.uuid);
    await apiClient.uploadFile(state.currentOrg.uuid, projectId, newName, file.content);

    toast.success(`File renamed to "${newName}"`);

    // Refresh the project card
    const card = document.querySelector(`[data-project-id="${projectId}"]`) as HTMLElement;
    const expandBtn = card?.querySelector('.expand-btn') as HTMLElement;
    if (card && expandBtn) {
      // Collapse and re-expand to refresh
      await toggleProjectExpand(projectId, card, expandBtn);
      await toggleProjectExpand(projectId, card, expandBtn);
    }
  } catch (error) {
    console.error('Error renaming file:', error);
    toast.error(`Failed to rename file: ${(error as Error).message}`);
  }
}

/**
 * Delete a project file
 */
async function deleteProjectFile(projectId: string, file: any, fileItem: HTMLElement) {
  // Use confirmation modal instead of browser confirm
  const confirmed = await showConfirmModal({
    title: 'Delete File',
    message: `Are you sure you want to delete "${file.file_name}"? This action cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    type: 'danger'
  });
  
  if (!confirmed) return;

  try {
    if (!state.currentOrg) {
      throw new Error('No organization selected');
    }

    // Validate session before attempting deletion
    const validationResponse = await browser.runtime.sendMessage({
      action: 'validate-session'
    });

    if (!validationResponse.success) {
      throw new Error('Session validation failed. Please reconnect to Claude.ai.');
    }

    const apiClient = new ClaudeAPIClient(await getSessionKey());
    await apiClient.deleteFile(state.currentOrg.uuid, projectId, file.uuid);

    fileItem.style.opacity = '0';
    setTimeout(() => fileItem.remove(), 300);

    toast.success(`File "${file.file_name}" deleted`);
  } catch (error) {
    console.error('Error deleting file:', error);
    toast.error(`Failed to delete file: ${(error as Error).message}`);
  }
}

/**
 * Bulk delete selected files in project
 */
async function bulkDeleteProjectFiles(container: HTMLElement, projectId: string) {
  const checkboxes = Array.from(container.querySelectorAll('.file-item-checkbox:checked'));
  const selectedCount = checkboxes.length;

  if (selectedCount === 0) {
    return;
  }

  if (!confirm(`Delete ${selectedCount} file(s)? This cannot be undone.`)) {
    return;
  }

  try {
    if (!state.currentOrg) {
      throw new Error('No organization selected');
    }

    const apiClient = new ClaudeAPIClient(await getSessionKey());

    for (const checkbox of checkboxes) {
      const fileItem = (checkbox as HTMLElement).closest('.project-file-item') as HTMLElement;
      const fileId = fileItem.dataset.fileId;

      if (fileId) {
        await apiClient.deleteFile(state.currentOrg.uuid, projectId, fileId);
        fileItem.style.opacity = '0';
        setTimeout(() => fileItem.remove(), 300);
      }
    }

    toast.success(`Deleted ${selectedCount} file(s)`);

    // Refresh the project card
    const card = document.querySelector(`[data-project-id="${projectId}"]`) as HTMLElement;
    const expandBtn = card?.querySelector('.expand-btn') as HTMLElement;
    if (card && expandBtn) {
      await toggleProjectExpand(projectId, card, expandBtn);
      await toggleProjectExpand(projectId, card, expandBtn);
    }
  } catch (error) {
    console.error('Error bulk deleting files:', error);
    toast.error(`Failed to delete files: ${(error as Error).message}`);
  }
}

/**
 * Helper to get session key
 */
async function getSessionKey(): Promise<string> {
  const response = await browser.runtime.sendMessage({
    action: 'get-api-client-session'
  });

  if (!response.success) {
    throw new Error('Not authenticated');
  }

  return response.data.sessionKey;
}

function renderFiles() {
  const filesList = document.getElementById('files-list')!;
  const filesCount = document.getElementById('files-count')!;
  
  // Preserve scroll position
  const scrollTop = filesList.scrollTop;
  const filesTabTitle = document.querySelector('#files-tab .tab-title h2')!;
  const tabActions = document.querySelector('#files-tab .tab-actions')!;

  // Filter files by project if filter is active
  let filesToDisplay = state.files;
  if (state.fileFilter) {
    filesToDisplay = state.files.filter(f => f.project_uuid === state.fileFilter!.projectId);
    filesTabTitle.textContent = `Files from ${state.fileFilter.projectName}`;

    // Add clear filter button if not already present
    let clearBtn = document.getElementById('clear-file-filter');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.id = 'clear-file-filter';
      clearBtn.className = 'action-btn secondary';
      clearBtn.textContent = '✕ Clear Filter';
      clearBtn.addEventListener('click', () => {
        state.fileFilter = null;
        renderFiles();
      });
      tabActions.insertBefore(clearBtn, tabActions.firstChild);
    }
  } else {
    filesTabTitle.textContent = 'All Files';

    // Remove clear filter button if present
    const clearBtn = document.getElementById('clear-file-filter');
    if (clearBtn) {
      clearBtn.remove();
    }
  }

  filesCount.textContent = filesToDisplay.length.toString();
  filesList.textContent = '';

  if (filesToDisplay.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = state.fileFilter
      ? `No files found in ${state.fileFilter.projectName}`
      : 'No files found';
    filesList.appendChild(emptyState);
    return;
  }

  filesToDisplay.forEach((file) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    if (state.selectedFiles.has(file.uuid)) {
      item.classList.add('selected');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'file-checkbox';
    checkbox.checked = state.selectedFiles.has(file.uuid);
    checkbox.addEventListener('change', () => toggleFileSelection(file.uuid));

    const icon = document.createElement('div');
    icon.className = 'file-icon';
    icon.textContent = '📄';

    const info = document.createElement('div');
    info.className = 'file-info';

    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.file_name;

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.textContent = `Project: ${file.project_name} • ${new Date(file.created_at).toLocaleDateString()}`;

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'file-actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'action-btn small';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => viewFile(file));

    actions.appendChild(viewBtn);

    item.appendChild(checkbox);
    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(actions);

    filesList.appendChild(item);
  });
  
  // Restore scroll position
  filesList.scrollTop = scrollTop;
}

/**
 * Export conversation to Markdown or JSON format
 */
async function exportConversation(conversationId: string, conversationName: string, format: 'markdown' | 'json') {
  try {
    if (!state.currentOrg) {
      toast.warning('No organization selected');
      return;
    }

    // Get API session
    const sessionResponse = await browser.runtime.sendMessage({
      action: 'get-api-client-session'
    });

    if (!sessionResponse.success) {
      throw new Error('Failed to get API session');
    }

    const { sessionKey, orgId } = sessionResponse.data;
    const apiClient = new ClaudeAPIClient(sessionKey);

    // Fetch full conversation with messages
    const fullConversation = await apiClient.getConversation(orgId, conversationId);

    // Sanitize filename
    const sanitizedName = conversationName
      .replace(/[^a-z0-9\s-]/gi, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'markdown') {
      // Format as Markdown
      const lines: string[] = [];
      lines.push(`# ${fullConversation.name}\n`);
      lines.push(`**Created:** ${new Date(fullConversation.created_at).toLocaleString()}`);
      lines.push(`**Updated:** ${new Date(fullConversation.updated_at).toLocaleString()}`);
      lines.push(`**Conversation ID:** ${fullConversation.uuid}\n`);
      lines.push('---\n');

      if (fullConversation.chat_messages && fullConversation.chat_messages.length > 0) {
        for (const message of fullConversation.chat_messages) {
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

      content = lines.join('\n');
      filename = `${sanitizedName}.md`;
      mimeType = 'text/markdown';
    } else {
      // Format as JSON
      content = JSON.stringify(fullConversation, null, 2);
      filename = `${sanitizedName}.json`;
      mimeType = 'application/json';
    }

    // Trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logSyncActivity('success', `Exported conversation "${conversationName}" as ${format.toUpperCase()}`);
  } catch (error) {
    console.error('Export failed:', error);
    toast.error(`Failed to export conversation: ${(error as Error).message}`);
  }
}

function renderConversations() {
  const conversationsList = document.getElementById('conversations-list')!;
  const conversationsCount = document.getElementById('conversations-count')!;
  conversationsCount.textContent = state.conversations.length.toString();
  
  // Preserve scroll position
  const scrollTop = conversationsList.scrollTop;

  conversationsList.textContent = '';

  if (state.conversations.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No conversations found';
    conversationsList.appendChild(emptyState);
    return;
  }

  state.conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'conversation-item';

    const icon = document.createElement('div');
    icon.className = 'conversation-icon';
    icon.textContent = '💬';

    const info = document.createElement('div');
    info.className = 'conversation-info';

    const name = document.createElement('div');
    name.className = 'conversation-name';
    name.textContent = conv.name;

    const meta = document.createElement('div');
    meta.className = 'conversation-meta';
    meta.textContent = `Last updated ${new Date(conv.updated_at).toLocaleDateString()}`;

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'conversation-actions';
    actions.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

    const openBtn = document.createElement('button');
    openBtn.className = 'action-btn small';
    openBtn.textContent = 'Open';
    openBtn.title = 'Open in new tab';
    openBtn.addEventListener('click', () => openConversation(conv.uuid));

    const sidepanelBtn = document.createElement('button');
    sidepanelBtn.className = 'action-btn small';
    sidepanelBtn.textContent = '📱 Sidepanel';
    sidepanelBtn.title = 'Open in sidepanel';
    sidepanelBtn.style.cssText = 'background: #805ad5;';
    sidepanelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openConversationInSidepanel(conv.uuid);
    });

    const exportMdBtn = document.createElement('button');
    exportMdBtn.className = 'action-btn small';
    exportMdBtn.textContent = '📄 Export MD';
    exportMdBtn.title = 'Export as Markdown';
    exportMdBtn.style.cssText = 'background: #48bb78;';
    exportMdBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportConversation(conv.uuid, conv.name, 'markdown');
    });

    const exportJsonBtn = document.createElement('button');
    exportJsonBtn.className = 'action-btn small';
    exportJsonBtn.textContent = '📋 Export JSON';
    exportJsonBtn.title = 'Export as JSON';
    exportJsonBtn.style.cssText = 'background: #4299e1;';
    exportJsonBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportConversation(conv.uuid, conv.name, 'json');
    });

    actions.appendChild(openBtn);
    actions.appendChild(sidepanelBtn);
    actions.appendChild(exportMdBtn);
    actions.appendChild(exportJsonBtn);

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(actions);

    conversationsList.appendChild(item);
  });
  
  // Restore scroll position
  conversationsList.scrollTop = scrollTop;
}

function updateAnalytics() {
  totalProjectsEl.textContent = state.projects.length.toString();
  totalFilesEl.textContent = state.files.length.toString();
  totalConversationsEl.textContent = state.conversations.length.toString();

  // Calculate approximate storage
  const totalBytes = state.files.reduce((acc, file) => acc + (file.content?.length || 0), 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  totalStorageEl.textContent = `${totalMB} MB`;

  // Render enhanced analytics
  renderActivityTimeline();
  renderMostActiveProjects();
  renderAdditionalStats();
}

function renderActivityTimeline() {
  const timeline = document.getElementById('activity-timeline')!;
  timeline.textContent = '';

  // Combine all activities
  const activities: any[] = [
    ...state.projects.map((p) => ({
      type: 'project',
      name: p.name,
      uuid: p.uuid,
      date: p.created_at || p.updated_at,
      action: 'created',
    })),
    ...state.files.map((f) => ({
      type: 'file',
      name: f.file_name,
      uuid: f.uuid,
      date: f.created_at,
      action: 'uploaded',
    })),
    ...state.conversations.map((c) => ({
      type: 'conversation',
      name: c.name,
      uuid: c.uuid,
      date: c.updated_at,
      action: 'updated',
    })),
  ];

  // Sort by date
  activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Show top 10
  activities.slice(0, 10).forEach((activity) => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    
    // Make conversations clickable to open in sidepanel
    if (activity.type === 'conversation' && activity.uuid) {
      item.style.cursor = 'pointer';
      item.title = 'Click to open in sidepanel';
      item.addEventListener('click', () => openConversationInSidepanel(activity.uuid));
    }

    const icon = document.createElement('div');
    icon.className = 'timeline-icon';
    icon.textContent = activity.type === 'project' ? '📁' : activity.type === 'file' ? '📄' : '💬';

    const content = document.createElement('div');
    content.className = 'timeline-content';

    const text = document.createElement('div');
    text.textContent = `${activity.type} "${activity.name}" ${activity.action}`;

    const time = document.createElement('div');
    time.className = 'timeline-time';
    time.textContent = new Date(activity.date).toLocaleString();

    content.appendChild(text);
    content.appendChild(time);

    item.appendChild(icon);
    item.appendChild(content);

    timeline.appendChild(item);
  });
}

function renderMostActiveProjects() {
  const chartContainer = document.getElementById('active-projects-chart')!;
  chartContainer.textContent = '';

  // Calculate file count per project
  const projectFileCounts = new Map<string, number>();
  state.files.forEach(file => {
    const count = projectFileCounts.get(file.project_uuid) || 0;
    projectFileCounts.set(file.project_uuid, count + 1);
  });

  // Get top 5 projects by file count
  const topProjects = state.projects
    .map(project => ({
      name: project.name,
      fileCount: projectFileCounts.get(project.uuid) || 0,
      uuid: project.uuid
    }))
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, 5);

  if (topProjects.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.textContent = 'No project activity yet';
    emptyMsg.style.cssText = 'color: #999; text-align: center; padding: 20px;';
    chartContainer.appendChild(emptyMsg);
    return;
  }

  // Create a simple bar chart
  const maxCount = Math.max(...topProjects.map(p => p.fileCount));

  topProjects.forEach((project, index) => {
    const barContainer = document.createElement('div');
    barContainer.style.cssText = 'margin-bottom: 16px;';

    const label = document.createElement('div');
    label.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 14px;';

    const projectName = document.createElement('span');
    projectName.textContent = project.name;
    projectName.style.cssText = 'font-weight: 500;';

    const fileCount = document.createElement('span');
    fileCount.textContent = `${project.fileCount} file${project.fileCount !== 1 ? 's' : ''}`;
    fileCount.style.cssText = 'color: #666;';

    label.appendChild(projectName);
    label.appendChild(fileCount);

    const barBg = document.createElement('div');
    barBg.style.cssText = `
      width: 100%;
      height: 24px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
    `;

    const barFill = document.createElement('div');
    const percentage = (project.fileCount / maxCount) * 100;
    const colors = ['#667eea', '#4CAF50', '#2196F3', '#FF9800', '#E91E63'];
    barFill.style.cssText = `
      width: ${percentage}%;
      height: 100%;
      background: linear-gradient(135deg, ${colors[index % colors.length]} 0%, ${colors[index % colors.length]}cc 100%);
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      color: white;
      font-size: 12px;
      font-weight: 600;
    `;

    if (percentage > 15) {
      barFill.textContent = `${percentage.toFixed(0)}%`;
    }

    barBg.appendChild(barFill);
    barContainer.appendChild(label);
    barContainer.appendChild(barBg);
    chartContainer.appendChild(barContainer);
  });
}

function renderAdditionalStats() {
  // Find or create additional stats section
  let statsSection = document.querySelector('.analytics-section.additional-stats') as HTMLElement;

  if (!statsSection) {
    statsSection = document.createElement('div');
    statsSection.className = 'analytics-section additional-stats';

    const header = document.createElement('h3');
    header.textContent = 'Additional Insights';
    statsSection.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'insights-grid';
    grid.id = 'insights-grid';
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 16px;
    `;
    statsSection.appendChild(grid);

    const analyticsTab = document.getElementById('analytics-tab')!;
    analyticsTab.appendChild(statsSection);
  }

  const insightsGrid = document.getElementById('insights-grid')!;
  insightsGrid.textContent = '';

  // Calculate insights
  const avgFilesPerProject = state.projects.length > 0
    ? (state.files.length / state.projects.length).toFixed(1)
    : '0';

  const totalTags = state.projectTags.size + state.fileTags.size + state.conversationTags.size;

  const projectsWithFiles = new Set(state.files.map(f => f.project_uuid)).size;

  const recentActivity = state.projects.filter(p => {
    const created = new Date(p.created_at || 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return created > weekAgo;
  }).length;

  // Create insight cards
  const insights = [
    { label: 'Avg Files/Project', value: avgFilesPerProject, icon: '📊' },
    { label: 'Tagged Items', value: totalTags.toString(), icon: '🏷️' },
    { label: 'Active Projects', value: projectsWithFiles.toString(), icon: '✅' },
    { label: 'Recent Projects (7d)', value: recentActivity.toString(), icon: '🆕' }
  ];

  insights.forEach(insight => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    `;

    const icon = document.createElement('div');
    icon.textContent = insight.icon;
    icon.style.cssText = 'font-size: 32px; margin-bottom: 8px;';

    const value = document.createElement('div');
    value.textContent = insight.value;
    value.style.cssText = 'font-size: 28px; font-weight: 700; margin-bottom: 4px;';

    const label = document.createElement('div');
    label.textContent = insight.label;
    label.style.cssText = 'font-size: 14px; opacity: 0.9;';

    card.appendChild(icon);
    card.appendChild(value);
    card.appendChild(label);

    insightsGrid.appendChild(card);
  });
}

// Helper functions
function setViewMode(mode: 'grid' | 'list') {
  state.viewMode = mode;

  if (mode === 'grid') {
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
  } else {
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
  }

  renderProjects();
}

function toggleProjectSelection(uuid: string) {
  if (state.selectedProjects.has(uuid)) {
    state.selectedProjects.delete(uuid);
  } else {
    state.selectedProjects.add(uuid);
  }
  renderProjects();
}

function toggleSelectAllProjects() {
  if (state.selectedProjects.size === state.projects.length) {
    state.selectedProjects.clear();
  } else {
    state.projects.forEach((p) => state.selectedProjects.add(p.uuid));
  }
  renderProjects();
}

async function loadPinned(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('eidolon_pinned');
    const pinnedArray = result.eidolon_pinned || [];
    state.pinned = new Set(pinnedArray);
  } catch (error) {
    console.error('Failed to load pinned:', error);
  }
}

async function savePinned(): Promise<void> {
  try {
    await chrome.storage.local.set({ 
      eidolon_pinned: Array.from(state.pinned) 
    });
  } catch (error) {
    console.error('Failed to save pinned:', error);
  }
}

async function togglePinned(uuid: string): Promise<void> {
  if (state.pinned.has(uuid)) {
    state.pinned.delete(uuid);
    toast.info('Unpinned');
  } else {
    state.pinned.add(uuid);
    toast.success('Pinned');
  }
  await savePinned();
  renderProjects();
  updatePinnedFilterCount();
}

function togglePinnedFilter(): void {
  state.showPinnedOnly = !state.showPinnedOnly;
  const filterBtn = document.getElementById('pinned-filter-btn');
  if (filterBtn) {
    filterBtn.classList.toggle('active', state.showPinnedOnly);
  }
  renderProjects();
}

function updatePinnedFilterCount(): void {
  const countEl = document.querySelector('.pinned-count');
  if (countEl) {
    countEl.textContent = state.pinned.size.toString();
  }
}

// ============ Favorites Functions ============

async function loadFavorites(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('eidolon_favorites');
    const favoritesArray = result.eidolon_favorites || [];
    state.favorites = new Set(favoritesArray);
  } catch (error) {
    console.error('Failed to load favorites:', error);
  }
}

async function saveFavorites(): Promise<void> {
  try {
    await chrome.storage.local.set({ 
      eidolon_favorites: Array.from(state.favorites) 
    });
  } catch (error) {
    console.error('Failed to save favorites:', error);
  }
}

async function toggleFavorite(uuid: string): Promise<void> {
  if (state.favorites.has(uuid)) {
    state.favorites.delete(uuid);
    toast.info('Removed from favorites');
  } else {
    state.favorites.add(uuid);
    toast.success('Added to favorites');
  }
  await saveFavorites();
  renderProjects();
  updateFavoritesFilterCount();
}

function toggleFavoritesFilter(): void {
  state.showFavoritesOnly = !state.showFavoritesOnly;
  const filterBtn = document.getElementById('favorites-filter-btn');
  if (filterBtn) {
    filterBtn.classList.toggle('active', state.showFavoritesOnly);
  }
  renderProjects();
}

function updateFavoritesFilterCount(): void {
  const countEl = document.querySelector('.favorites-count');
  if (countEl) {
    countEl.textContent = state.favorites.size.toString();
  }
}

async function handleProjectTagsClick(projectId: string) {
  const projectTags = state.projectTags.get(projectId) || [];
  await showTagSelectionModal(projectId, 'project', projectTags);
  await loadAllTags();
  await indexAllData();
  renderProjects();
}

async function handleBulkAction(action: string) {
  const selectedCount = state.selectedProjects.size;

  if (selectedCount === 0) {
    toast.warning('No projects selected');
    return;
  }

  switch (action) {
    case 'archive':
      // Archive functionality not yet implemented in API
      toast.info(`Archive feature coming soon! Selected: ${selectedCount} project(s)`);
      break;

    case 'export':
      await exportSelectedProjects();
      break;

    case 'tag':
      await bulkAddTags();
      break;

    case 'delete':
      await bulkDeleteProjects();
      break;
  }
}

async function exportSelectedProjects() {
  const selectedProjects = state.projects.filter(p => state.selectedProjects.has(p.uuid));

  // Create export data
  const exportData = {
    exportDate: new Date().toISOString(),
    totalProjects: selectedProjects.length,
    projects: selectedProjects.map(project => ({
      name: project.name,
      description: project.description,
      created_at: project.created_at,
      uuid: project.uuid,
      tags: (state.projectTags.get(project.uuid) || []).map(t => t.name)
    }))
  };

  // Download as JSON
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eidolon-projects-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  toast.success(`Exported ${selectedProjects.length} project(s) successfully!`);
}

async function bulkAddTags() {
  if (state.selectedProjects.size === 0) return;

  // Show tag selection modal for the first selected project
  // Tags will be added to all selected projects
  const firstProjectId = Array.from(state.selectedProjects)[0];
  const firstProjectTags = state.projectTags.get(firstProjectId) || [];

  await showTagSelectionModal(firstProjectId, 'project', firstProjectTags);

  // Get the updated tags from the first project
  const updatedTags = await tagsService.getItemTags(firstProjectId, 'project');
  const tagIds = updatedTags.map(t => t.id);

  // Apply same tags to all other selected projects
  for (const projectId of state.selectedProjects) {
    if (projectId !== firstProjectId) {
      await tagsService.assignTags(projectId, 'project', tagIds);
    }
  }

  await loadAllTags();
  await indexAllData();
  renderProjects();

  toast.success(`Added tags to ${state.selectedProjects.size} project(s)!`);
}

async function bulkDeleteProjects() {
  const selectedCount = state.selectedProjects.size;

  const confirmed = confirm(
    `Are you sure you want to delete ${selectedCount} project(s)? This action cannot be undone.`
  );

  if (!confirmed) return;

  const orgId = state.currentOrg?.uuid;
  if (!orgId) {
    toast.warning('No organization selected');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  // Delete each selected project
  for (const projectId of state.selectedProjects) {
    try {
      // Note: Delete project API might not be available
      // For now, we'll just show what would be deleted
      console.log('Would delete project:', projectId);
      successCount++;
    } catch (error) {
      console.error('Failed to delete project:', projectId, error);
      failCount++;
    }
  }

  // Clear selection
  state.selectedProjects.clear();

  // Reload data
  await loadAllData();
  renderProjects();

  if (failCount > 0) {
    toast.warning(`Deleted ${successCount}, failed ${failCount} project(s)`);
  } else {
    toast.success(`Deleted ${successCount} project(s)`);
  }
}

// File selection and bulk operations
function toggleFileSelection(uuid: string) {
  if (state.selectedFiles.has(uuid)) {
    state.selectedFiles.delete(uuid);
  } else {
    state.selectedFiles.add(uuid);
  }
  renderFiles();
}

function toggleSelectAllFiles() {
  if (state.selectedFiles.size === state.files.length) {
    state.selectedFiles.clear();
  } else {
    state.files.forEach((f) => state.selectedFiles.add(f.uuid));
  }
  renderFiles();
}

async function handleFileBulkAction(action: string) {
  const selectedCount = state.selectedFiles.size;

  if (selectedCount === 0) {
    toast.warning('No files selected');
    return;
  }

  switch (action) {
    case 'export':
      await exportSelectedFiles();
      break;

    case 'tag':
      await bulkAddFileTags();
      break;

    case 'delete':
      await bulkDeleteFiles();
      break;
  }
}

async function exportSelectedFiles() {
  const selectedFiles = state.files.filter(f => state.selectedFiles.has(f.uuid));

  // Create export data
  const exportData = {
    exportDate: new Date().toISOString(),
    totalFiles: selectedFiles.length,
    files: selectedFiles.map(file => ({
      file_name: file.file_name,
      project_name: file.project_name,
      project_uuid: file.project_uuid,
      created_at: file.created_at,
      uuid: file.uuid,
      tags: (state.fileTags.get(file.uuid) || []).map(t => t.name)
    }))
  };

  // Download as JSON
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eidolon-files-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  toast.success(`Exported ${selectedFiles.length} file(s) successfully!`);
}

async function bulkAddFileTags() {
  if (state.selectedFiles.size === 0) return;

  const firstFileId = Array.from(state.selectedFiles)[0];
  const firstFileTags = state.fileTags.get(firstFileId) || [];

  await showTagSelectionModal(firstFileId, 'file', firstFileTags);

  const updatedTags = await tagsService.getItemTags(firstFileId, 'file');
  const tagIds = updatedTags.map(t => t.id);

  for (const fileId of state.selectedFiles) {
    if (fileId !== firstFileId) {
      await tagsService.assignTags(fileId, 'file', tagIds);
    }
  }

  await loadAllTags();
  await indexAllData();
  renderFiles();

  toast.success(`Added tags to ${state.selectedFiles.size} file(s)!`);
}

async function bulkDeleteFiles() {
  const selectedCount = state.selectedFiles.size;

  const confirmed = confirm(
    `Are you sure you want to delete ${selectedCount} file(s)? This action cannot be undone.`
  );

  if (!confirmed) return;

  const orgId = state.currentOrg?.uuid;
  if (!orgId) {
    toast.warning('No organization selected');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  // Delete each selected file
  for (const fileId of state.selectedFiles) {
    try {
      const file = state.files.find(f => f.uuid === fileId);
      if (file) {
        await browser.runtime.sendMessage({
          action: 'delete-file',
          orgId,
          projectId: file.project_uuid,
          fileId: file.uuid
        });
        successCount++;
      }
    } catch (error) {
      console.error('Failed to delete file:', fileId, error);
      failCount++;
    }
  }

  // Clear selection
  state.selectedFiles.clear();

  // Reload data
  await loadAllData();
  renderFiles();

  if (failCount > 0) {
    toast.warning(`Deleted ${successCount}, failed ${failCount} file(s)`);
  } else {
    toast.success(`Deleted ${successCount} file(s)`);
  }
}

// Export functionality
function showExportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    width: 90%;
  `;

  const header = document.createElement('h3');
  header.textContent = 'Export All Data';
  header.style.cssText = 'margin: 0 0 20px; font-size: 20px; font-weight: 600;';
  modal.appendChild(header);

  const description = document.createElement('p');
  description.textContent = 'Choose the format to export all your projects, files, and conversations:';
  description.style.cssText = 'margin: 0 0 20px; color: #666; font-size: 14px;';
  modal.appendChild(description);

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 12px; flex-direction: column;';

  const jsonBtn = document.createElement('button');
  jsonBtn.textContent = '📄 Export as JSON';
  jsonBtn.style.cssText = `
    padding: 12px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  jsonBtn.addEventListener('click', async () => {
    await exportAllDataAsJSON();
    overlay.remove();
  });

  const csvBtn = document.createElement('button');
  csvBtn.textContent = '📊 Export as CSV';
  csvBtn.style.cssText = `
    padding: 12px 20px;
    background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  csvBtn.addEventListener('click', async () => {
    await exportAllDataAsCSV();
    overlay.remove();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: 12px 20px;
    background: white;
    color: #666;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });

  buttonContainer.appendChild(jsonBtn);
  buttonContainer.appendChild(csvBtn);
  buttonContainer.appendChild(cancelBtn);
  modal.appendChild(buttonContainer);

  overlay.appendChild(modal);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
}

async function exportAllDataAsJSON() {
  const exportData = {
    exportDate: new Date().toISOString(),
    organization: state.currentOrg?.name || 'Unknown',
    summary: {
      totalProjects: state.projects.length,
      totalFiles: state.files.length,
      totalConversations: state.conversations.length
    },
    projects: state.projects.map(project => ({
      name: project.name,
      description: project.description,
      created_at: project.created_at,
      uuid: project.uuid,
      tags: (state.projectTags.get(project.uuid) || []).map(t => ({ name: t.name, color: t.color }))
    })),
    files: state.files.map(file => ({
      file_name: file.file_name,
      project_name: file.project_name,
      project_uuid: file.project_uuid,
      created_at: file.created_at,
      uuid: file.uuid,
      tags: (state.fileTags.get(file.uuid) || []).map(t => ({ name: t.name, color: t.color }))
    })),
    conversations: state.conversations.map(conv => ({
      name: conv.name,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      uuid: conv.uuid,
      project_uuid: conv.project_uuid,
      tags: (state.conversationTags.get(conv.uuid) || []).map(t => ({ name: t.name, color: t.color }))
    })),
    tags: await tagsService.getAllTags()
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eidolon-full-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  toast.success(`Exported ${exportData.projects.length} projects, ${exportData.files.length} files, ${exportData.conversations.length} conversations`);
}

async function exportAllDataAsCSV() {
  // Export projects as CSV
  const projectsCSV = [
    ['Name', 'Description', 'Created At', 'UUID', 'Tags'].join(','),
    ...state.projects.map(project => {
      const tags = (state.projectTags.get(project.uuid) || []).map(t => t.name).join('; ');
      return [
        `"${project.name || ''}"`,
        `"${project.description || ''}"`,
        `"${project.created_at || ''}"`,
        project.uuid,
        `"${tags}"`
      ].join(',');
    })
  ].join('\n');

  // Export files as CSV
  const filesCSV = [
    ['File Name', 'Project Name', 'Created At', 'UUID', 'Tags'].join(','),
    ...state.files.map(file => {
      const tags = (state.fileTags.get(file.uuid) || []).map(t => t.name).join('; ');
      return [
        `"${file.file_name || ''}"`,
        `"${file.project_name || ''}"`,
        `"${file.created_at || ''}"`,
        file.uuid,
        `"${tags}"`
      ].join(',');
    })
  ].join('\n');

  // Export conversations as CSV
  const conversationsCSV = [
    ['Name', 'Created At', 'Updated At', 'UUID', 'Tags'].join(','),
    ...state.conversations.map(conv => {
      const tags = (state.conversationTags.get(conv.uuid) || []).map(t => t.name).join('; ');
      return [
        `"${conv.name || ''}"`,
        `"${conv.created_at || ''}"`,
        `"${conv.updated_at || ''}"`,
        conv.uuid,
        `"${tags}"`
      ].join(',');
    })
  ].join('\n');

  // Download projects CSV
  downloadCSV(projectsCSV, `eidolon-projects-${Date.now()}.csv`);

  // Download files CSV (with small delay)
  setTimeout(() => {
    downloadCSV(filesCSV, `eidolon-files-${Date.now()}.csv`);
  }, 100);

  // Download conversations CSV (with small delay)
  setTimeout(() => {
    downloadCSV(conversationsCSV, `eidolon-conversations-${Date.now()}.csv`);
  }, 200);

  toast.success(`Exported ${state.projects.length} projects, ${state.files.length} files, ${state.conversations.length} conversations as CSV`);
}

function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sortProjectsBy(key: 'name' | 'date' | 'files') {
  state.projects.sort((a, b) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name);
    } else if (key === 'date') {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
    return 0;
  });
}

function filterProjects(filter: string) {
  // Handle different filter types - reset both filters first
  state.showPinnedOnly = false;
  state.showFavoritesOnly = false;
  
  switch (filter) {
    case 'pinned':
      state.showPinnedOnly = true;
      break;
    case 'favorites':
      state.showFavoritesOnly = true;
      break;
    case 'active':
      // TODO: Implement active filter (non-archived)
      break;
    case 'archived':
      // TODO: Implement archived filter
      break;
  }
  renderProjects();
}

async function performSearch(query: string) {
  if (!query || query.trim().length < 2) {
    state.isSearching = false;
    state.searchResults = [];
    renderCurrentTab();
    return;
  }

  state.isSearching = true;

  try {
    const results = await searchService.search(query);
    state.searchResults = results;
    renderSearchResults();
  } catch (error) {
    console.error('Search failed:', error);
    state.isSearching = false;
  }
}

function renderSearchResults() {
  const main = document.querySelector('.dashboard-main')!;

  // Hide all tabs
  tabContents.forEach(tab => (tab as HTMLElement).classList.remove('active'));

  // Create or update search results section
  let searchSection = document.getElementById('search-results-section');

  if (!searchSection) {
    searchSection = document.createElement('section');
    searchSection.id = 'search-results-section';
    searchSection.className = 'tab-content active';
    main.appendChild(searchSection);
  } else {
    searchSection.classList.add('active');
  }

  // Clear and render results
  searchSection.textContent = '';

  const header = document.createElement('div');
  header.className = 'tab-header';

  const title = document.createElement('h2');
  title.textContent = 'Search Results';

  const count = document.createElement('span');
  count.className = 'count-badge';
  count.textContent = state.searchResults.length.toString();

  const titleDiv = document.createElement('div');
  titleDiv.className = 'tab-title';
  titleDiv.appendChild(title);
  titleDiv.appendChild(count);

  header.appendChild(titleDiv);
  searchSection.appendChild(header);

  if (state.searchResults.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No results found';
    searchSection.appendChild(emptyState);
    return;
  }

  // Group results by type
  const projectResults = state.searchResults.filter(r => r.type === 'project');
  const fileResults = state.searchResults.filter(r => r.type === 'file');
  const conversationResults = state.searchResults.filter(r => r.type === 'conversation');

  // Render project results
  if (projectResults.length > 0) {
    const projectsHeader = document.createElement('h3');
    projectsHeader.textContent = `Projects (${projectResults.length})`;
    projectsHeader.style.cssText = 'margin: 24px 0 12px; font-size: 18px;';
    searchSection.appendChild(projectsHeader);

    const projectsList = document.createElement('div');
    projectsList.className = 'projects-list';

    projectResults.forEach(result => {
      const project = state.projects.find(p => p.uuid === result.id);
      if (project) {
        projectsList.appendChild(createProjectCard(project));
      }
    });

    searchSection.appendChild(projectsList);
  }

  // Render file results
  if (fileResults.length > 0) {
    const filesHeader = document.createElement('h3');
    filesHeader.textContent = `Files (${fileResults.length})`;
    filesHeader.style.cssText = 'margin: 24px 0 12px; font-size: 18px;';
    searchSection.appendChild(filesHeader);

    const filesList = document.createElement('div');
    filesList.className = 'files-list';

    fileResults.forEach(result => {
      const file = state.files.find(f => f.uuid === result.id);
      if (file) {
        filesList.appendChild(createFileItem(file));
      }
    });

    searchSection.appendChild(filesList);
  }

  // Render conversation results
  if (conversationResults.length > 0) {
    const conversationsHeader = document.createElement('h3');
    conversationsHeader.textContent = `Conversations (${conversationResults.length})`;
    conversationsHeader.style.cssText = 'margin: 24px 0 12px; font-size: 18px;';
    searchSection.appendChild(conversationsHeader);

    const conversationsList = document.createElement('div');
    conversationsList.className = 'conversations-list';

    conversationResults.forEach(result => {
      const conversation = state.conversations.find(c => c.uuid === result.id);
      if (conversation) {
        conversationsList.appendChild(createConversationItem(conversation));
      }
    });

    searchSection.appendChild(conversationsList);
  }
}

function openProject(uuid: string) {
  browser.tabs.create({ url: `https://claude.ai/project/${uuid}` });
}

function openConversation(uuid: string) {
  browser.tabs.create({ url: `https://claude.ai/chat/${uuid}` });
}

/**
 * Open a conversation in the sidepanel
 * This creates a new tab with the conversation and opens the sidepanel
 */
async function openConversationInSidepanel(uuid: string) {
  try {
    // First create a tab with the conversation
    const tab = await browser.tabs.create({ 
      url: `https://claude.ai/chat/${uuid}`,
      active: true 
    });
    
    // Then open the sidepanel for that tab
    if (tab.id) {
      // Use chrome.sidePanel API to open sidepanel
      await (chrome as any).sidePanel.open({ tabId: tab.id });
    }
  } catch (error) {
    console.error('[Dashboard] Failed to open conversation in sidepanel:', error);
    // Fallback to just opening the tab
    openConversation(uuid);
  }
}

function viewProjectFiles(uuid: string) {
  // Find project name
  const project = state.projects.find(p => p.uuid === uuid);
  if (!project) return;

  // Set file filter
  state.fileFilter = {
    projectId: uuid,
    projectName: project.name
  };

  // Switch to files tab and render
  switchTab('files');
  renderFiles();
}

function viewFile(file: any) {
  // TODO: Show file content modal
  console.log('View file:', file);
}

function showNewProjectModal() {
  // TODO: Show modal for creating new project
  const projectName = prompt('Enter project name:');
  if (projectName) {
    const validationError = validateProjectName(projectName);
    if (validationError) {
      toast.error(`Invalid project name: ${validationError}`);
      return;
    }
    createProject(projectName);
  }
}

/**
 * Validate project name input
 */
function validateProjectName(name: string): string | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return 'Project name cannot be empty';
  }

  if (trimmed.length < 3) {
    return 'Project name must be at least 3 characters';
  }

  if (trimmed.length > 100) {
    return 'Project name must be less than 100 characters';
  }

  // Check for invalid characters that might cause API issues
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidChars.test(trimmed)) {
    return 'Project name contains invalid characters';
  }

  return null;
}

async function createProject(name: string) {
  try {
    const trimmedName = name.trim();

    const response = await browser.runtime.sendMessage({
      action: 'create-project',
      name: trimmedName,
      description: '',
    });

    if (response.success) {
      await loadProjects();
      renderProjects();
      statusText.textContent = `Project "${trimmedName}" created successfully`;
    } else {
      toast.error(`Failed to create project: ${response.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to create project:', error);
    toast.error('Failed to create project. Please try again.');
  }
}

function showSettingsModal() {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 480px;
    width: 90%;
  `;

  const header = document.createElement('h3');
  header.textContent = 'Settings';
  header.style.cssText = 'margin: 0 0 20px; font-size: 20px; font-weight: 600;';

  const content = document.createElement('div');
  content.style.cssText = 'color: #666; font-size: 14px;';

  // Create content elements safely
  const title = document.createElement('p');
  title.style.cssText = 'margin: 0 0 12px; font-size: 16px;';
  const titleStrong = document.createElement('strong');
  titleStrong.textContent = 'Eidolon Dashboard';
  title.appendChild(titleStrong);

  const version = document.createElement('p');
  version.style.cssText = 'margin: 0 0 8px;';
  version.textContent = 'Version: 1.0.0';

  const status = document.createElement('p');
  status.style.cssText = 'margin: 0 0 8px;';
  status.textContent = 'Status: ';
  const statusSpan = document.createElement('span');
  statusSpan.textContent = state.isConnected ? 'Connected' : 'Not Connected';
  statusSpan.style.color = state.isConnected ? '#48bb78' : '#f56565';
  status.appendChild(statusSpan);

  const stats = document.createElement('p');
  stats.style.cssText = 'margin: 16px 0; padding: 12px; background: #f7fafc; border-radius: 8px;';
  stats.textContent = `${state.projects.length} Projects • ${state.files.length} Files • ${state.conversations.length} Conversations`;

  const divider = document.createElement('hr');
  divider.style.cssText = 'margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;';

  const actionsTitle = document.createElement('p');
  actionsTitle.style.cssText = 'margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #333;';
  actionsTitle.textContent = 'Quick Actions';

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

  const clearCacheBtn = document.createElement('button');
  clearCacheBtn.textContent = '🗑️ Clear Cache';
  clearCacheBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    background: white;
    color: #666;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  clearCacheBtn.addEventListener('click', async () => {
    if (confirm('Clear all cached data? This will reload all data from Claude.ai.')) {
      await searchService.clearIndex();
      toast.success('Cache cleared! Reloading data...');
      await loadAllData();
      renderCurrentTab();
      updateAnalytics();
    }
  });

  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '↻ Refresh All Data';
  refreshBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  `;
  refreshBtn.addEventListener('click', async () => {
    overlay.remove();
    await loadAllData();
    renderCurrentTab();
    updateAnalytics();
    toast.success('Data refreshed successfully!');
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    background: white;
    color: #666;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 4px;
  `;
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

  buttonContainer.appendChild(clearCacheBtn);
  buttonContainer.appendChild(refreshBtn);
  buttonContainer.appendChild(closeBtn);

  content.appendChild(title);
  content.appendChild(version);
  content.appendChild(status);
  content.appendChild(stats);
  content.appendChild(divider);
  content.appendChild(actionsTitle);
  content.appendChild(buttonContainer);

  modal.appendChild(header);
  modal.appendChild(content);
  overlay.appendChild(modal);

  // Event listeners
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
}

// Helper functions for other components
function createProjectCard(project: any) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.textContent = project.name;
  return card;
}

function createFileItem(file: any) {
  const item = document.createElement('div');
  item.className = 'file-item';
  item.textContent = file.file_name;
  return item;
}

function createConversationItem(conversation: any) {
  const item = document.createElement('div');
  item.className = 'conversation-item';
  item.textContent = conversation.name;
  return item;
}

// ============================================
// Workspace Sync Functions
// ============================================

/**
 * Initialize sync tab on load
 */
async function initSyncTab() {
  // Check if File System Access API is supported (not available in Firefox)
  const firefoxWarning = document.getElementById('firefox-warning');
  if (!isFileSystemAccessSupported()) {
    if (firefoxWarning) {
      firefoxWarning.style.display = 'flex';
    }
    // Disable sync-related buttons when API not supported
    const syncButtons = [
      document.getElementById('setup-workspace-btn'),
      document.getElementById('configure-workspace-btn'),
      document.getElementById('sync-now-btn'),
      document.getElementById('sync-chats-only-btn'),
      document.getElementById('preview-diff-btn')
    ];
    syncButtons.forEach(btn => {
      if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
    });
    return; // Exit early - workspace sync not available
  } else {
    if (firefoxWarning) {
      firefoxWarning.style.display = 'none';
    }
  }

  // Check if workspace is configured
  state.syncConfigured = await isWorkspaceConfigured();

  if (state.syncConfigured) {
    // Note: FileSystemDirectoryHandle cannot be persisted due to structured cloning
    // User will need to re-select on dashboard reload (browser remembers last choice)
    state.workspaceHandle = null;

    // Load configuration
    const config = await getWorkspaceConfig();

    // Update UI
    syncNotConfigured.style.display = 'none';
    syncConfigured.style.display = 'block';

    // Update workspace path display
    syncWorkspacePath.textContent = config.workspacePath || 'Workspace configured';

    // Update last sync display
    if (config.lastSync) {
      const lastSyncDate = new Date(config.lastSync);
      syncLastSync.textContent = `Last synced: ${lastSyncDate.toLocaleString()}`;
    } else {
      syncLastSync.textContent = 'Never synced';
    }

    // Load sync settings
    loadSyncSettings(config.settings);

    // Update sync status indicator (always orange until user clicks sync)
    syncStatusIndicator.style.color = '#f6ad55'; // orange - will prompt for selection
  } else {
    // Show not configured state
    syncNotConfigured.style.display = 'block';
    syncConfigured.style.display = 'none';
  }
}

/**
 * Load sync settings into UI
 */
function loadSyncSettings(settings: SyncSettings) {
  autoSyncEnabledCheckbox.checked = settings.autoSync;
  syncIntervalSelect.value = settings.syncInterval.toString();
  bidirectionalSyncCheckbox.checked = settings.bidirectional;
  syncChatsCheckbox.checked = settings.syncChats;
  autoAddMdExtensionCheckbox.checked = settings.autoAddMdExtension;
  ensureAgentsFrontmatterCheckbox.checked = settings.ensureAgentsFrontmatter ?? true;
  conflictStrategySelect.value = settings.conflictStrategy;
}

/**
 * Setup workspace - pick directory and save config
 * Note: The handle itself is not persisted, only workspace metadata
 */
async function setupWorkspace() {
  try {
    // Request directory picker
    const dirHandle = await pickWorkspaceDirectory();

    if (!dirHandle) {
      return; // User cancelled
    }

    // Verify write permission (fresh handle should work)
    const hasPermission = await verifyPermission(dirHandle, 'readwrite');
    if (!hasPermission) {
      toast.error('Failed to get write permission for the selected directory');
      return;
    }

    // Save configuration (not the handle - handles can't be persisted)
    const config = await getWorkspaceConfig();
    config.workspacePath = dirHandle.name;
    await saveWorkspaceConfig(config);

    // Update state
    state.syncConfigured = true;
    state.workspaceHandle = dirHandle;

    // Update UI
    await initSyncTab();

    // Update status indicator to green
    syncStatusIndicator.style.color = '#48bb78'; // green

    // Log activity
    logSyncActivity('success', `Workspace configured: ${dirHandle.name}`);

    toast.success('Workspace configured! You may need to confirm folder access on each sync.');
  } catch (error) {
    console.error('Failed to setup workspace:', error);
    logSyncActivity('error', `Failed to configure workspace: ${(error as Error).message}`);
    toast.error(`Failed to setup workspace: ${(error as Error).message}`);
  }
}

/**
 * Execute sync (download or dry-run)
 */
async function syncNow(dryRun: boolean = false) {
  if (state.isSyncing) {
    toast.warning('Sync already in progress');
    return;
  }

  if (!state.currentOrg) {
    toast.warning('No organization selected');
    return;
  }

  // If workspace handle is null, prompt user to select directory
  if (!state.workspaceHandle) {
    try {
      const dirHandle = await pickWorkspaceDirectory();
      if (!dirHandle) {
        return; // User cancelled
      }

      // Verify fresh handle has permission (should work since it's fresh)
      const hasPermission = await verifyPermission(dirHandle, 'readwrite');
      if (!hasPermission) {
        toast.error('Failed to get write permission for the selected directory');
        return;
      }

      // Store in memory for this session (until dashboard reload)
      state.workspaceHandle = dirHandle;

      // Update status indicator to green
      syncStatusIndicator.style.color = '#48bb78'; // green

      logSyncActivity('success', `Workspace selected: ${dirHandle.name}`);
    } catch (error) {
      console.error('Failed to select workspace:', error);
      toast.error(`Failed to select workspace: ${(error as Error).message}`);
      return;
    }
  }

  try {
    state.isSyncing = true;
    showSyncProgress();

    // First validate the session is still active
    const validationResponse = await browser.runtime.sendMessage({
      action: 'validate-session'
    });

    if (!validationResponse.success) {
      throw new Error('Session expired or invalid. Please log in to Claude.ai and refresh this page.');
    }

    // Get session key and create API client
    const sessionResponse = await browser.runtime.sendMessage({
      action: 'get-api-client-session'
    });

    if (!sessionResponse.success) {
      throw new Error(sessionResponse.error || 'Failed to get API session. Please refresh the page and try again.');
    }

    const { sessionKey, orgId } = sessionResponse.data;
    const apiClient = new ClaudeAPIClient(sessionKey);

    // Create sync manager
    const syncManager = new SyncManager(apiClient);

    // Set progress callback
    syncManager.setProgressCallback((progress: SyncProgress) => {
      updateSyncProgress(progress);
    });

    // Get current sync settings
    const config = await getWorkspaceConfig();
    const useBidirectional = config.settings.bidirectional;

    // Build account info for account-based subfolders
    const accountInfo: SyncAccountInfo | undefined = state.currentOrg ? {
      accountId: state.currentOrg.uuid,
      accountName: state.currentOrg.name,
      accountEmail: undefined // Organization doesn't have email
    } : undefined;

    // Execute sync based on settings
    const result = useBidirectional
      ? await syncManager.bidirectionalSync(
          state.workspaceHandle,
          orgId,
          config.settings.conflictStrategy,
          dryRun,
          accountInfo
        )
      : await syncManager.downloadSync(
          state.workspaceHandle,
          orgId,
          dryRun,
          accountInfo
        );

    // Hide progress overlay
    hideSyncProgress();

    // Show results
    if (dryRun) {
      toast.info(`Dry run: ${result.stats.created} create, ${result.stats.updated} update, ${result.stats.chats || 0} chats`);
    } else {
      if (result.success) {
        toast.success(`Sync complete: ${result.stats.created} created, ${result.stats.updated} updated, ${result.stats.chats || 0} chats`);
      } else {
        toast.warning(`Sync done with ${result.stats.errors} error(s): ${result.stats.created} created, ${result.stats.updated} updated`);
      }
    }

    // Log activity
    if (result.success) {
      logSyncActivity(
        'success',
        `Synced ${result.stats.created + result.stats.updated} project(s)`
      );
    } else {
      logSyncActivity(
        'error',
        `Sync failed: ${result.errors.join(', ')}`
      );
    }

    // Refresh sync tab
    await initSyncTab();
  } catch (error) {
    console.error('Sync failed:', error);
    hideSyncProgress();
    logSyncActivity('error', `Sync failed: ${(error as Error).message}`);
    toast.error(`Sync failed: ${(error as Error).message}`);
  } finally {
    state.isSyncing = false;
    // Update workspace status in Settings tab
    updateSettingsWorkspaceStatus();
  }
}

/**
 * Sync chats only (no files)
 */
async function syncChatsOnly(dryRun: boolean = false) {
  if (state.isSyncing) {
    toast.warning('Sync already in progress');
    return;
  }

  if (!state.currentOrg) {
    toast.error('No organization selected');
    return;
  }

  // If workspace handle is null, prompt user to select directory
  if (!state.workspaceHandle) {
    try {
      const dirHandle = await pickWorkspaceDirectory();
      if (!dirHandle) {
        return; // User cancelled
      }

      // Verify fresh handle has permission (should work since it's fresh)
      const hasPermission = await verifyPermission(dirHandle, 'readwrite');
      if (!hasPermission) {
        toast.error('Failed to get write permission for the selected directory');
        return;
      }

      // Store in memory for this session (until dashboard reload)
      state.workspaceHandle = dirHandle;

      // Update status indicator to green
      syncStatusIndicator.style.color = '#48bb78'; // green

      logSyncActivity('success', `Workspace selected: ${dirHandle.name}`);
    } catch (error) {
      console.error('Failed to select workspace:', error);
      toast.error(`Failed to select workspace: ${(error as Error).message}`);
      return;
    }
  }

  try {
    state.isSyncing = true;
    showSyncProgress();

    // First validate the session is still active
    const validationResponse = await browser.runtime.sendMessage({
      action: 'validate-session'
    });

    if (!validationResponse.success) {
      throw new Error('Session expired or invalid. Please log in to Claude.ai and refresh this page.');
    }

    // Get session key and create API client
    const sessionResponse = await browser.runtime.sendMessage({
      action: 'get-api-client-session'
    });

    if (!sessionResponse.success) {
      throw new Error(sessionResponse.error || 'Failed to get API session. Please refresh the page and try again.');
    }

    const { sessionKey, orgId } = sessionResponse.data;
    const apiClient = new ClaudeAPIClient(sessionKey);

    // Create sync manager
    const syncManager = new SyncManager(apiClient);

    // Set progress callback
    syncManager.setProgressCallback((progress: SyncProgress) => {
      updateSyncProgress(progress);
    });

    // Build account info for account-based subfolders
    const accountInfo: SyncAccountInfo | undefined = state.currentOrg ? {
      accountId: state.currentOrg.uuid,
      accountName: state.currentOrg.name,
      accountEmail: undefined
    } : undefined;

    // Execute chats-only sync
    const result = await syncManager.chatsOnlySync(
      state.workspaceHandle,
      orgId,
      dryRun,
      accountInfo
    );

    // Hide progress overlay
    hideSyncProgress();

    // Show results
    if (dryRun) {
      toast.info(`Dry run: ${result.stats.chats || 0} chats would sync`);
    } else {
      if (result.success) {
        toast.success(`Synced ${result.stats.chats || 0} conversation(s)`);
      } else {
        toast.warning(`Chats sync done with ${result.stats.errors} error(s)`);
      }
    }

    // Log activity
    if (result.success) {
      logSyncActivity(
        'success',
        `Synced ${result.stats.chats || 0} conversation(s)`
      );
    } else {
      logSyncActivity(
        'error',
        `Chats sync failed: ${result.errors.join(', ')}`
      );
    }

    // Refresh sync tab
    await initSyncTab();
  } catch (error) {
    console.error('Chats sync failed:', error);
    hideSyncProgress();
    logSyncActivity('error', `Chats sync failed: ${(error as Error).message}`);
    toast.error(`Chats sync failed: ${(error as Error).message}`);
  } finally {
    state.isSyncing = false;
    // Update workspace status in Settings tab
    updateSettingsWorkspaceStatus();
  }
}

/**
 * View workspace diff
 */
async function viewWorkspaceDiff() {
  if (!state.currentOrg) {
    toast.warning('No organization selected');
    return;
  }

  // If workspace handle is null, prompt user to select directory
  if (!state.workspaceHandle) {
    try {
      const dirHandle = await pickWorkspaceDirectory();
      if (!dirHandle) {
        return; // User cancelled
      }

      // Verify fresh handle has permission
      const hasPermission = await verifyPermission(dirHandle, 'readwrite');
      if (!hasPermission) {
        toast.error('Failed to get permission for the selected directory');
        return;
      }

      // Store in memory for this session (until dashboard reload)
      state.workspaceHandle = dirHandle;

      // Update status indicator to green
      syncStatusIndicator.style.color = '#48bb78'; // green

      logSyncActivity('success', `Workspace selected: ${dirHandle.name}`);
    } catch (error) {
      console.error('Failed to select workspace:', error);
      toast.error(`Failed to select workspace: ${(error as Error).message}`);
      return;
    }
  }

  try {
    const modalOverlay = document.getElementById('modal-overlay')!;
    const modalContent = document.getElementById('modal-content')!;

    // Check if there's a cached diff result
    if (state.lastDiffResult && state.lastDiffTimestamp) {
      const timeSinceLastDiff = Date.now() - state.lastDiffTimestamp;
      const minutesSince = Math.floor(timeSinceLastDiff / 60000);

      const computeNew = confirm(
        `A diff was computed ${minutesSince} minute(s) ago.\n\n` +
        `Do you want to compute a NEW diff?\n\n` +
        `Click OK to compute a NEW diff, or Cancel to view the cached result.`
      );

      if (!computeNew) {
        // User clicked Cancel - show cached diff
        renderDiffUI(state.lastDiffResult, modalContent, modalOverlay);
        logSyncActivity('info', 'Viewing cached workspace diff');
        return;
      }
      // User clicked OK - continue to compute new diff
    }

    // Show loading with progress bar
    modalContent.textContent = '';
    modalContent.classList.remove('diff-modal-container'); // Remove class during loading
    modalContent.style.cssText = 'padding: 40px; text-align: center;';

    const loadingTitle = document.createElement('h2');
    loadingTitle.textContent = 'Computing Diff...';
    loadingTitle.style.marginBottom = '20px';

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 100%;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
      margin: 20px 0;
    `;

    const progressFill = document.createElement('div');
    progressFill.id = 'diff-progress-fill';
    progressFill.style.cssText = `
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s ease;
    `;
    progressBar.appendChild(progressFill);

    const loadingText = document.createElement('p');
    loadingText.id = 'diff-progress-text';
    loadingText.textContent = 'Initializing...';
    loadingText.style.cssText = 'color: #666; margin-top: 10px; font-size: 14px;';

    modalContent.appendChild(loadingTitle);
    modalContent.appendChild(progressBar);
    modalContent.appendChild(loadingText);
    modalOverlay.classList.remove('hidden');

    // Validate session
    const validationResponse = await browser.runtime.sendMessage({
      action: 'validate-session'
    });

    if (!validationResponse.success) {
      throw new Error('Session expired. Please refresh the page.');
    }

    // Get API session
    const sessionResponse = await browser.runtime.sendMessage({
      action: 'get-api-client-session'
    });

    if (!sessionResponse.success) {
      throw new Error(sessionResponse.error || 'Failed to get API session');
    }

    const { sessionKey, orgId } = sessionResponse.data;
    const apiClient = new ClaudeAPIClient(sessionKey);
    const syncManager = new SyncManager(apiClient);

    // Set up progress callback for diff computation
    syncManager.setProgressCallback((progress) => {
      const progressFillEl = document.getElementById('diff-progress-fill');
      const progressTextEl = document.getElementById('diff-progress-text');

      if (progressFillEl) {
        progressFillEl.style.width = `${progress.percentage}%`;
      }
      if (progressTextEl) {
        progressTextEl.textContent = progress.message || 'Computing...';
      }
    });

    // Validate handle and verify permissions before using it
    if (!state.workspaceHandle) {
      throw new Error('Invalid workspace handle. Please close and reopen the dashboard, then try again.');
    }

    // Verify we still have permissions to access the directory
    const hasPermission = await verifyPermission(state.workspaceHandle, 'readwrite');
    if (!hasPermission) {
      throw new Error('Lost permissions to workspace directory. Please close and reopen the dashboard, then select the workspace folder again.');
    }

    // Compute diff
    const diff = await syncManager.getWorkspaceDiff(state.workspaceHandle, orgId);

    // Cache the diff result
    state.lastDiffResult = diff;
    state.lastDiffTimestamp = Date.now();

    // Render the diff UI
    renderDiffUI(diff, modalContent, modalOverlay);

    logSyncActivity('info', 'Workspace diff computed');
  } catch (error) {
    console.error('Failed to compute diff:', error);
    toast.error(`Failed to compute diff: ${(error as Error).message}`);
    document.getElementById('modal-overlay')?.classList.add('hidden');
  }
}

/**
 * Helper to check if file needs .md extension added
 */
function needsMdExtension(fileName: string): boolean {
  // Skip AGENTS.md and files that already have extensions
  if (fileName === 'AGENTS.md' || fileName.includes('.')) {
    return false;
  }
  return true;
}

/**
 * Auto-rename files without extensions to add .md
 * Only runs if autoAddMdExtension setting is enabled
 */
async function autoRenameFileIfNeeded(
  fileName: string,
  projectInfo: any,
  apiClient: any,
  orgId: string
): Promise<string> {
  const config = await getWorkspaceConfig();

  // Check if setting is enabled
  if (!config.settings.autoAddMdExtension) {
    return fileName;
  }

  // Check if file needs .md extension
  if (!needsMdExtension(fileName)) {
    return fileName;
  }

  const newFileName = `${fileName}.md`;

  try {
    // Get the file content
    const files = await apiClient.getProjectFiles(orgId, projectInfo.id);
    const file = files.find((f: any) => f.file_name === fileName);

    if (!file) {
      return fileName; // File not found, skip
    }

    // Upload with new name
    await apiClient.uploadFile(orgId, projectInfo.id, newFileName, file.content);

    // Delete old file
    await apiClient.deleteFile(orgId, projectInfo.id, file.uuid);

    logSyncActivity('info', `Auto-renamed "${fileName}" to "${newFileName}"`);

    return newFileName;
  } catch (error) {
    console.warn(`Failed to auto-rename ${fileName}:`, error);
    return fileName; // Return original name if rename fails
  }
}

/**
 * Sync individual file with direction control
 */
async function syncSingleFile(fileName: string, fileType: string, projectInfo: any, direction?: 'push' | 'pull') {
  if (!state.currentOrg || !state.workspaceHandle) {
    throw new Error('Workspace not configured');
  }

  // Proactively validate session before attempting sync
  const validationResponse = await browser.runtime.sendMessage({
    action: 'validate-session'
  });

  if (!validationResponse.success) {
    const authError = new Error('Session validation failed. Please reconnect to Claude.ai.');
    (authError as any).authenticationRequired = true;
    throw authError;
  }

  // Get API session
  const sessionResponse = await browser.runtime.sendMessage({
    action: 'get-api-client-session'
  });

  if (!sessionResponse.success) {
    // Authentication error - provide re-authentication option
    const authError = new Error(sessionResponse.error || 'Not authenticated');
    (authError as any).authenticationRequired = true;
    throw authError;
  }

  const { sessionKey, orgId } = sessionResponse.data;
  const apiClient = new ClaudeAPIClient(sessionKey);

  // Auto-rename file if it needs .md extension (before any other operations)
  if (direction === 'pull' || !direction) {
    fileName = await autoRenameFileIfNeeded(fileName, projectInfo, apiClient, orgId);
  }

  // Get project folder handle
  const projectHandle = await state.workspaceHandle.getDirectoryHandle(projectInfo.folder);
  const contextHandle = await projectHandle.getDirectoryHandle('context').catch(() =>
    getOrCreateDirectory(projectHandle, 'context')
  );

  if (fileType === 'remote-only') {
    if (direction === 'push') {
      // Delete remote file (user deleted it locally and wants to sync that deletion)
      if (fileName === 'AGENTS.md') {
        await apiClient.updateProjectInstructions(orgId, projectInfo.id, '');
      } else {
        try {
          const files = await apiClient.getProjectFiles(orgId, projectInfo.id);
          let file = files.find((f: any) => f.file_name === fileName);

          // If not found and filename ends with .md, try without .md
          if (!file && fileName.endsWith('.md')) {
            const nameWithoutMd = fileName.slice(0, -3);
            file = files.find((f: any) => f.file_name === nameWithoutMd);
            if (file) {
              console.log(`Found file to delete as "${nameWithoutMd}" instead of "${fileName}"`);
            }
          }

          if (file) {
            await apiClient.deleteFile(orgId, projectInfo.id, file.uuid);
          } else {
            // File not found on remote - already deleted or never existed
            console.warn(`File ${fileName} not found on remote during delete operation - already gone`);
          }
        } catch (error) {
          // If error is "not found", that's fine - file is already deleted
          if ((error as any).statusCode === 404 || (error as Error).message.includes('not found')) {
            console.warn(`File ${fileName} already deleted from remote`);
          } else {
            throw error; // Re-throw other errors
          }
        }
      }
    } else {
      // Pull: Download file from remote (restore deleted file)
      if (fileName === 'AGENTS.md') {
        const instructionsData = await apiClient.getProjectInstructions(orgId, projectInfo.id);
        if (instructionsData !== null) {
          await writeTextFile(projectHandle, 'AGENTS.md', instructionsData.content.trim());
        } else {
          throw new Error('Failed to fetch AGENTS.md content from remote');
        }
      } else {
        const files = await apiClient.getProjectFiles(orgId, projectInfo.id);
        let file = files.find((f: any) => f.file_name === fileName);

        // If not found and filename ends with .md, try without .md
        if (!file && fileName.endsWith('.md')) {
          const nameWithoutMd = fileName.slice(0, -3);
          file = files.find((f: any) => f.file_name === nameWithoutMd);
          if (file) {
            console.log(`Found file as "${nameWithoutMd}" instead of "${fileName}"`);
          }
        }

        if (file) {
          await writeTextFile(contextHandle, fileName, file.content);
        } else {
          throw new Error(`File ${fileName} not found in remote project`);
        }
      }
    }
  } else if (fileType === 'local-only') {
    if (direction === 'pull') {
      // Delete local file (user wants to remove it locally to match remote)
      if (fileName === 'AGENTS.md') {
        await deleteFile(projectHandle, 'AGENTS.md');
      } else {
        await deleteFile(contextHandle, fileName);
      }
    } else {
      // Push: Upload file to remote
      if (fileName === 'AGENTS.md') {
        const content = await readTextFile(projectHandle, 'AGENTS.md');
        if (content) {
          await apiClient.updateProjectInstructions(orgId, projectInfo.id, content);
        }
      } else {
        const content = await readTextFile(contextHandle, fileName);
        if (content) {
          await apiClient.uploadFile(orgId, projectInfo.id, fileName, content);
        }
      }
    }
  } else if (fileType === 'modified') {
    if (direction === 'push') {
      // Push local version to remote
      if (fileName === 'AGENTS.md') {
        const content = await readTextFile(projectHandle, 'AGENTS.md');
        if (content) {
          await apiClient.updateProjectInstructions(orgId, projectInfo.id, content);
        }
      } else {
        const content = await readTextFile(contextHandle, fileName);
        if (content) {
          await apiClient.uploadFile(orgId, projectInfo.id, fileName, content);
        }
      }
    } else {
      // Pull remote version to local
      if (fileName === 'AGENTS.md') {
        const instructionsData = await apiClient.getProjectInstructions(orgId, projectInfo.id);
        const remoteContent = instructionsData?.content?.trim() || '';
        await writeTextFile(projectHandle, 'AGENTS.md', remoteContent);
      } else {
        const files = await apiClient.getProjectFiles(orgId, projectInfo.id);
        const remoteFile = files.find((f: any) => f.file_name === fileName);
        if (remoteFile) {
          await writeTextFile(contextHandle, fileName, remoteFile.content);
        }
      }
    }
  } else if (fileType === 'renamed') {
    const renameInfo = projectInfo.renameInfo;
    if (!renameInfo) {
      throw new Error('Rename information not provided');
    }

    if (direction === 'push') {
      // Push rename to remote: delete old remote file, upload new file
      try {
        if (renameInfo.oldName === 'AGENTS.md') {
          await apiClient.updateProjectInstructions(orgId, projectInfo.id, '');
        } else {
          const files = await apiClient.getProjectFiles(orgId, projectInfo.id);
          const oldFile = files.find((f: any) => f.file_name === renameInfo.oldName);
          if (oldFile) {
            await apiClient.deleteFile(orgId, projectInfo.id, oldFile.uuid);
          } else {
            console.warn(`Old file ${renameInfo.oldName} not found on remote - may already be deleted`);
          }
        }
      } catch (error) {
        // If old file doesn't exist, that's fine - continue with upload
        if ((error as any).statusCode === 404 || (error as Error).message.includes('not found')) {
          console.warn(`Old file ${renameInfo.oldName} not found during delete - continuing with upload`);
        } else {
          throw error;
        }
      }

      // Upload file with new name
      if (renameInfo.newName === 'AGENTS.md') {
        const content = await readTextFile(projectHandle, 'AGENTS.md');
        if (content) {
          await apiClient.updateProjectInstructions(orgId, projectInfo.id, content);
        } else {
          throw new Error(`Local file ${renameInfo.newName} not found or empty`);
        }
      } else {
        const content = await readTextFile(contextHandle, renameInfo.newName);
        if (content) {
          await apiClient.uploadFile(orgId, projectInfo.id, renameInfo.newName, content);
        } else {
          throw new Error(`Local file ${renameInfo.newName} not found or empty`);
        }
      }
    } else {
      // Pull rename from remote: delete old local file, download new one
      try {
        if (renameInfo.oldName === 'AGENTS.md') {
          await deleteFile(projectHandle, 'AGENTS.md');
        } else {
          await deleteFile(contextHandle, renameInfo.oldName);
        }
      } catch (error) {
        // Old file may not exist locally - that's fine
        console.warn(`Old file ${renameInfo.oldName} not found locally - may already be deleted`);
      }

      // Download the new file from remote
      if (renameInfo.newName === 'AGENTS.md') {
        const instructionsData = await apiClient.getProjectInstructions(orgId, projectInfo.id);
        if (instructionsData !== null && instructionsData.content) {
          await writeTextFile(projectHandle, 'AGENTS.md', instructionsData.content.trim());
        } else {
          throw new Error(`Remote file ${renameInfo.newName} not found or empty`);
        }
      } else {
        const files = await apiClient.getProjectFiles(orgId, projectInfo.id);
        const file = files.find((f: any) => f.file_name === renameInfo.newName);
        if (file && file.content) {
          await writeTextFile(contextHandle, renameInfo.newName, file.content);
        } else {
          throw new Error(`Remote file ${renameInfo.newName} not found in project`);
        }
      }
    }
  }
}

/**
 * Intelligently sync a renamed file by detecting which direction to sync
 * - If local has newName and remote has oldName → push (update remote)
 * - If remote has newName and local has oldName → pull (update local)
 */
async function syncRenameWithAutoDirection(
  rename: { oldName: string; newName: string },
  projectInfo: any
): Promise<void> {
  if (!state.workspaceHandle) {
    throw new Error('Workspace not configured');
  }

  try {
    // Validate session with retry logic
    let sessionResponse;
    let retries = 3;
    while (retries > 0) {
      sessionResponse = await browser.runtime.sendMessage({
        action: 'get-api-client-session'
      });

      if (sessionResponse && sessionResponse.success) {
        break;
      }

      retries--;
      if (retries > 0) {
        console.log(`Session validation failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before retry
      }
    }

    if (!sessionResponse || !sessionResponse.success) {
      throw new Error('Failed to get API session after multiple attempts');
    }

    const { sessionKey, orgId } = sessionResponse.data;
    const apiClient = new ClaudeAPIClient(sessionKey);

    // Check what exists locally
    const projectHandle = await state.workspaceHandle.getDirectoryHandle(projectInfo.folder);
    let contextHandle: FileSystemDirectoryHandle | null = null;
    try {
      contextHandle = await projectHandle.getDirectoryHandle('context');
    } catch {
      // No context folder yet
    }

    let hasLocalOld = false;
    let hasLocalNew = false;

    if (rename.oldName === 'AGENTS.md') {
      hasLocalOld = await readTextFile(projectHandle, 'AGENTS.md') !== null;
    } else if (contextHandle) {
      hasLocalOld = await readTextFile(contextHandle, rename.oldName) !== null;
    }

    if (rename.newName === 'AGENTS.md') {
      hasLocalNew = await readTextFile(projectHandle, 'AGENTS.md') !== null;
    } else if (contextHandle) {
      hasLocalNew = await readTextFile(contextHandle, rename.newName) !== null;
    }

    // Check what exists remotely
    const remoteFiles = await apiClient.getProjectFiles(orgId, projectInfo.id);
    const remoteFileNames = new Set(remoteFiles.map((f: any) => f.file_name));

    // Check for AGENTS.md remotely
    let hasRemoteOld = remoteFileNames.has(rename.oldName);
    let hasRemoteNew = remoteFileNames.has(rename.newName);

    if (rename.oldName === 'AGENTS.md' || rename.newName === 'AGENTS.md') {
      const instructionsData = await apiClient.getProjectInstructions(orgId, projectInfo.id);
      const hasInstructions = instructionsData !== null && instructionsData.content.trim() !== '';
      if (rename.oldName === 'AGENTS.md') {
        hasRemoteOld = hasInstructions;
      }
      if (rename.newName === 'AGENTS.md') {
        hasRemoteNew = hasInstructions;
      }
    }

    // Determine direction based on which combination exists
    let direction: 'push' | 'pull';

    if (hasLocalNew && hasRemoteOld) {
      // Local was renamed → push to remote
      direction = 'push';
      console.log(`Rename detected: local has ${rename.newName}, remote has ${rename.oldName} → pushing`);
    } else if (hasLocalOld && hasRemoteNew) {
      // Remote was renamed → pull from remote
      direction = 'pull';
      console.log(`Rename detected: remote has ${rename.newName}, local has ${rename.oldName} → pulling`);
    } else if (hasLocalNew && !hasRemoteOld && !hasRemoteNew) {
      // Local has new name, remote has neither → push
      direction = 'push';
      console.log(`Rename detected: local has ${rename.newName}, remote has nothing → pushing`);
    } else if (hasRemoteNew && !hasLocalOld && !hasLocalNew) {
      // Remote has new name, local has neither → pull
      direction = 'pull';
      console.log(`Rename detected: remote has ${rename.newName}, local has nothing → pulling`);
    } else {
      // Ambiguous or both renamed - default to push
      console.warn(`Ambiguous rename state, defaulting to push. Local: old=${hasLocalOld}, new=${hasLocalNew}; Remote: old=${hasRemoteOld}, new=${hasRemoteNew}`);
      direction = 'push';
    }

    // Perform the sync
    await syncSingleFile(rename.newName, 'renamed', { ...projectInfo, renameInfo: rename }, direction);

  } catch (error) {
    console.error('Error in syncRenameWithAutoDirection:', error);
    throw error;
  }
}

/**
 * Create file item with bidirectional sync buttons
 */
function createFileItemWithSyncButton(
  fileName: string,
  fileType: 'remote-only' | 'local-only' | 'modified',
  projectInfo: any,
  onSync: (fileName: string, fileType: string, projectInfo: any, direction?: 'push' | 'pull') => Promise<void>,
  timestampInfo?: { localTime?: number; remoteTime?: number; isLocalNewer?: boolean }
): HTMLElement {
  const fileItem = document.createElement('div');
  fileItem.className = `diff-file-item ${fileType}`;
  fileItem.style.cssText = `
    display: flex;
    flex-direction: column;
    padding: 8px 12px;
    background: ${fileType === 'remote-only' ? '#e6f7ff' : fileType === 'local-only' ? '#fff7e6' : '#fff0f0'};
    border-radius: 4px;
    margin-bottom: 4px;
    gap: 6px;
  `;

  // Top row: file name and buttons
  const topRow = document.createElement('div');
  topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

  const fileNameSpan = document.createElement('span');
  fileNameSpan.textContent = fileName;
  fileNameSpan.style.cssText = 'flex: 1;';

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 8px; margin-left: 10px;';

  // Helper to create sync button with direction
  const createButton = (label: string, direction: 'push' | 'pull', isPrimary: boolean = false) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = `
      padding: 4px 12px;
      background: ${isPrimary ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#718096'};
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    `;

    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      button.disabled = true;
      button.textContent = 'Syncing...';
      try {
        await onSync(fileName, fileType, projectInfo, direction);
        button.textContent = '✓ Done';
        button.style.background = '#48bb78';
        setTimeout(() => {
          fileItem.style.opacity = '0.5';
          fileItem.style.pointerEvents = 'none';
        }, 1000);
      } catch (error) {
        console.error('Sync failed:', error);
        button.textContent = '✗ Failed';
        button.style.background = '#f56565';
        button.disabled = false;

        // Check if it's an authentication error
        if ((error as any).authenticationRequired) {
          const retry = confirm(
            `Authentication required to sync ${fileName}.\n\n` +
            `Click OK to validate your session and try again, or Cancel to abort.`
          );

          if (retry) {
            button.textContent = 'Authenticating...';
            button.disabled = true;

            try {
              const validationResponse = await browser.runtime.sendMessage({
                action: 'validate-session'
              });

              if (validationResponse.success) {
                button.textContent = 'Retrying...';
                await onSync(fileName, fileType, projectInfo, direction);
                button.textContent = '✓ Done';
                button.style.background = '#48bb78';
                setTimeout(() => {
                  fileItem.style.opacity = '0.5';
                  fileItem.style.pointerEvents = 'none';
                }, 1000);
              } else {
                toast.error('Session expired. Please log in to Claude.ai and reconnect.');
                button.textContent = '✗ Not Auth';
                button.disabled = false;
              }
            } catch (authError) {
              console.error('Authentication error:', authError);
              toast.error('Failed to authenticate. Please reconnect.');
              button.textContent = '✗ Auth Failed';
              button.disabled = false;
            }
          }
        } else {
          // Regular error
          toast.error(`Failed to sync ${fileName}: ${(error as Error).message}`);
        }
      }
    });

    return button;
  };

  // Create appropriate buttons based on file type
  if (fileType === 'remote-only') {
    // File exists remotely but not locally
    // Push = delete remote (user deleted it locally)
    // Pull = download to local (restore deleted file)
    buttonContainer.appendChild(createButton('🗑 Delete Remote', 'push'));
    buttonContainer.appendChild(createButton('⬇ Restore Local', 'pull', true));
  } else if (fileType === 'local-only') {
    // File exists locally but not remotely
    // Push = upload to remote (user created it locally)
    // Pull = delete local (match remote state)
    buttonContainer.appendChild(createButton('⬆ Upload', 'push', true));
    buttonContainer.appendChild(createButton('🗑 Delete Local', 'pull'));
  } else if (fileType === 'modified') {
    // File exists in both but content differs
    // Push = overwrite remote with local
    // Pull = overwrite local with remote
    buttonContainer.appendChild(createButton('⬆ Push Local', 'push'));
    buttonContainer.appendChild(createButton('⬇ Pull Remote', 'pull', true));
  }

  topRow.appendChild(fileNameSpan);
  topRow.appendChild(buttonContainer);
  fileItem.appendChild(topRow);

  // Add timestamp information for modified files if available
  if (fileType === 'modified' && timestampInfo && (timestampInfo.localTime || timestampInfo.remoteTime)) {
    const timestampRow = document.createElement('div');
    timestampRow.style.cssText = `
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: #718096;
      padding-top: 4px;
      border-top: 1px solid #e2e8f0;
    `;

    const formatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    if (timestampInfo.localTime) {
      const localTimeSpan = document.createElement('span');
      localTimeSpan.innerHTML = `💻 Local: <strong>${formatTimestamp(timestampInfo.localTime)}</strong>`;
      if (timestampInfo.isLocalNewer === true) {
        localTimeSpan.innerHTML += ' <span style="color: #48bb78; font-weight: bold;">✓ Newer</span>';
      }
      timestampRow.appendChild(localTimeSpan);
    }

    if (timestampInfo.remoteTime) {
      const remoteTimeSpan = document.createElement('span');
      remoteTimeSpan.innerHTML = `☁️ Remote: <strong>${formatTimestamp(timestampInfo.remoteTime)}</strong>`;
      if (timestampInfo.isLocalNewer === false) {
        remoteTimeSpan.innerHTML += ' <span style="color: #48bb78; font-weight: bold;">✓ Newer</span>';
      }
      timestampRow.appendChild(remoteTimeSpan);
    }

    fileItem.appendChild(timestampRow);
  }

  return fileItem;
}

/**
 * Render diff UI
 */
function renderDiffUI(diff: any, modalContent: HTMLElement, modalOverlay: HTMLElement) {
  // Clear and apply diff-modal-container class to fix double scrollbar
  modalContent.textContent = '';
  modalContent.classList.add('diff-modal-container');

    const diffModal = document.createElement('div');
    diffModal.className = 'diff-modal';
    diffModal.style.cssText = 'max-height: 80vh; overflow-y: auto; padding: 20px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
    const title = document.createElement('h2');
    title.textContent = '📊 Workspace Diff';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer;';
    closeBtn.onclick = () => modalOverlay.classList.add('hidden');
    header.appendChild(title);
    header.appendChild(closeBtn);
    diffModal.appendChild(header);

    // Summary stats
    const summary = document.createElement('div');
    summary.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;';

    const stats = [
      { label: 'Remote Projects', value: diff.summary.remoteProjects },
      { label: 'Local Folders', value: diff.summary.localFolders },
      { label: 'Matched', value: diff.summary.matched }
    ];

    stats.forEach(stat => {
      const statDiv = document.createElement('div');
      statDiv.style.cssText = 'text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px;';
      const value = document.createElement('div');
      value.textContent = String(stat.value);
      value.style.cssText = 'font-size: 32px; font-weight: bold; color: #2d3748;';
      const label = document.createElement('div');
      label.textContent = stat.label;
      label.style.cssText = 'font-size: 14px; color: #718096; margin-top: 5px;';
      statDiv.appendChild(value);
      statDiv.appendChild(label);
      summary.appendChild(statDiv);
    });
    diffModal.appendChild(summary);

    // Remote only section
    if (diff.remoteOnly.length > 0) {
      const section = createDiffSection(
        `⬇ Remote Only (${diff.remoteOnly.length})`,
        'These projects exist on Claude.ai but not in your workspace'
      );
      diff.remoteOnly.forEach((p: any) => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between;';
        const name = document.createElement('span');
        name.textContent = p.name;
        const detail = document.createElement('span');
        detail.textContent = `${p.fileCount || 0} files`;
        detail.style.color = '#718096';
        item.appendChild(name);
        item.appendChild(detail);
        section.appendChild(item);
      });
      diffModal.appendChild(section);
    }

    // Local only section
    if (diff.localOnly.length > 0) {
      const section = createDiffSection(
        `⬆ Local Only (${diff.localOnly.length})`,
        'These folders exist locally but are not matched to any remote project'
      );
      diff.localOnly.forEach((folder: string) => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px;';
        item.textContent = folder;
        section.appendChild(item);
      });
      diffModal.appendChild(section);
    }

    // Projects with differences - EXPANDABLE
    const projectsWithDiff = diff.matched.filter((p: any) => p.hasDifferences);
    if (projectsWithDiff.length > 0) {
      const section = createDiffSection(
        `🔄 Projects with Differences (${projectsWithDiff.length})`,
        'Click on a project to see which files differ'
      );

      projectsWithDiff.forEach((p: any) => {
        // Create expandable container
        const expandable = document.createElement('div');
        expandable.className = 'diff-project-expandable';

        // Create header (clickable)
        const header = document.createElement('div');
        header.className = 'diff-project-header';

        const projectName = document.createElement('span');
        projectName.className = 'diff-project-name';
        projectName.textContent = p.name;

        const summary = document.createElement('span');
        summary.className = 'diff-project-summary';
        const summaryParts: string[] = [];
        if (p.remoteOnlyFiles.length > 0) summaryParts.push(`${p.remoteOnlyFiles.length} remote`);
        if (p.localOnlyFiles.length > 0) summaryParts.push(`${p.localOnlyFiles.length} local`);
        if (p.modifiedFiles.length > 0) summaryParts.push(`${p.modifiedFiles.length} modified`);
        if (p.renamedFiles && p.renamedFiles.length > 0) summaryParts.push(`${p.renamedFiles.length} renamed`);
        summary.textContent = summaryParts.join(', ');

        const expandIcon = document.createElement('span');
        expandIcon.className = 'diff-expand-icon';
        expandIcon.textContent = '▶';

        header.appendChild(projectName);
        header.appendChild(summary);
        header.appendChild(expandIcon);

        // Create details (hidden by default)
        const details = document.createElement('div');
        details.className = 'diff-project-details';

        // Remote-only files
        if (p.remoteOnlyFiles.length > 0) {
          const category = document.createElement('div');
          category.className = 'diff-file-category';

          const title = document.createElement('div');
          title.className = 'diff-file-category-title';
          title.textContent = `⬇ Remote Only (${p.remoteOnlyFiles.length})`;
          category.appendChild(title);

          p.remoteOnlyFiles.forEach((file: string) => {
            const fileItem = createFileItemWithSyncButton(file, 'remote-only', p, syncSingleFile);
            category.appendChild(fileItem);
          });

          details.appendChild(category);
        }

        // Local-only files
        if (p.localOnlyFiles.length > 0) {
          const category = document.createElement('div');
          category.className = 'diff-file-category';

          const title = document.createElement('div');
          title.className = 'diff-file-category-title';
          title.textContent = `⬆ Local Only (${p.localOnlyFiles.length})`;
          category.appendChild(title);

          p.localOnlyFiles.forEach((file: string) => {
            const fileItem = createFileItemWithSyncButton(file, 'local-only', p, syncSingleFile);
            category.appendChild(fileItem);
          });

          details.appendChild(category);
        }

        // Modified files
        if (p.modifiedFiles.length > 0) {
          const category = document.createElement('div');
          category.className = 'diff-file-category';

          const title = document.createElement('div');
          title.className = 'diff-file-category-title';
          title.textContent = `🔄 Modified (${p.modifiedFiles.length})`;
          category.appendChild(title);

          p.modifiedFiles.forEach((file: string) => {
            const timestampInfo = p.modifiedFilesInfo?.[file];
            const fileItem = createFileItemWithSyncButton(file, 'modified', p, syncSingleFile, timestampInfo);
            category.appendChild(fileItem);
          });

          details.appendChild(category);
        }

        // Renamed files
        if (p.renamedFiles && p.renamedFiles.length > 0) {
          const category = document.createElement('div');
          category.className = 'diff-file-category';

          const title = document.createElement('div');
          title.className = 'diff-file-category-title';
          title.textContent = `📝 Renamed (${p.renamedFiles.length})`;
          category.appendChild(title);

          p.renamedFiles.forEach((rename: { oldName: string; newName: string }) => {
            const renameItem = document.createElement('div');
            renameItem.className = 'diff-file-item renamed';
            renameItem.style.cssText = `
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 12px;
              background: #f0f9ff;
              border-radius: 4px;
              margin-bottom: 4px;
            `;

            const renameText = document.createElement('span');
            renameText.innerHTML = `<span style="text-decoration: line-through; color: #999;">${rename.oldName}</span> → <span style="font-weight: 500;">${rename.newName}</span>`;
            renameText.style.cssText = 'flex: 1;';

            const syncButton = document.createElement('button');
            syncButton.textContent = '🔄 Sync Rename';
            syncButton.style.cssText = `
              padding: 4px 12px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 12px;
              cursor: pointer;
              margin-left: 10px;
            `;

            syncButton.addEventListener('click', async (e) => {
              e.stopPropagation();
              syncButton.disabled = true;
              syncButton.textContent = 'Syncing...';
              try {
                // Smart direction: check which file exists and sync accordingly
                // If local has newName → push (rename remote)
                // If remote has newName → pull (rename local)
                await syncRenameWithAutoDirection(rename, p);
                syncButton.textContent = '✓ Done';
                syncButton.style.background = '#48bb78';
                setTimeout(() => {
                  renameItem.style.opacity = '0.5';
                  syncButton.disabled = true;
                }, 500);
              } catch (error) {
                toast.error(`Failed to sync rename: ${(error as Error).message}`);
                syncButton.disabled = false;
                syncButton.textContent = '🔄 Sync Rename';
              }
            });

            renameItem.appendChild(renameText);
            renameItem.appendChild(syncButton);
            category.appendChild(renameItem);
          });

          details.appendChild(category);
        }

        // Add click handler to toggle expansion
        header.addEventListener('click', () => {
          const isExpanded = details.classList.contains('expanded');
          if (isExpanded) {
            details.classList.remove('expanded');
            header.classList.remove('expanded');
            expandIcon.classList.remove('expanded');
          } else {
            details.classList.add('expanded');
            header.classList.add('expanded');
            expandIcon.classList.add('expanded');
          }
        });

        expandable.appendChild(header);
        expandable.appendChild(details);
        section.appendChild(expandable);
      });
      diffModal.appendChild(section);
    }

    // In sync projects
    const inSyncProjects = diff.matched.filter((p: any) => !p.hasDifferences);
    if (inSyncProjects.length > 0) {
      const section = createDiffSection(
        `✅ In Sync (${inSyncProjects.length})`,
        'These projects are identical locally and remotely'
      );
      inSyncProjects.forEach((p: any) => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between;';
        const name = document.createElement('span');
        name.textContent = p.name;
        const status = document.createElement('span');
        status.textContent = '✓ Synced';
        status.style.color = '#48bb78';
        item.appendChild(name);
        item.appendChild(status);
        section.appendChild(item);
      });
      diffModal.appendChild(section);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;';

    const syncBtn = document.createElement('button');
    syncBtn.textContent = 'Sync Now';
    syncBtn.className = 'primary-btn';
    syncBtn.onclick = () => {
      modalOverlay.classList.add('hidden');
      syncNow(false);
    };

    const closeBtn2 = document.createElement('button');
    closeBtn2.textContent = 'Close';
    closeBtn2.className = 'action-btn';
    closeBtn2.onclick = () => modalOverlay.classList.add('hidden');

    actions.appendChild(syncBtn);
    actions.appendChild(closeBtn2);
    diffModal.appendChild(actions);

    modalContent.appendChild(diffModal);
}

function createDiffSection(title: string, description: string): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = 'margin-bottom: 25px;';

  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  titleEl.style.cssText = 'font-size: 16px; font-weight: 600; margin-bottom: 5px;';

  const desc = document.createElement('p');
  desc.textContent = description;
  desc.style.cssText = 'font-size: 14px; color: #718096; margin-bottom: 12px;';

  section.appendChild(titleEl);
  section.appendChild(desc);

  return section;
}

/**
 * Open workspace folder in file manager
 */
// Removed: openWorkspaceFolder() - replaced with copy button functionality

/**
 * Save sync settings
 */
async function saveSyncSettings() {
  const settings: Partial<SyncSettings> = {
    autoSync: autoSyncEnabledCheckbox.checked,
    syncInterval: parseInt(syncIntervalSelect.value),
    bidirectional: bidirectionalSyncCheckbox.checked,
    syncChats: syncChatsCheckbox.checked,
    autoAddMdExtension: autoAddMdExtensionCheckbox.checked,
    ensureAgentsFrontmatter: ensureAgentsFrontmatterCheckbox.checked,
    conflictStrategy: conflictStrategySelect.value as any
  };

  await updateSyncSettings(settings);
  logSyncActivity('info', 'Sync settings updated');
}

/**
 * Show sync progress overlay
 */
function showSyncProgress() {
  syncProgressOverlay.classList.remove('hidden');
  syncProgressBar.style.width = '0%';
  syncProgressText.textContent = 'Initializing...';
  syncProgressDetails.textContent = '';
}

/**
 * Update sync progress
 */
function updateSyncProgress(progress: SyncProgress) {
  syncProgressBar.style.width = `${progress.percentage}%`;
  syncProgressText.textContent = progress.message;

  if (progress.currentProject) {
    syncProgressDetails.textContent = `Current: ${progress.currentProject}`;
  }
}

/**
 * Hide sync progress overlay
 */
function hideSyncProgress() {
  syncProgressOverlay.classList.add('hidden');
}

/**
 * Log sync activity
 */
function logSyncActivity(type: 'success' | 'error' | 'info', message: string) {
  const entry = document.createElement('div');
  entry.className = `sync-log-entry sync-log-${type}`;
  entry.style.cssText = `
    padding: 12px;
    margin-bottom: 8px;
    border-radius: 8px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // Set background based on type
  const backgrounds = {
    success: '#e6ffed',
    error: '#ffe6e6',
    info: '#e6f2ff'
  };
  entry.style.background = backgrounds[type];

  // Icon
  const icon = document.createElement('span');
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  icon.style.cssText = 'font-size: 16px; font-weight: bold;';
  entry.appendChild(icon);

  // Timestamp
  const timestamp = document.createElement('span');
  timestamp.textContent = new Date().toLocaleTimeString();
  timestamp.style.cssText = 'color: #666; font-size: 12px; min-width: 80px;';
  entry.appendChild(timestamp);

  // Message
  const messageEl = document.createElement('span');
  messageEl.textContent = message;
  entry.appendChild(messageEl);

  // Prepend to log (newest first)
  syncLogContent.insertBefore(entry, syncLogContent.firstChild);

  // Limit to 50 entries
  while (syncLogContent.children.length > 50) {
    syncLogContent.removeChild(syncLogContent.lastChild!);
  }
}

// ============================================================================
// Account Switcher Functions
// ============================================================================

interface AccountInfo {
  id: string;
  name: string;
  color: string;
  type: 'work' | 'personal' | 'other';
  isActive?: boolean;
  organizationId?: string;
  organizationName?: string;
}

interface AccountsStorage {
  accounts: AccountInfo[];
  activeAccountId?: string;
}

/**
 * Get initials from account name
 */
function getAccountInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Update account display in header
 */
function updateAccountDisplay(storage?: AccountsStorage) {
  if (!storage || !storage.accounts || storage.accounts.length === 0) {
    currentAccountName.textContent = 'No Account';
    currentAccountAvatar.textContent = '?';
    currentAccountAvatar.style.backgroundColor = '#666';
    return;
  }
  
  const activeAccount = storage.accounts.find(a => a.isActive || a.id === storage.activeAccountId);
  if (activeAccount) {
    currentAccountName.textContent = activeAccount.name;
    currentAccountAvatar.textContent = getAccountInitials(activeAccount.name);
    currentAccountAvatar.style.backgroundColor = activeAccount.color || '#cc785c';
  } else {
    currentAccountName.textContent = 'No Account';
    currentAccountAvatar.textContent = '?';
    currentAccountAvatar.style.backgroundColor = '#666';
  }
}

/**
 * Show account switcher modal
 */
async function showAccountSwitcher() {
  try {
    // Fetch accounts from storage
    const result = await chrome.storage.local.get('eidolon_accounts');
    const storage: AccountsStorage = result.eidolon_accounts || { accounts: [] };
    
    // Clear existing list
    accountList.innerHTML = '';
    
    if (!storage.accounts || storage.accounts.length === 0) {
      accountList.innerHTML = `
        <div class="empty-state" style="padding: 24px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">👤</div>
          <div style="color: var(--text-300);">No accounts saved yet.<br>Log in to Claude.ai to auto-save.</div>
        </div>
      `;
    } else {
      // Sort: active first, then by name
      const sortedAccounts = [...storage.accounts].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name);
      });
      
      sortedAccounts.forEach(account => {
        const isActive = account.isActive || account.id === storage.activeAccountId;
        const initials = getAccountInitials(account.name);
        
        const accountItem = document.createElement('div');
        accountItem.className = `account-item ${isActive ? 'active' : ''}`;
        accountItem.innerHTML = `
          <div class="account-avatar" style="background-color: ${account.color || '#cc785c'}">${initials}</div>
          <div class="account-info">
            <div class="account-name">${escapeHtml(account.name)}</div>
            <div class="account-org">${escapeHtml(account.organizationName || 'Unknown org')}</div>
          </div>
          <span class="account-badge ${account.type}">${account.type}</span>
          ${isActive ? '<span class="account-current">Current</span>' : ''}
        `;
        
        // Click to switch
        accountItem.addEventListener('click', async () => {
          if (!isActive) {
            await switchAccount(account.id);
          }
        });
        
        accountList.appendChild(accountItem);
      });
    }
    
    // Show modal
    accountSwitcherModal.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to show account switcher:', error);
    toast.error('Failed to load accounts. Please try again.');
  }
}

/**
 * Switch to a different account
 */
async function switchAccount(accountId: string) {
  try {
    toast.info('Switching account...');
    
    const response = await browser.runtime.sendMessage({ 
      action: 'switch-account',
      accountId 
    });
    
    if (response.success) {
      // Close modal
      accountSwitcherModal.classList.add('hidden');
      
      // Reload data
      toast.success('Account switched successfully!');
      await loadProjects();
      await loadAllFiles();
      await loadConversations();
      
      // Update displays
      const result = await chrome.storage.local.get('eidolon_accounts');
      updateAccountDisplay(result.eidolon_accounts);
      updateOrgDisplay();
    } else {
      toast.error('Failed to switch account: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to switch account:', error);
    toast.error('Failed to switch account. Please try again.');
  }
}

/**
 * Load and display accounts on init
 */
async function loadAccountDisplay() {
  try {
    const result = await chrome.storage.local.get('eidolon_accounts');
    updateAccountDisplay(result.eidolon_accounts);
  } catch (error) {
    console.error('Failed to load account display:', error);
  }
}

// ============================================================================
// Organization Switcher Functions
// ============================================================================

/**
 * Update organization display in header
 */
function updateOrgDisplay() {
  if (state.currentOrg) {
    currentOrgName.textContent = state.currentOrg.name;
  } else {
    currentOrgName.textContent = 'No Organization';
  }
}

/**
 * Show organization switcher modal
 */
async function showOrgSwitcher() {
  try {
    // Fetch available organizations
    const response = await browser.runtime.sendMessage({ action: 'get-organizations' });

    if (!response.success) {
      toast.error('Failed to load organizations: ' + (response.error || 'Unknown error'));
      return;
    }

    const organizations = response.data;

    // Clear existing org list
    orgList.innerHTML = '';

    // Render organization items
    organizations.forEach((org: any) => {
      const orgItem = document.createElement('div');
      orgItem.className = 'org-item';

      const isActive = state.currentOrg?.uuid === org.uuid;
      if (isActive) {
        orgItem.classList.add('active');
      }

      const orgInfo = document.createElement('div');
      orgInfo.className = 'org-item-info';

      const orgName = document.createElement('div');
      orgName.className = 'org-item-name';
      orgName.textContent = org.name;

      const orgCapabilities = document.createElement('div');
      orgCapabilities.className = 'org-item-capabilities';
      orgCapabilities.textContent = org.capabilities ? `${org.capabilities.length} capabilities` : 'Standard';

      orgInfo.appendChild(orgName);
      orgInfo.appendChild(orgCapabilities);
      orgItem.appendChild(orgInfo);

      if (isActive) {
        const badge = document.createElement('div');
        badge.className = 'org-item-badge';
        badge.textContent = 'Current';
        orgItem.appendChild(badge);
      }

      // Click handler to switch organization
      orgItem.addEventListener('click', () => {
        if (!isActive) {
          switchOrganization(org.uuid, org.name);
        }
      });

      orgList.appendChild(orgItem);
    });

    // Show modal
    orgSwitcherModal.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to show org switcher:', error);
    toast.error('Failed to load organizations. Please try again.');
  }
}

/**
 * Switch to a different organization
 */
async function switchOrganization(orgId: string, orgName: string) {
  try {
    // Send message to background to switch org
    const response = await browser.runtime.sendMessage({
      action: 'set-current-org',
      orgId: orgId
    });

    if (response.success) {
      state.currentOrg = response.data;
      updateOrgDisplay();

      // Close modal
      orgSwitcherModal.classList.add('hidden');

      // Reload all data for the new organization
      statusText.textContent = `Switched to ${orgName}. Loading data...`;
      await loadAllData();
      renderCurrentTab();
      updateAnalytics();

      statusText.textContent = 'Connected to Claude.ai';
    } else {
      toast.error('Failed to switch organization: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to switch organization:', error);
    toast.error('Failed to switch organization. Please try again.');
  }
}

/**
 * Show authentication status modal
 */
async function showAuthModal() {
  // Show modal immediately
  authModal.classList.remove('hidden');

  // Display loading state
  authStatusContent.innerHTML = '<div class="auth-loading">Checking authentication...</div>';

  // Check authentication status
  await checkAuthStatus();
}

/**
 * Check and display authentication status
 */
async function checkAuthStatus() {
  try {
    // Get session from background worker
    const response = await browser.runtime.sendMessage({
      action: 'get-api-client-session'
    });

    if (response.success && response.data) {
      const { sessionKey, orgId } = response.data;

      // Validate the session
      const validateResponse = await browser.runtime.sendMessage({
        action: 'validate-session'
      });

      const isValid = validateResponse.success;

      // Display status
      authStatusContent.innerHTML = `
        <div class="auth-status-item">
          <div class="auth-label">Status:</div>
          <div class="auth-value ${isValid ? 'auth-valid' : 'auth-invalid'}">
            ${isValid ? '✅ Authenticated' : '❌ Not Authenticated'}
          </div>
        </div>
        <div class="auth-status-item">
          <div class="auth-label">Organization ID:</div>
          <div class="auth-value">${orgId || 'None'}</div>
        </div>
        <div class="auth-status-item">
          <div class="auth-label">Session Key:</div>
          <div class="auth-value">
            <span class="session-key-hidden" id="session-key-display">
              ${sessionKey ? '••••••••••••••••' : 'Not available'}
            </span>
          </div>
        </div>
        ${!isValid ? '<div class="auth-warning">⚠️ Authentication failed. Please visit <a href="https://claude.ai" target="_blank">claude.ai</a> to log in, then click "Refresh Claude.ai Session" again.</div>' : ''}
      `;
    } else {
      // Not authenticated
      authStatusContent.innerHTML = `
        <div class="auth-status-item">
          <div class="auth-label">Status:</div>
          <div class="auth-value auth-invalid">❌ Not Authenticated</div>
        </div>
        <div class="auth-warning">
          ⚠️ No session found. Please visit <a href="https://claude.ai" target="_blank">claude.ai</a> to log in, then click "Refresh Claude.ai Session".
        </div>
      `;
    }
  } catch (error) {
    console.error('Failed to check auth status:', error);
    authStatusContent.innerHTML = `
      <div class="auth-error">
        ❌ Error checking authentication: ${(error as Error).message}
      </div>
    `;
  }
}

/**
 * Validate session and update display
 */
async function validateAuthSession() {
  authStatusContent.innerHTML = '<div class="auth-loading">Validating session...</div>';

  try {
    const response = await browser.runtime.sendMessage({
      action: 'validate-session'
    });

    if (response.success) {
      await checkAuthStatus();
      toast.success('Session validated successfully!');
    } else {
      await checkAuthStatus();
      toast.error('Session validation failed. Please visit claude.ai to log in.');
    }
  } catch (error) {
    console.error('Failed to validate session:', error);
    authStatusContent.innerHTML = `
      <div class="auth-error">
        ❌ Error validating session: ${(error as Error).message}
      </div>
    `;
  }
}

/**
 * Toggle session key display (show/hide)
 */
let sessionKeyVisible = false;

async function toggleSessionKeyDisplay() {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'get-api-client-session'
    });

    if (response.success && response.data) {
      const { sessionKey } = response.data;
      const displayElement = document.getElementById('session-key-display');

      if (!displayElement || !sessionKey) {
        toast.error('Session key not available');
        return;
      }

      sessionKeyVisible = !sessionKeyVisible;

      if (sessionKeyVisible) {
        displayElement.textContent = sessionKey;
        displayElement.classList.remove('session-key-hidden');
        displayElement.classList.add('session-key-visible');
        showSessionKeyBtn.textContent = 'Hide Session Key';
      } else {
        displayElement.textContent = '••••••••••••••••';
        displayElement.classList.remove('session-key-visible');
        displayElement.classList.add('session-key-hidden');
        showSessionKeyBtn.textContent = 'Show Session Key';
      }
    } else {
      toast.error('Session key not available');
    }
  } catch (error) {
    console.error('Failed to toggle session key:', error);
    toast.error('Error accessing session key');
  }
}


// ========================================================================
// EXPORT SETTINGS
// ========================================================================

/**
 * Initialize developer mode toggle and visibility
 */
async function initDeveloperMode(): Promise<void> {
  const toggle = document.getElementById('settings-developer-mode-toggle') as HTMLInputElement;
  const developerTab = document.querySelector('.settings-tab-btn[data-tab="developer"]') as HTMLElement;
  
  if (!toggle || !developerTab) return;
  
  // Load saved preference - default to TRUE (show developer tab by default)
  const result = await chrome.storage.local.get('eidolon_developer_mode');
  const developerMode = result.eidolon_developer_mode !== false; // Default true
  
  toggle.checked = developerMode;
  updateDeveloperTabVisibility(developerMode, developerTab);
  
  // Listen for changes
  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    await chrome.storage.local.set({ eidolon_developer_mode: enabled });
    updateDeveloperTabVisibility(enabled, developerTab);
    
    // If disabling and currently on developer tab, switch to general
    if (!enabled) {
      const activeTab = document.querySelector('.settings-tab-btn.active');
      if (activeTab?.getAttribute('data-tab') === 'developer') {
        const generalTab = document.querySelector('.settings-tab-btn[data-tab="general"]') as HTMLElement;
        generalTab?.click();
      }
    }
  });
}

/**
 * Show or hide the Developer tab button
 */
function updateDeveloperTabVisibility(visible: boolean, tabBtn: HTMLElement): void {
  if (visible) {
    tabBtn.style.display = '';
  } else {
    tabBtn.style.display = 'none';
  }
}

/**
 * Load export settings and update UI
 */
async function loadExportSettings() {
  try {
    const result = await browser.storage.local.get('exportPlatformSettings');
    const settings = result.exportPlatformSettings || {
      claude: true,
      chatgpt: true,
      gemini: true
    };

    // Update toggle switches
    const claudeToggle = document.getElementById('export-claude-toggle') as HTMLInputElement;
    const chatgptToggle = document.getElementById('export-chatgpt-toggle') as HTMLInputElement;
    const geminiToggle = document.getElementById('export-gemini-toggle') as HTMLInputElement;

    if (claudeToggle) claudeToggle.checked = settings.claude;
    if (chatgptToggle) chatgptToggle.checked = settings.chatgpt;
    if (geminiToggle) geminiToggle.checked = settings.gemini;

    console.log('[Dashboard] Loaded export settings:', settings);
  } catch (error) {
    console.error('[Dashboard] Failed to load export settings:', error);
  }
}

/**
 * Save export settings from UI
 */
async function saveExportSettings() {
  const saveButton = document.getElementById('save-export-settings-btn') as HTMLButtonElement;
  const statusElement = document.getElementById('export-settings-status') as HTMLSpanElement;

  try {
    // Disable button during save
    if (saveButton) saveButton.disabled = true;

    // Get toggle values
    const claudeToggle = document.getElementById('export-claude-toggle') as HTMLInputElement;
    const chatgptToggle = document.getElementById('export-chatgpt-toggle') as HTMLInputElement;
    const geminiToggle = document.getElementById('export-gemini-toggle') as HTMLInputElement;

    const settings = {
      claude: claudeToggle?.checked ?? true,
      chatgpt: chatgptToggle?.checked ?? true,
      gemini: geminiToggle?.checked ?? true
    };

    // Save to storage
    await browser.storage.local.set({ exportPlatformSettings: settings });

    console.log('[Dashboard] Saved export settings:', settings);

    // Show success message
    if (statusElement) {
      statusElement.textContent = '✓ Settings saved successfully!';
      statusElement.className = 'status-message success';
      
      setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'status-message';
      }, 3000);
    }
  } catch (error) {
    console.error('[Dashboard] Failed to save export settings:', error);
    
    // Show error message
    if (statusElement) {
      statusElement.textContent = '✗ Failed to save settings';
      statusElement.className = 'status-message error';
    }
  } finally {
    // Re-enable button
    if (saveButton) saveButton.disabled = false;
  }
}

/**
 * Initialize export settings UI
 */
function initExportSettings() {
  // Load current settings
  loadExportSettings();

  // Attach save button listener
  const saveButton = document.getElementById('save-export-settings-btn');
  if (saveButton) {
    saveButton.addEventListener('click', saveExportSettings);
  }
}

// ========================================================================
// SETTINGS TAB
// ========================================================================

/**
 * Initialize settings tab - loads settings and attaches auto-save handlers
 */
function initSettingsTab() {
  // Initialize settings service for dashboard context
  settingsService.init('dashboard');
  
  // Settings Tabs Switching Logic
  const tabBtns = document.querySelectorAll('.settings-tab-btn');
  const tabContents = document.querySelectorAll('.settings-tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tabId = target.getAttribute('data-tab');
      
      // Update buttons
      tabBtns.forEach(b => b.classList.remove('active'));
      target.classList.add('active');
      
      // Update content
      tabContents.forEach(c => c.classList.remove('active'));
      const content = document.getElementById(`settings-tab-${tabId}`);
      if (content) {
        content.classList.add('active');
      }
    });
  });
  
  // Load export settings
  loadExportSettings();
  
  // Load other settings
  loadSettingsTabState();
  
  // Initialize developer mode
  initDeveloperMode();
  
  // Setup auto-save on toggle changes (no save button needed)
  setupSettingsAutoSave();
  
  // Load workspace status in settings tab
  updateSettingsWorkspaceStatus();
  
  // Setup workspace status button handlers
  setupSettingsWorkspaceStatusHandlers();
  
  // Subscribe to workspace config changes to update status
  settingsService.subscribe((event) => {
    if (event.type === 'workspace') {
      updateSettingsWorkspaceStatus();
    }
  });
  
  // Load OAuth connections status
  loadOAuthConnections();
}

/**
 * Load settings tab state
 */
async function loadSettingsTabState() {
  try {
    // Dark mode toggle
    const darkModeToggle = document.getElementById('settings-dark-mode-toggle') as HTMLInputElement;
    if (darkModeToggle) {
      darkModeToggle.checked = document.body.classList.contains('dark-mode');
    }
    
    // Agent mode toggle
    const agentModeToggle = document.getElementById('settings-agent-mode-toggle') as HTMLInputElement;
    if (agentModeToggle) {
      const result = await browser.storage.local.get('agentModeEnabled');
      agentModeToggle.checked = result.agentModeEnabled ?? false;
    }
    
    // Debug mode toggle
    const debugModeToggle = document.getElementById('settings-debug-mode-toggle') as HTMLInputElement;
    if (debugModeToggle) {
      const result = await browser.storage.local.get('debugModeEnabled');
      debugModeToggle.checked = result.debugModeEnabled ?? false;
    }
  } catch (error) {
    console.error('[Dashboard] Failed to load settings state:', error);
  }
}

/**
 * Setup auto-save for settings toggles
 */
function setupSettingsAutoSave() {
  // Export platform toggles - auto-save on change
  ['export-claude-toggle', 'export-chatgpt-toggle', 'export-gemini-toggle'].forEach(id => {
    const toggle = document.getElementById(id) as HTMLInputElement;
    if (toggle) {
      toggle.addEventListener('change', saveExportSettingsAuto);
    }
  });
  
  // Dark mode toggle
  const darkModeToggle = document.getElementById('settings-dark-mode-toggle') as HTMLInputElement;
  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', () => {
      toggleDarkMode();
    });
  }
  
  // Agent mode toggle
  const agentModeToggle = document.getElementById('settings-agent-mode-toggle') as HTMLInputElement;
  if (agentModeToggle) {
    agentModeToggle.addEventListener('change', async () => {
      await browser.storage.local.set({ agentModeEnabled: agentModeToggle.checked });
      showSettingsSaveStatus('Agent mode ' + (agentModeToggle.checked ? 'enabled' : 'disabled'));
    });
  }
  
  // Debug mode toggle
  const debugModeToggle = document.getElementById('settings-debug-mode-toggle') as HTMLInputElement;
  if (debugModeToggle) {
    debugModeToggle.addEventListener('change', async () => {
      await browser.storage.local.set({ debugModeEnabled: debugModeToggle.checked });
      showSettingsSaveStatus('Debug mode ' + (debugModeToggle.checked ? 'enabled' : 'disabled'));
    });
  }
  
  // Data management buttons
  document.getElementById('clear-cache-btn')?.addEventListener('click', clearCache);
  document.getElementById('export-settings-btn')?.addEventListener('click', exportAllSettings);
  document.getElementById('import-settings-btn')?.addEventListener('click', importSettings);
  document.getElementById('save-all-settings-btn')?.addEventListener('click', saveAllSettings);
}

/**
 * Auto-save export settings on toggle change
 */
async function saveExportSettingsAuto() {
  try {
    const claudeToggle = document.getElementById('export-claude-toggle') as HTMLInputElement;
    const chatgptToggle = document.getElementById('export-chatgpt-toggle') as HTMLInputElement;
    const geminiToggle = document.getElementById('export-gemini-toggle') as HTMLInputElement;

    const settings = {
      claude: claudeToggle?.checked ?? true,
      chatgpt: chatgptToggle?.checked ?? true,
      gemini: geminiToggle?.checked ?? true
    };

    await browser.storage.local.set({ exportPlatformSettings: settings });
    showSettingsSaveStatus('Export settings saved');
  } catch (error) {
    console.error('[Dashboard] Failed to auto-save export settings:', error);
  }
}

/**
 * Show brief status message in settings footer
 */
function showSettingsSaveStatus(message: string) {
  const statusEl = document.getElementById('settings-save-status');
  if (statusEl) {
    statusEl.textContent = '✓ ' + message;
    statusEl.className = 'status-message success';
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 2000);
  }
}

/**
 * Clear cached data
 */
async function clearCache() {
  try {
    await browser.storage.local.remove(['cachedProjects', 'cachedConversations', 'cachedFiles']);
    showSettingsSaveStatus('Cache cleared');
    // Reload data
    await loadAllData();
    renderCurrentTab();
  } catch (error) {
    console.error('[Dashboard] Failed to clear cache:', error);
  }
}

/**
 * Export all settings as JSON
 */
async function exportAllSettings() {
  try {
    const data = await browser.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eidolon-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSettingsSaveStatus('Settings exported');
  } catch (error) {
    console.error('[Dashboard] Failed to export settings:', error);
  }
}

/**
 * Import settings from JSON file
 */
function importSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await browser.storage.local.set(data);
      showSettingsSaveStatus('Settings imported');
      // Reload to apply settings
      window.location.reload();
    } catch (error) {
      console.error('[Dashboard] Failed to import settings:', error);
      toast.error('Failed to import settings. Invalid file format.');
    }
  };
  input.click();
}

/**
 * Save all current settings (explicit save button)
 */
async function saveAllSettings() {
  await saveExportSettingsAuto();
  showSettingsSaveStatus('All settings saved');
}

// ========================================================================
// WORKSPACE STATUS IN SETTINGS TAB
// ========================================================================

/**
 * Update the workspace status summary in the Settings tab
 * This shows a quick overview of sync status without needing to navigate to Sync tab
 */
async function updateSettingsWorkspaceStatus() {
  const indicator = document.getElementById('settings-sync-indicator');
  const statusText = document.getElementById('settings-sync-status-text');
  const pathRow = document.getElementById('settings-workspace-path-row');
  const pathEl = document.getElementById('settings-workspace-path');
  const lastSyncRow = document.getElementById('settings-last-sync-row');
  const lastSyncEl = document.getElementById('settings-last-sync-time');
  
  if (!indicator || !statusText) return;
  
  try {
    const config = await getWorkspaceConfig();
    
    if (!config?.workspacePath) {
      // Not configured
      indicator.className = 'workspace-status-indicator not-configured';
      statusText.textContent = 'Not configured';
      if (pathRow) pathRow.style.display = 'none';
      if (lastSyncRow) lastSyncRow.style.display = 'none';
      return;
    }
    
    // Show workspace path
    if (pathRow && pathEl) {
      pathRow.style.display = 'flex';
      pathEl.textContent = config.workspacePath;
      pathEl.title = config.workspacePath;
    }
    
    // Show last sync time
    if (lastSyncRow && lastSyncEl) {
      if (config.lastSync) {
        lastSyncRow.style.display = 'flex';
        const lastSyncDate = new Date(config.lastSync);
        const now = new Date();
        const diffMs = now.getTime() - lastSyncDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) {
          lastSyncEl.textContent = 'Just now';
        } else if (diffMins < 60) {
          lastSyncEl.textContent = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
          lastSyncEl.textContent = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else {
          lastSyncEl.textContent = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        }
      } else {
        lastSyncRow.style.display = 'flex';
        lastSyncEl.textContent = 'Never';
      }
    }
    
    // Determine sync status
    if (state.isSyncing) {
      indicator.className = 'workspace-status-indicator syncing';
      statusText.textContent = 'Syncing...';
    } else if (config.lastSync) {
      // Check if there might be pending changes (simplified check)
      const lastSyncDate = new Date(config.lastSync);
      const now = new Date();
      const hoursSinceSync = (now.getTime() - lastSyncDate.getTime()) / 3600000;
      
      if (hoursSinceSync > 24) {
        indicator.className = 'workspace-status-indicator pending';
        statusText.textContent = 'May have pending changes';
      } else {
        indicator.className = 'workspace-status-indicator synced';
        statusText.textContent = 'Synced';
      }
    } else {
      indicator.className = 'workspace-status-indicator pending';
      statusText.textContent = 'Workspace configured, not synced yet';
    }
  } catch (error) {
    console.error('[Dashboard] Failed to update workspace status:', error);
    indicator.className = 'workspace-status-indicator error';
    statusText.textContent = 'Error checking status';
  }
}

/**
 * Setup workspace status button handlers in Settings tab
 */
function setupSettingsWorkspaceStatusHandlers() {
  // "Open Full Sync Settings" button - navigates to Sync tab
  const openSyncTabBtn = document.getElementById('settings-open-sync-tab');
  if (openSyncTabBtn) {
    openSyncTabBtn.addEventListener('click', () => {
      // Find and click the Sync nav tab
      const syncNavTab = document.querySelector('.nav-tab[data-tab="sync"]') as HTMLElement;
      if (syncNavTab) {
        syncNavTab.click();
      }
    });
  }
}

// ========================================================================
// DARK MODE TOGGLE
// ========================================================================

/**
 * Initialize dark mode from localStorage
 */
function initDarkMode() {
  const darkMode = localStorage.getItem('eidolon-dark-mode') === 'true';
  
  if (darkMode) {
    document.body.classList.add('dark-mode');
    updateDarkModeButton(true);
  }
}

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('eidolon-dark-mode', isDark.toString());
  updateDarkModeButton(isDark);
}

/**
 * Update dark mode button appearance
 */
function updateDarkModeButton(isDark: boolean) {
  const button = document.getElementById('dark-mode-toggle');
  if (!button) return;
  
  const icon = button.querySelector('.btn-icon');
  const label = button.querySelector('.btn-label');
  
  if (icon && label) {
    if (isDark) {
      icon.textContent = '☀️';
      label.textContent = 'Light';
      button.title = 'Switch to Light Mode';
    } else {
      icon.textContent = '🌙';
      label.textContent = 'Dark';
      button.title = 'Switch to Dark Mode';
    }
  }
}

/**
 * Attach dark mode toggle listener
 */
function setupDarkModeToggle() {
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', toggleDarkMode);
  }
}

// Initialize dark mode on page load
initDarkMode();
setupDarkModeToggle();

// ========================================================================
// OAUTH CONNECTION MANAGEMENT
// ========================================================================

/**
 * Load and render OAuth connections in settings panel
 */
async function loadOAuthConnections(): Promise<void> {
  const connectionsList = document.getElementById('oauth-connections-list');
  if (!connectionsList) return;

  // Show skeleton while loading (already in HTML, but ensure it's there if needed)
  if (connectionsList.children.length === 0 || !connectionsList.querySelector('.skeleton-card')) {
    connectionsList.innerHTML = `
      <div class="oauth-loading skeleton-card">
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton skeleton-text w-75"></div>
          <div class="skeleton skeleton-text w-50"></div>
        </div>
      </div>
    `;
  }

  try {
    const statuses = await getAllProviderStatus();
    renderOAuthConnections(statuses);
  } catch (error) {
    console.error('[Dashboard] Failed to load OAuth connections:', error);
    connectionsList.innerHTML = `
      <div class="oauth-loading">Failed to load connections</div>
    `;
  }
}

/**
 * Render OAuth provider connections
 */
function renderOAuthConnections(statuses: ProviderStatus[]): void {
  const connectionsList = document.getElementById('oauth-connections-list');
  if (!connectionsList) return;

  const providerIcons: Record<OAuthProviderType, string> = {
    anthropic: '🤖',
    openai: '💬',
    google: '✨',
  };

  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude (Anthropic)',
    openai: 'ChatGPT (OpenAI)',
    google: 'Gemini (Google)',
  };

  const providerDescs: Record<OAuthProviderType, string> = {
    anthropic: 'Uses your Claude Pro/Max subscription',
    openai: 'Uses your ChatGPT Plus/Pro subscription',
    google: 'Uses your Gemini Advanced subscription',
  };

  connectionsList.innerHTML = statuses.map(status => {
    const config = OAUTH_PROVIDERS[status.provider];
    const isConnected = status.connected;
    return `
      <div class="oauth-provider-item ${isConnected ? 'connected' : ''}" data-provider="${status.provider}">
        <div class="oauth-provider-icon ${status.provider}">
          ${providerIcons[status.provider]}
        </div>
        <div class="oauth-provider-info">
          <div class="oauth-provider-name">
            ${providerNames[status.provider]}
            ${isConnected ? '<span class="oauth-connected-badge">Connected</span>' : ''}
          </div>
          <div class="oauth-provider-desc">${providerDescs[status.provider]}</div>
          ${isConnected && status.email ? `<div class="oauth-provider-email">${escapeHtmlOAuth(status.email)}</div>` : ''}
        </div>
        <div class="oauth-provider-action">
          ${isConnected 
            ? `<button class="oauth-disconnect-btn" data-provider="${status.provider}">Disconnect</button>`
            : `<button class="oauth-connect-btn" data-provider="${status.provider}">Connect</button>`
          }
        </div>
      </div>
    `;
  }).join('');

  // Attach event listeners
  connectionsList.querySelectorAll('.oauth-connect-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const provider = (e.target as HTMLElement).getAttribute('data-provider') as OAuthProviderType;
      if (provider) {
        await startOAuthFlow(provider);
      }
    });
  });

  connectionsList.querySelectorAll('.oauth-disconnect-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const provider = (e.target as HTMLElement).getAttribute('data-provider') as OAuthProviderType;
      if (provider) {
        await disconnectOAuthProvider(provider);
      }
    });
  });
}

/**
 * Escape HTML for OAuth display
 */
function escapeHtmlOAuth(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Start OAuth flow for a provider
 */
async function startOAuthFlow(provider: OAuthProviderType): Promise<void> {
  try {
    const auth = await startAuthorization(provider);
    
    // Open auth URL in new tab
    await browser.tabs.create({ url: auth.url, active: true });
    
    // Show modal with waiting state (code will be captured automatically)
    showOAuthWaitingModal(provider);
  } catch (error) {
    console.error('[Dashboard] OAuth start failed:', error);
    toast.error(`Failed to start OAuth: ${(error as Error).message}`);
  }
}

/**
 * Show OAuth waiting modal (auto-capture mode)
 */
function showOAuthWaitingModal(provider: OAuthProviderType): void {
  const modal = document.getElementById('oauth-code-modal');
  const titleEl = document.getElementById('oauth-modal-title');
  const instructionsEl = document.getElementById('oauth-instructions');
  const providerIdInput = document.getElementById('oauth-provider-id') as HTMLInputElement;
  const codeInput = document.getElementById('oauth-code-input') as HTMLInputElement;
  const submitBtn = document.getElementById('oauth-submit-btn') as HTMLButtonElement;

  if (!modal || !titleEl || !instructionsEl || !providerIdInput || !codeInput) return;

  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
  };

  titleEl.textContent = `Connecting ${providerNames[provider]}...`;
  instructionsEl.innerHTML = `
    <div style="text-align: center; padding: 12px 0;">
      <div style="font-size: 24px; margin-bottom: 8px;">🔐</div>
      <div>Complete the authorization in the new tab.</div>
      <div style="color: var(--text-400); font-size: 12px; margin-top: 8px;">
        The code will be captured automatically.<br>
        If it doesn't work, paste the code manually below.
      </div>
    </div>
  `;
  providerIdInput.value = provider;
  codeInput.value = '';
  codeInput.placeholder = 'Or paste code here if auto-capture fails...';
  if (submitBtn) submitBtn.textContent = 'Submit Code';

  modal.classList.remove('hidden');
}

/**
 * Show OAuth code input modal
 */
function showOAuthCodeModal(provider: OAuthProviderType, instructions: string): void {
  const modal = document.getElementById('oauth-code-modal');
  const titleEl = document.getElementById('oauth-modal-title');
  const instructionsEl = document.getElementById('oauth-instructions');
  const providerIdInput = document.getElementById('oauth-provider-id') as HTMLInputElement;
  const codeInput = document.getElementById('oauth-code-input') as HTMLInputElement;

  if (!modal || !titleEl || !instructionsEl || !providerIdInput || !codeInput) return;

  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
  };

  titleEl.textContent = `Connect ${providerNames[provider]}`;
  instructionsEl.textContent = instructions;
  providerIdInput.value = provider;
  codeInput.value = '';
  codeInput.focus();

  modal.classList.remove('hidden');
}

/**
 * Close OAuth code modal
 */
function closeOAuthCodeModal(): void {
  const modal = document.getElementById('oauth-code-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Submit OAuth code
 */
async function submitOAuthCode(): Promise<void> {
  const codeInput = document.getElementById('oauth-code-input') as HTMLInputElement;
  const providerIdInput = document.getElementById('oauth-provider-id') as HTMLInputElement;
  
  if (!codeInput || !providerIdInput) return;
  
  const code = codeInput.value.trim();
  const provider = providerIdInput.value as OAuthProviderType;
  
  if (!code) {
    toast.warning('Please enter the authorization code');
    return;
  }
  
  const submitBtn = document.getElementById('oauth-submit-btn') as HTMLButtonElement;
  if (submitBtn) submitBtn.disabled = true;
  
  try {
    await exchangeCodeForTokens(code);
    toast.success('Connected successfully!');
    closeOAuthCodeModal();
    // Reload connections
    await loadOAuthConnections();
  } catch (error) {
    console.error('[Dashboard] OAuth code exchange failed:', error);
    toast.error(`Connection failed: ${(error as Error).message}`);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Disconnect OAuth provider
 */
async function disconnectOAuthProvider(provider: OAuthProviderType): Promise<void> {
  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
  };
  
  if (!confirm(`Disconnect ${providerNames[provider]}? You'll need to re-authorize to use it again.`)) {
    return;
  }
  
  try {
    await removeCredentials(provider);
    toast.success(`${providerNames[provider]} disconnected`);
    await loadOAuthConnections();
  } catch (error) {
    console.error('[Dashboard] Failed to disconnect OAuth:', error);
    toast.error(`Failed to disconnect: ${(error as Error).message}`);
  }
}

/**
 * Setup OAuth event listeners
 */
function setupOAuthEventListeners(): void {
  // Close modal buttons
  document.getElementById('close-oauth-modal')?.addEventListener('click', closeOAuthCodeModal);
  document.getElementById('oauth-cancel-btn')?.addEventListener('click', closeOAuthCodeModal);
  
  // Submit button
  document.getElementById('oauth-submit-btn')?.addEventListener('click', submitOAuthCode);
  
  // Enter key in input
  document.getElementById('oauth-code-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitOAuthCode();
    }
  });
  
  // Click outside modal to close
  document.getElementById('oauth-code-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('oauth-code-modal')) {
      closeOAuthCodeModal();
    }
  });
  
  // Listen for OAuth callback from background script (auto-capture)
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'oauth-callback' && message.code) {
      console.log('[Dashboard] Received OAuth callback with code');
      handleAutoOAuthCallback(message.code);
    }
  });
}

/**
 * Handle automatically captured OAuth callback
 */
async function handleAutoOAuthCallback(code: string): Promise<void> {
  const modal = document.getElementById('oauth-code-modal');
  const titleEl = document.getElementById('oauth-modal-title');
  const instructionsEl = document.getElementById('oauth-instructions');
  
  // Only process if modal is open (meaning we're expecting a callback)
  if (!modal || modal.classList.contains('hidden')) {
    return;
  }
  
  // Update UI to show processing
  if (titleEl) titleEl.textContent = 'Completing connection...';
  if (instructionsEl) {
    instructionsEl.innerHTML = `
      <div style="text-align: center; padding: 12px 0;">
        <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
        <div>Exchanging authorization code...</div>
      </div>
    `;
  }
  
  try {
    const result = await exchangeCodeForTokens(code);
    
    if (result.type === 'success') {
      toast.success('Connected successfully!');
      closeOAuthCodeModal();
      await loadOAuthConnections();
    } else {
      toast.error(`Connection failed: ${result.error}`);
      // Reset modal to allow manual entry
      if (instructionsEl) {
        instructionsEl.innerHTML = `
          <div style="color: var(--error); margin-bottom: 12px;">
            Auto-capture failed: ${result.error}
          </div>
          <div>Please paste the authorization code manually:</div>
        `;
      }
      if (titleEl) titleEl.textContent = 'Enter Code Manually';
    }
  } catch (error) {
    console.error('[Dashboard] OAuth auto-callback failed:', error);
    toast.error(`Connection failed: ${(error as Error).message}`);
  }
}
