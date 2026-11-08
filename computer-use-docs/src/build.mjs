import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { groups, pages, tools, seeNowChildren, seeNowActionIds, seeNowTopicIds } from "./content.mjs";
import { codeDirectory, exampleFiles } from "./tool-docs/code-examples.mjs";

const output = process.env.COMPUTER_USE_DOCS_OUT
  ? pathToFileURL(resolve(process.env.COMPUTER_USE_DOCS_OUT) + "/")
  : new URL("../dist/", import.meta.url);
await mkdir(output, { recursive: true });
await cp(new URL("./assets/", import.meta.url), new URL("assets/", output), { recursive: true });
const icons = {
  logo: '<path d="M2.5 6V2.5H6m4 0h3.5V6m0 4v3.5H10m-4 0H2.5V10"/><path d="m5.5 6.1 2 2-2 2m3.5 0h2"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>',
  moon: '<path d="M13.6 9.1A5.7 5.7 0 0 1 6.9 2.4a5.7 5.7 0 1 0 6.7 6.7Z"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3 3l1.5 1.5m7 7L13 13m0-10-1.5 1.5m-7 7L3 13"/>',
  menu: '<path d="M2 4h12M2 8h12M2 12h12"/>',
  close: '<path d="m3.5 3.5 9 9m0-9-9 9"/>',
  right: '<path d="M2.5 8h11m-4-4 4 4-4 4"/>',
  left: '<path d="M13.5 8h-11m4-4-4 4 4 4"/>',
  chevron: '<path d="m5 3 5 5-5 5"/>',
  down: '<path d="m4 6 4 4 4-4"/>',
  external: '<path d="M9 2.5h4.5V7m0-4.5L7 9m0-6.5H2.5v11h11V9"/>',
  overview: '<rect x="2.5" y="2.5" width="11" height="11"/><path d="M5 6h6m-6 4h4"/>',
  bolt: '<path d="m8.5 1.5-5 7h4l-.5 6 5.5-8h-4z"/>',
  layers: '<path d="M8 2 14 5.5 8 9 2 5.5 8 2Zm-6 6 6 3.5L14 8M2 10.5 8 14l6-3.5"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7m-2.5 2v2.5"/>',
  plug: '<path d="M5 2v4m6-4v4M3.5 6h9v2a4.5 4.5 0 0 1-9 0V6ZM8 12.5v2"/>',
  terminal: '<rect x="1.5" y="2.5" width="13" height="11"/><path d="m4 6 2 2-2 2m4 0h4"/>',
  globe: '<circle cx="8" cy="8" r="5.5"/><ellipse cx="8" cy="8" rx="2.5" ry="5.5"/><path d="M2.5 8h11"/>',
  frame: '<rect x="2" y="2" width="12" height="12"/><path d="M5 2v2.5M11 2v2.5M5 11.5V14m6-2.5V14M2 5h12M2 11h12"/>',
  video: '<rect x="2" y="3" width="12" height="10"/><path d="m6.5 5.5 4 2.5-4 2.5z"/>',
  audio: '<path d="M2 7v2m3-4v6m3-8v10m3-8v6m3-4v2"/>',
  watch: '<path d="M1.5 8s2.5-4.5 6.5-4.5 6.5 4.5 6.5 4.5-2.5 4.5-6.5 4.5S1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>',
  camera: '<path d="M2 4.5h3l1-2h4l1 2h3v8H2z"/><circle cx="8" cy="8.5" r="2"/>',
  activity: '<path d="M1.5 8h3l2-4.5 3 9L11.5 8h3"/>',
  cursor: '<path d="M3 1.5v11l3-3 2.5 4.5 2-1-2.5-4H13L3 1.5Z"/>',
  text: '<path d="M3 5V3h10v2M8 3v10m-2 0h4"/>',
  keyboard: '<rect x="1.5" y="4" width="13" height="8"/><path d="M4 6.5h1m2.5 0h1m2.5 0h1M4 9h1m2 0h5"/>',
  scroll: '<path d="M8 2v12M5.5 4.5 8 2l2.5 2.5m-5 7L8 14l2.5-2.5M2 5v6m12-6v6"/>',
  screen: '<rect x="2" y="2.5" width="12" height="8.5"/><path d="M8 11v3m-3 0h6"/>',
  check: '<path d="m3 8 3 3 7-7"/>',
  copy: '<rect x="5.5" y="5.5" width="7.5" height="8"/><path d="M10 3H3v7.5"/>',
  info: '<circle cx="8" cy="8" r="5.5"/><path d="M8 7.5v3.5M8 5v1"/>',
  book: '<path d="M3.5 2.5H13v11H4a1.5 1.5 0 0 1 0-3h9m-9 0V2.5m2.5 3h4"/>',
  list: '<path d="M5.5 4h8m-8 4h8m-8 4h8M2.5 4h1m-1 4h1m-1 4h1"/>',
};

