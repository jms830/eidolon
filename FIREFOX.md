# Firefox Add-on Release Guide

## Build Status: ✅ Ready

The Eidolon Firefox extension has been successfully built and is ready for distribution.

**Build Output:**
- Extension: `.output/eidolon-extension-1.0.0-firefox.zip` (63 KB)
- Sources: `.output/eidolon-extension-1.0.0-sources.zip` (2.4 MB)
- Target: Firefox MV2 (Manifest Version 2)

## Known Limitations

### File System Access API (Workspace Sync)

**Status:** ⚠️ **Limited Support**

Firefox does not fully support the File System Access API (`showDirectoryPicker()`) that is used for workspace sync functionality.

**Impact:**
- Workspace sync features will NOT work in Firefox
- Users cannot sync projects to local filesystem
- "Setup Workspace", "Sync Now", "Sync Chats Only" buttons will be non-functional
- All other features (popup, dashboard, API integration, search, tags) work perfectly

**Affected Features:**
- ❌ Workspace directory selection
- ❌ Download sync (Claude.ai → local filesystem)
- ❌ Bidirectional sync (two-way sync)
- ❌ Chats-only sync
- ❌ Workspace diff viewer

**Working Features:**
- ✅ Browser popup with projects list
- ✅ Dashboard with project/file management
- ✅ Conversation browsing
- ✅ Context menus (add to Claude)
- ✅ Tagging system
- ✅ Search functionality
- ✅ Authentication management
- ✅ Content script integration on Claude.ai

**Future Solutions:**
1. Wait for Firefox to implement File System Access API (in progress)
2. Implement Firefox-specific fallback using Downloads API (less ideal UX)
3. Use WebDAV/cloud storage as intermediary (complex)

**Recommendation:**
- Release Firefox version with workspace sync disabled
- Add prominent notice in dashboard about Firefox limitations
- Monitor Firefox File System Access API implementation status
- Update when Firefox adds full support

## Installation Instructions

### For Testing (Development)

1. **Build Firefox Extension:**
   ```bash
   npm run build:firefox
   ```

