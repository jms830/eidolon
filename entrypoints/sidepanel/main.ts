/**
 * Eidolon Side Panel - Enhanced Claude Assistant
 * Full browser integration with project management
 */

import './style.css';
import { settingsService, type SettingsChangeEvent } from '../../utils/settings/settingsService';
import {
  startAuthorization,
  exchangeCodeForTokens,
  getAllProviderStatus,
  removeCredentials,
  importClaudeCodeCredentials,
  refreshTokens,
  type OAuthProviderType,
  type ProviderStatus,
  OAUTH_PROVIDERS,
} from '../../utils/oauth';
import {
  openCodeService,
  getConnectionStatus,
  getServerUrl,
  setServerUrl,
  formatOpencodeError,
  ptyService,
  type OpenCodeConnectionStatus,
  type OpenCodeProject,
} from '../../utils/opencode/client';
import {
  createTerminal,
  destroyTerminal,
  destroyAllTerminals,
  focusTerminal,
  fitTerminal,
  clearTerminal,
  changeDirectory,
  type TerminalInstance,
} from '../../utils/terminal/terminal';
import {
  type Block,
  type ChatBlock,
  type CommandBlock,
  type SystemBlock,
  type ErrorBlock,
  type BlocksState,
  type InputAnalysis,
  type SlashCommand,
  createChatBlock,
  createCommandBlock,
  createSystemBlock,
  createErrorBlock,
  createInitialBlocksState,
  blocksReducer,
  analyzeInput,
  getAllSlashCommands,
  getSlashCommand,
  extractSuggestedCommands,
  formatCommandOutput,
  formatDuration,
  formatBlockTime,
} from '../../utils/blocks/blockService';

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
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    icon: 'deepseek',
    isBuiltIn: false
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/playground',
    icon: 'openrouter',
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
  deepseek: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="12" y="16" font-size="9" font-weight="bold" text-anchor="middle" font-family="system-ui, sans-serif">DS</text></svg>`,
  openrouter: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="12" y="16" font-size="9" font-weight="bold" text-anchor="middle" font-family="system-ui, sans-serif">OR</text></svg>`,
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

// Sync status types
type SyncStatus = 'not-configured' | 'synced' | 'pending' | 'syncing' | 'error';
type ConflictStrategy = 'remote' | 'local' | 'newer';

interface SyncSettings {
  autoSync: boolean;
  syncInterval: number;
  bidirectional: boolean;
  syncChats: boolean;
  autoAddMdExtension: boolean;
  ensureAgentsFrontmatter: boolean;
  conflictStrategy: ConflictStrategy;
}

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  autoSync: false,
  syncInterval: 15,
  bidirectional: false,
  syncChats: false,
  autoAddMdExtension: true,
  ensureAgentsFrontmatter: true,
  conflictStrategy: 'remote'
};

interface SyncState {
  status: SyncStatus;
  workspacePath: string | null;
  lastSync: number | null; // timestamp
  needsPermission: boolean; // Handle exists but needs user to re-grant permission
  projectCount: number;
  fileCount: number;
  chatCount: number;
  settings: SyncSettings;
}

// OpenCode connection state
type ChatBackend = 'claude-cookie' | 'opencode';

interface OpenCodeState {
  connected: boolean;
  serverUrl: string;
  sessionId: string | null;
  checking: boolean;
  error: string | null;
  // Project switching
  projects: OpenCodeProject[];
  selectedProjectDir: string | null;
  currentProjectName: string | null;
  // Session awareness for TUI
  sessions: any[];
  sessionsLoadedAt: number | null;
  sessionsLoading: boolean;
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
  // Workspace sync
  sync: SyncState;
  // Chat backend selection
  chatBackend: ChatBackend;
  // OpenCode server connection
  opencode: OpenCodeState;
  // Terminal state
  terminal: {
    isOpen: boolean;
    instance: TerminalInstance | null;
    height: number;
  };
  // Warp-style blocks interface (experimental)
  blocks: BlocksState;
  useBlocksUI: boolean; // Feature flag for blocks interface
}

// Default models fallback - will be updated from Claude.ai or OpenCode if available
// These model IDs match what Claude.ai web interface uses
// Model selection - use empty string to let Claude.ai use default model
// The actual model IDs are fetched dynamically from Claude.ai bootstrap API or OpenCode
interface ModelInfo {
  id: string;
  name: string;
  default: boolean;
  provider?: string;  // e.g., 'anthropic', 'openai', 'google'
  providerName?: string; // Display name for provider
}

let AVAILABLE_MODELS: ModelInfo[] = [
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
  darkMode: localStorage.getItem('eidolon-dark-mode') !== 'false', // Default to dark mode
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
  platforms: loadSavedPlatforms(),
  // Workspace sync
  sync: {
    status: 'not-configured',
    workspacePath: null,
    lastSync: null,
    needsPermission: false,
    projectCount: 0,
    fileCount: 0,
    chatCount: 0,
    settings: { ...DEFAULT_SYNC_SETTINGS }
  },
  // Chat backend - defaults to Claude cookie auth, can switch to OpenCode
  chatBackend: (localStorage.getItem('eidolon-chat-backend') as ChatBackend) || 'claude-cookie',
  // OpenCode server connection state
  opencode: {
    connected: false,
    serverUrl: 'http://localhost:4096',
    sessionId: null,
    checking: false,
    error: null,
    projects: [],
    selectedProjectDir: null,
    currentProjectName: null,
    sessions: [],
    sessionsLoadedAt: null,
    sessionsLoading: false,
  },

  // Terminal state
  terminal: {
    isOpen: false,
    instance: null,
    height: 300
  },
  // Warp-style blocks interface (experimental)
  blocks: createInitialBlocksState(),
  useBlocksUI: localStorage.getItem('eidolon-use-blocks-ui') === 'true' // Disabled by default
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
  
  // Initialize settings service for sidepanel context
  await settingsService.init('sidepanel');
  
  // Subscribe to settings changes from dashboard
  settingsService.subscribe(handleSettingsChange);
  
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
  setupSyncEventListeners();
  setupProjectSelectorListeners();
  
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
    loadAccounts(),
    loadOrganizations(),
    initSyncState(),
    checkOpenCodeConnection(),
    initDeveloperMode()
  ]);
  
  // Render the chat area (uses blocks UI if enabled)
  renderChatArea();
  
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
    showToast({ 
      message: 'Please enter both name and URL',
      type: 'warning'
    });
    return;
  }
  
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  try {
    new URL(url);
  } catch {
    showToast({
      message: 'Please enter a valid URL',
      type: 'error'
    });
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
    showToast({
      message: 'Please enter a valid URL',
      type: 'error'
    });
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

// ========================================================================
// COMMAND PALETTE DEFINITIONS
// ========================================================================

interface Command {
  id: string;
  name: string;
  description?: string;
  shortcut?: string;
  icon: string;
  action: () => void;
  group: string;
}

let commandPaletteCommands: Command[] = [];
let selectedCommandIndex = 0;

function initCommandPalette() {
  commandPaletteCommands = [
    // Actions
    { id: 'new-chat', name: 'New Chat', description: 'Start a new conversation', shortcut: '⌘N', icon: 'plus', action: startNewChat, group: 'Actions' },
    { id: 'upload-files', name: 'Upload Files', description: 'Upload files to attach', shortcut: '⌘U', icon: 'upload', action: triggerFileUpload, group: 'Actions' },
    { id: 'screenshot', name: 'Take Screenshot', description: 'Capture current tab', icon: 'camera', action: takeScreenshot, group: 'Actions' },
    { id: 'capture-page', name: 'Capture Page Content', description: 'Extract text from page', icon: 'document', action: capturePage, group: 'Actions' },
    
    // Navigation
    { id: 'open-dashboard', name: 'Open Dashboard', description: 'Open full dashboard', icon: 'grid', action: () => browser.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') }), group: 'Navigation' },
    { id: 'open-settings', name: 'Open Settings', icon: 'settings', action: () => togglePanel('settings-panel'), group: 'Navigation' },
    { id: 'open-sync', name: 'Sync Settings', description: 'Configure workspace sync', icon: 'sync', action: openSyncPanel, group: 'Navigation' },
    
    // Views
    { id: 'view-eidolon', name: 'Switch to Eidolon', icon: 'home', action: () => switchView('eidolon'), group: 'Views' },
    { id: 'view-claude', name: 'Switch to Claude Code', icon: 'code', action: () => switchView('claude-code'), group: 'Views' },
    { id: 'view-chatgpt', name: 'Switch to ChatGPT', icon: 'chat', action: () => switchView('chatgpt'), group: 'Views' },
    { id: 'view-gemini', name: 'Switch to Gemini', icon: 'sparkle', action: () => switchView('gemini'), group: 'Views' },
    
    // Settings
    { id: 'toggle-dark-mode', name: 'Toggle Dark Mode', icon: 'moon', action: toggleDarkMode, group: 'Settings' },
    { id: 'toggle-agent-mode', name: 'Toggle Agent Mode', description: 'Enable browser control', icon: 'robot', action: toggleAgentMode, group: 'Settings' },
  ];
}

function getCommandIcon(iconName: string): string {
  const icons: Record<string, string> = {
    plus: '<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>',
    upload: '<path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3"/><path d="M8 2v8M4 6l4-4 4 4"/>',
    camera: '<rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="8" cy="8" r="2"/>',
    document: '<rect x="2" y="2" width="12" height="12" rx="2"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="8.5" x2="11" y2="8.5"/>',
    grid: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
    settings: '<circle cx="8" cy="8" r="2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4"/>',
    sync: '<path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4"/><path d="M12.5 2v3h-3M3.5 11v3h3"/>',
    home: '<path d="M3 8L8 3l5 5v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"/>',
    code: '<path d="M5 4L2 8l3 4M11 4l3 4-3 4M9 3l-2 10"/>',
    chat: '<path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6l-4 3V4z"/>',
    sparkle: '<path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5L8 2z"/>',
    moon: '<path d="M12 3a6 6 0 11-6 6 4 4 0 006-6z"/>',
    robot: '<rect x="3" y="5" width="10" height="8" rx="2"/><circle cx="6" cy="9" r="1"/><circle cx="10" cy="9" r="1"/><path d="M8 2v3"/>',
  };
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">${icons[iconName] || icons.plus}</svg>`;
}

function openCommandPalette() {
  const palette = document.getElementById('command-palette');
  const input = document.getElementById('command-palette-input') as HTMLInputElement;
  
  if (!palette || !input) return;
  
  palette.classList.remove('hidden');
  input.value = '';
  input.focus();
  selectedCommandIndex = 0;
  renderCommandPaletteResults('');
}

function closeCommandPalette() {
  const palette = document.getElementById('command-palette');
  palette?.classList.add('hidden');
}

function renderCommandPaletteResults(query: string) {
  const resultsContainer = document.getElementById('command-palette-results');
  if (!resultsContainer) return;
  
  const lowerQuery = query.toLowerCase();
  const filteredCommands = query 
    ? commandPaletteCommands.filter(cmd => 
        cmd.name.toLowerCase().includes(lowerQuery) || 
        cmd.description?.toLowerCase().includes(lowerQuery) ||
        cmd.group.toLowerCase().includes(lowerQuery)
      )
    : commandPaletteCommands;
  
  if (filteredCommands.length === 0) {
    resultsContainer.innerHTML = '<div class="command-empty">No commands found</div>';
    return;
  }
  
  // Group commands
  const groups = new Map<string, Command[]>();
  for (const cmd of filteredCommands) {
    if (!groups.has(cmd.group)) {
      groups.set(cmd.group, []);
    }
    groups.get(cmd.group)!.push(cmd);
  }
  
  let html = '';
  let globalIndex = 0;
  
  for (const [groupName, commands] of groups) {
    html += `<div class="command-group"><div class="command-group-title">${escapeHtml(groupName)}</div>`;
    
    for (const cmd of commands) {
      const isSelected = globalIndex === selectedCommandIndex;
      html += `
        <div class="command-item ${isSelected ? 'selected' : ''}" data-command-id="${cmd.id}" data-index="${globalIndex}">
          ${getCommandIcon(cmd.icon)}
          <div class="command-item-text">
            <div class="command-item-name">${escapeHtml(cmd.name)}</div>
            ${cmd.description ? `<div class="command-item-description">${escapeHtml(cmd.description)}</div>` : ''}
          </div>
          ${cmd.shortcut ? `<span class="menu-shortcut">${cmd.shortcut}</span>` : ''}
        </div>
      `;
      globalIndex++;
    }
    
    html += '</div>';
  }
  
  resultsContainer.innerHTML = html;
  
  // Add click handlers
  resultsContainer.querySelectorAll('.command-item').forEach(item => {
    item.addEventListener('click', () => {
      const cmdId = item.getAttribute('data-command-id');
      executeCommand(cmdId || '');
    });
  });
}

function executeCommand(commandId: string) {
  const command = commandPaletteCommands.find(c => c.id === commandId);
  if (command) {
    closeCommandPalette();
    command.action();
  }
}

function navigateCommandPalette(direction: 'up' | 'down') {
  const totalCommands = commandPaletteCommands.length;
  if (totalCommands === 0) return;
  
  if (direction === 'down') {
    selectedCommandIndex = (selectedCommandIndex + 1) % totalCommands;
  } else {
    selectedCommandIndex = (selectedCommandIndex - 1 + totalCommands) % totalCommands;
  }
  
  // Update UI
  const items = document.querySelectorAll('.command-item');
  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedCommandIndex);
    if (idx === selectedCommandIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectCurrentCommand() {
  const items = document.querySelectorAll('.command-item');
  const selectedItem = items[selectedCommandIndex];
  if (selectedItem) {
    const cmdId = selectedItem.getAttribute('data-command-id');
    executeCommand(cmdId || '');
  }
}

// ========================================================================
// FILE UPLOAD & DRAG/DROP
// ========================================================================

function triggerFileUpload() {
  const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
  fileInput?.click();
}

async function handleFileUpload(files: FileList | File[]) {
  const fileArray = Array.from(files);
  const useTui = shouldUseTuiInterface();
  
  for (const file of fileArray) {
    try {
      if (file.size > 10 * 1024 * 1024) {
        showNotification(`File "${file.name}" is too large (max 10MB)`, 'error');
        continue;
      }
      
      const content = await readFileContent(file);
      const textContent = content as string;
      const isImage = file.type.startsWith('image/') ||
        file.name.toLowerCase().endsWith('.png') ||
        file.name.toLowerCase().endsWith('.jpg') ||
        file.name.toLowerCase().endsWith('.jpeg');
      const isText = file.type.startsWith('text/') ||
        /\.(js|ts|jsx|tsx|json|md|py|rb|go|rs|java|c|cpp|h|css|html|xml|yaml|yml|sh|bash)$/i.test(file.name);
      
      if (useTui) {
        const type: 'file' | 'screenshot' = isImage ? 'screenshot' : 'file';
        const appended = await appendAttachmentToTuiPrompt(file.name, textContent, type);
        if (appended) {
          continue;
        }
      }
      
      if (isImage) {
        state.attachments.push({
          type: 'screenshot',
          name: file.name,
          content: textContent
        });
      } else if (isText) {
        state.attachments.push({
          type: 'file',
          name: file.name,
          content: textContent
        });
      } else {
        state.attachments.push({
          type: 'file',
          name: file.name,
          content: `[Binary file: ${file.name}, ${formatFileSize(file.size)}]`
        });
      }
      
      console.log('[Eidolon] Added file:', file.name);
    } catch (error) {
      console.error('[Eidolon] Failed to read file:', file.name, error);
      showNotification(`Failed to read "${file.name}"`, 'error');
    }
  }
  
  if (!useTui) {
    renderAttachments();
  }
}


function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (file.type.startsWith('image/')) {
        resolve(reader.result as string); // Data URL for images
      } else {
        resolve(reader.result as string); // Text content
      }
    };
    
    reader.onerror = () => reject(reader.error);
    
    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setupDragAndDrop() {
  const inputArea = document.querySelector('.input-area');
  const dropOverlay = document.getElementById('drop-zone-overlay');
  
  if (!inputArea || !dropOverlay) return;
  
  let dragCounter = 0;
  
  inputArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropOverlay.classList.remove('hidden');
  });
  
  inputArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropOverlay.classList.add('hidden');
    }
  });
  
  inputArea.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  inputArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.add('hidden');
    
    const files = (e as DragEvent).dataTransfer?.files;
    if (files && files.length > 0) {
      await handleFileUpload(files);
    }
  });
}

// ========================================================================
// FILE PREVIEW
// ========================================================================

function openFilePreview(fileName: string, content: string) {
  const modal = document.getElementById('file-preview-modal');
  const title = document.getElementById('file-preview-title');
  const contentEl = document.getElementById('file-preview-content');
  
  if (!modal || !title || !contentEl) return;
  
  title.textContent = fileName;
  
  // Apply basic syntax highlighting
  const highlighted = applySyntaxHighlighting(content, getFileExtension(fileName));
  contentEl.innerHTML = highlighted;
  
  modal.classList.remove('hidden');
}

