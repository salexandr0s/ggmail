import { defineConfig } from "oxfmt";

export default defineConfig({
  sortImports: { newlinesBetween: false },
  sortPackageJson: { sortScripts: true },
  sortTailwindcss: {
    functions: ["cn", "cva"],
    stylesheet: "packages/ui/styles/globals.css",
  },
});
