// DOM Elements
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const mainContent = document.getElementById('main-content');
const notConnected = document.getElementById('not-connected');
const projectsList = document.getElementById('projects-list');
const conversationsList = document.getElementById('conversations-list');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const connectBtn = document.getElementById('connect-btn');
const newProjectBtn = document.getElementById('new-project-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const uploadTextBtn = document.getElementById('upload-text-btn');
const uploadPageBtn = document.getElementById('upload-page-btn');
const quickChatBtn = document.getElementById('quick-chat-btn');

// State
let projects = [];
let conversations = [];
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
  const storage = await chrome.storage.local.get('pendingUpload');
  if (storage.pendingUpload) {
    handlePendingUpload(storage.pendingUpload);
  }
}