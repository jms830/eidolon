import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Eidolon - Claude.ai Integration',
    version: '1.0.0',
    description: 'Seamless Claude.ai project and knowledge management directly from your browser',
    author: 'jms830',
    permissions: [
      'cookies',
      'storage',
      'contextMenus',
      'tabs',
      'activeTab',
      'notifications',
    ],
    host_permissions: [
      'https://claude.ai/*',
      '*://*.claude.ai/*', // Firefox needs this for cookie access
    ],
    optional_permissions: ['clipboardWrite'],
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+E',
          mac: 'MacCtrl+Shift+E',
        },
      },
      quick_upload: {
        suggested_key: {
          default: 'Ctrl+Shift+U',
          mac: 'MacCtrl+Shift+U',
        },
        description: 'Quick upload to Claude project',
      },
    },
  },
  // Using Preact instead of React - no module needed
});
