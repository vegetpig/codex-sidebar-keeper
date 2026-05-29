# Codex Sidebar Keeper

Codex Sidebar Keeper is a Codex++ user script and Codex personal plugin that keeps Codex Desktop's right-side work panel open while you move between conversations.

It is built for people who use the right panel heavily and want Codex to remember whether the panel should be empty, side chat, browser, or terminal.

## Features

- Keeps Codex Desktop's right-side work panel open after conversation switches.
- Supports `只打开`, `侧边聊天`, `浏览器`, and `终端` as the preferred right-panel state.
- `只打开` only opens the right panel and does not keep any right-panel tool tabs.
- `一次只保留一个右侧标签` closes extra right-panel tabs and restores the current main conversation if Codex briefly navigates away.
- Browser mode can retry the current conversation website or a custom URL.
- Shows compact status feedback inside the settings panel.

## Install

### Codex++ user script

Copy this file:

```text
market/scripts/codex-sidebar-keeper.js
```

to your Codex++ user scripts folder:

```text
%APPDATA%\Codex++\user_scripts\codex-sidebar-keeper.js
```

Then enable `codex-sidebar-keeper.js` in Codex++ user scripts and reload Codex.

### Codex personal plugin

This repository also contains a Codex plugin manifest:

```text
.codex-plugin/plugin.json
```

The plugin exposes the `codex-sidebar-keeper` skill and includes helper scripts for local validation and fallback hotkeys.

## Usage

Open the `Sidebar Keeper` control in Codex Desktop's title area.

- `切换对话时保持打开`: reopens the right panel when Codex hides it.
- `一次只保留一个右侧标签`: keeps only the selected right-panel target and closes other right-panel tabs.
- `打开后显示`: chooses the desired right-panel target.
- `浏览器网址`: when `浏览器` is selected, choose the current chat URL, a preset localhost URL, or a custom URL.

The script runs only in the Codex app shell. Browser pages opened inside the right panel do not run sidebar automation.

## Development

Validate the plugin manifest:

```powershell
python <path-to-plugin-creator>\scripts\validate_plugin.py .
```

Check the user script syntax:

```powershell
node --check .\market\scripts\codex-sidebar-keeper.js
```

Inspect the live Codex script state through the helper:

```powershell
.\scripts\Invoke-CodexCdp.ps1 -Port <debug-port> -Expression "window.__codexSidebarKeeper.getState()"
```

## Fallback Scripts

The older Windows hotkey helper scripts are still included as a fallback:

```powershell
.\scripts\Start-CodexSidebarKeeper.ps1
.\scripts\Stop-CodexSidebarKeeper.ps1
```

They run locally and do not send network requests.

## License

MIT
