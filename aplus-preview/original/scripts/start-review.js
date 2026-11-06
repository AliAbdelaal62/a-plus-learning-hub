'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),file=path.join(root,'data','review.sqlite');
if(!fs.existsSync(file)){console.error('Review database is missing. No empty database will be created.');process.exit(13);}
require('../src/server').start({port:3005,dbFile:file,backupDir:path.join(root,'backups'),authRequired:true,scheduler:false,log:console.error}).then(s=>{
 console.log('INDEPENDENT REVIEW ONLY: '+s.url);console.log('Review database: '+s.ctx.file);
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>s.close().then(()=>process.exit(0)));
}).catch(e=>{console.error(e.code==='EADDRINUSE'?'Port 3005 is busy. No existing service was stopped.':e.message);process.exitCode=1});
