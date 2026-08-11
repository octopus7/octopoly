import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  build: {
    target: ["es2022", "safari17"],
    outDir: "dist",
    emptyOutDir: true,
  },
});
