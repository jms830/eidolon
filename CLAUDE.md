# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Guidance

* Ignore GEMINI.md and GEMINI-*.md files
* To save main context space, for code searches, inspections, troubleshooting or analysis, use code-searcher subagent where appropriate - giving the subagent full context background for the task(s) you assign it.
* After receiving tool results, carefully reflect on their quality and determine optimal next steps before proceeding. Use your thinking to plan and iterate based on this new information, and then take the best next action.
* For maximum efficiency, whenever you need to perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially.
* Before you finish, please verify your solution
* Do what has been asked; nothing more, nothing less.
* NEVER create files unless they're absolutely necessary for achieving your goal.
* ALWAYS prefer editing an existing file to creating a new one.
* NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
* When you update or modify core context files, also update markdown documentation and memory bank
* When asked to commit changes, exclude CLAUDE.md and CLAUDE-*.md referenced memory bank system files from any commits. Never delete these files.

## Memory Bank System

This project uses a structured memory bank system with specialized context files. Always check these files for relevant information before starting work:

### Core Context Files

* **CLAUDE-activeContext.md** - Current session state, goals, and progress (if exists)
* **CLAUDE-patterns.md** - Established code patterns and conventions (if exists)
* **CLAUDE-decisions.md** - Architecture decisions and rationale (if exists)
* **CLAUDE-troubleshooting.md** - Common issues and proven solutions (if exists)
* **CLAUDE-config-variables.md** - Configuration variables reference (if exists)
* **CLAUDE-temp.md** - Temporary scratch pad (only read when referenced)

**Important:** Always reference the active context file first to understand what's currently being worked on and maintain session continuity.

### Memory Bank System Backups

When asked to backup Memory Bank System files, you will copy the core context files above and @.claude settings directory to directory @/path/to/backup-directory. If files already exist in the backup directory, you will overwrite them.

## Project Overview

Eidolon is a Chrome extension (Manifest V3) that integrates with Claude.ai for project and knowledge management. Built using the **WXT framework** for streamlined web extension development.

**Stack:** WXT (next-gen web extension framework), TypeScript, Preact, Custom CSS (Tailwind-inspired)

**Note:** The project uses custom CSS with Tailwind-like utility patterns but does not have an official `tailwind.config.js` configuration file.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (auto-opens browser with extension installed)
npm run dev

# Development for specific browser
npm run dev:firefox

# Build for production (outputs to .output/)
npm run build

# Build for specific browser
npm run build:firefox

# Create distributable ZIP files
npm run zip
npm run zip:firefox

# Run tests (note: Vitest configured but no test files exist yet)
npm test

# Run tests with UI
npm test:ui

# Lint code
npm run lint

# Prepare WXT (run after install - usually via postinstall)
npm run postinstall
```

**Loading the extension manually:** After building, the output is in `.output/` directory. For Chrome, use `.output/chrome-mv3/`, for Firefox use `.output/firefox-mv3/`. Go to `chrome://extensions/` or `about:debugging#/runtime/this-firefox`, enable Developer mode, and load unpacked.

## Architecture

### WXT Framework Structure

WXT uses a **file-based entrypoint system** where files in `entrypoints/` directory automatically become extension components.

**Key Directories:**
- `entrypoints/` - Extension entry points (background, popup, content scripts, dashboard)
- `components/` - Shared UI components (currently unused)
- `utils/` - Shared utilities and helpers (api, search, sync, tags)
- `public/` - Static assets (icons, etc.)
- `.output/` - Build output directory

**Legacy Code Note:** The `/src/` directory contains pre-WXT migration artifacts and can be removed. The old `manifest.json` in root is also legacy - WXT auto-generates the real manifest in `.output/`.

### Extension Components

1. **Background Script** (`entrypoints/background.ts`)
   - Uses `defineBackground()` from WXT
   - Handles authentication, API communication, and message routing
   - Manages session state and Claude.ai API client singleton
   - Creates context menus and handles keyboard shortcuts
   - Monitors cookie changes for session invalidation

2. **Popup UI** (`entrypoints/popup/`)
   - Browser action popup with `index.html`, main.ts, and styles
   - Displays projects list, recent conversations, and quick actions
   - Communicates with background script via `browser.runtime.sendMessage()`

3. **Content Script** (`entrypoints/claude.content.ts`)
   - Uses `defineContentScript()` from WXT
   - Integrates with Claude.ai pages
   - Injects UI elements and quick actions
   - Captures conversation context

4. **Dashboard** (`entrypoints/dashboard/`)
   - Full-page interface (index.html, main.ts, style.css)
   - Advanced project/file management with grid/list views
   - Workspace sync configuration and controls
   - Authentication status modal with session validation
   - Bulk operations and search functionality
   - **Note:** Dashboard main.ts is 4,000+ lines - substantial UI logic

