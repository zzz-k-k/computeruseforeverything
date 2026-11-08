import {deploymentPage,publishingPage} from "./tool-docs/deployment.mjs";
import {browserPage,browserToolPages} from "./tool-docs/browser.mjs";
import { backgroundPage, windowToolPages, attachBackgroundDesign } from "./tool-docs/background.mjs";
import { statusPage } from "./tool-docs/status.mjs";
import { seeNow, seeNowTopics } from "./tool-docs/see-now.mjs";
import { seeNowActions } from "./tool-docs/see-now-actions.mjs";
import { desktopDesign } from "./tool-docs/design.mjs";

export const seeNowActionIds = Object.keys(seeNowActions);
export const seeNowTopicIds = Object.keys(seeNowTopics);
export const seeNowChildren = [...seeNowActionIds, ...seeNowTopicIds];
export const tools = ["screenshot", "video_frame", "click", "type", "press_key", "scroll", "see_now", ...Object.keys(windowToolPages), ...Object.keys(browserToolPages)];

export const groups = [
  { name: "开始使用", items: ["overview", "deployment", "quickstart", "publishing", "status", "architecture", "background", "browser", "project_layout", "permissions"] },
  { name: "接入方式", branch: "transports", items: ["mcp", "cli", "http"] },
  { name: "工具参考", branch: "tools", items: [...tools, ...seeNowChildren] },
];

