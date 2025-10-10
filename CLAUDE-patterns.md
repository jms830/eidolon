# CLAUDE-patterns.md

Established code patterns and conventions for the Eidolon project.

## Architecture Overview

Eidolon is built with the **WXT framework** (v0.20.11), a modern web extension framework that provides:
- File-based entrypoint system
- Auto-generated manifest.json from config
- TypeScript support with auto-imports
- Cross-browser compatibility (Chrome/Firefox)
- Hot module reloading in development

## Project Structure

```
eidolon/
├── entrypoints/          # WXT entrypoints (auto-discovered)
│   ├── background.ts     # Background service worker
│   └── popup/           # Browser action popup
│       ├── index.html
│       ├── main.ts
│       └── style.css
├── utils/               # Shared utilities
│   └── api/            # Claude.ai API client
│       ├── client.ts
│       └── types.ts
├── components/          # Shared UI components
├── public/             # Static assets
│   └── icons/
├── wxt.config.ts       # WXT configuration
├── tsconfig.json       # TypeScript config
└── package.json
```

## WXT Patterns

### Background Script Pattern

```typescript
// entrypoints/background.ts
export default defineBackground(() => {
  // All code inside this function
  // Global state
  let apiClient: ClaudeAPIClient | null = null;

  // Event listeners
  browser.runtime.onInstalled.addListener(() => {
    // Setup logic
  });

  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      // Async message handling
      try {
        // Handle request
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // IMPORTANT: For async response
  });
});
```

### Popup Pattern

```
entrypoints/popup/
├── index.html         # Main HTML file
├── main.ts           # Entry point script
└── style.css         # Styles
```

Main script:
```typescript
// entrypoints/popup/main.ts
import './style.css';

// Use browser API (auto-imported by WXT)
const response = await browser.runtime.sendMessage({ action: 'get-projects' });
```

### Content Script Pattern (Future)

```typescript
// entrypoints/claude.content.ts
export default defineContentScript({
  matches: ['https://claude.ai/*'],
  main(ctx) {
    // Content script logic
    console.log('Running on:', location.href);
  }
});
```

## API Client Pattern

The Claude API client is duplicated in the background script to avoid import issues:

```typescript
// Inside defineBackground()
class ClaudeAPIClient {
  private baseUrl = 'https://claude.ai/api';
  private sessionKey: string;

  constructor(sessionKey: string) {
    this.sessionKey = sessionKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      'Cookie': `sessionKey=${this.sessionKey}`,
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    return await response.json() as T;
  }

  async getOrganizations(): Promise<Organization[]> {
    return this.request<Organization[]>('/organizations');
  }

  async getProjects(orgId: string): Promise<any[]> {
    return this.request<any[]>(`/organizations/${orgId}/projects`);
  }

  // ... other methods
}
```

## Session Management Pattern

```typescript
async function extractSessionKey(): Promise<string | null> {
  const cookie = await browser.cookies.get({
    url: 'https://claude.ai',
    name: 'sessionKey',
  });
  return cookie?.value || null;
}

async function validateSession(): Promise<boolean> {
  if (!sessionKey) {
    sessionKey = await extractSessionKey();
  }

  if (!sessionKey) return false;

  try {
    apiClient = new ClaudeAPIClient(sessionKey);
    const orgs = await apiClient.getOrganizations();

    if (orgs.length > 0) {
      currentOrg = orgs[0];
      await browser.storage.local.set({
        sessionKey,
        currentOrg,
        sessionValid: true,
      });
      return true;
    }
  } catch (error) {
    await browser.storage.local.set({ sessionValid: false });
  }

  return false;
}
```

## Message Passing Pattern

### Background → Popup Communication

**Popup sends message:**
```typescript
const response = await browser.runtime.sendMessage({
  action: 'get-projects'
});

if (response.success) {
  console.log(response.data);
} else {
  console.error(response.error);
}
```

**Background handles message:**
```typescript
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'get-projects':
          if (apiClient && currentOrg) {
            const projects = await apiClient.getProjects(currentOrg.uuid);
            sendResponse({ success: true, data: projects });
          } else {
            sendResponse({ success: false, error: 'Not authenticated' });
          }
          break;
      }
    } catch (error: any) {
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // CRITICAL for async response
});
```

