# Feature: Inline Conversation Export

**Date:** 2025-11-26  
**Status:** Proposed  
**Priority:** High (Quick Win)  
**Effort:** 8-12 hours (1-1.5 days)

---

## Problem Statement

**Current State:**  
Eidolon has conversation export in the dashboard, but users must leave claude.ai to use it. This breaks flow and requires context switching.

**Desired State:**  
Export conversations directly from claude.ai chat pages with an inline UI, similar to AI Chat Exporter userscripts but better integrated.

**User Pain Points:**
1. ❌ Must open dashboard to export (context switch)
2. ❌ Can't export while actively chatting
3. ❌ No selective message export
4. ❌ No conversation preview/outline

---

## Inspiration: AI Chat Exporter Analysis

The RevivalStack userscript provides excellent UX patterns:

**What Works Well:**
- ✅ Floating export buttons (always accessible)
- ✅ Collapsible outline showing conversation structure
- ✅ Selective export (checkboxes for each message)
- ✅ Real-time updates as conversation grows
- ✅ Multiple format support (MD, JSON)

**What Could Be Better:**
- ⚠️ Fixed bottom-right position can cover chat input
- ⚠️ Not integrated with Claude's design language
- ⚠️ No integration with project management

---

## Proposed Solution

### Core Features

1. **Inline Export UI on claude.ai**
   - Content script injects UI into conversation pages
   - Top-right positioning (doesn't cover input)
   - Collapsible panel design
   - Matches Claude.ai theme (light/dark)

2. **Conversation Outline**
   - Shows list of user messages with checkboxes
   - Search/filter messages
   - Select all / deselect all
   - Message count indicator
   - Scroll to message on click

3. **Export Options**
   - 📄 Export as Markdown (YAML frontmatter)
   - 📋 Export as JSON (full metadata)
   - 📁 Export to Eidolon Project (direct upload)

4. **Smart Positioning**
   - Default: Top-right (out of the way)
   - Alternative: Make draggable (future enhancement)
   - Persists position preference

---

## Technical Design

### Architecture

```
claude.ai Page
├── Claude Chat UI (existing)
└── Eidolon Export Panel (injected)
    ├── Header (title + collapse button)
    ├── Outline Panel (collapsible)
    │   ├── Search input
    │   ├── Select all checkbox
    │   └── Message list (checkboxes)
    └── Action Buttons
        ├── Export Markdown
        ├── Export JSON
        └── Export to Project
```

### File Structure

```
entrypoints/
└── claude-export.content.ts    # New content script

utils/
└── export/                      # New directory
    ├── extractors.ts           # Conversation extraction
    ├── formatters.ts           # Markdown/JSON generation
    ├── ui.ts                   # UI component builder
    └── types.ts                # Export-related types
```

### Content Script Setup

**File:** `entrypoints/claude-export.content.ts`

```typescript
export default defineContentScript({
  matches: ['https://claude.ai/chat/*'],
  
  main() {
    // Wait for page load
    waitForConversationLoad().then(() => {
      injectExportUI();
      observeConversationChanges();
    });
  }
});

function isConversationPage(): boolean {
  return window.location.pathname.startsWith('/chat/');
}

function getConversationId(): string | null {
  const match = window.location.pathname.match(/\/chat\/([^/?]+)/);
  return match ? match[1] : null;
}
```

### UI Implementation

**Strategy:** Use Shadow DOM for style isolation

```typescript
// utils/export/ui.ts
export class ExportUIManager {
  private shadow: ShadowRoot;
  private isCollapsed: boolean = false;
  
  constructor() {
    this.createContainer();
    this.injectStyles();
    this.buildUI();
    this.attachEventListeners();
  }
  
  private createContainer() {
    const container = document.createElement('div');
    container.id = 'eidolon-export-root';
    document.body.appendChild(container);
    
    this.shadow = container.attachShadow({ mode: 'open' });
  }
  
  private buildUI() {
    const panel = document.createElement('div');
    panel.className = 'export-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Export Conversation</span>
        <button class="collapse-btn" aria-label="Collapse">▼</button>
      </div>
      
      <div class="panel-body">
        <div class="outline-section">
          <div class="search-bar">
            <input type="text" placeholder="Search messages..." />
          </div>
          
          <div class="select-all">
            <label>
              <input type="checkbox" checked />
              <span>Select All (0 messages)</span>
            </label>
          </div>
          
          <div class="message-list">
            <!-- Populated dynamically -->
          </div>
        </div>
        
        <div class="actions">
          <button class="btn btn-primary" data-format="markdown">
            📄 Markdown
          </button>
          <button class="btn btn-primary" data-format="json">
            📋 JSON
          </button>
          <button class="btn btn-success" data-action="to-project">
            📁 To Project
          </button>
        </div>
      </div>
    `;
    
    this.shadow.appendChild(panel);
  }
  
  public updateMessageList(messages: Message[]) {
    const list = this.shadow.querySelector('.message-list');
    list.innerHTML = '';
    
    messages.filter(m => m.role === 'user').forEach((msg, idx) => {
      const item = document.createElement('div');
      item.className = 'message-item';
      item.innerHTML = `
        <label>
          <input type="checkbox" checked data-message-id="${msg.id}" />
          <span class="message-preview">
            ${idx + 1}. ${truncate(msg.content, 60)}
          </span>
        </label>
      `;
      list.appendChild(item);
    });
  }
}
```

### Conversation Extraction

**Hybrid Approach:** API first, DOM fallback

```typescript
// utils/export/extractors.ts
export async function extractConversation(): Promise<Conversation> {
  const conversationId = getConversationId();
  if (!conversationId) throw new Error('No conversation ID found');
  
  // Try API first
  try {
    return await fetchViaAPI(conversationId);
  } catch (error) {
    console.warn('API fetch failed, falling back to DOM:', error);
    return extractFromDOM();
  }
}

