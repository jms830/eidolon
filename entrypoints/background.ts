export default defineBackground(() => {
  // ========================================================================
  // DEBUG MODE - Toggle via sidepanel settings or chrome.storage
  // ========================================================================
  let DEBUG_MODE = false;
  
  // Initialize debug mode from storage
  chrome.storage.local.get(['eidolon_debug_mode'], (result) => {
    DEBUG_MODE = result.eidolon_debug_mode === true;
    if (DEBUG_MODE) console.log('[Eidolon] Debug mode enabled');
  });
  
  // Listen for debug mode changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.eidolon_debug_mode) {
      DEBUG_MODE = changes.eidolon_debug_mode.newValue === true;
      console.log('[Eidolon] Debug mode:', DEBUG_MODE ? 'ON' : 'OFF');
    }
  });
  
  // Debug logging helper - only logs when DEBUG_MODE is true
  function debugLog(...args: any[]) {
    if (DEBUG_MODE) console.log(...args);
  }
  
  function debugGroup(label: string) {
    if (DEBUG_MODE) console.group(label);
  }
  
  function debugGroupEnd() {
    if (DEBUG_MODE) console.groupEnd();
  }
  
  // Import types
  type Organization = {
    uuid: string;
    name: string;
    capabilities: string[];
  };

  // Helper to extract model family (haiku, sonnet, opus)
  function extractModelFamily(nameOrId: string): string | null {
    const lower = nameOrId.toLowerCase();
    if (lower.includes('haiku')) return 'haiku';
    if (lower.includes('sonnet')) return 'sonnet';
    if (lower.includes('opus')) return 'opus';
    return null;
  }

  // Helper to extract version number for sorting (higher = newer)
  function extractModelVersion(nameOrId: string): number {
    // Look for patterns like "4.5", "4", "3.5", "3"
    const match = nameOrId.match(/(\d+)\.?(\d*)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = match[2] ? parseInt(match[2], 10) : 0;
      return major * 100 + minor; // e.g., 4.5 = 450, 4 = 400, 3.5 = 350
    }
    return 0;
  }

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
      
      // MV3 service workers require explicit Cookie header since credentials: 'include' 
      // doesn't work reliably in service worker context
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cookie': `sessionKey=${this.sessionKey}`,
        ...(options.headers as Record<string, string>),
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

    async getStyles(orgId: string): Promise<{ default: any[]; custom: any[] }> {
      return this.request<{ default: any[]; custom: any[] }>(`/organizations/${orgId}/list_styles`);
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
      model?: string,
      personalizedStyles?: any[]
    ): Promise<Response> {
      // This returns the raw response for streaming
      const url = `${this.baseUrl}/organizations/${orgId}/chat_conversations/${conversationId}/completion`;
      
      const body: any = {
        prompt,
        parent_message_uuid: parentMessageUuid,
        attachments,
        files: [],
        sync_sources: [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        rendering_mode: 'messages',
      };
      
      // Add model if specified (Claude.ai uses model parameter in completion requests)
      if (model) {
        body.model = model;
      }
      
      // Add personalized styles if specified
      if (personalizedStyles && personalizedStyles.length > 0) {
        body.personalized_styles = personalizedStyles;
      }
      
      // Log full request body for debugging
      debugLog('│  ├─ Full request body:', JSON.stringify(body).substring(0, 500));
      
      debugLog('│  📤 API Request:');
      debugLog('│  ├─ URL:', url);
      debugLog('│  ├─ sessionKey:', this.sessionKey ? `yes (${this.sessionKey.length} chars)` : 'NO!');
      debugLog('│  ├─ prompt length:', body.prompt?.length);
      debugLog('│  ├─ model:', body.model || '(default)');
      debugLog('│  └─ body keys:', Object.keys(body));
      
      // Service workers can't set Cookie header directly, so we rely on credentials: 'include'
      // The browser should automatically include cookies for claude.ai domain
      debugLog('│  ├─ Making request with credentials:include');
      debugLog('│  ├─ sessionKey available:', !!this.sessionKey);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        credentials: 'include',  // This should include cookies automatically
        body: JSON.stringify(body),
      });

      debugLog('│  📥 API Response:');
      debugLog('│  ├─ status:', response.status);
      debugLog('│  ├─ statusText:', response.statusText);
      debugLog('│  ├─ headers:', Object.fromEntries(response.headers.entries()));
      debugLog('│  └─ body exists:', !!response.body);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Could not read error body');
        console.error('[API] Error response:', errorText);
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

  // ========================================================================
  // ACCOUNT MANAGEMENT
  // ========================================================================

  // Types for account management (duplicated from utils/api/types.ts for background script)
  interface EidolonAccount {
    id: string;
    name: string;
    email?: string;
    type: 'work' | 'personal';
    color: string;
    sessionKey: string;
    organizationId?: string;
    organizationName?: string;
    createdAt: string;
    lastUsedAt: string;
    isActive: boolean;
  }

  interface AccountsStorage {
    accounts: EidolonAccount[];
    activeAccountId: string | null;
    version: number;
  }

  const ACCOUNT_COLORS = [
    '#E07850', '#3B82F6', '#10B981', '#8B5CF6',
    '#F59E0B', '#EC4899', '#06B6D4', '#EF4444',
  ];

  const ACCOUNTS_STORAGE_KEY = 'eidolon_accounts';

  /**
   * Get all saved accounts from storage
   */
  async function getAccounts(): Promise<AccountsStorage> {
    const result = await browser.storage.local.get(ACCOUNTS_STORAGE_KEY);
    const stored = result[ACCOUNTS_STORAGE_KEY] as AccountsStorage | undefined;
    
    if (!stored) {
      return { accounts: [], activeAccountId: null, version: 1 };
    }
    
    return stored;
  }

  /**
   * Save accounts to storage
   */
  async function saveAccounts(data: AccountsStorage): Promise<void> {
    await browser.storage.local.set({ [ACCOUNTS_STORAGE_KEY]: data });
  }

  /**
   * Get a random account color that isn't already used
   */
  function getNextAccountColor(existingAccounts: EidolonAccount[]): string {
    const usedColors = new Set(existingAccounts.map(a => a.color));
    const availableColors = ACCOUNT_COLORS.filter(c => !usedColors.has(c));
    
    if (availableColors.length > 0) {
      return availableColors[0];
    }
    
    // If all colors are used, pick one randomly
    return ACCOUNT_COLORS[Math.floor(Math.random() * ACCOUNT_COLORS.length)];
  }

  /**
   * Auto-save or update the current session as an account
   * Called after successful session validation
   */
  async function autoSaveAccount(
    sessionKeyValue: string,
    org: Organization
  ): Promise<EidolonAccount | null> {
    try {
      const storage = await getAccounts();
      const now = new Date().toISOString();
      
      // Check if an account with this sessionKey already exists
      const existingIndex = storage.accounts.findIndex(
        a => a.sessionKey === sessionKeyValue
      );
      
      if (existingIndex >= 0) {
        // Update existing account's lastUsedAt and org info
        storage.accounts[existingIndex].lastUsedAt = now;
        storage.accounts[existingIndex].organizationId = org.uuid;
        storage.accounts[existingIndex].organizationName = org.name;
        storage.accounts[existingIndex].isActive = true;
        
        // Deactivate other accounts
        storage.accounts.forEach((a, i) => {
          if (i !== existingIndex) a.isActive = false;
        });
        
        storage.activeAccountId = storage.accounts[existingIndex].id;
        await saveAccounts(storage);
        
        debugLog('[Accounts] Updated existing account:', storage.accounts[existingIndex].name);
        return storage.accounts[existingIndex];
      }
      
      // Create new account
      const newAccount: EidolonAccount = {
        id: crypto.randomUUID(),
        name: org.name || `Account ${storage.accounts.length + 1}`,
        email: undefined, // Could extract from Claude.ai profile API if available
        type: 'personal',
        color: getNextAccountColor(storage.accounts),
        sessionKey: sessionKeyValue,
        organizationId: org.uuid,
        organizationName: org.name,
        createdAt: now,
        lastUsedAt: now,
        isActive: true,
      };
      
      // Deactivate other accounts
      storage.accounts.forEach(a => { a.isActive = false; });
      
      storage.accounts.push(newAccount);
      storage.activeAccountId = newAccount.id;
      await saveAccounts(storage);
      
      debugLog('[Accounts] Auto-saved new account:', newAccount.name);
      return newAccount;
    } catch (error) {
      console.error('[Accounts] Failed to auto-save account:', error);
      return null;
    }
  }

  /**
   * Switch to a different account by ID
   * Sets the sessionKey cookie and reloads Claude tabs
   */
  async function switchToAccount(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const storage = await getAccounts();
      const account = storage.accounts.find(a => a.id === accountId);
      
      if (!account) {
        return { success: false, error: 'Account not found' };
      }
      
      // First, remove the existing sessionKey cookie
      await browser.cookies.remove({
        url: 'https://claude.ai',
        name: 'sessionKey'
      });
      
      // Set the new sessionKey cookie
      const oneYearFromNow = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
      
      await browser.cookies.set({
        url: 'https://claude.ai',
        name: 'sessionKey',
        value: account.sessionKey,
        domain: '.claude.ai',
        path: '/',
        secure: true,
        httpOnly: true, // Match how Claude sets it
        sameSite: 'lax' as const,
        expirationDate: oneYearFromNow
      });
      
      // Update in-memory state
      sessionKey = account.sessionKey;
      apiClient = new ClaudeAPIClient(sessionKey);
      
      // Validate the new session
      try {
        const orgs = await apiClient.getOrganizations();
        if (orgs.length > 0) {
          currentOrg = orgs[0];
          
          // Update storage
          storage.accounts.forEach(a => { a.isActive = a.id === accountId; });
          storage.activeAccountId = accountId;
          
          // Update lastUsedAt
          const accountIndex = storage.accounts.findIndex(a => a.id === accountId);
          if (accountIndex >= 0) {
            storage.accounts[accountIndex].lastUsedAt = new Date().toISOString();
            storage.accounts[accountIndex].organizationId = currentOrg.uuid;
            storage.accounts[accountIndex].organizationName = currentOrg.name;
          }
          
          await saveAccounts(storage);
          await browser.storage.local.set({
            sessionKey,
            currentOrg,
            sessionValid: true
          });
          
          // Reload Claude.ai tabs to reflect the account change
          const claudeTabs = await browser.tabs.query({ url: '*://claude.ai/*' });
          for (const tab of claudeTabs) {
            if (tab.id) {
              browser.tabs.reload(tab.id).catch(() => {});
            }
          }
          
          debugLog('[Accounts] Switched to account:', account.name);
          return { success: true };
        } else {
          return { success: false, error: 'Session validation failed - no organizations found' };
        }
      } catch (validationError: any) {
        // Session is invalid/expired
        return { success: false, error: `Session expired or invalid: ${validationError.message}` };
      }
    } catch (error: any) {
      console.error('[Accounts] Switch failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete an account by ID
   */
  async function deleteAccount(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const storage = await getAccounts();
      const accountIndex = storage.accounts.findIndex(a => a.id === accountId);
      
      if (accountIndex < 0) {
        return { success: false, error: 'Account not found' };
      }
      
      const wasActive = storage.accounts[accountIndex].isActive;
      storage.accounts.splice(accountIndex, 1);
      
      // If we deleted the active account, clear the active ID
      if (wasActive || storage.activeAccountId === accountId) {
        storage.activeAccountId = storage.accounts[0]?.id || null;
        if (storage.accounts[0]) {
          storage.accounts[0].isActive = true;
        }
      }
      
      await saveAccounts(storage);
      
      debugLog('[Accounts] Deleted account:', accountId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update an account's metadata (name, type, color)
   */
  async function updateAccount(
    accountId: string,
    updates: Partial<Pick<EidolonAccount, 'name' | 'type' | 'color'>>
  ): Promise<{ success: boolean; error?: string; account?: EidolonAccount }> {
    try {
      const storage = await getAccounts();
      const accountIndex = storage.accounts.findIndex(a => a.id === accountId);
      
      if (accountIndex < 0) {
        return { success: false, error: 'Account not found' };
      }
      
      // Apply updates
      if (updates.name !== undefined) {
        storage.accounts[accountIndex].name = updates.name;
      }
      if (updates.type !== undefined) {
        storage.accounts[accountIndex].type = updates.type;
      }
      if (updates.color !== undefined) {
        storage.accounts[accountIndex].color = updates.color;
      }
      
      await saveAccounts(storage);
      
      return { success: true, account: storage.accounts[accountIndex] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the effective tab ID, validating it's in the same group as the current tab.
   * Like official Claude extension - only allows operating on tabs in the same group.
   */
  async function getEffectiveTabId(requestedTabId: number | undefined, currentTabId: number): Promise<number> {
    // If no specific tab requested, use current tab
    if (requestedTabId === undefined) {
      return currentTabId;
    }
    
    // If same tab, just return it
    if (requestedTabId === currentTabId) {
      return currentTabId;
    }
    
    // Validate the requested tab is in the same group as current tab
    try {
      const currentTab = await browser.tabs.get(currentTabId);
      const requestedTab = await browser.tabs.get(requestedTabId);
      
      // If current tab is not in a group, only allow operating on current tab
      if (!currentTab.groupId || currentTab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        throw new Error(`Tab ${requestedTabId} is not accessible. No tab group is active.`);
      }
      
      // Check if requested tab is in the same group
      if (requestedTab.groupId !== currentTab.groupId) {
        // Get valid tab IDs for error message
        const allTabs = await browser.tabs.query({ currentWindow: true });
        const validTabIds = allTabs
          .filter(t => t.groupId === currentTab.groupId && t.id !== undefined)
          .map(t => t.id);
        throw new Error(`Tab ${requestedTabId} is not in the same group as the current tab. Valid tab IDs are: ${validTabIds.join(', ')}`);
      }
      
      return requestedTabId;
    } catch (error: any) {
      if (error.message.includes('not in the same group') || error.message.includes('not accessible')) {
        throw error;
      }
      throw new Error(`Tab ${requestedTabId} not found or not accessible`);
    }
  }
  
  /**
   * Hide indicator before tool use (like official extension)
   */
  async function hideIndicatorForToolUse(tabId: number): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, { type: 'HIDE_AGENT_INDICATOR' });
      // Small delay to ensure indicator is hidden before action
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch {
      // Ignore errors - indicator may not be shown
    }
  }

  // Initialize session from storage on startup
  async function initializeSession(): Promise<void> {
    try {
      // Always try to get a fresh session from cookies first
      // This ensures we're using the current logged-in session
      const freshSessionKey = await extractSessionKey();
      
      if (freshSessionKey) {
        sessionKey = freshSessionKey;
        apiClient = new ClaudeAPIClient(sessionKey);
        
        // Validate and get org
        try {
          const orgs = await apiClient.getOrganizations();
          if (orgs.length > 0) {
            currentOrg = orgs[0];
            await browser.storage.local.set({
              sessionKey,
              currentOrg,
              sessionValid: true,
            });
            debugLog('[Session] Initialized from cookies');
            return;
          }
        } catch (error) {
          debugLog('[Session] Cookie session invalid, checking storage...');
        }
      }
      
      // Fall back to stored session
      const stored = await browser.storage.local.get(['sessionKey', 'currentOrg', 'sessionValid']);
      if (stored.sessionValid && stored.sessionKey && stored.currentOrg) {
        sessionKey = stored.sessionKey;
        currentOrg = stored.currentOrg;
        apiClient = new ClaudeAPIClient(sessionKey as string);
        debugLog('[Session] Restored from storage');
      } else {
        debugLog('[Session] No valid session found - user needs to log in to Claude.ai');
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
        debugLog('[Session] Using manual session key from storage');
        return storage.manualSessionKey;
      }

      // Fall back to cookie extraction - try multiple approaches for Firefox compatibility
      debugLog('[Session] Attempting to extract sessionKey cookie...');

      // Method 1: Direct cookie.get with exact URL
      let cookie = await browser.cookies.get({
        url: 'https://claude.ai',
        name: 'sessionKey',
      });

      if (cookie && cookie.value) {
        debugLog('[Session] Found sessionKey via direct get');
        return cookie.value;
      }

      // Method 2: Try with www subdomain
      cookie = await browser.cookies.get({
        url: 'https://www.claude.ai',
        name: 'sessionKey',
      });

      if (cookie && cookie.value) {
        debugLog('[Session] Found sessionKey via www subdomain');
        return cookie.value;
      }

      // Method 3: Search all cookies for claude.ai domain (Firefox fallback)
      const allCookies = await browser.cookies.getAll({
        domain: 'claude.ai'
      });

      debugLog(`[Session] Found ${allCookies.length} cookies for claude.ai domain`);

      const sessionCookie = allCookies.find(c => c.name === 'sessionKey');
      if (sessionCookie && sessionCookie.value) {
        debugLog('[Session] Found sessionKey via domain search');
        return sessionCookie.value;
      }

      // Method 4: Try with .claude.ai domain (with leading dot)
      const allCookiesWithDot = await browser.cookies.getAll({
        domain: '.claude.ai'
      });

      debugLog(`[Session] Found ${allCookiesWithDot.length} cookies for .claude.ai domain`);

      const sessionCookieWithDot = allCookiesWithDot.find(c => c.name === 'sessionKey');
      if (sessionCookieWithDot && sessionCookieWithDot.value) {
        debugLog('[Session] Found sessionKey via .domain search');
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
        
        // Auto-save account on successful validation
        await autoSaveAccount(sessionKey, currentOrg);
        
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

          case 'get-styles':
            if (apiClient && currentOrg) {
              try {
                const styles = await apiClient.getStyles(currentOrg.uuid);
                sendResponse({ success: true, data: styles });
              } catch (error: any) {
                console.error('[BG] Failed to fetch styles:', error);
                sendResponse({ success: false, error: error.message });
              }
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
            debugLog('[BG] send-chat-message: apiClient=', !!apiClient, 'currentOrg=', !!currentOrg);
            if (apiClient && currentOrg) {
              try {
                const response = await apiClient.sendMessage(
                  currentOrg.uuid,
                  request.conversationId,
                  request.message,
                  request.attachments || [],
                  request.parentMessageUuid,
                  request.model, // Pass model from side panel
                  request.personalizedStyles // Pass personalized styles
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
                // New format uses content_block_delta with delta.text for text content
                const lines = fullResponse.split('\n');
                let assistantMessage = '';
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      // Handle old format (completion field)
                      if (data.completion) {
                        assistantMessage += data.completion;
                      }
                      // Handle new format (content_block_delta with text_delta)
                      if (data.type === 'content_block_delta' && 
                          data.delta?.type === 'text_delta' && 
                          data.delta?.text) {
                        assistantMessage += data.delta.text;
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

          case 'send-chat-message-with-tools':
            debugGroup('[BG] 🤖 send-chat-message-with-tools');
            debugLog('├─ apiClient:', !!apiClient);
            debugLog('├─ currentOrg:', !!currentOrg, currentOrg?.uuid);
            if (apiClient && currentOrg) {
              try {
                const { conversationId, messages, tools, model } = request;
                debugLog('├─ conversationId:', conversationId);
                debugLog('├─ model:', model);
                debugLog('├─ tools count:', tools?.length);
                debugLog('├─ messages:', JSON.stringify(messages, null, 2));
                
                // Format tools into a system prompt that instructs Claude on how to use them
                const toolsDescription = tools.map((tool: any) => {
                  const params = Object.entries(tool.input_schema.properties || {})
                    .map(([name, schema]: [string, any]) => `  - ${name}: ${schema.description || schema.type}`)
                    .join('\n');
                  return `### ${tool.name}\n${tool.description}\n\nParameters:\n${params}`;
                }).join('\n\n---\n\n');
                
                const toolSystemPrompt = `You are an AI assistant with access to browser automation tools. You can interact with web pages to help the user complete tasks.

## Available Tools

${toolsDescription}

## How to Use Tools

When you need to use a tool, respond with a JSON block in the following format:

\`\`\`tool_use
{
  "type": "tool_use",
  "id": "unique_id_here",
  "name": "tool_name",
  "input": {
    "param1": "value1"
  }
}
\`\`\`

You can include multiple tool_use blocks in a single response if you need to perform multiple actions.

After using tools, you will receive the results. Continue using tools until you have completed the user's task, then provide a final summary.

IMPORTANT: 
- Always take a screenshot first to see the current state of the page
- Use read_page to get the accessibility tree to find clickable elements
- Coordinates are in pixels from the top-left of the viewport
- After clicking an input field, use the "type" action to enter text

## Current Conversation`;

                // Build the prompt from message history
                let prompt = '';
                const lastMessages = messages.slice(-10); // Keep last 10 messages for context
                
                for (const msg of lastMessages) {
                  if (msg.role === 'user') {
                    if (typeof msg.content === 'string') {
                      prompt += `\n\nUser: ${msg.content}`;
                    } else if (Array.isArray(msg.content)) {
                      // Handle tool results
                      for (const item of msg.content) {
                        if (item.type === 'tool_result') {
                          prompt += `\n\nTool Result (${item.tool_use_id}): ${typeof item.content === 'string' ? item.content : JSON.stringify(item.content)}`;
                        }
                      }
                    }
                  } else if (msg.role === 'assistant') {
                    prompt += `\n\nAssistant: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`;
                  }
                }
                
                // Prepend system prompt to the conversation
                const fullPrompt = toolSystemPrompt + prompt;
                
                debugLog('├─ 📝 Prompt built:');
                debugLog('│  ├─ system prompt length:', toolSystemPrompt.length);
                debugLog('│  ├─ user prompt length:', prompt.length);
                debugLog('│  ├─ total length:', fullPrompt.length);
                debugLog('│  └─ first 500 chars:', fullPrompt.substring(0, 500));
                
                // Send to Claude
                const response = await apiClient.sendMessage(
                  currentOrg.uuid,
                  conversationId,
                  fullPrompt,
                  [],
                  '00000000-0000-4000-8000-000000000000',
                  model
                );
                
                // Read streaming response - try multiple methods
                debugLog('├─ 📖 Reading response:');
                debugLog('│  ├─ body exists:', !!response.body);
                debugLog('│  ├─ bodyUsed:', response.bodyUsed);
                
                let fullResponse = '';
                
                // Method 1: Try reading as text directly first
                try {
                  const clonedResponse = response.clone();
                  const textContent = await clonedResponse.text();
                  debugLog('│  ├─ Method 1 (text()):', textContent.length, 'bytes');
                  if (textContent.length > 0) {
                    fullResponse = textContent;
                  }
                } catch (e: any) {
                  debugLog('│  ├─ Method 1 failed:', e.message);
                }
                
                // Method 2: Try streaming reader if text() didn't work
                if (!fullResponse && response.body) {
                  try {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let chunkCount = 0;
                    
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      chunkCount++;
                      fullResponse += decoder.decode(value);
                    }
                    debugLog('│  ├─ Method 2 (stream):', chunkCount, 'chunks,', fullResponse.length, 'bytes');
                  } catch (e: any) {
                    debugLog('│  ├─ Method 2 failed:', e.message);
                  }
                }
                
                debugLog('│  └─ Final response length:', fullResponse.length);
                debugLog('├─ 📄 Raw response (first 2000 chars):');
                debugLog(fullResponse.substring(0, 2000) || '(empty)');
                
                // Parse the streamed response
                debugLog('├─ 🔍 Parsing SSE response:');
                const lines = fullResponse.split('\n');
                debugLog('│  ├─ total lines:', lines.length);
                let assistantMessage = '';
                let dataLineCount = 0;
                let parsedEventCount = 0;
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    dataLineCount++;
                    try {
                      const data = JSON.parse(line.slice(6));
                      parsedEventCount++;
                      // Log first few events to understand structure
                      if (parsedEventCount <= 3) {
                        debugLog(`│  ├─ event ${parsedEventCount} keys:`, Object.keys(data));
                        debugLog(`│  │  sample:`, JSON.stringify(data).substring(0, 200));
                      }
                      if (data.completion) {
                        assistantMessage += data.completion;
                      }
                      // Also check for other common field names
                      if (data.text) {
                        assistantMessage += data.text;
                      }
                      if (data.content) {
                        assistantMessage += typeof data.content === 'string' ? data.content : '';
                      }
                      if (data.delta?.text) {
                        assistantMessage += data.delta.text;
                      }
                    } catch (e) {
                      // Ignore parse errors
                    }
                  }
                }
                debugLog('│  ├─ data lines found:', dataLineCount);
                debugLog('│  ├─ events parsed:', parsedEventCount);
                debugLog('│  └─ assistant message length:', assistantMessage.length);
                
                // Parse tool_use blocks from the response with robust multi-strategy parser
                const toolUses: any[] = [];
                const seenToolIds = new Set<string>();
                const seenToolHashes = new Set<string>(); // For deduplication by content
                let match;
                
                // Known tool names for validation
                const VALID_TOOL_NAMES = ['computer', 'read_page', 'tabs_context', 'tabs_create', 'get_page_text'];
                
                // Validate tool structure
                const isValidTool = (tool: any): boolean => {
                  if (!tool || typeof tool !== 'object') return false;
                  if (!tool.name || typeof tool.name !== 'string') return false;
                  if (!VALID_TOOL_NAMES.includes(tool.name)) return false;
                  if (!tool.input || typeof tool.input !== 'object') return false;
                  return true;
                };
                
                // Generate hash for deduplication
                const getToolHash = (tool: any): string => {
                  return JSON.stringify({ name: tool.name, input: tool.input });
                };
                
                // Helper to add tool if not duplicate
                const addTool = (tool: any, source: string) => {
                  if (!isValidTool(tool)) {
                    debugLog(`[BG] Invalid tool from ${source}:`, tool);
                    return false;
                  }
                  
                  // Generate ID if missing
                  if (!tool.id) {
                    tool.id = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                  }
                  
                  // Check for duplicates by ID or content
                  const hash = getToolHash(tool);
                  if (seenToolIds.has(tool.id) || seenToolHashes.has(hash)) {
                    debugLog(`[BG] Skipping duplicate tool from ${source}:`, tool.name);
                    return false;
                  }
                  
                  seenToolIds.add(tool.id);
                  seenToolHashes.add(hash);
                  toolUses.push(tool);
                  tool.type = 'tool_use';
                  debugLog(`[BG] Added tool from ${source}:`, tool.name);
                  return true;
                };
                
                // Strategy 1: ```tool_use code blocks (highest confidence)
                const toolUseBlockRegex = /```tool_use\s*([\s\S]*?)```/g;
                while ((match = toolUseBlockRegex.exec(assistantMessage)) !== null) {
                  try {
                    const content = match[1].trim();
                    // Handle potential array of tools
                    if (content.startsWith('[')) {
                      const tools = JSON.parse(content);
                      if (Array.isArray(tools)) {
                        tools.forEach(t => addTool(t, 'tool_use block (array)'));
                      }
                    } else {
                      const toolJson = JSON.parse(content);
                      addTool(toolJson, 'tool_use block');
                    }
                  } catch (e) {
                    debugLog('[BG] Failed to parse tool_use block:', e);
                  }
                }
                
                // Strategy 2: ```json code blocks with tool_use type or valid tool name
                const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
                while ((match = jsonBlockRegex.exec(assistantMessage)) !== null) {
                  try {
                    const content = match[1].trim();
                    const parsed = JSON.parse(content);
                    
                    // Handle array of tools
                    if (Array.isArray(parsed)) {
                      parsed.forEach(item => {
                        if (item.type === 'tool_use' || VALID_TOOL_NAMES.includes(item.name)) {
                          addTool(item, 'json block (array)');
                        }
                      });
                    } else if (parsed.type === 'tool_use' || VALID_TOOL_NAMES.includes(parsed.name)) {
                      addTool(parsed, 'json block');
                    }
                  } catch (e) {
                    // Not valid JSON, ignore
                  }
                }
                
                // Strategy 3: Generic code blocks (any language tag or none)
                const genericBlockRegex = /```(?:\w*)\s*([\s\S]*?)```/g;
                while ((match = genericBlockRegex.exec(assistantMessage)) !== null) {
                  try {
                    const content = match[1].trim();
                    // Skip if already processed as tool_use or json
                    if (content.startsWith('tool_use') || content.startsWith('json')) continue;
                    
                    // Try to parse as JSON
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                      parsed.forEach(item => addTool(item, 'generic block (array)'));
                    } else {
                      addTool(parsed, 'generic block');
                    }
                  } catch (e) {
                    // Not JSON, ignore
                  }
                }
                
                // Strategy 4: Balanced JSON extraction with brace matching
                // This handles nested objects properly
                const extractBalancedJson = (text: string, startIdx: number): string | null => {
                  if (text[startIdx] !== '{') return null;
                  let depth = 0;
                  let inString = false;
                  let escape = false;
                  
                  for (let i = startIdx; i < text.length; i++) {
                    const char = text[i];
                    
                    if (escape) {
                      escape = false;
                      continue;
                    }
                    
                    if (char === '\\' && inString) {
                      escape = true;
                      continue;
                    }
                    
                    if (char === '"' && !escape) {
                      inString = !inString;
                      continue;
                    }
                    
                    if (!inString) {
                      if (char === '{') depth++;
                      if (char === '}') depth--;
                      if (depth === 0) {
                        return text.substring(startIdx, i + 1);
                      }
                    }
                  }
                  return null;
                };
                
                // Find potential tool JSON objects by looking for tool names
                const toolNamePattern = /"name"\s*:\s*"(computer|read_page|tabs_context|tabs_create|get_page_text)"/g;
                while ((match = toolNamePattern.exec(assistantMessage)) !== null) {
                  // Find the start of this JSON object
                  let startIdx = match.index;
                  while (startIdx > 0 && assistantMessage[startIdx] !== '{') {
                    startIdx--;
                  }
                  
                  if (assistantMessage[startIdx] === '{') {
                    const jsonStr = extractBalancedJson(assistantMessage, startIdx);
                    if (jsonStr) {
                      try {
                        const toolJson = JSON.parse(jsonStr);
                        addTool(toolJson, 'inline balanced');
                      } catch (e) {
                        debugLog('[BG] Failed to parse balanced JSON:', e);
                      }
                    }
                  }
                }
                
                // Strategy 5: XML-style tool tags (fallback for some prompt formats)
                const xmlToolRegex = /<tool_use>\s*([\s\S]*?)\s*<\/tool_use>/gi;
                while ((match = xmlToolRegex.exec(assistantMessage)) !== null) {
                  try {
                    const content = match[1].trim();
                    // Try to parse the content as JSON
                    const toolJson = JSON.parse(content);
                    addTool(toolJson, 'xml tag');
                  } catch (e) {
                    // Try to extract name and input from XML-like format
                    const nameMatch = /<name>(.*?)<\/name>/i.exec(match[1]);
                    const inputMatch = /<input>([\s\S]*?)<\/input>/i.exec(match[1]);
                    if (nameMatch && inputMatch) {
                      try {
                        const tool = {
                          name: nameMatch[1].trim(),
                          input: JSON.parse(inputMatch[1].trim())
                        };
                        addTool(tool, 'xml parsed');
                      } catch (e2) {
                        debugLog('[BG] Failed to parse XML tool input:', e2);
                      }
                    }
                  }
                }
                
                // Strategy 6: Simple key-value pattern matching (last resort)
                if (toolUses.length === 0) {
                  // Look for patterns like: name: "computer", input: { action: "..." }
                  const simplePattern = /name\s*[=:]\s*["']?(computer|read_page|tabs_context|tabs_create|get_page_text)["']?\s*[,;]?\s*input\s*[=:]\s*(\{[\s\S]*?\})/gi;
                  while ((match = simplePattern.exec(assistantMessage)) !== null) {
                    try {
                      const tool = {
                        name: match[1],
                        input: JSON.parse(match[2])
                      };
                      addTool(tool, 'simple pattern');
                    } catch (e) {
                      debugLog('[BG] Failed to parse simple pattern:', e);
                    }
                  }
                }
                
                debugLog('│  ├─ Found', toolUses.length, 'tool uses');
                
                // Extract text content (remove all tool_use patterns)
                let textContent = assistantMessage
                  .replace(/```(?:tool_use|json)?\s*[\s\S]*?```/g, '')
                  .replace(/\{[^{}]*"type"\s*:\s*"tool_use"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
                  .trim();
                
                debugLog('├─ ✅ Final result:');
                debugLog('│  ├─ tool_uses found:', toolUses.length);
                debugLog('│  ├─ text content length:', textContent.length);
                debugLog('│  └─ text preview:', textContent.substring(0, 200) || '(empty)');
                if (toolUses.length > 0) {
                  debugLog('│  └─ tools:', toolUses.map(t => t.name).join(', '));
                }
                debugGroupEnd();
                
                sendResponse({
                  success: true,
                  data: {
                    text: textContent,
                    tool_uses: toolUses,
                    content: assistantMessage,
                    response: textContent
                  }
                });
              } catch (error: any) {
                console.error('[BG] send-chat-message-with-tools error:', error);
                debugGroupEnd();
                sendResponse({ success: false, error: error.message });
              }
            } else {
              debugLog('└─ ❌ Not authenticated');
              debugGroupEnd();
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
                
                // Models are in organization.claude_ai_bootstrap_models_config
                const modelsConfig = bootstrap?.account?.memberships?.[0]?.organization?.claude_ai_bootstrap_models_config;
                // modelsConfig is an array of model objects
                let models: any[] = [];
                if (Array.isArray(modelsConfig)) {
                  // Parse model objects - structure is { model: "claude-xxx", name: "Claude Xxx", ... }
                  const allModels = modelsConfig.map((m: any) => {
                    const modelId = m.model || m.model_id || m.id || '';
                    const displayName = m.name || m.display_name || modelId;
                    return {
                      id: modelId,
                      name: displayName,
                      family: extractModelFamily(displayName),
                      version: extractModelVersion(modelId)
                    };
                  });
                  
                  // Filter to only latest version of each family (Haiku, Sonnet, Opus)
                  const familyLatest: Record<string, any> = {};
                  for (const model of allModels) {
                    if (model.family && (!familyLatest[model.family] || model.version > familyLatest[model.family].version)) {
                      familyLatest[model.family] = model;
                    }
                  }
                  
                  // Sort by family priority: Sonnet, Opus, Haiku
                  const familyOrder = ['sonnet', 'opus', 'haiku'];
                  models = familyOrder
                    .filter(f => familyLatest[f])
                    .map(f => familyLatest[f]);
                  
                  debugLog('[API] Filtered models (latest per family):', models);
                }
                
                if (models && models.length > 0) {
                  sendResponse({ success: true, data: models });
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
            const isExtensionPage = sender.url?.startsWith(chrome.runtime.getURL(''));
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

                  debugLog('[Session] Setting cookie with details:', {
                    domain: cookieDetails.domain,
                    path: cookieDetails.path,
                    sameSite: cookieDetails.sameSite
                  });

                  await browser.cookies.set(cookieDetails);

                  debugLog('[Session] Manual session key cookie set successfully');

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
                      debugLog('[Session] Cookie found via getAll. Details:', {
                        domain: sessionCookie.domain,
                        path: sessionCookie.path,
                        secure: sessionCookie.secure,
                        sameSite: sessionCookie.sameSite
                      });
                      verifyCookie = sessionCookie;
                    }
                  }

                  debugLog('[Session] Verified cookie:', verifyCookie ? `EXISTS (domain: ${verifyCookie.domain})` : 'NOT FOUND');

                } catch (cookieError: any) {
                  console.error('[Session] Failed to set cookie:', cookieError);
                  sendResponse({ success: false, error: `Cookie error: ${cookieError.message}` });
                  return;
                }

                debugLog('[Session] Manual session key saved and cookie set');

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
            // Take a screenshot of a tab using CDP
            // Supports tabId parameter for specific tab (like official extension)
            try {
              const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!activeTab?.id) {
                sendResponse({ success: false, error: 'No active tab' });
                break;
              }
              
              // Get effective tab ID - validates requested tab is in same group
              let screenshotTabId: number;
              try {
                screenshotTabId = await getEffectiveTabId(request.tabId, activeTab.id);
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
                break;
              }
              
              // Hide indicator before screenshot (like official)
              await hideIndicatorForToolUse(screenshotTabId);
              
              // Attach debugger and capture screenshot
              await chrome.debugger.attach({ tabId: screenshotTabId }, '1.3');
              try {
                const result = await chrome.debugger.sendCommand(
                  { tabId: screenshotTabId },
                  'Page.captureScreenshot',
                  { format: request.format || 'png', quality: request.quality || 80 }
                );
                sendResponse({ 
                  success: true, 
                  data: { 
                    screenshot: `data:image/${request.format || 'png'};base64,${(result as any).data}`,
                    tabId: screenshotTabId
                  } 
                });
              } finally {
                await chrome.debugger.detach({ tabId: screenshotTabId }).catch(() => {});
              }
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'browser-get-accessibility-tree':
            // Get the accessibility tree from a tab
            // Supports tabId parameter for specific tab (like official extension)
            try {
              const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!activeTab?.id) {
                sendResponse({ success: false, error: 'No active tab' });
                break;
              }
              
              // Get effective tab ID - validates requested tab is in same group
              let treeTabId: number;
              try {
                treeTabId = await getEffectiveTabId(request.tabId, activeTab.id);
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
                break;
              }
              
              const results = await browser.scripting.executeScript({
                target: { tabId: treeTabId },
                func: (depth: number, interactiveOnly: boolean) => {
                  return (window as any).__generateAccessibilityTree?.(depth, interactiveOnly) || null;
                },
                args: [request.depth || 15, request.filter === 'interactive']
              });
              
              // Get page info
              const tabInfo = await browser.tabs.get(treeTabId);
              
              sendResponse({ 
                success: true, 
                data: {
                  tree: results[0]?.result,
                  url: tabInfo.url,
                  title: tabInfo.title,
                  tabId: treeTabId
                }
              });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'browser-execute-action':
            // Execute a browser action (click, type, scroll, etc.)
            // Supports tabId parameter to operate on specific tab (like official Claude extension)
            try {
              const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!activeTab?.id) {
                sendResponse({ success: false, error: 'No active tab' });
                break;
              }
              
              const action = request.action;
              if (!action || !action.type) {
                sendResponse({ success: false, error: 'Action type required' });
                break;
              }
              
              // Get effective tab ID - validates requested tab is in same group
              let effectiveTabId: number;
              try {
                effectiveTabId = await getEffectiveTabId(request.tabId ?? action.tabId, activeTab.id);
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
                break;
              }
              
              // Hide indicator before tool use (like official)
              await hideIndicatorForToolUse(effectiveTabId);
              
              // Handle different action types
              switch (action.type) {
                case 'click':
                case 'left_click': {
                  await chrome.debugger.attach({ tabId: effectiveTabId }, '1.3');
                  try {
                    // Get coordinates from ref or use provided coordinates
                    let x = action.x, y = action.y;
                    if (action.target) {
                      const coordResults = await browser.scripting.executeScript({
                        target: { tabId: effectiveTabId },
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
                    
                    // Click with proper mouse move first (like official)
                    await chrome.debugger.sendCommand({ tabId: effectiveTabId }, 'Input.dispatchMouseEvent', {
                      type: 'mouseMoved', x, y, button: 'none', buttons: 0
                    });
                    await new Promise(r => setTimeout(r, 100));
                    await chrome.debugger.sendCommand({ tabId: effectiveTabId }, 'Input.dispatchMouseEvent', {
                      type: 'mousePressed', x, y, button: 'left', clickCount: 1
                    });
                    await new Promise(r => setTimeout(r, 12));
                    await chrome.debugger.sendCommand({ tabId: effectiveTabId }, 'Input.dispatchMouseEvent', {
                      type: 'mouseReleased', x, y, button: 'left', clickCount: 1
                    });
                    
                    sendResponse({ success: true, data: { x, y, tabId: effectiveTabId } });
                  } finally {
                    await chrome.debugger.detach({ tabId: effectiveTabId }).catch(() => {});
                  }
                  break;
                }
                
                case 'type': {
                  await chrome.debugger.attach({ tabId: effectiveTabId }, '1.3');
                  try {
                    if (action.target) {
                      // Focus element first
                      await browser.scripting.executeScript({
                        target: { tabId: effectiveTabId },
                        func: (ref: string) => (window as any).__focusRef?.(ref),
                        args: [action.target]
                      });
                    }
                    await chrome.debugger.sendCommand({ tabId: effectiveTabId }, 'Input.insertText', {
                      text: action.value || ''
                    });
                    sendResponse({ success: true, data: { tabId: effectiveTabId } });
                  } finally {
                    await chrome.debugger.detach({ tabId: effectiveTabId }).catch(() => {});
                  }
                  break;
                }
                
                case 'scroll': {
                  await chrome.debugger.attach({ tabId: effectiveTabId }, '1.3');
                  try {
                    await chrome.debugger.sendCommand({ tabId: effectiveTabId }, 'Input.dispatchMouseEvent', {
                      type: 'mouseWheel',
                      x: action.x || 100,
                      y: action.y || 100,
                      deltaX: action.deltaX || 0,
                      deltaY: action.deltaY || 0
                    });
                    sendResponse({ success: true, data: { tabId: effectiveTabId } });
                  } finally {
                    await chrome.debugger.detach({ tabId: effectiveTabId }).catch(() => {});
                  }
                  break;
                }
                
                case 'navigate': {
                  let url = action.value || '';
                  // Handle back/forward navigation like official extension
                  if (url.toLowerCase() === 'back') {
                    await chrome.tabs.goBack(effectiveTabId);
                    sendResponse({ success: true, data: { action: 'back', tabId: effectiveTabId } });
                    break;
                  } else if (url.toLowerCase() === 'forward') {
                    await chrome.tabs.goForward(effectiveTabId);
                    sendResponse({ success: true, data: { action: 'forward', tabId: effectiveTabId } });
                    break;
                  }
                  
                  if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                  }
                  await browser.tabs.update(effectiveTabId, { url });
                  sendResponse({ success: true, data: { url, tabId: effectiveTabId } });
                  break;
                }
                
                case 'screenshot': {
                  // Take screenshot of specific tab
                  await chrome.debugger.attach({ tabId: effectiveTabId }, '1.3');
                  try {
                    const result = await chrome.debugger.sendCommand(
                      { tabId: effectiveTabId },
                      'Page.captureScreenshot',
                      { format: action.format || 'png', quality: action.quality || 80 }
                    );
                    sendResponse({ 
                      success: true, 
                      data: { 
                        screenshot: `data:image/${action.format || 'png'};base64,${(result as any).data}`,
                        tabId: effectiveTabId
                      } 
                    });
                  } finally {
                    await chrome.debugger.detach({ tabId: effectiveTabId }).catch(() => {});
                  }
                  break;
                }
                
                case 'read_page': {
                  // Get accessibility tree from specific tab
                  const results = await browser.scripting.executeScript({
                    target: { tabId: effectiveTabId },
                    func: (depth: number, interactiveOnly: boolean) => {
                      return (window as any).__generateAccessibilityTree?.(depth, interactiveOnly) || null;
                    },
                    args: [action.depth || 15, action.filter === 'interactive']
                  });
                  
                  // Get page info
                  const tab = await browser.tabs.get(effectiveTabId);
                  
                  sendResponse({ 
                    success: true, 
                    data: {
                      tree: results[0]?.result,
                      url: tab.url,
                      title: tab.title,
                      tabId: effectiveTabId
                    }
                  });
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
            
          case 'tabs-context':
            // Get ALL tabs in current window with tab group information
            try {
              const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!currentTab?.id) {
                sendResponse({ success: false, error: 'No active tab found' });
                break;
              }
              
              // Get all tabs in current window
              const allTabs = await browser.tabs.query({ currentWindow: true });
              
              // Get tab group info for all groups
              const tabGroups: { [key: number]: { id: number; title: string; color: string; collapsed: boolean } } = {};
              try {
                const groups = await chrome.tabGroups.query({ windowId: currentTab.windowId });
                for (const group of groups) {
                  tabGroups[group.id] = {
                    id: group.id,
                    title: group.title || '',
                    color: group.color || 'grey',
                    collapsed: group.collapsed || false
                  };
                }
              } catch (e) {
                // Tab groups API might not be available in all contexts
                console.log('[Background] Tab groups query failed:', e);
              }
              
              // Map all tabs with their group info
              const availableTabs = allTabs
                .filter(t => t.id !== undefined)
                .map(t => {
                  const groupId = t.groupId !== undefined && t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE 
                    ? t.groupId 
                    : undefined;
                  const groupInfo = groupId ? tabGroups[groupId] : undefined;
                  
                  return {
                    tabId: t.id!,
                    title: t.title || 'Untitled',
                    url: t.url || '',
                    favIconUrl: t.favIconUrl,
                    active: t.active,
                    index: t.index,
                    groupId,
                    groupTitle: groupInfo?.title,
                    groupColor: groupInfo?.color
                  };
                });
              
              // Sort tabs: grouped tabs first (sorted by group), then ungrouped
              availableTabs.sort((a, b) => {
                // Both in groups - sort by group, then by index
                if (a.groupId !== undefined && b.groupId !== undefined) {
                  if (a.groupId !== b.groupId) return a.groupId - b.groupId;
                  return a.index - b.index;
                }
                // One in group, one not - grouped first
                if (a.groupId !== undefined) return -1;
                if (b.groupId !== undefined) return 1;
                // Both ungrouped - sort by index
                return a.index - b.index;
              });
              
              const result = {
                currentTabId: currentTab.id,
                currentTabGroupId: currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? currentTab.groupId : undefined,
                availableTabs,
                tabGroups: Object.values(tabGroups),
                tabCount: availableTabs.length
              };
              
              sendResponse({
                success: true,
                data: result
              });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'tabs-create':
            // Create a new tab in the same group as the current tab (like official)
            try {
              const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
              if (!currentTab?.id) {
                sendResponse({ success: false, error: 'No active tab found' });
                break;
              }
              
              // Create new tab
              const newTab = await browser.tabs.create({
                url: request.url || 'chrome://newtab',
                active: request.active !== false // Default to active
              });
              
              if (!newTab.id) {
                sendResponse({ success: false, error: 'Failed to create tab - no tab ID returned' });
                break;
              }
              
              // If current tab is in a group, add new tab to same group
              if (currentTab.groupId && currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                await chrome.tabs.group({ tabIds: newTab.id, groupId: currentTab.groupId });
              }
              
              // Get updated tabs list
              let availableTabs: { tabId: number; title: string; url: string }[] = [];
              if (currentTab.groupId && currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                const allTabs = await browser.tabs.query({ currentWindow: true });
                availableTabs = allTabs
                  .filter(t => t.groupId === currentTab.groupId && t.id !== undefined)
                  .map(t => ({
                    tabId: t.id!,
                    title: t.title || 'Untitled',
                    url: t.url || ''
                  }));
              } else {
                availableTabs = [{
                  tabId: newTab.id,
                  title: newTab.title || 'Untitled',
                  url: newTab.url || ''
                }];
              }
              
              sendResponse({
                success: true,
                data: {
                  newTabId: newTab.id,
                  currentTabId: currentTab.id,
                  availableTabs,
                  tabCount: availableTabs.length
                },
                output: `Created new tab. Tab ID: ${newTab.id}`
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
            // Show the agent indicator on a tab
            // Supports tabId parameter for specific tab
            try {
              const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
              const indicatorTabId = request.tabId ?? activeTab?.id;
              
              if (indicatorTabId) {
                await browser.tabs.sendMessage(indicatorTabId, {
                  type: 'SHOW_AGENT_INDICATOR',
                  message: request.message || 'Eidolon is working...'
                });
              }
              sendResponse({ success: true, data: { tabId: indicatorTabId } });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'hide-agent-indicator':
            // Hide the agent indicator on a tab
            // Supports tabId parameter for specific tab
            try {
              const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
              const indicatorTabId = request.tabId ?? activeTab?.id;
              
              if (indicatorTabId) {
                await browser.tabs.sendMessage(indicatorTabId, { type: 'HIDE_AGENT_INDICATOR' });
              }
              sendResponse({ success: true, data: { tabId: indicatorTabId } });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'update-agent-status':
            // Update agent status message on a tab
            try {
              const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
              const statusTabId = request.tabId ?? activeTab?.id;
              
              if (statusTabId) {
                await browser.tabs.sendMessage(statusTabId, {
                  type: 'UPDATE_AGENT_STATUS',
                  message: request.message || ''
                });
              }
              sendResponse({ success: true, data: { tabId: statusTabId } });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'show-click-indicator':
            // Show click animation at coordinates on a tab
            try {
              const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
              const clickTabId = request.tabId ?? activeTab?.id;
              
              if (clickTabId && request.x !== undefined && request.y !== undefined) {
                await browser.tabs.sendMessage(clickTabId, {
                  type: 'SHOW_CLICK_INDICATOR',
                  x: request.x,
                  y: request.y
                });
              }
              sendResponse({ success: true, data: { tabId: clickTabId } });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;

          // ================================================================
          // ACCOUNT MANAGEMENT
          // ================================================================

          case 'get-accounts':
            // Get all saved accounts
            try {
              const accountsData = await getAccounts();
              sendResponse({ success: true, data: accountsData });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;

          case 'switch-account':
            // Switch to a different account by ID
            if (request.accountId) {
              const switchResult = await switchToAccount(request.accountId);
              if (switchResult.success) {
                sendResponse({ success: true });
              } else {
                sendResponse({ success: false, error: switchResult.error });
              }
            } else {
              sendResponse({ success: false, error: 'Account ID required' });
            }
            break;

          case 'delete-account':
            // Delete an account by ID
            if (request.accountId) {
              const deleteResult = await deleteAccount(request.accountId);
              if (deleteResult.success) {
                sendResponse({ success: true });
              } else {
                sendResponse({ success: false, error: deleteResult.error });
              }
            } else {
              sendResponse({ success: false, error: 'Account ID required' });
            }
            break;

          case 'update-account':
            // Update an account's metadata
            if (request.accountId && request.updates) {
              const updateResult = await updateAccount(request.accountId, request.updates);
              if (updateResult.success) {
                sendResponse({ success: true, data: updateResult.account });
              } else {
                sendResponse({ success: false, error: updateResult.error });
              }
            } else {
              sendResponse({ success: false, error: 'Account ID and updates required' });
            }
            break;

          case 'save-current-account':
            // Manually save the current session as a named account
            if (sessionKey && currentOrg) {
              try {
                const storage = await getAccounts();
                const now = new Date().toISOString();
                
                // Check if account with this sessionKey exists
                const existingIndex = storage.accounts.findIndex(
                  a => a.sessionKey === sessionKey
                );
                
                if (existingIndex >= 0) {
                  // Update existing
                  if (request.name) storage.accounts[existingIndex].name = request.name;
                  if (request.type) storage.accounts[existingIndex].type = request.type;
                  if (request.color) storage.accounts[existingIndex].color = request.color;
                  storage.accounts[existingIndex].lastUsedAt = now;
                  
                  await saveAccounts(storage);
                  sendResponse({ success: true, data: storage.accounts[existingIndex] });
                } else {
                  // Create new
                  const newAccount: EidolonAccount = {
                    id: crypto.randomUUID(),
                    name: request.name || currentOrg.name || 'Account',
                    type: request.type || 'personal',
                    color: request.color || getNextAccountColor(storage.accounts),
                    sessionKey: sessionKey,
                    organizationId: currentOrg.uuid,
                    organizationName: currentOrg.name,
                    createdAt: now,
                    lastUsedAt: now,
                    isActive: true,
                  };
                  
                  storage.accounts.forEach(a => { a.isActive = false; });
                  storage.accounts.push(newAccount);
                  storage.activeAccountId = newAccount.id;
                  
                  await saveAccounts(storage);
                  sendResponse({ success: true, data: newAccount });
                }
              } catch (error: any) {
                sendResponse({ success: false, error: error.message });
              }
            } else {
              sendResponse({ success: false, error: 'No active session to save' });
            }
            break;

          // ====================================================================
          // SYNC HANDLERS
          // ====================================================================
          
          case 'get-sync-config':
            try {
              const result = await browser.storage.local.get('workspaceConfig');
              sendResponse({ success: true, data: result.workspaceConfig || null });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'set-sync-folder':
            try {
              const result = await browser.storage.local.get('workspaceConfig');
              const config = result.workspaceConfig || { settings: {}, projectMap: {} };
              config.workspacePath = request.path;
              await browser.storage.local.set({ workspaceConfig: config });
              sendResponse({ success: true });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'get-sync-stats':
            try {
              // Try to get real counts from Claude API using the module-level sessionKey
              const orgResult = await browser.storage.local.get('currentOrganization');
              const orgId = orgResult.currentOrganization?.uuid;
              
              if (sessionKey && orgId) {
                const statsApiClient = new ClaudeAPIClient(sessionKey);
                
                // Get real project count
                const projects = await statsApiClient.getProjects(orgId);
                const projectCount = projects?.length || 0;
                
                // Get real conversation count
                const conversations = await statsApiClient.getConversations(orgId);
                const chatCount = conversations?.length || 0;
                
                // Estimate file count (would need to iterate all projects for exact count)
                // Use projectMap if available for a rough file count
                const configResult = await browser.storage.local.get('workspaceConfig');
                const config = configResult.workspaceConfig;
                const mappedProjects = config?.projectMap ? Object.keys(config.projectMap).length : 0;
                const fileCount = mappedProjects * 5; // Rough estimate
                
                sendResponse({
                  success: true,
                  data: {
                    projects: projectCount,
                    files: fileCount,
                    chats: chatCount
                  }
                });
              } else {
                // Fall back to stored config
                const result = await browser.storage.local.get('workspaceConfig');
                const config = result.workspaceConfig;
                if (config?.projectMap) {
                  const projectsCount = Object.keys(config.projectMap).length;
                  sendResponse({
                    success: true,
                    data: {
                      projects: projectsCount,
                      files: projectsCount * 5,
                      chats: 0
                    }
                  });
                } else {
                  sendResponse({ success: true, data: { projects: 0, files: 0, chats: 0 } });
                }
              }
            } catch (error: any) {
              console.warn('[Eidolon] Failed to get sync stats from API, using fallback:', error.message);
              // Fallback to stored config
              try {
                const result = await browser.storage.local.get('workspaceConfig');
                const config = result.workspaceConfig;
                if (config?.projectMap) {
                  const projectsCount = Object.keys(config.projectMap).length;
                  sendResponse({
                    success: true,
                    data: {
                      projects: projectsCount,
                      files: projectsCount * 5,
                      chats: 0
                    }
                  });
                } else {
                  sendResponse({ success: true, data: { projects: 0, files: 0, chats: 0 } });
                }
              } catch {
                sendResponse({ success: false, error: error.message });
              }
            }
            break;
            
          case 'update-sync-settings':
            try {
              const result = await browser.storage.local.get('workspaceConfig');
              const config = result.workspaceConfig || {};
              config.settings = { ...config.settings, ...request.settings };
              await browser.storage.local.set({ workspaceConfig: config });
              sendResponse({ success: true });
            } catch (error: any) {
              sendResponse({ success: false, error: error.message });
            }
            break;
            
          case 'check-sync-status':
            // For now, just return no changes - full diff preview would need file system access
            sendResponse({
              success: true,
              data: {
                hasChanges: false,
                remoteChanges: 0,
                localChanges: 0,
                message: 'No pending changes detected. Open Dashboard for detailed diff.'
              }
            });
            break;
            
          case 'start-sync':
            // Sync requires file system access which needs to be initiated from UI context
            // This handler would coordinate with the dashboard or open it
            sendResponse({
              success: false,
              error: 'Please use the Dashboard for full sync operations'
            });
            break;
            
          case 'cancel-sync':
            // Cancel any ongoing sync operation
            sendResponse({ success: true });
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
      // Only clear session if cookie was explicitly deleted (not just updated/refreshed)
      // When a cookie is updated, Chrome fires 'removed' for old value then 'added' for new
      // changeInfo.cause tells us why it changed: 'explicit', 'overwrite', 'expired', etc.
      if (changeInfo.removed && changeInfo.cause === 'explicit') {
        debugLog('[BG] Session cookie explicitly removed, clearing session');
        sessionKey = null;
        apiClient = null;
        currentOrg = null;
        browser.storage.local.set({ sessionValid: false });
      } else if (changeInfo.removed) {
        debugLog('[BG] Session cookie changed (cause:', changeInfo.cause, ') - not clearing session');
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
      debugLog('[SidePanel] Failed to open side panel:', e);
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
