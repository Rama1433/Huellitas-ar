'use strict';
// Huellitas WhatsApp OG preview lab: no build dependencies, no privileged credentials.
// No private contact details are fetched. Only approved active pet posts are eligible.
const SB='https://sslvugeciizwhcldgiwg.supabase.co';
const API_KEY='sb_publishable_VyIZSb9AqLvWaRJy4wsgAQ_0X52wdDP';
const APP='https://huellitas-ar.vercel.app';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ESC=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const publicHeaders={apikey:API_KEY,Accept:'application/json'};
async function json(path,params){
 const u=new URL(SB+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u,{headers:publicHeaders,signal:AbortSignal.timeout(6500)});
 if(!r.ok)throw new Error('Public data unavailable: '+r.status);
 return await r.json();
}
async function getPost(id){
 const found=await json('/rest/v1/hu_pet_posts',{select:'id,name,category,locality',id:'eq.'+id,status:'eq.approved',outcome:'eq.active',limit:'1'});
 return Array.isArray(found)?found[0]||null:null;
}
async function getCoverPath(id){
 const found=await json('/rest/v1/hu_pet_photos',{select:'storage_path',post_id:'eq.'+id,position:'eq.0',limit:'1'});
 const path=Array.isArray(found)?found[0]?.storage_path:null;
 return typeof path==='string' && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(path)?path:null;
}
async function getCoverBuffer(path){
 const pathPart=path.split('/').map(encodeURIComponent).join('/');
 const r=await fetch(SB+'/storage/v1/object/sign/huellitas-photos/'+pathPart,{
  method:'POST',headers:{...publicHeaders,'Content-Type':'application/json'},
  body:JSON.stringify({expiresIn:300}),signal:AbortSignal.timeout(6500)
 });
 if(!r.ok)throw new Error('Cover cannot be signed');
 const token=await r.json(), signed=token.signedURL||token.signedUrl;
 if(typeof signed!=='string'||!signed.startsWith('/object/sign/'))throw new Error('Invalid cover URL');
 const photo=await fetch(SB+'/storage/v1'+signed,{signal:AbortSignal.timeout(9000)});
 if(!photo.ok)throw new Error('Cover not available');
 const type=(photo.headers.get('content-type')||'').split(';')[0];
 if(!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('Unsupported cover format');
 const size=Number(photo.headers.get('content-length')||'0');
 if(size>5*1024*1024)throw new Error('Cover too large');
 const buffer=Buffer.from(await photo.arrayBuffer());
 if(buffer.length>5*1024*1024)throw new Error('Cover too large');
 return {buffer,type};
}
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).end();
 const url=new URL(req.url,'https://huellitas-ar.vercel.app');
 const id=url.searchParams.get('id')||'';
 if(!UUID.test(id))return res.status(404).end('Aviso no disponible');
 try {
  const pet=await getPost(id);
  if(!pet)return res.status(404).end('Aviso no disponible');
  const path=await getCoverPath(id);
  if(!path)return res.status(404).end('No hay foto de portada');
  if(url.searchParams.get('imagen')==='1'){
    const img=await getCoverBuffer(path);
    res.setHeader('Content-Type',img.type);
    res.setHeader('Cache-Control','public, s-maxage=180, stale-while-revalidate=30');
    return res.status(200).end(req.method==='HEAD'?undefined:img.buffer);
  }
  const status=pet.category==='lost'?'Se busca':pet.category==='found'?'Encontrada':'En adopción';
  const title=status+': '+pet.name+' · Huellitas';
  const desc=pet.category==='lost'?'Se busca a '+pet.name+' en '+pet.locality+'. ¿Lo viste? Ayudanos a que vuelva a casa.':
    pet.category==='found'?'Encontraron a '+pet.name+' en '+pet.locality+'. Ayudanos a reunirlo con su familia.':
    pet.name+' busca hogar en '+pet.locality+'. Conocé su historia.';
  const host=req.headers['x-forwarded-host']||req.headers.host||'huellitas-ar.vercel.app';
  const allowedHost=(typeof host==='string'&&(/^[a-z0-9-]+\.vercel\.app$/i.test(host)||host==='huellitas-ar.vercel.app'))?host:'huellitas-ar.vercel.app';
  const ogUrl='https://'+allowedHost+'/api/share?id='+encodeURIComponent(id);
  const image=ogUrl+'&imagen=1';
  const destination=APP+'/?mascota='+encodeURIComponent(id);
  const page='<!doctype html><html lang="es-AR"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>'+ESC(title)+'</title><meta name="description" content="'+ESC(desc)+'">'+
   '<meta property="og:type" content="website"><meta property="og:site_name" content="Huellitas">'+
   '<meta property="og:title" content="'+ESC(title)+'"><meta property="og:description" content="'+ESC(desc)+'">'+
   '<meta property="og:url" content="'+ESC(ogUrl)+'">'+
   '<meta property="og:image" content="'+ESC(image)+'"><meta property="og:image:secure_url" content="'+ESC(image)+'">'+
   '<meta property="og:image:alt" content="Foto de '+ESC(pet.name)+'"><meta name="twitter:card" content="summary_large_image">'+
   '<meta name="twitter:image" content="'+ESC(image)+'">'+
   '<meta http-equiv="referrer" content="no-referrer">'+
   '</head><body><p>Abriendo la publicación de '+ESC(pet.name)+' en Huellitas...</p>'+
   '<a href="'+ESC(destination)+'">Ver publicación</a>'+
   '<script>window.location.replace('+JSON.stringify(destination)+')</script>'+
   '</body></html>';
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=90');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  return res.status(200).end(req.method==='HEAD'?undefined:page);
 }catch(err){
  console.error('Huellitas OG preview lab unavailable',err instanceof Error?err.message:'unknown error');
  res.setHeader('Cache-Control','no-store');
  return res.status(503).end('Vista previa temporalmente no disponible');
 }
};