# CLAUDE-activeContext.md

Current session state, goals, and progress for the Eidolon project.

## Project Status: Active Development

**Last Updated:** 2025-12-03

### Current State

Eidolon is a Chrome extension (Manifest V3) that integrates with Claude.ai for advanced project and knowledge management. Built using the WXT framework.

**Development Status:** Agent Mode Improved + Styles API Implemented
- Core extension features implemented
- Sidepanel with Claude-style UI completed
- Dark mode support added across all components
- Dynamic model fetching implemented
- **Agent Mode significantly improved** - ref-based clicking, focus action, retry logic
- **Styles API implemented** - Load/select/send personalized styles like claude.ai
- Build output: 468.77 kB
- **Next Phase:** Testing styles and agent mode

### Recent Session Progress (2025-12-03)

**Completed:**
1. **Agent Mode Improvements:**
   - Added `ref` parameter to `computer` tool for clicking by element reference
   - Added `focus` action for explicit element focusing before typing
   - Added `take_screenshot: false` option to skip automatic screenshots
   - Updated `accessibility-tree.content.ts` with persistent refs (`getOrCreateRef()`)
   - Improved tool parsing with multiple strategies (code blocks, inline JSON, auto-fix)
   - Enhanced `runAgenticLoop()` with retry logic, consecutive error tracking
   - Conversation history management (max 15 iterations, keeps last 20 messages)

2. **Textarea Auto-resize Bugfix:**
   - Quick action buttons now trigger textarea resize via `input.dispatchEvent()`

3. **Styles API Implementation:**
   - API endpoint: `GET /api/organizations/{orgId}/list_styles`
   - Added `StyleAttribute`, `PersonalizedStyle`, `StylesListResponse` types
   - Added `getStyles(orgId)` method in ClaudeAPIClient
   - Added `get-styles` message handler in background.ts
   - Updated `sendMessage()` to accept `personalizedStyles` parameter
   - Added styles state/UI in sidepanel (`loadStyles()`, `renderStylesList()`, etc.)
   - Styles persist in localStorage via `eidolon-style-key`
   - Added CSS for `.style-type-badge`, `.claude-menu-section-title`

### Previous Session Progress (2025-11-29)

**Completed:**
1. Fixed `defineContentScript` WXT import errors in content scripts
2. Added gif.js library to the project for GIF generation
3. Implemented Agent Mode in sidepanel with toggle UI
4. Created browser action execution from sidepanel
5. Added accessibility tree capture UI
6. Added CDP screenshot UI in sidepanel
7. Successfully built extension with all features

**New Files Created:**
- `entrypoints/accessibility-tree.content.ts` - Accessibility tree generation (428 lines)
- `entrypoints/agent-indicator.content.ts` - Visual feedback during agent actions (295 lines)
- `entrypoints/offscreen/main.ts` - GIF generation with action overlays (589 lines)
- `entrypoints/offscreen/index.html` - Offscreen document shell
- `utils/browser/cdp.ts` - CDP wrapper for screenshots/input (544 lines)
- `utils/browser/tools.ts` - High-level browser tools (487 lines)
- `utils/browser/tabGroups.ts` - Tab group management (421 lines)
- `utils/tasks/scheduler.ts` - Task scheduling system (300 lines)

**Modified Files:**
- `wxt.config.ts` - Added debugger, tabGroups, alarms, offscreen permissions
- `entrypoints/sidepanel/index.html` - Added agent mode UI elements
- `entrypoints/sidepanel/style.css` - Added agent mode styles
- `entrypoints/sidepanel/main.ts` - Added agent mode functions
- `public/gif.js` - gif.js library
- `public/gif.worker.js` - gif.js web worker

### Current Models (Updated)

```typescript
// entrypoints/sidepanel/main.ts
AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', default: true },
  { id: 'claude-opus-4-5-20250514', name: 'Claude Opus 4.5', default: false },
  { id: 'claude-haiku-4-5-20250514', name: 'Claude Haiku 4.5', default: false },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', default: false },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', default: false },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', default: false },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', default: false },
]
```

---

## Browser Agent Implementation Status

### Completed Features

| Feature | Status | File Location |
|---------|--------|---------------|
| CDP screenshot capture | Implemented | `utils/browser/cdp.ts:captureScreenshot()` |
| CDP mouse events | Implemented | `utils/browser/cdp.ts:click/drag/scroll()` |
| CDP keyboard events | Implemented | `utils/browser/cdp.ts:type/pressKey()` |
| Accessibility tree | Implemented | `entrypoints/accessibility-tree.content.ts` |
| Agent visual indicator | Implemented | `entrypoints/agent-indicator.content.ts` |
| Tab group management | Implemented | `utils/browser/tabGroups.ts` |
| Task scheduler | Implemented | `utils/tasks/scheduler.ts` |
| GIF generation | Implemented | `entrypoints/offscreen/main.ts` |
| Agent mode toggle | Implemented | `entrypoints/sidepanel/` |