const icon = (name, size = 16) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="square" aria-hidden="true">' + icons[name] + '</svg>';
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const all = groups.flatMap((group) => group.items);
const groupOf = (key) => groups.find((group) => group.items.includes(key));
const isTool = (key) => tools.includes(key);
const sourceUrl = "https://github.com/SAOS-3624/dsh-see-now";

const blueprint = `
<svg viewBox="0 0 292 192" class="blueprint" aria-hidden="true">
  <defs><pattern id="draft-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="var(--diagram-grid)" stroke-width="1"/></pattern></defs>
  <rect width="292" height="192" fill="var(--layer)"/>
  <rect width="292" height="192" fill="url(#draft-grid)"/>
  <g fill="none" stroke="var(--diagram-line)" stroke-width="1">
    <path d="M20 28h252m-252 136h252M28 20v152M264 20v152" stroke-dasharray="2 4"/>
    <path d="M20 28h16m-8-8v16m228-8h16m-8-8v16M20 164h16m-8-8v16m228-8h16m-8-8v16"/>
    <path d="M44 115h33m-16 8h16m-25 8h25m132-72h35m-35 8h22m-22 8h29"/>
  </g>
  <rect x="77.5" y="45.5" width="132" height="96" fill="var(--bg)" stroke="var(--diagram-dark)"/>
  <path d="M78 62.5h131" stroke="var(--diagram-dark)"/>
  <g fill="var(--diagram-dark)"><rect x="86" y="53" width="3" height="3"/><rect x="92" y="53" width="3" height="3"/><rect x="98" y="53" width="3" height="3"/></g>
  <path d="M78 123h131M104 63v60m9-48h64m-64 9h53m-53 30h38m-65-40h10m-10 8h10m-10 8h10m-10 8h10" fill="none" stroke="var(--diagram-line)"/>
  <path d="M128 141.5v11h32v-11m-47 11h62" fill="none" stroke="var(--diagram-dark)"/>
  <path d="M114 100h12l6-8 7 15 7-11h16" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
  <rect x="175.5" y="93.5" width="64" height="48" fill="var(--blueprint-tint)" stroke="var(--accent)"/>
  <path d="M182 105v-5h5m41 0h5v5m0 25v5h-5m-41 0h-5v-5" fill="none" stroke="var(--accent)"/>
  <path d="M201 105v22l6-5 4 8 4-2-4-8h8z" fill="var(--bg)" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="miter"/>
  <text x="43" y="47" fill="var(--subtle)" font-size="8" font-family="IBM Plex Mono,monospace">01</text>
  <text x="244" y="153" fill="var(--accent)" font-size="8" font-family="IBM Plex Mono,monospace">02</text>
</svg>`;

const flow = () => '<figure class="flow-figure"><ol class="flow">' + [
  ["screen", "观察", "screenshot"], ["activity", "感知变化", "see_now · watch"], ["cursor", "执行操作", "click / type"], ["check", "确认结果", "screenshot"],
].map(([symbol, label, command], index) => '<li><div class="flow-top">' + icon(symbol) + '<span>0' + (index + 1) + '</span></div><strong>' + label + '</strong><code>' + command + '</code></li>').join("") + '</ol><figcaption>图 1 · 桌面操作闭环。长耗时操作可用 <code>see_now</code> 的 <code>watch</code> 动作等待画面变化。</figcaption></figure>';

