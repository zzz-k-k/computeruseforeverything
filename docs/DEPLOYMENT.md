# 本机部署与故障排查

本说明适用于源码 checkout。首次安装按[仓库 README](../README.md#从源码部署)执行，所有示例从仓库根目录开始。

## 安装方式与路径

服务、CLI、扩展宿主共同使用 `computer-use` 目录。运行时不要求把 CLI 加入 PATH，可以向 AI 提供绝对路径。构建阶段需要 Node 24+、npm 和 Xcode Command Line Tools。

源码包含 JS、Swift、扩展、固定版本视觉引擎和文档；不包含 `node_modules`、本机运行状态和平台二进制。

| 文件 | 生成 / 准备方式 |
| --- | --- |
| `computer-use/node_modules` | `npm ci --prefix computer-use` |
| `computer-use/bin/node` | `npm run build --prefix computer-use` 从当前 Node 复制 |
| `computer-use/bin/desktop-bridge` | 同一 build 使用 Swift 编译 |
| `computer-use/bin/ffmpeg`、`ffprobe` | 准备兼容版本，或链接本机 Homebrew 安装 |
| `computer-use/.state/token` | 服务首次启动时生成 |
| `computer-use/.state/chrome.sock` | 服务启动的本地浏览器通信 Socket |
| Chrome Native Messaging 注册文件 | 运行 `scripts/install-chrome-host.mjs` |

使用 Homebrew 的 [node@24](https://formulae.brew.sh/formula/node@24) 和 [ffmpeg](https://formulae.brew.sh/formula/ffmpeg) 时，它们可能依赖本机动态库。复制 `bin/node` 或链接 FFmpeg 不会同时打包这些库，因此这种部署不具有跨机器可移植性。macOS 14 是代码目标下限，包管理器对旧系统的支持范围需以其当前说明为准。

已有自备 FFmpeg 时，可以放入默认 bin 位置，也可手动启动服务指定路径：

```sh
./computer-use/bin/computer-use-server \
  --listen 127.0.0.1:8766 \
  --ffmpeg /absolute/path/ffmpeg \
  --ffprobe /absolute/path/ffprobe
```

CLI 自动启动不会自动附带这些自定义媒体路径。`check:local` 检查默认 bin 位置；使用自定义路径时需另行检查对应二进制。

## 服务启动、停止与更新

```sh
./computer-use/bin/computer-use-server --listen 127.0.0.1:8766
```

手动启动时保持终端运行，按 Ctrl+C 停止。默认 CLI 也会自动启动缺失的服务，日志写入 `computer-use/.state/server.log`，PID 记录在 `server.pid`。PID 记录可能过期，停止前必须核实对应进程是本项目服务，不要直接按旧 PID 杀进程。

更新源码前结束正在进行的观察和浏览器操作；停止旧服务、安装依赖、重新构建后再启动。已有服务不会因修改 JS 文件自动重载。更新扩展代码后，在 `chrome://extensions` 手动点击重新加载。

移动安装目录后，需要重新注册 Chrome 宿主，因为注册文件保存绝对路径。不要在旧服务还运行时同时启动第二个服务实例。

默认路径最适合 Chrome 模块。自定义 `--state-dir`、端口或 `--token-file` 时，当前生成的 Chrome 宿主启动器不会自动继承这些命令行参数；需配置一致的宿主环境。首版不提供图形化多实例配置。

## macOS 权限

- 桌面 / 窗口采集需要屏幕录制权限。
- 原生控件、键鼠操作需要辅助功能权限。
- 摄像头来源还需设备权限。
- Chrome 页面 CDP 操作需要扩展的 debugger 权限，不要求开启“允许 Apple 事件中的 JavaScript”。

系统设置中授权的具体进程与启动方式有关。权限调整后按系统提示重启相关程序。`check:local` 成功表示检查执行完成，仍需查看返回的权限布尔值。

## Chrome 扩展

按 README 加载 `computer-use/extensions/chrome`，注册对应扩展 ID 后重载。扩展 ID 由本机安装决定，不要照抄他人的 ID。

注册文件位于：

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/local.computeruse.chrome.json
```

它只允许指定扩展连接。宿主通过 stdin/stdout 与扩展通信，再连接本地 Unix Socket；无需暴露远程调试端口。

最小流程：

```sh
./computer-use/bin/computer-use browser-status --json
# 下面 CONNECTION_ID、TAB_ID 替换为实际返回值；TAB_ID 是整数
./computer-use/bin/computer-use browser-open --session demo \
  --args '{"connection_id":"CONNECTION_ID","url":"https://example.com"}' --json
./computer-use/bin/computer-use browser-attach --session demo \
  --args '{"target":{"kind":"browser","connection_id":"CONNECTION_ID","tab_id":TAB_ID}}' --json
./computer-use/bin/computer-use screenshot --session demo \
  --args '{"target":{"kind":"browser","connection_id":"CONNECTION_ID","tab_id":TAB_ID}}' --json
./computer-use/bin/computer-use browser-detach --session demo \
  --args '{"target":{"kind":"browser","connection_id":"CONNECTION_ID","tab_id":TAB_ID}}' --json
```

示例含占位符，替换后才是可执行的 JSON。`browser_open` 返回标签 ID，随后显式 attach。连接重建后 connection_id 会变化；不要继续使用旧值。

- `browser_detach` 释放控制，保留标签；`browser_close` 关闭当前会话持有的标签。
- 扩展弹出面板可停止当前页面控制；后续操作需重新附加。
- 页面导航返回 `dispatched`，不表示加载完成；用 `browser_state` 继续观察。
- 截图属于会话、目标标签与页面状态；导航、滚动或缩放后重新截图。
- 若返回 `browser_result_unknown`，动作可能已完成，先观察再决定是否重试。当前实现不自动重放输入。

## 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| `bin/node` 不存在 | 使用开发环境的 Node 24+ 执行 npm 安装和 build；源码克隆不会附带该文件 |
| FFmpeg / FFprobe 找不到 | 检查默认 bin 链接是否有效，或服务是否指定了正确的绝对路径 |
| Swift 编译失败 | 检查 `xcode-select -p`、macOS 版本、Command Line Tools 和目标架构 |
| 浏览器 `connected:false` | 确认本项目扩展已加载、宿主注册 ID 和路径正确、服务不是旧版；检查扩展管理页错误与本地 server.log |
| `browser_socket_busy` / 8766 被占用 | 查询监听进程，停止确认属于本项目的旧实例；不要删除活动 Socket 或终止无关服务 |
| `browser_attach_required` | 对正确的 connection_id / tab_id 显式附加；用户取消调试或重载扩展会撤销控制 |
| `browser_tab_busy` | 标签属于另一 session；让原会话 detach，或选择新的标签 |
| `stale_frame` | 用同一会话重新截图，使用新 frame_id 和像素坐标 |
| `focus_emulation_unavailable` | 检查 Chrome 版本、目标页面、调试器和企业策略；不会降级成系统输入 |
| `focus_changed` | 原生窗口输入期间前台变化；可能已有部分输入，先观察，不自动重试 |

## 验证范围

`npm test` 包含本机原生桥接和 FFmpeg 的检查，需要完成构建与媒体依赖准备；它不是纯 Linux 单元测试套件。真实桌面/浏览器验收与普通测试分开，运行前阅读脚本说明。

2026-11-08 本机结果：33 项自动测试通过；Chrome 扩展真实页面测试通过，约 3.76 秒内 695 次焦点采样无变化。采样不能排除短于实际采样间隔的变化，也不保证所有网页或原生软件行为一致。新的安装环境仍需自行验证。
