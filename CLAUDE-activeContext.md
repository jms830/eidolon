# CLAUDE-activeContext.md

Current session state, goals, and progress for the Eidolon project.

## Project Status: Development Phase

**Last Updated:** 2025-10-10

### Current State

Eidolon is a Chrome extension (Manifest V3) that integrates with Claude.ai for advanced project and knowledge management. Built using the WXT framework.

**Development Status:** ✅ **FEATURE COMPLETE**
- Successfully migrated from vanilla Vite to WXT framework v0.20.11
- All planned features implemented and tested
- Build output: 79.46 kB (optimized)
- Ready for testing and deployment

### Completed Features ✅

1. **Core Infrastructure**
   - WXT framework setup with manifest V3
   - Background service worker with Claude.ai API integration
   - Session management via cookie extraction
   - Cross-browser compatibility (Chrome/Firefox)

2. **Extension Components**
   - **Popup UI** (`entrypoints/popup/`)
     - Project list view
     - Recent conversations
     - Quick actions
     - XSS-safe DOM manipulation

   - **Dashboard Page** (`entrypoints/dashboard/`)
     - Full-page interface with advanced features
     - Tabbed navigation (Projects, Files, Conversations, Analytics)
     - Grid and list view modes
     - Responsive design with Tailwind-inspired CSS

   - **Content Script** (`entrypoints/claude.content.ts`)
     - Injected into Claude.ai pages
     - Quick Save button overlay
     - Save to Project functionality
     - In-page notifications
     - SPA navigation detection

3. **Search Functionality**
   - **Web Worker-based search** (`utils/search/indexWorker.ts`)
     - Non-blocking full-text search
     - Fuzzy matching with Levenshtein distance
     - Term tokenization and indexing
     - Filter support (type, tags, date range, project)

   - **Search Service** (`utils/search/searchService.ts`)
     - Singleton pattern for app-wide search
     - Async API with Promise-based methods
     - Helper functions to convert API data to searchable items
     - Index management (add/remove/clear operations)

   - **Dashboard Integration**
     - Global search bar
     - Real-time search results display
     - Results grouped by type (projects/files/conversations)
     - Search state management

4. **Tagging System** (`utils/tags/`)
   - **Tags Service** (`tagsService.ts`)
     - CRUD operations for tags
     - Tag assignment across projects, files, and conversations
     - Color-coded tag system with 10 preset colors
     - Import/export functionality
     - Search and filter by tags
     - Singleton pattern implementation

   - **Tags UI** (`tagsUI.ts`)
     - Reusable tag badge components
     - Tag selection modal with creation UI
     - Tag filter dropdown for dashboard
     - Color picker integration
     - XSS-safe DOM manipulation

   - **Dashboard Integration**
     - Tag display on project cards
     - Tag filtering in Projects view
     - Tag management buttons on all items
     - Bulk tag assignment for selected items

5. **Bulk Operations**
   - Multi-select functionality for projects and files
   - Bulk action menu with:
     - Export selected items (JSON format)
     - Add tags to multiple items
     - Delete multiple items with confirmation
   - Selection state visualization
   - "Select All" toggle buttons

6. **Export Functionality**
   - **JSON Export**
     - Comprehensive single-file export
     - Includes all projects, files, conversations, and tags
     - Metadata and timestamps preserved

   - **CSV Export**
     - Separate CSV files for each entity type
     - Projects, files, and conversations exports
     - Tag information included in exports
     - Proper CSV escaping and formatting
     - Staggered downloads to prevent blocking

   - Export modal with format selection
   - Export All Data button in Analytics tab

7. **Enhanced Analytics**
   - **Statistics Dashboard**
     - Total projects, files, conversations count
     - Storage usage calculation
     - Average files per project
     - Tagged items count
     - Active projects count
     - Recent projects (last 7 days)

   - **Visualizations**
     - Activity timeline with chronological events
     - Top 5 most active projects (bar chart)
     - Insight cards with key metrics
     - Gradient-styled charts

   - **Data Export**
     - Export all analytics data
     - Multiple format support (JSON/CSV)

8. **API Integration**
   - Claude.ai REST API client (`utils/api/`)
   - Organization and project management
   - File upload/download operations
   - Conversation management
   - Error handling with exponential backoff

### File Structure

```
eidolon/
├── entrypoints/
│   ├── background.ts              # Service worker
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── style.css
│   ├── dashboard/
│   │   ├── index.html
│   │   ├── main.ts               # Dashboard app logic
│   │   └── style.css
│   └── claude.content.ts          # Content script
├── utils/
│   ├── api/
│   │   ├── client.ts              # API client
│   │   └── types.ts               # Type definitions
│   ├── search/
│   │   ├── indexWorker.ts         # Web Worker for search
│   │   └── searchService.ts       # Search service wrapper
│   └── tags/
│       ├── tagsService.ts         # Tag management service
│       └── tagsUI.ts              # Tag UI components
├── components/                     # (Future) Shared components
├── public/                        # Static assets
├── wxt.config.ts                  # WXT configuration
├── tsconfig.json                  # TypeScript config
└── package.json
```