function closeFilePreview() {
  const modal = document.getElementById('file-preview-modal');
  modal?.classList.add('hidden');
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function applySyntaxHighlighting(content: string, extension: string): string {
  // Simple syntax highlighting for common languages
  let escaped = escapeHtml(content);
  
  const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h'];
  
  if (codeExtensions.includes(extension)) {
    // Keywords
    escaped = escaped.replace(/\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await|try|catch|throw|new|this|def|self|fn|pub|struct|impl|use|mod)\b/g, 
      '<span class="syntax-keyword">$1</span>');
    
    // Strings
    escaped = escaped.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;|`[^`]*`)/g, 
      '<span class="syntax-string">$1</span>');
    
    // Numbers
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, 
      '<span class="syntax-number">$1</span>');
    
    // Comments (single line)
    escaped = escaped.replace(/(\/\/.*$|#.*$)/gm, 
      '<span class="syntax-comment">$1</span>');
  }
  
  return escaped;
}

// ========================================================================
// PLATFORM EXPORT SETTINGS
// ========================================================================

/**
 * Load platform export settings from storage (using settingsService)
 */
async function loadExportSettings(): Promise<void> {
  try {
    const settings = await settingsService.getExportPlatforms();
    
    const claudeToggle = document.getElementById('export-claude-toggle') as HTMLInputElement;
    const chatgptToggle = document.getElementById('export-chatgpt-toggle') as HTMLInputElement;
    const geminiToggle = document.getElementById('export-gemini-toggle') as HTMLInputElement;
    
    if (claudeToggle) claudeToggle.checked = settings.claude !== false;
    if (chatgptToggle) chatgptToggle.checked = settings.chatgpt !== false;
    if (geminiToggle) geminiToggle.checked = settings.gemini !== false;
  } catch (error) {
    console.error('[Eidolon] Failed to load export settings:', error);
  }
}

/**
 * Save platform export settings to storage (using settingsService)
 */
async function saveExportSettings(): Promise<void> {
  try {
    const claudeToggle = document.getElementById('export-claude-toggle') as HTMLInputElement;
    const chatgptToggle = document.getElementById('export-chatgpt-toggle') as HTMLInputElement;
    const geminiToggle = document.getElementById('export-gemini-toggle') as HTMLInputElement;
    
    const settings = {
      claude: claudeToggle?.checked ?? true,
      chatgpt: chatgptToggle?.checked ?? true,
      gemini: geminiToggle?.checked ?? true
    };
    
    await settingsService.setExportPlatforms(settings);
    console.log('[Eidolon] Export settings saved:', settings);
  } catch (error) {
    console.error('[Eidolon] Failed to save export settings:', error);
  }
}

// ========================================================================
// EVENT LISTENERS
// ========================================================================

function setupEventListeners() {
  // Dashboard button (in more menu)
  const dashboardBtn = document.getElementById('dashboard-btn');
  dashboardBtn?.addEventListener('click', () => {
    browser.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
    closeHeaderMoreMenu();
  });
  
  // Header More Menu
  const headerMoreBtn = document.getElementById('header-more-btn');
  const headerMoreDropdown = document.getElementById('header-more-dropdown');
  
  headerMoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !headerMoreDropdown?.classList.contains('hidden');
    if (isOpen) {
      closeHeaderMoreMenu();
    } else {
      headerMoreDropdown?.classList.remove('hidden');
      headerMoreBtn.setAttribute('aria-expanded', 'true');
    }
  });
  
  // Close more menu when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.header-more-menu')) {
      closeHeaderMoreMenu();
    }
  });
  
  // Open external button (in more menu)
  const openExternalBtn = document.getElementById('open-external-btn');
  openExternalBtn?.addEventListener('click', () => {
    openCurrentViewExternal();
    closeHeaderMoreMenu();
  });
  
  // Keyboard shortcuts button (in more menu)
  const keyboardShortcutsBtn = document.getElementById('keyboard-shortcuts-btn');
  keyboardShortcutsBtn?.addEventListener('click', () => {
    showKeyboardShortcuts();
    closeHeaderMoreMenu();
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
  
  // Terminal toggle button
  const terminalToggleBtn = document.getElementById('terminal-toggle-btn');
  terminalToggleBtn?.addEventListener('click', toggleTerminal);
  
  // Terminal panel buttons
  const terminalCloseBtn = document.getElementById('terminal-close-btn');
  terminalCloseBtn?.addEventListener('click', closeTerminal);
  
  const terminalClearBtn = document.getElementById('terminal-clear-btn');
  terminalClearBtn?.addEventListener('click', () => {
    if (state.terminal.instance) {
      clearTerminal(state.terminal.instance.id);
    }
  });
  
  // Terminal new button (creates additional terminal - for now just reinitialize)
  const terminalNewBtn = document.getElementById('terminal-new-btn');
  terminalNewBtn?.addEventListener('click', async () => {
    // Destroy existing terminal and create a new one
    if (state.terminal.instance) {
      await destroyTerminal(state.terminal.instance.id);
      state.terminal.instance = null;
    }
    await initTerminal();
  });
  
  const terminalConnectBtn = document.getElementById('terminal-connect-btn');
  terminalConnectBtn?.addEventListener('click', initTerminal);
  
  // Terminal resize handle
  const terminalResizeHandle = document.getElementById('terminal-resize-handle');
  if (terminalResizeHandle) {
    setupTerminalResize(terminalResizeHandle);
  }
  
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
  
  const stopBtn = getElement('tui-stop-btn');
  stopBtn.addEventListener('click', () => {
    if (!document.body.classList.contains('tui-mode')) {
      showNotification('Terminal mode is unavailable while using Claude chat.', 'info');
      return;
    }
    interruptTerminalSession(stopBtn);
  });
  
  // TUI-only buttons: New Session, Sessions, and Help
  const tuiNewSessionBtn = document.getElementById('tui-new-session-btn');
  tuiNewSessionBtn?.addEventListener('click', () => {
    performTuiAction('start a new session', () => openCodeService.newSessionInTui());
  });
  
  const tuiSessionsBtn = document.getElementById('tui-sessions-btn');
  tuiSessionsBtn?.addEventListener('click', () => {
    performTuiAction('open the sessions manager', () => openCodeService.openSessionsInTui());
  });
  
  const tuiHelpBtn = document.getElementById('tui-help-btn');
  tuiHelpBtn?.addEventListener('click', () => {
    performTuiAction('open help', () => openCodeService.openHelpInTui());
  });
  
  const tuiThemesBtn = document.getElementById('tui-themes-btn');
  tuiThemesBtn?.addEventListener('click', () => {
    performTuiAction('open themes', () => openCodeService.openThemesInTui());
  });
  
  // Auto-resize textarea and handle slash command autocomplete
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    
    // Show slash autocomplete when blocks UI is enabled
    if (state.useBlocksUI) {
      renderSlashAutocomplete(messageInput.value);
    }
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
      case 'upload-files':
        closeAllClaudeMenus();
        triggerFileUpload();
        break;
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
  
  modelSelectorBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (shouldUseTuiInterface()) {
      await performTuiAction('open the model selector', () => openCodeService.openModelsInTui());
      return;
    }
    toggleClaudeMenu('model-menu');
  });
  
  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.claude-menu') && !target.closest('.toolbar-btn') && !target.closest('.model-selector-btn')) {
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
  
  // Blocks UI toggle (Warp-style terminal/chat hybrid)
  const blocksUIToggle = document.getElementById('blocks-ui-toggle') as HTMLInputElement | null;
  if (blocksUIToggle) {
    blocksUIToggle.checked = state.useBlocksUI;
    blocksUIToggle.addEventListener('change', () => {
      toggleBlocksUI();
      blocksUIToggle.checked = state.useBlocksUI;
    });
  }
  
  // Projects root folder setting
  const projectsRootInput = document.getElementById('projects-root-input') as HTMLInputElement;
  if (projectsRootInput) {
    // Load saved value
    const savedRoot = localStorage.getItem('eidolon-projects-root') || '~/github';
    projectsRootInput.value = savedRoot;
    
    // Save on blur (when user finishes editing)
    projectsRootInput.addEventListener('blur', () => {
      const value = projectsRootInput.value.trim() || '~/github';
      localStorage.setItem('eidolon-projects-root', value);
      console.log('[Eidolon] Projects root folder set to:', value);
    });
    
    // Also save on Enter key
    projectsRootInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        projectsRootInput.blur();
      }
    });
  }
  
  // Validate session button
  const validateBtn = getElement('validate-session-btn');
  validateBtn.addEventListener('click', validateSession);
  
  // Chat backend selector
  const backendClaudeCookie = document.getElementById('backend-claude-cookie') as HTMLInputElement;
  const backendOpencode = document.getElementById('backend-opencode') as HTMLInputElement;
  
  if (backendClaudeCookie && backendOpencode) {
    // Set initial state
    if (state.chatBackend === 'opencode') {
      backendOpencode.checked = true;
    } else {
      backendClaudeCookie.checked = true;
    }
    
    // Handle changes
    backendClaudeCookie.addEventListener('change', () => {
      if (backendClaudeCookie.checked) {
        switchChatBackend('claude-cookie');
      }
    });
    
    backendOpencode.addEventListener('change', () => {
      if (backendOpencode.checked) {
        switchChatBackend('opencode');
      }
    });
    
    // Update OpenCode status display initially
    updateOpenCodeStatusUI();
  }
  
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
  
  // Settings Tabs
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tabId = target.getAttribute('data-tab');
      
      // Update buttons
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      target.classList.add('active');
      
      // Update content
      document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
      const content = document.getElementById(`settings-tab-${tabId}`);
      if (content) {
        content.classList.add('active');
      }
    });
  });
}

// ========================================================================
// DEVELOPER MODE
// ========================================================================

/**
 * Initialize developer mode toggle and visibility
 */
async function initDeveloperMode(): Promise<void> {
  const toggle = document.getElementById('developer-mode-toggle') as HTMLInputElement;
  const developerTab = document.querySelector('.settings-tab-btn[data-tab="developer"]') as HTMLElement;
  
  if (!toggle || !developerTab) return;
  
  // Load saved preference - default to TRUE (show developer tab by default)
  const result = await chrome.storage.local.get('eidolon_developer_mode');
  const developerMode = result.eidolon_developer_mode !== false; // Default true
  
  toggle.checked = developerMode;
  updateDeveloperTabVisibility(developerMode, developerTab);
  
  // Listen for changes
  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    await chrome.storage.local.set({ eidolon_developer_mode: enabled });
    updateDeveloperTabVisibility(enabled, developerTab);
    
    // If disabling and currently on developer tab, switch to general
    if (!enabled) {
      const activeTab = document.querySelector('.settings-tab-btn.active');
      if (activeTab?.getAttribute('data-tab') === 'developer') {
        const generalTab = document.querySelector('.settings-tab-btn[data-tab="general"]') as HTMLElement;
        generalTab?.click();
      }
    }
  });
}

/**
 * Show or hide the Developer tab button
 */
function updateDeveloperTabVisibility(visible: boolean, tabBtn: HTMLElement): void {
  if (visible) {
    tabBtn.style.display = '';
  } else {
    tabBtn.style.display = 'none';
  }
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

/**
 * Load models from OpenCode API
 * Returns models grouped by provider with proper display names
 */
async function loadModelsFromOpenCode(): Promise<ModelInfo[]> {
  try {
    const { providers, defaults } = await openCodeService.getProviders();
    
    if (!providers || providers.length === 0) {
      console.log('[Eidolon] No providers from OpenCode, using defaults');
      return [];
    }
    
    const models: ModelInfo[] = [];
    const defaultModelId = defaults?.['model'] || defaults?.['default'] || '';
    
    // Provider display names
    const providerNames: Record<string, string> = {
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
      'google-vertex': 'Google Vertex',
      groq: 'Groq',
      mistral: 'Mistral',
      together: 'Together AI',
      deepseek: 'DeepSeek',
      ollama: 'Ollama',
      openrouter: 'OpenRouter',
      bedrock: 'AWS Bedrock',
      'azure-openai': 'Azure OpenAI',
    };
    
    for (const provider of providers) {
      const providerId = provider.id || '';
      const providerDisplayName = providerNames[providerId] || providerId;
      
      if (provider.models && Array.isArray(provider.models)) {
        for (const model of provider.models) {
          const modelId = model.id || '';
          const fullModelId = `${providerId}:${modelId}`; // Use provider:model format
          
          models.push({
            id: fullModelId,
            name: model.name || modelId,
            default: modelId === defaultModelId || fullModelId === defaultModelId,
            provider: providerId,
            providerName: providerDisplayName,
          });
        }
      }
    }
    
    // If no default was set, make first model default
    if (models.length > 0 && !models.some(m => m.default)) {
      models[0].default = true;
    }
    
    console.log('[Eidolon] Loaded', models.length, 'models from OpenCode across', providers.length, 'providers');
    return models;
  } catch (error) {
    console.warn('[Eidolon] Failed to load models from OpenCode:', error);
    return [];
  }
}

/**
 * Load models from Claude.ai bootstrap API
 */
async function loadModelsFromClaudeAI(): Promise<ModelInfo[]> {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-available-models' });
    
    if (response.success && response.data && response.data.length > 0) {
      return response.data.map((model: any, index: number) => ({
        id: model.id || model.model_id || '',
        name: model.name || model.display_name || model.id || 'Unknown Model',
        default: index === 0, // First model (Sonnet) is default
        provider: 'anthropic',
        providerName: 'Anthropic',
      }));
    }
    return [];
  } catch (error) {
    console.warn('[Eidolon] Failed to load models from Claude.ai:', error);
    return [];
  }
}

/**
 * Load available models based on current chat backend
 * - OpenCode: fetches from /config/providers API (multiple providers)
 * - Claude.ai: fetches from bootstrap API (Anthropic models only)
 */
async function loadAvailableModels() {
  let models: ModelInfo[] = [];
  
  if (state.chatBackend === 'opencode' && state.opencode.connected) {
    // Load from OpenCode API - supports multiple providers
    models = await loadModelsFromOpenCode();
    console.log('[Eidolon] Loaded models from OpenCode:', models.map(m => `${m.provider}:${m.name}`));
  }
  
  // Fallback to Claude.ai if no models from OpenCode
  if (models.length === 0) {
    models = await loadModelsFromClaudeAI();
    console.log('[Eidolon] Loaded models from Claude.ai:', models.map(m => m.name));
  }
  
  // If still no models, keep default
  if (models.length === 0) {
    console.log('[Eidolon] No models loaded, keeping defaults');
    return;
  }
  
  AVAILABLE_MODELS = models;
  
  // Update model names lookup
  updateModelNames();
  
  // Re-render the model selector with new models
  renderModelSelector();
  renderModelMenu();
  
  // Update the indicator in case model name changed
  updateModelIndicator();
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
  
  if (shouldUseTuiInterface()) {
    list.innerHTML = `
      <div class="empty-state">
        <p style="margin-bottom: 12px;">Sessions are managed inside the Eidolon terminal.</p>
        <button id="tui-open-sessions-btn" class="quick-action-btn" type="button">Open Sessions Manager</button>
      </div>
    `;
    document.getElementById('tui-open-sessions-btn')?.addEventListener('click', () => {
      performTuiAction('open the sessions manager', () => openCodeService.openSessionsInTui());
    });
    return;
  }
  
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
 * Load and render organizations list in settings panel
 */
async function loadOrganizations(): Promise<void> {
  const orgList = document.getElementById('org-list');
  if (!orgList) return;
  
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-organizations' });
    const currentOrgResponse = await browser.runtime.sendMessage({ action: 'get-current-org' });
    const currentOrgId = currentOrgResponse.success ? currentOrgResponse.data?.uuid : null;
    
    if (response.success && response.data && response.data.length > 0) {
      renderOrganizationsList(response.data, currentOrgId);
    } else {
      orgList.innerHTML = `
        <div class="no-orgs">
          <div class="no-orgs-text">No organizations found.<br>Please log in to Claude.ai.</div>
        </div>
      `;
    }
  } catch (error) {
    console.error('[Eidolon] Failed to load organizations:', error);
    if (orgList) {
      orgList.innerHTML = `
        <div class="no-orgs">
          <div class="no-orgs-text">Failed to load organizations</div>
        </div>
      `;
    }
  }
}

/**
 * Render the organizations list
 */
function renderOrganizationsList(organizations: any[], currentOrgId: string | null): void {
  const orgList = document.getElementById('org-list');
  if (!orgList) return;
  
  orgList.innerHTML = organizations.map(org => {
    const isActive = org.uuid === currentOrgId;
    return `
      <div class="org-item ${isActive ? 'active' : ''}" data-org-id="${org.uuid}" data-org-name="${escapeHtml(org.name)}">
        <div class="org-item-info">
          <div class="org-item-name">${escapeHtml(org.name)}</div>
          <div class="org-item-meta">${org.capabilities ? `${org.capabilities.length} capabilities` : 'Standard'}</div>
        </div>
        ${isActive ? '<span class="org-current">Current</span>' : ''}
      </div>
    `;
  }).join('');
  
  // Add click handlers
  orgList.querySelectorAll('.org-item').forEach(item => {
    item.addEventListener('click', async () => {
      const orgId = item.getAttribute('data-org-id');
      const orgName = item.getAttribute('data-org-name');
      if (orgId && !item.classList.contains('active')) {
        await switchOrganization(orgId, orgName || 'Unknown');
      }
    });
  });
}

/**
 * Switch to a different organization
 */
async function switchOrganization(orgId: string, orgName: string): Promise<void> {
  showLoading('Switching organization...');
  
  try {
    const response = await browser.runtime.sendMessage({ 
      action: 'set-current-org',
      orgId,
      orgName
    });
    
    if (response.success) {
      showNotification(`Switched to ${orgName}`);
      // Reload data
      await Promise.all([
        loadOrganizations(),
        loadProjects(),
        loadConversations()
      ]);
    } else {
      showNotification('Failed to switch organization: ' + (response.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('[Eidolon] Failed to switch organization:', error);
    showNotification('Failed to switch organization', 'error');
  } finally {
    hideLoading();
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
        loadOrganizations(),
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
/**
 * Toast notification options
 */
interface ToastOptions {
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number; // ms, 0 for no auto-dismiss
  actions?: Array<{
    label: string;
    onClick: () => void;
    primary?: boolean;
  }>;
}

/**
 * Show a toast notification
 */
function showToast(options: ToastOptions): HTMLElement {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.warn('[Eidolon] Toast container not found');
    return document.createElement('div');
  }
  
  const { 
    title, 
    message, 
    type = 'info', 
    duration = 4000,
    actions 
  } = options;
  
  // Icon SVGs for each type
  const icons: Record<string, string> = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      <div class="toast-message">${escapeHtml(message)}</div>
      ${actions ? `<div class="toast-actions"></div>` : ''}
    </div>
    <button class="toast-close" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    ${duration > 0 ? `<div class="toast-progress" style="animation-duration: ${duration}ms"></div>` : ''}
  `;
  
  // Add action buttons
  if (actions && actions.length > 0) {
    const actionsContainer = toast.querySelector('.toast-actions');
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = `toast-action-btn ${action.primary ? 'primary' : 'secondary'}`;
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.onClick();
        dismissToast(toast);
      });
      actionsContainer?.appendChild(btn);
    });
  }
  
  // Close button handler
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn?.addEventListener('click', () => dismissToast(toast));
  
  // Add to container
  container.appendChild(toast);
  
  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
  
  return toast;
}

