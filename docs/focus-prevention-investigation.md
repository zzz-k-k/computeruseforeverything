# 后台焦点防护验证记录

2026-11-08。本记录不是已实现能力声明。

## 收尾状态（后续更新）

用户已要求停止扩展、先收尾项目。未开启 Chrome 的 Apple 事件 JavaScript 设置，没有新增浏览器生产接口，也没有宣称原生零抢焦点已完成。以下早期实验之后又进行了如下检查：

| 操作 | 实际结果 | 本机报告 |
| --- | --- | --- |
| Chrome JXA 创建本地文档标签 | 前台与键盘焦点转至 Chrome | `computer-use/artifacts/chrome-appleevents-probe.json` |
| JXA 修改已有测试标签 URL | 罗翔页面加载成功，但前台与键盘焦点转至 Chrome | `computer-use/artifacts/chrome-navigation-probe.json` |
| 直接按 PID 发送 AppleEvent，使用 neverInteract | 仍观察到 Chrome 激活，不满足验收 | `computer-use/artifacts/chrome-direct-ae-probe.json` |
| 只读页面 JavaScript 探测 | Chrome 返回功能已关闭；没有修改设置 | `computer-use/artifacts/chrome-js-probe.json` |

这些实验使用 `tests/probes/FocusMonitor.swift` 同时查询实际前台、键盘焦点并订阅应用激活通知；目标采样周期为 5ms，报告包含实际最大间隔。它不拦截事件，也不恢复用户焦点。监测能证明记录到的变化，不能证明采样间隙绝无变化。

完整调用链的进一步证据：`SyntheticAppFocusEnforcer.init` 在 `0x100740d2c` 调用注册防护路径；`safelyEnforceActiveState` 在 `0x100742370`、`0x10074242c` 启动额外 event tap，随后在 `0x10074249c` 暂停窗口更新、`0x1007424a4` 执行合成活跃状态，多条退出路径恢复窗口更新。结合后述恢复前台分支可确认，它不是一个“过滤通知”的单步骤实现。具体状态条件仍有未还原分支，不能声称已完整复刻。

Chrome 导航实验只能确认“调用后观察到激活”。尚未获得目标进程内部调用栈，不能将某一条 Chromium 主干实现直接认定为本机二进制激活的唯一根因。后续若恢复研究，应记录本机 Chrome 版本、目标 PID/窗口/标签、请求与通知时间、非零焦点请求 ID、实际键盘归属，并在可控测试实例采集激活调用栈。

当前交付范围以网页 `/guide/status/` 为准。下面保留早期调查，文中的“本次”指该轮实验。

## 验收条件

Chrome 在后台，通过本项目原生窗口事件打开罗翔主页，操作期间用户前台应用不变。先切前台再恢复、改走浏览器连接器，以及只在事后中止，都不能满足这项验收。

## 本机代码证据

检查对象是本机 `SkyComputerUseService` 原生二进制，位于 `/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/`。这里分析符号与反汇编，没有其完整 Swift 源码，也没有将该二进制链接到本项目。

- `SystemFocusStealPreventer` 创建进程通知 event tap，并按进程处理通知。这说明它不只是轮询前台 PID，但单凭名称不能推导其保证。
- `0x10074f7b4–0x10074f7d0` 读取事件的焦点请求字段并调用 `ApplicationRegistrySPI.releaseKeyFocus(withID:)`。键盘焦点释放与应用前台身份不是同一个操作。
- `SyntheticAppFocusEnforcer.safelyEnforceActiveState` 的实现读取并保存 `NSWorkspace.frontmostApplication`（`0x100741eb8–0x100741ecc`）；其中一条后续分支取回保存的对象并调用 `activateWithOptions:`（`0x100742734–0x100742760`）。因此其实现包含恢复原应用的路径，不能把整套机制表述为保证前台从不发生变化。

以上地址对应本次本机二进制，升级后不能直接沿用；也不能据此推断所有 Codex 操作都会触发恢复分支。

## 独立实验

用独立 DesktopFixture（PID 25462）验证进程通知拦截：在 annotated-session event tap 中丢弃 subject PID 或 target PID 匹配测试进程的事件，再对测试进程设置 AXFrontmost。没有操作用户的 Chrome。

观察到：

```text
type=21 sub=2 subject=25462 ... theft=0
attempt 0
after 25462
```

`attempt 0` 表示 AX 调用成功；`after 25462` 表示测试进程实际成为前台。丢弃通知没有阻止这次前台身份变化。该次记录中的请求 ID 为 0，未验证非零请求 ID 的释放行为；不能把它解释为所有键盘焦点释放均无效。

原始记录：`computer-use/artifacts/focus-tap-probe.log`。实验结束后已终止测试进程，没有强制重新激活用户原应用。实验代码未合入生产输入路径。

## 当前结论

真正的原生防抢前台机制尚未完成。现有 `abort_on_foreground_change` 仍只是异常中止机制。前一次 Chrome Meta+T 测试已经发生前台变化；本次未再次向 Chrome 发送该操作，也没有完成罗翔主页验收。

下一次原生方案必须先在独立窗口通过“主动激活请求被阻止”的反例测试，再执行 Chrome 验收。浏览器协议后台导航可以作为另一种后端单独实现和验证，但不能证明本项目原生窗口键鼠防护已完成。
