# Reference Extension Migration Guide

> **Purpose**: This document provides a comprehensive analysis of a reference multi-platform AI chat management extension. Use this guide to migrate features into Eidolon.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [Data Models](#data-models)
5. [Database Schema](#database-schema)
6. [Platform Support](#platform-support)
7. [Feature Specifications](#feature-specifications)
8. [Chrome API Usage](#chrome-api-usage)
9. [Message Passing Protocol](#message-passing-protocol)
10. [UI/UX Patterns](#uiux-patterns)
11. [Migration Checklist](#migration-checklist)

---

## Overview

The reference extension provides conversation management across multiple AI platforms with features including:

- **Multi-platform sync**: ChatGPT, Claude, Gemini, DeepSeek, Grok
- **Full-text search**: Web Worker-based indexing with Dexie
- **Labels/Tags**: Custom tagging with color support
- **Favorites**: Quick-access marking system
- **Cloud sync**: Firebase/Firestore for cross-device sync
- **Bulk operations**: Multi-select delete, archive, export, label
- **Export**: Multiple format support (Markdown, JSON, PDF, TXT)
- **Dashboard**: Standalone tab for conversation management
- **Notifications**: Chrome notification API integration

---

## Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Plasmo (React-based) | Extension scaffolding |
| UI Library | React 18+ | Component rendering |
| Styling | Tailwind CSS | Utility-first CSS |
| Local Storage | Dexie (IndexedDB wrapper) | Offline-first data |
| Cloud Sync | Firebase Firestore | Cross-device sync |
| Search | Web Worker | Non-blocking full-text search |
| Build | Parcel/Vite | Bundling and optimization |

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXTENSION SHELL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    Popup     │  │  Dashboard   │  │   Content Scripts    │  │
│  │  (Quick UI)  │  │  (Full UI)   │  │  (Platform Inject)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └────────────┬────┴──────────────────────┘              │
│                      │                                          │
│              ┌───────▼───────┐                                  │
│              │   Background   │                                  │
│              │ Service Worker │                                  │
│              └───────┬───────┘                                  │
│                      │                                          │
│         ┌────────────┼────────────┐                             │
│         │            │            │                             │
│  ┌──────▼──────┐ ┌───▼────┐ ┌────▼─────┐                       │
│  │   Dexie     │ │Firebase│ │  Search  │                       │
│  │  (Local)    │ │(Cloud) │ │  Worker  │                       │
│  └─────────────┘ └────────┘ └──────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Platform API ──► Content Script ──► Background ──► Dexie (Local)
                                         │
                                         ├──► Firebase (Cloud)
                                         │
                                         └──► Search Worker (Index)
```

---

## File Structure

```
extension/
├── manifest.json                    # Extension manifest (MV3)
├── popup.html                       # Popup entry point
├── popup.{hash}.js                  # Popup bundle (minified)
├── popup.{hash}.css                 # Popup styles
│
├── tabs/
│   ├── dashboard.html               # Dashboard entry point
│   ├── dashboard.{hash}.js          # Dashboard bundle
│   ├── dashboard.{hash}.css         # Dashboard styles
│   ├── DashboardSearchPage.html     # Search page entry
│   ├── DashboardSearchPage.{hash}.js
│   └── DashboardSearchPage.{hash}.css
│
├── static/
│   └── background/
│       └── index.js                 # Background service worker
│
├── ChatContent.{hash}.js            # Main content script (all platforms)
├── ChatContent.{hash}.css           # Content script styles
│
├── services.{hash}.js               # Service layer (API adapters)
├── cloudLogCapture.{hash}.js        # Cloud logging utility
├── SearchIndexWorker.{hash}.js      # Search web worker
├── notification.{hash}.js           # Notification handler
├── inspector.{hash}.js              # Debug inspector tool
│
├── assets/                          # Static assets
│   ├── *.png                        # Icons
│   └── *.svg                        # Vector graphics
│
└── _locales/                        # i18n (if present)
```

---

## Data Models

### Conversation Header

```typescript
interface ConversationHeader {
  // Identity
  conversationId: string;        // Platform-specific conversation ID
  serviceId: string;             // Platform identifier (chatgpt, claude, etc.)
  orgId?: string;                // Organization ID (for team accounts)
  accountId?: string;            // User account ID
  
  // Content metadata
  title: string;                 // Conversation title
  messageCount?: number;         // Number of messages
  
  // Timestamps
  createTime: number;            // Unix timestamp (ms) - creation
  updateTime: number;            // Unix timestamp (ms) - last update
  
  // Organization features
  labelIds: string[];            // Assigned label IDs
  isFavorite: boolean;           // Favorited status
  favoritedAt?: number;          // When favorited (for sorting)
  archived: boolean;             // Archive status
  pinned: boolean;               // Pin to top
  deleted: boolean;              // Soft delete flag
  
  // Sync metadata
  syncTime?: number;             // Last sync timestamp
  localModifiedAt?: number;      // Local modification time
  remoteModifiedAt?: number;     // Remote modification time
}
```

### Label/Tag

```typescript
interface Label {
  labelId: string;               // Unique identifier
  labelName: string;             // Display name
  labelColor: string;            // Hex color code (#RRGGBB)
  createdAt: number;             // Creation timestamp
  updatedAt: number;             // Last update timestamp
  conversationCount?: number;    // Number of assigned conversations
}
```

### Account

```typescript
interface Account {
  accountId: string;             // Unique identifier
  serviceId: string;             // Platform (chatgpt, claude, etc.)
  email?: string;                // Account email
  name?: string;                 // Display name
  avatarUrl?: string;            // Profile picture
  isPrimary: boolean;            // Primary account flag
  lastActiveAt: number;          // Last activity timestamp
}
```

### Organization

```typescript
interface Organization {
  orgId: string;                 // Unique identifier
  serviceId: string;             // Platform
  name: string;                  // Organization name
  role?: string;                 // User role in org
  isActive: boolean;             // Currently selected org
}
```

### Service Configuration

```typescript
interface ServiceConfig {
  serviceId: string;             // Unique identifier
  name: string;                  // Display name
  baseUrl: string;               // Platform base URL
  apiEndpoint: string;           // API endpoint pattern
  enabled: boolean;              // Whether sync is enabled
  lastSyncTime?: number;         // Last successful sync
  syncStatus: 'idle' | 'syncing' | 'error';
  errorMessage?: string;         // Last error message
}
```

### Settings

```typescript
interface Settings {
  // Sync preferences
  autoSync: boolean;             // Enable automatic sync
  syncInterval: number;          // Sync interval in minutes
  syncOnStartup: boolean;        // Sync when extension loads
  
  // Cloud sync
  cloudSyncEnabled: boolean;     // Enable Firebase sync
  lastCloudSync?: number;        // Last cloud sync timestamp
  
  // UI preferences
  theme: 'light' | 'dark' | 'system';
  defaultView: 'list' | 'grid';
  showFavoritesFirst: boolean;
  
  // Export preferences
  defaultExportFormat: 'markdown' | 'json' | 'pdf' | 'txt';
  includeMetadataInExport: boolean;
  
  // Notification preferences
  notifyOnSyncComplete: boolean;
  notifyOnError: boolean;
  
  // Timestamps
  settingsModifiedAt: number;
  tagsModifiedAt: number;
}
```

---

## Database Schema

### Dexie Schema Definition

```typescript
import Dexie, { Table } from 'dexie';

interface ConversationDB extends Dexie {
  headers: Table<ConversationHeader>;
  conversations: Table<ConversationContent>;
  tags: Table<Label>;
  metadata: Table<Metadata>;
  orgs: Table<Organization>;
  accounts: Table<Account>;
  services: Table<ServiceConfig>;
}

const db = new Dexie('ConversationManager') as ConversationDB;

db.version(1).stores({
  // Indexed fields for fast queries
  headers: 'conversationId, serviceId, orgId, accountId, createTime, updateTime, [serviceId+orgId], [serviceId+accountId], *labelIds',
  
  conversations: 'conversationId, serviceId',
  
  tags: 'labelId, labelName, createdAt',
  
  metadata: 'key',
  
  orgs: 'orgId, serviceId, [serviceId+isActive]',
  
  accounts: 'accountId, serviceId, [serviceId+isPrimary]',
  
  services: 'serviceId, enabled'
});
```

### Index Strategy

| Table | Primary Key | Secondary Indexes | Purpose |
|-------|-------------|-------------------|---------|
| headers | conversationId | serviceId, createTime, updateTime, labelIds | Fast conversation lookup |
| conversations | conversationId | serviceId | Full content storage |
| tags | labelId | labelName | Label management |
| metadata | key | - | Key-value settings |
| orgs | orgId | serviceId | Multi-org support |
| accounts | accountId | serviceId | Multi-account |
| services | serviceId | enabled | Platform configs |

---

## Platform Support

### Supported Platforms

| Platform | Service ID | Base URL | API Pattern |
|----------|------------|----------|-------------|
| ChatGPT | `chatgpt` | `chat.openai.com`, `chatgpt.com` | REST API via cookies |
| Claude | `claude` | `claude.ai` | REST API via cookies |
| Gemini | `gemini` | `gemini.google.com` | REST API via cookies |
| DeepSeek | `deepseek` | `chat.deepseek.com` | REST API via cookies |
| Grok | `grok` | `grok.com` | REST API via cookies |

### Platform Detection

```typescript
function detectPlatform(url: string): string | null {
  const patterns = {
    chatgpt: /^https:\/\/(chat\.openai\.com|chatgpt\.com)/,
    claude: /^https:\/\/claude\.ai/,
    gemini: /^https:\/\/gemini\.google\.com/,
    deepseek: /^https:\/\/chat\.deepseek\.com/,
    grok: /^https:\/\/grok\.com/
  };
  
  for (const [serviceId, pattern] of Object.entries(patterns)) {
    if (pattern.test(url)) return serviceId;
  }
  return null;
}
```

### Content Script Match Patterns

```json
{
  "content_scripts": [
    {
      "matches": [
        "https://chat.openai.com/*",
        "https://chatgpt.com/*",
        "https://claude.ai/*",
        "https://gemini.google.com/*",
        "https://chat.deepseek.com/*",
        "https://grok.com/*"
      ],
      "js": ["ChatContent.js"],
      "css": ["ChatContent.css"],
      "run_at": "document_idle"
    }
  ]
}
```

### Platform-Specific API Adapters

Each platform requires a service adapter implementing:

```typescript
interface PlatformAdapter {
  serviceId: string;
  
  // Authentication
  isAuthenticated(): Promise<boolean>;
  getAuthCookies(): Promise<Cookie[]>;
  
  // Conversations
  listConversations(options?: ListOptions): Promise<ConversationHeader[]>;
  getConversation(id: string): Promise<ConversationContent>;
  deleteConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  
  // Organizations (if supported)
  listOrganizations?(): Promise<Organization[]>;
  switchOrganization?(orgId: string): Promise<void>;
}
```

---

## Feature Specifications

### 1. Full-Text Search

**Implementation**: Web Worker with Dexie full-text plugin

```typescript
// SearchIndexWorker.ts
import Dexie from 'dexie';

interface SearchIndex {
  conversationId: string;
  content: string;           // Concatenated message content
  title: string;
  serviceId: string;
  tokens: string[];          // Tokenized for search
}

// Worker message types
type SearchMessage = 
  | { type: 'INDEX'; data: SearchIndex }
  | { type: 'SEARCH'; query: string; filters?: SearchFilters }
  | { type: 'REINDEX_ALL' }
  | { type: 'CLEAR' };

// Search with ranking
function search(query: string, filters?: SearchFilters): SearchResult[] {
  const tokens = tokenize(query.toLowerCase());
  
  return db.searchIndex
    .filter(item => {
      // Apply filters
      if (filters?.serviceId && item.serviceId !== filters.serviceId) return false;
      if (filters?.dateRange) {
        // Date filtering logic
      }
      
      // Token matching with ranking
      return tokens.some(token => 
        item.tokens.some(t => t.includes(token))
      );
    })
    .toArray()
    .then(results => rankResults(results, tokens));
}
```

**Search Features**:
- Tokenized full-text search
- Result ranking by relevance
- Filter by platform, date range, labels
- Highlight matched terms
- Search-as-you-type with debouncing

### 2. Labels/Tags System

**Data Flow**:
```
User Action ──► Update Local DB ──► Sync to Cloud ──► Update UI
```

**Operations**:

```typescript
// Label CRUD
async function createLabel(name: string, color: string): Promise<Label> {
  const label: Label = {
    labelId: generateId(),
    labelName: name,
    labelColor: color,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    conversationCount: 0
  };
  
  await db.tags.add(label);
  await syncLabelToCloud(label);
  return label;
}

async function assignLabel(conversationId: string, labelId: string): Promise<void> {
  await db.headers.update(conversationId, {
    labelIds: [...currentLabelIds, labelId],
    localModifiedAt: Date.now()
  });
  
  await db.tags.update(labelId, {
    conversationCount: count + 1
  });
  
  await scheduleSync();
}

async function removeLabel(conversationId: string, labelId: string): Promise<void> {
  await db.headers.update(conversationId, {
    labelIds: currentLabelIds.filter(id => id !== labelId),
    localModifiedAt: Date.now()
  });
  
  await scheduleSync();
}
```

**UI Components**:
- Label picker dropdown with color swatches
- Label management modal (create, edit, delete)
- Filter sidebar with label chips
- Bulk label assignment

### 3. Favorites System

**Simple Toggle**:

```typescript
async function toggleFavorite(conversationId: string): Promise<void> {
  const header = await db.headers.get(conversationId);
  const newFavoriteState = !header.isFavorite;
  
  await db.headers.update(conversationId, {
    isFavorite: newFavoriteState,
    favoritedAt: newFavoriteState ? Date.now() : null,
    localModifiedAt: Date.now()
  });
  
  await scheduleSync();
}
```

**Sorting with Favorites**:
```typescript
function sortConversations(conversations: ConversationHeader[], options: SortOptions): ConversationHeader[] {
  return conversations.sort((a, b) => {
    // Favorites first (if enabled)
    if (options.favoritesFirst) {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
    }
    
    // Then by selected field
    switch (options.sortBy) {
      case 'updateTime':
        return b.updateTime - a.updateTime;
      case 'createTime':
        return b.createTime - a.createTime;
      case 'title':
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });
}
```

### 4. Bulk Operations

**Selection State**:

```typescript
interface SelectionState {
  selectedIds: Set<string>;
  isSelectMode: boolean;
  lastSelectedId?: string;      // For shift-click range selection
}

// Range selection with shift-click
function handleShiftClick(clickedId: string, state: SelectionState, orderedIds: string[]): Set<string> {
  if (!state.lastSelectedId) {
    return new Set([clickedId]);
  }
  
  const startIdx = orderedIds.indexOf(state.lastSelectedId);
  const endIdx = orderedIds.indexOf(clickedId);
  const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
  
  const rangeIds = orderedIds.slice(from, to + 1);
  return new Set([...state.selectedIds, ...rangeIds]);
}
```

**Bulk Actions**:

```typescript
// Bulk delete with confirmation
async function bulkDelete(conversationIds: string[]): Promise<BulkResult> {
  const results: BulkResult = { success: [], failed: [] };
  
  for (const id of conversationIds) {
    try {
      await deleteConversation(id);
      results.success.push(id);
    } catch (error) {
      results.failed.push({ id, error: error.message });
    }
  }
  
  // Update local DB
  await db.headers.bulkUpdate(
    results.success.map(id => ({ key: id, changes: { deleted: true } }))
  );
  
  return results;
}

// Bulk label assignment
async function bulkAssignLabel(conversationIds: string[], labelId: string): Promise<void> {
  await db.transaction('rw', db.headers, async () => {
    for (const id of conversationIds) {
      const header = await db.headers.get(id);
      if (!header.labelIds.includes(labelId)) {
        await db.headers.update(id, {
          labelIds: [...header.labelIds, labelId],
          localModifiedAt: Date.now()
        });
      }
    }
  });
  
  await scheduleSync();
}

// Bulk export
async function bulkExport(conversationIds: string[], format: ExportFormat): Promise<Blob> {
  const conversations = await Promise.all(
    conversationIds.map(id => db.conversations.get(id))
  );
  
  switch (format) {
    case 'markdown':
      return exportToMarkdown(conversations);
    case 'json':
      return exportToJSON(conversations);
    case 'pdf':
      return exportToPDF(conversations);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}
```

### 5. Cloud Sync (Firebase)

**Sync Strategy**: Last-write-wins with timestamp comparison

```typescript
interface SyncState {
  lastSyncTime: number;
  pendingChanges: PendingChange[];
  syncStatus: 'idle' | 'syncing' | 'error';
}

interface PendingChange {
  type: 'header' | 'tag' | 'settings';
  operation: 'create' | 'update' | 'delete';
  id: string;
  data: any;
  timestamp: number;
}

// Bidirectional sync
async function performSync(): Promise<SyncResult> {
  const localChanges = await getLocalChangesSince(state.lastSyncTime);
  const remoteChanges = await getRemoteChangesSince(state.lastSyncTime);
  
  // Resolve conflicts (last-write-wins)
  const resolved = resolveConflicts(localChanges, remoteChanges);
  
  // Push local changes to cloud
  await pushToCloud(resolved.toUpload);
  
  // Pull remote changes to local
  await pullFromCloud(resolved.toDownload);
  
  // Update sync timestamp
  await updateSyncTimestamp(Date.now());
  
  return {
    uploaded: resolved.toUpload.length,
    downloaded: resolved.toDownload.length,
    conflicts: resolved.conflicts.length
  };
}

// Conflict resolution
function resolveConflicts(local: Change[], remote: Change[]): ResolvedChanges {
  const conflicts: Conflict[] = [];
  
  for (const localChange of local) {
    const remoteChange = remote.find(r => r.id === localChange.id);
    
    if (remoteChange) {
      // Both modified - last write wins
      if (localChange.timestamp > remoteChange.timestamp) {
        // Local wins - upload
      } else {
        // Remote wins - download
      }
      conflicts.push({ local: localChange, remote: remoteChange });
    }
  }
  
  return { toUpload, toDownload, conflicts };
}
```

**Firestore Schema**:

```
/users/{userId}/
  ├── settings/
  │   └── preferences         # User settings
  ├── labels/
  │   └── {labelId}          # Label documents
  ├── headers/
  │   └── {conversationId}   # Conversation metadata only
  └── sync/
      └── state              # Sync state tracking
```

### 6. Export Formats

**Markdown Export**:

```typescript
function exportToMarkdown(conversation: ConversationContent): string {
  let md = `# ${conversation.title}\n\n`;
  md += `**Created**: ${formatDate(conversation.createTime)}\n`;
  md += `**Platform**: ${conversation.serviceId}\n\n`;
  md += `---\n\n`;
  
  for (const message of conversation.messages) {
    const role = message.role === 'user' ? '**You**' : '**Assistant**';
    md += `### ${role}\n\n`;
    md += `${message.content}\n\n`;
    
    if (message.attachments?.length) {
      md += `*Attachments: ${message.attachments.map(a => a.name).join(', ')}*\n\n`;
    }
  }
  
  return md;
}
```

**JSON Export**:

```typescript
function exportToJSON(conversation: ConversationContent): string {
  return JSON.stringify({
    metadata: {
      title: conversation.title,
      createTime: conversation.createTime,
      updateTime: conversation.updateTime,
      serviceId: conversation.serviceId,
      messageCount: conversation.messages.length
    },
    messages: conversation.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      attachments: m.attachments
    }))
  }, null, 2);
}
```

### 7. Notifications

```typescript
// Notification types
type NotificationType = 
  | 'sync_complete'
  | 'sync_error'
  | 'export_ready'
  | 'bulk_operation_complete';

async function showNotification(type: NotificationType, data: any): Promise<void> {
  const settings = await getSettings();
  
  // Check if notifications enabled for this type
  if (!shouldShowNotification(type, settings)) return;
  
  const notification = buildNotification(type, data);
  
  await chrome.notifications.create(notification.id, {
    type: 'basic',
    iconUrl: 'assets/icon-128.png',
    title: notification.title,
    message: notification.message,
    buttons: notification.buttons
  });
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  const action = parseNotificationId(notificationId);
  
  switch (action.type) {
    case 'open_dashboard':
      chrome.tabs.create({ url: 'tabs/dashboard.html' });
      break;
    case 'open_conversation':
      chrome.tabs.create({ url: action.url });
      break;
  }
});
```

---

## Chrome API Usage

### Permissions Required

```json
{
  "permissions": [
    "storage",           // Local storage for data
    "cookies",           // Auth cookie access
    "notifications",     // User notifications
    "activeTab",         // Current tab access
    "scripting"          // Content script injection
  ],
  "host_permissions": [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*",
    "https://grok.com/*"
  ]
}
```

### API Usage Patterns

| API | Usage |
|-----|-------|
| `chrome.storage.local` | Settings, sync state, cached data |
| `chrome.cookies.get/getAll` | Auth cookie retrieval for API calls |
| `chrome.cookies.set` | Cookie manipulation (if needed) |
| `chrome.notifications.create` | User notifications |
| `chrome.notifications.onClicked` | Notification interaction |
| `chrome.runtime.sendMessage` | Popup/content → Background |
| `chrome.runtime.onMessage` | Background message handler |
| `chrome.runtime.connect` | Long-lived connections |
| `chrome.tabs.sendMessage` | Background → Content script |
| `chrome.tabs.query` | Find tabs by URL |
| `chrome.tabs.create` | Open dashboard/settings |
| `chrome.scripting.registerContentScripts` | Dynamic script injection |

---

## Message Passing Protocol

### Message Types

```typescript
// Action constants
const MessageActions = {
  // Sync operations
  SYNC_CONVERSATIONS: 'SYNC_CONVERSATIONS',
  SYNC_FIREBASE_DATA: 'SYNC_FIREBASE_DATA',
  
  // CRUD operations
  GET_CONVERSATIONS: 'GET_CONVERSATIONS',
  DELETE_CONVERSATIONS: 'DELETE_CONVERSATIONS',
  UPDATE_CONVERSATION: 'UPDATE_CONVERSATION',
  
  // Label operations
  GET_LABELS: 'GET_LABELS',
  CREATE_LABEL: 'CREATE_LABEL',
  UPDATE_LABEL: 'UPDATE_LABEL',
  DELETE_LABEL: 'DELETE_LABEL',
  ASSIGN_LABEL: 'ASSIGN_LABEL',
  
  // Search
  SEARCH_CONVERSATIONS: 'SEARCH_CONVERSATIONS',
  REINDEX_SEARCH: 'REINDEX_SEARCH',
  
  // Export
  EXPORT_CONVERSATIONS: 'EXPORT_CONVERSATIONS',
  
  // Settings
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  
  // Status
  GET_SYNC_STATUS: 'GET_SYNC_STATUS',
  GET_PLATFORM_STATUS: 'GET_PLATFORM_STATUS'
} as const;
```

### Message Format

```typescript
interface Message<T = any> {
  action: string;
  payload?: T;
  requestId?: string;    // For tracking async responses
}

interface Response<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

// Background handler
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(result => sendResponse({ success: true, data: result }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  return true; // Keep channel open for async response
});
```

### Communication Patterns

```typescript
// Popup → Background (request/response)
async function sendToBackground<T>(action: string, payload?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, payload }, (response: Response<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response.success) {
        reject(new Error(response.error));
      } else {
        resolve(response.data);
      }
    });
  });
}

// Background → Content Script
async function sendToContentScript<T>(tabId: number, action: string, payload?: any): Promise<T> {
  return chrome.tabs.sendMessage(tabId, { action, payload });
}

// Long-lived connection for streaming
function createPort(name: string): chrome.runtime.Port {
  const port = chrome.runtime.connect({ name });
  
  port.onMessage.addListener((message) => {
    // Handle streaming messages
  });
  
  port.onDisconnect.addListener(() => {
    // Handle disconnection
  });
  
  return port;
}
```

---

## UI/UX Patterns

### Theme System

```css
/* CSS Custom Properties for theming */
:root {
  /* Light theme (default) */
  --bg-primary: #ffffff;
  --bg-secondary: #f7f7f8;
  --bg-tertiary: #ececf1;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --border-color: #e5e5e5;
  --accent-color: #6366f1;
  --accent-hover: #4f46e5;
  --success-color: #22c55e;
  --warning-color: #f59e0b;
  --error-color: #ef4444;
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --bg-tertiary: #3d3d3d;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --border-color: #404040;
  --accent-color: #818cf8;
  --accent-hover: #6366f1;
}

/* System theme detection */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Apply dark theme variables */
  }
}
```

### Common Components

**Conversation List Item**:
```html
<div class="conversation-item" data-id="{id}">
  <div class="checkbox-container">
    <input type="checkbox" class="select-checkbox" />
  </div>
  <div class="content">
    <div class="title-row">
      <span class="title">{title}</span>
      <button class="favorite-btn" aria-label="Toggle favorite">
        <svg class="star-icon" />
      </button>
    </div>
    <div class="meta-row">
      <span class="platform-badge">{platform}</span>
      <span class="date">{date}</span>
      <div class="labels">
        <!-- Label chips -->
      </div>
    </div>
  </div>
  <div class="actions">
    <button class="action-btn export-btn">Export</button>
    <button class="action-btn delete-btn">Delete</button>
  </div>