/**
 * Dismiss a toast with animation
 */
function dismissToast(toast: HTMLElement): void {
  if (toast.classList.contains('toast-exiting')) return;
  
  toast.classList.add('toast-exiting');
  setTimeout(() => {
    toast.remove();
  }, 200);
}

/**
 * Simple notification helper (backwards compatible)
 */
function showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success'): void {
  showToast({ message, type });
}

// ========================================================================
// FOCUS TRAP FOR MODALS (Accessibility)
// ========================================================================

/**
 * Create a focus trap for a modal element
 * Keeps focus within the modal while it's open
 */
function createFocusTrap(modal: HTMLElement): { activate: () => void; deactivate: () => void } {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  
  let previouslyFocused: HTMLElement | null = null;
  
  function getFocusableElements(): HTMLElement[] {
    return Array.from(modal.querySelectorAll(focusableSelectors)) as HTMLElement[];
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    
    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    
    if (e.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  }
  
  function activate() {
    // Store current focus
    previouslyFocused = document.activeElement as HTMLElement;
    
    // Focus first focusable element in modal
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      // Prefer focusing a close button or first input, not just first element
      const preferredFocus = modal.querySelector('.close-btn, input, button.btn-primary') as HTMLElement;
      (preferredFocus || focusable[0]).focus();
    }
    
    // Add keydown listener
    modal.addEventListener('keydown', handleKeyDown);
  }
  
  function deactivate() {
    // Remove listener
    modal.removeEventListener('keydown', handleKeyDown);
    
    // Restore focus
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus();
    }
  }
  
  return { activate, deactivate };
}

/**
 * Helper to show a modal with focus trap
 */
function showModalWithFocusTrap(modal: HTMLElement, onClose?: () => void): void {
  document.body.appendChild(modal);
  
  const trap = createFocusTrap(modal);
  trap.activate();
  
  // Set aria attributes
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  
  function closeModal() {
    trap.deactivate();
    modal.remove();
    onClose?.();
  }
  
  // Close on Escape
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Close button handler
  const closeBtn = modal.querySelector('.close-btn, #add-project-close, #opencode-instructions-close');
  closeBtn?.addEventListener('click', closeModal);
  
  // Cancel button handler
  const cancelBtn = modal.querySelector('.btn-secondary, #add-project-cancel');
  cancelBtn?.addEventListener('click', closeModal);
}

// ========================================================================
// HEADER MORE MENU
// ========================================================================

/**
 * Close the header more dropdown menu
 */
function closeHeaderMoreMenu(): void {
  const dropdown = document.getElementById('header-more-dropdown');
  const btn = document.getElementById('header-more-btn');
  dropdown?.classList.add('hidden');
  btn?.setAttribute('aria-expanded', 'false');
}

/**
 * Show keyboard shortcuts modal
 */
function showKeyboardShortcuts(): void {
  const shortcuts = [
    { key: 'Ctrl + `', action: 'Toggle terminal' },
    { key: 'Ctrl + K', action: 'Open command palette' },
    { key: 'Ctrl + Enter', action: 'Send message' },
    { key: 'Ctrl + N', action: 'New conversation' },
    { key: 'Ctrl + Shift + E', action: 'Open in new tab' },
    { key: 'Escape', action: 'Close panel/menu' },
    { key: '?', action: 'Show keyboard shortcuts' },
  ];
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'shortcuts-title');
  modal.innerHTML = `
    <div class="modal-content shortcuts-modal">
      <div class="modal-header">
        <h3 id="shortcuts-title">Keyboard Shortcuts</h3>
        <button class="close-btn" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <div class="shortcuts-list">
          ${shortcuts.map(s => `
            <div class="shortcut-item">
              <kbd>${s.key}</kbd>
              <span>${s.action}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const focusTrap = createFocusTrap(modal);
  focusTrap.activate();
  
  function closeModal() {
    focusTrap.deactivate();
    modal.remove();
  }
  
  modal.querySelector('.close-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });
}

// ========================================================================
// OAUTH CONNECTION MANAGEMENT
// ========================================================================

/**
 * Load and render OAuth connections in settings panel
 */
async function loadOAuthConnections(): Promise<void> {
  const connectionsList = document.getElementById('oauth-connections-list');
  if (!connectionsList) return;
  
  try {
    const statuses = await getAllProviderStatus();
    renderOAuthConnections(statuses);
  } catch (error) {
    console.error('[Eidolon] Failed to load OAuth connections:', error);
    connectionsList.innerHTML = `
      <div class="oauth-loading">Failed to load connections</div>
    `;
  }
}

/**
 * Render OAuth provider connections
 */
function renderOAuthConnections(statuses: ProviderStatus[]): void {
  const connectionsList = document.getElementById('oauth-connections-list');
  if (!connectionsList) return;
  
  const providerIcons: Record<OAuthProviderType, string> = {
    anthropic: 'C',
    openai: 'G',
    google: 'G',
  };
  
  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
  };
  
  const providerDescs: Record<OAuthProviderType, string> = {
    anthropic: 'Use your Claude Pro/Max subscription',
    openai: 'Use your ChatGPT Plus/Pro/Team subscription',
    google: 'Use your Gemini Advanced subscription',
  };
  
  connectionsList.innerHTML = statuses.map(status => {
    const config = OAUTH_PROVIDERS[status.provider];
    const isConnected = status.connected;
    
    return `
      <div class="oauth-provider-item ${isConnected ? 'connected' : ''}" data-provider="${status.provider}">
        <div class="oauth-provider-icon ${status.provider}">
          ${providerIcons[status.provider]}
        </div>
        <div class="oauth-provider-info">
          <div class="oauth-provider-name">
            ${providerNames[status.provider]}
            <span class="status-dot ${isConnected ? 'connected' : ''}"></span>
          </div>
          <div class="oauth-provider-desc">${providerDescs[status.provider]}</div>
          ${isConnected && status.email ? `<div class="oauth-provider-email">${escapeHtml(status.email)}</div>` : ''}
        </div>
        <div class="oauth-provider-action">
          ${isConnected 
            ? `<button class="oauth-disconnect-btn" data-provider="${status.provider}">Disconnect</button>`
            : `<button class="oauth-connect-btn" data-provider="${status.provider}">Connect</button>`
          }
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners
  connectionsList.querySelectorAll('.oauth-connect-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const provider = (e.target as HTMLElement).getAttribute('data-provider') as OAuthProviderType;
      if (provider) {
        await startOAuthFlow(provider);
      }
    });
  });
  
  connectionsList.querySelectorAll('.oauth-disconnect-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const provider = (e.target as HTMLElement).getAttribute('data-provider') as OAuthProviderType;
      if (provider) {
        await disconnectOAuthProvider(provider);
      }
    });
  });
}

/**
 * Start OAuth flow for a provider
 */
async function startOAuthFlow(provider: OAuthProviderType): Promise<void> {
  try {
    const auth = await startAuthorization(provider);
    
    // Open the authorization URL in a new tab
    await browser.tabs.create({ url: auth.url, active: true });
    
    // Show modal with waiting state (code will be captured automatically)
    showOAuthWaitingModal(provider);
  } catch (error) {
    console.error('[Eidolon] OAuth start failed:', error);
    showNotification(`Failed to start OAuth: ${(error as Error).message}`, 'error');
  }
}

/**
 * Show OAuth waiting modal (auto-capture mode)
 */
function showOAuthWaitingModal(provider: OAuthProviderType): void {
  const modal = document.getElementById('oauth-code-modal');
  const titleEl = document.getElementById('oauth-modal-title');
  const instructionsEl = document.getElementById('oauth-instructions');
  const providerIdInput = document.getElementById('oauth-provider-id') as HTMLInputElement;
  const codeInput = document.getElementById('oauth-code-input') as HTMLTextAreaElement;
  const submitBtn = document.getElementById('oauth-submit-btn') as HTMLButtonElement;

  if (!modal || !titleEl || !instructionsEl || !providerIdInput || !codeInput) return;

  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
  };

  titleEl.textContent = `Connecting ${providerNames[provider]}...`;
  
  // Special instructions for Anthropic - OAuth may not work, offer Claude Code import
  if (provider === 'anthropic') {
    instructionsEl.innerHTML = `
      <div style="text-align: center; padding: 12px 0;">
        <div style="font-size: 24px; margin-bottom: 8px;">🔐</div>
        <div>Complete the authorization in the new tab.</div>
        <div style="color: var(--text-400); font-size: 12px; margin-top: 8px;">
          If clicking "Authorize" doesn't work, Claude's OAuth<br>
          is restricted. Use the <strong>Import from Claude Code</strong> option below.
        </div>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
          <button id="import-claude-code-btn" class="oauth-submit-btn" style="background: var(--accent-color);">
            📥 Import from Claude Code CLI
          </button>
          <div style="color: var(--text-400); font-size: 11px; margin-top: 6px;">
            Imports tokens from ~/.claude/.credentials.json
          </div>
        </div>
      </div>
    `;
    
    // Add click handler for import button after DOM update
    setTimeout(() => {
      document.getElementById('import-claude-code-btn')?.addEventListener('click', showClaudeCodeImportModal);
    }, 0);
  } else {
    instructionsEl.innerHTML = `
      <div style="text-align: center; padding: 12px 0;">
        <div style="font-size: 24px; margin-bottom: 8px;">🔐</div>
        <div>Complete the authorization in the new tab.</div>
        <div style="color: var(--text-400); font-size: 12px; margin-top: 8px;">
          The code will be captured automatically.<br>
          If it doesn't work, paste the code manually below.
        </div>
      </div>
    `;
  }
  
  providerIdInput.value = provider;
  codeInput.value = '';
  codeInput.placeholder = 'Or paste code here if auto-capture fails...';
  if (submitBtn) submitBtn.textContent = 'Submit Code';

  modal.classList.remove('hidden');
}

/**
 * Show modal to import Claude Code credentials
 */
function showClaudeCodeImportModal(): void {
  const modal = document.getElementById('oauth-code-modal');
  const titleEl = document.getElementById('oauth-modal-title');
  const instructionsEl = document.getElementById('oauth-instructions');
  const codeInput = document.getElementById('oauth-code-input') as HTMLTextAreaElement;
  const submitBtn = document.getElementById('oauth-submit-btn') as HTMLButtonElement;

  if (!modal || !titleEl || !instructionsEl || !codeInput) return;

  titleEl.textContent = 'Import CLI Credentials';
  instructionsEl.innerHTML = `
    <div style="padding: 8px 0;">
      <div style="margin-bottom: 12px;">
        Paste credentials from <strong>Claude Code CLI</strong> or <strong>OpenCode</strong>:
      </div>
      <div style="background: var(--bg-200); padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 11px; margin-bottom: 12px;">
        <strong>Claude Code:</strong> ~/.claude/.credentials.json<br>
        <strong>OpenCode:</strong> ~/.local/share/opencode/auth.json
      </div>
      <div style="color: var(--text-400); font-size: 11px; line-height: 1.6;">
        <strong>Copy commands:</strong><br>
        <code style="background: var(--bg-200); padding: 2px 6px; border-radius: 3px; display: inline-block; margin: 2px 0;">Claude: cat ~/.claude/.credentials.json | xclip -selection clipboard</code><br>
        <code style="background: var(--bg-200); padding: 2px 6px; border-radius: 3px; display: inline-block; margin: 2px 0;">OpenCode: cat ~/.local/share/opencode/auth.json | xclip -selection clipboard</code><br>
        <code style="background: var(--bg-200); padding: 2px 6px; border-radius: 3px; display: inline-block; margin: 2px 0; color: var(--text-500);">macOS: replace xclip with pbcopy</code>
      </div>
    </div>
  `;
  
  codeInput.value = '';
  codeInput.placeholder = 'Paste JSON credentials here...';
  codeInput.style.minHeight = '100px';
  
  if (submitBtn) {
    submitBtn.textContent = 'Import Credentials';
    submitBtn.style.display = 'block';
    // Replace click handler
    const handleImport = async () => {
      console.log('[Eidolon] Import button clicked, content length:', codeInput.value.length);
      await importClaudeCredentials(codeInput.value);
      codeInput.style.minHeight = '';
    };
    submitBtn.onclick = handleImport;
  }
  
  // Show the modal
  modal.classList.remove('hidden');
}

/**
 * Import Claude Code credentials
 */
async function importClaudeCredentials(jsonContent: string): Promise<void> {
  console.log('[Eidolon] importClaudeCredentials called');
  console.log('[Eidolon] Content preview:', jsonContent.substring(0, 100));
  
  const submitBtn = document.getElementById('oauth-submit-btn') as HTMLButtonElement;
  const instructionsEl = document.getElementById('oauth-instructions');
  
  // Helper to show error in modal
  const showError = (title: string, details: string, hint?: string) => {
    if (instructionsEl) {
      instructionsEl.innerHTML = `
        <div style="padding: 12px; background: var(--error-bg, #fef2f2); border: 1px solid var(--error-border, #fecaca); border-radius: 8px; margin-bottom: 12px;">
          <div style="color: var(--error-text, #dc2626); font-weight: 600; margin-bottom: 8px;">
            ${title}
          </div>
          <div style="color: var(--text-500, #6b7280); font-size: 13px; margin-bottom: 8px;">
            ${details}
          </div>
          ${hint ? `
          <div style="color: var(--text-400, #9ca3af); font-size: 12px; padding-top: 8px; border-top: 1px solid var(--error-border, #fecaca);">
            <strong>How to fix:</strong> ${hint}
          </div>
          ` : ''}
        </div>
        <div style="font-size: 12px; color: var(--text-400);">
          You can try pasting new credentials or cancel to close this dialog.
        </div>
      `;
    }
    showNotification(title, 'error');
  };
  
  if (!jsonContent.trim()) {
    console.log('[Eidolon] Empty content');
    showNotification('Please paste the credentials JSON', 'error');
    return;
  }
  
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing...';
  }
  
  try {
    console.log('[Eidolon] Calling importClaudeCodeCredentials...');
    const result = await importClaudeCodeCredentials(jsonContent);
    console.log('[Eidolon] Import result:', result);
    
    if (result.success) {
      const sourceName = result.source || 'CLI';
      
      // If tokens are expired, try to refresh them
      if (result.needsRefresh) {
        console.log('[Eidolon] Tokens expired, attempting refresh...');
        if (submitBtn) {
          submitBtn.textContent = 'Refreshing tokens...';
        }
        
        const refreshResult = await refreshTokens('anthropic');
        console.log('[Eidolon] Refresh result:', refreshResult);
        
        if (refreshResult.success) {
          closeOAuthCodeModal();
          showNotification(`Credentials from ${sourceName} imported and refreshed!`);
          await loadOAuthConnections();
        } else {
          // Show detailed error in the modal
          const errorDetails = refreshResult.error || 'Unknown error';
          const hint = refreshResult.hint || 'Run "claude" or "opencode" in your terminal to re-authenticate, then copy the new credentials.';
          
          showError(
            'Token Refresh Failed',
            `Your ${sourceName} tokens were imported but are expired. Refresh error: ${errorDetails}`,
            hint
          );
          
          // Still refresh the connections display to show the (expired) connection
          await loadOAuthConnections();
        }
      } else {
        closeOAuthCodeModal();
        showNotification(`Credentials from ${sourceName} imported successfully!`);
        await loadOAuthConnections();
      }
    } else {
      console.error('[Eidolon] Import failed:', result.error);
      showError(
        'Import Failed', 
        result.error || 'Unknown error',
        'Make sure you copied the entire JSON contents of your credentials file.'
      );
    }
  } catch (error) {
    console.error('[Eidolon] Import exception:', error);
    showError(
      'Import Error',
      (error as Error).message,
      'Check the browser console for more details'
    );
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Import Credentials';
    }
  }
}

/**
 * Show OAuth code input modal
 */
function showOAuthCodeModal(provider: OAuthProviderType, instructions: string): void {
  const modal = document.getElementById('oauth-code-modal');
  const titleEl = document.getElementById('oauth-modal-title');
  const instructionsEl = document.getElementById('oauth-instructions');
  const providerIdInput = document.getElementById('oauth-provider-id') as HTMLInputElement;
  const codeInput = document.getElementById('oauth-code-input') as HTMLTextAreaElement;
  
  if (!modal || !titleEl || !instructionsEl || !providerIdInput || !codeInput) return;
  
  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
  };
  
  titleEl.textContent = `Connect ${providerNames[provider]}`;
  instructionsEl.textContent = instructions;
  providerIdInput.value = provider;
  codeInput.value = '';
  
  modal.classList.remove('hidden');
  codeInput.focus();
}

/**
 * Close OAuth code modal
 */
function closeOAuthCodeModal(): void {
  const modal = document.getElementById('oauth-code-modal');
  modal?.classList.add('hidden');
}

/**
 * Submit OAuth code
 */
async function submitOAuthCode(): Promise<void> {
  const codeInput = document.getElementById('oauth-code-input') as HTMLTextAreaElement;
  const code = codeInput?.value?.trim();
  
  if (!code) {
    showNotification('Please enter the authorization code', 'error');
    return;
  }
  
  const submitBtn = document.getElementById('oauth-submit-btn') as HTMLButtonElement;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connecting...';
  }
  
  try {
    const result = await exchangeCodeForTokens(code);
    
    if (result.type === 'success') {
      closeOAuthCodeModal();
      showNotification('Connected successfully!');
      await loadOAuthConnections();
    } else {
      showNotification(`Failed: ${result.error}`, 'error');
    }
  } catch (error) {
    showNotification(`Error: ${(error as Error).message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Connect';
    }
  }
}