export const pages = {
  deployment:deploymentPage,
  publishing:publishingPage,
  browser:browserPage,
  ...browserToolPages,
  status: statusPage,
  background: backgroundPage,
  ...windowToolPages,
  see_now: seeNow,
  ...seeNowActions,
  ...seeNowTopics,
  overview: {
    title: "概览", label: "Computer Use", path: "", icon: "overview",
    description: "统一的本机桌面 Runtime。AI 可以执行 CLI，也可以用 HTTP 连接 MCP 服务，调用同一套视觉与键鼠工具。",
    outline: [["workflow", "工作原理"], ["tools", "工具一览"], ["integrations", "接入方式"]],
  },
  quickstart: {
    title: "快速开始", path: "guide/quickstart", icon: "bolt",
    description: "从开启本地会话到完成第一次看屏、操作和结果确认。",
    sections: [
      ["prerequisites", "开始之前", '<p>先按“安装与部署”完成依赖与构建。保留 computer-use 的整个运行目录；以下 ./computer-use 示例在 bin 目录执行，不能只复制两个启动器。具备终端权限的 AI 可以直接执行 CLI；支持 MCP 的宿主可连接本机服务。首次运行时，按会话需要授予屏幕录制和辅助功能权限。</p>'],
      ["connect", "接入客户端", '<p>终端调用可使用 <code>./computer-use</code> 或绝对路径。配置 MCP URL 前，先运行 <code>computer-use-server</code>，再将 <code>http://127.0.0.1:8766/mcp</code> 填入支持 Streamable HTTP 的宿主。原生 HTTP 集成走同一服务的 <code>/v1/tools</code>。</p>', { links: [["mcp", "配置 MCP"], ["cli", "使用 CLI"], ["http", "调用 HTTP"]] }],
      ["first-run", "跑通操作闭环", '<ol class="steps"><li>开启本地控制会话，准备一个可编辑的测试窗口。</li><li>调用 <code>screenshot</code>，从图中找到输入框。</li><li>携带 <code>frame_id</code> 调用 <code>click</code>，再用 <code>type</code> 输入测试文本。</li><li>重新截图，确认文本出现在预期位置。</li></ol>', { code: ["终端示例", './computer-use screenshot --out-dir ./captures --json\n./computer-use click --frame-id frm_01 --x 420 --y 280\n./computer-use type --text "Computer Use"\n./computer-use screenshot --out-dir ./captures --json'] }, '<p class="small-note">示例中的 <code>frm_01</code> 需要替换成上一步返回的实际 ID。</p>'],
    ],
  },
  architecture: {
    title: "运行架构", path: "guide/architecture", icon: "layers",
    description: "一套桌面执行逻辑，为不同 AI 宿主提供一致的工具契约。",
    sections: [
      ["programs", "两个运行程序", { table: [["程序", "职责"], ["<code>computer-use</code>", "短进程 CLI。解析参数、连接本机 Runtime、写出 JSON 和图片。可通过绝对路径、相对路径或 PATH 调用。"], ["<code>computer-use-server</code>", "常驻进程。持有会话、捕获帧、观察实例和动作队列，在同一监听地址提供 <code>/mcp</code> 与 <code>/v1/tools</code>。"]] },
        { code: ["调用路径", [
          "AI / 终端 → computer-use → /v1/tools/{name} ┐",
          "AI / MCP 客户端 ───────────→ /mcp           ├→ computer-use-server",
          "应用 / HTTP ──────────────→ /v1/tools      ┘     → Runtime.call → tools/ → 平台或视觉引擎",
        ].join("\n")] }, { links: [["project_layout", "查看 Runtime 目录结构"]] }],
      ["lifecycle", "本机实例与会话", '<p>CLI 优先连接当前用户的服务。若服务尚未启动，它通过安装目录找到同级服务程序，启动并等待就绪。MCP URL 接入也可由用户先启动服务。客户端检查 /health，未启动时派生服务并等待就绪，然后读取本地 Bearer token。当前没有完整的并发启动锁；已有实例监听时不要再启动第二个服务。启动服务本身不发起采集。</p><p>同一已授权会话中，CLI 截图得到的 <code>frame_id</code> 可以在 MCP 调用中使用。会话作用域、授权和帧有效期由 Runtime 管理。</p>'],
      ["vision", "视觉与输入的实现边界", '<p>单张截图由 macOS 单帧采集后端处理；<code>video_frame</code> 用 FFmpeg 精确定位文件原始帧。持续观察直接复用 <a href="https://github.com/SAOS-3624/dsh-see-now">dsh-see-now</a> 的 FFmpeg 采集、变化打分和拼图；<code>see_now</code> 还复用上游 runner 管理采集生命周期。键鼠动作由 macOS 后端执行。</p>', { links: [["see_now", "see_now 复用架构"], ["screenshot", "单帧截图实现"], ["video_frame", "精确视频帧实现"]] }],
      ["dispatch", "统一派发", '<p>接入层把调用转换为工具名、参数、会话授权和取消信号。<code>Runtime.call()</code> 校验并调度注册工具，得到结构化数据和图像列表；HTTP、MCP 和 CLI 按各自格式交付。</p>', { flow: true }],
    ],
  },
  permissions: {
    title: "会话与权限", path: "guide/permissions", icon: "lock",
    description: "用户在本机决定 AI 可以看什么、可以做什么，以及何时结束会话。",
    sections: [
      ["scopes", "权限范围", { table: [["能力", "授权来源", "工具"], ["观察屏幕", "macOS 屏幕录制", "<code>screenshot</code>、屏幕模式的 <code>see_now</code>"], ["摄像头", "对应设备的系统授权", "<code>see_now</code> 的摄像头和 OBS 来源"], ["读取文件", "当前服务进程可读取的绝对路径视频文件", "<code>video_frame</code>、文件模式的 <code>see_now</code>"], ["控制键鼠", "macOS 辅助功能", "<code>click</code>、<code>type</code>、<code>press_key</code>、<code>scroll</code>"]] }, '<p>附带新截图的控制操作需要同时授予观察和控制权限。三种入口都在 Runtime 中检查授权。</p>'],
      ["lifecycle", "会话生命周期", '<p>session_id 是调用方指定的状态命名空间，隔离帧引用、观察状态与浏览器标签归属，不是身份认证或分用户权限。当前没有会话授权选择器或通用撤销接口；观察用 stop 停止，浏览器用 detach 释放，服务退出清理运行状态。</p>'],
      ["errors", "常见错误", { table: [["代码", "处理方式"], ["<code>invalid_session</code>", "检查 session_id 的格式与长度。"], ["<code>permission_denied</code>", "检查会话范围与系统授权。"], ["<code>stale_frame</code>", "重新截图并确认目标位置。"]] }],
    ],
  },
  mcp: {
    title: "MCP", path: "integrations/mcp", icon: "plug", status: "首版入口",
    description: "AI 宿主用 URL 连接 computer-use-server，通过 Streamable HTTP 发现和调用工具。",
    sections: [
      ["transport", "启动与连接", '<p>在目标电脑上运行 <code>computer-use-server</code>。支持 Streamable HTTP 的宿主配置 <code>http://127.0.0.1:8766/mcp</code> 和本机授权。URL 由宿主进程访问，运行在云端的宿主只能访问它自己所在环境的回环地址。</p>', { code: ["Shell · 启动本机服务", "./computer-use-server --listen 127.0.0.1:8766"] }],
      ["configuration", "工具发现和执行", '<p><code>tools/list</code> 从共享工具注册表生成定义。<code>tools/call</code> 把工具名和参数交给 <code>Runtime.call()</code>。所有会话共用本机服务令牌；同一 session_id 可跨入口引用同一批帧。连接配置采用宿主支持的 URL 和授权格式。</p>', { code: ["JSON · tools/call 的 params", '{\n  "name": "screenshot",\n  "arguments": {}\n}'] }],
      ["results", "工具结果", '<p>图像列表映射成 MCP 图像内容块，每张 PNG 单独交付。帧引用、时间戳与格子位置放进结构化结果。阻塞的观察请求接收传输层传入的取消信号。</p><p><a href="https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http">查看 MCP Streamable HTTP 规范 ↗</a></p>'],
    ],
  },
  cli: {
    title: "CLI", path: "integrations/cli", icon: "terminal", status: "首版入口",
    description: "AI 或脚本可执行同一个 computer-use 程序。安装目录内可直接运行，无需修改系统 PATH。",
    sections: [
      ["commands", "调用程序", '<p>可执行相对路径 <code>./computer-use</code>，或把可执行文件的绝对路径交给 AI。可选地在已有 PATH 中使用命令名。<code>--json</code> 输出结构化结果，诊断信息走标准错误。</p>', { code: ["Shell", './computer-use screenshot --out-dir ./captures --json\n"/absolute/install/path/computer-use" see-now --action watch --seconds 5 --out-dir ./observations --json\n./computer-use see-now --action status --json'] }],
      ["session", "连接本机 Runtime", '<p>CLI 把子命令和选项转换成工具名与参数，调用本机服务的 <code>/v1/tools/{name}</code>。服务未运行时，从 CLI 所在安装目录定位 <code>computer-use-server</code> 并启动。连续 CLI 命令和 MCP 调用在同一授权会话中共享截图引用。</p>'],
      ["images", "交付图像", '<p>使用 <code>--out-dir</code> 保存一张或多张图片，JSON 列出实际文件路径和对应元数据。没有 <code>--out</code> 选项。宿主读取图片后作为视觉输入交给模型。</p>', { links: [["see_now", "see_now 工具"], ["http", "原生 HTTP 接口"]] }],
    ],
  },
  http: {
    title: "HTTP", path: "integrations/http", icon: "globe", status: "首版入口",
    description: "computer-use-server 在本机同时提供 MCP HTTP 端点和面向 CLI、自建应用的 JSON API。",
    sections: [
      ["transport", "监听和授权", '<p>默认监听 <code>127.0.0.1:8766</code>。工具接口验证本机服务的 Bearer token、请求体与请求来源；<code>/mcp</code> 还按 Streamable HTTP 规则校验 <code>Origin</code>。</p>', { code: ["Shell · 启动本机服务", "./computer-use-server --listen 127.0.0.1:8766"] }],
      ["routes", "接口与调用", { table: [["方法与路径", "用途"], ["<code>/mcp</code>", "Streamable HTTP，提供 MCP 工具发现和调用。"], ["<code>GET /v1/tools</code>", "JSON API，列出当前授权下可用的工具定义。"], ["<code>POST /v1/tools/{name}</code>", "JSON API，请求体是工具参数对象，交给统一执行入口。"]] }, { code: ["Shell · JSON API", httpExample("see_now", {action:"watch",seconds:5})] }],
      ["results", "返回结果", '<p>JSON API 的 <code>result</code> 包含工具元数据，<code>images</code> 是零张或多张图。每项包含 <code>mime_type</code> 和 Base64 <code>data</code>。错误返回对应的 HTTP 状态和 <code>error.code</code>，例如无权限时返回 <code>403</code> 与 <code>permission_denied</code>。</p>', { links: [["mcp", "MCP over HTTP"], ["cli", "CLI 调用方式"]] }],
    ],
  },
  project_layout: {
    title:"目录结构",path:"guide/project-layout",icon:"layers",description:"与当前源码对应的运行目录。",
    sections:[
      ["tree","Runtime 文件树",{code:["实际目录",`computer-use/
├── bin/                  # CLI、服务、Chrome 宿主启动器与本机二进制
├── src/
│   ├── runtime.mjs        # 工具 schema、分发、帧引用
│   ├── transports/       # http.mjs、mcp.mjs、client.mjs、config.mjs
│   ├── tools/            # desktop、windows、browser、see-now、video-frame
│   ├── browser/          # broker.mjs：连接、请求、队列与标签归属
│   └── native/           # Swift / JS 原生桥接与 Chrome 宿主
├── extensions/chrome/    # Manifest V3 扩展
├── vendor/               # 固定版本视觉引擎与来源说明
├── scripts/              # 构建、注册、检查、真实验收
└── tests/                # 自动测试与测试窗口
computer-use-docs/src/    # 静态文档内容和构建器
.github/workflows/       # 手动发布静态文档`]}],
      ["ownership","每层负责什么",{table:[["位置","职责"],["src/transports/","转换 HTTP/MCP 调用与响应，处理本地连接和令牌。"],["src/runtime.mjs","共享工具定义、参数校验、会话标识、帧引用和分发。"],["src/tools/","桌面、窗口、浏览器和视频处理函数。"],["src/native/ / src/browser/","原生系统桥接和浏览器连接管理。"]]}],
      ["entrypoints","运行边界","<p>bin 中的启动器不是独立单文件发行包。源码构建后仍需保留依赖、vendor 和 src。静态文档独立构建，不依赖 macOS 桥接。</p>",{links:[["deployment","从源码部署"],["browser","Chrome 模块"]]}]
    ]
  },
};

