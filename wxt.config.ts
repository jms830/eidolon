import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Eidolon - Enhanced Claude Assistant',
    version: '2.1.0',
    description: 'Full-featured Claude assistant with browser integration, project management, and conversation export',
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
    ],
    host_permissions: [
      'https://claude.ai/*',
      '*://*.claude.ai/*', // Firefox needs this for cookie access
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
      'https://gemini.google.com/*',
      '<all_urls>', // Needed for page capture and browser interaction
    ],
    optional_permissions: ['clipboardWrite', 'tabGroups'],
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
    },
  },
  // Using Preact instead of React - no module needed
});
