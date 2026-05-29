# Codex Sidebar Keeper

Codex Sidebar Keeper 是一个 Codex++ 用户脚本，也可以作为 Codex 个人插件使用。它的目标很简单：让 Codex Desktop 的右侧工作面板在切换对话后继续保持你想要的状态。

如果你经常使用右侧栏里的侧边聊天、浏览器或终端，这个脚本可以帮你少点很多按钮。

## 功能

- 切换对话后自动保持 Codex 右侧工作面板打开。
- 支持 `只打开`、`侧边聊天`、`浏览器`、`终端` 四种打开后状态。
- `只打开` 只展开右侧栏，不保留任何右侧工具标签。
- `一次只保留一个右侧标签` 会关闭多余的右侧标签，并在 Codex 短暂跳走时恢复当前主对话。
- 浏览器模式可以打开当前聊天网址，也可以使用预设 localhost 或自定义网址。
- 设置面板内有状态提示，能看到正在打开、关闭、等待或警告状态。
- 支持浅色/深色面板、面板置顶、拖动面板位置。

## 安装

### 作为 Codex++ 用户脚本安装

复制这个文件：

```text
market/scripts/codex-sidebar-keeper.js
```

到 Codex++ 用户脚本目录：

```text
%APPDATA%\Codex++\user_scripts\codex-sidebar-keeper.js
```

然后在 Codex++ 的用户脚本列表里启用 `codex-sidebar-keeper.js`，再重载或重启 Codex。

### 作为 Codex 个人插件使用

仓库里也包含 Codex 插件清单：

```text
.codex-plugin/plugin.json
```

插件会暴露 `codex-sidebar-keeper` skill，并附带用于本地验证和备用热键的脚本。

## 使用

打开 Codex Desktop 标题栏里的 `Sidebar Keeper` 控件。

- `切换对话时保持打开`：Codex 隐藏右侧栏时自动重新打开。
- `一次只保留一个右侧标签`：只保留当前选择的右侧目标，关闭其它右侧标签。
- `打开后显示`：选择右侧栏打开后要保持的目标。
- `浏览器网址`：选择 `浏览器` 时，可以打开当前聊天网址、预设 localhost 或自定义网址。

脚本只在 Codex 主应用界面运行。右侧栏里打开的网页不会触发这个自动化逻辑。

## 开发与检查

校验插件清单：

```powershell
python <path-to-plugin-creator>\scripts\validate_plugin.py .
```

检查用户脚本语法：

```powershell
node --check .\market\scripts\codex-sidebar-keeper.js
```

通过 CDP 查看当前 Codex 窗口里的脚本状态：

```powershell
.\scripts\Invoke-CodexCdp.ps1 -Port <debug-port> -Expression "window.__codexSidebarKeeper.getState()"
```

## 备用脚本

旧版 Windows 热键辅助脚本仍然保留，作为备用方案：

```powershell
.\scripts\Start-CodexSidebarKeeper.ps1
.\scripts\Stop-CodexSidebarKeeper.ps1
```

这些脚本只在本机运行，不会发送网络请求。

## 许可证

MIT
