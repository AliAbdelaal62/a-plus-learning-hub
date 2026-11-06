// Builds dev/index.html from the read-only production reference. Reproducible; never writes outside dev/.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let h=fs.readFileSync(path.join(root,'production-reference/aplus-hub-academy-v8.html'),'utf8');
const n0=(h.match(/aplus/g)||[]).length;
// 1. every storage key / backup-format name gets the DEV prefix (aplus -> aplusDEV)
h=h.replace(/aplus/g,'aplusDEV');
// 2. visible identity
h=h.replace(/<title>[^<]*<\/title>/,'<title>DEV — A+ Hub (synthetic data only)</title>');
h=h.replace('</style></head><body>','#devbar{position:sticky;top:0;z-index:99999;background:#b00020;color:#fff;font:700 13px system-ui;text-align:center;padding:6px}</style></head><body><div id="devbar">DEVELOPMENT — synthetic data only — not the live system</div>');
h=h.replace("set:{name:'A+ Hub Academy'","set:{name:'DEV A+ Hub (synthetic)'");
fs.writeFileSync(path.join(root,'dev/index.html'),h);
console.log('replaced',n0,'occurrences of aplus; wrote dev/index.html',h.length,'bytes');
