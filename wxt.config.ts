import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Eidolon - Enhanced Claude Assistant',
    version: '2.2.0',
    description: 'Full-featured Claude assistant with browser interaction, AI agent capabilities, project management, and conversation export',
    author: { email: 'jms830@example.com' },
    permissions: [
      'cookies',
      'storage',
      'contextMenus',
      'tabs',
      'activeTab',
      'notifications',
      'sidePanel',
      'scripting',
      'debugger',       // CDP access for screenshots, input simulation
      'tabGroups',      // Tab group management for sessions
      'alarms',         // Scheduled task execution
      'webNavigation',  // Navigation event monitoring
      'offscreen',      // Background media processing (GIF generation)
      'downloads',      // File downloads
      'system.display', // Display info for screenshots
    ],
    host_permissions: [
      'https://claude.ai/*',
      '*://*.claude.ai/*', // Firefox needs this for cookie access
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
      'https://gemini.google.com/*',
      '<all_urls>', // Needed for page capture and browser interaction
    ],
    optional_permissions: ['clipboardWrite', 'nativeMessaging'],
    externally_connectable: {
      matches: [
        'https://claude.ai/*',
        '*://*.claude.ai/*',
      ],
    },
    // Side panel configuration
    side_panel: {
      default_path: 'sidepanel.html'
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+E',
          mac: 'Command+Shift+E',
        },
        description: 'Open Eidolon side panel',
      },
      quick_upload: {
        suggested_key: {
          default: 'Ctrl+Shift+U',
          mac: 'Command+Shift+U',
        },
        description: 'Quick upload to Claude project',
      },
      'toggle-side-panel': {
        suggested_key: {
          default: 'Ctrl+E',
          mac: 'Command+E',
        },
        description: 'Toggle Eidolon side panel',
      },
    },
  },
  // Using Preact instead of React - no module needed
});
