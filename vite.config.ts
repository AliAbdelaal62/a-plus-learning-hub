// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite:{plugins:[{name:'secure-server-wasm-module',enforce:'pre',
    configResolved(config){(globalThis as {__aplusCommand?:string}).__aplusCommand=config.command;
      // The generated server engine is git-ignored; regenerate it when the sandbox dev server starts without it.
      if(config.command==='serve'&&!existsSync(resolve(import.meta.dirname,'secure-server/generated/engine.cjs')))execSync('bun aplus-preview/build.ts --secure && bun secure-server/build-client.ts',{cwd:import.meta.dirname,stdio:'inherit'});},
    // Dev preview: compile the server-only engine WASM from disk inside the dev SSR runtime (never sent to the browser).
    // Build: keep it an external CompiledWasm module for the Worker bundle.
    resolveId(id){if(/generated\/engine\.cjs$/.test(id)&&(globalThis as {__aplusCommand?:string}).__aplusCommand==='serve')return {id:resolve(import.meta.dirname,'secure-server/generated/engine.cjs'),external:true};if(id.endsWith('/engine.wasm')||id==='aplus:engine-wasm'){if((globalThis as {__aplusCommand?:string}).__aplusCommand==='serve'||this.environment?.mode==='dev')return '\0aplus-engine-wasm-dev';return {id:'aplus:engine-wasm',external:true};}return null;},
    load(id){if(id==='\0aplus-engine-wasm-dev')return `import {readFileSync} from 'node:fs';export default new WebAssembly.Module(readFileSync(${JSON.stringify(resolve(import.meta.dirname,'secure-server/generated/engine.wasm'))}));`;return null;},
    renderChunk(code,chunk){if(this.environment.name!=='nitro')return null;const modulePath=relative(dirname(chunk.fileName),'engine.wasm').replaceAll('\\','/');return code.replaceAll('aplus:engine-wasm',modulePath.startsWith('.')?modulePath:'./'+modulePath);},
    generateBundle(){if(this.environment.name==='nitro')this.emitFile({type:'asset',fileName:'engine.wasm',source:readFileSync(resolve(import.meta.dirname,'secure-server/generated/engine.wasm'))});}
  }]},
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
