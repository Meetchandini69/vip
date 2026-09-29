// Same-origin proxy keeps admin cookies first-party across Cloudflare and Railway.
export async function onRequest({request,env,next}) {
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
 if(path==='/admin')return Response.redirect(new URL('/blog/admin',url),302);
 // The original homepage, city pages, assets, robots and sitemap stay static.
 if(path.startsWith('/blog/assets/')||(!path.startsWith('/api/')&&path!=='/blog'&&!path.startsWith('/blog/')))return next();
 if(!env.API_ORIGIN)return new Response('Blog API is not configured.',{status:503});
 const api=new URL(env.API_ORIGIN);
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
 try {
  if(path.startsWith('/api/')){
   const target=new URL(url.pathname+url.search,api);
   const forwarded=new Headers();for(const name of ['content-type','cookie','origin'])if(request.headers.has(name))forwarded.set(name,request.headers.get(name));
   const response=await fetch(target,{method:request.method,headers:forwarded,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
   const out=new Headers(response.headers);out.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers:out});
  }
  if(path==='/blog/sitemap.xml'){const r=await fetch(new URL('/api/sitemap',api));return new Response(r.body,{status:r.status,headers:{...headers,'Content-Type':'application/xml'}});}
  const shell=await env.ASSETS.fetch(new URL('/blog/',url));
  if(!shell.ok)throw new Error('Blog shell unavailable');
  let html=await shell.text();
  let status=200;
  if(path==='/blog/admin')html=html.replace('<!--seo-->','<title>Admin | Everyday Health</title><meta name="robots" content="noindex,nofollow">');
  else{const r=await fetch(new URL('/api/render?path='+encodeURIComponent(path),api));if(!r.ok)throw new Error('API unavailable');const data=await r.json();status=data.status;html=html.replace('<!--seo-->',()=>data.head).replace('<!--content-->',()=>data.html);}
  return new Response(html,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY'}});
 }catch{return new Response('The blog is temporarily unavailable. Please try again shortly.',{status:503,headers});}
}
