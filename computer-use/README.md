# Computer Use 本地运行时

[项目首页](../README.md) · [部署与排错](../docs/DEPLOYMENT.md) · [网页文档](https://zzz-k-k.github.io/computeruseforeverything/)

从源码安装请先按项目首页准备 Node、Swift、FFmpeg 和依赖。本目录的 `bin` 启动器依赖同目录的 `src`、`vendor`、`node_modules` 和本机二进制，不能单独复制运行。

以下命令在 `computer-use` 目录执行。

## CLI

```sh
./bin/computer-use list --json
./bin/computer-use screenshot --session demo --out-dir ./artifacts --json
./bin/computer-use see-now --action status --session demo --json
```

默认连接 `http://127.0.0.1:8766`；没有默认服务时尝试启动。指定其他 `--url` 时需要先手动运行对应服务。安装目录可以通过绝对路径引用，无需修改系统 PATH。

`--args` 接受完整 JSON 参数，适合嵌套的窗口/浏览器目标。`--out-dir` 指定图片目录，CLI 返回实际文件路径；没有 `--out` 选项。工具名中的连字符映射成下划线，例如 CLI 的 `browser-status` 对应 MCP/HTTP 的 `browser_status`。

## MCP stdio

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

替换为真实绝对路径。stdio 入口通过本机 HTTP Runtime 转发请求，stdout 仅承载协议，无需把 token 填进配置。

## HTTP 与 MCP HTTP

```sh
./bin/computer-use-server --listen 127.0.0.1:8766
```

| 接口 | 用途 | 鉴权 |
| --- | --- | --- |
| `GET /health` | 健康状态 | 不需要 token |
| `GET /v1/tools` | 工具目录 | Bearer token |
| `POST /v1/tools/{name}` | 调用工具 | Bearer token |
| `/mcp` | MCP Streamable HTTP | Bearer token |

令牌文件为 `.state/token`。将它配置到可信客户端的 `Authorization: Bearer …` 请求头中，不写入仓库或公开示例。可用下列 Node 示例读取令牌并查询状态，无需打印令牌：

```sh
./bin/node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
const token = (await readFile('.state/token', 'utf8')).trim();
const response = await fetch('http://127.0.0.1:8766/v1/tools/browser_status', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  },
  body: JSON.stringify({ session_id: 'my-ai', arguments: {} })
});
console.log(response.status, await response.json());
JS
```

HTTP 返回 `{result, images:[{mime_type,data}]}`，图片 data 为 Base64。MCP 返回文本内容块和图像内容块。MCP HTTP 用 `x-computer-use-session` 指定 session。

所有入口使用同一个服务令牌；session 隔离截图、观察状态和标签归属，不是身份认证或独立用户权限。

## 20 个工具

| 分组 | 工具 |
| --- | --- |
| 发现和控件 | `list_apps`、`list_windows`、`get_app_state`、`capabilities`、`set_value` |
| 画面和输入 | `screenshot`、`click`、`type`、`press_key`、`scroll` |
| 视频观察 | `see_now`、`video_frame` |
| Chrome | `browser_status`、`browser_tabs`、`browser_open`、`browser_attach`、`browser_navigate`、`browser_state`、`browser_detach`、`browser_close` |

`see_now` 通过 action 区分 start/watch/peek/stop/status/window/region；没有另外的顶层 watch 工具。`video_frame` 的 timestamp_ms 和 frame_index 必须且只能提供一个。

```sh
./bin/computer-use video-frame --path /absolute/video.mp4 --frame-index 10 --json
./bin/computer-use see-now --action start --source file --path /absolute/video.mp4 --session video --json
./bin/computer-use see-now --action watch --seconds 5 --session video --json
./bin/computer-use see-now --action stop --session video --json
```

## 三种目标

- 未传 target：桌面截图和系统键鼠操作，会作用于实际桌面。
- `target: {pid, window_id}`：指定原生窗口；带 target 默认 background，兼容性取决于应用。
- `target: {kind:"browser", connection_id, tab_id}`：已附加的 Chrome 标签，使用扩展内部 CDP。

截图引用绑定 session，60 秒过期，最多保留 256 帧。点击/滚动使用截图像素坐标；不同目标的帧不能混用。

原生后台滚动暂不支持；Chrome 页面滚动已实现。Chrome 支持普通页面按键，不接受 Meta+T 等浏览器快捷键，应使用 browser_open 等工具。原生输入中止保护不能保证应用不主动抢焦点，Chrome 扩展的本机通过结果不能推广到原生软件。

## 检查和验收

```sh
npm test
npm run check:local
npm run acceptance
npm run acceptance:browser
npm run acceptance:browser-transports
```

后面三项需要本地服务；浏览器验收还要求本项目扩展已连接且 Chrome 处于后台。原生桌面注入测试必须使用专用测试窗口，默认 acceptance 不注入键鼠。测试输出在 artifacts 中，不提交到源码仓库。
