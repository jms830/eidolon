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
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      // Validate Content-Type before parsing as JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Expected JSON response but got: ${contentType || 'unknown'}`);
      }

      try {
        const data = await response.json();
        return data as T;
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
      }
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

    async createConversation(orgId: string, name: string, projectUuid?: string): Promise<any> {
      const uuid = crypto.randomUUID();
      return this.request<any>(`/organizations/${orgId}/chat_conversations`, {
        method: 'POST',
        body: JSON.stringify({
          uuid,
          name,
          project_uuid: projectUuid || null,
        }),
      });
    }

    async sendMessage(
      orgId: string,
      conversationId: string,
      prompt: string,
      attachments: any[] = [],
      parentMessageUuid: string = '00000000-0000-4000-8000-000000000000',
      model?: string
    ): Promise<Response> {
      // This returns the raw response for streaming
      const url = `${this.baseUrl}/organizations/${orgId}/chat_conversations/${conversationId}/completion`;
      
      const body: any = {
        prompt,
        parent_message_uuid: parentMessageUuid,
        attachments,
        files: [],
        sync_sources: [],
      };
      
      // Add model if specified (Claude.ai uses model parameter in completion requests)
      if (model) {
        body.model = model;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `sessionKey=${this.sessionKey}`,
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Message send failed: ${response.status}`);
      }

      return response;
    }

    async getConversationMessages(orgId: string, conversationId: string): Promise<any> {
      return this.request<any>(
        `/organizations/${orgId}/chat_conversations/${conversationId}?tree=false&rendering_mode=messages`
      );
    }

    /**
     * Get available models for the current organization
     * Claude.ai stores model availability in the organization settings/bootstrap
     */
    async getAvailableModels(orgId: string): Promise<any> {
      try {
        // Try to get settings which may contain model info
        const settings = await this.request<any>(`/organizations/${orgId}/settings`);
        return settings;
      } catch {
        // If settings endpoint doesn't work, return null
        return null;
      }
    }

    /**
     * Get bootstrap/config data which contains available models
     */
    async getBootstrapData(): Promise<any> {
      try {
        const response = await fetch('https://claude.ai/api/bootstrap', {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `sessionKey=${this.sessionKey}`,
          },
          credentials: 'include',
        });
        if (response.ok) {
          return await response.json();
        }
        return null;
      } catch {
        return null;
      }
    }
  }

  // Global state
  let apiClient: ClaudeAPIClient | null = null;
  let currentOrg: Organization | null = null;
  let sessionKey: string | null = null;

  // Initialize session from storage on startup
  async function initializeSession(): Promise<void> {
    try {
      const stored = await browser.storage.local.get(['sessionKey', 'currentOrg', 'sessionValid']);

      if (stored.sessionValid && stored.sessionKey && stored.currentOrg) {
        sessionKey = stored.sessionKey;
        currentOrg = stored.currentOrg;
        apiClient = new ClaudeAPIClient(sessionKey);
        console.log('Session restored from storage');
      } else {
        // Try to extract fresh session key from cookies
        await validateSession();
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  }

  // Call initialization
  initializeSession();

  // Session management
  async function extractSessionKey(): Promise<string | null> {
    try {
      // First check for manually saved session key
      const storage = await browser.storage.local.get('manualSessionKey');
      if (storage.manualSessionKey) {
        console.log('Using manual session key from storage');
        return storage.manualSessionKey;
      }

      // Fall back to cookie extraction - try multiple approaches for Firefox compatibility
      console.log('Attempting to extract sessionKey cookie...');

      // Method 1: Direct cookie.get with exact URL
      let cookie = await browser.cookies.get({
        url: 'https://claude.ai',
        name: 'sessionKey',
      });

      if (cookie && cookie.value) {
        console.log('Found sessionKey via direct get');
        return cookie.value;
      }

      // Method 2: Try with www subdomain
      cookie = await browser.cookies.get({
        url: 'https://www.claude.ai',
        name: 'sessionKey',
      });

      if (cookie && cookie.value) {
        console.log('Found sessionKey via www subdomain');
        return cookie.value;
      }

      // Method 3: Search all cookies for claude.ai domain (Firefox fallback)
      const allCookies = await browser.cookies.getAll({
        domain: 'claude.ai'
      });

      console.log(`Found ${allCookies.length} cookies for claude.ai domain`);

      const sessionCookie = allCookies.find(c => c.name === 'sessionKey');
      if (sessionCookie && sessionCookie.value) {
        console.log('Found sessionKey via domain search');
        return sessionCookie.value;
      }

      // Method 4: Try with .claude.ai domain (with leading dot)
      const allCookiesWithDot = await browser.cookies.getAll({
        domain: '.claude.ai'
      });

      console.log(`Found ${allCookiesWithDot.length} cookies for .claude.ai domain`);

      const sessionCookieWithDot = allCookiesWithDot.find(c => c.name === 'sessionKey');
      if (sessionCookieWithDot && sessionCookieWithDot.value) {
        console.log('Found sessionKey via .domain search');
        return sessionCookieWithDot.value;
      }

      console.warn('No sessionKey cookie found with any method');
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

  // Context menu setup and side panel configuration
  browser.runtime.onInstalled.addListener(() => {
    // Set up side panel to open on action click
    // @ts-ignore - sidePanel API may not be in types yet
    if (browser.sidePanel) {
      // @ts-ignore
      browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error: any) => console.log('Side panel not supported:', error));
    }
    
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
    
    browser.contextMenus.create({
      id: 'open-sidepanel',
      title: 'Open Eidolon Assistant',
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
    } else if (info.menuItemId === 'open-sidepanel' && tab?.id) {
      await openSidePanelForTab(tab.id);
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
            // Ensure session is valid before fetching files
            if (!apiClient || !currentOrg) {
              const isValid = await validateSession();
              if (!isValid) {
                sendResponse({ success: false, error: 'Not authenticated' });
                break;
              }
            }

            try {
              const files = await apiClient!.getProjectFiles(
                currentOrg!.uuid,
                request.projectId
              );
              sendResponse({ success: true, data: files });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message || 'Failed to fetch project files' });
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

          case 'create-conversation':
            if (apiClient && currentOrg) {
              try {
                const conversation = await apiClient.createConversation(
                  currentOrg.uuid,
                  request.name || 'New Chat',
                  request.projectUuid
                );
                sendResponse({ success: true, data: conversation });
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
              }
            } else {
              sendResponse({ success: false, error: 'Not authenticated' });
            }
            break;

          case 'send-chat-message':
            if (apiClient && currentOrg) {
              try {
                const response = await apiClient.sendMessage(
                  currentOrg.uuid,
                  request.conversationId,
                  request.message,
                  request.attachments || [],
                  request.parentMessageUuid,
                  request.model // Pass model from side panel
                );
                
                // Read streaming response
                const reader = response.body?.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';
                
                if (reader) {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value);
                    fullResponse += chunk;
                  }
                }
                
                // Parse the streamed response - Claude returns event-stream format
                const lines = fullResponse.split('\n');
                let assistantMessage = '';
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.completion) {
                        assistantMessage += data.completion;
                      }
                    } catch (e) {
                      // Ignore parse errors for non-JSON lines
                    }
                  }
                }
                
                sendResponse({ success: true, data: { response: assistantMessage || fullResponse } });
              } catch (error: any) {
                console.error('Chat message error:', error);
                sendResponse({ success: false, error: error.message });
              }
            } else {
              sendResponse({ success: false, error: 'Not authenticated' });
            }
            break;

          case 'get-conversation-messages':
            if (apiClient && currentOrg) {
              try {
                const messages = await apiClient.getConversationMessages(
                  currentOrg.uuid,
                  request.conversationId
                );
                sendResponse({ success: true, data: messages });
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
              }
            } else {
              sendResponse({ success: false, error: 'Not authenticated' });
            }
            break;

          case 'get-available-models':
            if (apiClient) {
              try {
                // Try to get models from bootstrap data
                const bootstrap = await apiClient.getBootstrapData();
                if (bootstrap?.account?.models || bootstrap?.models) {
                  sendResponse({ success: true, data: bootstrap.account?.models || bootstrap.models });
                } else {
                  // Return default models if bootstrap doesn't have them
                  sendResponse({ success: true, data: null });
                }
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
              }
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
            // Validate sender is from extension pages, not content scripts
            // Check if request is from an extension page (chrome-extension://) vs external page
            const isExtensionPage = sender.url?.startsWith(browser.runtime.getURL(''));
            if (!isExtensionPage) {
              console.warn('Session key requested from non-extension page - denied');
              sendResponse({ success: false, error: 'Unauthorized access' });
              break;
            }

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
                // Ensure API client is initialized before making requests
                if (!apiClient) {
                  sendResponse({ success: false, error: 'API client not initialized. Please validate session first.' });
                  break;
                }

                const orgs = await apiClient.getOrganizations();
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

          case 'save-manual-session':
            // Save manually entered session key
            if (request.sessionKey && typeof request.sessionKey === 'string') {
              try {
                const sessionKeyValue = request.sessionKey.trim();

                // Store in local storage
                await browser.storage.local.set({
                  manualSessionKey: sessionKeyValue
                });

                // CRITICAL: Set the sessionKey cookie in the browser's cookie store
                // This allows the browser to automatically include it in requests to claude.ai
                try {
                  const cookieDetails = {
                    url: 'https://claude.ai',
                    name: 'sessionKey',
                    value: sessionKeyValue,
                    domain: '.claude.ai', // Use leading dot for domain-wide cookie
                    path: '/',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'lax' as 'lax' // Use 'lax' instead of 'no_restriction' for Firefox
                  };

                  console.log('Setting cookie with details:', {
                    domain: cookieDetails.domain,
                    path: cookieDetails.path,
                    sameSite: cookieDetails.sameSite
                  });

                  await browser.cookies.set(cookieDetails);

                  console.log('Manual session key cookie set successfully');

                  // Verify the cookie was set - try multiple methods
                  let verifyCookie = await browser.cookies.get({
                    url: 'https://claude.ai',
                    name: 'sessionKey'
                  });

                  if (!verifyCookie) {
                    // Try getting all cookies to see what was actually set
                    const allCookies = await browser.cookies.getAll({ domain: '.claude.ai' });
                    const sessionCookie = allCookies.find(c => c.name === 'sessionKey');
                    if (sessionCookie) {
                      console.log('Cookie found via getAll. Details:', {
                        domain: sessionCookie.domain,
                        path: sessionCookie.path,
                        secure: sessionCookie.secure,
                        sameSite: sessionCookie.sameSite
                      });
                      verifyCookie = sessionCookie;
                    }
                  }

                  console.log('Verified cookie:', verifyCookie ? `EXISTS (domain: ${verifyCookie.domain})` : 'NOT FOUND');

                } catch (cookieError: any) {
                  console.error('Failed to set cookie:', cookieError);
                  sendResponse({ success: false, error: `Cookie error: ${cookieError.message}` });
                  return;
                }

                console.log('Manual session key saved and cookie set');

                // Clear existing session to force re-validation with new key
                sessionKey = sessionKeyValue; // Set it directly instead of clearing
                apiClient = null;

                sendResponse({ success: true });
              } catch (error: any) {
                console.error('Failed to save manual session key:', error);
                sendResponse({ success: false, error: error.message || 'Failed to save session key' });
              }
            } else {
              sendResponse({ success: false, error: 'Session key is required' });
            }
            break;

          // ================================================================
          // BROWSER INTERACTION TOOLS
          // ================================================================
          
          case 'browser-take-screenshot':
            // Take a screenshot of the current tab using CDP
            try {
              const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!tab?.id) {
                sendResponse({ success: false, error: 'No active tab' });
                break;
              }
              
              // Attach debugger and capture screenshot
              await chrome.debugger.attach({ tabId: tab.id }, '1.3');
              try {
                const result = await chrome.debugger.sendCommand(
                  { tabId: tab.id },
                  'Page.captureScreenshot',
                  { format: request.format || 'png', quality: request.quality || 80 }
                );
                sendResponse({ 
                  success: true, 
                  data: { 
                    screenshot: `data:image/${request.format || 'png'};base64,${(result as any).data}` 
                  } 
                });
              } finally {
                await chrome.debugger.detach({ tabId: tab.id }).catch(() => {});
              }
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'browser-get-accessibility-tree':
            // Get the accessibility tree from the current tab
            try {
              const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!tab?.id) {
                sendResponse({ success: false, error: 'No active tab' });
                break;
              }
              
              const results = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                  return (window as any).__generateAccessibilityTree?.(10, false) || null;
                }
              });
              
              sendResponse({ success: true, data: results[0]?.result });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'browser-execute-action':
            // Execute a browser action (click, type, scroll, etc.)
            try {
              const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!tab?.id) {
                sendResponse({ success: false, error: 'No active tab' });
                break;
              }
              
              const action = request.action;
              if (!action || !action.type) {
                sendResponse({ success: false, error: 'Action type required' });
                break;
              }
              
              // Handle different action types
              switch (action.type) {
                case 'click':
                case 'left_click': {
                  await chrome.debugger.attach({ tabId: tab.id }, '1.3');
                  try {
                    // Get coordinates from ref or use provided coordinates
                    let x = action.x, y = action.y;
                    if (action.target) {
                      const coordResults = await browser.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (ref: string) => {
                          const bounds = (window as any).__getBoundsByRef?.(ref);
                          if (!bounds) return null;
                          return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
                        },
                        args: [action.target]
                      });
                      const coords = coordResults[0]?.result;
                      if (!coords) {
                        sendResponse({ success: false, error: `Element not found: ${action.target}` });
                        break;
                      }
                      x = coords.x;
                      y = coords.y;
                    }
                    
                    // Click
                    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', {
                      type: 'mousePressed', x, y, button: 'left', clickCount: 1
                    });
                    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', {
                      type: 'mouseReleased', x, y, button: 'left', clickCount: 1
                    });
                    
                    sendResponse({ success: true, data: { x, y } });
                  } finally {
                    await chrome.debugger.detach({ tabId: tab.id }).catch(() => {});
                  }
                  break;
                }
                
                case 'type': {
                  await chrome.debugger.attach({ tabId: tab.id }, '1.3');
                  try {
                    if (action.target) {
                      // Focus element first
                      await browser.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (ref: string) => (window as any).__focusRef?.(ref),
                        args: [action.target]
                      });
                    }
                    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.insertText', {
                      text: action.value || ''
                    });
                    sendResponse({ success: true });
                  } finally {
                    await chrome.debugger.detach({ tabId: tab.id }).catch(() => {});
                  }
                  break;
                }
                
                case 'scroll': {
                  await chrome.debugger.attach({ tabId: tab.id }, '1.3');
                  try {
                    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Input.dispatchMouseEvent', {
                      type: 'mouseWheel',
                      x: action.x || 100,
                      y: action.y || 100,
                      deltaX: action.deltaX || 0,
                      deltaY: action.deltaY || 0
                    });
                    sendResponse({ success: true });
                  } finally {
                    await chrome.debugger.detach({ tabId: tab.id }).catch(() => {});
                  }
                  break;
                }
                
                case 'navigate': {
                  let url = action.value || '';
                  if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                  }
                  await browser.tabs.update(tab.id, { url });
                  sendResponse({ success: true, data: { url } });
                  break;
                }
                
                default:
                  sendResponse({ success: false, error: `Unknown action type: ${action.type}` });
              }
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'browser-get-tabs':
            // Get information about open tabs
            try {
              const tabs = await browser.tabs.query({ currentWindow: true });
              sendResponse({ 
                success: true, 
                data: tabs.map(t => ({
                  id: t.id,
                  url: t.url,
                  title: t.title,
                  active: t.active,
                  groupId: t.groupId
                }))
              });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'browser-create-tab-group':
            // Create a new tab group
            try {
              const tabIds = request.tabIds || [];
              if (tabIds.length === 0) {
                const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
                if (activeTab?.id) tabIds.push(activeTab.id);
              }
              
              if (tabIds.length === 0) {
                sendResponse({ success: false, error: 'No tabs to group' });
                break;
              }
              
              const groupId = await chrome.tabs.group({ tabIds });
              await chrome.tabGroups.update(groupId, {
                title: request.title || 'Eidolon Session',
                color: request.color || 'orange'
              });
              
              sendResponse({ success: true, data: { groupId } });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'show-agent-indicator':
            // Show the agent indicator on the current tab
            try {
              const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (tab?.id) {
                await browser.tabs.sendMessage(tab.id, {
                  type: 'SHOW_AGENT_INDICATOR',
                  message: request.message || 'Eidolon is working...'
                });
              }
              sendResponse({ success: true });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'hide-agent-indicator':
            // Hide the agent indicator
            try {
              const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (tab?.id) {
                await browser.tabs.sendMessage(tab.id, { type: 'HIDE_AGENT_INDICATOR' });
              }
              sendResponse({ success: true });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
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

  // Official-like side panel open helper (per-tab path)
  async function openSidePanelForTab(tabId: number, opts?: { prompt?: string; model?: string }) {
    // @ts-ignore - sidePanel API may not be in types yet
    if (!browser.sidePanel) return;
    const modelParam = opts?.model ? `&model=${encodeURIComponent(opts.model)}` : '';
    const path = `sidepanel.html?tabId=${encodeURIComponent(String(tabId))}${modelParam}`;
    try {
      // @ts-ignore
      await browser.sidePanel.setOptions({ tabId, path, enabled: true });
      // @ts-ignore
      await browser.sidePanel.open({ tabId });
      if (opts?.prompt) {
        // Allow panel to mount before populating
        setTimeout(() => {
          browser.runtime.sendMessage({ type: 'POPULATE_INPUT_TEXT', prompt: opts.prompt }).catch(() => {});
        }, 800);
      }
    } catch (e) {
      console.log('Failed to open side panel:', e);
    }
  }

  // Open panel on action click using per-tab options
  (browser.action ?? browser.browserAction)?.onClicked.addListener(async (tab) => {
    if (tab.id != null) await openSidePanelForTab(tab.id);
  });

  // Toggle command (matches official)
  // @ts-ignore - commands may not be typed in all envs
  browser.commands?.onCommand.addListener(async (cmd: string) => {
    if (cmd === 'toggle-side-panel') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id != null) await openSidePanelForTab(tab.id);
    }
  });

  // Internal message to open panel (action or type)
  browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req?.type === 'open_side_panel' || req?.action === 'open-side-panel') {
      (async () => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id != null) await openSidePanelForTab(tab.id, { prompt: req.prompt, model: req.model });
        sendResponse({ success: true });
      })();
      return true;
    }
    return false;
  });

  // Allow claude.ai to open the panel (externally_connectable)
  browser.runtime.onMessageExternal.addListener((req, sender, sendResponse) => {
    if (req?.type === 'open_side_panel') {
      (async () => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id != null) await openSidePanelForTab(tab.id, { prompt: req.prompt, model: req.model });
        sendResponse({ success: true });
      })();
      return true;
    }
    return false;
  });

  console.log('Eidolon service worker initialized');
});
