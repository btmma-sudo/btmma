import test from "node:test";
import assert from "node:assert/strict";
import {streamDirectUploadFailure} from "../src/lib/stream-upload-error.js";

test("Stream error handling points to permissions without revealing provider response details",()=>{
  const error=streamDirectUploadFailure(403,{
    errors:[{code:10000,message:"Bearer SECRET and account id 123 should never be shown"}],
    private:{token:"sensitive-token"}
  });
  assert.equal(error.httpStatus,403);
  assert.equal(error.apiCode,10000);
  assert.match(error.message,/Stream → Edit permission/);
  assert.match(error.message,/HTTP 403, Cloudflare error code 10000/);
  assert.doesNotMatch(JSON.stringify(error),/SECRET|sensitive-token|account id 123|Bearer/);
});
test("Cloudflare code 9106 overrides generic HTTP 400 request-validation advice",()=>{
  const status=streamDirectUploadFailure(400,{errors:[{code:9106,message:"Authorization header included secret token"}]});
  assert.equal(status.apiCode,9106);
  assert.match(status.message,/could not authenticate|authentication failed/i);
  assert.match(status.message,/STUDENT_PORTAL_STREAM_API_TOKEN/);
  assert.match(status.message,/HTTP 400, Cloudflare error code 9106/);
  assert.doesNotMatch(status.message,/secret token|storage availability/);
});
test("Cloudflare code 10000 also gets credential advice even with unusual status",()=>{
  const status=streamDirectUploadFailure(400,{errors:[{code:10000,message:"token leak"}]});
  assert.match(status.message,/credential/);
  assert.doesNotMatch(status.message,/token leak/);
});
test("authentication, storage reservation, malformed request and rate limiting failures are actionable",()=>{
  for(const [status,expected] of [
    [400,/rejected the video upload request/],
    [401,/rejected authorization/],
    [402,/storage reservation/],
    [403,/denied Stream access/],
    [409,/storage reservation/],
    [422,/rejected the video upload request/],
    [429,/limiting Stream API requests/],
    [503,/temporarily unavailable/]
  ]){
    const result=streamDirectUploadFailure(status,null);
    assert.match(result.message,expected);
    assert.match(result.message,new RegExp("HTTP "+status));
    assert.equal(result.apiCode,null);
  }
});
test("ignore malicious Cloudflare error fields and invalid or oversized codes",()=>{
  for(const payload of [
    {errors:[{code:"<script>alert('x')</script>",message:"never echo"}]},
    {errors:[{code:1234567,message:"never echo"}]},
    {errors:[{code:"100x",message:"never echo"}]},
    {errors:[{code:"-2",message:"never echo"}]},
    {errors:[{code:0,message:"never echo"}]},
    {errors:[{code:null,message:"never echo"}]}
  ]){
    const status=streamDirectUploadFailure(200,payload);
    assert.equal(status.apiCode,null);
    assert.doesNotMatch(status.message,/script|never echo|<|>/);
  }
});
test("non-2xx success bodies still fail until API status and success agree",()=>{
  const data={success:false,errors:[{code:10001,message:"hidden"}]};
  const result=streamDirectUploadFailure(200,data);
  assert.equal(result.httpStatus,200);
  assert.equal(result.apiCode,10001);
  assert.match(result.message,/HTTP 200, Cloudflare error code 10001/);
});
