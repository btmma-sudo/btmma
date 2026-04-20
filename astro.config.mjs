import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://burningtreemma.com",
  integrations: [sitemap()],
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),
});
