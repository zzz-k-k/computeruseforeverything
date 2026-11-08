import { exampleSource, snippet } from "./code-examples.mjs";

const captureKit = "https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager";
const quartz = "https://developer.apple.com/documentation/coregraphics/cgevent";
const ffprobe = "https://ffmpeg.org/ffprobe.html";

const source = (url, label) => '<p class="small-note"><a href="' + url + '">' + label + ' ↗</a></p>';

export const implementation = {
  screenshot: [
    { steps: [
      ["解析目标显示器", "Runtime 校验屏幕录制权限，将 <code>display_id</code> 解析为 macOS 显示器，读取桌面全局坐标范围。"],
      ["抓取单帧", "macOS 后端用 ScreenCaptureKit 的 <code>SCScreenshotManager</code> 抓取该显示器当前画面，编码成 PNG。"],
      ["登记帧引用", "保存 <code>frame_id</code>、截图像素尺寸、显示器坐标范围和布局版本，绑定到调用会话。后续定位可据此处理 Retina 缩放和多显示器偏移。"],
    ] }, source(captureKit, "Apple 单帧采集接口"),
  ],
  video_frame: [
    { steps: [
      ["定位视频流", "检查本地文件访问授权，选择主视频流。通过 <code>ffprobe</code> 读取帧的展示顺序与时间戳；将时间轴换算到视频播放起点。"],
      ["选择目标帧", "时间查询选择覆盖该时刻的帧，序号查询按展示顺序计数。可变帧率用实际展示时间戳，越界或时间轴不可用时返回明确错误。"],
      ["解码输出 PNG", "FFmpeg 解码目标帧并输出单张原尺寸图像，同时返回实际帧号与时间。定位可从前方关键帧开始解码，最终仍按准确帧匹配。"],
    ] }, source(ffprobe, "FFprobe 逐帧信息"),
  ],
  click: [
    { steps: [
      ["解析截图坐标", "读取同会话的 <code>frame_id</code>，校验坐标、帧有效期和显示器布局；将图像像素映射为桌面全局坐标。"],
      ["派发点击事件", "进入本机动作队列，由 macOS 后端用 Quartz <code>CGEvent</code> 按顺序发送左键或右键按下与抬起。"],
      ["按需截图", "设置 <code>capture_after</code> 时走单帧截图链路。若点击已派发但截图失败，保留 <code>executed</code> 并返回 <code>capture_error</code>，避免调用方重复点击。"],
    ] }, source(quartz, "Apple Quartz 事件接口"),
  ],
  type: [
    { steps: [
      ["校验文本和权限", "接收 Unicode 字符串并保留空格与换行，按安全的文本边界切分长字符串。"],
      ["向当前焦点输入", "把各段转换成 Quartz 键盘事件的 Unicode 内容，由本机动作队列顺序派发给当前获得焦点的应用。"],
      ["返回派发状态", "执行完返回结果，调用方用 <code>screenshot</code> 确认目标控件实际显示的文字。"],
    ] }, source(quartz, "Apple Quartz 事件接口"),
  ],
  press_key: [
    { steps: [
      ["解析单键或组合键", "将 <code>Enter</code>、方向键等转换成 macOS 虚拟键码，将 <code>Meta</code> 等修饰键转换为平台标志。未知键返回参数错误。"],
      ["发送键盘事件", "通过动作队列发出按下与抬起事件，取消或异常时释放本次按键，避免修饰键残留。"],
      ["交回执行状态", "返回事件派发结果，由调用方观察当前应用对快捷键的响应。"],
    ] }, source(quartz, "Apple Quartz 事件接口"),
  ],
  scroll: [
    { steps: [
      ["定位容器", "复用点击的帧引用校验与坐标变换，把 <code>x</code>、<code>y</code> 转成目标容器所在的桌面位置。"],
      ["构造滚动事件", "macOS 后端按目标平台方向换算水平与垂直滚动量，用 <code>CGEvent</code> 的像素滚动单位派发到该位置。"],
      ["交回执行状态", "报告事件是否已派发。后续截图能确认实际滚动距离和新坐标。"],
    ] }, source(quartz, "Apple Quartz 事件接口"),
  ],
};

export function toolImplementationCode(name) {
  if (name === "video_frame") {
    return [
      '<p>示例通过 <code>authorizeFile()</code> 接入 Runtime 的文件授权，用 FFprobe 的展示时间定位，再由 FFmpeg 按帧序号提取 PNG。示例容器支持 MP4、MOV、MKV、WebM 和 AVI。</p>',
      { code: ["JavaScript · video-frame.mjs", exampleSource("video-frame.mjs")] },
      { sample: ["video-frame.mjs", "完整视频取帧示例"] },
    ];
  }

  const handler = snippet("desktop.mjs", name);
  const code = name === "click" || name === "scroll"
    ? snippet("desktop.mjs", "point") + "\n\n" + handler : handler;
  return [
    '<p>Runtime 提供会话授权、帧存储、输入队列和 macOS 桥接对象。Swift 示例展示桥接到系统 API 后的实现。</p>',
    { code: ["JavaScript · Runtime 处理函数", code] },
    { code: ["Swift · macOS 后端", snippet("macos.swift", name)] },
    { sample: ["desktop.mjs", "完整 Runtime 处理函数"] },
    { sample: ["macos.swift", "完整 macOS 后端源码"] },
  ];
}
