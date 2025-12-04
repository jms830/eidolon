# AGENTS.md - Coding Agent Guidelines

## Commands
```bash
npm run dev          # Development with hot reload
npm run build        # Production build to .output/
npm run lint         # ESLint check
npm test             # Run all tests (Vitest)
npm test -- --run path/to/file.test.ts  # Single test file
```

## Code Style
- **Framework**: WXT (web extension framework) + TypeScript + Preact
- **Entrypoints**: Use `defineBackground()`, `defineContentScript()` from WXT
- **Imports**: External first, then internal (`utils/`, `@/`), types last
- **Types**: Strict mode enabled; define interfaces in `utils/*/types.ts`
- **Naming**: camelCase functions/vars, PascalCase classes/types, UPPER_SNAKE constants
- **Error handling**: Use custom error classes (e.g., `ClaudeAPIError`), always handle async errors
- **Storage**: Use `chrome.storage.local` with `eidolon_` prefix for keys
- **Logging**: Use debug helpers (`debugLog()`) gated by DEBUG_MODE flag
- **Comments**: JSDoc for public APIs; section headers with `// ====` blocks

## Architecture
- `entrypoints/` - Extension entry points (background, popup, sidepanel, content scripts)
- `utils/` - Shared utilities (api, sync, search, tags)
- Background script is singleton; use message passing from UI components
- API calls must go through `ClaudeAPIClient` class, never raw `fetch()`
