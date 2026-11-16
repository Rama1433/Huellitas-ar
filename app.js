(()=>{
'use strict';
const PROJECT_URL='https://sslvugeciizwhcldgiwg.supabase.co';
const PUBLISHABLE='sb_publishable_VyIZSb9AqLvWaRJy4wsgAQ_0X52wdDP';
const SITE_URL='https://huellitas-ar.vercel.app/';
const BUCKET='huellitas-photos';
const db=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,flowType:'implicit'}});
const $=s=>document.querySelector(s),root=$('#app'),cards=$('#cards'),overlay=$('#overlay'),modal=$('#modal'),zoomOverlay=$('#photo-zoom');
const icon=(s)=>`<svg aria-hidden="true"><use href="#i-${s}"/></svg>`;
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabel={adoption:'En adopción',lost:'Se busca',found:'Encontrado'};
const defaultPhoto='https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=85';
const photoFallbacks=[
{img:defaultPhoto,label:'Huellitas'},
{img:'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=85',label:'Pronto más historias'},
{img:'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=900&q=85',label:'Un hogar para cada huellita'}
];
// Same original dog and cat audio files. Decoded with Web Audio instead of <audio> media playback.
const soundSources={dog:'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/4c/George_vuf_1996.ogg/George_vuf_1996.ogg.mp3',cat:'./cat.mp3'};
let soundCtx=null,playingSource=null;
const soundBuffers={};
async function getSoundBuffer(species){
  if(soundBuffers[species])return soundBuffers[species];
  const ctx=soundCtx;const response=await fetch(soundSources[species],{mode:'cors'});
  if(!response.ok)throw new Error('No se pudo descargar el efecto de sonido');
  const buffer=await ctx.decodeAudioData(await response.arrayBuffer());
  soundBuffers[species]=buffer;
  return buffer;
}

let pets=[],featuredIds=[],requests=[],mine=[],modPosts=[],currentUser=null,isMod=false;
let filter='all',zone='',query='',soundOn=true,activePet=null,pendingDetail=null,heroIndex=0,heroTimer=null,authIntent=null;
let toastTimer=null,lastHeroSwipe=0,likes=new Set(),loading=false,authMode='login';
let noticeCount=0,notifRows=[],activeMap=null,areaCircle=null,areaMarker=null,selectedApprox=null,currentInboxId=null,detailPhotoIndex=0,inboxRequests=[],shareReturn="requests",overviewMap=null,overviewOpen=false;
const zoneCenters={'San Miguel':[-34.543,-58.712],'Muñiz':[-34.558,-58.717],'Bella Vista':[-34.568,-58.689],'Los Polvorines':[-34.511,-58.699],'José C. Paz':[-34.512,-58.778],'Grand Bourg':[-34.486,-58.727]};
const statusText={pending:'Pendiente',accepted:'Aceptada',declined:'Rechazada'};
const notifierMessages={request_received:'Recibiste una solicitud para una de tus mascotas',request_accepted:'¡Aceptaron tu solicitud!',request_declined:'Actualización de tu solicitud'};
function phoneValid(v){return /^\+?[0-9 ()-]+$/.test(v)&&v.replace(/\D/g,'').length>=10&&v.replace(/\D/g,'').length<=15}
function shortError(err,context='generic'){
 const code=String(err?.code||'').toLowerCase(),str=String(err?.message||'').toLowerCase();
 if(code==='invalid_credentials'||str.includes('invalid login credentials'))return 'El correo o la contraseña no coinciden. Revisalos e intentá nuevamente.';
 if(code==='email_not_confirmed'||str.includes('email not confirmed'))return 'Todavía falta confirmar tu correo. Revisá tu bandeja de entrada y correo no deseado.';
 if(code==='user_already_exists'||str.includes('already registered'))return 'Ese correo ya tiene una cuenta. Probá iniciar sesión o recuperar tu contraseña.';
 if(code==='weak_password')return 'Elegí una contraseña más segura, con al menos 8 caracteres.';
 if(code==='email_address_not_authorized')return 'El correo todavía no está autorizado para las pruebas. Necesitamos configurar el envío público.';
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit')return 'Se alcanzó el límite de intentos. Probá de nuevo más tarde.';
 if(code==='23505')return 'Este registro ya existe. Revisá si ya enviaste la solicitud.';
 if(code==='42501'||str.includes('row-level security'))return 'La operación fue bloqueada por permisos. Contactá a la administración de Huellitas.';
 if(str.includes('failed to fetch')||str.includes('network'))return 'No pudimos conectar con el servidor. Revisá tu conexión.';
 if(context==='auth')return 'No pudimos completar el acceso. Revisá los datos e intentá nuevamente.';
 return err?.message || 'No pudimos completar la operación. Intentá nuevamente.';
}
function inlineError(form,msg){const el=form?.querySelector('.form-error');if(el){el.hidden=false;el.textContent=msg;el.scrollIntoView({block:'nearest',behavior:'smooth'})}else toast(msg)}
function busy(button,text){if(!button)return()=>{};const prior=button.innerHTML;button.disabled=true;button.innerHTML=`<span class="loading-mini" aria-hidden="true"></span> ${safe(text)}`;return()=>{if(button.isConnected){button.disabled=false;button.innerHTML=prior}}}
function disposeMap(){if(activeMap){activeMap.remove();activeMap=null}areaCircle=null;areaMarker=null}

const deepLinkId=new URLSearchParams(location.search).get('mascota');
function toast(message){const e=$('#toast');e.textContent=message;e.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('visible'),4200)}
function show(content,narrow=false){disposeMap();modal.className='modal'+(narrow?' narrow':'');modal.innerHTML=`<button class="modal-close" data-action="close" aria-label="Cerrar">${icon('x')}</button>`+content;overlay.classList.add('open');document.body.style.overflow='hidden';modal.querySelector('.modal-close')?.focus()}
function close(){closePhotoZoom();disposeMap();if(pendingDetail){clearTimeout(pendingDetail);pendingDetail=null}overlay.classList.remove('open');document.body.style.overflow='';modal.innerHTML=''}
const petStatus=p=>p.category||p.status;
function requestLabel(p){const s=petStatus(p);return s==='adoption'?'Me interesa adoptar':s==='lost'?'Tengo información':'Creo que es mi mascota'}
function accountHeader(){
 $('#account-button').innerHTML=icon('user')+`<span>${currentUser?'Mi cuenta':'Ingresar / Registrarme'}</span>`;
 const bell=$('#notification-button');if(bell){bell.hidden=!currentUser;bell.setAttribute('aria-label',`Notificaciones, ${noticeCount} sin leer`)}
 updateBell();
}
function displayPhoto(p){return p.img||defaultPhoto}
async function signedPhoto(path){if(!path)return '';const {data,error}=await db.storage.from(BUCKET).createSignedUrl(path,300);return error?'':data.signedUrl}

// Refresh only the public/authorized photos currently being viewed.
// Signed Storage URLs expire, so a cached thumbnail can fail later even if its file exists.
const photoRenewing=new Map();
async function renewPetPhotos(p){
 if(!p?.id||!p.photoPaths?.length||!db)return false;
 if(photoRenewing.has(p.id))return photoRenewing.get(p.id);
 const promise=(async()=>{
   const urls=await Promise.all(p.photoPaths.map(signedPhoto));
   if(urls.length!==p.photoPaths.length||urls.some(u=>!u))return false;
   p.photos=urls;p.img=urls[0];p.photoSignedAt=Date.now();
   if(activePet?.id===p.id&&overlay.classList.contains('open')){
     overlay.querySelectorAll('.photo-thumbs [data-photo-index]').forEach(btn=>{
       const i=Number(btn.dataset.photoIndex),img=btn.querySelector('img');
       if(img&&p.photos[i]&&img.src!==p.photos[i])img.src=p.photos[i];
     });
     galleryPhoto(p,detailPhotoIndex);
     if(zoomOverlay&&!zoomOverlay.hidden){
       const zoomImg=$('#photo-zoom-image');
       if(zoomImg)zoomImg.src=p.photos[detailPhotoIndex]||p.photos[0];
     }
   }
   return true;
 })().finally(()=>photoRenewing.delete(p.id));
 photoRenewing.set(p.id,promise);
 return promise;
}
overlay.addEventListener('error',e=>{
 const img=e.target;
 if(!(img instanceof HTMLImageElement))return;
 const detailImage=img.id==='detail-current-photo'||img.id==='photo-zoom-image'||Boolean(img.closest('.photo-thumbs'));
 if(!detailImage||!activePet?.photoPaths?.length)return;
 if(img.dataset.huPhotoRetry==='1'){img.alt='Foto temporalmente no disponible';return}
 img.dataset.huPhotoRetry='1';
 renewPetPhotos(activePet).then(ok=>{if(!ok&&img.isConnected)img.alt='Foto temporalmente no disponible'}).catch(()=>{});
},true);
overlay.addEventListener('load',e=>{
 if(e.target instanceof HTMLImageElement)delete e.target.dataset.huPhotoRetry;
},true);

async function attachPhotos(posts){
 if(!posts.length)return posts;
 const ids=posts.map(p=>p.id);
 const {data:photos,error}=await db.from('hu_pet_photos').select('post_id,storage_path,position').in('post_id',ids).order('position',{ascending:true});
 if(error){console.warn('No se pudieron cargar las fotos',error.message);return posts}
 const grouped=new Map();for(const ph of photos||[]){if(!grouped.has(ph.post_id))grouped.set(ph.post_id,[]);grouped.get(ph.post_id).push(ph.storage_path)}
 await Promise.all(posts.map(async p=>{
    const paths=grouped.get(p.id)||[];
    p.photos=(await Promise.all(paths.map(signedPhoto))).filter(Boolean);
    p.img=p.photos[0]||'';
    p.photoPaths=paths;
    p.photoSignedAt=Date.now();
 }));return posts;
}
function fromRow(p){return {...p,status:p.category,zone:p.locality,desc:p.description,short:p.description?.slice(0,98)||'',age:p.age_text||'',species:p.species,sex:({male:'Macho',female:'Hembra',unknown:'Sin indicar'})[p.sex]||'Sin indicar'}}
async function refreshPosts(){if(!db)return;loading=true;render();const selectCols='id,name,species,category,description,locality,age_text,sex,size,is_featured,created_at,outcome,approx_lat,approx_lon,search_radius_m'+(currentUser?',owner_id':'');const {data,error}=await db.from('hu_pet_posts').select(selectCols).eq('status','approved').eq('outcome','active').order('created_at',{ascending:false}).limit(120);
if(error){loading=false;toast('No pudimos cargar las mascotas: '+error.message);return}
const rows=(data||[]).map(fromRow);await attachPhotos(rows);pets=rows;featuredIds=rows.filter(p=>p.is_featured).map(p=>p.id);heroIndex=0;$('#hero-slides').innerHTML='';loading=false;render();renderHero();startHero();await mergeGuestFavorites();refreshEngagement().catch(()=>{})}

const GUEST_FAVORITES_KEY='huellitas_guest_favorites_v1';
const FAVORITE_ID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let engagement=new Map(),favoriteBusy=new Set();
function readGuestFavorites(){
 try{
  const arr=JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY)||'[]');
  return new Set(Array.isArray(arr)?arr.filter(id=>typeof id==='string'&&FAVORITE_ID_PATTERN.test(id)).slice(-150):[]);
 }catch(_){return new Set()}
}
function writeGuestFavorites(){
 try{localStorage.setItem(GUEST_FAVORITES_KEY,JSON.stringify([...likes].slice(-150)))}catch(_){}
}
function statFor(id){return engagement.get(id)||{favorites_count:0,shares_count:0}}
async function refreshEngagement(){
 if(!db)return;
 const {data,error}=await db.rpc('hu_public_pet_engagement');
 if(error){console.warn('Contadores no disponibles',error.message);return}
 engagement=new Map((data||[]).map(x=>[x.post_id,{
  favorites_count:Number(x.favorites_count)||0,shares_count:Number(x.shares_count)||0
 }]));
 render();updateDetailEngagement();
}
async function mergeGuestFavorites(){
 if(!currentUser||!pets.length)return;
 const guest=readGuestFavorites();
 const available=[...guest].filter(id=>pets.some(p=>p.id===id));
 if(!available.length)return;
 const uid=currentUser.id;
 const {error}=await db.from('hu_pet_favorites').upsert(
  available.map(post_id=>({user_id:uid,post_id})),
  {onConflict:'user_id,post_id',ignoreDuplicates:true}
 );
 if(error){console.warn('No se pudieron sincronizar favoritos locales',error.message);return}
 if(!currentUser||currentUser.id!==uid)return;
 try{localStorage.removeItem(GUEST_FAVORITES_KEY)}catch(_){}
 for(const id of available)likes.add(id);
 render();
 refreshEngagement().catch(()=>{});
}
async function loadFavoriteState(){
 if(!currentUser){likes=readGuestFavorites();render();return}
 const uid=currentUser.id;
 const {data,error}=await db.from('hu_pet_favorites').select('post_id').eq('user_id',uid);
 if(!currentUser||currentUser.id!==uid)return;
 if(error){console.warn('No se pudieron recuperar favoritos',error.message);return}
 likes=new Set((data||[]).map(x=>x.post_id));
 render();
 await mergeGuestFavorites();
}
async function toggleFavorite(id){
 if(!id||favoriteBusy.has(id))return false;
 if(!pets.some(p=>p.id===id)){toast('Esta publicación ya no está disponible.');return false}
 favoriteBusy.add(id);
 const removing=likes.has(id);
 try{
  if(currentUser){
   const uid=currentUser.id;
   const res=removing
    ?await db.from('hu_pet_favorites').delete().eq('user_id',uid).eq('post_id',id)
    :await db.from('hu_pet_favorites').insert({user_id:uid,post_id:id});
   if(res.error&&!(res.error.code==='23505'&&!removing))throw res.error;
   if(!currentUser||currentUser.id!==uid)return false;
  }
  if(removing)likes.delete(id);else likes.add(id);
  if(!currentUser)writeGuestFavorites();
  render();updateDetailEngagement();
  toast(removing?'Quitada de favoritos':currentUser?'Guardada en Mis favoritos':'Guardada en este dispositivo');
  if(currentUser)refreshEngagement().catch(()=>{});
  return true;
 }catch(e){toast('No pudimos guardar el favorito: '+(e?.message||'Reintentá'));return false}
 finally{favoriteBusy.delete(id)}
}
function updateDetailEngagement(){
 const p=activePet;if(!p)return;
 const btn=$('#detail-favorite');
 if(btn){btn.classList.toggle('selected',likes.has(p.id));btn.setAttribute('aria-pressed',String(likes.has(p.id)))}
 const counts=statFor(p.id);
 const fav=$('#detail-favorites-count');if(fav)fav.textContent=counts.favorites_count;
 const share=$('#detail-shares-count');if(share)share.textContent=counts.shares_count;
}
function myFavorites(){
 const found=pets.filter(p=>likes.has(p.id));
 show('<div class="form-content"><span class="modal-label">'+icon('heart')+' HUELLITAS</span>'+
  '<h2>Mis favoritos</h2><p class="form-subtitle">'+
  (currentUser?'Tus favoritos se guardan en tu cuenta.':'Se guardan en este dispositivo. Registrate para conservarlos también en otros dispositivos.')+
  '</p><div class="request-list">'+
  (found.length?found.map(p=>'<article class="request-item favorite-item"><div class="fav-summary">'+
   (p.img?'<img loading="lazy" alt="Foto de '+safe(p.name)+'" src="'+safe(p.img)+'">':'<span>'+icon('paw')+'</span>')+
   '<div><b>'+safe(p.name)+'</b><small>'+safe(statusLabel[p.status])+' · '+safe(p.zone)+'</small></div></div>'+
   '<div class="moderation-tools"><button data-action="favorite-open" data-id="'+safe(p.id)+'">Ver historia</button>'+
   '<button data-action="favorite-remove" data-id="'+safe(p.id)+'">Quitar favorito</button></div></article>').join('')
   :'<div class="request-item"><p>Todavía no guardaste mascotas favoritas. Tocá el corazón de una tarjeta para comenzar.</p></div>')+
  '</div><button class="submit" data-action="close">Volver a las mascotas</button>'+
  (currentUser?'<button class="menu-btn" data-action="account">Volver a mi cuenta</button>':'')+
  '</div>',true);
}
async function recordShareAttempt(postId){
 if(!currentUser||!postId)return;
 try{
  const {data,error}=await db.rpc('hu_record_pet_share',{p_post_id:postId});
  if(error){console.warn('Conteo de compartidos no disponible',error.message);return}
  if(data)await refreshEngagement();
 }catch(e){console.warn('No se pudo contar un compartido',e?.message||e)}
}

