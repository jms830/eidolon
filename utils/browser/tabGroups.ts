/**
 * Tab Group Manager
 * 
 * Manages tab groups for Eidolon sessions.
 * Creates, updates, and tracks tab groups for organized browsing.
 */

import type { TabGroupColor, TabGroupOptions, EidolonSession } from './types';

// Storage key for sessions
const SESSIONS_STORAGE_KEY = 'eidolon_sessions';

// Default color for Eidolon groups
const DEFAULT_COLOR: TabGroupColor = 'orange';

/**
 * Get all Eidolon sessions from storage
 */
export async function getSessions(): Promise<EidolonSession[]> {
  const result = await chrome.storage.local.get(SESSIONS_STORAGE_KEY);
  return result[SESSIONS_STORAGE_KEY] || [];
}

/**
 * Save sessions to storage
 */
async function saveSessions(sessions: EidolonSession[]): Promise<void> {
  await chrome.storage.local.set({ [SESSIONS_STORAGE_KEY]: sessions });
}

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new tab group for a session
 */
export async function createTabGroup(
  tabIds: number[],
  options: TabGroupOptions
): Promise<number> {
  if (tabIds.length === 0) {
    throw new Error('No tabs provided for group');
  }
  
  // Create the group
  const groupId = await chrome.tabs.group({ tabIds });
  
  // Update group properties
  await chrome.tabGroups.update(groupId, {
    title: options.title,
    color: options.color || DEFAULT_COLOR,
    collapsed: options.collapsed || false
  });
  
  console.log(`[TabGroups] Created group ${groupId} with ${tabIds.length} tabs`);
  return groupId;
}

/**
 * Create a new Eidolon session with a tab group
 */
export async function createSession(
  name: string,
  initialTabId?: number
): Promise<EidolonSession> {
  const sessions = await getSessions();
  
  const session: EidolonSession = {
    id: generateSessionId(),
    name,
    tabIds: initialTabId ? [initialTabId] : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active'
  };
  
  // Create tab group if we have a tab
  if (initialTabId) {
    try {
      session.groupId = await createTabGroup([initialTabId], {
        title: `Eidolon: ${name}`,
        color: DEFAULT_COLOR
      });
    } catch (error) {
      console.warn('[TabGroups] Failed to create group:', error);
    }
  }
  
  sessions.push(session);
  await saveSessions(sessions);
  
  console.log(`[TabGroups] Created session: ${session.id}`);
  return session;
}

/**
 * Add a tab to a session
 */
export async function addTabToSession(
  sessionId: string,
  tabId: number
): Promise<void> {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  // Add to existing group or create new one
  if (session.groupId) {
    await chrome.tabs.group({ tabIds: [tabId], groupId: session.groupId });
  } else {
    session.groupId = await createTabGroup([tabId], {
      title: `Eidolon: ${session.name}`,
      color: DEFAULT_COLOR
    });
  }
  
  if (!session.tabIds.includes(tabId)) {
    session.tabIds.push(tabId);
  }
  
  session.updatedAt = Date.now();
  await saveSessions(sessions);
}

/**
 * Remove a tab from a session
 */
