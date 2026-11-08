'use strict';
// Presentation only: move existing links, preserving their original handlers and permissions.
const sections=[
 {key:'workspace',en:'Workspace',ar:'مساحة العمل',routes:['Dashboard','Daily Desk'],pages:['overview','notifications']},
 {key:'schedule',en:'Scheduling',ar:'المواعيد والجدولة',routes:['Timetable','Scheduling','My Schedule'],pages:['schedule','requests']},
 {key:'academy',en:'Academy',ar:'الأكاديمية',routes:['Students','Teachers','Subjects','Lessons','Recorded Courses','Projects','My Subjects','My Projects','Delivery'],pages:['subjects','lessons','courses','projects','education','withdrawals']},
 {key:'finance',en:'Finance',ar:'المالية',routes:['Payments','Batch Payments','Treasury','Reports','Cash Flow','Billing','Financial Summary'],pages:['student-statement','teacher-statement','plans']},
 {key:'operations',en:'Operations',ar:'التشغيل والمتابعة',routes:['Registrations','Attendance & Notes','Follow-up Tasks'],pages:[]},
 {key:'administration',en:'Administration',ar:'الإدارة',routes:['Teacher Preview','Team','Settings'],pages:['accounts','audit']},
];
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',calendar:'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',book:'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1z M12 5v15',file:'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7',bell:'M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3z M10 21h4',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3',check:'M4 4h16v16H4z M8 12l3 3 5-6'};
const icons={overview:'grid',notifications:'bell',schedule:'calendar',requests:'check',subjects:'book',lessons:'book',courses:'book',projects:'file',education:'book','student-statement':'file','teacher-statement':'file',plans:'calendar',accounts:'users',audit:'file',withdrawals:'book'};
const icon=key=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[icons[key]||'file']+'"/></svg>';
function integrate(scroll,pages,{lang='en',active=null}={}){
 if(!scroll)return;
 const signature=JSON.stringify([lang,active,pages.map(p=>p[0])]);
 if(scroll.dataset.portalNavigation===signature)return;
 const native=[...scroll.querySelectorAll('a[data-route]')],existing=new Map([...scroll.querySelectorAll('a[data-extension]')].map(a=>[a.dataset.extension,a]));
 const extensions=pages.map(([key,en,ar])=>{
  const a=existing.get(key)||document.createElement('a');a.href='#preview-'+key;a.dataset.extension=key;a.title=lang==='ar'?ar:en;a.setAttribute('aria-label',a.title);
  a.innerHTML=icon(key)+'<span class="ui-nav-text">'+(lang==='ar'?ar:en)+'</span>';a.classList.toggle('on',key===active);if(key===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');return a;
 });
 const known=new Set();scroll.replaceChildren();
 for(const section of sections){
  const links=[...native.filter(a=>section.routes.includes(a.dataset.route)),...extensions.filter(a=>section.pages.includes(a.dataset.extension))];
  if(!links.length)continue;
  const group=document.createElement('div');group.className='ui-nav-group';group.dataset.navSection=section.key;
  const label=document.createElement('div');label.className='ui-nav-label';label.textContent=lang==='ar'?section.ar:section.en;group.append(label);
  for(const a of links){if(active&&a.dataset.route){a.classList.remove('on');a.removeAttribute('aria-current');}group.append(a);known.add(a);}
  scroll.append(group);
 }
 // Keep future native routes reachable even before this presentation map knows them.
 const unknown=[...native,...extensions].filter(a=>!known.has(a));if(unknown.length){const group=document.createElement('div');group.className='ui-nav-group';group.dataset.navSection='other';for(const a of unknown)group.append(a);scroll.append(group);}
 scroll.dataset.portalNavigation=signature;
}
function groupFor(page){return sections.find(s=>s.pages.includes(page));}
module.exports={integrate,groupFor,icon};
