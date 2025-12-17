# Eidolon Sync Implementation Plan
## Google Drive-Style Workspace Sync

**Date:** 2025-10-13
**Based on:** ClaudeSync minimal CLI (workspace-wide sync approach)

---

## Executive Summary

**Current State:** Eidolon has excellent project/file browsing, tagging, search, and analytics but NO sync capabilities.

**Goal:** Add Google Drive-style sync where users designate a local folder that stays in sync with ALL their Claude.ai projects.

**Key Concept:** Simple workspace-wide sync (not per-project management). One workspace root, all projects as subfolders.

---

## Core Architecture Comparison

### ClaudeSync Minimal (What We're Adopting)

```
~/ClaudeProjects/                    # Workspace root
├── Project Alpha/
│   ├── AGENTS.md                    # Project custom instructions
│   ├── context/                     # Knowledge files
│   │   ├── spec.md
│   │   └── design.pdf
│   ├── chats/                       # Conversations (optional)
│   └── .claudesync/                 # Metadata
│       └── project.json
├── Project Beta/
│   └── ...
└── .claudesync/                     # Workspace config
    └── workspace.json               # Project ID → folder mapping
```

### Eidolon Current (Browser-Only)

- ✅ View projects/files in popup/dashboard
- ✅ Upload files to projects via UI
- ✅ Search, tag, filter, export
- ❌ NO local filesystem sync
- ❌ NO download capability
- ❌ NO bidirectional sync

---

## Missing Features (Priority Order)

### P0 - Critical Sync Foundation (MVP)

#### 1. **Workspace Initialization**
**What:** Designate a local folder as the workspace root
**How:** Settings dialog with folder picker
**Storage:** `chrome.storage.local.set({ workspaceRoot: '/path/to/folder' })`
**UI:** Settings modal → "Configure Workspace" button

#### 2. **Download Sync (Pull)**
**What:** Download ALL projects from Claude.ai to local folders
**How:**
- Fetch all projects via API
- Create sanitized folder for each project
- Download project instructions → `AGENTS.md`
- Download knowledge files → `context/` folder
- Create metadata → `.claudesync/project.json`
**Trigger:** Manual "Sync Now" button (later: auto-sync on schedule)

#### 3. **Project Structure Creation**
**What:** Organize each project as a proper folder structure
**Files:**
- `AGENTS.md` - Custom instructions from Claude.ai
- `context/` - Knowledge files
- `.claudesync/project.json` - Metadata (project ID, org ID, sync timestamp)

#### 4. **Change Detection (MD5 Hashing)**
**What:** Detect which files have changed since last sync
**How:** Compute MD5 hash of file contents, compare with stored hashes
**Purpose:** Only sync files that actually changed (efficient)

#### 5. **Sync Status Display**
**What:** Show sync progress and results
**UI:**
- Dashboard: "Last synced: 5 minutes ago"
- Sync button with loading state
- Results: "✓ 12 projects synced, 3 files updated"

---

### P1 - High Priority (Bidirectional Sync)

#### 6. **Upload Sync (Push)**
**What:** Upload local file changes back to Claude.ai
**How:**
- Scan workspace for modified files (compare MD5)
- Upload changed files to respective projects via API
- Update `AGENTS.md` → project instructions
**Trigger:** "Sync" button with bidirectional mode enabled

#### 7. **Conflict Resolution**
**What:** Handle cases where both local and remote files changed
**Strategies:**
- `remote` - Keep remote version (default, safest)
- `local` - Keep local version (force push)
- `newer` - Keep version with latest timestamp
- `prompt` - Ask user (manual intervention)
**UI:** Modal dialog showing conflicts with options

#### 8. **Dry-Run Mode**
**What:** Preview what would change without executing
**How:** Run sync logic but don't write files or upload
**UI:** "Preview Changes" button showing:
- Files to download
- Files to upload
- Files to skip (no changes)

#### 9. **Diff Viewer**
**What:** Show detailed differences between local and remote
**UI:**
- Table view: Project | Local Files | Remote Files | Status
- File-level: Show which files would be added/removed/modified
**Export:** Save diff report as markdown

---

### P2 - Medium Priority (Enhanced Features)

#### 10. **Background Auto-Sync**
**What:** Periodic automatic sync (like Google Drive)
**How:** `chrome.alarms.create()` for scheduled sync
**Settings:** Sync interval (5 min, 15 min, 1 hour, manual only)
**Status:** System tray-style indicator (connected, syncing, offline)

