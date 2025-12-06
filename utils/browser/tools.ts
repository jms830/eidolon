/**
 * Browser Tools
 * 
 * High-level browser interaction tools that Claude can use.
 * Wraps CDP and tab APIs into easy-to-use tool functions.
 */

import * as cdp from './cdp';
import * as tabGroups from './tabGroups';
import type { 
  BrowserAction, 
  ActionResult, 
  AccessibilityNode,
  RefValidationResult,
  DOMSnapshot,
  ScrollInfo
} from './types';

// ============================================================================
// BrowserMCP-Inspired Utility Functions
// ============================================================================

/**
 * Calculate intelligent timeout for typing operations based on text length.
 * From BrowserMCP: ~50ms per character + base time
 */
export function calculateTypingTimeout(text: string): number {
  const BASE_TIMEOUT = 100; // Base time in ms
  const MS_PER_CHAR = 50;   // Time per character
  const MAX_TIMEOUT = 30000; // Max 30 seconds
  
  const calculated = BASE_TIMEOUT + (text.length * MS_PER_CHAR);
  return Math.min(calculated, MAX_TIMEOUT);
}

/**
 * Validate an element ref before performing an action.
 * Prevents stale ref errors by checking if element still exists and is actionable.
 */
export async function validateRef(
  tabId: number,
  ref: string
): Promise<RefValidationResult> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (elementRef: string) => {
        const validateFn = (window as any).__validateRef;
        if (validateFn) {
          return validateFn(elementRef);
        }
        
        // Fallback validation if content script function not available
        const getBounds = (window as any).__getBoundsByRef;
        const bounds = getBounds?.(elementRef);
        if (!bounds) {
          return { valid: false, error: `Element not found: ${elementRef}` };
        }
        
        return {
          valid: true,
          element: {
            ref: elementRef,
            tagName: 'unknown',
            isVisible: bounds.width > 0 && bounds.height > 0,
            isInteractive: true,
            bounds
          }
        };
      },
      args: [ref]
    });
    
    return results[0]?.result || { valid: false, error: 'Script execution failed' };
  } catch (error: any) {
    return { valid: false, error: error.message || 'Validation failed' };
  }
}

/**
 * Get DOM snapshot for change detection
 */
export async function getDOMSnapshot(tabId: number): Promise<DOMSnapshot | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const snapshotFn = (window as any).__generateDOMSnapshot;
        if (snapshotFn) {
          const hash = snapshotFn();
          // Count elements for additional context
          const allElements = document.querySelectorAll('*');
          const interactiveSelector = 'a, button, input, select, textarea, [onclick], [role="button"], [role="link"], [tabindex]';
          const interactiveElements = document.querySelectorAll(interactiveSelector);
          
          return {
            hash,
            elementCount: allElements.length,
            interactiveCount: interactiveElements.length,
            timestamp: Date.now()
          };
        }
        return null;
      }
    });
    
    return results[0]?.result || null;
  } catch (error) {
    console.error('[Tools] Failed to get DOM snapshot:', error);
    return null;
  }
}

/**
 * Check if DOM has changed between two snapshots
 */
export function hasDOMChanged(before: DOMSnapshot | null, after: DOMSnapshot | null): boolean {
  if (!before || !after) return true; // Assume changed if we can't compare
  return before.hash !== after.hash;
}

/**
 * Get scroll information for the page or a scrollable container
 */
export async function getScrollInfo(tabId: number): Promise<ScrollInfo | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const scrollInfoFn = (window as any).__getScrollInfo;
        if (scrollInfoFn) {
          return scrollInfoFn();
        }
        
        // Fallback implementation
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
        
        return {
          scrollTop,
          scrollHeight,
          clientHeight,
          pixelsAbove: scrollTop,
          pixelsBelow: scrollHeight - scrollTop - clientHeight,
          percentScrolled: scrollHeight > clientHeight 
            ? Math.round((scrollTop / (scrollHeight - clientHeight)) * 100) 
            : 100
        };
      }
    });
    
    return results[0]?.result || null;
  } catch (error) {
    console.error('[Tools] Failed to get scroll info:', error);
    return null;
  }
}

