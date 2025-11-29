/**
 * Chrome Debugger Protocol (CDP) Utilities
 * 
 * Provides low-level browser control through Chrome's Debugger API.
 * Used for screenshots, input simulation, and page inspection.
 */

import type { 
  ScreenshotOptions, 
  ScreenshotResult,
  MouseEventOptions,
  KeyEventOptions 
} from './types';

// CDP Version
const CDP_VERSION = '1.3';

// Track attached debuggers to avoid duplicate attachments
const attachedTabs = new Set<number>();

/**
 * Attach debugger to a tab
 */
export async function attachDebugger(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) {
    return; // Already attached
  }
  
  try {
    await chrome.debugger.attach({ tabId }, CDP_VERSION);
    attachedTabs.add(tabId);
    console.log(`[CDP] Attached debugger to tab ${tabId}`);
  } catch (error: any) {
    // If already attached by another extension, try to continue
    if (error.message?.includes('Another debugger is already attached')) {
      console.warn(`[CDP] Debugger already attached to tab ${tabId}`);
      attachedTabs.add(tabId);
    } else {
      throw error;
    }
  }
}

/**
 * Detach debugger from a tab
 */
export async function detachDebugger(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) {
    return; // Not attached
  }
  
  try {
    await chrome.debugger.detach({ tabId });
    attachedTabs.delete(tabId);
    console.log(`[CDP] Detached debugger from tab ${tabId}`);
  } catch (error: any) {
    // Ignore errors when detaching (tab might be closed)
    console.warn(`[CDP] Error detaching from tab ${tabId}:`, error);
    attachedTabs.delete(tabId);
  }
}

/**
 * Send CDP command
 */
export async function sendCommand<T = any>(
  tabId: number,
  method: string,
  params?: object
): Promise<T> {
  // Ensure debugger is attached
  await attachDebugger(tabId);
  
  try {
    const result = await chrome.debugger.sendCommand({ tabId }, method, params);
    return result as T;
  } catch (error: any) {
    console.error(`[CDP] Command ${method} failed:`, error);
    throw error;
  }
}

/**
 * Capture screenshot of a tab
 */
export async function captureScreenshot(
  tabId: number,
  options: ScreenshotOptions = {}
): Promise<string> {
  const params: any = {
    format: options.format || 'png',
  };
  
  if (options.format === 'jpeg' && options.quality) {
    params.quality = options.quality;
  }
  
  if (options.clip) {
    params.clip = options.clip;
  }
  
  if (options.fromSurface !== undefined) {
    params.fromSurface = options.fromSurface;
  }
  
  if (options.captureBeyondViewport !== undefined) {
    params.captureBeyondViewport = options.captureBeyondViewport;
  }
  
  const result = await sendCommand<ScreenshotResult>(
    tabId,
    'Page.captureScreenshot',
    params
  );
  
  return result.data;
}

/**
 * Capture full page screenshot
 */
export async function captureFullPageScreenshot(
  tabId: number,
  format: 'png' | 'jpeg' = 'png',
  quality: number = 80
): Promise<string> {
  // Get page metrics
  const metrics = await sendCommand<{
    contentSize: { width: number; height: number };
  }>(tabId, 'Page.getLayoutMetrics');
  
  // Get device scale factor
  const devicePixelRatio = await sendCommand<{ result: { value: number } }>(
    tabId,
    'Runtime.evaluate',
    { expression: 'window.devicePixelRatio' }
  );
  const scale = devicePixelRatio?.result?.value || 1;
  
  // Set viewport to full page size
  await sendCommand(tabId, 'Emulation.setDeviceMetricsOverride', {
    width: Math.ceil(metrics.contentSize.width),
    height: Math.ceil(metrics.contentSize.height),
    deviceScaleFactor: scale,
    mobile: false
  });
  
  try {
    // Capture screenshot
    const screenshot = await captureScreenshot(tabId, { format, quality });
    return screenshot;
  } finally {
    // Reset viewport
    await sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride');
  }
}

