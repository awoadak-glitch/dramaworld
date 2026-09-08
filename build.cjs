const fs=require('fs'),path=require('path'),zlib=require('zlib');
const packed=fs.readdirSync('.').filter(n=>/^bundle\.part\d+$/.test(n)).sort().map(n=>fs.readFileSync(n,'utf8')).join('');
const data=JSON.parse(zlib.gunzipSync(Buffer.from(packed.trim(),'base64')).toString('utf8'));
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist',{recursive:true});
for(const [name,body] of Object.entries(data))fs.writeFileSync(path.join('dist',name),body);
console.log('Drama World web bundle built:',Object.keys(data).join(', '));