5. **API Client** (`utils/api/`)
   - TypeScript client for Claude.ai REST API
   - Type definitions for Organizations, Projects, Files, Conversations
   - Implements exponential backoff retry logic and rate limit handling

### Dual API Client Implementations

**Two ClaudeAPIClient implementations exist:**

1. **Background Script** (`entrypoints/background.ts`) - Embedded client for message passing
2. **Standalone Client** (`utils/api/client.ts`) - Used by SyncManager and other utilities

Both implement the same interface but the standalone client has more sophisticated retry logic. When adding features:
- Use background script client for popup/dashboard message passing
- Use standalone client for direct API calls in utilities (sync, search, tags)

### Workspace Sync System (FULLY IMPLEMENTED)

**Location:** `utils/sync/`

A fully-implemented bidirectional sync system between Claude.ai projects and local filesystem:

**Key Components:**
- **SyncManager** (`SyncManager.ts`) - Core sync orchestration with conflict resolution (38KB)
- **WorkspaceConfig** (`workspaceConfig.ts`) - Workspace settings and preferences
- **FileSystem API** (`fileSystem.ts`) - Native browser File System Access API wrappers
- **Hash Utils** (`hashUtils.ts`) - MD5-based change detection for efficient diffing
- **Handle Storage** (`handleStorage.ts`) - IndexedDB persistence for FileSystemDirectoryHandle
- **Types** (`types.ts`) - Comprehensive sync-related type definitions

**Sync Features:**
- **Bidirectional sync** - Upload to Claude.ai or download to local filesystem
- **Change detection** - MD5 hashing compares local vs remote file states
- **Conflict resolution** - Strategies: remote wins, local wins, newer wins, prompt user
- **Workspace management** - Designated local folder syncs all projects
- **Progress tracking** - Real-time callbacks for sync progress
- **Dry-run mode** - Preview changes before applying
- **Incremental sync** - Only sync changed files based on hash comparison

**IndexedDB Usage:**
FileSystemDirectoryHandle references are stored in IndexedDB (via `handleStorage.ts`) to persist workspace folder access across browser sessions. This allows the extension to re-access the workspace directory without re-prompting the user.

**Sync API Example:**
```typescript
// Initialize sync manager
const syncManager = new SyncManager(apiClient);

// Configure workspace
await syncManager.setWorkspaceDirectory(directoryHandle);

// Perform bidirectional sync
await syncManager.syncAll('bidirectional', {
  conflictResolution: 'newer',
  onProgress: (progress) => console.log(progress)
});

// Diff before syncing (preview changes)
const diff = await syncManager.diffWorkspace();
```

### WXT Configuration

- **wxt.config.ts** - Main configuration file (replaces manual manifest.json editing)
- **manifest.json** - Auto-generated from entrypoints and config
- **Auto-imports** - WXT provides auto-imports for browser APIs and utilities

### Authentication Flow

1. Extension extracts `sessionKey` cookie from `https://claude.ai` domain
2. Session validated via `GET /api/organizations` endpoint
3. First organization auto-selected and stored in `chrome.storage.local`
4. All API requests use `Cookie: sessionKey=<key>` header
5. Cookie listener detects logout and invalidates session

### Message Passing Protocol

Service worker handles these actions via `chrome.runtime.onMessage`:

- `validate-session` - Check session validity
- `get-organizations` - Fetch user organizations
- `get-projects` - Fetch projects for current org
- `get-project-files` - List files in a project
- `upload-file` - Upload content to project
- `create-project` - Create new project
- `get-conversations` - Fetch conversations

All handlers return `{ success: boolean, data?: any, error?: string }`

### Storage Schema

```typescript
// chrome.storage.local
chrome.storage.local: {
  sessionKey: string,
  currentOrg: Organization,
  sessionValid: boolean,
  pendingUpload: {
    type: 'text' | 'page',
    content: string,
    source: string
  },
  workspaceConfig: {
    directoryName: string,
    conflictResolution: 'remote' | 'local' | 'newer' | 'prompt',
    lastSync: number
  }
}

// IndexedDB (via handleStorage.ts)
// Stores FileSystemDirectoryHandle for workspace persistence
// Database: 'eidolon-handles'
// Store: 'directory-handles'
```

### ClaudeAPIClient Key Methods

**Organizations:** `getOrganizations()`

**Projects:** `getProjects(orgId)`, `createProject(orgId, name, description)`, `updateProject(orgId, projectId, data)`

**Files:** `getProjectFiles(orgId, projectId)`, `uploadFile(orgId, projectId, fileName, content)`, `deleteFile(orgId, projectId, fileUuid)`

**Conversations:** `getConversations(orgId)`, `createConversation(orgId, name, projectUuid)`, `deleteConversations(orgId, uuids[])`

### Error Handling

