// Server only. No Supabase service credential or database snapshot can enter the client bundle.
// @ts-expect-error JavaScript compatibility gateway is intentionally server-only.
import { makeGateway } from '../../secure-server/gateway.mjs';
// @ts-expect-error JavaScript central-store provider is intentionally server-only.
import { supabaseStore } from '../../secure-server/snapshot-store.mjs';
import wasmModule from '../../secure-server/generated/engine.wasm';
let handler: ((request: Request) => Promise<Response>) | undefined;
// Worker builds receive a compiled WebAssembly.Module. The sandbox dev server may hand back a non-module value,
// so in dev only the server-side engine is compiled from the generated file on disk.
async function engineModule(): Promise<WebAssembly.Module> {
  if (wasmModule instanceof WebAssembly.Module || !import.meta.env.DEV) return wasmModule as WebAssembly.Module;
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  return new WebAssembly.Module(readFileSync(resolve(process.cwd(), 'secure-server/generated/engine.wasm')));
}
export async function secureBackend(request: Request, bindings?: unknown): Promise<Response> {
  const env = (bindings && typeof bindings === 'object' ? bindings : {}) as Record<string,string|undefined>;
  const setting = (key:string) => env[key] ?? process.env[key];
  const origin=setting('APLUS_APP_ORIGIN'),key=setting('APLUS_STATE_KEY'),csrfToken=setting('APLUS_CSRF_KEY'),url=setting('SUPABASE_URL'),serviceKey=setting('SUPABASE_SERVICE_ROLE_KEY'),instance=setting('APLUS_STATE_INSTANCE');
  const stage=setting('APLUS_DEPLOYMENT_STAGE');
  if(stage!=='staging'&&(stage!=='production'||setting('APLUS_RELEASE_APPROVED')!=='true'))return new Response('A+ Hub release is locked pending staging review.',{status:503,headers:{'cache-control':'no-store'}});
  if (!origin || !key || !csrfToken || !url || !serviceKey || !instance) return new Response('A+ Hub secure staging is not connected. Production and real-data migration are locked.',{status:503,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}});
  if (!handler) handler = makeGateway({store:supabaseStore({url,serviceKey,key,instance}),origin,csrfToken,wasmModule:await engineModule(),requireMfa:false,localTest:false,demo:false});
  return handler!(previewProxyRequest(request, origin));
}
// Dev sandbox only: Lovable's preview proxy (which already requires a signed-in project member) reaches the dev
// server on a loopback host. Treat such requests as arriving at the pinned APLUS_APP_ORIGIN; any other forwarded
// host is left untouched so the gateway's origin check still rejects it. Built Worker output keeps strict pinning.
function previewProxyRequest(request: Request, origin: string): Request {
  if (!import.meta.env.DEV) return request;
  const url = new URL(request.url), base = new URL(origin);
  const forwarded = request.headers.get('x-forwarded-host');
  if (url.origin === base.origin || (forwarded && forwarded !== base.host)) return request;
  if (!['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(url.hostname)) return request;
  const next = new URL(url.pathname + url.search, base.origin);
  const init: RequestInit & { duplex?: string } = { method: request.method, headers: request.headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) { init.body = request.body; init.duplex = 'half'; }
  return new Request(next, init);
}
