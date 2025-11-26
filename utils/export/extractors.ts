/**
 * Conversation extraction utilities
 */

import type { Conversation, Message } from './types';

/**
 * Get conversation ID from current URL
 */
export function getConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/chat\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * Check if current page is a conversation page
 */
export function isConversationPage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/chat/') && !!getConversationId();
}

/**
 * Extract conversation from DOM (fallback method)
 */
export function extractFromDOM(): Conversation {
  const conversationId = getConversationId();
  if (!conversationId) {
    throw new Error('Not on a conversation page');
  }

  // Extract title
  const titleElement = document.querySelector('h1, [class*="title"]');
  const title = titleElement?.textContent?.trim() || 'Untitled Conversation';

  // Extract messages
  const messages: Message[] = [];
  let msgIndex = 0;

  // Try to find message containers
  const messageSelectors = [
    '.font-user-message',
    '.font-claude-message',
    '[data-test-render-count]', // Alternative selector
  ];

  const messageElements: Element[] = [];
  messageSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      if (!messageElements.includes(el)) {
        messageElements.push(el);
      }
    });
  });

  messageElements.forEach((elem) => {
    const isUser = elem.classList.contains('font-user-message') || 
                   elem.closest('[class*="user"]') !== null;
    
    // Get text content, excluding thinking blocks
    const clonedElem = elem.cloneNode(true) as Element;
    
    // Remove thinking blocks from clone
    clonedElem.querySelectorAll('[class*="thinking"]').forEach(block => {
      block.remove();
    });
    
    const content = clonedElem.textContent?.trim() || '';
    
    if (content) {
      messages.push({
        id: `msg-dom-${msgIndex++}`,
        role: isUser ? 'user' : 'assistant',
        content,
        timestamp: new Date().toISOString()
      });
    }
  });

  return {
    id: conversationId,
    title,
    messages,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Fetch conversation via API (preferred method)
 */
export async function fetchViaAPI(conversationId: string): Promise<Conversation> {
  // @ts-ignore - browser global from WXT
  const response = await browser.runtime.sendMessage({
    action: 'get-conversation-details',
    conversationId
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to fetch conversation');
  }

  return response.data;
}

/**
 * Extract conversation using best available method
 */
export async function extractConversation(): Promise<Conversation> {
  const conversationId = getConversationId();
  if (!conversationId) {
    throw new Error('Not on a conversation page');
  }

  // Try API first
  try {
    console.log('[Eidolon] Fetching conversation via API...');
    return await fetchViaAPI(conversationId);
  } catch (error) {
    console.warn('[Eidolon] API fetch failed, falling back to DOM extraction:', error);
    return extractFromDOM();
  }
}

/**
 * Wait for conversation to load on page
 */
export function waitForConversationLoad(): Promise<void> {
  return new Promise((resolve) => {
    // Check if already loaded
    if (document.querySelector('.font-user-message, .font-claude-message')) {
      resolve();
      return;
    }

    // Wait for messages to appear
    const observer = new MutationObserver(() => {
      if (document.querySelector('.font-user-message, .font-claude-message')) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 10000);
  });
}