#### 11. **Chat Sync**
**What:** Download conversation history to local files
**Structure:** `project/chats/conversation-name.md` or JSON
**Optional:** Not everyone needs this (can be toggled)

#### 12. **File Watcher (Advanced)**
**What:** Detect local file changes automatically
**Challenge:** Chrome extensions have NO filesystem access
**Workaround:** Poll workspace at intervals for changes
**Note:** Native Messaging Host could enable real file watching

#### 13. **Selective Sync**
**What:** Choose which projects to sync (like Dropbox selective sync)
**UI:** Project list with checkboxes
**Storage:** Store excluded project IDs in config

#### 14. **Conflict History**
**What:** Log all conflicts and resolutions
**UI:** View past conflicts, undo resolutions if needed
**Storage:** `workspace/.claudesync/conflicts.log`

---

### P3 - Low Priority (Polish)

#### 15. **Sync Notifications**
**What:** Desktop notifications for sync events
**When:** Sync completed, conflicts detected, errors occurred
**Settings:** Toggle notifications on/off

#### 16. **Bandwidth Throttling**
**What:** Limit sync speed to avoid hogging bandwidth
**Note:** Probably overkill for typical project sizes

#### 17. **Archive/Exclude Projects**
**What:** Hide old projects from sync without deleting
**Storage:** Maintain list of archived project IDs

---

## Technical Implementation

### Architecture Changes Needed

