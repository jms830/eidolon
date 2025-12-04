/**
 * Eidolon Side Panel - Enhanced Claude Assistant
 * Full browser integration with project management
 */

import './style.css';

// ========================================================================
// TYPES
// ========================================================================

interface Tab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  inGroup?: boolean; // Whether tab is in the agent's tab group
  groupId?: number; // Tab group ID if in a group
  groupTitle?: string; // Tab group name
  groupColor?: string; // Tab group color
}

// View types for platform switching
type ViewType = 'eidolon' | 'claude-code' | 'chatgpt' | 'gemini' | 'custom' | string;

// Platform configuration
interface Platform {
  id: string;
  name: string;
  url: string;
  icon?: string; // SVG string or URL to favicon
  isBuiltIn: boolean;
  isVisible: boolean;
  order: number;
}

// Default built-in platforms
const DEFAULT_PLATFORMS: Platform[] = [
  {
    id: 'eidolon',
    name: 'Eidolon',
    url: '', // Special - uses internal UI
    icon: '/icon-16.png',
    isBuiltIn: true,
    isVisible: true,
    order: 0
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    url: 'https://claude.ai/code',
    icon: 'claude',
    isBuiltIn: true,
    isVisible: true,
    order: 1
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    icon: 'chatgpt',
    isBuiltIn: true,
    isVisible: true,
    order: 2
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    icon: 'gemini',
    isBuiltIn: true,
    isVisible: true,
    order: 3
  }
];

// Preset platforms that can be quickly added
const PRESET_PLATFORMS: Omit<Platform, 'order' | 'isVisible'>[] = [
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    icon: 'perplexity',
    isBuiltIn: false
  },
  {
    id: 'poe',
    name: 'Poe',
    url: 'https://poe.com',
    icon: 'poe',
    isBuiltIn: false
  },
  {
    id: 'you',
    name: 'You.com',
    url: 'https://you.com/search?tbm=youchat',
    icon: 'you',
    isBuiltIn: false
  },
  {
    id: 'huggingchat',
    name: 'HuggingChat',
    url: 'https://huggingface.co/chat',
    icon: 'huggingface',
    isBuiltIn: false
  },
  {
    id: 'copilot',
    name: 'Copilot',
    url: 'https://copilot.microsoft.com',
    icon: 'copilot',
    isBuiltIn: false
  }
];

// Platform icon SVGs (for built-in platforms)
const PLATFORM_ICONS: Record<string, string> = {
  // Claude Code - "CC" text icon
  claude: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="12" y="16" font-size="10" font-weight="bold" text-anchor="middle" font-family="system-ui, sans-serif">CC</text></svg>`,
  chatgpt: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>`,
  // Gemini - "G" letter icon
  gemini: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="12" y="17" font-size="14" font-weight="bold" text-anchor="middle" font-family="system-ui, sans-serif">G</text></svg>`,
  perplexity: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
  poe: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path fill="white" d="M8 8h8v2H8zM8 11h8v2H8zM8 14h5v2H8z"/></svg>`,
  you: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  huggingface: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8zm-3-9a1.5 1.5 0 11-1.5-1.5A1.5 1.5 0 019 11zm6 0a1.5 1.5 0 11-1.5-1.5A1.5 1.5 0 0115 11zm-6.5 3a.5.5 0 00-.5.5c0 1.93 1.57 3.5 3.5 3.5h1c1.93 0 3.5-1.57 3.5-3.5a.5.5 0 00-.5-.5h-7z"/></svg>`,
  copilot: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
};

/**
 * Get URL for a platform by ID
 */
function getPlatformUrl(platformId: string): string | null {
  // Check built-in defaults first
  const builtIn = DEFAULT_PLATFORMS.find(p => p.id === platformId);
  if (builtIn) return builtIn.url || null;
  
  // Check custom platforms in state
  const custom = state.platforms.find(p => p.id === platformId);
  if (custom) return custom.url;
  
  // Check presets
  const preset = PRESET_PLATFORMS.find(p => p.id === platformId);
  if (preset) return preset.url;
  
  return null;
}

/**
 * Get platform by ID
 */
function getPlatform(platformId: string): Platform | null {
  return state.platforms.find(p => p.id === platformId) || null;
}

interface Project {
  uuid: string;
  name: string;
  description?: string;
  created_at: string;
}

interface Conversation {
  uuid: string;
  name: string;
  updated_at: string;
  project_uuid?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
}

interface Attachment {
  type: 'screenshot' | 'page-content' | 'file';
  name: string;
  content: string;
}

// ========================================================================
// BROWSER AGENT TOOL DEFINITIONS
// ========================================================================

/**
 * Tool definitions for browser agent mode
 * These are sent to Claude when agent mode is enabled
 * Based on official Claude extension's computer use tools for browser
 */
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
  is_error?: boolean;
}

const BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'computer',
    description: `Use this tool to interact with the browser page. You can take screenshots, click elements, type text, scroll, and navigate.

Available actions:
- screenshot: Take a screenshot of the current page
- left_click: Click an element by ref (preferred) or coordinates [x, y]
- right_click: Right-click an element by ref or coordinates [x, y]
- double_click: Double-click an element by ref or coordinates [x, y]
- type: Type text into the focused element or a specific element by ref
- key: Press a key or key combination (e.g., "Enter", "Tab", "ctrl+a")
- scroll: Scroll the page or a specific element. Use ref, coordinate, or omit for page scroll
- mouse_move: Move mouse to coordinates [x, y]
- wait: Wait for a specified number of milliseconds
- navigate: Navigate to a URL or use "back"/"forward" for history navigation
- focus: Focus an element by ref (useful before typing)

IMPORTANT: Use "ref" parameter (from read_page results) instead of coordinates when possible - it's more reliable!
Set "take_screenshot": false to skip the automatic screenshot after the action (faster, saves tokens).`,
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['screenshot', 'left_click', 'right_click', 'double_click', 'middle_click', 'type', 'key', 'scroll', 'mouse_move', 'left_click_drag', 'wait', 'navigate', 'focus'],
          description: 'The action to perform'
        },
        ref: {
          type: 'string',
          description: 'Element reference from read_page (e.g., "ref_5"). PREFERRED over coordinates for clicking, typing, scrolling, and focusing.'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description: 'The [x, y] coordinates. Only needed if ref is not provided.'
        },
        text: {
          type: 'string',
          description: 'The text to type (for type action) or URL to navigate to (for navigate action)'
        },
        key: {
          type: 'string',
          description: 'The key or key combination to press (for key action). Examples: "Enter", "Tab", "Escape", "ctrl+a", "ctrl+c"'
        },
        scroll_direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Direction to scroll (for scroll action)'
        },
        scroll_amount: {
          type: 'number',
          description: 'Amount to scroll in pixels (for scroll action). Default is 300'
        },
        start_coordinate: {
          type: 'array',
          items: { type: 'number' },
          description: 'Starting [x, y] coordinates for drag action'
        },
        duration: {
          type: 'number',
          description: 'Duration in milliseconds (for wait action)'
        },
        take_screenshot: {
          type: 'boolean',
          description: 'Whether to take a screenshot after the action. Default is true. Set to false for faster execution.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'read_page',
    description: `Get the accessibility tree of the current page. This provides a structured representation of all interactive elements on the page, including their roles, labels, and positions.

Use this to understand the page structure and find elements to interact with. Each element includes:
- role: The type of element (button, link, textbox, etc.)
- name: The accessible name/label of the element
- bounds: The position {x, y, width, height} for clicking
- focused: Whether the element is currently focused
- value: Current value for input elements`,
    input_schema: {
      type: 'object',
      properties: {
        max_depth: {
          type: 'number',
          description: 'Maximum depth to traverse the accessibility tree. Default is 10.'
        }
      }
    }
  },
  {
    name: 'tabs_context',
    description: `Get information about available browser tabs. Returns the current tab and all tabs that can be controlled.

Use this to:
- See what tabs are open
- Get the current URL and title
- Check which tab is currently active`,
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'tabs_create',
    description: `Create a new browser tab and optionally navigate to a URL.

The new tab will be added to the agent's tab group and can be controlled with subsequent actions.`,
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to open in the new tab. If not provided, opens a blank tab.'
        }
      }
    }
  },
  {
    name: 'get_page_text',
    description: `Get the text content of the current page. Returns the visible text from the page body.

Use this when you need to read or analyze the text content of a page without the full accessibility tree structure.`,
    input_schema: {
      type: 'object',
      properties: {
        max_length: {
          type: 'number',
          description: 'Maximum number of characters to return. Default is 50000.'
        }
      }
    }
  }
];

interface TabGroup {
  id: number;
  title: string;
  color: string;
  collapsed: boolean;
}

// Style types for Claude's personalized styles
interface StyleAttribute {
  name: string;
  percentage: number;
}

interface PersonalizedStyle {
  type: 'default' | 'custom';
  uuid: string;
  key: string;
  name: string;
  prompt: string;
  summary: string;
  isDefault: boolean;
  attributes: StyleAttribute[];
}

interface AppState {
  currentProject: Project | null;
  currentModel: string;
  conversationModel: string | null; // Model used when conversation started (to detect mid-chat model changes)
  messages: Message[];
  conversations: Conversation[];
  projects: Project[];
  tabs: Tab[];
  tabGroups: Map<number, TabGroup>; // Tab group info by group ID
  currentTab: Tab | null;
  targetTabId: number | null; // Tab ID to target for agent actions (defaults to currentTab)
  tabGroupId: number | null; // Tab group ID for agent session
  isLoading: boolean;
  isAuthenticated: boolean;
  darkMode: boolean;
  attachments: Attachment[];
  currentConversationId: string | null;
  agentMode: boolean;
  agentRunning: boolean;
  // View switching state
  currentView: ViewType;
  iframesLoaded: Set<ViewType>;
  customUrl: string | null;
  // Multi-platform support
  platforms: Platform[];
  // Personalized styles
  styles: PersonalizedStyle[];
  currentStyle: PersonalizedStyle | null;
}

// Default models fallback - will be updated from Claude.ai if available
// These model IDs match what Claude.ai web interface uses
// Model selection - use empty string to let Claude.ai use default model
// The actual model IDs are fetched dynamically from Claude.ai bootstrap API
let AVAILABLE_MODELS: Array<{ id: string; name: string; default: boolean }> = [
  { id: '', name: 'Default (Claude picks)', default: true },
];

// Model display names lookup - will be updated dynamically
let MODEL_NAMES: Record<string, string> = {};
function updateModelNames() {
  MODEL_NAMES = Object.fromEntries(AVAILABLE_MODELS.map(m => [m.id, m.name]));
}
updateModelNames();

// ========================================================================
// STATE
// ========================================================================

// Get default model ID
const DEFAULT_MODEL = AVAILABLE_MODELS.find(m => m.default)?.id || 'claude-sonnet-4-20250514';

// Load saved platforms from localStorage or use defaults
function loadSavedPlatforms(): Platform[] {
  try {
    const saved = localStorage.getItem('eidolon-platforms');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge saved with defaults to ensure built-ins are always present
      const savedIds = new Set(parsed.map((p: Platform) => p.id));
      const defaults = DEFAULT_PLATFORMS.filter(p => !savedIds.has(p.id));
      return [...parsed, ...defaults];
    }
  } catch (e) {
    console.warn('[Eidolon] Failed to load saved platforms:', e);
  }
  return [...DEFAULT_PLATFORMS];
}

const state: AppState = {
  currentProject: null,
  currentModel: localStorage.getItem('eidolon-model') || DEFAULT_MODEL,
  conversationModel: null, // Set when conversation starts, used to detect mid-chat model changes
  messages: [],
  conversations: [],
  projects: [],
  tabs: [],
  tabGroups: new Map(),
  currentTab: null,
  targetTabId: null,
  tabGroupId: null,
  isLoading: false,
  isAuthenticated: false,
  darkMode: localStorage.getItem('eidolon-dark-mode') === 'true',
  attachments: [],
  currentConversationId: null,
  agentMode: false, // Disabled by default - experimental feature
  agentRunning: false,
  // View switching state
  currentView: 'eidolon',
  iframesLoaded: new Set(),
  // Personalized styles
  styles: [],
  currentStyle: null,
  customUrl: localStorage.getItem('eidolon-custom-url'),
  // Multi-platform support
  platforms: loadSavedPlatforms()
};

