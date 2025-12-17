/**
 * Terminal Service using xterm.js
 * 
 * Provides a web-based terminal that connects to OpenCode's PTY API.
 * Uses xterm.js (same as VS Code) for reliable terminal emulation.
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ptyService, type PtyInfo } from '../opencode/client';

// Import xterm.js CSS - will be bundled by the build system
import '@xterm/xterm/css/xterm.css';

// ====================================================================
// Types
// ====================================================================

export interface TerminalInstance {
  id: string;
  ptyInfo: PtyInfo;
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  websocket: WebSocket | null;
  container: HTMLElement | null;
  isConnected: boolean;
}

export interface TerminalOptions {
  fontSize?: number;
  fontFamily?: string;
  theme?: {
    background?: string;
    foreground?: string;
    cursor?: string;
    selection?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  };
  scrollback?: number;
}

export interface TerminalEvents {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onExit?: (exitCode: number) => void;
}

// ====================================================================
// Terminal Manager
// ====================================================================

// Active terminal instances
const terminals = new Map<string, TerminalInstance>();

/**
 * Default terminal theme (matches OpenCode's dark theme)
 */
const DEFAULT_THEME = {
  background: '#1a1a1a',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1a1a1a',
  selectionBackground: 'rgba(255, 255, 255, 0.2)',
  selectionForeground: '#ffffff',
  // ANSI colors
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

const DEFAULT_OPTIONS: TerminalOptions = {
  fontSize: 14,
  fontFamily: '"JetBrains Mono", "Fira Code", Consolas, Monaco, "Courier New", monospace',
  theme: DEFAULT_THEME,
  scrollback: 10000,
};

/**
 * Create a new terminal instance
 */
export async function createTerminal(
  container: HTMLElement,
  options: TerminalOptions = {},
  events: TerminalEvents = {}
): Promise<TerminalInstance> {
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const theme = { ...DEFAULT_THEME, ...options.theme };
  
  // Create PTY on server
  const ptyInfo = await ptyService.create({
    title: 'Eidolon Terminal'
  });
  
  // Create terminal instance
  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily,
    allowTransparency: true,
    theme: {
      background: theme.background,
      foreground: theme.foreground,
      cursor: theme.cursor,
      cursorAccent: theme.cursorAccent || theme.background,
      selectionBackground: theme.selection || theme.selectionBackground,
      selectionForeground: theme.selectionForeground,
      black: theme.black,
      red: theme.red,
      green: theme.green,
      yellow: theme.yellow,
      blue: theme.blue,
      magenta: theme.magenta,
      cyan: theme.cyan,
      white: theme.white,
      brightBlack: theme.brightBlack,
      brightRed: theme.brightRed,
      brightGreen: theme.brightGreen,
      brightYellow: theme.brightYellow,
      brightBlue: theme.brightBlue,
      brightMagenta: theme.brightMagenta,
      brightCyan: theme.brightCyan,
      brightWhite: theme.brightWhite,
    },
    scrollback: opts.scrollback,
    convertEol: true,
    allowProposedApi: true,
  });
  
  // Create and load addons
  const fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  const searchAddon = new SearchAddon();
  
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.loadAddon(searchAddon);
  
  // Open terminal in container
  terminal.open(container);
  
  // Initial fit after opening
  requestAnimationFrame(() => {
    fitAddon.fit();
  });
  
  // Create instance object
  const instance: TerminalInstance = {
    id: ptyInfo.id,
    ptyInfo,
    terminal,
    fitAddon,
    searchAddon,
    websocket: null,
    container,
    isConnected: false,
  };
  
  // Store instance
  terminals.set(ptyInfo.id, instance);
  
  // Connect to PTY via WebSocket
  try {
    const ws = await ptyService.connect(ptyInfo.id);
    instance.websocket = ws;
    
    ws.addEventListener('open', () => {
      console.log('[Terminal] WebSocket connected');
      instance.isConnected = true;
      
      // Send initial size after connection
      requestAnimationFrame(() => {
        fitAddon.fit();
        ptyService.update(ptyInfo.id, {
          size: { cols: terminal.cols, rows: terminal.rows }
        });
      });
      
      events.onConnect?.();
    });
    
    ws.addEventListener('message', (event) => {
      terminal.write(event.data);
    });
    
    ws.addEventListener('close', () => {
      console.log('[Terminal] WebSocket disconnected');
      instance.isConnected = false;
      events.onDisconnect?.();
    });
    
    ws.addEventListener('error', (error) => {
      console.error('[Terminal] WebSocket error:', error);
      events.onError?.(new Error('WebSocket connection error'));
    });
  } catch (error) {
    console.error('[Terminal] Failed to connect:', error);
    events.onError?.(error instanceof Error ? error : new Error('Connection failed'));
  }
  
  // Handle user input
  terminal.onData((data) => {
    if (instance.websocket?.readyState === WebSocket.OPEN) {
      instance.websocket.send(data);
    }
    events.onData?.(data);
  });
  
  // Handle resize
  terminal.onResize((size) => {
    if (instance.isConnected && instance.websocket?.readyState === WebSocket.OPEN) {
      ptyService.update(ptyInfo.id, {
        size: { cols: size.cols, rows: size.rows }
      });
    }
    events.onResize?.(size.cols, size.rows);
  });
  
  // Set up resize observer for container
  const resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      fitAddon.fit();
    });
  });
  resizeObserver.observe(container);
  
  // Handle window resize
  const handleWindowResize = () => {
    requestAnimationFrame(() => {
      fitAddon.fit();
    });
  };
  window.addEventListener('resize', handleWindowResize);
  
  // Store cleanup handler
  (instance as any)._cleanup = () => {
    window.removeEventListener('resize', handleWindowResize);
    resizeObserver.disconnect();
  };
  
  return instance;
}

