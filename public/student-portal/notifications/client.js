(() => {
 const device=document.getElementById("device"); if(!device)return;
 const status=document.getElementById("device-status"),enable=document.getElementById("enable"),disable=document.getElementById("disable");
 const post=async data=>{
   const r=await fetch("/api/student-portal/notifications",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
   const result=await r.json();if(!r.ok)throw Error(result.error||"Request failed."); return result;
 };
 const key=()=>Uint8Array.from(atob(device.dataset.publicKey.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-device.dataset.publicKey.length%4)%4)),c=>c.charCodeAt(0));
 let registration=null;
 async function refresh(){
   const sub=await registration.pushManager.getSubscription();
   const active=sub&&(await post({action:"status",endpoint:sub.endpoint})).enabled;
   enable.disabled=!!active;disable.disabled=!sub;
   status.textContent=active?"Notifications are enabled on this device.":Notification.permission==="denied"?"Blocked in device settings. Change notification permission to enable.":"Notifications are not enabled on this device.";
 }
 if("serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window){
   navigator.serviceWorker.register("/student-portal/notifications/sw.js",{scope:"/student-portal/notifications/"}).then(async reg=>{
     registration=reg;await navigator.serviceWorker.ready;await refresh();
   }).catch(()=>{status.textContent="Unable to set up this device. Check sign-in and browser settings.";});
 }else status.textContent="Push is not available here. On iPhone, add this page to your Home Screen and open the new app.";
 enable.onclick=async()=>{
   enable.disabled=true; status.textContent="Enabling notifications…";
   let sub,created=false;
   try{
     const permission=await Notification.requestPermission();
     if(permission!=="granted")throw Error("Notification permission was not granted.");
     sub=await registration.pushManager.getSubscription();
     if(!sub){sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key()});created=true;}
     await post({action:"subscribe",subscription:sub.toJSON()});await refresh();
   }catch(e){if(created)await sub?.unsubscribe().catch(()=>{});status.textContent=e.message;enable.disabled=false;}
 };
 disable.onclick=async()=>{
   disable.disabled=true;
   try{const sub=await registration.pushManager.getSubscription();if(sub){await post({action:"unsubscribe",endpoint:sub.endpoint});await sub.unsubscribe();}await refresh();}
   catch(e){status.textContent=e.message;disable.disabled=false;}
 };
 const form=document.getElementById("compose"),progress=document.getElementById("send-status");if(!form)return;
 let busy=false,pendingId=null,pendingFingerprint="";
 async function drain(id){
   let count=0;
   // One owner request per device. Closing the tab leaves unclaimed work resumable.
   while(count<1000){
     const result=await post({action:"deliver",id});
     if(result.done){progress.textContent="Queue processed. Refreshing delivery history…";location.reload();return;}
     count++;progress.textContent="Processed "+count+" device(s) in this session. Keep this page open.";
   }
   progress.textContent="Batch limit reached. Reload and resume pending deliveries.";
 }
 form.onsubmit=async e=>{
   e.preventDefault();if(busy)return;const f=new FormData(form),title=String(f.get("title")),body=String(f.get("body")),audience=String(f.get("audience"));
   if(!confirm("Send "+(audience==="test"?"to your devices only":"to enrolled families who opted in and publish to the portal")+"?\n\n"+title+"\n"+body))return;
   busy=true;form.querySelector("button").disabled=true;
   try{
     const fingerprint=JSON.stringify([title,body,audience]);
     if(fingerprint!==pendingFingerprint){pendingId=crypto.randomUUID();pendingFingerprint=fingerprint;}
     const {id}=await post({action:"publish",id:pendingId,title,body,audience,confirm:true});
     await drain(id);
   }catch(e){progress.textContent=e.message+" Reload to check history and resume pending deliveries; do not create a duplicate announcement.";}
   finally{busy=false;form.querySelector("button").disabled=false;}
 };
 document.querySelectorAll(".resume").forEach(button=>button.onclick=async()=>{
   if(busy)return;busy=true;button.disabled=true;
   try{await drain(button.dataset.id);}catch(e){progress.textContent=e.message+" Reload to check delivery history.";}
   finally{busy=false;button.disabled=false;}
 });
})();