// ========================================================================
// DOM ELEMENTS
// ========================================================================

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element not found: ${id}`);
  return el as T;
}

// ========================================================================
// INITIALIZATION
// ========================================================================

async function init() {
  console.log('[Eidolon SidePanel] Initializing...');
  
  // Read query params (e.g., model, tabId)
  try {
    const params = new URLSearchParams(window.location.search);
    const modelParam = params.get('model');
    if (modelParam) {
      state.currentModel = modelParam;
      localStorage.setItem('eidolon-model', state.currentModel);
    }
  } catch {}

  // Apply dark mode
  if (state.darkMode) {
    document.body.classList.add('dark-mode');
    document.documentElement.setAttribute('data-mode', 'dark');
  } else {
    document.documentElement.setAttribute('data-mode', 'light');
  }
  
  // Setup event listeners (including view toggle)
  setupEventListeners();
  setupViewToggle();
  
  // Set initial model indicator
  updateModelIndicator();
  
  // Load initial data
  await Promise.all([
    loadProjects(),
    loadConversations(),
    loadTabs(),
    getCurrentTab(),
    checkAuthentication(),
    loadAvailableModels(),
    loadAccounts()
  ]);
  
  console.log('[Eidolon SidePanel] Ready!');
}

// ========================================================================
// VIEW TOGGLE FUNCTIONS
// ========================================================================

/**
 * Setup view toggle event listeners
 */
function setupViewToggle() {
  // View toggle buttons
  const viewToggle = document.getElementById('view-toggle');
  if (viewToggle) {
    viewToggle.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view') as ViewType;
        if (view) {
          switchView(view);
        }
      });
    });
  }
  
  // Open external button - opens current view in new tab
  const openExternalBtn = document.getElementById('open-external-btn');
  openExternalBtn?.addEventListener('click', openCurrentViewExternal);
  
  // Custom URL handling
  const customUrlInput = document.getElementById('custom-url-input') as HTMLInputElement;
  const customUrlLoad = document.getElementById('custom-url-load');
  const customUrlCancel = document.getElementById('custom-url-cancel');
  
  customUrlLoad?.addEventListener('click', () => {
    const url = customUrlInput?.value?.trim();
    if (url) {
      loadCustomUrl(url);
    }
  });
  
  customUrlCancel?.addEventListener('click', () => {
    switchView('eidolon');
  });
  
  // Enter key in custom URL input
  customUrlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = customUrlInput.value?.trim();
      if (url) {
        loadCustomUrl(url);
      }
    }
  });
  
  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      if (url && customUrlInput) {
        customUrlInput.value = url;
        loadCustomUrl(url);
      }
    });
  });
  
  // Add platform button (opens modal)
  const addPlatformBtn = document.getElementById('add-platform-btn');
  addPlatformBtn?.addEventListener('click', openPlatformModal);
  
  // Platform modal close
  const closePlatformModal = document.getElementById('close-platform-modal');
  closePlatformModal?.addEventListener('click', () => {
    document.getElementById('platform-modal')?.classList.add('hidden');
  });
  
  // Click outside modal to close
  document.getElementById('platform-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('platform-modal')?.classList.add('hidden');
    }
  });
  
  // Add custom platform
  const addCustomPlatformBtn = document.getElementById('add-custom-platform-btn');
  addCustomPlatformBtn?.addEventListener('click', addCustomPlatform);
  
  // Restore default platforms
  const restoreDefaultBtn = document.getElementById('restore-default-platforms-btn');
  restoreDefaultBtn?.addEventListener('click', restoreDefaultPlatforms);
  
  // Initial render of platform buttons
  renderPlatformButtons();
}

// ========================================================================
// PLATFORM MANAGEMENT FUNCTIONS
// ========================================================================

/**
 * Render platform buttons in the view toggle bar
 */
function renderPlatformButtons() {
  const viewToggle = document.getElementById('view-toggle');
  if (!viewToggle) return;
  
  // Get the add button (we'll keep it at the end)
  const addBtn = document.getElementById('add-platform-btn');
  
  // Remove all existing platform buttons (keep the add button)
  viewToggle.querySelectorAll('.view-btn:not(.add-btn)').forEach(btn => btn.remove());
  
  // Render visible platforms
  const visiblePlatforms = state.platforms.filter(p => p.isVisible).sort((a, b) => a.order - b.order);
  
  visiblePlatforms.forEach(platform => {
    const btn = document.createElement('button');
    btn.className = `view-btn ${state.currentView === platform.id ? 'active' : ''}`;
    btn.title = platform.name;
    btn.setAttribute('data-view', platform.id);
    
    // Create icon
    if (platform.icon === '/icon-16.png') {
      btn.innerHTML = `<img src="${platform.icon}" alt="${platform.name}" class="view-icon">`;
    } else if (PLATFORM_ICONS[platform.icon || '']) {
      btn.innerHTML = `<span class="view-icon">${PLATFORM_ICONS[platform.icon || '']}</span>`;
    } else if (platform.icon?.startsWith('http')) {
      // External favicon
      btn.innerHTML = `<img src="${platform.icon}" alt="${platform.name}" class="view-icon" onerror="this.src='/icon-16.png'">`;
    } else {
      // Default icon for custom platforms
      btn.innerHTML = `<span class="view-icon">${PLATFORM_ICONS.plus}</span>`;
    }
    
    btn.addEventListener('click', () => switchView(platform.id));
    
    // Insert before add button
    viewToggle.insertBefore(btn, addBtn);
  });
  
  // Ensure iframe containers exist for all platforms
  ensureIframeContainers();
}

/**
 * Ensure iframe containers exist for all visible platforms
 */
function ensureIframeContainers() {
  const visiblePlatforms = state.platforms.filter(p => p.isVisible && p.url);
  
  visiblePlatforms.forEach(platform => {
    const containerId = `view-container-${platform.id}`;
    if (!document.getElementById(containerId)) {
      // Create container and iframe
      const container = document.createElement('div');
      container.id = containerId;
      container.className = 'view-container iframe-view';
      
      const iframe = document.createElement('iframe');
      iframe.id = `iframe-${platform.id}`;
      iframe.setAttribute('data-src', platform.url);
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
      
      container.appendChild(iframe);
      document.body.appendChild(container);
    }
  });
}

/**
 * Open the platform management modal
 */
function openPlatformModal() {
  renderActivePlatforms();
  renderPresetPlatforms();
  document.getElementById('platform-modal')?.classList.remove('hidden');
}

/**
 * Render active platforms in the modal
 */
function renderActivePlatforms() {
  const list = document.getElementById('active-platforms-list');
  if (!list) return;
  
  const sortedPlatforms = [...state.platforms].sort((a, b) => a.order - b.order);
  
  list.innerHTML = sortedPlatforms.map((platform, index) => `
    <div class="platform-item ${platform.isVisible ? '' : 'hidden-platform'}" data-id="${platform.id}">
      <div class="platform-reorder-btns">
        <button class="platform-reorder-btn move-up" ${index === 0 ? 'disabled' : ''} title="Move up">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 10l4-4 4 4"/>
          </svg>
        </button>
        <button class="platform-reorder-btn move-down" ${index === sortedPlatforms.length - 1 ? 'disabled' : ''} title="Move down">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </button>
      </div>
      <div class="platform-item-icon">
        ${getPlatformIconHtml(platform)}
      </div>
      <div class="platform-item-info">
        <div class="platform-item-name">${escapeHtml(platform.name)}</div>
        <div class="platform-item-url">${platform.url ? escapeHtml(platform.url) : 'Built-in'}</div>
      </div>
      <div class="platform-item-actions">
        <button class="platform-action-btn toggle-visibility" title="${platform.isVisible ? 'Hide' : 'Show'}">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            ${platform.isVisible 
              ? '<path d="M8 3C4 3 1.5 8 1.5 8s2.5 5 6.5 5 6.5-5 6.5-5S12 3 8 3z"/><circle cx="8" cy="8" r="2"/>'
              : '<path d="M2 2l12 12M8 3C4 3 1.5 8 1.5 8s1 2 3 3.5M8 13c4 0 6.5-5 6.5-5s-1-2-3-3.5M6 8a2 2 0 103 2"/>'}
          </svg>
        </button>
        ${!platform.isBuiltIn ? `
          <button class="platform-action-btn danger remove-platform" title="Remove">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 4l8 8M12 4l-8 8"/>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  list.querySelectorAll('.toggle-visibility').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.platform-item');
      const id = item?.getAttribute('data-id');
      if (id) togglePlatformVisibility(id);
    });
  });
  
  list.querySelectorAll('.remove-platform').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.platform-item');
      const id = item?.getAttribute('data-id');
      if (id) removePlatform(id);
    });
  });
  
  // Reorder buttons
  list.querySelectorAll('.move-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.platform-item');
      const id = item?.getAttribute('data-id');
      if (id) movePlatform(id, -1);
    });
  });
  
  list.querySelectorAll('.move-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.platform-item');
      const id = item?.getAttribute('data-id');
      if (id) movePlatform(id, 1);
    });
  });
}

/**
 * Move a platform up or down in the order
 */
function movePlatform(platformId: string, direction: number) {
  const sortedPlatforms = [...state.platforms].sort((a, b) => a.order - b.order);
  const currentIndex = sortedPlatforms.findIndex(p => p.id === platformId);
  
  if (currentIndex < 0) return;
  
  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= sortedPlatforms.length) return;
  
  // Swap orders
  const currentPlatform = sortedPlatforms[currentIndex];
  const swapPlatform = sortedPlatforms[newIndex];
  
  // Find in state and update
  const current = state.platforms.find(p => p.id === currentPlatform.id);
  const swap = state.platforms.find(p => p.id === swapPlatform.id);
  
  if (current && swap) {
    const tempOrder = current.order;
    current.order = swap.order;
    swap.order = tempOrder;
    
    savePlatforms();
    renderActivePlatforms();
    renderPlatformButtons();
  }
}

/**
 * Render preset platforms that can be added
 */
function renderPresetPlatforms() {
  const list = document.getElementById('preset-platforms-list');
  if (!list) return;
  
  // Filter out presets that are already added
  const existingIds = new Set(state.platforms.map(p => p.id));
  const availablePresets = PRESET_PLATFORMS.filter(p => !existingIds.has(p.id));
  
  if (availablePresets.length === 0) {
    list.innerHTML = '<div class="platform-item"><div class="platform-item-info"><div class="platform-item-name" style="color: var(--text-400)">All presets added</div></div></div>';
    return;
  }
  
  list.innerHTML = availablePresets.map(preset => `
    <div class="platform-item" data-preset-id="${preset.id}">
      <div class="platform-item-icon">
        ${getPlatformIconHtml(preset as Platform)}
      </div>
      <div class="platform-item-info">
        <div class="platform-item-name">${escapeHtml(preset.name)}</div>
        <div class="platform-item-url">${escapeHtml(preset.url)}</div>
      </div>
      <div class="platform-item-actions">
        <button class="platform-action-btn add-preset" title="Add">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="8" y1="4" x2="8" y2="12"/>
            <line x1="4" y1="8" x2="12" y2="8"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  list.querySelectorAll('.platform-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-preset-id');
      if (id) addPresetPlatform(id);
    });
  });
}

/**
 * Get HTML for a platform icon
 */
function getPlatformIconHtml(platform: Platform | Omit<Platform, 'order' | 'isVisible'>): string {
  if (platform.icon === '/icon-16.png') {
    return `<img src="${platform.icon}" alt="${platform.name}">`;
  } else if (PLATFORM_ICONS[platform.icon || '']) {
    return PLATFORM_ICONS[platform.icon || ''];
  } else if (platform.icon?.startsWith('http')) {
    return `<img src="${platform.icon}" alt="${platform.name}" onerror="this.style.display='none'">`;
  }
  return PLATFORM_ICONS.plus;
}

/**
 * Add a preset platform
 */
function addPresetPlatform(presetId: string) {
  const preset = PRESET_PLATFORMS.find(p => p.id === presetId);
  if (!preset) return;
  
  const maxOrder = Math.max(...state.platforms.map(p => p.order), 0);
  
  const newPlatform: Platform = {
    ...preset,
    isVisible: true,
    order: maxOrder + 1
  };
  
  state.platforms.push(newPlatform);
  savePlatforms();
  renderPlatformButtons();
  renderActivePlatforms();
  renderPresetPlatforms();
}

/**
 * Add a custom platform
 */
function addCustomPlatform() {
  const nameInput = document.getElementById('custom-platform-name') as HTMLInputElement;
  const urlInput = document.getElementById('custom-platform-url') as HTMLInputElement;
  
  const name = nameInput?.value?.trim();
  let url = urlInput?.value?.trim();
  
  if (!name || !url) {
    alert('Please enter both name and URL');
    return;
  }
  
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  try {
    new URL(url);
  } catch {
    alert('Please enter a valid URL');
    return;
  }
  
  // Generate unique ID
  const id = 'custom-' + Date.now();
  const maxOrder = Math.max(...state.platforms.map(p => p.order), 0);
  
  // Try to get favicon from URL
  const urlObj = new URL(url);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  
  const newPlatform: Platform = {
    id,
    name,
    url,
    icon: faviconUrl,
    isBuiltIn: false,
    isVisible: true,
    order: maxOrder + 1
  };
  
  state.platforms.push(newPlatform);
  savePlatforms();
  renderPlatformButtons();
  renderActivePlatforms();
  
  // Clear inputs
  nameInput.value = '';
  urlInput.value = '';
}

/**
 * Toggle platform visibility
 */
function togglePlatformVisibility(platformId: string) {
  const platform = state.platforms.find(p => p.id === platformId);
  if (platform) {
    platform.isVisible = !platform.isVisible;
    savePlatforms();
    renderPlatformButtons();
    renderActivePlatforms();
    
    // If hiding the current view, switch to eidolon
    if (!platform.isVisible && state.currentView === platformId) {
      switchView('eidolon');
    }
  }
}

/**
 * Remove a platform
 */
function removePlatform(platformId: string) {
  const index = state.platforms.findIndex(p => p.id === platformId);
  if (index !== -1 && !state.platforms[index].isBuiltIn) {
    state.platforms.splice(index, 1);
    savePlatforms();
    renderPlatformButtons();
    renderActivePlatforms();
    renderPresetPlatforms();
    
    // If removing the current view, switch to eidolon
    if (state.currentView === platformId) {
      switchView('eidolon');
    }
    
    // Remove iframe container
    const container = document.getElementById(`view-container-${platformId}`);
    container?.remove();
  }
}

/**
 * Restore default platforms
 */
function restoreDefaultPlatforms() {
  if (confirm('This will restore the default platforms and remove any custom ones. Continue?')) {
    state.platforms = [...DEFAULT_PLATFORMS];
    savePlatforms();
    renderPlatformButtons();
    renderActivePlatforms();
    renderPresetPlatforms();
    
    // Switch to eidolon if current view was removed
    if (!state.platforms.some(p => p.id === state.currentView)) {
      switchView('eidolon');
    }
  }
}

/**
 * Save platforms to localStorage
 */
function savePlatforms() {
  try {
    localStorage.setItem('eidolon-platforms', JSON.stringify(state.platforms));
    console.log('[Eidolon] Platforms saved:', state.platforms.length);
  } catch (e) {
    console.error('[Eidolon] Failed to save platforms:', e);
  }
}

/**
 * Switch between views (dynamically based on available platforms)
 */
function switchView(view: ViewType) {
  console.log('[Eidolon] Switching to view:', view);
  
  state.currentView = view;
  
  // Update toggle button states
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === view);
  });
  
  // Hide all view containers
  document.querySelectorAll('.view-container').forEach(container => {
    container.classList.remove('active');
  });
  
  // Show the selected view container
  const viewContainer = document.getElementById(`view-container-${view}`);
  if (viewContainer) {
    viewContainer.classList.add('active');
  }
  
  // Get platform info
  const platform = getPlatform(view);
  
  // Handle iframe loading for non-Eidolon views
  if (view !== 'eidolon' && platform?.url) {
    loadIframeIfNeeded(view);
  }
  
  // Legacy: For custom view (old single custom URL), show the prompt if no URL is set
  if (view === 'custom') {
    const customPrompt = document.getElementById('custom-url-prompt');
    const customIframe = document.getElementById('iframe-custom');
    
    if (state.customUrl) {
      // Already have a custom URL, load the iframe
      customPrompt?.classList.add('hidden');
      customIframe?.classList.remove('hidden');
      loadIframeIfNeeded('custom', state.customUrl);
    } else {
      // Show the URL input prompt
      customPrompt?.classList.remove('hidden');
      customIframe?.classList.add('hidden');
    }
  }
}

/**
 * Load an iframe if it hasn't been loaded yet (lazy loading)
 */
