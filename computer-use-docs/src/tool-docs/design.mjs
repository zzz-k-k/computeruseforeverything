import { exampleSource, snippet, upstreamExcerpts } from './code-examples.mjs';
const evidence = JSON.parse(exampleSource('design-evidence.json'));
const base = 'https://github.com/SAOS-3624/dsh-see-now/blob/59719eabba8b88f0b425c1839dfdc30be3c315a5/src/';
const p = text => '<p>' + text + '</p>';
const code = (value, lang = 'JavaScript') => ({ code: [lang + ' · 关键逻辑', value] });
const step = (id, title, text, value, after = '', lang = 'JavaScript') => [id, title, p(text), code(value, lang), ...(after ? [p(after)] : [])];
const proof = key => evidence[key].code;
const cite = key => '<p class="small-note">逻辑依据 <a href="' + base + evidence[key].file + '#L' + evidence[key].line + '">' + evidence[key].file + ' ↗</a></p>';
const upstreamStep = (key, title, text, after) => [...step(key, title, text, proof(key), after), cite(key)];
const excerpt = (action, index = 0) => upstreamExcerpts[action][index][1];
// Short spans of the maintained reference functions, extracted without rewriting their behavior.
function span(file, from, to) {
  const source = exampleSource(file);
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error('Missing design span ' + from);
  return source.slice(start, end + to.length);
}
const desktop = (from, to) => span('desktop.mjs', from, to);
const swift = (from, to) => span('macos.swift', from, to);
const seenow = (from, to) => span('see-now.mjs', from, to);

