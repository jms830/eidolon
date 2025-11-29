# Multi-Platform Export Feature

## Overview

Eidolon now supports conversation export across **three major AI platforms**:
- **Claude** (claude.ai)
- **ChatGPT** (chat.openai.com, chatgpt.com)
- **Gemini** (gemini.google.com)

The export functionality automatically detects the platform and uses platform-specific extraction methods to capture conversation data.

## Features

✅ **Platform Auto-Detection** - Automatically identifies which AI platform you're using  
✅ **Unified Export UI** - Same familiar export interface across all platforms  
✅ **Platform-Specific Extractors** - Optimized DOM extraction for each platform  
✅ **Multiple Export Formats** - Markdown and JSON export options  
✅ **Selective Export** - Choose which messages to include  
✅ **Settings Management** - Enable/disable export per platform

## Supported Platforms

### Claude (claude.ai)
- **URL Pattern:** `https://claude.ai/chat/*`
- **Title Extraction:** Multiple fallback selectors for conversation title
- **Message Extraction:** `.font-user-message`, `.font-claude-message`
- **Filters:** Removes thinking blocks and artifact blocks

### ChatGPT (chat.openai.com, chatgpt.com)
- **URL Pattern:** `https://chat.openai.com/*`, `https://chatgpt.com/*`
- **Title Extraction:** Document title or page heading
- **Message Extraction:** `article` elements with header detection
- **Role Detection:** "You said" indicator for user messages

### Gemini (gemini.google.com)
- **URL Pattern:** `https://gemini.google.com/*`
- **Title Extraction:** Sidebar active chat selector or page heading
- **Message Extraction:** `user-query`, `model-response` custom elements
- **Content Selectors:** `.query-content` for users, `message-content` for assistant

## File Structure

```
utils/export/
├── platforms.ts       # Platform detection & configuration
├── extractors.ts      # Platform-specific DOM extractors
├── formatters.ts      # Export format converters (Markdown, JSON)
└── types.ts           # TypeScript interfaces

entrypoints/
└── claude-export.content.ts  # Multi-platform content script
```

## How It Works

### 1. Platform Detection
```typescript
const platform = detectPlatform(); // Returns 'claude' | 'chatgpt' | 'gemini'
```

### 2. Conversation ID Extraction
```typescript
const conversationId = getConversationId(platform);
// Claude: /chat/{id} → extracts {id}
// ChatGPT: /c/{id} → extracts {id}
// Gemini: /app/{id} → extracts {id}
```

### 3. DOM Extraction
```typescript
const conversation = extractByPlatform(platform, conversationId);
```

### 4. Export
```typescript
const result = exportAsMarkdown(conversation, selectedMessageIds);
downloadFile(result.filename, result.content, result.mimeType);
```

## Usage

### For Users

1. **Navigate to a conversation** on Claude, ChatGPT, or Gemini
2. **Click the 📥 export icon** (appears below share button)
3. **Select messages** to export (defaults to all)
4. **Choose format:**
   - **📄 Export Markdown** - Human-readable format with YAML frontmatter
   - **📋 Export JSON** - Structured data format
5. **Download** automatically starts

### Exported File Format

#### Markdown (.md)
```markdown
---
title: Conversation Title
platform: claude
conversation_id: abc123
created_at: 2025-11-26T10:30:00Z
updated_at: 2025-11-26T11:45:00Z
message_count: 4
---

# Conversation Title

## User
First message content here

## Assistant
Response content here

## User
Second message content

## Assistant
Final response
```

#### JSON (.json)
```json
{
  "id": "abc123",
  "title": "Conversation Title",
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "Message text",
      "timestamp": "2025-11-26T10:30:00Z"
    }
  ],
  "created_at": "2025-11-26T10:30:00Z",
  "updated_at": "2025-11-26T11:45:00Z"
}
```

## Settings & Configuration

### Enable/Disable Per Platform

**Via Dashboard (Recommended):**

1. Open the Eidolon Dashboard
2. Click the **Analytics** tab
3. Scroll down to **Export Settings** section
4. Toggle platforms on/off:
   - 🤖 **Claude (claude.ai)** 
   - 💬 **ChatGPT (chat.openai.com)**
   - ✨ **Gemini (gemini.google.com)**