function loadIframeIfNeeded(view: ViewType, customUrl?: string) {
  const iframeId = `iframe-${view}`;
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
  
  if (!iframe) return;
  
  // Check if already loaded
  if (state.iframesLoaded.has(view) && !customUrl) {
    return;
  }
  
  // Get the URL to load
  let url: string | null;
  if (view === 'custom' && customUrl) {
    url = customUrl;
  } else if (view !== 'eidolon' && view !== 'custom') {
    url = getPlatformUrl(view);
  } else {
    return;
  }
  
  if (!url) return;
  
  // Load the iframe
  console.log(`[Eidolon] Loading iframe for ${view}: ${url}`);
  iframe.src = url;
  state.iframesLoaded.add(view);
}

/**
 * Load a custom URL in the custom iframe
 */
function loadCustomUrl(url: string) {
  // Validate and normalize URL
  let normalizedUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    normalizedUrl = 'https://' + url;
  }
  
  try {
    new URL(normalizedUrl); // Validate URL format
  } catch {
    alert('Please enter a valid URL');
    return;
  }
  
  // Save and load
  state.customUrl = normalizedUrl;
  localStorage.setItem('eidolon-custom-url', normalizedUrl);
  
  // Hide prompt, show iframe
  const customPrompt = document.getElementById('custom-url-prompt');
  const customIframe = document.getElementById('iframe-custom') as HTMLIFrameElement;
  
  customPrompt?.classList.add('hidden');
  customIframe?.classList.remove('hidden');
  
  // Load the iframe (force reload even if already loaded)
  state.iframesLoaded.delete('custom');
  loadIframeIfNeeded('custom', normalizedUrl);
}

/**
 * Open current view in a new browser tab
 */
function openCurrentViewExternal() {
  let url: string | null;
  
  switch (state.currentView) {
    case 'eidolon':
      // For Eidolon, open Claude.ai with current conversation if any
      if (state.currentConversationId) {
        url = `https://claude.ai/chat/${state.currentConversationId}`;
      } else {
        url = 'https://claude.ai/new';
      }
      break;
    case 'custom':
      if (state.customUrl) {
        url = state.customUrl;
      } else {
        return; // No custom URL set
      }
      break;
    default:
      url = getPlatformUrl(state.currentView);
  }
  
  if (!url) return;
  
  browser.tabs.create({ url, active: true });
}

// ========================================================================
// EVENT LISTENERS
// ========================================================================

function setupEventListeners() {
  // Dashboard button (now in global header)
  const dashboardBtn = document.getElementById('dashboard-btn');
  dashboardBtn?.addEventListener('click', () => {
    browser.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
  });
  
  // Project selector
  const projectSelector = getElement<HTMLSelectElement>('project-selector');
  projectSelector.addEventListener('change', (e) => {
    const uuid = (e.target as HTMLSelectElement).value;
    selectProject(uuid);
  });
  
  // Model selector
  const modelSelector = getElement<HTMLSelectElement>('model-selector');
  modelSelector.value = state.currentModel;
  modelSelector.addEventListener('change', (e) => {
    state.currentModel = (e.target as HTMLSelectElement).value;
    localStorage.setItem('eidolon-model', state.currentModel);
    updateModelIndicator();
  });
  
  // Browser context toggle (optional - may be hidden)
  const contextToggle = document.getElementById('context-toggle');
  const browserContext = document.getElementById('browser-context');
  if (contextToggle && browserContext) {
    contextToggle.addEventListener('click', () => {
      browserContext.classList.toggle('collapsed');
    });
  }
  
  // History toggle
  const historyToggle = getElement('history-toggle');
  const historyPanel = getElement('conversation-history');
  historyToggle.addEventListener('click', (e) => {
    // Don't toggle if clicking the refresh button
    if ((e.target as HTMLElement).closest('#refresh-conversations-btn')) return;
    historyPanel.classList.toggle('collapsed');
  });
  
  // Refresh conversations button
  const refreshConversationsBtn = document.getElementById('refresh-conversations-btn');
  refreshConversationsBtn?.addEventListener('click', async (e) => {
    e.stopPropagation(); // Prevent history panel toggle
    const btn = e.currentTarget as HTMLElement;
    btn.classList.add('spinning');
    await loadConversations();
    setTimeout(() => btn.classList.remove('spinning'), 300);
  });
  
  // Settings button
  const settingsBtn = getElement('settings-btn');
  settingsBtn.addEventListener('click', () => {
    togglePanel('settings-panel');
  });
  
  // Close panel buttons
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const panel = (e.target as HTMLElement).closest('.slide-panel');
      if (panel) {
        panel.classList.remove('active');
        panel.classList.add('hidden');
      }
    });
  });
  
  // Send message
  const sendBtn = getElement('send-btn');
  const messageInput = getElement<HTMLTextAreaElement>('message-input');
  
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Auto-resize textarea
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  });
  
  // New Chat button
  const newChatBtn = getElement('new-chat-btn');
  newChatBtn.addEventListener('click', startNewChat);
  
  // ========================================================================
  // CLAUDE-STYLE MENU HANDLERS
  // ========================================================================
  
  // Plus Menu Button
  const plusMenuBtn = getElement('plus-menu-btn');
  const browserContextSubmenu = getElement('browser-context-submenu');
  const projectsSubmenu = getElement('projects-submenu');
  
  plusMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleClaudeMenu('plus-menu');
  });
  
  // Plus Menu Items
  const plusMenuItems = getElement('plus-menu-items');
  plusMenuItems.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.claude-menu-item');
    if (!target) return;
    
    const action = target.getAttribute('data-action');
    
    switch (action) {
      case 'screenshot':
        closeAllClaudeMenus();
        takeScreenshot();
        break;
      case 'capture':
        closeAllClaudeMenus();
        capturePage();
        break;
      case 'browser-context':
        showClaudeSubmenu('browser-context-submenu');
        break;
      case 'use-project':
        showClaudeSubmenu('projects-submenu');
        break;
    }
  });
  
  // Plus Menu Search
  const plusMenuSearch = getElement<HTMLInputElement>('plus-menu-search');
  plusMenuSearch.addEventListener('input', () => {
    filterClaudeMenuItems('plus-menu-items', plusMenuSearch.value);
  });
  
  // Browser Context Submenu Back Button
  const browserContextBackBtn = browserContextSubmenu.querySelector('.claude-back-btn');
  browserContextBackBtn?.addEventListener('click', () => {
    hideClaudeSubmenu('browser-context-submenu');
  });
  
  // Tabs Search in Browser Context Submenu - use grouped render with search
  const tabsSearch = getElement<HTMLInputElement>('tabs-search');
  tabsSearch.addEventListener('input', () => {
    renderTabsSubmenu(tabsSearch.value);
  });
  
  // Projects Submenu Back Button
  const projectsBackBtn = projectsSubmenu.querySelector('.claude-back-btn');
  projectsBackBtn?.addEventListener('click', () => {
    hideClaudeSubmenu('projects-submenu');
  });
  
  // Projects Search
  const projectsSearch = getElement<HTMLInputElement>('projects-search');
  projectsSearch.addEventListener('input', () => {
    filterClaudeMenuItems('projects-list', projectsSearch.value);
  });
  
  // Refresh Projects Button
  const refreshProjectsBtn = document.getElementById('refresh-projects-btn');
  refreshProjectsBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    refreshProjectsBtn.classList.add('loading');
    await loadProjects();
    refreshProjectsBtn.classList.remove('loading');
  });
  
  // Settings Menu Button
  const settingsMenuBtn = getElement('settings-menu-btn');
  const stylesSubmenu = getElement('styles-submenu');
  
  settingsMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleClaudeMenu('settings-menu');
  });
  
  // Settings Menu Items
  const settingsMenuItems = getElement('settings-menu-items');
  settingsMenuItems.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.claude-menu-item');
    if (!target) return;
    
    const action = target.getAttribute('data-action');
    
    if (action === 'use-style') {
      showClaudeSubmenu('styles-submenu');
    }
    // Agent mode toggle is handled separately
  });
  
  // Settings Menu Search
  const settingsMenuSearch = getElement<HTMLInputElement>('settings-menu-search');
  settingsMenuSearch.addEventListener('input', () => {
    filterClaudeMenuItems('settings-menu-items', settingsMenuSearch.value);
  });
  
  // Styles Submenu Back Button
  const stylesBackBtn = stylesSubmenu.querySelector('.claude-back-btn');
  stylesBackBtn?.addEventListener('click', () => {
    hideClaudeSubmenu('styles-submenu');
  });
  
  // Styles Search
  const stylesSearch = getElement<HTMLInputElement>('styles-search');
  stylesSearch.addEventListener('input', () => {
    filterClaudeMenuItems('styles-list', stylesSearch.value);
  });
  
  // Style Selection
  const stylesList = getElement('styles-list');
  stylesList.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.style-item');
    if (!target) return;
    
    const style = target.getAttribute('data-style');
    if (style) {
      selectStyle(style);
    }
  });
  
  // Agent Mode Toggle in Menu
  const menuAgentModeToggle = getElement<HTMLInputElement>('menu-agent-mode-toggle');
  menuAgentModeToggle.checked = state.agentMode;
  menuAgentModeToggle.addEventListener('change', () => {
    toggleAgentMode();
    // Keep all toggles in sync
    menuAgentModeToggle.checked = state.agentMode;
  });
  
  // Model Selector Button
  const modelSelectorBtn = getElement('model-selector-btn');
  
  modelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleClaudeMenu('model-menu');
  });
  
  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.claude-menu') && !target.closest('.claude-icon-btn') && !target.closest('.claude-model-btn')) {
      closeAllClaudeMenus();
    }
  });
  
  // Escape key closes menus
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllClaudeMenus();
    }
  });
  
  // Quick action buttons
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).dataset.action;
      handleQuickAction(action || '');
    });
  });
  
  // Dark mode toggle
  const darkModeToggle = getElement<HTMLInputElement>('dark-mode-toggle');
  darkModeToggle.checked = state.darkMode;
  darkModeToggle.addEventListener('change', toggleDarkMode);
  
  // Debug mode toggle
  const debugModeToggle = getElement<HTMLInputElement>('debug-mode-toggle');
  // Load initial state from storage
  chrome.storage.local.get(['eidolon_debug_mode'], (result) => {
    debugModeToggle.checked = result.eidolon_debug_mode === true;
  });
  debugModeToggle.addEventListener('change', toggleDebugMode);
  
  // Validate session button
  const validateBtn = getElement('validate-session-btn');
  validateBtn.addEventListener('click', validateSession);
  
  // History search
  const historySearchInput = getElement<HTMLInputElement>('history-search-input');
  historySearchInput.addEventListener('input', (e) => {
    filterConversations((e.target as HTMLInputElement).value);
  });
  
  // Agent mode toggle (in browser context panel)
  const agentModeToggle = getElement<HTMLInputElement>('agent-mode-toggle');
  agentModeToggle.checked = state.agentMode;
  agentModeToggle.addEventListener('change', toggleAgentMode);
  
  // Agent mode toggle (in settings panel) - keep in sync
  const settingsAgentModeToggle = getElement<HTMLInputElement>('settings-agent-mode-toggle');
  settingsAgentModeToggle.checked = state.agentMode;
  settingsAgentModeToggle.addEventListener('change', toggleAgentMode);
  
  // Stop agent button
  const stopAgentBtn = getElement('stop-agent-btn');
  stopAgentBtn.addEventListener('click', stopAgent);
  
  // Update agent UI state on init
  updateAgentModeUI();
  
  // Setup account switcher
  setupAccountSwitcher();
}

// ========================================================================
// DATA LOADING
// ========================================================================

async function loadProjects() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-projects' });
    
    if (response.success && response.data) {
      state.projects = response.data;
      renderProjectSelector();
      renderProjectsSubmenu();
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load projects:', error);
  }
}

async function loadConversations() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-conversations' });
    
    if (response.success && response.data) {
      state.conversations = response.data.slice(0, 20); // Last 20
      renderConversationList();
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load conversations:', error);
  }
}

async function loadTabs() {
  try {
    // Use tabs-context API to get ALL tabs with group info
    const response = await browser.runtime.sendMessage({ action: 'tabs-context' });
    
    if (response.success && response.data) {
      const { currentTabId, currentTabGroupId, availableTabs, tabGroups } = response.data;
      
      // Store current tab's group ID
      state.tabGroupId = currentTabGroupId ?? null;
      
      // Set default target tab to current tab
      if (!state.targetTabId) {
        state.targetTabId = currentTabId;
      }
      
      // Store tab group info
      state.tabGroups.clear();
      if (tabGroups) {
        for (const group of tabGroups) {
          state.tabGroups.set(group.id, {
            id: group.id,
            title: group.title || '',
            color: group.color || 'grey',
            collapsed: group.collapsed || false
          });
        }
      }
      
      // Map all tabs with their group info
      state.tabs = availableTabs.map((t: any) => ({
        id: t.tabId,
        title: t.title,
        url: t.url,
        favIconUrl: t.favIconUrl,
        active: t.active,
        inGroup: t.groupId !== undefined,
        groupId: t.groupId,
        groupTitle: t.groupTitle,
        groupColor: t.groupColor
      }));
      
      renderTabList();
      renderTabsSubmenu();
    } else {
      // Fallback to regular tab query
      const tabs = await browser.tabs.query({ currentWindow: true });
      state.tabs = tabs.map(tab => ({
        id: tab.id!,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        active: tab.active,
        inGroup: false
      }));
      renderTabList();
      renderTabsSubmenu();
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load tabs:', error);
  }
}

async function getCurrentTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      state.currentTab = {
        id: tab.id!,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl,
        active: true
      };
      updateCurrentTabDisplay();
    }
  } catch (error) {
    console.error('[Eidolon] Failed to get current tab:', error);
  }
}

