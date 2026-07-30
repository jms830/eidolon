# Eidolon — Working Context

**Last updated:** 2026-06-24  
**Branch:** master

## What This Is

Eidolon — Jordan's own browser extension for Claude.ai (project/knowledge management, workspace sync, agent control via CDP, conversation export, Styles API, embedded terminal). **NOT** to be confused with:
- **Sage** (`~/github/eidorail/packages/extension`) — Jordan's *other* extension: a SolidJS sidebar that embeds OpenCode/Claude Code + chat platforms (Part of Seer Agent Engine). Different stack, different purpose.
- **echlone** (`~/github/echlone`) — the *commercial* "Eidolon" extension (v7.1.5), patched by hand. Shares the name only; different lineage from this repo (v2.3.0).

## Current State

**Dev Status:** Agent Mode improved + Styles API implemented.

✅ **Done:**
- Sidepanel Claude-style UI with dark mode
- Dynamic model fetching (Opus/Sonnet/Haiku variants)
- Agent Mode: ref-based element clicking, focus action, retry logic, accessibility-tree persistent refs
- Styles API: fetch/select/send personalized styles like claude.ai
- Textarea auto-resize fix
- Build output ~468 KB

⚠️ **In-flight / At-risk:**
- Styles API end-to-end test (load/select/send)
- Agent Mode improvements test (ref clicking, focus, retry)
- No vitest.config.ts (Vitest configured but no test files)
- tests/ directory holds HTML/PNG junk (zero .test.ts files)

## Versioning & Cruft

| Artifact | Current | Canonical | Action |
|----------|---------|-----------|--------|
| wxt.config.ts | 2.3.0 | 2.3.0 | CANONICAL ✓ |
| package.json | 2.0.0 | 2.3.0 | STALE — bump to 2.3.0 |
| manifest.json (root) | 1.0.0 | n/a | LEGACY — WXT auto-generates real manifest in `.output/`. Pre-WXT artifact; removable after cleaning |
| /src/ | pre-WXT | n/a | LEGACY — Pre-WXT migration artifacts; removable (document as cruft in AGENTS.md) |
| opencodetmp/ | junk | n/a | LEGACY — removable after documenting |
| tests/ | HTML/PNG only | n/a | LEGACY — zero .test.ts files; remove and create vitest.config.ts + first tests |
| claude-export.content.ts.backup | backup | n/a | LEGACY — removable |

**DO NOT delete** (documented as-is in AGENTS.md):
- /src, opencodetmp/, manifest.json, claude-export.content.ts.backup, tests/

## Exact Next Steps

Ordered, concrete, actionable.

1. **Verify Styles API end-to-end:**
   - Load styles from Claude.ai via popup/dashboard UI
   - Select a style from the list
   - Send a message with the selected style
   - Confirm the style header is sent in the completion request

2. **Verify Agent Mode improvements:**
   - Enable Agent Mode in sidepanel
   - Use ref-based clicking: verify `computer` tool accepts `ref` parameter and clicks by element reference
   - Use focus action: verify explicit `focus` action works before typing
   - Test retry logic: trigger a consecutive error and verify retry with error tracking
   - Check accessibility-tree persistent refs: verify `getOrCreateRef()` persists across calls

3. **Fix bugs found during testing** (if any)

4. **Clear open feature TODOs:**
   - Upload dialog (incomplete)
   - Conversation continuation (incomplete)
   - Active/archived project filters (incomplete)
   - File-content modal (incomplete)
   - New-project modal (incomplete)

5. **Add real tests — Vitest is configured but test infrastructure is missing:**
   - Create `vitest.config.ts` (auto-import from WXT patterns)
   - Add test files:
     - `utils/sync/__tests__/SyncManager.test.ts` (sync logic, conflict resolution, change detection)
     - `utils/search/__tests__/SearchService.test.ts` (search/filter functionality)
     - `utils/api/__tests__/ClaudeAPIClient.test.ts` (API operations, error handling, retries)
   - Run `npm test` and confirm pass

6. **Cleanup: Version reconciliation + remove legacy artifacts** (when ready):
   - Bump `package.json` version to 2.3.0
   - Remove `/src/` directory (pre-WXT artifacts)
   - Remove `opencodetmp/` directory
   - Delete root `manifest.json` (WXT auto-generates real one)
   - Delete `claude-export.content.ts.backup`
   - Delete `tests/` directory (zero .test.ts files)

7. **Future backlog / Loominary-inspired:**
   - Realtime branch/regeneration capture on export (current gap)
   - Claude project-metadata export (descriptions/instructions/memory/knowledge files) — current gap
   - Native messaging for Claude Desktop integration (deferred)

## Resume Commands

```bash
# Load dependencies (if fresh)
npm install

# Dev mode (auto-opens extension in Chrome)
npm run dev

# Build for Chrome
npm run build

# Run tests (after creating vitest.config.ts + test files)
npm run test

# Load unpacked extension
# After npm run build:
# 1. Open chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select .output/chrome-mv3/
```
