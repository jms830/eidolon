/**
 * Conversation extraction utilities
 */

import type { Conversation, Message } from './types';
import type { Platform } from './platforms';

/**
 * Get conversation ID from current URL (legacy - use platforms.ts)
 */
export function getConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/chat\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * Check if current page is a conversation page (legacy - use platforms.ts)
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

  // Extract title - try multiple selectors
  let title = 'Untitled Conversation';
  
  // Try various selectors Claude uses for conversation title
  const titleSelectors = [
    'h1',
    '[class*="ConversationTitle"]',
    '[class*="conversation-title"]',
    'button[aria-label*="Rename"]',
    'div[contenteditable="true"]',
    '[data-testid*="title"]',
    'header h1',
    'main h1'
  ];
  
  console.log('[Eidolon Export] Attempting to extract title...');
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    console.log(`[Eidolon Export] Selector "${selector}":`, element?.textContent?.trim() || 'NOT FOUND');
    if (element?.textContent?.trim()) {
      title = element.textContent.trim();
      console.log('[Eidolon Export] ✓ Using title from selector:', selector);
      break;
    }
  }
  
  console.log('[Eidolon Export] Final title:', title);

  // Extract messages
  const messages: Message[] = [];
  let msgIndex = 0;

  // Try to find message containers
  const messageSelectors = [
    '.font-user-message',
    '.font-claude-message',
    '[data-test-render-count]',
    '[class*="font-user"]',
    '[class*="font-claude"]',
    '[class*="message"]'
  ];

  console.log('[Eidolon Export] Attempting to extract messages...');
  
  const messageElements: Element[] = [];
  messageSelectors.forEach(selector => {
    const found = document.querySelectorAll(selector);
    console.log(`[Eidolon Export] Selector "${selector}" found:`, found.length, 'elements');
    found.forEach(el => {
      if (!messageElements.includes(el)) {
        messageElements.push(el);
      }
    });
  });
  
  console.log('[Eidolon Export] Total unique message elements:', messageElements.length);

  messageElements.forEach((elem, idx) => {
    const isUser = elem.classList.contains('font-user-message') || 
                   elem.closest('[class*="user"]') !== null;
    
    // Get text content, excluding thinking blocks
    const clonedElem = elem.cloneNode(true) as Element;
    
    // Remove thinking blocks from clone
    clonedElem.querySelectorAll('[class*="thinking"]').forEach(block => {
      block.remove();
    });
    
    const content = clonedElem.textContent?.trim() || '';
    
    console.log(`[Eidolon Export] Message ${idx}:`, {
      isUser,
      contentLength: content.length,
      preview: content.substring(0, 50)
    });
    
    if (content) {
      messages.push({
        id: `msg-dom-${msgIndex++}`,
        role: isUser ? 'user' : 'assistant',
        content,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  console.log('[Eidolon Export] Extracted', messages.length, 'messages from DOM');
  
  // If no messages found, log DOM structure for debugging
  if (messages.length === 0) {
    console.warn('[Eidolon Export] No messages found! Debugging DOM structure...');
    console.log('[Eidolon Export] Available classes in document:', 
      Array.from(document.querySelectorAll('[class*="font"]'))
        .map(el => el.className)
        .slice(0, 10)
    );
  }

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

// ========================================================================
// PLATFORM-SPECIFIC EXTRACTORS
// ========================================================================

/**
 * Extract ChatGPT conversation from DOM
 */
export function extractChatGPT(conversationId: string): Conversation {
  console.log('[Eidolon Export] Extracting ChatGPT conversation...');
  
  // Extract title from document title or page heading
  let title = document.title.replace(' - ChatGPT', '').trim() || 'Untitled Conversation';
  
  // Try to find title in page
  const titleSelectors = [
    'h1',
    '[class*="conversation-title"]',
    '[data-testid*="title"]'
  ];
  
  for (const selector of titleSelectors) {
    const elem = document.querySelector(selector);
    if (elem?.textContent?.trim()) {
      title = elem.textContent.trim();
      break;
    }
  }
  
  console.log('[Eidolon Export] ChatGPT title:', title);
  
  // Extract messages from article elements
  const messages: Message[] = [];
  const articles = document.querySelectorAll('article');
  
  articles.forEach((article, idx) => {
    const header = article.querySelector('h5')?.textContent?.toLowerCase();
    const isUser = header?.includes('you said') || header?.includes('you');
    
    // Get all text divs in the article
    const textDivs = article.querySelectorAll('div.text-base');
    let fullText = '';
    
    textDivs.forEach(div => {
      const text = div.textContent?.trim();
      if (text) {
        fullText += text + '\n';
      }
    });
    
    if (fullText.trim()) {
      messages.push({
        id: `msg-chatgpt-${idx}`,
        role: isUser ? 'user' : 'assistant',
        content: fullText.trim(),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  console.log('[Eidolon Export] Extracted', messages.length, 'ChatGPT messages');
  
  return {
    id: conversationId,
    title,
    messages,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Extract Gemini conversation from DOM
 */
export function extractGemini(conversationId: string): Conversation {
  console.log('[Eidolon Export] Extracting Gemini conversation...');
  
  // Extract title from sidebar or document title
  let title = 'Untitled Conversation';
  
  const titleSelectors = [
    'div[data-test-id="conversation"].selected .conversation-title',
    'h1',
    '[class*="conversation-title"]'
  ];
  
  for (const selector of titleSelectors) {
    const elem = document.querySelector(selector);
    if (elem?.textContent?.trim()) {
      title = elem.textContent.trim();
      break;
    }
  }
  
  // Remove "Gemini - " prefix if present
  title = title.replace(/^Gemini\s*-\s*/i, '').trim() || 'Untitled Conversation';
  
  console.log('[Eidolon Export] Gemini title:', title);
  
  // Extract messages from user-query and model-response elements
  const messages: Message[] = [];
  const messageElements = document.querySelectorAll('user-query, model-response');
  
  messageElements.forEach((elem, idx) => {
    const tagName = elem.tagName.toLowerCase();
    const isUser = tagName === 'user-query';
    
    // Get message content
    const contentSelector = isUser ? 'div.query-content' : 'message-content';
    const contentElem = elem.querySelector(contentSelector);
    const content = contentElem?.textContent?.trim() || '';
    
    if (content) {
      messages.push({
        id: `msg-gemini-${idx}`,
        role: isUser ? 'user' : 'assistant',
        content,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  console.log('[Eidolon Export] Extracted', messages.length, 'Gemini messages');
  
  return {
    id: conversationId,
    title,
    messages,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Extract conversation using platform-specific extractor
 */
export function extractByPlatform(platform: Platform, conversationId: string): Conversation {
  switch (platform) {
    case 'claude':
      return extractFromDOM();
    case 'chatgpt':
      return extractChatGPT(conversationId);
    case 'gemini':
      return extractGemini(conversationId);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Wait for conversation to load based on platform
 */
export function waitForPlatformLoad(platform: Platform): Promise<void> {
  return new Promise((resolve) => {
    let selector: string;
    
    switch (platform) {
      case 'claude':
        selector = '.font-user-message, .font-claude-message';
        break;
      case 'chatgpt':
        selector = 'article';
        break;
      case 'gemini':
        selector = 'user-query, model-response';
        break;
      default:
        resolve();
        return;
    }
    
    // Check if already loaded
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    
    // Wait for messages to appear
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
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
