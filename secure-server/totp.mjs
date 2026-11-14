import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function secret(){let bits=0,v=0,out='';for(const b of randomBytes(20)){v=(v<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(v>>>(bits-5))&31];bits-=5;}}return out;}
function decode(s){let bits=0,v=0,out=[];for(const c of s){const n=alphabet.indexOf(c);if(n<0)throw Error('Invalid authenticator key');v=(v<<5)|n;bits+=5;if(bits>=8){out.push((v>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function code(key,counter){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const h=createHmac('sha1',decode(key)).update(b).digest(),offset=h[19]&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
export function verify(key,input,time=Date.now(),last=-1){if(!/^\d{6}$/.test(String(input||'')))return null;const step=Math.floor(time/30000);for(const c of [step,step-1,step+1]){if(c<=last||c<0)continue;if(timingSafeEqual(Buffer.from(code(key,c)),Buffer.from(input)))return c;}return null;}
