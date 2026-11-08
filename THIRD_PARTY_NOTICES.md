# 第三方来源与许可说明

本文件记录源码中已有的来源和许可材料，不为本项目自有代码指定新的许可证，也不替代第三方组件的原始条款。

| 组件 | 用途 | 仓库中的记录 |
| --- | --- | --- |
| dsh-see-now | 视频/屏幕采集、变化评分、选帧和拼图 | [来源与固定修订](computer-use/vendor/ORIGIN.md)、[Apache-2.0 LICENSE](computer-use/vendor/dsh-see-now-package/LICENSE)、[NOTICE](computer-use/vendor/dsh-see-now-package/NOTICE) |
| IBM Plex Sans / Mono | 文档字体 | [Sans 字体许可](computer-use-docs/src/assets/fonts/ibm-plex-sans-LICENSE.txt)、[Mono 字体许可](computer-use-docs/src/assets/fonts/ibm-plex-mono-LICENSE.txt) |
| npm 依赖 | MCP、校验与 JSON Schema | [package.json](computer-use/package.json)、[package-lock.json](computer-use/package-lock.json)；安装包内保留各依赖的许可证 |
| Node、FFmpeg、FFprobe | 本机运行、媒体解码与采集 | 由用户安装或提供，不随源码提交；实际版本和构建信息由本机检查记录 |

对上游视觉引擎的修改说明位于 vendor/ORIGIN.md，文档示例目录保留上游 LICENSE、NOTICE 和补丁。发布源码时不要删除这些归属材料。

Chrome 扩展与原生桥接是本项目实现，不分发 Codex/ChatGPT 的扩展、宿主程序或应用二进制。调查文档中的第三方实现观察不等于该产品提供兼容性承诺。

若未来提供可下载的二进制发行包，应按实际打包的 Node、FFmpeg、FFprobe、动态库和其他组件准备相应许可及来源材料；源码部署说明不代表已经完成该发行流程。
