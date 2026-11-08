# Computer Use for Everything

让 AI 通过 **CLI、HTTP 或 MCP** 调用本机桌面、Chrome 页面和视频观察工具。

服务运行在你的电脑上。桌面操作使用 macOS 原生桥接；Chrome 页面操作使用本项目的扩展与 CDP；持续视觉观察复用 [dsh-see-now](https://github.com/SAOS-3624/dsh-see-now) 的变化评分、选帧与拼图逻辑。

[网页文档](https://zzz-k-k.github.io/computeruseforeverything/) · [详细部署](docs/DEPLOYMENT.md) · [GitHub Desktop 发布步骤](docs/PUBLISHING.md) · [接口说明](computer-use/README.md)

> 版本：0.1.0 预览版。网页文档链接按 `zzz-k-k/computeruseforeverything` 配置，首次发布并启用 GitHub Pages 后生效。目前已在 macOS / Apple Silicon 验证；没有 Windows 或 Linux 桌面后端。

## 能做什么

| 能力 | 功能 |
| --- | --- |
| 桌面与窗口 | 截图、应用/窗口发现、AX 控件读取与操作、键鼠输入 |
| Chrome 后台操作 | 标签管理、导航、截图、点击、中文输入、页面按键与滚动 |
| 持续观察 | `see_now` 的 start / watch / peek / stop / status；屏幕、窗口或本地视频来源 |
| 视频精确取帧 | `video_frame` 按时间或帧序号读取本地视频 |
| AI 接入 | CLI、HTTP、MCP stdio、MCP Streamable HTTP 共用 20 个工具 |

Chrome 扩展路径已通过本机后台操作测试，测试期间前台应用和键盘焦点未变化。原生应用的后台输入仍取决于应用兼容性，不能保证所有软件都不抢焦点。两种路径的能力与限制分别记录在网页文档中。

## 从源码部署

以下命令在**仓库根目录**执行。先用 GitHub Desktop 克隆仓库，再选择 **Repository → Open in Terminal**。

### 1. 准备依赖

- macOS 14 或更高；当前主要验收平台是 Apple Silicon。
- Node.js 24 或更高、npm。
- Xcode Command Line Tools（Swift 编译器）。
- FFmpeg 与 FFprobe，供视频和持续观察使用。
- Chrome 125 或更高，仅浏览器模块需要。

已安装 Homebrew 时，可用下列命令准备 Node 和媒体工具；没有 Command Line Tools 时先运行 `xcode-select --install` 并完成系统安装。

```sh
brew install node@24 ffmpeg
xcode-select -p
```

### 2. 安装与构建

```sh
# 仅对这些命令设置 Node 路径，不修改 shell 配置或系统 PATH
NODE_BIN="$(brew --prefix node@24)/bin"
env PATH="$NODE_BIN:$PATH" npm ci --prefix computer-use
env PATH="$NODE_BIN:$PATH" npm run build --prefix computer-use

# 全新源码目录没有 FFmpeg/FFprobe；链接本机安装
ln -s "$(brew --prefix ffmpeg)/bin/ffmpeg" computer-use/bin/ffmpeg
ln -s "$(brew --prefix ffmpeg)/bin/ffprobe" computer-use/bin/ffprobe

./computer-use/bin/node computer-use/scripts/check-local.mjs
```

若已有兼容的 Node 24+，前两条 npm 命令可直接运行。`ln -s` 适用于首次安装；已有文件时先检查来源，不要覆盖正在使用的二进制。Homebrew 依赖和符号链接属于本机安装，不能当作可复制到另一台电脑的离线发行包。

构建会复制当前 Node 到 `bin/node` 并编译 Swift 桥接，**不会下载 FFmpeg，也不会把整个项目打成一个独立可执行文件**。保留 `computer-use` 内的 `bin`、`src`、`vendor` 和 `node_modules`。

### 3. 启动与检查

```sh
./computer-use/bin/computer-use-server --listen 127.0.0.1:8766
```

另一个终端运行：

```sh
./computer-use/bin/computer-use health --json
./computer-use/bin/computer-use list --json
./computer-use/bin/computer-use screenshot --out-dir ./computer-use-output --json
```

CLI 默认也能自动启动本地服务。截图和桌面输入需要在 macOS **系统设置 → 隐私与安全性**授予相关进程屏幕录制、辅助功能权限。具体条目以系统提示为准；`check:local` 只报告权限，不会代替你授权。

服务仅监听回环地址。令牌保存在 `computer-use/.state/token`，不要提交或公开它。

### 4. 连接 AI

支持 MCP stdio 的宿主可使用以下配置；将路径换成你电脑上的真实绝对路径：

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "/absolute/path/computeruseforeverything/computer-use/bin/computer-use",
      "args": ["mcp", "--session", "my-ai"]
    }
  }
}
```

也可以直接调用 CLI，或连接 `http://127.0.0.1:8766/mcp`。HTTP/MCP HTTP 需要 Bearer token；完整示例见[接口说明](computer-use/README.md)。不同 AI 使用不同 session；session 是状态命名空间，不是多用户安全隔离。

