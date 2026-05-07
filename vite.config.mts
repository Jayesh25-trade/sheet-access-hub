import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackRouter(),
    tanstackStart({
      deployment: {
        preset: "vercel",
      },
      server: {
        entry: "src/server.ts",
      },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