5. Click **💾 Save Export Settings**

Settings are saved to browser storage and apply immediately.

**Via Browser Console (Advanced):**

```javascript
// Check current settings
chrome.storage.local.get('exportPlatformSettings', (result) => {
  console.log(result.exportPlatformSettings);
});

// Enable all platforms (default)
chrome.storage.local.set({
  exportPlatformSettings: {
    claude: true,
    chatgpt: true,
    gemini: true
  }
});

// Disable ChatGPT export
chrome.storage.local.set({
  exportPlatformSettings: {
    claude: true,
    chatgpt: false,  // Disabled
    gemini: true
  }
});
```

## Permissions

The extension requires host permissions for all three platforms:

```json
{
  "host_permissions": [
    "https://claude.ai/*",
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*"
  ]
}
```

## Technical Details

### Platform Detection Logic

```typescript
export function detectPlatform(): Platform | null {
  const hostname = window.location.hostname;
  
  if (hostname.includes('claude.ai')) return 'claude';
  if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) return 'chatgpt';
  if (hostname.includes('gemini.google.com')) return 'gemini';
  
  return null;
}
```

### Platform-Specific Selectors

| Platform | Title Selector | Message Selector | User Indicator |
|----------|---------------|------------------|----------------|
| Claude | `h1`, `[class*="ConversationTitle"]` | `.font-user-message`, `.font-claude-message` | `.font-user-message` class |
| ChatGPT | Document title, `h1` | `article` | `h5` contains "you said" |
| Gemini | `.selected .conversation-title`, `h1` | `user-query`, `model-response` | `user-query` tag |

### Debug Logging

All extraction operations log to console with `[Eidolon Export]` prefix:

```
[Eidolon Export] Content script loaded
[Eidolon Export] Detected platform: chatgpt
[Eidolon Export] Conversation ID: abc123xyz
[Eidolon Export] Conversation loaded, injecting UI
[Eidolon Export] Extracting ChatGPT conversation...
[Eidolon Export] ChatGPT title: My Conversation
[Eidolon Export] Extracted 8 ChatGPT messages
```

## Troubleshooting

### Export button doesn't appear
1. Check if you're on a conversation page (not homepage)
2. Open DevTools Console (F12) and look for `[Eidolon Export]` logs
3. Verify platform detection: Run `window.location.hostname` in console
4. Check if export is enabled for platform (see Settings section)

### Messages showing as 0
1. The page may not be fully loaded - wait a few seconds
2. Check console for DOM extraction logs
3. Platform selectors may have changed - check `DEBUG_DOM_INSPECTOR.md`

### Title shows as "Untitled Conversation"
1. Title extraction fallbacks may need updating
2. Check console logs for which selectors were tried
3. Report issue with page structure details

## Version History

- **v2.0.0** (2025-11-26)
  - ✨ Multi-platform support (Claude, ChatGPT, Gemini)
  - ✨ Platform auto-detection
  - ✨ Platform-specific DOM extractors
  - ✨ Dashboard UI for platform settings (Analytics tab)
  - ✨ Settings management via storage
  - ✨ Toggle switches for enable/disable per platform
  - 🔧 Updated manifest permissions
  - 📄 Added platform indicator in export UI
  - 🎨 Beautiful toggle switches with save confirmation

- **v1.0.0** (Initial)
  - Claude-only export support

## Future Enhancements

- [x] ~~Dashboard UI for platform settings~~ ✅ **COMPLETED in v2.0.0**
- [ ] Export conversation history browser
- [ ] Bulk export (multiple conversations)
- [ ] Custom export templates
- [ ] Auto-sync to Eidolon projects
- [ ] Support for more platforms (Perplexity, etc.)
- [ ] Image asset download and embedding

## Contributing

See platform-specific extraction logic in:
- `utils/export/extractors.ts:extractChatGPT()`
- `utils/export/extractors.ts:extractGemini()`
- `utils/export/extractors.ts:extractFromDOM()` (Claude)

To add a new platform:
1. Add platform config to `utils/export/platforms.ts`
2. Implement extractor in `utils/export/extractors.ts`
3. Add match pattern to content script
4. Update manifest host_permissions
5. Test on target platform

---

**Built with ❤️ by the Eidolon team**
