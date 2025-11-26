# Feature Discovery & Prioritization

**Generated:** 2025-11-26  
**Source:** Analysis of example-extensions documentation

---

## Executive Summary

Based on comprehensive analysis of Tampermonkey export scripts, Echoes extension, and the Official Claude extension, we've identified **18 potential features** for Eidolon organized into 6 categories. Features are prioritized using a 2×2 matrix of **Impact** (user value) vs **Lift** (implementation effort).

**Quick Wins (High Impact, Low Lift):** 5 features  
**Strategic Bets (High Impact, High Lift):** 4 features  
**Nice-to-Haves (Low Impact, Low Lift):** 5 features  
**Avoid (Low Impact, High Lift):** 4 features

---

## Priority Matrix

```
                Impact
                  ↑
    ┌─────────────┼─────────────┐
    │             │             │
    │  Strategic  │ Quick Wins  │
High│    Bets     │ ⭐ START    │
    │  (4 items)  │  (5 items)  │
    ├─────────────┼─────────────┤
    │             │             │
    │   Avoid     │ Nice-to-    │
Low │  (4 items)  │   Haves     │
    │             │  (5 items)  │
    └─────────────┼─────────────┘
              Low   Lift   High →
```

---

## 🎯 Quick Wins (Start Here!)

### 1. Conversation Export to Markdown/JSON
**Category:** Export & Backup  
**Impact:** ⭐⭐⭐⭐⭐ (Critical user need)  
**Lift:** ⭐⭐ (API already documented, straightforward implementation)

**Description:**  
Export conversations from Claude.ai to Markdown (with YAML frontmatter) and JSON formats with full message history, metadata, and conversation tree support.

**User Value:**
- Backup important conversations
- Share conversations outside Claude.ai
- Archive project discussions
- Enable offline access to AI interactions

**Technical Approach:**
```typescript
// Use discovered API endpoint
GET /api/organizations/{orgId}/chat_conversations/{convId}
  ?tree=true
  &rendering_mode=messages
  &render_all_tools=true

// Export formats
- Markdown with YAML frontmatter (compatible with Obsidian, Notion)
- JSON with full metadata
- LibreChat JSON (cross-tool compatibility)
```

**Implementation Path:**
1. Create `utils/export/` directory
2. Implement `markdownExporter.ts` (100 LOC)
3. Implement `jsonExporter.ts` (80 LOC)
4. Add export button to dashboard conversation list
5. Add format selection modal

**Effort Estimate:** 1-2 days  
**Dependencies:** Existing API client, conversation fetching

