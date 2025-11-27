/**
 * Eidolon Side Panel - Enhanced Claude Assistant
 * Full browser integration with project management
 */

import './style.css';

// ========================================================================
// TYPES
// ========================================================================

interface Tab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
}

interface Project {
  uuid: string;
  name: string;
  description?: string;
  created_at: string;
}

interface Conversation {
  uuid: string;
  name: string;
  updated_at: string;
  project_uuid?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
}

interface Attachment {
  type: 'screenshot' | 'page-content' | 'file';
  name: string;
  content: string;
}

interface AppState {
  currentProject: Project | null;
  currentModel: string;
  messages: Message[];
  conversations: Conversation[];
  projects: Project[];
  tabs: Tab[];
  currentTab: Tab | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  darkMode: boolean;
  attachments: Attachment[];
  currentConversationId: string | null;
}

// Model display names
const MODEL_NAMES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'claude-3-opus-20240229': 'Claude 3 Opus'
};

// ========================================================================
// STATE
// ========================================================================

const state: AppState = {
  currentProject: null,
  currentModel: localStorage.getItem('eidolon-model') || 'claude-3-5-sonnet-20241022',
  messages: [],
  conversations: [],
  projects: [],
  tabs: [],
  currentTab: null,
  isLoading: false,
  isAuthenticated: false,
  darkMode: localStorage.getItem('eidolon-dark-mode') === 'true',
  attachments: [],
  currentConversationId: null
};

