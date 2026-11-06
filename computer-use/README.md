# Computer Use 本机运行版

macOS 14+ / Apple Silicon。工具层复用固定版本 dsh-see-now 的真实采集、打分、选帧与拼图逻辑。提供 CLI、HTTP、Streamable HTTP MCP 和 stdio MCP。其他操作系统尚未实现桌面后端。

## 启动

当前目录已包含本机 Node、FFmpeg、FFprobe 和编译好的 Swift 桥接程序，无需修改 PATH。保留整个目录，两个启动入口不能单独移走。

```sh
./bin/computer-use-server --listen 127.0.0.1:8766
./bin/computer-use list --json
./bin/computer-use screenshot --out-dir ./artifacts --json
./bin/computer-use see-now --action status --json
```

CLI 默认连接 127.0.0.1:8766，默认地址没有服务时尝试启动同目录服务。令牌保存在 `.state/token`，服务只监听回环地址。拥有令牌的本机客户端可以读取本机文件并操作桌面，请仅配置给授权客户端。session 是观察和帧的命名空间，不是不同用户之间的安全边界。默认 session 为 local，通过 `--session NAME` 或 HTTP 的 session_id 指定。

## MCP

推荐 stdio 配置，无需在配置里复制令牌。该入口使用同一个本机服务。

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "/Users/huyuxi/shortcode/computeruseforeverything/computer-use/bin/computer-use",
      "args": ["mcp"]
    }
  }
}
```

HTTP MCP 地址为 `http://127.0.0.1:8766/mcp`，请求头使用 `Authorization: Bearer <.state/token 中的内容>`。可用 `x-computer-use-session` 设置观察会话。连接器需支持 Streamable HTTP 和自定义鉴权请求头。

## HTTP

`GET /health` 查询服务健康，`GET /v1/tools` 列出工具，`POST /v1/tools/{name}` 调用工具。后两者需要 Bearer token。请求体示例

```json
{"session_id":"local","arguments":{"action":"status"}}
```

返回 `{result,images:[{mime_type,data}]}`，data 是 Base64。CLI 将图片写入指定 out-dir 并返回文件路径。MCP 返回原生图像内容。

## 常用工具

```sh
./bin/computer-use video-frame --path /absolute/video.mp4 --frame-index 10 --out-dir ./artifacts --json
./bin/computer-use video-frame --path /absolute/video.mp4 --timestamp-ms 1200 --json
./bin/computer-use see-now --action start --source file --path /absolute/video.mp4 --json
./bin/computer-use see-now --action watch --seconds 8 --min-frames 1 --out-dir ./artifacts --json
./bin/computer-use see-now --action peek --json
./bin/computer-use see-now --action stop --json
./bin/computer-use click --frame-id FRAME_ID --x 100 --y 100 --capture-after --json
./bin/computer-use type --text '你好 Computer Use' --json
./bin/computer-use press-key --key Meta+A --json
./bin/computer-use scroll --frame-id FRAME_ID --x 600 --y 500 --delta-y 300 --json
```

截图 frame_id 绑定 session，60 秒过期，最多保留 256 帧引用。点击和滚动使用截图像素坐标，后端转换为桌面全局坐标。布局变化需要重新截图。输入已派发不等于目标应用已完成操作，使用后续截图确认。`capture_after` 失败时仍保留 executed。

see_now 支持 start/watch/peek/stop/status/window/region。stop 后需要 start。window 管理可选窗口的状态，默认不自动开启悬浮窗或音频。region 框选需要本机 Python Tk，缺少时返回明确原因。当前 Mac 不提供 Windows WASAPI 音频转写。摄像头与 OBS 需要对应设备，可用性依赖本机配置。精确视频取帧扫描时间轴并从头解码，大文件会比较慢。

macOS 录屏和辅助功能授权属于系统设置。缺少权限会返回明确错误，不把空白截图或未派发输入当成成功。

## 开发与验证

```sh
npm ci
npm run build
npm test
```

build 复制当前 Node 并编译 Swift。FFmpeg/FFprobe 已置于 bin，也可在服务配置中指定兼容可执行文件。源码、来源与许可说明见 vendor。不要把 `.state/token`、屏幕图片或本机二进制误提交到源码仓库。

运行 `node scripts/acceptance.mjs` 可以复验真实 MCP/HTTP/CLI 与视频和屏幕采集。桌面注入测试需要专门窗口和 FocusGuard，并显式传入 `--desktop`，前台不是测试进程时会拒绝发送输入。

自动测试涵盖实际 FFmpeg 解码/拼图、真实 MCP SDK 客户端与 HTTP/CLI 连接、native bridge 编译后的协议与权限检查。桌面键鼠实测记录位于 artifacts/acceptance.json，使用专门测试窗口，未操作用户业务应用。