/**
 * Dispatch mouse event via CDP
 */
export async function dispatchMouseEvent(
  tabId: number,
  options: MouseEventOptions
): Promise<void> {
  const params: any = {
    type: options.type,
    x: options.x,
    y: options.y,
  };
  
  if (options.button) {
    params.button = options.button;
  }
  
  if (options.clickCount) {
    params.clickCount = options.clickCount;
  }
  
  if (options.modifiers) {
    params.modifiers = options.modifiers;
  }
  
  // For scroll events
  if (options.deltaX !== undefined) {
    params.deltaX = options.deltaX;
  }
  if (options.deltaY !== undefined) {
    params.deltaY = options.deltaY;
  }
  
  await sendCommand(tabId, 'Input.dispatchMouseEvent', params);
}

/**
 * Click at coordinates
 */
export async function click(
  tabId: number,
  x: number,
  y: number,
  options: {
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    modifiers?: number;
  } = {}
): Promise<void> {
  const button = options.button || 'left';
  const clickCount = options.clickCount || 1;
  
  // Mouse down
  await dispatchMouseEvent(tabId, {
    type: 'mousePressed',
    x,
    y,
    button,
    clickCount,
    modifiers: options.modifiers
  });
  
  // Mouse up
  await dispatchMouseEvent(tabId, {
    type: 'mouseReleased',
    x,
    y,
    button,
    clickCount,
    modifiers: options.modifiers
  });
}

/**
 * Double click at coordinates
 */
export async function doubleClick(
  tabId: number,
  x: number,
  y: number
): Promise<void> {
  await click(tabId, x, y, { clickCount: 2 });
}

/**
 * Right click at coordinates
 */
export async function rightClick(
  tabId: number,
  x: number,
  y: number
): Promise<void> {
  await click(tabId, x, y, { button: 'right' });
}

/**
 * Move mouse to coordinates
 */
export async function moveMouse(
  tabId: number,
  x: number,
  y: number
): Promise<void> {
  await dispatchMouseEvent(tabId, {
    type: 'mouseMoved',
    x,
    y
  });
}

/**
 * Drag from one point to another
 */
export async function drag(
  tabId: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number = 10
): Promise<void> {
  // Move to start
  await moveMouse(tabId, startX, startY);
  
  // Mouse down
  await dispatchMouseEvent(tabId, {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    clickCount: 1
  });
  
  // Move in steps
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const x = startX + (endX - startX) * progress;
    const y = startY + (endY - startY) * progress;
    await moveMouse(tabId, x, y);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Mouse up
  await dispatchMouseEvent(tabId, {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    clickCount: 1
  });
}

/**
 * Scroll at coordinates
 */
export async function scroll(
  tabId: number,
  x: number,
  y: number,
  deltaX: number = 0,
  deltaY: number = 0
): Promise<void> {
  await dispatchMouseEvent(tabId, {
    type: 'mouseWheel',
    x,
    y,
    deltaX,
    deltaY
  });
}

/**
 * Dispatch keyboard event via CDP
 */
export async function dispatchKeyEvent(
  tabId: number,
  options: KeyEventOptions
): Promise<void> {
  const params: any = {
    type: options.type,
    key: options.key,
  };
  
  if (options.code) {
    params.code = options.code;
  }
  
  if (options.text) {
    params.text = options.text;
  }
  
  if (options.windowsVirtualKeyCode) {
    params.windowsVirtualKeyCode = options.windowsVirtualKeyCode;
    params.nativeVirtualKeyCode = options.windowsVirtualKeyCode;
  }
  
  if (options.modifiers) {
    params.modifiers = options.modifiers;
  }
  
  await sendCommand(tabId, 'Input.dispatchKeyEvent', params);
}

/**
 * Type text (insert directly)
 */
export async function insertText(tabId: number, text: string): Promise<void> {
  await sendCommand(tabId, 'Input.insertText', { text });
}