function render(){if(loading){cards.innerHTML=`<div class="empty">${icon('search')}<p>Cargando publicaciones...</p></div>`;return}
const matched=pets.filter(p=>(filter==='all'||petStatus(p)===filter)&&(!zone||zone===p.zone)&&(!query||(p.name+' '+p.zone+' '+p.short).toLowerCase().includes(query)));
cards.innerHTML=matched.map(p=>`<article class="pet-card"><button class="pet-photo" data-action="pet-touch" data-id="${safe(p.id)}" aria-label="Conocer a ${safe(p.name)}: reproducir sonido y abrir ficha"><span class="pet-fallback">${icon(p.species==='cat'?'cat':'dog')}</span>${p.img?`<img src="${safe(p.img)}" alt="Fotografía de ${safe(p.name)}" loading="lazy">`:''}<span class="status ${safe(p.status)}">${statusLabel[p.status]}</span><span class="sound-pop">${p.species==='cat'?'¡MIAU!':'¡GUAU!'}</span></button><div class="pet-card-body"><div class="pet-header"><h3>${safe(p.name)}</h3><span class="pet-species">${icon(p.species==='cat'?'cat':'dog')} ${p.species==='cat'?'Gato':'Perro'}</span></div><p class="pet-desc">${safe(p.short)}</p><div class="pet-card-chips">${p.zone?`<span class="pet-card-chip pet-card-chip--zone" title="${safe(p.zone)}">${icon('pin')}<span class="pet-card-chip-text">${safe(p.zone)}</span></span>`:''}${p.age&&p.age!=='Sin indicar'?`<span class="pet-card-chip">${safe(p.age)}</span>`:''}${p.sex&&p.sex!=='Sin indicar'?`<span class="pet-card-chip">${safe(p.sex)}</span>`:''}</div><div class="pet-social"><span title="Favoritos de cuentas registradas">${icon('heart')} ${statFor(p.id).favorites_count}</span><button type="button" data-action="pet-share" data-id="${safe(p.id)}" aria-label="Compartir a ${safe(p.name)}, ${statFor(p.id).shares_count} acciones registradas" title="Acciones de compartir de cuentas registradas">${icon('share')} ${statFor(p.id).shares_count}</button></div><div class="card-footer"><button class="card-link" data-action="detail" data-id="${safe(p.id)}">Conocer su historia ${icon('arrow')}</button><button class="heart-btn ${likes.has(p.id)?'selected':''}" data-action="like" data-id="${safe(p.id)}" aria-label="${likes.has(p.id)?'Quitar de':'Guardar en'} favoritos" aria-pressed="${likes.has(p.id)}">${icon('heart')}</button></div></div></article>`).join('')||`<div class="empty">${icon('paw')}<p>${query||zone||filter!=='all'?'No encontramos publicaciones con esos filtros. Probá otra búsqueda.':'Todavía no hay mascotas publicadas en esta zona. ¡Sé quien comparta la primera historia!'}<br>Solo se muestran avisos reales aprobados.</p><button class="primary" data-action="publish">${icon('plus')} Publicar mascota</button></div>`;
 document.querySelectorAll('[data-filter]').forEach(b=>{const a=b.dataset.filter===filter;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a))});if(overviewMap)drawOverviewCircles()}
function featured(){const list=pets.filter(p=>featuredIds.includes(p.id));return list.length?list:photoFallbacks.map((p,i)=>({id:'illustration-'+i,name:p.label,img:p.img,demo:true}))}
function renderHero(){const slides=$('#hero-slides'),dots=$('#hero-dots'),name=$('#hero-pet-name'),photo=$('#hero-photo');if(!slides||!dots||!name||!photo)return;const entries=featured();if(!entries.length)return;
if(heroIndex>=entries.length)heroIndex=0;
if(slides.children.length!==entries.length||slides.dataset.keys!==entries.map(p=>p.id).join('|')){
 slides.dataset.keys=entries.map(p=>p.id).join('|');slides.innerHTML=entries.map((p,i)=>`<span class="hero-slide ${i===heroIndex?'active':''}"><img src="${safe(displayPhoto(p))}" alt="" loading="${i===0?'eager':'lazy'}"></span>`).join('');dots.innerHTML=entries.map((p,i)=>`<button class="hero-dot ${i===heroIndex?'active':''}" data-action="hero-dot" data-index="${i}" aria-label="Destacada ${safe(p.name)}"></button>`).join('')}
[...slides.children].forEach((el,i)=>el.classList.toggle('active',i===heroIndex));[...dots.children].forEach((el,i)=>el.classList.toggle('active',i===heroIndex));const p=entries[heroIndex];name.textContent=p.name;photo.setAttribute('aria-label',p.demo?'Imagen ilustrativa, no es un aviso real':`Conocer a ${p.name}`);
const caption=photo.querySelector('.hero-photo-label span');if(caption)caption.innerHTML=p.demo?'Imagen ilustrativa':`Tocá para conocerme ${icon('arrow')}`}
function stopHero(){if(heroTimer){clearInterval(heroTimer);heroTimer=null}}
function startHero(){stopHero();heroTimer=setInterval(()=>{heroIndex=(heroIndex+1)%featured().length;renderHero()},4600)}
function goHero(step){heroIndex=(heroIndex+step+featured().length)%featured().length;renderHero();startHero()}
function openHero(){const p=featured()[heroIndex];if(p?.demo){toast('Imagen ilustrativa. Todavía no es una publicación real.');return}if(p)detail(p)}
function sound(species){
 if(!soundOn)return;
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextClass){toast('El navegador no admite efectos de sonido');return;}
 try{
   soundCtx=soundCtx||new AudioContextClass();
   // Resume during the user gesture; never create a media element / lock-screen media session.
   const resumePromise=soundCtx.resume();
   Promise.resolve(resumePromise).then(()=>getSoundBuffer(species)).then(buffer=>{
     if(!soundOn)return;
     try{playingSource?.stop()}catch(e){}
     const source=soundCtx.createBufferSource(),gain=soundCtx.createGain();
     source.buffer=buffer;gain.gain.value=species==='cat'?.9:.7;
     source.connect(gain);gain.connect(soundCtx.destination);
     source.onended=()=>{if(playingSource===source)playingSource=null};
     playingSource=source;source.start(0);
   }).catch(e=>console.warn('Efecto de sonido no disponible:',e.message));
 }catch(e){console.warn('AudioContext no disponible:',e.message)}
}
function touchPet(id,button){const p=pets.find(p=>p.id===id);if(!p)return;if(pendingDetail)clearTimeout(pendingDetail);document.querySelectorAll('.pet-photo.playing').forEach(el=>el.classList.remove('playing'));button.classList.remove('playing');void button.offsetWidth;button.classList.add('playing');sound(p.species);pendingDetail=setTimeout(()=>{button.classList.remove('playing');detail(p);pendingDetail=null},860)}
function openPhotoZoom(){
 if(!activePet)return;
 const photos=activePet.photos?.length?activePet.photos:(activePet.img?[activePet.img]:[]);
 if(!photos.length)return;
 zoomOverlay.hidden=false;
 photoZoomSet(detailPhotoIndex);
 zoomOverlay.querySelector('[data-zoom-action="close"]')?.focus();
}
function photoZoomSet(index){
 const photos=activePet?.photos?.length?activePet.photos:(activePet?.img?[activePet.img]:[]);
 if(!photos.length)return;
 detailPhotoIndex=(index+photos.length)%photos.length;
 const img=$('#photo-zoom-image');img.src=photos[detailPhotoIndex];img.alt=`Foto ${detailPhotoIndex+1} de ${activePet.name}`;
 $('#photo-zoom-counter').textContent=`${activePet.name} · ${detailPhotoIndex+1} de ${photos.length}`;
 zoomOverlay.querySelectorAll('.photo-zoom-nav').forEach(b=>b.hidden=photos.length<2);
 if((activePet.photos||[]).length>1)galleryPhoto(activePet,detailPhotoIndex);
}
function closePhotoZoom(){if(zoomOverlay)zoomOverlay.hidden=true}
function galleryPhoto(p,index){
 if(!p?.photos?.length)return;
 detailPhotoIndex=(index+p.photos.length)%p.photos.length;
 const current=p.photos[detailPhotoIndex];
 const img=$('#detail-current-photo');if(img)img.src=current;
 const frame=$('.detail-photo');if(frame&&current)frame.style.setProperty('--detail-photo-bg',`url("${current}")`);
 const counter=$('#detail-photo-count');if(counter)counter.textContent=`${detailPhotoIndex+1} / ${p.photos.length}`;
 document.querySelectorAll('[data-photo-index]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.photoIndex)===detailPhotoIndex));
}
function detail(p){
 if(!p)return;activePet=p;detailPhotoIndex=0;
 const photos=p.photos|| (p.img?[p.img]:[]);
 const multi=photos.length>1;
 const gallery=multi?`<div class="photo-gallery-tools"><button class="gallery-arrow" data-action="gallery-prev" aria-label="Foto anterior">‹</button><span id="detail-photo-count">1 / ${photos.length}</span><button class="gallery-arrow" data-action="gallery-next" aria-label="Foto siguiente">›</button></div>`:'';
 const thumbs=multi?`<div class="photo-thumbs">${photos.map((url,i)=>`<button class="${i===0?'selected':''}" data-action="gallery-pick" data-photo-index="${i}" aria-label="Ver foto ${i+1}"><img src="${safe(url)}" alt="Foto ${i+1}"></button>`).join('')}</div>`:'';
 const isSearch=p.status==='lost'||p.status==='found';
 const area=(isSearch&&p.approx_lat!=null&&p.approx_lon!=null)?`<div class="map-section"><div class="private-label">${icon('pin')} Zona aproximada de búsqueda</div><p class="form-subtitle">Este círculo representa el área orientativa, no una dirección exacta. Tocá o mové el mapa para explorar la zona.</p><div class="pet-map" id="pet-map" role="img" aria-label="Mapa aproximado de ${safe(p.zone)}"></div><div class="map-note">Radio aproximado: ${radiusLabel(p.search_radius_m)} · ${safe(p.zone)}</div></div>`:(isSearch?`<div class="map-empty-note">Este aviso indica ${safe(p.zone)}, pero todavía no tiene delimitada una zona de búsqueda en el mapa.${currentUser?.id===p.owner_id?' Podés agregarla desde Editar publicación.':''}</div>`:'');
 show(`<div class="detail-layout"><div><div class="detail-photo">${p.img?`<span class="detail-photo-bg" aria-hidden="true"></span><img id="detail-current-photo" src="${safe(p.img)}" alt="Foto de ${safe(p.name)}" title="Tocá para ampliar" tabindex="0" role="button" aria-label="Ampliar foto de ${safe(p.name)}">`:`<span class="pet-fallback">${icon(p.species==='cat'?'cat':'dog')}</span>`}<span class="status ${safe(p.status)}">${statusLabel[p.status]}</span>${p.img?`<button type="button" class="detail-photo-expand" data-action="zoom-photo">${icon('search')} Ampliar foto</button>`:''}${gallery}</div>${thumbs}</div><div class="detail-content"><span class="modal-label">${icon(p.species==='cat'?'cat':'dog')} ${p.species==='cat'?'Gato':'Perro'} · ${statusLabel[p.status]}</span><h2>Hola, soy ${safe(p.name)}</h2><p class="detail-lead">Una historia que merece ser compartida.</p><div class="detail-chips"><span class="detail-chip">${icon('pin')} ${safe(p.zone)}</span>${p.age?`<span class="detail-chip">${safe(p.age)}</span>`:''}<span class="detail-chip">${safe(p.sex)}</span></div><div class="detail-social"><button id="detail-favorite" type="button" data-action="detail-favorite" class="${likes.has(p.id)?'selected':''}" aria-pressed="${likes.has(p.id)}" title="Guardar o quitar favorito">${icon('heart')} <span id="detail-favorites-count">${statFor(p.id).favorites_count}</span></button><span title="Acciones para compartir registradas">${icon('share')} <span id="detail-shares-count">${statFor(p.id).shares_count}</span></span></div><p class="detail-description">${safe(p.desc)}</p>${area}<div class="private-gate"><div class="private-label">${icon('lock')} Contacto protegido</div><small>${currentUser?.id===p.owner_id?'Esta publicación es tuya. Podés gestionarla desde Mis publicaciones.':currentUser?'Podés enviar una solicitud privada al responsable.':'Para contactar al responsable necesitás registrarte o iniciar sesión.'} Los contactos se comparten únicamente con autorización.</small></div><div class="detail-actions">${currentUser?.id===p.owner_id?`<button data-action="my-posts">${icon('paw')} Administrar mi publicación</button>`:`<button data-action="contact">${icon(p.status==='adoption'?'heart':'shield')} ${requestLabel(p)}</button>`}<button class="share" data-action="share">${icon('share')} Compartir</button></div><button class="report-post-link" data-action="report-post">${icon('shield')} Reportar esta publicación</button></div></div>`,false);
 if(p.img&&photos.length)galleryPhoto(p,0);
 if(p.photoPaths?.length&&(!p.photoSignedAt||Date.now()-p.photoSignedAt>120000))renewPetPhotos(p).catch(()=>{});
 if(area)setTimeout(()=>{if(activePet?.id===p.id&&overlay.classList.contains('open'))showAreaMap(p)},130);
}

const CAPTCHA_SITE_KEY=String(document.querySelector('meta[name="huellitas-turnstile-sitekey"]')?.content||'').trim();
let authCaptchaToken='',authCaptchaWidgetId=null,authCaptchaLoader=null;
function renderAuthCaptcha(){
 if(!CAPTCHA_SITE_KEY)return;
 const el=$('#auth-turnstile');if(!el)return;
 authCaptchaToken='';authCaptchaWidgetId=null;
 const render=()=>{
  if(!el.isConnected||!window.turnstile)return;
  try{authCaptchaWidgetId=window.turnstile.render(el,{
   sitekey:CAPTCHA_SITE_KEY,theme:'light',
   callback:t=>{if(el.isConnected)authCaptchaToken=t},
   'expired-callback':()=>{authCaptchaToken=''},
   'error-callback':()=>{authCaptchaToken=''}
  })}catch(_){el.textContent='No se pudo cargar la verificación. Recargá la página.'}
 };
 if(window.turnstile){render();return}
 if(!authCaptchaLoader)authCaptchaLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;script.onload=resolve;script.onerror=reject;document.head.appendChild(script)
 });
 authCaptchaLoader.then(render).catch(()=>{if(el.isConnected)el.textContent='No se pudo cargar la verificación. Recargá la página.'});
}
function resetAuthCaptcha(form){
 if(!CAPTCHA_SITE_KEY||$('#auth-form')!==form)return;
 authCaptchaToken='';
 try{if(window.turnstile&&authCaptchaWidgetId!==null)window.turnstile.reset(authCaptchaWidgetId)}catch(_){}
}

