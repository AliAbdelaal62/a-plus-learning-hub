/* ===== Phase 3 page logic (injected by tools/make-public.js). Everything here is additive; functions are declarations so the page can call them before this block runs. ===== */
const P3={rem:[],remErr:'',inst:0};
/* M11: errors are reported, never swallowed. Only a short code + message leave the page (no record contents, no tokens). */
function LOGE(where,e){const m=String(e&&e.message||e||'').slice(0,300);try{console.error('[aplus] '+where+': '+m)}catch(_){}try{const x=new XMLHttpRequest();x.open('POST','/api/client-log',true);x.setRequestHeader('X-APlus-Token',(document.querySelector('meta[name=aplus-token]')||{}).content||'');x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify({where,message:m}))}catch(_){}}
/* M5: a saved 'Live' rate older than 36 hours (or with no timestamp) is shown as Stale, never as Live. */
const RSTALE_H=()=>{const v=Number(db.set&&db.set.rfh);return Number.isFinite(v)&&v>=1&&v<=720?v:36};
function rst_(c){if(c==B())return 'Same';const r=(db.rates||{})[c];if(!r||!(r.r>0))return 'None';if(r.type=='Manual'||r.type=='Legacy')return r.type;const t=r.t?Date.parse(r.t):NaN;if(!Number.isFinite(t)||Date.now()-t>RSTALE_H()*36e5)return 'Stale';return r.type||'Saved'}
function rAt_(c){const r=(db.rates||{})[c];return r&&r.t?String(r.t).slice(0,10):'unknown date'}
function rateBanner(){const st=db.cur.filter(c=>c.c!=B()&&rst_(c.c)=='Stale').map(c=>c.c+' (last refreshed '+rAt_(c.c)+')'),ms=db.cur.filter(c=>c.c!=B()&&rst_(c.c)=='None').map(c=>c.c);let h='';
 if(st.length)h+=`<p class=pill style="background:#fdecea;color:var(--bad)"><b>Exchange rates are out of date, not live:</b> ${E(st.join(', '))}. New entries would be marked <b>Stale</b>. Records you already saved keep their own rates. <a class=lk onclick="V.nav='Settings';render()">Refresh in Settings</a></p>`;
 if(ms.length)h+=`<p class=pill style="background:#fdecea;color:var(--bad)"><b>No exchange rate:</b> ${E(ms.join(', '))}. Converted values for these currencies are unavailable (never guessed).</p>`;return h}
/* L4: records without a date are never dropped silently from a date-filtered view. */
function undatedItems(F){const f={...F,a:'',b:''};const x=FL(f);return{pr:x.pr.filter(p=>!p.start),rc:x.rc.filter(c=>!c.date)}}
function undatedNote(F){F=F||{};if(!F.a&&!F.b)return '';const u=undatedItems(F),n=u.pr.length+u.rc.length;if(!n)return '';const inc=F.ud=='1';
 return `<p class=pill style="background:var(--baby)"><b>${n} undated record${n>1?'s':''}</b> (${u.pr.length} project${u.pr.length==1?'':'s'}, ${u.rc.length} course${u.rc.length==1?'':'s'}, no start date) ${inc?'are <b>included</b> in these totals.':'are <b>not included</b> in this date range.'} <label><input type=checkbox ${inc?'checked':''} onchange="P3ud(this.checked)"> Include undated</label></p>`}
function P3ud(on){const t=V.nav=='Reports'?V.RP.f:V.F;if(on)t.ud='1';else delete t.ud;render()}
/* L6: reminders due now (server decides in Africa/Cairo time; each occurrence is surfaced once) */
function remBanner(){if(P3.remErr)return `<p class=pill style="background:#fdecea;color:var(--bad)">Reminders could not be checked: ${E(P3.remErr)}</p>`;if(!P3.rem.length)return '';
 return `<div class=cd style="max-width:900px;border-left:4px solid var(--acc)"><b>Reminders due</b> <span class=mut>(shown while A+ Hub is open; nothing is delivered while it is closed)</span>${P3.rem.map(r=>`<div>${E(r.date)} ${E(r.time)} — ${E(r.name||'Reminder')} <button class=lk onclick="P3ack(${r.id},'${E(r.date)}')">Got it</button></div>`).join('')}</div>`}
function P3post(u,b,cb){const x=new XMLHttpRequest();x.open('POST',u,true);x.setRequestHeader('X-APlus-Token',(document.querySelector('meta[name=aplus-token]')||{}).content||'');x.setRequestHeader('Content-Type','application/json');x.onload=()=>cb(x.status>=200&&x.status<300?null:new Error('HTTP '+x.status));x.onerror=()=>cb(new Error('network error'));x.send(JSON.stringify(b))}
function P3ack(id,date){P3post('/api/reminders/ack',{id,date},e=>{if(e){LOGE('reminder ack',e);toast('Could not mark the reminder: '+e.message,1);return}P3.rem=P3.rem.filter(r=>!(r.id==id&&r.date==date));render()})}
function P3poll(){if(LOCK)return;const x=new XMLHttpRequest();x.open('GET','/api/reminders',true);x.onload=()=>{try{if(x.status!=200)throw new Error('HTTP '+x.status);const j=JSON.parse(x.responseText);const was=JSON.stringify(P3.rem);P3.rem=(j.due||[]).filter(r=>!(db.rd||{})[r.id+'|'+r.date]);P3.remErr='';if(JSON.stringify(P3.rem)!=was&&!$('#m').innerHTML&&V.nav=='Dashboard')render()}catch(e){P3.remErr=String(e.message||e);LOGE('reminders',e)}};x.onerror=()=>{P3.remErr='server not reachable'};x.send()}
/* G: views get their notices without touching the original view code */
function P3wrap(name,pre){const prev=VW[name];VW[name]=function(){return pre()+prev()}}
function P3_INSTALL(){if(P3.inst)return;P3.inst=1;
 P3wrap('Dashboard',()=>rateBanner()+remBanner()+undatedNote(V.F));P3wrap('Reports',()=>rateBanner()+undatedNote(V.RP.f));P3wrap('Cash Flow',()=>rateBanner());P3wrap('Settings',()=>rateBanner());P3wrap('Projects',()=>rateBanner());}
function P3_BOOT(){try{P3poll();setInterval(P3poll,60000)}catch(e){LOGE('boot',e)}}
/* L1: one list of university names already in use; the form suggests them and a near-identical spelling is mapped to the existing one by the server (new / edited records only) */
function uniList(){const m=new Map();[...db.s,...db.sub,...db.pr,...db.rc].forEach(r=>{const v=String(r.uni||'').trim();if(!v)return;const k=v.toLowerCase().replace(/[.,'"()\-_/]+/g,' ').replace(/\s+/g,' ').trim(),z=m.get(k)||{n:0,c:{}};z.n++;z.c[v]=(z.c[v]||0)+1;m.set(k,z)});return [...m.values()].map(z=>Object.entries(z.c).sort((a,b)=>b[1]-a[1])[0][0]).sort()}
function uniDL(){return `<datalist id=unis>${uniList().map(u=>`<option value="${E(u)}">`).join('')}</datalist>`}

/* M9 helpers */
function P3rq(){try{if(crypto&&crypto.randomUUID)return crypto.randomUUID().replace(/-/g,'')}catch(_){}return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,12)}
function P3save(b){try{return apiX('POST','/api/save',b)}catch(e){if(e&&e.status===undefined&&!e.detail){LOGE('save transport, retrying once with the same request id',e);return apiX('POST','/api/save',b)}throw e}}
