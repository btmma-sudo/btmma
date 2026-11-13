import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "parse5";

const privatePage = /(?:^|\/)(?:api|student-portal|waivers|instructor-videos|private-lesson-manager|[^/]*-test)(?:\/|$)/;
const ignoredTags = new Set(["script", "style", "template", "form", "noscript", "svg"]);
const contentTags = new Set(["p", "li", "dt", "dd", "summary", "tr", "h1", "h2", "h3", "h4"]);

function text(node) {
  if (ignoredTags.has(node.tagName)) return "";
  return node.value ?? (node.childNodes ?? []).map(text).join(" ");
}

function sections(node, results, insideMain = false) {
  if (ignoredTags.has(node.tagName) || node.attrs?.some(({ name }) => name === "hidden")) return;
  if (insideMain && node.attrs?.some(({ name, value }) => name === "class" && /(?:^|\s)(?:schedule-day|faq-card)(?:\s|$)/.test(value))) {
    results.add(text(node).replace(/\s+/g, " ").trim());
    return;
  }
  if (insideMain && contentTags.has(node.tagName)) {
    const value = text(node).replace(/\s+/g, " ").trim();
    if (value) results.add(value);
    return;
  }
  for (const child of node.childNodes ?? []) {
    sections(child, results, insideMain || node.tagName === "main");
  }
}

export function siteGuideIndex() {
  return {
    name: "site-guide-index",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const root = fileURLToPath(dir);
        const pages = [];
        for (const file of await readdir(root, { recursive: true })) {
          if (file !== "index.html" && !file.endsWith("/index.html")) continue;
          const url = "/" + file.slice(0, -"index.html".length);
          if (privatePage.test(url)) continue;
          const document = parse(await readFile(path.join(root, file), "utf8"));
          const content = new Set();
          sections(document, content);
          if (content.size) pages.push({ url, content: [...content] });
        }
        await writeFile(path.join(root, "site-guide-index.json"), JSON.stringify(pages));
      },
    },
  };
}