**References:**
- [Tampermonkey Export Methods](example-extensions/docs/tampermonkey-export-methods.md#export-formats)
- [API Endpoints - Conversations](example-extensions/docs/api-endpoints.md#get-apiorganizationsorgidchat_conversationsconversationid)

---

### 2. Side Panel UI (Chrome Side Panel API)
**Category:** UX Enhancement  
**Impact:** ⭐⭐⭐⭐⭐ (Significantly better UX)  
**Lift:** ⭐⭐ (Modern Chrome API, well-documented)

**Description:**  
Replace popup-only interface with Chrome's Side Panel API for persistent, always-accessible project management alongside browsing.

**User Value:**
- No tab clutter
- Persistent state across pages
- Larger workspace for project management
- Side-by-side browsing + project access
- Better keyboard shortcut UX

**Technical Approach:**
```typescript
// manifest.json
{
  "permissions": ["sidePanel"],
  "side_panel": {
    "default_path": "dashboard/index.html"
  },
  "commands": {
    "toggle-side-panel": {
      "suggested_key": {
        "default": "Ctrl+Shift+D",
        "mac": "Command+Shift+D"
      }
    }
  }
}

// background.ts
browser.sidePanel.setPanelBehavior({ 
  openPanelOnActionClick: true 
});
```

**Implementation Path:**
1. Add `sidePanel` permission to manifest
2. Configure side panel in manifest
3. Update dashboard to work in side panel context
4. Add keyboard shortcut handler
5. Maintain backward compatibility with popup

**Effort Estimate:** 1 day  
**Dependencies:** None (purely additive)

**References:**
- [Claude Official Extension - Side Panel](example-extensions/docs/claude-official-extension.md#1-side-panel-integration)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)

---

### 3. Enhanced File Upload (Drag & Drop, Multi-file)
**Category:** File Management  
**Impact:** ⭐⭐⭐⭐ (Major usability improvement)  
**Lift:** ⭐⭐ (Standard browser APIs)

**Description:**  
Improve file upload UX with drag-and-drop, multi-file selection, upload progress indicators, and file preview.

**User Value:**
- Faster file uploads (drag from desktop)
- Bulk file upload for documentation projects
- Visual feedback during upload
- Preview files before uploading

**Technical Approach:**
```typescript
// Drag & Drop API
dropzone.addEventListener('drop', async (e) => {
  const files = Array.from(e.dataTransfer.files);
  await uploadMultipleFiles(projectId, files);
});

// Progress tracking
for (const file of files) {
  await uploadWithProgress(file, (progress) => {
    updateProgressBar(file.name, progress);
  });
}
```

**Implementation Path:**
1. Add drop zone to dashboard project view
2. Implement multi-file selection in file dialog
3. Add upload progress UI component
4. Add file preview (for text files)
5. Handle upload errors gracefully

**Effort Estimate:** 1 day  
**Dependencies:** Existing upload API

---

### 4. Project Templates
**Category:** Project Management  
**Impact:** ⭐⭐⭐⭐ (Speeds up project creation)  
**Lift:** ⭐⭐ (CRUD operations + UI)

**Description:**  
Pre-defined project templates with boilerplate files and instructions for common use cases (documentation, coding, research, etc.).

**User Value:**
- Instant project setup for common workflows
- Consistent project structure
- Onboarding for new users
- Best practices encoded in templates

**Template Examples:**
1. **Software Project** - README.md, ARCHITECTURE.md, TODO.md, custom instructions
2. **Research Project** - SOURCES.md, NOTES.md, SUMMARY.md
3. **Writing Project** - OUTLINE.md, DRAFTS/, FINAL/
4. **Data Analysis** - DATA/, SCRIPTS/, RESULTS.md
5. **Learning** - TOPICS.md, EXERCISES.md, RESOURCES.md

**Technical Approach:**
```typescript
interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  files: Array<{
    name: string;
    content: string;
  }>;
  instructions?: string;
}

async function createFromTemplate(
  templateId: string, 
  projectName: string
): Promise<Project> {
  const template = templates.find(t => t.id === templateId);
  const project = await createProject(projectName, template.description);
  
  for (const file of template.files) {
    await uploadFile(project.id, file.name, file.content);
  }
  
  if (template.instructions) {
    await updateProjectInstructions(project.id, template.instructions);
  }
  
  return project;
}
```

**Implementation Path:**
1. Define template schema in `utils/templates/types.ts`
2. Create default templates in `utils/templates/defaults.ts`
3. Add template selection UI to "Create Project" flow
4. Implement template application logic
5. Allow custom template creation (future)

**Effort Estimate:** 1-2 days  
**Dependencies:** Existing project/file APIs

---

### 5. Conversation Search
**Category:** Search & Discovery  
**Impact:** ⭐⭐⭐⭐ (Essential for large conversation histories)  
**Lift:** ⭐⭐ (Existing search patterns, new data source)

**Description:**  
Full-text search across conversation history with filters (date, project, keywords).

**User Value:**
- Find past conversations quickly
- Search by keywords or phrases
- Filter by project association
- Date range filtering

**Technical Approach:**
```typescript
// Reuse existing search service
import { SearchService } from './utils/search/searchService';

const conversationSearch = new SearchService();

// Index conversations
for (const conv of conversations) {
  conversationSearch.indexDocument({
    id: conv.uuid,
    title: conv.name,
    content: conv.name, // Add message content in future
    metadata: {
      created_at: conv.created_at,
      project_uuid: conv.project_uuid
    }
  });
}

// Search with filters
const results = conversationSearch.search('keyword', {
  filters: {
    project_uuid: 'proj-123',
    date_from: '2024-01-01'
  }
});
```

**Implementation Path:**
1. Extend `SearchService` for conversations
2. Add conversation indexing on load
3. Add search bar to dashboard conversations tab
4. Implement filter UI (date picker, project dropdown)
5. Add search result highlighting

**Effort Estimate:** 1-2 days  
**Dependencies:** Existing search service

---

## 🚀 Strategic Bets (High Value, Higher Effort)

### 6. Multi-Platform Support (ChatGPT, Gemini)
**Category:** Platform Integration  
**Impact:** ⭐⭐⭐⭐⭐ (Massive market expansion)  
**Lift:** ⭐⭐⭐⭐ (Multiple platform integrations, API differences)

**Description:**  
Extend Eidolon to work with ChatGPT and Gemini, not just Claude.ai, with unified project management across platforms.

**User Value:**
- Manage all AI conversations in one place
- Cross-platform project knowledge bases
- Use best AI for each task
- Avoid vendor lock-in

**Technical Approach:**
```typescript
// Platform abstraction
interface AIPlatform {
  name: 'claude' | 'chatgpt' | 'gemini';
  authenticate(): Promise<Session>;
  getConversations(): Promise<Conversation[]>;
  getProjects(): Promise<Project[]>;
  uploadFile(projectId: string, file: File): Promise<void>;
}

// Platform implementations
class ClaudePlatform implements AIPlatform { ... }
class ChatGPTPlatform implements AIPlatform { ... }
class GeminiPlatform implements AIPlatform { ... }

// Platform factory
const platform = PlatformFactory.create(
  detectPlatform(window.location.hostname)
);
```

**Implementation Path:**
1. Create `utils/platforms/` abstraction layer
2. Refactor existing code to use platform interface
3. Implement ChatGPT platform (REST API)
4. Implement Gemini platform (DOM-based)
5. Add platform switcher to dashboard
6. Handle cross-platform sync challenges

**Effort Estimate:** 2-3 weeks  
**Dependencies:** Platform APIs, content scripts

**Challenges:**
- ChatGPT: Different project model (no native projects)
- Gemini: No public API (requires DOM scraping)
- Authentication differences
- API rate limiting variations

**References:**
- [Echoes Extension - Platform Support](example-extensions/docs/echoes-extension.md#platform-support)
- [Tampermonkey - Multi-Platform](example-extensions/docs/tampermonkey-export-methods.md#3-multi-platform-exporter-revivalstack)

---

### 7. Web Worker-Based Search
**Category:** Performance  
**Impact:** ⭐⭐⭐⭐ (Significantly better search experience)  
**Lift:** ⭐⭐⭐⭐ (Web Worker setup, index migration)

**Description:**  
Move search indexing and querying to Web Worker for non-blocking, high-performance full-text search with stemming and TF-IDF ranking.

**User Value:**
- Instant search results (no UI freezing)
- Search while doing other tasks
- Better search relevance (TF-IDF)
- Handle large project collections

**Technical Approach:**
```typescript
// Main thread
const searchWorker = new Worker('indexWorker.js');

searchWorker.postMessage({
  type: 'INDEX',
  data: { id: projectId, content: projectContent }
});

searchWorker.addEventListener('message', (e) => {
  if (e.data.type === 'RESULTS') {
    displaySearchResults(e.data.results);
  }
});

// Worker thread (indexWorker.js)
class SearchIndexWorker {
  private index = new Map<string, Set<string>>();
  
  indexDocument(doc: Document) {
    const tokens = this.tokenize(doc.content);
    const stemmed = tokens.map(t => this.stem(t));
    
    stemmed.forEach(token => {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token)!.add(doc.id);
    });
  }
  
  search(query: string): SearchResult[] {
    // TF-IDF ranking implementation
  }
}
```

**Implementation Path:**
1. Create `utils/search/indexWorker.ts`
2. Implement tokenization and stemming
3. Build inverted index structure
4. Implement TF-IDF ranking algorithm
5. Migrate existing search to use worker
6. Add progress indicators for indexing

**Effort Estimate:** 1-2 weeks  
**Dependencies:** None

**References:**
- [Echoes Extension - Search System](example-extensions/docs/echoes-extension.md#search-system)

---

### 8. Conversation Tree Export
**Category:** Export & Backup  
**Impact:** ⭐⭐⭐⭐ (Power user feature)  
**Lift:** ⭐⭐⭐ (Complex tree traversal)

**Description:**  
Export entire conversation trees including all branches, not just the current active path.

**User Value:**
- Preserve full conversation history
- Export "what-if" scenarios explored
- Research documentation completeness
- AI conversation archaeology

**Technical Approach:**
```typescript
// Use tree parameter
const conversation = await apiClient.getConversation(
  orgId, 
  convId, 
  { tree: true }
);

// Recursive tree traversal
function exportTree(node: ConversationNode): string {
  let markdown = `### ${node.message.sender}\n\n${node.message.content}\n\n`;
  
  if (node.children.length > 1) {
    markdown += `**Branches (${node.children.length}):**\n\n`;
  }
  
  node.children.forEach((child, i) => {
    if (node.children.length > 1) {
      markdown += `#### Branch ${i + 1}\n\n`;
    }
    markdown += exportTree(child);
  });
  
  return markdown;
}
```

**Implementation Path:**
1. Add tree parameter to conversation fetch
2. Implement tree traversal algorithm
3. Design branch visualization in export
4. Add "Export Tree" vs "Export Current Path" option
5. Handle large trees efficiently

**Effort Estimate:** 3-5 days  
**Dependencies:** Conversation export feature

**References:**
- [Tampermonkey - Tree Export](example-extensions/docs/tampermonkey-export-methods.md#1-claude-chat-exporter)

---

### 9. Label/Tag System
**Category:** Organization  
**Impact:** ⭐⭐⭐⭐ (Better organization at scale)  
**Lift:** ⭐⭐⭐ (New data model, UI components)

**Description:**  
Color-coded tagging system for projects and conversations with bulk operations and filter-by-tag.

**User Value:**
- Organize projects by topic, status, priority
- Quick visual identification
- Filter by multiple tags
- Bulk tag operations

**Technical Approach:**
```typescript
interface Tag {
  id: string;
  name: string;
  color: string; // Hex color code
  description?: string;
}

interface Taggable {
  tags: string[]; // Array of tag IDs
}

// Store in chrome.storage.local
{
  tags: {
    [tagId]: Tag
  },
  projectTags: {
    [projectId]: string[] // Array of tag IDs
  },
  conversationTags: {
    [conversationId]: string[]
  }
}
```

**Implementation Path:**
1. Design tag data model
2. Implement tag CRUD in `utils/tags/tagsService.ts`
3. Add tag management UI (create, edit, delete)
4. Add tag selector to project/conversation UI
5. Implement tag-based filtering
6. Add bulk tag operations

**Effort Estimate:** 1 week  
**Dependencies:** None

**References:**
- [Echoes Extension - Smart Labeling](example-extensions/docs/echoes-extension.md#2-smart-labeling)

---

## 📦 Nice-to-Haves (Low Effort Polish)

### 10. Keyboard Shortcuts Palette
**Category:** UX Enhancement  
**Impact:** ⭐⭐⭐ (Power user delight)  
**Lift:** ⭐ (Simple modal + event handlers)

**Description:**  
Command palette (Cmd/Ctrl+K) for quick actions via keyboard.

**Shortcuts:**
- `Ctrl+K` - Open command palette
- `Ctrl+N` - New project
- `Ctrl+U` - Upload file
- `Ctrl+E` - Export current item
- `Ctrl+F` - Focus search
- `Ctrl+/` - Show shortcuts help

**Effort Estimate:** 1 day

---

### 11. Dark Mode Toggle
**Category:** UX Enhancement  
**Impact:** ⭐⭐⭐ (User preference)  
**Lift:** ⭐ (CSS variables + toggle)

**Description:**  
Dark theme option with system preference detection.

**Effort Estimate:** 0.5 days

---

### 12. File Preview (Text Files)
**Category:** File Management  
**Impact:** ⭐⭐⭐ (Convenient for quick checks)  
**Lift:** ⭐ (Modal with syntax highlighting)

**Description:**  
Preview text files without downloading. Add syntax highlighting for code.

**Effort Estimate:** 1 day

---

### 13. Recent Items Quick Access
**Category:** Navigation  
**Impact:** ⭐⭐⭐ (Faster navigation)  
**Lift:** ⭐ (Storage + UI list)

**Description:**  
Show recently accessed projects, files, and conversations in popup/sidebar.

**Effort Estimate:** 0.5 days

---

### 14. Bulk Operations (Select All, Delete Selected)
**Category:** Data Management  
**Impact:** ⭐⭐⭐ (Efficiency for cleanup)  
**Lift:** ⭐ (Checkbox UI + batch API calls)

**Description:**  
Multi-select with bulk delete, export, or tag operations.

**Effort Estimate:** 1 day

---

## ❌ Avoid (Low ROI)

### 15. Native Desktop App
**Category:** Platform Expansion  
**Impact:** ⭐⭐ (Limited vs browser extension)  
**Lift:** ⭐⭐⭐⭐⭐ (Electron, packaging, distribution)

**Reason to Avoid:** Browser extension already works everywhere, desktop app adds complexity with little unique value.

---

### 16. Mobile App
**Category:** Platform Expansion  
**Impact:** ⭐⭐ (Limited use case on mobile)  
**Lift:** ⭐⭐⭐⭐⭐ (React Native, app stores)

**Reason to Avoid:** AI chat interfaces are primarily desktop workflows. Mobile browser works adequately.

---

### 17. Real-time Collaboration
**Category:** Collaboration  
**Impact:** ⭐⭐ (Niche use case)  
**Lift:** ⭐⭐⭐⭐⭐ (WebSocket, conflict resolution, UI)

**Reason to Avoid:** Projects are typically single-user. Complexity far exceeds demand.

---

### 18. AI-Powered Features (Summarization, etc.)
**Category:** AI Enhancement  
**Impact:** ⭐⭐ (Users already have AI access)  
**Lift:** ⭐⭐⭐⭐ (AI integration, costs, quality)

**Reason to Avoid:** Users are already using Claude/ChatGPT. Eidolon should focus on project management, not duplicate AI features.

---

## Implementation Roadmap

### Phase 1: Foundation (Sprint 1-2, 2 weeks)
**Goal:** Core export and UX improvements

1. ✅ **Conversation Export** (2 days) - Markdown + JSON
2. ✅ **Side Panel UI** (1 day) - Better UX paradigm
3. ✅ **Enhanced File Upload** (1 day) - Drag & drop, multi-file
4. ✅ **Project Templates** (2 days) - Faster project setup
5. ✅ **Conversation Search** (2 days) - Essential discovery tool

**Deliverable:** Eidolon v2.0 with export, side panel, and better file management

---

### Phase 2: Scale (Sprint 3-4, 2 weeks)
**Goal:** Performance and organization at scale

6. ✅ **Web Worker Search** (1 week) - Non-blocking search
7. ✅ **Label System** (1 week) - Color-coded organization
8. ✅ **Conversation Tree Export** (3 days) - Full history preservation

**Deliverable:** Eidolon v2.5 with advanced search and organization

---

### Phase 3: Expansion (Sprint 5-8, 4 weeks)
**Goal:** Multi-platform support

9. ✅ **Multi-Platform Support** (3 weeks) - ChatGPT + Gemini
   - Week 1: Platform abstraction + ChatGPT
   - Week 2: Gemini + testing
   - Week 3: Cross-platform sync + polish

**Deliverable:** Eidolon v3.0 - Universal AI Project Manager

---

### Phase 4: Polish (Sprint 9, 1 week)
**Goal:** Nice-to-have features

10. ✅ **Keyboard Shortcuts** (1 day)
11. ✅ **Dark Mode** (0.5 days)
12. ✅ **File Preview** (1 day)
13. ✅ **Recent Items** (0.5 days)
14. ✅ **Bulk Operations** (1 day)

**Deliverable:** Eidolon v3.5 - Polished experience

---

## Success Metrics

### Phase 1 Success Criteria
- **Export Feature:** 50%+ of active users export at least one conversation
- **Side Panel:** 70%+ of users switch from popup to side panel
- **File Upload:** 40% faster average upload time with multi-file
- **Templates:** 60%+ of new projects use templates
- **Search:** Average search completes in <100ms

### Phase 2 Success Criteria
- **Web Worker Search:** Search 10,000+ items with <200ms latency
- **Labels:** 40%+ of users create custom labels
- **Tree Export:** 10%+ of exports include full tree

### Phase 3 Success Criteria
- **Multi-Platform:** 30%+ of users manage ChatGPT + Claude projects
- **Cross-Platform:** Users maintain projects across 2+ platforms

---

## Risk Assessment

### Technical Risks

**Risk 1: API Changes**
- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:** Version API clients, add fallback methods, monitor API changes

**Risk 2: Browser Compatibility**
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:** Test Firefox + Chrome, use polyfills, WXT framework handles differences

**Risk 3: Performance with Large Datasets**
- **Likelihood:** Medium
- **Impact:** Medium
- **Mitigation:** Web Worker for search, pagination, lazy loading

### Market Risks

**Risk 1: Official Claude Extension Feature Parity**
- **Likelihood:** High
- **Impact:** Medium
- **Mitigation:** Focus on project management (Eidolon's strength), not core chat features

**Risk 2: Multi-Platform Complexity**
- **Likelihood:** High
- **Impact:** High
- **Mitigation:** Phase approach, start with ChatGPT (has API), defer Gemini if needed

---

## Competitive Analysis

### Eidolon vs Competitors

| Feature | Eidolon Current | Official Claude | Echoes | After Phase 1 | After Phase 3 |
|---------|-----------------|-----------------|--------|---------------|---------------|
| **Project Management** | ✅ Advanced | ⚠️ Basic | ❌ None | ✅ Advanced | ✅ Advanced |
| **File Sync** | ✅ Bidirectional | ❌ None | ❌ None | ✅ Enhanced | ✅ Enhanced |
| **Export** | ❌ None | ❌ None | ✅ Yes | ✅ Advanced | ✅ Advanced |
| **Search** | ⚠️ Basic | ❌ None | ✅ Advanced | ✅ Advanced | ✅ Advanced |
| **Multi-Platform** | ❌ Claude only | ❌ Claude only | ✅ 5 platforms | ❌ Claude only | ✅ 3 platforms |
| **Side Panel** | ❌ Popup only | ✅ Yes | ❌ Popup only | ✅ Yes | ✅ Yes |
| **Tags/Labels** | ⚠️ Basic | ❌ None | ✅ Advanced | ⚠️ Basic | ✅ Advanced |

**Competitive Advantage After Phase 1:** Best project management + export  
**Competitive Advantage After Phase 3:** Only tool with advanced project management across multiple AI platforms

---

## Next Steps

1. **Review & Approve** this feature discovery document
2. **Choose Phase** to begin (recommend Phase 1)
3. **Create Feature Branches** for each feature
4. **Run `/speckit.specify`** for chosen features
5. **Begin Implementation** with Quick Wins

---

**Questions? Feedback?** Update this document and share with the team.

*Generated by OpenCode based on comprehensive analysis of example-extensions documentation.*
