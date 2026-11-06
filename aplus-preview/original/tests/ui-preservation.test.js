'use strict';
// Prove the redesign is additive: remove only documented presentation insertions
// and the complete generated application must equal the pre-redesign page.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const baseline=JSON.parse(read('reports/ui-ux-redesign/preservation-baseline.json'));let checks=0;
for(const [file,hash]of Object.entries(baseline)){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,file+' must remain byte-identical');checks++;}
let restored=read('public/index.html');
restored=restored.replace(read('src/client/preferences-ui.js')+'\n','').replace('UI_PREFS.pairs='+JSON.stringify(JSON.parse(read('src/client/ui-translations.json')))+';\n','');
restored=restored.replace(read('src/client/redesign.css')+'\n','').replace(read('src/client/redesign-ui.js')+'\n','');
restored=restored.replace('<div id="app"><a class="ui-skip" href="#v">Skip to content</a><nav id="nv" aria-label="Main navigation"></nav><div id="workspace"><header id="topbar"></header><main id="v" tabindex="-1"></main></div></div><div id="m"></div>','<div id="app"><nav id="nv"></nav><main id="v"></main></div><div id="m"></div>');
restored=restored.replace("$('#v').innerHTML=VW[V.nav]();UX.enhance();","$('#v').innerHTML=VW[V.nav]();").replace('UX.install();TEAM_UI.install();','TEAM_UI.install();').replace('data-required="${!!x.r}" ','');
assert.equal(restored,read('reports/ui-ux-redesign/before-index.html'),'Existing functions, financial calculations, views, fields, routes and handlers must remain identical');checks++;
const layer=read('src/client/redesign-ui.js');assert.doesNotMatch(layer,/\b(?:apiX|fetch|XMLHttpRequest|save|refreshRates)\s*\(/,'presentation layer must not call APIs or save');checks++;
assert.doesNotMatch(layer,/localStorage|sessionStorage/,'presentation must not store application data');checks++;
console.log('UI PRESERVATION TEST OK: '+checks+' checks; complete pre-redesign application recovered byte-for-byte; backend, shared ledgers and teacher summary unchanged.');
