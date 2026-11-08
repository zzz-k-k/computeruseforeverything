# 只读焦点监测

`FocusMonitor.swift` 查询系统前台 PID 与键盘焦点 PID，并订阅应用激活通知。不会激活、点击、输入或恢复任何应用，不属于生产防护机制。

在 `computer-use` 目录运行：

```sh
xcrun swiftc tests/probes/FocusMonitor.swift -o artifacts/FocusMonitor
./artifacts/FocusMonitor
```

首行是 ready 和初始状态；向标准输入发送任意数据（终端按回车）后输出报告并结束。最长 60 秒自动结束。查询使用部分非公开 macOS API，只用于本机验收，符号不可用时退出。

必须确认 ready 中各 status 均为 0，再开始其他测试。目标采样周期 5ms 不代表实际采样精度；报告保留 `max_sample_gap_ms`、`changes`、`activations` 与初末状态。用户同时操作也会产生变化，不能把所有变化都归因于被测代码。

本探针不自动运行任何会抢焦点的复现操作。
