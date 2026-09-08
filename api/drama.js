import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';

const TOKEN_A = (process.env.DRAMA_TOKEN_A || '4F5A9C3D9A86FA54EACEDDD635185').trim();
const TOKEN_B = (process.env.DRAMA_TOKEN_B || 'd506abfd-9fe2-4b71-b979-feff21bcad13').trim();
const FALLBACK_BASES = [
  (process.env.DRAMA_API_BASE_URL || '').trim(),
  'https://test.arabypros.com/api/'
].filter(Boolean);

const FIREBASE = {
  projectId: 'alamaldrama2022v2',
  projectNumber: '462519862201',
  appId: '1:462519862201:android:e2b2f8fc6e55730e846c68',
  apiKey: 'AIzaSyDgICP_l7w5uHw1C-HGzj0o4ehFCp7BwYc',
  packageName: 'com.alam.aldrama3'
};

let remoteCache = { base: '', at: 0 };
let goodBaseCache = { base: '', at: 0 };
const TTL = 10 * 60 * 1000;

function cleanBase(v){
  const s=String(v||'').trim();
  if(!/^https?:\/\//i.test(s)) return '';
  return s.endsWith('/') ? s : s + '/';
}
function n(v,d=1){const x=parseInt(String(v??''),10);return Number.isFinite(x)?x:d}
function s(v,d=''){return encodeURIComponent(String(v==null?d:v))}
function auth(){return `${TOKEN_A}/${TOKEN_B}/`}

function endpoint(action,q){
  const page=Math.max(1,n(q.page,1)), a=auth();
  switch(action){
    case 'home': return `first/${a}`;
    case 'search': return `search/${s(q.query)}/${page}/${a}`;
    case 'movies': return `movie/by/filtres/${s(q.genre,0)}/${s(q.order,'created')}/${page}/${a}`;
    case 'series': return `serie/by/filtres/${s(q.genre,0)}/${s(q.order,'created')}/${page}/${a}`;
    case 'posters': return `poster/by/filtres/${s(q.genre,0)}/${s(q.order,'created')}/${page}/${a}`;
    case 'posters-year': return `poster/by/year/${s(q.year)}/${s(q.type,0)}/${page}/${a}`;
    case 'years': return `years/all/${a}`;
    case 'genres': return `genre/all/${a}`;
    case 'categories': return `category/all/${a}`;
    case 'countries': return `country/all/${a}`;
    case 'actors': return `actor/all/${page}/${s(q.search,'')}/${a}`;
    case 'actor-posters': return `movie/by/actor/${s(q.id)}/${a}`;
    case 'channels': return `channel/by/filtres/${s(q.category,0)}/${s(q.country,0)}/${page}/${a}`;
    case 'poster': return `movie/by/${s(q.id)}/${a}`;
    case 'channel': return `channel/by/${s(q.id)}/${a}`;
    case 'cast': return `role/by/poster/${s(q.id)}/${a}`;
    case 'seasons': return `season/by/serie/${s(q.id)}/${a}`;
    case 'movie-sources': return `movie/source/by/${s(q.id)}/${a}`;
    case 'episode-sources': return `episode/source/by/${s(q.id)}/${a}`;
    case 'movie-subs': return `subtitles/by/movie/${s(q.id)}/${a}`;
    case 'episode-subs': return `subtitles/by/episode/${s(q.id)}/${a}`;
    case 'random-movies': return `movie/random/${s(q.genres,0)}/${a}`;
    case 'random-channels': return `channel/random/${s(q.categories,0)}/${a}`;
    default: return null;
  }
}

function tryJSON(v){try{return JSON.parse(v)}catch{return undefined}}
function decodePayload(text){
  let raw=String(text??'').trim();
  if(!raw) return null;
  let parsed=tryJSON(raw);
  if(parsed!==undefined){
    if(typeof parsed==='string'){
      const nested=tryJSON(parsed); if(nested!==undefined) return nested;
      const b=decodeBase64Text(parsed); if(b!==null){const p=tryJSON(b); return p===undefined?b:p}
    }
    return parsed;
  }
  const anchor=raw.indexOf('W3s');
  if(anchor>=0){
    const tail=raw.slice(anchor).match(/^[A-Za-z0-9+/_=-]+/)?.[0];
    if(tail){const b=decodeBase64Text(tail);if(b!==null){const p=tryJSON(b);if(p!==undefined)return p}}
  }
  const b=decodeBase64Text(raw.replace(/^"|"$/g,''));
  if(b!==null){const p=tryJSON(b);return p===undefined?b:p}
  return raw;
}
function decodeBase64Text(v){
  try{
    const normalized=String(v).replace(/-/g,'+').replace(/_/g,'/').replace(/\s/g,'');
    if(normalized.length<4) return null;
    const out=Buffer.from(normalized,'base64').toString('utf8');
    if(!out || out.includes('\uFFFD')) return null;
    return out;
  }catch{return null}
}

function makeFid(){
  const b=crypto.randomBytes(17); b[0]=(b[0]&0x0f)|0x70;
  return b.toString('base64url').slice(0,22);
}
async function fetchTimeout(url,opts={},ms=15000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{return await fetch(url,{...opts,signal:c.signal})}finally{clearTimeout(t)}
}
async function firebaseBase(){
  if(remoteCache.base && Date.now()-remoteCache.at<TTL) return remoteCache.base;
  try{
    const fid=makeFid();
    const ir=await fetchTimeout(`https://firebaseinstallations.googleapis.com/v1/projects/${FIREBASE.projectId}/installations`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':FIREBASE.apiKey},
      body:JSON.stringify({fid,authVersion:'FIS_v2',appId:FIREBASE.appId,sdkVersion:'a:17.2.0'})
    },12000);
    if(!ir.ok) throw new Error('fis_'+ir.status);
    const installation=await ir.json();
    const token=installation.authToken?.token;
    if(!token) throw new Error('fis_no_token');
    const rr=await fetchTimeout(`https://firebaseremoteconfig.googleapis.com/v1/projects/${FIREBASE.projectNumber}/namespaces/firebase:fetch`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Goog-Api-Key':FIREBASE.apiKey,'X-Goog-Firebase-Installations-Auth':token},
      body:JSON.stringify({appId:FIREBASE.appId,appInstanceId:installation.fid||fid,appInstanceIdToken:token,appVersion:'4.2f',appBuild:'42',packageName:FIREBASE.packageName,countryCode:'YE',languageCode:'ar',platformVersion:'15',timeZone:'Asia/Aden',sdkVersion:'22.1.2',analyticsUserProperties:{}})
    },12000);
    if(!rr.ok) throw new Error('remote_'+rr.status);
    const rc=await rr.json();
    let robust=rc?.entries?.Robust_small;
    if(typeof robust!=='string') throw new Error('remote_key_missing');
    robust=decodeBase64Text(robust) || robust;
    if(robust.startsWith('cipher_key_')) robust=robust.slice(11);
    const base=cleanBase(robust);
    if(!base) throw new Error('remote_invalid_url');
    remoteCache={base,at:Date.now()};
    return base;
  }catch{
    return '';
  }
}