/**
 * Get a terminal instance by ID
 */
export function getTerminal(id: string): TerminalInstance | undefined {
  return terminals.get(id);
}

/**
 * List all active terminals
 */
export function listTerminals(): TerminalInstance[] {
  return Array.from(terminals.values());
}

/**
 * Destroy a terminal instance
 */
export async function destroyTerminal(id: string): Promise<void> {
  const instance = terminals.get(id);
  if (!instance) return;
  
  // Close WebSocket
  if (instance.websocket) {
    instance.websocket.close();
    instance.websocket = null;
  }
  
  // Cleanup event handlers
  if ((instance as any)._cleanup) {
    (instance as any)._cleanup();
  }
  
  // Dispose terminal
  instance.terminal.dispose();
  
  // Remove PTY from server
  try {
    await ptyService.remove(id);
  } catch (error) {
    console.warn('[Terminal] Failed to remove PTY:', error);
  }
  
  // Remove from map
  terminals.delete(id);
}

/**
 * Destroy all terminal instances
 */
export async function destroyAllTerminals(): Promise<void> {
  const ids = Array.from(terminals.keys());
  await Promise.all(ids.map(id => destroyTerminal(id)));
}

/**
 * Focus a terminal
 */
export function focusTerminal(id: string): void {
  const instance = terminals.get(id);
  if (instance) {
    instance.terminal.focus();
  }
}

/**
 * Resize terminal to fit container
 */
export function fitTerminal(id: string): void {
  const instance = terminals.get(id);
  if (instance) {
    instance.fitAddon.fit();
  }
}

/**
 * Write data to terminal (for displaying output without PTY)
 */
export function writeToTerminal(id: string, data: string): void {
  const instance = terminals.get(id);
  if (instance) {
    instance.terminal.write(data);
  }
}

/**
 * Clear terminal screen
 */
export function clearTerminal(id: string): void {
  const instance = terminals.get(id);
  if (instance) {
    instance.terminal.clear();
  }
}

/**
 * Search in terminal
 */
export function searchTerminal(id: string, query: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }): boolean {
  const instance = terminals.get(id);
  if (instance) {
    return instance.searchAddon.findNext(query, {
      caseSensitive: options?.caseSensitive,
      wholeWord: options?.wholeWord,
      regex: options?.regex,
    });
  }
  return false;
}

/**
 * Find previous match in terminal
 */
export function searchTerminalPrevious(id: string, query: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }): boolean {
  const instance = terminals.get(id);
  if (instance) {
    return instance.searchAddon.findPrevious(query, {
      caseSensitive: options?.caseSensitive,
      wholeWord: options?.wholeWord,
      regex: options?.regex,
    });
  }
  return false;
}

/**
 * Clear search highlighting
 */
export function clearTerminalSearch(id: string): void {
  const instance = terminals.get(id);
  if (instance) {
    instance.searchAddon.clearDecorations();
  }
}

/**
 * Send a command to terminal (simulates typing + Enter)
 * Useful for automated commands like cd, opencode, etc.
 * 
 * @param id - Terminal instance ID
 * @param command - Command to execute
 * @param clearLine - Whether to clear current line first (Ctrl+U), default true
 */
export function sendCommand(id: string, command: string, clearLine: boolean = true): boolean {
  const instance = terminals.get(id);
  if (instance && instance.websocket?.readyState === WebSocket.OPEN) {
    // Clear current line first to avoid appending to existing input
    // Ctrl+U clears from cursor to beginning of line in bash/zsh
    // Ctrl+C cancels any current command
    if (clearLine) {
      instance.websocket.send('\x15'); // Ctrl+U - clear line
    }
    // Small delay to ensure line is cleared before sending command
    setTimeout(() => {
      if (instance.websocket?.readyState === WebSocket.OPEN) {
        instance.websocket.send(command + '\r');
      }
    }, 10);
    return true;
  }
  return false;
}

/**
 * Change directory in terminal
 * Handles both Unix paths (~/github, /home/user) and Windows paths (C:\Users\name)
 * 
 * @param id - Terminal instance ID  
 * @param path - Directory path (Unix or Windows format)
 */
export function changeDirectory(id: string, path: string): boolean {
  // Normalize path for the shell
  let normalizedPath = path;
  
  // Check if it's a Windows-style path (e.g., C:\Users\name or C:/Users/name)
  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(path);
  
  if (isWindowsPath) {
    // For Windows paths in WSL, convert to /mnt/c/... format
    // C:\Users\name -> /mnt/c/Users/name
    const driveLetter = path[0].toLowerCase();
    const restOfPath = path.substring(2).replace(/\\/g, '/');
    normalizedPath = `/mnt/${driveLetter}${restOfPath}`;
  }
  
  // Escape path for shell (handle spaces, special chars)
  // Use quotes if path contains spaces or special shell characters
  const needsQuotes = /[\s$`"'\\!#&*?<>|;(){}[\]]/.test(normalizedPath);
  const escapedPath = needsQuotes ? `"${normalizedPath}"` : normalizedPath;
  
  return sendCommand(id, `cd ${escapedPath}`);
}
