import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export function optimizeSiteImages() {
  return {
    name: "optimize-site-images",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const root = fileURLToPath(dir);
        const optimized = new Map();
        const optimize = src => {
          if (!optimized.has(src)) optimized.set(src, (async () => {
            const input = await readFile(path.join(root, src));
            if (input.length < 100_000) return null;

            const maxWidth = src === "/images/logo.png" ? 400 : 1440;
            const output = await sharp(input).rotate()
              .resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
              .webp({ quality: 84 }).toBuffer();
            if (output.length >= input.length * 0.8) return null;

            const target = src.replace(/^\/images\//, "/images/optimized/") + ".webp";
            const destination = path.join(root, target);
            await mkdir(path.dirname(destination), { recursive: true });
            await writeFile(destination, output);
            return target;
          })().catch(error => {
            if (error.code === "ENOENT") return null;
            throw error;
          }));
          return optimized.get(src);
        };

        const imageSource = /(<img\b[^>]*?\s)src="(\/images\/[a-z0-9/_.-]+\.(?:png|jpe?g|webp))"/gi;
        for (const file of await readdir(root, { recursive: true })) {
          if (!file.endsWith(".html")) continue;
          const filename = path.join(root, file);
          const html = await readFile(filename, "utf8");
          const sources = [...new Set([...html.matchAll(imageSource)].map(match => match[2]))];
          const replacements = new Map(await Promise.all(sources.map(async src => [src, await optimize(src)])));
          const result = html.replace(imageSource, (match, prefix, src) => {
            const replacement = replacements.get(src);
            return replacement ? prefix + 'src="' + replacement + '"' : match;
          });
          if (result !== html) await writeFile(filename, result);
        }
      },
    },
  };
}
