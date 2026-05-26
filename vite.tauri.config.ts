import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: resolve("src/renderer"),
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
    },
  },
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  server: {
    port: 19642,
    strictPort: true,
    hmr: false,
  },
  base: "./",
  build: {
    outDir: resolve("out/renderer"),
    emptyOutDir: true,
    target: "safari17",
    cssTarget: "safari17",
    modulePreload: {
      polyfill: false,
    },
  },
});