// ========================================================================
// DOM ELEMENTS
// ========================================================================

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element not found: ${id}`);
  return el as T;
}

// ========================================================================
// INITIALIZATION
// ========================================================================

async function init() {
  console.log('[Eidolon SidePanel] Initializing...');
  
  // Apply dark mode
  if (state.darkMode) {
    document.body.classList.add('dark-mode');
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Set initial model indicator
  updateModelIndicator();
  
  // Load initial data
  await Promise.all([
    loadProjects(),
    loadConversations(),
    loadTabs(),
    getCurrentTab(),
    checkAuthentication()
  ]);
  
  console.log('[Eidolon SidePanel] Ready!');
}

// ========================================================================
// EVENT LISTENERS
// ========================================================================

function setupEventListeners() {
  // Dashboard button
  const dashboardBtn = getElement('dashboard-btn');
  dashboardBtn.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  });
  
  // Project selector
  const projectSelector = getElement<HTMLSelectElement>('project-selector');
  projectSelector.addEventListener('change', (e) => {
    const uuid = (e.target as HTMLSelectElement).value;
    selectProject(uuid);
  });
  
  // Model selector
  const modelSelector = getElement<HTMLSelectElement>('model-selector');
  modelSelector.value = state.currentModel;
  modelSelector.addEventListener('change', (e) => {
    state.currentModel = (e.target as HTMLSelectElement).value;
    localStorage.setItem('eidolon-model', state.currentModel);
    updateModelIndicator();
  });
  
  // Browser context toggle
  const contextToggle = getElement('context-toggle');
  const browserContext = getElement('browser-context');
  contextToggle.addEventListener('click', () => {
    browserContext.classList.toggle('collapsed');
  });
  
  // History toggle
  const historyToggle = getElement('history-toggle');
  const historyPanel = getElement('conversation-history');
  historyToggle.addEventListener('click', () => {
    historyPanel.classList.toggle('collapsed');
  });
  
  // Browser tools button
  const browserToolsBtn = getElement('browser-tools-btn');
  browserToolsBtn.addEventListener('click', () => {
    const browserContext = getElement('browser-context');
    browserContext.classList.remove('collapsed');
  });
  
  // Settings button
  const settingsBtn = getElement('settings-btn');
  settingsBtn.addEventListener('click', () => {
    togglePanel('settings-panel');
  });
  
  // Close panel buttons
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const panel = (e.target as HTMLElement).closest('.slide-panel');
      if (panel) {
        panel.classList.remove('active');
        panel.classList.add('hidden');
      }
    });
  });
  
  // Capture page button
  const capturePageBtn = getElement('capture-page-btn');
  capturePageBtn.addEventListener('click', capturePage);
  
  // Screenshot button
  const screenshotBtn = getElement('screenshot-btn');
  screenshotBtn.addEventListener('click', takeScreenshot);
  
  // Add to project button
  const addToProjectBtn = getElement('add-to-project-btn');
  addToProjectBtn.addEventListener('click', addCurrentPageToProject);
  
  // Refresh tabs button
  const refreshTabsBtn = getElement('refresh-tabs-btn');
  refreshTabsBtn.addEventListener('click', loadTabs);
  
  // Send message
  const sendBtn = getElement('send-btn');
  const messageInput = getElement<HTMLTextAreaElement>('message-input');
  
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Auto-resize textarea
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  });
  
  // Attach button
  const attachBtn = getElement('attach-btn');
  attachBtn.addEventListener('click', showAttachOptions);
  
  // Inline toolbar buttons
  const captureInlineBtn = getElement('capture-inline-btn');
  captureInlineBtn.addEventListener('click', capturePage);
  
  const screenshotInlineBtn = getElement('screenshot-inline-btn');
  screenshotInlineBtn.addEventListener('click', takeScreenshot);
  
  const newChatBtn = getElement('new-chat-btn');
  newChatBtn.addEventListener('click', startNewChat);
  
  // Quick action buttons
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).dataset.action;
      handleQuickAction(action || '');
    });
  });
  
  // Dark mode toggle
  const darkModeToggle = getElement<HTMLInputElement>('dark-mode-toggle');
  darkModeToggle.checked = state.darkMode;
  darkModeToggle.addEventListener('change', toggleDarkMode);
  
  // Validate session button
  const validateBtn = getElement('validate-session-btn');
  validateBtn.addEventListener('click', validateSession);
  
  // History search
  const historySearchInput = getElement<HTMLInputElement>('history-search-input');
  historySearchInput.addEventListener('input', (e) => {
    filterConversations((e.target as HTMLInputElement).value);
  });
}

// ========================================================================
// DATA LOADING
// ========================================================================

async function loadProjects() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-projects' });
    
    if (response.success && response.data) {
      state.projects = response.data;
      renderProjectSelector();
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load projects:', error);
  }
}

async function loadConversations() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-conversations' });
    
    if (response.success && response.data) {
      state.conversations = response.data.slice(0, 20); // Last 20
      renderConversationList();
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load conversations:', error);
  }
}

async function loadTabs() {
  try {
    const tabs = await browser.tabs.query({ currentWindow: true });
    state.tabs = tabs.map(tab => ({
      id: tab.id!,
      title: tab.title || 'Untitled',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl,
      active: tab.active
    }));
    renderTabList();
  } catch (error) {
    console.error('[Eidolon] Failed to load tabs:', error);
  }
}

async function getCurrentTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      state.currentTab = {
        id: tab.id!,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        active: true
      };
      updateCurrentTabDisplay();
    }
  } catch (error) {
    console.error('[Eidolon] Failed to get current tab:', error);
  }
}

async function checkAuthentication() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'validate-session' });
    state.isAuthenticated = response.success;
    updateAuthStatus();
  } catch (error) {
    console.error('[Eidolon] Auth check failed:', error);
    state.isAuthenticated = false;
    updateAuthStatus();
  }
}

// ========================================================================
// RENDERING
// ========================================================================

function renderProjectSelector() {
  const selector = getElement<HTMLSelectElement>('project-selector');
  selector.innerHTML = '<option value="">No Project</option>';
  
  state.projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.uuid;
    option.textContent = project.name;
    selector.appendChild(option);
  });
}

function renderConversationList() {
  const list = getElement('conversation-list');
  
  if (state.conversations.length === 0) {
    list.innerHTML = '<div class="empty-state">No conversations yet</div>';
    return;
  }
  
  list.innerHTML = state.conversations.map(conv => `
    <div class="conversation-item" data-uuid="${conv.uuid}">
      <div class="conversation-item-title">${escapeHtml(conv.name)}</div>
      <div class="conversation-item-meta">${formatDate(conv.updated_at)}</div>
    </div>
  `).join('');
  
  // Add click handlers
  list.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => {
      const uuid = (item as HTMLElement).dataset.uuid;
      if (uuid) openConversation(uuid);
    });
  });
}

function renderTabList() {
  const list = getElement('tab-list');
  
  if (state.tabs.length === 0) {
    list.innerHTML = '<div class="empty-state">No tabs open</div>';
    return;
  }
  
  list.innerHTML = state.tabs.map(tab => `
    <div class="tab-item ${tab.active ? 'active' : ''}" data-id="${tab.id}">
      <img class="tab-favicon" src="${tab.favIconUrl || '/icon-16.png'}" alt="">
      <span class="tab-title">${escapeHtml(tab.title)}</span>
    </div>
  `).join('');
  
  // Add click handlers
  list.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt((item as HTMLElement).dataset.id || '0');
      if (id) focusTab(id);
    });
  });
}

function updateCurrentTabDisplay() {
  if (!state.currentTab) return;
  
  getElement('current-tab-title').textContent = state.currentTab.title;
  getElement('current-tab-url').textContent = state.currentTab.url;
}

function updateAuthStatus() {
  const statusText = getElement('auth-status-text');
  const statusIcon = document.querySelector('.auth-icon');
  
  if (state.isAuthenticated) {
    statusText.textContent = 'Authenticated';
    if (statusIcon) statusIcon.textContent = '✅';
  } else {
    statusText.textContent = 'Not authenticated';
    if (statusIcon) statusIcon.textContent = '❌';
  }
}

function renderMessages() {
  const messagesArea = getElement('messages');
  
  if (state.messages.length === 0) {
    // Show welcome message
    messagesArea.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">👋</div>
        <h2>Welcome to Eidolon</h2>
        <p>Your enhanced Claude assistant with full browser integration.</p>
        <div class="quick-actions">
          <button class="quick-action-btn" data-action="summarize-page">
            📄 Summarize this page
          </button>
          <button class="quick-action-btn" data-action="analyze-tabs">
            🗂️ Analyze open tabs
          </button>
          <button class="quick-action-btn" data-action="help-browse">
            🌐 Help me browse
          </button>
        </div>
      </div>
    `;
    
    // Re-attach handlers
    messagesArea.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).dataset.action;
        handleQuickAction(action || '');
      });
    });
    return;
  }
  
  messagesArea.innerHTML = state.messages.map(msg => `
    <div class="message ${msg.role}">
      <div class="message-header">
        <span class="message-avatar">${msg.role === 'user' ? '👤' : '🤖'}</span>
        <span>${msg.role === 'user' ? 'You' : 'Claude'}</span>
      </div>
      <div class="message-content">${formatMessageContent(msg.content)}</div>
    </div>
  `).join('');
  
  // Scroll to bottom
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function renderAttachments() {
  const container = getElement('attachments');
  
  if (state.attachments.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = state.attachments.map((att, idx) => `
    <div class="attachment-chip">
      <span>${att.type === 'screenshot' ? '📸' : '📄'} ${escapeHtml(att.name)}</span>
      <button class="attachment-remove" data-index="${idx}">×</button>
    </div>
  `).join('');
  
  // Add remove handlers
  container.querySelectorAll('.attachment-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.index || '0');
      state.attachments.splice(idx, 1);
      renderAttachments();
    });
  });
}