export const desktopDesign = {
  screenshot: [
    step('target', '01 解析显示器并记录布局', '截图既要返回图像，也要为后续点击建立坐标依据。先检查屏幕权限，再读取当前显示器布局。省略 display_id 时选主屏，记录布局版本，防止截图过程中插拔显示器导致坐标失效。', desktop('ctx.require("screen");', 'const display = display_id ?? layout.mainDisplayId;')),
    step('pixels', '02 按物理像素尺寸采集', '选择显示器创建内容过滤器，截图包含该显示器上的窗口。contentRect 使用逻辑尺寸，乘 pointPixelScale 后得到图像像素尺寸。Retina 屏不能把逻辑宽度直接当成 PNG 宽度。', swift('let filter = SCContentFilter', 'config.showsCursor = false'), '', 'Swift'),
    step('capture', '03 获取图像并编码 PNG', 'SCScreenshotManager 返回 CGImage。使用 ImageIO 把它写成一张 PNG，Finalize 成功后才能交付字节。PNG 保留文字边缘，适合作为模型定位依据。', swift('let image = try await SCScreenshotManager', 'guard CGImageDestinationFinalize(png) else { throw DesktopError.encodeFailed }'), '采集前后的显示器边界必须一致。系统录屏权限不足或显示器消失时，返回错误，不生成可点击的 frame_id。', 'Swift'),
    step('frame', '04 登记图像与桌面坐标的对应关系', '采集后再次比较布局版本。把像素宽高、桌面全局边界和显示器 ID 存入当前会话，生成 frame_id。图片字节放在 images，元数据放在 result，三个调用入口共享这个结果。', desktop('const current = await ctx.macos.displayLayout();', 'images: [{ mime_type: "image/png", bytes: png }],\n  };'), 'frame_id 指向一次观察，不代表实时画面。点击时仍需检查有效期和布局版本。'),
  ],
  click: [
    step('frame', '01 检查点击依据是否仍有效', '点击接收截图内的整数像素坐标。先按会话查找 frame_id，再拒绝过期帧与越界坐标。布局版本也必须匹配，避免把旧屏幕位置用到新布局。', desktop('const frame = ctx.frames.get', 'if (layout.version !== frame.layoutVersion) throw fail("stale_frame");')),
    step('point', '02 将截图像素换算成桌面位置', '以像素中心 x + 0.5 和 y + 0.5 定位，分别乘桌面尺寸与图像尺寸之比，再加显示器全局偏移。这样同时处理 Retina 缩放和副屏负坐标。', desktop('const { left, top, width, height }', 'y: top + (y + 0.5) * height / frame.height,\n  };'), '例如截图宽 2880 像素、桌面宽 1440 点，则每个截图像素对应 0.5 点。副屏 left 为负值时，公式直接保留该偏移。'),
    step('dispatch', '03 串行发送按下与抬起', '点击进入本机输入队列，避免与键盘、滚动事件穿插。执行前检查取消信号，在同一位置构造一对鼠标事件。两个事件都创建成功后才派发，clickState = 1 表示单击。', snippet('macos.swift', 'click'), 'executed 表示事件已派发。目标应用是否响应，需要通过后续画面判断。', 'Swift'),
    step('after', '04 可选地观察点击后的画面', 'capture_after 开启时，在派发完成后调用 screenshot。点击与截图有先后关系，但目标应用可能仍在加载。截图失败也必须保留 executed，避免调用方误以为点击失败而再次触发操作。', desktop('if (!args.capture_after)', 'images: [],\n      };')),
  ],
  type: [
    step('validate', '01 接收原样文本并排队', 'text 必须是字符串，参考处理函数限制为 4096 个 JavaScript UTF-16 码元。不 trim，不替换空格和换行。输入队列保证这段文本与其他操作按顺序派发。', snippet('desktop.mjs', 'type')),
    step('unicode', '02 按字符簇拆分 Unicode', 'Swift 的 Character 迭代保留组合字符和 emoji 的边界，再转为系统 API 需要的 UTF-16。单个字符簇超过 20 个码元时提前拒绝。所有片段预先校验，避免输入一半才发现后面的字符无法构造事件。', swift('let units = text.map', 'throw DesktopError.textClusterTooLong\n    }'), '', 'Swift'),
    step('events', '03 为每个字符构造输入事件', '每个字符创建一对键盘事件，将 UTF-16 内容写到按下事件的 Unicode 字段。这里发送文字内容，不依赖当前键盘布局把某个物理键翻译成文字。先建立完整事件列表，再逐对派发。', swift('let events = try units.map', 'for (down, up) in events {\n        down.post(tap: .cghidEventTap)\n        up.post(tap: .cghidEventTap)\n    }'), '文本进入当前焦点控件。因此调用前应点击目标输入框，调用后可截图核对。executed 不能证明应用接收了全部文字。', 'Swift'),
  ],
  press_key: [
    step('parse', '01 将组合键拆成修饰键与主键', '将字符串转为小写并按 + 拆分。最后一项作为主键，例如 Meta+Shift+A 的主键是 a。主键通过显式键码表解析，Enter 对应 kVK_Return，字母 A 对应 kVK_ANSI_A。未知键提前拒绝。', swift('let parts = key.lowercased()', 'throw DesktopError.invalidKey\n    }'), '', 'Swift'),
    step('flags', '02 把修饰键转为事件标志', 'Meta、Alt、Ctrl、Shift 分别对应 Command、Option、Control、Shift。逐项累计 CGEventFlags，遇到未知或重复修饰键返回 invalidKey。修饰信息附着在本次事件上，无需另外长时间按住修饰键。', swift('let modifiers: [String: CGEventFlags]', '"ctrl": .maskControl, "shift": .maskShift,\n    ]') + '\n\n' + swift('var flags: CGEventFlags', 'flags.insert(flag)\n    }'), '', 'Swift'),
    step('send', '03 成对派发按键事件', '以同一虚拟键码创建 keyDown 和 keyUp，按下事件携带组合键 flags，抬起事件清空 flags，再按顺序发送并保留短暂派发间隔。输入队列在进入系统桥接前检查取消信号。快捷键处理结果由当前前台应用决定。', swift('guard let down = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode', 'up.post(tap: .cghidEventTap)'), '例如 Meta+A 发出 Command+A。它是否全选文本，取决于焦点是否在可编辑控件内。', 'Swift'),
  ],
  scroll: [
    step('target', '01 从截图定位滚动容器', 'scroll 与 click 使用相同的 frame_id 校验和坐标变换。先解析目标位置，再派发事件。嵌套列表需要把位置放在内层列表范围内，让系统和应用决定由哪个容器接收。', snippet('desktop.mjs', 'scroll')),
    step('amount', '02 校验滚动量并转换方向', '对外约定 delta_y 正数向下、delta_x 正数向右。Quartz 会应用系统的自然滚动设置，因此先读取该设置，再转换方向，使对外的正值始终表示向下或向右。先转换为 Int32 并排除最小值，避免取负溢出。', swift('guard let x = Int32(exactly: deltaX)', 'x != Int32.min, y != Int32.min else { throw DesktopError.invalidScroll }'), '', 'Swift'),
    step('event', '03 发送带目标位置的像素滚动', '使用 pixel 单位，第一轴是纵向，第二轴是横向。event.location 携带上一步解析的桌面位置。派发之后返回 executed，再由截图确认结果。', swift('guard let event = CGEvent(scrollWheelEvent2Source', 'event.post(tap: .cghidEventTap)'), 'delta_y = 480 表示请求向下滚动的输入量。应用可能存在平滑滚动、边界或自定义处理，不能把它等同于最终内容位移。', 'Swift'),
  ],
  video_frame: [
    step('selector', '01 明确用时间还是帧号定位', 'timestamp_ms 和 frame_index 必须且只能提供一个。时间必须非负且有限，帧号必须是非负安全整数。文件先经 authorizeFile 解析授权路径，FFmpeg 和 FFprobe 都通过参数数组调用。', span('video-frame.mjs', 'const { timestamp_ms, frame_index } = args;', 'const file = await authorizeFile(args.path);')),
    step('probe', '02 读取实际展示时间轴', 'FFprobe 选择第一个非封面视频流 V:0，逐帧输出 best_effort_timestamp_time，并保留视频流编号和时长。帧号按展示顺序从 0 开始计数。可变帧率视频的间隔不固定，不能用时间乘平均 FPS 定位。', span('video-frame.mjs', 'const { stdout } = await exec(ffprobePath', 'return { frames, stream: streams[0] };'), '当前参考实现扫描完整时间轴，适合先保证定位正确。长视频的扫描成本随帧数增长，64 MiB 的探测输出上限也是明确限制。'),
    step('timeline', '03 归一化时间并检查顺序', '以第一帧展示时间为播放起点，转为整数微秒，减少小数比较误差。缺少时间戳或时间戳逆序时返回 timeline_unavailable。帧序号查询也沿用这项校验，因为返回值需要可靠的实际时间。', span('video-frame.mjs', 'const times = frames.map', 'const relative = times.map(time => Math.round((time - origin) * 1_000_000));')),
    step('choose', '04 找到覆盖目标时刻的画面', '时间查询选择展示起点不晚于目标时刻的最后一帧。假设各帧起点为 0、40、120 毫秒，查询 90 毫秒得到第 1 帧，返回实际时间 40 毫秒。先用末帧时长或流时长判断视频终点，越界时不返回末帧冒充命中。', span('video-frame.mjs', 'const target = Math.round(timestamp_ms * 1000);', 'index = relative.findLastIndex(time => time <= target);')),
    step('decode', '05 解码指定展示帧', '把选中的流编号传给 -map，select 按解码后帧序号 n 选中一帧，-frames:v 1 限制输出数量，image2pipe 把 PNG 写到 stdout。此参考路径从头解码，避免仅跳到关键帧造成定位偏差。', span('video-frame.mjs', 'const { stdout: png }', 'maxBuffer: 64 * 1024 * 1024 });')),
    step('decoded-result', '06 校验图片并返回实际位置', '检查 PNG 签名和最小头部长度，再读取 IHDR 的宽高。返回的是实际命中的帧号与时间，而非原样回显请求时间。该图片来自视频文件，不登记为可点击的桌面 frame_id。', span('video-frame.mjs', 'if (png.length < 24', 'images: [{ mime_type: "image/png", bytes: png }],\n  };')),
  ],
};

