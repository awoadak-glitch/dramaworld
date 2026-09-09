import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';

const TOKEN_A=(process.env.DRAMA_TOKEN_A||'4F5A9C3D9A86FA54EACEDDD635185').trim();
const TOKEN_B=(process.env.DRAMA_TOKEN_B||'d506abfd-9fe2-4b71-b979-feff21bcad13').trim();
const APP_SIGNATURE=(process.env.DRAMA_APP_SIGNATURE||'eLXLul9MmbuG2DF3kKDY8aygdeVgUAalDrznu4kRfP8=').trim();
const DEFAULT_VALIDATION_URL='https://test.arabypros.com/api/validate.php';
const LAST_KNOWN_API_BASE='https://dwapp.arabypros.com/api/';
const FIREBASE={projectId:'alamaldrama2022v2',projectNumber:'462519862201',appId:'1:462519862201:android:e2b2f8fc6e55730e846c68',apiKey:'AIzaSyDgICP_l7w5uHw1C-HGzj0o4ehFCp7BwYc',packageName:'com.alam.aldrama3'};

const TTL=10*60*1000;
const responseCache=new Map();
let configCache={base:'',validationUrl:'',patterns:null,at:0,error:'',trace:[]};
let goodBaseCache={base:'',at:0};

function cleanUrl(value){const raw=String(value||'').trim();if(!/^https?:\/\//i.test(raw))return '';try{return new URL(raw).href}catch{return ''}}
function cleanBase(value){const url=cleanUrl(value);return url?(url.endsWith('/')?url:`${url}/`):''}
function num(value,fallback=0){const parsed=Number.parseInt(String(value??''),10);return Number.isFinite(parsed)?parsed:fallback}
const enc=(value,fallback='')=>encodeURIComponent(String(value==null?fallback:value));
const auth=()=>`${TOKEN_A}/${TOKEN_B}/`;

function endpoint(action,query){
  // All paginated screens in the 4.2f Android build start at page zero.
  const page=Math.max(0,num(query.page,0)),tokens=auth();
  switch(action){
    case 'home':return `first/${tokens}`;
    case 'search':return `search/${enc(query.query)}/${page}/${tokens}`;
    case 'movies':return `movie/by/filtres/${enc(query.genre,0)}/${enc(query.order,'created')}/${page}/${tokens}`;
    case 'series':return `serie/by/filtres/${enc(query.genre,0)}/${enc(query.order,'created')}/${page}/${tokens}`;
    case 'posters':return `poster/by/filtres/${enc(query.genre,0)}/${enc(query.order,'created')}/${page}/${tokens}`;
    case 'posters-year':return `poster/by/year/${enc(query.year)}/${enc(query.type,0)}/${page}/${tokens}`;
    case 'years':return `years/all/${tokens}`;
    case 'genres':return `genre/all/${tokens}`;
    case 'categories':return `category/all/${tokens}`;
    case 'countries':return `country/all/${tokens}`;
    case 'actors':return `actor/all/${page}/${enc(query.search,'')}/${tokens}`;
    case 'actor-posters':return `movie/by/actor/${enc(query.id)}/${tokens}`;
    case 'channels':return `channel/by/filtres/${enc(query.category,0)}/${enc(query.country,0)}/${page}/${tokens}`;
    case 'poster':return `movie/by/${enc(query.id)}/${tokens}`;
    case 'channel':return `channel/by/${enc(query.id)}/${tokens}`;
    case 'cast':return `role/by/poster/${enc(query.id)}/${tokens}`;
    case 'seasons':return `season/by/serie/${enc(query.id)}/${tokens}`;
    case 'movie-sources':return `movie/source/by/${enc(query.id)}/${tokens}`;
    case 'episode-sources':return `episode/source/by/${enc(query.id)}/${tokens}`;
    case 'movie-subs':return `subtitles/by/movie/${enc(query.id)}/${tokens}`;
    case 'episode-subs':return `subtitles/by/episode/${enc(query.id)}/${tokens}`;
    case 'random-movies':return `movie/random/${enc(query.genres,0)}/${tokens}`;
    case 'random-channels':return `channel/random/${enc(query.categories,0)}/${tokens}`;
    default:return null;
  }
}

function tryJson(value){try{return JSON.parse(value)}catch{return undefined}}
function decodeBase64Text(value){
  try{const normalized=String(value||'').trim().replace(/-/g,'+').replace(/_/g,'/').replace(/\s/g,'');if(normalized.length<4)return null;const text=Buffer.from(normalized,'base64').toString('utf8');return !text||text.includes('\uFFFD')?null:text}catch{return null}
}
function decodePayload(value){
  const raw=String(value??'').trim();if(!raw)return null;
  const parsed=tryJson(raw);
  if(parsed!==undefined){
    if(typeof parsed==='string'){const nested=tryJson(parsed);if(nested!==undefined)return nested;const decoded=decodeBase64Text(parsed);if(decoded!==null){const json=tryJson(decoded);return json===undefined?decoded:json}}
    return parsed;
  }
  const anchor=raw.indexOf('W3s');
  if(anchor>=0){const tail=raw.slice(anchor).match(/^[A-Za-z0-9+/_=-]+/)?.[0];const decoded=tail&&decodeBase64Text(tail);if(decoded){const json=tryJson(decoded);if(json!==undefined)return json}}
  const decoded=decodeBase64Text(raw.replace(/^"|"$/g,''));if(decoded!==null){const json=tryJson(decoded);return json===undefined?decoded:json}
  return raw;
}
async function fetchTimeout(url,options={},timeout=15000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}

function makeFid(){const bytes=crypto.randomBytes(17);bytes[0]=(bytes[0]&0x0f)|0x70;return bytes.toString('base64url').slice(0,22)}
function decodeRobust(value){let output=String(value||'').trim();const decoded=decodeBase64Text(output);if(decoded)output=decoded.trim();if(output.startsWith('cipher_key_'))output=output.slice('cipher_key_'.length);return cleanUrl(output)}
async function firebaseValidationUrl(){
  const trace=[];
  try{
    const fid=makeFid();
    const installationResponse=await fetchTimeout(`https://firebaseinstallations.googleapis.com/v1/projects/${FIREBASE.projectId}/installations`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':FIREBASE.apiKey},body:JSON.stringify({fid,authVersion:'FIS_v2',appId:FIREBASE.appId,sdkVersion:'a:17.2.0'})},10000);
    trace.push(`fis_${installationResponse.status}`);if(!installationResponse.ok)throw new Error(`fis_${installationResponse.status}`);
    const installation=await installationResponse.json(),token=installation.authToken?.token;if(!token)throw new Error('fis_no_token');
    const remoteResponse=await fetchTimeout(`https://firebaseremoteconfig.googleapis.com/v1/projects/${FIREBASE.projectNumber}/namespaces/firebase:fetch`,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':FIREBASE.apiKey,'X-Goog-Firebase-Installations-Auth':token},body:JSON.stringify({appId:FIREBASE.appId,appInstanceId:installation.fid||fid,appInstanceIdToken:token,appVersion:'4.2f',appBuild:'42',packageName:FIREBASE.packageName,countryCode:'YE',languageCode:'ar',platformVersion:'15',timeZone:'Asia/Aden',sdkVersion:'22.1.2',analyticsUserProperties:{}})},10000);
    trace.push(`remote_${remoteResponse.status}`);if(!remoteResponse.ok)throw new Error(`remote_${remoteResponse.status}`);
    const remote=await remoteResponse.json();return {url:decodeRobust(remote?.entries?.Robust_small)||DEFAULT_VALIDATION_URL,trace};
  }catch(error){trace.push(error?.name==='AbortError'?'remote_timeout':'remote_error');return {url:DEFAULT_VALIDATION_URL,trace}}
}
function makeIdentity(){const androidId=crypto.createHash('sha256').update('alam-aldrama3-web-4.2f').digest('hex').slice(0,16);const salt=crypto.randomBytes(16);const key=crypto.pbkdf2Sync(androidId,salt,10000,32,'sha256');return {androidId,salt,key}}
function encryptSignature(identity){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',identity.key,iv);const encrypted=Buffer.concat([cipher.update(Buffer.from(`${Date.now()}|${APP_SIGNATURE}`,'utf8')),cipher.final()]);return Buffer.concat([iv,encrypted,cipher.getAuthTag()]).toString('base64')}
function decryptConfig(value,key){const raw=Buffer.from(String(value||'').trim(),'base64');if(raw.length<29)throw new Error('encrypted_config_too_short');const iv=raw.subarray(0,12),tag=raw.subarray(raw.length-16),ciphertext=raw.subarray(12,raw.length-16);const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);const parsed=tryJson(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));if(!parsed||typeof parsed!=='object')throw new Error('config_not_json');return parsed}
function extractConfig(response,key){
  if(!response||typeof response!=='object')return null;
  const encrypted=(response.status==='encrypted_config_v2'&&typeof response.data==='string'?response.data:'')||response.encrypted_config_v2||response.encryptedConfigV2||response.data?.encrypted_config_v2;
  if(typeof encrypted==='string'&&encrypted.trim()){try{return decryptConfig(encrypted,key)}catch{}}
  if(typeof response.base_api_url==='string')return response;
  if(response.data&&typeof response.data==='object'&&typeof response.data.base_api_url==='string')return response.data;
  return null;
}
async function validateAndGetBase(force=false){
  if(!force&&configCache.base&&Date.now()-configCache.at<TTL)return configCache.base;
  const envBase=cleanBase(process.env.DRAMA_API_BASE_URL);if(envBase){configCache={base:envBase,validationUrl:'env',patterns:null,at:Date.now(),error:'',trace:['env']};return envBase}
  const remote=await firebaseValidationUrl(),identity=makeIdentity();
  try{
    const response=await fetchTimeout(remote.url,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8','Accept':'application/json','User-Agent':'Aldrama3App/1.0','X-Request-ID':crypto.randomUUID()},body:JSON.stringify({data:encryptSignature(identity),android_id:identity.androidId,salt:identity.salt.toString('base64')})},14000);
    const parsed=tryJson(await response.text()),trace=[...remote.trace,`validate_${response.status}`];
    if(!response.ok)throw Object.assign(new Error(String(parsed?.message||parsed?.error||`validation_http_${response.status}`)),{trace});
    const config=extractConfig(parsed,identity.key),base=cleanBase(config?.base_api_url);if(!base)throw Object.assign(new Error('validation_config_missing'),{trace});
    configCache={base,validationUrl:remote.url,patterns:config.link_patterns||null,at:Date.now(),error:'',trace};return base;
  }catch(error){configCache={base:'',validationUrl:remote.url,patterns:null,at:Date.now(),error:String(error?.message||error),trace:error?.trace||remote.trace};return ''}
}

function baseCandidates(){return [...new Set([cleanBase(process.env.DRAMA_API_BASE_URL),(configCache.base&&Date.now()-configCache.at<TTL)?configCache.base:'',(goodBaseCache.base&&Date.now()-goodBaseCache.at<TTL)?goodBaseCache.base:'',LAST_KNOWN_API_BASE].filter(Boolean))]}
function cacheTtl(action){return /sources|channel|poster|seasons/.test(action)?30_000:90_000}
async function upstream(action,query){
  const path=endpoint(action,query);if(!path)throw Object.assign(new Error('unknown_action'),{status:400});
  const cached=responseCache.get(path);if(cached&&Date.now()-cached.at<cacheTtl(action))return {...cached,status:200,cached:true};
  let lastError=configCache.error||'backend_unavailable';
  for(const base of baseCandidates()){
    try{
      const response=await fetchTimeout(new URL(path,base),{headers:{'Accept':'application/json, text/plain, */*','User-Agent':'okhttp/4.9.2','Accept-Language':'ar-YE,ar;q=0.9,en;q=0.6','Cache-Control':'max-age=2','X-Request-ID':crypto.randomUUID()},redirect:'follow'},22000);
      const data=decodePayload(await response.text());
      if(response.ok){goodBaseCache={base,at:Date.now()};responseCache.set(path,{data,base,at:Date.now()});return {data,status:response.status,base}}
      lastError=`upstream_${response.status}`;if(![401,403,404].includes(response.status))return {data,status:response.status,base};
    }catch(error){lastError=error?.name==='AbortError'?'timeout':String(error?.message||error)}
  }
  if(cached)return {...cached,status:200,cached:true,stale:true};
  throw Object.assign(new Error(lastError),{status:502});
}

function isPrivateIp(ip){if(net.isIP(ip)===4){const parts=ip.split('.').map(Number);return parts[0]===10||parts[0]===127||parts[0]===0||(parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168)}if(net.isIP(ip)===6)return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:');return true}
async function assertPublicUrl(raw){const url=new URL(raw);if(!['http:','https:'].includes(url.protocol))throw new Error('unsupported_protocol');const ips=await dns.lookup(url.hostname,{all:true});if(!ips.length||ips.some(item=>isPrivateIp(item.address)))throw new Error('private_target');return url}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Range');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const action=String(req.query.action||'home');
  if(action==='health'){
    const base=await validateAndGetBase(Boolean(req.query.refresh));
    return res.status(200).json({ok:Boolean(base),configured:Boolean(TOKEN_A&&TOKEN_B),securityValidation:Boolean(base),validationHost:configCache.validationUrl&&configCache.validationUrl!=='env'?new URL(configCache.validationUrl).host:configCache.validationUrl,baseHost:base?new URL(base).host:null,error:base?'':configCache.error,trace:configCache.trace});
  }
  if(action==='inspect-source'){
    try{
      const url=await assertPublicUrl(String(req.query.url||''));
      const response=await fetchTimeout(url,{headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36','Referer':`${url.origin}/`},redirect:'follow'},12000);
      const text=(await response.text()).slice(0,900000);
      const absolute=[...text.matchAll(/https?:\\?\/\\?\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g)].map(match=>match[0].replace(/\\\//g,'/'));
      const quoted=[...text.matchAll(/(?:file|src|source|url)\s*[:=]\s*["']([^"']+)["']/gi)].map(match=>match[1].replace(/\\\//g,'/'));
      const urls=[...absolute,...quoted].map(value=>{try{return new URL(value,url).href}catch{return ''}}).filter(value=>/m3u8|\.mp4|\.webm|googlevideo|manifest/i.test(value));
      return res.status(200).json({ok:true,contentType:response.headers.get('content-type')||'',urls:[...new Set(urls)].slice(0,20)});
    }catch(error){return res.status(400).json({error:'source_inspection_failed',message:String(error?.message||error)})}
  }
  try{
    const result=await upstream(action,req.query);
    res.setHeader('Cache-Control',/sources|channel|poster|seasons/.test(action)?'s-maxage=30, stale-while-revalidate=60':'s-maxage=90, stale-while-revalidate=300');
    if(result.status<200||result.status>=300)return res.status(result.status).json({error:'upstream_error',detail:result.data});
    return res.status(200).json({ok:true,action,data:result.data,cached:Boolean(result.cached),stale:Boolean(result.stale)});
  }catch(error){return res.status(error?.status||502).json({error:'backend_unavailable',message:String(error?.message||error),trace:configCache.trace})}
}
