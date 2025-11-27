/**
 * Multi-platform conversation export content script
 * Injects export UI into Claude, ChatGPT, and Gemini conversation pages
 */

import { extractByPlatform, waitForPlatformLoad } from '../utils/export/extractors';
import { exportAsMarkdown, exportAsJSON, downloadFile } from '../utils/export/formatters';
import { detectPlatform, getConversationId, isExportEnabled, PLATFORMS } from '../utils/export/platforms';
import type { Conversation } from '../utils/export/types';
import type { Platform } from '../utils/export/platforms';

// @ts-ignore - defineContentScript is a WXT global
export default defineContentScript({
  matches: [
    'https://claude.ai/chat/*',
    'https://chat.openai.com/*',
    'https://chatgpt.com/*',
    'https://gemini.google.com/*'
  ],
  
  async main() {
    console.log('[Eidolon Export] Content script loaded');
    
    // Detect platform
    const platform = detectPlatform();
    if (!platform) {
      console.log('[Eidolon Export] Unknown platform, skipping');
      return;
    }
    
    console.log('[Eidolon Export] Detected platform:', platform);
    
    // Check if export is enabled for this platform
    const enabled = await isExportEnabled(platform);
    if (!enabled) {
      console.log('[Eidolon Export] Export disabled for platform:', platform);
      return;
    }
    
    // Check if on conversation page
    const conversationId = getConversationId(platform);
    if (!conversationId) {
      console.log('[Eidolon Export] Not a conversation page, skipping');
      return;
    }
    
    console.log('[Eidolon Export] Conversation ID:', conversationId);
    
    // Wait for conversation to load, then inject UI
    waitForPlatformLoad(platform).then(() => {
      console.log('[Eidolon Export] Conversation loaded, injecting UI');
      injectExportUI(platform, conversationId);
    });
  }
});

/**
 * Inject the export UI into the page
 */
function injectExportUI(platform: Platform, conversationId: string) {
  // Check if already injected
  if (document.getElementById('eidolon-export-root')) {
    return;
  }
  
  // Create container with Shadow DOM
  const container = document.createElement('div');
  container.id = 'eidolon-export-root';
  document.body.appendChild(container);
  
  const shadow = container.attachShadow({ mode: 'open' });
  
  // Create UI manager
  const ui = new ExportUIManager(shadow, platform, conversationId);
  ui.render();
}

/**
 * Export UI Manager - handles all UI logic
 */
class ExportUIManager {
  private shadow: ShadowRoot;
  private platform: Platform;
  private conversationId: string;
  private conversation: Conversation | null = null;
  private selectedMessageIds: Set<string> = new Set();
  
  constructor(shadow: ShadowRoot, platform: Platform, conversationId: string) {
    this.shadow = shadow;
    this.platform = platform;
    this.conversationId = conversationId;
  }
  
  /**
   * Render the complete UI
   */
  render() {
    const styles = this.getStyles();
    const html = this.getHTML();
    
    this.shadow.innerHTML = `
      <style>${styles}</style>
      ${html}
    `;
    
    this.attachEventListeners();
    this.loadConversation();
  }
  