/**
 * Wrapper for actions that require ref validation.
 * Validates the ref before executing the action and provides better error messages.
 */
export async function withRefValidation(
  tabId: number,
  ref: string,
  actionName: string,
  action: (validatedRef: string) => Promise<ActionResult>
): Promise<ActionResult> {
  const validation = await validateRef(tabId, ref);
  
  if (!validation.valid) {
    return {
      success: false,
      error: `Cannot ${actionName}: ${validation.error}`,
      timestamp: Date.now(),
      message: `Failed to ${actionName} on element "${ref}" - element not found or not accessible`
    };
  }
  
  if (validation.element && !validation.element.isVisible) {
    return {
      success: false,
      error: `Element "${ref}" is not visible`,
      timestamp: Date.now(),
      message: `Cannot ${actionName} on hidden element`,
      elementInfo: validation.element
    };
  }
  
  // Execute the actual action
  const result = await action(ref);
  
  // Enhance result with element info
  if (validation.element) {
    result.elementInfo = validation.element;
  }
  
  return result;
}

/**
 * Execute a browser action
 */
export async function executeAction(
  tabId: number,
  action: BrowserAction
): Promise<ActionResult> {
  const timestamp = Date.now();
  
  try {
    switch (action.type) {
      case 'navigate':
        return await navigate(tabId, action.value!);
        
      case 'click':
      case 'left_click':
        return await clickAction(tabId, action);
        
      case 'right_click':
        return await rightClickAction(tabId, action);
        
      case 'double_click':
        return await doubleClickAction(tabId, action);
        
      case 'scroll':
        return await scrollAction(tabId, action);
        
      case 'type':
        return await typeAction(tabId, action);
        
      case 'key':
        return await keyAction(tabId, action);
        
      case 'left_click_drag':
        return await dragAction(tabId, action);
        
      case 'screenshot':
        return await screenshotAction(tabId, action);
        
      case 'read_page':
        return await readPageAction(tabId);
        
      case 'find':
        return await findAction(tabId, action.value!);
        
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, action.duration || 1000));
        return { success: true, timestamp };
        
      default:
        return { success: false, error: `Unknown action type: ${action.type}`, timestamp };
    }
  } catch (error: any) {
    console.error(`[Tools] Action ${action.type} failed:`, error);
    return {
      success: false,
      error: error.message || String(error),
      timestamp
    };
  }
}

/**
 * Navigate to a URL
 */
async function navigate(tabId: number, url: string): Promise<ActionResult> {
  // Ensure URL is valid
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  await chrome.tabs.update(tabId, { url });
  
  // Wait for navigation to complete
  return new Promise((resolve) => {
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve({ success: true, data: { url }, timestamp: Date.now() });
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ success: true, data: { url, timedOut: true }, timestamp: Date.now() });
    }, 30000);
  });
}

/**
 * Click action with ref validation and DOM change detection
 */
async function clickAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  let x: number, y: number;
  
  // Take DOM snapshot before action
  const snapshotBefore = await getDOMSnapshot(tabId);
  
  if (action.target) {
    // Use ref validation wrapper for better error handling
    return await withRefValidation(tabId, action.target, 'click', async (ref) => {
      const coords = await getElementCoordinates(tabId, ref);
      if (!coords) {
        return { 
          success: false, 
          error: `Element coordinates not found: ${ref}`, 
          timestamp: Date.now(),
          message: `Could not determine click position for element "${ref}"`
        };
      }
      
      await cdp.click(tabId, coords.x, coords.y);
      
      // Check for DOM changes after action
      const snapshotAfter = await getDOMSnapshot(tabId);
      const domChanged = hasDOMChanged(snapshotBefore, snapshotAfter);
      
      return { 
        success: true, 
        data: { x: coords.x, y: coords.y }, 
        timestamp: Date.now(),
        domChanged,
        message: `Clicked element "${ref}" at (${coords.x}, ${coords.y})${domChanged ? ' - page updated' : ''}`
      };
    });
  } else if (action.x !== undefined && action.y !== undefined) {
    x = action.x;
    y = action.y;
    
    await cdp.click(tabId, x, y);
    
    // Check for DOM changes after action
    const snapshotAfter = await getDOMSnapshot(tabId);
    const domChanged = hasDOMChanged(snapshotBefore, snapshotAfter);
    
    return { 
      success: true, 
      data: { x, y }, 
      timestamp: Date.now(),
      domChanged,
      message: `Clicked at coordinates (${x}, ${y})${domChanged ? ' - page updated' : ''}`
    };
  } else {
    return { 
      success: false, 
      error: 'Click requires target ref or coordinates', 
      timestamp: Date.now(),
      message: 'Click action requires either a target element ref or x,y coordinates'
    };
  }
}

