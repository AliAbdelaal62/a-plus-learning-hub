// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite:{plugins:[{name:'secure-server-wasm-module',enforce:'pre',
    resolveId(id){if(id.endsWith('/engine.wasm')||id==='aplus:engine-wasm')return {id:'aplus:engine-wasm',external:true};return null;},
    renderChunk(code,chunk){if(this.environment.name!=='nitro')return null;const modulePath=relative(dirname(chunk.fileName),'engine.wasm').replaceAll('\\','/');return code.replaceAll('aplus:engine-wasm',modulePath.startsWith('.')?modulePath:'./'+modulePath);},
    generateBundle(){if(this.environment.name==='nitro')this.emitFile({type:'asset',fileName:'engine.wasm',source:readFileSync(resolve(import.meta.dirname,'secure-server/generated/engine.wasm'))});}
  }]},
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
