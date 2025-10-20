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
import { SyncManager } from '../../utils/sync/SyncManager';
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
  verifyPermission
} from '../../utils/sync/fileSystem';
import type { SyncProgress, SyncSettings } from '../../utils/sync/types';

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
};

const searchService = getSearchService();
const tagsService = getTagsService();

// DOM Elements
const statusBar = document.getElementById('status-bar')!;
const statusText = document.getElementById('status-text')!;
const globalSearch = document.getElementById('global-search') as HTMLInputElement;
const refreshAllBtn = document.getElementById('refresh-all-btn')!;
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

// Org switcher elements
const orgSwitcherBtn = document.getElementById('org-switcher-btn')!;
const currentOrgName = document.getElementById('current-org-name')!;
const orgSwitcherModal = document.getElementById('org-switcher-modal')!;
const orgList = document.getElementById('org-list')!;
const closeOrgModal = document.getElementById('close-org-modal')!

// Projects elements
const projectsGrid = document.getElementById('projects-grid')!;
const projectsCount = document.getElementById('projects-count')!;
const viewGridBtn = document.getElementById('view-grid')!;
const viewListBtn = document.getElementById('view-list')!;
const selectAllProjectsBtn = document.getElementById('select-all-projects')!;
const bulkActionsProjectsBtn = document.getElementById('bulk-actions-projects')!;
const newProjectBtn = document.getElementById('new-project')!;
const sortProjects = document.getElementById('sort-projects') as HTMLSelectElement;

// Files elements
const selectAllFilesBtn = document.getElementById('select-all-files')!;
const bulkActionsFilesBtn = document.getElementById('bulk-actions-files')!;

// Analytics elements
const totalProjectsEl = document.getElementById('total-projects')!;
const totalFilesEl = document.getElementById('total-files')!;
const totalConversationsEl = document.getElementById('total-conversations')!;
const totalStorageEl = document.getElementById('total-storage')!;
const exportAllDataBtn = document.getElementById('export-all-data')!;

// Sync elements
const syncNotConfigured = document.getElementById('sync-not-configured')!;
const syncConfigured = document.getElementById('sync-configured')!;
const setupWorkspaceBtn = document.getElementById('setup-workspace-btn')!;
const configureWorkspaceBtn = document.getElementById('configure-workspace-btn')!;
const syncNowBtn = document.getElementById('sync-now-btn')!;
const previewChangesBtn = document.getElementById('preview-changes-btn')!;
const viewDiffBtn = document.getElementById('view-diff-btn')!;
const openWorkspaceBtn = document.getElementById('open-workspace-btn')!;
const autoSyncEnabledCheckbox = document.getElementById('auto-sync-enabled') as HTMLInputElement;
const syncIntervalSelect = document.getElementById('sync-interval') as HTMLSelectElement;
const bidirectionalSyncCheckbox = document.getElementById('bidirectional-sync') as HTMLInputElement;
const syncChatsCheckbox = document.getElementById('sync-chats') as HTMLInputElement;
const conflictStrategySelect = document.getElementById('conflict-strategy') as HTMLSelectElement;
const syncStatusIndicator = document.getElementById('sync-status-indicator')!;
const syncWorkspacePath = document.getElementById('sync-workspace-path')!;
const syncLastSync = document.getElementById('sync-last-sync')!;
const syncLogContent = document.getElementById('sync-log-content')!;
const syncProgressOverlay = document.getElementById('sync-progress-overlay')!;
const syncProgressBar = document.getElementById('sync-progress-bar')!;
const syncProgressText = document.getElementById('sync-progress-text')!;
const syncProgressDetails = document.getElementById('sync-progress-details')!;
const cancelSyncBtn = document.getElementById('cancel-sync-btn')!;

// Initialize
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
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

  setupEventListeners();
  await initSyncTab();

  if (state.isConnected) {
    await loadAllData();
    renderCurrentTab();
    updateAnalytics();
  }
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

  // Select all buttons
  selectAllProjectsBtn.addEventListener('click', toggleSelectAllProjects);

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

  // Settings button
  const settingsBtn = document.getElementById('settings-btn')!;
  settingsBtn.addEventListener('click', () => {
    showSettingsModal();
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

  // Sync tab event listeners
  setupWorkspaceBtn.addEventListener('click', setupWorkspace);
  configureWorkspaceBtn.addEventListener('click', setupWorkspace);
  syncNowBtn.addEventListener('click', () => syncNow(false));
  previewChangesBtn.addEventListener('click', () => syncNow(true));
  viewDiffBtn.addEventListener('click', viewWorkspaceDiff);
  openWorkspaceBtn.addEventListener('click', openWorkspaceFolder);

  // Sync settings
  autoSyncEnabledCheckbox.addEventListener('change', saveSyncSettings);
  syncIntervalSelect.addEventListener('change', saveSyncSettings);
  bidirectionalSyncCheckbox.addEventListener('change', saveSyncSettings);
  syncChatsCheckbox.addEventListener('change', saveSyncSettings);
  conflictStrategySelect.addEventListener('change', saveSyncSettings);

  cancelSyncBtn.addEventListener('click', () => {
    state.isSyncing = false;
    hideSyncProgress();
  });
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
  }
}

