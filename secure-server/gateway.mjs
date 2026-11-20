import {createHash,randomUUID} from 'node:crypto';
import {createRuntime} from './generated/engine.cjs';
import {secret,verify} from './totp.mjs';
const pack=files=>files.map(([p,b])=>[p,b===null?null:Buffer.from(b).toString('base64')]);
const unpack=files=>files.map(([p,b])=>[p,b===null?null:Uint8Array.from(Buffer.from(b,'base64'))]);
const hash=s=>createHash('sha256').update(s).digest('hex');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}});
let engineQueue=Promise.resolve();
const schema=`CREATE TABLE IF NOT EXISTS secure_session_mfa(token_hash TEXT PRIMARY KEY,verified_on TEXT NOT NULL);`;
const setupHtml=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تأمين حساب الإدارة — A+ Hub</title></head><body style="max-width:600px;margin:60px auto;padding:24px;font:18px system-ui"><h1>تأمين حساب الإدارة</h1><p>اربط حساب الإدارة بتطبيق مصادقة قبل فتح بيانات الأكاديمية. لن نطلب موافقة محاسب أو منسق.</p><button id="enroll">تجهيز مفتاح المصادقة</button><p id="key"></p><form id="verify" hidden><label>رمز التحقق <input name="otp" inputmode="numeric" pattern="[0-9]{6}" required></label><button>تفعيل وفتح النظام</button></form><p role="alert" id="error"></p><script src="/secure/mfa.js" defer></script></body></html>`;
export function makeGateway({store,origin,csrfToken,locateFile,wasmModule,localTest=false,demo=false,requireMfa=false,clock=()=>new Date(),onError=()=>{}}){
 const base=new URL(origin);if(!/^https:$/.test(base.protocol)&&!(localTest&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('HTTPS is required');if(!/^[a-zA-Z0-9_-]{32,128}$/.test(csrfToken||''))throw Error('A server CSRF key is required');if(demo&&!localTest)throw Error('Demo seeding is local-test only');
 return async function handle(request,{clientAddress='unknown'}={}){
  const id=randomUUID(),url=new URL(request.url),method=request.method.toUpperCase(),write=!['GET','HEAD','OPTIONS'].includes(method);let response;
  const finalize=res=>{const h=new Headers(res.headers);h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');h.set('X-Frame-Options','DENY');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');h.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://open.er-api.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");if(base.protocol==='https:')h.set('Strict-Transport-Security','max-age=31536000');h.set('X-Request-ID',id);const cookie=h.get('set-cookie');if(cookie&&base.protocol==='https:'&&!/; Secure/i.test(cookie))h.set('set-cookie',cookie+'; Secure');return new Response(res.body,{status:res.status,headers:h});};
  if(url.origin!==base.origin)return finalize(json({ok:false,error:'Unexpected request origin.'},421));
  if(method==='OPTIONS')return finalize(json({ok:false,error:'Cross-origin access is not allowed.'},405));
  if(write&&(request.headers.get('origin')!==base.origin||request.headers.get('sec-fetch-site')==='cross-site'))return finalize(json({ok:false,error:'This request must originate from the academy.'},403));
  if(write&&request.headers.get('x-aplus-token')!==csrfToken)return finalize(json({ok:false,error:'Reload before saving.'},403));
  if(write&&!/^application\/json/i.test(request.headers.get('content-type')||''))return finalize(json({ok:false,error:'JSON is required.'},415));
  if(/\.(?:sqlite|db|wasm|map)$/.test(url.pathname)||/^\/(?:aplus|aplus-preview|secure-server|src|data|backups|fixtures|node_modules|auth|dashboard|reset-password)(?:\/|$)/.test(url.pathname))return finalize(json({ok:false,error:'Not found.'},404));
  const max=25*1024*1024;if(Number(request.headers.get('content-length')||0)>max)return finalize(json({ok:false,error:'File too large.'},413));
  let body='';try{if(write){const reader=request.body?.getReader();let bytes=0;const chunks=[];if(reader){while(true){const x=await reader.read();if(x.done)break;bytes+=x.value.length;if(bytes>max){await reader.cancel();return finalize(json({ok:false,error:'File too large.'},413));}chunks.push(Buffer.from(x.value));}body=Buffer.concat(chunks).toString('utf8');}JSON.parse(body||'{}');}}catch{return finalize(json({ok:false,error:'Invalid request.'},400));}
  const previous=engineQueue;let release;engineQueue=new Promise(r=>release=r);await previous;
  try{response=await store.run(async context=>{
   let value=context.value,rt;
   if(!value){if(!demo)return {result:json({ok:false,error:'The secure academy database has not been provisioned.'},503)};rt=await createRuntime({locateFile,wasmModule,clock,log:()=>{}});value={v:1,files:pack(rt.snapshot()),limits:{},environment:'synthetic-local-test'};await rt.stop();}
   rt=await createRuntime({locateFile,wasmModule,mode:'server',snapshot:unpack(value.files),cookie:request.headers.get('cookie')||'',csrfToken,clock,log:()=>{}});
   const capture=()=>({...value,files:pack(rt.snapshot())});
   try{
    rt.server.ctx.db.exec(schema);const db=()=>rt.server.ctx.db;const current=()=>rt.actor({cookie:request.headers.get('cookie')||''});let user=current();const input=body?JSON.parse(body):{};
    const allowMfa=['/api/auth/status','/api/auth/logout','/api/security/mfa/enroll','/api/security/mfa/verify'];
    value.mfa||={};const mfaFor=u=>u?.role==='Admin'&&value.mfa[u.id]?.username===u.username?value.mfa[u.id]:null;
    const cookieToken=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aplus_session_3001='))?.split('=')[1];
    if(requireMfa&&user?.role==='Admin'&&mfaFor(user)?.secret&&!db().prepare('SELECT 1 FROM secure_session_mfa WHERE token_hash=?').get(hash(cookieToken||'')))return {result:new Response(JSON.stringify({ok:false,user:null,error:'Sign in with your authenticator code.'}),{status:401,headers:{'content-type':'application/json','set-cookie':'aplus_session_3001=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}})};
    const mfaRequired=!!(requireMfa&&user?.role==='Admin'&&!mfaFor(user)?.secret);
    if(mfaRequired&&!allowMfa.includes(url.pathname)){if(!url.pathname.startsWith('/api/'))return {value:capture(),result:new Response(setupHtml.replace('<head>','<head><meta name="aplus-token" content="'+csrfToken+'">'),{headers:{'content-type':'text/html; charset=utf-8'}})};return {value:capture(),result:json({ok:false,error:'Configure administrator two-factor authentication first.'},428)};}
    if(url.pathname.startsWith('/api/security/mfa/')){
     if(!requireMfa)return {result:json({ok:false,error:'Two-factor authentication is currently disabled.'},404)};
     value.limits||={};const k='mfa:'+user?.id+':'+url.pathname,limit=value.limits[k];if(limit&&limit.until>clock().getTime()&&limit.count>=10)return {value:capture(),result:json({ok:false,error:'Too many verification attempts. Try again later.'},429)};value.limits[k]={count:limit?.until>clock().getTime()?limit.count+1:1,until:limit?.until>clock().getTime()?limit.until:clock().getTime()+900000};
     if(!user||user.role!=='Admin')return {result:json({ok:false,error:'Administrator access required.'},403)};
     if(method!=='POST')return {result:json({ok:false,error:'Method not allowed.'},405)};
     if(url.pathname.endsWith('/enroll')){const row=mfaFor(user);if(row?.secret)return {result:json({ok:false,error:'Two-factor authentication is already enabled.'},409)};const key=secret();value.mfa[user.id]={username:user.username,pending:key,pending_until:clock().getTime()+600000,last_counter:-1};return {value:capture(),result:json({ok:true,secret:key,uri:'otpauth://totp/APlusHub:'+encodeURIComponent(user.username)+'?secret='+key+'&issuer=APlusHub'})};}
     const row=mfaFor(user),counter=row?.pending&&row.pending_until>clock().getTime()?verify(row.pending,input.otp,clock().getTime()):null;
     if(counter===null)return {value:capture(),result:json({ok:false,error:'Invalid or expired authenticator code.'},422)};
     value.mfa[user.id]={username:user.username,secret:row.pending,last_counter:counter};db().prepare('INSERT OR REPLACE INTO secure_session_mfa VALUES(?,?)').run(hash(cookieToken||''),clock().toISOString());return {value:capture(),result:json({ok:true})};
    }
    if(url.pathname==='/api/auth/setup')return {result:json({ok:false,error:'Public administrator setup is disabled.'},403)};
    const login=url.pathname==='/api/auth/login'&&method==='POST';
    const limitKeys=login?['user:'+hash(String(input.username||'').trim().toLowerCase()),'ip:'+hash(clientAddress)]:[];
    const now=clock().getTime();value.limits||={};for(const [key,a]of Object.entries(value.limits))if(a.until<now)delete value.limits[key];
    if(login&&limitKeys.some((key,i)=>(value.limits[key]?.count||0)>=(i===0?10:50)))return {value:capture(),result:json({ok:false,error:'Too many attempts. Try again later.'},429)};
    let raw;
    if(url.pathname==='/api/preview/backups/restore'&&method==='POST'){
     if(!user||user.role!=='Admin')return {result:json({ok:false,error:'Administrator access required.'},403)};
     if(!localTest)return {result:json({ok:false,error:'Real data migration is locked until the cloud restore rehearsal is approved.'},423)};
     const result=await rt.restoreBackup(input,{'x-aplus-token':csrfToken},async()=>{await context.checkpoint(capture());});value.mfa={};raw={status:200,headers:{'content-type':'application/json','set-cookie':'aplus_session_3001=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'},body:Buffer.from(JSON.stringify(result))};
    }else {if(login)db().exec('BEGIN IMMEDIATE');raw=rt.dispatch(method,url.pathname+url.search,{'content-type':request.headers.get('content-type')||'','x-aplus-token':request.headers.get('x-aplus-token')||'',cookie:request.headers.get('cookie')||''},body||undefined);}
    if(login){let result;try{result=JSON.parse(Buffer.from(raw.body).toString());}catch{result={};}let success=raw.status===200;
     if(requireMfa&&success&&result.user?.role==='Admin'){const row=mfaFor(result.user);if(row?.secret){const counter=verify(row.secret,input.otp,now,row.last_counter);if(counter===null){rt.dispatch('POST','/api/auth/logout',{'content-type':'application/json','x-aplus-token':csrfToken},'{}');success=false;raw={status:401,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({ok:false,error:'Username, password or verification code is incorrect.'}))};}else {value.mfa[result.user.id].last_counter=counter;const t=rt.cookie().split('=')[1];db().prepare('INSERT OR REPLACE INTO secure_session_mfa VALUES(?,?)').run(hash(t||''),clock().toISOString());}}}
     db().exec(success?'COMMIT':'ROLLBACK');if(!success)rt.securityAudit({actor:String(input.username||'').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,50),action:'login-failed',entity:'security',detail:'Credentials or authenticator verification failed; no password or OTP recorded.'});
     for(const key of limitKeys){if(success)delete value.limits[key];else{const old=value.limits[key];value.limits[key]={count:(old?.count||0)+1,until:old?.until||now+900000};}}
    }
    // Financial projection metadata must not bypass the original non-finance redaction.
    if(url.pathname==='/api/state'&&raw.status===200&&user&&!['Admin','Accountant'].includes(user.role)){const data=JSON.parse(Buffer.from(raw.body).toString());for(const c of data.state.rc||[])delete c.withdrawalReduction;for(const e of data.state.re||[])for(const key of ['withdrawalOriginalPrice','withdrawalRefund','withdrawalNetPaid'])delete e[key];raw.body=Buffer.from(JSON.stringify(data));}
    let bytes=Buffer.from(raw.body||'');const headers=new Headers(raw.headers);headers.delete('content-length');
    if(url.pathname==='/team-login.js'){bytes=Buffer.from(bytes.toString().replace("password:field('password').value}","password:field('password').value,otp:field('otp')?.value||''}"));}
    if(raw.status>=400&&(headers.get('content-type')||'').includes('application/json')){try{const error=JSON.parse(bytes.toString());if(/sqlite|constraint|no such table|syntax error|\\app\\|\/app\//i.test(error.error||'')){error.error='The record could not be saved. Check its values or contact the administrator.';delete error.detail;bytes=Buffer.from(JSON.stringify(error));}}catch{}}
    if((headers.get('content-type')||'').includes('text/html')){let html=bytes.toString();const showOtp=requireMfa;html=html.replace('<div id="setup">',showOtp?'<label>Authenticator code — Admin when enabled<input id="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}"></label><div id="setup">':'<p dir="rtl">نسخة تجربة محلية — الدخول باسم المستخدم وكلمة المرور فقط، بدون كود مصادقة.</p><div id="setup">');html=html.replace('</body>','<script src="/secure/academy-client.js" defer></script></body>');html=html.replaceAll('نسخة تجربة — 3005 — التعديلات هنا لا تصل لنسخة الشغل على 3000','نسخة مراجعة آمنة — بيانات تجريبية مستقلة').replaceAll('EXPERIMENTAL PREVIEW','SECURE STAGING');bytes=Buffer.from(html);}
    return {value:capture(),result:new Response(method==='HEAD'?null:bytes,{status:raw.status,headers})};
   }finally{await rt.stop();}
  });}catch(e){onError({requestId:id,name:e.name});response=json({ok:false,error:'The operation could not be completed. No unconfirmed success is reported.',requestId:id},e.status||503);}finally{release();}
  return finalize(response);
 };
}
