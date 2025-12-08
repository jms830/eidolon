/**
 * Terminal Service using ghostty-web
 * 
 * Provides a web-based terminal that connects to OpenCode's PTY API.
 * Uses ghostty-web for proper VT100 emulation (same as native Ghostty).
 */

import { Ghostty, Terminal, FitAddon } from 'ghostty-web';
import { ptyService, type PtyInfo } from '../opencode/client';

// ====================================================================
// Types
// ====================================================================

export interface TerminalInstance {
  id: string;
  ptyInfo: PtyInfo;
  terminal: Terminal;
  fitAddon: FitAddon;
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

// Ghostty WASM instance (loaded once)
let ghosttyInstance: Ghostty | null = null;
let ghosttyLoading: Promise<Ghostty> | null = null;

/**
 * Load Ghostty WASM (singleton)
 */
async function loadGhostty(): Promise<Ghostty> {
  if (ghosttyInstance) return ghosttyInstance;
  
  if (!ghosttyLoading) {
    ghosttyLoading = Ghostty.load().then(instance => {
      ghosttyInstance = instance;
      return instance;
    });
  }
  
  return ghosttyLoading;
}

// Active terminal instances
const terminals = new Map<string, TerminalInstance>();

/**
 * Default terminal theme (matches OpenCode's dark theme)
 */
const DEFAULT_THEME = {
  background: '#191515',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  selection: 'rgba(255, 255, 255, 0.2)',
};

const DEFAULT_OPTIONS: TerminalOptions = {
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
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
  // Load Ghostty WASM
  const ghostty = await loadGhostty();
  
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
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily,
    allowTransparency: true,
    theme: {
      background: theme.background,
      foreground: theme.foreground,
      cursor: theme.cursor,
      selectionBackground: theme.selection,
    },
    scrollback: opts.scrollback,
    ghostty,
  });
  
  // Create fit addon for auto-sizing
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  
  // Open terminal in container
  terminal.open(container);
  fitAddon.fit();
  
  // Create instance object
  const instance: TerminalInstance = {
    id: ptyInfo.id,
    ptyInfo,
    terminal,
    fitAddon,
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
      
      // Send initial size
      ptyService.update(ptyInfo.id, {
        size: { cols: terminal.cols, rows: terminal.rows }
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
    if (instance.isConnected) {
      ptyService.update(ptyInfo.id, {
        size: { cols: size.cols, rows: size.rows }
      });
    }
    events.onResize?.(size.cols, size.rows);
  });
  
  // Set up resize observer
  fitAddon.observeResize();
  
  // Handle window resize
  const handleWindowResize = () => fitAddon.fit();
  window.addEventListener('resize', handleWindowResize);
  
  // Store cleanup handler
  (instance as any)._cleanup = () => {
    window.removeEventListener('resize', handleWindowResize);
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