/**
 * Right click action
 */
async function rightClickAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  let x: number, y: number;
  
  if (action.target) {
    const coords = await getElementCoordinates(tabId, action.target);
    if (!coords) {
      return { success: false, error: `Element not found: ${action.target}`, timestamp: Date.now() };
    }
    x = coords.x;
    y = coords.y;
  } else if (action.x !== undefined && action.y !== undefined) {
    x = action.x;
    y = action.y;
  } else {
    return { success: false, error: 'Right click requires target ref or coordinates', timestamp: Date.now() };
  }
  
  await cdp.rightClick(tabId, x, y);
  return { success: true, data: { x, y }, timestamp: Date.now() };
}

/**
 * Double click action
 */
async function doubleClickAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  let x: number, y: number;
  
  if (action.target) {
    const coords = await getElementCoordinates(tabId, action.target);
    if (!coords) {
      return { success: false, error: `Element not found: ${action.target}`, timestamp: Date.now() };
    }
    x = coords.x;
    y = coords.y;
  } else if (action.x !== undefined && action.y !== undefined) {
    x = action.x;
    y = action.y;
  } else {
    return { success: false, error: 'Double click requires target ref or coordinates', timestamp: Date.now() };
  }
  
  await cdp.doubleClick(tabId, x, y);
  return { success: true, data: { x, y }, timestamp: Date.now() };
}

/**
 * Scroll action with scroll position info and DOM change detection
 */
async function scrollAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  const x = action.x || 100;
  const y = action.y || 100;
  const deltaX = action.deltaX || 0;
  const deltaY = action.deltaY || 0;
  
  // Get scroll info before
  const scrollBefore = await getScrollInfo(tabId);
  const snapshotBefore = await getDOMSnapshot(tabId);
  
  await cdp.scroll(tabId, x, y, deltaX, deltaY);
  
  // Small delay for scroll to settle and lazy-loaded content
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Get scroll info after
  const scrollAfter = await getScrollInfo(tabId);
  const snapshotAfter = await getDOMSnapshot(tabId);
  const domChanged = hasDOMChanged(snapshotBefore, snapshotAfter);
  
  // Build descriptive message
  let direction = '';
  if (deltaY < 0) direction = 'up';
  else if (deltaY > 0) direction = 'down';
  else if (deltaX < 0) direction = 'left';
  else if (deltaX > 0) direction = 'right';
  
  const scrollPercentage = scrollAfter?.percentScrolled ?? 0;
  
  return { 
    success: true, 
    data: { 
      deltaX, 
      deltaY,
      scrollBefore: scrollBefore ? {
        position: scrollBefore.scrollTop,
        percentScrolled: scrollBefore.percentScrolled
      } : null,
      scrollAfter: scrollAfter ? {
        position: scrollAfter.scrollTop,
        percentScrolled: scrollAfter.percentScrolled,
        pixelsBelow: scrollAfter.pixelsBelow
      } : null
    }, 
    timestamp: Date.now(),
    domChanged,
    message: `Scrolled ${direction} by ${Math.abs(deltaY || deltaX)}px - now at ${scrollPercentage}%${scrollAfter?.pixelsBelow === 0 ? ' (bottom)' : ''}${domChanged ? ' - new content loaded' : ''}`
  };
}

