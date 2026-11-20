/* A new cross-currency teacher payment and its explicitly confirmed settlement save in one transaction.
   Existing payments/settlements are not edited, and server ownership/limits/duplicate checks remain authoritative. */
function teacherPaymentPlan(st,o,confirmed){
 const amt=m(o.amt),rx=o.cur==B()?1:Number(o.rx),src=o.src,tid=+o.p,link=+o.lk||0;
 if(!Number.isSafeInteger(amt)||amt<=0)return 'Enter a payment amount above zero.';
 if(!(rx>0&&Number.isFinite(rx)))return RX;
 if(!['Live','Recorded','Project','Other'].includes(src))return 'Choose Payment Source.';
 if(src==='Other'&&String(o.srcd||'').trim().length<3)return 'Enter an Other source description.';
 const payment={p:tid,date:o.date,cur:o.cur,amt,rx,rt:rty(o.cur,rx,0),bamt:k_(amt,rx),bc:B(),meth:o.meth,notes:o.notes||'',src,srcd:src==='Other'?o.srcd:'',lk:link};
 if(!link)return {payment,settlement:null};
 const ok={Live:'lesson',Recorded:'course',Project:'project'}[src],ob=ok&&LEDGER.obligation(st,ok,link);
 if(!ob||ob.t!==tid)return 'Choose a service belonging to this teacher and payment source.';
 if(ob.cur===o.cur)return {payment,settlement:null};
 const rate=Number(o.settleRx);
 if(!(rate>0&&Number.isFinite(rate)))return 'Enter the settlement rate: '+ob.cur+' per 1 '+o.cur+'. No exchange rate will be guessed.';
 const settled=Math.round(amt*rate);if(!Number.isSafeInteger(settled)||settled<=0)return 'Settlement amount must be above zero.';
 const used=(st.ts||[]).filter(s=>s.ok===ok&&s.oid===link).reduce((a,s)=>a+s.samt,0),direct=st.tp.filter(p=>p.p===tid&&p.src===src&&p.lk===link&&p.cur===ob.cur).reduce((a,p)=>a+p.amt,0);
 const row=LEDGER.teacherRows(st,{only:tid}).find(r=>r.cur===ob.cur),category=row?row.remaining[src]:0,left=Math.max(0,Math.min(ob.total-used-direct,category));
 if(settled>left)return 'Settlement exceeds the remaining '+(left/1000).toFixed(3)+' '+ob.cur+'. Reduce the amount; record any intended advance separately.';
 if(!confirmed)return 'Confirm saving ONE payment and ONE cross-currency settlement together.';
 payment.lk=0;
 return {payment,settlement:{ok,oid:link,pcur:o.cur,pamt:amt,scur:ob.cur,samt:settled,rx:rate,date:o.date,prov:'new',reason:'Explicitly confirmed with new '+src+' payment; service #'+link+'; no second cash payment.'}};
}
function installTeacherPaymentFlow(){const previous=edP;edP=function(k,id,pre){
 if(k!=='tp'||id)return previous(k,id,pre);
 if(!db.t.length)return note('Add a teacher first.');
 const teacher=g(db.t,pre||db.t[0].id);
 form('Add Teacher Payment',[{k:'p',l:'Teacher',t:'sel',o:tOL()},...SRCF,{k:'date',l:'Payment Date',t:'date',r:1},{k:'cur',l:'Currency',t:'sel',o:curO()},{k:'amt',l:'Amount',t:'number',r:1},{k:'rx',l:'Currency → '+B()+' rate',t:'number'},{k:'settleRx',l:'Settlement rate — service currency per 1 payment currency (different currencies only)',t:'number',w:1},{k:'meth',l:'Method',t:'sel',o:['Cash','Bank Transfer','KNET','Cheque','Other'].map(x=>[x,x])},{k:'notes',l:'Notes',w:1}],{p:teacher.id,cur:teacher.cur,rx:rfor(teacher.cur),date:today(),meth:'Cash'},o=>{
  const plan=teacherPaymentPlan(db,o,!!document.getElementById('teacher-payment-settlement-confirm')?.checked);if(typeof plan==='string')return plan;
  return atomic(()=>{const p={id:db.id++,...plan.payment};db.tp.push(p);if(plan.settlement)db.ts.push({id:db.id++,tp:p.id,...plan.settlement});});
 },o=>{const ok={Live:'lesson',Recorded:'course',Project:'project'}[o.src],ob=o.lk&&ok?LEDGER.obligation(db,ok,+o.lk):null,cross=!!(ob&&ob.cur!==o.cur),rate=Number(o.settleRx),amt=m(o.amt),rx=o.cur==B()?1:Number(o.rx),box=document.getElementById('teacher-payment-settlement-box');if(box)box.hidden=!cross;const rateField=document.getElementById('f_settleRx');if(rateField)rateField.closest('label').style.display=cross?'':'none';
  return (rx>0?fm(amt,o.cur)+' = <b>'+f(k_(amt,rx))+'</b>':'Enter the payment exchange rate.')+(cross?'<p><b>تسوية بين عملتين / Cross-currency settlement:</b> '+E(o.cur)+' → '+E(ob.cur)+'. '+(rate>0?fm(amt,o.cur)+' settles <b>'+fm(Math.round(amt*rate),ob.cur)+'</b>.':'Enter the settlement rate below.')+'<br>سيُحفظ سجل دفع واحد وتسوية واحدة معًا، بدون خصم أو دفع مكرر. One payment and one settlement; no second cash movement.</p>':'');});
 $('#pv').insertAdjacentHTML('afterend','<label id="teacher-payment-settlement-box" hidden><input id="teacher-payment-settlement-confirm" type="checkbox"> أوافق على حفظ دفعة واحدة وتسويتها بالقيمة المعروضة / Confirm one payment and the displayed settlement.</label>');
 sync('cur','rx');tog('src');refreshLk();
 const update=()=>{const ok={Live:'lesson',Recorded:'course',Project:'project'}[$('#f_src').value],ob=ok?LEDGER.obligation(db,ok,+$('#f_lk').value):null;document.getElementById('teacher-payment-settlement-confirm').checked=false;$('#f_settleRx').value=ob&&ob.cur===B()&&$('#f_cur').value!==B()?$('#f_rx').value:'';fire();};
 $('#f_p').addEventListener('change',()=>{const t=g(db.t,+$('#f_p').value);if(t){$('#f_cur').value=t.cur;$('#f_rx').value=rfor(t.cur);}refreshLk();update();});
 $('#f_src').addEventListener('change',()=>{refreshLk();update();});
 for(const key of ['lk','cur','rx'])$('#f_'+key).addEventListener('change',update);
 for(const key of ['amt','settleRx','date'])$('#f_'+key).addEventListener('input',()=>{document.getElementById('teacher-payment-settlement-confirm').checked=false;});
 document.getElementById('teacher-payment-settlement-confirm').addEventListener('input',event=>event.stopPropagation());
 fire();
 };}