function httpExample(name, args) {
  return [
    "curl -X POST http://127.0.0.1:8766/v1/tools/" + name,
    '-H "Authorization: Bearer $COMPUTER_USE_TOKEN"',
    "-H 'Content-Type: application/json'",
    "-d '" + JSON.stringify(args).replaceAll("'", "'\\''") + "'",
  ].join(" " + "\\" + "\n  ");
}

const toolDocs = [
  {
    name: "screenshot", cn: "截取当前画面", type: "视觉", icon: "camera", route: "screenshot",
    description: "立即抓取一张可用于定位的桌面截图，返回 PNG 和操作所需的坐标信息。",
    purpose: "需要查看当前窗口、读清界面细节，或准备执行点击和定点滚动时，先调用此工具。返回的截图代表单个时间点。",
    parameters: [["<code>display_id</code>", "string", "否", "目标显示器 ID。省略时使用会话默认显示器。"]],
    args: {}, cli: "computer-use screenshot --out-dir ./captures --json",
    returns: "返回 PNG、<code>frame_id</code>、<code>display_id</code>、图片宽高和采集时间。Runtime 保存该帧对应的坐标变换。",
    response: {frame_id: "frm_01", display_id: "main", width: 1440, height: 900, captured_at: "2026-11-05T10:00:00Z"},
    boundary: "截图以图片左上角为原点。后续输入动作使用图片像素，Runtime 负责映射到桌面坐标。",
    related: [["see_now_watch", "观察画面变化"], ["click", "按坐标点击"]],
  },
  {
    name: "video_frame", cn: "查看指定视频帧", type: "视觉", icon: "frame", route: "video-frame",
    status: "接口草案", permission: "本地文件读取",
    description: "按时间戳或帧序号定位本地视频中的一帧，返回原尺寸 PNG，便于检查拼图里的细节。",
    purpose: "例如从关键帧拼图定位到约 12.4 秒，再调用此工具查看那一刻的完整图像。传入时间戳时，选择该时刻正在显示的帧，按视频的展示时间戳定位。已知准确帧序号时，可以直接按序号读取。",
    parameters: [
      ["<code>path</code>", "string", "是", "已获授权的本地视频绝对路径。"],
      ["<code>timestamp_ms</code>", "number", "二选一", "从视频播放起点算起的毫秒数，须在视频范围内。"],
      ["<code>frame_index</code>", "integer", "二选一", "按展示顺序从 0 开始的帧序号。第 0 帧是第一张显示画面。"],
    ],
    args: {path:"/Users/me/Videos/demo.mp4",timestamp_ms:12400},
    cli: "computer-use video-frame --path /Users/me/Videos/demo.mp4 --timestamp-ms 12400 --out-dir ./captures --json",
    returns: "返回单张 PNG 和实际取得的帧序号、展示时间戳及图像宽高。时间戳可能早于请求值，例如 12.400 秒仍在显示从 12.375 秒开始的那一帧。",
    response: {frame_index:297,timestamp_ms:12375,width:1920,height:1080},
    boundary: "定位参数必须且只能传一个。越界时返回 <code>frame_out_of_range</code>。可变帧率视频的帧序号按解码后的展示顺序计算。拼图若给出相对某批次的时间，先换算到视频起点。输出属于视频像素坐标，桌面点击请另取 <code>screenshot</code>。",
    related: [["video_file", "观看视频文件"], ["video_keyframes", "从关键帧拼图定位"], ["screenshot", "截取当前桌面"]],
  },
  {
    name: "click", cn: "按坐标点击", type: "操作", icon: "cursor", route: "click",
    description: "使用最近截图的像素坐标点击目标，并可附带动作后的新截图。",
    purpose: "用于打开控件、选择列表项或让输入框获得焦点。目标位置由 <code>screenshot</code> 返回的单帧图像确定。",
    parameters: [["<code>frame_id</code>", "string", "是", "目标截图的帧 ID。"], ["<code>x</code> / <code>y</code>", "integer", "是", "相对于图片左上角的像素坐标，必须位于图像内。"], ["<code>button</code>", "string", "否", "<code>left</code> 或 <code>right</code>，默认为 <code>left</code>。"], ["<code>capture_after</code>", "boolean", "否", "为 true 时附带点击后的新截图，默认 false。"]],
    args: {frame_id:"frm_01",x:420,y:280,capture_after:true}, cli: "computer-use click --frame-id frm_01 --x 420 --y 280 --capture-after --out-dir ./captures --json",
    returns: "返回动作是否已派发。启用 <code>capture_after</code> 时还返回一张新图及其帧 ID，可用于下一次定位。",
    response: {status:"executed",frame_id:"frm_02"},
    boundary: "返回 <code>stale_frame</code> 时，重新截图并确认坐标再点击。动作已派发仅表示系统收到了输入，界面结果应通过新图确认。",
    related: [["screenshot", "截取当前画面"], ["type", "输入文本"]],
  },
  {
    name: "type", cn: "输入文本", type: "操作", icon: "text",
    route: "type", description: "将文本输入当前获得焦点的控件，适用于表单、编辑器和搜索框。",
    purpose: "先使用 <code>click</code> 聚焦目标，再调用此工具。可传入 Unicode 文本，包括中文和多行内容。提交表单可另用 <code>press_key</code>。",
    parameters: [["<code>text</code>", "string", "是", "要输入的原文。换行和空格保留。"]],
    args: {text:"你好，Computer Use"}, cli: 'computer-use type --text "你好，Computer Use" --json',
    returns: "返回系统是否收到文本输入。用截图确认文本是否进入预期控件。",
    response: {status:"executed"},
    boundary: "调用前检查输入焦点。返回错误或响应超时时，应先观察界面，再决定是否重试，以免重复输入。",
    related: [["click", "聚焦输入控件"], ["press_key", "发送按键"]],
  },
  {
    name: "press_key", cn: "发送按键", type: "操作", icon: "keyboard", route: "press-key",
    description: "向当前桌面发送单键或键盘组合，例如 Enter、Escape 和 Meta+A。",
    purpose: "用于确认对话框、退出菜单、移动焦点和执行应用快捷键。使用 <code>type</code> 输入正文。",
    parameters: [["<code>key</code>", "string", "是", "如 <code>Enter</code>、<code>Escape</code>、<code>Tab</code>、<code>ArrowDown</code> 或 <code>Meta+A</code>。"]],
    args: {key:"Meta+A"}, cli: 'computer-use press-key --key "Meta+A" --json',
    returns: "返回按键是否已派发。Runtime 将组合键映射为当前操作系统的按键事件。",
    response: {status:"executed"},
    boundary: "macOS 上 <code>Meta</code> 对应 Command。快捷键效果取决于当前窗口和焦点。",
    related: [["type", "输入文本"], ["screenshot", "检查执行结果"]],
  },
  {
    name: "scroll", cn: "滚动内容", type: "操作", icon: "scroll", route: "scroll",
    description: "在截图指定位置发送滚动，适用于页面、列表与嵌套滚动容器。",
    purpose: "从单帧截图选择滚动容器内的坐标，再发送滚动量。短距离滚动后重新观察，适合查找当前视口之外的内容。",
    parameters: [["<code>frame_id</code>", "string", "是", "滚动目标所在的截图 ID。"], ["<code>x</code> / <code>y</code>", "integer", "是", "目标位置的图片像素坐标。"], ["<code>delta_y</code>", "integer", "是", "纵向滚动量，正值向下，负值向上。"], ["<code>delta_x</code>", "integer", "否", "横向滚动量，正值向右，负值向左，默认 0。"]],
    args: {frame_id:"frm_01",x:600,y:500,delta_y:480}, cli: "computer-use scroll --frame-id frm_01 --x 600 --y 500 --delta-y 480 --json",
    returns: "返回滚动是否已派发。由目标应用处理滚动，实际位移可通过后续截图确认。",
    response: {status:"executed"},
    boundary: "画面存在内外两层滚动区域时，将坐标放进想要滚动的区域。滚动后刷新截图再使用新坐标。",
    related: [["screenshot", "重新定位"], ["see_now_watch", "查看变化"]],
  },
];

