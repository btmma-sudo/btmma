// No offline cache: private portal data must never be cached by this service worker.
self.addEventListener("push",event=>{
 let n={};try{n=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(
   typeof n.title==="string"?n.title.slice(0,65):"Burning Tree update",
   {body:typeof n.body==="string"?n.body.slice(0,300):"Open your school notifications.",icon:"/images/logo.png",
    tag:typeof n.id==="string"?n.id:"burning-tree-update",data:{url:"/student-portal/notifications/"}}
 ));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil((async()=>{
   const url=new URL("/student-portal/notifications/",self.location.origin).href;
   const tabs=await clients.matchAll({type:"window",includeUncontrolled:true});
   const existing=tabs.find(tab=>tab.url===url);
   if(existing)await existing.focus(); else await clients.openWindow(url);
 })());
});