  /**
   * Get CSS styles (matches Claude.ai theme)
   */
  private getStyles(): string {
    return `
      :host {
        all: initial;
      }
      
      .export-panel {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        background: var(--bg-300, #ffffff);
        border: 1px solid var(--border-300, #e5e7eb);
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-size: 14px;
        color: var(--text-000, #1f2937);
        transition: all 0.3s ease;
      }
      
      .export-panel.icon-only {
        width: auto;
        border-radius: 50%;
        padding: 0;
        background: transparent;
        border: none;
        box-shadow: none;
      }
      
      .export-icon-button {
        display: none;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--bg-300, #ffffff);
        border: 1px solid var(--border-300, #e5e7eb);
        cursor: pointer;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      
      .export-icon-button:hover {
        background: var(--bg-200, #f9fafb);
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
      
      .export-panel.icon-only .export-icon-button {
        display: flex;
      }
      
      .export-panel.icon-only .panel-content {
        display: none;
      }
      
      .panel-content {
        width: 320px;
      }
      
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-300, #e5e7eb);
        cursor: pointer;
        user-select: none;
      }
      
      .panel-header:hover {
        background: var(--bg-200, #f9fafb);
      }
      
      .panel-title {
        font-weight: 600;
        font-size: 14px;
        color: var(--text-000, #1f2937);
      }
      
      .collapse-btn {
        background: none;
        border: none;
        font-size: 12px;
        cursor: pointer;
        padding: 4px;
        color: var(--text-200, #6b7280);
        transition: transform 0.3s ease;
      }
      
      .collapse-btn.collapsed {
        transform: rotate(-90deg);
      }
      
      .panel-body {
        max-height: 500px;
        overflow: hidden;
        transition: max-height 0.3s ease, opacity 0.3s ease;
        opacity: 1;
      }
      
      .panel-body.collapsed {
        max-height: 0;
        opacity: 0;
      }
      
      .panel-section {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-300, #e5e7eb);
      }
      
      .section-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-200, #6b7280);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }
      
      .message-list {
        max-height: 300px;
        overflow-y: auto;
      }
      
      .message-item {
        padding: 8px;
        margin-bottom: 4px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      
      .message-item:hover {
        background: var(--bg-200, #f9fafb);
      }
      
      .message-item label {
        display: flex;
        align-items: flex-start;
        cursor: pointer;
        gap: 8px;
      }
      
      .message-item input[type="checkbox"] {
        margin-top: 2px;
        cursor: pointer;
      }
      
      .message-preview {
        flex: 1;
        font-size: 13px;
        color: var(--text-100, #374151);
        line-height: 1.4;
        word-break: break-word;
      }
      
      .actions {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .btn {
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .btn-primary {
        background: #cc785c;
        color: white;
      }
      
      .btn-primary:hover:not(:disabled) {
        background: #b8664e;
      }
      
      .btn-secondary {
        background: var(--bg-200, #f3f4f6);
        color: var(--text-000, #1f2937);
      }
      
      .btn-secondary:hover:not(:disabled) {
        background: var(--bg-300, #e5e7eb);
      }
      
      .select-all {
        padding: 8px;
        margin-bottom: 8px;
        background: var(--bg-100, #f9fafb);
        border-radius: 6px;
      }
      
      .select-all label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      }
      
      .loading {
        text-align: center;
        padding: 20px;
        color: var(--text-200, #6b7280);
      }
      
      .error {
        padding: 12px;
        background: #fee;
        border: 1px solid #fcc;
        border-radius: 6px;
        color: #c00;
        font-size: 13px;
      }
      
      .info-text {
        font-size: 12px;
        color: var(--text-200, #6b7280);
        margin-bottom: 8px;
      }
      
      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        .export-panel {
          background: #1f2937;
          border-color: #374151;
          color: #f3f4f6;
        }
        
        .panel-header:hover {
          background: #374151;
        }
        
        .message-item:hover {
          background: #374151;
        }
        
        .btn-primary {
          background: #d4a574;
        }
        
        .btn-primary:hover:not(:disabled) {
          background: #c79560;
        }
        
        .btn-secondary {
          background: #374151;
          color: #f3f4f6;
        }
        
        .btn-secondary:hover:not(:disabled) {
          background: #4b5563;
        }
        
        .select-all {
          background: #374151;
        }
      }
    `;
  }
  
