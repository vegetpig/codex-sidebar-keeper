---
name: codex-sidebar-keeper
description: 当用户希望 Codex Desktop 的右侧工作面板/侧边栏在切换对话后保持打开时使用。
---

# Codex Sidebar Keeper

核心实现是本插件里的独立 Codex 脚本：

```text
market/scripts/codex-sidebar-keeper.js
```

它会在 Codex 顶部栏添加 `Sidebar Keeper` 控件，打开后可以设置：

- `切换对话时保持打开`：Codex 隐藏右侧工作面板时自动重新打开。
- `一次只保留一个右侧标签`：关闭多余的右侧标签，并尽量保持当前主对话不被拉走。
- `打开后显示`：可选择 `只打开`、`侧边聊天`、`浏览器` 或 `终端`。
- `浏览器网址`：浏览器模式下首次默认 `此聊天网址`，不会主动跳转；用户选择具体网页后会按对话记住。
- 网址缓存：合并当前对话和已有缓存，优先显示网页标题，并过滤对话正文、终端提示、错误页标题等误识别内容。
- 新建对话保护：新建对话时只保持右侧栏状态，不会自动拉回旧对话。
- 状态反馈：显示 busy/warn/ok 等状态，避免慢速切换时看起来像卡住。

脚本只在 Codex 主应用界面运行，通过右侧栏按钮和右侧标签状态识别工作面板。右侧栏里嵌入的网页不会运行这个自动化逻辑。

## 验证

可以在插件根目录使用 CDP helper 查看当前运行状态：

```powershell
.\scripts\Invoke-CodexCdp.ps1 -Port <debug-port> -Expression "window.__codexSidebarKeeper.getState()"
```

常见期望字段：

- `autoKeep: true`
- `rightPanelOpen: true`
- `toggleFound: true`
- `docked: true`

旧版 Windows 热键脚本只作为备用方案保留。