/**
 * Disconnect OAuth provider
 */
async function disconnectOAuthProvider(provider: OAuthProviderType): Promise<void> {
  const providerNames: Record<OAuthProviderType, string> = {
    anthropic: 'Claude',
    openai: 'ChatGPT',
    google: 'Gemini',
  };
  
  if (!confirm(`Disconnect ${providerNames[provider]}? You'll need to re-authorize to use it again.`)) {
    return;
  }
  
  try {
    await removeCredentials(provider);
    showNotification(`${providerNames[provider]} disconnected`);
    await loadOAuthConnections();
  } catch (error) {
    showNotification(`Failed to disconnect: ${(error as Error).message}`, 'error');
  }
}

/**
 * Setup OAuth event listeners
 */
function setupOAuthEventListeners(): void {
  // Close modal
  document.getElementById('close-oauth-modal')?.addEventListener('click', closeOAuthCodeModal);
  document.getElementById('oauth-cancel-btn')?.addEventListener('click', closeOAuthCodeModal);
  
  // Submit code
  document.getElementById('oauth-submit-btn')?.addEventListener('click', submitOAuthCode);
  
  // Enter to submit
  document.getElementById('oauth-code-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitOAuthCode();
    }
  });
  
  // Click outside to close
  document.getElementById('oauth-code-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeOAuthCodeModal();
    }
  });
  
  // Listen for OAuth callback from background script (auto-capture)
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'oauth-callback' && message.code) {
      console.log('[Sidepanel] Received OAuth callback with code');
      handleAutoOAuthCallback(message.code);
    }
  });
}

/**
 * Handle automatically captured OAuth callback
 */
async function handleAutoOAuthCallback(code: string): Promise<void> {
  const modal = document.getElementById('oauth-code-modal');
  const titleEl = document.getElementById('oauth-modal-title');
  const instructionsEl = document.getElementById('oauth-instructions');
  
  // Only process if modal is open (meaning we're expecting a callback)
  if (!modal || modal.classList.contains('hidden')) {
    return;
  }
  
  // Update UI to show processing
  if (titleEl) titleEl.textContent = 'Completing connection...';
  if (instructionsEl) {
    instructionsEl.innerHTML = `
      <div style="text-align: center; padding: 12px 0;">
        <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
        <div>Exchanging authorization code...</div>
      </div>
    `;
  }
  
  try {
    const result = await exchangeCodeForTokens(code);
    
    if (result.type === 'success') {
      showNotification('Connected successfully!');
      closeOAuthCodeModal();
      await loadOAuthConnections();
    } else {
      showNotification(`Connection failed: ${result.error}`, 'error');
      // Reset modal to allow manual entry
      if (instructionsEl) {
        instructionsEl.innerHTML = `
          <div style="color: var(--error); margin-bottom: 12px;">
            Auto-capture failed: ${result.error}
          </div>
          <div>Please paste the authorization code manually:</div>
        `;
      }
      if (titleEl) titleEl.textContent = 'Enter Code Manually';
    }
  } catch (error) {
    console.error('[Sidepanel] OAuth auto-callback failed:', error);
    showNotification(`Connection failed: ${(error as Error).message}`, 'error');
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
  
  // Load accounts and OAuth connections when settings panel opens
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn?.addEventListener('click', () => {
    // Small delay to ensure panel is visible
    setTimeout(loadAccounts, 100);
    setTimeout(loadOrganizations, 100);
    setTimeout(loadExportSettings, 100);
    setTimeout(loadOAuthConnections, 100);
  });
  
  const refreshHeaderBtn = document.getElementById('refresh-session-header-btn');
  refreshHeaderBtn?.addEventListener('click', async () => {
    await validateSession();
  });
  
  // Setup OAuth event listeners
  setupOAuthEventListeners();
  
  // Platform export toggles
  const exportClaudeToggle = document.getElementById('export-claude-toggle') as HTMLInputElement;
  const exportChatgptToggle = document.getElementById('export-chatgpt-toggle') as HTMLInputElement;
  const exportGeminiToggle = document.getElementById('export-gemini-toggle') as HTMLInputElement;
  
  exportClaudeToggle?.addEventListener('change', () => saveExportSettings());
  exportChatgptToggle?.addEventListener('change', () => saveExportSettings());
  exportGeminiToggle?.addEventListener('change', () => saveExportSettings());
  
  // Open Dashboard for More Settings button
  const openDashboardSettingsBtn = document.getElementById('open-dashboard-settings-btn');
  openDashboardSettingsBtn?.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html#settings') });
  });
  
  // Setup command palette
  initCommandPalette();
  setupCommandPaletteListeners();
  
  // Setup drag and drop
  setupDragAndDrop();
  
  // Setup file upload
  const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
  fileInput?.addEventListener('change', async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      await handleFileUpload(files);
      fileInput.value = ''; // Reset for next upload
    }
  });
  
  // Close file preview
  document.getElementById('close-file-preview')?.addEventListener('click', closeFilePreview);
  document.getElementById('file-preview-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFilePreview();
  });
}

/**
 * Setup command palette keyboard shortcuts and event listeners
 */
function setupCommandPaletteListeners() {
  // Global keyboard shortcut (Cmd+K or Ctrl+K)
  document.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K to open command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const palette = document.getElementById('command-palette');
      if (palette?.classList.contains('hidden')) {
        openCommandPalette();
      } else {
        closeCommandPalette();
      }
      return;
    }
    
    // Cmd+U or Ctrl+U to upload files
    if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
      e.preventDefault();
      triggerFileUpload();
      return;
    }
    
    // Cmd+N or Ctrl+N for new chat
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      startNewChat();
      return;
    }
  });
  
  // Command palette input
  const paletteInput = document.getElementById('command-palette-input');
  paletteInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value;
    selectedCommandIndex = 0;
    renderCommandPaletteResults(query);
  });
  
  paletteInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCommandPalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateCommandPalette('down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateCommandPalette('up');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectCurrentCommand();
    }
  });
  
  // Click outside to close
  document.getElementById('command-palette')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeCommandPalette();
    }
  });
}

/**
 * Render the chat/blocks area - dispatches to appropriate renderer based on mode
 */