async function baseCandidates(){
  const remote=await firebaseBase();
  const list=[cleanBase(process.env.DRAMA_API_BASE_URL),remote,...FALLBACK_BASES.map(cleanBase)].filter(Boolean);
  return [...new Set(list)];
}
async function upstream(action,q){
  const path=endpoint(action,q);
  if(!path) throw Object.assign(new Error('unknown_action'),{status:400});
  const bases=await baseCandidates();
  if(goodBaseCache.base && Date.now()-goodBaseCache.at<TTL){
    bases.splice(0,0,goodBaseCache.base);
  }
  const uniq=[...new Set(bases)];
  let lastErr='backend_unavailable';
  for(const base of uniq){
    try{
      const url=new URL(path,base);
      const r=await fetchTimeout(url,{headers:{Accept:'application/json, text/plain, */*','User-Agent':'Aldrama3/4.2f (Web Port)','Accept-Language':'ar'}},16000);
      const text=await r.text();
      const data=decodePayload(text);
      if(r.ok){goodBaseCache={base,at:Date.now()};return {data,status:r.status,base}}
      lastErr=`upstream_${r.status}`;
      if(r.status!==404&&r.status!==403&&r.status!==401) return {data,status:r.status,base};
    }catch(e){lastErr=e?.name==='AbortError'?'timeout':String(e?.message||e)}
  }
  throw Object.assign(new Error(lastErr),{status:502});
}

function isPrivateIp(ip){
  if(net.isIP(ip)===4){
    const p=ip.split('.').map(Number);
    return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168);
  }
  if(net.isIP(ip)===6) return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');
  return true;
}
async function assertPublicUrl(raw){
  const u=new URL(raw);
  if(!['http:','https:'].includes(u.protocol)) throw new Error('unsupported_protocol');
  const ips=await dns.lookup(u.hostname,{all:true});
  if(!ips.length||ips.some(x=>isPrivateIp(x.address))) throw new Error('private_target');
  return u;
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Range');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  const action=String(req.query.action||'home');
  if(action==='health'){
    const remote=await firebaseBase();
    return res.status(200).json({ok:true,configured:Boolean(TOKEN_A&&TOKEN_B),remoteConfig:Boolean(remote),baseHost:remote?new URL(remote).host:(goodBaseCache.base?new URL(goodBaseCache.base).host:null)});
  }
  if(action==='inspect-source'){
    try{
      const u=await assertPublicUrl(String(req.query.url||''));
      const r=await fetchTimeout(u,{headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36','Referer':u.origin+'/'},redirect:'follow'},12000);
      const ct=r.headers.get('content-type')||'';
      const text=(await r.text()).slice(0,700000);
      const urls=[...text.matchAll(/https?:\\?\/\\?\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g)].map(m=>m[0].replace(/\\\//g,'/')).filter(v=>/m3u8|\.mp4|googlevideo|manifest/i.test(v));
      return res.status(200).json({ok:true,contentType:ct,urls:[...new Set(urls)].slice(0,20)});
    }catch(e){return res.status(400).json({error:'source_inspection_failed',message:String(e?.message||e)})}
  }
  try{
    const out=await upstream(action,req.query);
    res.setHeader('Cache-Control',/sources|channel|poster|seasons/.test(action)?'s-maxage=30, stale-while-revalidate=60':'s-maxage=90, stale-while-revalidate=300');
    if(out.status<200||out.status>=300) return res.status(out.status).json({error:'upstream_error',detail:out.data});
    return res.status(200).json({ok:true,action,data:out.data});
  }catch(e){
    return res.status(e?.status||502).json({error:'backend_unavailable',message:String(e?.message||e)});
  }
}
