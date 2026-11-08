# 用 GitHub Desktop 发布项目和网页文档

本文按账号 `zzz-k-k`、仓库名 `computeruseforeverything` 编写。用户主页 `https://github.com/zzz-k-k` 不是具体仓库地址；发布后的预期仓库地址为：

```text
https://github.com/zzz-k-k/computeruseforeverything
```

当前准备工作不会自动提交、推送或发布。最后的发布由你在 GitHub Desktop 和 GitHub 网站完成。

## 1. 发布前检查

源码仓库应包含 README、部署说明、运行时源码、Chrome 扩展、package-lock.json、固定版本 vendor、测试、文档源码和 Pages 工作流。

不应作为源码提交的本机内容已经配置忽略规则：

- `computer-use/.state/`：访问令牌、进程记录、Socket、日志。
- `node_modules/`、运行截图、artifacts、computer-use-output。
- 本机 `bin/node`、FFmpeg、FFprobe、desktop-bridge。
- 文档 `dist/`：由 GitHub Actions 生成。
- `.DS_Store`、本机环境变量文件。

**现有 Git 历史需要你确认：**本次整理发现 `.DS_Store` 和 `computer-use/computer-use-output/7dd7717c-7006-4c27-8b86-2498543a41ca-1.png` 已被 Git 跟踪并进入历史。`.gitignore` 不会移除它们，取消选择工作区文件也不会阻止已有提交随仓库发布。

先检查该图片是否适合公开。若不想发布旧历史，建议把需要的源码复制到一个全新目录，不复制 `.git`、上述本机文件或输出目录，然后用 GitHub Desktop 创建新仓库。这样保留原项目和历史，不需要对当前仓库做破坏性历史重写。已有 `docs` 中的调查记录也应按你希望公开的范围选择。

自有代码目前尚未指定 LICENSE。可以先公开源码，但不要把“公开可见”写成已授予某个开源许可证。确定许可证后再添加根目录 LICENSE；保留第三方 LICENSE、NOTICE 和字体许可。

## 2. 用 GitHub Desktop 发布源码

1. 对当前仓库使用 **File → Add Local Repository**；若采用全新源码目录，则创建新仓库并选中该目录。
2. 在 Changes 中检查将要提交的文件，确认没有令牌、截图或本机依赖。保留 `.github/workflows/docs.yml` 和 `computer-use-docs/src`。
3. 填写提交说明，例如 `Prepare public documentation and local deployment guide`，提交到默认分支。
4. 点击 **Publish repository**，Owner 选择 `zzz-k-k`，Name 使用 `computeruseforeverything`。
5. 准备公开时取消 **Keep this code private**，确认后发布。

如果最终仓库名不同，修改 README、运行说明和本文中的预期 URL。构建出的文档资源使用相对路径，不需要把仓库名写进网站代码。

右侧 About 的 Description 可填写：

> Local computer-use tools for AI via CLI, HTTP and MCP, with Chrome background control and video observation.

## 3. 发布静态网页文档

仓库内 `.github/workflows/docs.yml` 是**手动触发**的工作流：只构建并上传静态文档，不启动 Computer Use 服务，不上传本机状态，也不需要录屏权限。

1. 发布仓库后，在 GitHub 网站进入 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开 **Actions → Publish documentation → Run workflow**，选择默认分支并运行。
4. 等待 build 和 deploy 成功。在 Pages 设置或部署记录中复制实际站点地址。

预期地址：

```text
https://zzz-k-k.github.io/computeruseforeverything/
```

以后用 GitHub Desktop 提交并 Push 文档改动后，再运行该工作流更新站点。仅推送源码不会自动发布网页。工作流需存在于默认分支；如果手动选择其他分支，仓库的 Pages 环境规则可能阻止部署。

工作流输出目录仅为 `computer-use-docs/dist`，没有上传整个项目。GitHub Pages 提供静态阅读页面，不能承载 macOS 桌面服务，也不能替读者安装本机扩展。

设置流程参见 [GitHub Pages 发布源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)及[自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 4. 在右侧 About 显示文档网址

回到仓库首页：

1. 点击右侧 **About** 旁的齿轮。
2. 在 **Website** 中填入上一步实际部署成功的网址。
3. 填写 Description，保存。

Website 是 GitHub 仓库设置，不由 README 或 GitHub Desktop 的源码提交自动设置。README 中已经放入预期文档链接，但首次部署前该链接可能返回 404。

## 5. 发布后核对

- 仓库首页 README 正常显示，部署说明和接口说明可打开。
- About 的网址指向已成功部署的站点。
- 从网站首页和深层工具页检查左侧导航、搜索、字体、暗色模式。
- 站点只包含静态文档；本机运行地址仍为 `127.0.0.1`。
- 在新目录按 README 安装时，依赖步骤完整；不要因为作者机器已有二进制而省略它们。

若 Pages 返回 404，先检查部署是否成功、Source 是否为 GitHub Actions、URL 是否与实际仓库名一致。若本地构建成功而 Actions 失败，查看对应步骤日志；不要把本机 `bin/node` 上传到 Linux runner 来解决问题。
