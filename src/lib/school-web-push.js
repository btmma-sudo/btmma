// RFC 8291 aes128gcm and RFC 8292 VAPID, using Worker Web Crypto.
// No external API credentials or third-party messaging service.
const encoder = new TextEncoder();
const bytes = text => encoder.encode(text);
export const b64 = value => btoa(String.fromCharCode(...value)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
export const decode = value => {
  if(typeof value!=="string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length>180) throw Error("Invalid key");
  return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)), c=>c.charCodeAt(0));
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let i=0; for(const p of parts){out.set(p,i); i+=p.length;} return out;
};
export function allowedEndpoint(value) {
  if(typeof value!=="string" || value.length>2048) return false;
  try {
    const u=new URL(value), h=u.hostname;
    return u.protocol==="https:" && !u.username && !u.password && !u.port && !u.hash &&
      u.pathname.length>1 && (h==="fcm.googleapis.com" ||
      h==="updates.push.services.mozilla.com" || h==="push.services.mozilla.com" ||
      h.endsWith(".push.apple.com") || h==="push.apple.com" ||
      h==="web.push.apple.com" || h==="wns2-bl2p.notify.windows.com" ||
      h.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export function validatedSubscription(input) {
  try {
    const endpoint=input?.endpoint,p256dh=input?.keys?.p256dh,auth=input?.keys?.auth;
    const pub=decode(p256dh);
    return allowedEndpoint(endpoint)&&pub.length===65&&pub[0]===4&&decode(auth).length===16 ?
      {endpoint,p256dh,auth}:null;
  } catch { return null; }
}
export function pushConfig(env) {
  if(env?.SCHOOL_NOTIFICATIONS_ENABLED!=="true") return null;
  try {
    const key=JSON.parse(env.SCHOOL_PUSH_VAPID_PRIVATE_JWK);
    if(key.kty!=="EC"||key.crv!=="P-256"||decode(key.x).length!==32||decode(key.y).length!==32||decode(key.d).length!==32) return null;
    return {key:{kty:"EC",crv:"P-256",x:key.x,y:key.y,d:key.d},publicKey:b64(concat(Uint8Array.of(4),decode(key.x),decode(key.y)))};
  } catch {return null;}
}
async function hkdf(ikm,salt,info,length) {
  const key=await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},key,length*8));
}
export async function encryptPayload(subscription,payload) {
  const ua=decode(subscription.p256dh), auth=decode(subscription.auth);
  const receiver=await crypto.subtle.importKey("raw",ua,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const sender=new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:receiver},pair.privateKey,256));
  const ikm=await hkdf(shared,auth,concat(bytes("WebPush: info\0"),ua,sender),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(ikm,salt,bytes("Content-Encoding: aes128gcm\0"),16);
  const nonce=await hkdf(ikm,salt,bytes("Content-Encoding: nonce\0"),12);
  const key=await crypto.subtle.importKey("raw",cek,"AES-GCM",false,["encrypt"]);
  const plain=concat(bytes(payload),Uint8Array.of(2));
  if(plain.length>3993) throw Error("Payload too large");
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},key,plain));
  const recordSize=new Uint8Array(4); new DataView(recordSize.buffer).setUint32(0,4096);
  return concat(salt,recordSize,Uint8Array.of(sender.length),sender,encrypted);
}
export async function sendPush(config,subscription,notice) {
  if(!allowedEndpoint(subscription.endpoint)) throw Error("Invalid endpoint");
  const aud=new URL(subscription.endpoint).origin;
  const unsigned=b64(bytes(JSON.stringify({typ:"JWT",alg:"ES256"})))+"."+b64(bytes(JSON.stringify({
    aud,exp:Math.floor(Date.now()/1000)+3600,sub:"mailto:info@burningtreemma.com"
  })));
  const signingKey=await crypto.subtle.importKey("jwk",config.key,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const signature=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},signingKey,bytes(unsigned)));
  if(signature.length!==64) throw Error("Invalid signature format");
  const body=await encryptPayload(subscription,JSON.stringify(notice));
  const response=await fetch(subscription.endpoint,{method:"POST",redirect:"error",headers:{
    "Authorization":"vapid t="+unsigned+"."+b64(signature)+", k="+config.publicKey,
    "Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream","TTL":"3600","Urgency":"high"
  },body,signal:AbortSignal.timeout(8000)});
  response.body?.cancel().catch(()=>{});
  return response.ok?"accepted":[404,410].includes(response.status)?"expired":"failed";
}