function auth(mode='login'){
 authMode=mode;const reg=mode==='register',reset=mode==='reset';
 show(`<div class="form-content"><span class="modal-label">${icon('shield')} COMUNIDAD HUELLITAS</span><h2>${reset?'Recuperá tu acceso':reg?'Sumate a Huellitas':'¡Qué bueno verte!'}</h2><p class="form-subtitle">${reset?'Ingresá tu correo y te enviaremos un enlace para recuperar tu contraseña.':'Podés explorar sin cuenta. Para publicar y contactar necesitás registrarte.'}</p><div class="form-switch"><button class="${!reg&&!reset?'selected':''}" data-action="auth-login">Ingresar</button><button class="${reg?'selected':''}" data-action="auth-register">Registrarme</button></div><form id="auth-form"><input type="hidden" name="mode" value="${mode}">${reg?`<label class="form-label">Tu nombre</label><input type="text" name="name" autocomplete="name" minlength="2" maxlength="80" required placeholder="¿Cómo te llamás?"><label class="form-label">Celular / WhatsApp de contacto</label><input type="tel" name="phone" inputmode="tel" autocomplete="tel" required placeholder="Ej. 11 2345 6789"><p class="input-help">Se guarda en privado. Solo lo compartimos si vos autorizás el contacto.</p>`:''}<label class="form-label">Correo electrónico</label><input type="email" name="email" placeholder="tu@email.com" autocomplete="email" required>${!reset?`<label class="form-label">Contraseña</label><input type="password" name="password" minlength="${reg?12:8}" placeholder="${reg?'12 caracteres, letras y números':'Tu contraseña'}" autocomplete="${reg?'new-password':'current-password'}" required>`:''}${CAPTCHA_SITE_KEY?'<div class="turnstile-holder" id="auth-turnstile" aria-label="Verificación de seguridad"></div>':''}<div class="form-error" role="alert" hidden></div><div class="form-note">${icon('lock')} Tu correo y teléfono no se publican. Las confirmaciones por email necesitan que el servicio de correo esté habilitado.</div><button class="submit" type="submit">${reset?'Enviar enlace de recuperación':reg?'Crear cuenta':'Iniciar sesión'}</button></form><button class="menu-btn" style="margin-top:12px" data-action="auth-reset">¿Olvidaste tu contraseña?</button></div>`,true);
 if(CAPTCHA_SITE_KEY)renderAuthCaptcha();
}
async function doAuth(form){
 if(!db){inlineError(form,'La conexión con Supabase no está disponible.');return}
 const fd=new FormData(form),mode=fd.get('mode'),email=String(fd.get('email')||'').trim(),password=String(fd.get('password')||''),name=String(fd.get('name')||'').trim(),phone=String(fd.get('phone')||'').trim();
 const old=form.querySelector('.form-error');if(old)old.hidden=true;
 if(mode==='register'&&!phoneValid(phone)){inlineError(form,'Ingresá un número de celular válido (10 a 15 dígitos, con característica).');return}
 if(CAPTCHA_SITE_KEY&&!authCaptchaToken){inlineError(form,'Completá la verificación de seguridad antes de continuar.');return}
 const captchaOptions=CAPTCHA_SITE_KEY?{captchaToken:authCaptchaToken}:{};
 const submit=form.querySelector('[type=submit]'),done=busy(submit,mode==='register'?'Creando cuenta...':mode==='reset'?'Enviando correo...':'Ingresando...');
 try{
  if(mode==='reset'){
   const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:SITE_URL,...captchaOptions});if(error)throw error;
   show(`<div class="form-content center-success">${icon('check')}<h2>Revisá tu correo</h2><p>Si el correo corresponde a una cuenta, recibirás instrucciones para recuperar tu contraseña.</p><button class="submit" data-action="auth-login">Volver a ingresar</button></div>`,true);return;
  }
  if(mode==='register'){
   if(name.length<2||password.length<12||!/[a-z]/i.test(password)||!/\d/.test(password))throw new Error('Completá el nombre y elegí una contraseña de al menos 12 caracteres, con letras y números.');
   const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:SITE_URL,data:{display_name:name,contact_phone:phone},...captchaOptions}});if(error)throw error;
   if(data.session){await syncSession(data.session);show(`<div class="form-content center-success">${icon('check')}<h2>¡Bienvenido a Huellitas!</h2><p>Tu cuenta ya está lista para publicar y contactar.</p><button class="submit" data-action="account">Ir a mi cuenta</button></div>`,true)}
   else show(`<div class="form-content center-success">${icon('check')}<h2>Revisá tu correo</h2><p>Te enviamos un enlace para confirmar tu cuenta de Huellitas. Abrilo antes de ingresar. Revisá también la carpeta de correo no deseado.</p><button class="submit" data-action="auth-login">Ya confirmé mi correo</button></div>`,true);
   return;
  }
  const {data,error}=await db.auth.signInWithPassword({email,password,options:captchaOptions});if(error)throw error;
  await syncSession(data.session);close();toast('¡Bienvenido a Huellitas!');
  if(authIntent==='publish'){authIntent=null;publish()}else if(authIntent==='contact'){authIntent=null;requestForm(activePet)}
 }catch(err){inlineError(form,shortError(err,'auth'))}
 finally{resetAuthCaptcha(form);done()}
}
async function syncSession(session){
 currentUser=session?.user||null;noticeCount=0;accountHeader();
 if(!currentUser){hideQuietNotice();isMod=false;notifRows=[];updateBell();await loadFavoriteState();return}
 const {data}=await db.from('hu_moderators').select('user_id').eq('user_id',currentUser.id).maybeSingle();isMod=Boolean(data);
 const {data:profile}=await db.from('hu_profiles').select('user_id').eq('user_id',currentUser.id).maybeSingle();
 if(!profile){const nm=String(currentUser.user_metadata?.display_name||currentUser.email?.split('@')[0]||'Usuario').slice(0,80);if(nm.length>=2)await db.from('hu_profiles').insert({user_id:currentUser.id,display_name:nm})}
 const phone=String(currentUser.user_metadata?.contact_phone||'');
 if(phoneValid(phone)){
  const {data:contact}=await db.from('hu_private_contacts').select('user_id').eq('user_id',currentUser.id).maybeSingle();
  if(!contact)await db.from('hu_private_contacts').insert({user_id:currentUser.id,whatsapp:phone});
 }
 await loadNotifications();
 await loadFavoriteState();
 maybeOpenPushPanel().catch(()=>{});
}

const ADMIN_PUSH_URL = PROJECT_URL + '/functions/v1/huellitas-admin-push';
const isInstalledHuellitas = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isAppleMobile = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
function canUseAdminPush(){
 return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function decodePushKey(text){
 const encoded=String(text||'').replace(/-/g,'+').replace(/_/g,'/');
 const base64=encoded.padEnd(Math.ceil(encoded.length/4)*4,'=');
 return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
}
async function callAdminPush(path,body){
 const session=(await db.auth.getSession()).data.session;
 if(!session?.access_token)throw new Error('Iniciá sesión nuevamente para activar los avisos.');
 const response=await fetch(ADMIN_PUSH_URL+'/'+path,{
  method:'POST',headers:{
   'Content-Type':'application/json',
   'apikey':PUBLISHABLE,
   'Authorization':'Bearer '+session.access_token
  },body:JSON.stringify(body||{})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.error)throw new Error(data.error||'No se pudo completar la operación.');
 return data;
}
async function adminPushSettings(){
 if(!currentUser||!isMod){toast('Solo la cuenta de moderación puede activar estos avisos.');return}
 const compatible=canUseAdminPush();
 let enabled=false;
 if(compatible){
  try{
   const registration=await navigator.serviceWorker.getRegistration('/');
   enabled=Boolean(await registration?.pushManager?.getSubscription());
  }catch(_){}
 }
 const needsHomeScreen=isAppleMobile()&&!isInstalledHuellitas();
 const denied=compatible&&Notification.permission==='denied';
 show('<div class="form-content"><span class="modal-label">'+icon('bell')+' AVISOS DE ADMINISTRACIÓN</span>'+
  '<h2>Avisos en este dispositivo</h2>'+
  '<p class="form-subtitle">Recibí una notificación cuando haya mascotas nuevas para aprobar o publicaciones reportadas, incluso con Huellitas cerrada.</p>'+
  '<div class="push-status">'+icon('bell')+' '+(enabled?'Notificaciones activadas':denied?'Notificaciones bloqueadas':'Notificaciones desactivadas')+'</div>'+
  (needsHomeScreen?'<p class="push-instructions">En iPhone, abrí Huellitas desde Safari, tocá Compartir → Agregar a pantalla de inicio y después abrila desde el ícono para activar las notificaciones.</p>':'')+
  (!compatible?'<p class="push-instructions">Este navegador no permite notificaciones push. Probá desde Huellitas instalada en la pantalla de inicio.</p>':'')+
  (denied?'<p class="push-instructions">Los permisos están bloqueados. Habilitá las notificaciones de Huellitas desde Ajustes del iPhone.</p>':'')+
  (compatible&&!needsHomeScreen&&!denied?
    (enabled?
     '<button type="button" class="submit" data-action="push-test">'+icon('bell')+' Enviar notificación de prueba</button>'+
     '<button type="button" class="menu-btn" data-action="push-disable">Desactivar en este dispositivo</button>'
     :'<button type="button" class="submit" data-action="push-enable">'+icon('bell')+' Activar avisos en este dispositivo</button>'
    ):'')+
  '<button type="button" class="menu-btn" data-action="account">Volver a mi cuenta</button>'+
  '<p class="form-caption">Solo reciben estas alertas los dispositivos activados por cuentas moderadoras. No incluyen datos privados de contacto.</p>'+
  '</div>',true);
}
async function activateAdminPush(){
 if(!currentUser||!isMod)return;
 if(!canUseAdminPush()){toast('Este dispositivo no permite notificaciones push.');return}
 if(isAppleMobile()&&!isInstalledHuellitas()){toast('Instalá Huellitas en la pantalla de inicio y abrila desde su ícono.');return}
 try{
  // MUST be called directly from the user-initiated click; no awaits before permission request.
  const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
  if(permission!=='granted'){toast('Necesitás permitir notificaciones para recibir los avisos.');adminPushSettings();return}
  toast('Activando avisos...');
  const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
  await navigator.serviceWorker.ready;
  const keyResponse=await fetch(ADMIN_PUSH_URL+'/public-key',{headers:{apikey:PUBLISHABLE}});
  if(!keyResponse.ok)throw new Error('No pudimos obtener la configuración de avisos.');
  const result=await keyResponse.json();
  if(!result?.publicKey)throw new Error('Falta la clave pública de notificaciones.');
  let subscription=await registration.pushManager.getSubscription();
  let newSubscription=false;
  if(!subscription){
   subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:decodePushKey(result.publicKey)
   });
   newSubscription=true;
  }
  try{await callAdminPush('subscribe',subscription.toJSON())}
  catch(e){if(newSubscription)await subscription.unsubscribe().catch(()=>{});throw e}
  toast('Avisos activados en este dispositivo.');
  await adminPushSettings();
 }catch(e){toast('No pudimos activar los avisos: '+(e?.message||'Reintentá'))}
}
async function disableAdminPush(silent=false){
 if(!canUseAdminPush())return;
 try{
  const registration=await navigator.serviceWorker.getRegistration('/');
  const subscription=await registration?.pushManager?.getSubscription();
  if(subscription){
   try{if(currentUser&&isMod)await callAdminPush('unsubscribe',{endpoint:subscription.endpoint})}
   catch(e){console.warn('No se pudo borrar la suscripción remota',e?.message)}
   await subscription.unsubscribe();
  }
  if(!silent){toast('Avisos desactivados en este dispositivo.');await adminPushSettings()}
 }catch(e){if(!silent)toast('No pudimos desactivar las notificaciones: '+(e?.message||'Reintentá'))}
}
async function testAdminPush(){
 if(!currentUser||!isMod)return;
 try{
  toast('Enviando notificación de prueba...');
  const result=await callAdminPush('test',{});
  if(result.ok)toast('Prueba enviada. Revisá las notificaciones de tu iPhone.');
  else toast('No pudimos entregar la notificación de prueba.');
 }catch(e){toast('La prueba falló: '+(e?.message||'Reintentá'))}
}
let pushDeepLinkOpened=false;
async function maybeOpenPushPanel(){
 if(pushDeepLinkOpened||!isMod||!currentUser)return;
 const target=new URLSearchParams(window.location.search).get('panel');
 if(target!=='moderacion'&&target!=='reportes')return;
 pushDeepLinkOpened=true;
 if(target==='reportes')await moderationReports();else await moderation();
}

