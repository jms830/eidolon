# DOM Inspector for Claude.ai

If the extension is not finding messages or titles, paste this code into the browser console on a Claude.ai conversation page to inspect the DOM structure:

```javascript
// DOM Inspector for Claude.ai Conversation Pages
console.log('=== EIDOLON DOM INSPECTOR ===');

// 1. Check conversation ID
const conversationId = window.location.pathname.match(/\/chat\/([^/?]+)/)?.[1];
console.log('Conversation ID:', conversationId);

// 2. Find title elements
console.log('\n=== TITLE CANDIDATES ===');
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

titleSelectors.forEach(selector => {
  const elem = document.querySelector(selector);
  if (elem) {
    console.log(`✓ ${selector}:`, elem.textContent?.trim());
  } else {
    console.log(`✗ ${selector}: NOT FOUND`);
  }
});

// 3. Find all h1 elements
console.log('\n=== ALL H1 ELEMENTS ===');
document.querySelectorAll('h1').forEach((h1, idx) => {
  console.log(`H1 #${idx}:`, h1.textContent?.trim(), h1.className);
});

// 4. Find message elements
console.log('\n=== MESSAGE CANDIDATES ===');
const messageSelectors = [
  '.font-user-message',
  '.font-claude-message',
  '[data-test-render-count]',
  '[class*="font-user"]',
  '[class*="font-claude"]',
  '[class*="message"]'
];

messageSelectors.forEach(selector => {
  const elems = document.querySelectorAll(selector);
  console.log(`${selector}: ${elems.length} found`);
  if (elems.length > 0 && elems.length < 5) {
    elems.forEach((elem, idx) => {
      console.log(`  [${idx}] Preview:`, elem.textContent?.trim().substring(0, 50));
    });
  }
});

// 5. Sample all elements with "font" in class name
console.log('\n=== ELEMENTS WITH "font" IN CLASS ===');
const fontElems = Array.from(document.querySelectorAll('[class*="font"]'));
const uniqueClasses = [...new Set(fontElems.map(el => el.className))];
console.log('Unique classes:', uniqueClasses.slice(0, 10));

// 6. Check for common conversation container patterns
console.log('\n=== CONVERSATION CONTAINER ===');
const containerSelectors = [
  'main',
  '[role="main"]',
  '.conversation',
  '[class*="conversation"]',
  '[class*="chat"]'
];

containerSelectors.forEach(selector => {
  const elem = document.querySelector(selector);
  if (elem) {
    console.log(`✓ ${selector}: Found (${elem.children.length} children)`);
  }
});

// 7. Show actual message structure
console.log('\n=== ACTUAL MESSAGE STRUCTURE ===');
const main = document.querySelector('main');
if (main) {
  const children = Array.from(main.children);
  console.log('Main element children:', children.length);
  children.slice(0, 3).forEach((child, idx) => {
    console.log(`Child ${idx}:`, {
      tagName: child.tagName,
      className: child.className,
      hasText: child.textContent?.trim().length ?? 0,
      preview: child.textContent?.trim().substring(0, 50)
    });
  });
}

console.log('\n=== END INSPECTOR ===');
```

## How to Use:

1. Go to a Claude.ai conversation page with messages
2. Open DevTools (F12)
3. Go to Console tab
4. Paste the entire code block above
5. Press Enter
6. Copy the output and share it so we can identify the correct selectors

## What to Look For:

- **Title**: Which selector successfully finds the conversation title?
- **Messages**: Which selector finds the message elements?
- **Classes**: What are the actual class names being used?