/**
 * Press a key
 */
export async function pressKey(
  tabId: number,
  key: string,
  options: {
    code?: string;
    windowsVirtualKeyCode?: number;
    modifiers?: number;
  } = {}
): Promise<void> {
  // Key down
  await dispatchKeyEvent(tabId, {
    type: 'keyDown',
    key,
    code: options.code,
    windowsVirtualKeyCode: options.windowsVirtualKeyCode,
    modifiers: options.modifiers
  });
  
  // Key up
  await dispatchKeyEvent(tabId, {
    type: 'keyUp',
    key,
    code: options.code,
    windowsVirtualKeyCode: options.windowsVirtualKeyCode,
    modifiers: options.modifiers
  });
}

/**
 * Press Enter key
 */
export async function pressEnter(tabId: number): Promise<void> {
  await pressKey(tabId, 'Enter', { code: 'Enter', windowsVirtualKeyCode: 13 });
}

/**
 * Press Tab key
 */
export async function pressTab(tabId: number): Promise<void> {
  await pressKey(tabId, 'Tab', { code: 'Tab', windowsVirtualKeyCode: 9 });
}

/**
 * Press Escape key
 */
export async function pressEscape(tabId: number): Promise<void> {
  await pressKey(tabId, 'Escape', { code: 'Escape', windowsVirtualKeyCode: 27 });
}

/**
 * Enable runtime events (for console capture)
 */
export async function enableRuntime(tabId: number): Promise<void> {
  await sendCommand(tabId, 'Runtime.enable');
}

/**
 * Evaluate JavaScript in page context
 */
export async function evaluate<T = any>(
  tabId: number,
  expression: string
): Promise<T> {
  const result = await sendCommand<{
    result: { type: string; value?: T; description?: string };
    exceptionDetails?: any;
  }>(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      'Evaluation failed'
    );
  }
  
  return result.result.value as T;
}

/**
 * Get page DOM as HTML
 */
export async function getPageHTML(tabId: number): Promise<string> {
  return evaluate(tabId, 'document.documentElement.outerHTML');
}

/**
 * Get page text content
 */
export async function getPageText(tabId: number): Promise<string> {
  return evaluate(tabId, 'document.body.innerText');
}

/**
 * Get page title
 */
export async function getPageTitle(tabId: number): Promise<string> {
  return evaluate(tabId, 'document.title');
}

/**
 * Get page URL
 */
export async function getPageURL(tabId: number): Promise<string> {
  return evaluate(tabId, 'window.location.href');
}

/**
 * Find text on page
 */
export async function findOnPage(
  tabId: number,
  query: string,
  caseSensitive: boolean = false
): Promise<{ count: number; positions: { x: number; y: number }[] }> {
  const expression = `
    (function() {
      const query = ${JSON.stringify(query)};
      const caseSensitive = ${caseSensitive};
      const regex = new RegExp(query, caseSensitive ? 'g' : 'gi');
      const text = document.body.innerText;
      const matches = text.match(regex) || [];
      
      const positions = [];
      const range = document.createRange();
      const treeWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let node;
      while ((node = treeWalker.nextNode()) && positions.length < 10) {
        const idx = caseSensitive 
          ? node.textContent.indexOf(query)
          : node.textContent.toLowerCase().indexOf(query.toLowerCase());
        if (idx >= 0) {
          range.setStart(node, idx);
          range.setEnd(node, idx + query.length);
          const rect = range.getBoundingClientRect();
          positions.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
      }
      
      return { count: matches.length, positions };
    })()
  `;
  
  return evaluate(tabId, expression);
}

/**
 * Cleanup - detach all debuggers
 */
export async function cleanup(): Promise<void> {
  for (const tabId of attachedTabs) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch (e) {
      // Ignore errors
    }
  }
  attachedTabs.clear();
}

// Listen for tab removal to clean up
if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    attachedTabs.delete(tabId);
  });
}
