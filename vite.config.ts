// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "node:path";

// Server-only env values must never enter the client define map.
Object.assign(process.env, loadEnv(process.env.NODE_ENV || "development", process.cwd(), ""));

export default defineConfig({ vite: {
  resolve: { alias: {
    "entities/lib/decode.js": path.resolve("node_modules/entities/lib/decode.js"),
    "entities/lib/encode.js": path.resolve("node_modules/entities/lib/encode.js"),
    "entities/decode": path.resolve("node_modules/entities/lib/decode.js"),
    "entities/encode": path.resolve("node_modules/entities/lib/encode.js"),
    entities: path.resolve("node_modules/entities"),
  } },
} });