function renderChatArea() {
  if (state.useBlocksUI) {
    renderBlocks();
  } else {
    renderMessages();
  }
  updateTuiMode();
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

// ========================================================================
// BLOCK-BASED RENDERING (Warp-style)
// ========================================================================

/**
 * Render blocks instead of traditional messages (experimental UI)
 */
function renderBlocks() {
  const container = getElement('messages');
  
  if (state.blocks.blocks.length === 0) {
    // Show welcome message with blocks UI hint
    container.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">🚀</div>
        <h2>Eidolon Terminal Mode</h2>
        <p>Use slash commands or type naturally. Try <code>/commands</code> for help.</p>
        <div class="quick-actions">
          <button class="quick-action-btn" data-action="run-commands">
            ⌨️ /commands
          </button>
          <button class="quick-action-btn" data-action="summarize-page">
            📄 Summarize this page
          </button>
          <button class="quick-action-btn" data-action="help-browse">
            🌐 Help me browse
          </button>
        </div>
      </div>
    `;
    
    container.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).dataset.action;
        if (action === 'run-commands') {
          const input = getElement<HTMLTextAreaElement>('message-input');
          input.value = '/commands';
          input.focus();
        } else {
          handleQuickAction(action || '');
        }
      });
    });
    return;
  }
  
  container.innerHTML = state.blocks.blocks.map(block => renderBlock(block)).join('');
  
  // Attach event handlers for suggested commands
  container.querySelectorAll('.block-suggested-command-run').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const command = (e.target as HTMLElement).closest('.block-suggested-command')?.querySelector('.block-suggested-command-text')?.textContent;
      if (command) {
        executeBlockCommand(command);
      }
    });
  });
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/**
 * Render a single block
 */
function renderBlock(block: Block): string {
  switch (block.type) {
    case 'chat':
      return renderChatBlock(block as ChatBlock);
    case 'command':
      return renderCommandBlock(block as CommandBlock);
    case 'system':
      return renderSystemBlock(block as SystemBlock);
    case 'error':
      return renderErrorBlock(block as ErrorBlock);
    default:
      return '';
  }
}

/**
 * Render a chat block (user message + AI response)
 */
function renderChatBlock(block: ChatBlock): string {
  const statusClass = block.status;
  const timestamp = formatBlockTime(block.timestamp);
  
  let suggestedCommandsHtml = '';
  if (block.suggestedCommands && block.suggestedCommands.length > 0) {
    suggestedCommandsHtml = `
      <div class="block-suggested-commands">
        <div class="block-suggested-commands-title">Suggested Commands</div>
        ${block.suggestedCommands.map(cmd => `
          <div class="block-suggested-command">
            <span class="block-suggested-command-text">${escapeHtml(cmd.command)}</span>
            <button class="block-suggested-command-run">Run</button>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  const streamingIndicator = block.isStreaming 
    ? '<span class="block-streaming-indicator">Thinking</span>' 
    : '';
  
  return `
    <div class="block block-chat ${block.id === state.blocks.selectedBlockId ? 'block-selected' : ''}" data-block-id="${block.id}">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-type-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6l-4 3V4z"/>
            </svg>
          </span>
          <span>Chat</span>
        </div>
        <div class="block-header-right">
          <span class="block-timestamp">${timestamp}</span>
          <span class="block-status ${statusClass}">${statusClass}</span>
        </div>
      </div>
      <div class="block-body">
        <div class="block-user-message">${formatMessageContent(block.userMessage)}</div>
        ${block.aiResponse ? `
          <div class="block-ai-response">${formatMessageContent(block.aiResponse)}</div>
        ` : streamingIndicator}
        ${suggestedCommandsHtml}
      </div>
    </div>
  `;
}

/**
 * Render a command block (terminal command + output)
 */
function renderCommandBlock(block: CommandBlock): string {
  const statusClass = block.status;
  const timestamp = formatBlockTime(block.timestamp);
  const duration = block.duration ? formatDuration(block.duration) : '';
  const exitCodeClass = block.exitCode === 0 ? 'success' : 'error';
  
  return `
    <div class="block block-command ${block.id === state.blocks.selectedBlockId ? 'block-selected' : ''}" data-block-id="${block.id}">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-type-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="3" width="12" height="10" rx="1"/>
              <path d="M5 7l2 2-2 2M9 11h2"/>
            </svg>
          </span>
          <span>Command</span>
        </div>
        <div class="block-header-right">
          <span class="block-timestamp">${timestamp}</span>
          <span class="block-status ${statusClass}">${block.isRunning ? 'running' : statusClass}</span>
        </div>
      </div>
      <div class="block-command-line">
        <span class="block-cwd">${escapeHtml(block.cwd)}</span>
        <span class="block-prompt">$</span>
        <span class="block-command-text">${escapeHtml(block.command)}</span>
      </div>
      <div class="block-output">${formatCommandOutput(block.output)}</div>
      ${!block.isRunning && block.exitCode !== undefined ? `
        <div class="block-footer">
          <span class="block-duration">${duration}</span>
          <span class="block-exit-code ${exitCodeClass}">exit ${block.exitCode}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render a system block (informational message)
 */
function renderSystemBlock(block: SystemBlock): string {
  const timestamp = formatBlockTime(block.timestamp);
  
  return `
    <div class="block block-system" data-block-id="${block.id}">
      <div class="block-body">
        <span class="block-system-icon">${block.icon || 'ℹ️'}</span>
        <span class="block-system-message">${escapeHtml(block.message)}</span>
        <span class="block-timestamp">${timestamp}</span>
      </div>
    </div>
  `;
}

/**
 * Render an error block
 */
function renderErrorBlock(block: ErrorBlock): string {
  const timestamp = formatBlockTime(block.timestamp);
  
  return `
    <div class="block block-error" data-block-id="${block.id}">
      <div class="block-header">
        <div class="block-header-left">
          <span class="block-type-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="6"/>
              <path d="M8 5v4M8 11v.5"/>
            </svg>
          </span>
          <span>Error</span>
        </div>
        <div class="block-header-right">
          <span class="block-timestamp">${timestamp}</span>
        </div>
      </div>
      <div class="block-body">
        <div class="block-error-title">${escapeHtml(block.title)}</div>
        <div class="block-error-message">${escapeHtml(block.message)}</div>
        ${block.details ? `<div class="block-error-details">${escapeHtml(block.details)}</div>` : ''}
        ${block.recoveryAction ? `
          <button class="block-recovery-action" data-action="${escapeHtml(block.recoveryAction.action)}">
            ${escapeHtml(block.recoveryAction.label)}
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Execute a command from a block's suggested commands
 */
async function executeBlockCommand(command: string) {
  // Add command block
  const commandBlock = createCommandBlock(command, state.blocks.currentCwd);
  dispatchBlockAction({ type: 'ADD_BLOCK', block: commandBlock });
  renderBlocks();
  
  // Check if terminal is connected for PTY execution
  if (state.terminal.instance && state.terminal.isOpen) {
    try {
      // Send command to the terminal (via xterm.js write)
      // The terminal WebSocket will handle execution
      state.terminal.instance.terminal.write(command + '\r');
      
      dispatchBlockAction({
        type: 'UPDATE_BLOCK',
        id: commandBlock.id,
        updates: {
          status: 'success',
          output: 'Command sent to terminal',
          isRunning: false
        }
      });
      
      // Focus terminal to see output
      focusTerminal(state.terminal.instance.id);
    } catch (error) {
      dispatchBlockAction({
        type: 'UPDATE_BLOCK',
        id: commandBlock.id,
        updates: {
          status: 'error',
          output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isRunning: false
        }
      });
    }
  } else {
    // No terminal available - show hint
    dispatchBlockAction({
      type: 'UPDATE_BLOCK',
      id: commandBlock.id,
      updates: {
        status: 'error',
        output: 'Terminal not connected. Open the terminal first (click the terminal icon in the header).',
        isRunning: false
      }
    });
  }
  
  renderBlocks();
}

/**
 * Dispatch a block action and update state
 */
function dispatchBlockAction(action: Parameters<typeof blocksReducer>[1]) {
  state.blocks = blocksReducer(state.blocks, action);
}

/**
 * Handle input in blocks mode - detect slash commands and input type
 */
function handleBlocksInput(input: string): InputAnalysis {
  return analyzeInput(input);
}

/**
 * Render slash command autocomplete dropdown
 */
function renderSlashAutocomplete(query: string) {
  const autocomplete = document.getElementById('slash-autocomplete');
  if (!autocomplete) return;
  
  if (!query.startsWith('/') || query.length < 2) {
    autocomplete.classList.add('hidden');
    return;
  }
  
  const searchTerm = query.slice(1).toLowerCase();
  const allCommands = getAllSlashCommands();
  const matches = allCommands.filter(cmd => 
    cmd.name.toLowerCase().includes(searchTerm) ||
    cmd.aliases?.some(a => a.toLowerCase().includes(searchTerm))
  );
  
  if (matches.length === 0) {
    autocomplete.classList.add('hidden');
    return;
  }
  
  autocomplete.innerHTML = matches.map((cmd, idx) => `
    <div class="slash-command-item ${idx === 0 ? 'selected' : ''}" data-command="/${cmd.name}">
      <div class="slash-command-item-header">
        <span class="slash-command-name">/${cmd.name}</span>
        ${cmd.aliases?.length ? `<span class="slash-command-aliases">(${cmd.aliases.map(a => '/' + a).join(', ')})</span>` : ''}
      </div>
      <div class="slash-command-description">${escapeHtml(cmd.description)}</div>
      <div class="slash-command-usage">${escapeHtml(cmd.usage)}</div>
    </div>
  `).join('');
  
  autocomplete.classList.remove('hidden');
  
  // Add click handlers
  autocomplete.querySelectorAll('.slash-command-item').forEach(item => {
    item.addEventListener('click', () => {
      const command = item.getAttribute('data-command');
      if (command) {
        const messageInput = getElement<HTMLTextAreaElement>('message-input');
        messageInput.value = command + ' ';
        messageInput.focus();
        autocomplete.classList.add('hidden');
      }
    });
  });
}

/**
 * Toggle between traditional messages and blocks UI
 */
function toggleBlocksUI() {
  state.useBlocksUI = !state.useBlocksUI;
  localStorage.setItem('eidolon-use-blocks-ui', state.useBlocksUI.toString());
  
  if (state.useBlocksUI) {
    // Convert existing messages to blocks
    convertMessagesToBlocks();
    renderBlocks();
  } else {
    renderMessages();
  }
}

/**
 * Convert existing messages to blocks (for transitioning)
 */
function convertMessagesToBlocks() {
  // Clear existing blocks
  state.blocks = createInitialBlocksState();
  
  // Group user/assistant messages into chat blocks
  let currentChatBlock: ChatBlock | null = null;
  
  for (const msg of state.messages) {
    if (msg.role === 'user') {
      // Start a new chat block
      currentChatBlock = createChatBlock(msg.content);
      dispatchBlockAction({ type: 'ADD_BLOCK', block: currentChatBlock });
    } else if (msg.role === 'assistant' && currentChatBlock) {
      // Update the current chat block with the response
      dispatchBlockAction({
        type: 'UPDATE_BLOCK',
        id: currentChatBlock.id,
        updates: {
          aiResponse: msg.content,
          status: 'success',
          isStreaming: false,
          suggestedCommands: extractSuggestedCommands(msg.content)
        }
      });
      currentChatBlock = null;
    }
  }
}

function renderAttachments() {
  const container = getElement('attachments');
  
  if (state.attachments.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = state.attachments.map((att, idx) => {
    const icon = att.type === 'screenshot' ? '📸' : att.type === 'file' ? '📄' : '📋';
    const sizeInfo = att.content.length > 1000 ? ` (${formatFileSize(att.content.length)})` : '';
    return `
      <div class="attachment-chip" data-index="${idx}" title="Click to preview">
        <span class="attachment-icon">${icon}</span>
        <span class="attachment-name">${escapeHtml(att.name)}</span>
        <span class="attachment-size">${sizeInfo}</span>
        <button class="attachment-remove" data-index="${idx}">×</button>
      </div>
    `;
  }).join('');
  
  // Add preview handlers (click on chip)
  container.querySelectorAll('.attachment-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      // Don't open preview if clicking remove button
      if ((e.target as HTMLElement).classList.contains('attachment-remove')) return;
      
      const idx = parseInt((chip as HTMLElement).dataset.index || '0');
      const att = state.attachments[idx];
      if (att && att.type !== 'screenshot') {
        openFilePreview(att.name, att.content);
      } else if (att && att.type === 'screenshot') {
        // For screenshots, open in new tab
        const win = window.open();
        if (win) {
          win.document.write(`<img src="${att.content}" style="max-width: 100%;">`);
        }
      }
    });
  });
  
  // Add remove handlers
  container.querySelectorAll('.attachment-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
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
      const formatted = `URL: ${content.url}\n\n${content.text}`;
      if (shouldUseTuiInterface()) {
        await appendAttachmentToTuiPrompt(content.title || 'Page Content', formatted, 'page');
        hideActivity();
        return;
      }
      state.attachments.push({
        type: 'page-content',
        name: content.title || 'Page Content',
        content: formatted
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
    const name = `Screenshot - ${new Date().toLocaleTimeString()}`;
    
    if (shouldUseTuiInterface()) {
      await appendAttachmentToTuiPrompt(name, dataUrl, 'screenshot');
      hideActivity();
      return;
    }
    
    state.attachments.push({
      type: 'screenshot',
      name,
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

/**
 * Send a message via OpenCode server
 */
async function sendMessageViaOpenCode(content: string, attachments: any[]): Promise<void> {
  // Get the selected project directory for API calls
  const projectDir = state.opencode.selectedProjectDir || undefined;
  
  // Ensure we have a session
  if (!state.opencode.sessionId) {
    console.log('[Eidolon] Creating new OpenCode session...', projectDir ? `(project: ${projectDir})` : '');
    const session = await openCodeService.createSession(undefined, projectDir);
    state.opencode.sessionId = session.id || session.sessionID;
    console.log('[Eidolon] Created OpenCode session:', state.opencode.sessionId);
  }
  
  // Build the full prompt with any attachments
  let fullPrompt = content;
  if (attachments.length > 0) {
    fullPrompt += '\n\n--- Attached Content ---\n';
    for (const att of attachments) {
      fullPrompt += `\n[${att.file_name}]\n${att.extracted_content || att.content || ''}\n`;
    }
  }
  
  try {
    // Parse the model selection - format is "provider:modelID" from OpenCode
    // or just "modelID" from Claude.ai mode
    let providerID = 'anthropic';
    let modelID = state.currentModel || 'claude-sonnet-4-20250514';
    
    if (state.currentModel && state.currentModel.includes(':')) {
      const parts = state.currentModel.split(':');
      providerID = parts[0];
      modelID = parts.slice(1).join(':'); // Handle models with colons in name
    }
    
    // Send message to OpenCode with project directory
    const response = await openCodeService.sendMessage(
      state.opencode.sessionId!,
      fullPrompt,
      {
        providerID,
        modelID,
        directory: projectDir
      }
    );
    
    // Extract the response text from OpenCode API format
    // Response format: { info: { id, role, ... }, parts: [{ type: 'text', text: '...' }, ...] }
    let responseText = 'No response received';
    if (response) {
      // Check for the standard OpenCode response format with parts array
      const parts = response.parts || response.data?.parts;
      if (Array.isArray(parts)) {
        // Extract text from all text-type parts
        const textParts = parts
          .filter((p: any) => p.type === 'text' && p.text)
          .map((p: any) => p.text);
        
        if (textParts.length > 0) {
          responseText = textParts.join('\n');
        }
      } else if (typeof response === 'string') {
        responseText = response;
      } else if (response.content) {
        responseText = response.content;
      } else if (response.text) {
        responseText = response.text;
      } else {
        // Fallback: try to stringify for debugging
        console.log('[Eidolon] Unexpected OpenCode response format:', response);
        responseText = JSON.stringify(response, null, 2);
      }
    }
    
    console.log('[Eidolon] OpenCode response:', responseText.substring(0, 100) + '...');
    
    // Add assistant response
    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: responseText,
      timestamp: new Date()
    };
    
    state.messages.push(assistantMessage);
    renderChatArea();
    
  } catch (error) {
    console.error('[Eidolon] OpenCode send error:', error);
    
    // If session was invalid, clear it and retry once
    if (state.opencode.sessionId) {
      state.opencode.sessionId = null;
      throw new Error(`OpenCode error: ${formatOpencodeError(error)}. Please try again.`);
    }
    
    throw error;
  }
}

async function sendMessage() {
  const input = getElement<HTMLTextAreaElement>('message-input');
  const content = input.value.trim();
  
  if (shouldUseTuiInterface()) {
    showNotification('Type directly in the terminal to talk to your agent.', 'info');
    document.getElementById('terminal-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.value = '';
    return;
  }
  
  if (!content && state.attachments.length === 0) return;
  
  // Check which backend we're using
  if (state.chatBackend === 'opencode') {
    // For OpenCode, check server connection instead of Claude.ai auth
    if (!state.opencode.connected) {
      showActivity('Checking OpenCode connection...');
      await checkOpenCodeConnection();
      if (!state.opencode.connected) {
        hideActivity();
        showOpenCodeInstructions();
        return;
      }
    }
  } else {
    // For Claude.ai, check cookie-based authentication
    if (!state.isAuthenticated) {
      showActivity('Authenticating...');
      await validateSession();
      if (!state.isAuthenticated) {
        hideActivity();
        alert('Please log in to Claude.ai first, then try again.');
        return;
      }
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
  renderChatArea();
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
        renderChatArea();
        
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
    
    // Route to appropriate backend
    if (state.chatBackend === 'opencode') {
      // Use OpenCode server
      await sendMessageViaOpenCode(fullContent, apiAttachments);
    } else {
      // Use Claude.ai cookie-based API
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
      renderChatArea();
    }
    
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
    renderChatArea();
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

async function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  // Use both class and data-mode attribute for Claude compatibility
  document.body.classList.toggle('dark-mode', state.darkMode);
  document.documentElement.setAttribute('data-mode', state.darkMode ? 'dark' : 'light');
  localStorage.setItem('eidolon-dark-mode', state.darkMode.toString());
  
  // Update terminal theme if open
  if (state.terminal.instance) {
    const theme = getThemeFromCSS();
    state.terminal.instance.terminal.options.theme = theme;
  }
  
  // Sync to settings service for cross-context sync
  await settingsService.setUISettings({ darkMode: state.darkMode });
}

function getThemeFromCSS() {
  const style = getComputedStyle(document.documentElement);
  
  return {
    background: style.getPropertyValue('--bg-100').trim(),
    foreground: style.getPropertyValue('--text-100').trim(),
    cursor: style.getPropertyValue('--text-100').trim(),
    selectionBackground: style.getPropertyValue('--accent-secondary-100').trim(),
    selectionForeground: style.getPropertyValue('--text-100').trim(),
  };
}

function toggleDebugMode() {
  const toggle = getElement<HTMLInputElement>('debug-mode-toggle');
  const enabled = toggle.checked;
  
  // Save to chrome.storage.local (background script listens for changes)
  chrome.storage.local.set({ eidolon_debug_mode: enabled }, () => {
    console.log('[Eidolon] Debug mode:', enabled ? 'ON' : 'OFF');
  });
}

/**
 * Handle settings changes from other contexts (dashboard)
 * This enables bidirectional sync of settings between dashboard and sidepanel
 */
function handleSettingsChange(event: SettingsChangeEvent): void {
  console.log('[Eidolon] Settings changed:', event.type, event.newValue);
  
  switch (event.type) {
    case 'exportPlatforms':
      // Update export platform toggles in UI
      const settings = event.newValue as { claude?: boolean; chatgpt?: boolean; gemini?: boolean };
      const claudeToggle = document.getElementById('export-claude-toggle') as HTMLInputElement;
      const chatgptToggle = document.getElementById('export-chatgpt-toggle') as HTMLInputElement;
      const geminiToggle = document.getElementById('export-gemini-toggle') as HTMLInputElement;
      
      if (claudeToggle && settings.claude !== undefined) claudeToggle.checked = settings.claude;
      if (chatgptToggle && settings.chatgpt !== undefined) chatgptToggle.checked = settings.chatgpt;
      if (geminiToggle && settings.gemini !== undefined) geminiToggle.checked = settings.gemini;
      break;
      
    case 'ui':
      // Handle dark mode changes from dashboard
      const uiSettings = event.newValue as { darkMode?: boolean };
      if (uiSettings.darkMode !== undefined && uiSettings.darkMode !== state.darkMode) {
        state.darkMode = uiSettings.darkMode;
        document.body.classList.toggle('dark-mode', state.darkMode);
        document.documentElement.setAttribute('data-mode', state.darkMode ? 'dark' : 'light');
        // Update toggle if visible
        const darkModeToggle = document.getElementById('dark-mode-toggle') as HTMLInputElement;
        if (darkModeToggle) darkModeToggle.checked = state.darkMode;
      }
      break;
      
    case 'debug':
      // Handle debug mode changes
      const debugSettings = event.newValue as { enabled?: boolean };
      const debugToggle = document.getElementById('debug-mode-toggle') as HTMLInputElement;
      if (debugToggle && debugSettings.enabled !== undefined) {
        debugToggle.checked = debugSettings.enabled;
      }
      break;
      
    case 'workspace':
      // Workspace changes are handled by existing setupSyncStorageListener
      // But we can log them here for visibility
      console.log('[Eidolon] Workspace config changed via settingsService');
      break;
  }
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
 * Now includes timeout handling for reliability
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
  
  // Get timeout for this tool
  const getTimeoutForTool = (name: string, action?: string): number => {
    if (name === 'computer' && action) {
      return (TOOL_TIMEOUTS as any)[action] || TOOL_TIMEOUTS.default;
    }
    return (TOOL_TIMEOUTS as any)[name] || TOOL_TIMEOUTS.default;
  };
  
  const timeout = getTimeoutForTool(toolName, toolInput.action);
  
  try {
    // Wrap the tool execution in a timeout
    const executeWithTimeout = async (): Promise<{
      content: string | Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
      is_error?: boolean;
    }> => {
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
    };
    
    return await withTimeout(
      executeWithTimeout(),
      timeout,
      `${toolName}${toolInput.action ? `:${toolInput.action}` : ''}`
    );
    
  } catch (error: any) {
    console.error(`[Eidolon Agent] Tool execution error:`, error);
    
    // Provide helpful context for timeout errors
    if (error.message.includes('timed out')) {
      return { 
        content: `Error: ${toolName} operation timed out after ${timeout / 1000}s.\n\nSuggestion: The page may be slow to respond or an element may be unresponsive. Try:\n1. Using read_page to check current page state\n2. Waiting for the page to load (use wait action)\n3. Trying a different approach`, 
        is_error: true 
      };
    }
    
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
 * Validate ref before executing action - provides detailed error context
 */
async function validateRefBeforeAction(tabId: number, ref: string): Promise<{
  valid: boolean;
  error?: string;
  suggestion?: string;
  alternatives?: Array<{ ref: string; role: string; name: string; similarity: number }>;
}> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (refId: string) => {
        const validateRef = (window as any).__validateRef;
        const findSimilar = (window as any).__findSimilarElement;
        
        if (!validateRef) {
          return { valid: false, error: 'Validation function not available. Page may need refresh.' };
        }
        
        const validation = validateRef(refId);
        
        // If invalid and we have element info from before, try to find similar elements
        if (!validation.valid && findSimilar && validation.elementInfo) {
          const alternatives = findSimilar(
            validation.elementInfo.role,
            validation.elementInfo.name,
            3
          );
          return { ...validation, alternatives };
        }
        
        return validation;
      },
      args: [ref]
    });
    
    const result = results?.[0]?.result;
    if (!result) {
      return { valid: false, error: 'Script execution failed' };
    }
    
    return result;
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Highlight element for visual feedback before action
 */
async function highlightRef(tabId: number, ref: string, duration: number = 1000): Promise<boolean> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (refId: string, dur: number) => {
        const highlight = (window as any).__highlightRef;
        return highlight ? highlight(refId, dur) : false;
      },
      args: [ref, duration]
    });
    return results?.[0]?.result || false;
  } catch (error) {
    console.warn('[Eidolon Agent] Failed to highlight ref:', error);
    return false;
  }
}

/**
 * Build detailed error message for Claude with context and suggestions
 */
function buildRefErrorMessage(
  ref: string,
  action: string,
  validation: {
    error?: string;
    suggestion?: string;
    alternatives?: Array<{ ref: string; role: string; name: string; similarity: number }>;
  }
): string {
  let message = `Error: Could not ${action} element with ref "${ref}".`;
  
  if (validation.error) {
    message += `\n\nReason: ${validation.error}`;
  }
  
  if (validation.suggestion) {
    message += `\n\nSuggestion: ${validation.suggestion}`;
  }
  
  if (validation.alternatives && validation.alternatives.length > 0) {
    message += '\n\nPossible alternatives:';
    validation.alternatives.forEach((alt, i) => {
      message += `\n  ${i + 1}. ${alt.ref} (${alt.role}: "${alt.name}") - ${Math.round(alt.similarity * 100)}% match`;
    });
    message += '\n\nConsider using read_page to get fresh element references, or try one of the alternatives above.';
  }
  
  return message;
}

/**
 * Timeout utility - wraps a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Tool-specific timeout settings (in milliseconds)
const TOOL_TIMEOUTS = {
  screenshot: 10000,      // 10s - screenshots can be slow
  click: 5000,            // 5s
  type: 5000,             // 5s
  focus: 3000,            // 3s
  scroll: 3000,           // 3s
  key: 3000,              // 3s
  navigate: 30000,        // 30s - navigation can be slow
  wait: 65000,            // 65s - max wait is 60s + buffer
  read_page: 15000,       // 15s - building tree can be slow
  tabs_context: 5000,     // 5s
  tabs_create: 10000,     // 10s
  get_page_text: 10000,   // 10s
  default: 15000          // 15s default
};

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
  
  // Validate ref before actions that require it
  const validateRefForAction = async (actionName: string): Promise<{ valid: boolean; errorResponse?: { content: string; is_error: boolean } }> => {
    if (!ref) return { valid: true }; // No ref to validate
    
    const validation = await validateRefBeforeAction(tabId, ref);
    if (!validation.valid) {
      return {
        valid: false,
        errorResponse: {
          content: buildRefErrorMessage(ref, actionName, validation),
          is_error: true
        }
      };
    }
    
    // Optionally highlight the element before action (can be configured)
    // await highlightRef(tabId, ref, 500);
    
    return { valid: true };
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
        // Validate ref first
        const refValidation = await validateRefForAction('click');
        if (!refValidation.valid && refValidation.errorResponse) {
          return refValidation.errorResponse;
        }
        
        // For left_click, use direct DOM click (more reliable)
        if (action === 'left_click') {
          const result = await clickElementByRef(tabId, ref);
          if (!result.success) {
            // If click failed, try to provide helpful context
            const validation = await validateRefBeforeAction(tabId, ref);
            return { 
              content: buildRefErrorMessage(ref, 'click', {
                error: result.error,
                suggestion: validation.suggestion,
                alternatives: validation.alternatives
              }), 
              is_error: true 
            };
          }
          return successWithScreenshot(`Clicked ${ref}`);
        }
        // For other click types, resolve to coordinates and use CDP
        const coords = await resolveRefToCoordinates(tabId, ref);
        if (!coords) {
          const validation = await validateRefBeforeAction(tabId, ref);
          return { 
            content: buildRefErrorMessage(ref, 'click', validation), 
            is_error: true 
          };
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
      
      // Validate ref first
      const refValidation = await validateRefForAction('focus');
      if (!refValidation.valid && refValidation.errorResponse) {
        return refValidation.errorResponse;
      }
      
      const result = await focusElementByRef(tabId, ref);
      if (!result.success) {
        const validation = await validateRefBeforeAction(tabId, ref);
        return { 
          content: buildRefErrorMessage(ref, 'focus', {
            error: result.error,
            suggestion: validation.suggestion,
            alternatives: validation.alternatives
          }), 
          is_error: true 
        };
      }
      return successWithScreenshot(`Focused ${ref}`);
    }
    
    case 'type': {
      if (!input.text) {
        return { content: 'Error: text is required for type action', is_error: true };
      }
      
      // If ref is provided, focus/set value on that element first
      if (ref) {
        // Validate ref first
        const refValidation = await validateRefForAction('type');
        if (!refValidation.valid && refValidation.errorResponse) {
          return refValidation.errorResponse;
        }
        
        // Try to set value directly (works for input/textarea)
        const setResult = await setValueByRef(tabId, ref, input.text);
        if (setResult.success) {
          return successWithScreenshot(`Typed "${input.text}" into ${ref}`);
        }
        // Fall back to focus + type via CDP
        const focusResult = await focusElementByRef(tabId, ref);
        if (!focusResult.success) {
          const validation = await validateRefBeforeAction(tabId, ref);
          return { 
            content: buildRefErrorMessage(ref, 'type (focus failed)', {
              error: focusResult.error,
              suggestion: validation.suggestion,
              alternatives: validation.alternatives
            }), 
            is_error: true 
          };
        }
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
 * Groups models by provider when using OpenCode backend
 */
function renderModelMenu() {
  const modelMenuItems = document.getElementById('model-menu-items');
  if (!modelMenuItems) return;
  
  // Check if we have multiple providers (OpenCode mode)
  const providers = [...new Set(AVAILABLE_MODELS.map(m => m.provider).filter(Boolean))];
  const hasMultipleProviders = providers.length > 1;
  
  let html = '';
  
  if (hasMultipleProviders) {
    // Group by provider
    const byProvider = new Map<string, ModelInfo[]>();
    
    for (const model of AVAILABLE_MODELS) {
      const key = model.provider || 'other';
      if (!byProvider.has(key)) {
        byProvider.set(key, []);
      }
      byProvider.get(key)!.push(model);
    }
    
    // Render each provider group
    for (const [providerId, models] of byProvider) {
      const providerName = models[0]?.providerName || providerId;
      html += `<div class="model-provider-group">`;
      html += `<div class="model-provider-header">${escapeHtml(providerName)}</div>`;
      
      for (const model of models) {
        html += `
          <button class="claude-menu-item model-item ${model.id === state.currentModel ? 'selected' : ''}" data-model="${model.id}">
            <svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M2 7l4 4 6-8"/>
            </svg>
            <span>${escapeHtml(model.name)}</span>
          </button>
        `;
      }
      html += `</div>`;
    }
  } else {
    // Simple list (Claude.ai mode or single provider)
    html = AVAILABLE_MODELS.map(model => `
      <button class="claude-menu-item model-item ${model.id === state.currentModel ? 'selected' : ''}" data-model="${model.id}">
        <svg class="check-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M2 7l4 4 6-8"/>
        </svg>
        <span>${escapeHtml(model.name)}</span>
      </button>
    `).join('');
  }
  
  modelMenuItems.innerHTML = html;
  
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
      // Extract the model part (handle provider:model format)
      const modelPart = state.currentModel.includes(':') 
        ? state.currentModel.split(':').slice(1).join(':')
        : state.currentModel;
      
      // Extract model family name (e.g., "claude-sonnet-4-..." -> "Sonnet 4")
      if (modelPart.includes('sonnet')) {
        displayName = 'Sonnet';
      } else if (modelPart.includes('opus')) {
        displayName = 'Opus';
      } else if (modelPart.includes('haiku')) {
        displayName = 'Haiku';
      } else if (modelPart.includes('gpt-4o')) {
        displayName = 'GPT-4o';
      } else if (modelPart.includes('gpt-4')) {
        displayName = 'GPT-4';
      } else if (modelPart.includes('gemini')) {
        displayName = 'Gemini';
      } else {
        // Use the model name directly, but shorten if too long
        displayName = modelPart.length > 20 ? modelPart.substring(0, 17) + '...' : modelPart;
      }
    }
    modelNameSpan.textContent = displayName || 'Default';
  }
}

function startNewChat() {
  state.currentConversationId = null;
  state.conversationModel = null; // Reset so next message sets it fresh
  state.messages = [];
  
  // Also clear blocks if in blocks mode
  if (state.useBlocksUI) {
    state.blocks = createInitialBlocksState();
  }
  
  renderChatArea();
  
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

// ========================================================================
// SYNC FUNCTIONS
// ========================================================================

// ========================================================================
// OPENCODE CONNECTION
// ========================================================================

/**
 * Check if OpenCode server is running and update state
 */
async function checkOpenCodeConnection(): Promise<void> {
  state.opencode.checking = true;
  
  try {
    // Get saved server URL
    const serverUrl = await getServerUrl();
    state.opencode.serverUrl = serverUrl;
    
    // Check connection
    const status = await getConnectionStatus();
    
    state.opencode.connected = status.connected;
    state.opencode.error = status.error || null;
    
    if (status.connected) {
      console.log('[Eidolon] OpenCode server connected:', status.info);
      // Load projects after successful connection
      await loadOpenCodeProjects();
    } else {
      console.log('[Eidolon] OpenCode server not available:', status.error);
    }
  } catch (error) {
    state.opencode.connected = false;
    state.opencode.error = formatOpencodeError(error);
  } finally {
    state.opencode.checking = false;
  }
  
  updateOpenCodeStatusUI();
}

function shouldUseTuiInterface(): boolean {
  return state.chatBackend === 'opencode' && state.opencode.connected;
}

function updateTuiMode(): void {
  const enableTui = shouldUseTuiInterface();
  const body = document.body;
  const wasEnabled = body.classList.contains('tui-mode');
  
  // Toggle TUI mode class - this shows/hides TUI-only buttons
  body.classList.toggle('tui-mode', enableTui);
  
  // Update hint text
  const hint = document.querySelector('.input-hints .hint') as HTMLElement | null;
  if (hint && !hint.dataset.defaultHint) {
    hint.dataset.defaultHint = hint.textContent || '';
  }
  if (hint) {
    hint.textContent = enableTui
      ? 'Use terminal toggle to open terminal. TUI buttons available.'
      : (hint.dataset.defaultHint || '');
  }
  
  // Re-render conversation list when TUI mode changes
  if (enableTui !== wasEnabled) {
    renderConversationList();
  }
}

const TUI_FILE_CHAR_LIMIT = 15000;

function isTuiModeActive(): boolean {
  return shouldUseTuiInterface() && document.body.classList.contains('tui-mode');
}

async function performTuiAction(description: string, action: () => Promise<void>): Promise<boolean> {
  if (!shouldUseTuiInterface()) {
    showNotification('Connect to OpenCode to use terminal actions.', 'info');
    return false;
  }
  try {
    await action();
    return true;
  } catch (error) {
    console.error(`[Eidolon] Failed to ${description}:`, error);
    showNotification(`Failed to ${description}`, 'error');
    return false;
  }
}

async function appendTextToTuiPrompt(text: string, toastMessage?: string): Promise<boolean> {
  const success = await performTuiAction('add content to the terminal', () => openCodeService.appendPrompt(text));
  if (success && toastMessage) {
    showNotification(toastMessage, 'success');
  }
  return success;
}

async function appendAttachmentToTuiPrompt(name: string, content: string, type: 'file' | 'screenshot' | 'page'): Promise<boolean> {
  if (!shouldUseTuiInterface()) {
    return false;
  }
  try {
    let payload = '';
    let wasTruncated = false;
    const originalLength = content.length;
    
    if (type === 'screenshot') {
      payload = `\n![${name}](${content})\n`;
    } else {
      let snippet = content;
      if (snippet.length > TUI_FILE_CHAR_LIMIT) {
        wasTruncated = true;
        snippet = `${snippet.slice(0, TUI_FILE_CHAR_LIMIT)}\n... [${snippet.length - TUI_FILE_CHAR_LIMIT} more characters truncated]`;
      }
      payload = `\n# ${name}\n\`\`\`\n${snippet}\n\`\`\`\n`;
    }
    await openCodeService.appendPrompt(payload);

    // Show more informative notification for large files
    if (wasTruncated) {
      const truncatedKB = Math.round((originalLength - TUI_FILE_CHAR_LIMIT) / 1024);
      const addedKB = Math.round(TUI_FILE_CHAR_LIMIT / 1024);
      showNotification(`${name} added (${addedKB}KB of ${Math.round(originalLength / 1024)}KB, ${truncatedKB}KB truncated)`, 'info');
    } else {
      const sizeKB = Math.round(originalLength / 1024);
      const sizeStr = sizeKB > 0 ? ` (${sizeKB}KB)` : '';
      showNotification(`${name}${sizeStr} added to terminal input`, 'success');
    }
    return true;
  } catch (error) {
    console.error('[Eidolon] Failed to append attachment to TUI:', error);
    showNotification(`Failed to add ${name} to terminal`, 'error');
    return false;
  }
}

/**
 * Update UI to reflect OpenCode connection status
 */
function updateOpenCodeStatusUI(): void {
  // Update the chat backend indicator if it exists
  const backendIndicator = document.getElementById('chat-backend-indicator');
  if (backendIndicator) {
    if (state.chatBackend === 'opencode') {
      if (state.opencode.connected) {
        backendIndicator.className = 'backend-indicator connected';
        backendIndicator.title = `Connected to OpenCode at ${state.opencode.serverUrl}`;
        backendIndicator.innerHTML = '<span class="backend-dot"></span> OpenCode';
      } else {
        backendIndicator.className = 'backend-indicator disconnected';
        backendIndicator.title = state.opencode.error || 'OpenCode server not running';
        backendIndicator.innerHTML = '<span class="backend-dot"></span> OpenCode (offline)';
      }
    } else {
      backendIndicator.className = 'backend-indicator claude';
      backendIndicator.title = 'Using Claude.ai session';
      backendIndicator.innerHTML = '<span class="backend-dot"></span> Claude.ai';
    }
  }
  
  // Update OAuth section to show OpenCode status
  const openCodeStatus = document.getElementById('opencode-connection-status');
  if (openCodeStatus) {
    if (state.opencode.checking) {
      openCodeStatus.innerHTML = '<span class="status-checking">Checking...</span>';
    } else if (state.opencode.connected) {
      openCodeStatus.innerHTML = `
        <span class="status-connected">Connected</span>
        <span class="status-url">${state.opencode.serverUrl}</span>
      `;
    } else {
      openCodeStatus.innerHTML = `
        <span class="status-disconnected">Not running</span>
        <button class="start-opencode-btn" id="start-opencode-help-btn">How to start</button>
      `;
      // Add event listener (can't use inline onclick due to CSP)
      const helpBtn = openCodeStatus.querySelector('#start-opencode-help-btn');
      helpBtn?.addEventListener('click', showOpenCodeInstructions);
    }
  }
  
  // Update project selector visibility
  updateProjectSelectorUI();
  updateTuiMode();
}


// ========================================================================
// OPENCODE PROJECT SELECTOR
// ========================================================================

/**
 * Update project selector UI visibility and state
 */
function updateProjectSelectorUI(): void {
  const projectSelector = document.getElementById('opencode-project-selector');
  
  if (!projectSelector) return;
  
  // Show project selector only when OpenCode backend is active and connected
  if (state.chatBackend === 'opencode' && state.opencode.connected) {
    projectSelector.classList.remove('hidden');
    
    // Update project name display
    const projectNameEl = document.getElementById('opencode-project-name');
    if (projectNameEl) {
      projectNameEl.textContent = state.opencode.currentProjectName || 'No Project';
    }
  } else {
    projectSelector.classList.add('hidden');
  }
}

/**
 * Load OpenCode projects from server
 */
async function loadOpenCodeProjects(): Promise<void> {
  const projectList = document.getElementById('opencode-project-list');
  
  if (!state.opencode.connected) {
    if (projectList) {
      projectList.innerHTML = `
        <div class="project-menu-disconnected">
          <p>OpenCode server not connected</p>
          <button onclick="checkOpenCodeConnection()">Reconnect</button>
        </div>
      `;
    }
    return;
  }
  
  try {
    // Fetch projects from server
    const projects = await openCodeService.listProjects();
    state.opencode.projects = projects;
    
    // Load saved project directory preference
    const savedDir = await openCodeService.getSelectedProjectDir();
    if (savedDir) {
      const matchingProject = projects.find(p => p.path === savedDir);
      if (matchingProject) {
        state.opencode.selectedProjectDir = savedDir;
        state.opencode.currentProjectName = matchingProject.name;
      }
    }
    
    // If no saved project but we have projects, get current project from server
    if (!state.opencode.selectedProjectDir && projects.length > 0) {
      const currentProject = await openCodeService.getCurrentProject();
      if (currentProject) {
        state.opencode.selectedProjectDir = currentProject.path;
        state.opencode.currentProjectName = currentProject.name;
      }
    }
    
    renderProjectList();
    updateProjectSelectorUI();
    
  } catch (error) {
    console.error('[Eidolon] Failed to load OpenCode projects:', error);
    if (projectList) {
      projectList.innerHTML = `
        <div class="project-menu-empty">Failed to load projects</div>
      `;
    }
  }
}

/**
 * Render the project list in the dropdown
 */
function renderProjectList(): void {
  const projectList = document.getElementById('opencode-project-list');
  if (!projectList) return;
  
  const projects = state.opencode.projects;
  
  // Always show "Add Project" option at top
  let html = `
    <div class="project-menu-item add-project" data-action="add">
      <div class="project-item-icon add-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 3v10M3 8h10"/>
        </svg>
      </div>
      <div class="project-item-info">
        <div class="project-item-name">Add Project</div>
        <div class="project-item-path">Open a local folder</div>
      </div>
    </div>
  `;
  
  if (projects.length === 0) {
    html += `
      <div class="project-menu-divider"></div>
      <div class="project-menu-empty">
        No recent projects.<br>
        <small style="color: var(--text-400);">Add a project folder to get started.</small>
      </div>
    `;
  } else {
    html += `<div class="project-menu-divider"></div>`;
    html += projects.map(project => {
      const isSelected = project.path === state.opencode.selectedProjectDir;
      const shortPath = project.path.replace(/^\/home\/[^/]+/, '~');
      
      return `
        <div class="project-menu-item ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(project.path)}">
          <div class="project-item-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 5A1.5 1.5 0 0 1 3.5 3.5h2l1.5 1.5h5A1.5 1.5 0 0 1 13.5 6.5v5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V5z"/>
            </svg>
          </div>
          <div class="project-item-info">
            <div class="project-item-name">${escapeHtml(project.name)}</div>
            <div class="project-item-path">${escapeHtml(shortPath)}</div>
          </div>
          ${isSelected ? '<svg class="project-check" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2 7l4 4 6-8"/></svg>' : ''}
        </div>
      `;
    }).join('');
  }
  
  projectList.innerHTML = html;
  
  // Add click handlers
  projectList.querySelectorAll('.project-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.getAttribute('data-action');
      if (action === 'add') {
        toggleProjectDropdown(false);
        showAddProjectModal();
        return;
      }
      
      const path = item.getAttribute('data-path');
      if (path) {
        await selectOpenCodeProject(path);
      }
    });
  });
}

/**
 * Show modal to add a new project
 */
function showAddProjectModal(): void {
  // Get saved root folder from settings
  const rootFolder = localStorage.getItem('eidolon-projects-root') || '~/github';
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'add-project-title');
  modal.innerHTML = `
    <div class="modal-content add-project-modal">
      <div class="modal-header">
        <h3 id="add-project-title">Add Project</h3>
        <button class="close-btn" id="add-project-close" aria-label="Close dialog">✕</button>
      </div>
      <div class="modal-body">
        <p>Enter the full path to your project folder:</p>
        
        <div class="input-group">
          <label for="project-path-input">Project Path</label>
          <input type="text" id="project-path-input" class="form-input" 
                 placeholder="${rootFolder}/my-project" 
                 value="${rootFolder}/">
          <small class="input-hint">e.g., ~/github/my-app, C:\\Users\\name\\projects, or /home/user/projects</small>
        </div>
        
        <div class="quick-paths">
          <span class="quick-paths-label">Quick paths:</span>
          <button class="quick-path-btn" data-path="~/github/">~/github/</button>
          <button class="quick-path-btn" data-path="~/projects/">~/projects/</button>
          <button class="quick-path-btn" data-path="~/">~/</button>
        </div>
        
        <div class="modal-actions">
          <button class="btn-secondary" id="add-project-cancel">Cancel</button>
          <button class="btn-primary" id="add-project-submit">Add Project</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Create focus trap
  const focusTrap = createFocusTrap(modal);
  focusTrap.activate();
  
  // Focus input
  const input = modal.querySelector('#project-path-input') as HTMLInputElement;
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
  
  function closeModal() {
    focusTrap.deactivate();
    modal.remove();
  }
  
  // Close button handler
  const closeBtn = modal.querySelector('#add-project-close');
  closeBtn?.addEventListener('click', closeModal);
  
  // Cancel button handler
  const cancelBtn = modal.querySelector('#add-project-cancel');
  cancelBtn?.addEventListener('click', closeModal);
  
  // Quick path buttons
  modal.querySelectorAll('.quick-path-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.getAttribute('data-path') || '';
      if (input) {
        input.value = path;
        input.focus();
        input.setSelectionRange(path.length, path.length);
      }
    });
  });
  
  // Submit handler
  const submitBtn = modal.querySelector('#add-project-submit');
  submitBtn?.addEventListener('click', async () => {
    const path = input?.value?.trim();
    if (!path) {
      showNotification('Please enter a project path', 'error');
      return;
    }
    
    closeModal();
    await addNewProject(path);
  });
  
  // Enter key submits
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitBtn?.dispatchEvent(new Event('click'));
    }
  });
  
  // Escape key closes
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });
  
  // Click outside closes
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/**
 * Add a new project by path
 */
async function addNewProject(projectPath: string): Promise<void> {
  try {
    showNotification('Adding project...', 'info');
    
    // The OpenCode server will automatically add the project when we use it
    // For now, we just select it which will trigger the server to recognize it
    
    // Expand ~ to actual home path for display
    const displayPath = projectPath;
    const projectName = projectPath.split('/').filter(Boolean).pop() || 'New Project';
    
    // Add to local projects list
    const newProject: OpenCodeProject = {
      path: projectPath,
      name: projectName,
    };
    
    // Check if already exists
    if (!state.opencode.projects.find(p => p.path === projectPath)) {
      state.opencode.projects.unshift(newProject);
    }
    
    // Select the new project
    await selectOpenCodeProject(projectPath);
    
    showNotification(`Added project: ${projectName}`);
  } catch (error) {
    console.error('[Eidolon] Failed to add project:', error);
    showNotification('Failed to add project. Check the path exists.', 'error');
  }
}

/**
 * Select an OpenCode project
 */
async function selectOpenCodeProject(projectPath: string): Promise<void> {
  const project = state.opencode.projects.find(p => p.path === projectPath);
  if (!project) return;
  
  state.opencode.selectedProjectDir = projectPath;
  state.opencode.currentProjectName = project.name;
  
  // Save preference
  await openCodeService.setSelectedProjectDir(projectPath);
  
  // Close dropdown
  toggleProjectDropdown(false);
  
  // Update UI
  updateProjectSelectorUI();
  renderProjectList();
  
  // Change terminal directory if terminal is open
  if (state.terminal.instance && state.terminal.isOpen) {
    const changed = changeDirectory(state.terminal.instance.id, projectPath);
    if (changed) {
      console.log('[Eidolon] Changed terminal directory to:', projectPath);
    }
  }
  
  // Clear current session when switching projects (forces new session in new project context)
  state.opencode.sessionId = null;
  state.currentConversationId = null;
  
  console.log('[Eidolon] Selected OpenCode project:', project.name, 'at', projectPath);
  showNotification(`Switched to ${project.name}`);
}

/**
 * Toggle project dropdown visibility
 */
function toggleProjectDropdown(show?: boolean): void {
  const selector = document.getElementById('opencode-project-selector');
  const menu = document.getElementById('opencode-project-menu');
  
  if (!selector || !menu) return;
  
  const shouldShow = show ?? menu.classList.contains('hidden');
  
  if (shouldShow) {
    selector.classList.add('open');
    menu.classList.remove('hidden');
    // Refresh projects when opening
    loadOpenCodeProjects();
  } else {
    selector.classList.remove('open');
    menu.classList.add('hidden');
  }
}

/**
 * Setup project selector event listeners
 */
function setupProjectSelectorListeners(): void {
  const projectBtn = document.getElementById('opencode-project-btn');
  const refreshBtn = document.getElementById('opencode-project-refresh');
  
  projectBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleProjectDropdown();
  });
  
  refreshBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    refreshBtn.classList.add('loading');
    await loadOpenCodeProjects();
    refreshBtn.classList.remove('loading');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const selector = document.getElementById('opencode-project-selector');
    if (selector && !selector.contains(e.target as Node)) {
      toggleProjectDropdown(false);
    }
  });
}

/**
 * Show instructions for starting OpenCode server
 */
function showOpenCodeInstructions(): void {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'opencode-instructions-title');
  modal.innerHTML = `
    <div class="modal-content opencode-instructions-modal">
      <div class="modal-header">
        <h3 id="opencode-instructions-title">Start OpenCode Server</h3>
        <button class="close-btn" id="opencode-instructions-close" aria-label="Close dialog">✕</button>
      </div>
      <div class="modal-body">
        <p>OpenCode provides a self-hosted AI coding assistant. Run one of these commands:</p>
        
        <div class="code-option">
          <strong>Web UI + API</strong> (recommended)
          <pre class="code-block">opencode web --port=4096</pre>
          <p class="hint">Opens a web UI at <a href="http://localhost:4096" target="_blank">localhost:4096</a> and provides the API for Eidolon.</p>
        </div>
        
        <div class="code-option">
          <strong>API Only</strong>
          <pre class="code-block">opencode serve --port=4096</pre>
          <p class="hint">Headless server - use Eidolon sidebar as your chat interface.</p>
        </div>
        
        <div class="setup-note">
          <strong>First time setup:</strong>
          <pre class="code-block">curl -fsSL https://opencode.ai/install | bash
opencode auth login</pre>
          <p class="hint">Configure your API keys (Anthropic, OpenAI, etc.) via the auth command.</p>
        </div>
        
        <div class="modal-actions">
          <button class="action-btn" id="opencode-check-connection-btn">
            Check Connection
          </button>
          <a href="https://opencode.ai/docs/" target="_blank" class="docs-link">View Docs</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Create focus trap
  const focusTrap = createFocusTrap(modal);
  focusTrap.activate();
  
  function closeModal() {
    focusTrap.deactivate();
    modal.remove();
  }
  
  // Close button handler
  const closeBtn = modal.querySelector('#opencode-instructions-close');
  closeBtn?.addEventListener('click', closeModal);
  
  // Check connection button handler
  const checkBtn = modal.querySelector('#opencode-check-connection-btn');
  checkBtn?.addEventListener('click', async () => {
    await checkOpenCodeConnection();
    closeModal();
  });
  
  // Click outside closes
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Escape key closes
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });
}

