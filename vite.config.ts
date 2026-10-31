import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the same build works at a site root or under a
  // subpath such as GitHub Pages' /cdl-sim/.
  base: "./",
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
