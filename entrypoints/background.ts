export default defineBackground(() => {
  // Import types
  type Organization = {
    uuid: string;
    name: string;
    capabilities: string[];
  };

  class ClaudeAPIClient {
    private baseUrl = 'https://claude.ai/api';
    private sessionKey: string;
    private rateLimitDelay = 1000;
    private maxRetries = 3;

    constructor(sessionKey: string) {
      this.sessionKey = sessionKey;
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
      const url = `${this.baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        'Cookie': `sessionKey=${this.sessionKey}`,
        ...options.headers,
      };

      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return await response.json() as T;
    }

    async getOrganizations(): Promise<Organization[]> {
      return this.request<Organization[]>('/organizations');
    }

    async getProjects(orgId: string): Promise<any[]> {
      return this.request<any[]>(`/organizations/${orgId}/projects`);
    }

    async getProjectFiles(orgId: string, projectId: string): Promise<any[]> {
      return this.request<any[]>(`/organizations/${orgId}/projects/${projectId}/docs`);
    }

    async uploadFile(
      orgId: string,
      projectId: string,
      fileName: string,
      content: string
    ): Promise<any> {
      return this.request<any>(
        `/organizations/${orgId}/projects/${projectId}/docs`,
        {
          method: 'POST',
          body: JSON.stringify({ file_name: fileName, content }),
        }
      );
    }

    async createProject(orgId: string, name: string, description?: string): Promise<any> {
      return this.request<any>(`/organizations/${orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name, description, is_private: true }),
      });
    }

    async getConversations(orgId: string): Promise<any[]> {
      return this.request<any[]>(`/organizations/${orgId}/chat_conversations`);
    }
  }

  // Global state
  let apiClient: ClaudeAPIClient | null = null;
  let currentOrg: Organization | null = null;
  let sessionKey: string | null = null;

  // Session management
  async function extractSessionKey(): Promise<string | null> {
    try {
      const cookie = await browser.cookies.get({
        url: 'https://claude.ai',
        name: 'sessionKey',
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
        await browser.storage.local.set({
          sessionKey,
          currentOrg,
          sessionValid: true,
        });
        return true;
      }
    } catch (error) {
      console.error('Session validation failed:', error);
      await browser.storage.local.set({ sessionValid: false });
    }

    return false;
  }

  // Context menu setup
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'add-to-claude',
      title: 'Add to Claude Project',
      contexts: ['selection'],
    });

    browser.contextMenus.create({
      id: 'save-page-to-claude',
      title: 'Save Page to Claude Project',
      contexts: ['page'],
    });
  });

  // Context menu click handler
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const sessionValid = await validateSession();

    if (!sessionValid) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: '/icon-48.png',
        title: 'Eidolon - Not Connected',
        message: 'Please click the extension icon to connect to Claude.ai',
      });
      return;
    }

    if (info.menuItemId === 'add-to-claude' && info.selectionText) {
      (browser.action ?? browser.browserAction)?.openPopup();
      browser.storage.local.set({
        pendingUpload: {
          type: 'text',
          content: info.selectionText,
          source: tab?.url || 'Unknown',
        },
      });
    } else if (info.menuItemId === 'save-page-to-claude' && tab?.id) {
      browser.tabs.sendMessage(tab.id, { action: 'extract-page' });
    }
  });

  // Message handler
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

          case 'store-pending-upload':
            await browser.storage.local.set({
              pendingUpload: request.data
            });
            sendResponse({ success: true });
            break;

          case 'open-popup':
            try {
              await (browser.action ?? browser.browserAction)?.openPopup();
              sendResponse({ success: true });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;

          // Sync API access (actual sync logic runs in dashboard with File System Access API)
          case 'get-current-org':
            if (currentOrg) {
              sendResponse({ success: true, data: currentOrg });
            } else {
              sendResponse({ success: false, error: 'No organization selected' });
            }
            break;

          case 'get-api-client-session':
            if (sessionKey && currentOrg) {
              sendResponse({
                success: true,
                data: {
                  sessionKey,
                  orgId: currentOrg.uuid,
                },
              });
            } else {
              sendResponse({ success: false, error: 'Not authenticated' });
            }
            break;

          case 'set-current-org':
            if (request.orgId) {
              try {
                const orgs = await apiClient?.getOrganizations();
                const selectedOrg = orgs?.find((org: Organization) => org.uuid === request.orgId);
                if (selectedOrg) {
                  currentOrg = selectedOrg;
                  await browser.storage.local.set({ currentOrg });
                  sendResponse({ success: true, data: currentOrg });
                } else {
                  sendResponse({ success: false, error: 'Organization not found' });
                }
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
              }
            } else {
              sendResponse({ success: false, error: 'Organization ID required' });
            }
            break;

          default:
            sendResponse({ success: false, error: 'Unknown action' });
        }
      } catch (error: any) {
        console.error('Message handler error:', error);
        sendResponse({
          success: false,
          error: error.message || 'An error occurred',
        });
      }
    })();

    return true; // Will respond asynchronously
  });

  // Monitor session cookie changes
  browser.cookies.onChanged.addListener((changeInfo) => {
    if (
      changeInfo.cookie.domain === '.claude.ai' &&
      changeInfo.cookie.name === 'sessionKey'
    ) {
      if (changeInfo.removed) {
        sessionKey = null;
        apiClient = null;
        currentOrg = null;
        browser.storage.local.set({ sessionValid: false });
      }
    }
  });

  console.log('Eidolon service worker initialized');
});
