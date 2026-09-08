const FALLBACK_BASE = 'https://test.arabypros.com/api/';

function cleanBase(value) {
  const base = (value || '').trim();
  const out = base || FALLBACK_BASE;
  return out.endsWith('/') ? out : `${out}/`;
}

const BASE = cleanBase(process.env.DRAMA_API_BASE_URL);
const TOKEN_A = (process.env.DRAMA_TOKEN_A || '').trim();
const TOKEN_B = (process.env.DRAMA_TOKEN_B || '').trim();

function n(v, d=1){ const x=parseInt(String(v||''),10); return Number.isFinite(x)?x:d; }
function s(v,d=''){ return encodeURIComponent(String(v==null?d:v)); }
function auth(){ return `${TOKEN_A}/${TOKEN_B}/`; }

function endpoint(action,q){
  const page=Math.max(1,n(q.page,1)), a=auth();
  switch(action){
    case 'home': return `first/${a}`;
    case 'search': return `search/${s(q.query)}/${page}/${a}`;
    case 'movies': return `movie/by/filtres/${s(q.genre,0)}/${s(q.order,'created')}/${page}/${a}`;
    case 'series': return `serie/by/filtres/${s(q.genre,0)}/${s(q.order,'created')}/${page}/${a}`;
    case 'posters': return `poster/by/filtres/${s(q.genre,0)}/${s(q.order,'created')}/${page}/${a}`;
    case 'years': return `years/all/${a}`;
    case 'genres': return `genre/all/${a}`;
    case 'categories': return `category/all/${a}`;
    case 'countries': return `country/all/${a}`;
    case 'actors': return `actor/all/${page}/${s(q.search,'')}/${a}`;
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
    default:return null;
  }
}

function decode(text){
  const raw=(text||'').trim(); if(!raw)return null;
  const parse=v=>{try{return JSON.parse(v)}catch{return undefined}};
  let out=parse(raw);
  if(out!==undefined){
    if(typeof out==='string'){
      const nested=parse(out); if(nested!==undefined)return nested;
      try{const d=Buffer.from(out,'base64').toString('utf8'),p=parse(d);if(p!==undefined)return p}catch{}
    }
    return out;
  }
  try{const d=Buffer.from(raw.replace(/^"|"$/g,''),'base64').toString('utf8'),p=parse(d);return p===undefined?d:p}catch{return raw}
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
  if(req.method==='OPTIONS')return res.status(204).end();
  const action=String(req.query.action||'home');
  if(action==='health')return res.status(200).json({ok:true,configured:Boolean(TOKEN_A&&TOKEN_B),baseHost:new URL(BASE).host});
  if(!TOKEN_A||!TOKEN_B)return res.status(503).json({error:'backend_config_required'});
  const path=endpoint(action,req.query); if(!path)return res.status(400).json({error:'unknown_action'});
  try{
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
    const r=await fetch(new URL(path,BASE),{headers:{Accept:'application/json, text/plain, */*','User-Agent':'Aldrama3Web/1.0'},signal:c.signal});
    clearTimeout(timer); const data=decode(await r.text());
    if(!r.ok)return res.status(r.status).json({error:'upstream_error',status:r.status,detail:data});
    return res.status(200).json({ok:true,action,data});
  }catch(e){return res.status(502).json({error:'upstream_unavailable',message:e?.name==='AbortError'?'timeout':String(e?.message||e)})}
}