/**
 * Type text action with intelligent timeout and DOM change detection
 */
async function typeAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  if (!action.value) {
    return { 
      success: false, 
      error: 'Type action requires text value', 
      timestamp: Date.now(),
      message: 'No text provided to type'
    };
  }
  
  // Take DOM snapshot before action
  const snapshotBefore = await getDOMSnapshot(tabId);
  
  // If target specified, validate and focus it first
  if (action.target) {
    const validation = await validateRef(tabId, action.target);
    if (!validation.valid) {
      return {
        success: false,
        error: `Cannot type: ${validation.error}`,
        timestamp: Date.now(),
        message: `Cannot type into element "${action.target}" - element not found or not accessible`
      };
    }
    await focusElement(tabId, action.target);
  }
  
  // Calculate timeout based on text length
  const timeout = calculateTypingTimeout(action.value);
  
  // Insert text with calculated timeout consideration
  await cdp.insertText(tabId, action.value);
  
  // Small delay proportional to text length for DOM to update
  const waitTime = Math.min(action.value.length * 5, 500);
  await new Promise(resolve => setTimeout(resolve, waitTime));
  
  // Check for DOM changes after action
  const snapshotAfter = await getDOMSnapshot(tabId);
  const domChanged = hasDOMChanged(snapshotBefore, snapshotAfter);
  
  return { 
    success: true, 
    data: { 
      text: action.value,
      charCount: action.value.length,
      calculatedTimeout: timeout
    }, 
    timestamp: Date.now(),
    domChanged,
    message: `Typed ${action.value.length} characters${action.target ? ` into "${action.target}"` : ''}${domChanged ? ' - page updated' : ''}`
  };
}

/**
 * Key press action
 */
async function keyAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  if (!action.value) {
    return { success: false, error: 'Key action requires key value', timestamp: Date.now() };
  }
  
  // Common key mappings
  const keyMap: Record<string, { code: string; virtualKeyCode: number }> = {
    'Enter': { code: 'Enter', virtualKeyCode: 13 },
    'Tab': { code: 'Tab', virtualKeyCode: 9 },
    'Escape': { code: 'Escape', virtualKeyCode: 27 },
    'Backspace': { code: 'Backspace', virtualKeyCode: 8 },
    'Delete': { code: 'Delete', virtualKeyCode: 46 },
    'ArrowUp': { code: 'ArrowUp', virtualKeyCode: 38 },
    'ArrowDown': { code: 'ArrowDown', virtualKeyCode: 40 },
    'ArrowLeft': { code: 'ArrowLeft', virtualKeyCode: 37 },
    'ArrowRight': { code: 'ArrowRight', virtualKeyCode: 39 },
    'Home': { code: 'Home', virtualKeyCode: 36 },
    'End': { code: 'End', virtualKeyCode: 35 },
    'PageUp': { code: 'PageUp', virtualKeyCode: 33 },
    'PageDown': { code: 'PageDown', virtualKeyCode: 34 },
  };
  
  const keyInfo = keyMap[action.value] || { code: action.value, virtualKeyCode: 0 };
  await cdp.pressKey(tabId, action.value, keyInfo);
  
  return { success: true, data: { key: action.value }, timestamp: Date.now() };
}

/**
 * Drag action
 */
async function dragAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  if (action.x === undefined || action.y === undefined ||
      action.endX === undefined || action.endY === undefined) {
    return { success: false, error: 'Drag requires start (x,y) and end (endX,endY) coordinates', timestamp: Date.now() };
  }
  
  await cdp.drag(tabId, action.x, action.y, action.endX, action.endY);
  return { 
    success: true, 
    data: { 
      start: { x: action.x, y: action.y }, 
      end: { x: action.endX, y: action.endY } 
    }, 
    timestamp: Date.now() 
  };
}

/**
 * Screenshot action
 */
