import crypto from 'crypto';

const PROJECT_ID = 'alamaldrama2022v2';
const PROJECT_NUMBER = '462519862201';
const APP_ID = '1:462519862201:android:e2b2f8fc6e55730e846c68';
const API_KEY = 'AIzaSyDgICP_l7w5uHw1C-HGzj0o4ehFCp7BwYc';
const PACKAGE_NAME = 'com.alam.aldrama3';

function makeFid(){
  const b=crypto.randomBytes(17);
  b[0]=(b[0]&0x0f)|0x70;
  return b.toString('base64url').slice(0,22);
}

async function createInstallation(){
  const fid=makeFid();
  const r=await fetch(`https://firebaseinstallations.googleapis.com/v1/projects/${PROJECT_ID}/installations`,{
    method:'POST',
    headers:{'Content-Type':'application/json','x-goog-api-key':API_KEY},
    body:JSON.stringify({fid,authVersion:'FIS_v2',appId:APP_ID,sdkVersion:'a:17.2.0'})
  });
  const text=await r.text();
  let data; try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!r.ok) throw new Error(`FIS ${r.status}: ${JSON.stringify(data)}`);
  return {fid:data.fid||fid,token:data.authToken?.token||'',raw:data};
}

async function fetchRemoteConfig(fid,token){
  const url=`https://firebaseremoteconfig.googleapis.com/v1/projects/${PROJECT_NUMBER}/namespaces/firebase:fetch`;
  const body={
    appId:APP_ID,
    appInstanceId:fid,
    appInstanceIdToken:token,
    appVersion:'4.2f',
    appBuild:'42',
    packageName:PACKAGE_NAME,
    countryCode:'YE',
    languageCode:'ar',
    platformVersion:'15',
    timeZone:'Asia/Aden',
    sdkVersion:'22.1.2',
    analyticsUserProperties:{}
  };
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':API_KEY,'X-Goog-Firebase-Installations-Auth':token},body:JSON.stringify(body)});
  const text=await r.text();
  let data; try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!r.ok) throw new Error(`RC ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

function decodeMaybe(v){
  if(typeof v!=='string') return v;
  try{
    const d=Buffer.from(v,'base64').toString('utf8');
    if(d && /[\x20-\x7E\u0600-\u06FF]/.test(d)) return d;
  }catch{}
  return v;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const inst=await createInstallation();
    const rc=await fetchRemoteConfig(inst.fid,inst.token);
    const entries=rc.entries||{};
    const decoded=Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,decodeMaybe(v)]));
    return res.status(200).json({ok:true,state:rc.state||null,entries,decoded});
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