### Background Message Handlers

```typescript
// entrypoints/background.ts - Available actions
'browser-take-screenshot'         // CDP screenshot
'browser-get-accessibility-tree'  // Get page structure
'browser-execute-action'          // Execute click/type/scroll
'browser-get-tabs'                // List tabs
'browser-create-tab-group'        // Create tab group
'show-agent-indicator'            // Show visual feedback
'hide-agent-indicator'            // Hide visual feedback
```

### Permissions (Updated wxt.config.ts)

```typescript
permissions: [
  'cookies', 'storage', 'contextMenus', 'tabs', 'activeTab',
  'notifications', 'sidePanel', 'scripting',
  'debugger',       // CDP access for screenshots, input simulation
  'tabGroups',      // Tab group management for sessions
  'alarms',         // Scheduled task execution
  'webNavigation',  // Navigation event monitoring
  'offscreen',      // Background media processing (GIF generation)
  'downloads',      // File downloads
  'system.display', // Display info for screenshots
]
```

---

## Testing Checklist

### Manual Testing Required

- [ ] Load extension in Chrome
- [ ] Open sidepanel from popup
- [ ] Enable agent mode toggle
- [ ] Test "Get Page Tree" button
- [ ] Test "Full Screenshot" (CDP) button
- [ ] Verify agent indicator shows on page
- [ ] Test stop agent button
- [ ] Test page capture functionality
- [ ] Test dark mode with agent features

### Known Issues to Watch

1. CDP debugger attachment requires user permission on first use
2. Agent indicator may not show on restricted pages (chrome://, etc.)
3. Accessibility tree generation may be slow on large pages

---

## Current File Structure

```
eidolon/
├── entrypoints/
│   ├── background.ts                    # Service worker + API client + browser tools
│   ├── popup/                           # Browser action popup
│   ├── dashboard/                       # Full-page dashboard (4000+ lines)
│   ├── sidepanel/                       # Claude-style sidepanel with agent mode
│   │   ├── index.html                   # UI with agent mode banner
│   │   ├── main.ts                      # Agent mode functions
│   │   └── style.css                    # Agent mode styles
│   ├── offscreen/                       # Offscreen document for media
│   │   ├── index.html                   # Loads gif.js
│   │   └── main.ts                      # GIF generation, audio playback
│   ├── accessibility-tree.content.ts    # DOM tree extraction
│   ├── agent-indicator.content.ts       # Visual feedback
│   ├── claude.content.ts                # Content script for Claude.ai
│   └── claude-export.content.ts         # Export functionality
├── utils/
│   ├── api/                             # Claude.ai API client
│   ├── browser/                         # Browser interaction tools
│   │   ├── cdp.ts                       # Chrome Debugger Protocol wrapper
│   │   ├── tools.ts                     # High-level tool functions
│   │   ├── tabGroups.ts                 # Tab group management
│   │   └── types.ts                     # TypeScript types
│   ├── tasks/                           # Task management
│   │   ├── scheduler.ts                 # Alarm-based scheduling
│   │   └── types.ts                     # Task types
│   ├── search/                          # Search service
│   ├── sync/                            # Workspace sync
│   └── tags/                            # Tagging system
├── public/
│   ├── gif.js                           # GIF generation library
│   └── gif.worker.js                    # GIF worker
└── example-extensions/
    └── Claude-Chrome-Web-Store/         # Official extension (reference)
```

---

## Development Commands

```bash
npm run dev              # Chrome dev mode
npm run dev:firefox      # Firefox dev mode
npm run build            # Build for Chrome
npm run build:firefox    # Build for Firefox
npm run zip              # Create distributable ZIP
```

---

## Next Steps

1. **Immediate:** Test Styles API - verify loading, selection, and sending with messages
2. **Next:** Test Agent Mode improvements - ref clicking, focus action, retry logic
3. **Then:** Fix any bugs found during testing
4. **After:** Consider native messaging for Claude Desktop integration

---

## Styles API Details

**Endpoint:** `GET /api/organizations/{orgId}/list_styles`

**Response Format:**
```json
{
  "default": [...],
  "custom": [...]
}
```

**Style Object Structure:**
```typescript
interface PersonalizedStyle {
  type: 'default' | 'custom';
  uuid: string;
  key: string;
  name: string;
  prompt: string;       // Full style instructions
  summary: string;
  isDefault: boolean;
  attributes: { name: string; percentage: number }[];
}
```

**Sending Styles:** Styles are sent in the completion request as `personalized_styles` array.

---

*This file tracks active development context. Update after significant changes or at session end.*