## DOM Manipulation Pattern (XSS Safe)

ALWAYS use safe DOM methods with textContent or createElement:

```typescript
// Create element safely
const item = document.createElement('div');
item.className = 'list-item';
item.textContent = userContent; // Automatically escapes

const title = document.createElement('div');
title.className = 'list-item-title';
title.textContent = project.name;

item.appendChild(title);
parent.appendChild(item);
```

## Configuration

### WXT Config (wxt.config.ts)

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Extension Name',
    version: '1.0.0',
    permissions: ['cookies', 'storage', 'contextMenus'],
    host_permissions: ['https://claude.ai/*'],
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+E',
          mac: 'MacCtrl+Shift+E',
        },
      },
    },
  },
});
```

### TypeScript Config (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "~/*": ["./*"]
    }
  },
  "include": ["entrypoints", "components", "utils", "wxt.config.ts"]
}
```

## Build Commands

```bash
# Development (auto-opens browser with extension)
npm run dev              # Chrome
npm run dev:firefox      # Firefox

# Production build
npm run build           # Chrome
npm run build:firefox   # Firefox

# Create distributable ZIPs
npm run zip            # Chrome
npm run zip:firefox    # Firefox

# Generate types after changes
npm run postinstall    # or: npx wxt prepare
```

## Browser API Usage

WXT provides the `browser` namespace (auto-imported) that works cross-browser:

```typescript
// Auto-imported, no need to import
browser.storage.local.get('key');
browser.runtime.sendMessage({ action: 'test' });
browser.tabs.create({ url: 'https://example.com' });

// Handle MV2/MV3 compatibility
(browser.action ?? browser.browserAction).openPopup();
```

## Storage Patterns

### Local Storage
```typescript
// Save
await browser.storage.local.set({
  sessionKey: 'abc123',
  currentOrg: orgObject,
  sessionValid: true
});

// Get
const { sessionKey, currentOrg } = await browser.storage.local.get(['sessionKey', 'currentOrg']);

// Remove
await browser.storage.local.remove('pendingUpload');
```

### Storage Schema
```typescript
interface LocalStorage {
  sessionKey?: string;
  currentOrg?: Organization;
  sessionValid?: boolean;
  pendingUpload?: {
    type: 'text' | 'page';
    content: string;
    source: string;
  };
}
```

## Context Menus

```typescript
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'add-to-claude',
    title: 'Add to Claude Project',
    contexts: ['selection']
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'add-to-claude' && info.selectionText) {
    // Handle click
  }
});
```

## Error Handling

```typescript
try {
  const response = await apiClient.getProjects(orgId);
  // Handle success
} catch (error) {
  console.error('Failed to load projects:', error);
  // Show user-friendly error
  statusText.textContent = 'Failed to load projects';
  statusBar.classList.add('error');
}
```

## Common Gotchas

1. **Async message handlers MUST return `true`**
   ```typescript
   browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
     (async () => {
       // async code
       sendResponse(result);
     })();
     return true; // CRITICAL!
   });
   ```

2. **Import paths in background.ts**
   - Due to WXT limitations, avoid complex imports in background.ts
   - Duplicate code or use inline classes when needed

3. **DOM manipulation must be XSS-safe**
   - Always use `textContent` or `createElement`
   - Never use direct HTML string insertion

4. **Icon paths in notifications/popups**
   - Use `/icon-48.png` (not `/icons/icon-48.png`)
   - Public folder files are served at root

5. **Browser API compatibility**
   - Use `browser` namespace (not `chrome`)
   - Handle MV2/MV3 differences: `browser.action ?? browser.browserAction`

## Next Steps

When implementing new features:

1. **Content Scripts** - Create `entrypoints/claude.content.ts` for Claude.ai page integration
2. **Dashboard Page** - Create `entrypoints/dashboard.html` for full-page interface
3. **Search Worker** - Add `utils/search/indexWorker.ts` for local search
4. **Components** - Build reusable UI in `components/` directory
5. **State Management** - Consider Zustand for complex state (already in dependencies)