async function checkAuthentication() {
  // Retry a few times since background script might still be initializing
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await browser.runtime.sendMessage({ action: 'validate-session' });
      if (response.success) {
        state.isAuthenticated = true;
        updateAuthStatus();
        console.log('[Eidolon] Authentication successful');
        return;
      }
      // Wait a bit before retrying
      if (attempt < 2) {
        console.log(`[Eidolon] Auth attempt ${attempt + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('[Eidolon] Auth check failed:', error);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  state.isAuthenticated = false;
  updateAuthStatus();
  console.log('[Eidolon] Authentication failed after retries');
}

async function loadAvailableModels() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-available-models' });
    
    if (response.success && response.data && response.data.length > 0) {
      // Update the models list with data from Claude.ai
      // Models come pre-filtered to latest per family from background
      AVAILABLE_MODELS = response.data.map((model: any, index: number) => ({
        id: model.id || model.model_id || '',
        name: model.name || model.display_name || model.id || 'Unknown Model',
        default: index === 0 // First model (Sonnet) is default
      }));
      
      console.log('[Eidolon] Loaded models from Claude.ai:', AVAILABLE_MODELS.map(m => m.name));
      
      // Update model names lookup
      updateModelNames();
      
      // Re-render the model selector with new models
      renderModelSelector();
      renderModelMenu();
      
      // Update the indicator in case model name changed
      updateModelIndicator();
      
      console.log('[Eidolon] Loaded models from Claude.ai:', AVAILABLE_MODELS.map(m => m.name));
    }
  } catch (error) {
    console.warn('[Eidolon] Failed to load models from Claude.ai, using defaults:', error);
    // Keep using the default fallback models
  }
}

// ========================================================================
// RENDERING
// ========================================================================

function renderProjectSelector() {
  const selector = getElement<HTMLSelectElement>('project-selector');
  selector.innerHTML = '<option value="">No Project</option>';
  
  state.projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.uuid;
    option.textContent = project.name;
    selector.appendChild(option);
  });
}

function renderModelSelector() {
  const selector = getElement<HTMLSelectElement>('model-selector');
  const currentValue = selector.value || state.currentModel;
  
  selector.innerHTML = '';
  
  AVAILABLE_MODELS.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    selector.appendChild(option);
  });
  
  // Restore the selected value if it still exists, otherwise use default
  const validModel = AVAILABLE_MODELS.find(m => m.id === currentValue);
  if (validModel) {
    selector.value = currentValue;
  } else {
    const defaultModel = AVAILABLE_MODELS.find(m => m.default) || AVAILABLE_MODELS[0];
    if (defaultModel) {
      selector.value = defaultModel.id;
      state.currentModel = defaultModel.id;
      localStorage.setItem('eidolon-model', defaultModel.id);
    }
  }
}

function renderConversationList() {
  const list = getElement('conversation-list');
  
  if (state.conversations.length === 0) {
    list.innerHTML = '<div class="empty-state">No conversations yet</div>';
    return;
  }
  
  list.innerHTML = state.conversations.map(conv => `
    <div class="conversation-item" data-uuid="${conv.uuid}">
      <div class="conversation-item-title">${escapeHtml(conv.name)}</div>
      <div class="conversation-item-meta">${formatDate(conv.updated_at)}</div>
    </div>
  `).join('');
  
  // Add click handlers
  list.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => {
      const uuid = (item as HTMLElement).dataset.uuid;
      if (uuid) openConversation(uuid);
    });
  });
}

function renderTabList() {
  const list = getElement('tab-list');
  
  if (state.tabs.length === 0) {
    list.innerHTML = '<div class="empty-state">No tabs in group</div>';
    return;
  }
  
  // Show tab group info if in a group
  const groupInfo = state.tabGroupId 
    ? `<div class="tab-group-info">Tab Group (${state.tabs.length} tabs)</div>`
    : '';
  
  list.innerHTML = groupInfo + state.tabs.map(tab => {
    const isTarget = tab.id === state.targetTabId;
    const isActive = tab.active;
    return `
      <div class="tab-item ${isActive ? 'active' : ''} ${isTarget ? 'target' : ''} ${tab.inGroup ? 'in-group' : ''}" 
           data-id="${tab.id}"
           title="${isTarget ? 'Target tab for agent actions' : 'Click to set as target'}">
        <div class="tab-target-indicator">${isTarget ? '🎯' : ''}</div>
        <img class="tab-favicon" src="${tab.favIconUrl || '/icon-16.png'}" alt="">
        <span class="tab-title">${escapeHtml(tab.title)}</span>
        ${isActive ? '<span class="tab-active-badge">Active</span>' : ''}
      </div>
    `;
  }).join('');
  
  // Add click handlers - click to set as target, double-click to focus
  list.querySelectorAll('.tab-item').forEach(item => {
    // Single click - set as target tab for agent actions
    item.addEventListener('click', () => {
      const id = parseInt((item as HTMLElement).dataset.id || '0');
      if (id) {
        state.targetTabId = id;
        renderTabList(); // Re-render to show new target
        updateCurrentTabDisplay();
        console.log('[Eidolon] Target tab set to:', id);
      }
    });
    
    // Double click - focus the tab
    item.addEventListener('dblclick', () => {
      const id = parseInt((item as HTMLElement).dataset.id || '0');
      if (id) focusTab(id);
    });
  });
}

function updateCurrentTabDisplay() {
  // Show target tab info (for agent actions), or current tab as fallback
  const targetTab = state.tabs.find(t => t.id === state.targetTabId) || state.currentTab;
  
  // Update hidden elements for compatibility
  const titleEl = document.getElementById('current-tab-title');
  const urlEl = document.getElementById('current-tab-url');
  
  if (!targetTab) {
    if (titleEl) titleEl.textContent = 'No tab selected';
    if (urlEl) urlEl.textContent = '';
    
    // Also update the menu current tab display
    const menuTitleEl = document.getElementById('menu-current-tab-title');
    if (menuTitleEl) menuTitleEl.textContent = 'No tab selected';
    return;
  }
  
  // Update hidden elements
  if (titleEl) {
    if (state.targetTabId && state.targetTabId !== state.currentTab?.id) {
      titleEl.textContent = `🎯 ${targetTab.title}`;
      titleEl.title = 'Target tab for agent actions';
    } else {
      titleEl.textContent = targetTab.title;
      titleEl.title = '';
    }
  }
  if (urlEl) urlEl.textContent = targetTab.url;
  
  // Also update the menu current tab display
  const menuTitleEl = document.getElementById('menu-current-tab-title');
  if (menuTitleEl) {
    menuTitleEl.textContent = targetTab.title;
  }
}

function updateAuthStatus() {
  const statusText = getElement('auth-status-text');
  const statusIcon = document.querySelector('.auth-icon');
  
  if (state.isAuthenticated) {
    statusText.textContent = 'Authenticated';
    if (statusIcon) statusIcon.textContent = '✅';
  } else {
    statusText.textContent = 'Not authenticated';
    if (statusIcon) statusIcon.textContent = '❌';
  }
}

// ========================================================================
// ACCOUNT MANAGEMENT
// ========================================================================

interface EidolonAccount {
  id: string;
  name: string;
  email?: string;
  type: 'work' | 'personal';
  color: string;
  sessionKey: string;
  organizationId?: string;
  organizationName?: string;
  createdAt: string;
  lastUsedAt: string;
  isActive: boolean;
}

interface AccountsStorage {
  accounts: EidolonAccount[];
  activeAccountId: string | null;
  version: number;
}

const ACCOUNT_COLORS = [
  '#E07850', '#3B82F6', '#10B981', '#8B5CF6',
  '#F59E0B', '#EC4899', '#06B6D4', '#EF4444',
];

/**
 * Load and render accounts list in settings panel
 */
async function loadAccounts(): Promise<void> {
  const accountsList = document.getElementById('accounts-list');
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-accounts' });
    
    if (response.success && response.data) {
      renderAccountsList(response.data);
      updateHeaderAccountAvatar(response.data);
    } else {
      if (accountsList) {
        accountsList.innerHTML = `
          <div class="no-accounts">
            <div class="no-accounts-icon">👤</div>
            <div class="no-accounts-text">No accounts saved yet.<br>Log in to Claude.ai to auto-save.</div>
          </div>
        `;
      }
      updateHeaderAccountAvatar(null);
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load accounts:', error);
    if (accountsList) {
      accountsList.innerHTML = `
        <div class="no-accounts">
          <div class="no-accounts-text">Failed to load accounts</div>
        </div>
      `;
    }
    updateHeaderAccountAvatar(null);
  }
}

/**
 * Update the header account avatar with active account
 */
function updateHeaderAccountAvatar(storage: AccountsStorage | null): void {
  const avatarEl = document.getElementById('header-account-avatar');
  const btnEl = document.getElementById('settings-btn'); // Now uses settings-btn (combined button)
  
  if (!avatarEl) return;
  
  if (!storage || !storage.accounts || storage.accounts.length === 0) {
    avatarEl.textContent = '?';
    avatarEl.style.backgroundColor = 'var(--text-400)';
    if (btnEl) btnEl.title = 'Settings & Accounts';
    return;
  }
  
  // Find active account
  const activeAccount = storage.accounts.find(a => a.isActive) || 
                       storage.accounts.find(a => a.id === storage.activeAccountId) ||
                       storage.accounts[0];
  
  if (activeAccount) {
    avatarEl.textContent = getAccountInitials(activeAccount.name);
    avatarEl.style.backgroundColor = activeAccount.color;
    if (btnEl) btnEl.title = `${activeAccount.name} - Settings & Accounts`;
  }
}

/**
 * Render the accounts list
 */
function renderAccountsList(storage: AccountsStorage): void {
  const accountsList = document.getElementById('accounts-list');
  if (!accountsList) return;
  
  if (!storage.accounts || storage.accounts.length === 0) {
    accountsList.innerHTML = `
      <div class="no-accounts">
        <div class="no-accounts-icon">👤</div>
        <div class="no-accounts-text">No accounts saved yet.<br>Log in to Claude.ai to auto-save.</div>
      </div>
    `;
    return;
  }
  
  // Sort: active first, then by lastUsedAt
  const sortedAccounts = [...storage.accounts].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
  });
  
  accountsList.innerHTML = sortedAccounts.map(account => {
    const initials = getAccountInitials(account.name);
    const isActive = account.isActive || account.id === storage.activeAccountId;
    
    return `
      <div class="account-item ${isActive ? 'active' : ''}" data-account-id="${account.id}">
        <div class="account-avatar" style="background-color: ${account.color}">${initials}</div>
        <div class="account-info">
          <div class="account-name">${escapeHtml(account.name)}</div>
          <div class="account-org">${escapeHtml(account.organizationName || 'Unknown org')}</div>
        </div>
        <span class="account-badge ${account.type}">${account.type}</span>
        <div class="account-actions">
          <button class="account-action-btn edit-account-btn" data-account-id="${account.id}" title="Edit">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M10 2l2 2-7 7H3v-2l7-7z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  accountsList.querySelectorAll('.account-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      // Don't switch if clicking edit button
      if ((e.target as HTMLElement).closest('.account-action-btn')) return;
      
      const accountId = item.getAttribute('data-account-id');
      if (accountId && !item.classList.contains('active')) {
        await switchAccount(accountId);
      }
    });
  });
  
  // Add edit handlers
  accountsList.querySelectorAll('.edit-account-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const accountId = (btn as HTMLElement).getAttribute('data-account-id');
      if (accountId) {
        const account = storage.accounts.find(a => a.id === accountId);
        if (account) openAccountEditModal(account);
      }
    });
  });
}

/**
 * Get initials from account name
 */
function getAccountInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Switch to a different account
 */
async function switchAccount(accountId: string): Promise<void> {
  showLoading('Switching account...');
  
  try {
    const response = await browser.runtime.sendMessage({ 
      action: 'switch-account',
      accountId 
    });
    
    if (response.success) {
      // Reload data after account switch
      await Promise.all([
        loadAccounts(),
        loadProjects(),
        loadConversations(),
        checkAuthentication()
      ]);
      
      showNotification('Switched account successfully');
    } else {
      showNotification(`Failed to switch: ${response.error}`, 'error');
    }
  } catch (error: any) {
    showNotification(`Error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Open account edit modal
 */
function openAccountEditModal(account: EidolonAccount): void {
  const modal = document.getElementById('account-edit-modal');
  if (!modal) return;
  
  // Populate form
  const accountIdInput = document.getElementById('edit-account-id') as HTMLInputElement;
  const nameInput = document.getElementById('edit-account-name') as HTMLInputElement;
  const colorSelector = document.getElementById('account-color-selector');
  
  if (accountIdInput) accountIdInput.value = account.id;
  if (nameInput) nameInput.value = account.name;
  
  // Render color options
  if (colorSelector) {
    colorSelector.innerHTML = ACCOUNT_COLORS.map(color => `
      <button class="color-option ${color === account.color ? 'selected' : ''}" 
              data-color="${color}" 
              style="background-color: ${color}">
      </button>
    `).join('');
    
    colorSelector.querySelectorAll('.color-option').forEach(btn => {
      btn.addEventListener('click', () => {
        colorSelector.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }
  
  // Set type buttons
  document.querySelectorAll('.type-btn').forEach(btn => {
    const type = btn.getAttribute('data-type');
    btn.classList.toggle('selected', type === account.type);
  });
  
  // Show modal
  modal.classList.remove('hidden');
}

/**
 * Close account edit modal
 */
function closeAccountEditModal(): void {
  const modal = document.getElementById('account-edit-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Save account edits
 */
async function saveAccountEdit(): Promise<void> {
  const accountIdInput = document.getElementById('edit-account-id') as HTMLInputElement;
  const nameInput = document.getElementById('edit-account-name') as HTMLInputElement;
  const selectedColor = document.querySelector('.color-option.selected') as HTMLElement;
  const selectedType = document.querySelector('.type-btn.selected') as HTMLElement;
  
  if (!accountIdInput?.value) return;
  
  const updates: { name?: string; type?: 'work' | 'personal'; color?: string } = {};
  
  if (nameInput?.value) updates.name = nameInput.value.trim();
  if (selectedColor?.dataset.color) updates.color = selectedColor.dataset.color;
  if (selectedType?.dataset.type) updates.type = selectedType.dataset.type as 'work' | 'personal';
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'update-account',
      accountId: accountIdInput.value,
      updates
    });
    
    if (response.success) {
      closeAccountEditModal();
      await loadAccounts();
      showNotification('Account updated');
    } else {
      showNotification(`Failed to update: ${response.error}`, 'error');
    }
  } catch (error: any) {
    showNotification(`Error: ${error.message}`, 'error');
  }
}

/**
 * Delete an account
 */
async function deleteCurrentAccount(): Promise<void> {
  const accountIdInput = document.getElementById('edit-account-id') as HTMLInputElement;
  if (!accountIdInput?.value) return;
  
  if (!confirm('Are you sure you want to delete this account? You can re-add it by logging in again.')) {
    return;
  }
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'delete-account',
      accountId: accountIdInput.value
    });
    
    if (response.success) {
      closeAccountEditModal();
      await loadAccounts();
      showNotification('Account deleted');
    } else {
      showNotification(`Failed to delete: ${response.error}`, 'error');
    }
  } catch (error: any) {
    showNotification(`Error: ${error.message}`, 'error');
  }
}

/**
 * Show a simple notification
 */
function showNotification(message: string, type: 'success' | 'error' = 'success'): void {
  // Use existing activity indicator as a simple notification
  const indicator = document.getElementById('activity-indicator');
  const text = document.getElementById('activity-text');
  
  if (indicator && text) {
    text.textContent = message;
    indicator.classList.remove('hidden');
    indicator.style.background = type === 'error' ? 'var(--error)' : 'var(--success)';
    
    setTimeout(() => {
      indicator.classList.add('hidden');
      indicator.style.background = '';
    }, 2000);
  }
}

/**
 * Setup account switcher event listeners
 */
function setupAccountSwitcher(): void {
  // Close account modal button
  const closeModalBtn = document.getElementById('close-account-modal');
  closeModalBtn?.addEventListener('click', closeAccountEditModal);
  
  // Click outside modal to close
  const modal = document.getElementById('account-edit-modal');
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeAccountEditModal();
  });
  
  // Type buttons
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  
  // Save button
  const saveBtn = document.getElementById('save-account-btn');
  saveBtn?.addEventListener('click', saveAccountEdit);
  
  // Delete button
  const deleteBtn = document.getElementById('delete-account-btn');
  deleteBtn?.addEventListener('click', deleteCurrentAccount);
  
  // Add account button - opens Claude.ai in new tab
  const addAccountBtn = document.getElementById('add-account-btn');
  addAccountBtn?.addEventListener('click', () => {
    browser.tabs.create({ url: 'https://claude.ai/login' });
    showNotification('Log in to Claude.ai - account will auto-save');
  });
  
  // Load accounts when settings panel opens (settings-btn is now the account avatar)
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn?.addEventListener('click', () => {
    // Small delay to ensure panel is visible
    setTimeout(loadAccounts, 100);
  });
}

function renderMessages() {
  const messagesArea = getElement('messages');
  
  if (state.messages.length === 0) {
    // Show welcome message
    messagesArea.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">👋</div>
        <h2>Welcome to Eidolon</h2>
        <p>Your enhanced Claude assistant with full browser integration.</p>
        <div class="quick-actions">
          <button class="quick-action-btn" data-action="summarize-page">
            📄 Summarize this page
          </button>
          <button class="quick-action-btn" data-action="analyze-tabs">
            🗂️ Analyze open tabs
          </button>
          <button class="quick-action-btn" data-action="help-browse">
            🌐 Help me browse
          </button>
        </div>
      </div>
    `;
    
    // Re-attach handlers
    messagesArea.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).dataset.action;
        handleQuickAction(action || '');
      });
    });
    return;
  }
  
  messagesArea.innerHTML = state.messages.map(msg => `
    <div class="message ${msg.role}">
      <div class="message-header">
        <span class="message-avatar">${msg.role === 'user' ? '👤' : '🤖'}</span>
        <span>${msg.role === 'user' ? 'You' : 'Claude'}</span>
      </div>
      <div class="message-content">${formatMessageContent(msg.content)}</div>
    </div>
  `).join('');
  
  // Scroll to bottom
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function renderAttachments() {
  const container = getElement('attachments');
  
  if (state.attachments.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = state.attachments.map((att, idx) => `
    <div class="attachment-chip">
      <span>${att.type === 'screenshot' ? '📸' : '📄'} ${escapeHtml(att.name)}</span>
      <button class="attachment-remove" data-index="${idx}">×</button>
    </div>
  `).join('');
  
  // Add remove handlers
  container.querySelectorAll('.attachment-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.index || '0');
      state.attachments.splice(idx, 1);
      renderAttachments();
    });
  });
}

