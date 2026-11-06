'use strict';
// Only for tests that intentionally reconstruct an old schema on a fresh synthetic database.
module.exports=db=>{
 for(const {name}of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'treasury_%' OR name LIKE 'teacher_batch_%' OR name LIKE 'teacher_hours_%')").all())db.exec('DROP TRIGGER "'+name.replace(/"/g,'""')+'"');
 for(const table of ['teacher_hour_allocations','teacher_payment_batches','treasury_matches','treasury_statement_lines','treasury_statements','treasury_native_links','treasury_entries','treasury_transfers','treasury_expenses','treasury_accounts'])db.exec('DROP TABLE IF EXISTS '+table);
};