async function screenshotAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  const format = (action.value as 'png' | 'jpeg') || 'png';
  const screenshot = await cdp.captureScreenshot(tabId, { format });
  
  return { 
    success: true, 
    data: { format },
    screenshot: `data:image/${format};base64,${screenshot}`,
    timestamp: Date.now() 
  };
}

/**
 * Read page action - get accessibility tree
 */
async function readPageAction(tabId: number): Promise<ActionResult> {
  try {
    // Get page info
    const title = await cdp.getPageTitle(tabId);
    const url = await cdp.getPageURL(tabId);
    
    // Get accessibility tree from content script
    const tree = await getAccessibilityTree(tabId);
    
    // Get text content as fallback
    const text = await cdp.getPageText(tabId);
    
    return {
      success: true,
      data: {
        title,
        url,
        tree,
        textContent: text.slice(0, 10000) // Limit text content
      },
      timestamp: Date.now()
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Find text on page
 */
async function findAction(tabId: number, query: string): Promise<ActionResult> {
  const result = await cdp.findOnPage(tabId, query);
  return {
    success: true,
    data: result,
    timestamp: Date.now()
  };
}

/**
 * Get element coordinates from content script
 */
async function getElementCoordinates(
  tabId: number,
  ref: string
): Promise<{ x: number; y: number } | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (elementRef: string) => {
        const bounds = (window as any).__getBoundsByRef?.(elementRef);
        if (!bounds) return null;
        return {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2
        };
      },
      args: [ref]
    });
    
    return results[0]?.result || null;
  } catch (error) {
    console.error('[Tools] Failed to get element coordinates:', error);
    return null;
  }
}

/**
 * Focus an element by ref
 */
async function focusElement(tabId: number, ref: string): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (elementRef: string) => {
        return (window as any).__focusRef?.(elementRef) || false;
      },
      args: [ref]
    });
    
    return results[0]?.result || false;
  } catch (error) {
    console.error('[Tools] Failed to focus element:', error);
    return false;
  }
}

/**
 * Get accessibility tree from content script
 */
async function getAccessibilityTree(tabId: number): Promise<AccessibilityNode | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return (window as any).__generateAccessibilityTree?.(10, false) || null;
      }
    });
    
    return results[0]?.result || null;
  } catch (error) {
    console.error('[Tools] Failed to get accessibility tree:', error);
    return null;
  }
}

/**
 * Set value on an element by ref
 */
export async function setElementValue(
  tabId: number,
  ref: string,
  value: string
): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (elementRef: string, val: string) => {
        return (window as any).__setValueByRef?.(elementRef, val) || false;
      },
      args: [ref, value]
    });
    
    return results[0]?.result || false;
  } catch (error) {
    console.error('[Tools] Failed to set element value:', error);
    return false;
  }
}

/**
 * Get tabs context
 */
export async function getTabsContext(currentOnly: boolean = false): Promise<any> {
  if (currentOnly) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return null;
    
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      status: tab.status
    };
  }
  
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.map(tab => ({
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    status: tab.status,
    groupId: tab.groupId
  }));
}

/**
 * Create a new tab
 */
export async function createTab(url: string, active: boolean = true): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url, active });
}

/**
 * Take a screenshot of the current tab
 */
export async function takeScreenshot(
  tabId: number,
  options: { format?: 'png' | 'jpeg'; quality?: number; fullPage?: boolean } = {}
): Promise<string> {
  if (options.fullPage) {
    return cdp.captureFullPageScreenshot(
      tabId,
      options.format || 'png',
      options.quality || 80
    );
  }
  
  return cdp.captureScreenshot(tabId, {
    format: options.format || 'png',
    quality: options.quality
  });
}

/**
 * Get page content
 */
export async function getPageContent(tabId: number): Promise<{
  title: string;
  url: string;
  text: string;
  html: string;
}> {
  const [title, url, text, html] = await Promise.all([
    cdp.getPageTitle(tabId),
    cdp.getPageURL(tabId),
    cdp.getPageText(tabId),
    cdp.getPageHTML(tabId)
  ]);
  
  return { title, url, text, html };
}

// Re-export tab group functions
export {
  tabGroups
};