2. **Load in Firefox:**
   - Open Firefox
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json` from `.output/firefox-mv2/` directory

3. **Test Features:**
   - Click extension icon to open popup
   - Open dashboard from popup
   - Browse projects and conversations
   - Test search and tagging
   - **Note:** Skip workspace sync tests (not supported)

### For Users (Production)

Once published on Firefox Add-ons:
1. Visit Firefox Add-ons page for Eidolon
2. Click "Add to Firefox"
3. Grant required permissions
4. Extension icon appears in toolbar

## Firefox Add-ons Submission

### Required Metadata

**Name:** Eidolon - Claude.ai Integration

**Summary (250 chars max):**
Seamless Claude.ai project and knowledge management directly from your browser. Browse projects, manage conversations, search files, and organize with tags - all without leaving your workflow.

**Description:**
Eidolon enhances your Claude.ai experience with powerful project and conversation management tools.

**Key Features:**
- **Quick Access Popup** - View all projects and recent conversations instantly
- **Advanced Dashboard** - Full-featured interface for managing Claude.ai projects and files
- **Search Everywhere** - Find projects, files, and conversations quickly
- **Tagging System** - Organize projects with custom tags
- **Context Menus** - Right-click to add selected text or pages to Claude projects
- **Seamless Integration** - Works directly with Claude.ai, no separate accounts needed

**Perfect For:**
- Developers managing code snippets and documentation
- Researchers organizing articles and notes
- Writers collecting research and references
- Anyone using Claude.ai for knowledge management

**Privacy & Security:**
- No data collection or tracking
- All communication directly with Claude.ai
- Session cookies stored locally only
- Open source and transparent

**Note:** Workspace sync features (local filesystem integration) are not available in Firefox due to browser API limitations. All other features work perfectly.

**Category:** Productivity

**Tags:** claude, ai, productivity, project-management, knowledge-management

**License:** MIT (if open source)

### Screenshots Needed

1. **Popup Interface** - Browser action showing projects list
2. **Dashboard Overview** - Main dashboard with projects grid
3. **Project Details** - Project view with files
4. **Search Interface** - Search results showing
5. **Tags Management** - Tagging system in action

### Support Information

**Support Site:** https://github.com/jms830/eidolon
**Support Email:** (your email)

### Version History

**Version 1.0.0 (Initial Release):**
- Browser popup with projects and conversations list
- Full-featured dashboard for project management
- Search across projects, files, and conversations
- Tagging system for project organization
- Context menu integration
- Content script enhancements for Claude.ai pages
- Note: Workspace sync not available in Firefox

## Permissions Justification

Firefox Add-ons review requires justification for all permissions:

1. **cookies** - Required to authenticate with Claude.ai using session cookies
2. **storage** - Store user preferences, project mappings, and tags locally
3. **contextMenus** - Add "Add to Claude" context menu items
4. **tabs** - Access active tab for content capture features
5. **activeTab** - Interact with Claude.ai pages when extension is activated
6. **notifications** - Show sync status and error notifications
7. **https://claude.ai/\*** - Required to access Claude.ai API and integrate with website

**Optional:**
- **clipboardWrite** - Copy project paths and data to clipboard (optional feature)

## Testing Checklist

Before submitting to Firefox Add-ons:

- [ ] Extension loads without errors in Firefox
- [ ] Popup opens and displays projects correctly
- [ ] Dashboard accessible and functional
- [ ] Authentication flow works (session detection)
- [ ] Search functionality operates correctly
- [ ] Tagging system works (create, edit, delete tags)
- [ ] Context menus appear and function
- [ ] Content script integrates with Claude.ai pages
- [ ] No console errors in normal operation
- [ ] Icons display properly at all sizes
- [ ] All UI elements render correctly
- [ ] Extension works in private browsing mode (if applicable)

**Skip Testing:**
- ❌ Workspace directory picker (not supported)
- ❌ Sync operations (not supported)
- ❌ Workspace diff (not supported)

## Development Commands

```bash
# Build for Firefox (MV2)
npm run build:firefox

# Development mode with Firefox
npm run dev:firefox

# Create distribution ZIPs
npm run zip:firefox

# Build both Chrome and Firefox
npm run build
npm run zip
```

## Build Output Structure

```
.output/
├── firefox-mv2/              # Firefox extension directory
│   ├── manifest.json         # MV2 manifest (auto-generated)
│   ├── background.js         # Background script (not service worker)
│   ├── dashboard.html        # Dashboard page
│   ├── popup.html           # Popup interface
│   └── ...
├── eidolon-extension-1.0.0-firefox.zip    # Firefox distribution
└── eidolon-extension-1.0.0-sources.zip    # Source code (required by Firefox)
```

## Firefox-Specific Differences

WXT automatically handles these conversions from Chrome MV3 → Firefox MV2:

1. **Manifest Version:** 3 → 2
2. **Background:** Service worker → Background scripts
3. **Action API:** `browser.action` → `browser.browser_action`
4. **Permissions:** Automatically adjusted for MV2 compatibility

## Recommended Approach

### Phase 1: Limited Release (Current)
- Release Firefox version WITHOUT workspace sync
- Add prominent notice about Firefox limitations
- Focus on popup, dashboard, search, and tagging features
- Monitor user feedback

### Phase 2: Future Enhancement (When Firefox API Ready)
- Implement Firefox File System Access API when available
- OR implement alternative sync method (Downloads API)
- Update extension with full parity
- Announce workspace sync availability

## Monitoring Firefox API Support

Check File System Access API status:
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
- https://caniuse.com/native-filesystem-api
- Firefox bug tracker: https://bugzilla.mozilla.org/

**Current Status (as of Nov 2025):**
- Chrome/Edge: Full support ✅
- Firefox: Not implemented ❌
- Safari: Partial support ⚠️

## Questions?

For questions about Firefox submission or development:
- GitHub Issues: https://github.com/jms830/eidolon/issues
- Firefox Add-ons Developer Hub: https://addons.mozilla.org/developers/