async function fetchViaAPI(convId: string): Promise<Conversation> {
  const response = await browser.runtime.sendMessage({
    action: 'get-conversation-details',
    conversationId: convId
  });
  
  if (!response.success) {
    throw new Error(response.error);
  }
  
  return response.data;
}

function extractFromDOM(): Conversation {
  const title = document.querySelector('h1')?.textContent || 'Untitled';
  const messages: Message[] = [];
  
  document.querySelectorAll('.font-user-message, .font-claude-message').forEach((elem, idx) => {
    const isUser = elem.classList.contains('font-user-message');
    const content = elem.textContent?.trim() || '';
    
    messages.push({
      id: `msg-${idx}`,
      role: isUser ? 'user' : 'assistant',
      content,
      timestamp: new Date().toISOString()
    });
  });
  
  return {
    id: getConversationId()!,
    title,
    messages,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
```

### Export Formatters

**Reuse existing code with enhancements**

```typescript
// utils/export/formatters.ts
export function formatAsMarkdown(
  conversation: Conversation,
  selectedMessageIds?: Set<string>
): string {
  // Filter messages if selective export
  const messages = selectedMessageIds 
    ? conversation.messages.filter(m => selectedMessageIds.has(m.id))
    : conversation.messages;
  
  // YAML frontmatter
  const yaml = `---
title: ${conversation.title}
date: ${conversation.created_at}
platform: claude
exporter: eidolon-v2.0
message_count: ${messages.length}
url: https://claude.ai/chat/${conversation.id}
---

`;
  
  // Markdown body
  let body = `# ${conversation.title}\n\n`;
  
  let userMsgCount = 0;
  messages.forEach(msg => {
    if (msg.role === 'user') {
      userMsgCount++;
      body += `## ${userMsgCount}. User\n\n${msg.content}\n\n`;
    } else {
      body += `### Assistant\n\n${msg.content}\n\n`;
      body += `---\n\n`;
    }
  });
  
  return yaml + body;
}

export function formatAsJSON(
  conversation: Conversation,
  selectedMessageIds?: Set<string>
): string {
  const messages = selectedMessageIds 
    ? conversation.messages.filter(m => selectedMessageIds.has(m.id))
    : conversation.messages;
  
  return JSON.stringify({
    ...conversation,
    messages,
    exporter: 'eidolon-v2.0',
    exported_at: new Date().toISOString()
  }, null, 2);
}
```

### Export to Project Flow

```typescript
async function exportToProject(conversation: Conversation) {
  // 1. Show project selector modal
  const modal = new ProjectSelectorModal();
  const projectId = await modal.show();
  
  if (!projectId) return; // User cancelled
  
  // 2. Generate markdown content
  const content = formatAsMarkdown(conversation);
  
  // 3. Generate filename
  const filename = `${sanitizeFilename(conversation.title)}_${formatDate(new Date())}.md`;
  
  // 4. Upload to project
  const response = await browser.runtime.sendMessage({
    action: 'upload-file',
    projectId,
    fileName: filename,
    content
  });
  
  if (response.success) {
    showToast('✅ Exported to project successfully!');
  } else {
    showToast('❌ Export failed: ' + response.error);
  }
}
```

---

## Implementation Plan

### Phase 1: Content Script & Basic UI (3-4 hours)

**Tasks:**
1. ✅ Create `entrypoints/claude-export.content.ts`
2. ✅ Implement conversation page detection
3. ✅ Create Shadow DOM container
4. ✅ Build basic panel UI (header + body + buttons)
5. ✅ Add collapse/expand functionality
6. ✅ Style to match Claude.ai theme

**Deliverable:** Collapsible panel appears on claude.ai chat pages

---

### Phase 2: Conversation Extraction (2-3 hours)

**Tasks:**
1. ✅ Create `utils/export/extractors.ts`
2. ✅ Implement API-based extraction
3. ✅ Implement DOM-based fallback extraction
4. ✅ Add background message handler for API calls
5. ✅ Test with various conversation types

**Deliverable:** Can extract conversation data reliably

---

### Phase 3: Export Functionality (2-3 hours)

**Tasks:**
1. ✅ Create `utils/export/formatters.ts`
2. ✅ Implement Markdown formatter with YAML
3. ✅ Implement JSON formatter
4. ✅ Add file download functionality
5. ✅ Add filename sanitization
6. ✅ Test export formats

**Deliverable:** Can export to Markdown and JSON files

---

### Phase 4: Selective Export & Outline (2-3 hours)

**Tasks:**
1. ✅ Populate message list with checkboxes
2. ✅ Implement "Select All" functionality
3. ✅ Add search/filter for messages
4. ✅ Track selected message IDs
5. ✅ Filter export based on selection
6. ✅ Add message count indicator

**Deliverable:** Users can select which messages to export

---

### Phase 5: Export to Project (2 hours)

**Tasks:**
1. ✅ Create project selector modal
2. ✅ Fetch user's projects list
3. ✅ Implement project selection UI
4. ✅ Connect to existing upload-file API
5. ✅ Add success/error notifications

**Deliverable:** Can export directly to Eidolon projects

---

### Phase 6: Polish & Testing (1-2 hours)

**Tasks:**
1. ✅ Add loading states
2. ✅ Improve error messages
3. ✅ Add keyboard shortcuts (Ctrl+Shift+E to toggle)
4. ✅ Test on light/dark theme
5. ✅ Test on different screen sizes
6. ✅ Update README with feature docs

**Deliverable:** Production-ready feature

---

## Success Criteria

### Functional Requirements
- ✅ UI appears on all claude.ai conversation pages
- ✅ Exports work for conversations with 1-1000 messages
- ✅ Selective export correctly filters messages
- ✅ Markdown exports render correctly in VS Code/Obsidian
- ✅ JSON exports are valid and complete
- ✅ "Export to Project" uploads to correct project

### Performance Requirements
- ✅ UI injection completes in <200ms
- ✅ Conversation extraction in <1s for typical conversations
- ✅ Export generation in <2s for conversations <500 messages
- ✅ No visible lag on Claude.ai page

### UX Requirements
- ✅ Panel is collapsible and remembers state
- ✅ Works in light and dark mode
- ✅ Doesn't cover Claude's chat input
- ✅ Mobile-responsive (future)
- ✅ Accessible (keyboard navigation, screen readers)

---

## Styling Reference

```css
/* Match Claude.ai colors */
:host {
  /* Light mode */
  --eidolon-bg: #ffffff;
  --eidolon-border: #e5e7eb;
  --eidolon-text: #1f2937;
  --eidolon-text-secondary: #6b7280;
  --eidolon-accent: #cc785c;
  --eidolon-accent-hover: #b8664e;
  
  /* Dark mode (prefers-color-scheme: dark) */
  --eidolon-bg-dark: #1f2937;
  --eidolon-border-dark: #374151;
  --eidolon-text-dark: #f3f4f6;
  --eidolon-text-secondary-dark: #9ca3af;
  --eidolon-accent-dark: #d4a574;
  --eidolon-accent-hover-dark: #c79560;
}

.export-panel {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 9999;
  width: 320px;
  background: var(--eidolon-bg);
  border: 1px solid var(--eidolon-border);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  font-family: system-ui, -apple-system, sans-serif;
  transition: all 0.3s ease;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--eidolon-border);
  cursor: pointer;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--eidolon-text);
}