function renderProjects() {
  projectsGrid.textContent = '';

  // Filter by tags if any are selected
  let filteredProjects = state.projects;
  if (state.filterTags.length > 0) {
    filteredProjects = state.projects.filter(project => {
      const projectTags = state.projectTags.get(project.uuid) || [];
      const projectTagIds = projectTags.map(t => t.id);
      return state.filterTags.some(tagId => projectTagIds.includes(tagId));
    });
  }

  if (filteredProjects.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = state.filterTags.length > 0 ? 'No projects match the selected tags' : 'No projects found';
    projectsGrid.appendChild(emptyState);
    return;
  }

  projectsGrid.className = state.viewMode === 'grid' ? 'projects-grid' : 'projects-list';

  filteredProjects.forEach((project) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    if (state.selectedProjects.has(project.uuid)) {
      card.classList.add('selected');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'project-checkbox';
    checkbox.checked = state.selectedProjects.has(project.uuid);
    checkbox.addEventListener('change', () => toggleProjectSelection(project.uuid));

    const header = document.createElement('div');
    header.className = 'project-header';

    const title = document.createElement('h3');
    title.textContent = project.name;

    const favorite = document.createElement('button');
    favorite.className = 'favorite-btn';
    favorite.textContent = '⭐';
    favorite.addEventListener('click', () => toggleFavorite(project.uuid));

    header.appendChild(checkbox);
    header.appendChild(title);
    header.appendChild(favorite);

    const description = document.createElement('p');
    description.className = 'project-description';
    description.textContent = project.description || 'No description';

    const meta = document.createElement('div');
    meta.className = 'project-meta';
    const date = new Date(project.created_at || Date.now());
    meta.textContent = `Created ${date.toLocaleDateString()}`;

    // Tags display
    const tagsContainer = document.createElement('div');
    tagsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin: 12px 0;';
    const projectTags = state.projectTags.get(project.uuid) || [];
    projectTags.forEach(tag => {
      tagsContainer.appendChild(createTagBadge(tag, { small: true }));
    });

    const actions = document.createElement('div');
    actions.className = 'project-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'action-btn small';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openProject(project.uuid));

    const filesBtn = document.createElement('button');
    filesBtn.className = 'action-btn small';
    filesBtn.textContent = 'Files';
    filesBtn.addEventListener('click', () => viewProjectFiles(project.uuid));

    const tagsBtn = document.createElement('button');
    tagsBtn.className = 'action-btn small';
    tagsBtn.textContent = '🏷️ Tags';
    tagsBtn.addEventListener('click', async () => {
      await showTagSelectionModal(project.uuid, 'project', projectTags);
      await loadAllTags();
      await indexAllData();
      renderProjects();
    });

    actions.appendChild(openBtn);
    actions.appendChild(filesBtn);
    actions.appendChild(tagsBtn);

    card.appendChild(header);
    card.appendChild(description);
    card.appendChild(meta);
    card.appendChild(tagsContainer);
    card.appendChild(actions);

    projectsGrid.appendChild(card);
  });
}

function renderFiles() {
  const filesList = document.getElementById('files-list')!;
  const filesCount = document.getElementById('files-count')!;
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
}

