import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "parse5";

const privatePage = /(?:^|\/)(?:api|student-portal|waivers|instructor-videos|private-lesson-manager|[^/]*-test)(?:\/|$)/;
const ignoredTags = new Set(["script", "style", "template", "noscript", "svg", "nav", "site-guide"]);
const blockTags = new Set(["article", "aside", "div", "section", "p", "li", "dt", "dd", "summary", "tr", "br"]);
const heading = /^h[1-6]$/;
const attr = (node, key) => node.attrs?.find(({ name }) => name === key)?.value;
const clean = value => value.replace(/\s+/g, " ").trim();

function excluded(node) {
  return ignoredTags.has(node.tagName) || attr(node, "hidden") !== undefined ||
    attr(node, "aria-hidden") === "true" || attr(node, "type") === "hidden";
}

function find(node, tag) {
  if (node.tagName === tag) return node;
  for (const child of node.childNodes ?? []) {
    const match = find(child, tag);
    if (match) return match;
  }
}

function text(node) {
  if (!node || excluded(node)) return "";
  return node.value ?? (node.childNodes ?? []).map(text).join(" ");
}

function extract(root) {
  const passages = new Set();
  let section = "";
  let pending = "";

  function flush() {
    const value = clean(pending);
    pending = "";
    if (!value) return;
    const sentences = value.match(/[^.!?]+[.!?]*|[.!?]+/g) ?? [value];
    let chunk = "";
    for (const sentence of sentences) {
      if (chunk && chunk.length + sentence.length > 560) {
        passages.add(clean(section + " " + chunk));
        chunk = "";
      }
      chunk += sentence;
    }
    if (chunk) passages.add(clean(section + " " + chunk));
  }

  function visit(node) {
    if (excluded(node)) return;
    if (heading.test(node.tagName)) {
      flush();
      section = clean(text(node));
      passages.add(section);
      return;
    }
    if (attr(node, "class")?.split(/\s+/).includes("schedule-day")) {
      flush();
      passages.add(clean(text(node)));
      return;
    }
    if (blockTags.has(node.tagName)) flush();
    if (node.value) pending += node.value;
    if (node.tagName === "img") pending += " " + (attr(node, "alt") ?? "") + " ";
    if (["a", "button", "span", "strong", "label"].includes(node.tagName)) pending += " ";
    for (const child of node.childNodes ?? []) visit(child);
    if (blockTags.has(node.tagName)) flush();
  }

  if (root) visit(root);
  flush();
  return [...passages].filter(Boolean);
}

export function siteGuideIndex() {
  return {
    name: "site-guide-index",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const root = fileURLToPath(dir);
        const pages = [];
        for (const file of (await readdir(root, { recursive: true })).sort()) {
          if (file !== "index.html" && !file.endsWith("/index.html")) continue;
          const url = "/" + file.slice(0, -"index.html".length);
          if (privatePage.test(url)) continue;
          const document = parse(await readFile(path.join(root, file), "utf8"));
          const content = extract(find(document, "main"));
          if (!content.length) continue;
          const title = clean(text(find(document, "title"))).split("|")[0].trim();
          const footer = extract(find(document, "footer"));
          if (url === "/") content.push(...footer);
          pages.push({ url, title, content });
        }
        await writeFile(path.join(root, "site-guide-index.json"), JSON.stringify(pages));
      },
    },
  };
}