- `ClaudeAPIError` thrown for all API failures with `statusCode` and `errorType`
- Rate limiting (HTTP 403) triggers exponential backoff (max 3 retries)
- Session expiry (HTTP 401) requires re-authentication
- Network errors retry with progressive delays

### Context Menus

- `add-to-claude` - Right-click selected text to add to project
- `save-page-to-claude` - Right-click page to save entire page

### Keyboard Shortcuts

- `Ctrl+Shift+E` (Mac: `MacCtrl+Shift+E`) - Open extension popup
- `Ctrl+Shift+U` (Mac: `MacCtrl+Shift+U`) - Quick upload

## Implemented Features & Current State

**Core Functionality (COMPLETE):**
- ✅ Full Dashboard page with advanced UI (4,000+ lines in dashboard/main.ts)
- ✅ Content script integration on Claude.ai pages
- ✅ Workspace sync system (bidirectional, change detection, conflict resolution)
- ✅ Local search across projects/files (inline SearchService)
- ✅ Bulk operations and multi-select
- ✅ Tagging system for projects (`utils/tags/`)
- ✅ Authentication status modal with session validation

**Search & Indexing:**
- Client-side search using `SearchService` (`utils/search/searchService.ts`)
- Inline search implementation (not Web Worker)
- Filter projects, files, and conversations
- Web Worker implementation exists (`indexWorker.ts`) but currently unused

**Testing Gap:**
- ⚠️ Vitest configured but **no test files exist yet**
- Need to create `vitest.config.ts` and add tests for:
  - SyncManager (sync logic, conflict resolution, change detection)
  - SearchService (search/filter functionality)
  - ClaudeAPIClient (API operations, error handling, retries)

**Potential Enhancements:**
- Export functionality (conversations to CSV/JSON/Markdown)
- Conversation summarization with AI
- Multi-platform support (ChatGPT, Gemini)
- Switch to Web Worker for search (indexWorker.ts exists but unused)
- Analytics/usage insights

## Critical Implementation Notes

### WXT-Specific Patterns

**Entrypoint Definition:**
- Background: `export default defineBackground(() => { ... })`
- Content Script: `export default defineContentScript({ matches, main: (ctx) => { ... } })`
- Dashboard/Popup: Create `entrypoints/dashboard/index.html` or `entrypoints/popup/index.html` with accompanying `.ts` files
- Use file naming: `*.content.ts` for content scripts (e.g., `claude.content.ts`)

**Browser API Access:**
- Use `browser` namespace (auto-imported by WXT) - works cross-browser
- WXT provides polyfills for compatibility
- Handle MV2/MV3 variations: `(browser.action ?? browser.browser_action)`

**Storage API:**
- WXT provides `@wxt-dev/storage` for type-safe storage
- Use `storage.defineItem()` for type-safe storage items
- Supports local, sync, session, and managed storage areas

**Auto-imports:**
- WXT auto-imports common APIs and utilities
- Run `wxt prepare` after install to generate TypeScript types
- Import from `wxt/browser` for explicit imports

**Content Script UIs:**
- Use `createShadowRootUi()` for isolated UIs with Shadow DOM
- Use `createIntegratedUi()` for integrated UIs without Shadow DOM
- Set `cssInjectionMode: 'ui'` for UI-based CSS injection

### API Client Usage

- Always use `ClaudeAPIClient` class, never direct `fetch()` calls
- Organization UUID required for all project/conversation operations
- Session must be validated before any API operation
- Handle `ClaudeAPIError` exceptions with user-friendly messages

### Background Script

- Wrap all logic inside `defineBackground()` callback
- All async message handlers MUST return `true` for async response
- API client is a singleton that persists across requests
- Session state maintained in both memory and browser storage
- Use `browser.cookies`, `browser.storage`, `browser.runtime` (auto-imported)

### File Uploads

- Files uploaded as text content (not binary)
- File name is separate from content in API call
- Max file size enforced by Claude.ai API

### Manifest & Permissions

- Configure in `wxt.config.ts` instead of editing `manifest.json` directly
- Required: `cookies`, `storage`, `contextMenus`, `tabs`, `activeTab`, `notifications`, `https://claude.ai/*`
- Optional: `clipboardWrite`
- Manifest auto-generated from entrypoints and config

## WXT Migration & Development Patterns

### File Structure Conventions

