import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const repository = new URL('../../../', import.meta.url);
const output = new URL('../dist/', import.meta.url);
const repoFile = name => new URL(name, repository);
const builtFile = name => new URL(name, output);

test('deployment preserves the homepage and original static pages byte for byte',async()=>{
 for(const file of ['index.html','escorts/coimbatore/index.html','escorts/chennai/index.html','assets/css/style.css','robots.txt','sitemap.xml']){
  assert.deepEqual(await readFile(builtFile(file)),await readFile(repoFile(file)),file);
 }
});
test('React and its bundles live only below blog and private files are excluded',async()=>{
 const shell=await readFile(builtFile('blog/index.html'),'utf8');
 assert.match(shell,/src="\/blog\/assets\//);
 assert.match(shell,/href="\/blog\/assets\//);
 for(const [,url] of shell.matchAll(/(?:src|href)="(\/blog\/assets\/[^\"]+)"/g))await access(builtFile(url.slice(1)));
 await access(builtFile('404.html'));
 for(const file of ['.env','api/server.js','health-blog/api/.env','node_modules'])await assert.rejects(access(builtFile(file)));
 const routes=JSON.parse(await readFile(builtFile('_routes.json'),'utf8'));
 assert.ok(!routes.include.includes('/')&&!routes.include.includes('/*'));
 assert.ok(routes.include.includes('/blog/*'));
 assert.ok(routes.exclude.includes('/blog/assets/*'));
});
