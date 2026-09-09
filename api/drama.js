import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';

const TOKEN_A=(process.env.DRAMA_TOKEN_A||'4F5A9C3D9A86FA54EACEDDD635185').trim();
const TOKEN_B=(process.env.DRAMA_TOKEN_B||'d506abfd-9fe2-4b71-b979-feff21bcad13').trim();
const APP_SIGNATURE=(process.env.DRAMA_APP_SIGNATURE||'eLXLul9MmbuG2DF3kKDY8aygdeVgUAalDrznu4kRfP8=').trim();
const DEFAULT_VALIDATION_URL='https://test.arabypros.com/api/validate.php';
const FIREBASE={projectId:'alamaldrama2022v2',projectNumber:'462519862201',appId:'1:462519862201:android:e2b2f8fc6e55730e846c68',apiKey:'AIzaSyDgICP_l7w5uHw1C-HGzj0o4ehFCp7BwYc',packageName:'com.alam.aldrama3'};
const TTL=10*60*1000;
let cfg={validationUrl:'',base:'',at:0,error:'',trace:[]};
let goodBase={base:'',at:0};

const cleanUrl=v=>{try{const s=String(v||'').trim();if(!/^https?:\/\//i.test(s))return '';return new URL(s).href}catch{return ''}};
const cleanBase=v=>{const s=cleanUrl(v);return s?(s.endsWith('/')?s:s+'/'):''};
const num=(v,d=1)=>{const x=parseInt(String(v??''),10);return Number.isFinite(x)?x:d};
const enc=(v,d='')=>encodeURIComponent(String(v==null?d:v));
const auth=()=>`${TOKEN_A}/${TOKEN_B}/`;

function endpoint(action,q){
 const p=Math.max(1,num(q.page,1)),a=auth();
 switch(action){
  case 'home':return `first/${a}`;
  case 'search':return `search/${enc(q.query)}/${p}/${a}`;
  case 'movies':return `movie/by/filtres/${enc(q.genre,0)}/${enc(q.order,'created')}/${p}/${a}`;
  case 'series':return `serie/by/filtres/${enc(q.genre,0)}/${enc(q.order,'created')}/${p}/${a}`;
  case 'posters':return `poster/by/filtres/${enc(q.genre,0)}/${enc(q.order,'created')}/${p}/${a}`;
  case 'posters-year':return `poster/by/year/${enc(q.year)}/${enc(q.type,0)}/${p}/${a}`;
  case 'years':return `years/all/${a}`;
  case 'genres':return `genre/all/${a}`;
  case 'categories':return `category/all/${a}`;
  case 'countries':return `country/all/${a}`;
  case 'actors':return `actor/all/${p}/${enc(q.search,'')}/${a}`;
  case 'actor-posters':return `movie/by/actor/${enc(q.id)}/${a}`;
  case 'channels':return `channel/by/filtres/${enc(q.category,0)}/${enc(q.country,0)}/${p}/${a}`;
  case 'poster':return `movie/by/${enc(q.id)}/${a}`;
  case 'channel':return `channel/by/${enc(q.id)}/${a}`;
  case 'cast':return `role/by/poster/${enc(q.id)}/${a}`;
  case 'seasons':return `season/by/serie/${enc(q.id)}/${a}`;
  case 'movie-sources':return `movie/source/by/${enc(q.id)}/${a}`;
  case 'episode-sources':return `episode/source/by/${enc(q.id)}/${a}`;
  case 'movie-subs':return `subtitles/by/movie/${enc(q.id)}/${a}`;
  case 'episode-subs':return `subtitles/by/episode/${enc(q.id)}/${a}`;
  case 'random-movies':return `movie/random/${enc(q.genres,0)}/${a}`;
  case 'random-channels':return `channel/random/${enc(q.categories,0)}/${a}`;
  default:return null;
 }
}

const json=v=>{try{return JSON.parse(v)}catch{return undefined}};
function b64(v){try{const s=String(v||'').trim().replace(/-/g,'+').replace(/_/g,'/').replace(/\s/g,'');if(s.length<4)return null;const out=Buffer.from(s,'base64').toString('utf8');return !out||out.includes('\uFFFD')?null:out}catch{return null}}
function decodePayload(text){
 const raw=String(text??'').trim();if(!raw)return null;
 const p=json(raw);if(p!==undefined){if(typeof p==='string'){const n=json(p);if(n!==undefined)return n;const d=b64(p);if(d!==null){const j=json(d);return j===undefined?d:j}}return p}
 const d=b64(raw.replace(/^"|"$/g,''));if(d!==null){const j=json(d);return j===undefined?d:j}return raw;
}
function decodeRobust(v){let s=String(v||'').trim();const d=b64(s);if(d)s=d.trim();if(s.startsWith('cipher_key_'))s=s.slice(11);return cleanUrl(s)}
async function f(url,opt={},ms=15000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opt,signal:c.signal})}finally{clearTimeout(t)}}
function fid(){const b=crypto.randomBytes(17);b[0]=(b[0]&15)|112;return b.toString('base64url').slice(0,22)}