// ========================================================================
// ACTIONS
// ========================================================================

function selectProject(uuid: string) {
  if (!uuid) {
    state.currentProject = null;
    return;
  }
  
  state.currentProject = state.projects.find(p => p.uuid === uuid) || null;
  console.log('[Eidolon] Selected project:', state.currentProject?.name);
}

async function openConversation(uuid: string) {
  console.log('[Eidolon] Opening conversation:', uuid);
  // TODO: Load conversation messages and continue
  showActivity('Loading conversation...');
  
  // For now, just show a message
  setTimeout(() => {
    hideActivity();
  }, 1000);
}

async function focusTab(tabId: number) {
  try {
    await browser.tabs.update(tabId, { active: true });
    await getCurrentTab();
    await loadTabs();
  } catch (error) {
    console.error('[Eidolon] Failed to focus tab:', error);
  }
}

async function capturePage() {
  showActivity('Capturing page content...');
  
  try {
    if (!state.currentTab) {
      throw new Error('No active tab');
    }
    
    // Execute script to get page content
    const results = await browser.scripting.executeScript({
      target: { tabId: state.currentTab.id },
      func: () => {
        return {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText.slice(0, 50000), // Limit to 50k chars
          html: document.documentElement.outerHTML.slice(0, 100000) // Limit to 100k chars
        };
      }
    });
    
    if (results && results[0]?.result) {
      const content = results[0].result;
      state.attachments.push({
        type: 'page-content',
        name: content.title || 'Page Content',
        content: `URL: ${content.url}\n\n${content.text}`
      });
      renderAttachments();
    }
    
    hideActivity();
  } catch (error) {
    console.error('[Eidolon] Failed to capture page:', error);
    hideActivity();
    alert('Failed to capture page content. Make sure the page is accessible.');
  }
}

async function takeScreenshot() {
  showActivity('Taking screenshot...');
  
  try {
    const dataUrl = await browser.tabs.captureVisibleTab();
    
    state.attachments.push({
      type: 'screenshot',
      name: `Screenshot - ${new Date().toLocaleTimeString()}`,
      content: dataUrl
    });
    renderAttachments();
    
    hideActivity();
  } catch (error) {
    console.error('[Eidolon] Failed to take screenshot:', error);
    hideActivity();
    alert('Failed to take screenshot.');
  }
}

async function addCurrentPageToProject() {
  if (!state.currentProject) {
    alert('Please select a project first.');
    return;
  }
  
  showActivity('Adding to project...');
  
  try {
    if (!state.currentTab) {
      throw new Error('No active tab');
    }
    
    // Get page content
    const results = await browser.scripting.executeScript({
      target: { tabId: state.currentTab.id },
      func: () => ({
        title: document.title,
        url: window.location.href,
        text: document.body.innerText
      })
    });
    
    if (results && results[0]?.result) {
      const content = results[0].result;
      const fileName = `${sanitizeFilename(content.title)}.md`;
      const fileContent = `# ${content.title}\n\n**URL:** ${content.url}\n\n---\n\n${content.text}`;
      
      // Upload to project
      const response = await browser.runtime.sendMessage({
        action: 'upload-file',
        projectId: state.currentProject.uuid,
        fileName,
        content: fileContent
      });
      
      if (response.success) {
        hideActivity();
        alert(`Added "${fileName}" to ${state.currentProject.name}`);
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    }
  } catch (error) {
    console.error('[Eidolon] Failed to add to project:', error);
    hideActivity();
    alert('Failed to add page to project.');
  }
}

async function sendMessage() {
  const input = getElement<HTMLTextAreaElement>('message-input');
  const content = input.value.trim();
  
  if (!content && state.attachments.length === 0) return;
  
  // Ensure we're authenticated before sending (same as clicking validate in settings)
  if (!state.isAuthenticated) {
    showActivity('Authenticating...');
    await validateSession();
    if (!state.isAuthenticated) {
      hideActivity();
      alert('Please log in to Claude.ai first, then try again.');
      return;
    }
  }
  
  // Build message with context
  let fullContent = content;
  
  // Build API attachments from our attachments
  const apiAttachments: any[] = [];
  for (const att of state.attachments) {
    if (att.type === 'page-content') {
      apiAttachments.push({
        extracted_content: att.content,
        file_name: `${att.name}.txt`,
        file_size: att.content.length,
        file_type: 'text/plain'
      });
    } else if (att.type === 'screenshot') {
      // Screenshots need to be handled differently - add as context for now
      fullContent = `${fullContent}\n\n[Screenshot: ${att.name}]`;
    }
  }
  
  // Add user message to state
  const userMessage: Message = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date(),
    attachments: [...state.attachments]
  };
  
  state.messages.push(userMessage);
  state.attachments = [];
  
  // Clear input
  input.value = '';
  input.style.height = 'auto';
  
  // Render
  renderMessages();
  renderAttachments();
  
  // Show activity
  showActivity('Claude is thinking...');
  
  try {
    // ====================================================================
    // DETECT MID-CHAT MODEL CHANGE
    // If the model changed since the conversation started, we need to:
    // 1. Force a new conversation (Claude.ai requires this)
    // 2. Include the chat history in the first message so context is preserved
    // ====================================================================
    let chatHistoryContext = '';
    const modelChanged = state.conversationModel && 
                         state.currentModel !== state.conversationModel && 
                         state.messages.length > 1; // More than just the message we just added
    
    if (modelChanged) {
      console.log(`[Eidolon] Model changed mid-chat: ${state.conversationModel} -> ${state.currentModel}`);
      
      // Build chat history context from previous messages (excluding the one we just added)
      const previousMessages = state.messages.slice(0, -1);
      if (previousMessages.length > 0) {
        chatHistoryContext = '\n\n---\n**[Continuing conversation from a different model. Previous chat history:]**\n\n';
        for (const msg of previousMessages) {
          const role = msg.role === 'user' ? 'User' : 'Assistant';
          chatHistoryContext += `**${role}:** ${msg.content}\n\n`;
        }
        chatHistoryContext += '---\n**[End of previous history. Please continue the conversation naturally based on the context above.]**\n\n';
      }
      
      // Force new conversation by clearing the ID
      state.currentConversationId = null;
      console.log('[Eidolon] Forcing new conversation due to model change');
    }
    
    // Check if we have an active conversation, if not create one
    if (!state.currentConversationId) {
      const convName = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      const createResponse = await browser.runtime.sendMessage({
        action: 'create-conversation',
        name: convName,
        projectUuid: state.currentProject?.uuid
      });
      
      if (!createResponse.success) {
        throw new Error(createResponse.error || 'Failed to create conversation');
      }
      
      state.currentConversationId = createResponse.data.uuid;
      state.conversationModel = state.currentModel; // Track the model for this conversation
      console.log('[Eidolon] Created conversation:', state.currentConversationId, 'with model:', state.conversationModel);
    }
    
    // Prepend chat history context if model changed
    if (chatHistoryContext) {
      fullContent = chatHistoryContext + '**Current message:** ' + fullContent;
    }
    
    // ====================================================================
    // AGENT MODE: Use agentic loop with tools
    // ====================================================================
    if (state.agentMode) {
      console.log('[Eidolon] Agent mode enabled - running agentic loop');
      state.agentRunning = true;
      updateAgentModeUI();
      
      // Show agent indicator on target tab
      const targetId = state.targetTabId ?? state.currentTab?.id;
      if (targetId) {
        await browser.runtime.sendMessage({
          action: 'show-agent-indicator',
          tabId: targetId,
          message: 'Agent is working...'
        });
      }
      
      try {
        // Build context for agent
        let agentPrompt = fullContent;
        
        // Add page context if we have attachments
        if (apiAttachments.length > 0) {
          agentPrompt += '\n\nContext from attached content:\n';
          for (const att of apiAttachments) {
            agentPrompt += `\n--- ${att.file_name} ---\n${att.extracted_content}\n`;
          }
        }
        
        // Run the agentic loop
        const response = await runAgenticLoop(agentPrompt);
        
        // Add assistant response
        const assistantMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: response || 'Agent completed the task.',
          timestamp: new Date()
        };
        
        state.messages.push(assistantMessage);
        renderMessages();
        
      } finally {
        // Always clean up agent state
        state.agentRunning = false;
        updateAgentModeUI();
        
        // Hide agent indicator
        if (targetId) {
          await browser.runtime.sendMessage({
            action: 'hide-agent-indicator',
            tabId: targetId
          });
        }
      }
      
      hideActivity();
      return;
    }
    
    // ====================================================================
    // NORMAL MODE: Simple chat without tools
    // ====================================================================
    const response = await browser.runtime.sendMessage({
      action: 'send-chat-message',
      conversationId: state.currentConversationId,
      message: fullContent,
      attachments: apiAttachments,
      model: state.currentModel,
      personalizedStyles: state.currentStyle ? [state.currentStyle] : undefined
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to send message');
    }
    
    // Add assistant response
    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: response.data.response || 'No response received',
      timestamp: new Date()
    };
    
    state.messages.push(assistantMessage);
    renderMessages();
    hideActivity();
    
  } catch (error: any) {
    console.error('[Eidolon] Chat error:', error);
    hideActivity();
    
    // Clean up agent state if running
    if (state.agentRunning) {
      state.agentRunning = false;
      updateAgentModeUI();
    }
    
    // Show error in chat
    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `**Error:** ${error.message}\n\nPlease make sure you're logged into Claude.ai and try again.`,
      timestamp: new Date()
    };
    
    state.messages.push(errorMessage);
    renderMessages();
  }
}

async function handleQuickAction(action: string) {
  const input = getElement<HTMLTextAreaElement>('message-input');
  
  switch (action) {
    case 'summarize-page':
      await capturePage();
      input.value = 'Please summarize this page for me.';
      break;
      
    case 'analyze-tabs':
      const tabList = state.tabs.map(t => `- ${t.title}`).join('\n');
      input.value = `I have these tabs open:\n${tabList}\n\nCan you help me organize them or identify what I'm working on?`;
      break;
      
    case 'help-browse':
      if (state.agentMode) {
        input.value = 'I need help with browsing. What can you help me do?';
      } else {
        input.value = '[Agent mode must be enabled in Settings to use browser automation]\n\nI need help with browsing. What can you help me do?';
      }
      break;
  }
  
  // Trigger auto-resize by dispatching input event
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}



async function validateSession() {
  showLoading('Validating session...');
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'validate-session' });
    state.isAuthenticated = response.success;
    updateAuthStatus();
    
    if (response.success) {
      await loadProjects();
      await loadConversations();
      await loadStyles(); // Load personalized styles
    }
  } catch (error) {
    console.error('[Eidolon] Session validation failed:', error);
    state.isAuthenticated = false;
    updateAuthStatus();
  }
  
  hideLoading();
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  // Use both class and data-mode attribute for Claude compatibility
  document.body.classList.toggle('dark-mode', state.darkMode);
  document.documentElement.setAttribute('data-mode', state.darkMode ? 'dark' : 'light');
  localStorage.setItem('eidolon-dark-mode', state.darkMode.toString());
}

function toggleDebugMode() {
  const toggle = getElement<HTMLInputElement>('debug-mode-toggle');
  const enabled = toggle.checked;
  
  // Save to chrome.storage.local (background script listens for changes)
  chrome.storage.local.set({ eidolon_debug_mode: enabled }, () => {
    console.log('[Eidolon] Debug mode:', enabled ? 'ON' : 'OFF');
  });
}

// ========================================================================
// AGENT MODE FUNCTIONS
// ========================================================================

