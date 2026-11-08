const theme = document.querySelector("#theme-button");
const activeTheme = () => document.documentElement.dataset.theme || "light";

function syncThemeButton() {
  const dark = activeTheme() === "dark";
  theme.setAttribute("aria-pressed", String(dark));
  theme.title = dark ? "切换为浅色主题" : "切换为深色主题";
  theme.setAttribute("aria-label", theme.title);
}

theme.addEventListener("click", () => {
  const next = activeTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("cu-theme", next); } catch {}
  syncThemeButton();
});
syncThemeButton();

const menu = document.querySelector("#menu-button");
const sidebar = document.querySelector("#sidebar");
const backdrop = document.querySelector(".nav-backdrop");
const mobile = matchMedia("(max-width: 800px)");

function toggleMenu(open, restoreFocus = false) {
  sidebar.classList.toggle("open", open);
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "关闭目录" : "打开目录");
  backdrop.hidden = !open;
  if (open) sidebar.querySelector("[aria-current=page]")?.focus({ preventScroll: true });
  if (restoreFocus) menu.focus();
}

menu.addEventListener("click", () => toggleMenu(!sidebar.classList.contains("open")));
backdrop.addEventListener("click", () => toggleMenu(false, true));
mobile.addEventListener("change", () => toggleMenu(false));
sidebar.addEventListener("click", (event) => {
  if (event.target.closest("a") && mobile.matches) toggleMenu(false);
});

const toc = Array.from(document.querySelectorAll(".toc-links a"));
const sections = toc.map((item) => document.getElementById(item.hash.slice(1)));
let scrollPending = false;

function syncOutline() {
  const anchorLine = document.querySelector(".topbar").offsetHeight + 56;
  let active = 0;
  for (let index = 0; index < sections.length; index++) {
    if (sections[index].getBoundingClientRect().top <= anchorLine) active = index;
  }
  if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
    active = sections.length - 1;
  }
  for (const [index, item] of toc.entries()) {
    item.classList.toggle("current", index === active);
    if (index === active) item.setAttribute("aria-current", "location");
    else item.removeAttribute("aria-current");
  }
  scrollPending = false;
}
window.addEventListener("scroll", () => {
  if (scrollPending) return;
  scrollPending = true;
  requestAnimationFrame(syncOutline);
}, { passive: true });
window.addEventListener("resize", syncOutline);
window.addEventListener("load", syncOutline);
syncOutline();

for (const bar of document.querySelectorAll(".tabs")) {
  const tabs = Array.from(bar.querySelectorAll("[role=tab]"));
  function select(tab, focus = false) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !active;
    }
    if (focus) tab.focus();
  }
  for (const tab of tabs) tab.addEventListener("click", () => select(tab));
  bar.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(event.target);
    const next = {
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(tabs[next], true);
  });
}

for (const button of document.querySelectorAll(".copy")) {
  let timer;
  const label = button.querySelector("span");
  label.setAttribute("aria-live", "polite");
  button.addEventListener("click", async () => {
    const value = button.closest(".code-panel").querySelector("pre code").textContent;
    try {
      await navigator.clipboard.writeText(value);
      label.textContent = "已复制";
    } catch {
      label.textContent = "请手动复制";
    }
    clearTimeout(timer);
    timer = setTimeout(() => { label.textContent = "复制"; }, 1800);
  });
}

const searchButton = document.querySelector("#search-button");
const dialog = document.querySelector("#search-dialog");
const input = document.querySelector("#search-query");
const results = document.querySelector("#search-results");
const searchRoot = new URL(document.body.dataset.root, location.href);
const shortcut = searchButton.querySelector("kbd");
if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut.textContent = "⌘ K";

let indexPromise;
let resultLinks = [];
let selection = 0;

function message(value) {
  const paragraph = document.createElement("p");
  paragraph.textContent = value;
  results.replaceChildren(paragraph);
  resultLinks = [];
}

function selectResult(index, scroll = false) {
  if (!resultLinks.length) return;
  selection = (index + resultLinks.length) % resultLinks.length;
  for (const [itemIndex, link] of resultLinks.entries()) link.classList.toggle("chosen", itemIndex === selection);
  if (scroll) resultLinks[selection].scrollIntoView({ block: "nearest" });
}

async function renderResults() {
  const query = input.value.trim().toLowerCase();
  message("正在读取文档索引…");
  try {
    indexPromise ||= fetch(new URL("assets/search.json", searchRoot)).then((response) => {
      if (!response.ok) throw Error("Search index unavailable");
      return response.json();
    });
    const index = await indexPromise;
    if (input.value.trim().toLowerCase() !== query) return;
    const words = query.split(/\s+/).filter(Boolean);
    const matches = index.map((entry) => {
      const title = [entry.title, entry.subtitle, entry.path].join(" ").toLowerCase();
      const body = (entry.summary + " " + entry.text).toLowerCase();
      const scores = words.map((word) => title.includes(word) ? 6 : body.includes(word) ? 1 : 0);
      return { entry, score: scores.every(Boolean) ? scores.reduce((sum, value) => sum + value, 0) : 0 };
    }).filter((item) => !query || item.score).sort((a, b) => b.score - a.score).slice(0, query ? 10 : 6);
    if (!matches.length) {
      message("没有找到匹配的文档。");
      return;
    }
    resultLinks = matches.map(({ entry }, position) => {
      const link = document.createElement("a");
      link.href = new URL(entry.path ? entry.path + "/" : "./", searchRoot);
      link.className = "search-result";
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const category = document.createElement("span");
      category.textContent = entry.subtitle;
      const summary = document.createElement("span");
      summary.className = "match-summary";
      summary.textContent = entry.summary;
      link.append(title, category, summary);
      link.addEventListener("pointermove", () => selectResult(position));
      link.addEventListener("focus", () => selectResult(position));
      return link;
    });
    results.replaceChildren(...resultLinks);
    selectResult(0);
  } catch {
    indexPromise = undefined;
    message("文档索引暂不可用。请重试。");
  }
}

function openSearch() {
  if (dialog.open) return;
  if (sidebar.classList.contains("open")) toggleMenu(false);
  input.value = "";
  dialog.showModal();
  input.focus();
  renderResults();
}

searchButton.addEventListener("click", openSearch);
dialog.querySelector(".close-search").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
dialog.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  resultLinks[selection]?.click();
});
input.addEventListener("input", renderResults);
input.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  selectResult(selection + (event.key === "ArrowUp" ? -1 : 1), true);
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
  }
  if (event.key === "Escape" && !dialog.open && sidebar.classList.contains("open")) toggleMenu(false, true);
});
