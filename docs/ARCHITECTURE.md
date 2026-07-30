# Eidolon Architecture Reference

Deep technical reference for Claude.ai API integration, workspace sync system, and internal message passing protocols.

## Dual API Client Implementations

Two `ClaudeAPIClient` implementations exist:

1. **Background Script** (`entrypoints/background.ts`)
   - Embedded client for message passing with popup/dashboard
   - Singleton instance persists across requests
   - Simpler retry logic

2. **Standalone Client** (`utils/api/client.ts`)
   - Used by SyncManager, SearchService, and other utilities
   - Richer exponential backoff retry logic (max 3 retries)
   - Implements rate limit handling (HTTP 403 triggers backoff)
   - Preferred for direct API calls in utilities

**Decision rule:** Use background script client for popup/dashboard message passing; use standalone client for direct API calls in utilities (sync, search, tags).

## Workspace Sync System (Fully Implemented)

**Location:** `utils/sync/`

Bidirectional sync between Claude.ai projects and local filesystem.

**Key components:**
- **SyncManager** (`SyncManager.ts`) — Core orchestration with conflict resolution (~38 KB)
- **WorkspaceConfig** (`workspaceConfig.ts`) — Workspace settings and preferences
- **FileSystem API** (`fileSystem.ts`) — Native browser File System Access API wrappers
- **Hash Utils** (`hashUtils.ts`) — MD5-based change detection for efficient diffing
- **Handle Storage** (`handleStorage.ts`) — IndexedDB persistence for FileSystemDirectoryHandle
- **Types** (`types.ts`) — Comprehensive sync-related type definitions

**Features:**
- Bidirectional sync (upload to Claude.ai or download to local filesystem)
- Change detection via MD5 hashing
- Conflict resolution strategies: remote wins, local wins, newer wins, prompt user
- Workspace management (designated local folder syncs all projects)
- Progress tracking with real-time callbacks
- Dry-run mode (preview changes before applying)
- Incremental sync (only changed files based on hash comparison)

**IndexedDB usage:**
- Database: `eidolon-handles`
- Store: `directory-handles`
- Persists `FileSystemDirectoryHandle` references across browser sessions, allowing re-access without re-prompting

**Sync API example:**
```typescript
const syncManager = new SyncManager(apiClient);
await syncManager.setWorkspaceDirectory(directoryHandle);
await syncManager.syncAll('bidirectional', {
  conflictResolution: 'newer',
  onProgress: (progress) => console.log(progress)
});
const diff = await syncManager.diffWorkspace();
```

## Authentication Flow

1. Extension extracts `sessionKey` cookie from `https://claude.ai` domain (format: `sk-ant-...`)
2. Session validated via `GET /api/organizations` endpoint
3. First organization auto-selected and stored in `chrome.storage.local`
4. All API requests use `Cookie: sessionKey=<key>` header
5. Cookie listener detects logout and invalidates session

## Message Passing Protocol

Service worker handles these actions via `chrome.runtime.onMessage`:

- `validate-session` — Check session validity
- `get-organizations` — Fetch user organizations
- `get-projects` — Fetch projects for current org
- `get-project-files` — List files in a project
- `upload-file` — Upload content to project
- `create-project` — Create new project
- `get-conversations` — Fetch conversations
- `browser-take-screenshot` — CDP screenshot
- `browser-get-accessibility-tree` — Get page accessibility tree
- `browser-execute-action` — Execute click/type/scroll
- `show-agent-indicator` — Visual feedback on page
- `hide-agent-indicator` — Hide visual feedback
- `get-styles` — Fetch personalized styles

All handlers return `{ success: boolean, data?: any, error?: string }` or `{ success: boolean, stream?: ReadableStream }` for streaming.

## Storage Schema

**chrome.storage.local:**
```typescript
{
  eidolon_sessionKey: string,
  eidolon_currentOrg: Organization,
  eidolon_sessionValid: boolean,
  eidolon_pendingUpload: {
    type: 'text' | 'page',
    content: string,
    source: string
  },
  eidolon_workspaceConfig: {
    directoryName: string,
    conflictResolution: 'remote' | 'local' | 'newer' | 'prompt',
    lastSync: number
  }
}
```

**IndexedDB (via handleStorage.ts):**
```
Database: eidolon-handles
Store: directory-handles
  key: workspace
  value: FileSystemDirectoryHandle
```

**Dexie IndexedDB (pinned state, workspace handles):**
```
Database: eidolon-db
Stores:
  - pinned-items (projectUuid, fileUuid → pinned metadata)
  - workspace-handles (workspace → DirectoryHandle reference)
```

**localStorage:**
```
eidolon-style-key: Selected style UUID (persisted across sessions)
```

## ClaudeAPIClient Key Methods

**Organizations:**
- `getOrganizations()` — List user organizations

**Projects:**
- `getProjects(orgId)` — List projects in org
- `createProject(orgId, name, description)` — Create project
- `updateProject(orgId, projectId, data)` — Update project metadata