async function toggleAgentMode() {
  state.agentMode = !state.agentMode;
  localStorage.setItem('eidolon-agent-mode', state.agentMode.toString());
  updateAgentModeUI();
  
  if (state.agentMode) {
    console.log('[Eidolon] Agent mode enabled');
    
    // Create a tab group for the agent session if not already in one
    const targetId = state.targetTabId ?? state.currentTab?.id;
    if (targetId && !state.tabGroupId) {
      try {
        const response = await browser.runtime.sendMessage({
          action: 'browser-create-tab-group',
          tabIds: [targetId],
          title: 'Eidolon Agent',
          color: 'orange'
        });
        if (response.success) {
          state.tabGroupId = response.data.groupId;
          console.log('[Eidolon] Created tab group:', state.tabGroupId);
          // Reload tabs to show the new group
          await loadTabs();
        }
      } catch (error) {
        console.log('[Eidolon] Could not create tab group:', error);
      }
    }
    
    // Show agent indicator on target tab
    if (targetId) {
      browser.runtime.sendMessage({
        action: 'show-agent-indicator',
        tabId: targetId,
        message: 'Agent mode enabled'
      });
    }
  } else {
    console.log('[Eidolon] Agent mode disabled');
    stopAgent();
  }
}

function updateAgentModeUI() {
  const banner = document.getElementById('agent-mode-banner');
  const agentActions = document.getElementById('agent-actions');
  const toggle = document.getElementById('agent-mode-toggle') as HTMLInputElement | null;
  const settingsToggle = document.getElementById('settings-agent-mode-toggle') as HTMLInputElement | null;
  const menuToggle = document.getElementById('menu-agent-mode-toggle') as HTMLInputElement | null;
  
  // Sync all toggles
  if (toggle) toggle.checked = state.agentMode;
  if (settingsToggle) settingsToggle.checked = state.agentMode;
  if (menuToggle) menuToggle.checked = state.agentMode;
  
  if (state.agentMode) {
    agentActions?.classList.remove('hidden');
    if (state.agentRunning) {
      banner?.classList.remove('hidden');
    }
  } else {
    agentActions?.classList.add('hidden');
    banner?.classList.add('hidden');
  }
}

async function stopAgent() {
  state.agentRunning = false;
  updateAgentModeUI();
  
  // Hide indicator on all tabs in the group
  const targetId = state.targetTabId ?? state.currentTab?.id;
  if (targetId) {
    browser.runtime.sendMessage({
      action: 'hide-agent-indicator',
      tabId: targetId
    });
  }
  
  hideActivity();
  console.log('[Eidolon] Agent stopped');
}

async function getAccessibilityTree() {
  const targetId = state.targetTabId ?? state.currentTab?.id;
  if (!targetId) {
    alert('No target tab selected');
    return;
  }
  
  const targetTab = state.tabs.find(t => t.id === targetId);
  showActivity('Getting page structure...');
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'browser-get-accessibility-tree',
      tabId: targetId
    });
    
    if (response.success && response.data) {
      console.log('[Eidolon] Accessibility tree:', response.data);
      
      // Add as attachment for context
      const treeJson = JSON.stringify(response.data.tree || response.data, null, 2);
      state.attachments.push({
        type: 'page-content',
        name: 'Page Structure (Accessibility Tree)',
        content: `Accessibility tree for: ${response.data.url || targetTab?.url || 'unknown'}\n\n${treeJson}`
      });
      renderAttachments();
      
      hideActivity();
    } else {
      throw new Error(response.error || 'Failed to get accessibility tree');
    }
  } catch (error: any) {
    console.error('[Eidolon] Failed to get accessibility tree:', error);
    hideActivity();
    alert('Failed to get page structure: ' + error.message);
  }
}

async function takeCdpScreenshot() {
  const targetId = state.targetTabId ?? state.currentTab?.id;
  if (!targetId) {
    alert('No target tab selected');
    return;
  }
  
  showActivity('Taking full screenshot...');
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'browser-take-screenshot',
      tabId: targetId,
      format: 'png',
      quality: 80
    });
    
    if (response.success && response.data?.screenshot) {
      state.attachments.push({
        type: 'screenshot',
        name: `Full Screenshot - ${new Date().toLocaleTimeString()}`,
        content: response.data.screenshot
      });
      renderAttachments();
      
      hideActivity();
    } else {
      throw new Error(response.error || 'Failed to take screenshot');
    }
  } catch (error: any) {
    console.error('[Eidolon] CDP Screenshot failed:', error);
    hideActivity();
    alert('Failed to take screenshot: ' + error.message);
  }
}

// ========================================================================
// TOOL EXECUTOR - Maps tool calls to browser actions
// ========================================================================

/**
 * Execute a tool call from Claude and return the result
 */
async function executeToolCall(toolName: string, toolInput: Record<string, any>): Promise<{
  content: string | Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
  is_error?: boolean;
}> {
  const targetId = state.targetTabId ?? state.currentTab?.id;
  
  if (!targetId && toolName !== 'tabs_context' && toolName !== 'tabs_create') {
    return { content: 'Error: No target tab available', is_error: true };
  }
  
  console.log(`[Eidolon Agent] Executing tool: ${toolName}`, toolInput);
  showActivity(`Executing: ${toolName}...`);
  
  try {
    switch (toolName) {
      case 'computer': {
        return await executeComputerTool(targetId!, toolInput);
      }
      
      case 'read_page': {
        const response = await browser.runtime.sendMessage({
          action: 'browser-get-accessibility-tree',
          tabId: targetId,
          maxDepth: toolInput.max_depth || 10
        });
        
        if (response.success && response.data) {
          const treeJson = JSON.stringify(response.data.tree || response.data, null, 2);
          return { content: `Page accessibility tree for ${response.data.url}:\n\n${treeJson}` };
        }
        return { content: `Error getting accessibility tree: ${response.error}`, is_error: true };
      }
      
      case 'tabs_context': {
        const response = await browser.runtime.sendMessage({ action: 'tabs-context' });
        
        if (response.success && response.data) {
          const { currentTabId, availableTabs, tabGroupId } = response.data;
          const result = {
            current_tab_id: currentTabId,
            tab_group_id: tabGroupId,
            tabs: availableTabs.map((t: any) => ({
              id: t.tabId,
              title: t.title,
              url: t.url
            }))
          };
          return { content: JSON.stringify(result, null, 2) };
        }
        return { content: `Error getting tabs context: ${response.error}`, is_error: true };
      }
      
      case 'tabs_create': {
        const response = await browser.runtime.sendMessage({
          action: 'tabs-create',
          url: toolInput.url
        });
        
        if (response.success && response.data) {
          // Update target to the new tab
          state.targetTabId = response.data.tabId;
          await loadTabs();
          return { content: `Created new tab (ID: ${response.data.tabId})${toolInput.url ? ` and navigated to ${toolInput.url}` : ''}` };
        }
        return { content: `Error creating tab: ${response.error}`, is_error: true };
      }
      
      case 'get_page_text': {
        const results = await browser.scripting.executeScript({
          target: { tabId: targetId! },
          func: () => document.body.innerText
        });
        
        if (results && results[0]?.result) {
          const maxLength = toolInput.max_length || 50000;
          const text = results[0].result.slice(0, maxLength);
          return { content: text };
        }
        return { content: 'Error: Could not get page text', is_error: true };
      }
      
      default:
        return { content: `Unknown tool: ${toolName}`, is_error: true };
    }
  } catch (error: any) {
    console.error(`[Eidolon Agent] Tool execution error:`, error);
    return { content: `Error executing ${toolName}: ${error.message}`, is_error: true };
  }
}

/**
 * Helper to resolve ref to coordinates by getting element bounds
 */
async function resolveRefToCoordinates(tabId: number, ref: string): Promise<{ x: number; y: number } | null> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (refId: string) => {
        const getBounds = (window as any).__getBoundsByRef;
        if (!getBounds) return null;
        const bounds = getBounds(refId);
        if (!bounds) return null;
        // Return center of the element
        return {
          x: Math.round(bounds.x + bounds.width / 2),
          y: Math.round(bounds.y + bounds.height / 2)
        };
      },
      args: [ref]
    });
    return results?.[0]?.result || null;
  } catch (error) {
    console.error('[Eidolon Agent] Failed to resolve ref:', error);
    return null;
  }
}

/**
 * Helper to click element by ref directly (more reliable than coordinate clicking)
 */
async function clickElementByRef(tabId: number, ref: string): Promise<{ success: boolean; error?: string }> {
  try {
    // First scroll element into view
    await browser.scripting.executeScript({
      target: { tabId },
      func: (refId: string) => {
        const scrollToRef = (window as any).__scrollToRef;
        if (scrollToRef) scrollToRef(refId);
      },
      args: [ref]
    });
    
    // Small delay for scroll to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Then click
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (refId: string) => {
        const clickRef = (window as any).__clickRef;
        if (!clickRef) return { success: false, error: 'Click function not available' };
        const result = clickRef(refId);
        return { success: result, error: result ? undefined : 'Element not found' };
      },
      args: [ref]
    });
    return results?.[0]?.result || { success: false, error: 'Script execution failed' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Helper to focus element by ref
 */
async function focusElementByRef(tabId: number, ref: string): Promise<{ success: boolean; error?: string }> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (refId: string) => {
        const focusRef = (window as any).__focusRef;
        const scrollToRef = (window as any).__scrollToRef;
        if (!focusRef) return { success: false, error: 'Focus function not available' };
        // Scroll element into view first
        if (scrollToRef) scrollToRef(refId);
        const result = focusRef(refId);
        return { success: result, error: result ? undefined : 'Element not found or not focusable' };
      },
      args: [ref]
    });
    return results?.[0]?.result || { success: false, error: 'Script execution failed' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Helper to set value on element by ref
 */
async function setValueByRef(tabId: number, ref: string, value: string): Promise<{ success: boolean; error?: string }> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (refId: string, val: string) => {
        const setValueByRef = (window as any).__setValueByRef;
        const focusRef = (window as any).__focusRef;
        if (!setValueByRef) return { success: false, error: 'SetValue function not available' };
        // Focus first
        if (focusRef) focusRef(refId);
        const result = setValueByRef(refId, val);
        return { success: result, error: result ? undefined : 'Element not found or not a valid input' };
      },
      args: [ref, value]
    });
    return results?.[0]?.result || { success: false, error: 'Script execution failed' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute the 'computer' tool actions
 */
async function executeComputerTool(tabId: number, input: Record<string, any>): Promise<{
  content: string | Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
  is_error?: boolean;
}> {
  const action = input.action;
  const takeScreenshot = input.take_screenshot !== false; // Default to true
  const ref = input.ref;
  
  // Show visual indicator for the action
  if (action !== 'screenshot') {
    const targetInfo = ref ? ` on ${ref}` : (input.coordinate ? ` at (${input.coordinate[0]}, ${input.coordinate[1]})` : '');
    await browser.runtime.sendMessage({
      action: 'update-agent-status',
      tabId,
      message: `${action}${targetInfo}`
    });
  }
  
  // Helper to return success with optional screenshot
  const successWithScreenshot = async (message: string) => {
    if (takeScreenshot) {
      await new Promise(resolve => setTimeout(resolve, 300)); // Wait for UI to update
      return executeComputerTool(tabId, { action: 'screenshot' });
    }
    return { content: message };
  };
  
  switch (action) {
    case 'screenshot': {
      const response = await browser.runtime.sendMessage({
        action: 'browser-take-screenshot',
        tabId,
        format: 'png',
        quality: 80
      });
      
      if (response.success && response.data?.screenshot) {
        const base64Data = response.data.screenshot.replace(/^data:image\/\w+;base64,/, '');
        return {
          content: [{
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Data
            }
          }]
        };
      }
      return { content: `Screenshot failed: ${response.error}`, is_error: true };
    }
    
    case 'left_click':
    case 'right_click':
    case 'double_click':
    case 'middle_click': {
      // Prefer ref-based clicking
      if (ref) {
        // For left_click, use direct DOM click (more reliable)
        if (action === 'left_click') {
          const result = await clickElementByRef(tabId, ref);
          if (!result.success) {
            return { content: `Click on ${ref} failed: ${result.error}`, is_error: true };
          }
          return successWithScreenshot(`Clicked ${ref}`);
        }
        // For other click types, resolve to coordinates and use CDP
        const coords = await resolveRefToCoordinates(tabId, ref);
        if (!coords) {
          return { content: `Error: Could not find element with ref "${ref}"`, is_error: true };
        }
        input.coordinate = [coords.x, coords.y];
      }
      
      if (!input.coordinate || input.coordinate.length !== 2) {
        return { content: 'Error: Either ref or coordinate [x, y] is required for click actions', is_error: true };
      }
      
      const browserAction = {
        type: action === 'left_click' ? 'click' : action,
        x: input.coordinate[0],
        y: input.coordinate[1]
      };
      
      const response = await browser.runtime.sendMessage({
        action: 'browser-execute-action',
        tabId,
        browserAction
      });
      
      if (!response.success) {
        return { content: `Click failed: ${response.error}`, is_error: true };
      }
      return successWithScreenshot(`Clicked at (${input.coordinate[0]}, ${input.coordinate[1]})`);
    }
    
    case 'focus': {
      if (!ref) {
        return { content: 'Error: ref is required for focus action', is_error: true };
      }
      const result = await focusElementByRef(tabId, ref);
      if (!result.success) {
        return { content: `Focus on ${ref} failed: ${result.error}`, is_error: true };
      }
      return successWithScreenshot(`Focused ${ref}`);
    }
    
    case 'type': {
      if (!input.text) {
        return { content: 'Error: text is required for type action', is_error: true };
      }
      
      // If ref is provided, focus/set value on that element first
      if (ref) {
        // Try to set value directly (works for input/textarea)
        const setResult = await setValueByRef(tabId, ref, input.text);
        if (setResult.success) {
          return successWithScreenshot(`Typed "${input.text}" into ${ref}`);
        }
        // Fall back to focus + type via CDP
        await focusElementByRef(tabId, ref);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Type via CDP (keyboard simulation)
      const response = await browser.runtime.sendMessage({
        action: 'browser-execute-action',
        tabId,
        browserAction: { type: 'type', text: input.text }
      });
      
      if (!response.success) {
        return { content: `Type failed: ${response.error}`, is_error: true };
      }
      return successWithScreenshot(`Typed "${input.text}"`);
    }
    
    case 'key': {
      if (!input.key) {
        return { content: 'Error: key is required for key action', is_error: true };
      }
      
      const response = await browser.runtime.sendMessage({
        action: 'browser-execute-action',
        tabId,
        browserAction: { type: 'key', key: input.key }
      });
      
      if (!response.success) {
        return { content: `Key press failed: ${response.error}`, is_error: true };
      }
      return successWithScreenshot(`Pressed ${input.key}`);
    }
    
    case 'scroll': {
      // If ref is provided, scroll that element into view
      if (ref) {
        try {
          await browser.scripting.executeScript({
            target: { tabId },
            func: (refId: string) => {
              const scrollToRef = (window as any).__scrollToRef;
              if (scrollToRef) scrollToRef(refId);
            },
            args: [ref]
          });
          return successWithScreenshot(`Scrolled to ${ref}`);
        } catch (error: any) {
          return { content: `Scroll to ${ref} failed: ${error.message}`, is_error: true };
        }
      }
      
      // Otherwise, scroll the page
      const response = await browser.runtime.sendMessage({
        action: 'browser-execute-action',
        tabId,
        browserAction: {
          type: 'scroll',
          x: input.coordinate?.[0],
          y: input.coordinate?.[1],
          direction: input.scroll_direction || 'down',
          amount: input.scroll_amount || 300
        }
      });
      
      if (!response.success) {
        return { content: `Scroll failed: ${response.error}`, is_error: true };
      }
      return successWithScreenshot(`Scrolled ${input.scroll_direction || 'down'}`);
    }
    
    case 'mouse_move': {
      if (ref) {
        const coords = await resolveRefToCoordinates(tabId, ref);
        if (!coords) {
          return { content: `Error: Could not find element with ref "${ref}"`, is_error: true };
        }
        input.coordinate = [coords.x, coords.y];
      }
      
      if (!input.coordinate || input.coordinate.length !== 2) {
        return { content: 'Error: Either ref or coordinate [x, y] is required for mouse_move', is_error: true };
      }
      
      const response = await browser.runtime.sendMessage({
        action: 'browser-execute-action',
        tabId,
        browserAction: {
          type: 'mouse_move',
          x: input.coordinate[0],
          y: input.coordinate[1]
        }
      });
      
      if (!response.success) {
        return { content: `Mouse move failed: ${response.error}`, is_error: true };
      }
      return successWithScreenshot(`Moved mouse to (${input.coordinate[0]}, ${input.coordinate[1]})`);
    }
    
    case 'left_click_drag': {
      if (!input.start_coordinate || !input.coordinate) {
        return { content: 'Error: start_coordinate and coordinate are required for drag', is_error: true };
      }
      
      const response = await browser.runtime.sendMessage({
        action: 'browser-execute-action',
        tabId,
        browserAction: {
          type: 'drag',
          startX: input.start_coordinate[0],
          startY: input.start_coordinate[1],
          endX: input.coordinate[0],
          endY: input.coordinate[1]
        }
      });
      
      if (!response.success) {
        return { content: `Drag failed: ${response.error}`, is_error: true };
      }
      return successWithScreenshot(`Dragged from (${input.start_coordinate[0]}, ${input.start_coordinate[1]}) to (${input.coordinate[0]}, ${input.coordinate[1]})`);
    }
    
    case 'wait': {
      const duration = input.duration || 1000;
      await new Promise(resolve => setTimeout(resolve, duration));
      return successWithScreenshot(`Waited ${duration}ms`);
    }
    
    case 'navigate': {
      if (!input.text) {
        return { content: 'Error: text (URL or "back"/"forward") is required for navigate', is_error: true };
      }
      
      const response = await browser.runtime.sendMessage({
        action: 'browser-execute-action',
        tabId,
        browserAction: { type: 'navigate', url: input.text }
      });
      
      if (!response.success) {
        return { content: `Navigate failed: ${response.error}`, is_error: true };
      }
      // Wait longer for navigation
      await new Promise(resolve => setTimeout(resolve, 1000));
      return successWithScreenshot(`Navigated to ${input.text}`);
    }
    
    default:
      return { content: `Unknown computer action: ${action}`, is_error: true };
  }
}

// ========================================================================
// AGENTIC LOOP - Handle tool_use responses and continue conversation
// ========================================================================

/**
 * Parse Claude's response to extract tool use blocks
 */
function parseToolUseBlocks(response: string): ToolUseBlock[] {
  const toolUses: ToolUseBlock[] = [];
  
  // Claude's streaming response may contain tool_use in various formats
  // Look for JSON tool_use blocks in the response
  try {
    // Try to parse as JSON array of content blocks
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      for (const block of parsed) {
        if (block.type === 'tool_use') {
          toolUses.push(block as ToolUseBlock);
        }
      }
    }
  } catch {
    // If not JSON, try to extract tool_use from text patterns
    // This handles cases where the response is streamed text
    const toolUseRegex = /\{"type":\s*"tool_use",\s*"id":\s*"([^"]+)",\s*"name":\s*"([^"]+)",\s*"input":\s*(\{[^}]+\})\}/g;
    let match;
    while ((match = toolUseRegex.exec(response)) !== null) {
      try {
        toolUses.push({
          type: 'tool_use',
          id: match[1],
          name: match[2],
          input: JSON.parse(match[3])
        });
      } catch {
        // Skip malformed tool use
      }
    }
  }
  
  return toolUses;
}

