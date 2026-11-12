// Server only. No Supabase service credential or database snapshot can enter the client bundle.
// @ts-expect-error JavaScript compatibility gateway is intentionally server-only.
import { makeGateway } from '../../secure-server/gateway.mjs';
// @ts-expect-error JavaScript central-store provider is intentionally server-only.
import { supabaseStore } from '../../secure-server/snapshot-store.mjs';
import wasmModule from '../../secure-server/generated/engine.wasm';
let handler: ((request: Request) => Promise<Response>) | undefined;
export async function secureBackend(request: Request, bindings?: unknown): Promise<Response> {
  const env = (bindings && typeof bindings === 'object' ? bindings : {}) as Record<string,string|undefined>;
  const setting = (key:string) => env[key] ?? process.env[key];
  const origin=setting('APLUS_APP_ORIGIN'),key=setting('APLUS_STATE_KEY'),csrfToken=setting('APLUS_CSRF_KEY'),url=setting('SUPABASE_URL'),serviceKey=setting('SUPABASE_SERVICE_ROLE_KEY'),instance=setting('APLUS_STATE_INSTANCE');
  const stage=setting('APLUS_DEPLOYMENT_STAGE');
  if(stage!=='staging'&&(stage!=='production'||setting('APLUS_RELEASE_APPROVED')!=='true'))return new Response('A+ Hub release is locked pending staging review.',{status:503,headers:{'cache-control':'no-store'}});
  if (!origin || !key || !csrfToken || !url || !serviceKey || !instance) return new Response('A+ Hub secure staging is not connected. Production and real-data migration are locked.',{status:503,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}});
  if (!handler) handler = makeGateway({store:supabaseStore({url,serviceKey,key,instance}),origin,csrfToken,wasmModule,requireMfa:false,localTest:false,demo:false});
  return handler!(request);
}
