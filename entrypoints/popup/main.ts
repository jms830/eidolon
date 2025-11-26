import './style.css';

// DOM Elements
const statusBar = document.getElementById('status-bar')!;
const statusText = document.getElementById('status-text')!;
const mainContent = document.getElementById('main-content')!;
const notConnected = document.getElementById('not-connected')!;
const projectsList = document.getElementById('projects-list')!;
const conversationsList = document.getElementById('conversations-list')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const refreshBtn = document.getElementById('refresh-btn')!;
const connectBtn = document.getElementById('connect-btn')!;
const newProjectBtn = document.getElementById('new-project-btn')!;
const newChatBtn = document.getElementById('new-chat-btn')!;
const uploadTextBtn = document.getElementById('upload-text-btn')!;
const uploadPageBtn = document.getElementById('upload-page-btn')!;
const quickChatBtn = document.getElementById('quick-chat-btn')!;

// State
let projects: any[] = [];
let conversations: any[] = [];
let isConnected = false;

// Initialize
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  await checkConnection();
  setupEventListeners();

  if (isConnected) {
    await loadData();
  }

  // Check for pending upload
  const storage = await browser.storage.local.get('pendingUpload');
  if (storage.pendingUpload) {
    handlePendingUpload(storage.pendingUpload);
  }
}

async function checkConnection() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'validate-session' });
    isConnected = response.success;

    if (isConnected) {
      statusBar.classList.add('connected');
      statusText.textContent = 'Connected to Claude.ai';
      mainContent.style.display = 'block';
      notConnected.style.display = 'none';
    } else {
      statusBar.classList.add('error');
      statusText.textContent = 'Not connected';
      mainContent.style.display = 'none';
      notConnected.style.display = 'flex';
    }
  } catch (error) {
    console.error('Connection check failed:', error);
    isConnected = false;
    mainContent.style.display = 'none';
    notConnected.style.display = 'flex';
  }
}

async function loadData() {
  await Promise.all([loadProjects(), loadConversations()]);
}

async function loadProjects() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-projects' });
    if (response.success) {
      projects = response.data;
      renderProjects();
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
  }
}

async function loadConversations() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-conversations' });
    if (response.success) {
      conversations = response.data.slice(0, 5); // Show recent 5
      renderConversations();
    }
  } catch (error) {
    console.error('Failed to load conversations:', error);
  }
}

function renderProjects() {
  // Clear existing content
  projectsList.textContent = '';

  if (projects.length === 0) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.textContent = 'No projects found';
    projectsList.appendChild(loadingDiv);
    return;
  }

  projects.forEach((project) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.setAttribute('data-project-id', project.uuid);

    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = project.name;

    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    meta.textContent = project.description || 'No description';

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener('click', () => openProject(project.uuid));

    projectsList.appendChild(item);
  });
}

function renderConversations() {
  // Clear existing content
  conversationsList.textContent = '';

  if (conversations.length === 0) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.textContent = 'No conversations found';
    conversationsList.appendChild(loadingDiv);
    return;
  }

  conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.setAttribute('data-conversation-id', conv.uuid);

    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = conv.name;

    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    meta.textContent = new Date(conv.updated_at).toLocaleDateString();

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener('click', () => openConversation(conv.uuid));

    conversationsList.appendChild(item);
  });
}

function setupEventListeners() {
  refreshBtn.addEventListener('click', async () => {
    if (isConnected) {
      await loadData();
    }
  });

  connectBtn.addEventListener('click', async () => {
    // Open Claude.ai in new tab
    browser.tabs.create({ url: 'https://claude.ai' });
  });

  const dashboardBtn = document.getElementById('dashboard-btn')!;
  dashboardBtn.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('dashboard.html') });
  });

  const settingsBtn = document.getElementById('settings-btn')!;
  settingsBtn.addEventListener('click', () => {
    showSettingsModal();
  });

  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    filterProjects(query);
  });
}

function filterProjects(query: string) {
  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      (p.description && p.description.toLowerCase().includes(query))
  );

  // Clear and render filtered projects
  projectsList.textContent = '';

  filteredProjects.forEach((project) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.setAttribute('data-project-id', project.uuid);

    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = project.name;

    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    meta.textContent = project.description || 'No description';

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener('click', () => openProject(project.uuid));

    projectsList.appendChild(item);
  });
}

function openProject(projectId: string) {
  browser.tabs.create({ url: `https://claude.ai/project/${projectId}` });
}

function openConversation(conversationId: string) {
  browser.tabs.create({ url: `https://claude.ai/chat/${conversationId}` });
}

async function handlePendingUpload(upload: any) {
  // Show upload dialog
  console.log('Pending upload:', upload);
  // TODO: Implement upload dialog
  await browser.storage.local.remove('pendingUpload');
}

function showSettingsModal() {
  // Create modal overlay
  const overlay = document.createElement('div');
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
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 320px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `;

  const header = document.createElement('h3');
  header.textContent = 'Settings';
  header.style.cssText = 'margin: 0 0 20px; font-size: 18px; font-weight: 600;';

  const content = document.createElement('div');
  content.style.cssText = 'color: #666; font-size: 14px;';

  // Create content elements safely
  const title = document.createElement('p');
  title.style.cssText = 'margin: 0 0 12px;';
  const titleStrong = document.createElement('strong');
  titleStrong.textContent = 'Eidolon Extension';
  title.appendChild(titleStrong);

  const version = document.createElement('p');
  version.style.cssText = 'margin: 0 0 8px;';
  version.textContent = 'Version: 1.0.0';

  const status = document.createElement('p');
  status.style.cssText = 'margin: 0 0 16px;';
  status.textContent = 'Status: ';
  const statusSpan = document.createElement('span');
  statusSpan.textContent = isConnected ? 'Connected' : 'Not Connected';
  statusSpan.style.color = isConnected ? '#48bb78' : '#f56565';
  status.appendChild(statusSpan);

  const openDashboardBtn = document.createElement('button');
  openDashboardBtn.textContent = 'Open Dashboard';
  openDashboardBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 8px;
  `;
  openDashboardBtn.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
    overlay.remove();
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
  `;
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

  content.appendChild(title);
  content.appendChild(version);
  content.appendChild(status);
  content.appendChild(openDashboardBtn);
  content.appendChild(closeBtn);

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