for (const tool of toolDocs) {
  pages[tool.name] = {
    ...tool, title: tool.name, label: tool.name, path: "tools/" + tool.route,
    sections: [
      ["usage", "使用场景", "<p>" + tool.purpose + "</p>"],
      ...desktopDesign[tool.name],
      ["parameters", "参数", { table: [["名称", "类型", "必填", "说明"], ...tool.parameters] }],
      ["example", "调用示例", { tabs: [["MCP", JSON.stringify({name: tool.name, arguments: tool.args}, null, 2)], ["CLI", "./" + tool.cli], ["HTTP", httpExample(tool.name, tool.args)]] }],
      ["result", "返回值", "<p>" + tool.returns + "</p>", {code: ["JSON · 元数据示例", JSON.stringify(tool.response, null, 2)]}],
      ["notes", "行为说明", '<p>' + tool.boundary + '</p>', {links: tool.related}],
    ],
  };
}

attachBackgroundDesign(pages);

for (const name of ["screenshot","click","type","press_key","scroll"]) pages[name].sections.push(["browser-target","Chrome 页面目标", "<p>传入 target:{kind:browser, connection_id, tab_id} 可使用已附加的 Chrome 标签。页面截图与原生窗口截图不可混用；连接断开后不自动重放输入。</p>",{links:[["browser","Chrome 扩展实现与安装"]]}]);

pages.project_layout.sections.push(["chrome-files","Chrome 扩展文件结构",{code:["目录","src/browser/broker.mjs         # Socket、会话、队列、请求关联\nsrc/tools/browser.mjs          # 浏览器工具和帧引用\nsrc/native/chrome-host.mjs     # Native Messaging 宿主\nextensions/chrome/             # MV3 扩展与状态面板\nbin/computer-use-chrome-host   # 打包 Node 启动器\nscripts/install-chrome-host.mjs\nscripts/browser-acceptance.mjs\ntests/browser.test.mjs"]},{links:[["browser","Chrome 实现细节"]]}]);
pages.architecture.sections.push(["chrome-backend","Chrome 页面执行器","<p>Runtime 根据 target.kind 分流；browser 工具经 Broker → Unix Socket → Native Messaging Host → 扩展 → CDP 操作页面。页面路径不使用原生系统鼠标输入。</p>",{links:[["browser","浏览器执行模块"]]}]);
