const p=text=>`<p>${text}</p>`;
export const statusPage={
 title:'能力、验收与缺陷',path:'guide/status',icon:'list',status:'本地预览版 0.1.0',
 description:'记录实际可用范围、验收方式、已知缺陷及原因。没有将实验路径列为正式能力。',
 sections:[
  ['release','当前交付范围',p('本项目为 macOS 14+ 本地预览版，本机二进制面向 Apple Silicon。CLI、HTTP、Streamable HTTP MCP 和 stdio MCP 共用 Runtime，提供 20 个工具。当前目录可以在本机运行；不是可独立移动的单文件程序，也不是已经完成签名、公证和跨平台验证的公开发行版。'),
   {table:[['模块','状态','说明'],['CLI / HTTP / MCP','已实现','回环监听、Bearer 鉴权、共享工具契约；stdio 使用本地服务。'],['视觉观察','已实现','显示器和窗口截图、连续观察、视频文件分析、指定帧读取。'],['桌面键鼠','已实现','桌面坐标点击、Unicode 输入、快捷键、滚动；会作用于实际桌面。'],['后台 AX','有条件支持','控件必须提供 AXPress 或可写 AXValue。'],['后台窗口事件','有条件支持','专用 AppKit 测试窗口通过；Chrome 零抢焦点验收失败。'],['Chrome 扩展接口','已实现并本机验收','Native Messaging + CDP；页面点击、中文输入、滚动、导航、截图通过。695 次采样前台和键盘焦点不变，详见 Chrome 扩展页。']] }],
  ['browser-validation','Chrome 扩展验收',p('新增浏览器模块后 33 项自动测试通过；真实扩展测试见 artifacts/browser-acceptance.json。与下面历史 27 项测试及原生 Chrome 失败记录分开。当前共 20 个工具，46 个文档页面。'),{links:[['browser','Chrome 后台实现与验收']]}],
  ['validation','此前收尾验证与证据',p('2026-11-08 收尾复测：27 项自动测试通过；本机依赖与权限检查通过；CLI / HTTP / MCP 实际连接、12 个工具目录一致性、视频单帧、文件观察与屏幕观察通过。文档共 35 页，内部链接与锚点检查通过。默认验收不注入键鼠，不把此前 AppKit 的结果当成本次 Chrome 通过。'),
   p('npm test 运行自动化回归；npm run check:local 验证本机依赖版本、可执行性、SHA-256、原生权限与来源说明；npm run acceptance 执行三入口和媒体验收，失败退出也尝试停止该脚本自己的观察会话。'),
   {code:['在仓库根目录运行','npm run build --prefix computer-use\nnpm run check:local --prefix computer-use\nnpm test --prefix computer-use\nnpm run acceptance --prefix computer-use\n./computer-use/bin/node computer-use-docs/src/build.mjs']},
   {table:[['报告 / 脚本','证据范围'],['artifacts/local-check.json','本机依赖、权限检查；不代表公开发行合规审查。'],['artifacts/acceptance.json','本次实际三入口与媒体采集验收；desktop: not_run 不应解释为键鼠实测。'],['artifacts/window-acceptance.json','此前独立 AppKit 窗口的 AX、截图、连续观察及后台键鼠实测。'],['artifacts/background-input-acceptance.json','此前前台变化中止测试；不是防止激活测试。'],['artifacts/chrome-background-acceptance.json','Chrome 原生输入失败记录，不作为支持证明。'],['tests/probes/FocusMonitor.swift','只读 5ms 目标采样周期监测前台 PID、键盘焦点 PID 和应用激活通知；记录实际最大采样间隔。']]},
   p('报告位于 computer-use/ 下，仅保留本机，不含在源码发布中。历史报告和本次复测分开说明。截图、返回 dispatched 或输入前后 PID 相同，都不能单独证明全过程不抢焦点。采样仍可能遗漏短于采样间隔的变化。')],
  ['defects','已知缺陷及具体原因',
   {table:[['缺陷','原因','影响 / 目前边界'],['不能保证后台零抢焦点','postToPid 决定事件投递到哪个进程，不限制应用之后主动激活。当前只检测变化后中止。','Chrome 新标签失败；失败可能已有部分操作，不自动重试。'],['缺少完整焦点状态机','Codex 原生实现包含合成状态、目标事件 tap、全局通知处理、键盘焦点释放和恢复分支。本项目只实现了其中部分事件语义。','不能把 Codex 符号名称当成当前项目保证，也未接入未经验证的实验拦截器。'],['AX 兼容性不一致','自绘界面、游戏和部分 Electron 控件可能没有完整辅助功能树；当前窗口定位主要依赖几何匹配。','控件缺失或窗口匹配歧义时返回错误；有标题缺省支持不代表该应用兼容。'],['后台滚动缺失','尚未实现并验证定向窗口滚动事件。','background 返回不支持；foreground 或显式允许的 auto 可用。'],['窗口流不等于录像','SCStream 帧接入实时 RGB 分析管线，尚无编码器、文件封装和录制生命周期。','可观察和拼图，不能承诺录像落盘。'],['窗口不可见与尺寸变化','采集源受系统窗口状态影响；分析管线需要稳定尺寸。','空白/暂停时截图回退；大小改变须重新启动观察。'],['长视频取帧性能有限','为对应解码顺序及时间戳，当前扫描时间轴并从头解码，没有索引缓存。','大文件较慢；不承诺随机访问性能。'],['部分依赖不完整打包','框选区域使用 Python Tk；摄像头/OBS 需要本机设备；Mac 没有 Windows WASAPI。','Node/FFmpeg/FFprobe/原生桥接已在本机目录，不等于所有可选能力都开箱即用。'],['仅单用户信任模型','令牌持有者可读取本机文件和操作桌面，session 只隔离帧与观察状态。','只用于授权本机客户端，不部署为共享远程服务。'],['发行工程未完成','缺少安装器、签名、公证、升级回滚、完整依赖再分发材料和其他平台验证。','适合当前本机开发与使用，不能宣称正式跨平台发行。'],['doctor 检查较浅','当前 CLI doctor 与 health 一样只检查服务健康。','使用 npm run check:local 检查本机依赖及权限；不把 health 当全面诊断。']] }],
  ['dependencies','打包与重建边界',p('当前 bin 包含 Node、FFmpeg、FFprobe 和 desktop-bridge，无须修改 PATH。src、vendor、node_modules 仍是运行所需目录；FFmpeg/FFprobe 不由 build 自动下载。源码仓库不跟踪这些本机二进制；换机器需提供兼容依赖，并重新确认 macOS 授权。'),
   p('收尾时实测：原位复制 Node 后启动收到 SIGKILL，静态 codesign 验证仍通过；改为新文件验证后原子替换，启动和回归恢复通过。内核签名缓存是与现象相符的解释，未采集内核拒绝日志，不将它定为已证实根因。构建保留原子替换以避免覆盖正在使用的可执行文件。文档样式、脚本、字体移至 src/assets，dist 可以从空目录重新生成；源码中保留字体许可。')],
  ['focus-history','焦点调查的收尾',p('Codex 原生调用链确认：SyntheticAppFocusEnforcer 注册目标进程防护并维护应用“认为自己活跃”的状态；safelyEnforceActiveState 安装额外事件监测、调用 WindowServer disableUpdate / reenableUpdate，部分分支重新激活保存的前台应用；SystemFocusStealPreventer 按 PID 和通知类型处理焦点状态，并存在按请求 ID 释放键盘焦点的路径。窗口更新暂停、键盘焦点和实际前台身份是不同概念。'),
   p('本机独立实验中，过滤激活通知未阻止实际前台变化；Chrome 原生 Meta+T 失败；脚本创建标签、修改 URL、直接 AppleEvent 修改 URL 也观察到激活。罗翔页面曾加载成功，但伴随前台变化，因此不是后台零抢焦点成功案例。未开启 Chrome 的 Apple 事件 JavaScript 设置，没有将这些实验作为正式浏览器工具。'),
   p('用户要求先收尾后已停止这些实验。原始调查记录保留在 docs/focus-prevention-investigation.md；本页不声称已完整复刻 Codex 的所有分支。')],
  ['next','后续工作顺序',p('优先建立应用兼容性矩阵与可重复的反例测试，继续完善原生焦点状态机与已实现的 Chrome 扩展后端。随后补齐后台滚动、窗口录像与视频索引；公开发行前再完成依赖许可、安装器、签名和跨平台验证。上述项目均未计入当前已完成能力。')],
 ]
};
