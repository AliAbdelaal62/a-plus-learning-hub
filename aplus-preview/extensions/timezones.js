'use strict';
const ACADEMY='Africa/Cairo';
const ZONES=[{id:'Africa/Cairo',en:'Egypt — Cairo',ar:'مصر — القاهرة'},{id:'Asia/Kuwait',en:'Kuwait',ar:'الكويت'},{id:'Europe/London',en:'United Kingdom — London',ar:'بريطانيا — لندن'}];
const formatters=new Map();
const fail=message=>{throw Object.assign(Error(message),{code:422});};
const valid=zone=>ZONES.some(z=>z.id===zone);
function parts(ms,zone){
 if(!valid(zone))fail('Choose Egypt, Kuwait or the United Kingdom.');
 if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
 const p=Object.fromEntries(formatters.get(zone).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,time:p.hour+':'+p.minute};
}
function wall(date,time,zone){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))fail('Choose a valid date and time.');
 const base=Date.parse(date+'T'+time+':00Z');if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,10)!==date)fail('Choose a valid date and time.');
 const offsets=new Set();
 for(let hours=-36;hours<=36;hours+=6){const sample=base+hours*3600000,p=parts(sample,zone);offsets.add(Date.parse(p.date+'T'+p.time+':00Z')-sample);}
 const candidates=[...offsets].map(offset=>base-offset).filter(ms=>{const p=parts(ms,zone);return p.date===date&&p.time===time;});
 if(!candidates.length)fail('This local time does not exist because of a daylight-saving change. Choose another time.');
 if(candidates.length>1)fail('This local time occurs twice because of a daylight-saving change. Choose another time.');
 return candidates[0];
}
function convert(date,time,from,to){return parts(wall(date,time,from),to);}
function display(row,zone){
 try{const start=convert(row.date,row.startsAt,ACADEMY,zone),end=convert(row.date,row.endsAt,ACADEMY,zone);return {...row,displayDate:start.date,displayStart:start.time,displayEndDate:end.date,displayEnd:end.time,displayTimezone:zone};}
 catch(error){return {...row,displayDate:null,displayStart:null,displayEndDate:null,displayEnd:null,displayTimezone:zone,timeIssue:error.message};}
}
function proposal(input,zone){
 if(!valid(zone))fail('Choose Egypt, Kuwait or the United Kingdom.');
 const start=wall(input.date,input.starts_at,zone),end=wall(input.end_date||input.date,input.ends_at,zone);
 if(end<=start)fail('The requested end must follow the requested start.');
 const a=parts(start,ACADEMY),b=parts(end,ACADEMY);
 if(a.date!==b.date||b.time<=a.time)fail('The requested lesson must fit within one academy day.');
 return {date:a.date,starts_at:a.time,ends_at:b.time};
}
function preference(db,id){const row=db.prepare('SELECT timezone FROM preview_student_preferences WHERE student_id=?').get(id);return row&&valid(row.timezone)?row.timezone:ACADEMY;}
module.exports={ACADEMY,ZONES,valid,parts,wall,convert,display,proposal,preference};
