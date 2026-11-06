'use strict';
// Admin-only presentation; operation authorization also lives in backups.js.
function mount() {
  const rt=window.__APLUS_PREVIEW__;
  const auth=JSON.parse(rt.dispatch('GET','/api/auth/status').text());
  if(auth.user?.role!=='Admin')return;
  const labels=new Map(),originalText=new WeakMap();
  const tr=(en,ar)=>{labels.set(en,{en,ar});labels.set(ar,{en,ar});return document.documentElement.lang==='ar'?ar:en;};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const headers=()=>({'content-type':'application/json','x-aplus-token':document.querySelector('meta[name="aplus-token"]')?.content});
  const api=(action,data)=>{const r=rt.dispatch(data?'POST':'GET','/api/preview/backups'+action,data?headers():{},data?JSON.stringify(data):undefined);const b=JSON.parse(r.text());if(!b.ok)throw Error(b.error);return b;};
  const download=(data,name)=>{const u=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);};
  let validation=null,packageData=null;
  function attach() {
    const active=document.querySelector('#nv [data-route="Settings"].on');
    const view=document.getElementById('v');
    if(!active||!view||view.querySelector('#database-transfer'))return;
    const section=document.createElement('section');section.id='database-transfer';section.className='cd';
    section.setAttribute('data-ui-user-content','');
    section.innerHTML='<h2>'+tr('Data & Backups','البيانات والنسخ الاحتياطية')+'</h2><p>'+tr('Full SQLite backup, including accounts and portal tables. Admin only. Files contain sensitive academy information.','نسخة SQLite كاملة تشمل الحسابات وجداول البوابة. للمدير فقط. الملف يحتوي على بيانات الأكاديمية الحساسة.')+'</p><p class="neg">'+tr('This preview stores data in this browser only. Import replaces its data; it does not synchronize devices.','هذه المعاينة تحفظ البيانات داخل هذا المتصفح فقط. الاستيراد يستبدل بياناته ولا يزامن الأجهزة.')+'</p><div class="bar"><button type="button" class="b" id="database-export">'+tr('Export full backup','تصدير نسخة كاملة')+'</button><label>'+tr('Choose backup (.json or .sqlite; up to 16 MiB database)','اختيار نسخة (.json أو .sqlite؛ القاعدة بحد أقصى ١٦ ميجابايت)')+'<input type="file" id="database-file" accept=".json,.sqlite,.sqlite3,.db"></label><button type="button" class="b2" id="database-validate">'+tr('Validate & preview','فحص ومعاينة')+'</button></div><p role="status" id="database-status"></p><div id="database-preview"></div><div id="database-history"></div>';
    view.append(section);
    const status=message=>{section.querySelector('#database-status').textContent=message;};
    const act=(id,fn)=>{section.querySelector(id).onclick=async()=>{try{await fn();}catch(e){status(e.message);}};};
    act('#database-export',async()=>{const result=api('/export',{});await window.__APLUS_SAVE__?.();download(result.package,result.filename);status(tr('Full backup prepared. Keep it in a private location.','تم تجهيز النسخة الكاملة. احتفظ بها في مكان خاص.'));showHistory();});
    act('#database-validate',async()=>{
      validation=null;packageData=null;const file=section.querySelector('#database-file').files[0];
      if(!file)throw Error(tr('Choose a backup first.','اختر نسخة أولًا.'));
      if(file.size>24*1024*1024)throw Error(tr('File exceeds the preview limit.','الملف يتجاوز حد المعاينة.'));
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(new TextDecoder('latin1').decode(bytes.subarray(0,15))==='SQLite format 3'){
        let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
        packageData={format:'sqlite',database:btoa(text)};
      } else packageData=JSON.parse(new TextDecoder().decode(bytes));
      validation=api('/validate',packageData);
      const v=validation,keys=Object.keys(v.incoming.counts),rows=keys.map(k=>'<tr><td>'+esc(k)+'</td><td>'+esc(v.current.counts[k]??0)+'</td><td>'+esc(v.incoming.counts[k])+'</td></tr>').join('');
      section.querySelector('#database-preview').innerHTML='<h3>'+tr('Validation preview — no active data changed','نتيجة الفحص — لم تتغير البيانات الحالية')+'</h3><p>SHA-256: <code>'+esc(v.checksum)+'</code></p><p>'+tr('Schema','الإصدار')+': '+v.sourceVersion+' → '+v.targetVersion+'</p><ul>'+v.warnings.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><div class="tw"><table><thead><tr><th>'+tr('Record','السجل')+'</th><th>'+tr('Current','الحالي')+'</th><th>'+tr('Imported','المستورد')+'</th></tr></thead><tbody>'+rows+'</tbody></table></div><details><summary>'+tr('Financial verification by original currency','التحقق المالي حسب العملة الأصلية')+'</summary><pre style="white-space:pre-wrap;max-height:300px;overflow:auto">'+esc(JSON.stringify({current:v.current.currencies,incoming:v.incoming.currencies,teacherCurrent:v.current.teachers,teacherIncoming:v.incoming.teachers},null,2))+'</pre></details>'+
        (v.needsMigration?'<label><input type="checkbox" id="database-migration"> '+tr('Approve upgrading only the staging copy','أوافق على ترقية النسخة المؤقتة فقط')+'</label>':'')+
        (v.needsAdmin?'<fieldset><legend>'+tr('Legacy backup has no active Admin — provision one','النسخة القديمة لا تحتوي على مدير نشط — أنشئ حسابًا')+'</legend><label>'+tr('Username','اسم المستخدم')+'<input id="database-admin-user" autocomplete="off"></label><label>'+tr('Display name','الاسم')+'<input id="database-admin-name"></label><label>'+tr('New password (12–200 characters)','كلمة مرور جديدة (١٢–٢٠٠ حرف)')+'<input type="password" id="database-admin-password" autocomplete="new-password"></label></fieldset>':'')+
        '<label><input type="checkbox" id="database-confirm"> '+tr('I understand this REPLACES the destination. A verified safety copy will be saved first.','أفهم أن هذا يستبدل بيانات الوجهة، وسيتم حفظ نسخة أمان متحقق منها أولًا.')+'</label><button type="button" class="b" id="database-import">'+tr('Import validated backup','استيراد النسخة المفحوصة')+'</button>';
      status(tr('Validation passed. Review counts, amounts and warnings before confirming.','نجح الفحص. راجع الأعداد والمبالغ والتنبيهات قبل التأكيد.'));
      act('#database-import',async()=>{
        if(!section.querySelector('#database-confirm').checked)throw Error(tr('Confirm replacement first.','أكد الاستبدال أولًا.'));
        const parameters={validationId:v.validationId,confirm:true,replace:'REPLACE',allowMigration:!!section.querySelector('#database-migration')?.checked,
          administrator:v.needsAdmin?{username:section.querySelector('#database-admin-user').value,display_name:section.querySelector('#database-admin-name').value,password:section.querySelector('#database-admin-password').value}:undefined};
        const button=section.querySelector('#database-import');button.disabled=true;
        status(tr('Saving verified safety backup and restoring… Keep this tab open.','جارٍ حفظ نسخة الأمان والاسترجاع… اترك الصفحة مفتوحة.'));
        try {const result=await window.__APLUS_RESTORE__(parameters);download(result.safetyPackage,result.safetyBackup.replace('.sqlite','.aplus-backup.json'));status(tr('Restored and saved. Sign in again with an imported account.','تم الاسترجاع والحفظ. سجل الدخول بحساب من النسخة المستوردة.'));section.querySelector('#database-preview').innerHTML='<a class="b" href="/">'+tr('Return to sign in','العودة لتسجيل الدخول')+'</a>';}
        finally {button.disabled=false;}
      });
    });
    function showHistory(){const data=api('');const el=section.querySelector('#database-history');el.innerHTML='<h3>'+tr('Available backups and restore history','النسخ المتاحة وسجل الاسترجاع')+'</h3>'+data.backups.map(b=>'<p>'+esc(b.name)+' <button type="button" class="b2" data-backup="'+esc(b.name)+'">'+tr('Download','تنزيل')+'</button></p>').join('')+'<pre style="white-space:pre-wrap">'+esc(JSON.stringify(data.history,null,2))+'</pre>';el.querySelectorAll('[data-backup]').forEach(button=>button.onclick=()=>{try{const r=api('/download',{name:button.dataset.backup});download(r.package,r.filename);}catch(e){status(e.message);}});}
    showHistory();
  }
  new MutationObserver(attach).observe(document.getElementById('v'),{childList:true});
  new MutationObserver(()=>{
    const section=document.getElementById('database-transfer');if(!section)return;
    const walker=document.createTreeWalker(section,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const raw=originalText.get(node)||node.nodeValue;const pair=labels.get(raw.trim());if(pair){originalText.set(node,raw);node.nodeValue=raw.replace(raw.trim(),pair[document.documentElement.lang==='ar'?'ar':'en']);}}
  }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.addEventListener('click',event=>{if(event.target.closest('[data-route="Settings"]'))setTimeout(attach,0);});
  attach();
}
module.exports={mount};
