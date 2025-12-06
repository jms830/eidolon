/**
 * Browser Interaction Types
 * 
 * Type definitions for browser automation and interaction features.
 */

// ============================================================================
// Accessibility Tree Types
// ============================================================================

export interface AccessibilityNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  focused?: boolean;
  disabled?: boolean;
  checked?: boolean | 'mixed';
  expanded?: boolean;
  selected?: boolean;
  required?: boolean;
  readonly?: boolean;
  level?: number;
  bounds?: BoundingRect;
  children?: AccessibilityNode[];
}

export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// CDP (Chrome Debugger Protocol) Types
// ============================================================================

export interface CDPTarget {
  tabId: number;
}

export interface ScreenshotOptions {
  format?: 'png' | 'jpeg';
  quality?: number; // 0-100, only for jpeg
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale?: number;
  };
  fromSurface?: boolean;
  captureBeyondViewport?: boolean;
}

export interface ScreenshotResult {
  data: string; // Base64 encoded image
}

// ============================================================================
// Mouse/Keyboard Input Types
// ============================================================================

export type MouseButton = 'left' | 'right' | 'middle' | 'none';

export type MouseEventType = 
  | 'mousePressed' 
  | 'mouseReleased' 
  | 'mouseMoved'
  | 'mouseWheel';

export interface MouseEventOptions {
  type: MouseEventType;
  x: number;
  y: number;
  button?: MouseButton;
  clickCount?: number;
  deltaX?: number; // For scroll
  deltaY?: number; // For scroll
  modifiers?: number; // Bit field: Alt=1, Ctrl=2, Meta=4, Shift=8
}

export type KeyEventType = 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';

export interface KeyEventOptions {
  type: KeyEventType;
  key: string;
  code?: string;
  text?: string;
  windowsVirtualKeyCode?: number;
  nativeVirtualKeyCode?: number;
  modifiers?: number;
}

// ============================================================================
// Action Types
// ============================================================================

export type ActionType =
  | 'click'
  | 'left_click'
  | 'right_click'
  | 'middle_click'
  | 'double_click'
  | 'triple_click'
  | 'left_click_drag'
  | 'scroll'
  | 'type'
  | 'key'
  | 'wait'
  | 'screenshot'
  | 'navigate'
  | 'read_page'
  | 'find';

export interface BrowserAction {
  type: ActionType;
  target?: string; // Element ref or coordinates
  value?: string; // Text to type, URL to navigate, etc.
  x?: number;
  y?: number;
  endX?: number; // For drag
  endY?: number; // For drag
  deltaX?: number; // For scroll
  deltaY?: number; // For scroll
  duration?: number; // For wait
  modifiers?: string[]; // ['ctrl', 'shift', 'alt', 'meta']
}

export interface ActionResult {
  success: boolean;
  error?: string;
  data?: any;
  screenshot?: string; // Base64 encoded
  timestamp: number;
  // BrowserMCP-inspired enhancements
  domChanged?: boolean; // Whether the action caused DOM changes
  message?: string; // Human-readable action description
  elementInfo?: {
    ref: string;
    tagName?: string;
    role?: string;
    name?: string;
    isVisible?: boolean;
    bounds?: BoundingRect;
  };
}

export interface RefValidationResult {
  valid: boolean;
  element?: {
    ref: string;
    tagName: string;
    isVisible: boolean;
    isInteractive: boolean;
    bounds: BoundingRect;
  };
  error?: string;
}

export interface DOMSnapshot {
  hash: string;
  elementCount: number;
  interactiveCount: number;
  timestamp: number;
}

export interface ScrollInfo {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  pixelsAbove: number;
  pixelsBelow: number;
  percentScrolled: number;
}

// ============================================================================
// Tab Group Types
// ============================================================================

export type TabGroupColor = 
  | 'grey' 
  | 'blue' 
  | 'red' 
  | 'yellow' 
  | 'green' 
  | 'pink' 
  | 'purple' 
  | 'cyan' 
  | 'orange';

export interface TabGroupOptions {
  title: string;
  color?: TabGroupColor;
  collapsed?: boolean;
}

export interface EidolonSession {
  id: string;
  name: string;
  groupId?: number;
  tabIds: number[];
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'paused' | 'completed';
}

// ============================================================================
// Browser Tool Definitions (MCP-style)
// ============================================================================

export interface BrowserTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: any;
    }>;
    required?: string[];
  };
}

export const BROWSER_TOOLS: BrowserTool[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL in the current tab',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' }
      },
      required: ['url']
    }
  },
  {
    name: 'read_page',
    description: 'Get the accessibility tree and content of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        maxDepth: { type: 'number', description: 'Maximum depth of the tree', default: 10 },
        includeHidden: { type: 'boolean', description: 'Include hidden elements', default: false }
      }
    }
  },
  {
    name: 'get_page_text',
    description: 'Get the text content of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to limit text extraction' }
      }
    }
  },
  {
    name: 'find',
    description: 'Find text on the current page',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for' },
        caseSensitive: { type: 'boolean', description: 'Case sensitive search', default: false }
      },
      required: ['query']
    }
  },
  {
    name: 'click',
    description: 'Click on an element by ref or coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Element ref from accessibility tree' },
        x: { type: 'number', description: 'X coordinate (if no ref)' },
        y: { type: 'number', description: 'Y coordinate (if no ref)' },
        button: { type: 'string', description: 'Mouse button', enum: ['left', 'right', 'middle'], default: 'left' },
        clickCount: { type: 'number', description: 'Number of clicks', default: 1 }
      }
    }
  },
  {
    name: 'type',
    description: 'Type text into the focused element or specified element',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
        ref: { type: 'string', description: 'Element ref to focus before typing' }
      },
      required: ['text']
    }
  },
  {
    name: 'scroll',
    description: 'Scroll the page or an element',
    inputSchema: {
      type: 'object',
      properties: {
        deltaX: { type: 'number', description: 'Horizontal scroll amount', default: 0 },
        deltaY: { type: 'number', description: 'Vertical scroll amount', default: 0 },
        ref: { type: 'string', description: 'Element ref to scroll (or page if not specified)' }
      }
    }
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', description: 'Image format', enum: ['png', 'jpeg'], default: 'png' },
        quality: { type: 'number', description: 'Quality for JPEG (0-100)', default: 80 },
        fullPage: { type: 'boolean', description: 'Capture full page', default: false }
      }
    }
  },
  {
    name: 'form_input',
    description: 'Fill a form field by ref',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Element ref from accessibility tree' },
        value: { type: 'string', description: 'Value to set' }
      },
      required: ['ref', 'value']
    }
  },
  {
    name: 'wait',
    description: 'Wait for a specified duration',
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Duration in milliseconds' }
      },
      required: ['duration']
    }
  },
  {
    name: 'tabs_context',
    description: 'Get information about open tabs',
    inputSchema: {
      type: 'object',
      properties: {
        currentOnly: { type: 'boolean', description: 'Only return current tab info', default: false }
      }
    }
  },
  {
    name: 'tabs_create',
    description: 'Create a new tab',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open in the new tab' },
        active: { type: 'boolean', description: 'Make the new tab active', default: true }
      },
      required: ['url']
    }
  },
  {
    name: 'update_plan',
    description: 'Update the task plan/todo list',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'List of tasks with id, description, and status'
        }
      },
      required: ['tasks']
    }
  }
];
