'use strict';
// Read-only receipt valuation, matching the reviewed production fix. No records are rewritten.
const before="const PPB=x=>x.bamt==null?0:x.bamt; /* a project payment's base value is the amount frozen on the payment itself, never the parent's current rate */";
const after=`// A receipt already paid in the academy base currency needs no FX conversion.
// Preserve stored valuations; parent references identify legacy currency, never its exchange rate.
const PPB=x=>{if(x.bamt!=null)return x.bamt;const p=x.pr?g(db.pr,x.pr):null,e=x.re?g(db.re,x.re):null,c=e?g(db.rc,e.rc):null,cur=x.cur||(p&&p.cur)||(c&&c.cur);return cur===B()?x.amt:0};`;
function adapt(html){if(html.split(before).length!==2)throw Error('Cash-flow receipt valuation adapter mismatch');return html.replace(before,after);}
module.exports={adapt};
