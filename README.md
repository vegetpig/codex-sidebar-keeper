# Codex Sidebar Keeper

我写这个插件，是因为在 Codex 里来回切对话时，右侧工作区经常不在我想要的状态：有时侧边栏收起来了，有时浏览器还开着上一个页面，有时终端和侧边聊天堆在一起。Sidebar Keeper 就是专门管这件小事的。

它会在 Codex 顶部栏放一个 `Sidebar Keeper` 入口。打开后，你可以决定右侧栏切换对话时要不要保持打开，以及默认停在侧边聊天、浏览器、终端，还是只把右侧栏展开。

![顶部栏入口](assets/readme/topbar-entry.svg)

## 适合什么情况

| 你遇到的情况 | 可以怎么设 |
| --- | --- |
| 只是不想右侧栏老是收起来 | 选 `只打开` |
| 每个对话都要用侧边聊天 | 选 `侧边聊天` |
| 常常要盯着一个本地网页 | 选 `浏览器`，再选一次网址 |
| 主要在右侧跑命令 | 选 `终端` |
| 右侧标签越开越多 | 打开 `一次只保留一个右侧标签` |
| 新建对话时不想被拉回旧对话 | 保持默认即可，插件会避开新建对话流程 |

## 看起来是什么样

### 顶部入口

入口尽量贴近 Codex 原来的顶部栏，不做很重的按钮。绿色点表示脚本在工作，点击文字就能打开设置。

![顶部栏入口示意图](assets/readme/topbar-entry.svg)

### 设置面板

面板里只放常用设置：两个开关、一组选项、浏览器网址和当前状态。它可以拖动，也可以置顶。

![设置面板示意图](assets/readme/settings-panel.svg)

### 浏览器网址

浏览器第一次不会自动跳到某个网页，而是先停在 `此聊天网址`。你从下拉框里选过网页后，下次再进入这个对话，插件才会直接打开你选过的页面。

![浏览器网址选择流程](assets/readme/browser-url-flow.svg)

## 主要功能

- 切换对话后，让 Codex 右侧栏继续保持打开。
- `只打开` 模式只展开右侧栏，不自动切到具体工具。
- 可以把默认目标设为 `侧边聊天`、`浏览器` 或 `终端`。
- 关闭“切换对话时保持打开”后，工具选项只会给提示，不会偷偷打开。
- 浏览器网址按对话记住，优先显示网页标题。
- 新建对话时不会把主界面拉回旧对话。
- 可以只保留一个右侧标签，让右侧工作区清爽一点。

## 使用

1. 点击顶部栏的 `Sidebar Keeper`。
2. 打开 `切换对话时保持打开`。
3. 在 `打开后显示` 里选一个目标。
4. 如果目标是 `浏览器`，再从 `浏览器网址` 里选一个页面。
5. 不想右侧堆很多标签时，打开 `一次只保留一个右侧标签`。

脚本只在 Codex 主界面里工作。右侧栏里打开的网页不会再运行这套逻辑。

## 安装

插件清单位于：

```text
.codex-plugin/plugin.json
```

脚本入口在：

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

README 里的图片是重新画的界面示意，不是实际使用截图。

插件的开关和浏览器网址选择存在 Codex 当前页面的本地存储里，不会主动上传。

## 许可证

MIT