function accountMenu(){if(!currentUser){auth();return}
 show(`<div class="form-content"><span class="modal-label">${icon('user')} MI CUENTA</span><h2>¡Hola!</h2><p class="form-subtitle">${safe(currentUser.email)}</p><div class="request-list"><button class="menu-btn" data-action="notifications">${icon('bell')} Notificaciones ${noticeCount?`<strong class="pill-count">${noticeCount}</strong>`:''}</button><button class="menu-btn" data-action="my-posts">${icon('paw')} Mis publicaciones</button><button class="menu-btn" data-action="my-favorites">${icon('heart')} Mis favoritos</button><button class="menu-btn" data-action="my-requests">${icon('heart')} Mis solicitudes</button><button class="menu-btn" data-action="my-contact">${icon('user')} Mi contacto privado</button>${isMod?`<button class="menu-btn" data-action="moderation">${icon('shield')} Panel de moderación</button><button class="menu-btn" data-action="push-settings">${icon('bell')} Avisos en mi iPhone / dispositivo</button>`:''}<button class="menu-btn" data-action="publish">${icon('plus')} Publicar mascota</button><button class="menu-btn" data-action="logout">Cerrar sesión</button></div><p class="form-caption">Nadie ve tus datos de contacto a menos que decidas compartirlos con una persona tras aceptar su solicitud.</p></div>`,true)
}
async function myContact(){
 if(!currentUser){auth();return}
 const {data,error}=await db.from('hu_private_contacts').select('whatsapp').eq('user_id',currentUser.id).maybeSingle();
 if(error){toast(shortError(error));return}
 show(`<div class="form-content"><span class="modal-label">${icon('lock')} CONTACTO PRIVADO</span><h2>Tu número de contacto</h2><p class="form-subtitle">Usaremos este número solo si aceptás compartirlo con una persona que te contactó. Nunca será público.</p><form id="my-contact-form"><label class="form-label">Celular / WhatsApp</label><input type="tel" name="phone" inputmode="tel" required autocomplete="tel" value="${safe(data?.whatsapp||'')}" placeholder="Ej. 11 2345 6789"><div class="form-error" role="alert" hidden></div><button class="submit" type="submit">Guardar mi contacto</button></form><button class="menu-btn" data-action="account">Volver</button></div>`,true)
}
async function saveMyContact(form){
 const phone=String(new FormData(form).get('phone')||'').trim();if(!phoneValid(phone)){inlineError(form,'Ingresá un celular válido con 10 a 15 dígitos.');return}
 const done=busy(form.querySelector('[type=submit]'),'Guardando...');try{const {error}=await db.from('hu_private_contacts').upsert({user_id:currentUser.id,whatsapp:phone},{onConflict:'user_id'});if(error)throw error;toast('Tu contacto quedó guardado en privado.');accountMenu()}catch(e){inlineError(form,shortError(e))}finally{done()}
}
function startContact(){if(!activePet)return;if(currentUser?.id===activePet.owner_id){toast('Esta publicación es tuya. No podés enviarte una solicitud.');myPosts();return}if(!currentUser){authIntent='contact';auth('register');return}requestForm(activePet)}
function requestForm(p){if(!p)return;activePet=p;const found=p.status==='found',lost=p.status==='lost',adopt=p.status==='adoption';show(`<div class="form-content"><span class="modal-label">${icon('lock')} SOLICITUD PRIVADA</span><h2>${adopt?'Quiero adoptar a':lost?'Tengo información sobre':'Creo que es mi mascota:'} ${safe(p.name)}</h2><p class="form-subtitle">El responsable recibirá tu solicitud de forma privada. Ningún teléfono ni correo se compartirá automáticamente.</p><form id="request-form"><label class="form-label">${adopt?'Contanos por qué querés adoptar':lost?'¿Dónde y cuándo la viste?':'Contanos cómo podemos verificar que es tu mascota'}</label><textarea name="message" minlength="20" maxlength="2000" required placeholder="Escribí tu mensaje..."></textarea>${found?'<label class="form-label">Prueba de propiedad (obligatoria)</label><textarea name="proof" minlength="20" maxlength="2000" required placeholder="Mencioná alguna característica que no figura en el aviso, o cómo podrías demostrarlo con fotografías anteriores."></textarea>':''}<div class="form-note">${icon('shield')} No compartas documentos de identidad ni información sensible en el mensaje.</div><button type="submit" class="submit">Enviar solicitud privada</button></form></div>`,true)}
async function submitRequest(form){if(!currentUser||!activePet){auth('register');return}if(activePet.owner_id===currentUser.id){toast('No podés contactar tu propia publicación.');return}const fd=new FormData(form),message=String(fd.get('message')||'').trim(),proof=String(fd.get('proof')||'').trim();if(message.length<20){toast('Escribí un mensaje de al menos 20 caracteres');return}if(activePet.status==='found'&&proof.length<20){toast('Contanos cómo demostrarías que es tu mascota');return}const btn=form.querySelector('[type=submit]');btn.disabled=true;try{const {error}=await db.from('hu_contact_requests').insert({post_id:activePet.id,requester_id:currentUser.id,message,ownership_proof:proof||null});if(error)throw error;close();toast('Solicitud enviada. Podés seguirla en Mi cuenta → Mis solicitudes.')}catch(e){toast(e.code==='23505'?'Ya enviaste una solicitud para esta mascota.':e.message)}finally{btn.disabled=false}}
async function findShares(ids){
 if(!ids.length)return new Map();
 const {data,error}=await db.from('hu_contact_shares').select('request_id,from_user_id,to_user_id,phone').in('request_id',ids);
 if(error){console.warn('No se pudieron cargar los contactos autorizados:',error.message);return new Map()}
 const m=new Map();for(const r of data||[]){if(!m.has(r.request_id))m.set(r.request_id,[]);m.get(r.request_id).push(r)}return m;
}
function phoneLink(v){let digits=v.replace(/\D/g,'');if(digits.length===10)digits='549'+digits;else if(digits.startsWith('54')&&digits.length===12)digits='549'+digits.slice(2);return `<a class="contact-link" target="_blank" rel="noopener noreferrer" href="https://wa.me/${digits}">${icon('phone')} Escribir por WhatsApp</a>`}
async function myRequests(){
 if(!currentUser){auth();return}
 const {data,error}=await db.from('hu_contact_requests').select('id,post_id,message,status,created_at').eq('requester_id',currentUser.id).order('created_at',{ascending:false});
 if(error){toast(shortError(error));return}
 requests=data||[];
 const shares=await findShares(requests.map(r=>r.id));
 show(`<div class="form-content"><span class="modal-label">${icon('heart')} MI CUENTA</span><h2>Mis solicitudes</h2><p class="form-subtitle">Acá ves la respuesta y, si la otra persona lo autorizó, sus datos de contacto.</p><div class="request-list">${requests.map(r=>{
  const list=shares.get(r.id)||[],others=list.filter(x=>x.from_user_id!==currentUser.id),shared=list.some(x=>x.from_user_id===currentUser.id);
  return `<article class="request-item"><div class="request-head"><b>Solicitud del ${new Date(r.created_at).toLocaleDateString('es-AR')}</b><span class="state-pill ${r.status}">${statusText[r.status]||safe(r.status)}</span></div><p>${safe(r.message)}</p>${r.status==='accepted'?`<div class="request-response">${icon('check')} Tu solicitud fue aceptada.${others.length?`<p><strong>Contacto compartido voluntariamente:</strong><br>${safe(others[0].phone)}</p>${phoneLink(others[0].phone)}`:'<p>La persona aún no compartió su contacto. Podés compartir el tuyo si querés que se comunique.</p>'}</div>${!shared?`<button class="soft-action" data-action="share-my-contact" data-id="${r.id}" data-return="requests">${icon('phone')} Compartir mi WhatsApp</button>`:`<small>Tu WhatsApp ya fue compartido. <button class="text-action" data-action="revoke-share" data-return="requests" data-id="${r.id}">Dejar de compartir</button></small>`}`:''}</article>`
 }).join('')||'<div class="request-item"><p>Todavía no enviaste solicitudes.</p></div>'}</div><button class="submit" data-action="account">Volver a mi cuenta</button></div>`,true)
}
async function myPosts(){if(!currentUser){auth();return}const {data,error}=await db.from('hu_pet_posts').select('id,name,species,sex,age_text,description,category,locality,status,outcome,created_at,approx_lat,approx_lon,search_radius_m').eq('owner_id',currentUser.id).order('created_at',{ascending:false});if(error){toast(error.message);return}mine=data||[];
let rejectionReasons=new Map();
if(mine.some(p=>p.status==='rejected')){
 const {data:reasonRows,error:reasonError}=await db.rpc('hu_my_rejection_reasons');
 if(reasonError)console.warn('Motivos de rechazo no disponibles',reasonError.message);
 else rejectionReasons=new Map((reasonRows||[]).map(row=>[row.post_id,row.reason]));
}
await attachPhotos(mine);show(`<div class="form-content"><span class="modal-label">${icon('paw')} MI CUENTA</span><h2>Mis publicaciones</h2><p class="form-subtitle">Las publicaciones solo aparecen públicamente después de la aprobación.</p><div class="request-list">${mine.map(p=>`<article class="request-item"><b>${safe(p.name)} · ${safe(p.locality)}</b><p>${statusLabel[p.category]}</p><small>${p.photos?.length||0} foto${p.photos?.length===1?'':'s'} · la primera es la portada</small><small>${({pending:'Pendiente de revisión',approved:'Aprobada',rejected:'Rechazada',archived:'Archivada'})[p.status]}${p.outcome!=='active'?' · Resuelta':''}</small>${p.status==='rejected'&&rejectionReasons.has(p.id)?`<div class="post-rejection-reason"><strong>Motivo del rechazo:</strong> ${safe(rejectionReasons.get(p.id))}</div>`:''}<div class="moderation-tools"><button data-action="edit-post" data-id="${p.id}">Editar publicación</button><button data-action="view-inbox" data-id="${p.id}">${icon('heart')} Solicitudes recibidas</button>${p.status==='approved'&&p.outcome==='active'?`<button data-action="resolve-post" data-id="${p.id}">Marcar como ${p.category==='adoption'?'adoptada':'reunida'}</button>`:''}<button class="reject" data-action="delete-post" data-id="${p.id}">Eliminar</button></div></article>`).join('')||'<div class="request-item"><p>Todavía no publicaste ninguna mascota.</p></div>'}</div><button class="submit" data-action="publish">Publicar mascota</button><button class="menu-btn" data-action="account">Volver a mi cuenta</button></div>`,true)}
function editPost(id){
 const p=mine.find(item=>item.id===id);if(!p)return;
 selectedApprox=null;
 const count=p.photos?.length||0,remaining=Math.max(0,3-count);
 const currentImages=p.photos?.length?`<div class="selected-photo-grid saved-photos">${p.photos.map((url,i)=>`<div><span class="selected-photo ${i===0?'cover':''}"><img src="${safe(url)}" alt="Foto ${i+1}"></span><small>${i===0?'PORTADA':'FOTO '+(i+1)}</small></div>`).join('')}</div>`:'<p class="input-help">Sin fotos disponibles</p>';
 show(`<div class="form-content"><span class="modal-label">${icon('paw')} MI PUBLICACIÓN</span><h2>Editar ${safe(p.name)}</h2><p class="form-subtitle">Los cambios vuelven a revisión antes de mostrarse al público. La primera foto sigue siendo la portada.</p><form id="edit-post-form" data-id="${p.id}"><label class="form-label">Nombre</label><input name="name" maxlength="80" required value="${safe(p.name)}"><label class="form-label">Sexo</label><select name="sex" required><option value="male" ${p.sex==='male'?'selected':''}>Macho</option><option value="female" ${p.sex==='female'?'selected':''}>Hembra</option><option value="unknown" ${!p.sex||p.sex==='unknown'?'selected':''}>No sé / no pude identificarlo</option></select>${ageField(p.age_text)}<label class="form-label">Localidad</label><select name="locality">${Object.keys(zoneCenters).map(z=>`<option ${p.locality===z?'selected':''}>${z}</option>`).join('')}</select>${p.category!=='adoption'?locationFields(p.category):''}<label class="form-label">Observaciones y señas particulares</label><textarea name="description" minlength="15" maxlength="3000" required>${safe(p.description)}</textarea><label class="form-label">Fotos actuales (${count}/3)</label>${currentImages}${remaining?`<label class="form-label">Agregar hasta ${remaining} foto${remaining===1?'':'s'} más</label><p class="input-help">Fotos originales de hasta 50 MB, optimizadas antes de subir.</p><input id="photo-input" name="photos" type="file" accept="image/*,.heic,.heif" multiple class="sr-file-input"><label for="photo-input" class="file-picker">${icon('camera')} Agregar fotos</label><div class="upload-preview" id="upload-preview">${icon('camera')} No reemplaza la portada existente.</div>`:'<p class="input-help">Ya llegaste al máximo de tres fotos.</p>'}<div class="form-error" role="alert" hidden></div><button class="submit" type="submit">Guardar cambios</button></form><button class="menu-btn" data-action="my-posts">Volver</button></div>`,true);
 if(p.category!=='adoption'){
  const radius=$('#radius-select');if(radius)radius.value='400';
  setTimeout(()=>initPicker(p),50);
 }
}
async function savePost(form){
 const id=form.dataset.id,p=mine.find(p=>p.id===id);if(!p||!currentUser)return;
 const fd=new FormData(form),name=String(fd.get('name')||'').trim(),description=String(fd.get('description')||'').trim(),files=Array.from(form.querySelector('#photo-input')?.files||[]);
 const count=p.photos?.length||0;
 if(!name||description.length<15||containsContact(description)){inlineError(form,'Revisá el nombre y la descripción. No incluyas datos de contacto.');return}
 if(files.length>3-count){inlineError(form,`Solo podés agregar ${3-count} foto${3-count===1?'':'s'} más.`);return}
 for(const file of files){if(file.size>PHOTO_ORIGINAL_MAX_BYTES||!supportedPhotoFile(file)){inlineError(form,'Elegí JPG, PNG, WebP o HEIC de hasta 50 MB. La foto se optimiza automáticamente para publicar.');return}}
 const sex=String(fd.get('sex')||'unknown');if(!['male','female','unknown'].includes(sex)){inlineError(form,'Seleccioná el sexo de la mascota.');return}
 const ageText=String(fd.get('age_text')||'').trim();if(ageText&&!['Cachorro','Joven','Adulto','Mayor',String(p.age_text||'')].includes(ageText)){inlineError(form,'Seleccioná una edad aproximada válida.');return}
 const changes={name,description,sex,age_text:ageText||null,locality:String(fd.get('locality'))};
 if(p.category!=='adoption'&&selectedApprox){changes.approx_lat=selectedApprox.lat;changes.approx_lon=selectedApprox.lon;changes.search_radius_m=400}
 if(files.length>0&&['approved','rejected'].includes(p.status))changes.status='pending';
 const btn=form.querySelector('[type=submit]'),done=busy(btn,'Guardando...'),uploaded=[];
 try{
  const prepared=[];for(let n=0;n<files.length;n++){btn.innerHTML=`<span class="loading-mini" aria-hidden="true"></span> Preparando foto ${n+1} de ${files.length}...`;prepared.push(await sanitizePhotoUpload(files[n]))}
  const {error}=await db.from('hu_pet_posts').update(changes).eq('id',id).eq('owner_id',currentUser.id);if(error)throw error;
  const {data:existing,error:photoListError}=await db.from('hu_pet_photos').select('position').eq('post_id',id);if(photoListError)throw photoListError;
  const occupied=new Set((existing||[]).map(x=>x.position));
  for(let i=0;i<files.length;i++){
   btn.innerHTML=`<span class="loading-mini" aria-hidden="true"></span> Agregando foto ${i+1} de ${files.length}...`;
   const file=prepared[i],position=[0,1,2].find(x=>!occupied.has(x));if(position==null)throw new Error('Ya se alcanzó el máximo de fotos.');occupied.add(position);
   const path=`${currentUser.id}/${id}/${crypto.randomUUID()}.jpg`;
   const {error:up}=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});if(up)throw up;uploaded.push(path);
   const {error:insert}=await db.from('hu_pet_photos').insert({post_id:id,uploaded_by:currentUser.id,storage_path:path,position});if(insert)throw insert;
  }
  toast('Cambios guardados. La publicación se revisará nuevamente si corresponde.');await refreshPosts();await myPosts();
 }catch(e){if(uploaded.length)await db.storage.from(BUCKET).remove(uploaded);inlineError(form,shortError(e))}
 finally{done()}
}
async function deletePost(id){
 const p=mine.find(item=>item.id===id);
 if(!p||!currentUser)return;
 if(!confirm('¿Eliminar definitivamente la publicación de '+p.name+' y sus fotos? Esta acción no se puede deshacer.'))return;
 const {data:photos,error:listError}=await db.from('hu_pet_photos').select('storage_path').eq('post_id',id);
 if(listError){toast('No pudimos verificar las fotos: '+listError.message);return}
 const paths=(photos||[]).map(x=>x.storage_path);
 // Delete the row first so no approved post can lose its photos while remaining public.
 const {error,count}=await db.from('hu_pet_posts').delete({count:'exact'}).eq('id',id).eq('owner_id',currentUser.id);
 if(error||count!==1){toast('No se pudo eliminar la publicación. No se borraron las fotos.');return}
 if(paths.length){
  const {error:removeError}=await db.storage.from(BUCKET).remove(paths);
  if(removeError)console.warn('Huellitas: orphaned media requires owner/admin cleanup',removeError.message);
 }
 toast('Publicación eliminada correctamente.');
 await refreshPosts();await myPosts();
}

