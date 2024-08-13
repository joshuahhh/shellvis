import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasmModule from "vite-plugin-wasm";

// TODO: types are strange
const wasm = wasmModule as any as typeof wasmModule.default;

export default defineConfig({
  plugins: [wasm(), react()],
  build: {
    target: "esnext",
  },
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },

  optimizeDeps: {
    // This is necessary because otherwise `vite dev` includes two separate
    // versions of the JS wrapper. This causes problems because the JS
    // wrapper has a module level variable to track JS side heap
    // allocations, and initializing this twice causes horrible breakage
    exclude: [
      "@automerge/automerge-wasm",
      "@automerge/automerge-wasm/bundler/bindgen_bg.wasm",
      "@syntect/wasm",
    ],
  },

  define: {
    "process.browser": true,
    "process.env": process.env,
  },

  server: {
    fs: {
      strict: false,
    },
  },
});
