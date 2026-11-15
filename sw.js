/* Huellitas admin Web Push, no caching or background location access. */
self.addEventListener('push', event => {
 let payload={};
 try{payload=event.data?event.data.json():{}}catch(_){}
 const title=String(payload.title||'Huellitas · Nuevo aviso').slice(0,110);
 const body=String(payload.body||'Hay una novedad para revisar en Huellitas.').slice(0,230);
 const raw=String(payload.url||'/');
 let url='/';
 try{
  const u=new URL(raw,self.location.origin);
  if(u.origin===self.location.origin)url=u.pathname+u.search;
 }catch(_){}
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'/icon-192.png',badge:'/favicon-64.png',
  tag:String(payload.tag||'hu-admin').slice(0,110),
  data:{url},renotify:true,
  vibrate:[120,65,120]
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const path=String(event.notification?.data?.url||'/');
 const address=new URL(path,self.location.origin);
 if(address.origin!==self.location.origin)return;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin!==self.location.origin)continue;
   try{if('navigate' in client)await client.navigate(address.href)}catch(_){}
   await client.focus();return;
  }
  if(self.clients.openWindow)await self.clients.openWindow(address.href);
 })());
});