export const actionDesign = {
  start: [
    step('session', '01 确定观察实例与来源', '按 sessionId 保存 runner、source、region 和当前读任务。启动操作进入会话锁，已有取图任务时返回 capture_busy，已运行的同来源实例直接复用。切换来源先停止，防止后台同时存在两条来源不明的采集链。', seenow('if (state.read) throw fail("capture_busy");', 'const settings = configure(state, args, source, ctx);')),
    step('pipeline', '02 用配置创建持续采集管线', 'quality 决定采集尺寸，pace 决定选帧节奏，scene 决定是否单帧交付。解析后的来源包含文件路径或屏幕区域。runner 持有 FFmpeg 句柄和 pipeline，start 返回后它们继续存活，watch 才能读取这段时间积累的变化。', seenow('const captureSource = source.kind', 'src: captureSource, opts: settings.opts, quality: settings.quality,\n      });'), '屏幕采集不要求先录成视频文件。FFmpeg 持续把原始 RGB 帧写入管道，视觉算法直接消费这些帧。'),
    upstreamStep('captureArgs', '03 让 FFmpeg 输出统一的 RGB 帧', '输入端按来源选择系统采集设备或视频文件。画面处理关闭音频和字幕输出，macOS 屏幕区域先 crop，再 scale 到管线固定尺寸，最后指定 rawvideo 与 rgb24。每个像素固定 3 字节，后续组帧才能知道边界。', '文件 realtime=true 时按原速解码，否则按解码速度处理。这里的 -an 只关闭这条视觉链的音轨，独立音频功能使用另一条采集链。'),
    upstreamStep('assemble', '04 将任意长度的管道数据还原成帧', 'stdout 的 data 事件不等于一帧。need = width × height × 3，filled 表示当前已收字节数，off 表示本次 chunk 的读取位置。每次只复制仍缺的部分，达到 need 才交付。如果一个 chunk 恰好包含整帧，则直接使用 subarray 视图。', '例如 800 × 450 的 RGB 帧需要 1,080,000 字节，可能分成多个 chunk 才到齐。不能对每个 chunk 直接执行图像评分。'),
    step('push', '05 收到完整帧后立即进入视觉计算', '每帧附带序号 i 与采样时间 t = i / fps。onFrame 同步调用 pipeline.push，完成评分和选帧，避免建立无限增长的异步帧任务队列。单帧计算异常记录到 lastError，后续帧仍可继续处理。', excerpt('start'), '启动成功只说明采集管线已建立。首帧、采集错误和累计帧数分别通过 watch 与 status 观察。采样时间适合定位观察片段，文件精确取帧使用 video_frame。'),
  ],
  watch: [
    step('request', '01 挂起一次取图请求，复用持续采集', '每个会话同时只允许一个 watch 或 peek 消费结果。watch 组合请求取消信号与停止信号，把 seconds、minFrames 和当前配置交给 runner。等待任务在会话锁外运行，stop 才能取得锁并取消它。', seenow('const cancel = new AbortController();', 'state.read = { cancel, done };'), 'seconds 是等待上限，不是固定录制长度。冷启动且 minFrames ≤ 1 时可优先交付首帧。采集已存在时继续处理新帧，配置尺寸、区域或模式变化则重建管线。'),
    upstreamStep('grid', '02 把每帧压缩为 64 × 36 的比较网格', '评分只需要低分辨率特征。把输入画面划成 64 × 36 个格子，每格在横纵 1/4 和 3/4 位置取四个像素，对 R、G、B 分别求平均。这样每帧只需比较 2304 个位置，同时缓和单点噪声。', 'out 保存的是比较特征，原始 RGB 帧仍保留在 entry.buf 中供最终拼图。评分时缩小不意味着返回图片只能使用这个分辨率。'),
    upstreamStep('hsv', '03 转为色相、饱和度与亮度', '每格 RGB 先除以 255。max 与 min 的差 d 决定饱和度，最大通道决定色相所在区间，亮度取 max。最后把 H、S、V 都映射到 0–255。灰色像素 d = 0 时色相设为 0。', '这一步使颜色改变和亮度改变都能进入比较。后续对低饱和像素降低色相权重，避免接近灰色时不稳定的色相造成误判。'),
    upstreamStep('score', '04 计算相邻帧的变化分', '逐格计算三个通道的差。色相是环形量，所以取 min(|ΔH|, 255 − |ΔH|)。色相差再乘两帧较低的饱和度 / 255，加上 |ΔS| 和 |ΔV|，最终除以格子数 × 3。分数越高，代表像素特征变化越大。', '例如 H 从 254 变到 1，环形差只有 2，而不是 253。这个分数衡量画面差异，不能直接解释为语义重要性或变化概率。'),
    step('motion', '05 用运动补偿和背景信息排除误判', '同位置像素变化也可能来自镜头平移。对每个网格位置，先比较同位置，再在配置的 radius 邻域搜索相似位置。最小差仍超过 tau 才计为变化，mc 分数为未匹配格子数 / 2304 × 255。与此同时记录变化包围框、填充率与高度范围，并维护稳定背景信息。', `// 算法示意，省略邻域搜索循环
const changed = unmatchedCells;
const mcScore = changed / (64 * 36) * 255;
const fill = changed === 0 ? 0 : changed / (bboxWidth * bboxHeight);`, '当前景遮挡后很快移开，旧背景会恢复。对需要确认的候选，管线保留短队列并等待未来帧，对比背景是否持续改变。等待长度与阈值由 pace 配置控制，不是所有帧都固定等待同样时长。'),
    upstreamStep('spike', '06 将当前变化与前后变化比较', 'px 是前一帧变化分，nx 是后一帧变化分，base 取二者和 1 的最大值。spike 检测孤立突增，step 检测持续运动中的明显台阶。各条件还要求绝对分数或运动补偿门槛，避免把低幅噪声的倍数放大当作切点。', '例如前后分数都很低而当前突然升高，更像切镜头。前后一直有运动时，改用绝对增量、比例以及运动补偿判断。低分孤立切点另有包围框和填充率条件。'),
    upstreamStep('cut', '07 汇总判断，优先保留切点', '只有距上一切点达到 cutMinGap，且未被前景运动 fgMotion 或未来帧确认 futureFg 排除，才允许把运动补偿、尖峰、台阶或孤立弱切点判定汇总为 cut。保留切点时清零运动累计量，因为跨镜头差异不应继续当作同一镜头内的运动。', '第一帧没有上一帧可比，score 为 null，直接以 start 原因保留。各个阈值来自配置，不能用单一固定分数替代整条判定链。'),
    upstreamStep('integral', '08 无切点时累计运动，并为静止画面兜底', '普通变化逐帧累加到 acc。阈值为 REF_SCORE × fps × integralSeconds，同时满足 markMinGap 才尝试留一张 mark 帧。只有 keep 真正成功才清零，否则保留累计值。长时间无有效留帧时，用 floor 帧兜底，间隔可按最近留帧间隔的指数平均值调整并夹在上下限内。', '这使一镜到底也能留下过程帧。假设连续小变化已积累到阈值，但画面与上次留帧太像被过滤，下一帧仍继承累计值，不会重新等待完整一轮。'),
    upstreamStep('dedup', '09 与上一张保留帧比较，过滤重复画面', '去重比较对象是上一张实际保留的 HSV，而非上一张输入帧。差异低于 dupMin 时拒绝普通留帧并增加 dupSkipped。cut 和 floor 绕过去重，分别保证切点与静止兜底不会被吞掉。', '成功留帧后记录 t、buf、tier、via、wall 和变化位置。tier 根据变化密度分配图中大小，via 说明该帧来自 start、cut、mark 还是 floor。'),
    step('flush', '10 根据可读性、容量与等待时间决定出图', '每次留帧后检查排布。当当前批次需要多个画布时，将装不下的尾部帧留给下一张，保持时间顺序。单格面积过小、达到帧数上限或等待过久也会触发出图。计时从当前批次第一帧开始，避免刚到的新帧立即被交付。', `// 出图条件示意，省略拆分画布的实现
if (plan.bins > 1) splitAndFlush();
else if (cellArea < options.flushGain && frames.length >= 2) flush(t, 'crumb');
else if (frames.length >= 2 && t - sheetStart >= options.maxWaitSec) flush(t, 'time');
else if (frames.length === 1 && t - sheetStart >= options.maxWaitSec * 2) flush(t, 'time');`, '区域模式使用固定格布局。scene 模式将交付收敛到一张图一个保留画面，仍保留变化检测，不等于逐个返回所有解码帧。'),
    upstreamStep('pack', '11 按时间顺序为保留帧分配矩形', '常规模式将档位序列交给 solve。排布器枚举连续帧组成一行的尺寸方案，用动态规划选择行与画布分配，兼顾占用面积和开新画布成本 binCost。帧顺序不变，toRects 把归一化格子换成实际像素矩形。', '一张输出图只绘制 bin = 0 的格子，防止其他画布从原点开始绘制而覆盖现有内容。区域模式不经过这条可变尺寸排布路径。'),
    upstreamStep('compose', '12 缩放到目标格子并编码 PNG', '每帧以原始像素缓冲 src 和尺寸 sw、sh 传给 composePacked。它直接把内容缩放写入画布对应矩形，burn=index 给各格标序号。需要音轨条时预留底部高度后原位绘制，最后以 PNG level 3 编码。', '返回清单保存帧时间与格子位置，模型通过编号对应画面和时间。音频对齐使用处理时的 wall 时钟，不能用可能因掉帧漂移的 t 代替。'),
    upstreamStep('timeout', '13 领取结果，超时交付可用的部分批次', '正常等待从队列取图，过滤帧数少于 minFrames 的拼图。到达期限时 flushNow 尝试将未完成批次出图，符合最少帧数则标记 partial=true 返回。仍无结果则给出取消、无变化或采集停止原因，并保留 lastError。', 'minFrames 是交付过滤条件，不是要求精确保留 N 帧。取消当前等待不等于 stop，显式停止后必须 start 才能恢复该观察会话。'),
  ],
  peek: [
    step('lock', '01 确保结果只有一个领取者', 'peek 不等待新画面，也不启动采集。它进入同一会话锁，若 watch 正在等待则返回 capture_busy。这样 CLI 与 MCP 同时取图时，不会争抢同一批结果。', seenow('async function peek', 'ctx.signal?.throwIfAborted();')),
    upstreamStep('take', '02 先取有效预留图，再消费结果队列', '如果存在预留图，先清空预留引用并检查是否过期。有效时优先加入结果，过期则丢弃。随后按 wakeBatch 上限从 pipeline.take() 逐张移出已完成拼图。', 'peek 和 watch 共用 takeSheets。已经被取走的图不会在下一次读取中重复出现，pending 为零也不一定表示没有预留图。'),
    step('result', '03 立即返回图片或 empty', '没有 runner 或队列为空时得到空数组，返回 empty。有图片时返回 ready，图片字节与帧清单按相同顺序封装。peek 不强制把正在积累的半张拼图提前输出。', seenow('const sheets = state.runner?.peek()', 'status: sheets.length ? "ready" : "empty" }, sheets);')),
  ],
  stop: [
    step('cancel', '01 标记停止并终止等待', '首先写入 stopped 并递增 epoch。停止标记阻止后续 watch 自动重新启动，epoch 让正在进行的区域选择结果失效。若有取图任务，先取消再等它收尾，防止 stop 返回后还交付旧结果。', seenow('state.stopped = true;', 'await pending.done.catch(() => {});\n      }')),
    step('release', '02 释放采集进程与计时器', '清除宽限期定时器，调用采集句柄 stop 结束 FFmpeg，并清空 run、running 和 source。音频监听也在这一步停止，避免视觉观察结束后还有采集进程运行。', excerpt('stop')),
    step('reset', '03 丢弃当前观察实例', '清空 runner 会同时使当前待交付图片不再可读。重置来源、场景模式、节奏和画质，返回 stopped。重复调用仍得到已停止状态。区域配置可保留，下一次 start 再使用。', seenow('state.runner?.stop();', 'return result({ stopped: true });'), 'stop 负责采集生命周期，窗口可见性由 window 管理。工具结果已完成停止，并不自动表示窗口已隐藏。'),
  ],
  status: [
    step('read', '01 读取现有实例，不创建新采集', 'status 在会话锁内读取快照。没有 runner 时直接返回 running=false、pending=0。它不调用 runnerFor，不触发 FFmpeg，也不消费图片。', snippet('see-now.mjs', 'status')),
    step('fields', '02 按采集阶段解释状态', 'frames 是已经收到的采样帧数，stats 进一步区分留帧和出图，pending 是普通队列中等待领取的拼图数。lastError 保留最近错误，endedFile 区分文件读到末尾，reserved 单独表示已经预留的图。', excerpt('status'), 'running=true 且 frames=0 表示尚未收到有效帧。frames 持续增长但 pending=0 可能正在积累，也可能刚被取走，应结合 stats 与 reserved 判断。explicitly_stopped 单独表示会话是否被显式停止。'),
  ],
  window: [
    step('capability', '01 检查本机窗口能力', 'window 管理可选本机界面。先检查 local_ui 权限，窗口能力不存在则返回 available=false。有能力时使用指定状态目录，避免配置写到不相关的窗口实例。', seenow('ctx.require("local_ui");', 'const options = { env: windowEnv };')),
    step('visibility', '02 将显示意图写成窗口配置', 'show 是布尔值时更新显隐配置。对外使用 show，窗口内部保存 hidden，因此只在 hiddenForShow 一处转换方向。省略 show 则只查询，不写配置。', seenow('const change = typeof show', ': null;'), '这里只改变窗口显隐，不等于启动或停止屏幕采集。后台窗口进程读取配置后才实际刷新，可见性变化可能短暂滞后于配置写入。'),
    step('report', '03 返回窗口报告与变更结果', '读取窗口进程报告，连同本次 change 一起返回。调用方据此区分能力不存在、设置未改变与设置已更新。不能仅以配置写入成功推断窗口已经完成绘制。', 'return result({ available: true, window: window.windowReport(options), change });'),
  ],
  region: [
    step('pick', '01 打开框选界面并记录操作版本', '检查本机 UI 与屏幕权限。正常框选先递增 epoch，再在锁外等待 pickRegion 完成，让用户有时间拖动矩形，同时允许 stop 继续执行。region=off 则直接清空区域并递增版本。', seenow('const epoch = await locked', 'const picked = await pickRegion();'), '框选脚本返回 x、y、w、h。坐标单位必须与屏幕采集分辨率一致，Retina 的逻辑点需要在选择界面或校验阶段转换成采集像素。'),
    step('validate', '02 校验矩形并拒绝过时结果', '矩形必须是整数，宽高大于零，且在目标主屏物理像素范围内。取消或超时不覆盖当前区域。回到会话锁后再次比较 epoch，若用户已停止或启动另一轮选择，就丢弃这次返回值。', seenow('if (state.epoch !== epoch', 'return result({ ok: true, region: state.region });'), 'validateRegion 负责屏幕边界校验。不能仅检查 x、y 非负而忽略 x+w、y+h 是否超过采集尺寸。'),
    step('apply', '03 下一次观察先裁剪再缩放', '区域写入会话配置后，下次 watch 比较新旧区域。发生变化时重建采集管线。macOS 的 AVFoundation 路径在 FFmpeg 滤镜中先 crop，再 scale，后续评分和拼图只处理区域内的像素。', `const r = source.region;
filters.push(\`crop=\${r.w}:\${r.h}:\${r.x}:\${r.y}\`);
filters.push(\`scale=\${width}:\${height}:flags=\${sws}\`);`, '选区是屏幕上的可见矩形。其他窗口遮挡该区域时，采集结果也包含遮挡。文件、摄像头与 OBS 不使用这个屏幕框选路径。'),
  ],
};