.collapse-btn {
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
  padding: 4px;
  color: var(--eidolon-text-secondary);
}

.panel-body {
  max-height: 500px;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.panel-body.collapsed {
  max-height: 0;
}

/* ... more styles ... */
```

---

## Risks & Mitigations

### Risk 1: Claude.ai UI Changes Break DOM Extraction
**Mitigation:** Use API as primary method, DOM as fallback only

### Risk 2: Performance Impact on Claude Page
**Mitigation:** Use Shadow DOM, lazy load outline, throttle observers

### Risk 3: Positioning Conflicts with Claude UI
**Mitigation:** Top-right default, make draggable in future

---

## Future Enhancements

1. **Draggable positioning** - Let users move the panel
2. **Auto-export** - Save conversations automatically
3. **Conversation branches** - Export alternate paths
4. **Custom templates** - User-defined export formats
5. **Batch export** - Export multiple conversations
6. **Integration with workspace sync** - Auto-add to local folder

---

## Ready to Implement?

**Estimated Time:** 8-12 hours (1-1.5 days)  
**Risk Level:** Low (building on existing APIs)  
**User Value:** High (frequently requested feature)

**Next Steps:**
1. Create feature branch: `git checkout -b 002-inline-conversation-export`
2. Implement Phase 1-6 per plan above
3. Test thoroughly
4. Create PR with demo video

**Should I proceed with implementation?**
