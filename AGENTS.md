# Eidolon — Enhanced Claude Assistant

A browser extension for Claude.ai project/knowledge management: bidirectional workspace sync, agent control via Chrome DevTools Protocol, conversation export, Styles API, and embedded terminal.

## Stack

- **WXT 0.20.11** (web extension framework, file-based entrypoints)
- **TypeScript** (strict mode)
- **Preact 10.19** (jsxImportSource)
- **Dexie 4** (IndexedDB, workspace directory handles + pinned state)
- **@xterm/xterm 5.5** (embedded terminal in sidepanel)
- **@opencode-ai/sdk** (OpenCode integration)
- **Custom CSS** (Tailwind-inspired utility patterns, no tailwind.config)
- **gif.js + fflate** (GIF generation, compression)

## Package Manager & Commands

| Task | Command | Notes |
|------|---------|-------|
| Install | `npm install` | |
| Dev (Chrome) | `npm run dev` | auto-opens with extension loaded |
| Dev (Firefox) | `npm run dev:firefox` | |
| Build (Chrome) | `npm run build` | outputs to `.output/chrome-mv3/` |
| Build (Firefox) | `npm run build:firefox` | outputs to `.output/firefox-mv3/` |
| Create ZIP | `npm run zip` | distributable package |
| Lint | `npm run lint` | eslint, enforce 0 warnings |
| Typecheck | `npx tsc --noEmit` | no dedicated script; run tsc directly |
| Test | `npm run test` | vitest runner |
| Test (UI) | `npm run test:ui` | vitest dashboard |
| Postinstall | `npm run postinstall` | WXT prepare (auto-run on install) |
| **Load unpacked** | Chrome: `chrome://extensions` → enable Developer mode → load `.output/chrome-mv3/` | WXT builds real manifest in `.output/`, not root `manifest.json` |

## Architecture

**Key directories & files:**
- `entrypoints/` — WXT entrypoints (background.ts ~104K, popup/, dashboard/ 4000+ lines, sidepanel/ 4700+ lines, content scripts, offscreen/)
- `utils/api/` — ClaudeAPIClient (standalone + embedded versions; authentication, retry logic)
- `utils/sync/` — SyncManager.ts ~38K (bidirectional file sync, MD5 change detection, conflict resolution)
- `utils/browser/` — cdp.ts (Chrome DevTools Protocol), tools.ts (high-level browser actions), tabGroups.ts
- `utils/tasks/` — scheduler.ts (alarm-based task execution)
- `utils/search/`, `utils/tags/`, `utils/db/`, `utils/oauth/`, `utils/opencode/`, `utils/terminal/`, `utils/export/`
- `public/` — gif.js, gif.worker.js (static assets)
- `references/` — Planning docs (naming: `SUBJECT_CONTEXT_TYPE.md`, footer **Last Modified**: YYYY-MM-DD)

**Legacy (document in CONTEXT.md, do NOT delete):**
- `/src/` — Pre-WXT migration artifacts
- `manifest.json` (root) — Stale pre-WXT artifact; WXT auto-generates real manifest into `.output/`
- `opencodetmp/`, `tests/` junk, `claude-export.content.ts.backup`

See `docs/ARCHITECTURE.md` for deep API/sync reference.

## Conventions

- **Imports:** External → internal (`utils/`, `@/`, `~/`) → types last.
- **Naming:** `camelCase` vars/funcs, `PascalCase` classes/types, `UPPER_SNAKE` consts.
- **Interfaces:** In `utils/*/types.ts`; JSDoc on exports; `// ====` section headers in long files.
- **Storage keys:** Chrome storage (`chrome.storage.local`) prefixed `eidolon_`.
- **Debug:** Gated by `DEBUG_MODE`; use `debugLog()`, `debugGroup()`/`debugGroupEnd()`.
- **Errors:** Custom error classes (e.g., `ClaudeAPIError` w/ `statusCode`, `errorType`).
- **WXT patterns:** `defineBackground()`, `defineContentScript()` from WXT; auto-imports for browser APIs.

## Critical Gotchas

1. **NEVER raw `fetch()` Claude API** — always use `ClaudeAPIClient`. Two implementations coexist:
   - Embedded in `background.ts` (popup/dashboard message passing)
   - Standalone `utils/api/client.ts` (richer retry, used by sync/search/tags)
   
2. **Completion API REQUIRES `rendering_mode: "messages"`** or it times out. Request body MUST include `attachments: []` and `files: []` even if empty. Response is SSE; text arrives in `content_block_delta.delta.type === "text_delta"` events.

3. **Auth = `sessionKey` cookie** from claude.ai (format `sk-ant-...`). Validated via `GET /api/organizations`. All requests use `Cookie: sessionKey=<key>` header.

4. **WXT manifest:** Root `manifest.json` is STALE. Real manifest auto-generated into `.output/` from entrypoints + `wxt.config.ts`. NEVER hand-edit root manifest.

5. **Dual API clients:** Pick the right one — background.ts client for messages, `utils/api/client.ts` for direct utility calls (sync, search, tags). Standalone has exponential backoff retry.

## Current State & Next Steps

**Branch:** master  
**Version:** 2.3.0 (wxt.config.ts canonical; package.json stale @ 2.0.0)  
**Dev status:** Agent Mode improved + Styles API implemented. Build output ~468KB.

Done: sidepanel Claude UI, dark mode, dynamic model fetch, Agent Mode (ref-based clicking, focus action, retry/error tracking), Styles API (load/select/send), textarea auto-resize.

See `CONTEXT.md` for ordered exact next steps, resume commands, and version reconciliation.

## Commit Attribution

All AI commits MUST include:
```
Co-Authored-By: <agent-id> <agent-byline>
```

Example:
```
Co-Authored-By: WriteEidolonDocs <eidolon-canonical-docs-author>
```
