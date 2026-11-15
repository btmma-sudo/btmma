import test from "node:test";
import assert from "node:assert/strict";
import {allowedEndpoint,validatedSubscription,encryptPayload,b64,pushConfig} from "../src/lib/school-web-push.js";
import {validatedNotice} from "../src/lib/school-notifications.js";
test("endpoint restrictions block arbitrary and insecure destinations",()=>{
 assert.equal(allowedEndpoint("https://fcm.googleapis.com/fcm/send/example"),true);
 assert.equal(allowedEndpoint("https://web.push.apple.com/token"),true);
 for(const u of ["https://web.push.apple.com.evil.com/token","http://fcm.googleapis.com/token","https://127.0.0.1/private","https://fcm.googleapis.com:444/token","https://user@fcm.googleapis.com/token"])assert.equal(allowedEndpoint(u),false);
});
test("feature is disabled without explicit opt-in and valid secret",()=>{
 assert.equal(pushConfig({}),null);assert.equal(pushConfig({SCHOOL_NOTIFICATIONS_ENABLED:"true",SCHOOL_PUSH_VAPID_PRIVATE_JWK:"invalid"}),null);
});
test("announcement validates audience, length and id",()=>{
 const example={title:"Closure",body:"No class today.",audience:"test",id:"e70f5a19-5043-4a24-9f18-879cd676e252"};
 assert.deepEqual(validatedNotice(example),example);
 assert.equal(validatedNotice({...example,audience:"unknown"}),null);
 assert.equal(validatedNotice({...example,body:"a".repeat(301)}),null);
});
test("RFC 8291 payload can be decrypted by the destination's private key",async()=>{
 const u=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const pub=new Uint8Array(await crypto.subtle.exportKey("raw",u.publicKey)),auth=crypto.getRandomValues(new Uint8Array(16));
 const sub=validatedSubscription({endpoint:"https://fcm.googleapis.com/send/example",keys:{p256dh:b64(pub),auth:b64(auth)}});
 assert.ok(sub);const message="School closed today.";
 const payload=await encryptPayload(sub,message),salt=payload.slice(0,16),size=payload[20],sender=payload.slice(21,21+size);
 const peer=await crypto.subtle.importKey("raw",sender,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const shared=await crypto.subtle.deriveBits({name:"ECDH",public:peer},u.privateKey,256);
 const enc=new TextEncoder();const concat=(...p)=>Uint8Array.from(p.flatMap(x=>Array.from(x)));
 const hkdf=async(ikm,salt,info,bits)=>crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]),bits);
 const ikm=await hkdf(shared,auth,concat(enc.encode("WebPush: info\0"),pub,sender),256);
 const cek=await hkdf(ikm,salt,enc.encode("Content-Encoding: aes128gcm\0"),128);
 const iv=await hkdf(ikm,salt,enc.encode("Content-Encoding: nonce\0"),96);
 const clear=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv},await crypto.subtle.importKey("raw",cek,"AES-GCM",false,["decrypt"]),payload.slice(21+size)));
 assert.equal(clear.at(-1),2);assert.equal(new TextDecoder().decode(clear.slice(0,-1)),message);
});
