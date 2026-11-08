import { actionDesign } from "./design.mjs";

const upstream = "https://github.com/SAOS-3624/dsh-see-now/blob/59719eabba8b88f0b425c1839dfdc30be3c315a5/";
const ref = (file, label) => '<p class="small-note"><a href="' + upstream + file + '">' + label + ' ↗</a></p>';

const actions = {
  start: {
    icon: "bolt",
    description: "开启一条持续采集管线。屏幕源通过 FFmpeg 抓帧，并将原始像素送入上游视觉算法。",
    args: {action:"start",source:"screen"},
    steps: [
      ["确定来源", "解析 <code>source</code>、<code>path</code>、<code>realtime</code> 与屏幕区域，校验对应的本地授权。macOS 屏幕走 FFmpeg 的 <code>avfoundation</code>，视频文件直接交给 FFmpeg 解码。"],
      ["启动 FFmpeg", "通过 <code>dsh-see-now/runner</code> 的 <code>start()</code> 建立采集。它探测屏幕采集引擎，创建 <code>createPipeline()</code>，再用 <code>spawnFrames()</code> 启动 FFmpeg 子进程。"],
      ["组帧并推入管线", "FFmpeg 按采集尺寸输出 <code>rgb24</code> 到 stdout。<code>spawnFrames()</code> 每收齐 <code>宽 × 高 × 3</code> 字节交付一帧，<code>onFrame</code> 调 <code>pipeline.push()</code>。画面留在实时采集链上，调用方用 <code>watch</code> 或 <code>peek</code> 取图。"],
    ],
    boundary: "同一观察实例重复启动时复用正在采集的 runner，换来源先停止再启动。启动响应表示已发起采集，首帧由 watch 交付。服务端登记启动中的实例，避免 CLI 和 MCP 并发启动两个 FFmpeg 进程。FFmpeg 路径来自安装目录或显式配置。",
    links: [["see_now_watch", "see_now · watch"], ["video_live", "采集来源"]],
    sources: [["src/runner.js#L445-L552", "上游 runner.start"], ["src/capture.js#L228-L314", "FFmpeg 参数和 RGB 组帧"]],
  },
  watch: {
    icon: "activity",
    description: "等待下一批观察图像。连续采集负责评分、保留关键帧、拼图和编码。",
    args: {action:"watch",seconds:8,minFrames:1},
    steps: [
      ["复用采集", "进入 <code>runner.watch()</code>。在已授权的首轮按配置启动 runner；已有采集继续送帧。显式停止后需先调用 <code>start</code>。冷启动在允许单帧交付时优先返回首帧。切换画质、区域或模式时，由 runner 重建管线。"],
      ["计算变化分", "<code>cuts.js</code> 将 RGB 帧缩到 <code>64 × 36</code> 网格并转 HSV，比较相邻帧的加权差，得到 <code>0–255</code> 变化分。运动补偿、背景稳定性和前后帧用于辅助判定。"],
      ["判断何时留帧", "<code>pipeline.decide()</code> 优先保留切点，连续运动通过变化分累积触发保留，长时间无有效变化时使用兜底帧。接近的重复画面可被过滤。"],
      ["拼图与编码", "常规模式用 <code>pack.solve()</code> 排格，再由 <code>composePacked()</code> 将按时间排序的画面缩放到各格并标号，编码成 PNG。区域模式用固定格布局；<code>scene: true</code> 时每张图保留一帧。"],
      ["等待并交付", "runner 从交付队列取满足 <code>minFrames</code> 的图。到 <code>seconds</code> 上限时尝试交付可用的部分结果，仍不满足时返回原因。Runtime 把 PNG 和帧时间、格子位置及可用的台词交给对应入口。"],
    ],
    boundary: "计算发生在 FFmpeg 送帧时。<code>watch</code> 负责等待与取结果，<code>seconds</code> 沿用上游默认 300 秒、上限 860 秒，<code>minFrames</code> 默认 1。采样时间来自 <code>i / fps</code>，可用于粗定位，精确视频帧走 <code>video_frame</code>。取消等待与停止采集是两个动作。",
    links: [["see_now_start", "see_now · start"], ["see_now_peek", "see_now · peek"], ["video_frame", "按时间查看原始单帧"]],
    sources: [["src/cuts.js#L9-L81", "HSV 变化分"], ["src/pipeline.js#L783-L884", "留帧判断"], ["src/pipeline.js#L654-L722", "拼图和编码"], ["src/runner.js#L624-L886", "等待和交付"]],
  },
  peek: {
    icon: "camera",
    description: "立即领取已经准备好的拼图，队列为空时立即返回。",
    args: {action:"peek"},
    steps: [
      ["查询观察实例", "从已授权会话取得现有 runner，检查是否有已完成的图。此操作无需新建 FFmpeg 进程。"],
      ["取出已完成的图", "复用 <code>runner.peek()</code> 和 <code>takeSheets()</code>。如果宿主已预留一张图，则先取预留图，再按队列顺序取其余批次。结果被领取后从队列移除。"],
      ["返回图片或空结果", "将已有 PNG 和帧元数据交给调用方。没有成图时返回空状态，由宿主决定何时再次调用或改用 <code>watch</code> 等待。"],
    ],
    boundary: "<code>peek</code> 与 <code>watch</code> 消费同一观察实例的交付队列。服务端要串行化取图操作，避免同一张图被重复领走。",
    links: [["see_now_watch", "see_now · watch"], ["see_now_status", "see_now · status"]],
    sources: [["src/runner.js#L902-L908", "上游 runner.peek"]],
  },
  stop: {
    icon: "close",
    description: "结束当前观察，释放 FFmpeg 和附属采集资源。",
    args: {action:"stop"},
    steps: [
      ["标记会话已停止", "Runtime 禁止该观察实例继续接收取图请求，取消正在等待的 <code>watch</code>，并关闭已注册的会话回调。"],
      ["停止采集资源", "调用上游 <code>runner.stop()</code>。其清理逻辑取消宽限期计时、调用采集句柄的 <code>stop()</code> 结束 FFmpeg，并停止音频监听。"],
      ["收回观察状态", "丢弃当前观察实例及待交付图片，返回停止结果。重复 <code>stop</code> 可得到相同的停止状态。"],
    ],
    boundary: "显式停止后要求重新 <code>start</code> 才能恢复观察。悬浮窗显隐由 <code>window</code> 单独管理。",
    links: [["see_now_start", "see_now · start"], ["see_now_window", "see_now · window"]],
    sources: [["src/runner.js#L408-L421", "采集清理"], ["src/index.js#L990-L994", "DSH 停止操作"]],
  },
  status: {
    icon: "list",
    description: "读取当前观察实例、图像队列与可选能力的状态。",
    args: {action:"status"},
    steps: [
      ["读取 runner 快照", "复用 <code>runner.status()</code>，读取采集是否运行、来源、已收帧数、留帧与出图计数、排队图数以及最近错误。"],
      ["补充宿主状态", "适配层附上音频、悬浮窗可用性和文件是否到尾，分别标明运行状态与降级原因。"],
      ["返回结构化结果", "CLI 和 HTTP 得到 JSON，MCP 返回相同元数据。读取状态不会取走任何图片，也不会启动采集。"],
    ],
    boundary: "用于区分「FFmpeg 没起来」「正在采集但还没出图」和「已出图等待读取」。有预留图时，普通队列计数可能是零。",
    links: [["see_now_peek", "see_now · peek"], ["see_now_start", "see_now · start"]],
    sources: [["src/runner.js#L939-L980", "上游状态字段"]],
  },
  window: {
    icon: "screen",
    description: "读取或切换本机陪看悬浮窗的可见性。",
    args: {action:"window",show:true},
    steps: [
      ["获取桌面 UI 适配", "有本机窗口能力时，复用上游 <code>window</code> 模块与打包的窗口脚本；窗口尚未启动时返回当前状态。"],
      ["同步显示意图", "传 <code>show</code> 时，将其转换成窗口的隐藏配置，由现有窗口进程读取后应用；省略 <code>show</code> 时只读取窗口报告。"],
      ["返回观察状态", "返回当前进程是否存活、可见性和配置是否变化。配置写入与窗口刷新可能有短暂间隔。"],
    ],
    boundary: "悬浮窗是可选本机界面。缺少桌面或 Tk 依赖时，返回可用性原因，视觉采集和 MCP 取图仍可独立工作。",
    links: [["video_session", "持续陪看与反馈"], ["see_now_region", "see_now · region"]],
    sources: [["src/index.js#L1005-L1033", "窗口动作"], ["src/window.js#L124", "可见性设置"]],
  },
  region: {
    icon: "frame",
    description: "让用户在本机主屏框选矩形，供之后的屏幕观察使用。",
    args: {action:"region"},
    steps: [
      ["打开本机取框窗口", "复用上游 <code>pickRegion()</code> 和 <code>pick_region.py</code>。用户拖选完成后，脚本通过 stdout 返回矩形 JSON。"],
      ["校验并记录", "检查物理像素边界，只有有效选择才写入观察会话配置。取消或超时保留已有设置。<code>region: \"off\"</code> 清除区域。"],
      ["应用到屏幕采集", "下一次 <code>watch</code> 读取新区域并重建采集。在 macOS 的 AVFoundation 路径上，FFmpeg 使用 <code>crop</code> 裁剪后再缩放。"],
    ],
    boundary: "适用于主屏上可见的像素。文件、摄像头和 OBS 使用各自来源。UI 不可用时，已授权调用可以在 <code>watch</code> 传 <code>region: \"x,y,w,h\"</code>。",
    links: [["see_now_watch", "see_now · watch"], ["video_live", "实时视频源"]],
    sources: [["src/region.js#L69-L139", "本机取框"], ["src/capture.js#L252-L260", "FFmpeg 裁剪"]],
  },
};

export const seeNowActions = Object.fromEntries(Object.entries(actions).map(([action, doc]) => ["see_now_" + action, {
  title: "see_now · " + action,
  navLabel: action,
  path: "tools/see-now/actions/" + action,
  icon: doc.icon,
  status: "实现说明",
  description: doc.description,
  sections: [
    ...actionDesign[action],
    ["example", "MCP 调用参数", { code: ["JSON · tools/call 的 params", JSON.stringify({name:"see_now",arguments:doc.args}, null, 2)] }],
    ["behavior", "运行边界", '<p>' + doc.boundary + '</p>', { links: doc.links }, ...doc.sources.map(([file,label]) => ref(file,label))],
  ],
}]));
