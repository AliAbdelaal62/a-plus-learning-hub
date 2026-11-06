'use strict';
// Synthetic schema-5 source, matching the old local database format. Never reads user data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
module.exports=function(){
 const root=path.resolve(__dirname,'../original'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'aplus-transfer-')),
 full=path.join(dir,'full.sqlite'),legacy=path.join(dir,'legacy.sqlite');
 require(path.join(root,'src/importer')).migrate(fs.readFileSync(path.join(root,'fixtures/synthetic-v5.json'),'utf8'),{mode:'apply',target:full});
 const d=new DatabaseSync(legacy);d.exec('PRAGMA foreign_keys=OFF; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)');
 for(const file of fs.readdirSync(path.join(root,'db/migrations')).sort().filter(f=>parseInt(f)<=5)){
  d.exec(fs.readFileSync(path.join(root,'db/migrations',file),'utf8'));
  d.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(parseInt(file),file,new Date().toISOString());
 }
 d.exec("ATTACH DATABASE '"+full.replace(/'/g,"''")+"' AS source");
 for(const {name}of d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'").all()){
  const cols=d.prepare('SELECT name FROM pragma_table_info(?)').all(name).map(r=>'"'+r.name+'"').join(',');
  d.exec('INSERT INTO "'+name+'"('+cols+') SELECT '+cols+' FROM source."'+name+'"');
 }
 d.exec('DETACH DATABASE source; PRAGMA foreign_keys=ON');d.close();
 return {bytes:fs.readFileSync(legacy),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
};
