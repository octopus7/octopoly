import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  appType: "spa",
  resolve: {
    alias: {
      "@octopoly/contracts": fileURLToPath(new URL("./src/contracts/index.ts", import.meta.url)),
    },
  },
  build: {
    target: ["es2022", "safari17"],
    outDir: "dist",
    emptyOutDir: true,
  },
});