async function inbox(id){
 if(!currentUser)return;
 let post=mine.find(p=>p.id===id);
 if(!post){await myPosts();post=mine.find(p=>p.id===id)}
 if(!post)return;currentInboxId=id;
 const {data,error}=await db.from('hu_contact_requests').select('id,requester_id,message,ownership_proof,status,created_at').eq('post_id',id).order('created_at',{ascending:false});
 if(error){toast(shortError(error));return}
 inboxRequests=data||[];
 const shares=await findShares(inboxRequests.map(r=>r.id));
 show(`<div class="form-content"><span class="modal-label">${icon('bell')} SOLICITUDES RECIBIDAS</span><h2>Consultas por ${safe(post.name)}</h2><p class="form-subtitle">Respondé desde acá. Tu WhatsApp solo se comparte con tu autorización.</p><div class="request-list">${inboxRequests.map(r=>{
  const list=shares.get(r.id)||[],other=list.find(x=>x.from_user_id!==currentUser.id),own=list.some(x=>x.from_user_id===currentUser.id);
  return `<article class="request-item"><div class="request-head"><b>Consulta del ${new Date(r.created_at).toLocaleDateString('es-AR')}</b><span class="state-pill ${r.status}">${statusText[r.status]||safe(r.status)}</span></div><p>${safe(r.message)}</p>${r.ownership_proof?`<p class="proof-text">Verificación declarada: ${safe(r.ownership_proof)}</p>`:''}${r.status==='pending'?`<div class="moderation-tools"><button data-action="accept-open" data-id="${r.id}">Aceptar solicitud</button><button class="reject" data-action="answer-request" data-id="${r.id}" data-status="declined">Rechazar</button></div>`:r.status==='accepted'?`${other?`<p class="request-response"><b>Contacto que te compartieron:</b> ${safe(other.phone)} ${phoneLink(other.phone)}</p>`:''}${own?'<small>Compartiste tu contacto. <button class="text-action" data-action="revoke-share" data-return="inbox" data-id="'+r.id+'">Dejar de compartir</button></small>':`<button class="soft-action" data-action="share-my-contact" data-id="${r.id}" data-return="inbox">${icon('phone')} Compartir mi WhatsApp</button>`}`:''}</article>`
 }).join('')||'<div class="request-item"><p>Todavía no llegaron solicitudes por esta mascota.</p></div>'}</div><button class="submit" data-action="my-posts">Volver</button></div>`,true)
}
async function openAccept(id){
 const r=inboxRequests.find(x=>x.id===id);if(!r)return;
 const {data}=await db.from('hu_private_contacts').select('whatsapp').eq('user_id',currentUser.id).maybeSingle();
 const phone=data?.whatsapp||'';
 show(`<div class="form-content"><span class="modal-label">${icon('check')} RESPONDER SOLICITUD</span><h2>Aceptar esta solicitud</h2><p class="form-subtitle">La persona recibirá una notificación en su campanita.</p><div class="request-item"><p>${safe(r.message)}</p></div>${phone?`<label class="share-consent"><input type="checkbox" id="accept-share-contact"><span>También quiero compartir mi WhatsApp <b>${safe(phone)}</b> solo con esta persona.</span></label>`:`<div class="form-note">No tenés un celular guardado. Podés aceptar ahora y compartir tu contacto más adelante desde Mi cuenta.</div>`}<button class="submit" data-action="confirm-accept" data-id="${id}">Aceptar solicitud</button><button class="menu-btn" data-action="back-inbox">Cancelar</button></div>`,true)
}
async function answerRequest(id,status){
 if(!['accepted','declined'].includes(status))return;
 const consent=status==='accepted'&&Boolean($('#accept-share-contact')?.checked);
 const button=modal.querySelector(`[data-action="confirm-accept"]`),done=busy(button,'Guardando...');
 try{
   const {error}=await db.from('hu_contact_requests').update({status}).eq('id',id).eq('status','pending');if(error)throw error;
   let shareFailed=false;
   if(consent){try{await shareContactNow(id)}catch(e){shareFailed=true;console.warn(e)}}
   toast(shareFailed?'Solicitud aceptada. No se pudo compartir el número: revisá Mi contacto privado.':status==='accepted'?'Solicitud aceptada. Se notificará a la otra persona.':'Solicitud rechazada.');
   await loadNotifications();await inbox(currentInboxId);
 }catch(e){toast(shortError(e))}finally{done()}
}
async function shareContactNow(id){
 const {data:req,error:reqErr}=await db.from('hu_contact_requests').select('id,post_id,requester_id,status').eq('id',id).single();if(reqErr)throw reqErr;
 if(req.status!=='accepted')throw new Error('Primero debe aceptarse la solicitud.');
 const {data:post,error:postErr}=await db.from('hu_pet_posts').select('owner_id').eq('id',req.post_id).single();if(postErr)throw postErr;
 const partner=post.owner_id===currentUser.id?req.requester_id:req.requester_id===currentUser.id?post.owner_id:null;
 if(!partner)throw new Error('No participás en esta solicitud.');
 const {data:personal,error:contactError}=await db.from('hu_private_contacts').select('whatsapp').eq('user_id',currentUser.id).maybeSingle();if(contactError)throw contactError;
 const phone=String(personal?.whatsapp||'');if(!phoneValid(phone))throw new Error('Guardá un número válido en Mi contacto privado.');
 const {error}=await db.from('hu_contact_shares').insert({request_id:id,from_user_id:currentUser.id,to_user_id:partner,phone});if(error)throw error;
 return true;
}
async function promptShareContact(id,where){
 shareReturn=where==='inbox'?'inbox':'requests';
 const {data:personal}=await db.from('hu_private_contacts').select('whatsapp').eq('user_id',currentUser.id).maybeSingle();
 const phone=personal?.whatsapp;
 if(!phone){toast('Antes de compartir, agregá tu celular en Mi contacto privado.');await myContact();return}
 show(`<div class="form-content"><span class="modal-label">${icon('lock')} COMPARTIR CONTACTO</span><h2>Compartir mi WhatsApp</h2><p class="form-subtitle">¿Querés que esta persona pueda contactarte? Solo esta solicitud recibirá tu número.</p><div class="request-response"><strong>${safe(phone)}</strong></div><div class="form-note">Podés dejar de compartirlo después desde la solicitud. No se publicará en la ficha.</div><button class="submit" data-action="confirm-share" data-id="${id}">Sí, compartir mi número</button><button class="menu-btn" data-action="${shareReturn==='inbox'?'back-inbox':'my-requests'}">Cancelar</button></div>`,true)
}
async function confirmShare(id){
 const btn=modal.querySelector('[data-action="confirm-share"]'),done=busy(btn,'Compartiendo...');
 try{await shareContactNow(id);toast('Tu contacto quedó disponible solo para esa solicitud.');shareReturn==='inbox'?await inbox(currentInboxId):await myRequests()}
 catch(e){toast(shortError(e))}finally{done()}
}
async function revokeShare(id,where){
 const {error}=await db.from('hu_contact_shares').delete().eq('request_id',id).eq('from_user_id',currentUser.id);
 if(error){toast(shortError(error));return}
 toast('Dejaste de compartir tu contacto en esta solicitud.');
 if(where==='inbox')await inbox(currentInboxId);else await myRequests();
}
async function resolvePost(id){const post=mine.find(p=>p.id===id);if(!post)return;const {error}=await db.from('hu_pet_posts').update({outcome:post.category==='adoption'?'adopted':'reunited'}).eq('id',id);if(error){toast(shortError(error));return}toast('¡Gracias! El aviso quedó resuelto y se retiró de las búsquedas.');await refreshPosts();await myPosts()}
async function moderation(){if(!isMod){toast('Acceso reservado a moderación');return}const {data,error}=await db.from('hu_pet_posts').select('id,name,description,species,category,locality,status,is_featured,created_at,owner_id,approx_lat,approx_lon,search_radius_m').in('status',['pending','approved','rejected']).order('created_at',{ascending:false}).limit(100);if(error){toast(error.message);return}modPosts=data||[];await attachPhotos(modPosts);show(`<div class="form-content"><span class="modal-label">${icon('shield')} PANEL DE MODERACIÓN</span><h2>Revisión de avisos</h2><p class="form-subtitle">Solo las publicaciones aprobadas pueden verse públicamente. Revisá fotos y texto antes de aprobar. Para destacar en el banner, asegurate de que la portada muestre a la mascota; evitá capturas, logos o selfies.</p><button class="menu-btn" data-action="mod-reports">${icon('shield')} Revisar reportes de usuarios</button><div class="request-list">${modPosts.map(p=>`<article class="request-item"><b>${safe(p.name)} · ${safe(p.locality)}</b>${p.photos?.length?`<div class="mod-photo-grid">${p.photos.map((url,i)=>`<div><img src="${safe(url)}" alt="Foto ${i+1} a revisar"><small>${i===0?'Portada':`Foto ${i+1}`}</small></div>`).join('')}</div>`:''}<p>${safe(p.description)}</p>${p.approx_lat!=null?`<small>Zona aproximada: ${safe(p.locality)} · radio ${radiusLabel(p.search_radius_m)}</small>`:''}<small>${safe(p.status)} · ${statusLabel[p.category]}</small><div class="moderation-tools">${p.status==='pending'?`<button data-action="mod-post" data-status="approved" data-id="${p.id}">Aprobar</button><button class="reject" data-action="mod-post" data-status="rejected" data-id="${p.id}">Rechazar</button>`:''}${p.status==='approved'?`<button data-action="feature-post" data-id="${p.id}" data-feature="${!p.is_featured}">${p.is_featured?'Quitar del banner':'Destacar en banner'}</button>`:''}</div></article>`).join('')||'<div class="request-item"><p>No hay publicaciones para revisar.</p></div>'}</div><button class="submit" data-action="account">Volver</button></div>`,true)}
function rejectPostPrompt(id){
 if(!isMod||!currentUser)return;
 const post=modPosts.find(p=>p.id===id&&p.status==='pending');
 if(!post){toast('Esta publicación ya no está pendiente de revisión.');moderation();return}
 show('<div class="form-content">'+
  '<span class="modal-label">'+icon('shield')+' REVISIÓN DE PUBLICACIONES</span>'+
  '<h2>Rechazar publicación</h2>'+
  '<p class="form-subtitle">Indicá brevemente por qué rechazás la publicación de <strong>'+safe(post.name)+'</strong>. El responsable verá este motivo en Mis publicaciones.</p>'+
  '<form id="reject-post-form" data-id="'+safe(post.id)+'">'+
  '<label class="form-label" for="reject-post-reason">Motivo del rechazo</label>'+
  '<textarea id="reject-post-reason" name="reason" maxlength="220" minlength="6" rows="3" required placeholder="Ej.: La segunda foto no muestra a la mascota. Reemplazala y volvé a enviarla."></textarea>'+
  '<p class="input-help">Entre 6 y 220 caracteres. No incluyas teléfonos ni datos personales.</p>'+
  '<div class="form-error" role="alert" hidden></div>'+
  '<button class="submit" type="submit">Confirmar rechazo</button>'+
  '</form><button class="menu-btn" data-action="moderation">Cancelar y volver</button></div>',true);
}
async function submitRejection(form){
 if(!isMod||!currentUser)return;
 const id=form.dataset.id,post=modPosts.find(p=>p.id===id&&p.status==='pending');
 if(!post){inlineError(form,'Esta publicación ya no está pendiente. Volvé al panel y actualizá.');return}
 const reason=String(new FormData(form).get('reason')||'').replace(/\s+/g,' ').trim();
 if(reason.length<6||reason.length>220){inlineError(form,'Escribí un motivo de entre 6 y 220 caracteres.');return}
 const button=form.querySelector('[type=submit]'),done=busy(button,'Rechazando...');
 try{
  const {data,error}=await db.from('hu_pet_posts').update({
   status:'rejected',review_note:reason,is_featured:false,
   reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()
  }).eq('id',id).eq('status','pending').select('id');
  if(error)throw error;
  if(!data?.length){inlineError(form,'Este aviso ya fue revisado. Volvé al panel para actualizar.');return}
  toast('Publicación rechazada. El usuario podrá ver el motivo.');
  await refreshPosts();
  await moderation();
 }catch(error){inlineError(form,shortError(error))}
 finally{done()}
}

async function moderate(id,status){if(!isMod)return;const changes={status,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()};if(status!=='approved')changes.is_featured=false;const {error}=await db.from('hu_pet_posts').update(changes).eq('id',id);if(error){toast(error.message);return}toast(status==='approved'?'Publicación aprobada':'Publicación rechazada');await refreshPosts();moderation()}
async function featurePost(id,flag){if(!isMod)return;const {error}=await db.from('hu_pet_posts').update({is_featured:flag}).eq('id',id);if(error){toast(error.message);return}toast(flag?'Destacada en el banner':'Retirada del banner');await refreshPosts();moderation()}
function locationFields(category='adoption'){
 const visible=category!=='adoption';
 return `<div id="location-fields" ${visible?'':'hidden'}><div class="map-section"><div class="private-label">${icon('pin')} ¿En qué zona se perdió o se encontró?</div><p class="map-picker-help">1. Tocá el mapa, arrastrá el marcador o mové el mapa y pulsá «Usar centro». No usamos tu GPS ni mostramos una dirección exacta.</p><div id="area-map" class="pet-map" role="application" aria-label="Mapa para elegir la zona aproximada"></div><div class="map-picker-actions"><button type="button" class="map-pick-primary" data-action="map-use-center">${icon('pin')} Usar centro del mapa</button><button type="button" data-action="map-reset-center">Centrar en localidad</button></div><input type="hidden" name="radius_m" id="radius-select" value="400"><p id="location-hint" class="map-note">La zona de búsqueda se marca en un radio aproximado de 400 metros.</p></div></div>`;
}

function ageField(value=''){
 const age=String(value||'').trim();
 const options=['Cachorro','Joven','Adulto','Mayor'];
 const unknown=age&&!options.includes(age)?'<option selected value="'+safe(age)+'">'+safe(age)+'</option>':'';
 return '<label class="form-label">Edad aproximada (opcional)</label>'+
  '<select name="age_text"><option value="" '+(!age?'selected':'')+'>No sé / No quiero indicar</option>'+
  options.map(opt=>'<option value="'+opt+'" '+(age===opt?'selected':'')+'>'+opt+'</option>').join('')+unknown+'</select>'+
  '<p class="input-help">Si no sabés la edad, podés dejarla sin indicar.</p>';
}

