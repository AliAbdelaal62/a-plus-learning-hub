// Loads an app build into Node with a stubbed DOM and an in-memory localStorage. Nothing real is touched.
const fs=require('fs'),crypto=require('crypto');
const FIXED='2026-10-26T12:00:00.000Z';
function mkStore(init){const m=new Map(Object.entries(init||{}));const st={m,writes:[],
 getItem:k=>m.has(k)?m.get(k):null,setItem(k,v){st.writes.push(k);m.set(k,String(v))},removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size}};return st}
function script(htmlPath){const h=fs.readFileSync(htmlPath,'utf8');const a=h.indexOf('\n<script>');const i=a<0?h.indexOf('<script>',h.indexOf('xlsx')):a+1;const s=h.slice(h.indexOf('>',i)+1,h.indexOf('</script>',i));return s}
function boot(htmlPath,store,tail){const els={};const el=k=>els[k]||(els[k]={innerHTML:'',value:'',style:{},textContent:'',dataset:{},selectedOptions:[],insertAdjacentHTML(){},addEventListener(){},dispatchEvent(){},focus(){},click(){},remove(){},setSelectionRange(){},appendChild(){}});
 const RealDate=Date;global.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[FIXED]))}static now(){return +new RealDate(FIXED)}};
 global.localStorage=store;global.document={querySelector:k=>el(k),querySelectorAll:()=>[],activeElement:null,documentElement:{},createElement:()=>el('x'+Math.random()),body:{appendChild(){}}};
 global.getComputedStyle=()=>({getPropertyValue:()=>''});global.Chart=function(){this.destroy=()=>{}};Chart.defaults={};global.XLSX={};global.fetch=()=>new Promise(()=>{});
 global.Blob=function(p){this.p=p};global.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};global.location={reload(){}};
 try{return eval(script(htmlPath)+tail)}finally{global.Date=RealDate}}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
module.exports={mkStore,boot,sha,script};
