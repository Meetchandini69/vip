import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createApp,hashPassword } from './app.js';
for(const key of ['DATABASE_URL','SITE_URL','ADMIN_EMAIL','ADMIN_PASSWORD'])if(!process.env[key])throw new Error(`Set ${key}`);
if(process.env.ADMIN_PASSWORD.length<16)throw new Error('ADMIN_PASSWORD must contain at least 16 characters');
const site=new URL(process.env.SITE_URL).origin;
if(process.env.NODE_ENV==='production'&&!site.startsWith('https://'))throw new Error('Production SITE_URL must use HTTPS');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
await pool.query('INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash',[process.env.ADMIN_EMAIL.toLowerCase().trim(),hashPassword(process.env.ADMIN_PASSWORD)]);
// Restarting also revokes old sessions when rotating the bootstrap credentials.
await pool.query('DELETE FROM sessions');
const server=createApp(pool,{site,production:process.env.NODE_ENV==='production'}).listen(process.env.PORT||3001,()=>console.log('Health blog API ready'));
process.on('SIGTERM',()=>server.close(()=>pool.end().then(()=>process.exit(0))));
