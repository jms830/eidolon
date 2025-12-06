/**
 * Agent Visual Indicator Content Script
 * 
 * Shows visual feedback when Claude is controlling the browser.
 * Displays a glow border and stop button for user control.
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  
  main() {
    let indicatorContainer: HTMLElement | null = null;
    let isActive = false;
    
    // Styles for the indicator
    const styles = `
      #eidolon-agent-indicator {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 2147483647;
        display: none;
      }
      
      #eidolon-agent-indicator.active {
        display: block;
      }
      
      #eidolon-agent-indicator .glow-border {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 4px solid #f97316;
        box-shadow: inset 0 0 20px rgba(249, 115, 22, 0.3);
        animation: eidolon-pulse 2s ease-in-out infinite;
      }
      
      @keyframes eidolon-pulse {
        0%, 100% {
          border-color: #f97316;
          box-shadow: inset 0 0 20px rgba(249, 115, 22, 0.3);
        }
        50% {
          border-color: #fb923c;
          box-shadow: inset 0 0 30px rgba(249, 115, 22, 0.5);
        }
      }
      
      #eidolon-agent-indicator .status-bar {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 20px;
        background: rgba(0, 0, 0, 0.85);
        border-radius: 24px;
        pointer-events: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      
      #eidolon-agent-indicator .status-text {
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      #eidolon-agent-indicator .status-dot {
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
        animation: eidolon-blink 1s ease-in-out infinite;
      }
      
      @keyframes eidolon-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      #eidolon-agent-indicator .stop-btn {
        padding: 8px 16px;
        background: #ef4444;
        color: #fff;
        border: none;
        border-radius: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      #eidolon-agent-indicator .stop-btn:hover {
        background: #dc2626;
      }
      
      #eidolon-agent-indicator .action-label {
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        padding: 6px 12px;
        border-radius: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        pointer-events: none;
        transform: translate(-50%, -100%);
        margin-top: -10px;
        white-space: nowrap;
      }
      
      #eidolon-agent-indicator .click-indicator {
        position: absolute;
        width: 30px;
        height: 30px;
        border: 3px solid #f97316;
        border-radius: 50%;
        pointer-events: none;
        transform: translate(-50%, -50%);
        animation: eidolon-click 0.5s ease-out forwards;
      }
      
      @keyframes eidolon-click {
        0% {
          transform: translate(-50%, -50%) scale(0.5);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -50%) scale(1.5);
          opacity: 0;
        }
      }
      
      /* BrowserMCP-style numbered element overlays */
      #eidolon-agent-indicator .element-overlay-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      
      #eidolon-agent-indicator .element-highlight {
        position: absolute;
        border: 2px solid rgba(249, 115, 22, 0.8);
        background: rgba(249, 115, 22, 0.1);
        pointer-events: none;
        box-sizing: border-box;
        transition: all 0.15s ease-out;
      }
      
      #eidolon-agent-indicator .element-highlight:hover {
        background: rgba(249, 115, 22, 0.2);
      }
      
      #eidolon-agent-indicator .element-index {
        position: absolute;
        top: -8px;
        left: -8px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        background: #f97316;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
        font-size: 11px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        border-radius: 9px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        z-index: 1;
      }
      
      #eidolon-agent-indicator .element-index.large {
        min-width: 24px;
        height: 20px;
        line-height: 20px;
        font-size: 10px;
        border-radius: 10px;
      }
      
      #eidolon-agent-indicator .element-tooltip {
        position: absolute;
        bottom: calc(100% + 4px);
        left: 50%;
        transform: translateX(-50%);
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
        font-size: 11px;
        white-space: nowrap;
        border-radius: 4px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease-out;
      }
      
      #eidolon-agent-indicator .element-highlight:hover .element-tooltip {
        opacity: 1;
      }
    `;
    
    /**
     * Create the indicator container
     */
    function createIndicator(): HTMLElement {
      // Add styles
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
      
      // Create container
      const container = document.createElement('div');
      container.id = 'eidolon-agent-indicator';
      container.innerHTML = `
        <div class="glow-border"></div>
        <div class="status-bar">
          <div class="status-text">
            <span class="status-dot"></span>
            <span class="status-message">Eidolon is working...</span>
          </div>
          <button class="stop-btn">Stop</button>
        </div>
      `;
      
      // Handle stop button
      const stopBtn = container.querySelector('.stop-btn');
      if (stopBtn) {
        stopBtn.addEventListener('click', () => {
          browser.runtime.sendMessage({ type: 'STOP_AGENT' });
          hideIndicator();
        });
      }
      
      document.body.appendChild(container);
      return container;
    }
    
    /**
     * Show the indicator
     */
    function showIndicator(message?: string): void {
      if (!indicatorContainer) {
        indicatorContainer = createIndicator();
      }
      
      if (message) {
        const msgEl = indicatorContainer.querySelector('.status-message');
        if (msgEl) {
          msgEl.textContent = message;
        }
      }
      
      indicatorContainer.classList.add('active');
      isActive = true;
    }
    
    /**
     * Hide the indicator
     */
    function hideIndicator(): void {
      if (indicatorContainer) {
        indicatorContainer.classList.remove('active');
      }
      isActive = false;
    }
    
    /**
     * Update status message
     */
    function updateStatus(message: string): void {
      if (indicatorContainer) {
        const msgEl = indicatorContainer.querySelector('.status-message');
        if (msgEl) {
          msgEl.textContent = message;
        }
      }
    }
    
    /**
     * Show click indicator at position
     */
    function showClickIndicator(x: number, y: number): void {
      if (!indicatorContainer) return;
      
      const click = document.createElement('div');
      click.className = 'click-indicator';
      click.style.left = `${x}px`;
      click.style.top = `${y}px`;
      indicatorContainer.appendChild(click);
      
      // Remove after animation
      setTimeout(() => {
        click.remove();
      }, 500);
    }
    
    /**
     * Show action label at position
     */
    function showActionLabel(x: number, y: number, text: string, duration: number = 2000): void {
      if (!indicatorContainer) return;
      
      const label = document.createElement('div');
      label.className = 'action-label';
      label.textContent = text;
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      indicatorContainer.appendChild(label);
      
      // Remove after duration
      setTimeout(() => {
        label.remove();
      }, duration);
    }
    
    // ========================================================================
    // BrowserMCP-style Numbered Element Overlay System
    // ========================================================================
    
    interface ElementOverlayInfo {
      index: number;
      ref: string;
      bounds: { x: number; y: number; width: number; height: number };
      tagName: string;
      role?: string;
      name?: string;
    }
    
    let overlayContainer: HTMLElement | null = null;
    let currentOverlays: Map<string, HTMLElement> = new Map();
    
    /**
     * Create the overlay container if it doesn't exist
     */
    function ensureOverlayContainer(): HTMLElement {
      if (!indicatorContainer) {
        indicatorContainer = createIndicator();
      }
      
      if (!overlayContainer) {
        overlayContainer = document.createElement('div');
        overlayContainer.className = 'element-overlay-container';
        indicatorContainer.appendChild(overlayContainer);
      }
      
      return overlayContainer;
    }
    
    /**
     * Show numbered overlays on interactive elements
     * Inspired by BrowserMCP's element highlighting system
     */
    function showElementOverlays(elements: ElementOverlayInfo[]): void {
      const container = ensureOverlayContainer();
      
      // Clear existing overlays
      clearElementOverlays();
      
      // Create new overlays
      elements.forEach((el) => {
        const highlight = document.createElement('div');
        highlight.className = 'element-highlight';
        highlight.style.left = `${el.bounds.x}px`;
        highlight.style.top = `${el.bounds.y}px`;
        highlight.style.width = `${el.bounds.width}px`;
        highlight.style.height = `${el.bounds.height}px`;
        
        // Index badge
        const indexBadge = document.createElement('div');
        indexBadge.className = el.index >= 100 ? 'element-index large' : 'element-index';
        indexBadge.textContent = String(el.index);
        highlight.appendChild(indexBadge);
        
        // Tooltip with element info
        const tooltip = document.createElement('div');
        tooltip.className = 'element-tooltip';
        const tooltipText = [
          `[${el.index}]`,
          el.tagName.toLowerCase(),
          el.role ? `role="${el.role}"` : '',
          el.name ? `"${el.name.slice(0, 30)}${el.name.length > 30 ? '...' : ''}"` : ''
        ].filter(Boolean).join(' ');
        tooltip.textContent = tooltipText;
        highlight.appendChild(tooltip);
        
        container.appendChild(highlight);
        currentOverlays.set(el.ref, highlight);
      });
      
      // Show indicator if not already visible
      if (indicatorContainer && !indicatorContainer.classList.contains('active')) {
        indicatorContainer.classList.add('active');
      }
    }
    
    /**
     * Clear all element overlays
     */
    function clearElementOverlays(): void {
      currentOverlays.forEach(overlay => overlay.remove());
      currentOverlays.clear();
    }
    
    /**
     * Highlight a specific element by ref (for showing which element will be acted upon)
     */
    function highlightElement(ref: string, color: string = '#22c55e'): void {
      const overlay = currentOverlays.get(ref);
      if (overlay) {
        overlay.style.borderColor = color;
        overlay.style.background = color.replace(')', ', 0.2)').replace('rgb', 'rgba');
        
        // Reset after a short delay
        setTimeout(() => {
          overlay.style.borderColor = '';
          overlay.style.background = '';
        }, 1000);
      }
    }
    
    /**
     * Flash an element to indicate an action is about to happen
     */
    function flashElement(ref: string): void {
      const overlay = currentOverlays.get(ref);
      if (overlay) {
        overlay.style.animation = 'eidolon-pulse 0.3s ease-in-out 2';
        setTimeout(() => {
          overlay.style.animation = '';
        }, 600);
      }
    }
    
    /**
     * Get overlays for interactive elements on the page
     * Uses the accessibility tree content script functions
     */
    function getInteractiveElementOverlays(): ElementOverlayInfo[] {
      const getElements = (window as any).__getInteractiveElementsWithIndex;
      if (getElements) {
        return getElements();
      }
      
      // Fallback: manually find interactive elements
      const interactiveSelector = 'a, button, input, select, textarea, [onclick], [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
      const elements = document.querySelectorAll(interactiveSelector);
      const result: ElementOverlayInfo[] = [];
      
      elements.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          result.push({
            index: index + 1,
            ref: `fallback-${index}`,
            bounds: {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height
            },
            tagName: el.tagName,
            role: el.getAttribute('role') || undefined,
            name: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 50) || undefined
          });
        }
      });
      
      return result;
    }
    
    /**
     * Refresh overlays based on current page state
     */
    function refreshOverlays(): void {
      const elements = getInteractiveElementOverlays();
      showElementOverlays(elements);
    }
    
    // Expose API on window for background script to call via scripting.executeScript
    (window as any).__eidolonIndicator = {
      // Core indicator functions
      show: showIndicator,
      hide: hideIndicator,
      updateStatus,
      showClick: showClickIndicator,
      showLabel: showActionLabel,
      isActive: () => isActive,
      
      // BrowserMCP-style element overlay functions
      showElementOverlays,
      clearElementOverlays,
      highlightElement,
      flashElement,
      refreshOverlays,
      getInteractiveElementOverlays
    };
    
    // Listen for messages
    browser.runtime.onMessage.addListener((message: any) => {
      switch (message.type) {
        case 'SHOW_AGENT_INDICATOR':
          showIndicator(message.message);
          break;
        case 'HIDE_AGENT_INDICATOR':
          hideIndicator();
          break;
        case 'UPDATE_AGENT_STATUS':
          updateStatus(message.message);
          break;
        case 'SHOW_CLICK_INDICATOR':
          showClickIndicator(message.x, message.y);
          break;
        case 'SHOW_ACTION_LABEL':
          showActionLabel(message.x, message.y, message.text, message.duration);
          break;
        // BrowserMCP-style overlay messages
        case 'SHOW_ELEMENT_OVERLAYS':
          if (message.elements) {
            showElementOverlays(message.elements);
          } else {
            refreshOverlays();
          }
          break;
        case 'CLEAR_ELEMENT_OVERLAYS':
          clearElementOverlays();
          break;
        case 'HIGHLIGHT_ELEMENT':
          highlightElement(message.ref, message.color);
          break;
        case 'FLASH_ELEMENT':
          flashElement(message.ref);
          break;
        case 'REFRESH_OVERLAYS':
          refreshOverlays();
          break;
      }
    });
    
    console.log('[Eidolon] Agent indicator script loaded');
  }
});