async function remoteValidationUrl(){
 const trace=[];
 try{
  const u=`https://firebaseremoteconfig.googleapis.com/v1/projects/${FIREBASE.projectId}/namespaces/firebase:fetch?key=${encodeURIComponent(FIREBASE.apiKey)}`;
  const r=await f(u,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({appId:FIREBASE.appId,appInstanceId:'PROD',appVersion:'4.2f',appBuild:'42',packageName:FIREBASE.packageName,languageCode:'ar',countryCode:'YE',platformVersion:'15',sdkVersion:'22.1.2'})},12000);
  const text=await r.text();trace.push(`rc_public_${r.status}`);
  if(r.ok){const x=json(text);const u2=decodeRobust(x?.entries?.Robust_small);if(u2)return {url:u2,trace}}
 }catch(e){trace.push(`rc_public_${e?.name==='AbortError'?'timeout':'error'}`)}
 try{
  const id=fid();
  const ir=await f(`https://firebaseinstallations.googleapis.com/v1/projects/${FIREBASE.projectId}/installations`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':FIREBASE.apiKey},body:JSON.stringify({fid:id,authVersion:'FIS_v2',appId:FIREBASE.appId,sdkVersion:'a:17.2.0'})},12000);
  trace.push(`fis_${ir.status}`);if(!ir.ok)throw new Error('fis');
  const inst=await ir.json(),tok=inst.authToken?.token;if(!tok)throw new Error('no_token');
  const rr=await f(`https://firebaseremoteconfig.googleapis.com/v1/projects/${FIREBASE.projectNumber}/namespaces/firebase:fetch?key=${encodeURIComponent(FIREBASE.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':FIREBASE.apiKey,'X-Goog-Firebase-Installations-Auth':tok},body:JSON.stringify({appId:FIREBASE.appId,appInstanceId:inst.fid||id,appInstanceIdToken:tok,appVersion:'4.2f',appBuild:'42',packageName:FIREBASE.packageName,countryCode:'YE',languageCode:'ar',platformVersion:'15',timeZone:'Asia/Aden',sdkVersion:'22.1.2',analyticsUserProperties:{}})},12000);
  const text=await rr.text();trace.push(`rc_fis_${rr.status}`);
  if(rr.ok){const x=json(text);const u2=decodeRobust(x?.entries?.Robust_small);if(u2)return {url:u2,trace}}
 }catch(e){trace.push(`rc_fis_${e?.name==='AbortError'?'timeout':'error'}`)}
 return {url:DEFAULT_VALIDATION_URL,trace};
}

function identity(){
 const androidId=crypto.createHash('sha256').update('com.alam.aldrama3|dramaworld-web').digest('hex').slice(0,16);
 const salt=crypto.createHash('sha256').update('dramaworld-web-pbkdf2-salt-v1').digest().subarray(0,16);
 const key=crypto.pbkdf2Sync(androidId,salt,10000,32,'sha256');
 return {androidId,salt,key};
}
function encryptedSignature(id){
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',id.key,iv);
 const ct=Buffer.concat([c.update(Buffer.from(`${Date.now()}|${APP_SIGNATURE}`,'utf8')),c.final()]);
 return Buffer.concat([iv,ct,c.getAuthTag()]);
}
function decryptConfig(v,key){
 const raw=Buffer.from(String(v||'').trim(),'base64');if(raw.length<29)throw new Error('config_short');
 const iv=raw.subarray(0,12),tag=raw.subarray(raw.length-16),ct=raw.subarray(12,raw.length-16);
 const d=crypto.createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);
 const x=json(Buffer.concat([d.update(ct),d.final()]).toString('utf8'));if(!x||typeof x!=='object')throw new Error('config_json');return x;
}
function configFromResponse(x,key){
 if(!x||typeof x!=='object')return null;
 for(const v of [x.encrypted_config_v2,x.encryptedConfigV2,x.data?.encrypted_config_v2]) if(typeof v==='string'&&v.trim()){try{return decryptConfig(v,key)}catch{}}
 if(typeof x.base_api_url==='string')return x;
 if(x.data&&typeof x.data==='object'&&typeof x.data.base_api_url==='string')return x.data;
 return null;
}
async function validate(force=false){
 if(!force&&cfg.base&&Date.now()-cfg.at<TTL)return cfg.base;
 const env=cleanBase(process.env.DRAMA_API_BASE_URL);if(env){cfg={validationUrl:'env',base:env,at:Date.now(),error:'',trace:['env']};return env}
 const rv=await remoteValidationUrl();
 const candidates=[rv.url,DEFAULT_VALIDATION_URL].map(cleanUrl).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);
 const id=identity();let last='validation_failed',trace=[...rv.trace];
 for(const validationUrl of candidates){
  try{
   const body=JSON.stringify({data:encryptedSignature(id).toString('base64'),android_id:id.androidId,salt:id.salt.toString('base64')});
   const r=await f(validationUrl,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8','Accept':'application/json','User-Agent':'Aldrama3App/1.0','X-Request-ID':crypto.randomUUID()},body},16000);
   const text=await r.text();trace.push(`validate_${new URL(validationUrl).host}_${r.status}`);const x=json(text);
   if(!r.ok){last=String(x?.message||x?.error||x?.error_type||`validation_${r.status}`);continue}
   const conf=configFromResponse(x,id.key);const base=cleanBase(conf?.base_api_url);
   if(base){cfg={validationUrl,base,at:Date.now(),error:'',trace};return base}
   last=String(x?.message||x?.error_message||x?.error||'validation_config_missing');
  }catch(e){last=String(e?.message||e);trace.push(`validate_error_${e?.name==='AbortError'?'timeout':'exception'}`)}
 }
 cfg={validationUrl:candidates[0]||'',base:'',at:Date.now(),error:last,trace};return '';
}

async function upstream(action,q){
 const path=endpoint(action,q);if(!path)throw Object.assign(new Error('unknown_action'),{status:400});
 let base=await validate(false);if(!base)base=await validate(true);
 const bases=[base,(goodBase.base&&Date.now()-goodBase.at<TTL)?goodBase.base:''].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);
 let last=cfg.error||'backend_unavailable';
 const profiles=[
  {'Accept':'application/json, text/plain, */*','User-Agent':'okhttp/4.9.2','Accept-Encoding':'gzip','Connection':'Keep-Alive'},
  {'Accept':'application/json, text/plain, */*','User-Agent':'Aldrama3App/1.0','Accept-Language':'ar','X-Request-ID':crypto.randomUUID()},
  {'Accept':'*/*','User-Agent':'Mozilla/5.0 (Linux; Android 15; SM-G998U1) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36','X-Requested-With':FIREBASE.packageName}
 ];
 for(const b of bases){
  const url=new URL(path,b);
  for(const headers of profiles){
   try{
    const r=await f(url,{headers,redirect:'follow'},16000),text=await r.text(),data=decodePayload(text);
    if(r.ok){goodBase={base:b,at:Date.now()};return {data,status:r.status,base:b}}
    last=`upstream_${r.status}`;cfg.trace=[...(cfg.trace||[]),`api_${r.status}`].slice(-12);
    if(![401,403,404,406,429].includes(r.status))return {data,status:r.status,base:b};
   }catch(e){last=e?.name==='AbortError'?'timeout':String(e?.message||e)}
  }
 }
 throw Object.assign(new Error(last),{status:502});
}

function privateIp(ip){if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)}if(net.isIP(ip)===6)return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');return true}
async function publicUrl(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('unsupported_protocol');const ips=await dns.lookup(u.hostname,{all:true});if(!ips.length||ips.some(x=>privateIp(x.address)))throw new Error('private_target');return u}

export default async function handler(req,res){
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Range');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const action=String(req.query.action||'home');
 if(action==='health'){
  const base=await validate(Boolean(req.query.refresh));
  return res.status(200).json({ok:Boolean(base),configured:Boolean(TOKEN_A&&TOKEN_B),validationHost:cfg.validationUrl&&cfg.validationUrl!=='env'?new URL(cfg.validationUrl).host:cfg.validationUrl,baseHost:base?new URL(base).host:null,error:base?'':cfg.error,trace:cfg.trace||[]});
 }
 if(action==='inspect-source'){
  try{const u=await publicUrl(String(req.query.url||''));const r=await f(u,{headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36','Referer':u.origin+'/'},redirect:'follow'},12000);const ct=r.headers.get('content-type')||'';const text=(await r.text()).slice(0,700000);const urls=[...text.matchAll(/https?:\\?\/\\?\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g)].map(m=>m[0].replace(/\\\//g,'/')).filter(v=>/m3u8|\.mp4|googlevideo|manifest/i.test(v));return res.status(200).json({ok:true,contentType:ct,urls:[...new Set(urls)].slice(0,20)})}catch(e){return res.status(400).json({error:'source_inspection_failed',message:String(e?.message||e)})}
 }
 try{const out=await upstream(action,req.query);res.setHeader('Cache-Control',/sources|channel|poster|seasons/.test(action)?'s-maxage=30, stale-while-revalidate=60':'s-maxage=90, stale-while-revalidate=300');if(out.status<200||out.status>=300)return res.status(out.status).json({error:'upstream_error',detail:out.data});return res.status(200).json({ok:true,action,data:out.data})}catch(e){return res.status(e?.status||502).json({error:'backend_unavailable',message:String(e?.message||e),trace:cfg.trace||[]})}
}
