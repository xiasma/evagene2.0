import { defineConfig, Plugin } from "vite";
import { resolve } from "path";

/** Serve index.html for /pedigrees/* and inspect.html for /inspect/* */
function spaFallback(): Plugin {
  return {
    name: "spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        // Only rewrite HTML page requests, not asset/api requests
        if (url.startsWith("/api") || url.includes(".")) {
          next();
          return;
        }
        if (/^\/pedigrees\//.test(url)) {
          req.url = "/index.html";
        } else if (/^\/inspect(\/|$)/.test(url)) {
          req.url = "/inspect.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [spaFallback()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        inspect: resolve(__dirname, "inspect.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
