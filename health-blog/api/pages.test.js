import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../web/functions/[[path]].js';
test('Pages renders metadata and returns actual article 404 statuses',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({status:404,head:'<title>Article not found</title>',html:'<h1>Not found</h1>'});
  const env={API_ORIGIN:'https://api.example.com',ASSETS:{fetch:async()=>new Response('<head><!--seo--></head><div id="root"><!--content--></div>')}};
  const result=await onRequest({request:new Request('https://health.example.com/blog/missing'),env});
  assert.equal(result.status,404);assert.equal(result.headers.get('cache-control'),'no-store');assert.match(await result.text(),/<title>Article not found<\/title>/);
  const admin=await onRequest({request:new Request('https://health.example.com/admin'),env});assert.match(await admin.text(),/noindex,nofollow/);
  globalThis.fetch=async()=>{throw new Error('Disconnected');};
  assert.equal((await onRequest({request:new Request('https://health.example.com/blog'),env})).status,503);
 }finally{globalThis.fetch=original;}
});
test('Pages forwards admin cookies, origin and response cookies',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url.origin,'https://api.example.com');assert.equal(options.headers.get('origin'),'https://health.example.com');assert.equal(options.headers.get('cookie'),'health_session=test');assert.equal(options.headers.get('authorization'),null);return new Response('{"ok":true}',{headers:{'Set-Cookie':'health_session=new; HttpOnly; Secure; Path=/api'}});};
  const result=await onRequest({request:new Request('https://health.example.com/api/admin/logout',{method:'POST',headers:{origin:'https://health.example.com',cookie:'health_session=test'}}),env:{API_ORIGIN:'https://api.example.com'}});
  assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.equal(result.status,200);
 }finally{globalThis.fetch=original;}
});