function markup(key) {
  const page = pages[key];
  const group = groupOf(key);
  const up = page.path ? "../".repeat(page.path.split("/").length) : "./";
  const href = (id) => up + (pages[id].path ? pages[id].path + "/" : "");
  const link = (id, label) => '<a href="' + href(id) + '">' + label + '</a>';
  const crumbs = '<nav class="breadcrumbs" aria-label="面包屑">' + link("overview", "文档") + icon("chevron") + (key === "overview" ? '<span>概览</span>' : (group.name !== "开始使用" ? '<span>' + group.name + '</span>' + icon("chevron") : "") + (seeNowChildren.includes(key) ? link("see_now", "see_now") + icon("chevron") : "") + '<span>' + (page.navLabel && seeNowChildren.includes(key) ? page.navLabel : page.title) + '</span>') + '</nav>';

  const sideLink = (id) => {
    const item = pages[id];
    const label = item.navLabel || item.title;
    return '<a class="side-link' + (isTool(id) && !item.navLabel ? " tool-link" : "") + '" href="' + href(id) + '"' + (id === key ? ' aria-current="page"' : '') + '>' + icon(item.icon) + '<span>' + label + '</span></a>';
  };
  const branch = (id, label, children, options = {}) =>
    '<details class="nav-branch' + (options.nested ? ' nav-subgroup' : '') + '" data-branch="' + id + '"' +
    (options.open ? ' open' : '') + '><summary>' + label + icon("down") + '</summary><div class="nav-children">' + children + '</div></details>';
  const seeNowBranch = branch("see-now", '<span class="nav-tool-name">' + icon("video") + 'see_now</span>',
    sideLink("see_now") + '<div class="nav-subheading">操作</div>' + seeNowActionIds.map(sideLink).join("") +
    '<div class="nav-subheading">视频与陪看</div>' + seeNowTopicIds.map(sideLink).join(""),
    { nested: true, open: key === "see_now" || seeNowChildren.includes(key) });
  const sidebar = groups.map((section) => {
    const items = section.items.filter((id) => !seeNowChildren.includes(id))
      .map((id) => id === "see_now" ? seeNowBranch : sideLink(id)).join("");
    return section.branch
      ? '<div class="nav-group">' + branch(section.branch, '<span>' + section.name + '</span>', items, { open: true }) + '</div>'
      : '<div class="nav-group"><h2>' + section.name + '</h2>' + items + '</div>';
  }).join("");

  const top = [["overview", "文档", "开始使用"], ["mcp", "接入方式", "接入方式"], ["screenshot", "工具参考", "工具参考"]].map(([id, title, section]) => '<a href="' + href(id) + '"' + (section === group.name ? ' class="active"' : '') + '>' + title + '</a>').join("");

  const codePanel = (label, value) => '<div class="code-panel"><div class="code-bar"><span>' + label + '</span><button class="copy" type="button">' + icon("copy") + '<span>复制</span></button></div><pre><code>' + highlight(value) + '</code></pre></div>';
  const block = (part) => {
    if (typeof part === "string") return part;
    if (part.flow) return flow();
    if (part.steps) return '<ol class="implementation-steps">' + part.steps.map(([label, text]) =>
      '<li><strong>' + label + '</strong><p>' + text + '</p></li>').join("") + '</ol>';
    if (part.code) return codePanel(...part.code);
    if (part.sample) {
      const [file, label] = part.sample;
      return '<p class="small-note"><a href="' + up + 'assets/examples/' + file + '" download>' + label + ' ↓</a></p>';
    }
    if (part.links) return '<div class="related">' + part.links.map(([id, title]) => link(id, title + icon("right"))).join("") + '</div>';
    if (part.table) {
      const [head, ...rows] = part.table;
      return '<div class="table-wrap"><table><thead><tr>' + head.map((item) => '<th scope="col">' + item + '</th>').join("") + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((item) => '<td>' + item + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>';
    }
    if (part.tabs) return '<div class="example-tabs"><div class="tabs" role="tablist" aria-label="示例类型">' + part.tabs.map(([name], index) => '<button type="button" id="example-tab-' + index + '" role="tab" aria-selected="' + (index === 0) + '" aria-controls="example-panel-' + index + '" tabindex="' + (index === 0 ? 0 : -1) + '">' + name + '</button>').join("") + '</div>' + part.tabs.map(([name, code], index) => '<div id="example-panel-' + index + '" role="tabpanel" aria-labelledby="example-tab-' + index + '"' + (index === 0 ? '' : ' hidden') + '>' + codePanel(name === "MCP" ? "JSON · 工具调用" : "Shell · " + name, code) + '</div>').join("") + '</div>';
    return "";
  };

  const overview = () => `
    <header class="hero">
      <div class="hero-text">
        <div class="eyebrow"><span class="status-dot"></span> 本地桌面 Runtime <span class="hairline"></span><span class="latin">v0.1</span></div>
        <h1 id="page-title">Computer Use</h1>
        <p class="lead">${page.description}</p>
        <div class="hero-actions"><a class="button primary" href="${href("quickstart")}">快速开始${icon("right")}</a><a class="button secondary" href="#tools">浏览工具参考${icon("down")}</a></div>
      </div>
      <figure class="hero-art">${blueprint}<figcaption><span><b>FIG. 01</b> · 桌面感知与操作</span><span>LOCAL</span></figcaption></figure>
    </header>
    <div class="overview-facts" aria-label="首版信息">
      <div>${icon("screen",20)}<div><span>运行环境</span><strong>macOS 本机</strong></div></div>
      <div>${icon("plug",20)}<div><span>接入协议</span><strong>MCP / CLI / HTTP</strong></div></div>
      <div>${icon("layers",20)}<div><span>文档范围</span><strong>桌面与视频工具</strong></div></div>
    </div>
    <section id="workflow"><h2>工作原理</h2><p>一套逻辑打包成两个运行程序。<code>computer-use</code> 供 AI 或脚本执行；<code>computer-use-server</code> 管理本机会话，通过 <code>/mcp</code> 和 <code>/v1/tools</code> 接收调用。两条路径使用同一个工具层。</p>${block({links:[["architecture","查看运行架构"],["project_layout","查看目录结构"]]})}${flow()}</section>
    <section id="tools"><h2>工具一览</h2><p>视觉工具返回画面信息，操作工具执行桌面输入。工具页提供参数、执行步骤和调用示例。<code>see_now</code> 逐项说明上游 FFmpeg 采集、帧打分、拼图及各项动作。</p>
      <div class="tool-grid">${tools.map((id) => {
        const t = pages[id];
        return '<a class="tool-card"' + (id === "see_now" ? ' id="video"' : "") + ' href="' + href(id) + '"><span class="card-top">' + icon(t.icon,20) + '<span class="tag">' + t.type + '</span></span><strong>' + t.name + '</strong><span class="card-caption">' + t.cn + icon("right") + '</span></a>';
      }).join("")}</div>
    </section>
    <section id="integrations"><h2>接入方式</h2><p>根据宿主能力选择入口。MCP、CLI 和 HTTP 都属于首版，共用工具定义与本地权限。</p>
      ${block({table:[["入口","连接方式","适用宿主"],[link("cli","CLI"),"<code>computer-use</code> 的相对或绝对路径","有终端权限的 AI 与脚本"],[link("mcp","MCP"),"<code>computer-use-server</code> 的 <code>/mcp</code>","支持 Streamable HTTP 的 AI 宿主"],[link("http","HTTP"),"同一服务的 <code>/v1/tools</code>","自建 Agent 和本机应用"]]})}
      <details><summary>所有聊天产品都能连接吗？${icon("down")}</summary><p>宿主需要支持 MCP、终端访问或调用本机 HTTP API，还需要能把工具返回的截图作为视觉输入交给模型。</p></details>
    </section>`;

  const regular = () => `
    <header class="doc-hero">
      <div class="eyebrow"><span class="status-dot"></span> ${isTool(key) ? page.type + '工具' : group.name}${page.status ? '<span class="tag">' + page.status + '</span>' : ''}</div>
      <h1 id="page-title"${isTool(key) ? ' class="mono-title"' : ''}>${page.title}</h1>
      ${page.cn ? '<p class="tool-subtitle">' + page.cn + '</p>' : ''}
      <p class="lead">${page.description}</p>
    </header>
    ${isTool(key) ? '<div class="doc-facts"><span>' + icon(page.icon) + ' ' + page.type + '工具</span><span>' + icon("lock") + ' ' + (page.permission || (page.type === "视觉" ? "观察权限" : "控制权限")) + '</span><span>' + icon("terminal") + ' ' + (page.transportLabel || "MCP / CLI / HTTP") + '</span></div>' : ''}
    ${page.sections.map(([id, title, ...parts]) => '<section id="' + id + '"><h2>' + title + '</h2>' + (isTool(key) && id === "notes" ? '<div class="callout">' + icon("info",20) + block(parts[0]) + '</div>' + parts.slice(1).map(block).join("") : parts.map(block).join("")) + '</section>').join("")}`;

  const outline = page.outline || page.sections.map(([id, title]) => [id, title]);
  const inlineOutline = '<details class="inline-toc"><summary>本页内容' + icon("down") + '</summary><nav aria-label="本页内容">' + outline.map(([id, label]) => '<a href="#' + id + '">' + label + '</a>').join("") + '</nav></details>';
  const index = all.indexOf(key);
  const pagination = [["上一页", all[index - 1], "left"], ["下一页", all[index + 1], "right"]].map(([label, id, direction]) => id ? '<a class="pager ' + direction + '" href="' + href(id) + '"><span><small>' + label + '</small><strong>' + pages[id].title + '</strong></span>' + icon(direction,20) + '</a>' : '<span></span>').join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escape(page.description)}">
<title>${page.title} · Computer Use 文档</title>
<link rel="icon" href="${up}assets/favicon.svg" type="image/svg+xml">
<script>try{const t=localStorage.getItem("cu-theme");if(t==="dark")document.documentElement.dataset.theme="dark";}catch{}</script>
<link rel="stylesheet" href="${up}assets/site.css">
<script src="${up}assets/site.js" defer></script>
</head>
<body data-root="${up}">
<a class="skip" href="#main">跳到正文</a>
<header class="topbar">
  <button id="menu-button" class="icon-button menu-button" aria-label="打开目录" aria-controls="sidebar" aria-expanded="false">${icon("menu",20)}</button>
  <a class="brand" href="${href("overview")}"><span class="brand-mark">${icon("logo",19)}</span><span>Computer Use</span><span class="brand-divider"></span><span class="brand-docs">文档</span></a>
  <nav class="top-nav" aria-label="顶部导航">${top}</nav>
  <div class="top-actions">
    <button type="button" id="search-button" class="search-button" aria-label="搜索文档" aria-haspopup="dialog">${icon("search",18)}<span>搜索文档</span><kbd>Ctrl K</kbd></button>
    <button type="button" id="theme-button" class="icon-button" aria-label="切换主题" aria-pressed="false" title="切换主题"><span class="moon">${icon("moon",18)}</span><span class="sun">${icon("sun",18)}</span></button>
    <a class="icon-button repo-button" href="${sourceUrl}" aria-label="查看视觉引擎源码" title="视觉引擎源码">${icon("external",17)}</a>
  </div>
</header>
<button type="button" class="nav-backdrop" tabindex="-1" aria-label="关闭目录" hidden></button>
<aside id="sidebar" class="sidebar" aria-label="文档目录">
  <div class="sidebar-label"><span>文档目录</span><span class="version">v0.1</span></div>
  <nav class="side-nav" aria-label="文档页面">${sidebar}</nav>
  <div class="sidebar-foot"><span class="status-dot"></span><span>本地运行文档</span></div>
</aside>
<script>
  {
    const nav = document.querySelector(".side-nav");
    const key = "cu-sidebar-state";
    const branches = Array.from(nav.querySelectorAll("[data-branch]"));
    const selected = nav.querySelector("[aria-current=page]");
    function restoreSidebar() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(key));
        if (saved) {
          for (const branch of branches) {
            const open = saved.branches[branch.dataset.branch];
            if (typeof open === "boolean") branch.open = open;
            if (saved.path !== location.pathname && branch.contains(selected)) branch.open = true;
          }
          nav.scrollTop = saved.scrollTop;
          return;
        }
      } catch {}
      if (selected) nav.scrollTop = Math.max(0, selected.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom);
    }
    restoreSidebar();
    window.addEventListener("pagehide", () => {
      try {
        sessionStorage.setItem(key, JSON.stringify({
          path: location.pathname,
          scrollTop: nav.scrollTop,
          branches: Object.fromEntries(branches.map((branch) => [branch.dataset.branch, branch.open])),
        }));
      } catch {}
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) restoreSidebar();
    });
  }
