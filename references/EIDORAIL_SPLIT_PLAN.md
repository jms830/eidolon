# Eidolon → Eidorail + Eidolon Sync: Architecture Split Plan

## Executive Summary

This document outlines the plan to split the current Eidolon browser extension into two focused extensions:

1. **Eidorail** - A SolidJS-based chat sidebar forked from OpenCode's web UI
2. **Eidolon Sync** - A vanilla TypeScript extension for conversation export and workspace synchronization

This separation enables:
- Direct integration with OpenCode's evolving web UI ecosystem
- Cleaner separation of concerns (chat vs. data management)
- Independent development and release cycles
- Smaller, more focused codebases

---

## Part 1: Repository Strategy

### Recommended Approach: Two Separate Repositories

#### Repository 1: `eidorail`
- **Purpose**: Chat sidebar extension (forked from OpenCode)
- **Origin**: Fork of `sst/opencode`, divergent product
- **Tech Stack**: SolidJS, Vite, TailwindCSS (matching OpenCode)
- **URL**: `github.com/[username]/eidorail`

#### Repository 2: `eidolon-sync`
- **Purpose**: Export, sync, and management extension
- **Origin**: Extracted from current `eidolon` repo
- **Tech Stack**: Vanilla TypeScript, WXT
- **URL**: `github.com/[username]/eidolon-sync`

#### What happens to current `eidolon` repo?
- **Recommended**: Rename to `eidolon-sync`, archive/remove chat sidebar code
- Keep git history for the sync-related code
- Tag final "unified" version before split for reference

### Fork Strategy for Eidorail

```
sst/opencode (upstream)
    └── packages/desktop (SolidJS web UI)
    └── packages/ui (shared components)
    └── packages/sdk (API client)
            │
            ▼ fork & customize
[username]/eidorail
    └── packages/extension (WXT browser extension wrapper)
    └── packages/desktop (modified from upstream)
    └── packages/ui (from upstream)
    └── packages/sdk (from upstream)
```

**Upstream Sync Strategy**:
- Track `sst/opencode` as upstream remote
- Periodically merge upstream changes to `packages/desktop` and `packages/ui`
- Keep Eidorail-specific changes in `packages/extension`
- Use git tags to mark stable sync points

---

## Part 2: Extension Responsibilities

### Eidorail (Chat Sidebar)

**Owns the sidepanel** - Only one extension can register a sidepanel per browser.

| Feature | Description |
|---------|-------------|
| OpenCode Web UI | Forked SolidJS chat interface |
| Terminal/PTY | `ghostty-web` terminal integration |
| Session Management | Create, list, switch sessions |
| Model Selection | Choose AI models |
| Project Switching | Select OpenCode projects |
| **Multi-platform Tab Bar** | **Top bar with iframe tabs for ChatGPT, Gemini, Perplexity, etc.** |
| Browser Context | Inject page content, screenshots into prompts |
| OpenCode Server Connection | Connect to `localhost:4096` |

**Multi-platform Tab Bar Detail**:
The current Eidolon top bar platform switcher will be preserved in Eidorail:
- Eidorail (OpenCode UI) as default/home view
- Claude Code iframe tab
- ChatGPT iframe tab  
- Gemini iframe tab
- Custom platform support (add Perplexity, DeepSeek, etc.)
- "+" button to add/manage platforms

**Permissions Required**:
- `sidePanel`
- `tabs`, `activeTab`
- `storage`
- `scripting` (for page context capture)
- `declarativeNetRequest` (for iframe header modification)
- Host permissions for iframe platforms

### Eidolon Sync (Export & Management)

**Owns popup and dashboard** - Full-page management interface.

| Feature | Description |
|---------|-------------|
| Claude.ai Export | Inject export button on conversation pages |
| ChatGPT Export | Inject export button |
| Gemini Export | Inject export button |
| Workspace Sync | Sync conversations to local filesystem |
| Conversation Backup | Store and manage exported conversations |
| Dashboard | Full-page UI for managing synced data |
| Account Management | Claude.ai account/org switching |
| Tags & Search | Organize and find conversations |
| Scheduled Sync | Auto-sync on intervals |

**Permissions Required**:
- `storage`
- `tabs`
- `downloads`
- `alarms` (scheduled tasks)
- `cookies` (Claude.ai auth)
- Host permissions for export platforms
- File System Access API (for local sync)

---

## Part 3: Cross-Extension Communication

### Communication Protocol

Extensions communicate via `chrome.runtime.sendMessage` with the other extension's ID.

```typescript
// In Eidorail - send to Eidolon Sync
chrome.runtime.sendMessage(
  EIDOLON_SYNC_EXTENSION_ID,
  { type: 'IMPORT_PROJECT', payload: { projectId: '...' } }
);

// In Eidolon Sync - listen for messages
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (sender.id === EIDORAIL_EXTENSION_ID) {
      // Handle message
    }
  }
);
```

### Communication Use Cases