/**
 * Switch chat backend between Claude.ai cookie auth and OpenCode
 */
async function switchChatBackend(backend: ChatBackend): Promise<void> {
  state.chatBackend = backend;
  localStorage.setItem('eidolon-chat-backend', backend);
  
  if (backend === 'opencode') {
    // Check connection when switching to OpenCode
    await checkOpenCodeConnection();
    
    if (!state.opencode.connected) {
      showOpenCodeInstructions();
    }
  }
  
  updateOpenCodeStatusUI();
  
  // Reload models for the new backend
  // OpenCode has multi-provider models, Claude.ai only has Anthropic
  await loadAvailableModels();
  
  // Clear current conversation when switching backends
  state.currentConversationId = null;
  state.opencode.sessionId = null;
  state.messages = [];
  renderChatArea();
}

// Make functions available globally for onclick handlers
(window as any).showOpenCodeInstructions = showOpenCodeInstructions;
(window as any).checkOpenCodeConnection = checkOpenCodeConnection;
(window as any).switchChatBackend = switchChatBackend;

// ========================================================================
// TERMINAL PANEL
// ========================================================================

function interruptTerminalSession(sourceBtn?: HTMLElement): void {
  if (!state.terminal.instance || !state.terminal.instance.websocket) {
    showNotification('Terminal is not connected yet.', 'warning');
    return;
  }
  if (state.terminal.instance.websocket.readyState !== WebSocket.OPEN) {
    showNotification('Terminal connection is unavailable.', 'warning');
    return;
  }
  try {
    state.terminal.instance.websocket.send('\x03');
    if (sourceBtn) {
      sourceBtn.classList.add('pulsing');
      setTimeout(() => sourceBtn.classList.remove('pulsing'), 350);
    }
    focusTerminal(state.terminal.instance.id);
  } catch (error) {
    console.error('[Eidolon] Failed to send interrupt:', error);
    showNotification('Failed to send interrupt signal.', 'error');
  }
}