</script>
<div class="page-layout">
  <main id="main" tabindex="-1" aria-labelledby="page-title">
    ${crumbs}
    ${inlineOutline}
    <article>${key === "overview" ? overview() : regular()}</article>
    <nav class="pagination" aria-label="相邻文档">${pagination}</nav>
    <footer class="doc-footer"><span>Computer Use / 技术文档</span><a href="${sourceUrl}">视觉引擎源码 ${icon("external",13)}</a></footer>
  </main>
  <aside class="right-rail" aria-label="页内目录">
    <nav class="toc" aria-label="本页内容"><h2>${icon("list")}本页内容</h2><div class="toc-links">${outline.map(([id, title], i) => '<a href="#' + id + '"' + (i === 0 ? ' class="current" aria-current="location"' : '') + '>' + title + '</a>').join("")}</div></nav>
  </aside>
</div>
<dialog id="search-dialog" aria-labelledby="search-label"><div class="search-header"><h2 id="search-label">搜索文档</h2><button type="button" class="icon-button close-search" aria-label="关闭搜索">${icon("close",20)}</button></div><form class="search-input" role="search">${icon("search",20)}<input type="search" id="search-query" placeholder="搜索工具、参数或接入方式" aria-label="搜索关键词" autocomplete="off"></form><div id="search-results" class="search-results"></div><div class="search-footer"><kbd>↑</kbd> <kbd>↓</kbd> 选择 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 关闭</div></dialog>
</body></html>`;
}

function highlight(value) {
  return value.split(/("(?:[^"\\]|\\.)*"|\b(?:true|false|null|\d+)\b|--[a-z][a-z-]*)/g).map((token, i, parts) => {
    if (i % 2 === 0) return escape(token);
    const kind = token.startsWith('"') && /^\s*:/.test(parts[i + 1]) ? "property" : "literal";
    return '<span class="' + kind + '">' + escape(token) + '</span>';
  }).join("");
}

const exampleOutput = new URL("assets/examples/", output);
await mkdir(exampleOutput, { recursive: true });
for (const file of exampleFiles) {
  await copyFile(new URL(file, codeDirectory), new URL(file, exampleOutput));
}

for (const key of all) {
  const path = pages[key].path;
  const dir = new URL(path ? path + "/" : "./", output);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), markup(key));
}
// Video observation lives under tools/see-now. There is no legacy video route.
await rm(new URL("video/", output), { recursive: true, force: true });
await writeFile(new URL("assets/search.json", output), JSON.stringify(all.map((id) => {
  const p = pages[id];
  return {title:p.title, subtitle:p.navLabel || p.cn || groupOf(id).name, path:p.path, summary:p.description,
    text:(p.sections || []).map((section) => JSON.stringify(section)).join(" ").replace(/<[^>]+>/g, " ")};
})));