  /**
   * Get HTML structure
   */
  private getHTML(): string {
    return `
      <div class="export-panel icon-only">
        <button class="export-icon-button" id="icon-btn" title="Export Conversation">
          📥
        </button>
        
        <div class="panel-content">
          <div class="panel-header" id="header">
            <span class="panel-title">Eidolon Export - ${PLATFORMS[this.platform].name}</span>
            <button class="collapse-btn" id="collapse-btn" aria-label="Collapse to Icon">▼</button>
          </div>
          
          <div class="panel-body" id="panel-body">
            <div class="panel-section">
              <div class="section-title">Select Messages</div>
              <div id="content">
                <div class="loading">Loading conversation...</div>
              </div>
            </div>
            
            <div class="actions">
              <button class="btn btn-primary" id="export-md" disabled>
                📄 Export Markdown
              </button>
              <button class="btn btn-primary" id="export-json" disabled>
                📋 Export JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Attach event listeners
   */
  private attachEventListeners() {
    const panel = this.shadow.querySelector('.export-panel');
    const iconBtn = this.shadow.getElementById('icon-btn');
    const collapseBtn = this.shadow.getElementById('collapse-btn');
    
    // Icon button - expand to full panel
    iconBtn?.addEventListener('click', () => {
      panel?.classList.remove('icon-only');
    });
    
    // Collapse button - collapse to icon
    collapseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      panel?.classList.add('icon-only');
    });
    
    // Export buttons
    this.shadow.getElementById('export-md')?.addEventListener('click', () => {
      this.exportConversation('markdown');
    });
    
    this.shadow.getElementById('export-json')?.addEventListener('click', () => {
      this.exportConversation('json');
    });
  }
  
  /**
   * Load conversation data
   */
  private async loadConversation() {
    const content = this.shadow.getElementById('content');
    if (!content) return;
    
    try {
      this.conversation = extractByPlatform(this.platform, this.conversationId);
      console.log('[Eidolon Export] Conversation loaded:', this.conversation);
      
      // Select all user messages by default
      this.conversation.messages.forEach(msg => {
        this.selectedMessageIds.add(msg.id);
      });
      
      this.renderMessageList();
      this.enableExportButtons();
    } catch (error) {
      console.error('[Eidolon Export] Failed to load conversation:', error);
      content.innerHTML = `
        <div class="error">
          Failed to load conversation. Please try refreshing the page.
        </div>
      `;
    }
  }
  
  /**
   * Render message list with checkboxes
   */
  private renderMessageList() {
    const content = this.shadow.getElementById('content');
    if (!content || !this.conversation) return;
    
    const userMessages = this.conversation.messages.filter(m => m.role === 'user');
    
    content.innerHTML = `
      <div class="info-text">
        ${userMessages.length} user message${userMessages.length !== 1 ? 's' : ''} in this conversation
      </div>
      <div class="select-all">
        <label>
          <input type="checkbox" id="select-all" ${this.selectedMessageIds.size === this.conversation.messages.length ? 'checked' : ''} />
          <span>Select All Messages</span>
        </label>
      </div>
      <div class="message-list">
        ${userMessages.map((msg, idx) => `
          <div class="message-item">
            <label>
              <input 
                type="checkbox" 
                class="message-checkbox" 
                data-message-id="${msg.id}"
                ${this.selectedMessageIds.has(msg.id) ? 'checked' : ''}
              />
              <span class="message-preview">
                ${idx + 1}. ${this.truncate(msg.content, 80)}
              </span>
            </label>
          </div>
        `).join('')}
      </div>
    `;
    
    // Attach checkbox listeners
    const selectAll = this.shadow.getElementById('select-all') as HTMLInputElement;
    selectAll?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) {
        this.conversation!.messages.forEach(m => this.selectedMessageIds.add(m.id));
      } else {
        this.selectedMessageIds.clear();
      }
      this.renderMessageList();
    });
    
    const checkboxes = this.shadow.querySelectorAll('.message-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        const msgId = checkbox.dataset.messageId!;
        
        if (checkbox.checked) {
          this.selectedMessageIds.add(msgId);
          // Also add the corresponding assistant message
          const msgIndex = this.conversation!.messages.findIndex(m => m.id === msgId);
          if (msgIndex >= 0 && msgIndex + 1 < this.conversation!.messages.length) {
            this.selectedMessageIds.add(this.conversation!.messages[msgIndex + 1].id);
          }
        } else {
          this.selectedMessageIds.delete(msgId);
          // Also remove the corresponding assistant message
          const msgIndex = this.conversation!.messages.findIndex(m => m.id === msgId);
          if (msgIndex >= 0 && msgIndex + 1 < this.conversation!.messages.length) {
            this.selectedMessageIds.delete(this.conversation!.messages[msgIndex + 1].id);
          }
        }
      });
    });
  }
  
  /**
   * Enable export buttons
   */
  private enableExportButtons() {
    const mdBtn = this.shadow.getElementById('export-md') as HTMLButtonElement;
    const jsonBtn = this.shadow.getElementById('export-json') as HTMLButtonElement;
    
    if (mdBtn) mdBtn.disabled = false;
    if (jsonBtn) jsonBtn.disabled = false;
  }
  
  /**
   * Export conversation
   */
  private async exportConversation(format: 'markdown' | 'json') {
    if (!this.conversation) {
      alert('No conversation loaded');
      return;
    }
    
    try {
      const result = format === 'markdown'
        ? exportAsMarkdown(this.conversation, this.selectedMessageIds)
        : exportAsJSON(this.conversation, this.selectedMessageIds);
      
      downloadFile(result.filename, result.content, result.mimeType);
      
      console.log(`[Eidolon Export] Exported as ${format}:`, result.filename);
    } catch (error) {
      console.error('[Eidolon Export] Export failed:', error);
      alert('Export failed. Please try again.');
    }
  }
  
  /**
   * Truncate text
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}
