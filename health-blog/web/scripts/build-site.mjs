import { cp, lstat, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const web = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(web, '../..');
const output = path.resolve(web, 'dist');

// Clear only this project's generated output, including the obsolete root SPA.
if (path.relative(web, output) !== 'dist') throw new Error('Unexpected build output directory');
await rm(output, { recursive: true, force: true });
await build({ root: web, configFile: path.join(web, 'vite.config.js') });

// Copy only existing public site files. Never package the backend, .env, or Git files.
const staticDirectories = new Set(['assets', 'chennai', 'coimbatore', 'escorts']);
const publicFile = /\.(?:html|css|js|json|xml|txt|webmanifest|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|eot|otf|mp4|webm|pdf)$/i;
for (const entry of await readdir(repository, { withFileTypes: true })) {
 if (entry.name.startsWith('.')) continue;
 if ((entry.isDirectory() && staticDirectories.has(entry.name)) || (entry.isFile() && publicFile.test(entry.name))) {
  await cp(path.join(repository, entry.name), path.join(output, entry.name), {
   recursive: true,
   filter: async source => {
    const relative = path.relative(repository, source);
    if (relative.split(path.sep).some(part => part.startsWith('.'))) return false;
    const stat = await lstat(source);
    return stat.isDirectory() || (stat.isFile() && publicFile.test(source));
   }
  });
 }
}

// A top-level 404 disables Cloudflare's automatic root SPA fallback.
if (!(await readdir(output)).includes('404.html')) {
 await writeFile(path.join(output, '404.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title></head><body><h1>Page not found</h1><p>The requested page could not be found.</p></body></html>');
}
await writeFile(path.join(output, '_routes.json'), JSON.stringify({
 version: 1,
 include: ['/blog', '/blog/*', '/admin', '/admin/', '/api/*'],
 exclude: ['/blog/assets/*']
}, null, 2));

// Fail the build if the original homepage was accidentally replaced again.
const sourceHome = await readFile(path.join(repository, 'index.html'));
const deployedHome = await readFile(path.join(output, 'index.html'));
if (!sourceHome.equals(deployedHome)) throw new Error('Static homepage was not preserved');
console.log('Site packaged: original homepage at /; health blog at /blog.');