export const seeNowDesign = [
  ['design', '设计目标', p('see_now 将持续采集和结果读取分开。一次 start 建立长驻于本机的观察实例，帧持续进入评分、选帧和拼图管线。watch 等待下一批结果，peek 立即领取已有结果，stop 释放采集资源。视频精确单帧读取由 video_frame 提供。'), { code: ['数据流', 'FFmpeg → RGB 帧 → HSV / 运动特征 → 留帧 → 排布 → PNG 队列\n                                     ↑                    ↓\n                              pace / scene          watch / peek'] }],
  step('state', '01 以会话保存观察生命周期', '每个授权会话持有一个观察状态。runner 管理采集进程与图像队列，read 保存正在等待的请求，lock 串行化状态变更。CLI 多次调用需要使用同一会话标识连接本机服务，才能延续之前的观察。', seenow('sessions.set(id, {', 'scene: false, pace: "normal", quality: "low",\n      });')),
  step('dispatch', '02 将 action 分发到同一个工具', '工具名只有 see_now，action 默认 watch。入口完成参数校验后，根据 action 分发到当前会话的处理函数。所有入口使用相同动作集合，不单独注册第二个 watch 工具。', seenow('const actions = { start', 'return actions[action](session(ctx.sessionId), args, ctx);')),
  step('settings', '03 把观察意图转成管线参数', 'quality 控制图像尺寸，pace 控制变化检测和交付节奏，scene 选择单场景出图。文件默认使用更敏感的切点阈值。窗口与音频是独立的可选能力，默认关闭，开启后也不改变基本视觉数据流。', seenow('const preset = scene', 'return { scene, quality, region, opts };')),
  step('output', '04 分开返回图片字节与帧清单', '每张 sheet 包含 PNG 与帧时间、格子位置等元数据。返回时把 png 移入 images，其余保留在 result.sheets，同一索引对应同一张图。CLI 可以写文件，MCP 可以返回图像内容，HTTP 按接口协议编码输出。', snippet('see-now.mjs', 'result').split('\n\nfunction fail')[0]),
  ['basis', '算法依据', p('采集、变化评分、选帧和拼图设计以 dsh-see-now 固定版本 59719eabba8b88f0b425c1839dfdc30be3c315a5 为依据。各动作页按执行步骤解释关键逻辑，短代码展示对应判断。标注“示意”的片段用于说明控制流程，其余关键片段来自固定源码或本项目参考函数。本机运行版已提供 CLI、HTTP 和 MCP 入口。当前桌面后端针对 macOS，设备与可选界面的可用性仍取决于本机环境。'), { sample: ['dsh-see-now-LICENSE.txt', 'Apache-2.0 LICENSE'] }, { sample: ['dsh-see-now-NOTICE.txt', 'NOTICE'] }],
];