#### 1. **File System Access API**
Chrome extensions can't directly access filesystem. Options:
- **Option A:** Use [File System Access API](https://developer.chrome.com/articles/file-system-access/) (user grants permission once)
- **Option B:** Use Native Messaging Host (separate native app for file I/O)
- **Option C:** Use OPFS (Origin Private File System) - private storage, not visible to user ❌

**Recommendation:** **Option A** (File System Access API) - works in Chrome 86+, Firefox doesn't fully support yet.

```typescript
// Request directory handle
const dirHandle = await window.showDirectoryPicker();

// Store handle in IndexedDB (persists across sessions)
await chrome.storage.local.set({ workspaceHandle: dirHandle });

// Read/write files
const fileHandle = await dirHandle.getFileHandle('AGENTS.md', { create: true });
const writable = await fileHandle.createWritable();
await writable.write(content);
await writable.close();
```

#### 2. **Background Sync Worker**
Current background script needs sync logic:
```typescript
// entrypoints/background.ts
class SyncManager {
  async downloadSync(workspaceHandle, orgId) {
    // Fetch all projects
    // For each project:
    //   - Create folder
    //   - Download instructions → AGENTS.md
    //   - Download files → context/
    //   - Save metadata → .claudesync/project.json
  }

  async uploadSync(workspaceHandle, orgId) {
    // Scan workspace for changes
    // For each changed file:
    //   - Detect conflicts
    //   - Resolve per strategy
    //   - Upload to Claude.ai
  }

  async computeFileHash(content: string): Promise<string> {
    // MD5 or SHA-256 hash
  }
}
```

#### 3. **Dashboard Sync UI**
Add new tab or section:
```html
<!-- Sync Tab -->
<section id="sync-tab" class="tab-content">
  <div class="sync-header">
    <h2>Workspace Sync</h2>
    <button id="configure-workspace-btn">⚙ Configure</button>
  </div>

  <div class="sync-status">
    <div class="status-indicator connected">●</div>
    <span>Workspace: ~/ClaudeProjects</span>
    <span>Last synced: 5 minutes ago</span>
  </div>

  <div class="sync-actions">
    <button id="sync-now-btn" class="primary-btn">↻ Sync Now</button>
    <button id="preview-changes-btn">👁 Preview Changes</button>
    <button id="view-diff-btn">📊 View Diff</button>
  </div>

  <div class="sync-options">
    <label>
      <input type="checkbox" id="bidirectional-sync">
      Bidirectional sync (upload local changes)
    </label>
    <label>
      <input type="checkbox" id="sync-chats">
      Include chat conversations
    </label>
    <select id="conflict-strategy">
      <option value="remote">Conflicts: Keep remote</option>
      <option value="local">Conflicts: Keep local</option>
      <option value="newer">Conflicts: Keep newer</option>
    </select>
  </div>

  <div class="sync-log">
    <h3>Sync Log</h3>
    <div id="sync-log-content">
      <!-- Recent sync activities -->
    </div>
  </div>
</section>
```

#### 4. **Storage Schema**
```typescript
interface WorkspaceConfig {
  workspaceRoot: string;           // Path to workspace
  workspaceHandle?: FileSystemDirectoryHandle;  // Persisted handle
  projectMap: Record<string, string>;  // projectId → folderName
  lastSync: string;                // ISO timestamp
  settings: {
    autoSync: boolean;
    syncInterval: number;          // Minutes
    bidirectional: boolean;
    syncChats: boolean;
    conflictStrategy: 'remote' | 'local' | 'newer';
  };
}
```

#### 5. **API Extensions**
Add to ClaudeAPIClient:
```typescript
class ClaudeAPIClient {
  // Existing methods...

  // New sync-specific methods
  async getProjectInstructions(orgId: string, projectId: string): Promise<string> {
    // GET /api/organizations/{orgId}/projects/{projectId}/docs
  }

  async updateProjectInstructions(orgId: string, projectId: string, instructions: string) {
    // POST /api/organizations/{orgId}/projects/{projectId}/docs
  }

  async downloadFile(orgId: string, projectId: string, fileUuid: string): Promise<string> {
    // GET file content
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (2 weeks)
**Goal:** Basic download-only sync

**Deliverables:**
1. ✅ File System Access API integration
2. ✅ Workspace configuration UI
3. ✅ Download sync (pull all projects)
4. ✅ Project structure creation (AGENTS.md, context/, metadata)
5. ✅ MD5 change detection
6. ✅ Sync status display
7. ✅ Basic error handling

**Success Criteria:**
- User can configure workspace folder
- Clicking "Sync" downloads all projects with proper structure
- Subsequent syncs only update changed files

---

### Phase 2: Bidirectional Sync (2 weeks)
**Goal:** Two-way sync with conflict resolution

**Deliverables:**
1. ✅ Upload sync (push local changes)
2. ✅ Conflict detection
3. ✅ Conflict resolution strategies (remote/local/newer)
4. ✅ Dry-run mode
5. ✅ Diff viewer
6. ✅ Manual conflict resolution UI

**Success Criteria:**
- User can edit files locally and sync back to Claude.ai
- Conflicts are detected and resolved per strategy
- Dry-run shows preview without executing

---

### Phase 3: Automation (1-2 weeks)
**Goal:** Background auto-sync

**Deliverables:**
1. ✅ Auto-sync on schedule (chrome.alarms)
2. ✅ Sync interval settings
3. ✅ Background sync without UI blocking
4. ✅ Sync notifications
5. ✅ Error recovery (retry failed syncs)

**Success Criteria:**
- Workspace syncs automatically every N minutes
- User gets notified of sync results
- Errors are logged and retried

---

### Phase 4: Advanced Features (1-2 weeks)
**Goal:** Chat sync, selective sync, polish

**Deliverables:**
1. ✅ Chat conversation sync
2. ✅ Selective sync (exclude projects)
3. ✅ Conflict history log
4. ✅ Export diff reports
5. ✅ Performance optimizations

**Success Criteria:**
- Users can sync chats to local files
- Users can exclude projects from sync
- All sync operations are fast and efficient

---

## UX/UI Best Practices

### Settings Modal Flow

1. **First-Time Setup:**
   ```
   [Welcome to Eidolon Sync!]

   Connect your Claude.ai projects with a local folder
   for seamless synchronization.

   [ Choose Workspace Folder ]

   Your projects will be synced to:
   ~/ClaudeProjects/

   [✓] Download all projects now
   [✓] Enable auto-sync (every 15 minutes)

   [ Start Syncing ]  [ Skip for Now ]
   ```

2. **Sync Configuration:**
   ```
   [⚙ Sync Settings]

   Workspace: ~/ClaudeProjects/  [Change]

   Sync Mode:
   ( ) Download only (safe)
   (•) Bidirectional (sync local changes)

   Auto-Sync: [✓] Enabled
   Interval: [15 minutes ▾]

   Include Chats: [✓]

   Conflict Resolution:
   (•) Keep remote version (safest)
   ( ) Keep local version
   ( ) Keep newer version

   [ Save ]  [ Cancel ]
   ```

3. **Sync In Progress:**
   ```
   [↻ Syncing Workspace...]

   Progress: ████████░░ 80% (12/15 projects)

   Currently syncing: "AI Research Project"
   - Downloaded 3 files
   - Uploaded 1 file

   [ View Details ]  [ Cancel ]
   ```

4. **Sync Complete:**
   ```
   [✓ Sync Complete!]

   Results:
   ✓ 12 projects up to date
   ↓ 8 files downloaded
   ↑ 2 files uploaded
   ⚠ 1 conflict resolved (kept remote)

   Last synced: Just now

   [ OK ]  [ View Diff Report ]
   ```

### Dashboard Integration

**New "Sync" Tab:**
- Workspace status at top
- Sync controls (sync now, preview, settings)
- Recent sync history log
- Quick access to workspace folder

**Project Cards Enhancement:**
- Add sync status indicator: ✓ (synced), ↻ (syncing), ⚠ (conflict), ✗ (error)
- Show last sync timestamp
- Add "Open in Folder" button (opens local project folder)

### Popup Integration

**Add Sync Status:**
```
[Status Bar]
● Connected | 📁 Workspace synced 5m ago
```

**Add Quick Action:**
```
[Quick Actions]
[↻ Sync Now]  [👁 View Workspace]
```

---

## Security Considerations

1. **File System Access:**
   - User explicitly grants permission via browser prompt
   - Only access to chosen workspace folder (sandboxed)
   - No access to other filesystem locations

2. **Session Keys:**
   - Continue using existing secure storage
   - Validate session before every sync

3. **File Content:**
   - Never execute or eval file contents
   - Treat all files as data (read/write only)

4. **Error Handling:**
   - Graceful failures (don't corrupt workspace)
   - Rollback on errors (transactional operations)
   - Clear error messages to user

---

## Performance Considerations

1. **Incremental Sync:**
   - Only sync changed files (MD5 comparison)
   - Skip identical files (saves bandwidth & time)

2. **Batch Operations:**
   - Upload/download files in parallel (with rate limiting)
   - Use progress bars for long operations

3. **Caching:**
   - Cache file hashes to avoid recomputing
   - Cache project metadata to reduce API calls

4. **Throttling:**
   - Respect Claude.ai API rate limits
   - Add exponential backoff for retries

---

## Testing Strategy

### Unit Tests
- MD5 hash computation
- Project name sanitization
- Conflict resolution logic
- File change detection

### Integration Tests
- Full download sync flow
- Bidirectional sync with conflicts
- Dry-run mode accuracy
- Error recovery

### Manual Testing
- Configure workspace
- Sync 100+ projects
- Edit files locally → sync
- Test conflict scenarios
- Test error conditions (network failure, permission denied)

---

## Success Metrics

1. **Adoption:**
   - % of users who enable sync
   - Average workspace size (# projects)

2. **Performance:**
   - Time to complete first sync
   - Time to complete incremental sync
   - Sync success rate

3. **Reliability:**
   - Error rate
   - Conflict resolution success
   - User satisfaction

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser compatibility | High | Graceful degradation, detect File System Access API support |
| Large workspace performance | Medium | Incremental sync, pagination, progress indicators |
| Conflict resolution complexity | Medium | Start with simple strategies (remote/local), add smarter logic later |
| User confusion (new concept) | Medium | Clear onboarding, documentation, tooltips |
| Data loss (bug in sync) | High | Backup before destructive operations, dry-run mode |

---

## Open Questions

1. **Firefox Support:** File System Access API not fully supported. Use polyfill or require Chrome?
2. **Mobile:** No File System Access API on mobile. Skip mobile support?
3. **Large Files:** Should we limit file size? Claude.ai already has limits.
4. **Binary Files:** Support or text-only? Claude.ai is text-focused.

---

## Next Steps

1. ✅ Review this plan with stakeholders
2. ✅ Create detailed technical specs for Phase 1
3. ✅ Set up File System Access API test environment
4. ✅ Implement workspace configuration UI
5. ✅ Begin Phase 1 implementation

---

## Conclusion

This simplified, Google Drive-style sync approach is:
- ✅ **Simple:** One workspace, automatic sync, minimal configuration
- ✅ **Powerful:** Bidirectional, conflict resolution, dry-run
- ✅ **User-Friendly:** Clear status, easy setup, fail-safe
- ✅ **Maintainable:** Clean architecture, well-tested, documented

By focusing on workspace-wide sync rather than per-project management, we avoid complexity while delivering the core value users need: seamless local/remote file synchronization for ALL their Claude.ai projects.

**Last Modified**: 2025-10-14