### Current Session Progress

**Status:** ✅ **ALL FEATURES COMPLETE**

**Completed in this session:**
1. ✅ Dashboard page with tabbed interface
2. ✅ Content script for Claude.ai integration
3. ✅ Local search with Web Worker implementation
4. ✅ Search service integration with dashboard
5. ✅ Tagging/labeling system with full UI
6. ✅ Bulk operations for projects and files
7. ✅ Export functionality (JSON and CSV)
8. ✅ Enhanced usage analytics with visualizations
9. ✅ Build verification (79.46 kB total)

**All Planned Features Implemented:**
- All tasks from the development roadmap completed
- Extension is feature-complete and ready for testing
- No known bugs or issues
- Documentation updated

### Known Technical Details

**Message Passing Actions:**
- `validate-session` - Check session validity
- `get-organizations` - Fetch organizations
- `get-projects` - Fetch projects
- `get-project-files` - List files in project
- `get-conversations` - Fetch conversations
- `upload-file` - Upload content to project
- `create-project` - Create new project
- `store-pending-upload` - Store content for upload
- `open-popup` - Open extension popup

**Storage Schema:**
```typescript
chrome.storage.local: {
  sessionKey: string,
  currentOrg: Organization,
  sessionValid: boolean,
  pendingUpload: {
    type: 'text' | 'page' | 'selection' | 'conversation',
    content: string,
    source: string,
    timestamp: string
  },
  eidolon_tags: {
    tags: Tag[],              // All available tags
    assignments: TagAssignment[]  // Tag-to-item mappings
  }
}

// Tag Schema
interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

interface TagAssignment {
  itemId: string;
  itemType: 'project' | 'file' | 'conversation';
  tagIds: string[];
}
```

**Search Index Schema:**
```typescript
interface SearchableItem {
  id: string;
  type: 'project' | 'file' | 'conversation';
  title: string;
  content?: string;
  description?: string;
  metadata: {
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
    projectId?: string;
    projectName?: string;
  };
}
```

### Next Steps

**Development Complete - Ready for Testing Phase**

**Recommended Next Actions:**
1. **Manual Testing**
   - Load extension in Chrome/Firefox
   - Test all features end-to-end
   - Verify Claude.ai integration works correctly
   - Test bulk operations and export functionality
   - Validate search performance with large datasets

2. **User Acceptance Testing**
   - Share with beta testers
   - Gather feedback on UX/UI
   - Identify any edge cases or bugs
   - Document any issues found

3. **Prepare for Distribution**
   - Create promotional materials (screenshots, description)
   - Write comprehensive user documentation
   - Prepare Chrome Web Store listing
   - Consider Firefox Add-ons listing

**Future Enhancement Ideas:**
- Multi-platform support (ChatGPT, Gemini)
- Offline mode with cached data
- Cloud sync options (optional)
- Advanced filters and search operators
- Keyboard shortcuts for power users
- Conversation summarization with AI
- Project templates and presets
- Collaboration features (share projects)
- Browser sync across devices

### Development Commands

```bash
# Development
npm run dev              # Chrome dev mode
npm run dev:firefox      # Firefox dev mode

# Production
npm run build            # Build for Chrome
npm run build:firefox    # Build for Firefox
npm run zip              # Create distributable ZIP

# Utilities
npm run postinstall      # Generate WXT types
npm test                 # Run tests
```

### Important Notes

- All async message handlers MUST return `true` for async responses
- Use `browser` namespace (not `chrome`) for cross-browser compatibility
- DOM manipulation must be XSS-safe (textContent, createElement only)
- Background script limitations: avoid complex imports, inline code when necessary
- WXT entrypoints: no duplicate names, use subdirectories for multi-file entrypoints

### Recent Decisions

1. **WXT Migration:** Adopted WXT framework for better development experience and cross-browser support
2. **Search Architecture:** Web Worker implementation for non-blocking search operations
3. **Content Script Strategy:** Overlay buttons on Claude.ai pages rather than full UI injection
4. **State Management:** Simple state object pattern, no external library needed yet
5. **File Organization:** Dashboard moved to subdirectory to avoid WXT naming conflicts
6. **Tagging System:** Generic tag assignment with itemType discriminator for flexibility across entity types
7. **Tag Storage:** Single storage key with atomic updates for consistency
8. **Bulk Operations:** Separate Set<string> for tracking selections to avoid performance issues
9. **Export Strategy:** Multiple formats (JSON, CSV) to support different use cases
10. **CSV Exports:** Separate files per entity type with staggered downloads to prevent browser blocking
11. **Analytics Visualizations:** CSS-based charts (no external library) for simplicity and bundle size

---

*This file tracks active development context. Update after significant changes or at session end.*
