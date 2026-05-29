---
name: codex-sidebar-keeper
description: 当用户希望 Codex Desktop 的右侧工作面板/侧边栏在切换对话后保持打开时使用。
---

# Codex Sidebar Keeper

首选实现是本仓库里的 Codex++ 用户脚本：

```text
market/scripts/codex-sidebar-keeper.js
```

它会在 Codex 标题栏添加一个紧凑的 `Sidebar Keeper` 控件，打开后可以设置：

- `切换对话时保持打开`：Codex 隐藏右侧工作面板时自动重新打开。
- `一次只保留一个右侧标签`：关闭多余的右侧标签，并在 Codex 短暂跳走时恢复当前主对话。
- 打开后显示：可选择 `只打开`、`侧边聊天`、`浏览器` 或 `终端`。
- `浏览器网址`：浏览器模式下可重试当前聊天网址，也可以使用预设或自定义网址。
- 状态反馈：显示 busy/warn/ok 等状态，避免慢速切换时看起来像卡住。

脚本只在 Codex 主应用界面运行，通过右上角右侧栏按钮和右侧标签状态识别工作面板。右侧栏里嵌入的网页不会运行这个自动化逻辑。

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