| Priority | Use Case | Direction | Message Type |
|----------|----------|-----------|--------------|
| Low | Import Claude project | Sync → Eidorail | `IMPORT_PROJECT` |
| Low | Open synced conversation | Sync → Eidorail | `OPEN_CONVERSATION` |
| Low | Save current conversation | Eidorail → Sync | `SAVE_CONVERSATION` |
| Medium | Shared dark mode | Bidirectional | `SETTINGS_CHANGED` |

### Extension IDs

During development, extension IDs are dynamic. For production:
- Publish both extensions to Chrome Web Store
- Hardcode the stable extension IDs
- Or use `chrome.management.getAll()` to discover by name

---

## Part 4: Migration Plan

### Phase 1: Setup (Week 1)

1. **Fork OpenCode**
   ```bash
   # Fork sst/opencode to [username]/eidorail on GitHub
   git clone https://github.com/[username]/eidorail
   cd eidorail
   git remote add upstream https://github.com/sst/opencode.git
   ```

2. **Create Extension Wrapper**
   - Add `packages/extension` directory
   - Create WXT config for browser extension
   - Wire up SolidJS desktop app as sidepanel

3. **Verify OpenCode Web UI Works**
   - Build `packages/desktop`
   - Test in standalone browser
   - Test embedded in extension sidepanel

### Phase 2: Eidorail MVP (Week 2-3)

1. **Core Features**
   - Sidepanel with OpenCode web UI
   - Connect to local OpenCode server
   - Basic session management
   - Terminal integration

2. **Multi-platform Tab Bar**
   - Port existing platform switcher from Eidolon
   - Eidorail as home/default view
   - Iframe tabs for ChatGPT, Gemini, Claude Code
   - Platform add/remove/reorder functionality
   - Declarative net request rules for iframe embedding

3. **Browser Integration**
   - Page context capture (screenshot, text)
   - Current tab info injection

4. **Customizations**
   - Eidorail branding
   - Extension-specific settings UI
   - Keyboard shortcuts

### Phase 3: Eidolon Sync Extraction (Week 3-4)

1. **Extract from Current Eidolon**
   - Move export content scripts
   - Move sync utilities
   - Move dashboard
   - Move popup (convert to management UI)

2. **Remove Chat Sidebar Code**
   - Remove sidepanel entrypoint
   - Remove OpenCode client
   - Remove terminal utilities
   - Remove blocks UI
   - Remove multi-platform iframe code (now in Eidorail)

3. **Standalone Testing**
   - Verify export works on all platforms
   - Verify sync works
   - Verify dashboard works

### Phase 4: Integration & Polish (Week 4-5)

1. **Cross-Extension Communication**
   - Implement message passing
   - Test import project flow
   - Test shared settings

2. **Documentation**
   - Update READMEs
   - Installation guides
   - User documentation

3. **Release**
   - Chrome Web Store submissions
   - Firefox Add-ons (if applicable)

---

## Part 5: File Migration Map

### Files Moving to Eidorail

| Current Location | New Location | Notes |
|------------------|--------------|-------|
| `entrypoints/sidepanel/*` | `packages/extension/sidepanel/*` | Replaced by OpenCode UI |
| `utils/opencode/client.ts` | Use `@opencode-ai/sdk` | SDK from OpenCode |
| `utils/terminal/terminal.ts` | `packages/extension/terminal.ts` | Adapt for extension context |
| `utils/browser/cdp.ts` | `packages/extension/browser/cdp.ts` | Keep for page capture |
| `utils/browser/tools.ts` | `packages/extension/browser/tools.ts` | Agent tools |
| `utils/blocks/*` | Remove | OpenCode has its own UI |
| Platform switcher code | `packages/extension/platforms/*` | Multi-platform tab bar |
| `public/iframe-rules.json` | `packages/extension/public/` | For iframe embedding |

### Files Staying in Eidolon Sync

| Current Location | Notes |
|------------------|-------|
| `entrypoints/claude-export.content.ts` | Core export functionality |
| `entrypoints/dashboard/*` | Management UI |
| `entrypoints/popup/*` | Quick actions |
| `entrypoints/background.ts` | Adapt for sync-only |
| `utils/export/*` | Export utilities |
| `utils/sync/*` | Filesystem sync |
| `utils/search/*` | Conversation search |
| `utils/tags/*` | Tagging system |
| `utils/settings/*` | Settings management |
| `utils/oauth/*` | Keep for Claude.ai auth |
| `utils/api/*` | Claude.ai API client |

### Files to Remove/Archive

| Location | Reason |
|----------|--------|
| `utils/opencode/*` | Replaced by SDK in Eidorail |
| `utils/terminal/*` | Moving to Eidorail |
| `utils/blocks/*` | Not needed in sync extension |

---

## Part 6: Technical Considerations

### WXT + SolidJS for Eidorail

WXT officially supports SolidJS:
```bash
wxt create eidorail-extension --template solid
```

The extension wrapper will:
1. Load OpenCode's `packages/desktop` as the sidepanel
2. Provide browser APIs (tabs, storage, etc.)
3. Handle extension lifecycle
4. Add platform tab bar above OpenCode UI