export async function removeTabFromSession(
  sessionId: string,
  tabId: number
): Promise<void> {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) {
    return;
  }
  
  // Remove from group
  try {
    await chrome.tabs.ungroup(tabId);
  } catch (error) {
    // Tab might already be ungrouped or closed
  }
  
  session.tabIds = session.tabIds.filter(id => id !== tabId);
  session.updatedAt = Date.now();
  
  // If no more tabs, cleanup the group
  if (session.tabIds.length === 0 && session.groupId) {
    session.groupId = undefined;
  }
  
  await saveSessions(sessions);
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<EidolonSession | null> {
  const sessions = await getSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

/**
 * Get session by group ID
 */
export async function getSessionByGroupId(groupId: number): Promise<EidolonSession | null> {
  const sessions = await getSessions();
  return sessions.find(s => s.groupId === groupId) || null;
}

/**
 * Get active sessions
 */
export async function getActiveSessions(): Promise<EidolonSession[]> {
  const sessions = await getSessions();
  return sessions.filter(s => s.status === 'active');
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: EidolonSession['status']
): Promise<void> {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  session.status = status;
  session.updatedAt = Date.now();
  
  // Update group color based on status
  if (session.groupId) {
    let color: TabGroupColor = DEFAULT_COLOR;
    if (status === 'paused') color = 'yellow';
    if (status === 'completed') color = 'green';
    
    try {
      await chrome.tabGroups.update(session.groupId, { color });
    } catch (error) {
      // Group might not exist
    }
  }
  
  await saveSessions(sessions);
}

/**
 * Rename a session
 */
export async function renameSession(
  sessionId: string,
  newName: string
): Promise<void> {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === sessionId);
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  session.name = newName;
  session.updatedAt = Date.now();
  
  // Update group title
  if (session.groupId) {
    try {
      await chrome.tabGroups.update(session.groupId, {
        title: `Eidolon: ${newName}`
      });
    } catch (error) {
      // Group might not exist
    }
  }
  
  await saveSessions(sessions);
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await getSessions();
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  
  if (sessionIndex === -1) {
    return;
  }
  
  const session = sessions[sessionIndex];
  
  // Ungroup all tabs
  for (const tabId of session.tabIds) {
    try {
      await chrome.tabs.ungroup(tabId);
    } catch (error) {
      // Tab might be closed
    }
  }
  
  sessions.splice(sessionIndex, 1);
  await saveSessions(sessions);
  
  console.log(`[TabGroups] Deleted session: ${sessionId}`);
}

/**
 * Collapse/expand a session's tab group
 */
export async function setSessionCollapsed(
  sessionId: string,
  collapsed: boolean
): Promise<void> {
  const session = await getSession(sessionId);
  
  if (!session?.groupId) {
    return;
  }
  
  try {
    await chrome.tabGroups.update(session.groupId, { collapsed });
  } catch (error) {
    console.warn('[TabGroups] Failed to update collapse state:', error);
  }
}

/**
 * Get all tab groups
 */
export async function getAllTabGroups(): Promise<chrome.tabGroups.TabGroup[]> {
  return chrome.tabGroups.query({});
}

/**
 * Get tabs in a session
 */
export async function getSessionTabs(sessionId: string): Promise<chrome.tabs.Tab[]> {
  const session = await getSession(sessionId);
  
  if (!session) {
    return [];
  }
  
  const tabs: chrome.tabs.Tab[] = [];
  for (const tabId of session.tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      tabs.push(tab);
    } catch (error) {
      // Tab might be closed
    }
  }
  
  return tabs;
}

/**
 * Sync sessions with actual tab groups
 * Call this periodically to clean up orphaned data
 */
export async function syncSessions(): Promise<void> {
  const sessions = await getSessions();
  let updated = false;
  
  for (const session of sessions) {
    // Remove closed tabs from session
    const validTabIds: number[] = [];
    for (const tabId of session.tabIds) {
      try {
        await chrome.tabs.get(tabId);
        validTabIds.push(tabId);
      } catch (error) {
        // Tab is closed
        updated = true;
      }
    }
    session.tabIds = validTabIds;
    
    // Check if group still exists
    if (session.groupId) {
      try {
        await chrome.tabGroups.get(session.groupId);
      } catch (error) {
        session.groupId = undefined;
        updated = true;
      }
    }
  }
  
  if (updated) {
    await saveSessions(sessions);
  }
}

/**
 * Focus on a session's tabs
 */
export async function focusSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  
  if (!session || session.tabIds.length === 0) {
    return;
  }
  
  // Expand group if collapsed
  if (session.groupId) {
    try {
      await chrome.tabGroups.update(session.groupId, { collapsed: false });
    } catch (error) {
      // Group might not exist
    }
  }
  
  // Activate first tab
  const firstTabId = session.tabIds[0];
  try {
    await chrome.tabs.update(firstTabId, { active: true });
    
    // Also focus the window
    const tab = await chrome.tabs.get(firstTabId);
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch (error) {
    console.warn('[TabGroups] Failed to focus session:', error);
  }
}

// Listen for tab removal to update sessions
if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const sessions = await getSessions();
    let updated = false;
    
    for (const session of sessions) {
      const idx = session.tabIds.indexOf(tabId);
      if (idx !== -1) {
        session.tabIds.splice(idx, 1);
        session.updatedAt = Date.now();
        updated = true;
      }
    }
    
    if (updated) {
      await saveSessions(sessions);
    }
  });
}