```
entrypoints/
├── background.ts              # Service worker
├── popup/
│   ├── index.html
│   ├── main.ts               # Entry point
│   └── style.css
├── dashboard/
│   ├── index.html
│   ├── main.ts               # Entry point (4,000+ lines)
│   └── style.css
└── claude.content.ts         # Content script for Claude.ai

utils/
├── api/
│   ├── client.ts             # ClaudeAPIClient
│   └── types.ts              # Type definitions
├── sync/
│   ├── SyncManager.ts        # Sync orchestration
│   ├── workspaceConfig.ts    # Config management
│   ├── fileSystem.ts         # FileSystem Access API
│   ├── hashUtils.ts          # MD5 hashing
│   ├── handleStorage.ts      # IndexedDB storage
│   └── types.ts              # Sync types
├── search/
│   ├── searchService.ts      # Search functionality
│   └── indexWorker.ts        # Web Worker (unused)
└── tags/
    ├── tagsService.ts        # Tag CRUD
    └── tagsUI.ts             # Tag UI components

public/
└── icon-*.png                # Icons
```

### Typical WXT Patterns

**Background Script Example:**
```typescript
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle messages
    return true; // For async responses
  });

  browser.contextMenus.create({
    id: 'my-menu',
    title: 'My Menu Item'
  });
});
```

**Content Script Example:**
```typescript
export default defineContentScript({
  matches: ['*://claude.ai/*'],
  main(ctx) {
    console.log('Content script running on:', location.href);
    // Your content script logic
  }
});
```

**Storage Example:**
```typescript
import { storage } from 'wxt/storage';

const sessionKey = storage.defineItem<string>('local:sessionKey');
await sessionKey.setValue('abc123');
const value = await sessionKey.getValue();
```

### Building for Production

1. Run `npm run build` to build for all browsers
2. Output is in `.output/chrome-mv3/` and `.output/firefox-mv3/`
3. Run `npm run zip` to create distributable ZIP files
4. Upload ZIPs to Chrome Web Store / Firefox Add-ons

### Testing

- Use `@webext-core/fake-browser` for unit testing browser APIs
- WXT provides `fakeBrowser` import for testing
- **Note:** Vitest is configured but no test files exist yet - testing infrastructure needs to be created

## ALWAYS START WITH THESE COMMANDS FOR COMMON TASKS

**Task: "List/summarize all files and directories"**

```bash
fd . -t f           # Lists ALL files recursively (FASTEST)
# OR
rg --files          # Lists files (respects .gitignore)
```

**Task: "Search for content in files"**

```bash
rg "search_term"    # Search everywhere (FASTEST)
```

**Task: "Find files by name"**

```bash
fd "filename"       # Find by name pattern (FASTEST)
```

### Directory/File Exploration

```bash
# FIRST CHOICE - List all files/dirs recursively:
fd . -t f           # All files (fastest)
fd . -t d           # All directories
rg --files          # All files (respects .gitignore)

# For current directory only:
ls -la              # OK for single directory view
```

### BANNED - Never Use These Slow Tools

* ❌ `tree` - NOT INSTALLED, use `fd` instead
* ❌ `find` - use `fd` or `rg --files`
* ❌ `grep` or `grep -r` - use `rg` instead
* ❌ `ls -R` - use `rg --files` or `fd`
* ❌ `cat file | grep` - use `rg pattern file`

### Use These Faster Tools Instead

```bash
# ripgrep (rg) - content search
rg "search_term"                # Search in all files
rg -i "case_insensitive"        # Case-insensitive
rg "pattern" -t py              # Only Python files
rg "pattern" -g "*.md"          # Only Markdown
rg -1 "pattern"                 # Filenames with matches
rg -c "pattern"                 # Count matches per file
rg -n "pattern"                 # Show line numbers
rg -A 3 -B 3 "error"            # Context lines
rg " (TODO| FIXME | HACK)"      # Multiple patterns

# ripgrep (rg) - file listing
rg --files                      # List files (respects •gitignore)
rg --files | rg "pattern"       # Find files by name
rg --files -t md                # Only Markdown files

# fd - file finding
fd -e js                        # All •js files (fast find)
fd -x command {}                # Exec per-file
fd -e md -x ls -la {}           # Example with ls

# jq - JSON processing
jq. data.json                   # Pretty-print
jq -r .name file.json           # Extract field
jq '.id = 0' x.json             # Modify field
```

### Search Strategy

1. Start broad, then narrow: `rg "partial" | rg "specific"`
2. Filter by type early: `rg -t python "def function_name"`
3. Batch patterns: `rg "(pattern1|pattern2|pattern3)"`
4. Limit scope: `rg "pattern" src/`

### INSTANT DECISION TREE

```
User asks to "list/show/summarize/explore files"?
  → USE: fd . -t f  (fastest, shows all files)
  → OR: rg --files  (respects .gitignore)

User asks to "search/grep/find text content"?
  → USE: rg "pattern"  (NOT grep!)

User asks to "find file/directory by name"?
  → USE: fd "name"  (NOT find!)

User asks for "directory structure/tree"?
  → USE: fd . -t d  (directories) + fd . -t f  (files)
  → NEVER: tree (not installed!)

Need just current directory?
  → USE: ls -la  (OK for single dir)
```