/**
 * Toggle terminal panel visibility
 */
async function toggleTerminal(): Promise<void> {
  if (state.terminal.isOpen) {
    closeTerminal();
  } else {
    await openTerminal();
  }
}

/**
 * Open terminal panel
 */
async function openTerminal(): Promise<void> {
  const terminalPanel = document.getElementById('terminal-panel');
  const terminalToggleBtn = document.getElementById('terminal-toggle-btn');
  
  if (!terminalPanel) return;
  
  state.terminal.isOpen = true;
  terminalPanel.classList.remove('hidden');
  terminalToggleBtn?.classList.add('active');
  document.body.classList.add('terminal-open');
  
  // Set panel height
  terminalPanel.style.height = `${state.terminal.height}px`;
  
  // Initialize terminal if not already done
  if (!state.terminal.instance) {
    await initTerminal();
  } else {
    // Just focus and fit existing terminal
    focusTerminal(state.terminal.instance.id);
    fitTerminal(state.terminal.instance.id);
  }
}

/**
 * Close terminal panel
 */
function closeTerminal(): void {
  const terminalPanel = document.getElementById('terminal-panel');
  const terminalToggleBtn = document.getElementById('terminal-toggle-btn');
  
  state.terminal.isOpen = false;
  terminalPanel?.classList.add('hidden');
  terminalToggleBtn?.classList.remove('active');
  document.body.classList.remove('terminal-open');
}

/**
 * Initialize terminal with OpenCode PTY
 */
async function initTerminal(): Promise<void> {
  const terminalContainer = document.getElementById('terminal-container');
  const terminalPlaceholder = document.getElementById('terminal-placeholder');
  const terminalStatus = document.getElementById('terminal-status');
  
  if (!terminalContainer) return;
  
  // Check OpenCode connection first
  if (!state.opencode.connected) {
    await checkOpenCodeConnection();
  }
  
  if (!state.opencode.connected) {
    // Show placeholder with instructions
    if (terminalPlaceholder) {
      terminalPlaceholder.style.display = 'flex';
      terminalPlaceholder.innerHTML = `
        <div class="terminal-unavailable-message">
          <h4>OpenCode Server Required</h4>
          <p>Start the OpenCode server to use the terminal:</p>
          <code>opencode web --port=4096</code>
        </div>
      `;
    }
    return;
  }
  
  // Hide placeholder
  if (terminalPlaceholder) {
    terminalPlaceholder.style.display = 'none';
  }
  
  // Update status
  if (terminalStatus) {
    terminalStatus.textContent = 'Connecting...';
    terminalStatus.className = 'terminal-status';
  }
  
  try {
    // Create terminal instance
    const instance = await createTerminal(
      terminalContainer,
      {
        fontSize: 14,
        theme: getThemeFromCSS()
      },
      {
        onConnect: () => {
          console.log('[Eidolon] Terminal connected');
          if (terminalStatus) {
            terminalStatus.textContent = 'Connected';
            terminalStatus.className = 'terminal-status connected';
          }
          
          // CD to selected project directory after connection
          if (state.opencode.selectedProjectDir && state.terminal.instance) {
            // Small delay to ensure PTY is ready
            setTimeout(() => {
              if (state.terminal.instance) {
                changeDirectory(state.terminal.instance.id, state.opencode.selectedProjectDir!);
              }
            }, 100);
          }
        },
        onDisconnect: () => {
          console.log('[Eidolon] Terminal disconnected');
          if (terminalStatus) {
            terminalStatus.textContent = 'Disconnected';
            terminalStatus.className = 'terminal-status disconnected';
          }
        },
        onError: (error) => {
          console.error('[Eidolon] Terminal error:', error);
          if (terminalStatus) {
            terminalStatus.textContent = 'Error';
            terminalStatus.className = 'terminal-status disconnected';
          }
        }
      }
    );
    
    state.terminal.instance = instance;
    
  } catch (error) {
    console.error('[Eidolon] Failed to initialize terminal:', error);
    
    if (terminalPlaceholder) {
      terminalPlaceholder.style.display = 'flex';
      terminalPlaceholder.innerHTML = `
        <div class="terminal-unavailable-message">
          <h4>Failed to Connect</h4>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
          <button class="action-btn" id="terminal-retry-btn">Retry</button>
        </div>
      `;
      // Add event listener for retry button (can't use inline onclick due to CSP)
      const retryBtn = document.getElementById('terminal-retry-btn');
      retryBtn?.addEventListener('click', initTerminal);
    }
    
    if (terminalStatus) {
      terminalStatus.textContent = 'Error';
      terminalStatus.className = 'terminal-status disconnected';
    }
  }
}

/**
 * Setup terminal panel resize functionality
 */
function setupTerminalResize(handle: HTMLElement): void {
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = state.terminal.height;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const delta = startY - e.clientY;
    const newHeight = Math.min(Math.max(startHeight + delta, 150), window.innerHeight * 0.7);
    
    state.terminal.height = newHeight;
    
    const terminalPanel = document.getElementById('terminal-panel');
    if (terminalPanel) {
      terminalPanel.style.height = `${newHeight}px`;
    }
    
    // Refit terminal to new size
    if (state.terminal.instance) {
      fitTerminal(state.terminal.instance.id);
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Make terminal functions available globally
(window as any).toggleTerminal = toggleTerminal;
(window as any).initTerminal = initTerminal;

// ========================================================================
// SYNC STATE MANAGEMENT
// ========================================================================

/**
 * Initialize sync state from storage
 */
async function initSyncState() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-sync-config' });
    if (response?.success && response.data) {
      const config = response.data;
      state.sync.workspacePath = config.workspacePath || null;
      state.sync.lastSync = config.lastSync || null;
      state.sync.settings = {
        ...DEFAULT_SYNC_SETTINGS,
        ...(config.settings || {})
      };
      
      // Determine status
      if (!config.workspacePath) {
        state.sync.status = 'not-configured';
      } else {
        state.sync.status = 'synced';
      }
      
      // Get stats if configured
      if (config.workspacePath) {
        await loadSyncStats();
      }
    }
  } catch (error) {
    console.warn('[Eidolon] Failed to load sync config:', error);
  }
  
  // Try to restore handle from IndexedDB and verify permissions
  await tryRestoreWorkspaceHandle();
  
  updateSyncStatusBar();
  updateSyncPanel();
  
  // Listen for storage changes (e.g., when dashboard updates config)
  setupSyncStorageListener();
}

/**
 * Listen for storage changes to sync state between dashboard and sidepanel
 */
function setupSyncStorageListener() {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.workspaceConfig) {
      const newConfig = changes.workspaceConfig.newValue;
      const oldConfig = changes.workspaceConfig.oldValue;
      
      // Check if workspacePath changed
      if (newConfig?.workspacePath !== oldConfig?.workspacePath) {
        console.log('[Eidolon] Workspace config changed externally:', newConfig?.workspacePath);
        state.sync.workspacePath = newConfig?.workspacePath || null;
        state.sync.status = newConfig?.workspacePath ? 'synced' : 'not-configured';
        updateSyncStatusBar();
        updateSyncPanel();
      }
      
      // Check if settings changed
      if (newConfig?.settings) {
        state.sync.settings = {
          ...state.sync.settings,
          ...DEFAULT_SYNC_SETTINGS,
          ...newConfig.settings
        };
        updateSyncPanel();
      }
      
      // Check if lastSync changed
      if (newConfig?.lastSync !== oldConfig?.lastSync) {
        state.sync.lastSync = newConfig?.lastSync || null;
        updateSyncStatusBar();
        updateSyncPanel();
      }
    }
  });
}