function publish(){
 if(!currentUser){authIntent='publish';auth('register');return}
 selectedApprox=null;
 show(`<div class="form-content"><span class="modal-label">${icon('plus')} NUEVA PUBLICACIÓN</span><h2>Contanos su historia</h2><p class="form-subtitle">Subí hasta 3 fotos. La primera será la portada que aparece en los avisos y, si lo destacamos, en el banner. Elegí una foto clara de la mascota, sin capturas de pantalla, selfies ni logos.</p><form id="pet-form"><label class="form-label">Nombre de la mascota</label><input name="name" maxlength="80" required placeholder="Ej. Firulais"><label class="form-label">¿Qué necesitás publicar?</label><select name="status"><option value="adoption">En adopción</option><option value="lost">Se perdió mi mascota</option><option value="found">Encontré una mascota</option></select><label class="form-label">Especie</label><select name="species"><option value="dog">Perro</option><option value="cat">Gato</option></select><label class="form-label">Sexo</label><select name="sex" required><option value="" selected disabled>Seleccioná una opción</option><option value="male">Macho</option><option value="female">Hembra</option><option value="unknown">No sé / no pude identificarlo</option></select>${ageField()}<label class="form-label">Localidad</label><select name="area"><option>San Miguel</option><option>Muñiz</option><option>Bella Vista</option><option>Los Polvorines</option><option>José C. Paz</option><option>Grand Bourg</option></select>${locationFields()}<label class="form-label">Fotos de la mascota (de 1 a 3)</label><p class="input-help">Podés elegir fotos originales del iPhone (HEIC, JPG, PNG o WebP) de hasta 50 MB. Las optimizamos automáticamente antes de subirlas.</p><input id="photo-input" name="photos" type="file" accept="image/*,.heic,.heif" multiple required class="sr-file-input"><label for="photo-input" class="file-picker">${icon('camera')} Seleccionar fotos</label><div class="upload-preview" id="upload-preview">${icon('camera')} Elegí hasta 3 fotos. La primera será la portada.</div><label class="form-label">Observaciones y señas particulares</label><textarea name="description" maxlength="3000" minlength="15" required placeholder="Color, tamaño, características, cómo es, dónde fue visto y cómo podemos ayudar..."></textarea><div class="form-error" hidden role="alert"></div><div class="form-note">${icon('shield')} La publicación y las fotos pasan por moderación. No incluyas teléfonos, correos, direcciones exactas ni documentos personales.</div><button type="submit" class="submit">Enviar a revisión</button></form></div>`,true)
}
function updateLocationVisibility(){
 const form=$('#pet-form');if(!form)return;
 const visible=form.querySelector('[name="status"]')?.value!=='adoption';
 const box=$('#location-fields');if(box)box.hidden=!visible;
 if(!visible){disposeMap();selectedApprox=null;return}
 setTimeout(()=>initPicker(),220);
}
function previewFiles(input){
 const box=$('#upload-preview');if(!box)return;
 const files=Array.from(input.files||[]);
 if(files.length>3){input.value='';box.textContent='Elegí un máximo de 3 fotografías.';toast('Podés subir hasta 3 fotos por mascota.');return}
 box.innerHTML=files.length?`<div class="selected-photo-grid">${files.map((f,i)=>`<div><span class="selected-photo ${i===0?'cover':''}" data-preview="${i}">${icon('camera')}</span><small>${i===0?'PORTADA':'FOTO '+(i+1)}</small><span class="file-name">${safe(f.name)}</span></div>`).join('')}</div>`:`${icon('camera')} Elegí hasta 3 fotos. La primera será la portada.`;
 files.forEach((f,i)=>{if(!supportedPhotoFile(f))return;const ref=URL.createObjectURL(f);const target=box.querySelector(`[data-preview="${i}"]`);if(target){const img=document.createElement('img');img.src=ref;img.alt='Vista previa';img.onload=()=>URL.revokeObjectURL(ref);img.onerror=()=>{URL.revokeObjectURL(ref);target.textContent='Vista previa no disponible'};target.appendChild(img)}else URL.revokeObjectURL(ref)})
}

/** Encode uploaded pictures as new JPEG pixels, discarding original EXIF/GPS metadata.
 * This protects normal site uploads; it is not a server-side inspection of direct API uploads.
 */
const PHOTO_ORIGINAL_MAX_BYTES=50*1024*1024;
function supportedPhotoFile(file){
 const type=String(file?.type||'').toLowerCase(),name=String(file?.name||'').toLowerCase();
 return ['image/jpeg','image/png','image/webp','image/heic','image/heif','image/heic-sequence','image/heif-sequence'].includes(type)
   || (type==='' && /\.(jpe?g|png|webp|heic|heif)$/.test(name));
}
async function sanitizePhotoUpload(file){
 if(!supportedPhotoFile(file)||file.size>PHOTO_ORIGINAL_MAX_BYTES)
   throw new Error('Elegí una foto JPG, PNG, WebP o HEIC de hasta 50 MB. Los archivos RAW/DNG no están admitidos.');
 const ref=URL.createObjectURL(file);
 try{
  const img=new Image();img.decoding='async';img.src=ref;
  try{
   if(typeof img.decode==='function')await img.decode();
   else await new Promise((ok,fail)=>{img.onload=ok;img.onerror=fail});
  }catch(_){
   throw new Error('No pudimos abrir esa imagen. Si es HEIC, probá compartirla como JPG desde Fotos.');
  }
  const w=img.naturalWidth,h=img.naturalHeight;
  if(!w||!h||w*h>55000000)throw new Error('La imagen supera la resolución admitida. Probá otra foto.');
  const ratio=Math.min(1,2000/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('No se pudo optimizar la imagen en este dispositivo.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let blob=null;
  for(const quality of [0.88,0.76,0.64]){
   blob=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg',quality));
   if(blob&&blob.size<=5*1024*1024)break;
  }
  canvas.width=canvas.height=0;
  if(!blob?.size||blob.size>5*1024*1024)throw new Error('No se pudo optimizar esta foto. Elegí otra imagen.');
  const base=String(file.name||'mascota').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'_').slice(0,50)||'mascota';
  return new File([blob],base+'.jpg',{type:'image/jpeg',lastModified:Date.now()});
 }finally{URL.revokeObjectURL(ref)}
}

function containsContact(text){return /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(text)||/(?:\+?54[\s.-]?)?(?:\(?0?11\)?|\(?0?2\d{2,3}\)?)[\s.-]?\d{3,4}[\s.-]?\d{4}/.test(text)}
async function submitPost(form){
 if(!currentUser){auth('register');return}
 const fd=new FormData(form),name=String(fd.get('name')||'').trim(),description=String(fd.get('description')||'').trim(),type=String(fd.get('status')),files=Array.from($('#photo-input')?.files||[]);
 if(!name||description.length<15){inlineError(form,'Completá el nombre y una descripción de al menos 15 caracteres.');return}
 if(containsContact(description)){inlineError(form,'No incluyas teléfonos o correos en la descripción.');return}
 if(files.length<1||files.length>3){inlineError(form,'Seleccioná entre 1 y 3 fotografías.');return}
 for(const file of files){if(file.size>PHOTO_ORIGINAL_MAX_BYTES||!supportedPhotoFile(file)){inlineError(form,'Elegí JPG, PNG, WebP o HEIC de hasta 50 MB. La foto se optimiza automáticamente para publicar.');return}}
 const ageText=String(fd.get('age_text')||'').trim();if(ageText&&!['Cachorro','Joven','Adulto','Mayor'].includes(ageText)){inlineError(form,'Seleccioná una edad aproximada válida.');return}
 const area=type==='lost'||type==='found'?selectedApprox:null;
 const sex=String(fd.get('sex')||'');if(!['male','female','unknown'].includes(sex)){inlineError(form,'Seleccioná Macho, Hembra o No sé.');return}const row={owner_id:currentUser.id,name,species:String(fd.get('species')),sex,age_text:ageText||null,category:type,description,locality:String(fd.get('area'))};
 if(area){row.approx_lat=area.lat;row.approx_lon=area.lon;row.search_radius_m=400}
 const btn=form.querySelector('[type=submit]'),done=busy(btn,'Creando publicación...');let postId=null;const uploaded=[];
 try{
  btn.innerHTML='<span class="loading-mini" aria-hidden="true"></span> Protegiendo fotos...';
  const prepared=[];for(let n=0;n<files.length;n++){btn.innerHTML=`<span class="loading-mini" aria-hidden="true"></span> Preparando foto ${n+1} de ${files.length}...`;prepared.push(await sanitizePhotoUpload(files[n]))}
  const {data:post,error:insertError}=await db.from('hu_pet_posts').insert(row).select('id').single();if(insertError)throw insertError;postId=post.id;
  for(let i=0;i<files.length;i++){
    btn.innerHTML=`<span class="loading-mini" aria-hidden="true"></span> Subiendo foto ${i+1} de ${files.length}...`;
    const file=prepared[i],path=`${currentUser.id}/${postId}/${crypto.randomUUID()}.jpg`;
    const {error:uploadError}=await db.storage.from(BUCKET).upload(path,file,{cacheControl:'3600',contentType:file.type,upsert:false});if(uploadError)throw uploadError;uploaded.push(path);
    const {error:photoError}=await db.from('hu_pet_photos').insert({post_id:postId,uploaded_by:currentUser.id,storage_path:path,position:i});if(photoError)throw photoError;
  }
  close();toast(`${name}: publicaste ${files.length} foto${files.length===1?'':'s'} y quedó pendiente de revisión.`);await myPosts();
 }catch(e){
  if(uploaded.length)await db.storage.from(BUCKET).remove(uploaded);
  if(postId)await db.from('hu_pet_posts').delete().eq('id',postId).eq('owner_id',currentUser.id);
  inlineError(form,shortError(e));
 }finally{done()}
}
function petUrl(p){return new URL('/?mascota='+encodeURIComponent(p.id),SITE_URL).href}
function petShareUrl(p){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(p?.id||''))?new URL('/api/share?id='+encodeURIComponent(p.id),SITE_URL).href:petUrl(p)}
function shareText(p){const link=petShareUrl(p),name=p.name,zone=p.zone;const line=p.status==='adoption'?`${name} busca hogar en ${zone}. Conocé su historia y ayudanos a encontrarle una familia.`:p.status==='lost'?`¡Se busca a ${name} en ${zone}! Si lo viste o tenés información, ayudá a que vuelva a casa.`:`Encontraron a ${name} en ${zone}. ¿Lo reconocés? Ayudanos a reunirlo con su familia.`;return `Huellitas | ${statusLabel[p.status]}

${line}

Conocé el aviso: ${link}`}

function reportPet(){
 if(!activePet)return;
 if(!currentUser){toast('Para reportar un aviso necesitás iniciar sesión.');auth('login');return}
 const p=activePet;
 show('<div class="form-content"><span class="modal-label">'+icon('shield')+' SEGURIDAD DE LA COMUNIDAD</span>'+
 '<h2>Reportar publicación</h2><p class="form-subtitle">Revisaremos el aviso de '+safe(p.name)+'. El reporte es privado y no se publica.</p>'+
 '<form id="report-pet-form" data-id="'+safe(p.id)+'">'+
 '<label class="form-label">Motivo</label><select name="reason" required>'+
 '<option value="inappropriate">Contenido inapropiado</option>'+
 '<option value="fraud">Sospecha de engaño o estafa</option>'+
 '<option value="duplicate">Publicación duplicada</option>'+
 '<option value="other">Otro problema</option></select>'+
 '<label class="form-label">Contanos qué ocurrió</label>'+
 '<textarea name="details" maxlength="1500" minlength="10" required placeholder="Explicanos el motivo, sin incluir teléfonos ni datos personales."></textarea>'+
 '<p class="input-help">Solo el equipo de moderación puede revisar este reporte.</p>'+
 '<div class="form-error" role="alert" hidden></div>'+
 '<button class="submit" type="submit">Enviar reporte</button></form>'+
 '<button class="menu-btn" data-action="close">Cancelar</button></div>',true);
}
async function submitPetReport(form){
 if(!currentUser){auth('login');return}
 const id=form.dataset.id||'';
 const fd=new FormData(form);
 const reason=String(fd.get('reason')||''),details=String(fd.get('details')||'').trim();
 if(!['inappropriate','fraud','duplicate','other'].includes(reason)||details.length<10||details.length>1500){
   inlineError(form,'Elegí un motivo y explicalo en al menos 10 caracteres.');return;
 }
 const btn=form.querySelector('[type=submit]'),done=busy(btn,'Enviando reporte...');
 try{
   const {error}=await db.from('hu_reports').insert({post_id:id,reporter_id:currentUser.id,reason,details,status:'pending'});
   if(error)throw error;
   show('<div class="form-content center-success">'+icon('check')+
    '<h2>Gracias por avisarnos</h2><p>El reporte quedó pendiente de revisión por el equipo de Huellitas.</p>'+
    '<button class="submit" data-action="close">Cerrar</button></div>',true);
 }catch(e){
   inlineError(form,e?.code==='23505'?'Ya enviaste un reporte sobre esta publicación.':shortError(e));
 }finally{done()}
}
const reportLabels={inappropriate:'Contenido inapropiado',fraud:'Posible estafa',duplicate:'Duplicado',other:'Otro motivo'};
async function moderationReports(){
 if(!isMod){toast('Acceso reservado a moderación');return}
 const {data,error}=await db.from('hu_reports').select('id,post_id,reason,details,status,created_at').order('created_at',{ascending:false}).limit(80);
 if(error){toast('No se pudieron cargar los reportes: '+shortError(error));return}
 const items=data||[];
 show('<div class="form-content"><span class="modal-label">'+icon('shield')+' MODERACIÓN</span>'+
 '<h2>Reportes de la comunidad</h2><p class="form-subtitle">Revisá las alertas antes de tomar decisiones. Los reportes no se muestran públicamente.</p>'+
 '<div class="request-list">'+(items.map(r=>'<article class="request-item">'+
 '<b>'+safe(reportLabels[r.reason]||'Reporte')+'</b>'+
 '<small> '+safe(new Date(r.created_at).toLocaleDateString('es-AR'))+' · '+safe(r.status)+'</small>'+
 '<p>'+safe(r.details||'Sin detalles')+'</p>'+
 '<div class="moderation-tools">'+(r.status==='pending'?'<button data-action="mod-report-update" data-id="'+safe(r.id)+'" data-status="reviewing">En revisión</button>':'')+
 (r.status!=='resolved'?'<button data-action="mod-report-update" data-id="'+safe(r.id)+'" data-status="resolved">Marcar revisado</button>':'')+
 '</div></article>').join('')||'<p class="request-item">No hay reportes pendientes.</p>')+'</div>'+
 '<button class="submit" data-action="moderation">Volver a moderación</button></div>',true);
}
async function moderateReport(id,status){
 if(!isMod||!['reviewing','resolved'].includes(status))return;
 const {error}=await db.from('hu_reports').update({status}).eq('id',id);
 if(error){toast('No se pudo actualizar el reporte: '+shortError(error));return}
 toast('Estado del reporte actualizado');await moderationReports();
}

