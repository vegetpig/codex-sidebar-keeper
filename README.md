# Codex Sidebar Keeper

Codex Sidebar Keeper 是一个独立的 Codex 个人插件，用于维持 Codex Desktop 右侧工作区的打开状态，并在切换对话后恢复到指定的右侧工具。

它会在 Codex 顶部栏添加 `Sidebar Keeper` 入口。你可以选择仅展开右侧栏，也可以让右侧栏默认停留在侧边聊天、浏览器或终端；浏览器模式还可以按对话记住上次选择的网址。

![顶部栏入口](assets/readme/topbar-entry.svg)

## 适用场景

| 场景 | 建议设置 |
| --- | --- |
| 只需要右侧栏保持展开 | 选择 `只打开` |
| 切换对话后继续使用侧边聊天 | 选择 `侧边聊天` |
| 需要固定查看某个网页或本地服务 | 选择 `浏览器`，并在网址下拉框中选择目标页面 |
| 需要保持右侧终端可用 | 选择 `终端` |
| 希望右侧只保留当前工具 | 打开 `一次只保留一个右侧标签` |
| 新建对话时避免回到旧对话 | 保持默认保护逻辑即可 |

## 界面预览

### 顶部入口

顶部入口尽量贴近 Codex 原生工具栏的视觉风格，仅保留状态点和入口文字，减少对主界面的干扰。

![顶部栏入口示意图](assets/readme/topbar-entry.svg)

### 设置面板

设置面板集中放置保持开关、标签整理、默认工具、浏览器网址和状态提示。面板支持拖动，也可以置顶。

![设置面板示意图](assets/readme/settings-panel.svg)

### 浏览器网址

浏览器首次打开时默认使用 `此聊天网址`，不会主动跳转。用户在下拉框中选择具体网页后，插件会按当前对话保存该选择，并在下次优先打开。

![浏览器网址选择流程](assets/readme/browser-url-flow.svg)

## 主要功能

- 切换对话后保持 Codex 右侧栏打开。
- `只打开` 模式只展开右侧栏，不自动切换到具体工具。
- 支持将默认目标设置为 `侧边聊天`、`浏览器` 或 `终端`。
- 关闭 `切换对话时保持打开` 后，工具选项只显示提示，不会自动打开。
- 浏览器网址按对话保存，展示时优先使用网页标题。
- 新建对话时避免把主界面拉回旧对话。
- 可选择只保留一个右侧标签，减少右侧工作区的标签堆叠。

## 使用

1. 点击顶部栏的 `Sidebar Keeper`。
2. 打开 `切换对话时保持打开`。
3. 在 `打开后显示` 中选择目标工具。
4. 如果目标是 `浏览器`，在 `浏览器网址` 中选择要记住的页面。
5. 如需整理右侧标签，打开 `一次只保留一个右侧标签`。

脚本只在 Codex 主界面中运行；右侧栏里打开的网页不会触发这套保持逻辑。

## 安装

插件清单位于：

```text
.codex-plugin/plugin.json
```

脚本入口位于：

```text
market/scripts/codex-sidebar-keeper.js
```

## 开发检查

校验插件清单：

```powershell
python <path-to-plugin-creator>\scripts\validate_plugin.py .
```

检查脚本语法：

```powershell
node --check .\market\scripts\codex-sidebar-keeper.js
```

查看当前运行状态：

```powershell
.\scripts\Invoke-CodexCdp.ps1 -Port <debug-port> -Expression "window.__codexSidebarKeeper.getState()"
```

## 数据

README 中的图片是重新绘制的界面示意，不是实际使用截图。

插件的开关状态和浏览器网址选择保存在 Codex 当前页面的本地存储中，不会主动上传。

## 许可证

MIT