/**
 * Run the agentic loop - send message, execute tools, continue until done
 * Includes retry logic for transient failures
 */
async function runAgenticLoop(userMessage: string, maxIterations: number = 15): Promise<string> {
  let iterations = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;
  let conversationHistory: Array<{ role: string; content: any }> = [];
  let finalResponse = '';
  
  // Start with user message
  conversationHistory.push({ role: 'user', content: userMessage });
  
  while (iterations < maxIterations) {
    iterations++;
    console.log(`[Eidolon Agent] Iteration ${iterations}/${maxIterations}`);
    
    // Send message to Claude with tools
    showActivity(`Thinking... (step ${iterations})`);
    
    try {
      const response = await browser.runtime.sendMessage({
        action: 'send-chat-message-with-tools',
        conversationId: state.currentConversationId,
        messages: conversationHistory,
        tools: BROWSER_TOOLS,
        model: state.currentModel
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to get response from Claude');
      }
      
      // Reset error counter on success
      consecutiveErrors = 0;
      
      const assistantResponse = response.data;
      console.log('[Eidolon Agent] Claude response:', assistantResponse);
      
      // Check if response contains tool_use
      const toolUses = assistantResponse.tool_uses || [];
      
      if (toolUses.length === 0) {
        // No tool use - Claude is done
        finalResponse = assistantResponse.text || assistantResponse.response || '';
        console.log('[Eidolon Agent] No more tool uses, completing');
        break;
      }
      
      // Add assistant response to history
      conversationHistory.push({
        role: 'assistant',
        content: assistantResponse.content || assistantResponse.text
      });
      
      // Execute each tool and collect results
      const toolResults: ToolResultBlock[] = [];
      let hasErrors = false;
      
      for (const toolUse of toolUses) {
        console.log(`[Eidolon Agent] Executing tool: ${toolUse.name}`, toolUse.input);
        showActivity(`Executing: ${toolUse.name}...`);
        
        let result = await executeToolCall(toolUse.name, toolUse.input);
        
        // Retry logic for failed actions (except for "not found" errors)
        if (result.is_error && !result.content.toString().includes('not found')) {
          console.log(`[Eidolon Agent] Tool failed, retrying: ${toolUse.name}`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay
          result = await executeToolCall(toolUse.name, toolUse.input);
        }
        
        if (result.is_error) {
          hasErrors = true;
          console.warn(`[Eidolon Agent] Tool error: ${result.content}`);
        }
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
          is_error: result.is_error
        });
        
        // If it's an image result, we need to handle it specially
        if (Array.isArray(result.content)) {
          // For image content, store it differently
          toolResults[toolResults.length - 1].content = result.content as any;
        }
      }
      
      // Add tool results to conversation
      conversationHistory.push({
        role: 'user',
        content: toolResults
      });
      
      // If all tools errored, suggest Claude re-read the page
      if (hasErrors && toolResults.every(r => r.is_error)) {
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error('[Eidolon Agent] Too many consecutive errors, stopping');
          finalResponse = 'Agent stopped due to repeated errors. The page may have changed or elements may not be accessible.';
          break;
        }
        // Add a hint to re-read the page
        conversationHistory.push({
          role: 'user',
          content: 'Note: The previous action(s) failed. Consider using read_page to get fresh element references before trying again.'
        });
      } else {
        consecutiveErrors = 0;
      }
      
      // Update the final response to include tool execution info
      finalResponse = assistantResponse.text || '';
      
      // Keep conversation history manageable (last 20 messages)
      if (conversationHistory.length > 20) {
        // Keep first message (original user request) and last 19
        conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-19)];
      }
      
    } catch (error: any) {
      console.error('[Eidolon Agent] Error in agentic loop:', error);
      consecutiveErrors++;
      
      if (consecutiveErrors >= maxConsecutiveErrors) {
        finalResponse = `Agent stopped due to repeated errors: ${error.message}`;
        break;
      }
      
      // Add error to conversation so Claude knows about it
      conversationHistory.push({
        role: 'user',
        content: `System error occurred: ${error.message}. Please try a different approach.`
      });
      
      // Brief delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  if (iterations >= maxIterations) {
    finalResponse += '\n\n(Agent reached maximum iterations limit)';
  }
  
  return finalResponse;
}

function togglePanel(panelId: string) {
  const panel = getElement(panelId);
  const isHidden = panel.classList.contains('hidden');
  
  // Close all panels first
  document.querySelectorAll('.slide-panel').forEach(p => {
    p.classList.add('hidden');
    p.classList.remove('active');
  });
  
  // Open requested panel
  if (isHidden) {
    panel.classList.remove('hidden');
    setTimeout(() => panel.classList.add('active'), 10);
  }
}

// ========================================================================
// CLAUDE-STYLE MENU FUNCTIONS
// ========================================================================

/**
 * Toggle a Claude-style menu open/closed
 */
function toggleClaudeMenu(menuId: string) {
  const menu = getElement(menuId);
  const isHidden = menu.classList.contains('hidden');
  
  // Close all menus and submenus first
  closeAllClaudeMenus();
  
  // Open the requested menu
  if (isHidden) {
    menu.classList.remove('hidden');
    
    // Update button active state
    if (menuId === 'plus-menu') {
      getElement('plus-menu-btn').classList.add('active');
    } else if (menuId === 'settings-menu') {
      getElement('settings-menu-btn').classList.add('active');
    }
    
    // Focus search input if present
    const searchInput = menu.querySelector('.claude-menu-search-input') as HTMLInputElement;
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 50);
    }
  }
}

/**
 * Close all Claude-style menus and submenus
 */
function closeAllClaudeMenus() {
  // Close all menus
  document.querySelectorAll('.claude-menu').forEach(menu => {
    menu.classList.add('hidden');
  });
  
  // Close all submenus
  document.querySelectorAll('.claude-submenu').forEach(submenu => {
    submenu.classList.add('hidden');
  });
  
  // Reset button states
  getElement('plus-menu-btn').classList.remove('active');
  getElement('settings-menu-btn').classList.remove('active');
  
  // Show main menu items, hide submenus
  const plusMenuItems = document.getElementById('plus-menu-items');
  const settingsMenuItems = document.getElementById('settings-menu-items');
  if (plusMenuItems) plusMenuItems.style.display = '';
  if (settingsMenuItems) settingsMenuItems.style.display = '';
}

/**
 * Show a submenu within a Claude-style menu
 */
function showClaudeSubmenu(submenuId: string) {
  const submenu = getElement(submenuId);
  
  // Hide the main menu items
  if (submenuId === 'browser-context-submenu' || submenuId === 'projects-submenu') {
    const plusMenuItems = document.getElementById('plus-menu-items');
    const plusMenuSearch = document.querySelector('#plus-menu .claude-menu-search');
    if (plusMenuItems) plusMenuItems.style.display = 'none';
    if (plusMenuSearch) (plusMenuSearch as HTMLElement).style.display = 'none';
  } else if (submenuId === 'styles-submenu') {
    const settingsMenuItems = document.getElementById('settings-menu-items');
    const settingsMenuSearch = document.querySelector('#settings-menu .claude-menu-search');
    if (settingsMenuItems) settingsMenuItems.style.display = 'none';
    if (settingsMenuSearch) (settingsMenuSearch as HTMLElement).style.display = 'none';
  }
  
  submenu.classList.remove('hidden');
  
  // Focus search input if present
  const searchInput = submenu.querySelector('.claude-menu-search-input') as HTMLInputElement;
  if (searchInput) {
    setTimeout(() => searchInput.focus(), 50);
  }
}

/**
 * Hide a submenu and show the parent menu items
 */
function hideClaudeSubmenu(submenuId: string) {
  const submenu = getElement(submenuId);
  submenu.classList.add('hidden');
  
  // Show the main menu items again
  if (submenuId === 'browser-context-submenu' || submenuId === 'projects-submenu') {
    const plusMenuItems = document.getElementById('plus-menu-items');
    const plusMenuSearch = document.querySelector('#plus-menu .claude-menu-search');
    if (plusMenuItems) plusMenuItems.style.display = '';
    if (plusMenuSearch) (plusMenuSearch as HTMLElement).style.display = '';
  } else if (submenuId === 'styles-submenu') {
    const settingsMenuItems = document.getElementById('settings-menu-items');
    const settingsMenuSearch = document.querySelector('#settings-menu .claude-menu-search');
    if (settingsMenuItems) settingsMenuItems.style.display = '';
    if (settingsMenuSearch) (settingsMenuSearch as HTMLElement).style.display = '';
  }
}

/**
 * Filter menu items based on search query
 */
function filterClaudeMenuItems(containerId: string, query: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const items = container.querySelectorAll('.claude-menu-item');
  const lowerQuery = query.toLowerCase();
  
  items.forEach(item => {
    const text = item.textContent?.toLowerCase() || '';
    const matches = text.includes(lowerQuery);
    (item as HTMLElement).style.display = matches ? '' : 'none';
  });
}

/**
 * Load available styles from Claude.ai API
 */
async function loadStyles() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-styles' });
    if (response.success && response.data) {
      // Combine default and custom styles
      const allStyles: PersonalizedStyle[] = [
        ...(response.data.default || []),
        ...(response.data.custom || [])
      ];
      state.styles = allStyles;
      
      // Restore previously selected style from localStorage
      const savedStyleKey = localStorage.getItem('eidolon-style-key');
      if (savedStyleKey) {
        const savedStyle = allStyles.find(s => s.key === savedStyleKey);
        if (savedStyle) {
          state.currentStyle = savedStyle;
        }
      }
      
      // Render the styles list
      renderStylesList();
      console.log('[Eidolon] Loaded', allStyles.length, 'styles');
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load styles:', error);
  }
}

/**
 * Render the styles list in the UI
 */