// ========================================================================
// ACTIONS
// ========================================================================

function selectProject(uuid: string) {
  if (!uuid) {
    state.currentProject = null;
    return;
  }
  
  state.currentProject = state.projects.find(p => p.uuid === uuid) || null;
  console.log('[Eidolon] Selected project:', state.currentProject?.name);
}

async function openConversation(uuid: string) {
  console.log('[Eidolon] Opening conversation:', uuid);
  // TODO: Load conversation messages and continue
  showActivity('Loading conversation...');
  
  // For now, just show a message
  setTimeout(() => {
    hideActivity();
  }, 1000);
}

async function focusTab(tabId: number) {
  try {
    await browser.tabs.update(tabId, { active: true });
    await getCurrentTab();
    await loadTabs();
  } catch (error) {
    console.error('[Eidolon] Failed to focus tab:', error);
  }
}

async function capturePage() {
  showActivity('Capturing page content...');
  
  try {
    if (!state.currentTab) {
      throw new Error('No active tab');
    }
    
    // Execute script to get page content
    const results = await browser.scripting.executeScript({
      target: { tabId: state.currentTab.id },
      func: () => {
        return {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText.slice(0, 50000), // Limit to 50k chars
          html: document.documentElement.outerHTML.slice(0, 100000) // Limit to 100k chars
        };
      }
    });
    
    if (results && results[0]?.result) {
      const content = results[0].result;
      state.attachments.push({
        type: 'page-content',
        name: content.title || 'Page Content',
        content: `URL: ${content.url}\n\n${content.text}`
      });
      renderAttachments();
    }
    
    hideActivity();
  } catch (error) {
    console.error('[Eidolon] Failed to capture page:', error);
    hideActivity();
    alert('Failed to capture page content. Make sure the page is accessible.');
  }
}