function share(p){if(!p)return;activePet=p;show(`<div class="form-content"><span class="modal-label">${icon('share')} COMPARTIR HUELLITAS</span><h2>Ayudá a ${safe(p.name)}</h2><p>Compartí su historia para que llegue a más personas.</p><div class="request-summary">${p.img?`<img src="${safe(p.img)}" alt="${safe(p.name)}">`:icon('paw')}<div><strong>${safe(p.name)}</strong><span>${statusLabel[p.status]} · ${safe(p.zone)}</span></div></div><div class="share-actions"><button class="menu-btn" data-action="share-whatsapp">Compartir por WhatsApp ${icon('arrow')}</button><button class="menu-btn" data-action="share-copy">Copiar enlace individual ${icon('arrow')}</button><button class="menu-btn" data-action="share-flyer">Crear imagen para Instagram ${icon('arrow')}</button><button class="menu-btn" data-action="share-native">Más opciones para compartir ${icon('share')}</button></div><p class="form-caption">Para Instagram generamos una imagen vertical descargable. Los enlaces individuales solo abren avisos aprobados. El contador registra acciones únicas de compartir de cuentas registradas, no envíos confirmados.</p></div>`,true)}
function shareWhatsapp(){if(!activePet)return;const id=activePet.id;window.open('https://wa.me/?text='+encodeURIComponent(shareText(activePet)),'_blank','noopener,noreferrer');recordShareAttempt(id)}
async function copyShare(){if(!activePet)return;try{await navigator.clipboard.writeText(petShareUrl(activePet));recordShareAttempt(activePet.id);toast('Enlace de esta mascota copiado')}catch(e){toast('No se pudo copiar el enlace en este navegador')}}
async function shareNative(){if(!activePet)return;const p=activePet;if(navigator.share){try{await navigator.share({title:`Huellitas — ${p.name}`,text:shareText(p),url:petShareUrl(p)});recordShareAttempt(p.id)}catch(e){if(e.name!=='AbortError')toast('No se pudo compartir')}}else await copyShare()}
async function loadFlyerImage(url){if(!url)return null;try{const img=new Image();img.crossOrigin='anonymous';img.src=url;await img.decode();return img}catch(e){console.warn('Foto para flyer no disponible, se usará diseño alternativo');return null}}
function fitText(ctx,str,maxWidth,size=75){let fontSize=size;while(fontSize>37){ctx.font=`900 ${fontSize}px system-ui,sans-serif`;if(ctx.measureText(str).width<=maxWidth)break;fontSize-=2}return fontSize}
async function generateFlyer(p){const w=1080,h=1920,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx){toast('No se pudo generar la imagen');return}ctx.fillStyle='#174b39';ctx.fillRect(0,0,w,h);ctx.fillStyle='#f5d69a';ctx.font='900 76px system-ui,sans-serif';ctx.fillText('Huellitas.',70,130);ctx.fillStyle='#ffffff';ctx.font='500 30px system-ui,sans-serif';ctx.fillText('CONECTAMOS HISTORIAS',74,175);
const img=await loadFlyerImage(p.img);
const py=215,ph=900;if(img){const r=Math.max(w/img.width,ph/img.height),nw=img.width*r,nh=img.height*r;ctx.drawImage(img,(w-nw)/2,py+(ph-nh)/2,nw,nh)}else{const grad=ctx.createLinearGradient(0,py,w,py+ph);grad.addColorStop(0,'#b3d5b7');grad.addColorStop(1,'#f5e4bf');ctx.fillStyle=grad;ctx.fillRect(0,py,w,ph);ctx.fillStyle='#174b39';ctx.font='bold 190px system-ui,sans-serif';ctx.fillText(p.species==='cat'?'GATO':'PERRO',110,py+480)}
ctx.fillStyle='#174b39';ctx.fillRect(0,1125,w,795);ctx.fillStyle='#f5d69a';ctx.font='900 40px system-ui,sans-serif';ctx.fillText(statusLabel[p.status].toUpperCase(),72,1210);ctx.fillStyle='#ffffff';const nsize=fitText(ctx,p.name,930,92);ctx.font=`900 ${nsize}px system-ui,sans-serif`;ctx.fillText(p.name,70,1325);ctx.font='500 41px system-ui,sans-serif';ctx.fillText(`San Miguel y alrededores · ${p.zone}`,72,1390);
ctx.fillStyle='#f5d69a';ctx.fillRect(69,1438,940,3);ctx.fillStyle='#ffffff';ctx.font='600 35px system-ui,sans-serif';const phrase=p.status==='adoption'?'Ayudanos a encontrarle un hogar.':p.status==='lost'?'Ayudanos a encontrarlo y reunirlo con su familia.':'Ayudanos a encontrar a su familia.';const words=phrase.split(' ');let line='',y=1518;for(const word of words){const cand=line?line+' '+word:word;if(ctx.measureText(cand).width>885&&line){ctx.fillText(line,74,y);y+=49;line=word}else line=cand}if(line)ctx.fillText(line,74,y);
ctx.fillStyle='#f5d69a';ctx.font='800 34px system-ui,sans-serif';ctx.fillText('huellitas-ar.vercel.app',72,1824);ctx.fillStyle='#cfe0d2';ctx.font='400 22px system-ui,sans-serif';ctx.fillText('Buscá esta mascota en Huellitas',72,1865);
// QR drawn locally, pointing to the individual approved post.
try{window.HuQR?.draw(ctx,petUrl(p),812,1670,220)}catch(e){console.warn('QR no disponible',e)}

canvas.toBlob(async blob=>{if(!blob){toast('No pudimos guardar el flyer');return}const filename=`Huellitas_${p.name.replace(/[^a-z0-9_-]/gi,'_')}.png`;const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:`Huellitas · ${p.name}`,text:`${statusLabel[p.status]} en ${p.zone}`});return}catch(e){if(e.name==='AbortError')return}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Imagen generada. Podés usarla en Instagram.')},'image/png')}


// The map is deliberately approximate: only rounded-to-0.01-degree coordinates
// and a circle radius are stored. Never ask for GPS or exact home addresses.
function mapCenter(loc){return zoneCenters[loc]||zoneCenters['San Miguel']}
function radiusLabel(value){const meters=Number(value)||2000;return meters===400?'400 m (aprox. 4 cuadras)':`${meters/1000} km`}
function roundedMapPoint(lat,lng){const scale=1000;return {lat:Math.round(lat*scale)/scale,lon:Math.round(lng*scale)/scale}}
function drawAreaCircle(lat,lng,radius){
 if(!activeMap||!window.L)return;
 if(areaCircle)activeMap.removeLayer(areaCircle);
 areaCircle=L.circle([lat,lng],{radius,color:'#2f7855',fillColor:'#5cad70',fillOpacity:.20,weight:2,interactive:false}).addTo(activeMap);
}
function chooseApproxPoint(lat,lng,moveView=false){
 selectedApprox=roundedMapPoint(lat,lng);
 if(activeMap){
   drawAreaCircle(selectedApprox.lat,selectedApprox.lon,Number($('#radius-select')?.value||400));
   if(areaMarker)areaMarker.setLatLng([selectedApprox.lat,selectedApprox.lon]);
   if(moveView)activeMap.panTo([selectedApprox.lat,selectedApprox.lon]);
 }
 const hint=$('#location-hint');
 if(hint)hint.textContent='La zona de búsqueda se marca en un radio aproximado de 400 metros.';
}
function mapUseCenter(){if(activeMap){const c=activeMap.getCenter();chooseApproxPoint(c.lat,c.lng)}else toast('Elegí primero una localidad.')}
function mapResetCenter(){
 const loc=$('#pet-form [name="area"]')?.value||$('#edit-post-form [name="locality"]')?.value||'San Miguel';
 const c=mapCenter(loc);chooseApproxPoint(c[0],c[1],true);
}
function initPicker(previous=null){
 const node=$('#area-map');if(!node)return;
 disposeMap();
 const form=node.closest('form'),loc=form?.querySelector('[name="area"],[name="locality"]')?.value||'San Miguel';
 const center=mapCenter(loc),initial=previous&&previous.approx_lat!=null?roundedMapPoint(Number(previous.approx_lat),Number(previous.approx_lon)):roundedMapPoint(center[0],center[1]);
 selectedApprox=initial;
 const radius=400;
 if(!window.L){
   node.innerHTML='<p class="map-fallback">El mapa no cargó. Podés usar la localidad y el radio seleccionados. Si querés ajustar la ubicación sobre el mapa, revisá tu conexión.</p>';
   chooseApproxPoint(initial.lat,initial.lon);return;
 }
 activeMap=L.map(node,{scrollWheelZoom:false,zoomControl:true,dragging:true,touchZoom:true,preferCanvas:true}).setView([initial.lat,initial.lon],12);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(activeMap);
 areaMarker=L.marker([initial.lat,initial.lon],{
   draggable:true,
   title:'Arrastrame para ajustar la zona aproximada',
   icon:L.divIcon({className:'hu-map-marker',html:'<span aria-hidden="true"></span>',iconSize:[28,28],iconAnchor:[14,14]})
 }).addTo(activeMap);
 drawAreaCircle(initial.lat,initial.lon,radius);
 activeMap.on('click',e=>chooseApproxPoint(e.latlng.lat,e.latlng.lng));
 areaMarker.on('dragend',()=>{const p=areaMarker.getLatLng();chooseApproxPoint(p.lat,p.lng)});areaMarker.bindTooltip('Arrastrame para elegir la zona',{direction:'top',offset:[0,-19]});
 chooseApproxPoint(initial.lat,initial.lon);
 setTimeout(()=>{if(activeMap&&node.isConnected){activeMap.invalidateSize();if(areaCircle)activeMap.fitBounds(areaCircle.getBounds(),{padding:[34,34],maxZoom:16})}},250);
 setTimeout(()=>{if(activeMap&&node.isConnected)activeMap.invalidateSize()},650);
}

function showAreaMap(p){
 const el=$('#pet-map');if(!el||p.approx_lat==null||p.approx_lon==null)return;
 if(!window.L){el.innerHTML='<p class="map-fallback">Mapa no disponible sin conexión.</p>';return}
 disposeMap();const lat=Number(p.approx_lat),lon=Number(p.approx_lon),radius=Number(p.search_radius_m||2000);
 activeMap=L.map(el,{scrollWheelZoom:false,preferCanvas:true}).setView([lat,lon],12);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(activeMap);
 drawAreaCircle(lat,lon,radius);
 // A visible pin always marks the approximate center; this is a rounded location,
 // not an exact address. Put it in Leaflet's marker pane above the shaded circle.
 L.marker([lat,lon],{
  interactive:false,
  keyboard:false,
  icon:L.divIcon({className:'hu-public-map-marker',html:'<span class="pin-drop" aria-hidden="true"></span>',iconSize:[22,22],iconAnchor:[11,11]})
 }).addTo(activeMap);
 const mapInstance=activeMap;
 function fitPublishedArea(){if(activeMap!==mapInstance||!el.isConnected||!areaCircle)return;activeMap.invalidateSize();activeMap.fitBounds(areaCircle.getBounds(),{padding:[40,40],maxZoom:16})}
 fitPublishedArea();setTimeout(fitPublishedArea,180);setTimeout(fitPublishedArea,490);
}

