const p = text => `<p>${text}</p>`;
const code = (label,value) => ({code:[label,value]});
const target={pid:12345,window_id:67890};
const common=p('target 使用 list_windows 返回的 pid / app 与 window_id。示例 ID 必须替换为本机实际值；窗口关闭后重新查询。所有工具经同一个本地 Runtime 提供给 CLI、MCP 和 HTTP。');
export const backgroundPage={
 title:'窗口采集与后台操作',path:'guide/background',icon:'layers',status:'本机实现',
 description:'按窗口观察画面，有条件地执行后台控件与窗口事件；输入期间检查前台焦点，不承诺通用零抢占。',
 sections:[
  ['scope','已提供的能力',common,{table:[['功能','入口','行为'],['应用与窗口发现','list_apps / list_windows','返回 PID、应用标识、窗口 ID 和几何信息。'],['控件状态','get_app_state','读取指定窗口的 AX 元素、动作与可写属性。'],['窗口单帧','screenshot + target','返回 PNG、窗口元数据和会话内 frame_id。'],['窗口连续观察','see_now + source: window','原生窗口流 → RGB 帧 → 上游变化打分与拼图。'],['后台控件操作','click + element_path / set_value','AXPress 点击或写入 AXValue，报告焦点和鼠标变化。'],['后台窗口事件','click / type / press_key + target','合成应用内焦点，按 PID 投递窗口事件；前台变化即中止。'],['定向前台操作','click / type / press_key / scroll + target','显式 mode: foreground 后激活目标；坐标动作检查窗口帧。'],['能力查询','capabilities','返回当前权限与后台动作支持状态。']]}],
  ['capture','窗口连续采集如何工作',p('screenshot 使用 ScreenCaptureKit 的窗口过滤器取一帧。see_now 的 start 建立 SCStream，完整帧转换为 RGB24；采集流因不可见窗口而 suspended / blank 时，每约 500ms 尝试窗口截图回退。watch 返回 capture_backend，区分 stream 与 snapshot_fallback。采集不会为了取图主动激活窗口。'),
   code('Swift · 选择窗口','let filter = SCContentFilter(desktopIndependentWindow: window)'),
   code('JavaScript · 分析帧','// SCStream 回调提供 RGB24 和单调时间戳\npipeline.push({ t: frame.t, buf: rgb })\n// watch 到时且无已完成拼图时\nconst sheet = pipeline.flushNow()'),
   p('沿用 dsh-see-now 的 createPipeline、PACES、变化评分与拼图。start 配置 quality、pace、scene；窗口来源暂不接受 region、minFrames > 1、path 或 realtime。连续流目标采样上限为 6fps，实际速率取决于系统；截图回退约 2fps，不承诺捕获瞬间变化。队列最多保留 4 张拼图，过载时丢弃旧拼图。'),
   code('CLI · 启动、观察、停止','./computer-use see-now --args \'{"action":"start","source":"window","target":{"pid":12345,"window_id":67890}}\' --json\n./computer-use see-now --action watch --seconds 3 --json\n./computer-use see-now --action stop --json'),
   p('stop 终止采集子进程并取消等待中的 watch；窗口消失返回采集错误；窗口尺寸改变时返回 capture_dimensions_changed，重新启动观察。窗口流当前不自动保存视频文件，video_frame 仍只读取已有本地视频。需要当前窗口高清细节时再次调用 screenshot。')],
  ['target','目标、坐标与执行模式',code('JSON · 窗口截图',JSON.stringify({name:'screenshot',arguments:{target}},null,2)),
   p('窗口截图记录像素尺寸、窗口边界、PID 和窗口 ID。坐标点击与滚动使用该帧的图片像素；Runtime 校验会话、60 秒有效期、目标身份、边界和坐标范围，原生派发前再校验窗口边界。'),
   {table:[['mode','实际行为'],['background','支持 AX、窗口坐标点击、文本与快捷键。滚动返回 background_unsupported。'],['foreground','明确允许激活目标窗口，再执行操作。'],['auto','点击与键盘保持后台；仅 scroll 在 allow_foreground: true 时选择前台。后台失败不会自动切前台重试。']]},
   p('传 target 而省略 mode 时默认 background。未传 target 的原有桌面工具保持原有语义。auto 的前台选择只发生在动作派发前，不会因为派发后的未知结果而自动重试。')],
  ['execution','后台 AX 点击与设置文本',p('get_app_state 按目标窗口几何信息匹配 AX 窗口，最多读取 300 个元素、12 层路径。每个元素提供 path、token、role、actions 和 value_settable。执行前沿路径重新查找并核对 token；状态变化后重新读取。token 是身份检查摘要，不是授权令牌，也不保证控件树重排后仍稳定。'),
   code('JSON · 控件点击参数',JSON.stringify({target,mode:'background',element_path:[1],element_token:'替换成 get_app_state 返回的 token'},null,2)),
   p('click 只对支持 AXPress 的元素调用 AXUIElementPerformAction。set_value 先检查 AXValue 可写，再写入完整文本并读回比较；它是替换值，不是模拟逐键输入。不同应用对 AX 的支持不同，不支持时返回明确错误。')],
  ['window-events','窗口事件的实现步骤',
   p('1. 解析 pid 与 window_id，校验截图边界；键盘事件在合成激活前完成参数校验和构造。目标必须未最小化、未隐藏。激活点不是必填：优先读取窗口 AXActivationPoint，只接受有限且在窗口边界内的点；否则尝试 AX 标题中心。两者不可用时走 notifications_only，不猜测坐标。'),
   p('2. 保存系统当前前台 PID，向目标进程发送应用激活与按键焦点通知，有有效激活点时再投递一次窗口内点击，帮助普通 AppKit 窗口建立内部 key window；没有点时只发送通知。随后键盘路径仍验证 AXFocusedWindow，不匹配则拒绝发送按键。这里不调用 NSRunningApplication.activate，也不移动系统鼠标。激活点点击会改变目标应用的内部窗口状态，因此不能视为完全无副作用。'),
   code('Swift · 有作用域的合成焦点', 'defer { guardState.end() }\ntry guardState.begin()\nif let point = activationPoint {\n    try guardState.click(point, right: false)\n}'),
   p('3. 坐标事件同时携带全局位置和窗口内位置。NSEvent 指定 windowNumber，CGEvent 指定窗口字段 91 / 92，并经 CGEventSetWindowLocation 写入窗口内坐标；随后 postToPid 定向投递。缺少这些信息时，普通鼠标事件可能只激活窗口而没有完成点击。'),
   code('Swift · 定向窗口点击', 'let event = NSEvent.mouseEvent(with: type, location: local,\n    modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,\n    windowNumber: windowID, context: nil, eventNumber: 1,\n    clickCount: 1, pressure: 1)!.cgEvent!\nevent.location = global\nevent.setIntegerValueField(CGEventField(rawValue: 91)!, value: Int64(windowID))\nevent.setIntegerValueField(CGEventField(rawValue: 92)!, value: Int64(windowID))\n// 动态解析 CGEventSetWindowLocation 后写入窗口内坐标\ntry guardState.send(event)'),
   p('4. type 按字素簇拆分，转为 UTF-16，构造 keyDown / keyUp；press_key 解析键码与修饰键。投递前校验目标应用的 AXFocusedWindow，避免输入到同一应用的另一个窗口。后台文本每次最多 512 个字素簇，同时保留总计 4096 个 UTF-16 单元与单簇 20 单元限制；超限先拒绝，不发生部分输入。'),
   code('Swift · Unicode 输入', 'units.withUnsafeBufferPointer { buffer in\n    down.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress)\n    up.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress)\n}\nfor event in keys {\n    try guardState.send(event)\n    Thread.sleep(forTimeInterval: 0.01)\n}'),
   p('5. 每次投递前实时查询前台进程，变化即抛出 focus_changed。使用动态解析的 GetFrontProcess / GetProcessPID，避免 NSWorkspace 在阻塞运行循环期间的缓存。退出时释放本次已按下的键、配对鼠标抬起，并清理合成焦点；如果用户已将目标切到真正前台，就不向它发送失活通知。'),
   code('Swift · 输入保护', 'func check() throws {\n    guard try liveForegroundPID() == foreground else {\n        throw BridgeError("focus_changed", "Input may be partially delivered; observe before retrying.")\n    }\n}\n// 清理只向原目标 PID 释放本次按键，不恢复用户的前台选择。'),
   p('这一实现参考本机 Codex 原生服务的 SynthesizedEvent、notifyAppActivated、notifyWindowKeyFocusReturned 等符号和事件语义，独立实现，没有链接或打包 Codex 二进制。窗口字段、焦点通知和窗口内坐标接口含非公开系统行为，兼容性取决于 macOS 与应用。capabilities 返回 conditional 表示存在这一实现，但不能预先证明任意应用会接受事件。')],
  ['untitled','Chrome 与无标题元素窗口',
   p('此前把 AXTitleUIElement 作为必需条件，导致 Chrome 在发送按键前即返回 background_unsupported。Codex 原生 notifyAppActivated 的 activationPoint 为可选参数；其缺省分支保留激活通知而跳过鼠标事件。本地实现据此移除标题硬性要求。'),
   code('Swift · 激活点是可选的', 'try guardState.begin()\nif let location = activationPoint {\n    try guardState.click(location, right: false)\n}\n// 没有安全点时不发送准备点击；仍校验目标窗口的内部键盘焦点。'),
   p('返回 activation_strategy：ax_activation_point、title_element 或 notifications_only。Chrome 实测返回过窗口外的 AXActivationPoint，必须丢弃，不能直接点击。'),
   p('无标题支持不等于已经阻止应用主动激活。2026-11-08 重测：发送 Meta+T 后，前台采样从 14218 变为 Chrome 的 60518，返回 focus_changed；未继续输入网址。Chrome 新标签路径未通过不抢焦点验收。当前中止机制只能发现变化，不能事先阻止 Chrome 激活；还需实现对应的防抢焦点机制。scripts/chrome-background-acceptance.mjs 要求 Chrome 已处于后台，依次新建标签、输入罗翔主页地址、回车，核对实际页面并采样前台 PID；遇到变化停止且不自动重试。')],
  ['focus-prevention','防抢焦点验证：尚未通过',
   p('2026-11-08 继续检查本机 Codex 原生服务：SystemFocusStealPreventer 使用进程通知 event tap，并存在按请求 ID 释放键盘焦点的路径。SyntheticAppFocusEnforcer 也存在重新激活之前前台应用的分支。恢复焦点与从未抢占焦点不同，不能把这些符号名称当成零抢占保证。'),
   code('Swift · 已验证不足以防止前台切换的实验', '// 独立 DesktopFixture 实验，不是生产防护代码\n// annotated-session event tap 的回调中：\nif subjectPID == fixturePID || targetPID == fixturePID {\n    return nil\n}\n// 随后测试进程请求 AXFrontmost，前台仍变为测试 PID。'),
   p('独立窗口实验记录到 type=21、subtype=2、subject=25462、focusTheftID=0；丢弃匹配通知后，实际前台仍为 25462。因此仅过滤通知不足以阻止该激活路径。非零键盘焦点请求 ID 的释放效果尚未验证；本次没有将未经验证的拦截器加入生产路径。'),
   p('原生防抢焦点机制尚未完成。后续脚本和直接 AppleEvent 导航虽加载了罗翔页面，也观察到前台变化，因此不算后台零抢焦点验收通过。用户要求先收尾后已停止扩展，Chrome JavaScript 设置未开启。详细代码证据见仓库 docs/focus-prevention-investigation.md；当前交付边界见“能力、验收与缺陷”。')],
  ['verification','操作结果与焦点观察',code('JSON · set_value 返回值',JSON.stringify({status:'dispatched',backend:'ax',execution_mode:'background',focus_changed:false,cursor_moved:false,verification:{status:'verified'}},null,2)),
   p('dispatched 表示系统调用成功。只有 set_value 读回匹配时返回 verified；AXPress 与键鼠事件默认 unknown，需要结合应用状态或截图验证。capture_after 截图失败会保留动作已派发状态，避免重复执行。'),
   p('focus_changed 与 cursor_moved 是操作前后观测值，不能区分用户同时操作造成的变化。窗口事件使用有作用域的合成焦点，focus_protection 为 abort_on_foreground_change。它检查前台身份并中止，不是全局阻止其他应用抢焦点；检查间隙仍存在竞态，不能保证应用主动弹窗或激活永远不会发生。不会把用户切换后的焦点强行抢回。virtual_cursor 只记录坐标，visible 为 false。')],
  ['layout','代码位置',{table:[['文件','职责'],['src/runtime.mjs','统一工具定义、参数校验和来源路由。'],['src/tools/windows.mjs','发现、AX 操作、能力查询、帧校验。'],['src/tools/window-observer.mjs','窗口流子进程、上游分析、队列与取消。'],['src/tools/desktop.mjs','显示器 / 窗口截图与既有键鼠入口。'],['src/native/window-control.swift','窗口解析、AX 控件、窗口单帧和连续流。'],['src/native/background-input.swift','窗口事件、合成焦点、实时前台检查与异常释放。'],['src/native/macos.swift / macos.mjs','原生请求分发与 Node 桥接。']]}],
  ['validation','本机验收',p('scripts/window-acceptance.mjs 通过真实 CLI、HTTP 和 MCP 连接本地服务，在专用测试窗口检查 AX 按钮计数、文本读回、窗口 PNG、连续观察拼图及停止 / 取消。报告位于 computer-use/artifacts/window-acceptance.json。同一验收还检查后台坐标左右键、中文输入、全选与退格。scripts/background-input-acceptance.mjs 另外验证外部前台切换后中止长文本，报告为 background-input-acceptance.json。测试只证明该 AppKit 测试窗口中的行为，不代表所有软件兼容。')],
 ]
};
export const windowToolPages={};
const specs=[
 ['list_apps','列出应用','返回 apps（pid、app、name、active）和 frontmost_pid。',{},'list-apps'],
 ['list_windows','列出窗口','可按 pid 或 app 过滤；返回 window_id、bounds、title 和 on_screen。不可见窗口仍可列出，但不保证有实时画面。',{pid:12345},'list-windows'],
 ['get_app_state','读取窗口控件','target 必填。返回目标窗口的 AX 元素；应用必须支持辅助功能。窗口几何无法唯一匹配时返回 ax_window_unavailable。',{target},'get-app-state'],
 ['set_value','设置控件值','target、element_path、element_token、text 必填。替换可写 AXValue，并读回校验；不是 type 的别名。',{target,element_path:[3,0],element_token:'替换为实际 token',text:'后台输入测试'},'set-value'],
 ['capabilities','查询窗口能力','target 必填。返回当前系统权限与动作支持级别；AX 能力需结合 get_app_state 的具体元素判断。',{target},'capabilities'],
];
for(const [name,cn,description,args,route]of specs)windowToolPages[name]={name,title:name,label:name,cn,type:'窗口',icon:'screen',path:'tools/'+route,status:'本机实现',description,sections:[['usage',cn,p(description),common],['example','调用示例',code('CLI','./computer-use '+route+' --args \''+JSON.stringify(args)+'\' --json'),code('MCP · tools/call params',JSON.stringify({name,arguments:args},null,2))],['details','实现与返回结果',{links:[['background','窗口采集与后台操作']]}]]};
export function attachBackgroundDesign(pages){
 const link={links:[['background','窗口采集与后台操作']]};
 pages.architecture.sections.push(['background','窗口采集与后台执行',p('窗口来源由原生 ScreenCaptureKit 后端采集，帧交给上游分析管线。AX 控件操作、窗口帧校验和能力查询由 Runtime 统一派发，CLI、MCP 与 HTTP 共用实现。'),link]);
 pages.project_layout.sections.push(['background-layout','窗口模块代码位置',code('当前文件','src/\n├── tools/windows.mjs          # 发现、AX 操作、能力查询\n├── tools/window-observer.mjs  # 窗口连续观察\n├── tools/desktop.mjs          # 单帧与现有输入工具\n├── native/window-control.swift # 窗口 / AX / SCStream\n├── native/background-input.swift # 后台事件与焦点检查\n├── native/macos.mjs           # 原生请求桥接\n└── runtime.mjs                # 三种入口共享的工具注册表'),link]);
 const sections={
  screenshot:['窗口截图','传 target 时采集指定窗口，省略时保留显示器截图。返回 target、frame_id、像素尺寸和 PNG。窗口帧只用于同一窗口的坐标操作。'],
  see_now:['窗口来源','source 增加 window，配合 target 启动。后台流暂停时使用窗口截图回退，返回实际 capture_backend。'],
  see_now_start:['启动窗口观察','source: window 要求 target。原生 SCStream 输出 RGB 帧，Node 适配器复用上游 pipeline，不使用 FFmpeg 屏幕设备来选择窗口。'],
  see_now_watch:['读取窗口拼图','窗口观察沿用同一个 watch 动作。返回 frames、target、capture_backend 和图像。拼图坐标不能直接用于点击；请先取得新的窗口 screenshot。'],
  see_now_stop:['停止窗口采集','终止原生采集进程，并让正在等待的 watch 返回 cancelled。停止后 status.running 为 false。'],
  video_frame:['窗口来源的边界','窗口连续流当前不自动生成视频文件。本工具仍读取已有本地视频；查看当前窗口的原尺寸图像请使用 screenshot + target。'],
 };
 for(const name of ['click','type','press_key','scroll'])sections[name]=['窗口目标与执行模式','支持 target 与 mode。后台 click 可用 AX 元素，也可用窗口截图的 frame_id / x / y；type 与 press_key 使用窗口事件。scroll 仍要求 foreground，或 auto 加 allow_foreground。set_value 在可写 AX 控件上替换文本。'];
 const inputDetails={
  click:['后台坐标点击实现','先验证目标窗口帧，再将图片像素映射为全局点；原生桥接建立窗口内焦点，生成带窗口 ID 和局部坐标的 mouseDown / mouseUp，按 PID 投递。元素点击仍走 AXPress。','const x = bounds.left + (args.x + 0.5) * bounds.width / frame.width;\nconst y = bounds.top + (args.y + 0.5) * bounds.height / frame.height;\n// 原生 BackgroundInput.click 配对投递 mouseDown / mouseUp'],
  type:['后台文本输入实现','先验证全部文本并生成 UTF-16 按键对，再检查 AXFocusedWindow；每个事件投递前检查前台 PID。后台每次最多 512 个字素簇，输入中断后可能只写入一部分，先观察再重试。','let clusters = text.map { Array(String($0).utf16) }\n// 每簇构造 keyDown / keyUp，并 keyboardSetUnicodeString\nfor event in keys {\n    try guardState.send(event)\n    Thread.sleep(forTimeInterval: 0.01)\n}'],
  press_key:['后台快捷键实现','把 Meta / Alt / Ctrl / Shift 解析成 CGEventFlags，末项映射为虚拟键码。按下携带修饰键、抬起清空修饰键，均定向发送到目标 PID；异常退出释放本次已经按下的键。','let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true)!\nlet up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)!\ndown.flags = flags\nup.flags = []\ntry guardState.send(down)\ntry guardState.send(up)']
 };
 for(const [id,[title,text,example]] of Object.entries(inputDetails))pages[id].sections.push(['background-implementation',title,p(text),code('实现要点',example),link]);
 for(const [id,[title,text]]of Object.entries(sections)){pages[id].sections.push(['background-extension',title,p(text),link]);
  if(['screenshot','click','type','press_key','scroll'].includes(id)) {
   const rows=[['target','object','pid 或 app，加 window_id；省略时保留原桌面接口。']];
   if(id!=='screenshot')rows.push(['mode','string','background / foreground / auto；带 target 时默认 background。'],['allow_foreground','boolean','auto 模式下，允许不支持后台的 scroll 选择前台执行；默认 false。']);
   if(id==='click')rows.push(['element_path + element_token','array + string','get_app_state 返回的 AX 路径与摘要；与 frame_id / x / y 二选一。AX 点击只执行 AXPress。']);
   pages[id].sections.push(['window-parameters','窗口参数',{table:[['参数','类型','说明'],...rows]}]);
  }}
}