### 5. 启用 Chrome 扩展

1. 打开 `chrome://extensions`，开启开发者模式。
2. 点击“加载已解压的扩展程序”，选择 `computer-use/extensions/chrome`。
3. 复制扩展的 32 位 ID，注册本机宿主：

   ```sh
   ./computer-use/bin/node computer-use/scripts/install-chrome-host.mjs 你的扩展ID
   ```

4. 在扩展管理页面重新加载 **Computer Use Local**。
5. 检查连接：

   ```sh
   ./computer-use/bin/computer-use browser-status --json
   ```

返回 `connected: true` 后可调用 `browser_tabs`、`browser_open` 和 `browser_attach`。浏览器截图与输入使用 `{kind:"browser", connection_id, tab_id}` 目标。[完整示例与故障排查](docs/DEPLOYMENT.md#chrome-扩展)。

## 网页文档

只构建静态文档不需要 macOS、Swift、FFmpeg 或 npm 依赖，只需要 Node 24+：

```sh
node computer-use-docs/src/build.mjs
python3 -m http.server 8765 --bind 127.0.0.1 --directory computer-use-docs/dist
```

访问 <http://127.0.0.1:8765/>。Python 仅用于这里的静态预览，也可换用其他静态文件服务器。

仓库附带手动触发的 GitHub Pages 工作流。你用 GitHub Desktop 发布后，按[发布步骤](docs/PUBLISHING.md)启用 Pages，再把生成的网址填入仓库右侧 **About → Website**。Pages 只托管文档，不托管本机控制服务。

## 开发与验证

```sh
# 使用已安装的 Node 24+ / npm
npm test --prefix computer-use
npm run check:local --prefix computer-use
npm run acceptance --prefix computer-use
```

前两项检查代码、本机依赖和权限；`acceptance` 需要本地服务并会采集屏幕、读取测试视频，默认不注入桌面输入。浏览器真实验收另行运行：

```sh
npm run acceptance:browser --prefix computer-use
npm run acceptance:browser-transports --prefix computer-use
```

浏览器验收要求本项目扩展已连接，Chrome 处于后台。脚本创建本地测试页面、输入测试文本、检查页面事件、采样焦点并关闭测试标签。用户同时切换应用会影响结果。报告和截图保存在 `computer-use/artifacts/`，不进入源码仓库。

## 项目结构

```text
computer-use/
  bin/                 CLI、服务、Native Messaging 启动器
  src/runtime.mjs      工具注册、参数校验与统一分发
  src/transports/      HTTP、MCP、CLI 客户端连接
  src/tools/           桌面、窗口、浏览器与视频工具
  src/browser/         扩展连接、请求关联、标签会话与队列
  src/native/          macOS 桥接、Chrome 本地通信宿主
  extensions/chrome/   Manifest V3 扩展
  vendor/              固定版本视觉引擎及许可说明
  scripts/             构建、注册、检查与实测脚本
  tests/               自动测试与专用测试窗口
computer-use-docs/src/  静态文档内容、模板、样式与字体
.github/workflows/     手动发布文档的 Pages 工作流
docs/                  部署、发布与实现调查记录
```

## 当前限制

- Chrome 页面操作通过扩展执行；浏览器工具栏、原生文件对话框、组合快捷键、浏览器连续视频观察暂不支持。
- 原生后台输入是条件支持；焦点变化后中止不等于能阻止应用激活。原生后台滚动尚未实现，Chrome 页面滚动已实现。
- 窗口连续观察尚不保存录像文件；长视频精确取帧可能较慢。
- 当前为单用户本地预览版，未完成跨平台验证、安装器、签名、公证与自动升级。
- 新安装的 Node/FFmpeg 版本需在目标机器验证；本机验收不代表所有版本和软件都兼容。

## 来源与许可

视觉引擎来自 [SAOS-3624/dsh-see-now](https://github.com/SAOS-3624/dsh-see-now)，固定版本、修改说明和上游 LICENSE/NOTICE 保存在 [vendor](computer-use/vendor/ORIGIN.md)。文档使用 IBM Plex 字体，许可文件保留在字体目录。

本仓库自有代码的发布许可证尚未选定；第三方组件继续遵循各自许可证。详情见[第三方来源说明](THIRD_PARTY_NOTICES.md)。源码仓库不包含本机 Node、FFmpeg、FFprobe 或编译后的桥接二进制；二进制发行需要另外准备依赖与许可材料。
