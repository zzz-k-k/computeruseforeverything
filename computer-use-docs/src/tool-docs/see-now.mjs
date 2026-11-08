import { seeNowDesign } from "./design.mjs";

const upstream = "https://github.com/SAOS-3624/dsh-see-now/blob/59719eabba8b88f0b425c1839dfdc30be3c315a5/";
const source = (file, label) => '<p class="small-note"><a href="' + upstream + file + '">' + label + ' ↗</a></p>';
const dsh = (code) => ({ code: ["JavaScript · 工具调用参数", code] });

export const seeNow = {
  name: "see_now", title: "see_now", cn: "持续观察与视频采样", navLabel: "工具说明",
  path: "tools/see-now", icon: "video", type: "视觉", permission: "按来源授权",
  transportLabel: "CLI / MCP / HTTP", status: "实现说明",
  description: "沿用 dsh-see-now 的实际工具名与 action。持续观察屏幕、摄像头、OBS 或本地视频，交付带时间信息的关键画面。",
  sections: [
    ...seeNowDesign,
    ["actions", "action 参数", { table: [
      ["action", "用途"],
      ["<code>start</code>", "启动 FFmpeg 采集与视觉管线。"],
      ["<code>watch</code>（默认）", "等待并取得已选帧、拼图后的图像。"],
      ["<code>peek</code>", "立即取已就绪的画面。"],
      ["<code>stop</code>", "结束观察并释放资源。"],
      ["<code>status</code>", "查看采集、音频和队列状态。"],
      ["<code>window</code>", "读取或调整悬浮窗显隐。"],
      ["<code>region</code>", "让用户框选主屏区域。"],
    ] }, { links: [
      ["see_now_start", "start"], ["see_now_watch", "watch"], ["see_now_peek", "peek"],
      ["see_now_stop", "stop"], ["see_now_status", "status"], ["see_now_window", "window"], ["see_now_region", "region"],
    ] }],
    ["example", "调用示例", { code: ["Shell · Computer Use CLI", './computer-use see-now --action start --source screen --json\n./computer-use see-now --action watch --seconds 8 --out-dir ./observations --json\n./computer-use see-now --action stop --json'] }, dsh('see_now({ action: "start", source: "screen" })\nsee_now({ action: "watch", seconds: 8 })\nsee_now({ action: "stop" })')],
    ["topics", "能力参考", { links: [
      ["video_file", "本地视频文件"], ["video_live", "实时视频源"],
      ["video_keyframes", "关键帧与拼图"], ["video_scene", "逐场景观察"],
      ["video_audio", "声音与字幕"], ["video_session", "持续陪看与反馈"],
    ] }, source("src/tool-spec.js", "上游 see_now 工具定义")],
  ],
};