### Sidepanel Structure

```
┌─────────────────────────────────────────────┐
│  [🏠] [CC] [GPT] [G✦] [+]        [⚙️] [↗️]  │  ← Platform Tab Bar
├─────────────────────────────────────────────┤
│                                             │
│                                             │
│         OpenCode Web UI (SolidJS)           │
│              or                             │
│         Platform Iframe                     │
│                                             │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│  [Project] / [Session]           [Model ▼]  │  ← OpenCode header (when active)
├─────────────────────────────────────────────┤
│                                             │
│            Chat / Terminal                   │
│                                             │
└─────────────────────────────────────────────┘
```

### Build Pipeline

**Eidorail**:
```
packages/sdk       → npm package (from upstream)
packages/ui        → npm package (from upstream)
packages/desktop   → Vite build → static assets
packages/extension → WXT build → browser extension
                            └── embeds desktop assets
                            └── platform tab bar (SolidJS)
```

**Eidolon Sync**:
```
utils/*           → TypeScript
entrypoints/*     → WXT build → browser extension
```

---

## Part 7: Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Multi-platform iframe tabs location | **Eidorail** - part of chat sidebar experience |
| OAuth management | Eidolon Sync for Claude.ai auth; Eidorail uses OpenCode's auth |
| Settings sync between extensions | Dark mode shared; others extension-specific |
| Extension naming | "Eidorail" + "Eidolon Sync" |

---

## Part 8: Success Criteria

### Eidorail Launch Checklist
- [ ] OpenCode web UI loads in sidepanel
- [ ] Can connect to local OpenCode server
- [ ] Can create and manage sessions
- [ ] Terminal works
- [ ] Can capture page context (screenshot, text)
- [ ] **Multi-platform tab bar works (ChatGPT, Gemini, etc.)**
- [ ] **Can add/remove/reorder platform tabs**
- [ ] Extension published to Chrome Web Store

### Eidolon Sync Launch Checklist
- [ ] Export works on Claude.ai
- [ ] Export works on ChatGPT
- [ ] Export works on Gemini
- [ ] Workspace sync works
- [ ] Dashboard loads and functions
- [ ] Can communicate with Eidorail (import project)
- [ ] Extension published to Chrome Web Store

---

## Appendix A: OpenCode Package Structure

From `sst/opencode` repository:

```
packages/
├── console/      # Internal console app
├── desktop/      # Web UI (SolidJS) ← WE NEED THIS
├── docs/         # Documentation site
├── enterprise/   # Enterprise features
├── extensions/   # VS Code extension
├── function/     # Serverless functions
├── identity/     # Auth/identity
├── opencode/     # Core CLI
├── plugin/       # Plugin system
├── script/       # Build scripts
├── sdk/          # TypeScript SDK ← WE NEED THIS
├── slack/        # Slack integration
├── tauri/        # Desktop app wrapper
├── ui/           # Shared UI components ← WE NEED THIS
├── util/         # Utilities
└── web/          # Marketing website
```

### Key Files in `packages/desktop`

```
packages/desktop/
├── src/
│   ├── app.tsx           # Main app component
│   ├── entry.tsx         # Entry point
│   ├── index.css         # Global styles
│   ├── components/
│   │   ├── file-tree.tsx
│   │   ├── prompt-input.tsx
│   │   └── terminal.tsx
│   ├── pages/
│   │   ├── home.tsx      # Project list
│   │   ├── layout.tsx    # App layout
│   │   ├── session.tsx   # Chat session
│   │   └── directory-layout.tsx
│   ├── context/          # SolidJS context providers
│   ├── hooks/            # Custom hooks
│   └── utils/
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## Appendix B: Timeline Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Setup | 1 week | Fork created, extension wrapper scaffolded |
| Phase 2: Eidorail MVP | 2 weeks | Working chat sidebar with OpenCode UI + platform tabs |
| Phase 3: Sync Extraction | 1-2 weeks | Standalone sync extension |
| Phase 4: Integration | 1 week | Cross-extension communication, polish |
| **Total** | **5-6 weeks** | Both extensions published |

---

## Appendix C: Commands Reference

```bash
# Clone Eidorail fork
git clone https://github.com/[username]/eidorail
cd eidorail

# Setup upstream tracking
git remote add upstream https://github.com/sst/opencode.git
git fetch upstream

# Sync with upstream (periodically)
git checkout dev
git merge upstream/dev

# Build desktop package
cd packages/desktop
bun install
bun run build

# Build extension
cd packages/extension
bun run build
```

---

## Appendix D: Current Eidolon Repo Transition

```bash
# In current eidolon repo
git tag v2.3.0-unified-final  # Mark last unified version

# Rename repo on GitHub: eidolon → eidolon-sync

# Remove sidebar-related code
git rm -r entrypoints/sidepanel
git rm -r utils/opencode
git rm -r utils/terminal
git rm -r utils/blocks
# ... etc

git commit -m "Extract chat sidebar code (now in Eidorail)"
```

**Last Modified**: 2025-12-11
