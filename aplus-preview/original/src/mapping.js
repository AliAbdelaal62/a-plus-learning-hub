'use strict';
// Single source of truth: legacy key -> table/column. Used by the importer, the state assembler and the schema test.
// type: i=integer, r=real, t=text, b=flag(1/absent), j=json array. req=required. ref=[entityKey, optional?]
const E = {
  t:  { table: 'teachers', kind: 'teacher', cols: { id:'i!', name:'t!', phone:'t', email:'t', spec:'t', cur:'t', rate:'i', status:'t!', notes:'t' } },
  s:  { table: 'students', kind: 'student', cols: { id:'i!', name:'t!', uni:'t', country:'t', major:'t', lv:'t', cur:'t', phone:'t', email:'t', status:'t!', notes:'t' } },
  sub:{ table: 'subjects', kind: 'subject', cols: { id:'i!', name:'t!', type:'t!', uni:'t', inst:'i', lv:'t', tc:'t', tr:'i', sc:'t', sr:'i' }, refs: { inst: ['t', 1] }, links: { studs: { table:'subject_students', owner:'subject_id', other:'student_id', ref:'s' } } },
  tt: { table: 'timetable_entries', kind: 'timetable', cols: { id:'i!', sched:'t!', wt:'t', date:'t', day:'t', dw:'i', a:'t', b:'t', st:'t', en:'t', t:'i', lv:'t', sub:'t', subj:'i', notes:'t', done:'b', hist:'t', rs:'b' }, refs: { t: ['t', 1], subj: ['sub', 1] }, links: { s: { table:'timetable_students', owner:'tt', other:'student_id', ref:'s' } }, special: 'ex' },
  l:  { table: 'lessons', kind: 'lesson', cols: { id:'i!', date:'t!', t:'i!', s:'i!', sub:'i!', lv:'t', d:'r!', tr:'i', sr:'i', st:'t!', tc:'t', sc:'t', trx:'r', srx:'r', bc:'t', bcost:'i!', bchg:'i!', rt:'t', oc:'i', og:'i', ts:'t', te:'t', notes:'t', tt:'i', od:'t' }, refs: { t:['t'], s:['s'], sub:['sub'], tt:['tt',1] } },
  sp: { table: 'student_payments', kind: 'student_payment', cols: { id:'i!', p:'i!', date:'t!', cur:'t', amt:'i!', rx:'r', rt:'t', bamt:'i!', bc:'t', meth:'t', notes:'t', fxs:'t' }, refs: { p:['s'] } },
  tp: { table: 'teacher_payments', kind: 'teacher_payment', cols: { id:'i!', p:'i!', date:'t!', cur:'t', amt:'i!', rx:'r', rt:'t', bamt:'i!', bc:'t', meth:'t', notes:'t', src:'t', srcd:'t', lk:'i', fxs:'t' }, refs: { p:['t'] } },
  pr: { table: 'projects', kind: 'project', cols: { id:'i!', name:'t!', sub:'t', subj:'i', uni:'t', t:'i', s:'i', lv:'t', status:'t!', cur:'t', rev:'i!', share:'r', rx:'r', rt:'t', bc:'t', start:'t', due:'t', paid0:'i', notes:'t' }, refs: { subj:['sub',1], t:['t',1], s:['s',1] } },
  pp: { table: 'project_payments', kind: 'project_payment', cols: { id:'i!', pr:'i!', date:'t', amt:'i!', meth:'t', notes:'t', cur:'t', rx:'r', bamt:'i', bc:'t', fxs:'t' }, refs: { pr:['pr'] } },
  rc: { table: 'recorded_courses', kind: 'course', cols: { id:'i!', name:'t!', sub:'t', subj:'i', uni:'t', inst:'i', lv:'t', cur:'t', rx:'r', rt:'t', bc:'t', cost:'i', price:'i!', n:'i!', share:'r', date:'t', notes:'t' }, refs: { subj:['sub',1], inst:['t',1] } },
  re: { table: 'course_enrollments', kind: 'enrollment', cols: { id:'i!', rc:'i!', s:'i!', date:'t', price:'i!', paid:'i!', paid_open:'i' }, refs: { rc:['rc'], s:['s'] } },
  cp: { table: 'course_payments', kind: 'course_payment', cols: { id:'i!', re:'i!', date:'t!', amt:'i!', cur:'t', rx:'r', bamt:'i', bc:'t', fxs:'t', meth:'t', notes:'t' }, refs: { re:['re'] } },
  al: { table: 'payment_allocations', kind: 'payment_allocation', cols: { id:'i!', sp:'i!', wt:'t!', tk:'t', tid:'i', amt:'i!', date:'t!', reason:'t' }, refs: { sp:['sp'] } },
  ad: { table: 'student_adjustments', kind: 'student_adjustment', cols: { id:'i!', s:'i!', pr:'i', kind:'t!', date:'t!', cur:'t!', amt:'i!', rx:'r', bamt:'i', bc:'t', fxs:'t', ok:'t', oid:'i', reason:'t!' }, refs: { s:['s'], pr:['pr',1] } },
  ts: { table: 'teacher_settlements', kind: 'teacher_settlement', cols: { id:'i!', tp:'i!', ok:'t!', oid:'i!', pcur:'t!', pamt:'i!', scur:'t!', samt:'i!', rx:'r!', date:'t!', prov:'t', reason:'t' }, refs: { tp:['tp'] } },
  rm: { table: 'course_reminders', kind: 'reminder', cols: { id:'i!', name:'t', rc:'i!', days:'j', time:'t', a:'t', b:'t', f:'t' }, refs: { rc:['rc'] } },
};
// import order: parents before children
const ORDER = ['t', 's', 'sub', 'tt', 'l', 'sp', 'tp', 'pr', 'pp', 'rc', 're', 'cp', 'rm', 'al', 'ad', 'ts'];
// record types added by migration 003: older exports do not have these lists, so a missing list means "none" rather than an error
const NEWKEYS = ['cp', 'al', 'ad', 'ts'];
const OPT_FIELDS_NULL_IF_FALSY = { tt:['t','subj'], sub:['inst'], pr:['subj','t','s'], rc:['subj','inst'], l:['tt'], al:['tid'], ad:['pr'] };
// closed value lists (mirrors the CHECK constraints in 001_init.sql)
const ENUMS = { t:{status:['Active','Inactive']}, s:{status:['Active','Inactive']}, sub:{type:['Live','Recorded','Project']}, tt:{sched:['one','rec'],wt:['Live','Project','Recorded']},
  l:{st:['Completed','Cancelled','Rescheduled','No Show']}, pr:{status:['Not Started','In Progress','Completed','Cancelled']},
  al:{wt:['Live','Recorded','Project','Other'],tk:['lesson','enrollment','project']}, ad:{kind:['refund','credit','credit-used','retained']}, ts:{ok:['lesson','course','project'],prov:['new','correction']} };
