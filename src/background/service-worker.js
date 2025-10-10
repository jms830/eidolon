import ClaudeAPIClient from '../api/client.js';
import { Organization, Project } from '../api/types.js';

// Global state
let apiClient: ClaudeAPIClient | null = null;
let currentOrg: Organization | null = null;
let sessionKey: string | null = null;

// Session management
async function extractSessionKey(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({
      url: 'https://claude.ai',
      name: 'sessionKey'
    });
    
    if (cookie && cookie.value) {
      return cookie.value;
    }
  } catch (error) {
    console.error('Failed to extract session key:', error);
  }
  return null;
}

async function validateSession(): Promise<boolean> {
  if (!sessionKey) {
    sessionKey = await extractSessionKey();
  }
  
  if (!sessionKey) {
    return false;
  }
  
  try {
    apiClient = new ClaudeAPIClient(sessionKey);
    const orgs = await apiClient.getOrganizations();
    
    if (orgs.length > 0) {
      currentOrg = orgs[0];
      await chrome.storage.local.set({
        sessionKey,
        currentOrg,
        sessionValid: true
      });
      return true;
    }
  } catch (error) {
    console.error('Session validation failed:', error);
    await chrome.storage.local.set({ sessionValid: false });
  }
  
  return false;
}
// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  // Create context menus
  chrome.contextMenus.create({
    id: 'add-to-claude',
    title: 'Add to Claude Project',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'save-page-to-claude',
    title: 'Save Page to Claude Project',
    contexts: ['page']
  });
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const sessionValid = await validateSession();
  
  if (!sessionValid) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon-48.png',
      title: 'Eidolon - Not Connected',
      message: 'Please click the extension icon to connect to Claude.ai'
    });
    return;
  }
  
  if (info.menuItemId === 'add-to-claude' && info.selectionText) {
    // Show project selector popup
    chrome.action.openPopup();
    // Send selected text to popup
    chrome.storage.local.set({ 
      pendingUpload: {
        type: 'text',
        content: info.selectionText,
        source: tab?.url || 'Unknown'
      }
    });
  } else if (info.menuItemId === 'save-page-to-claude') {
    // Extract page content
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'extract-page' });
    }
  }
});
// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'validate-session':
          const isValid = await validateSession();
          sendResponse({ success: isValid });
          break;
          
        case 'get-organizations':
          if (apiClient) {
            const orgs = await apiClient.getOrganizations();
            sendResponse({ success: true, data: orgs });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
          break;
          
        case 'get-projects':
          if (apiClient && currentOrg) {
            const projects = await apiClient.getProjects(currentOrg.uuid);
            sendResponse({ success: true, data: projects });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
          break;
          
        case 'upload-file':
          if (apiClient && currentOrg) {
            const file = await apiClient.uploadFile(
              currentOrg.uuid,
              request.projectId,
              request.fileName,
              request.content
            );
            sendResponse({ success: true, data: file });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
          break;          
        case 'get-project-files':
          if (apiClient && currentOrg) {
            const files = await apiClient.getProjectFiles(
              currentOrg.uuid,
              request.projectId
            );
            sendResponse({ success: true, data: files });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
          break;
          
        case 'create-project':
          if (apiClient && currentOrg) {
            const project = await apiClient.createProject(
              currentOrg.uuid,
              request.name,
              request.description
            );
            sendResponse({ success: true, data: project });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
          break;
          
        case 'get-conversations':
          if (apiClient && currentOrg) {
            const conversations = await apiClient.getConversations(currentOrg.uuid);
            sendResponse({ success: true, data: conversations });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'An error occurred' 
      });
    }
  })();
  
  return true; // Will respond asynchronously
});

// Monitor session cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain === '.claude.ai' && 
      changeInfo.cookie.name === 'sessionKey') {
    if (changeInfo.removed) {
      // Session expired or logged out
      sessionKey = null;
      apiClient = null;
      currentOrg = null;
      chrome.storage.local.set({ sessionValid: false });
    }
  }
});

console.log('Eidolon service worker initialized');