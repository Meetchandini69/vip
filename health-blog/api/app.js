import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { postInput, escapeHtml as e, paragraphs, metadata } from './content.js';
export const hashToken=t=>createHash('sha256').update(t).digest('hex');
export function hashPassword(p){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(p,salt,64).toString('hex')}`;}
function passwordMatches(p,h){const [salt,key]=h.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(p,salt,64));}
export function createApp(db,{site,production=false}){
 const app=express(); app.disable('x-powered-by'); app.use(helmet()); app.use(express.json({limit:'150kb'}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api/admin',(req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==site)return res.status(403).json({error:'Invalid request origin'});next();});
 const cookie=(token,age)=>`health_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}${production?'; Secure':''}`;
 const auth=async(req,res,next)=>{const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('health_session='))?.slice(15);
  if(!token)return res.status(401).json({error:'Please sign in'});
  const {rows}=await db.query('SELECT admin_id FROM sessions WHERE token_hash=$1 AND expires_at>NOW()',[hashToken(token)]);
  if(!rows.length)return res.status(401).json({error:'Please sign in'});req.token=token;next();};
 app.get('/api/health',async(_req,res)=>{await db.query('SELECT 1');res.json({ok:true});});
 app.post('/api/admin/login',rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
  const {email,password}=req.body||{};if(typeof email!=='string'||typeof password!=='string'||password.length>500)return res.status(400).json({error:'Invalid credentials'});
  const {rows}=await db.query('SELECT * FROM admins WHERE email=$1',[email.toLowerCase().trim()]);
  const fallback='00000000000000000000000000000000:'+ '00'.repeat(64);
  const valid=passwordMatches(password,rows[0]?.password_hash||fallback);
  if(!rows.length||!valid)return res.status(401).json({error:'Invalid credentials'});
  await db.query('DELETE FROM sessions WHERE expires_at<NOW()');
  const token=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES($1,$2,$3)",[hashToken(token),rows[0].id,new Date(Date.now()+8*3600000)]);
  res.set('Set-Cookie',cookie(token,28800)).json({ok:true});
 });
 app.use('/api/admin',auth);
 app.get('/api/admin/me',(_req,res)=>res.json({ok:true}));
 app.post('/api/admin/logout',async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(req.token)]);res.set('Set-Cookie',cookie('',0)).json({ok:true});});
 app.get('/api/admin/posts',async(_req,res)=>res.json((await db.query('SELECT * FROM posts ORDER BY updated_at DESC')).rows));
 async function save(req,res){const parsed=postInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:parsed.error.issues.map(i=>i.message).join(' ')});
  const {version,...p}=parsed.data; const fields=Object.keys(p),values=Object.values(p);
  let result;
  if(req.params.id){if(!Number.isInteger(version))return res.status(400).json({error:'Missing post version'});
   result=await db.query(`UPDATE posts SET ${fields.map((f,i)=>`${f}=$${i+1}`).join(',')},updated_at=NOW(),version=version+1,published_at=CASE WHEN $${fields.indexOf('status')+1}='published' THEN COALESCE(published_at,NOW()) ELSE published_at END WHERE id=$${values.length+1} AND version=$${values.length+2} RETURNING *`,[...values,req.params.id,version]);
   if(!result.rows.length)return res.status(409).json({error:'This post changed in another tab. Reload it before saving.'});
  }else{result=await db.query(`INSERT INTO posts(${fields.join(',')},published_at) VALUES(${values.map((_,i)=>`$${i+1}`).join(',')},$${values.length+1}) RETURNING *`,[...values,p.status==='published'?new Date():null]);}
  res.json(result.rows[0]);
 }
 app.post('/api/admin/posts',save);app.put('/api/admin/posts/:id',save);
 app.get('/api/posts',async(_req,res)=>res.json((await db.query("SELECT id,title,slug,excerpt,image,image_alt,author,category,published_at FROM posts WHERE status='published' ORDER BY published_at DESC")).rows));
 app.get('/api/posts/:slug',async(req,res)=>{const {rows}=await db.query("SELECT * FROM posts WHERE slug=$1 AND status='published'",[req.params.slug]);if(!rows.length)return res.status(404).json({error:'Article not found'});res.json(rows[0]);});
 app.get('/api/sitemap',async(_req,res)=>{const {rows}=await db.query("SELECT slug,updated_at FROM posts WHERE status='published'");res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/blog'].map(p=>`<url><loc>${e(site+p)}</loc></url>`).join('')}${rows.map(p=>`<url><loc>${e(site+'/blog/'+p.slug)}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod></url>`).join('')}</urlset>`);});
 app.get('/api/render',async(req,res)=>{
  const path=String(req.query.path||'/blog').replace(/\/$/,'')||'/';let title='Everyday Health | Health & wellbeing',description='Explore articles about everyday health and wellbeing.',schema=null,html='',status=200;
  if(path==='/blog'){const {rows}=await db.query("SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC");title='Health articles | Everyday Health';html=`<h1>Health articles</h1>${rows.map(p=>`<article><h2><a href="/blog/${e(p.slug)}">${e(p.title)}</a></h2><p>${e(p.excerpt)}</p></article>`).join('')||'<p>New articles are coming soon.</p>'}`;
  }else{const slug=/^\/blog\/([a-z0-9-]+)$/.exec(path)?.[1];const {rows}=await db.query("SELECT * FROM posts WHERE slug=$1 AND status='published'",[slug||'']);if(!rows.length){status=404;title='Article not found';html='<h1>Article not found</h1><a href="/blog">Browse articles</a>';}else{const p=rows[0],m=metadata(p,site);({title,description,schema}=m);html=`<article><p>${e(p.category)}</p><h1>${e(p.title)}</h1><p>By ${e(p.author)}</p>${p.image?`<img src="${e(p.image)}" alt="${e(p.image_alt)}">`:''}${paragraphs(p.content)}</article>`;}}
  const url=site+path;res.json({status,html,head:`<title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(url)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(url)}"><meta property="og:type" content="${schema?'article':'website'}">${status===404?'<meta name="robots" content="noindex">':''}${schema?`<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>`:''}`});
 });
 app.use((err,_req,res,_next)=>{if(err.code==='23505')return res.status(409).json({error:'That URL slug is already used.'});if(err.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON'});console.error(err.message);res.status(500).json({error:'Unable to complete request. Please try again.'});});
 return app;
}