// L7: short structured fields (dates, times, currency codes, levels, methods...) are rendered in many places, so they must never carry markup.
// A row whose structured field does not have the expected shape is quarantined on import and refused on save; free text (names, notes) is allowed but is always escaped when displayed.
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{1,2}:\d{2}$/, CODE = /^[A-Za-z]{3}$/, SHORT = /^[^<>"'`\u0000-\u001f]{0,80}$/;
const STRUCT = {
  t: { cur: CODE }, s: { cur: CODE, lv: SHORT }, sub: { lv: SHORT, tc: CODE, sc: CODE },
  tt: { date: DATE, a: DATE, b: DATE, st: TIME, en: TIME, lv: SHORT, day: SHORT },
  l: { date: DATE, lv: SHORT, tc: CODE, sc: CODE, bc: CODE, rt: SHORT, ts: TIME, te: TIME, od: DATE },
  sp: { date: DATE, cur: CODE, bc: CODE, rt: SHORT, meth: SHORT, fxs: SHORT }, tp: { date: DATE, cur: CODE, bc: CODE, rt: SHORT, meth: SHORT, src: SHORT, fxs: SHORT },
  pr: { lv: SHORT, cur: CODE, bc: CODE, rt: SHORT, start: DATE, due: DATE }, pp: { date: DATE, meth: SHORT, cur: CODE, bc: CODE, fxs: SHORT },
  rc: { lv: SHORT, cur: CODE, bc: CODE, rt: SHORT, date: DATE }, re: { date: DATE }, cp: { date: DATE, cur: CODE, bc: CODE, meth: SHORT, fxs: SHORT }, al: { date: DATE }, ad: { date: DATE, cur: CODE, bc: CODE, ok: SHORT, fxs: SHORT }, ts: { date: DATE, pcur: CODE, scur: CODE, ok: SHORT, prov: SHORT }, rm: { time: TIME, a: DATE, b: DATE, f: SHORT },
};
const structProblem = (k, row) => { for (const [f, rx] of Object.entries(STRUCT[k] || {})) { const v = row[f]; if (typeof v === 'string' && v !== '' && !rx.test(v)) return `field "${f}" has an unexpected format (${JSON.stringify(v).slice(0, 40)})`; } return null; };
const colName = (k) => k;
const SETTINGS_KEYS = ['name', 'tr', 'sr', 'base', 'recog', 'rfh']; // rfh = exchange-rate freshness window in hours (display status only; never rewrites a saved rate)
module.exports = { NEWKEYS, STRUCT, structProblem, ENUMS, E, ORDER, SETTINGS_KEYS, OPT_FIELDS_NULL_IF_FALSY, colName };
