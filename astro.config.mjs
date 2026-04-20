import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function renameSitemap() {
  return {
    name: "rename-sitemap",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const distPath = fileURLToPath(dir);
        const oldFile = path.join(distPath, "sitemap-0.xml");
        const newFile = path.join(distPath, "sitemap-1.xml");
        const indexFile = path.join(distPath, "sitemap-index.xml");

        if (fs.existsSync(oldFile)) {
          fs.renameSync(oldFile, newFile);
        }

        if (fs.existsSync(indexFile)) {
          const content = fs.readFileSync(indexFile, "utf-8");
          fs.writeFileSync(indexFile, content.replaceAll("sitemap-0.xml", "sitemap-1.xml"));
        }
      },
    },
  };
}

export default defineConfig({
  site: "https://burningtreemma.com",
  integrations: [sitemap(), renameSitemap()],
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),
});