**Files:**
- `getProjectFiles(orgId, projectId)` — List files in project
- `uploadFile(orgId, projectId, fileName, content)` — Upload file
- `deleteFile(orgId, projectId, fileUuid)` — Delete file

**Conversations:**
- `getConversations(orgId)` — List conversations
- `createConversation(orgId, name, projectUuid)` — Create conversation
- `deleteConversations(orgId, uuids[])` — Delete conversations

**Styles:**
- `getStyles(orgId)` — Fetch personalized styles (Styles API)

## Claude.ai API Reference

**Base URL:** `https://claude.ai/api`

**Authentication:** Cookie-based with `sessionKey` (format: `sk-ant-...`)

### Chat Completion API

**Endpoint:** `POST /organizations/{org_id}/chat_conversations/{conversation_id}/completion`

**Required request body:**
```json
{
  "prompt": "Your message here",
  "timezone": "UTC",
  "rendering_mode": "messages",
  "attachments": [],
  "files": [],
  "personalizedStyles": ["style_uuid"],
  "model": "claude-sonnet-4-20250514"
}
```

**CRITICAL:** `rendering_mode: "messages"` is required or the API times out. `attachments` and `files` must be present even if empty.

**SSE response format:**
```
event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Response text here"}}
```

**Event types to handle:**
- `message_start` — Message metadata (id, model, uuid)
- `content_block_start` — Start of content block (thinking or text)
- `content_block_delta` — Incremental content:
  - `delta.type === "thinking_delta"` — Extended thinking content
  - `delta.type === "text_delta"` — Actual response text in `delta.text`
  - `delta.type === "thinking_summary_delta"` — Thinking summary
- `content_block_stop` — End of content block
- `message_delta` — Message completion info (`stop_reason: "end_turn"`)
- `message_limit` — Rate limit info with `remaining` count
- `message_stop` — End of stream

### Get Conversation API

**Endpoint:** `GET /organizations/{org_id}/chat_conversations/{conversation_id}?rendering_mode=raw`

Returns full conversation metadata including messages, attachments, and metadata.

### Styles API

**Endpoint:** `GET /api/organizations/{org_id}/list_styles`

**Response format:**
```json
{
  "default": [
    {
      "type": "default",
      "uuid": "style_uuid",
      "key": "style_key",
      "name": "Style Name",
      "prompt": "Full style instructions",
      "summary": "Brief description",
      "isDefault": true,
      "attributes": [
        { "name": "Attribute Name", "percentage": 75 }
      ]
    }
  ],
  "custom": [...]
}
```

### Skills API

**Organization Skills (Admin Settings):**
- `GET /organizations/{org_id}/skills/list-org-skills` — List organization skills
- `POST /organizations/{org_id}/skills/upload-org-skill?overwrite=false` — Upload skill
- `POST /organizations/{org_id}/skills/upload-org-skill?overwrite=true` — Replace skill (multipart/form-data with `file`)
- `POST /organizations/{org_id}/skills/delete-org-skill` — Delete skill (JSON body: `{"skill_id": "skill_..."}`)
- `GET /organizations/{org_id}/skills/download-dot-skill-file?skill_id=skill_...` — Download skill

**Personal Skill Toggles (User Settings):**
- `POST /organizations/{org_id}/skills/enable-skill` — Enable skill (JSON body: `{"skill_id": "skill_..."}`)
- `POST /organizations/{org_id}/skills/disable-skill` — Disable skill (JSON body: `{"skill_id": "skill_..."}`)

### Claude Code Sessions API (v0.7.4+)

**Base URL:** `https://claude.ai` (NOT under `/api`)

**Note:** Requires `x-organization-uuid` header.

- `GET /v1/sessions` — List sessions
- `POST /v1/sessions` — Create session
- `POST /v1/sessions/{session_id}/archive` — Archive session
- `GET /v1/sessions/{session_id}/events` — Stream session events (SSE)
- `GET /v1/environment_providers/private/organizations/{org_id}/environments` — Get environments
- `GET /organizations/{org_id}/code/repos?skip_status=true` — Get code repositories

## Error Handling

- `ClaudeAPIError` thrown for all API failures with `statusCode` and `errorType`
- Rate limiting (HTTP 403) triggers exponential backoff (max 3 retries)
- Session expiry (HTTP 401) requires re-authentication
- Network errors retry with progressive delays

## WXT Configuration

- **wxt.config.ts** — Main configuration (source of truth for manifest generation)
- **manifest.json** (root) — Auto-generated artifact; NEVER hand-edit
- **Auto-imports** — WXT provides auto-imports for browser APIs and utilities; run `wxt prepare` after install

## Context Menus & Keyboard Shortcuts

**Context menus:**
- `add-to-claude` — Right-click selected text to add to project
- `save-page-to-claude` — Right-click page to save entire page

**Keyboard shortcuts:**
- `Ctrl+Shift+E` (Mac: `MacCtrl+Shift+E`) — Open extension popup
- `Ctrl+Shift+U` (Mac: `MacCtrl+Shift+U`) — Quick upload

---

**Last Modified:** 2026-06-24
