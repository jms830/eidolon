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
    
    // Expose API on window for background script to call via scripting.executeScript
    (window as any).__eidolonIndicator = {
      show: showIndicator,
      hide: hideIndicator,
      updateStatus,
      showClick: showClickIndicator,
      showLabel: showActionLabel,
      isActive: () => isActive
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
      }
    });
    
    console.log('[Eidolon] Agent indicator script loaded');
  }
});
