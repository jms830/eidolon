export default defineContentScript({
  matches: ['https://claude.ai/*', '*://*.claude.ai/*'],

  main(_ctx) {
    console.log('Eidolon content script loaded on:', location.href);

    // ========================================================================
    // EXTERNAL API - Allow claude.ai to communicate with extension
    // ========================================================================
    
    // Expose a minimal API on the window for claude.ai scripts to use
    // This mirrors the official extension's externally_connectable approach
    const eidolonApi = {
      openSidePanel: (opts?: { prompt?: string; model?: string }) => {
        browser.runtime.sendMessage({
          type: 'open_side_panel',
          prompt: opts?.prompt,
          model: opts?.model,
        });
      },
      isInstalled: true,
    };
    (window as any).__eidolon = eidolonApi;

    // Dispatch event so page scripts know extension is ready
    window.dispatchEvent(new CustomEvent('eidolon-ready', { detail: { version: '2.1.0' } }));

    // Check if we're on a conversation page
    const isConversationPage = location.pathname.includes('/chat/');

    if (isConversationPage) {
      initConversationEnhancements();
    }

    // Watch for route changes (SPA navigation)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        if (currentUrl.includes('/chat/')) {
          initConversationEnhancements();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    function initConversationEnhancements() {
      // Quick Save button removed - using inline export instead
      // Keeping only Save to Project button
      setTimeout(() => {
        injectSaveToProjectButton();
      }, 1000);
    }

    function injectQuickActionsButton() {
      // Check if already injected
      if (document.getElementById('eidolon-quick-actions')) return;

      // Find the conversation header or a suitable location
      const header = document.querySelector('[class*="header"]') || document.querySelector('header');

      if (!header) return;

      // Create quick actions button
      const quickActionsBtn = document.createElement('button');
      quickActionsBtn.id = 'eidolon-quick-actions';
      quickActionsBtn.textContent = '⚡ Quick Save';
      quickActionsBtn.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      `;

      quickActionsBtn.addEventListener('mouseenter', () => {
        quickActionsBtn.style.transform = 'translateY(-2px)';
        quickActionsBtn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
      });

      quickActionsBtn.addEventListener('mouseleave', () => {
        quickActionsBtn.style.transform = 'translateY(0)';
        quickActionsBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
      });

      quickActionsBtn.addEventListener('click', async () => {
        await handleQuickSave();
      });

      document.body.appendChild(quickActionsBtn);
    }

    function injectSaveToProjectButton() {
      // Check if already injected
      if (document.getElementById('eidolon-save-conversation')) return;

      // Find conversation content area
      const conversationArea = document.querySelector('[class*="conversation"]') ||
                              document.querySelector('main');

      if (!conversationArea) return;

      // Create save conversation button
      const saveBtn = document.createElement('button');
      saveBtn.id = 'eidolon-save-conversation';
      saveBtn.textContent = '💾 Save to Project';
      saveBtn.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        z-index: 9999;
        background: white;
        color: #667eea;
        border: 2px solid #667eea;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transition: all 0.2s;
      `;

      saveBtn.addEventListener('mouseenter', () => {
        saveBtn.style.background = '#667eea';
        saveBtn.style.color = 'white';
        saveBtn.style.transform = 'translateY(-2px)';
      });

      saveBtn.addEventListener('mouseleave', () => {
        saveBtn.style.background = 'white';
        saveBtn.style.color = '#667eea';
        saveBtn.style.transform = 'translateY(0)';
      });

      saveBtn.addEventListener('click', async () => {
        await handleSaveConversation();
      });

      document.body.appendChild(saveBtn);
    }

    async function handleQuickSave() {
      // Get selected text or current conversation
      const selectedText = window.getSelection()?.toString();

      if (selectedText) {
        // Save selected text
        await saveToProject(selectedText, 'selection');
      } else {
        // Get conversation content
        const conversationContent = extractConversationContent();
        if (conversationContent) {
          await saveToProject(conversationContent, 'conversation');
        }
      }
    }

    async function handleSaveConversation() {
      const conversationContent = extractConversationContent();
      if (conversationContent) {
        await saveToProject(conversationContent, 'full-conversation');
      }
    }

    function extractConversationContent(): string | null {
      // Try to find conversation messages
      const messages = document.querySelectorAll('[class*="message"]');

      if (messages.length === 0) return null;

      let content = '';
      messages.forEach((msg) => {
        const text = msg.textContent?.trim();
        if (text) {
          content += text + '\n\n---\n\n';
        }
      });

      return content || null;
    }

    async function saveToProject(content: string, type: string) {
      try {
        // Show loading state
        showNotification('Preparing to save...', 'info');

        // Send to background script
        const response = await browser.runtime.sendMessage({
          action: 'store-pending-upload',
          data: {
            type,
            content,
            source: location.href,
            timestamp: new Date().toISOString()
          }
        });

        if (response.success) {
          showNotification('Content saved! Open Eidolon to select project.', 'success');

          // Open extension popup
          try {
            await browser.runtime.sendMessage({ action: 'open-popup' });
          } catch (err) {
            console.log('Could not open popup automatically:', err);
          }
        } else {
          showNotification('Failed to save: ' + response.error, 'error');
        }
      } catch (error) {
        console.error('Save error:', error);
        showNotification('Error saving content', 'error');
      }
    }

    function showNotification(message: string, type: 'info' | 'success' | 'error') {
      // Remove existing notification
      const existing = document.getElementById('eidolon-notification');
      if (existing) existing.remove();

      const notification = document.createElement('div');
      notification.id = 'eidolon-notification';

      const bgColors = {
        info: '#2196F3',
        success: '#4CAF50',
        error: '#f44336'
      };

      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: ${bgColors[type]};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease-out;
      `;

      notification.textContent = message;
      document.body.appendChild(notification);

      // Auto-remove after 3 seconds
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
});
