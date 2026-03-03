import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    files: {
      assets: "public",
      appTemplate: "svelte-src/app.html",
      hooks: {
        server: "svelte-src/hooks.server"
      },
      routes: "svelte-src/routes",
      lib: "svelte-src/lib"
    }
  }
};

export default config;