export const seeNowTopics = {
  video_file: {
    title: "see_now · 观看视频文件", navLabel: "观看视频文件", path: "tools/see-now/file", icon: "video", status: "上游参考",
    description: "读取本机视频，按播放顺序取得带时间戳的关键画面。",
    sections: [
      ["usage", "使用场景", '<p>适合回看录屏、了解短片内容，或定位某次场景变化。这里的调用示例来自 <code>dsh-see-now</code> 的 DSH 插件，统一 Runtime 已提供上游工具适配。</p>'],
      ["parameters", "输入参数", { table: [["参数", "说明"], ["<code>source</code>", "使用 <code>file</code> 读取本地视频。"], ["<code>path</code>", "目标电脑上视频文件的绝对路径。"], ["<code>realtime</code>", "设为 <code>true</code> 时按原速回放。省略或设为 <code>false</code> 时按 FFmpeg 的解码速度处理。"]] }],
      ["example", "调用示例", dsh('see_now({\n  action: "watch",\n  source: "file",\n  path: "/Users/me/Videos/demo.mp4",\n  realtime: true\n})\n\n// 继续读取同一视频的下一批画面\nsee_now({ action: "watch" })')],
      ["results", "读取结果", '<p>返回选中的画面或拼图，并附上帧的时间信息。文件播放到结尾后结束。快速解码模式由调用方继续取图，不启动常驻唤醒循环。</p>', { links: [["video_keyframes", "读懂关键帧拼图"], ["video_frame", "查看指定视频帧"], ["video_audio", "了解音频来源"]] }, source("src/runner.js", "回放逻辑源码")],
    ],
  },
  video_live: {
    title: "see_now · 实时视频源", navLabel: "实时视频源", path: "tools/see-now/live", icon: "camera", status: "上游参考",
    description: "观察屏幕上播放的视频、物理摄像头，或 OBS 虚拟摄像头。",
    sections: [
      ["sources", "采集来源", { table: [["来源", "用法", "适用场景"], ["屏幕", "<code>source: \"screen\"</code>", "看正在播放的网页或播放器。"], ["摄像头", "<code>source: \"camera\"</code>", "观察可访问的摄像头画面。"], ["OBS", "<code>source: \"obs\"</code>", "使用 OBS 虚拟摄像头输出的画面。"]] }, '<p>在新会话的首次调用选择来源。摄像头和 OBS 需要目标设备已就绪，且采集进程有系统权限。macOS 使用 AVFoundation，Windows 使用 DirectShow。</p>'],
      ["region", "只看播放器区域", '<p>在屏幕模式下调用 <code>action: "region"</code>，由用户在主屏幕上框选播放器。后续观察只采集框内可见像素，被其他窗口覆盖时会看到遮挡内容。传 <code>region: "off"</code> 恢复整屏。</p>', dsh('see_now({ action: "region" })\nsee_now({ action: "watch", source: "screen" })')],
      ["example", "观察 OBS 输出", dsh('see_now({ action: "watch", source: "obs" })'), '<p>先在 OBS 里开启虚拟摄像头。图像输出随 OBS 场景切换，语音转写由独立的音频采集能力处理。</p>', { links: [["video_audio", "声音与字幕"], ["see_now_watch", "watch 执行步骤"]] }, source("src/capture.js", "采集源源码")],
    ],
  },
  video_keyframes: {
    title: "see_now · 关键帧与拼图", navLabel: "关键帧与拼图", path: "tools/see-now/keyframes", icon: "layers", status: "上游参考",
    description: "按画面变化选帧，把一段时间内值得看的画面按顺序排进一张图。",
    sections: [
      ["sampling", "怎样选帧", '<p>突发变化用于识别剪辑切点。连续运动通过累积变化量来选帧，即使一镜到底也能留下代表画面。静止或重复画面交付更少。</p>'],
      ["output", "怎样读拼图", '<p>拼图按时间排序，配套清单列出每格的时间戳和尺寸。它适合判断先后顺序，例如先出现标题，再切到操作画面。需要读清小字时可以提高 <code>quality</code>，或使用逐场景模式避免拼图缩小。要按视频时间定位一张原始帧，可参见 <code>video_frame</code> 接口草案。</p>'],
      ["tuning", "画质与节奏", { table: [["配置", "用途"], ["<code>quality</code>", "<code>low</code>、<code>standard</code>、<code>high</code>、<code>ultra</code> 控制图像尺寸和可读性。"], ["<code>pace</code>", "<code>calm</code>、<code>normal</code>、<code>dense</code> 控制变化检测和交付节奏。文件回放的切点检测会采用更敏感的门槛。"], ["<code>minFrames</code>", "过滤帧数少于指定值的交付。"], ["<code>changeLog</code>", "在配置中启用后，附带变化强度、位置和切点摘要，包括图像已从队列淘汰的片段。"]] }],
      ["limits", "取样边界", '<p>检测依据是像素变化。快速剪辑、画面相似的镜头和短暂细节可能漏掉。变化日志能说明哪里变化，内容仍要结合画面判断。</p>', { links: [["video_scene", "使用逐场景模式"], ["video_frame", "查看指定视频帧"], ["video_file", "观看本地视频"]] }, source("src/pipeline.js", "选帧与拼图源码")],
    ],
  },
  video_scene: {
    title: "see_now · 逐场景观察", navLabel: "逐场景观察", path: "tools/see-now/scene", icon: "activity", status: "上游参考",
    description: "每次检测到并保留一个新场景，就用一张满幅图呈现。",
    sections: [
      ["usage", "使用场景", '<p>适合逐页讲解幻灯片、观察分镜或读清拼图中被缩小的内容。默认的多帧拼图适合连续浏览。开启逐场景模式后，每张交付图只放一个保留画面。</p>'],
      ["example", "开启与退出", dsh('see_now({ action: "watch", scene: true })\n\n// 继续观察时沿用当前模式\nsee_now({ action: "watch" })\n\n// 恢复多帧拼图\nsee_now({ action: "watch", scene: false })')],
      ["behavior", "交付规则", '<p>模式在当前观察会话中持续生效，直至关闭模式或停止会话。出图仍遵循变化检测与唤醒节流。画面频繁切换时，单场景图会增加图像和模型调用量。</p>', { links: [["video_keyframes", "比较关键帧拼图"], ["video_session", "持续陪看与反馈"]] }, source("src/tool-spec.js", "scene 参数定义")],
    ],
  },
  video_audio: {
    title: "see_now · 声音与字幕", navLabel: "声音与字幕", path: "tools/see-now/audio", icon: "audio", status: "上游参考",
    description: "将系统播放的声音转成带时间码的台词，与关键画面一起交付。",
    sections: [
      ["pipeline", "声音从哪里来", '<p>上游在 Windows 使用 WASAPI 回环采集系统输出，通过宿主的语音转写服务或配置的兼容服务生成台词。它会收进当时播放的其他应用声音。直接读取视频文件只采集画面，文件的音轨和内嵌字幕不会从这条路径提取。</p>'],
      ["output", "怎样对齐图像与台词", '<p>观察结果的「台词」段附有时间码，可与拼图的帧时间对应。拼图底部还可显示响度、静音段和切点标记。</p>', { code: ["文本 · 示例结果", "画面 1 · 24.1s · 场景切换\n画面 2 · 31.2s · 画面变化\n\n台词（机器转写）\n24.4s  开始演示第一步。\n31.2s  切换到下一页。"] }],
      ["support", "平台和结果边界", '<p>当前上游的系统音频回环仅支持 Windows，macOS 仍可观察画面。台词为空时可能是音频采集或转写未启用，也可能是这一段没有可识别语音。机器转写适合辅助理解，精确引用应核对原声。</p>', { links: [["video_live", "配置视频采集来源"], ["video_file", "回放本地文件"]] }, source("README.md", "上游音频说明")],
    ],
  },
  video_session: {
    title: "see_now · 持续陪看与反馈", navLabel: "持续陪看与反馈", path: "tools/see-now/session", icon: "watch",
    status: "上游参考", description: "持续读取新画面，按需向用户反馈，并在结束时停止采集。",
    sections: [
      ["lifecycle", "观察操作", { table: [["操作", "用途"], ["<code>watch</code>", "等待下一批可交付的画面。<code>seconds</code> 是等待上限。"], ["<code>peek</code>", "直接取已经准备好的画面。"], ["<code>status</code>", "检查采集、悬浮窗和音频状态。"], ["<code>stop</code>", "结束观察。用户关闭悬浮窗也可以结束持续陪看。"]] }],
      ["feedback", "向用户播报", '<p><code>say</code> 将一句反馈送到 DSH 的悬浮窗。配置语音适配器后，也可以朗读。适合在画面发生值得解释的变化时播报。</p>', dsh('see_now({ action: "watch", say: "刚才从标题页切到了操作演示。" })\nsee_now({ action: "status" })\nsee_now({ action: "stop" })')],
      ["scope", "宿主依赖", '<p>悬浮窗、宿主唤醒和语音播报属于 DSH 的陪看体验。跨宿主接入时，视觉引擎可以共用，反馈与唤醒方式由接入的宿主提供。</p>', { links: [["video_live", "选择实时视频源"], ["video_scene", "观察每次场景切换"]] }, source("src/tool-spec.js", "陪看工具参数")],
    ],
  },
};
