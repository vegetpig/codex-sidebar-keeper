---
name: codex-sidebar-keeper
description: Use when the user wants Codex Desktop's right-side work panel/sidebar to stay open after switching conversations.
---

# Codex Sidebar Keeper

The preferred implementation is the Codex++ user script in this repository:

```text
market/scripts/codex-sidebar-keeper.js
```

It adds a compact title-area entry that opens a Codex++-style settings panel with:

- `切换对话时保持打开`: automatically reopens Codex Desktop's right-side work panel when Codex hides it.
- `一次只保留一个右侧标签`: closes extra right-panel tabs and restores the current main conversation if Codex briefly navigates away.
- target picker: optionally prefers side chat, browser, or terminal after the panel opens.
- `此聊天网址`: when browser is preferred, retries opening the current conversation's associated browser URL.
- status feedback: shows busy/warn/ok states so slow panel switches do not look frozen.

The script runs only in the Codex app shell, and identifies the right-side panel by its top-right toggle plus visible right-panel tab state. Embedded browser pages do not run sidebar automation.

## Validate

Use the CDP helper from the plugin root to inspect the live script state:

```powershell
.\scripts\Invoke-CodexCdp.ps1 -Port <debug-port> -Expression "window.__codexSidebarKeeper.getState()"
```

Expected fields:

- `autoKeep: true`
- `rightPanelOpen: true`
- `toggleFound: true`
- `docked: true`

The older Windows hotkey helper scripts remain available only as a fallback.