</div>
```

**Bulk Action Bar**:
```html
<div class="bulk-action-bar" data-visible="false">
  <span class="selection-count">{count} selected</span>
  <div class="actions">
    <button class="bulk-btn" data-action="label">
      <svg class="icon" /> Label
    </button>
    <button class="bulk-btn" data-action="export">
      <svg class="icon" /> Export
    </button>
    <button class="bulk-btn bulk-btn-danger" data-action="delete">
      <svg class="icon" /> Delete
    </button>
  </div>
  <button class="clear-selection-btn">Clear</button>
</div>
```

### Responsive Design

```css
/* Mobile-first breakpoints */
.dashboard-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

/* Tablet */
@media (min-width: 768px) {
  .dashboard-layout {
    grid-template-columns: 250px 1fr;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .dashboard-layout {
    grid-template-columns: 280px 1fr 300px;
  }
}
```

---

## Migration Checklist

### Phase 1: Data Layer (Priority: High)

- [ ] **Extend conversation model** with new fields:
  - [ ] `isFavorite: boolean`
  - [ ] `favoritedAt: number | null`
  - [ ] `archived: boolean`
  - [ ] `pinned: boolean`
  - [ ] `labelIds: string[]`
  - [ ] `syncTime: number`
  - [ ] `localModifiedAt: number`

- [ ] **Add labels table** to IndexedDB:
  - [ ] Schema definition
  - [ ] CRUD operations
  - [ ] Migration from existing tags

- [ ] **Update search indexing**:
  - [ ] Modify existing search worker
  - [ ] Add label filtering
  - [ ] Add date range filtering

### Phase 2: Core Features (Priority: High)

- [ ] **Implement favorites**:
  - [ ] Toggle API
  - [ ] Sort with favorites first
  - [ ] UI toggle button

- [ ] **Implement bulk operations**:
  - [ ] Selection state management
  - [ ] Shift-click range selection
  - [ ] Bulk delete
  - [ ] Bulk label assignment
  - [ ] Bulk export

- [ ] **Enhance labels/tags**:
  - [ ] Color picker
  - [ ] Label management UI
  - [ ] Filter by label

### Phase 3: Multi-Platform (Priority: Medium)

- [ ] **Create platform adapter interface**
- [ ] **Implement adapters**:
  - [ ] ChatGPT adapter
  - [ ] Gemini adapter
  - [ ] DeepSeek adapter
  - [ ] Grok adapter (if needed)

- [ ] **Update content scripts** for multi-platform
- [ ] **Update manifest** with new host permissions

### Phase 4: Cloud Sync (Priority: Low)

- [ ] **Set up Firebase project**
- [ ] **Implement sync logic**:
  - [ ] Local change tracking
  - [ ] Conflict resolution
  - [ ] Bidirectional sync

- [ ] **Add sync UI**:
  - [ ] Sync status indicator
  - [ ] Manual sync button
  - [ ] Sync settings

### Phase 5: Polish (Priority: Low)

- [ ] **Notifications**:
  - [ ] Sync complete
  - [ ] Export ready
  - [ ] Error alerts

- [ ] **Export enhancements**:
  - [ ] PDF export
  - [ ] Batch export with zip

- [ ] **Settings page**:
  - [ ] Sync preferences
  - [ ] Export defaults
  - [ ] Notification toggles

---

## Eidolon-Specific Considerations

### Existing Infrastructure to Leverage

| Eidolon Feature | Can Reuse For |
|-----------------|---------------|
| `utils/tags/tagsService.ts` | Extend for labels with colors |
| `utils/search/searchService.ts` | Add filtering capabilities |
| `utils/sync/SyncManager.ts` | Base for cloud sync |
| `utils/export/` | Extend with new formats |
| `entrypoints/dashboard/` | Add bulk operations UI |

### Eidolon vs Reference Differences

| Aspect | Reference | Eidolon | Migration Note |
|--------|-----------|---------|----------------|
| Framework | Plasmo/React | WXT/Preact | Minor JSX differences |
| Storage | Dexie | chrome.storage | Consider Dexie migration |
| Styling | Tailwind | Custom CSS | Keep existing style patterns |
| Cloud | Firebase | None (yet) | Optional premium feature |

### Recommended Migration Order

1. **Quick wins**: Favorites (1-2 days)
2. **High value**: Bulk operations (3-5 days)
3. **Foundation**: Enhanced labels with colors (2-3 days)
4. **Platform expansion**: Multi-platform adapters (5-7 days per platform)
5. **Premium**: Cloud sync (7-10 days)

---

## Appendix: Code Snippets

### Storage Key Constants

```typescript
// Prefix all keys for namespacing
const STORAGE_PREFIX = 'eidolon_';

const StorageKeys = {
  SETTINGS: `${STORAGE_PREFIX}settings`,
  SYNC_STATE: `${STORAGE_PREFIX}sync_state`,
  LAST_SYNC: `${STORAGE_PREFIX}last_sync`,
  LABELS: `${STORAGE_PREFIX}labels`,
  FAVORITES: `${STORAGE_PREFIX}favorites`,
  SELECTION_STATE: `${STORAGE_PREFIX}selection`,
} as const;
```

### Utility Functions

```typescript
// Generate unique IDs
function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// Debounce for search input
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
```

---

*Document generated for Eidolon migration. Last updated: December 2025.*

**Last Modified**: 2025-12-17
