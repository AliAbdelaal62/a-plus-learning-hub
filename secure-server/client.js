// Browser transport only: no database, password hashes, fixtures or server engine are bundled here.
window.__APLUS_SERVER__=true;
const token=()=>document.querySelector('meta[name=aplus-token]')?.content||'';
const transport={dispatch(method,url,headers={},body){if(!url.startsWith('/api/'))throw Error('Invalid API path');const x=new XMLHttpRequest();x.open(method,url,false);for(const [k,v]of Object.entries(headers))x.setRequestHeader(k,v);x.send(body??null);return {status:x.status,text:()=>x.responseText};}};
window.__APLUS_TRANSPORT__=transport;window.__APLUS_SAVE__=async()=>{};
window.__APLUS_RESTORE__=async parameters=>{const r=await fetch('/api/preview/backups/restore',{method:'POST',headers:{'content-type':'application/json','x-aplus-token':token()},body:JSON.stringify(parameters)}),data=await r.json();if(!r.ok)throw Error(data.error);return data;};
const user=JSON.parse(transport.dispatch('GET','/api/auth/status').text()).user;
if(user){require('../aplus-preview/extensions/ui').mount();require('../aplus-preview/extensions/backups-ui').mount();new MutationObserver(()=>{const box=document.getElementById('database-transfer');if(box&&!box.dataset.secureText){box.dataset.secureText='1';const p=box.querySelector('p.neg');if(p)p.textContent=document.documentElement.lang==='ar'?'البيانات محفوظة على الخادم. استيراد البيانات الحقيقية مقفول لحين اجتياز تجربة الاسترجاع والموافقة.':'Data is stored on the server. Real-data migration stays locked until the restore rehearsal is approved.';}}).observe(document.getElementById('v'),{childList:true,subtree:true});}
