# Computer Use 网页文档

静态技术文档，沿用 IBM Carbon 风格。页面源码位于 `src/content.mjs` 和 `src/tool-docs/`，模板为 `src/build.mjs`，样式、交互与本地字体位于 `src/assets/`。

## 本地预览

在仓库根目录，使用 Node 24+ 构建；不需要 npm install、FFmpeg 或 macOS 桥接：

```sh
node computer-use-docs/src/build.mjs
python3 -m http.server 8765 --bind 127.0.0.1 --directory computer-use-docs/dist
```

访问 <http://127.0.0.1:8765/>。`dist` 是生成物，不提交。也可通过 `COMPUTER_USE_DOCS_OUT=/absolute/output` 将构建输出放到其他目录。

## GitHub Pages

[预期在线文档](https://zzz-k-k.github.io/computeruseforeverything/)在仓库发布、Pages 配置和首次工作流运行成功后生效。

`.github/workflows/docs.yml` 通过手动 workflow_dispatch 构建和发布 `dist`。使用 GitHub Desktop 提交/推送源码后，在 GitHub 中运行工作流。详见[发布步骤](../docs/PUBLISHING.md)。

静态资源、导航和搜索使用相对路径，支持 GitHub Pages 的仓库子路径；站点无需固定域名配置。公共网站只展示文档，不调用访客的本机工具，也不部署桌面服务。

新增页面时登记 pages、导航 groups 和工具列表；使用真实工具名作为工具页标题。说明实际实现、参数、错误和已验证范围，不把计划写成已完成能力。新增或修改内容后重新构建并检查内部链接。