function renderStylesList() {
  const stylesList = document.getElementById('styles-list');
  if (!stylesList) return;
  
  // Add "Create & edit styles" link at the top
  let html = `
    <button class="claude-menu-item create-edit-styles-btn" id="create-edit-styles-btn">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 3C10.2761 3 10.5 3.22386 10.5 3.5V9.5H16.5L16.6006 9.50977C16.8286 9.55629 17 9.75829 17 10C17 10.2417 16.8286 10.4437 16.6006 10.4902L16.5 10.5H10.5V16.5C10.5 16.7761 10.2761 17 10 17C9.72386 17 9.5 16.7761 9.5 16.5V10.5H3.5C3.22386 10.5 3 10.2761 3 10C3 9.72386 3.22386 9.5 3.5 9.5H9.5V3.5C9.5 3.22386 9.72386 3 10 3Z"/>
      </svg>
      <span class="create-edit-styles-text">Create & edit styles</span>
    </button>
    <div class="claude-menu-divider"></div>
  `;
  
  // Add "Normal" option (no style)
  html += `
    <button class="claude-menu-item style-item ${!state.currentStyle ? 'selected' : ''}" data-style-key="">
      <svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M2 7l4 4 6-8"/>
      </svg>
      <span>Normal</span>
      <span class="style-type-badge">default</span>
    </button>
  `;
  
  // Separate default and custom styles
  const defaultStyles = state.styles.filter(s => s.type === 'default');
  const customStyles = state.styles.filter(s => s.type === 'custom');
  
  // Add default styles
  if (defaultStyles.length > 0) {
    for (const style of defaultStyles) {
      const isSelected = state.currentStyle?.key === style.key;
      html += `
        <button class="claude-menu-item style-item ${isSelected ? 'selected' : ''}" 
                data-style-key="${escapeHtml(style.key)}"
                title="${escapeHtml(style.summary || '')}">
          <svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M2 7l4 4 6-8"/>
          </svg>
          <span>${escapeHtml(style.name)}</span>
          <span class="style-type-badge">default</span>
        </button>
      `;
    }
  }
  
  // Add custom styles with separator
  if (customStyles.length > 0) {
    html += '<div class="claude-menu-divider"></div>';
    html += '<div class="claude-menu-section-title">Custom Styles</div>';
    
    for (const style of customStyles) {
      const isSelected = state.currentStyle?.key === style.key;
      html += `
        <button class="claude-menu-item style-item ${isSelected ? 'selected' : ''}" 
                data-style-key="${escapeHtml(style.key)}"
                title="${escapeHtml(style.summary || '')}">
          <svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M2 7l4 4 6-8"/>
          </svg>
          <span>${escapeHtml(style.name)}</span>
        </button>
      `;
    }
  }
  
  stylesList.innerHTML = html;
  
  // Attach click handler for "Create & edit styles" button
  const createEditBtn = stylesList.querySelector('#create-edit-styles-btn');
  if (createEditBtn) {
    createEditBtn.addEventListener('click', () => {
      // Open Claude.ai styles settings page
      window.open('https://claude.ai/settings/styles', '_blank');
    });
  }
  
  // Re-attach click handlers for style items
  stylesList.querySelectorAll('.style-item').forEach(item => {
    item.addEventListener('click', () => {
      const styleKey = item.getAttribute('data-style-key') || '';
      selectStyleByKey(styleKey);
    });
  });
}

/**
 * Select a style by its key
 */
function selectStyleByKey(styleKey: string) {
  if (!styleKey) {
    // "Normal" - no style
    state.currentStyle = null;
    localStorage.removeItem('eidolon-style-key');
  } else {
    const style = state.styles.find(s => s.key === styleKey);
    if (style) {
      state.currentStyle = style;
      localStorage.setItem('eidolon-style-key', styleKey);
    }
  }
  
  // Update UI
  renderStylesList();
  updateStyleIndicator();
  
  // Close the menu
  closeAllClaudeMenus();
  
  console.log('[Eidolon] Selected style:', state.currentStyle?.name || 'Normal');
}

/**
 * Update the style indicator in the UI
 */
function updateStyleIndicator() {
  const currentStyleName = document.getElementById('current-style-name');
  if (currentStyleName) {
    currentStyleName.textContent = state.currentStyle?.name || 'Normal';
  }
}

/**
 * Select a style (legacy - for backwards compatibility)
 */
function selectStyle(style: string) {
  // This function is kept for backwards compatibility with existing HTML
  // Map old style names to new style keys
  selectStyleByKey(style === 'normal' ? '' : style);
}

/**
 * Select a model from the model menu
 */
function selectModel(modelId: string) {
  state.currentModel = modelId;
  localStorage.setItem('eidolon-model', modelId);
  
  // Update the model button text
  updateModelIndicator();
  
  // Update model menu selection
  renderModelMenu();
  
  // Also update the old model selector for compatibility
  const oldSelector = document.getElementById('model-selector') as HTMLSelectElement;
  if (oldSelector) {
    oldSelector.value = modelId;
  }
  
  closeAllClaudeMenus();
}

/**
 * Render the model menu with current models
 */
function renderModelMenu() {
  const modelMenuItems = document.getElementById('model-menu-items');
  if (!modelMenuItems) return;
  
  modelMenuItems.innerHTML = AVAILABLE_MODELS.map(model => `
    <button class="claude-menu-item model-item ${model.id === state.currentModel ? 'selected' : ''}" data-model="${model.id}">
      <svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M2 7l4 4 6-8"/>
      </svg>
      <span>${escapeHtml(model.name)}</span>
    </button>
  `).join('');
  
  // Add click handlers
  modelMenuItems.querySelectorAll('.model-item').forEach(item => {
    item.addEventListener('click', () => {
      const modelId = item.getAttribute('data-model') || '';
      selectModel(modelId);
    });
  });
}

/**
 * Render the tabs list in the browser context submenu - grouped by tab groups
 */
function renderTabsSubmenu(searchQuery?: string) {
  const tabsList = document.getElementById('tabs-list');
  if (!tabsList) return;
  
  if (state.tabs.length === 0) {
    tabsList.innerHTML = '<div class="tabs-empty-search">No tabs available</div>';
    return;
  }
  
  // Filter tabs if search query provided
  let filteredTabs = state.tabs;
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredTabs = state.tabs.filter(tab => 
      tab.title.toLowerCase().includes(query) ||
      tab.url.toLowerCase().includes(query)
    );
  }
  
  if (filteredTabs.length === 0) {
    tabsList.innerHTML = '<div class="tabs-empty-search">No tabs match your search</div>';
    return;
  }
  
  // Group tabs by their groupId
  const groupedTabs = new Map<number | 'ungrouped', Tab[]>();
  
  for (const tab of filteredTabs) {
    const key = tab.groupId ?? 'ungrouped';
    if (!groupedTabs.has(key)) {
      groupedTabs.set(key, []);
    }
    groupedTabs.get(key)!.push(tab);
  }
  
  // Build HTML with groups
  let html = '<div class="tabs-group-container">';
  
  // Render grouped tabs first
  for (const [groupId, tabs] of groupedTabs) {
    if (groupId === 'ungrouped') continue; // Handle ungrouped last
    
    const groupInfo = state.tabGroups.get(groupId as number);
    const groupTitle = groupInfo?.title || tabs[0]?.groupTitle || 'Group';
    const groupColor = groupInfo?.color || tabs[0]?.groupColor || 'grey';
    
    html += `
      <div class="tabs-group" data-group-id="${groupId}">
        <div class="tabs-group-header">
          <span class="tabs-group-color ${groupColor}"></span>
          <span class="tabs-group-name">${escapeHtml(groupTitle || 'Untitled Group')}</span>
          <span class="tabs-group-count">${tabs.length}</span>
        </div>
        <div class="tabs-group-items">
    `;
    
    for (const tab of tabs) {
      html += renderTabItem(tab, searchQuery);
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  // Render ungrouped tabs
  const ungroupedTabs = groupedTabs.get('ungrouped');
  if (ungroupedTabs && ungroupedTabs.length > 0) {
    html += `
      <div class="tabs-group" data-group-id="ungrouped">
        <div class="tabs-ungrouped-header">
          <span>Other Tabs</span>
          <span class="tabs-group-count">${ungroupedTabs.length}</span>
        </div>
        <div class="tabs-group-items">
    `;
    
    for (const tab of ungroupedTabs) {
      html += renderTabItem(tab, searchQuery);
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  tabsList.innerHTML = html;
  
  // Update current tab display
  const currentTabTitle = document.getElementById('menu-current-tab-title');
  if (currentTabTitle && state.currentTab) {
    currentTabTitle.textContent = state.currentTab.title;
  }
  
  // Add click handlers
  tabsList.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', async () => {
      const tabId = parseInt(item.getAttribute('data-tab-id') || '0');
      if (tabId) {
        state.targetTabId = tabId;
        await focusTab(tabId);
        closeAllClaudeMenus();
      }
    });
  });
}

/**
 * Render a single tab item HTML
 */
function renderTabItem(tab: Tab, searchQuery?: string): string {
  const isActive = tab.active;
  const isTarget = tab.id === state.targetTabId;
  
  // Highlight search match in title
  let titleHtml = escapeHtml(tab.title);
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    const titleLower = tab.title.toLowerCase();
    const idx = titleLower.indexOf(query);
    if (idx >= 0) {
      const before = escapeHtml(tab.title.slice(0, idx));
      const match = escapeHtml(tab.title.slice(idx, idx + query.length));
      const after = escapeHtml(tab.title.slice(idx + query.length));
      titleHtml = `${before}<span class="search-highlight">${match}</span>${after}`;
    }
  }
  
  return `
    <button class="claude-menu-item tab-item ${isActive ? 'active-tab' : ''} ${isTarget ? 'target-tab' : ''}" data-tab-id="${tab.id}">
      <img class="tab-favicon" src="${tab.favIconUrl || '/icon-16.png'}" alt="" onerror="this.src='/icon-16.png'">
      <span class="tab-title">${titleHtml}</span>
      ${isActive ? '<span class="tab-active-indicator"></span>' : ''}
    </button>
  `;
}

/**
 * Render the projects list in the projects submenu
 */
function renderProjectsSubmenu() {
  const projectsList = document.getElementById('projects-list');
  if (!projectsList) return;
  
  if (state.projects.length === 0) {
    projectsList.innerHTML = '<div class="empty-state" style="padding: 12px; text-align: center; color: var(--text-400);">No projects found</div>';
    return;
  }
  
  projectsList.innerHTML = state.projects.map(project => `
    <button class="claude-menu-item project-item ${project.uuid === state.currentProject?.uuid ? 'selected' : ''}" data-project-id="${project.uuid}">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M2 4h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"></path>
        <path d="M2 4V3a1 1 0 011-1h4l1 2h5"></path>
      </svg>
      <span>${escapeHtml(project.name)}</span>
    </button>
  `).join('');
  
  // Add click handlers
  projectsList.querySelectorAll('.project-item').forEach(item => {
    item.addEventListener('click', () => {
      const projectId = item.getAttribute('data-project-id') || '';
      selectProject(projectId);
      
      // Update the old project selector for compatibility
      const oldSelector = document.getElementById('project-selector') as HTMLSelectElement;
      if (oldSelector) {
        oldSelector.value = projectId;
      }
      
      // Update selection state
      projectsList.querySelectorAll('.project-item').forEach(p => p.classList.remove('selected'));
      item.classList.add('selected');
      
      closeAllClaudeMenus();
    });
  });
}

function filterConversations(query: string) {
  const list = getElement('conversation-list');
  const items = list.querySelectorAll('.conversation-item');
  
  items.forEach(item => {
    const title = item.querySelector('.conversation-item-title')?.textContent || '';
    const matches = title.toLowerCase().includes(query.toLowerCase());
    (item as HTMLElement).style.display = matches ? '' : 'none';
  });
}

// ========================================================================
// UI HELPERS
// ========================================================================

function showLoading(text: string = 'Loading...') {
  const overlay = getElement('loading-overlay');
  const loadingText = getElement('loading-text');
  loadingText.textContent = text;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = getElement('loading-overlay');
  overlay.classList.add('hidden');
}

function showActivity(text: string) {
  const indicator = getElement('activity-indicator');
  const activityText = getElement('activity-text');
  activityText.textContent = text;
  indicator.classList.remove('hidden');
}

function hideActivity() {
  const indicator = getElement('activity-indicator');
  indicator.classList.add('hidden');
}

function updateModelIndicator() {
  // Update the new model button text
  const modelNameSpan = document.getElementById('current-model-name');
  if (modelNameSpan) {
    // Get display name, or extract short name from model ID
    let displayName = MODEL_NAMES[state.currentModel];
    if (!displayName && state.currentModel) {
      // Extract model family name (e.g., "claude-sonnet-4-..." -> "Sonnet 4")
      if (state.currentModel.includes('sonnet')) {
        displayName = 'Sonnet';
      } else if (state.currentModel.includes('opus')) {
        displayName = 'Opus';
      } else if (state.currentModel.includes('haiku')) {
        displayName = 'Haiku';
      } else {
        displayName = 'Default';
      }
    }
    modelNameSpan.textContent = displayName || 'Default';
  }
}

function startNewChat() {
  state.currentConversationId = null;
  state.conversationModel = null; // Reset so next message sets it fresh
  state.messages = [];
  renderMessages();
  
  // Focus the input
  const input = getElement<HTMLTextAreaElement>('message-input');
  input.focus();
}

// ========================================================================
// UTILITIES
// ========================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function formatMessageContent(content: string): string {
  // Basic markdown-like formatting
  return escapeHtml(content)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

// ========================================================================
// BROWSER EVENT LISTENERS
// ========================================================================

// Listen for tab changes
browser.tabs.onActivated.addListener(async () => {
  await getCurrentTab();
  await loadTabs();
});

// Listen for tab updates
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    await getCurrentTab();
    await loadTabs();
  }
});

// ========================================================================
// START
// ========================================================================

// Listen for populate/load messages from background or external triggers
browser.runtime.onMessage.addListener((msg) => {
  try {
    if (msg?.type === 'POPULATE_INPUT_TEXT' && typeof msg.prompt === 'string') {
      const input = getElement<HTMLTextAreaElement>('message-input');
      input.value = msg.prompt;
      input.focus();
      return;
    }
    if (msg?.type === 'LOAD_CONVERSATION' && typeof msg.conversationUuid === 'string') {
      openConversation(msg.conversationUuid);
      return;
    }
  } catch (e) {
    console.warn('[Eidolon] Failed to handle runtime message:', e);
  }
});

document.addEventListener('DOMContentLoaded', init);
