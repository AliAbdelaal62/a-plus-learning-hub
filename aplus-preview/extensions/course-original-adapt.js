 'use strict';
function adapt(html){
 const replace=(a,b)=>{if(html.split(a).length!==2)throw Error('Course settlement UI adapter mismatch: '+a);html=html.replace(a,b);};
 replace('const rev=Math.round(c.price*c.n),','const rev=Math.round(c.price*c.n)-(c.withdrawalReduction||0),');
 replace("a.ok === 'cp' ? g(db.cp, a.oid) : null", "a.ok === 'cp' ? g(db.cp, a.oid) : a.ok === 're' ? (()=>{const e=g(db.re,a.oid);return e?{amt:e.paid-arr(db,'cp').filter(p=>p.re===e.id).reduce((s,p)=>s+p.amt,0)}:null})() : null");
 replace("add(r.charged, 'Recorded', e.price);", "add(r.charged, 'Recorded', E&&e.withdrawalClosedOn&&E<e.withdrawalClosedOn?e.withdrawalOriginalPrice:e.price);");
 replace('function vRCD(){return vRCD0()+courseLedgerPanel(V.rcid)}', "function vRCD(){return vRCD0()+courseLedgerPanel(V.rcid)}\nwindow.__APLUS_REFRESH_COURSE__=function(id){const current=apiX('GET','/api/state');db=current.state;REV=current.rev;LASTGOOD=JSON.stringify(db);SAVEBAD='';V.nav='Recorded Courses';V.rcid=id;render();};");
 replace('collected: paid, opening:', 'collected: en.reduce((q,e)=>q+(e.withdrawalClosedOn?e.withdrawalNetPaid:e.paid||0),0), grossCollected:paid, refunded:en.reduce((q,e)=>q+(e.withdrawalRefund||0),0), opening:');
 html=html.split('fm(e.paid,c.cur),fm(e.price-e.paid,c.cur)').join('fm(e.withdrawalClosedOn?e.withdrawalNetPaid:e.paid,c.cur),fm(e.price-(e.withdrawalClosedOn?e.withdrawalNetPaid:e.paid),c.cur)');
 replace('function edCP(reid){const e=g(db.re,reid),c=g(db.rc,e.rc);', "function edCP(reid){const e=g(db.re,reid),c=g(db.rc,e.rc);if(e.withdrawalClosedOn)return note('This enrollment is withdrawn and settled.');");
 replace("const pst=e=>e.paid>=e.price", "const pst=e=>e.withdrawalClosedOn?(document.documentElement.lang==='ar'?'منسحب':'Withdrawn'):e.paid>=e.price");
 return html;
}
module.exports={adapt};
