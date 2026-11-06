'use strict';
// Shared saved-rate student account. Receipt rows are counted once; refunds reverse money held.
function studentAccount(db,id){
 const s={n:0,h:0,rev:0,cost:0};for(const l of db.l||[])if(l.s==id&&l.st==='Completed'){s.n++;s.h+=l.d;s.rev+=l.bchg;s.cost+=l.bcost}s.p=s.rev-s.cost;
 const base=(row,rate)=>row.bamt==null?(row.fxs?0:Math.round(row.amt*(rate||0))):row.bamt;
 const paidL=(db.sp||[]).filter(p=>p.p==id).reduce((q,p)=>q+p.bamt,0);let rcC=0,rcP=0,prC=0,prP=0;
 for(const en of db.re||[]){if(en.s!=id)continue;const course=(db.rc||[]).find(c=>c.id==en.rc);if(!course)continue;const receipts=(db.cp||[]).filter(p=>p.re==en.id),opening=en.paid-receipts.reduce((q,p)=>q+p.amt,0);rcC+=Math.round(en.price*course.rx);rcP+=Math.round(opening*course.rx)+receipts.reduce((q,p)=>q+base(p,course.rx),0);}
 for(const project of db.pr||[]){if(project.s!=id)continue;const receipts=(db.pp||[]).filter(p=>p.pr==project.id);if(project.status!=='Cancelled')prC+=Math.round(project.rev*project.rx);prP+=Math.round((project.paid0||0)*project.rx)+receipts.reduce((q,p)=>q+base(p,project.rx),0);}
 let reversals=0,creditUsed=0;for(const a of db.ad||[]){if(a.s!=id)continue;if(a.kind==='refund'||a.kind==='retained')reversals+=a.bamt||0;else if(a.kind==='credit-used')creditUsed+=a.bamt||0;}
 const tot=s.rev+rcC+prC,paid=paidL+rcP+prP-reversals+creditUsed;
 return{...s,tot,paid,rem:tot-paid,paidL,rcC,rcP,prC,prP};
}
module.exports={studentAccount};
