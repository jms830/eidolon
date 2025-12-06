# AGENTS.md - Coding Agent Guidelines

## Commands
```bash
npm run dev              # Dev with hot reload (Chrome)
npm run dev:firefox      # Dev for Firefox
npm run build            # Production build → .output/
npm run lint             # ESLint (entrypoints + utils)
npm test                 # Run all tests (Vitest)
npm test -- --run utils/sync/hashUtils.test.ts  # Single test file
```

## Code Style
- **Framework**: WXT + TypeScript (strict) + Preact (JSX via `jsxImportSource: "preact"`)
- **Entrypoints**: Use `defineBackground()`, `defineContentScript()` from WXT
- **Imports**: External → internal (`utils/`, `@/`, `~/`) → types last
- **Types**: Define interfaces in `utils/*/types.ts`; use generics for API responses
- **Naming**: camelCase vars/funcs, PascalCase classes/types, UPPER_SNAKE constants
- **Errors**: Custom error classes (e.g., `ClaudeAPIError` with `statusCode`, `errorType`)
- **Storage**: `chrome.storage.local` with `eidolon_` prefix (e.g., `eidolon_debug_mode`)
- **Logging**: `debugLog()` gated by `DEBUG_MODE`; use `debugGroup()`/`debugGroupEnd()`
- **Comments**: JSDoc for exports; `// ====` section headers in long files

## Architecture
- `entrypoints/` - background.ts (singleton), popup, sidepanel, content scripts
- `utils/` - api/, sync/, search/, tags/, browser/, export/
- Background handles all API calls via `ClaudeAPIClient`; UI uses message passing
- Never use raw `fetch()` for Claude API—always go through the client class