function areaPostsForMap(){
 return pets.filter(p=>(p.status==='lost'||p.status==='found')&&p.approx_lat!=null&&p.approx_lon!=null
  &&(filter==='all'||p.status===filter)&&(!zone||p.zone===zone)
  &&(!query||(p.name+' '+p.zone+' '+p.short).toLowerCase().includes(query)));
}
function drawOverviewCircles(){
 if(!overviewMap||!window.L)return;
 // Clear previous circles and markers without touching the OpenStreetMap tile layer.
 overviewMap.eachLayer(layer=>{if(layer instanceof L.Circle || (layer instanceof L.Marker && layer.options?.huOverviewPin))overviewMap.removeLayer(layer)});
 const group=L.featureGroup();
 areaPostsForMap().forEach(p=>{
  const marker=L.marker([Number(p.approx_lat),Number(p.approx_lon)],{
   huOverviewPin:true,
   title:'Conocer la historia de '+p.name,
   icon:L.divIcon({className:'hu-public-map-marker',html:'<span class="pin-drop" aria-hidden="true"></span>',iconSize:[22,22],iconAnchor:[11,11]})
  }).addTo(overviewMap);
  marker.bindTooltip(`${safe(p.name)} · ${safe(p.zone)}`);
  marker.on('click',()=>detail(p));
  group.addLayer(marker);
 });
 if(group.getLayers().length)overviewMap.fitBounds(group.getBounds(),{padding:[25,25],maxZoom:15});
 else overviewMap.setView(mapCenter(zone||'San Miguel'),11);
 const note=$('#overview-map-help');if(note)note.hidden=group.getLayers().length>0;
}
function toggleOverviewMap(){
 overviewOpen=!overviewOpen;
 const box=$('#overview-map-section'),button=$('#overview-map-toggle');
 if(!box)return;box.hidden=!overviewOpen;
 if(button)button.innerHTML=overviewOpen?`${icon('x')} Ocultar mapa`:`${icon('pin')} Ver mapa de búsquedas`;
 if(!overviewOpen){if(overviewMap){overviewMap.remove();overviewMap=null}return}
 if(!window.L){const el=$('#overview-map');el.innerHTML='<p class="map-fallback">El mapa necesita conexión a Internet.</p>';return}
 setTimeout(()=>{
  const el=$('#overview-map');if(!el||!overviewOpen)return;
  if(overviewMap)overviewMap.remove();
  overviewMap=L.map(el,{scrollWheelZoom:false,preferCanvas:true}).setView(mapCenter('San Miguel'),11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(overviewMap);
  drawOverviewCircles();overviewMap.invalidateSize();
 },65);
}

function updateBell(){
 const badge=$('#bell-count'),button=$('#notification-button');
 if(!badge||!button)return;badge.hidden=!noticeCount;badge.textContent=noticeCount>9?'9+':String(noticeCount);
 button.setAttribute('aria-label',`Notificaciones: ${noticeCount} sin leer`);
}

let quietNoticeTimer=null;
const quietFallback=new Map();
function quietSeen(uid){
  const key='huellitas_notice_seen_v1_'+uid;
  try{
    const saved=JSON.parse(localStorage.getItem(key)||'[]');
    if(Array.isArray(saved))return saved.filter(x=>typeof x==='string').slice(-160);
  }catch(_){}
  return quietFallback.get(uid)||[];
}
function hideQuietNotice(){
  clearTimeout(quietNoticeTimer);
  const el=$('#quiet-notice');
  if(el){el.classList.remove('is-visible');el.setAttribute('aria-hidden','true');el.tabIndex=-1}
}
function showQuietNotice(){
  if(document.hidden)return;
  let el=$('#quiet-notice');
  if(!el){
    el=document.createElement('button');el.id='quiet-notice';el.type='button';
    el.className='quiet-notice';
    el.innerHTML=icon('bell')+'<span>Nuevo mensaje</span>';
    el.setAttribute('aria-label','Nuevo mensaje. Abrir notificaciones');
    el.addEventListener('click',()=>{hideQuietNotice();notifications()});
    document.body.appendChild(el);
  }
  el.setAttribute('aria-hidden','false');el.tabIndex=0;
  el.classList.add('is-visible');
  clearTimeout(quietNoticeTimer);
  quietNoticeTimer=setTimeout(hideQuietNotice,3000);
}
function notifyOnlyNew(rows){
  if(!currentUser||document.hidden)return;
  const uid=currentUser.id;
  const unread=rows.filter(n=>!n.read_at).map(n=>n.id);
  if(!unread.length)return;
  const seen=quietSeen(uid);
  const already=new Set(seen);
  const hasNew=unread.some(id=>!already.has(id));
  if(!hasNew)return;
  const next=Array.from(new Set([...seen,...unread])).slice(-160);
  quietFallback.set(uid,next);
  try{localStorage.setItem('huellitas_notice_seen_v1_'+uid,JSON.stringify(next))}catch(_){}
  showQuietNotice();
}

async function loadNotifications(){
 if(!currentUser||!db){noticeCount=0;notifRows=[];updateBell();return}
 const {data,error}=await db.from('hu_notifications').select('id,post_id,request_id,kind,read_at,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(50);
 if(error){console.warn('Notificaciones no disponibles',error.message);return}
 notifRows=data||[];noticeCount=notifRows.filter(n=>!n.read_at).length;updateBell();notifyOnlyNew(notifRows);
}
async function notifications(){
 if(!currentUser){auth();return}
 await loadNotifications();
 show(`<div class="form-content"><span class="modal-label">${icon('bell')} AVISOS</span><h2>Notificaciones</h2><p class="form-subtitle">Tus solicitudes y respuestas, sin avisos repetidos después de leerlos.</p><div class="request-list">${notifRows.map(n=>`<button class="notification-item ${n.read_at?'read':''}" data-action="open-notification" data-id="${n.id}"><span class="notif-dot" aria-hidden="true"></span><span><b>${safe(notifierMessages[n.kind]||'Nueva actividad')}</b><small>${new Date(n.created_at).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</small></span>${icon('arrow')}</button>`).join('')||'<div class="request-item"><p>Por ahora no hay novedades. Te avisaremos por acá.</p></div>'}</div>${noticeCount?'<button class="menu-btn" data-action="mark-notices-read">Marcar todas como leídas</button>':''}<button class="submit" data-action="account">Volver a mi cuenta</button></div>`,true);
}
async function openNotification(id){
 const row=notifRows.find(n=>n.id===id);if(!row)return;
 if(!row.read_at){const {error}=await db.from('hu_notifications').update({read_at:new Date().toISOString()}).eq('id',row.id);if(error){toast(shortError(error));return}}
 await loadNotifications();
 if(row.kind==='request_received'){await myPosts();await inbox(row.post_id)}else await myRequests();
}
async function markNoticesRead(){
 const ids=notifRows.filter(n=>!n.read_at).map(n=>n.id);if(!ids.length){notifications();return}
 const {error}=await db.from('hu_notifications').update({read_at:new Date().toISOString()}).in('id',ids);
 if(error){toast(shortError(error));return}await notifications();
}

root.addEventListener('click',e=>{const b=e.target.closest('[data-action],[data-filter]');if(!b)return;if(b.dataset.filter){filter=b.dataset.filter;render();return}const a=b.dataset.action;if(a==='explore'){$('#mascotas').scrollIntoView({behavior:'smooth'});return}if(a==='notifications'){notifications();return}if(a==='toggle-overview-map'){toggleOverviewMap();return}if(a==='publish'){publish();return}if(a==='login'){accountMenu();return}if(a==='toggle-sound'){soundOn=!soundOn;b.innerHTML=icon(soundOn?'volume':'mute')+`<span>Sonidos ${soundOn?'activados':'silenciados'}</span>`;b.setAttribute('aria-pressed',String(soundOn));return}if(a==='hero-open'){if(Date.now()-lastHeroSwipe<450)return;openHero();return}if(a==='hero-dot'){heroIndex=Number(b.dataset.index)||0;renderHero();startHero();return}if(a==='pet-touch'){touchPet(b.dataset.id,b);return}if(a==='detail'){detail(pets.find(p=>p.id===b.dataset.id));return}if(a==='pet-share'){share(pets.find(p=>p.id===b.dataset.id));return}if(a==='my-favorites'){myFavorites();return}if(a==='like'){toggleFavorite(b.dataset.id);return}});
overlay.addEventListener('click',async e=>{if(e.target?.id==='detail-current-photo'){if(Date.now()-lastDetailSwipe<500)return;openPhotoZoom();return}const b=e.target.closest('[data-action]');if(!b){if(e.target===overlay)close();return}const a=b.dataset.action;if(a==='close'){close();return}if(a==='auth-login'||a==='auth-register'||a==='auth-reset'){auth(a.replace('auth-',''));return}if(a==='logout'){if(isMod)await disableAdminPush(true);await db.auth.signOut();currentUser=null;isMod=false;accountHeader();close();toast('Cerraste sesión');return}if(a==='account'){accountMenu();return}if(a==='my-requests'){myRequests();return}if(a==='my-contact'){myContact();return}if(a==='notifications'){notifications();return}if(a==='open-notification'){openNotification(b.dataset.id);return}if(a==='mark-notices-read'){markNoticesRead();return}if(a==='my-posts'){myPosts();return}if(a==='my-favorites'){myFavorites();return}if(a==='favorite-open'){detail(pets.find(p=>p.id===b.dataset.id));return}if(a==='favorite-remove'){if(await toggleFavorite(b.dataset.id))myFavorites();return}if(a==='detail-favorite'&&activePet){toggleFavorite(activePet.id);return}if(a==='push-settings'){adminPushSettings();return}if(a==='push-enable'){activateAdminPush();return}if(a==='push-disable'){disableAdminPush();return}if(a==='push-test'){testAdminPush();return}if(a==='moderation'){moderation();return}if(a==='view-inbox'){inbox(b.dataset.id);return}if(a==='back-inbox'){inbox(currentInboxId);return}if(a==='accept-open'){openAccept(b.dataset.id);return}if(a==='confirm-accept'){answerRequest(b.dataset.id,'accepted');return}if(a==='share-my-contact'){promptShareContact(b.dataset.id,b.dataset.return);return}if(a==='confirm-share'){confirmShare(b.dataset.id);return}if(a==='revoke-share'){revokeShare(b.dataset.id,b.dataset.return);return}if(a==='answer-request'){answerRequest(b.dataset.id,b.dataset.status);return}if(a==='resolve-post'){resolvePost(b.dataset.id);return}if(a==='map-use-center'){mapUseCenter();return}if(a==='map-reset-center'){mapResetCenter();return}if(a==='zoom-photo'){openPhotoZoom();return}if(a==='mod-post'){if(b.dataset.status==='rejected')rejectPostPrompt(b.dataset.id);else moderate(b.dataset.id,b.dataset.status);return}if(a==='feature-post'){featurePost(b.dataset.id,b.dataset.feature==='true');return}if(a==='publish'){publish();return}if(a==='replay'&&activePet){sound(activePet.species);return}if(a==='gallery-prev'){galleryPhoto(activePet,detailPhotoIndex-1);return}if(a==='gallery-next'){galleryPhoto(activePet,detailPhotoIndex+1);return}if(a==='gallery-pick'){galleryPhoto(activePet,Number(b.dataset.photoIndex)||0);return}if(a==='contact'){startContact();return}if(a==='report-post'){reportPet();return}if(a==='mod-reports'){moderationReports();return}if(a==='mod-report-update'){moderateReport(b.dataset.id,b.dataset.status);return}if(a==='share'&&activePet){share(activePet);return}if(a==='share-whatsapp'){shareWhatsapp();return}if(a==='share-copy'){copyShare();return}if(a==='share-native'){shareNative();return}if(a==='share-flyer'&&activePet){generateFlyer(activePet);return}if(a==='edit-post'){editPost(b.dataset.id);return}if(a==='delete-post'){deletePost(b.dataset.id);return}});
overlay.addEventListener('submit',e=>{e.preventDefault();const f=e.target;if(f.id==='auth-form'){doAuth(f);return}if(f.id==='my-contact-form'){saveMyContact(f);return}if(f.id==='pet-form'){submitPost(f);return}if(f.id==='request-form'){submitRequest(f);return}if(f.id==='report-pet-form'){submitPetReport(f);return}if(f.id==='edit-post-form'){savePost(f);return}if(f.id==='reject-post-form'){submitRejection(f);return}});
overlay.addEventListener('change',e=>{
 if(e.target.id==='photo-input'){previewFiles(e.target);return}
 if(e.target.name==='status'){updateLocationVisibility();return}
 if(e.target.name==='area'||e.target.name==='locality'){
   if($('#location-fields')&&!$('#location-fields').hidden){selectedApprox=null;initPicker()}
   return;
 }
 if(e.target.name==='radius_m'&&selectedApprox){chooseApproxPoint(selectedApprox.lat,selectedApprox.lon);return}
});
zoomOverlay.addEventListener('click',e=>{
 const b=e.target.closest('[data-zoom-action]');
 if(!b){if(e.target===zoomOverlay)closePhotoZoom();return}
 if(b.dataset.zoomAction==='close')closePhotoZoom();
 else if(b.dataset.zoomAction==='prev')photoZoomSet(detailPhotoIndex-1);
 else if(b.dataset.zoomAction==='next')photoZoomSet(detailPhotoIndex+1);
});

// Swipe left/right through the enlarged gallery on phones. Vertical gestures
// remain untouched, as do button taps and browser pinch gestures.
let zoomTouchStart=null;
zoomOverlay.addEventListener('touchstart',e=>{
 if(zoomOverlay.hidden||e.touches.length!==1||e.target.closest('button')){zoomTouchStart=null;return}
 const t=e.changedTouches[0];
 zoomTouchStart={id:t.identifier,x:t.clientX,y:t.clientY};
},{passive:true});
zoomOverlay.addEventListener('touchend',e=>{
 if(!zoomTouchStart||zoomOverlay.hidden){zoomTouchStart=null;return}
 const t=[...e.changedTouches].find(x=>x.identifier===zoomTouchStart.id);
 const start=zoomTouchStart;zoomTouchStart=null;
 if(!t)return;
 const dx=t.clientX-start.x,dy=t.clientY-start.y;
 if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.25){
  const photos=activePet?.photos?.length?activePet.photos:(activePet?.img?[activePet.img]:[]);
  if(photos.length>1)photoZoomSet(detailPhotoIndex+(dx<0?1:-1));
 }
},{passive:true});
zoomOverlay.addEventListener('touchcancel',()=>{zoomTouchStart=null},{passive:true});

// The same gesture works inside the pet detail without opening photo zoom.
let detailTouchStart=null,lastDetailSwipe=0;
modal.addEventListener('touchstart',e=>{
 if(e.touches.length!==1||e.target.id!=='detail-current-photo'){detailTouchStart=null;return}
 const t=e.changedTouches[0];detailTouchStart={id:t.identifier,x:t.clientX,y:t.clientY};
},{passive:true});
modal.addEventListener('touchend',e=>{
 if(!detailTouchStart)return;
 const start=detailTouchStart;detailTouchStart=null;
 const t=[...e.changedTouches].find(x=>x.identifier===start.id);
 if(!t)return;
 const dx=t.clientX-start.x,dy=t.clientY-start.y;
 if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.25&&activePet?.photos?.length>1){
  lastDetailSwipe=Date.now();
  galleryPhoto(activePet,detailPhotoIndex+(dx<0?1:-1));
 }
},{passive:true});
modal.addEventListener('touchcancel',()=>{detailTouchStart=null},{passive:true});

modal.addEventListener('keydown',e=>{if(e.target.id==='detail-current-photo'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openPhotoZoom()}});
overlay.addEventListener('click',e=>{if(e.target===overlay)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!zoomOverlay.hidden){closePhotoZoom();return}if(!zoomOverlay.hidden&&e.key==='ArrowLeft'){photoZoomSet(detailPhotoIndex-1);return}if(!zoomOverlay.hidden&&e.key==='ArrowRight'){photoZoomSet(detailPhotoIndex+1);return}if(e.key==='Escape'&&overlay.classList.contains('open'))close()});
$('#search').addEventListener('input',e=>{query=e.target.value.toLowerCase().trim();render()});$('#zone').addEventListener('change',e=>{zone=e.target.value;render()});
const hc=$('#hero-carousel');if(hc){hc.addEventListener('mouseenter',stopHero);hc.addEventListener('mouseleave',startHero);hc.addEventListener('focusin',stopHero);hc.addEventListener('focusout',startHero);let sx=0;hc.addEventListener('touchstart',e=>{sx=e.changedTouches[0]?.screenX||0},{passive:true});hc.addEventListener('touchend',e=>{const dx=(e.changedTouches[0]?.screenX||0)-sx;if(Math.abs(dx)>45){lastHeroSwipe=Date.now();goHero(dx>0?-1:1)}},{passive:true})}
async function bootstrap(){if(!db){toast('Error: biblioteca de conexión no disponible');return}db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='USER_UPDATED'){setTimeout(()=>syncSession(session).catch(()=>{}),0)}if(event==='PASSWORD_RECOVERY'){setTimeout(()=>passwordChange(),0)}});
const {data}=await db.auth.getSession();await syncSession(data.session);await refreshPosts();if(deepLinkId){const sharedPet=pets.find(p=>p.id===deepLinkId);if(sharedPet)detail(sharedPet);else toast('Este aviso no está disponible o todavía no fue aprobado.')}if(window.location.hash.includes('error=')){toast('No se pudo completar la confirmación. Solicitá otro enlace.')}if(!currentUser&&new URLSearchParams(location.search).has('panel'))toast('Ingresá con tu cuenta administradora para revisar los avisos.')
}
function passwordChange(){show(`<div class="form-content"><h2>Elegí una contraseña nueva</h2><form id="new-pass-form"><label class="form-label">Nueva contraseña</label><input name="password" type="password" minlength="8" required autocomplete="new-password"><button type="submit" class="submit">Guardar contraseña</button></form></div>`,true)}
overlay.addEventListener('submit',async e=>{if(e.target.id!=='new-pass-form')return;e.preventDefault();const pwd=new FormData(e.target).get('password');const {error}=await db.auth.updateUser({password:pwd});if(error){toast(error.message);return}close();toast('Contraseña actualizada correctamente')});
render();renderHero();startHero();
window.addEventListener('focus',()=>{if(currentUser)loadNotifications()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentUser)loadNotifications()});
setInterval(()=>{if(currentUser&&!document.hidden)loadNotifications()},25000);
bootstrap().catch(err=>toast('No se pudo conectar con Supabase: '+err.message));

const COMMUNITY_NOTICE_KEY='huellitas_community_rules_ack_v1';
const communityNotice=document.getElementById('community-notice');
function communityNoticeAccepted(){
 try{return localStorage.getItem(COMMUNITY_NOTICE_KEY)==='accepted'}catch(_){return false}
}
function showCommunityNotice(force=false){
 if(!communityNotice || communityNotice.open || (!force&&communityNoticeAccepted()))return;
 try{communityNotice.showModal()}catch(_){communityNotice.setAttribute('open','')}
}
if(communityNotice){
 communityNotice.querySelector('#community-notice-accept')?.addEventListener('click',()=>{
  // Remember only an explicit acknowledgment, not an accidental dismissal.
  try{localStorage.setItem(COMMUNITY_NOTICE_KEY,'accepted')}catch(_){}
  communityNotice.close();
 });
 document.getElementById('community-rules-link')?.addEventListener('click',()=>showCommunityNotice(true));
 // Return visitors who already acknowledged the rules are not interrupted.
 showCommunityNotice();
}

})();