async function takeScreenshot() {
  showActivity('Taking screenshot...');
  
  try {
    const dataUrl = await browser.tabs.captureVisibleTab();
    
    state.attachments.push({
      type: 'screenshot',
      name: `Screenshot - ${new Date().toLocaleTimeString()}`,
      content: dataUrl
    });
    renderAttachments();
    
    hideActivity();
  } catch (error) {
    console.error('[Eidolon] Failed to take screenshot:', error);
    hideActivity();
    alert('Failed to take screenshot.');
  }
}

async function addCurrentPageToProject() {
  if (!state.currentProject) {
    alert('Please select a project first.');
    return;
  }
  
  showActivity('Adding to project...');
  
  try {
    if (!state.currentTab) {
      throw new Error('No active tab');
    }
    
    // Get page content
    const results = await browser.scripting.executeScript({
      target: { tabId: state.currentTab.id },
      func: () => ({
        title: document.title,
        url: window.location.href,
        text: document.body.innerText
      })
    });
    
    if (results && results[0]?.result) {
      const content = results[0].result;
      const fileName = `${sanitizeFilename(content.title)}.md`;
      const fileContent = `# ${content.title}\n\n**URL:** ${content.url}\n\n---\n\n${content.text}`;
      
      // Upload to project
      const response = await browser.runtime.sendMessage({
        action: 'upload-file',
        projectId: state.currentProject.uuid,
        fileName,
        content: fileContent
      });
      
      if (response.success) {
        hideActivity();
        alert(`Added "${fileName}" to ${state.currentProject.name}`);
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    }
  } catch (error) {
    console.error('[Eidolon] Failed to add to project:', error);
    hideActivity();
    alert('Failed to add page to project.');
  }
}

async function sendMessage() {
  const input = getElement<HTMLTextAreaElement>('message-input');
  const content = input.value.trim();
  
  if (!content && state.attachments.length === 0) return;
  
  // Build message with context
  let fullContent = content;
  
  // Build API attachments from our attachments
  const apiAttachments: any[] = [];
  for (const att of state.attachments) {
    if (att.type === 'page-content') {
      apiAttachments.push({
        extracted_content: att.content,
        file_name: `${att.name}.txt`,
        file_size: att.content.length,
        file_type: 'text/plain'
      });
    } else if (att.type === 'screenshot') {
      // Screenshots need to be handled differently - add as context for now
      fullContent = `${fullContent}\n\n[Screenshot: ${att.name}]`;
    }
  }
  
  // Add user message to state
  const userMessage: Message = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date(),
    attachments: [...state.attachments]
  };
  
  state.messages.push(userMessage);
  state.attachments = [];
  
  // Clear input
  input.value = '';
  input.style.height = 'auto';
  
  // Render
  renderMessages();
  renderAttachments();
  
  // Show activity
  showActivity('Claude is thinking...');
  
  try {
    // Check if we have an active conversation, if not create one
    if (!state.currentConversationId) {
      const convName = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      const createResponse = await browser.runtime.sendMessage({
        action: 'create-conversation',
        name: convName,
        projectUuid: state.currentProject?.uuid
      });
      
      if (!createResponse.success) {
        throw new Error(createResponse.error || 'Failed to create conversation');
      }
      
      state.currentConversationId = createResponse.data.uuid;
      console.log('[Eidolon] Created conversation:', state.currentConversationId);
    }
    
    // Send the message
    const response = await browser.runtime.sendMessage({
      action: 'send-chat-message',
      conversationId: state.currentConversationId,
      message: fullContent,
      attachments: apiAttachments
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to send message');
    }
    
    // Add assistant response
    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: response.data.response || 'No response received',
      timestamp: new Date()
    };
    
    state.messages.push(assistantMessage);
    renderMessages();
    hideActivity();
    
  } catch (error: any) {
    console.error('[Eidolon] Chat error:', error);
    hideActivity();
    
    // Show error in chat
    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `**Error:** ${error.message}\n\nPlease make sure you're logged into Claude.ai and try again.`,
      timestamp: new Date()
    };
    
    state.messages.push(errorMessage);
    renderMessages();
  }
}