/**
 * Try to restore workspace handle from IndexedDB and verify permissions
 */
async function tryRestoreWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await getWorkspaceHandleFromIDB();
    if (!handle) {
      console.log('[Eidolon] No stored workspace handle found');
      state.sync.needsPermission = false;
      return null;
    }
    
    // Verify we still have permissions (will be 'prompt' if permission was revoked)
    const permission = await (handle as any).queryPermission({ mode: 'readwrite' });
    
    if (permission === 'granted') {
      console.log('[Eidolon] Workspace handle restored with permissions');
      state.sync.needsPermission = false;
      return handle;
    } else if (permission === 'prompt') {
      // User will need to re-grant permission - we can't request it without user gesture
      console.log('[Eidolon] Workspace handle found but needs permission re-grant');
      state.sync.needsPermission = true;
      state.sync.status = state.sync.workspacePath ? 'pending' : 'not-configured';
      return handle; // Return handle anyway, permission can be requested on sync
    } else {
      console.log('[Eidolon] Workspace handle permission denied');
      state.sync.needsPermission = false;
      return null;
    }
  } catch (error) {
    console.warn('[Eidolon] Failed to restore workspace handle:', error);
    state.sync.needsPermission = false;
    return null;
  }
}

/**
 * Get workspace handle from IndexedDB
 */
async function getWorkspaceHandleFromIDB(): Promise<FileSystemDirectoryHandle | null> {
  const DB_NAME = 'EidolonHandles';
  const DB_VERSION = 1;
  const STORE_NAME = 'handles';
  const WORKSPACE_HANDLE_KEY = 'workspaceHandle';
  
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.warn('[Eidolon] Failed to open IndexedDB:', request.error);
      resolve(null);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(WORKSPACE_HANDLE_KEY);
        
        getRequest.onsuccess = () => {
          db.close();
          resolve(getRequest.result || null);
        };
        
        getRequest.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch (error) {
        db.close();
        resolve(null);
      }
    };
  });
}

/**
 * Request permission for stored handle (must be called from user gesture)
 */
async function requestWorkspacePermission(): Promise<boolean> {
  try {
    const handle = await getWorkspaceHandleFromIDB();
    if (!handle) {
      return false;
    }
    
    const permission = await (handle as any).requestPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      state.sync.status = 'synced';
      updateSyncStatusBar();
      updateSyncPanel();
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Eidolon] Failed to request permission:', error);
    return false;
  }
}

/**
 * Load sync statistics
 */
async function loadSyncStats() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'get-sync-stats' });
    if (response?.success && response.data) {
      state.sync.projectCount = response.data.projects || 0;
      state.sync.fileCount = response.data.files || 0;
      state.sync.chatCount = response.data.chats || 0;
    }
  } catch (error) {
    console.warn('[Eidolon] Failed to load sync stats:', error);
  }
}

/**
 * Update sync status bar UI
 */
function updateSyncStatusBar() {
  const statusBar = document.getElementById('sync-status-bar');
  const statusText = document.getElementById('sync-status-text');
  
  if (!statusBar || !statusText) return;
  
  statusBar.setAttribute('data-status', state.sync.status);
  
  switch (state.sync.status) {
    case 'not-configured':
      statusText.textContent = 'Set up sync →';
      break;
    case 'synced':
      if (state.sync.lastSync) {
        statusText.textContent = `Synced ${formatRelativeTime(state.sync.lastSync)}`;
      } else {
        statusText.textContent = 'Ready to sync';
      }
      break;
    case 'pending':
      if (state.sync.needsPermission) {
        statusText.textContent = 'Click to reconnect folder';
      } else {
        statusText.textContent = 'Changes pending';
      }
      break;
    case 'syncing':
      statusText.textContent = 'Syncing...';
      break;
    case 'error':
      statusText.textContent = 'Sync failed';
      break;
  }
}

/**
 * Update sync panel UI
 */
function updateSyncPanel() {
  const panel = document.getElementById('sync-panel');
  if (!panel) return;
  
  panel.setAttribute('data-status', state.sync.status);
  
  // Update status label
  const statusLabel = document.getElementById('sync-panel-label');
  if (statusLabel) {
    switch (state.sync.status) {
      case 'not-configured':
        statusLabel.textContent = 'Not Configured';
        break;
      case 'synced':
        statusLabel.textContent = 'Connected';
        break;
      case 'pending':
        statusLabel.textContent = 'Changes Pending';
        break;
      case 'syncing':
        statusLabel.textContent = 'Syncing...';
        break;
      case 'error':
        statusLabel.textContent = 'Error';
        break;
    }
  }
  
  // Update workspace path - toggle between prompt and display
  const selectPrompt = document.getElementById('select-folder-prompt');
  const selectedDisplay = document.getElementById('selected-folder-display');
  const pathText = document.getElementById('sync-path-text');
  
  if (selectPrompt && selectedDisplay && pathText) {
    if (state.sync.workspacePath) {
      // Folder is selected - show the path display
      selectPrompt.style.display = 'none';
      selectedDisplay.style.display = 'flex';
      pathText.textContent = state.sync.workspacePath;
    } else {
      // No folder selected - show the prompt button
      selectPrompt.style.display = 'flex';
      selectedDisplay.style.display = 'none';
      pathText.textContent = '';
    }
  }
  
  // Update connection badge
  const connectionBadge = document.getElementById('opencode-connection-badge');
  if (connectionBadge) {
    if (state.opencode.connected) {
      connectionBadge.textContent = 'Connected';
      connectionBadge.className = 'connection-badge connected';
    } else if (state.opencode.checking) {
      connectionBadge.textContent = 'Checking...';
      connectionBadge.className = 'connection-badge checking';
    } else {
      connectionBadge.textContent = 'Offline';
      connectionBadge.className = 'connection-badge offline';
    }
  }
  
  // Update stats
  const projectsCount = document.getElementById('sync-projects-count');
  const filesCount = document.getElementById('sync-files-count');
  const chatsCount = document.getElementById('sync-chats-count');
  
  if (projectsCount) projectsCount.textContent = String(state.sync.projectCount);
  if (filesCount) filesCount.textContent = String(state.sync.fileCount);
  if (chatsCount) chatsCount.textContent = String(state.sync.chatCount);
  
  // Update settings toggles
  const autoToggle = document.getElementById('sync-auto-toggle') as HTMLInputElement;
  const chatsToggle = document.getElementById('sync-chats-toggle') as HTMLInputElement;
  const bidirectionalToggle = document.getElementById('sync-bidirectional-toggle') as HTMLInputElement;
  const autoMdToggle = document.getElementById('sync-auto-md-toggle') as HTMLInputElement;
  const agentsToggle = document.getElementById('sync-agents-toggle') as HTMLInputElement;
  const intervalSelect = document.getElementById('sync-interval-select') as HTMLSelectElement;
  const conflictSelect = document.getElementById('sync-conflict-select') as HTMLSelectElement;
  
  if (autoToggle) autoToggle.checked = state.sync.settings.autoSync;
  if (chatsToggle) chatsToggle.checked = state.sync.settings.syncChats;
  if (bidirectionalToggle) bidirectionalToggle.checked = state.sync.settings.bidirectional;
  if (autoMdToggle) autoMdToggle.checked = state.sync.settings.autoAddMdExtension;
  if (agentsToggle) agentsToggle.checked = state.sync.settings.ensureAgentsFrontmatter;
  if (intervalSelect) intervalSelect.value = String(state.sync.settings.syncInterval);
  if (conflictSelect) conflictSelect.value = state.sync.settings.conflictStrategy;
  
  // Update folder button text
  const folderBtnText = document.getElementById('sync-folder-btn-text');
  if (folderBtnText) {
    folderBtnText.textContent = state.sync.workspacePath ? 'Change Folder' : 'Choose Folder';
  }
}

/**
 * Format relative time (e.g., "5m ago", "2h ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Open sync panel
 */
function openSyncPanel() {
  const panel = document.getElementById('sync-panel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.classList.add('active');
    updateSyncPanel();
  }
}

/**
 * Close sync panel
 */
function closeSyncPanel() {
  const panel = document.getElementById('sync-panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.classList.remove('active');
  }
}

/**
 * Choose workspace folder
 */
async function chooseWorkspaceFolder() {
  try {
    // Use File System Access API
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents'
    });
    
    if (handle) {
      const path = handle.name;
      
      // Save handle to IndexedDB (can't send via message - not serializable)
      await saveWorkspaceHandleToIDB(handle);
      
      // Save path to chrome.storage via background
      const response = await browser.runtime.sendMessage({
        action: 'set-sync-folder',
        path: path
      });
      
      if (response?.success) {
        state.sync.workspacePath = path;
        state.sync.status = 'synced';
        
        // Load fresh stats from Claude API
        await loadSyncStats();
        
        updateSyncStatusBar();
        updateSyncPanel();
        showNotification('Workspace folder set!', 'success');
        console.log('[Eidolon] Workspace folder set:', path);
      } else {
        throw new Error(response?.error || 'Failed to set folder');
      }
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error('[Eidolon] Failed to choose folder:', error);
      showNotification('Failed to select folder', 'error');
    }
  }
}

/**
 * Save workspace handle to IndexedDB
 */
async function saveWorkspaceHandleToIDB(handle: FileSystemDirectoryHandle): Promise<void> {
  const DB_NAME = 'EidolonHandles';
  const DB_VERSION = 1;
  const STORE_NAME = 'handles';
  const WORKSPACE_HANDLE_KEY = 'workspaceHandle';
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(handle, WORKSPACE_HANDLE_KEY);
      
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

/**
 * Start sync operation
 */
async function startSync() {
  if (state.sync.status === 'syncing') return;
  
  // Check if we have a workspace configured
  if (!state.sync.workspacePath) {
    showNotification('Please select a workspace folder first', 'error');
    return;
  }
  
  // Try to get and verify the handle
  const handle = await getWorkspaceHandleFromIDB();
  if (!handle) {
    // Handle not found - need to re-select folder
    showNotification('Workspace folder access lost. Please re-select the folder.', 'error');
    state.sync.status = 'not-configured';
    state.sync.workspacePath = null;
    // Clear stored path
    await browser.runtime.sendMessage({ action: 'set-sync-folder', path: '' });
    updateSyncStatusBar();
    updateSyncPanel();
    return;
  }
  
  // Request permission (this is a user gesture context so we can request)
  const permission = await (handle as any).requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    showNotification('Permission denied for workspace folder', 'error');
    return;
  }
  
  // Permission granted - clear the flag
  state.sync.needsPermission = false;
  state.sync.status = 'syncing';
  updateSyncStatusBar();
  updateSyncPanel();
  
  // Show progress overlay
  const overlay = document.getElementById('sync-progress-overlay');
  const progressText = document.getElementById('sync-progress-text');
  const progressDetail = document.getElementById('sync-progress-detail');
  
  if (overlay) overlay.classList.remove('hidden');
  if (progressText) progressText.textContent = 'Starting sync...';
  if (progressDetail) progressDetail.textContent = '';
  
  try {
    // For now, sync must happen in dashboard context since it has the full sync logic
    // Open dashboard with sync action or show message
    const response = await browser.runtime.sendMessage({
      action: 'start-sync',
      options: {
        includeChats: state.sync.settings.syncChats,
        bidirectional: state.sync.settings.bidirectional
      }
    });
    
    if (response?.success) {
      state.sync.lastSync = Date.now();
      state.sync.status = 'synced';
      await loadSyncStats();
      showNotification('Sync completed!', 'success');
    } else if (response?.error?.includes('dashboard')) {
      // Background can't do sync, need to redirect to dashboard
      if (overlay) overlay.classList.add('hidden');
      state.sync.status = state.sync.workspacePath ? 'synced' : 'not-configured';
      
      const openDashboard = confirm('Sync requires the Dashboard. Open Dashboard to sync?');
      if (openDashboard) {
        browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html#sync') });
      }
    } else {
      state.sync.status = 'error';
      showNotification(response?.error || 'Sync failed', 'error');
    }
  } catch (error: any) {
    console.error('[Eidolon] Sync failed:', error);
    state.sync.status = 'error';
    showNotification('Sync failed: ' + error.message, 'error');
  } finally {
    if (overlay) overlay.classList.add('hidden');
    updateSyncStatusBar();
    updateSyncPanel();
  }
}

/**
 * Check sync status (opens dashboard diff view)
 */
async function checkSyncStatus() {
  if (!state.sync.workspacePath) {
    showNotification('Select a workspace folder before checking status', 'error');
    return;
  }
  
  showNotification('Opening Dashboard to run diff…', 'info');
  await openDashboardSyncDiff();
}

async function openDashboardSyncDiff(): Promise<void> {
  try {
    const dashboardBase = browser.runtime.getURL('/dashboard.html');
    const diffUrl = `${dashboardBase}#sync-diff`;
    const existingTabs = await browser.tabs.query({ url: `${dashboardBase}*` });
    
    if (existingTabs && existingTabs.length > 0) {
      const targetTab = existingTabs[0];
      if (targetTab.id !== undefined) {
        await browser.tabs.update(targetTab.id, { active: true, url: diffUrl });
        if (targetTab.windowId !== undefined) {
          await browser.windows.update(targetTab.windowId, { focused: true });
        }
      }
    } else {
      await browser.tabs.create({ url: diffUrl });
    }
  } catch (error) {
    console.error('[Eidolon] Failed to open dashboard diff view:', error);
    showNotification('Failed to open dashboard for diff', 'error');
  }
}

/**
 * Save sync settings
 */
async function saveSyncSettings() {
  try {
    await browser.runtime.sendMessage({
      action: 'update-sync-settings',
      settings: state.sync.settings
    });
  } catch (error) {
    console.error('[Eidolon] Failed to save sync settings:', error);
  }
}

/**
 * Setup sync event listeners
 */
function setupSyncEventListeners() {
  // Sync status bar click - open panel
  const statusBar = document.getElementById('sync-status-bar');
  statusBar?.addEventListener('click', (e) => {
    // Don't open panel if clicking action buttons
    if ((e.target as HTMLElement).closest('.sync-action-btn')) return;
    openSyncPanel();
  });
  
  // Sync action buttons in status bar
  document.getElementById('sync-check-status-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    checkSyncStatus();
  });
  
  document.getElementById('sync-now-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    startSync();
  });
  
  document.getElementById('sync-settings-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openSyncPanel();
  });
  
  // Close sync panel
  document.getElementById('close-sync-panel')?.addEventListener('click', closeSyncPanel);
  
  // Panel actions
  document.getElementById('sync-panel-sync-btn')?.addEventListener('click', startSync);
  document.getElementById('sync-panel-check-btn')?.addEventListener('click', checkSyncStatus);
  
  // Choose folder - both buttons call the same function
  document.getElementById('sync-choose-folder-btn')?.addEventListener('click', chooseWorkspaceFolder);
  document.getElementById('select-folder-prompt')?.addEventListener('click', chooseWorkspaceFolder);
  
  // Open dashboard
  document.getElementById('sync-open-dashboard-btn')?.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  });
  
  // Copy path
  document.getElementById('copy-path-btn')?.addEventListener('click', () => {
    if (state.sync.workspacePath) {
      navigator.clipboard.writeText(state.sync.workspacePath);
      showNotification('Path copied!', 'success');
    }
  });
  
  // Cancel sync
  document.getElementById('sync-cancel-btn')?.addEventListener('click', async () => {
    await browser.runtime.sendMessage({ action: 'cancel-sync' });
    state.sync.status = state.sync.workspacePath ? 'synced' : 'not-configured';
    const overlay = document.getElementById('sync-progress-overlay');
    if (overlay) overlay.classList.add('hidden');
    updateSyncStatusBar();
    updateSyncPanel();
  });
  
  // Settings toggles
  document.getElementById('sync-auto-toggle')?.addEventListener('change', (e) => {
    state.sync.settings.autoSync = (e.target as HTMLInputElement).checked;
    saveSyncSettings();
  });
  
  document.getElementById('sync-chats-toggle')?.addEventListener('change', (e) => {
    state.sync.settings.syncChats = (e.target as HTMLInputElement).checked;
    saveSyncSettings();
  });
  
  document.getElementById('sync-bidirectional-toggle')?.addEventListener('change', (e) => {
    state.sync.settings.bidirectional = (e.target as HTMLInputElement).checked;
    saveSyncSettings();
  });
  
  document.getElementById('sync-auto-md-toggle')?.addEventListener('change', (e) => {
    state.sync.settings.autoAddMdExtension = (e.target as HTMLInputElement).checked;
    saveSyncSettings();
  });
  
  document.getElementById('sync-agents-toggle')?.addEventListener('change', (e) => {
    state.sync.settings.ensureAgentsFrontmatter = (e.target as HTMLInputElement).checked;
    saveSyncSettings();
  });
  
  document.getElementById('sync-interval-select')?.addEventListener('change', (e) => {
    state.sync.settings.syncInterval = parseInt((e.target as HTMLSelectElement).value, 10);
    saveSyncSettings();
  });
  
  document.getElementById('sync-conflict-select')?.addEventListener('change', (e) => {
    state.sync.settings.conflictStrategy = (e.target as HTMLSelectElement).value as ConflictStrategy;
    saveSyncSettings();
  });
}

document.addEventListener('DOMContentLoaded', init);