function renderConversations() {
  const conversationsList = document.getElementById('conversations-list')!;
  const conversationsCount = document.getElementById('conversations-count')!;
  conversationsCount.textContent = state.conversations.length.toString();

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

    const openBtn = document.createElement('button');
    openBtn.className = 'action-btn small';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openConversation(conv.uuid));

    actions.appendChild(openBtn);

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(actions);

    conversationsList.appendChild(item);
  });
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
      date: p.created_at || p.updated_at,
      action: 'created',
    })),
    ...state.files.map((f) => ({
      type: 'file',
      name: f.file_name,
      date: f.created_at,
      action: 'uploaded',
    })),
    ...state.conversations.map((c) => ({
      type: 'conversation',
      name: c.name,
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

function toggleFavorite(uuid: string) {
  // TODO: Implement favorites storage
  console.log('Toggle favorite:', uuid);
}

async function handleBulkAction(action: string) {
  const selectedCount = state.selectedProjects.size;

  if (selectedCount === 0) {
    alert('No projects selected');
    return;
  }

  switch (action) {
    case 'archive':
      // Archive functionality not yet implemented in API
      alert(`Archive feature coming soon! Selected: ${selectedCount} project(s)`);
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

  alert(`Exported ${selectedProjects.length} project(s) successfully!`);
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

  alert(`Added tags to ${state.selectedProjects.size} project(s)!`);
}

async function bulkDeleteProjects() {
  const selectedCount = state.selectedProjects.size;

  const confirmed = confirm(
    `Are you sure you want to delete ${selectedCount} project(s)? This action cannot be undone.`
  );

  if (!confirmed) return;

  const orgId = state.currentOrg?.uuid;
  if (!orgId) {
    alert('No organization selected');
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
    alert(`Deleted ${successCount} project(s). Failed to delete ${failCount} project(s).`);
  } else {
    alert(`Successfully deleted ${successCount} project(s)!`);
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
    alert('No files selected');
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

  alert(`Exported ${selectedFiles.length} file(s) successfully!`);
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

  alert(`Added tags to ${state.selectedFiles.size} file(s)!`);
}

async function bulkDeleteFiles() {
  const selectedCount = state.selectedFiles.size;

  const confirmed = confirm(
    `Are you sure you want to delete ${selectedCount} file(s)? This action cannot be undone.`
  );

  if (!confirmed) return;

  const orgId = state.currentOrg?.uuid;
  if (!orgId) {
    alert('No organization selected');
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
    alert(`Deleted ${successCount} file(s). Failed to delete ${failCount} file(s).`);
  } else {
    alert(`Successfully deleted ${successCount} file(s)!`);
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

  alert(`Successfully exported ${exportData.projects.length} projects, ${exportData.files.length} files, and ${exportData.conversations.length} conversations!`);
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

  alert(`Exported ${state.projects.length} projects, ${state.files.length} files, and ${state.conversations.length} conversations as CSV files!`);
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
  // TODO: Implement filtering logic
  console.log('Filter projects:', filter);
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
      alert(`Invalid project name: ${validationError}`);
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
      alert(`Failed to create project: ${response.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to create project:', error);
    alert('Failed to create project. Please try again.');
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
      alert('Cache cleared! Reloading data...');
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
    alert('Data refreshed successfully!');
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
      alert('Failed to get write permission for the selected directory');
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

    alert('Workspace configured successfully!\n\nNote: You\'ll need to confirm your folder selection each time you sync (browser security requirement). Your browser will remember your choice, so it\'s just a single click.');
  } catch (error) {
    console.error('Failed to setup workspace:', error);
    logSyncActivity('error', `Failed to configure workspace: ${(error as Error).message}`);
    alert(`Failed to setup workspace: ${(error as Error).message}`);
  }
}

/**
 * Execute sync (download or dry-run)
 */
async function syncNow(dryRun: boolean = false) {
  if (state.isSyncing) {
    alert('Sync already in progress');
    return;
  }

  if (!state.currentOrg) {
    alert('No organization selected');
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
        alert('Failed to get write permission for the selected directory');
        return;
      }

      // Store in memory for this session (until dashboard reload)
      state.workspaceHandle = dirHandle;

      // Update status indicator to green
      syncStatusIndicator.style.color = '#48bb78'; // green

      logSyncActivity('success', `Workspace selected: ${dirHandle.name}`);
    } catch (error) {
      console.error('Failed to select workspace:', error);
      alert(`Failed to select workspace: ${(error as Error).message}`);
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

    // Execute sync based on settings
    const result = useBidirectional
      ? await syncManager.bidirectionalSync(
          state.workspaceHandle,
          orgId,
          config.settings.conflictStrategy,
          dryRun
        )
      : await syncManager.downloadSync(
          state.workspaceHandle,
          orgId,
          dryRun
        );

    // Hide progress overlay
    hideSyncProgress();

    // Show results
    if (dryRun) {
      alert(
        `Dry Run Complete!\n\n` +
        `Would create: ${result.stats.created}\n` +
        `Would update: ${result.stats.updated}\n` +
        `Would skip: ${result.stats.skipped}\n` +
        `Errors: ${result.stats.errors}`
      );
    } else {
      const successMessage = result.success
        ? 'Sync completed successfully!'
        : 'Sync completed with errors';

      alert(
        `${successMessage}\n\n` +
        `Created: ${result.stats.created}\n` +
        `Updated: ${result.stats.updated}\n` +
        `Skipped: ${result.stats.skipped}\n` +
        `Errors: ${result.stats.errors}`
      );
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
    alert(`Sync failed: ${(error as Error).message}`);
  } finally {
    state.isSyncing = false;
  }
}

/**
 * View workspace diff
 */
async function viewWorkspaceDiff() {
  if (!state.currentOrg) {
    alert('No organization selected');
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
        alert('Failed to get permission for the selected directory');
        return;
      }

      // Store in memory for this session (until dashboard reload)
      state.workspaceHandle = dirHandle;

      // Update status indicator to green
      syncStatusIndicator.style.color = '#48bb78'; // green

      logSyncActivity('success', `Workspace selected: ${dirHandle.name}`);
    } catch (error) {
      console.error('Failed to select workspace:', error);
      alert(`Failed to select workspace: ${(error as Error).message}`);
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

      const useCache = confirm(
        `A diff was computed ${minutesSince} minute(s) ago.\n\n` +
        `Do you want to view the cached result?\n\n` +
        `Click OK to view cached result, or Cancel to compute a new diff.`
      );

      if (useCache) {
        // Render cached diff
        renderDiffUI(state.lastDiffResult, modalContent, modalOverlay);
        logSyncActivity('info', 'Viewing cached workspace diff');
        return;
      }
    }

    // Show loading
    modalContent.textContent = '';
    modalContent.classList.remove('diff-modal-container'); // Remove class during loading
    const loadingTitle = document.createElement('h2');
    loadingTitle.textContent = 'Computing Diff...';
    const loadingText = document.createElement('p');
    loadingText.textContent = 'Comparing local workspace with Claude.ai...';
    modalContent.appendChild(loadingTitle);
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

    // Validate handle has methods before using it
    if (!state.workspaceHandle || typeof state.workspaceHandle.values !== 'function') {
      throw new Error('Invalid workspace handle. Please close and reopen the dashboard, then try again.');
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
    alert(`Failed to compute diff: ${(error as Error).message}`);
    document.getElementById('modal-overlay')?.classList.add('hidden');
  }
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
      diff.remoteOnly.forEach(p => {
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
      diff.localOnly.forEach(folder => {
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
            const fileItem = document.createElement('div');
            fileItem.className = 'diff-file-item remote-only';
            fileItem.textContent = file;
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
            const fileItem = document.createElement('div');
            fileItem.className = 'diff-file-item local-only';
            fileItem.textContent = file;
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
            const fileItem = document.createElement('div');
            fileItem.className = 'diff-file-item modified';
            fileItem.textContent = file;
            category.appendChild(fileItem);
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
    const inSyncProjects = diff.matched.filter(p => !p.hasDifferences);
    if (inSyncProjects.length > 0) {
      const section = createDiffSection(
        `✅ In Sync (${inSyncProjects.length})`,
        'These projects are identical locally and remotely'
      );
      inSyncProjects.forEach(p => {
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
async function openWorkspaceFolder() {
  if (!state.workspaceHandle) {
    alert('Workspace not configured');
    return;
  }

  // Load config to get workspace path
  const config = await getWorkspaceConfig();
  const workspaceName = config.workspacePath || state.workspaceHandle.name;

  alert(
    `Workspace location: ${workspaceName}\n\n` +
    `Note: Due to browser security restrictions, Chrome extensions cannot:\n` +
    `• Display the full filesystem path\n` +
    `• Directly open the file manager\n\n` +
    `Please navigate to your workspace folder manually.`
  );
}

/**
 * Save sync settings
 */
async function saveSyncSettings() {
  const settings: Partial<SyncSettings> = {
    autoSync: autoSyncEnabledCheckbox.checked,
    syncInterval: parseInt(syncIntervalSelect.value),
    bidirectional: bidirectionalSyncCheckbox.checked,
    syncChats: syncChatsCheckbox.checked,
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
      alert('Failed to load organizations: ' + (response.error || 'Unknown error'));
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
    alert('Failed to load organizations. Please try again.');
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
      alert('Failed to switch organization: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to switch organization:', error);
    alert('Failed to switch organization. Please try again.');
  }
}