async function handleQuickAction(action: string) {
  const input = getElement<HTMLTextAreaElement>('message-input');
  
  switch (action) {
    case 'summarize-page':
      await capturePage();
      input.value = 'Please summarize this page for me.';
      break;
      
    case 'analyze-tabs':
      const tabList = state.tabs.map(t => `- ${t.title}`).join('\n');
      input.value = `I have these tabs open:\n${tabList}\n\nCan you help me organize them or identify what I'm working on?`;
      break;
      
    case 'help-browse':
      input.value = 'I need help with browsing. What can you help me do?';
      break;
  }
  
  input.focus();
}

function showAttachOptions() {
  // Simple for now - just show options
  const choice = confirm('Capture current page content?\n\nClick OK to capture page, Cancel to take screenshot.');
  
  if (choice) {
    capturePage();
  } else {
    takeScreenshot();
  }
}

async function validateSession() {
  showLoading('Validating session...');
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'validate-session' });
    state.isAuthenticated = response.success;
    updateAuthStatus();
    
    if (response.success) {
      await loadProjects();
      await loadConversations();
    }
  } catch (error) {
    console.error('[Eidolon] Session validation failed:', error);
    state.isAuthenticated = false;
    updateAuthStatus();
  }
  
  hideLoading();
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle('dark-mode', state.darkMode);
  localStorage.setItem('eidolon-dark-mode', state.darkMode.toString());
}

function togglePanel(panelId: string) {
  const panel = getElement(panelId);
  const isHidden = panel.classList.contains('hidden');
  
  // Close all panels first
  document.querySelectorAll('.slide-panel').forEach(p => {
    p.classList.add('hidden');
    p.classList.remove('active');
  });
  
  // Open requested panel
  if (isHidden) {
    panel.classList.remove('hidden');
    setTimeout(() => panel.classList.add('active'), 10);
  }
}

function filterConversations(query: string) {
  const list = getElement('conversation-list');
  const items = list.querySelectorAll('.conversation-item');
  
  items.forEach(item => {
    const title = item.querySelector('.conversation-item-title')?.textContent || '';
    const matches = title.toLowerCase().includes(query.toLowerCase());
    (item as HTMLElement).style.display = matches ? '' : 'none';
  });
}

// ========================================================================
// UI HELPERS
// ========================================================================

function showLoading(text: string = 'Loading...') {
  const overlay = getElement('loading-overlay');
  const loadingText = getElement('loading-text');
  loadingText.textContent = text;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = getElement('loading-overlay');
  overlay.classList.add('hidden');
}

function showActivity(text: string) {
  const indicator = getElement('activity-indicator');
  const activityText = getElement('activity-text');
  activityText.textContent = text;
  indicator.classList.remove('hidden');
}

function hideActivity() {
  const indicator = getElement('activity-indicator');
  indicator.classList.add('hidden');
}

function updateModelIndicator() {
  const indicator = getElement('model-indicator');
  indicator.textContent = MODEL_NAMES[state.currentModel] || state.currentModel;
}

function startNewChat() {
  state.currentConversationId = null;
  state.messages = [];
  renderMessages();
  
  // Focus the input
  const input = getElement<HTMLTextAreaElement>('message-input');
  input.focus();
}

// ========================================================================
// UTILITIES
// ========================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function formatMessageContent(content: string): string {
  // Basic markdown-like formatting
  return escapeHtml(content)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

// ========================================================================
// BROWSER EVENT LISTENERS
// ========================================================================

// Listen for tab changes
browser.tabs.onActivated.addListener(async () => {
  await getCurrentTab();
  await loadTabs();
});

// Listen for tab updates
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    await getCurrentTab();
    await loadTabs();
  }
});

// ========================================================================
// START
// ========================================================================

document.addEventListener('DOMContentLoaded', init);
