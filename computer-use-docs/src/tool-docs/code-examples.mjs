import { readFileSync } from "node:fs";

export const codeDirectory = new URL("./code/", import.meta.url);
export const exampleFiles = [
  "desktop.mjs", "macos.swift", "video-frame.mjs", "see-now.mjs",
  "dsh-see-now-runtime.patch", "dsh-see-now-LICENSE.txt", "dsh-see-now-NOTICE.txt",
];

const files = new Map();
export function exampleSource(file) {
  if (!files.has(file)) files.set(file, readFileSync(new URL(file, codeDirectory), "utf8"));
  return files.get(file).trimEnd();
}

export function snippet(file, name) {
  const lines = exampleSource(file).split("\n");
  const start = lines.findIndex(line => line.trim() === "// snippet: " + name);
  const end = lines.findIndex((line, index) => index > start && line.trim() === "// end-snippet");
  if (start < 0 || end < 0) throw new Error("Missing snippet " + file + "/" + name);
  const body = lines.slice(start + 1, end);
  const indent = Math.min(...body.filter(Boolean).map(line => line.match(/^\s*/)[0].length));
  return body.map(line => line.slice(indent)).join("\n");
}

export const upstreamExcerpts = JSON.parse(exampleSource("upstream-excerpts.json"));
