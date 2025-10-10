# Eidolon - Claude.ai Chrome Extension

A powerful Chrome extension that enhances your Claude.ai experience with seamless project management, knowledge organization, and quick access to conversations directly from your browser.

## Features

### Core Features
- 🔐 **Automatic Session Detection** - Seamlessly connects using your existing Claude.ai session
- 📁 **Project Management** - View, create, and manage all your Claude projects
- 📚 **Knowledge Management** - Upload text, pages, and files directly to projects
- 💬 **Quick Chat** - Start conversations with project context from anywhere
- 🔍 **Search & Filter** - Find projects and conversations instantly
- ⭐ **Favorites** - Pin frequently used projects for quick access

### Browser Integration
- Right-click context menu for quick uploads
- Keyboard shortcuts (Ctrl+Shift+E)
- Smart content extraction from web pages
- Selection-to-project uploads

## Installation

### From Source (Development)
1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the extension
4. Open Chrome and go to `chrome://extensions/`
5. Enable "Developer mode"
6. Click "Load unpacked" and select the `dist` folder

### From Chrome Web Store
*Coming soon*

## Usage

1. **First Time Setup**
   - Click the Eidolon icon in your browser toolbar
   - The extension will automatically detect your Claude.ai session
   - Select your organization (if you have multiple)

2. **Upload Content**
   - Select text on any webpage
   - Right-click and choose "Add to Claude Project"
   - Select your target project from the menu

3. **Quick Chat**
   - Press `Ctrl+Shift+E` to open quick chat
   - Type your question and select a project for context

## Development

### Setup
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Test
```bash
npm test
```

## Architecture

- **Manifest V3** - Latest Chrome extension standard
- **Preact** - Lightweight UI framework
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Vite** - Fast build tool

## Security

- Session keys are stored securely in Chrome's storage API
- All API calls go directly to Claude.ai (no third-party servers)
- No analytics or telemetry without explicit opt-in
- Minimal permissions requested

## Privacy Policy

Eidolon respects your privacy:
- We don't collect any personal data
- All data stays between your browser and Claude.ai
- No third-party services are used
- Session keys are stored locally and encrypted by Chrome

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - See LICENSE file for details

## Disclaimer

This is an unofficial extension and is not affiliated with Anthropic or Claude.ai. Use at your own risk.

## Author

Created by jms830

## Support

For issues or questions, please open an issue on GitHub.
